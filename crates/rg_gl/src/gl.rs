// SPDX-License-Identifier: AGPL-3.0-or-later
//! The few OpenGL ES 3.0 calls the renderer makes, behind one small API:
//! on Android they are libGLESv3's own functions; in WebAssembly they are
//! imports of the module "gl" that web/js/glhost.js answers with WebGL2;
//! elsewhere (tests, cargo check on a desktop) they do nothing.

#![allow(clippy::too_many_arguments)]

pub const TRIANGLES: u32 = 0x0004;
pub const ARRAY_BUFFER: u32 = 0x8892;
pub const ELEMENT_ARRAY_BUFFER: u32 = 0x8893;
pub const STREAM_DRAW: u32 = 0x88E0;
pub const STATIC_DRAW: u32 = 0x88E4;
pub const FLOAT: u32 = 0x1406;
pub const UNSIGNED_BYTE: u32 = 0x1401;
pub const UNSIGNED_INT: u32 = 0x1405;
pub const VERTEX_SHADER: u32 = 0x8B31;
pub const FRAGMENT_SHADER: u32 = 0x8B30;
pub const TEXTURE_2D: u32 = 0x0DE1;
pub const TEXTURE0: u32 = 0x84C0;
pub const RGBA: u32 = 0x1908;
pub const RGBA8: u32 = 0x8058;
pub const TEXTURE_MIN_FILTER: u32 = 0x2801;
pub const TEXTURE_MAG_FILTER: u32 = 0x2800;
pub const TEXTURE_WRAP_S: u32 = 0x2802;
pub const TEXTURE_WRAP_T: u32 = 0x2803;
pub const LINEAR: i32 = 0x2601;
pub const NEAREST: i32 = 0x2600;
pub const CLAMP_TO_EDGE: i32 = 0x812F;
pub const BLEND: u32 = 0x0BE2;
pub const DEPTH_TEST: u32 = 0x0B71;
pub const STENCIL_TEST: u32 = 0x0B90;
pub const SCISSOR_TEST: u32 = 0x0C11;
pub const CULL_FACE: u32 = 0x0B44;
pub const ONE: u32 = 1;
pub const ONE_MINUS_SRC_ALPHA: u32 = 0x0303;
pub const COLOR_BUFFER_BIT: u32 = 0x4000;
pub const DEPTH_BUFFER_BIT: u32 = 0x0100;
pub const STENCIL_BUFFER_BIT: u32 = 0x0400;
pub const LEQUAL: u32 = 0x0203;
pub const ALWAYS: u32 = 0x0207;
pub const EQUAL: u32 = 0x0202;
pub const NOTEQUAL: u32 = 0x0205;
pub const KEEP: u32 = 0x1E00;
pub const ZERO: u32 = 0;
pub const INVERT: u32 = 0x150A;
pub const INCR: u32 = 0x1E02;
pub const INCR_WRAP: u32 = 0x8507;
pub const DECR_WRAP: u32 = 0x8508;
pub const FRONT: u32 = 0x0404;
pub const BACK: u32 = 0x0405;
pub const FRAMEBUFFER: u32 = 0x8D40;
pub const UNPACK_ALIGNMENT: u32 = 0x0CF5;
pub const RENDERBUFFER: u32 = 0x8D41;
pub const COLOR_ATTACHMENT0: u32 = 0x8CE0;
pub const DEPTH_STENCIL_ATTACHMENT: u32 = 0x821A;
pub const DEPTH24_STENCIL8: u32 = 0x88F0;
pub const FRAMEBUFFER_COMPLETE: u32 = 0x8CD5;

