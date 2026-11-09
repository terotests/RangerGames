// SPDX-License-Identifier: AGPL-3.0-or-later
//! rg_voice: the games' voice clips.
//!
//!   rg_voice build voice/fi.json games/_voice/fi   every clip of the list → <id>.wav
//!                                                  (only the changed ones are rendered again)
//!   rg_voice build voice/en games/_voice/en        a language folder: every voice/en/*.json
//!                                                  merged into one output folder (English
//!                                                  also reads the word lists voice/en/*.dict)
//!   rg_voice say "Hyvä!" out.wav [body] [f0] [rate] ['{"lang":"en",…}']
//!   rg_voice ipa "Where is the key?" [lang]          what the voice says, in IPA
//!   rg_voice en-dict cmudict.dict voice/en           adds the words of voice/en/*.json that
//!                                                  voice/en/*.dict lacks to voice/en/words.dict

use rg_voice::{FS_CLIP, Lang, Voice, say_in, wav};
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

/// The clip lists of `list` (one .json file, or every .json file of a folder):
/// (file, its JSON), and the language's English word lists (.dict files).
fn read_lists(list: &str) -> Result<(Vec<(String, Value)>, Vec<String>), String> {
    let p = Path::new(list);
    let mut files: Vec<String> = Vec::new();
    let mut dicts: Vec<String> = Vec::new();
    if p.is_dir() {
        let mut names: Vec<_> = std::fs::read_dir(p).map_err(|e| format!("{list}: {e}"))?.flatten().map(|e| e.path()).collect();
        names.sort();
        for f in names {
            match f.extension().and_then(|x| x.to_str()) {
                Some("json") => files.push(f.to_string_lossy().into_owned()),
                Some("dict") => dicts.push(std::fs::read_to_string(&f).map_err(|e| format!("{}: {e}", f.display()))?),
                _ => {}
            }
        }
    } else {
        files.push(list.to_string());
    }
    let mut out = Vec::new();
    for f in files {
        let text = std::fs::read_to_string(&f).map_err(|e| format!("{f}: {e}"))?;
        let j: Value = serde_json::from_str(&text).map_err(|e| format!("{f}: {e}"))?;
        out.push((f, j));
    }
    Ok((out, dicts))
}

/// The language of a list: its "lang", else the folder's name (voice/en), else Finnish.
fn lang_code(list: &str, lists: &[(String, Value)]) -> String {
    if let Some(l) = lists.iter().find_map(|(_, j)| j.get("lang").and_then(Value::as_str)) {
        return l.to_string();
    }
    let p = Path::new(list);
    let name = if p.is_dir() { p.file_name() } else { p.file_stem() };
    match name.and_then(|n| n.to_str()) {
        Some(n @ ("en" | "es" | "fi")) => n.to_string(),
        _ => "fi".into(),
    }
}

