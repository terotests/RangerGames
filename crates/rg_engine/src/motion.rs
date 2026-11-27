// SPDX-License-Identifier: AGPL-3.0-or-later
//! The engine's side of the animations (rg_core::anim): the length of a
//! sound file in the virtual directory, so a sequence knows how long a clip
//! or a piece of music takes as soon as the file is there (WAV, MP3, Ogg
//! Vorbis and Opus), and the frame's clock for the script.

use rg_core::json::{self, member, Json};

fn u16le(b: &[u8], i: usize) -> u32 {
    b[i] as u32 | (b[i + 1] as u32) << 8
}

fn u32le(b: &[u8], i: usize) -> u32 {
    u16le(b, i) | u16le(b, i + 2) << 16
}

fn u32be(b: &[u8], i: usize) -> u32 {
    (b[i] as u32) << 24 | (b[i + 1] as u32) << 16 | (b[i + 2] as u32) << 8 | b[i + 3] as u32
}

/// A sound file's length in ms, from its bytes; None when not known.
pub fn audio_ms(b: &[u8]) -> Option<f64> {
    if b.len() < 16 {
        return None;
    }
    if &b[0..4] == b"RIFF" && &b[8..12] == b"WAVE" {
        return wav_ms(b);
    }
    if &b[0..4] == b"OggS" {
        return ogg_ms(b);
    }
    mp3_ms(b)
}

fn wav_ms(b: &[u8]) -> Option<f64> {
    let mut i = 12;
    let mut rate = 0u32;
    while i + 8 <= b.len() {
        let id = &b[i..i + 4];
        let size = u32le(b, i + 4) as usize;
        if id == b"fmt " && i + 16 <= b.len() {
            rate = u32le(b, i + 16);
        }
        if id == b"data" {
            if rate == 0 {
                return None;
            }
            // a streamed WAV may give 0 or too much: what is there counts
            let have = b.len().saturating_sub(i + 8);
            let n = if size == 0 || size > have { have } else { size };
            return Some(n as f64 * 1000.0 / rate as f64);
        }
        i += 8 + size + (size & 1);
    }
    None
}

fn ogg_ms(b: &[u8]) -> Option<f64> {
    // the first page's packet says which codec and its rate
    let pos = find(b, b"\x01vorbis", 0);
    let (rate, skip) = match pos {
        Some(p) if p + 16 <= b.len() => (u32le(b, p + 12) as f64, 0.0),
        _ => match find(b, b"OpusHead", 0) {
            Some(p) if p + 12 <= b.len() => (48000.0, u16le(b, p + 10) as f64),
            _ => return None,
        },
    };
    if rate <= 0.0 {
        return None;
    }
    // the last page's granule position is the samples so far
    let mut at = b.len().saturating_sub(4);
    loop {
        if &b[at..at + 4] == b"OggS" && at + 14 <= b.len() {
            let g = u32le(b, at + 6) as f64 + u32le(b, at + 10) as f64 * 4294967296.0;
            return Some(((g - skip).max(0.0)) * 1000.0 / rate);
        }
        if at == 0 {
            return None;
        }
        at -= 1;
    }
}

fn find(b: &[u8], what: &[u8], from: usize) -> Option<usize> {
    if what.len() > b.len() {
        return None;
    }
    (from..=b.len() - what.len()).find(|&i| &b[i..i + what.len()] == what)
}

const MP3_RATES: [[u32; 3]; 3] = [[44100, 48000, 32000], [22050, 24000, 16000], [11025, 12000, 8000]];
// bit rates (kbit/s) for MPEG-1 layer III and MPEG-2/2.5 layer III
const MP3_KBPS1: [u32; 16] = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MP3_KBPS2: [u32; 16] = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

