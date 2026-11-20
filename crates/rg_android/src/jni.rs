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
    let found = with(|e| {
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
