// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.PixelFormat;
import android.graphics.PorterDuff;
import android.opengl.GLSurfaceView;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.MotionEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.FileInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * The RangerGames app, natively: the engine (librg_android.so, Rust) runs
 * on a game thread, and this activity paints each frame's draw stream on a
 * SurfaceView's Canvas ({@link Painter}), plays the sounds ({@link Sound}),
 * vibrates, keeps the saves and passes touches and the Back button to the
 * game. A game's 3D scene goes under it on a GLSurfaceView with a depth
 * buffer ({@link Gl3D}). No WebView and no WebAssembly, so it runs on old phones as well.
 */
public class MainActivity extends Activity implements SurfaceHolder.Callback, Runnable {
    private static final String TAG = "RangerGames";
    private SurfaceView view;
    private GLSurfaceView glView;
    private final Gl3D gl3d = new Gl3D();
    private Painter painter;
    private final Sound sound = new Sound();
    private Sensors sensors;
    private Mic mic;
    private Camera camera;
    private Bluetooth bluetooth;
    private Store store;
    /** dev reload from the computer (scripts/dev.sh), null when off */
    private DevLink dev;
    private SharedPreferences saves;
    private Thread thread;
    private volatile boolean running;
    private volatile boolean paused;
    private volatile SurfaceHolder surface;
    private volatile int width, height;
    private float density = 1;
    /** the GL view shows a 3D scene (game thread only) */
    private boolean glShown;
    /**
     * Everything painted with GLES 3 into the SurfaceView (crates/rg_gl,
     * Engine.glRender): the default; the launcher's ⚙ → Piirto chooses
     * Canvas (Painter on Android's 2D canvas, 3D in the GL view under it),
     * as does a device where GL fails (saves "glFailed").
     */
    private boolean glPaint;
    private GlCtx glCtx;
    /** the window going away: the game thread lets go of it first (surfaceDestroyed waits) */
    private final Object glLock = new Object();
    private boolean glLetGo;
    private int glFrames;
    /** the time since the last frame, ms (unclamped, for GlAutoRes) */
    private double lastRealMs = 16;
    /** even frames for the GL painter */
    private FramePacer pacer;
    /** the display's vsync times (Choreographer) for the engine's frame clock */
    private VsyncClock vsync;
    private long glStatsAt;
    private static final String SETTINGS = "/save/_settings.json";
    /** touches and keys for the game thread: {kind, id, x, y} or a key name */
    private final ConcurrentLinkedQueue<Object> input = new ConcurrentLinkedQueue<>();

    /** XrActivity: the game shows in a VR headset (OpenXR), on a panel in a room or around the player (rg.xr). */
    protected boolean xrMode() {
        return false;
    }