#[cfg(target_os = "android")]
mod sys {
    #[link(name = "GLESv3")]
    extern "C" {
        pub fn glCreateShader(t: u32) -> u32;
        pub fn glShaderSource(s: u32, n: i32, src: *const *const u8, len: *const i32);
        pub fn glCompileShader(s: u32);
        pub fn glGetShaderiv(s: u32, p: u32, out: *mut i32);
        pub fn glGetShaderInfoLog(s: u32, max: i32, len: *mut i32, log: *mut u8);
        pub fn glCreateProgram() -> u32;
        pub fn glAttachShader(p: u32, s: u32);
        pub fn glLinkProgram(p: u32);
        pub fn glGetProgramiv(p: u32, q: u32, out: *mut i32);
        pub fn glGetProgramInfoLog(p: u32, max: i32, len: *mut i32, log: *mut u8);
        pub fn glGetUniformLocation(p: u32, name: *const u8) -> i32;
        pub fn glUseProgram(p: u32);
        pub fn glUniform1i(l: i32, v: i32);
        pub fn glUniform1f(l: i32, v: f32);
        pub fn glUniform4f(l: i32, a: f32, b: f32, c: f32, d: f32);
        pub fn glUniform2f(l: i32, a: f32, b: f32);
        pub fn glUniform3f(l: i32, a: f32, b: f32, c: f32);
        pub fn glGenBuffers(n: i32, out: *mut u32);
        pub fn glBindBuffer(t: u32, b: u32);
        pub fn glBufferData(t: u32, size: isize, data: *const u8, usage: u32);
        pub fn glGenVertexArrays(n: i32, out: *mut u32);
        pub fn glBindVertexArray(a: u32);
        pub fn glEnableVertexAttribArray(i: u32);
        pub fn glVertexAttribPointer(i: u32, size: i32, t: u32, norm: u8, stride: i32, off: *const u8);
        pub fn glDrawElements(mode: u32, count: i32, t: u32, off: *const u8);
        pub fn glDrawArrays(mode: u32, first: i32, count: i32);
        pub fn glGenTextures(n: i32, out: *mut u32);
        pub fn glDeleteTextures(n: i32, t: *const u32);
        pub fn glBindTexture(t: u32, tex: u32);
        pub fn glActiveTexture(u: u32);
        pub fn glTexImage2D(t: u32, level: i32, ifmt: i32, w: i32, h: i32, border: i32, fmt: u32, ty: u32, px: *const u8);
        pub fn glTexSubImage2D(t: u32, level: i32, x: i32, y: i32, w: i32, h: i32, fmt: u32, ty: u32, px: *const u8);
        pub fn glTexParameteri(t: u32, p: u32, v: i32);
        pub fn glPixelStorei(p: u32, v: i32);
        pub fn glBindFramebuffer(t: u32, f: u32);
        pub fn glViewport(x: i32, y: i32, w: i32, h: i32);
        pub fn glScissor(x: i32, y: i32, w: i32, h: i32);
        pub fn glEnable(c: u32);
        pub fn glDisable(c: u32);
        pub fn glBlendFunc(s: u32, d: u32);
        pub fn glClearColor(r: f32, g: f32, b: f32, a: f32);
        pub fn glClearDepthf(d: f32);
        pub fn glClearStencil(s: i32);
        pub fn glClear(m: u32);
        pub fn glColorMask(r: u8, g: u8, b: u8, a: u8);
        pub fn glDepthMask(f: u8);
        pub fn glDepthFunc(f: u32);
        pub fn glStencilFunc(f: u32, r: i32, m: u32);
        pub fn glStencilOp(a: u32, b: u32, c: u32);
        pub fn glStencilOpSeparate(face: u32, a: u32, b: u32, c: u32);
        pub fn glStencilMask(m: u32);
        pub fn glGetError() -> u32;
        pub fn glGenFramebuffers(n: i32, out: *mut u32);
        pub fn glDeleteFramebuffers(n: i32, f: *const u32);
        pub fn glFramebufferTexture2D(t: u32, att: u32, tt: u32, tex: u32, level: i32);
        pub fn glGenRenderbuffers(n: i32, out: *mut u32);
        pub fn glDeleteRenderbuffers(n: i32, r: *const u32);
        pub fn glBindRenderbuffer(t: u32, r: u32);
        pub fn glRenderbufferStorage(t: u32, fmt: u32, w: i32, h: i32);
        pub fn glFramebufferRenderbuffer(t: u32, att: u32, rt: u32, r: u32);
        pub fn glCheckFramebufferStatus(t: u32) -> u32;
        pub fn glGetString(name: u32) -> *const u8;
        pub fn glGetIntegerv(name: u32, out: *mut i32);
        pub fn glInvalidateFramebuffer(t: u32, n: i32, att: *const u32);
    }
    #[link(name = "EGL")]
    extern "C" {
        pub fn eglGetProcAddress(name: *const u8) -> *const core::ffi::c_void;
    }
}

