// SPDX-License-Identifier: AGPL-3.0-or-later
//! Meshes drawn through a game's mesh() hook (rg.shader kind "mesh"): the
//! engine projects and lights the corners (rg_engine scene3d.rs `mtris`),
//! this compiles `shaders/mesh/mesh.vs` with the hook's `mesh/mesh.fs` (from
//! rg_shader, the game's file in it) and draws each batch with its uniforms,
//! depth-tested with the scene's other triangles. A hook that does not
//! compile is told in the game's log, and its faces take the engine's own
//! `mesh/mesh.glsl` (the colour worked out at the corners).

use crate::gl;
use std::collections::HashMap;

/// Floats a corner (scene3d.rs `MSTRIDE`).
pub const STRIDE: usize = 22;

/// The shared uniforms in the order of scene3d.rs `menv`, with their sizes.
const ENV: [(&str, usize); 12] = [
    ("rg_eye", 3), ("rg_time", 1), ("rg_water", 1), ("rg_surface", 1), ("rg_wcolor", 3), ("rg_absorb", 3),
    ("rg_scatter", 1), ("rg_sun", 3), ("rg_suncol", 3), ("rg_sky", 3), ("rg_caustics", 1), ("rg_cscale", 1),
];

struct Prog {
    id: u32,
    xf: i32,
    env: Vec<i32>,
    u: HashMap<String, i32>,
}

/// One frame's hooked meshes and the programs compiled for them.
#[derive(Default)]
pub struct Meshes {
    tris: Vec<f32>,
    batches: Vec<(String, String, usize, usize)>,
    env: Vec<f32>,
    /// by rg_shader key ("" the engine's own hook); None: it did not compile
    progs: HashMap<String, Option<Prog>>,
    vao: u32,
    vbo: u32,
}

fn compile(fs_path: &str) -> Result<u32, String> {
    let vs = rg_shader::stage("mesh/mesh.vs", "")?;
    let fs = rg_shader::stage(fs_path, "")?;
    let p = gl::create_program();
    for (kind, src, path) in [(gl::VERTEX_SHADER, &vs.src, "mesh/mesh.vs"), (gl::FRAGMENT_SHADER, &fs.src, fs_path)] {
        let s = gl::create_shader(kind);
        gl::shader_source(s, src);
        gl::compile_shader(s);
        if !gl::shader_ok(s) {
            let log = gl::shader_log(s);
            return Err(if log.is_empty() { format!("{}: does not compile", path) } else { rg_shader::explain(path, "", &log) });
        }
        gl::attach_shader(p, s);
    }
    gl::link_program(p);
    if !gl::program_ok(p) {
        return Err(format!("{}: {}", fs_path, gl::program_log(p)));
    }
    Ok(p)
}

/// "a=1;b=2,3" into names and numbers.
fn parse_uniforms(text: &str) -> Vec<(&str, Vec<f32>)> {
    text.split(';')
        .filter_map(|kv| {
            let (k, v) = kv.split_once('=')?;
            let nums: Vec<f32> = v.split(',').filter_map(|x| x.trim().parse().ok()).collect();
            if k.is_empty() || nums.is_empty() || nums.len() > 4 {
                return None;
            }
            Some((k.trim(), nums))
        })
        .collect()
}

impl Meshes {
    /// The frame's (or the eye's) hooked meshes: scene3d.rs `mtris`, `mbatches` and `menv`.
    pub fn set(&mut self, tris: &[f32], batches: &[(String, String, usize, usize)], env: &[f32]) {
        self.tris.clear();
        self.tris.extend_from_slice(tris);
        self.batches.clear();
        self.batches.extend_from_slice(batches);
        self.env.clear();
        self.env.extend_from_slice(env);
    }

    pub fn is_empty(&self) -> bool {
        self.tris.len() < STRIDE * 3 || self.batches.is_empty()
    }

    /// The GL context was lost: forget every handle.
    pub fn reset(&mut self) {
        self.progs.clear();
        self.vao = 0;
        self.vbo = 0;
    }

