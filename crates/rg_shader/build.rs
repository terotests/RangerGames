// SPDX-License-Identifier: AGPL-3.0-or-later
// Lists every file under shaders/ (repository root) as a built-in source, so
// a new .glsl/.vs/.fs file needs no code change here.
use std::fs;
use std::path::{Path, PathBuf};

fn walk(dir: &Path, root: &Path, out: &mut Vec<(String, PathBuf)>) {
    let mut entries: Vec<_> = fs::read_dir(dir).unwrap().filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let p = e.path();
        if p.is_dir() {
            walk(&p, root, out);
            continue;
        }
        let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("");
        if ext == "glsl" || ext == "vs" || ext == "fs" {
            let rel = p.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
            out.push((rel, p.canonicalize().unwrap()));
        }
    }
}

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../shaders");
    println!("cargo:rerun-if-changed={}", root.display());
    let mut files = Vec::new();
    walk(&root, &root, &mut files);
    let mut code = String::from("pub static BUILTIN: &[(&str, &str)] = &[\n");
    for (rel, abs) in &files {
        println!("cargo:rerun-if-changed={}", abs.display());
        code.push_str(&format!("    ({:?}, include_str!({:?})),\n", rel, abs.display().to_string()));
    }
    code.push_str("];\n");
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("builtin.rs");
    fs::write(out, code).unwrap();
}