fn build(list: &str, out: &str) -> Result<(), String> {
    let (lists, dicts) = read_lists(list)?;
    if lists.is_empty() {
        return Err(format!("{list}: no clip lists"));
    }
    let code = lang_code(list, &lists);
    let lang = Lang::new(&code, &dicts);
    // every list's clips with that list's voice; an id in two lists is an error
    let mut clips: Vec<(String, Value, Value)> = Vec::new();
    for (f, j) in &lists {
        let base = j.get("voice").cloned().unwrap_or_else(|| default_voice(&code));
        let Some(cs) = j.get("clips").and_then(Value::as_object) else {
            return Err(format!("{f}: no \"clips\""));
        };
        for (id, c) in cs {
            if clips.iter().any(|(i, _, _)| i == id) {
                return Err(format!("{f}: clip \"{id}\" is in another list of {list} too"));
            }
            clips.push((id.clone(), c.clone(), base.clone()));
        }
    }
    std::fs::create_dir_all(out).map_err(|e| format!("{out}: {e}"))?;
    // what each clip was rendered from last time: render only what changed
    let stamp_path = Path::new(out).join("stamp.json");
    let old: Map<String, Value> = std::fs::read_to_string(&stamp_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let mut jobs: Vec<(String, String, Option<String>, Voice, String)> = Vec::new();
    let mut stamp = Map::new();
    let mut index = Map::new();
    let mut unknown: Vec<String> = Vec::new();
    for (id, c, base) in &clips {
        // a clip is "text", or { "text": …, "ipa": …, and voice settings of its own }
        let (say_text, ipa, voice) = match c {
            Value::String(s) => (s.clone(), None, voice_of(base)),
            Value::Object(o) => {
                let mut merged = base.as_object().cloned().unwrap_or_default();
                for (k, v) in o {
                    merged.insert(k.clone(), v.clone());
                }
                (
                    o.get("text").and_then(Value::as_str).unwrap_or("").to_string(),
                    o.get("ipa").and_then(Value::as_str).map(str::to_string),
                    voice_of(&Value::Object(merged)),
                )
            }
            _ => continue,
        };
        if ipa.is_none() {
            for w in lang.unknown_words(&say_text) {
                if !unknown.contains(&w) {
                    unknown.push(w);
                }
            }
        }
        // the English word lists change what is said: the stamp follows the words' entries
        // (Finnish keeps the key it had before the other languages, so nothing renders again)
        let key = match (code.as_str(), &ipa) {
            ("fi", None) => format!("{say_text}|{voice:?}|pcm16-48k-fi2"),
            ("en", None) => format!("{say_text}|{voice:?}|pcm16-48k-en1|{}", lang.ipa(&say_text)),
            _ => format!("{say_text}|{ipa:?}|{voice:?}|pcm16-48k-{code}1"),
        };
        let file = Path::new(out).join(format!("{id}.wav"));
        index.insert(id.clone(), Value::String(say_text.clone()));
        stamp.insert(id.clone(), Value::String(key.clone()));
        if old.get(id).and_then(Value::as_str) == Some(key.as_str()) && file.exists() {
            continue;
        }
        jobs.push((id.clone(), say_text, ipa, voice, file.to_string_lossy().into_owned()));
    }
    if !unknown.is_empty() {
        println!("note: {} English words not in voice/en/*.dict (said by letter-to-sound rules; add them with `rg_voice en-dict`): {}", unknown.len(), unknown.join(" "));
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
                    let Some((id, t, ipa, v, file)) = job else { break };
                    let pcm = say_in(&lang, &t, ipa.as_deref(), &v);
                    if let Err(e) = std::fs::write(&file, wav(&pcm, FS_CLIP)) {
                        failed.lock().unwrap().push(format!("{file}: {e}"));
                    } else {
                        println!("  {id:<16} {:.2} s  {}", pcm.len() as f64 / FS_CLIP as f64, ipa.clone().unwrap_or_else(|| lang.ipa(&t)));
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
                if !clips.iter().any(|(i, _, _)| i == id) {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
    }
    let w = |p: &Path, v: Map<String, Value>| std::fs::write(p, serde_json::to_string_pretty(&Value::Object(v)).unwrap() + "\n");
    w(&stamp_path, stamp).map_err(|e| e.to_string())?;
    let ids: Vec<Value> = index.keys().map(|k| Value::String(k.clone())).collect();
    w(&Path::new(out).join("clips.json"), index).map_err(|e| e.to_string())?;
    // the ids alone, for the engine: rg.say falls back to Finnish for an id a language lacks
    std::fs::write(Path::new(out).join("index.json"), serde_json::to_string(&Value::Array(ids)).unwrap() + "\n").map_err(|e| e.to_string())?;
    println!("{out}: {} clips, {n} rendered", clips.len());
    Ok(())
}

/// A language's default voice when its list gives none.
fn default_voice(code: &str) -> Value {
    let v = match code {
        // CHIMERA's own English: its defaults, a little slower for children
        "en" => r#"{ "body": "female", "f0": 220, "rate": 0.85, "breathiness": 0.22, "drift": 8 }"#,
        "es" => r#"{ "body": "female", "f0": 225, "rate": 0.9, "accent": 0.22, "breathiness": 0.25, "drift": 10, "tension": 0.45 }"#,
        _ => "{}",
    };
    serde_json::from_str(v).unwrap()
}

/// The .dict word lists of a folder (none when it is not there).
fn dicts_of(dir: &str) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        let mut names: Vec<_> = rd.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "dict")).collect();
        names.sort();
        for p in names {
            if let Ok(t) = std::fs::read_to_string(p) {
                out.push(t);
            }
        }
    }
    out
}

