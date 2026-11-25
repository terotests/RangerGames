// SPDX-License-Identifier: AGPL-3.0-or-later
//! The engine's draw stream (crates/rg_engine/src/draw.rs) painted with
//! OpenGL ES 3.0 / WebGL2 into one surface, in the stream's order: boxes,
//! borders, shadows, pictures, text, paths, strokes, clips, the globes (drawn
//! by the host into a texture of its own) and the 3D scene's depth-tested
//! triangles (stream kind 9 says where they go).
//!
//! A frame is built first (vertices into one buffer, a list of steps), then
//! sent to the GPU in one upload and drawn step by step, so a frame is a
//! handful of draw calls. The host (Android's Java, the web page's JS) only
//! decodes pictures, writes text runs and draws globes.

pub mod atlas;
pub mod gl;
pub mod shaders;
pub mod tess;

use std::collections::HashMap;

const HEADER: usize = 23;
const RECT: i32 = 0;
const BORDER: i32 = 1;
const IMAGE: i32 = 2;
const TEXT: i32 = 3;
const PUSH_CLIP: i32 = 4;
const POP_CLIP: i32 = 5;
const PATH: i32 = 6;
const STROKE: i32 = 7;
const SPHERE: i32 = 8;
/// liquid splats (a baked particle run): drawn by the host into a texture, as globes
const SPLATS: i32 = 10;
/// the 3D scene's triangles go here: x = first float, y = end (of `tris`)
const LAYER3D: i32 = 9;

/// A text's pieces for the atlas: each digit alone, the runs between digits whole.
fn pieces_of(text: &str) -> Vec<&str> {
    if !text.bytes().any(|b| b.is_ascii_digit()) {
        return vec![text];
    }
    let mut out = Vec::new();
    let mut start = 0;
    for (i, ch) in text.char_indices() {
        if ch.is_ascii_digit() {
            if i > start {
                out.push(&text[start..i]);
            }
            out.push(&text[i..i + 1]);
            start = i + 1;
        }
    }
    if start < text.len() {
        out.push(&text[start..]);
    }
    out
}

/// The text atlas: one RGBA texture this big.
const ATLAS: i32 = 2048;
/// pictures kept on the GPU, the least recently drawn dropped past this many bytes
const IMAGE_BUDGET: usize = 128 * 1024 * 1024;

/// A picture asked of the host.
pub enum Img {
    /// uploaded into the bound texture: its size in pixels
    Ready(u32, u32),
    /// not decoded yet (ask again next frame)
    Pending,
    /// not a picture
    Failed,
}

/// One text run to write, in device pixels.
pub struct TextRun<'a> {
    pub text: &'a str,
    pub family: &'a str,
    pub weight: &'a str,
    pub italic: bool,
    pub size: f32,
    pub spacing: f32,
    pub rgb: [u8; 3],
    /// empty pixels round the text (the bitmap is text + 2 × pad)
    pub pad: i32,
}

/// What the host draws onto the GPU.
pub struct Globes {
    /// a texture of the host's (premultiplied alpha)
    pub tex: u32,
    /// the box it covers, in the game's units
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    /// the part of the texture that holds the picture
    pub u1: f32,
    pub v1: f32,
    /// the picture's first row is the texture's bottom row (GL's own order)
    pub flip: bool,
}

pub trait Host {
    /// Uploads the picture at `path` into the bound TEXTURE_2D (premultiplied RGBA).
    fn image(&mut self, path: &str) -> Img;
    /// The run's advance width, ascent (negative) and descent, in device pixels.
    fn text_measure(&mut self, run: &TextRun) -> Option<(f32, f32, f32)>;
    /// Writes the run into the bound texture at x, y (w × h pixels): the text
    /// starts at x + pad, its baseline at y + pad − ascent.
    fn text_draw(&mut self, run: &TextRun, x: i32, y: i32, w: i32, h: i32) -> bool;
    /// Draws the globes of stream commands `from..to` (all kind 8, or one kind 10: liquid splats) into a
    /// texture; `px`: device pixels per game unit. None: nothing to show.
    fn globes(&mut self, nums: &[f32], strings: &[String], from: usize, to: usize, px: f32) -> Option<Globes>;
}

/// VR: an eye painted from its own draw stream (`Renderer::render_eye`):
/// the stream, its strings, the host for its pictures and globes, and its
/// view (`width` and `height` become the eye's rectangle's).
pub struct EyeStream<'a> {
    pub host: &'a mut dyn Host,
    pub nums: &'a [f32],
    pub strings: &'a [String],
    pub view: View,
}

/// Where and how big the game is: Engine.view in dp, and the surface.
#[derive(Clone, Copy)]
pub struct View {
    pub scale: f32,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    /// device pixels per dp
    pub density: f32,
    /// the surface in device pixels
    pub width: i32,
    pub height: i32,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct Vert {
    pos: [f32; 2],
    local: [f32; 2],
    uv: [f32; 2],
    half: [f32; 2],
    radii: [f32; 4],
    param: [f32; 2],
    color: [u8; 4],
}

const STRIDE: i32 = std::mem::size_of::<Vert>() as i32;

/// A scissor box in GL's pixels (from the bottom).
type Clip = [i32; 4];

enum Step {
    Draw { tex: u32, first: u32, count: u32, clip: Clip },
    /// a path filled by the stencil: its fan, then its box
    Fill { first: u32, count: u32, cover: u32, even_odd: bool, clip: Clip },
    /// see-through stroke drawn once a pixel: triangles, then the box clears the stencil
    Once { first: u32, count: u32, cover: u32, clip: Clip },
    Globes { from: usize, to: usize, clip: Clip },
    /// `phong`: the per-pixel lit meshes (`ptris`) first, in the same depth
    Tris { first: i32, count: i32, phong: bool, clip: Clip },
}

struct Pic {
    tex: u32,
    w: u32,
    h: u32,
    bytes: usize,
    used: u64,
    state: u8, // 0 ready, 1 pending, 2 failed
}

struct Run {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    adv: f32,
    used: u64,
}

pub struct Renderer {
    ok: bool,
    tried: bool,
    shape: u32,
    shape_xf: i32,
    shape_aa: i32,
    shape_tex: i32,
    tris_prog: u32,
    tris_xf: i32,
    /// per-pixel lit meshes (scene3d.rs `ptris`): program, xf, lights, count, fog
    phong: u32,
    phong_xf: i32,
    phong_lt: [i32; 8],
    phong_nl: i32,
    phong_fog: i32,
    phong_vao: u32,
    phong_vbo: u32,
    vao: u32,
    vbo: u32,
    ibo: u32,
    tris_vao: u32,
    tris_vbo: u32,
    white: u32,
    atlas: u32,
    shelves: atlas::Shelves,
    runs: HashMap<String, Run>,
    pics: HashMap<String, Pic>,
    pic_bytes: usize,
    frame: u64,
    verts: Vec<Vert>,
    idx: Vec<u32>,
    steps: Vec<Step>,
    tmp: Vec<f32>,
    /// draw calls and vertices of the last frame
    pub calls: u32,
    pub vertex_count: u32,
    /// the shaders' compile errors, when !ok
    pub error: String,
    /// the framebuffer `render` paints into (0: the window; VR: the panel's)
    fbo: u32,
    /// VR: the part of `fbo` that `render` paints (x, y, w, h from the bottom
    /// left; None: all of it, `View::width` × `height`)
    port: Option<[i32; 4]>,
    /// VR: the 2D view's panel (a texture with its framebuffer), its size,
    /// and the program and buffers that draw it into an eye
    panel: Option<(u32, u32, u32, i32, i32)>,
    panel_prog: u32,
    panel_vao: u32,
    panel_vbo: u32,
}

impl Default for Renderer {
    fn default() -> Self {
        Renderer::new()
    }
}

fn program(vs: &str, fs: &str, err: &mut String) -> u32 {
    let p = gl::create_program();
    for (kind, src) in [(gl::VERTEX_SHADER, vs), (gl::FRAGMENT_SHADER, fs)] {
        let s = gl::create_shader(kind);
        gl::shader_source(s, src);
        gl::compile_shader(s);
        if !gl::shader_ok(s) {
            err.push_str(&gl::shader_log(s));
            return 0;
        }
        gl::attach_shader(p, s);
    }
    gl::link_program(p);
    if !gl::program_ok(p) {
        err.push_str(&gl::program_log(p));
        return 0;
    }
    p
}

fn rgba(r: f32, g: f32, b: f32, a: f32) -> [u8; 4] {
    // premultiplied
    let a = a.clamp(0.0, 1.0);
    let c = |v: f32| ((v.clamp(0.0, 255.0) * a).round()) as u8;
    [c(r), c(g), c(b), (a * 255.0).round() as u8]
}

fn intersect(a: Clip, b: Clip) -> Clip {
    let x0 = a[0].max(b[0]);
    let y0 = a[1].max(b[1]);
    let x1 = (a[0] + a[2]).min(b[0] + b[2]);
    let y1 = (a[1] + a[3]).min(b[1] + b[3]);
    [x0, y0, (x1 - x0).max(0), (y1 - y0).max(0)]
}

/// The text size actually written: steps of 4 % above 16 px (an animated
/// size then reuses a few runs), half pixels below.
fn size_step(px: f32) -> f32 {
    if px <= 16.0 {
        (px * 2.0).round().max(1.0) / 2.0
    } else {
        let k = (px.ln() / 1.04f32.ln()).round();
        1.04f32.powf(k)
    }
}

impl Renderer {
    pub fn new() -> Renderer {
        Renderer {
            ok: false,
            tried: false,
            shape: 0,
            shape_xf: -1,
            shape_aa: -1,
            shape_tex: -1,
            tris_prog: 0,
            tris_xf: -1,
            phong: 0,
            phong_xf: -1,
            phong_lt: [-1; 8],
            phong_nl: -1,
            phong_fog: -1,
            phong_vao: 0,
            phong_vbo: 0,
            vao: 0,
            vbo: 0,
            ibo: 0,
            tris_vao: 0,
            tris_vbo: 0,
            white: 0,
            atlas: 0,
            shelves: atlas::Shelves::new(ATLAS, ATLAS),
            runs: HashMap::new(),
            pics: HashMap::new(),
            pic_bytes: 0,
            frame: 0,
            verts: Vec::with_capacity(16384),
            idx: Vec::with_capacity(32768),
            steps: Vec::new(),
            tmp: Vec::new(),
            calls: 0,
            vertex_count: 0,
            error: String::new(),
            fbo: 0,
            port: None,
            panel: None,
            panel_prog: 0,
            panel_vao: 0,
            panel_vbo: 0,
        }
    }

