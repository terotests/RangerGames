// SPDX-License-Identifier: AGPL-3.0-or-later
//! The engine's GLSL in one place.
//!
//! Every shader source lives as a file under `shaders/` in the repository
//! (stage files `*.vs` / `*.fs`, library files `lib/*.glsl`); build.rs lists
//! them all as built-ins. A host (web/js/painter.js through rg_web, the
//! Android app through rg_android's JNI) asks for a stage by its path and
//! gets one finished GLSL ES 3.00 source, the same text on WebGL2 and on
//! GLES 3 (Android, Quest):
//!
//! - `#include "lib/noise.glsl"` lines are replaced by that file (each file
//!   once per program; includes may nest);
//! - the host's defines (`"RG_YS=-1.0;RG_X=1"`) go right after `#version`, so
//!   what really differs between hosts is a named constant, not a hand-made
//!   copy of the shader (the splats' y sign was such a copy before).
//!
//! Each line of the result remembers the file and line it came from, so a
//! driver's compile log can be told in the source's own lines
//! ([`Built::explain`]); a game's own GLSL (rg.shader, later) goes through
//! the same assembler with `lookup` reading the game's files.

include!(concat!(env!("OUT_DIR"), "/builtin.rs"));

/// The source of a built-in file (`"splat/show.fs"`, `"lib/heat.glsl"`).
pub fn builtin(path: &str) -> Option<&'static str> {
    BUILTIN.iter().find(|(p, _)| *p == path).map(|(_, s)| *s)
}

/// Every built-in file's path, in name order.
pub fn names() -> Vec<&'static str> {
    BUILTIN.iter().map(|(p, _)| *p).collect()
}

/// An assembled program stage.
pub struct Built {
    /// the GLSL ES 3.00 source to hand to the driver
    pub src: String,
    /// for line i of `src` (0-based): the file and its line (1-based) it came
    /// from; the `#version` and define lines come from `<defines>`
    pub origin: Vec<(String, u32)>,
}

impl Built {
    /// A driver's compile log ("ERROR: 0:12: ..." as ANGLE, Mali and Adreno
    /// write it) with each `0:N` told as `file:line` of the source.
    pub fn explain(&self, log: &str) -> String {
        let mut out = String::new();
        for line in log.lines() {
            out.push_str(&self.explain_line(line));
            out.push('\n');
        }
        out
    }

    fn explain_line(&self, line: &str) -> String {
        // find "0:<digits>" and swap it for the origin
        let b = line.as_bytes();
        let mut i = 0;
        while i + 2 < b.len() {
            if b[i] == b'0' && b[i + 1] == b':' && (i == 0 || !b[i - 1].is_ascii_digit()) {
                let mut j = i + 2;
                while j < b.len() && b[j].is_ascii_digit() {
                    j += 1;
                }
                if j > i + 2 {
                    let n: usize = line[i + 2..j].parse().unwrap_or(0);
                    if n >= 1 && n <= self.origin.len() {
                        let (f, l) = &self.origin[n - 1];
                        return format!("{}{}:{}{}", &line[..i], f, l, &line[j..]);
                    }
                }
            }
            i += 1;
        }
        line.to_string()
    }
}

/// Parses `"A=1;B=2.0"` (spaces allowed, `A` alone is `A 1`) into name/value pairs.
pub fn parse_defines(defs: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for part in defs.split(';') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        match part.find('=') {
            Some(k) => out.push((part[..k].trim().to_string(), part[k + 1..].trim().to_string())),
            None => out.push((part.to_string(), "1".to_string())),
        }
    }
    out
}

fn is_name(s: &str) -> bool {
    let b = s.as_bytes();
    !b.is_empty()
        && (b[0].is_ascii_alphabetic() || b[0] == b'_')
        && b.iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_')
}

/// Assembles the stage at `path`: a built-in, or else what `lookup` gives
/// (a game's own file). Built-ins win, so a game cannot replace the
/// engine's library files. `defines` as in [`parse_defines`].
pub fn assemble(path: &str, defines: &str, lookup: &dyn Fn(&str) -> Option<String>) -> Result<Built, String> {
    let main = read(path, lookup).ok_or_else(|| format!("shader {}: no such file", path))?;
    let mut lines = main.lines();
    let first = lines.next().unwrap_or("").trim();
    if first != "#version 300 es" {
        return Err(format!("{}:1: a stage must start with #version 300 es", path));
    }
    let mut b = Built { src: String::new(), origin: Vec::new() };
    push(&mut b, "#version 300 es", "<defines>", 0);
    for (k, v) in parse_defines(defines) {
        if !is_name(&k) {
            return Err(format!("shader {}: bad define name {:?}", path, k));
        }
        push(&mut b, &format!("#define {} {}", k, v), "<defines>", 0);
    }
    let mut seen: Vec<String> = Vec::new();
    expand(&mut b, path, &main, 2, lookup, &mut seen, 0)?;
    Ok(b)
}