#[cfg(target_os = "android")]
mod api {
    use super::sys::*;
    pub fn create_shader(t: u32) -> u32 { unsafe { glCreateShader(t) } }
    pub fn shader_source(s: u32, src: &str) {
        let p = src.as_ptr();
        let n = src.len() as i32;
        unsafe { glShaderSource(s, 1, &p, &n) }
    }
    pub fn compile_shader(s: u32) { unsafe { glCompileShader(s) } }
    pub fn shader_ok(s: u32) -> bool {
        let mut v = 0;
        unsafe { glGetShaderiv(s, 0x8B81, &mut v) };
        v != 0
    }
    pub fn shader_log(s: u32) -> String {
        let mut buf = vec![0u8; 2048];
        let mut n = 0;
        unsafe { glGetShaderInfoLog(s, 2048, &mut n, buf.as_mut_ptr()) };
        buf.truncate(n.max(0) as usize);
        String::from_utf8_lossy(&buf).into_owned()
    }
    pub fn create_program() -> u32 { unsafe { glCreateProgram() } }
    pub fn attach_shader(p: u32, s: u32) { unsafe { glAttachShader(p, s) } }
    pub fn link_program(p: u32) { unsafe { glLinkProgram(p) } }
    pub fn program_ok(p: u32) -> bool {
        let mut v = 0;
        unsafe { glGetProgramiv(p, 0x8B82, &mut v) };
        v != 0
    }
    pub fn program_log(p: u32) -> String {
        let mut buf = vec![0u8; 2048];
        let mut n = 0;
        unsafe { glGetProgramInfoLog(p, 2048, &mut n, buf.as_mut_ptr()) };
        buf.truncate(n.max(0) as usize);
        String::from_utf8_lossy(&buf).into_owned()
    }
    pub fn uniform_location(p: u32, name: &str) -> i32 {
        let mut z = name.as_bytes().to_vec();
        z.push(0);
        unsafe { glGetUniformLocation(p, z.as_ptr()) }
    }
    pub fn use_program(p: u32) { unsafe { glUseProgram(p) } }
    pub fn uniform1i(l: i32, v: i32) { unsafe { glUniform1i(l, v) } }
    pub fn uniform1f(l: i32, v: f32) { unsafe { glUniform1f(l, v) } }
    pub fn uniform4f(l: i32, a: f32, b: f32, c: f32, d: f32) { unsafe { glUniform4f(l, a, b, c, d) } }
    /// a float, vec2, vec3 or vec4 uniform from 1 to 4 numbers
    pub fn uniformn(l: i32, v: &[f32]) {
        unsafe {
            match v.len() {
                1 => glUniform1f(l, v[0]),
                2 => glUniform2f(l, v[0], v[1]),
                3 => glUniform3f(l, v[0], v[1], v[2]),
                4 => glUniform4f(l, v[0], v[1], v[2], v[3]),
                _ => {}
            }
        }
    }
    pub fn create_buffer() -> u32 {
        let mut b = 0;
        unsafe { glGenBuffers(1, &mut b) };
        b
    }
    pub fn bind_buffer(t: u32, b: u32) { unsafe { glBindBuffer(t, b) } }
    pub fn buffer_data(t: u32, data: &[u8], usage: u32) { unsafe { glBufferData(t, data.len() as isize, data.as_ptr(), usage) } }
    pub fn create_vertex_array() -> u32 {
        let mut a = 0;
        unsafe { glGenVertexArrays(1, &mut a) };
        a
    }
    pub fn bind_vertex_array(a: u32) { unsafe { glBindVertexArray(a) } }
    pub fn enable_attrib(i: u32) { unsafe { glEnableVertexAttribArray(i) } }
    pub fn attrib_pointer(i: u32, size: i32, t: u32, norm: bool, stride: i32, off: usize) {
        unsafe { glVertexAttribPointer(i, size, t, norm as u8, stride, off as *const u8) }
    }
    pub fn draw_elements(mode: u32, count: i32, off: usize) { unsafe { glDrawElements(mode, count, super::UNSIGNED_INT, off as *const u8) } }
    pub fn draw_arrays(mode: u32, first: i32, count: i32) { unsafe { glDrawArrays(mode, first, count) } }
    pub fn create_texture() -> u32 {
        let mut t = 0;
        unsafe { glGenTextures(1, &mut t) };
        t
    }
    pub fn delete_texture(t: u32) { unsafe { glDeleteTextures(1, &t) } }
    pub fn bind_texture(t: u32, tex: u32) { unsafe { glBindTexture(t, tex) } }
    pub fn active_texture(u: u32) { unsafe { glActiveTexture(u) } }
    pub fn tex_image(w: i32, h: i32, px: Option<&[u8]>) {
        let p = px.map(|p| p.as_ptr()).unwrap_or(std::ptr::null());
        unsafe { glTexImage2D(super::TEXTURE_2D, 0, super::RGBA8 as i32, w, h, 0, super::RGBA, super::UNSIGNED_BYTE, p) }
    }
    pub fn tex_sub_image(x: i32, y: i32, w: i32, h: i32, px: &[u8]) {
        unsafe { glTexSubImage2D(super::TEXTURE_2D, 0, x, y, w, h, super::RGBA, super::UNSIGNED_BYTE, px.as_ptr()) }
    }
    pub fn tex_parameter(p: u32, v: i32) { unsafe { glTexParameteri(super::TEXTURE_2D, p, v) } }
    pub fn pixel_store(p: u32, v: i32) { unsafe { glPixelStorei(p, v) } }
    pub fn bind_framebuffer(f: u32) { unsafe { glBindFramebuffer(super::FRAMEBUFFER, f) } }
    pub fn viewport(x: i32, y: i32, w: i32, h: i32) { unsafe { glViewport(x, y, w, h) } }
    pub fn scissor(x: i32, y: i32, w: i32, h: i32) { unsafe { glScissor(x, y, w, h) } }
    pub fn enable(c: u32) { unsafe { glEnable(c) } }
    pub fn disable(c: u32) { unsafe { glDisable(c) } }
    pub fn blend_func(s: u32, d: u32) { unsafe { glBlendFunc(s, d) } }
    pub fn clear_color(r: f32, g: f32, b: f32, a: f32) { unsafe { glClearColor(r, g, b, a) } }
    pub fn clear_depth(d: f32) { unsafe { glClearDepthf(d) } }
    pub fn clear_stencil(s: i32) { unsafe { glClearStencil(s) } }
    pub fn clear(m: u32) { unsafe { glClear(m) } }
    pub fn color_mask(on: bool) { let v = on as u8; unsafe { glColorMask(v, v, v, v) } }
    pub fn depth_mask(on: bool) { unsafe { glDepthMask(on as u8) } }
    pub fn depth_func(f: u32) { unsafe { glDepthFunc(f) } }
    pub fn stencil_func(f: u32, r: i32, m: u32) { unsafe { glStencilFunc(f, r, m) } }
    pub fn stencil_op(a: u32, b: u32, c: u32) { unsafe { glStencilOp(a, b, c) } }
    pub fn stencil_op_separate(face: u32, a: u32, b: u32, c: u32) { unsafe { glStencilOpSeparate(face, a, b, c) } }
    pub fn stencil_mask(m: u32) { unsafe { glStencilMask(m) } }
    pub fn get_error() -> u32 { unsafe { glGetError() } }
    pub fn create_framebuffer() -> u32 {
        let mut f = 0;
        unsafe { glGenFramebuffers(1, &mut f) };
        f
    }
    pub fn delete_framebuffer(f: u32) { unsafe { glDeleteFramebuffers(1, &f) } }
    pub fn framebuffer_texture(tex: u32) { unsafe { glFramebufferTexture2D(super::FRAMEBUFFER, super::COLOR_ATTACHMENT0, super::TEXTURE_2D, tex, 0) } }
    /// a depth + stencil renderbuffer of w × h attached to the bound framebuffer
    pub fn create_depth_stencil(w: i32, h: i32) -> u32 {
        let mut r = 0;
        unsafe {
            glGenRenderbuffers(1, &mut r);
            glBindRenderbuffer(super::RENDERBUFFER, r);
            glRenderbufferStorage(super::RENDERBUFFER, super::DEPTH24_STENCIL8, w, h);
            glFramebufferRenderbuffer(super::FRAMEBUFFER, super::DEPTH_STENCIL_ATTACHMENT, super::RENDERBUFFER, r);
        }
        r
    }
    pub fn delete_renderbuffer(r: u32) { unsafe { glDeleteRenderbuffers(1, &r) } }
    /// renderbuffer `r` (create_depth_stencil's) attached to the bound framebuffer too (Android only: OpenXR's eye images share one)
    pub fn attach_depth_stencil(r: u32) { unsafe { glFramebufferRenderbuffer(super::FRAMEBUFFER, super::DEPTH_STENCIL_ATTACHMENT, super::RENDERBUFFER, r) } }
    pub fn framebuffer_ok() -> bool { unsafe { glCheckFramebufferStatus(super::FRAMEBUFFER) == super::FRAMEBUFFER_COMPLETE } }