    /// The GL context was lost (a new surface on Android): forget every handle.
    pub fn reset(&mut self) {
        *self = Renderer::new();
    }

    /// Compiles the shaders (with the context current); false when GL can't.
    pub fn init(&mut self) -> bool {
        if self.tried {
            return self.ok;
        }
        self.tried = true;
        let mut err = String::new();
        self.shape = program(shaders::SHAPE_VS, shaders::SHAPE_FS, &mut err);
        self.tris_prog = program(shaders::TRIS_VS, shaders::TRIS_FS, &mut err);
        if self.shape == 0 || self.tris_prog == 0 {
            self.error = if err.is_empty() { "shader".to_string() } else { err };
            return false;
        }
        self.shape_xf = gl::uniform_location(self.shape, "xf");
        self.shape_aa = gl::uniform_location(self.shape, "aa");
        self.shape_tex = gl::uniform_location(self.shape, "tex");
        self.tris_xf = gl::uniform_location(self.tris_prog, "xf");
        // the per-pixel light is a bonus: without it the engine's corners' light is used
        let mut perr = String::new();
        self.phong = program(shaders::PHONG_VS, shaders::PHONG_FS, &mut perr);
        if self.phong != 0 {
            self.phong_xf = gl::uniform_location(self.phong, "xf");
            for i in 0..8 {
                self.phong_lt[i] = gl::uniform_location(self.phong, &format!("lt[{}]", i));
            }
            self.phong_nl = gl::uniform_location(self.phong, "nl");
            self.phong_fog = gl::uniform_location(self.phong, "fogc");
        }

        self.vao = gl::create_vertex_array();
        gl::bind_vertex_array(self.vao);
        self.vbo = gl::create_buffer();
        self.ibo = gl::create_buffer();
        gl::bind_buffer(gl::ARRAY_BUFFER, self.vbo);
        gl::bind_buffer(gl::ELEMENT_ARRAY_BUFFER, self.ibo);
        let attrs: [(u32, i32, u32, bool, usize); 7] = [
            (0, 2, gl::FLOAT, false, 0),
            (1, 2, gl::FLOAT, false, 8),
            (2, 2, gl::FLOAT, false, 16),
            (3, 2, gl::FLOAT, false, 24),
            (4, 4, gl::FLOAT, false, 32),
            (5, 2, gl::FLOAT, false, 48),
            (6, 4, gl::UNSIGNED_BYTE, true, 56),
        ];
        for (i, n, t, norm, off) in attrs {
            gl::enable_attrib(i);
            gl::attrib_pointer(i, n, t, norm, STRIDE, off);
        }
        self.tris_vao = gl::create_vertex_array();
        gl::bind_vertex_array(self.tris_vao);
        self.tris_vbo = gl::create_buffer();
        gl::bind_buffer(gl::ARRAY_BUFFER, self.tris_vbo);
        gl::enable_attrib(0);
        gl::attrib_pointer(0, 2, gl::FLOAT, false, 24, 0);
        gl::enable_attrib(1);
        gl::attrib_pointer(1, 1, gl::FLOAT, false, 24, 8);
        gl::enable_attrib(2);
        gl::attrib_pointer(2, 3, gl::FLOAT, false, 24, 12);
        if self.phong != 0 {
            self.phong_vao = gl::create_vertex_array();
            gl::bind_vertex_array(self.phong_vao);
            self.phong_vbo = gl::create_buffer();
            gl::bind_buffer(gl::ARRAY_BUFFER, self.phong_vbo);
            // x y | depth | base rgb | rest rgb | normal | eye | shiny, fog (18 floats, 72 bytes)
            let at: [(u32, i32, usize); 7] = [(0, 2, 0), (1, 1, 8), (2, 3, 12), (3, 3, 24), (4, 3, 36), (5, 3, 48), (6, 2, 60)];
            for (i, n, off) in at {
                gl::enable_attrib(i);
                gl::attrib_pointer(i, n, gl::FLOAT, false, 72, off);
            }
        }
        gl::bind_vertex_array(0);

        // a white pixel: plain shapes sample it, so one texture unit serves all
        self.white = gl::create_texture();
        gl::bind_texture(gl::TEXTURE_2D, self.white);
        gl::tex_image(1, 1, Some(&[255, 255, 255, 255]));
        Self::tex_params();
        self.atlas = gl::create_texture();
        gl::bind_texture(gl::TEXTURE_2D, self.atlas);
        // cleared: the gutters between runs are sampled at their edges (Mali
        // leaves a new texture's memory as it was: black blocks and old text)
        gl::tex_image(ATLAS, ATLAS, Some(&vec![0u8; (ATLAS * ATLAS * 4) as usize]));
        Self::tex_params();
        self.ok = true;
        true
    }

    pub fn ok(&self) -> bool {
        self.ok
    }

    fn tex_params() {
        gl::tex_parameter(gl::TEXTURE_MIN_FILTER, gl::LINEAR);
        gl::tex_parameter(gl::TEXTURE_MAG_FILTER, gl::LINEAR);
        gl::tex_parameter(gl::TEXTURE_WRAP_S, gl::CLAMP_TO_EDGE);
        gl::tex_parameter(gl::TEXTURE_WRAP_T, gl::CLAMP_TO_EDGE);
    }

    // ---- building a frame ----

    fn push_step(&mut self, tex: u32, first: u32, clip: Clip) {
        let count = self.idx.len() as u32 - first;
        if count == 0 {
            return;
        }
        // plain shapes (white) sample no texture: they join a draw of any
        // texture, so boxes and text between them stay one draw call
        let white = self.white;
        if let Some(Step::Draw { tex: t, first: f, count: c, clip: k }) = self.steps.last_mut() {
            if (*t == tex || tex == white || *t == white) && *k == clip && *f + *c == first {
                if *t == white {
                    *t = tex;
                }
                *c += count;
                return;
            }
        }
        self.steps.push(Step::Draw { tex, first, count, clip });
    }

