// SPDX-License-Identifier: AGPL-3.0-or-later
//! rg_voice: the games' Finnish voice clips.
//!
//!   rg_voice build voice/fi.json games/_voice/fi   every clip of the list → <id>.wav
//!                                                  (only the changed ones are rendered again)
//!   rg_voice say "Hyvä!" out.wav [body] [f0] [rate]  one sentence (body female|male|child)
//!   rg_voice ipa "Valitse punainen."                 what the voice says, in IPA

use rg_voice::{FS_CLIP, Voice, ipa, say, wav, wav_mulaw};
use serde_json::{Map, Value};
use std::path::Path;

fn voice_of(v: &Value) -> Voice {
    let d = Voice::default();
    Voice {
        body: v.get("body").and_then(Value::as_str).unwrap_or(&d.body).to_string(),
        f0: v.get("f0").and_then(Value::as_f64).unwrap_or(d.f0),
        rate: v.get("rate").and_then(Value::as_f64).unwrap_or(d.rate),
        accent: v.get("accent").and_then(Value::as_f64),
        breathiness: v.get("breathiness").and_then(Value::as_f64),
        drift: v.get("drift").and_then(Value::as_f64),
        roughness: v.get("roughness").and_then(Value::as_f64),
        tension: v.get("tension").and_then(Value::as_f64),
        vibrato: v.get("vibrato").and_then(Value::as_f64),
    }
}

fn build(list: &str, out: &str) -> Result<(), String> {
    let text = std::fs::read_to_string(list).map_err(|e| format!("{list}: {e}"))?;
    let j: Value = serde_json::from_str(&text).map_err(|e| format!("{list}: {e}"))?;
    let base = j.get("voice").cloned().unwrap_or(Value::Null);
    let clips = j.get("clips").and_then(Value::as_object).ok_or("no \"clips\" in the list")?;
    std::fs::create_dir_all(out).map_err(|e| format!("{out}: {e}"))?;
    // what each clip was rendered from last time: render only what changed
    let stamp_path = Path::new(out).join("stamp.json");
    let old: Map<String, Value> = std::fs::read_to_string(&stamp_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let mut jobs: Vec<(String, String, Voice, String)> = Vec::new();
    let mut stamp = Map::new();
    let mut index = Map::new();
    for (id, c) in clips {
        // a clip is "text", or { "text": …, and voice settings of its own }
        let (say_text, voice) = match c {
            Value::String(s) => (s.clone(), voice_of(&base)),
            Value::Object(o) => {
                let mut merged = base.as_object().cloned().unwrap_or_default();
                for (k, v) in o {
                    merged.insert(k.clone(), v.clone());
                }
                (o.get("text").and_then(Value::as_str).unwrap_or("").to_string(), voice_of(&Value::Object(merged)))
            }
            _ => continue,
        };
        let key = format!("{say_text}|{voice:?}|mulaw");
        let file = Path::new(out).join(format!("{id}.wav"));
        index.insert(id.clone(), Value::String(say_text.clone()));
        stamp.insert(id.clone(), Value::String(key.clone()));
        if old.get(id).and_then(Value::as_str) == Some(key.as_str()) && file.exists() {
            continue;
        }
        jobs.push((id.clone(), say_text, voice, file.to_string_lossy().into_owned()));
    }
    let n = jobs.len();
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).min(16);
    let jobs = std::sync::Mutex::new(jobs);
    let failed = std::sync::Mutex::new(Vec::<String>::new());
    std::thread::scope(|s| {
        for _ in 0..threads {
            s.spawn(|| {
                loop {
                    let job = jobs.lock().unwrap().pop();
                    let Some((id, t, v, file)) = job else { break };
                    let pcm = say(&t, &v);
                    if let Err(e) = std::fs::write(&file, wav_mulaw(&pcm, FS_CLIP)) {
                        failed.lock().unwrap().push(format!("{file}: {e}"));
                    } else {
                        println!("  {id:<16} {:.2} s  {}", pcm.len() as f64 / FS_CLIP as f64, ipa(&t));
                    }
                }
            });
        }
    });
    let failed = failed.into_inner().unwrap();
    if !failed.is_empty() {
        return Err(failed.join("\n"));
    }
    // clips no longer in the list
    if let Ok(dir) = std::fs::read_dir(out) {
        for e in dir.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if let Some(id) = name.strip_suffix(".wav") {
                if !clips.contains_key(id) {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
    }
    let w = |p: &Path, v: Map<String, Value>| std::fs::write(p, serde_json::to_string_pretty(&Value::Object(v)).unwrap() + "\n");
    w(&stamp_path, stamp).map_err(|e| e.to_string())?;
    w(&Path::new(out).join("clips.json"), index).map_err(|e| e.to_string())?;
    println!("{out}: {} clips, {n} rendered", clips.len());
    Ok(())
}

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let arg = |i: usize, d: &str| a.get(i).cloned().unwrap_or_else(|| d.to_string());
    let r = match a.first().map(String::as_str) {
        Some("build") => build(&arg(1, "voice/fi.json"), &arg(2, "games/_voice/fi")),
        Some("say") => {
            // say <text> <out.wav> [body] [f0] [rate] ['{"accent":0.25,"breathiness":0.3,…}']
            let mut j: Value = serde_json::from_str(&arg(6, "{}")).unwrap_or(Value::Null);
            if !j.is_object() {
                j = Value::Object(Map::new());
            }
            let o = j.as_object_mut().unwrap();
            if let Some(b) = a.get(3) { o.insert("body".into(), Value::String(b.clone())); }
            if let Some(f) = a.get(4).and_then(|x| x.parse::<f64>().ok()) { o.insert("f0".into(), f.into()); }
            if let Some(r) = a.get(5).and_then(|x| x.parse::<f64>().ok()) { o.insert("rate".into(), r.into()); }
            let v = voice_of(&j);
            let t = arg(1, "Hyvä!");
            let pcm = say(&t, &v);
            let file = arg(2, "say.wav");
            println!("{}  {:.2} s → {file}", ipa(&t), pcm.len() as f64 / FS_CLIP as f64);
            std::fs::write(&file, wav(&pcm, FS_CLIP)).map_err(|e| format!("{file}: {e}"))
        }
        Some("ipa") => {
            println!("{}", ipa(&arg(1, "")));
            Ok(())
        }
        _ => Err("usage: rg_voice build <list.json> <outdir> | say <text> <out.wav> [body] [f0] [rate] | ipa <text>".into()),
    };
    if let Err(e) = r {
        eprintln!("rg_voice: {e}");
        std::process::exit(1);
    }
}