    // GL_EXT_multisampled_render_to_texture (Quest's Adreno, most phone GPUs):
    // a framebuffer that draws with several samples a pixel into a plain
    // texture; the samples live in the GPU's tile memory and are averaged
    // as the tile is written out, so the edges are smooth at almost no cost.
    type FbTexMs = unsafe extern "C" fn(u32, u32, u32, u32, i32, i32);
    type RbStoreMs = unsafe extern "C" fn(u32, i32, u32, i32, i32);
    fn ms_fns() -> Option<(FbTexMs, RbStoreMs)> {
        unsafe {
            let ext = glGetString(0x1F03); // GL_EXTENSIONS
            if ext.is_null() {
                return None;
            }
            let all = core::ffi::CStr::from_ptr(ext as *const core::ffi::c_char).to_bytes();
            let name: &[u8] = b"GL_EXT_multisampled_render_to_texture";
            if !all.split(|c| *c == b' ').any(|w| w == name) {
                return None;
            }
            let a = eglGetProcAddress(b"glFramebufferTexture2DMultisampleEXT\0".as_ptr());
            let b = eglGetProcAddress(b"glRenderbufferStorageMultisampleEXT\0".as_ptr());
            if a.is_null() || b.is_null() {
                return None;
            }
            Some((core::mem::transmute::<*const core::ffi::c_void, FbTexMs>(a), core::mem::transmute::<*const core::ffi::c_void, RbStoreMs>(b)))
        }
    }
    /// how many samples a pixel `framebuffer_texture_ms` can give, up to
    /// `want` (0 when the GPU lacks GL_EXT_multisampled_render_to_texture)
    pub fn ms_samples(want: i32) -> i32 {
        if want < 2 || ms_fns().is_none() {
            return 0;
        }
        let mut max = 0;
        unsafe { glGetIntegerv(0x8D57, &mut max) }; // GL_MAX_SAMPLES_EXT
        want.min(max).max(0)
    }
    /// texture `tex` as the bound framebuffer's colour, drawn with `samples` a pixel
    pub fn framebuffer_texture_ms(tex: u32, samples: i32) -> bool {
        match ms_fns() {
            Some((f, _)) => {
                unsafe { f(super::FRAMEBUFFER, super::COLOR_ATTACHMENT0, super::TEXTURE_2D, tex, 0, samples) };
                true
            }
            None => false,
        }
    }
    /// create_depth_stencil with `samples` a pixel (for framebuffer_texture_ms)
    pub fn create_depth_stencil_ms(w: i32, h: i32, samples: i32) -> u32 {
        let Some((_, store)) = ms_fns() else { return create_depth_stencil(w, h) };
        let mut r = 0;
        unsafe {
            glGenRenderbuffers(1, &mut r);
            glBindRenderbuffer(super::RENDERBUFFER, r);
            store(super::RENDERBUFFER, samples, super::DEPTH24_STENCIL8, w, h);
            glFramebufferRenderbuffer(super::FRAMEBUFFER, super::DEPTH_STENCIL_ATTACHMENT, super::RENDERBUFFER, r);
        }
        r
    }
    /// the bound framebuffer's depth and stencil are not needed after the
    /// frame: the GPU need not write them out of its tiles
    pub fn discard_depth_stencil() {
        let a = [super::DEPTH_STENCIL_ATTACHMENT];
        unsafe { glInvalidateFramebuffer(super::FRAMEBUFFER, 1, a.as_ptr()) }
    }
}