    /// A quad of four corners (already turned), as two triangles.
    fn quad(&mut self, v: [Vert; 4]) {
        let b = self.verts.len() as u32;
        self.verts.extend_from_slice(&v);
        self.idx.extend_from_slice(&[b, b + 1, b + 2, b, b + 2, b + 3]);
    }

    /// The four corners of x, y, w, h turned by `rot` degrees round (cx, cy).
    fn corners(x: f32, y: f32, w: f32, h: f32, rot: Option<(f32, f32, f32)>) -> [[f32; 2]; 4] {
        let mut c = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
        if let Some((deg, cx, cy)) = rot {
            let (s, co) = deg.to_radians().sin_cos();
            for p in c.iter_mut() {
                let (dx, dy) = (p[0] - cx, p[1] - cy);
                *p = [cx + dx * co - dy * s, cy + dx * s + dy * co];
            }
        }
        c
    }

    /// A box shape (kinds 1–4 of SHAPE_FS) covering the box plus `grow` round it.
    #[allow(clippy::too_many_arguments)]
    fn shape_quad(&mut self, x: f32, y: f32, w: f32, h: f32, grow: f32, half: [f32; 2], centre: [f32; 2], radii: [f32; 4],
        param: [f32; 2], colors: [[u8; 4]; 4], uv: [[f32; 2]; 4], rot: Option<(f32, f32, f32)>) {
        let (gx, gy, gw, gh) = (x - grow, y - grow, w + grow * 2.0, h + grow * 2.0);
        let pos = Self::corners(gx, gy, gw, gh, rot);
        let loc = [[gx, gy], [gx + gw, gy], [gx + gw, gy + gh], [gx, gy + gh]];
        let mut v = [Vert::default(); 4];
        for k in 0..4 {
            v[k] = Vert { pos: pos[k], local: [loc[k][0] - centre[0], loc[k][1] - centre[1]], uv: uv[k], half, radii, param, color: colors[k] };
        }
        self.quad(v);
    }

    fn solid_tris(&mut self, pts: &[f32], color: [u8; 4]) {
        let b = self.verts.len() as u32;
        for p in pts.chunks(2) {
            self.verts.push(Vert { pos: [p[0], p[1]], color, ..Vert::default() });
        }
        let n = (pts.len() / 2) as u32;
        self.idx.extend(b..b + n);
    }

    fn cover_quad(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, color: [u8; 4]) -> u32 {
        let first = self.idx.len() as u32;
        let mut v = [Vert { color, ..Vert::default() }; 4];
        v[0].pos = [x0, y0];
        v[1].pos = [x1, y0];
        v[2].pos = [x1, y1];
        v[3].pos = [x0, y1];
        self.quad(v);
        first
    }

    /// A picture's texture (asked of the host once; pending ones again each frame).
    fn picture(&mut self, host: &mut dyn Host, src: &str) -> Option<(u32, u32, u32)> {
        let frame = self.frame;
        if let Some(p) = self.pics.get_mut(src) {
            p.used = frame;
            match p.state {
                0 => return Some((p.tex, p.w, p.h)),
                2 => return None,
                _ => {}
            }
        }
        let tex = match self.pics.get(src) {
            Some(p) => p.tex,
            None => gl::create_texture(),
        };
        gl::bind_texture(gl::TEXTURE_2D, tex);
        let r = host.image(src);
        let (state, w, h) = match r {
            Img::Ready(w, h) => {
                Self::tex_params();
                (0u8, w, h)
            }
            Img::Pending => (1, 0, 0),
            Img::Failed => (2, 0, 0),
        };
        let bytes = (w as usize) * (h as usize) * 4;
        self.pic_bytes += bytes;
        self.pics.insert(src.to_string(), Pic { tex, w, h, bytes, used: frame, state });
        if state == 0 { Some((tex, w, h)) } else { None }
    }

    /// Drops the least recently drawn pictures past the budget (not this frame's).
    fn evict(&mut self) {
        if self.pic_bytes <= IMAGE_BUDGET {
            return;
        }
        let mut old: Vec<(u64, String)> = self.pics.iter().filter(|(_, p)| p.used + 1 < self.frame).map(|(k, p)| (p.used, k.clone())).collect();
        old.sort();
        for (_, k) in old {
            if self.pic_bytes <= IMAGE_BUDGET * 3 / 4 {
                break;
            }
            if let Some(p) = self.pics.remove(&k) {
                gl::delete_texture(p.tex);
                self.pic_bytes -= p.bytes;
            }
        }
    }

    /// The run's place on the atlas (written there now if new).
    fn text_run(&mut self, host: &mut dyn Host, run: &TextRun) -> Option<(i32, i32, i32, i32, f32)> {
        let key = format!("{}\u{1}{}\u{1}{}\u{1}{}\u{1}{}\u{1}{}\u{1}{:?}", run.text, run.family, run.weight, run.italic, run.size, run.spacing, run.rgb);
        if let Some(r) = self.runs.get_mut(&key) {
            r.used = self.frame;
            return Some((r.x, r.y, r.w, r.h, r.adv));
        }
        let (adv, asc, desc) = host.text_measure(run)?;
        let w = adv.ceil() as i32 + run.pad * 2;
        let h = (desc - asc).ceil() as i32 + run.pad * 2;
        if w <= 0 || h <= 0 || w > ATLAS || h > ATLAS {
            return None;
        }
        let at = match self.shelves.place(w, h) {
            Some(a) => a,
            None => {
                // full: start the atlas again (this frame's runs are written anew)
                self.shelves.clear();
                self.runs.clear();
                self.shelves.place(w, h)?
            }
        };
        gl::bind_texture(gl::TEXTURE_2D, self.atlas);
        if !host.text_draw(run, at.0, at.1, w, h) {
            return None;
        }
        self.runs.insert(key, Run { x: at.0, y: at.1, w, h, adv, used: self.frame });
        Some((at.0, at.1, w, h, adv))
    }

    fn clip_px(v: &View, x: f32, y: f32, w: f32, h: f32) -> Clip {
        let s = v.scale * v.density;
        let ox = v.x * v.density;
        let oy = v.y * v.density;
        let x0 = (x * s + ox).round() as i32;
        let x1 = ((x + w.max(0.0)) * s + ox).round() as i32;
        let y0 = (y * s + oy).round() as i32;
        let y1 = ((y + h.max(0.0)) * s + oy).round() as i32;
        [x0, v.height - y1, (x1 - x0).max(0), (y1 - y0).max(0)]
    }