    /** A VR headset (Meta Quest and others with head tracking). */
    static boolean headset(Context c) {
        String m = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        return c.getPackageManager().hasSystemFeature("android.hardware.vr.headtracking") || m.equalsIgnoreCase("Oculus") || m.equalsIgnoreCase("Meta");
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // on a headset the app runs in VR (XrActivity), unless started flat
        // (adb shell am start -n fi.rangergames/.MainActivity --ez flat true)
        if (!xrMode() && headset(this) && !getIntent().getBooleanExtra("flat", false)) {
            // (the extras go along: --es game <id> starts that game, also a hidden one such as vrtesti)
            startActivity(new Intent(this, XrActivity.class).putExtras(getIntent()));
            finish();
            return;
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        density = getResources().getDisplayMetrics().density;
        keepTopRefresh();
        vsync = new VsyncClock(getWindowManager().getDefaultDisplay());
        saves = getSharedPreferences("saves", MODE_PRIVATE);
        glPaint = xrMode() || (!"canvas".equals(paintSetting()) && !saves.getBoolean("glFailed", false));
        painter = new Painter(getAssets());
        sensors = new Sensors(this, input);
        mic = new Mic(this, input, sound);
        camera = new Camera(this, input);
        bluetooth = new Bluetooth(this, input);
        store = new Store(this, input);
        // the 3D scene (GLES, depth-tested) under the 2D view, which is
        // transparent where nothing is painted
        // (GL painting: one opaque surface, no GL view)
        if (!glPaint) {
            glView = new GLSurfaceView(this);
            glView.setEGLContextClientVersion(2);
            glView.setEGLConfigChooser(new Gl3D.Config());
            glView.setRenderer(gl3d);
            glView.setRenderMode(GLSurfaceView.RENDERMODE_WHEN_DIRTY);
        }
        view = new SurfaceView(this);
        if (!glPaint) {
            view.setZOrderMediaOverlay(true);
            view.getHolder().setFormat(PixelFormat.TRANSLUCENT);
        } else {
            view.getHolder().setFormat(PixelFormat.RGBA_8888);
        }
        view.getHolder().addCallback(this);
        view.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent e) {
                touch(e);
                return true;
            }
        });
        FrameLayout root = new FrameLayout(this);
        if (glView != null) root.addView(glView);
        root.addView(view);
        setContentView(root);
        immersive();
        // one game thread for the activity's life: the engine lives on it
        running = true;
        thread = new Thread(this, "rg-game");
        thread.start();
    }

    private void immersive() {
        view.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) immersive();
    }

    private void touch(MotionEvent e) {
        int action = e.getActionMasked();
        if (action == MotionEvent.ACTION_MOVE) {
            for (int i = 0; i < e.getPointerCount(); i++) {
                input.add(new float[]{1, e.getPointerId(i) + 1, e.getX(i) / density, e.getY(i) / density});
            }
            return;
        }
        int kind;
        if (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_POINTER_DOWN) kind = 0;
        else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_POINTER_UP || action == MotionEvent.ACTION_CANCEL) kind = 2;
        else return;
        int i = e.getActionIndex();
        input.add(new float[]{kind, e.getPointerId(i) + 1, e.getX(i) / density, e.getY(i) / density});
    }

    /** Back goes to the game; the launcher's Back closes the app (the "quit" command). */
    @Override
    public void onBackPressed() {
        input.add("Back");
    }

    @Override
    protected void onResume() {
        super.onResume();
        paused = false;
        if (vsync != null) vsync.start();
        if (glView != null) glView.onResume();
        sound.start();
        sound.setPaused(false);
        sensors.resume();
        mic.resume();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (code == Sensors.PERMISSION_REQUEST) sensors.permissionResult(granted);
        else if (code == Mic.PERMISSION_REQUEST) mic.permissionResult(granted);
        else if (code == Camera.REQ_PERM) camera.permissionResult(granted);
        else if (code == Bluetooth.REQ_PERM) {
            boolean all = results.length > 0;
            for (int r : results) if (r != PackageManager.PERMISSION_GRANTED) all = false;
            bluetooth.permissionResult(all);
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == Camera.REQ_SHOT) camera.result(result);
        else if (code == Bluetooth.REQ_ENABLE || code == Bluetooth.REQ_VISIBLE) bluetooth.activityResult(code, result);
    }

    @Override
    protected void onPause() {
        super.onPause();
        paused = true;
        if (vsync != null) vsync.stop();
        if (glView != null) glView.onPause();
        sound.setPaused(true);
        sound.stop();
        sensors.pause();
        mic.pause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        running = false;
        // (null: the activity handed over to XrActivity at once)
        if (bluetooth != null) bluetooth.destroy();
        if (dev != null) dev.stop();
        if (thread != null) {
            try {
                thread.join(1000);
            } catch (InterruptedException ignored) {
            }
        }
    }

    @Override
    public void surfaceCreated(SurfaceHolder h) {
        surface = h;
        fixedFrameRate(h);
    }

    /**
     * The display's fastest mode at its resolution for the game's window: the
     * pacer shows a picture every 1, 2 or 3 of its frames (90 / 45 / 30 a
     * second on a 90 Hz tablet). Without this the system lowered the tablet
     * to 60 Hz when the pictures came 45 a second, and 45 on a 60 Hz screen is
     * 16 / 33 ms between pictures again.
     */
    private void keepTopRefresh() {
        try {
            android.view.Display d = getWindowManager().getDefaultDisplay();
            android.view.Display.Mode now = d.getMode(), best = now;
            for (android.view.Display.Mode m : d.getSupportedModes()) {
                if (m.getPhysicalWidth() == now.getPhysicalWidth() && m.getPhysicalHeight() == now.getPhysicalHeight()
                        && m.getRefreshRate() > best.getRefreshRate() + 0.5f) best = m;
            }
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.preferredDisplayModeId = best.getModeId();
            getWindow().setAttributes(lp);
            Log.i(TAG, "display mode " + best.getModeId() + ": " + best.getRefreshRate() + " Hz");
        } catch (Throwable t) {
            Log.w(TAG, "display mode: " + t);
        }
    }

    /** Android 11+: the surface's pictures keep the display's own rate (Surface.setFrameRate, FIXED_SOURCE). */
    private void fixedFrameRate(SurfaceHolder h) {
        if (android.os.Build.VERSION.SDK_INT < 30 || h == null) return;
        try {
            float hz = 0;
            for (android.view.Display.Mode m : getWindowManager().getDefaultDisplay().getSupportedModes()) hz = Math.max(hz, m.getRefreshRate());
            android.view.Surface.class.getMethod("setFrameRate", float.class, int.class).invoke(h.getSurface(), hz, 1);
        } catch (Throwable t) {
            Log.w(TAG, "setFrameRate: " + t);
        }
    }

    @Override
    public void surfaceChanged(SurfaceHolder h, int format, int w, int hgt) {
        width = w;
        height = hgt;
        surface = h;
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder h) {
        surface = null;
        if (!glPaint) return;
        // EGL must let go of the window before it is gone
        synchronized (glLock) {
            glLetGo = false;
            long until = System.currentTimeMillis() + 1000;
            while (!glLetGo && running && thread != null && thread.isAlive()) {
                long left = until - System.currentTimeMillis();
                if (left <= 0) break;
                try {
                    glLock.wait(left);
                } catch (InterruptedException e) {
                    break;
                }
            }
        }
    }

    /** the launcher's choice of painting (settings "paint"): "gl", "canvas" or "" */
    private String paintSetting() {
        try {
            return new JSONObject(saves.getString(SETTINGS, "{}")).optString("paint", "");
        } catch (Exception e) {
            return "";
        }
    }

    /** GL painting failed on this device: Canvas from now on (until the ⚙ chooses GL again), started again. */
    private void glFailed(String why) {
        Log.w(TAG, "GL painting failed, Canvas from now on: " + why);
        saves.edit().putBoolean("glFailed", true).commit();
        restart();
    }

    private void restart() {
        running = false;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                recreate();
            }
        });
    }

    private static byte[] asset(Context c, String name) throws Exception {
        try (InputStream in = c.getAssets().open(name)) {
            // straight into an array of its own size: a growing buffer doubles (a 134 MB pack asked
            // for 268 MB and the app died at start with OutOfMemoryError); an asset's stream knows its length
            int len = in.available();
            if (len > 0) {
                byte[] all = new byte[len];
                int off = 0, n;
                while (off < len && (n = in.read(all, off, len - off)) > 0) off += n;
                int more = off == len ? in.read() : 0;
                if (more < 0) return all;
                ByteArrayOutputStream rest = new ByteArrayOutputStream();
                rest.write(all, 0, off);
                if (off == len) rest.write(more);
                byte[] b = new byte[65536];
                while ((n = in.read(b)) > 0) rest.write(b, 0, n);
                return rest.toByteArray();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] b = new byte[65536];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
            return out.toByteArray();
        }
    }

    /**
     * Games that never go to git (family photos, home places) come as their own
     * pack beside the app, pushed from the computer:
     *   adb push private.rgpk /sdcard/Android/data/fi.rangergames/files/private.rgpk
     * (scripts/private-pack.sh makes and pushes it). The APK itself, built by CI,
     * has only the public games; this one adds to them, over the same /games.
     */
    private void mountPrivate() {
        try {
            File dir = getExternalFilesDir(null);
            if (dir == null) return;
            File f = new File(dir, "private.rgpk");
            if (!f.isFile()) {
                Log.i("RangerGames", "private.rgpk: none in " + dir);
                return;
            }
            byte[] data = new byte[(int) f.length()];
            try (InputStream in = new FileInputStream(f)) {
                int off = 0, r;
                while (off < data.length && (r = in.read(data, off, data.length - off)) > 0) off += r;
            }
            int n = Engine.mount("/games", data);
            Log.i("RangerGames", "private.rgpk: " + n + " files");
        } catch (Throwable t) {
            Log.w("RangerGames", "private.rgpk not mounted", t);
        }
    }

    /** The games' pack into the virtual directory, the saves back, the launcher started. */
    private void boot() throws Exception {
        sound.setAssets(getAssets());
        int n = Engine.mount("/games", asset(this, "games.rgpk"));
        if (n < 0) throw new IllegalStateException("games.rgpk is not a pack");
        mountPrivate();
        // games installed from the download list (⚙️ → Lataa pelejä)
        store.mountAll();
        // and new versions of them, in the background, now and every few hours
        store.autoUpdate();
        Engine.store(true);
        dev = DevLink.start(this, getIntent());
        for (Map.Entry<String, ?> e : saves.getAll().entrySet()) {
            if (e.getKey().startsWith("/save/") && e.getValue() instanceof String) {
                Engine.put(e.getKey(), ((String) e.getValue()).getBytes(StandardCharsets.UTF_8));
            }
        }
        for (Object[] f : camera.stored()) Engine.put((String) f[0], (byte[]) f[1]);
        Engine.seed(System.currentTimeMillis() % 2147483647L);
        Engine.textures(true);
        Engine.terrain(true);
        Engine.paints(true);
        if (glPaint) {
            glCtx = new GlCtx();
            if (!glCtx.init()) {
                glCtx = null;
                glFailed("no GLES 3.0 context");
                throw new IllegalStateException("GL painting: no context");
            }
            Engine.glAll(true);
            GlHost.painter = painter;
            // the globes on the GPU in the same context, drawn into textures
            Engine.detail(painter.startGlShared());
            Log.i(TAG, "GL painting on");
        } else {
            // the globes on the GPU, with the detail pictures; else in software without them
            Engine.detail(painter.startGl());
        }
        Engine.splats(painter.canSplats());
        // adb shell am start -n fi.rangergames/.MainActivity --es game vrtesti: that game at once
        String first = getIntent().getStringExtra("game");
        if (first == null || first.isEmpty() || Engine.start(first) != 0) Engine.start("");
        afterCall();
    }

    @Override
    public void run() {
        try {
            boot();
        } catch (Throwable t) {
            Log.e(TAG, "boot failed", t);
            return;
        }
        if (xrMode()) {
            xrLoop();
            if (glCtx != null) glCtx.release();
            return;
        }
        int lastW = 0, lastH = 0;
        boolean glOn = false;
        long last = System.nanoTime();
        while (running) {
            SurfaceHolder h = surface;
            int w = width, hgt = height;
            if (glCtx != null && (paused || h == null)) {
                // the window is going (or gone): back to the pbuffer, and say so
                glCtx.detach();
                synchronized (glLock) {
                    glLetGo = true;
                    glLock.notifyAll();
                }
            }
            if (paused || h == null || w == 0) {
                sleep(16);
                last = System.nanoTime();
                continue;
            }
            if (w != lastW || hgt != lastH) {
                Engine.resize(w / density, hgt / density);
                lastW = w;
                lastH = hgt;
            }
            takeInput();
            long t = System.nanoTime();
            double dt = Math.min(100, (t - last) / 1e6);
            lastRealMs = (t - last) / 1e6;
            last = t;
            // the frame's vsync: the engine steps whole display frames from it, the rest carried
            long vs = vsync != null ? vsync.frameTime(t) : 0;
            if (glPaint) {
                if (pacer == null) pacer = new FramePacer(getWindowManager().getDefaultDisplay().getRefreshRate());
                pacer.paced = glCtx.presentTime && vs != 0;
                // the display's frame as it is now (the system may change the mode)
                if (vs != 0) pacer.period(vsync.periodMs());
                dt = pacer.step(dt);
                long present = 0;
                if (pacer.paced) {
                    // each picture given its vsync (eglPresentationTimeANDROID): an
                    // even 45 or 30 a second where the driver ignores the swap interval
                    glCtx.interval(1);
                    present = pacer.present(vs, vsync.periodNs);
                    long wait = pacer.ahead(present, t, vsync.periodNs);
                    if (wait > 0) {
                        sleepNs(wait);
                        t = System.nanoTime();
                    }
                    Engine.frameAt(present / 1e6, vsync.periodMs());
                } else {
                    glCtx.interval(pacer.interval);
                    if (vs != 0) Engine.frameAt(vs / 1e6, vsync.periodMs());
                    else Engine.frame(dt);
                }
                afterCall();
                if (!running) break;
                glPaintFrame(h, t, present);
                continue;
            }
            // the 3D scene as triangles for the GL view once its context works
            if (gl3d.ready != glOn) {
                glOn = gl3d.ready;
                Engine.gl3d(glOn);
            }
            if (vs != 0) Engine.frameAt(vs / 1e6, vsync.periodMs());
            else Engine.frame(dt);
            afterCall();
            float[] tris = glOn ? Engine.tris() : null;
            boolean has3d = tris != null && tris.length > 0;
            float[] nums = Engine.draw();
            String strings = Engine.strings();
            double[] v = {Engine.view(0), Engine.view(1), Engine.view(2), Engine.view(3), Engine.view(4)};
            if (has3d || glShown) {
                gl3d.submit(has3d ? tris : null, v, density);
                glView.requestRender();
                glShown = has3d;
            }
            Canvas c = null;
            try {
                c = Build.VERSION.SDK_INT >= 26 ? h.getSurface().lockHardwareCanvas() : h.lockCanvas();
                if (c != null) {
                    // over the 3D the 2D view is cleared to transparent
                    if (has3d) c.drawColor(0, PorterDuff.Mode.CLEAR);
                    painter.paint(c, nums != null ? nums : new float[0], strings != null ? strings.split("\u0000", -1) : new String[0], v, density, has3d ? 0 : 0xff000000);
                }
            } catch (Exception e) {
                Log.w(TAG, "paint", e);
            } finally {
                if (c != null) {
                    try {
                        if (Build.VERSION.SDK_INT >= 26) h.getSurface().unlockCanvasAndPost(c);
                        else h.unlockCanvasAndPost(c);
                    } catch (Exception ignored) {
                    }
                }
            }
            // frames a second, as the GL path logs them (comparing the two)
            glFrames++;
            long now = System.nanoTime();
            if (glStatsAt == 0) glStatsAt = now;
            if (now - glStatsAt > 5_000_000_000L) {
                Log.i(TAG, String.format(java.util.Locale.ROOT, "Canvas paint: %.1f fps", glFrames * 1e9 / (now - glStatsAt)));
                glFrames = 0;
                glStatsAt = now;
            }
            // the hardware canvas waits for the display's frame; keep to about 60 fps otherwise
            long spent = (System.nanoTime() - t) / 1000000;
            if (spent < 15) sleep(15 - spent);
        }
        if (glCtx != null) glCtx.release();
    }

    /** Touches, keys, sensors and other threads' results to the engine (game thread). */
    private void takeInput() {
        Object in;
        while ((in = input.poll()) != null) {
            if (in instanceof Runnable) {
                // the download list's results, done on this thread (Store)
                ((Runnable) in).run();
                afterCall();
            } else if (in instanceof Object[] && !(in instanceof String[])) {
                // a file for the virtual directory (a photo), then its event
                Object[] f = (Object[]) in;
                Engine.put((String) f[0], (byte[]) f[1]);
            } else if (in instanceof String[]) {
                String[] sv = (String[]) in;
                Engine.sensor(sv[0], sv[1]);
            } else if (in instanceof String) {
                // the Back button is one key down, as the web host sends it
                Engine.key(true, (String) in);
                afterCall();
            } else {
                float[] p = (float[]) in;
                Engine.pointer((int) p[0], (int) p[1], p[2], p[3]);
            }
        }
    }

    /**
     * XrActivity's loop: OpenXR draws the game into the headset (Engine.xrFrame
     * runs the game's frame and waits for the headset's display); without a
     * headset the app starts again flat.
     */
    private void xrLoop() {
        // the game's view on the panel: a phone held upright
        Engine.resize(405, 720);
        if (!Engine.xrStart(this)) {
            afterCall();
            Log.w(TAG, "VR: no headset session, the flat app instead");
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startActivity(new Intent(MainActivity.this, MainActivity.class).putExtra("flat", true));
                    finish();
                }
            });
            return;
        }
        afterCall();
        Log.i(TAG, "VR on");
        while (running) {
            takeInput();
            int r = Engine.xrFrame();
            afterCall();
            if (r < 0) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        finish();
                    }
                });
                break;
            }
            if (r == 0) {
                sleep(10);
                continue;
            }
            // a headset frame painted (both eyes): the same end of a frame as glPaintFrame's, so that the next
            // decoded picture may be uploaded (GlHost, GlSphere: one a frame) and unused globe textures let go;
            // without it only the first picture ever came and the textures were never freed in VR
            painter.glFrameDone();
            GlHost.frameDone();
        }
        Engine.xrStop();
    }

    /** The frame painted with GL into the window, then shown (eglSwapBuffers keeps to the display's pace). */
    private void glPaintFrame(SurfaceHolder h, long t, long present) {
        if (!glCtx.attach(h.getSurface())) {
            sleep(16);
            return;
        }
        int w = glCtx.width(), hgt = glCtx.height();
        if (!Engine.glRender(w, hgt, density, 0, 0, 0)) {
            glFailed(Engine.glStats());
            return;
        }
        painter.glFrameDone();
        GlHost.frameDone();
        double workMs = (System.nanoTime() - t) / 1e6;
        if (pacer != null) {
            pacer.worked(workMs);
            painter.glPace(lastRealMs, workMs, pacer.slot());
        }
        glCtx.presentAt(present);
        glCtx.swap();
        glFrames++;
        long now = System.nanoTime();
        if (glStatsAt == 0) glStatsAt = now;
        if (now - glStatsAt > 5_000_000_000L) {
            // logcat RangerGames: frames a second and the painter's numbers
            Log.i(TAG, String.format(java.util.Locale.ROOT, "GL paint: %.1f fps (swap %d), %s", glFrames * 1e9 / (now - glStatsAt), pacer != null ? pacer.interval : 1, Engine.glStats()));
            glFrames = 0;
            glStatsAt = now;
        }
    }

    private static void sleepNs(long ns) {
        try {
            Thread.sleep(ns / 1_000_000L, (int) (ns % 1_000_000L));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
        }
    }

    /** The engine's log to logcat, and what the game asked for done. */
    private void afterCall() {
        String log = Engine.log();
        if (log != null && !log.isEmpty()) {
            Log.i(TAG, log);
            if (dev != null) dev.log(log);
        }
        commands();
        // dev reload: files from the computer between frames, then what the restarted game asked for
        if (dev != null && dev.apply(painter, sound)) {
            String more = Engine.log();
            if (more != null && !more.isEmpty()) {
                Log.i(TAG, more);
                dev.log(more);
            }
            commands();
        }
    }

    private void commands() {
        String cmds = Engine.commands();
        if (cmds == null || cmds.isEmpty() || cmds.equals("[]")) return;
        try {
            JSONArray list = new JSONArray(cmds);
            for (int i = 0; i < list.length(); i++) {
                JSONArray c = list.getJSONArray(i);
                command(c.optString(0), c.optString(1), c.length() > 2 ? c.opt(2) : null);
            }
        } catch (Exception e) {
            Log.w(TAG, "commands: " + cmds, e);
        }
    }

    private void command(String kind, String name, Object args) {
        JSONObject opts = args instanceof JSONObject ? (JSONObject) args : null;
        switch (kind) {
            case "sound": sound.play(name, opts); break;
            case "say": sound.say(opts); break;
            case "music": sound.music(name, opts); break;
            case "stop": sound.stopMusic(opts); break;
            case "soundctl": sound.control(name, opts); break;
            case "vibrate": vibrate(args); break;
            case "copy": copy(String.valueOf(args)); break;
            case "sensor":
                sensors.set(name, !Boolean.FALSE.equals(args));
                if (name.equals("mic") || name.equals("*")) mic.set(!Boolean.FALSE.equals(args));
                break;
            case "camera": camera.take(name); break;
            case "photo-delete": camera.delete(name); break;
            case "net": bluetooth.command(name, opts); break;
            case "store": store.command(name, opts); break;
            case "persist":
                saves.edit().putString(name, args instanceof String ? (String) args : String.valueOf(args)).apply();
                if (SETTINGS.equals(name)) {
                    // another way of painting chosen in the ⚙: started again with it
                    String p = paintSetting();
                    boolean gl = !"canvas".equals(p);
                    if ("gl".equals(p)) saves.edit().remove("glFailed").commit();
                    if (gl != glPaint && (p.equals("gl") || p.equals("canvas"))) restart();
                }
                break;
            case "quit":
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        finish();
                    }
                });
                break;
            default:
                break;
        }
    }

    private void copy(final String text) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                ClipboardManager c = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (c != null) c.setPrimaryClip(ClipData.newPlainText("RangerGames", text));
            }
        });
    }

    private void vibrate(Object what) {
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return;
        try {
            if (what instanceof JSONArray) {
                JSONArray a = (JSONArray) what;
                long[] pattern = new long[a.length() + 1];
                for (int i = 0; i < a.length(); i++) pattern[i + 1] = a.getLong(i);
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pattern, -1));
                else v.vibrate(pattern, -1);
            } else if (what instanceof Number) {
                long ms = Math.max(1, Math.min(2000, ((Number) what).longValue()));
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                else v.vibrate(ms);
            }
        } catch (Exception ignored) {
        }
    }
}