    fn prog(&mut self, key: &str) -> Option<&Prog> {
        if !self.progs.contains_key(key) {
            let path = if key.is_empty() { "mesh/mesh.fs".to_string() } else { format!("game:{}", key) };
            let made = match compile(&path) {
                Ok(id) => {
                    let mut env = Vec::new();
                    for (name, _) in ENV.iter() {
                        env.push(gl::uniform_location(id, name));
                    }
                    Some(Prog { id, xf: gl::uniform_location(id, "xf"), env, u: HashMap::new() })
                }
                Err(e) => {
                    rg_shader::report(&e);
                    None
                }
            };
            self.progs.insert(key.to_string(), made);
        }
        self.progs.get(key).and_then(|p| p.as_ref())
    }

    /// Draws the meshes with depth testing on (the caller's state); `xf` maps
    /// the game's units to clip space (as the triangles'). Returns the draw calls.
    pub fn draw(&mut self, xf: [f32; 4]) -> u32 {
        if self.is_empty() {
            return 0;
        }
        if self.vao == 0 {
            self.vao = gl::create_vertex_array();
            gl::bind_vertex_array(self.vao);
            self.vbo = gl::create_buffer();
            gl::bind_buffer(gl::ARRAY_BUFFER, self.vbo);
            // x y depth viewz | world | normal | colour | base | rest | sun
            let at: [(u32, i32, usize); 7] = [(0, 4, 0), (1, 3, 16), (2, 3, 28), (3, 3, 40), (4, 3, 52), (5, 3, 64), (6, 3, 76)];
            for (i, n, off) in at {
                gl::enable_attrib(i);
                gl::attrib_pointer(i, n, gl::FLOAT, false, (STRIDE * 4) as i32, off);
            }
        }
        gl::bind_vertex_array(self.vao);
        gl::bind_buffer(gl::ARRAY_BUFFER, self.vbo);
        let n = self.tris.len() / STRIDE * STRIDE;
        let tb = unsafe { std::slice::from_raw_parts(self.tris.as_ptr() as *const u8, n * 4) };
        gl::buffer_data(gl::ARRAY_BUFFER, tb, gl::STREAM_DRAW);
        let corners = n / STRIDE;
        let batches = std::mem::take(&mut self.batches);
        let env = std::mem::take(&mut self.env);
        let mut calls = 0;
        for (key, uniforms, first, count) in batches.iter() {
            let (first, count) = (*first, (*count).min(corners.saturating_sub(*first)));
            if count == 0 {
                continue;
            }
            // the game's hook, else the engine's own
            let key = if self.prog(key).is_some() { key.as_str() } else { "" };
            let Some(p) = self.prog(key) else { continue };
            let (id, xfl) = (p.id, p.xf);
            let locs = p.env.clone();
            gl::use_program(id);
            gl::uniform4f(xfl, xf[0], xf[1], xf[2], xf[3]);
            let mut at = 0;
            for ((_, size), l) in ENV.iter().zip(locs.iter()) {
                if at + size <= env.len() {
                    gl::uniformn(*l, &env[at..at + size]);
                }
                at += size;
            }
            for (name, nums) in parse_uniforms(uniforms) {
                let p = self.progs.get_mut(key).and_then(|p| p.as_mut()).unwrap();
                let l = *p.u.entry(name.to_string()).or_insert_with(|| gl::uniform_location(id, &format!("u_{}", name)));
                gl::uniformn(l, &nums);
            }
            gl::draw_arrays(gl::TRIANGLES, first as i32, count as i32);
            calls += 1;
        }
        self.batches = batches;
        self.env = env;
        calls
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uniforms_parse() {
        let u = parse_uniforms("glow=1.5;tint=1,0.5,0.25;bad;=2;x=");
        assert_eq!(u, vec![("glow", vec![1.5]), ("tint", vec![1.0, 0.5, 0.25])]);
    }

    #[test]
    fn draws_a_batch_and_falls_back() {
        let mut m = Meshes::default();
        assert_eq!(m.draw([1.0; 4]), 0);
        m.set(&[0.0; STRIDE * 3], &[("nosuch#0".to_string(), "a=1".to_string(), 0, 3)], &[0.0; 24]);
        // (the test GL compiles nothing; the unknown key takes the engine's own hook)
        assert_eq!(m.draw([1.0; 4]), 1);
    }
}