    /// Builds the frame's vertices and steps from the stream.
    fn build(&mut self, host: &mut dyn Host, nums: &[f32], strings: &[String], tris: &[f32], ptris: &[f32], v: &View) {
        self.verts.clear();
        self.idx.clear();
        self.steps.clear();
        let s = v.scale * v.density;
        let aa = 1.0 / s.max(1e-3);
        let game = Self::clip_px(v, 0.0, 0.0, v.w, v.h);
        let mut clips: Vec<Clip> = vec![game];
        let string = |i: f32| -> &str {
            let i = i as i32;
            if i >= 0 && (i as usize) < strings.len() { &strings[i as usize] } else { "" }
        };
        let white = self.white;
        let n = nums.len();
        let mut i = 0usize;
        while i + HEADER <= n {
            let k = nums[i] as i32;
            let (x, y, w, h) = (nums[i + 1], nums[i + 2], nums[i + 3], nums[i + 4]);
            let (r, g, b, a) = (nums[i + 5], nums[i + 6], nums[i + 7], nums[i + 8]);
            let radii = [nums[i + 9], nums[i + 10], nums[i + 11], nums[i + 12]];
            let (t, rot, rox, roy) = (nums[i + 13], nums[i + 14], nums[i + 15], nums[i + 16]);
            let flags = nums[i + 17] as i32;
            let (s0, s1, s2, ls) = (nums[i + 18], nums[i + 19], nums[i + 20], nums[i + 21]);
            let nx = nums[i + 22].max(0.0) as usize;
            let mut e = i + HEADER;
            let next = (e + nx).min(n);
            let (mut grad, mut shadow, mut crop, mut tile) = (None, None, None, None);
            if flags & 1 != 0 { grad = Some(e); e += 4; }
            if flags & 4 != 0 { shadow = Some(e); e += 7; }
            if flags & 64 != 0 { crop = Some(e); e += 4; }
            if flags & 1024 != 0 { tile = Some(e); e += 4; }
            let clip = *clips.last().unwrap();
            if k == SPHERE {
                // the run of globes that follow one another: one picture of the host's
                let mut j = i;
                while j + HEADER <= n && nums[j] as i32 == SPHERE {
                    j = (j + HEADER + nums[j + 22].max(0.0) as usize).min(n);
                }
                self.steps.push(Step::Globes { from: i, to: j, clip });
                i = j;
                continue;
            }
            if k == SPLATS {
                if w > 0.0 && h > 0.0 {
                    self.steps.push(Step::Globes { from: i, to: next, clip });
                }
                i = next;
                continue;
            }
            i = next;
            if k == LAYER3D {
                let (t0, t1) = (x.max(0.0) as usize / 6, (y.max(0.0) as usize / 6).min(tris.len() / 6));
                let phong = w > 0.0 && self.phong != 0 && ptris.len() >= 18 * 3;
                if t1 > t0 || phong {
                    self.steps.push(Step::Tris { first: t0 as i32, count: t1.saturating_sub(t0) as i32, phong, clip });
                }
                continue;
            }
            if k == PUSH_CLIP {
                clips.push(intersect(clip, Self::clip_px(v, x, y, w, h)));
                continue;
            }
            if k == POP_CLIP {
                if clips.len() > 1 {
                    clips.pop();
                }
                continue;
            }
            if a <= 0.0 && flags & 1 == 0 && k != IMAGE {
                continue;
            }
            let rotp = if rot != 0.0 {
                let (cx, cy) = if flags & 128 != 0 { (rox, roy) } else { (x + w / 2.0, y + h / 2.0) };
                Some((rot, cx, cy))
            } else {
                None
            };
            let first = self.idx.len() as u32;
            let centre = [x + w / 2.0, y + h / 2.0];
            let half = [w / 2.0, h / 2.0];
            let lim = (w.min(h) / 2.0).max(0.0);
            let rad = [radii[0].clamp(0.0, lim), radii[1].clamp(0.0, lim), radii[2].clamp(0.0, lim), radii[3].clamp(0.0, lim)];
            let zuv = [[0.0; 2]; 4];
            match k {
                RECT => {
                    if w <= 0.0 || h <= 0.0 {
                        continue;
                    }
                    let c0 = rgba(r, g, b, a);
                    if let Some(sh) = shadow {
                        let (dx, dy, blur) = (nums[sh], nums[sh + 1], nums[sh + 2]);
                        let sc = rgba(nums[sh + 3], nums[sh + 4], nums[sh + 5], nums[sh + 6]);
                        let sigma = (blur / 2.0).max(0.0);
                        let rp = rotp.map(|(d, cx, cy)| (d, cx + dx, cy + dy));
                        self.shape_quad(x + dx, y + dy, w, h, sigma * 3.0 + aa, half, [centre[0] + dx, centre[1] + dy], rad, [3.0, sigma], [sc; 4], zuv, rp);
                    }
                    let colors = match grad {
                        Some(gi) => {
                            let c1 = rgba(nums[gi], nums[gi + 1], nums[gi + 2], nums[gi + 3]);
                            if flags & 2 != 0 { [c0, c1, c1, c0] } else { [c0, c0, c1, c1] }
                        }
                        None => [c0; 4],
                    };
                    self.shape_quad(x, y, w, h, aa, half, centre, rad, [1.0, 0.0], colors, zuv, rotp);
                    self.push_step(white, first, clip);
                }
                BORDER => {
                    let bt = if t != 0.0 { t } else { 1.0 };
                    if w <= bt || h <= bt {
                        continue;
                    }
                    let c = rgba(r, g, b, a);
                    self.shape_quad(x, y, w, h, aa, half, centre, rad, [2.0, bt], [c; 4], zuv, rotp);
                    self.push_step(white, first, clip);
                }
                IMAGE => {
                    let src = string(s0);
                    if src.is_empty() || w <= 0.0 || h <= 0.0 {
                        continue;
                    }
                    let Some((tex, iw, ih)) = self.picture(host, src) else { continue };
                    let (iw, ih) = (iw.max(1) as f32, ih.max(1) as f32);
                    let alpha = if a > 0.0 { a } else { 1.0 };
                    let c = rgba(255.0, 255.0, 255.0, alpha);
                    let round = rad.iter().any(|r| *r > 0.0);
                    let (fx, fy) = (flags & 8 != 0, flags & 16 != 0);
                    let mut piece = |me: &mut Renderer, px: f32, py: f32, pw: f32, ph: f32, u0: f32, v0: f32, u1: f32, v1: f32| {
                        // cut to the box (tiles reach past it)
                        let (cx0, cy0) = (px.max(x), py.max(y));
                        let (cx1, cy1) = ((px + pw).min(x + w), (py + ph).min(y + h));
                        if cx1 <= cx0 || cy1 <= cy0 {
                            return;
                        }
                        let lu = |xx: f32| u0 + (u1 - u0) * (xx - px) / pw;
                        let lv = |yy: f32| v0 + (v1 - v0) * (yy - py) / ph;
                        let (mut a0, mut a1, mut b0, mut b1) = (lu(cx0), lu(cx1), lv(cy0), lv(cy1));
                        if fx {
                            // mirrored in the box: the box's other side
                            let m0 = lu(x + w - (cx1 - x));
                            let m1 = lu(x + w - (cx0 - x));
                            a0 = m1;
                            a1 = m0;
                        }
                        if fy {
                            let m0 = lv(y + h - (cy1 - y));
                            let m1 = lv(y + h - (cy0 - y));
                            b0 = m1;
                            b1 = m0;
                        }
                        let uv = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
                        me.shape_quad(cx0, cy0, cx1 - cx0, cy1 - cy0, 0.0, half, centre, rad, [4.0, if round { 1.0 } else { 0.0 }], [c; 4], uv, rotp);
                    };
                    if let Some(ti) = tile {
                        let (tx0, ty0, tw, th) = (nums[ti], nums[ti + 1], nums[ti + 2], nums[ti + 3]);
                        if tw > 0.0 && th > 0.0 && (w / tw) * (h / th) < 20000.0 {
                            let mut ty = ty0;
                            while ty < y + h {
                                let mut tx = tx0;
                                while tx < x + w {
                                    piece(self, tx, ty, tw, th, 0.0, 0.0, 1.0, 1.0);
                                    tx += tw;
                                }
                                ty += th;
                            }
                        }
                    } else if let Some(ci) = crop {
                        piece(self, x, y, w, h, nums[ci], nums[ci + 1], nums[ci + 2], nums[ci + 3]);
                    } else {
                        // object-fit: cover
                        let sc = (w / iw).max(h / ih);
                        let (sw, sh) = (w / sc / iw, h / sc / ih);
                        piece(self, x, y, w, h, (1.0 - sw) / 2.0, (1.0 - sh) / 2.0, (1.0 + sw) / 2.0, (1.0 + sh) / 2.0);
                    }
                    self.push_step(tex, first, clip);
                }
                TEXT => {
                    let text = string(s0);
                    if text.is_empty() || t <= 0.0 {
                        continue;
                    }
                    let want = t * s;
                    let size = size_step(want);
                    let pad = (2.0 + size * 0.12).ceil() as i32;
                    let c = rgba(r, g, b, 1.0);
                    // digits one by one (counters, clocks, heights change every
                    // frame: ten glyphs kept instead of a new run each frame), the
                    // rest as runs between them
                    let mut pieces: Vec<(i32, i32, i32, i32, f32)> = Vec::new();
                    let mut total = 0.0f32;
                    let mut ok = true;
                    for piece in pieces_of(text) {
                        let run = TextRun { text: piece, family: string(s1), weight: string(s2), italic: flags & 256 != 0, size, spacing: ls * s * (size / want), rgb: [c[0], c[1], c[2]], pad };
                        match self.text_run(host, &run) {
                            Some(p) => {
                                total += p.4;
                                pieces.push(p);
                            }
                            None => {
                                ok = false;
                                break;
                            }
                        }
                    }
                    if !ok || pieces.is_empty() {
                        continue;
                    }
                    let f = want / size / s; // atlas pixels to game units
                    let tw = total * f;
                    // EVG placed the run by its own font's width: fit the run to
                    // that width (left-aligned lines start where EVG put them), as
                    // painter.js does; a big difference keeps the run's centre
                    let sx = if w > 0.0 && tw > 0.0 { w / tw } else { 1.0 };
                    let (sx, origin) = if (0.8..=1.25).contains(&sx) { (sx, x) } else { (1.0, if w > 0.0 { x + (w - tw) / 2.0 } else { x }) };
                    let inv = 1.0 / ATLAS as f32;
                    let ca = rgba(255.0, 255.0, 255.0, a);
                    let mut cum = 0.0f32;
                    for (ax, ay, aw, ah, adv) in pieces {
                        let left = origin + (cum - pad as f32) * f * sx;
                        cum += adv;
                        let (qw, qh) = (aw as f32 * f * sx, ah as f32 * f);
                        let top = y + h / 2.0 - qh / 2.0;
                        // half a texel in: smoothing never reaches the neighbours' texels
                        let (u0, v0, u1, v1) = ((ax as f32 + 0.5) * inv, (ay as f32 + 0.5) * inv, (ax + aw) as f32 * inv - 0.5 * inv, (ay + ah) as f32 * inv - 0.5 * inv);
                        self.shape_quad(left, top, qw, qh, 0.0, [qw / 2.0, qh / 2.0], [left + qw / 2.0, top + qh / 2.0], [0.0; 4], [4.0, 0.0], [ca; 4],
                            [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], rotp);
                    }
                    let atlas = self.atlas;
                    self.push_step(atlas, first, clip);
                }
                PATH | STROKE => {
                    if nx == 0 || e >= next {
                        continue;
                    }
                    let np = nums[e] as usize;
                    let pts_at = e + 1;
                    if pts_at + np + 1 > next {
                        continue;
                    }
                    let ne = nums[pts_at + np] as usize;
                    let ends_at = pts_at + np + 1;
                    if ends_at + ne > next {
                        continue;
                    }
                    let c = rgba(r, g, b, a);
                    let mut rings: Vec<(usize, usize)> = Vec::new();
                    let mut at = 0usize;
                    for ri in 0..ne {
                        let end = (nums[ends_at + ri] as usize).min(np);
                        if end > at + 1 {
                            rings.push((pts_at + at, pts_at + end));
                        }
                        at = end;
                    }
                    let turn = |pts: &mut Vec<f32>| {
                        if let Some((deg, cx, cy)) = rotp {
                            let (sn, co) = deg.to_radians().sin_cos();
                            for p in pts.chunks_mut(2) {
                                let (dx, dy) = (p[0] - cx, p[1] - cy);
                                p[0] = cx + dx * co - dy * sn;
                                p[1] = cy + dx * sn + dy * co;
                            }
                        }
                    };
                    let mut tmp = std::mem::take(&mut self.tmp);
                    if k == PATH {
                        let all_convex = rings.iter().all(|(p0, p1)| p1 - p0 >= 6 && tess::convex(&nums[*p0..*p1]));
                        if all_convex && (rings.len() == 1 || a >= 1.0) {
                            for (p0, p1) in rings.iter() {
                                tmp.clear();
                                tmp.extend_from_slice(&nums[*p0..*p1]);
                                turn(&mut tmp);
                                let b0 = self.verts.len() as u32;
                                for p in tmp.chunks(2) {
                                    self.verts.push(Vert { pos: [p[0], p[1]], color: c, ..Vert::default() });
                                }
                                let m = (tmp.len() / 2) as u32;
                                for q in 1..m.saturating_sub(1) {
                                    self.idx.extend_from_slice(&[b0, b0 + q, b0 + q + 1]);
                                }
                            }
                            self.push_step(white, first, clip);
                        } else {
                            let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
                            for (p0, p1) in rings.iter() {
                                if p1 - p0 < 6 {
                                    continue;
                                }
                                tmp.clear();
                                tmp.extend_from_slice(&nums[*p0..*p1]);
                                turn(&mut tmp);
                                let b0 = self.verts.len() as u32;
                                for p in tmp.chunks(2) {
                                    x0 = x0.min(p[0]); x1 = x1.max(p[0]);
                                    y0 = y0.min(p[1]); y1 = y1.max(p[1]);
                                    self.verts.push(Vert { pos: [p[0], p[1]], color: c, ..Vert::default() });
                                }
                                let m = (tmp.len() / 2) as u32;
                                for q in 1..m.saturating_sub(1) {
                                    self.idx.extend_from_slice(&[b0, b0 + q, b0 + q + 1]);
                                }
                            }
                            let count = self.idx.len() as u32 - first;
                            if count > 0 {
                                let cover = self.cover_quad(x0, y0, x1, y1, c);
                                self.steps.push(Step::Fill { first, count, cover, even_odd: flags & 32 != 0, clip });
                            }
                        }
                    } else {
                        let width = if t != 0.0 { t } else { 1.0 };
                        let seg = ((width * s * 0.5).ceil() as usize).clamp(3, 16) * 2;
                        let mut out: Vec<f32> = Vec::new();
                        for (p0, p1) in rings.iter() {
                            tmp.clear();
                            tmp.extend_from_slice(&nums[*p0..*p1]);
                            turn(&mut tmp);
                            tess::stroke(&tmp, false, width, seg, &mut out);
                        }
                        if !out.is_empty() {
                            self.solid_tris(&out, c);
                            if a >= 1.0 {
                                self.push_step(white, first, clip);
                            } else {
                                let count = self.idx.len() as u32 - first;
                                let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
                                for p in out.chunks(2) {
                                    x0 = x0.min(p[0]); x1 = x1.max(p[0]);
                                    y0 = y0.min(p[1]); y1 = y1.max(p[1]);
                                }
                                let cover = self.cover_quad(x0, y0, x1, y1, c);
                                self.steps.push(Step::Once { first, count, cover, clip });
                            }
                        }
                    }
                    self.tmp = tmp;
                }
                _ => {}
            }
        }
    }