fn read(path: &str, lookup: &dyn Fn(&str) -> Option<String>) -> Option<String> {
    match builtin(path) {
        Some(s) => Some(s.to_string()),
        None => lookup(path),
    }
}

fn push(b: &mut Built, line: &str, file: &str, n: u32) {
    b.src.push_str(line);
    b.src.push('\n');
    b.origin.push((file.to_string(), n));
}

/// the path in `#include "path"`, or None for any other line
fn include_of(line: &str) -> Option<&str> {
    let t = line.trim_start();
    let rest = t.strip_prefix("#include")?;
    let rest = rest.trim();
    let rest = rest.strip_prefix('"')?;
    let end = rest.find('"')?;
    Some(&rest[..end])
}

fn expand(
    b: &mut Built,
    file: &str,
    src: &str,
    from_line: u32,
    lookup: &dyn Fn(&str) -> Option<String>,
    seen: &mut Vec<String>,
    depth: u32,
) -> Result<(), String> {
    if depth > 16 {
        return Err(format!("{}: includes nest too deep", file));
    }
    let skip = if from_line > 1 { (from_line - 1) as usize } else { 0 };
    for (i, line) in src.lines().enumerate().skip(skip) {
        let n = i as u32 + 1;
        if let Some(inc) = include_of(line) {
            if seen.iter().any(|s| s == inc) {
                continue;
            }
            seen.push(inc.to_string());
            let text = read(inc, lookup).ok_or_else(|| format!("{}:{}: no such file {:?}", file, n, inc))?;
            if text.trim_start().starts_with("#version") {
                return Err(format!("{}:{}: {} is a stage, not a library file", file, n, inc));
            }
            expand(b, inc, &text, 1, lookup, seen, depth + 1)?;
            continue;
        }
        if line.trim_start().starts_with("#version") {
            return Err(format!("{}:{}: #version only on a stage's first line", file, n));
        }
        push(b, line, file, n);
    }
    Ok(())
}

/// Assembles a built-in stage with no game files.
pub fn assemble_builtin(path: &str, defines: &str) -> Result<Built, String> {
    assemble(path, defines, &|_| None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_stage_assembles() {
        for p in names() {
            if p.ends_with(".vs") || p.ends_with(".fs") {
                let b = assemble_builtin(p, "RG_YS=1.0").unwrap_or_else(|e| panic!("{}", e));
                assert!(b.src.starts_with("#version 300 es\n#define RG_YS 1.0\n"), "{}", p);
                assert!(!b.src.contains("#include"), "{}", p);
                assert_eq!(b.src.lines().count(), b.origin.len(), "{}", p);
            }
        }
    }

    #[test]
    fn library_files_have_no_version() {
        for p in names() {
            if p.ends_with(".glsl") {
                assert!(!builtin(p).unwrap().contains("#version"), "{}", p);
            }
        }
    }

    #[test]
    fn includes_once_and_game_files() {
        let game = |p: &str| -> Option<String> {
            match p {
                "shaders/a.fs" => Some("#version 300 es\n#include \"lib/heat.glsl\"\n#include \"lib/heat.glsl\"\n#include \"shaders/b.glsl\"\nvoid main() {}\n".into()),
                "shaders/b.glsl" => Some("// b\n#include \"lib/heat.glsl\"\nfloat b() { return 1.0; }\n".into()),
                "lib/heat.glsl" => Some("NOT USED: built-ins win".into()),
                _ => None,
            }
        };
        let b = assemble("shaders/a.fs", "", &game).unwrap();
        assert_eq!(b.src.matches("vec3 heat(").count(), 1);
        assert!(!b.src.contains("NOT USED"));
        assert!(b.src.contains("float b()"));
        let at = b.src.lines().position(|l| l.contains("float b()")).unwrap();
        assert_eq!(b.origin[at], ("shaders/b.glsl".to_string(), 3));
        let log = b.explain(&format!("ERROR: 0:{}: 'x' : undeclared identifier", at + 1));
        assert!(log.starts_with("ERROR: shaders/b.glsl:3: 'x'"), "{}", log);
    }

    #[test]
    fn errors() {
        assert!(assemble_builtin("nope.fs", "").is_err());
        assert!(assemble_builtin("lib/heat.glsl", "").is_err());
        assert!(assemble_builtin("splat/show.fs", "1X=2").is_err());
        let cyc = |p: &str| -> Option<String> {
            match p {
                "s.fs" => Some("#version 300 es\n#include \"x.glsl\"\n".into()),
                "x.glsl" => Some("#include \"y.glsl\"\n".into()),
                "y.glsl" => Some("#include \"x.glsl\"\nfloat y;\n".into()),
                _ => None,
            }
        };
        let b = assemble("s.fs", "", &cyc).unwrap();
        assert_eq!(b.src.matches("float y;").count(), 1);
    }

    #[test]
    fn defines_parse() {
        assert_eq!(parse_defines(" A = 1 ;B; ;C=x y"), vec![("A".into(), "1".into()), ("B".into(), "1".into()), ("C".into(), "x y".into())]);
    }
}