#[cfg(target_arch = "wasm32")]
mod sys {
    #[link(wasm_import_module = "gl")]
    extern "C" {
        pub fn create_shader(t: u32) -> u32;
        pub fn shader_source(s: u32, p: *const u8, n: usize);
        pub fn compile_shader(s: u32);
        pub fn shader_ok(s: u32) -> u32;
        pub fn create_program() -> u32;
        pub fn attach_shader(p: u32, s: u32);
        pub fn link_program(p: u32);
        pub fn program_ok(p: u32) -> u32;
        pub fn uniform_location(p: u32, name: *const u8, n: usize) -> i32;
        pub fn use_program(p: u32);
        pub fn uniform1i(l: i32, v: i32);
        pub fn uniform1f(l: i32, v: f32);
        pub fn uniform4f(l: i32, a: f32, b: f32, c: f32, d: f32);
        pub fn uniformn(l: i32, n: u32, a: f32, b: f32, c: f32, d: f32);
        pub fn create_buffer() -> u32;
        pub fn bind_buffer(t: u32, b: u32);
        pub fn buffer_data(t: u32, p: *const u8, n: usize, usage: u32);
        pub fn create_vertex_array() -> u32;
        pub fn bind_vertex_array(a: u32);
        pub fn enable_attrib(i: u32);
        pub fn attrib_pointer(i: u32, size: i32, t: u32, norm: u32, stride: i32, off: usize);
        pub fn draw_elements(mode: u32, count: i32, off: usize);
        pub fn draw_arrays(mode: u32, first: i32, count: i32);
        pub fn create_texture() -> u32;
        pub fn delete_texture(t: u32);
        pub fn bind_texture(t: u32, tex: u32);
        pub fn active_texture(u: u32);
        pub fn tex_image(w: i32, h: i32, p: *const u8, n: usize);
        pub fn tex_sub_image(x: i32, y: i32, w: i32, h: i32, p: *const u8, n: usize);
        pub fn tex_parameter(p: u32, v: i32);
        pub fn pixel_store(p: u32, v: i32);
        pub fn bind_framebuffer(f: u32);
        pub fn viewport(x: i32, y: i32, w: i32, h: i32);
        pub fn scissor(x: i32, y: i32, w: i32, h: i32);
        pub fn enable(c: u32);
        pub fn disable(c: u32);
        pub fn blend_func(s: u32, d: u32);
        pub fn clear_color(r: f32, g: f32, b: f32, a: f32);
        pub fn clear_depth(d: f32);
        pub fn clear_stencil(s: i32);
        pub fn clear(m: u32);
        pub fn color_mask(on: u32);
        pub fn depth_mask(on: u32);
        pub fn depth_func(f: u32);
        pub fn stencil_func(f: u32, r: i32, m: u32);
        pub fn stencil_op(a: u32, b: u32, c: u32);
        pub fn stencil_op_separate(face: u32, a: u32, b: u32, c: u32);
        pub fn stencil_mask(m: u32);
        pub fn get_error() -> u32;
        pub fn create_framebuffer() -> u32;
        pub fn delete_framebuffer(f: u32);
        pub fn framebuffer_texture(tex: u32);
        pub fn create_depth_stencil(w: i32, h: i32) -> u32;
        pub fn delete_renderbuffer(r: u32);
        pub fn framebuffer_ok() -> u32;
    }
}