    fn set_clip(&self, c: &Clip) {
        match self.port {
            None => gl::scissor(c[0], c[1], c[2], c[3]),
            Some(p) => {
                // moved into the port and cut to it
                let (x0, y0) = ((c[0] + p[0]).max(p[0]), (c[1] + p[1]).max(p[1]));
                let (x1, y1) = ((c[0] + p[0] + c[2]).min(p[0] + p[2]), (c[1] + p[1] + c[3]).min(p[1] + p[3]));
                gl::scissor(x0, y0, (x1 - x0).max(0), (y1 - y0).max(0));
            }
        }
    }

    /// The viewport `render` paints: the port, or the whole surface.
    fn set_viewport(&self, v: &View) {
        match self.port {
            Some(p) => gl::viewport(p[0], p[1], p[2], p[3]),
            None => gl::viewport(0, 0, v.width, v.height),
        }
    }

    /// The 2D state: blending premultiplied, no depth, the shape program and buffers.
    fn shape_state(&self, xf: [f32; 4], aa: f32) {
        gl::bind_framebuffer(self.fbo);
        gl::disable(gl::DEPTH_TEST);
        gl::disable(gl::CULL_FACE);
        gl::disable(gl::STENCIL_TEST);
        gl::enable(gl::BLEND);
        gl::blend_func(gl::ONE, gl::ONE_MINUS_SRC_ALPHA);
        gl::enable(gl::SCISSOR_TEST);
        gl::color_mask(true);
        gl::depth_mask(false);
        gl::use_program(self.shape);
        gl::uniform4f(self.shape_xf, xf[0], xf[1], xf[2], xf[3]);
        gl::uniform1f(self.shape_aa, aa);
        gl::uniform1i(self.shape_tex, 0);
        gl::active_texture(gl::TEXTURE0);
        gl::bind_vertex_array(self.vao);
        gl::bind_buffer(gl::ARRAY_BUFFER, self.vbo);
        gl::bind_buffer(gl::ELEMENT_ARRAY_BUFFER, self.ibo);
    }

