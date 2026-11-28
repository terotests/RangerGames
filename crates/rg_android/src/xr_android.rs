// SPDX-License-Identifier: AGPL-3.0-or-later
// VR headsets on Android (Meta Quest 3 / 3S / Pro, other OpenXR headsets):
// the engine's rg.xr "vr" mode with OpenXR, on the game thread and in the
// app's own GLES 3 context (GlCtx.java; the context only, no window). The
// Khronos loader (libopenxr_loader.so, from the loader AAR in
// android/app/build.gradle) finds the headset's runtime. Included by jni.rs's
// crates (lib.rs), like jni.rs. See crates/rg_engine/src/xr.rs and docs/vr.md.
//
//   xrStart(activity)  makes the instance, session, eye swapchains and the
//                      controllers' actions; false when there is no headset
//   xrFrame(dt)        one headset frame: the eyes' poses and the
//                      controllers to the engine, the game's frame, the 2D
//                      view into the panel's texture, each eye into its
//                      swapchain image; 1 drawn, 0 waiting (not shown), -1 the
//                      headset ended the app
//   xrStop()           lets go of everything

#[cfg(target_os = "android")]
mod quest {
    use super::*;
    use jni::objects::{GlobalRef, JObject};
    use openxr as xr;
    use std::ffi::c_void;

    #[link(name = "EGL")]
    extern "C" {
        fn eglGetCurrentDisplay() -> *mut c_void;
        fn eglGetCurrentContext() -> *mut c_void;
        fn eglQueryContext(dpy: *mut c_void, ctx: *mut c_void, attr: i32, value: *mut i32) -> u32;
        fn eglChooseConfig(dpy: *mut c_void, attrs: *const i32, configs: *mut *mut c_void, size: i32, n: *mut i32) -> u32;
    }
    extern "C" {
        fn __system_property_get(name: *const u8, value: *mut u8) -> i32;
    }
    /// an integer system property (`adb shell setprop <name> N`), else `default`
    fn prop_int(name: &[u8], default: i32) -> i32 {
        let mut v = [0u8; 92];
        let n = unsafe { __system_property_get(name.as_ptr(), v.as_mut_ptr()) };
        if n <= 0 {
            return default;
        }
        std::str::from_utf8(&v[..n as usize]).ok().and_then(|s| s.trim().parse::<i32>().ok()).unwrap_or(default)
    }
    /// samples a pixel in the eyes: 4, or `adb shell setprop debug.rg.xrsamples N` (0 = off)
    fn eye_samples_wanted() -> i32 {
        prop_int(b"debug.rg.xrsamples\0", 4).clamp(0, 8)
    }
    /// sRGB eye images (`adb shell setprop debug.rg.xrsrgb 0` = the old RGBA8)
    fn eye_srgb_wanted() -> bool {
        prop_int(b"debug.rg.xrsrgb\0", 1) != 0
    }
    const GL_FRAMEBUFFER_SRGB_EXT: u32 = 0x8DB9;
    const EGL_CONFIG_ID: i32 = 0x3028;
    const EGL_NONE: i32 = 0x3038;
    const GL_RGBA8: u32 = 0x8058;
    const GL_SRGB8_ALPHA8: u32 = 0x8C43;

    const VIEW: xr::ViewConfigurationType = xr::ViewConfigurationType::PRIMARY_STEREO;

    struct Eye {
        chain: xr::Swapchain<xr::OpenGlEs>,
        fbos: Vec<u32>,
        depth: u32,
        w: i32,
        h: i32,
    }

    struct Hand {
        side: &'static str,
        path: xr::Path,
        aim: xr::Space,
        grip: xr::Space,
    }

    struct Actions {
        set: xr::ActionSet,
        aim: xr::Action<xr::Posef>,
        trigger: xr::Action<f32>,
        squeeze: xr::Action<f32>,
        stick: xr::Action<xr::Vector2f>,
        stick_click: xr::Action<bool>,
        a: xr::Action<bool>,
        b: xr::Action<bool>,
        menu: xr::Action<bool>,
        buzz: xr::Action<xr::Haptic>,
    }