#[cfg(target_arch = "wasm32")]
mod api {
    use super::sys;
    pub fn create_shader(t: u32) -> u32 { unsafe { sys::create_shader(t) } }
    pub fn shader_source(s: u32, src: &str) { unsafe { sys::shader_source(s, src.as_ptr(), src.len()) } }
    pub fn compile_shader(s: u32) { unsafe { sys::compile_shader(s) } }
    pub fn shader_ok(s: u32) -> bool { unsafe { sys::shader_ok(s) != 0 } }
    /// (the browser's console shows the log: glhost.js writes it there)
    pub fn shader_log(_s: u32) -> String { String::new() }
    pub fn create_program() -> u32 { unsafe { sys::create_program() } }
    pub fn attach_shader(p: u32, s: u32) { unsafe { sys::attach_shader(p, s) } }
    pub fn link_program(p: u32) { unsafe { sys::link_program(p) } }
    pub fn program_ok(p: u32) -> bool { unsafe { sys::program_ok(p) != 0 } }
    pub fn program_log(_p: u32) -> String { String::new() }
    pub fn uniform_location(p: u32, name: &str) -> i32 { unsafe { sys::uniform_location(p, name.as_ptr(), name.len()) } }
    pub fn use_program(p: u32) { unsafe { sys::use_program(p) } }
    pub fn uniform1i(l: i32, v: i32) { unsafe { sys::uniform1i(l, v) } }
    pub fn uniform1f(l: i32, v: f32) { unsafe { sys::uniform1f(l, v) } }
    pub fn uniform4f(l: i32, a: f32, b: f32, c: f32, d: f32) { unsafe { sys::uniform4f(l, a, b, c, d) } }
    pub fn uniformn(l: i32, v: &[f32]) {
        let g = |i: usize| v.get(i).copied().unwrap_or(0.0);
        if (1..=4).contains(&v.len()) {
            unsafe { sys::uniformn(l, v.len() as u32, g(0), g(1), g(2), g(3)) }
        }
    }
    pub fn create_buffer() -> u32 { unsafe { sys::create_buffer() } }
    pub fn bind_buffer(t: u32, b: u32) { unsafe { sys::bind_buffer(t, b) } }
    pub fn buffer_data(t: u32, data: &[u8], usage: u32) { unsafe { sys::buffer_data(t, data.as_ptr(), data.len(), usage) } }
    pub fn create_vertex_array() -> u32 { unsafe { sys::create_vertex_array() } }
    pub fn bind_vertex_array(a: u32) { unsafe { sys::bind_vertex_array(a) } }
    pub fn enable_attrib(i: u32) { unsafe { sys::enable_attrib(i) } }
    pub fn attrib_pointer(i: u32, size: i32, t: u32, norm: bool, stride: i32, off: usize) { unsafe { sys::attrib_pointer(i, size, t, norm as u32, stride, off) } }
    pub fn draw_elements(mode: u32, count: i32, off: usize) { unsafe { sys::draw_elements(mode, count, off) } }
    pub fn draw_arrays(mode: u32, first: i32, count: i32) { unsafe { sys::draw_arrays(mode, first, count) } }
    pub fn create_texture() -> u32 { unsafe { sys::create_texture() } }
    pub fn delete_texture(t: u32) { unsafe { sys::delete_texture(t) } }
    pub fn bind_texture(t: u32, tex: u32) { unsafe { sys::bind_texture(t, tex) } }
    pub fn active_texture(u: u32) { unsafe { sys::active_texture(u) } }
    pub fn tex_image(w: i32, h: i32, px: Option<&[u8]>) {
        match px {
            Some(p) => unsafe { sys::tex_image(w, h, p.as_ptr(), p.len()) },
            None => unsafe { sys::tex_image(w, h, std::ptr::null(), 0) },
        }
    }
    pub fn tex_sub_image(x: i32, y: i32, w: i32, h: i32, px: &[u8]) { unsafe { sys::tex_sub_image(x, y, w, h, px.as_ptr(), px.len()) } }
    pub fn tex_parameter(p: u32, v: i32) { unsafe { sys::tex_parameter(p, v) } }
    pub fn pixel_store(p: u32, v: i32) { unsafe { sys::pixel_store(p, v) } }
    pub fn bind_framebuffer(f: u32) { unsafe { sys::bind_framebuffer(f) } }
    pub fn viewport(x: i32, y: i32, w: i32, h: i32) { unsafe { sys::viewport(x, y, w, h) } }
    pub fn scissor(x: i32, y: i32, w: i32, h: i32) { unsafe { sys::scissor(x, y, w, h) } }
    pub fn enable(c: u32) { unsafe { sys::enable(c) } }
    pub fn disable(c: u32) { unsafe { sys::disable(c) } }
    pub fn blend_func(s: u32, d: u32) { unsafe { sys::blend_func(s, d) } }
    pub fn clear_color(r: f32, g: f32, b: f32, a: f32) { unsafe { sys::clear_color(r, g, b, a) } }
    pub fn clear_depth(d: f32) { unsafe { sys::clear_depth(d) } }
    pub fn clear_stencil(s: i32) { unsafe { sys::clear_stencil(s) } }
    pub fn clear(m: u32) { unsafe { sys::clear(m) } }
    pub fn color_mask(on: bool) { unsafe { sys::color_mask(on as u32) } }
    pub fn depth_mask(on: bool) { unsafe { sys::depth_mask(on as u32) } }
    pub fn depth_func(f: u32) { unsafe { sys::depth_func(f) } }
    pub fn stencil_func(f: u32, r: i32, m: u32) { unsafe { sys::stencil_func(f, r, m) } }
    pub fn stencil_op(a: u32, b: u32, c: u32) { unsafe { sys::stencil_op(a, b, c) } }
    pub fn stencil_op_separate(face: u32, a: u32, b: u32, c: u32) { unsafe { sys::stencil_op_separate(face, a, b, c) } }
    pub fn stencil_mask(m: u32) { unsafe { sys::stencil_mask(m) } }
    pub fn get_error() -> u32 { unsafe { sys::get_error() } }
    pub fn create_framebuffer() -> u32 { unsafe { sys::create_framebuffer() } }
    pub fn delete_framebuffer(f: u32) { unsafe { sys::delete_framebuffer(f) } }
    pub fn framebuffer_texture(tex: u32) { unsafe { sys::framebuffer_texture(tex) } }
    pub fn create_depth_stencil(w: i32, h: i32) -> u32 { unsafe { sys::create_depth_stencil(w, h) } }
    pub fn delete_renderbuffer(r: u32) { unsafe { sys::delete_renderbuffer(r) } }
    pub fn framebuffer_ok() -> bool { unsafe { sys::framebuffer_ok() != 0 } }
}