    /// Paints one frame into the current framebuffer 0 (the host swaps it).
    /// `ptris` and `plights`: the scene's per-pixel lit meshes and their
    /// directional lights (rg_engine scene3d.rs), empty when there are none
    pub fn render(&mut self, host: &mut dyn Host, nums: &[f32], strings: &[String], tris: &[f32], ptris: &[f32], plights: &[f32], v: &View, background: [f32; 4]) {
        if !self.init() {
            return;
        }
        self.frame += 1;
        self.calls = 0;
        gl::pixel_store(gl::UNPACK_ALIGNMENT, 1);
        self.build(host, nums, strings, tris, ptris, v);
        self.vertex_count = self.verts.len() as u32;
        let s = v.scale * v.density;
        let aa = 1.0 / s.max(1e-3);
        let (wpx, hpx) = (v.width.max(1) as f32, v.height.max(1) as f32);
        let xf = [2.0 * s / wpx, -2.0 * s / hpx, 2.0 * v.x * v.density / wpx - 1.0, 1.0 - 2.0 * v.y * v.density / hpx];

        gl::bind_framebuffer(self.fbo);
        self.set_viewport(v);
        match self.port {
            // only the port is cleared (the other eye shares the framebuffer)
            Some(p) => {
                gl::enable(gl::SCISSOR_TEST);
                gl::scissor(p[0], p[1], p[2], p[3]);
            }
            None => gl::disable(gl::SCISSOR_TEST),
        }
        gl::color_mask(true);
        gl::depth_mask(true);
        gl::stencil_mask(0xff);
        gl::clear_color(background[0], background[1], background[2], background[3]);
        gl::clear_depth(1.0);
        gl::clear_stencil(0);
        gl::clear(gl::COLOR_BUFFER_BIT | gl::DEPTH_BUFFER_BIT | gl::STENCIL_BUFFER_BIT);

        // one upload for the frame
        gl::bind_vertex_array(self.vao);
        gl::bind_buffer(gl::ARRAY_BUFFER, self.vbo);
        let vb = unsafe { std::slice::from_raw_parts(self.verts.as_ptr() as *const u8, self.verts.len() * STRIDE as usize) };
        gl::buffer_data(gl::ARRAY_BUFFER, vb, gl::STREAM_DRAW);
        gl::bind_buffer(gl::ELEMENT_ARRAY_BUFFER, self.ibo);
        let ib = unsafe { std::slice::from_raw_parts(self.idx.as_ptr() as *const u8, self.idx.len() * 4) };
        gl::buffer_data(gl::ELEMENT_ARRAY_BUFFER, ib, gl::STREAM_DRAW);
        let has_tris = self.steps.iter().any(|s| matches!(s, Step::Tris { .. }));
        if self.steps.iter().any(|s| matches!(s, Step::Tris { phong: true, .. })) {
            gl::bind_vertex_array(self.phong_vao);
            gl::bind_buffer(gl::ARRAY_BUFFER, self.phong_vbo);
            let n = ptris.len() / 54 * 54;
            let pb = unsafe { std::slice::from_raw_parts(ptris.as_ptr() as *const u8, n * 4) };
            gl::buffer_data(gl::ARRAY_BUFFER, pb, gl::STREAM_DRAW);
        }
        if has_tris {
            gl::bind_vertex_array(self.tris_vao);
            gl::bind_buffer(gl::ARRAY_BUFFER, self.tris_vbo);
            let tb = unsafe { std::slice::from_raw_parts(tris.as_ptr() as *const u8, tris.len() * 4) };
            gl::buffer_data(gl::ARRAY_BUFFER, tb, gl::STREAM_DRAW);
        }

        self.shape_state(xf, aa);
        let steps = std::mem::take(&mut self.steps);
        let mut bound = 0u32;
        let mut depth_used = false;
        for st in steps.iter() {
            match st {
                Step::Draw { tex, first, count, clip } => {
                    self.set_clip(clip);
                    if *tex != bound {
                        gl::bind_texture(gl::TEXTURE_2D, *tex);
                        bound = *tex;
                    }
                    gl::draw_elements(gl::TRIANGLES, *count as i32, *first as usize * 4);
                    self.calls += 1;
                }
                Step::Fill { first, count, cover, even_odd, clip } => {
                    self.set_clip(clip);
                    if bound != self.white {
                        gl::bind_texture(gl::TEXTURE_2D, self.white);
                        bound = self.white;
                    }
                    gl::enable(gl::STENCIL_TEST);
                    gl::color_mask(false);
                    gl::stencil_func(gl::ALWAYS, 0, 0xff);
                    if *even_odd {
                        gl::stencil_op(gl::KEEP, gl::KEEP, gl::INVERT);
                    } else {
                        gl::stencil_op_separate(gl::FRONT, gl::KEEP, gl::KEEP, gl::INCR_WRAP);
                        gl::stencil_op_separate(gl::BACK, gl::KEEP, gl::KEEP, gl::DECR_WRAP);
                    }
                    gl::draw_elements(gl::TRIANGLES, *count as i32, *first as usize * 4);
                    gl::color_mask(true);
                    gl::stencil_func(gl::NOTEQUAL, 0, if *even_odd { 1 } else { 0xff });
                    gl::stencil_op(gl::ZERO, gl::ZERO, gl::ZERO);
                    gl::draw_elements(gl::TRIANGLES, 6, *cover as usize * 4);
                    gl::disable(gl::STENCIL_TEST);
                    self.calls += 2;
                }
                Step::Once { first, count, cover, clip } => {
                    self.set_clip(clip);
                    if bound != self.white {
                        gl::bind_texture(gl::TEXTURE_2D, self.white);
                        bound = self.white;
                    }
                    gl::enable(gl::STENCIL_TEST);
                    gl::stencil_func(gl::EQUAL, 0, 0xff);
                    gl::stencil_op(gl::KEEP, gl::KEEP, gl::INCR);
                    gl::draw_elements(gl::TRIANGLES, *count as i32, *first as usize * 4);
                    gl::color_mask(false);
                    gl::stencil_func(gl::ALWAYS, 0, 0xff);
                    gl::stencil_op(gl::ZERO, gl::ZERO, gl::ZERO);
                    gl::draw_elements(gl::TRIANGLES, 6, *cover as usize * 4);
                    gl::color_mask(true);
                    gl::disable(gl::STENCIL_TEST);
                    self.calls += 2;
                }
                Step::Tris { first, count, phong, clip } => {
                    self.set_clip(clip);
                    if depth_used {
                        // a second scene in one frame: its own depth
                        gl::depth_mask(true);
                        gl::clear(gl::DEPTH_BUFFER_BIT);
                    }
                    depth_used = true;
                    // solid faces (alpha 1) replace; see-through ones add their light
                    gl::enable(gl::BLEND);
                    gl::blend_func(gl::ONE, gl::ONE_MINUS_SRC_ALPHA);
                    gl::enable(gl::DEPTH_TEST);
                    gl::depth_func(gl::LEQUAL);
                    gl::depth_mask(true);
                    if *phong {
                        gl::use_program(self.phong);
                        gl::uniform4f(self.phong_xf, xf[0], xf[1], xf[2], xf[3]);
                        let nl = (plights.len().saturating_sub(4) / 8).min(4);
                        for i in 0..nl * 2 {
                            let a = &plights[i * 4..i * 4 + 4];
                            gl::uniform4f(self.phong_lt[i], a[0], a[1], a[2], a[3]);
                        }
                        gl::uniform1i(self.phong_nl, nl as i32);
                        let f = if plights.len() >= 4 { &plights[plights.len() - 4..] } else { &[0.0f32; 4][..] };
                        gl::uniform4f(self.phong_fog, f[0], f[1], f[2], 0.0);
                        gl::bind_vertex_array(self.phong_vao);
                        // the solid meshes first: replace (alpha 1)
                        gl::draw_arrays(gl::TRIANGLES, 0, (ptris.len() / 54 * 3) as i32);
                        self.calls += 1;
                    }
                    if *count > 0 {
                        gl::use_program(self.tris_prog);
                        gl::uniform4f(self.tris_xf, xf[0], xf[1], xf[2], xf[3]);
                        gl::bind_vertex_array(self.tris_vao);
                        gl::draw_arrays(gl::TRIANGLES, *first, *count);
                        self.calls += 1;
                    }
                    self.shape_state(xf, aa);
                    bound = 0;
                }
                Step::Globes { from, to, clip } => {
                    // the host sets its own attributes: on the default array, not ours
                    gl::bind_vertex_array(0);
                    let out = host.globes(nums, strings, *from, *to, s);
                    // the host drew into its own framebuffer: back to ours
                    self.set_viewport(v);
                    self.shape_state(xf, aa);
                    bound = 0;
                    if let Some(gb) = out {
                        self.set_clip(clip);
                        let (v0, v1) = if gb.flip { (gb.v1, 0.0) } else { (0.0, gb.v1) };
                        self.verts.clear();
                        self.idx.clear();
                        let c = [255u8; 4];
                        let uv = [[0.0, v0], [gb.u1, v0], [gb.u1, v1], [0.0, v1]];
                        self.shape_quad(gb.x, gb.y, gb.w, gb.h, 0.0, [0.0; 2], [0.0; 2], [0.0; 4], [4.0, 0.0], [c; 4], uv, None);
                        // a small draw of its own (the frame's buffer is in use)
                        let vb = unsafe { std::slice::from_raw_parts(self.verts.as_ptr() as *const u8, 4 * STRIDE as usize) };
                        self.globe_quad(vb, gb.tex);
                        self.calls += 1;
                    }
                }
            }
        }
        self.steps = steps;
        gl::disable(gl::SCISSOR_TEST);
        gl::bind_vertex_array(0);
        self.evict();
    }

