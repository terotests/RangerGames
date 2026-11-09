// SPDX-License-Identifier: AGPL-3.0-or-later
//! Piper (github.com/OHF-Voice/piper1-gpl), a neural text-to-speech engine,
//! as an outside build tool: `rg_voice build` runs its `piper` command for a
//! clip list whose voice says `"engine": "piper"`. Nothing of Piper goes into
//! the games; they only play the clips it rendered.
//!
//! `scripts/setup-piper.sh` installs it in `.deps/piper` (a Python venv and
//! the voice models). `RG_PIPER` (the `piper` command) and `RG_PIPER_MODELS`
//! (the folder of `<voice>.onnx` files) point elsewhere.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

/// The `piper` command, if it is installed.
pub fn command() -> Option<PathBuf> {
    let p = std::env::var("RG_PIPER").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from(".deps/piper/venv/bin/piper"));
    p.exists().then_some(p)
}

/// The model file of voice `name` (e.g. "fi_FI-harri-medium"), if it is there.
/// Looked for in `RG_PIPER_MODELS`, else `.deps/piper/models`, then `.deps/piper`.
pub fn model(name: &str) -> Option<PathBuf> {
    let dirs: Vec<PathBuf> = match std::env::var("RG_PIPER_MODELS") {
        Ok(d) => vec![PathBuf::from(d)],
        Err(_) => vec![PathBuf::from(".deps/piper/models"), PathBuf::from(".deps/piper")],
    };
    dirs.into_iter().map(|d| (d.join(format!("{name}.onnx")), d.join(format!("{name}.onnx.json")))).find(|(m, j)| m.exists() && j.exists()).map(|(m, _)| m)
}

/// `text` said by Piper voice `model`, `rate` times its normal speed:
/// mono samples (−1…1) and their rate.
pub fn say(cmd: &PathBuf, model: &PathBuf, text: &str, rate: f64, tmp: &PathBuf) -> Result<(Vec<f32>, u32), String> {
    let mut c = Command::new(cmd);
    c.arg("-m").arg(model).arg("-f").arg(tmp);
    if (rate - 1.0).abs() > 1e-6 {
        c.arg("--length-scale").arg(format!("{:.3}", 1.0 / rate.max(0.2)));
    }
    let mut child = c.stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped()).spawn().map_err(|e| format!("{}: {e}", cmd.display()))?;
    child.stdin.take().unwrap().write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("piper: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    let bytes = std::fs::read(tmp).map_err(|e| format!("{}: {e}", tmp.display()))?;
    let _ = std::fs::remove_file(tmp);
    read_wav(&bytes).ok_or_else(|| format!("piper: {} is not a 16-bit PCM WAV", tmp.display()))
}

/// A 16-bit PCM WAV's first channel and rate.
pub fn read_wav(b: &[u8]) -> Option<(Vec<f32>, u32)> {
    if b.len() < 12 || &b[0..4] != b"RIFF" || &b[8..12] != b"WAVE" {
        return None;
    }
    let u16_at = |i: usize| u16::from_le_bytes([b[i], b[i + 1]]);
    let u32_at = |i: usize| u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]);
    let (mut ch, mut rate, mut bits, mut at) = (1usize, 22050u32, 16u16, 12usize);
    while at + 8 <= b.len() {
        let size = u32_at(at + 4) as usize;
        let body = at + 8;
        match &b[at..at + 4] {
            b"fmt " if body + 16 <= b.len() => {
                if u16_at(body) != 1 {
                    return None;
                }
                ch = u16_at(body + 2).max(1) as usize;
                rate = u32_at(body + 4);
                bits = u16_at(body + 14);
            }
            b"data" => {
                if bits != 16 {
                    return None;
                }
                let end = (body + size).min(b.len());
                let frame = 2 * ch;
                let n = (end - body) / frame;
                let s = (0..n).map(|i| i16::from_le_bytes([b[body + i * frame], b[body + i * frame + 1]]) as f32 / 32768.0).collect();
                return Some((s, rate));
            }
            _ => {}
        }
        at = body + size + (size & 1);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_its_own_wav() {
        let pcm: Vec<f32> = (0..100).map(|i| (i as f32 / 100.0) - 0.5).collect();
        let (back, rate) = read_wav(&crate::wav(&pcm, 22050)).unwrap();
        assert_eq!(rate, 22050);
        assert_eq!(back.len(), 100);
        assert!((back[10] - pcm[10]).abs() < 1e-3);
    }
}
