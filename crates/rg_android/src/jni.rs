// SPDX-License-Identifier: AGPL-3.0-or-later
// The JNI calls of the Android engine (see lib.rs). Shared with
// crates/rg_web_dom/android, which includes it with an engine that also has
// the RangerDOM renderer (new_engine).

use jni::objects::{JByteArray, JClass, JString};
use jni::sys::{jboolean, jdouble, jfloatArray, jint, jstring};
use jni::JNIEnv;
use rg_core::host::commands_json;
use rg_engine::Engine;
use std::cell::RefCell;

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = RefCell::new(None);
    static CMDS: RefCell<String> = RefCell::new(String::new());
    static LOG: RefCell<String> = RefCell::new(String::new());
}

fn with<R>(f: impl FnOnce(&mut Engine) -> R) -> R {
    ENGINE.with(|e| {
        let mut b = e.borrow_mut();
        if b.is_none() {
            *b = Some(new_engine());
        }
        f(b.as_mut().unwrap())
    })
}

/// The engine read only (made first if there is none yet, as `with`).
fn with_ref<R>(f: impl FnOnce(&Engine) -> R) -> R {
    ENGINE.with(|e| {
        if e.borrow().is_none() {
            *e.borrow_mut() = Some(new_engine());
        }
        f(e.borrow().as_ref().unwrap())
    })
}

fn text(env: &mut JNIEnv, s: &JString) -> String {
    if s.is_null() {
        return String::new();
    }
    env.get_string(s).map(|s| s.into()).unwrap_or_default()
}

fn bytes(env: &mut JNIEnv, a: &JByteArray) -> Vec<u8> {
    if a.is_null() {
        return Vec::new();
    }
    env.convert_byte_array(a).unwrap_or_default()
}