    /// Draws four vertices from a buffer of their own (globes come mid-frame).
    fn globe_quad(&mut self, vb: &[u8], tex: u32) {
        thread_local! {
            static QUAD: std::cell::Cell<(u32, u32, u32)> = const { std::cell::Cell::new((0, 0, 0)) };
        }
        let (mut vao, mut vbo, mut ibo) = QUAD.with(|q| q.get());
        if vao == 0 {
            vao = gl::create_vertex_array();
            gl::bind_vertex_array(vao);
            vbo = gl::create_buffer();
            ibo = gl::create_buffer();
            gl::bind_buffer(gl::ARRAY_BUFFER, vbo);
            gl::bind_buffer(gl::ELEMENT_ARRAY_BUFFER, ibo);
            let idx: [u32; 6] = [0, 1, 2, 0, 2, 3];
            let ib = unsafe { std::slice::from_raw_parts(idx.as_ptr() as *const u8, 24) };
            gl::buffer_data(gl::ELEMENT_ARRAY_BUFFER, ib, gl::STATIC_DRAW);
            let attrs: [(u32, i32, u32, bool, usize); 7] = [
                (0, 2, gl::FLOAT, false, 0),
                (1, 2, gl::FLOAT, false, 8),
                (2, 2, gl::FLOAT, false, 16),
                (3, 2, gl::FLOAT, false, 24),
                (4, 4, gl::FLOAT, false, 32),
                (5, 2, gl::FLOAT, false, 48),
                (6, 4, gl::UNSIGNED_BYTE, true, 56),
            ];
            for (i, n, t, norm, off) in attrs {
                gl::enable_attrib(i);
                gl::attrib_pointer(i, n, t, norm, STRIDE, off);
            }
            QUAD.with(|q| q.set((vao, vbo, ibo)));
        }
        gl::bind_vertex_array(vao);
        gl::bind_buffer(gl::ARRAY_BUFFER, vbo);
        gl::buffer_data(gl::ARRAY_BUFFER, vb, gl::STREAM_DRAW);
        gl::bind_texture(gl::TEXTURE_2D, tex);
        gl::draw_elements(gl::TRIANGLES, 6, 0);
        // back to the frame's buffers
        gl::bind_vertex_array(self.vao);
        gl::bind_buffer(gl::ARRAY_BUFFER, self.vbo);
        gl::bind_buffer(gl::ELEMENT_ARRAY_BUFFER, self.ibo);
    }

    // ---- VR (crates/rg_engine/src/xr.rs) ----

    /// VR: paints the frame's draw stream (the game's 2D view, and its 3D
    /// when the game is not in VR) into the panel's texture, transparent
    /// where nothing is: `v.width` × `v.height` pixels.
    pub fn render_panel(&mut self, host: &mut dyn Host, nums: &[f32], strings: &[String], tris: &[f32], v: &View) -> bool {
        if !self.init() {
            return false;
        }
        let (w, h) = (v.width.max(1), v.height.max(1));
        match self.panel {
            Some((_, _, _, pw, ph)) if pw == w && ph == h => {}
            old => {
                if let Some((tex, fbo, rb, _, _)) = old {
                    gl::delete_texture(tex);
                    gl::delete_framebuffer(fbo);
                    gl::delete_renderbuffer(rb);
                }
                let tex = gl::create_texture();
                gl::bind_texture(gl::TEXTURE_2D, tex);
                gl::tex_image(w, h, None);
                Self::tex_params();
                let fbo = gl::create_framebuffer();
                gl::bind_framebuffer(fbo);
                gl::framebuffer_texture(tex);
                let rb = gl::create_depth_stencil(w, h);
                if !gl::framebuffer_ok() {
                    self.error = "VR panel framebuffer".to_string();
                }
                gl::bind_framebuffer(0);
                self.panel = Some((tex, fbo, rb, w, h));
            }
        }
        let (_, fbo, _, _, _) = self.panel.unwrap();
        self.fbo = fbo;
        self.render(host, nums, strings, tris, &[], &[], v, [0.0, 0.0, 0.0, 0.0]);
        self.fbo = 0;
        gl::bind_framebuffer(0);
        true
    }

    /// VR: paints one eye into framebuffer `fbo` at `rect` (x, y, w, h in
    /// pixels, from the bottom left): `tris` depth-tested (the engine's
    /// triangles in the eye's units, `units` = their width and height), the
    /// panel at its clip-space corners (top left, top right, bottom right,
    /// bottom left), then `over` (the controllers' rays) over everything.
    ///
    /// With `stream` (a scene with planets, stars or particle runs: the eye's
    /// own draw stream, `tris` its triangles in it) the stream is painted
    /// into `rect` through its view instead, then the panel and `over`.
    #[allow(clippy::too_many_arguments)]
    pub fn render_eye(&mut self, fbo: u32, rect: [i32; 4], units: (f32, f32), tris: &[f32], panel: Option<[[f32; 4]; 4]>, over: &[f32], background: [f32; 4], stream: Option<EyeStream>) {
        if !self.init() {
            return;
        }
        let painted = match stream {
            Some(es) => {
                self.fbo = fbo;
                self.port = Some(rect);
                let v = View { width: rect[2], height: rect[3], ..es.view };
                self.render(es.host, es.nums, es.strings, tris, &[], &[], &v, background);
                self.port = None;
                self.fbo = 0;
                true
            }
            None => false,
        };
        if self.panel_prog == 0 {
            let mut err = String::new();
            self.panel_prog = program(shaders::PANEL_VS, shaders::PANEL_FS, &mut err);
            if self.panel_prog == 0 {
                self.error = err;
            }
            self.panel_vao = gl::create_vertex_array();
            gl::bind_vertex_array(self.panel_vao);
            self.panel_vbo = gl::create_buffer();
            gl::bind_buffer(gl::ARRAY_BUFFER, self.panel_vbo);
            gl::enable_attrib(0);
            gl::attrib_pointer(0, 4, gl::FLOAT, false, 24, 0);
            gl::enable_attrib(1);
            gl::attrib_pointer(1, 2, gl::FLOAT, false, 24, 16);
            gl::bind_vertex_array(0);
        }
        self.calls = 0;
        gl::bind_framebuffer(fbo);
        gl::viewport(rect[0], rect[1], rect[2], rect[3]);
        gl::enable(gl::SCISSOR_TEST);
        gl::scissor(rect[0], rect[1], rect[2], rect[3]);
        gl::color_mask(true);
        gl::depth_mask(true);
        if !painted {
            gl::clear_color(background[0], background[1], background[2], background[3]);
            gl::clear_depth(1.0);
            gl::clear(gl::COLOR_BUFFER_BIT | gl::DEPTH_BUFFER_BIT);
        }
        gl::disable(gl::STENCIL_TEST);
        gl::disable(gl::CULL_FACE);
        gl::enable(gl::BLEND);
        gl::blend_func(gl::ONE, gl::ONE_MINUS_SRC_ALPHA);
        let xf = [2.0 / units.0.max(1e-3), -2.0 / units.1.max(1e-3), -1.0, 1.0];
        let tris_pass = |r: &mut Renderer, t: &[f32], depth: bool| {
            if t.len() < 18 {
                return;
            }
            if depth {
                gl::enable(gl::DEPTH_TEST);
                gl::depth_func(gl::LEQUAL);
                gl::depth_mask(true);
            } else {
                gl::disable(gl::DEPTH_TEST);
                gl::depth_mask(false);
            }
            gl::use_program(r.tris_prog);
            gl::uniform4f(r.tris_xf, xf[0], xf[1], xf[2], xf[3]);
            gl::bind_vertex_array(r.tris_vao);
            gl::bind_buffer(gl::ARRAY_BUFFER, r.tris_vbo);
            let tb = unsafe { std::slice::from_raw_parts(t.as_ptr() as *const u8, t.len() * 4) };
            gl::buffer_data(gl::ARRAY_BUFFER, tb, gl::STREAM_DRAW);
            gl::draw_arrays(gl::TRIANGLES, 0, (t.len() / 6) as i32);
            r.calls += 1;
        };
        if !painted {
            tris_pass(self, tris, true);
        }
        if let (Some(c), Some((tex, _, _, _, _))) = (panel, self.panel) {
            if self.panel_prog != 0 {
                gl::disable(gl::DEPTH_TEST);
                gl::depth_mask(false);
                // two triangles, texture v = 1 at the top (a framebuffer's rows go up)
                let uv = [[0.0f32, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0]];
                let mut q: Vec<f32> = Vec::with_capacity(36);
                for &k in [0usize, 1, 2, 0, 2, 3].iter() {
                    q.extend_from_slice(&c[k]);
                    q.extend_from_slice(&uv[k]);
                }
                gl::use_program(self.panel_prog);
                gl::active_texture(gl::TEXTURE0);
                gl::bind_texture(gl::TEXTURE_2D, tex);
                gl::bind_vertex_array(self.panel_vao);
                gl::bind_buffer(gl::ARRAY_BUFFER, self.panel_vbo);
                let qb = unsafe { std::slice::from_raw_parts(q.as_ptr() as *const u8, q.len() * 4) };
                gl::buffer_data(gl::ARRAY_BUFFER, qb, gl::STREAM_DRAW);
                gl::draw_arrays(gl::TRIANGLES, 0, 6);
                self.calls += 1;
            }
        }
        tris_pass(self, over, false);
        gl::disable(gl::DEPTH_TEST);
        gl::disable(gl::SCISSOR_TEST);
        gl::depth_mask(true);
        gl::bind_vertex_array(0);
    }