/// No GL here (tests, a desktop cargo check): every call does nothing.
#[cfg(not(any(target_os = "android", target_arch = "wasm32")))]
#[allow(unused_variables)]
mod api {
    pub fn create_shader(t: u32) -> u32 { 1 }
    pub fn shader_source(s: u32, src: &str) {}
    pub fn compile_shader(s: u32) {}
    pub fn shader_ok(s: u32) -> bool { true }
    pub fn shader_log(s: u32) -> String { String::new() }
    pub fn create_program() -> u32 { 1 }
    pub fn attach_shader(p: u32, s: u32) {}
    pub fn link_program(p: u32) {}
    pub fn program_ok(p: u32) -> bool { true }
    pub fn program_log(p: u32) -> String { String::new() }
    pub fn uniform_location(p: u32, name: &str) -> i32 { 0 }
    pub fn use_program(p: u32) {}
    pub fn uniform1i(l: i32, v: i32) {}
    pub fn uniform1f(l: i32, v: f32) {}
    pub fn uniform4f(l: i32, a: f32, b: f32, c: f32, d: f32) {}
    pub fn uniformn(l: i32, v: &[f32]) {}
    pub fn create_buffer() -> u32 { 1 }
    pub fn bind_buffer(t: u32, b: u32) {}
    pub fn buffer_data(t: u32, data: &[u8], usage: u32) {}
    pub fn create_vertex_array() -> u32 { 1 }
    pub fn bind_vertex_array(a: u32) {}
    pub fn enable_attrib(i: u32) {}
    pub fn attrib_pointer(i: u32, size: i32, t: u32, norm: bool, stride: i32, off: usize) {}
    pub fn draw_elements(mode: u32, count: i32, off: usize) {}
    pub fn draw_arrays(mode: u32, first: i32, count: i32) {}
    pub fn create_texture() -> u32 {
        static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
        NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    }
    pub fn delete_texture(t: u32) {}
    pub fn bind_texture(t: u32, tex: u32) {}
    pub fn active_texture(u: u32) {}
    pub fn tex_image(w: i32, h: i32, px: Option<&[u8]>) {}
    pub fn tex_sub_image(x: i32, y: i32, w: i32, h: i32, px: &[u8]) {}
    pub fn tex_parameter(p: u32, v: i32) {}
    pub fn pixel_store(p: u32, v: i32) {}
    pub fn bind_framebuffer(f: u32) {}
    pub fn viewport(x: i32, y: i32, w: i32, h: i32) {}
    pub fn scissor(x: i32, y: i32, w: i32, h: i32) {}
    pub fn enable(c: u32) {}
    pub fn disable(c: u32) {}
    pub fn blend_func(s: u32, d: u32) {}
    pub fn clear_color(r: f32, g: f32, b: f32, a: f32) {}
    pub fn clear_depth(d: f32) {}
    pub fn clear_stencil(s: i32) {}
    pub fn clear(m: u32) {}
    pub fn color_mask(on: bool) {}
    pub fn depth_mask(on: bool) {}
    pub fn depth_func(f: u32) {}
    pub fn stencil_func(f: u32, r: i32, m: u32) {}
    pub fn stencil_op(a: u32, b: u32, c: u32) {}
    pub fn stencil_op_separate(face: u32, a: u32, b: u32, c: u32) {}
    pub fn stencil_mask(m: u32) {}
    pub fn get_error() -> u32 { 0 }
    pub fn create_framebuffer() -> u32 { 1 }
    pub fn delete_framebuffer(f: u32) {}
    pub fn framebuffer_texture(tex: u32) {}
    pub fn create_depth_stencil(w: i32, h: i32) -> u32 { 1 }
    pub fn delete_renderbuffer(r: u32) {}
    pub fn attach_depth_stencil(r: u32) {}
    pub fn framebuffer_ok() -> bool { true }
}

pub use api::*;