fn jtext(env: &mut JNIEnv, s: &str) -> jstring {
    env.new_string(s)
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

/// The commands and log of the call, for commands() and log(); a log the
/// app has not read yet is kept.
fn publish(e: &mut Engine) {
    let cmds = e.take_host_commands();
    CMDS.with(|b| *b.borrow_mut() = commands_json(&cmds));
    if !e.log.is_empty() {
        let log = e.log.join("\n");
        e.log.clear();
        LOG.with(|b| {
            let mut b = b.borrow_mut();
            if !b.is_empty() {
                b.push('\n');
            }
            b.push_str(&log);
        });
    }
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_mount(
    mut env: JNIEnv,
    _c: JClass,
    prefix: JString,
    pack: JByteArray,
) -> jint {
    let prefix = text(&mut env, &prefix);
    let data = bytes(&mut env, &pack);
    with(|e| e.vfs.mount_pack(&prefix, &data) as jint)
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_put(
    mut env: JNIEnv,
    _c: JClass,
    path: JString,
    data: JByteArray,
) {
    let path = text(&mut env, &path);
    let data = bytes(&mut env, &data);
    with(|e| e.vfs.add(&path, data));
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_start(
    mut env: JNIEnv,
    _c: JClass,
    id: JString,
) -> jint {
    let id = text(&mut env, &id);
    with(|e| {
        let r = e.start(&id);
        publish(e);
        if r.is_ok() {
            0
        } else {
            1
        }
    })
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_resize(
    _env: JNIEnv,
    _c: JClass,
    w: jdouble,
    h: jdouble,
) {
    with(|e| e.resize(w, h));
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_seed(_env: JNIEnv, _c: JClass, seed: jdouble) {
    with(|e| e.set_seed(seed as i64));
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_pointer(
    _env: JNIEnv,
    _c: JClass,
    kind: jint,
    id: jint,
    x: jdouble,
    y: jdouble,
) {
    with(|e| e.pointer(kind, id as i64, x, y));
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_key(
    mut env: JNIEnv,
    _c: JClass,
    down: jboolean,
    key: JString,
) {
    let key = text(&mut env, &key);
    with(|e| {
        e.key(down != 0, &key);
        publish(e);
    });
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_sensor(
    mut env: JNIEnv,
    _c: JClass,
    name: JString,
    data: JString,
) {
    let name = text(&mut env, &name);
    let data = text(&mut env, &data);
    with(|e| e.sensor(&name, &data));
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_frame(
    _env: JNIEnv,
    _c: JClass,
    dt_ms: jdouble,
) -> jint {
    with(|e| {
        let r = e.frame(dt_ms);
        publish(e);
        if r.is_ok() {
            0
        } else {
            1
        }
    })
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_gl3d(_env: JNIEnv, _c: JClass, on: jboolean) {
    with(|e| e.gl3d = on != 0);
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_textures(_env: JNIEnv, _c: JClass, on: jboolean) {
    with(|e| e.textures = on != 0);
}

/// on: the app draws baked particle runs as liquid splats (draw kind 10, GlSplats.java)
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_splats(_env: JNIEnv, _c: JClass, on: jboolean) {
    with(|e| e.splats = on != 0);
}

/// on: the app draws real heights on globes (a sphere command with 40 numbers, Terrain.java)
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_terrain(_env: JNIEnv, _c: JClass, on: jboolean) {
    with(|e| e.terrain = on != 0);
}

/// on: the app draws a planet's detail pictures (GlSphere.java, the GPU globes)
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_detail(_env: JNIEnv, _c: JClass, on: jboolean) {
    with(|e| e.detail = on != 0);
}

/// on: the app installs games from the download list (Store.java)
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_store(_env: JNIEnv, _c: JClass, on: jboolean) {
    with(|e| e.store = on != 0);
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_tris(env: JNIEnv, _c: JClass) -> jfloatArray {
    with(|e| {
        let t = &e.scene.tris;
        match env.new_float_array(t.len() as i32) {
            Ok(a) => {
                let _ = env.set_float_array_region(&a, 0, t);
                a.into_raw()
            }
            Err(_) => std::ptr::null_mut(),
        }
    })
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_draw(env: JNIEnv, _c: JClass) -> jfloatArray {
    with(|e| {
        let nums = &e.draw.nums;
        match env.new_float_array(nums.len() as i32) {
            Ok(a) => {
                let _ = env.set_float_array_region(&a, 0, nums);
                a.into_raw()
            }
            Err(_) => std::ptr::null_mut(),
        }
    })
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_strings(mut env: JNIEnv, _c: JClass) -> jstring {
    let s = with(|e| e.draw.strings_joined());
    jtext(&mut env, &s)
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_commands(mut env: JNIEnv, _c: JClass) -> jstring {
    let s = CMDS.with(|b| std::mem::take(&mut *b.borrow_mut()));
    jtext(&mut env, &s)
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_log(mut env: JNIEnv, _c: JClass) -> jstring {
    let s = LOG.with(|b| std::mem::take(&mut *b.borrow_mut()));
    jtext(&mut env, &s)
}

/// A shader stage assembled with the app's defines ("RG_YS=-1.0"): a
/// built-in (shaders/<path>) or a game's ("game:<key>"); null when it fails
/// (the error goes to the log). Needs no engine, so any thread may ask.
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_shader(
    mut env: JNIEnv,
    _c: JClass,
    path: JString,
    defines: JString,
) -> jstring {
    let path = text(&mut env, &path);
    let defines = text(&mut env, &defines);
    match rg_shader::stage(&path, &defines) {
        Ok(b) => jtext(&mut env, &b.src),
        Err(e) => {
            LOG.with(|l| {
                let mut l = l.borrow_mut();
                if !l.is_empty() {
                    l.push('\n');
                }
                l.push_str(&format!("shader: {}", e));
            });
            std::ptr::null_mut()
        }
    }
}

/// A driver's compile log for that stage in the source's own files and
/// lines; also kept for the game's log (rg_shader::explain). Any thread.
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_shaderError(
    mut env: JNIEnv,
    _c: JClass,
    path: JString,
    defines: JString,
    log: JString,
) -> jstring {
    let path = text(&mut env, &path);
    let defines = text(&mut env, &defines);
    let log = text(&mut env, &log);
    let r = rg_shader::explain(&path, &defines, &log);
    jtext(&mut env, &r)
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_view(
    _env: JNIEnv,
    _c: JClass,
    i: jint,
) -> jdouble {
    with(|e| match i {
        0 => e.scale,
        1 => e.off_x,
        2 => e.off_y,
        3 => e.ui.width,
        _ => e.ui.height,
    })
}

#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_read<'a>(
    mut env: JNIEnv<'a>,
    _c: JClass,
    path: JString,
) -> jni::sys::jbyteArray {
    let path = text(&mut env, &path);
    // a shared borrow: GL painting (Engine.glRender) holds one while the
    // app's pictures and globes read their files
    let found = with_ref(|e| {
        if e.vfs.size(&path) < 0 {
            None
        } else {
            Some(e.vfs.read(&path))
        }
    });
    match found {
        Some(data) => env
            .byte_array_from_slice(&data)
            .map(|a| a.into_raw())
            .unwrap_or(std::ptr::null_mut()),
        None => std::ptr::null_mut(),
    }
}

// ---- painting everything with GLES 3 (crates/rg_gl) ----
// The app's game thread holds an EGL context with the window surface current
// (GlCtx.java); Engine.glRender paints the last frame's stream into it, and
// GlHost.java answers for pictures, text runs and globes.

thread_local! {
    static GL: RefCell<rg_gl::Renderer> = RefCell::new(rg_gl::Renderer::new());
}

const GLHOST: &str = "fi/rangergames/GlHost";

/// Calls GlHost.java's static methods; its strings once a frame, when a globe asks.
struct JniGlHost<'a, 'b> {
    env: &'b mut JNIEnv<'a>,
    strings: Option<jni::objects::GlobalRef>,
}

impl JniGlHost<'_, '_> {
    fn clear_exception(&mut self) {
        if self.env.exception_check().unwrap_or(false) {
            let _ = self.env.exception_describe();
            let _ = self.env.exception_clear();
        }
    }
}

impl rg_gl::Host for JniGlHost<'_, '_> {
    fn image(&mut self, path: &str) -> rg_gl::Img {
        let r = self
            .env
            .with_local_frame(4, |env| -> jni::errors::Result<i32> {
                let p = env.new_string(path)?;
                env.call_static_method(GLHOST, "image", "(Ljava/lang/String;)I", &[jni::objects::JValue::Object(&p)])?.i()
            })
            .unwrap_or(-2);
        self.clear_exception();
        match r {
            -1 => rg_gl::Img::Pending,
            r if r < 0 => rg_gl::Img::Failed,
            r => rg_gl::Img::Ready((r as u32) >> 16, (r as u32) & 0xffff),
        }
    }

    fn text_measure(&mut self, run: &rg_gl::TextRun) -> Option<(f32, f32, f32)> {
        let mut out = [0f32; 3];
        let ok = self
            .env
            .with_local_frame(8, |env| -> jni::errors::Result<bool> {
                use jni::objects::JValue;
                let t = env.new_string(run.text)?;
                let w = env.new_string(run.weight)?;
                let a = env.new_float_array(3)?;
                let ok = env
                    .call_static_method(
                        GLHOST,
                        "textMeasure",
                        "(Ljava/lang/String;Ljava/lang/String;ZFF[F)Z",
                        &[JValue::Object(&t), JValue::Object(&w), JValue::Bool(run.italic as u8), JValue::Float(run.size), JValue::Float(run.spacing), JValue::Object(&a)],
                    )?
                    .z()?;
                if ok {
                    env.get_float_array_region(&a, 0, &mut out)?;
                }
                Ok(ok)
            })
            .unwrap_or(false);
        self.clear_exception();
        if ok { Some((out[0], out[1], out[2])) } else { None }
    }

    fn text_draw(&mut self, run: &rg_gl::TextRun, x: i32, y: i32, w: i32, h: i32) -> bool {
        let rgb = ((run.rgb[0] as i32) << 16) | ((run.rgb[1] as i32) << 8) | run.rgb[2] as i32;
        let ok = self
            .env
            .with_local_frame(8, |env| -> jni::errors::Result<bool> {
                use jni::objects::JValue;
                let t = env.new_string(run.text)?;
                let wt = env.new_string(run.weight)?;
                env.call_static_method(
                    GLHOST,
                    "textDraw",
                    "(Ljava/lang/String;Ljava/lang/String;ZFFIIIIII)Z",
                    &[
                        JValue::Object(&t),
                        JValue::Object(&wt),
                        JValue::Bool(run.italic as u8),
                        JValue::Float(run.size),
                        JValue::Float(run.spacing),
                        JValue::Int(rgb),
                        JValue::Int(run.pad),
                        JValue::Int(x),
                        JValue::Int(y),
                        JValue::Int(w),
                        JValue::Int(h),
                    ],
                )?
                .z()
            })
            .unwrap_or(false);
        self.clear_exception();
        ok
    }

    fn globes(&mut self, nums: &[f32], strings: &[String], from: usize, to: usize, px: f32) -> Option<rg_gl::Globes> {
        if self.strings.is_none() {
            let made = self.env.with_local_frame(8, |env| -> jni::errors::Result<jni::objects::GlobalRef> {
                let arr = env.new_object_array(strings.len() as i32, "java/lang/String", jni::objects::JObject::null())?;
                for (i, s) in strings.iter().enumerate() {
                    let js = env.new_string(s)?;
                    env.set_object_array_element(&arr, i as i32, &js)?;
                    env.delete_local_ref(js)?;
                }
                env.new_global_ref(arr)
            });
            self.clear_exception();
            self.strings = made.ok();
        }
        let strs = self.strings.clone()?;
        let mut out = [0f32; 8];
        let ok = self
            .env
            .with_local_frame(8, |env| -> jni::errors::Result<bool> {
                use jni::objects::JValue;
                let sub = &nums[from..to.min(nums.len())];
                let a = env.new_float_array(sub.len() as i32)?;
                env.set_float_array_region(&a, 0, sub)?;
                let o = env.new_float_array(8)?;
                let ok = env
                    .call_static_method(
                        GLHOST,
                        "globes",
                        "([F[Ljava/lang/String;F[F)Z",
                        &[JValue::Object(&a), JValue::Object(strs.as_obj()), JValue::Float(px), JValue::Object(&o)],
                    )?
                    .z()?;
                if ok {
                    env.get_float_array_region(&o, 0, &mut out)?;
                }
                Ok(ok)
            })
            .unwrap_or(false);
        self.clear_exception();
        if !ok {
            return None;
        }
        Some(rg_gl::Globes { tex: out[0] as u32, x: out[1], y: out[2], w: out[3], h: out[4], u1: out[5], v1: out[6], flip: out[7] > 0.5 })
    }
}

/// on: the app paints everything with GL (Engine.glRender), 3D as triangles in the stream
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_glAll(_env: JNIEnv, _c: JClass, on: jboolean) {
    with(|e| {
        e.gl_all = on != 0;
        if on != 0 {
            e.gl3d = true;
        }
    });
}

/// on: the app can paint either way (the menu's ⚙ shows the choice, rg.paints)
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_paints(_env: JNIEnv, _c: JClass, on: jboolean) {
    with(|e| e.paints = on != 0);
}

/// Paints the last frame into the current GL surface (w × h pixels, density
/// pixels a dp, the background colour); false when GL failed.
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_glRender(
    mut env: JNIEnv,
    _c: JClass,
    w: jint,
    h: jint,
    density: jni::sys::jfloat,
    r: jni::sys::jfloat,
    g: jni::sys::jfloat,
    b: jni::sys::jfloat,
) -> jboolean {
    let mut host = JniGlHost { env: &mut env, strings: None };
    // read only: the host's calls back (Engine.read) borrow it too
    with_ref(|e| {
        GL.with(|gl| {
            let mut gl = gl.borrow_mut();
            let v = rg_gl::View {
                scale: e.scale as f32,
                x: e.off_x as f32,
                y: e.off_y as f32,
                w: e.ui.width as f32,
                h: e.ui.height as f32,
                density,
                width: w,
                height: h,
            };
            gl.render(&mut host, &e.draw.nums, &e.draw.strings, &e.scene.tris, &e.scene.ptris, &e.scene.plights, &v, [r, g, b, 1.0]);
            gl.ok() as jboolean
        })
    })
}

/// The GL renderer's numbers (draw calls, vertices, kept pictures) and its last error.
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_glStats(mut env: JNIEnv, _c: JClass) -> jstring {
    let s = GL.with(|gl| {
        let gl = gl.borrow();
        if gl.error.is_empty() { gl.stats() } else { format!("{} | error: {}", gl.stats(), gl.error) }
    });
    jtext(&mut env, &s)
}
