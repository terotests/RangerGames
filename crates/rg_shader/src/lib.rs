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
    assemble_text(path, &main, defines, lookup)
}

/// [`assemble`] for a stage whose text is given (`path` names it in errors and origins).
pub fn assemble_text(path: &str, main: &str, defines: &str, lookup: &dyn Fn(&str) -> Option<String>) -> Result<Built, String> {
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
    expand(&mut b, path, main, 2, lookup, &mut seen, 0)?;
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

/// Assembles a built-in stage with no game files. A kind's stage (KINDS)
/// gets its default hook, the engine's own look for that kind.
pub fn assemble_builtin(path: &str, defines: &str) -> Result<Built, String> {
    let dflt = KINDS.iter().find(|k| k.1 == path).and_then(|k| builtin(k.2));
    assemble(path, defines, &|p| if p == "<hook>" { dflt.map(|s| s.to_string()) } else { None })
}

// ---------------------------------------------------------------------------
// Game shaders: rg.shader(name, { src, kind }) in a game. The engine reads the
// game's file (and the game files it includes) and registers them here under
// a key that changes with their text; the draw stream names the key, and a
// host asks for "game:<key>" as for a built-in. Kept in a process-wide table
// (not in the engine) so the Android painter can ask from any thread.

/// What a game's hook plugs into: its kind and the engine stage that wraps it.
/// The stage has a line `#include "<hook>"` where the game's file goes; the
/// third file is the engine's own hook for that kind (its default look and an
/// example to start a game's own from).
pub const KINDS: &[(&str, &str, &str)] = &[("liquid", "splat/liquid.fs", "splat/liquid.glsl")];

struct GameShader {
    name: String,
    key: String,
    template: &'static str,
    /// the game's files by their path in the game's folder, the hook first
    files: Vec<(String, String)>,
}

static GAME: std::sync::Mutex<Vec<GameShader>> = std::sync::Mutex::new(Vec::new());
static ERRORS: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

fn fnv(h: &mut u64, s: &str) {
    for b in s.bytes() {
        *h ^= b as u64;
        *h = h.wrapping_mul(0x100000001b3);
    }
    *h ^= 0xff;
    *h = h.wrapping_mul(0x100000001b3);
}

/// Registers a game's shader: `src` read with `read` (a path in the game's
/// folder), its `#include`s of game files too (built-in library paths stay
/// built-ins). Checks that it assembles into its kind's stage and gives the
/// key the draw stream names (`name#hash`): the same text gives the same key,
/// a changed file a new one, so a host compiles it again.
pub fn register_game(name: &str, kind: &str, src: &str, read: &dyn Fn(&str) -> Option<String>) -> Result<String, String> {
    let template = KINDS
        .iter()
        .find(|k| k.0 == kind)
        .and_then(|k| builtin(k.1))
        .ok_or_else(|| format!("shader {}: kind {:?} is not one of {}", name, kind, KINDS.iter().map(|k| k.0).collect::<Vec<_>>().join(", ")))?;
    let mut files: Vec<(String, String)> = Vec::new();
    let mut todo = vec![src.to_string()];
    while let Some(p) = todo.pop() {
        if files.iter().any(|f| f.0 == p) || builtin(&p).is_some() {
            continue;
        }
        let text = read(&p).ok_or_else(|| format!("shader {}: no file {}", name, p))?;
        if text.trim_start().starts_with("#version") {
            return Err(format!("{}:1: a game shader is functions only (no #version, no main); the engine adds them", p));
        }
        for l in text.lines() {
            if let Some(inc) = include_of(l) {
                todo.push(inc.to_string());
            }
        }
        files.push((p, text));
        if files.len() > 32 {
            return Err(format!("shader {}: more than 32 files", name));
        }
    }
    let mut h: u64 = 0xcbf29ce484222325;
    fnv(&mut h, kind);
    for (p, t) in &files {
        fnv(&mut h, p);
        fnv(&mut h, t);
    }
    let key = format!("{}#{:012x}", name, h & 0xffff_ffff_ffff);
    let g = GameShader { name: name.to_string(), key: key.clone(), template, files };
    game_built(&g, "RG_YS=1.0")?;
    let mut t = GAME.lock().unwrap();
    t.retain(|e| e.name != name);
    t.push(g);
    Ok(key)
}

fn game_built(g: &GameShader, defines: &str) -> Result<Built, String> {
    let main = g.files[0].0.clone();
    let text = g.template.replace("#include \"<hook>\"", &format!("#include \"{}\"", main));
    let stage = KINDS.iter().find(|k| builtin(k.1) == Some(g.template)).map(|k| k.1).unwrap_or("stage");
    assemble_text(stage, &text, defines, &|p| g.files.iter().find(|f| f.0 == p).map(|f| f.1.clone()))
}

/// A stage for a host: a built-in path, or `game:<key>` for a registered game shader.
pub fn stage(path: &str, defines: &str) -> Result<Built, String> {
    match path.strip_prefix("game:") {
        Some(key) => {
            let t = GAME.lock().unwrap();
            let g = t.iter().find(|g| g.key == key).ok_or_else(|| format!("shader {}: not registered", key))?;
            game_built(g, defines)
        }
        None => assemble_builtin(path, defines),
    }
}

/// A host's compile log for the stage `path` told in the source's own files
/// and lines; kept for the engine to show in the game's log ([`take_errors`]).
pub fn explain(path: &str, defines: &str, log: &str) -> String {
    let text = match stage(path, defines) {
        Ok(b) => b.explain(log),
        Err(e) => format!("{}\n{}", e, log),
    };
    let name = path.strip_prefix("game:").map(|k| k.split('#').next().unwrap_or(k)).unwrap_or(path);
    report(&format!("shader {} did not compile (the engine's own is used):\n{}", name, text.trim_end()));
    text
}

/// Keeps a message for the game's log.
pub fn report(msg: &str) {
    let mut e = ERRORS.lock().unwrap();
    if e.len() < 32 {
        e.push(msg.to_string());
    }
}

/// The messages kept since the last call (the engine puts them in the game's log).
pub fn take_errors() -> Vec<String> {
    std::mem::take(&mut *ERRORS.lock().unwrap())
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
    fn game_shader() {
        let files = |p: &str| -> Option<String> {
            match p {
                "shaders/magma.glsl" => Some("#include \"lib/heat.glsl\"\n#include \"shaders/util.glsl\"\nuniform float u_heat;\nvec4 liquid(Fluid f) {\n  return vec4(heat(f.temp * u_heat) * k(), f.edge);\n}\n".into()),
                "shaders/util.glsl" => Some("float k() { return 1.0; }\n".into()),
                "shaders/bad.glsl" => Some("#version 300 es\nvoid main() {}\n".into()),
                _ => None,
            }
        };
        let key = register_game("magma", "liquid", "shaders/magma.glsl", &files).unwrap();
        assert!(key.starts_with("magma#"));
        assert_eq!(register_game("magma", "liquid", "shaders/magma.glsl", &files).unwrap(), key);
        let b = stage(&format!("game:{}", key), "RG_YS=-1.0").unwrap();
        assert!(b.src.contains("#define RG_YS -1.0"));
        assert!(b.src.contains("uniform float u_heat;"));
        assert!(b.src.contains("float k()"));
        assert_eq!(b.src.matches("vec3 heat(").count(), 1);
        let at = b.src.lines().position(|l| l.contains("return vec4(heat")).unwrap();
        assert_eq!(b.origin[at], ("shaders/magma.glsl".to_string(), 5));
        let log = explain(&format!("game:{}", key), "RG_YS=1.0", &format!("ERROR: 0:{}: 'heat' : no matching overloaded function", at + 1));
        assert!(log.contains("shaders/magma.glsl:5:"), "{}", log);
        assert!(take_errors().iter().any(|e| e.contains("shader magma did not compile")));
        assert!(register_game("x", "liquid", "shaders/bad.glsl", &files).is_err());
        assert!(register_game("x", "liquid", "shaders/none.glsl", &files).is_err());
        assert!(register_game("x", "nope", "shaders/magma.glsl", &files).is_err());
    }

    #[test]
    fn defines_parse() {
        assert_eq!(parse_defines(" A = 1 ;B; ;C=x y"), vec![("A".into(), "1".into()), ("B".into(), "1".into()), ("C".into(), "x y".into())]);
    }
}