    pub(super) struct Quest {
        _activity: GlobalRef,
        instance: xr::Instance,
        session: xr::Session<xr::OpenGlEs>,
        waiter: xr::FrameWaiter,
        stream: xr::FrameStream<xr::OpenGlEs>,
        space: xr::Space,
        head: xr::Space,
        blend: xr::EnvironmentBlendMode,
        eyes: Vec<Eye>,
        /// the eye images are sRGB: write the painter's colours unconverted
        srgb: bool,
        act: Actions,
        hands: Vec<Hand>,
        running: bool,
        events: xr::EventDataBuffer,
        last: Option<xr::Time>,
    }

    fn err<E: std::fmt::Display>(what: &str) -> impl FnOnce(E) -> String + '_ {
        move |e| format!("{}: {}", what, e)
    }

    /// The current EGL context's display, config and context (GlCtx.java made it current).
    fn egl() -> Result<(*mut c_void, *mut c_void, *mut c_void), String> {
        unsafe {
            let dpy = eglGetCurrentDisplay();
            let ctx = eglGetCurrentContext();
            if dpy.is_null() || ctx.is_null() {
                return Err("no current EGL context".into());
            }
            let mut id = 0;
            eglQueryContext(dpy, ctx, EGL_CONFIG_ID, &mut id);
            let attrs = [EGL_CONFIG_ID, id, EGL_NONE];
            let mut cfg: *mut c_void = std::ptr::null_mut();
            let mut n = 0;
            if eglChooseConfig(dpy, attrs.as_ptr(), &mut cfg, 1, &mut n) == 0 || n < 1 {
                return Err("the context's EGL config".into());
            }
            Ok((dpy, cfg, ctx))
        }
    }

    fn pose_json(l: &xr::SpaceLocation) -> String {
        let ok = xr::SpaceLocationFlags::POSITION_VALID | xr::SpaceLocationFlags::ORIENTATION_VALID;
        if !l.location_flags.contains(ok) {
            return "null".into();
        }
        let (p, q) = (l.pose.position, l.pose.orientation);
        format!(r#"{{"p":[{},{},{}],"q":[{},{},{},{}]}}"#, p.x, p.y, p.z, q.x, q.y, q.z, q.w)
    }

    impl Quest {
        pub(super) fn srgb_eyes(&self) -> bool {
            self.srgb
        }

        pub(super) fn start(env: &mut JNIEnv, activity: &JObject) -> Result<Quest, String> {
            let vm = env.get_java_vm().map_err(err("JavaVM"))?;
            let activity = env.new_global_ref(activity).map_err(err("activity"))?;
            let platform = unsafe { xr::AndroidPlatformInfo::new(vm.get_java_vm_pointer() as *mut c_void, activity.as_obj().as_raw() as *mut c_void) };
            let entry = unsafe { xr::Entry::load(&platform) }.map_err(err("OpenXR loader"))?;
            let have = entry.enumerate_extensions().map_err(err("extensions"))?;
            if !have.khr_opengl_es_enable {
                return Err("the runtime has no XR_KHR_opengl_es_enable".into());
            }
            let mut exts = xr::ExtensionSet::default();
            exts.khr_opengl_es_enable = true;
            exts.khr_android_create_instance = have.khr_android_create_instance;
            let app = xr::ApplicationInfo { application_name: "RangerGames", application_version: 1, engine_name: "RangerGames", engine_version: 1, api_version: xr::Version::new(1, 0, 0) };
            let instance = entry.create_instance(&app, &exts, &[], &platform).map_err(err("instance"))?;
            let system = instance.system(xr::FormFactor::HEAD_MOUNTED_DISPLAY).map_err(err("no headset"))?;
            // the spec asks for the requirements before the session
            instance.graphics_requirements::<xr::OpenGlEs>(system).map_err(err("GLES requirements"))?;
            let (display, config, context) = egl()?;
            let (session, waiter, stream) = unsafe { instance.create_session::<xr::OpenGlEs>(system, &xr::opengles::SessionCreateInfo::Android { display, config, context }) }.map_err(err("session"))?;
            let blend = instance.enumerate_environment_blend_modes(system, VIEW).ok().and_then(|m| m.first().copied()).unwrap_or(xr::EnvironmentBlendMode::OPAQUE);
            // the floor at y 0 (the engine recentres on the head anyway)
            let kinds = session.enumerate_reference_spaces().unwrap_or_default();
            let kind = [xr::ReferenceSpaceType::LOCAL_FLOOR, xr::ReferenceSpaceType::STAGE].into_iter().find(|k| kinds.contains(k)).unwrap_or(xr::ReferenceSpaceType::LOCAL);
            let space = session.create_reference_space(kind, xr::Posef::IDENTITY).map_err(err("space"))?;
            let head = session.create_reference_space(xr::ReferenceSpaceType::VIEW, xr::Posef::IDENTITY).map_err(err("view space"))?;

            // an eye's images: sRGB, so that the compositor shows them as they
            // are (it takes a UNORM image for linear light and encodes it again:
            // space turned grey-blue, everything washed out). The painter's
            // colours are sRGB already, so the GPU's own linear→sRGB conversion
            // is turned off while drawing the eyes (EXT_sRGB_write_control).
            // Without the extension: RGBA8 as before.
            let formats = session.enumerate_swapchain_formats().unwrap_or_default();
            let srgb = eye_srgb_wanted() && formats.contains(&GL_SRGB8_ALPHA8) && rg_gl::gl::has_extension("GL_EXT_sRGB_write_control");
            let order = if srgb { [GL_SRGB8_ALPHA8, GL_RGBA8] } else { [GL_RGBA8, GL_SRGB8_ALPHA8] };
            let format = order.into_iter().find(|f| formats.contains(f)).or(formats.first().copied()).ok_or("no swapchain format")?;
            let srgb = srgb && format == GL_SRGB8_ALPHA8;
            let mut eyes = Vec::new();
            // the eyes draw with 4 samples a pixel where the GPU can (Quest: on
            // the chip, resolved as each tile is written): smooth edges on the
            // ships and shapes against space; the swapchain images stay 1 sample
            let samples = rg_gl::gl::ms_samples(eye_samples_wanted());
            for v in instance.enumerate_view_configuration_views(system, VIEW).map_err(err("views"))? {
                let (w, h) = (v.recommended_image_rect_width, v.recommended_image_rect_height);
                let chain = session
                    .create_swapchain(&xr::SwapchainCreateInfo {
                        create_flags: xr::SwapchainCreateFlags::EMPTY,
                        usage_flags: xr::SwapchainUsageFlags::COLOR_ATTACHMENT | xr::SwapchainUsageFlags::SAMPLED,
                        format,
                        sample_count: 1,
                        width: w,
                        height: h,
                        face_count: 1,
                        array_size: 1,
                        mip_count: 1,
                    })
                    .map_err(err("swapchain"))?;
                let images = chain.enumerate_images().map_err(err("swapchain images"))?;
                let mut fbos = Vec::new();
                let mut depth = 0;
                for img in images {
                    let f = rg_gl::gl::create_framebuffer();
                    rg_gl::gl::bind_framebuffer(f);
                    if samples > 1 {
                        rg_gl::gl::framebuffer_texture_ms(img, samples);
                    } else {
                        rg_gl::gl::framebuffer_texture(img);
                    }
                    if depth == 0 {
                        depth = if samples > 1 { rg_gl::gl::create_depth_stencil_ms(w as i32, h as i32, samples) } else { rg_gl::gl::create_depth_stencil(w as i32, h as i32) };
                    } else {
                        rg_gl::gl::attach_depth_stencil(depth);
                    }
                    if !rg_gl::gl::framebuffer_ok() {
                        return Err("an eye's framebuffer is not complete".into());
                    }
                    fbos.push(f);
                }
                rg_gl::gl::bind_framebuffer(0);
                eyes.push(Eye { chain, fbos, depth, w: w as i32, h: h as i32 });
            }

            // the controllers: Touch (Quest), and the simple profile of any headset
            let path = |s: &str| instance.string_to_path(s).map_err(err("path"));
            let (left, right) = (path("/user/hand/left")?, path("/user/hand/right")?);
            let set = instance.create_action_set("rg", "RangerGames", 0).map_err(err("action set"))?;
            let both = [left, right];
            let act = Actions {
                aim: set.create_action("aim", "Aim", &both).map_err(err("action"))?,
                trigger: set.create_action("trigger", "Trigger", &both).map_err(err("action"))?,
                squeeze: set.create_action("squeeze", "Squeeze", &both).map_err(err("action"))?,
                stick: set.create_action("stick", "Stick", &both).map_err(err("action"))?,
                stick_click: set.create_action("stick_click", "Stick press", &both).map_err(err("action"))?,
                a: set.create_action("a", "A / X", &both).map_err(err("action"))?,
                b: set.create_action("b", "B / Y", &both).map_err(err("action"))?,
                menu: set.create_action("menu", "Menu", &both).map_err(err("action"))?,
                buzz: set.create_action("buzz", "Buzz", &both).map_err(err("action"))?,
                set,
            };
            let grip_action: xr::Action<xr::Posef> = act.set.create_action("grip", "Grip", &both).map_err(err("action"))?;
            let mut touch = Vec::new();
            for side in ["left", "right"] {
                let h = |s: &str| path(&format!("/user/hand/{}/{}", side, s));
                touch.push(xr::Binding::new(&act.aim, h("input/aim/pose")?));
                touch.push(xr::Binding::new(&grip_action, h("input/grip/pose")?));
                touch.push(xr::Binding::new(&act.trigger, h("input/trigger/value")?));
                touch.push(xr::Binding::new(&act.squeeze, h("input/squeeze/value")?));
                touch.push(xr::Binding::new(&act.stick, h("input/thumbstick")?));
                touch.push(xr::Binding::new(&act.stick_click, h("input/thumbstick/click")?));
                let (a, b) = if side == "left" { ("input/x/click", "input/y/click") } else { ("input/a/click", "input/b/click") };
                touch.push(xr::Binding::new(&act.a, h(a)?));
                touch.push(xr::Binding::new(&act.b, h(b)?));
                touch.push(xr::Binding::new(&act.buzz, h("output/haptic")?));
            }
            touch.push(xr::Binding::new(&act.menu, path("/user/hand/left/input/menu/click")?));
            instance.suggest_interaction_profile_bindings(path("/interaction_profiles/oculus/touch_controller")?, &touch).map_err(err("Touch bindings"))?;
            let mut simple = Vec::new();
            for side in ["left", "right"] {
                let h = |s: &str| path(&format!("/user/hand/{}/{}", side, s));
                simple.push(xr::Binding::new(&act.aim, h("input/aim/pose")?));
                simple.push(xr::Binding::new(&grip_action, h("input/grip/pose")?));
                simple.push(xr::Binding::new(&act.trigger, h("input/select/click")?));
                simple.push(xr::Binding::new(&act.menu, h("input/menu/click")?));
                simple.push(xr::Binding::new(&act.buzz, h("output/haptic")?));
            }
            // a runtime without the simple profile still has Touch
            let _ = instance.suggest_interaction_profile_bindings(path("/interaction_profiles/khr/simple_controller")?, &simple);
            session.attach_action_sets(&[&act.set]).map_err(err("attach actions"))?;
            let mut hands = Vec::new();
            for (side, p) in [("left", left), ("right", right)] {
                hands.push(Hand {
                    side,
                    path: p,
                    aim: act.aim.create_space(&session, p, xr::Posef::IDENTITY).map_err(err("aim space"))?,
                    grip: grip_action.create_space(&session, p, xr::Posef::IDENTITY).map_err(err("grip space"))?,
                });
            }
            Ok(Quest { _activity: activity, instance, session, waiter, stream, space, head, blend, eyes, srgb, act, hands, running: false, events: xr::EventDataBuffer::new(), last: None })
        }

        /// The session's state changes; false when the app should end.
        fn poll(&mut self) -> Result<bool, String> {
            while let Some(ev) = self.instance.poll_event(&mut self.events).map_err(err("events"))? {
                match ev {
                    xr::Event::SessionStateChanged(e) => match e.state() {
                        xr::SessionState::READY => {
                            self.session.begin(VIEW).map_err(err("begin"))?;
                            self.running = true;
                        }
                        xr::SessionState::STOPPING => {
                            let _ = self.session.end();
                            self.running = false;
                        }
                        xr::SessionState::EXITING | xr::SessionState::LOSS_PENDING => return Ok(false),
                        _ => {}
                    },
                    xr::Event::InstanceLossPending(_) => return Ok(false),
                    _ => {}
                }
            }
            Ok(true)
        }

        fn hands_json(&self, t: xr::Time) -> String {
            let s = &self.session;
            let mut out = Vec::new();
            for h in &self.hands {
                if !self.act.aim.is_active(s, h.path).unwrap_or(false) {
                    continue;
                }
                let aim = h.aim.locate(&self.space, t).map(|l| pose_json(&l)).unwrap_or_else(|_| "null".into());
                if aim == "null" {
                    continue;
                }
                let grip = h.grip.locate(&self.space, t).map(|l| pose_json(&l)).unwrap_or_else(|_| "null".into());
                let f = |a: &xr::Action<f32>| a.state(s, h.path).map(|v| v.current_state).unwrap_or(0.0);
                let b = |a: &xr::Action<bool>| if a.state(s, h.path).map(|v| v.current_state).unwrap_or(false) { 1.0 } else { 0.0 };
                let st = self.act.stick.state(s, h.path).map(|v| v.current_state).unwrap_or(xr::Vector2f { x: 0.0, y: 0.0 });
                // the stick as WebXR gives it: y down
                out.push(format!(
                    r#"{{"side":"{}","aim":{},"grip":{},"buttons":[{},{},{},{},{},{}],"stick":[{},{}]}}"#,
                    h.side,
                    aim,
                    grip,
                    f(&self.act.trigger),
                    f(&self.act.squeeze),
                    b(&self.act.stick_click),
                    b(&self.act.a),
                    b(&self.act.b),
                    b(&self.act.menu),
                    st.x,
                    -st.y
                ));
            }
            format!("[{}]", out.join(","))
        }

        /// The game's rg.xr.pulse calls (taken out of the commands the app gets).
        fn pulses(&self, cmds: &mut Vec<rg_core::host::HostCommand>) {
            cmds.retain(|c| {
                if c.kind != "xr" || c.name != "pulse" {
                    return true;
                }
                let hand = c.args.get("hand").as_str();
                let k = c.args.get("strength").as_num(0.6).clamp(0.0, 1.0) as f32;
                let ms = c.args.get("ms").as_num(60.0).clamp(1.0, 2000.0);
                let vib = xr::HapticVibration::new().amplitude(k).frequency(xr::FREQUENCY_UNSPECIFIED).duration(xr::Duration::from_nanos((ms * 1e6) as i64));
                for h in &self.hands {
                    if hand.is_empty() || hand == "both" || hand == h.side {
                        let _ = self.act.buzz.apply_feedback(&self.session, h.path, &vib);
                    }
                }
                false
            });
        }

        pub(super) fn frame(&mut self, env: &mut JNIEnv) -> Result<i32, String> {
            if !self.poll()? {
                return Ok(-1);
            }
            if !self.running {
                return Ok(0);
            }
            let fs = self.waiter.wait().map_err(err("wait"))?;
            self.stream.begin().map_err(err("begin frame"))?;
            let t = fs.predicted_display_time;
            if !fs.should_render {
                self.stream.end(t, self.blend, &[]).map_err(err("end frame"))?;
                return Ok(0);
            }
            let dt = match self.last {
                Some(l) => ((t.as_nanos() - l.as_nanos()) as f64 / 1e6).clamp(0.0, 100.0),
                None => 11.1,
            };
            self.last = Some(t);
            let _ = self.session.sync_actions(&[(&self.act.set).into()]);
            let (_, views) = self.session.locate_views(VIEW, t, &self.space).map_err(err("views"))?;
            let head = self.head.locate(&self.space, t).map(|l| pose_json(&l)).unwrap_or_else(|_| "null".into());
            let vs: Vec<String> = views
                .iter()
                .map(|v| {
                    let (p, q, f) = (v.pose.position, v.pose.orientation, v.fov);
                    format!(
                        r#"{{"p":[{},{},{}],"q":[{},{},{},{}],"t":[{},{},{},{}]}}"#,
                        p.x, p.y, p.z, q.x, q.y, q.z, q.w,
                        (-f.angle_left).tan(), f.angle_right.tan(), f.angle_up.tan(), (-f.angle_down).tan()
                    )
                })
                .collect();
            let input = format!(r#"{{"views":[{}],"head":{},"hands":{}}}"#, vs.join(","), head, self.hands_json(t));
            // the game's frame, as Engine.frame does it, the buzzes taken out
            let mut cmds = with(|e| {
                e.xr_input(&input);
                let _ = e.frame(dt);
                e.take_host_commands()
            });
            self.pulses(&mut cmds);
            with(|e| {
                e.commands.extend(cmds);
                publish(e);
            });
            // the panel: the game's 2D view, about 2.5 pixels a game unit
            {
                let mut host = JniGlHost { env: &mut *env, strings: None };
                with_ref(|e| {
                    let (gw, gh) = (e.ui.width.max(1.0), e.ui.height.max(1.0));
                    let k = (2048.0 / gw.max(gh)).min(2.5);
                    let (w, h) = ((gw * k).round() as i32, (gh * k).round() as i32);
                    let v = rg_gl::View { scale: 1.0, x: 0.0, y: 0.0, w: gw as f32, h: gh as f32, density: w as f32 / gw as f32, width: w, height: h };
                    GL.with(|gl| gl.borrow_mut().render_panel(&mut host, &e.draw.nums, &e.draw.strings, &e.scene.tris, &v));
                });
            }
            let n = with(|e| e.xr_eyes()).min(views.len()).min(self.eyes.len());
            // each eye's part of its image with square pixels for its field of
            // view (the painter has one scale for x and y)
            let rects: Vec<(i32, i32)> = (0..n)
                .map(|i| {
                    let (f, e) = (views[i].fov, &self.eyes[i]);
                    let a = ((f.angle_up.tan() - f.angle_down.tan()) / (f.angle_right.tan() - f.angle_left.tan())).max(1e-3) as f64;
                    let h = (e.w as f64 * a).round() as i32;
                    if h <= e.h { (e.w, h.max(1)) } else { (((e.h as f64 / a).round() as i32).max(1), e.h) }
                })
                .collect();
            for i in 0..n {
                let eye = &mut self.eyes[i];
                let idx = eye.chain.acquire_image().map_err(err("acquire"))? as usize;
                eye.chain.wait_image(xr::Duration::INFINITE).map_err(err("wait image"))?;
                let (fbo, (w, h)) = (eye.fbos[idx], rects[i]);
                if with(|e| e.xr_eye(i)) {
                    if self.srgb {
                        rg_gl::gl::disable(GL_FRAMEBUFFER_SRGB_EXT);
                    }
                    // read only while painting: the host's globes read files (Engine.read)
                    let mut host = JniGlHost { env: &mut *env, strings: None };
                    with_ref(|e| {
                        let (uw, uh) = e.xr_eye_size(i);
                        let stream = e.xr_eye_view(w).map(|v| rg_gl::EyeStream {
                            host: &mut host,
                            nums: &e.xr_draw.nums,
                            strings: &e.xr_draw.strings,
                            view: rg_gl::View { scale: v[0], x: v[1], y: v[2], w: v[3], h: v[4], density: 1.0, width: w, height: h },
                        });
                        GL.with(|gl| gl.borrow_mut().render_eye(fbo, [0, 0, w, h], (uw as f32, uh as f32), &e.scene.tris, e.xr_panel.as_deref(), &e.xr_over, [0.0, 0.0, 0.0, 1.0], stream));
                    });
                    // the samples are averaged into the image as the framebuffer is left
                    rg_gl::gl::bind_framebuffer(fbo);
                    rg_gl::gl::discard_depth_stencil();
                    rg_gl::gl::bind_framebuffer(0);
                    if self.srgb {
                        rg_gl::gl::enable(GL_FRAMEBUFFER_SRGB_EXT);
                    }
                }
                eye.chain.release_image().map_err(err("release"))?;
            }
            if n == 0 {
                self.stream.end(t, self.blend, &[]).map_err(err("end frame"))?;
                return Ok(1);
            }
            let pv: Vec<xr::CompositionLayerProjectionView<xr::OpenGlEs>> = (0..n)
                .map(|i| {
                    let e = &self.eyes[i];
                    xr::CompositionLayerProjectionView::new().pose(views[i].pose).fov(views[i].fov).sub_image(
                        xr::SwapchainSubImage::new()
                            .swapchain(&e.chain)
                            .image_array_index(0)
                            .image_rect(xr::Rect2Di { offset: xr::Offset2Di { x: 0, y: 0 }, extent: xr::Extent2Di { width: rects[i].0, height: rects[i].1 } }),
                    )
                })
                .collect();
            let layer = xr::CompositionLayerProjection::new().space(&self.space).views(&pv);
            self.stream.end(t, self.blend, &[&layer]).map_err(err("end frame"))?;
            Ok(1)
        }
    }

    impl Drop for Quest {
        fn drop(&mut self) {
            for e in &self.eyes {
                for f in &e.fbos {
                    rg_gl::gl::delete_framebuffer(*f);
                }
                rg_gl::gl::delete_renderbuffer(e.depth);
            }
        }
    }
}

#[cfg(target_os = "android")]
thread_local! {
    static QUEST: RefCell<Option<quest::Quest>> = const { RefCell::new(None) };
}

#[cfg(target_os = "android")]
fn xr_log(e: &str) {
    LOG.with(|b| {
        let mut b = b.borrow_mut();
        if !b.is_empty() {
            b.push('\n');
        }
        b.push_str("VR: ");
        b.push_str(e);
    });
}

/// Starts OpenXR in the current GL context (the game thread's); false when
/// there is no headset (Engine.log() says why).
#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_xrStart(mut env: JNIEnv, _c: JClass, activity: jni::objects::JObject) -> jboolean {
    match quest::Quest::start(&mut env, &activity) {
        Ok(q) => {
            xr_log(if q.srgb_eyes() { "eyes sRGB (write conversion off)" } else { "eyes RGBA8" });
            QUEST.with(|s| *s.borrow_mut() = Some(q));
            // the game shows in the headset from the start: a panel in a room
            with(|e| e.xr_input(r#"{"event":"caps","vr":true,"always":true}"#));
            1
        }
        Err(e) => {
            xr_log(&e);
            0
        }
    }
}

/// One headset frame (the game's frame in it): 1 drawn, 0 waiting, -1 the end.
#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_xrFrame(mut env: JNIEnv, _c: JClass) -> jint {
    let taken = QUEST.with(|s| s.borrow_mut().take());
    let Some(mut q) = taken else { return -1 };
    let r = match q.frame(&mut env) {
        Ok(r) => r,
        Err(e) => {
            xr_log(&e);
            -1
        }
    };
    QUEST.with(|s| *s.borrow_mut() = Some(q));
    r
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_fi_rangergames_Engine_xrStop(_env: JNIEnv, _c: JClass) {
    QUEST.with(|s| s.borrow_mut().take());
}