    /// One line for the log: draw calls, vertices, pictures and text runs kept.
    pub fn stats(&self) -> String {
        format!("gl: {} calls, {} verts, {} pictures ({} MB), {} text runs", self.calls, self.vertex_count, self.pics.len(), self.pic_bytes / (1024 * 1024), self.runs.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct NoHost;
    impl Host for NoHost {
        fn image(&mut self, _p: &str) -> Img { Img::Ready(10, 10) }
        fn text_measure(&mut self, run: &TextRun) -> Option<(f32, f32, f32)> { Some((run.text.len() as f32 * run.size * 0.5, -run.size * 0.8, run.size * 0.2)) }
        fn text_draw(&mut self, _r: &TextRun, _x: i32, _y: i32, _w: i32, _h: i32) -> bool { true }
        fn globes(&mut self, _n: &[f32], _s: &[String], _f: usize, _t: usize, _px: f32) -> Option<Globes> { None }
    }

    fn cmd(kind: f32, x: f32, y: f32, w: f32, h: f32, a: f32, extra: &[f32], flags: f32) -> Vec<f32> {
        let mut c = vec![kind, x, y, w, h, 255.0, 0.0, 0.0, a, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, flags, 0.0, -1.0, -1.0, 0.0, extra.len() as f32];
        c.extend_from_slice(extra);
        c
    }

    fn view() -> View {
        View { scale: 1.0, x: 0.0, y: 0.0, w: 360.0, h: 640.0, density: 2.0, width: 720, height: 1280 }
    }

    #[test]
    fn boxes_and_text_batch_into_few_steps() {
        let mut r = Renderer::new();
        let mut nums = Vec::new();
        for k in 0..50 {
            nums.extend(cmd(0.0, k as f32, 0.0, 10.0, 10.0, 1.0, &[], 0.0));
        }
        let mut t = cmd(3.0, 0.0, 0.0, 100.0, 20.0, 1.0, &[], 0.0);
        t[13] = 16.0;
        nums.extend(t);
        nums.extend(cmd(0.0, 0.0, 30.0, 10.0, 10.0, 1.0, &[], 0.0));
        let strings = vec!["Hei".to_string()];
        r.render(&mut NoHost, &nums, &strings, &[], &[], &[], &view(), [0.0, 0.0, 0.0, 1.0]);
        // 50 boxes, the text (atlas) and a box: the boxes sample no texture, one draw
        assert_eq!(r.steps.len(), 1);
        assert_eq!(r.calls, 1);
        assert_eq!(r.runs.len(), 1);
    }

    #[test]
    fn clips_split_and_paths_use_the_stencil_when_needed() {
        let mut r = Renderer::new();
        let mut nums = Vec::new();
        nums.extend(cmd(4.0, 0.0, 0.0, 100.0, 100.0, 1.0, &[], 0.0));
        nums.extend(cmd(0.0, 0.0, 0.0, 10.0, 10.0, 1.0, &[], 0.0));
        nums.extend(cmd(5.0, 0.0, 0.0, 0.0, 0.0, 1.0, &[], 0.0));
        // a convex triangle: plain; an arrow (a dent): the stencil
        nums.extend(cmd(6.0, 0.0, 0.0, 0.0, 0.0, 1.0, &[6.0, 0.0, 0.0, 10.0, 0.0, 0.0, 10.0, 1.0, 6.0], 0.0));
        nums.extend(cmd(6.0, 0.0, 0.0, 0.0, 0.0, 1.0, &[8.0, 0.0, 0.0, 10.0, 5.0, 0.0, 10.0, 3.0, 5.0, 1.0, 8.0], 0.0));
        let tris = vec![0.0f32; 6 * 3];
        nums.extend(cmd(9.0, 0.0, 18.0, 0.0, 0.0, 1.0, &[], 0.0));
        r.render(&mut NoHost, &nums, &[], &tris, &[], &[], &view(), [0.0; 4]);
        assert!(matches!(r.steps[0], Step::Draw { clip: [0, 1080, 200, 200], .. }));
        assert!(matches!(r.steps[1], Step::Draw { .. }));
        assert!(matches!(r.steps[2], Step::Fill { even_odd: false, .. }));
        assert!(matches!(r.steps[3], Step::Tris { first: 0, count: 3, phong: false, .. }));
    }

    #[test]
    fn a_scene_of_only_per_pixel_lit_meshes_still_gets_its_layer() {
        let mut r = Renderer::new();
        // the scene's layer with w 1: its faces are all in ptris (one triangle, 18 floats a corner)
        let nums = cmd(9.0, 0.0, 0.0, 1.0, 0.0, 1.0, &[], 0.0);
        let ptris = vec![0.5f32; 18 * 3];
        let plights = [0.0, 1.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0];
        r.render(&mut NoHost, &nums, &[], &[], &ptris, &plights, &view(), [0.0; 4]);
        assert_eq!(r.steps.len(), 1);
        assert!(matches!(r.steps[0], Step::Tris { count: 0, phong: true, .. }));
    }

    #[test]
    fn digits_are_pieces_of_their_own() {
        assert_eq!(pieces_of("Lennä"), vec!["Lennä"]);
        assert_eq!(pieces_of("Korkeus 12.5 km"), vec!["Korkeus ", "1", "2", ".", "5", " km"]);
        assert_eq!(pieces_of("90"), vec!["9", "0"]);
    }

    #[test]
    fn sizes_step_so_animated_text_reuses_runs() {
        assert_eq!(size_step(12.3), 12.5);
        assert_eq!(size_step(40.0), size_step(40.3));
        assert!((size_step(100.0) - 100.0).abs() < 2.5);
    }
}
