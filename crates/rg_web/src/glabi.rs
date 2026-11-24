// SPDX-License-Identifier: AGPL-3.0-or-later
// The page paints with WebGL2 through crates/rg_gl (?gl=1): GL calls are
// imports of module "gl", pictures, text runs and globes of module "rghost"
// (web/js/glhost.js answers both). Shared with crates/rg_web_dom.

mod rghost {
    #[link(wasm_import_module = "rghost")]
    extern "C" {
        pub fn image(p: *const u8, n: usize) -> i32;
        pub fn text_measure(tp: *const u8, tn: usize, fp: *const u8, fl: usize, wp: *const u8, wn: usize, italic: i32, size: f32, spacing: f32, out: *mut f32) -> i32;
        pub fn text_draw(tp: *const u8, tn: usize, fp: *const u8, fl: usize, wp: *const u8, wn: usize, italic: i32, size: f32, spacing: f32,
            r: i32, g: i32, b: i32, pad: i32, x: i32, y: i32, w: i32, h: i32) -> i32;
        pub fn globes(from: usize, to: usize, px: f32, out: *mut f32) -> i32;
    }
}

struct WebGlHost;

impl rg_gl::Host for WebGlHost {
    fn image(&mut self, path: &str) -> rg_gl::Img {
        let r = unsafe { rghost::image(path.as_ptr(), path.len()) };
        match r {
            -1 => rg_gl::Img::Pending,
            r if r < 0 => rg_gl::Img::Failed,
            r => rg_gl::Img::Ready((r as u32) >> 16, (r as u32) & 0xffff),
        }
    }
    fn text_measure(&mut self, run: &rg_gl::TextRun) -> Option<(f32, f32, f32)> {
        let mut out = [0f32; 3];
        let ok = unsafe {
            rghost::text_measure(run.text.as_ptr(), run.text.len(), run.family.as_ptr(), run.family.len(), run.weight.as_ptr(), run.weight.len(),
                run.italic as i32, run.size, run.spacing, out.as_mut_ptr())
        };
        if ok != 0 { Some((out[0], out[1], out[2])) } else { None }
    }
    fn text_draw(&mut self, run: &rg_gl::TextRun, x: i32, y: i32, w: i32, h: i32) -> bool {
        unsafe {
            rghost::text_draw(run.text.as_ptr(), run.text.len(), run.family.as_ptr(), run.family.len(), run.weight.as_ptr(), run.weight.len(),
                run.italic as i32, run.size, run.spacing, run.rgb[0] as i32, run.rgb[1] as i32, run.rgb[2] as i32, run.pad, x, y, w, h) != 0
        }
    }
    fn globes(&mut self, _nums: &[f32], _strings: &[String], from: usize, to: usize, px: f32) -> Option<rg_gl::Globes> {
        let mut o = [0f32; 8];
        if unsafe { rghost::globes(from, to, px, o.as_mut_ptr()) } == 0 {
            return None;
        }
        Some(rg_gl::Globes { tex: o[0] as u32, x: o[1], y: o[2], w: o[3], h: o[4], u1: o[5], v1: o[6], flip: o[7] > 0.5 })
    }
}

thread_local! {
    static GL: RefCell<rg_gl::Renderer> = RefCell::new(rg_gl::Renderer::new());
}

/// on: the page paints everything with rg_gl (3D as triangles placed by layer commands)
#[no_mangle]
pub extern "C" fn rg_gl_all(on: i32) {
    with(|e| {
        e.gl_all = on != 0;
        e.gl3d = on != 0 || e.gl3d;
    })
}

/// Paints the last frame into the page's WebGL2 canvas (width × height
/// pixels, `dpr` pixels per CSS pixel); 1 when it worked.
#[no_mangle]
pub extern "C" fn rg_gl_frame(width: i32, height: i32, dpr: f64, r: f32, g: f32, b: f32) -> i32 {
    with(|e| {
        GL.with(|gl| {
            let mut gl = gl.borrow_mut();
            let v = rg_gl::View { scale: e.scale as f32, x: e.off_x as f32, y: e.off_y as f32, w: e.ui.width as f32, h: e.ui.height as f32, density: dpr as f32, width, height };
            gl.render(&mut WebGlHost, &e.draw.nums, &e.draw.strings, &e.scene.tris, &e.scene.ptris, &e.scene.plights, &v, [r, g, b, 1.0]);
            gl.ok() as i32
        })
    })
}

/// The renderer's numbers for the debug line (into the result: rg_result_ptr/len).
#[no_mangle]
pub extern "C" fn rg_gl_stats() -> usize {
    let s = GL.with(|gl| gl.borrow().stats());
    let n = s.len();
    RESULT.with(|b| *b.borrow_mut() = s.into_bytes());
    n
}