/// Adds to `dir`/words.dict the CMUdict entries of the words of `dir`/*.json
/// that no .dict of the folder has yet, and lists the words CMUdict lacks.
fn en_dict(cmudict: &str, dir: &str) -> Result<(), String> {
    let full = std::fs::read_to_string(cmudict).map_err(|e| format!("{cmudict}: {e}"))?;
    let (lists, dicts) = read_lists(dir)?;
    let lang = Lang::new("en", &dicts);
    let mut want: Vec<String> = Vec::new();
    for (_, j) in &lists {
        let Some(cs) = j.get("clips").and_then(Value::as_object) else { continue };
        for c in cs.values() {
            let t = match c {
                Value::String(s) => s.as_str(),
                Value::Object(o) if o.get("ipa").is_none() => o.get("text").and_then(Value::as_str).unwrap_or(""),
                _ => "",
            };
            for w in lang.unknown_words(t) {
                if !want.contains(&w) {
                    want.push(w);
                }
            }
        }
    }
    let mut found: Vec<String> = Vec::new();
    for line in full.lines() {
        let Some((w, ph)) = line.split_once(' ') else { continue };
        if want.iter().any(|x| x == w) {
            found.push(format!("{w} {}", ph.split('#').next().unwrap_or("").trim()));
        }
    }
    let path = Path::new(dir).join("words.dict");
    let mut text = std::fs::read_to_string(&path).unwrap_or_else(|_| {
        ";;; English words of the games' clips, from CMUdict (github.com/cmusphinx/cmudict, BSD licence, see voice/en/CMUDICT-LICENSE).\n;;; rg_voice en-dict cmudict.dict voice/en adds the missing ones; a word can also be written here by hand.\n".to_string()
    });
    for f in &found {
        text.push_str(f);
        text.push('\n');
    }
    std::fs::write(&path, text).map_err(|e| format!("{}: {e}", path.display()))?;
    let missing: Vec<&String> = want.iter().filter(|w| !found.iter().any(|f| f.split(' ').next() == Some(w.as_str()))).collect();
    println!("{}: {} words added", path.display(), found.len());
    if !missing.is_empty() {
        println!("not in CMUdict (write them by hand): {}", missing.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(" "));
    }
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
            let code = j.get("lang").and_then(Value::as_str).unwrap_or("fi").to_string();
            let lang = Lang::new(&code, &dicts_of(&format!("voice/{code}")));
            let mut base = default_voice(&code);
            for (k, v) in j.as_object().unwrap() {
                base.as_object_mut().unwrap().insert(k.clone(), v.clone());
            }
            let v = voice_of(&base);
            let t = arg(1, "Hyvä!");
            let ipa = j.get("ipa").and_then(Value::as_str).map(str::to_string);
            let pcm = say_in(&lang, &t, ipa.as_deref(), &v);
            let file = arg(2, "say.wav");
            println!("{}  {:.2} s → {file}", ipa.unwrap_or_else(|| lang.ipa(&t)), pcm.len() as f64 / FS_CLIP as f64);
            std::fs::write(&file, wav(&pcm, FS_CLIP)).map_err(|e| format!("{file}: {e}"))
        }
        Some("ipa") => {
            let code = arg(2, "fi");
            let lang = Lang::new(&code, &dicts_of(&format!("voice/{code}")));
            println!("{}", lang.ipa(&arg(1, "")));
            let unknown = lang.unknown_words(&arg(1, ""));
            if !unknown.is_empty() {
                println!("not in voice/{code}/*.dict: {}", unknown.join(" "));
            }
            Ok(())
        }
        Some("en-dict") => en_dict(&arg(1, "cmudict.dict"), &arg(2, "voice/en")),
        _ => Err("usage: rg_voice build <list.json|lang folder> <outdir> | say <text> <out.wav> [body] [f0] [rate] [json] | ipa <text> [lang] | en-dict <cmudict.dict> <voice/en>".into()),
    };
    if let Err(e) = r {
        eprintln!("rg_voice: {e}");
        std::process::exit(1);
    }
}