fn mp3_ms(b: &[u8]) -> Option<f64> {
    let mut i = 0;
    // an ID3v2 tag first: its size is in 7-bit bytes
    if &b[0..3] == b"ID3" && b.len() > 10 {
        let s = (b[6] as usize & 0x7f) << 21 | (b[7] as usize & 0x7f) << 14 | (b[8] as usize & 0x7f) << 7 | (b[9] as usize & 0x7f);
        i = 10 + s;
    }
    // the first frame
    while i + 4 <= b.len() && !(b[i] == 0xff && b[i + 1] & 0xe0 == 0xe0) {
        i += 1;
        if i > 64 * 1024 {
            return None;
        }
    }
    if i + 4 > b.len() {
        return None;
    }
    let h = u32be(b, i);
    let ver = (h >> 19) & 3; // 3 MPEG-1, 2 MPEG-2, 0 MPEG-2.5
    let layer = (h >> 17) & 3; // 1 layer III
    let br = ((h >> 12) & 15) as usize;
    let sr = ((h >> 10) & 3) as usize;
    if ver == 1 || layer != 1 || sr == 3 || br == 0 || br == 15 {
        return None;
    }
    let vi = if ver == 3 { 0 } else if ver == 2 { 1 } else { 2 };
    let rate = MP3_RATES[vi][sr] as f64;
    let kbps = if ver == 3 { MP3_KBPS1[br] } else { MP3_KBPS2[br] } as f64;
    let mono = (h >> 6) & 3 == 3;
    let per_frame = if ver == 3 { 1152.0 } else { 576.0 };
    // a Xing / Info / VBRI header gives the frame count
    let side = if ver == 3 { if mono { 17 } else { 32 } } else if mono { 9 } else { 17 };
    let x = i + 4 + side;
    if x + 12 <= b.len() && (&b[x..x + 4] == b"Xing" || &b[x..x + 4] == b"Info") && u32be(b, x + 4) & 1 == 1 {
        let frames = u32be(b, x + 8) as f64;
        return Some(frames * per_frame * 1000.0 / rate);
    }
    let v = i + 4 + 32;
    if v + 18 <= b.len() && &b[v..v + 4] == b"VBRI" {
        let frames = u32be(b, v + 14) as f64;
        return Some(frames * per_frame * 1000.0 / rate);
    }
    // constant bit rate: the bytes after the first frame's start
    let mut end = b.len();
    if end >= 128 && &b[end - 128..end - 125] == b"TAG" {
        end -= 128;
    }
    Some((end - i) as f64 * 8.0 / kbps)
}

/// The frame clock for the script: { now, dt, frames, period, lost } (ms).
pub fn clock_json(c: &rg_core::clock::FrameClock) -> Json {
    json::obj(vec![
        member("now", Json::Num(c.now)),
        member("dt", Json::Num(c.dt)),
        member("frames", Json::Num(c.frames as f64)),
        member("period", Json::Num(c.period)),
        member("lost", Json::Num(c.lost)),
        member("count", Json::Num(c.count as f64)),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wav(rate: u32, bytes_per_sec: u32, data: usize) -> Vec<u8> {
        let mut b = Vec::new();
        b.extend_from_slice(b"RIFF");
        b.extend_from_slice(&((36 + data) as u32).to_le_bytes());
        b.extend_from_slice(b"WAVEfmt ");
        b.extend_from_slice(&16u32.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&rate.to_le_bytes());
        b.extend_from_slice(&bytes_per_sec.to_le_bytes());
        b.extend_from_slice(&2u16.to_le_bytes());
        b.extend_from_slice(&16u16.to_le_bytes());
        b.extend_from_slice(b"data");
        b.extend_from_slice(&(data as u32).to_le_bytes());
        b.extend(std::iter::repeat(0u8).take(data));
        b
    }

    #[test]
    fn wav_length() {
        assert_eq!(audio_ms(&wav(22050, 44100, 44100)), Some(1000.0));
    }

    #[test]
    fn mp3_cbr_length() {
        // MPEG-1 layer III, 128 kbit/s, 44.1 kHz, stereo: 1 s = 16000 bytes
        let mut b = vec![0xff, 0xfb, 0x90, 0x00];
        b.extend(std::iter::repeat(0u8).take(16000 - 4));
        let ms = audio_ms(&b).unwrap();
        assert!((ms - 1000.0).abs() < 1.0, "{}", ms);
    }
}
