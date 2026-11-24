# VR: rg.xr

A game's 3D world (`<scene3d>` or `rg.three`) can be shown around the player:

- **"vr"**: in a headset. On a Meta Quest (3, 3S, Pro, 2) the Android app
  runs in VR itself (OpenXR), and the web version runs in the Quest browser
  (WebXR). A desktop browser with a headset or the WebXR emulator works too.
- **"stereo"**: a phone in a cardboard viewer. The picture is drawn twice side
  by side and turning the phone looks around (`rg.sensor("orient")`).

The game camera is where the head is. The game's 2D view (its `view()`)
floats in front as a **panel**; the controllers' rays point at it and the
trigger taps it like a finger. A trigger pointed past the panel clicks the 3D
object it hits (`onClick` on a mesh, the same raycast as a tap).

When a game is not in VR, a headset still shows it: the panel in an empty
room (sky and floor), so every game plays in the Quest app.

## The API

```js
rg.xr.enter("vr", { scale: 1, rig: "yaw", panel: { distance: 1.3, size: 1.0 } });
rg.xr.enter("stereo", { fov: 85, panel: false });
rg.xr.exit();
rg.xr.recenter();             // "ahead" is where the head looks now
rg.xr.set({ panel: false });  // options while in VR
rg.xr.pulse("right", 0.6, 60); // a controller's buzz: hand, strength 0…1, ms
rg.xr.supported();            // { vr, stereo }

function onXR(e) {
  // e.type: "start" | "end" | "error" | "button"
  // e.mode, e.hand ("left" | "right"), e.button ("trigger", "squeeze",
  // "stick", "a", "b", "menu"), e.down, e.reason
}
```

Options:

| option | meaning |
| --- | --- |
| `scale` | game units in a metre (1: one unit is one metre) |
| `rig` | `"yaw"` (default): the camera's heading is ahead, the floor stays level; `"full"`: its whole turn (a cockpit that rolls); `"fixed"`: the camera's place only |
| `panel` | `false`, or `{ visible, distance (m), size (its longer side, m), drop (m below the eyes), follow (true: it comes back in front when the head turns away) }` |
| `fov` | stereo: the field of view in degrees |
| `ipd` | stereo: the distance between the eyes in metres (0.063) |

`rg.xr.state`, updated every frame:

```js
{ mode: "vr" | "stereo" | "", running, vr /* a headset is there */, headset /* drawn in one now */,
  head: { position, quaternion },
  hands: [{ hand, position, quaternion, ray: { origin, direction },
            trigger, squeeze, stick: [x, y], a, b, menu, onPanel }] }
```

Positions are in the game's world (the camera's place plus the head's offset
times `scale`). `games/vrtesti` (hidden in the launcher; `?game=vrtesti`) is
a small test: balls around the player to pop with the trigger.

## How it is drawn

`crates/rg_engine/src/xr.rs` holds the tracking (eyes, head, controllers,
recentring, the panel). Each headset frame the host sends the eyes' poses and
fields of view and the controllers (`Engine::xr_input`), the engine runs the
game's frame, then the host paints the frame's 2D view into the panel's
texture (`rg_gl::Renderer::render_panel`) and each eye
(`Engine::xr_eye` → `Renderer::render_eye`): the 3D world depth-tested, the
panel, then the controllers' rays over everything.

- web: `web/js/xr.js` (WebXR, `XRWebGLLayer`), with the WebGL2 painter
  (`?gl=1`, on by default in the Quest browser).
- Android: `crates/rg_android/src/xr_android.rs` (OpenXR through the Khronos
  loader, `org.khronos.openxr:openxr_loader_for_android` in
  `android/app/build.gradle`) and `XrActivity.java`. `MainActivity` starts
  `XrActivity` when the device is a headset.
- stereo: inside the engine (both eyes into one triangle list, each cut to its
  half of the screen), so it works on every host.

Not yet in VR:

- the globes, planets and stars of `rg.three` (`planet`, `stars`) are not
  drawn in the eyes; meshes, boxes, spheres, glTF models and lights are.
- the panel is drawn over the world without depth (a 3D object in front of it
  does not hide it).
- stereo has no lens distortion correction.

## Trying it on a Meta Quest 3S

Once (on the phone app *Meta Horizon*): Menu → Devices → the headset →
Headset settings → Developer mode on. This needs a Meta developer account
(free, developers.meta.com) with the same Meta account.

The web version: open `https://<the site>/?game=vrtesti` in the Quest
browser, press **VR**, allow the immersive session.

The Android app (from the Mac):

```sh
# the headset on USB-C; allow USB debugging in the headset when it asks
adb devices
adb install -r RangerGames.apk            # the same full APK as the phone's
adb shell am start -n fi.rangergames/.MainActivity
adb logcat -s RangerGames                 # "VR on", or "VR: …" telling why not
```

The app is in the headset's library under *Unknown sources*. It starts in VR
(XrActivity). To run it flat as a 2D window instead:

```sh
adb shell am start -n fi.rangergames/.MainActivity --ez flat true
```

Controllers: the trigger taps the panel or clicks a 3D object, the stick
press, A/B and X/Y come to `onXR` as buttons, the Meta button recentres (the
system's own).
