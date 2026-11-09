// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * The RangerGames app, natively: the engine (librg_android.so, Rust) runs
 * on a game thread, and this activity paints each frame's draw stream on a
 * SurfaceView's Canvas ({@link Painter}), plays the sounds ({@link Sound}),
 * vibrates, keeps the saves and passes touches and the Back button to the
 * game. No WebView and no WebAssembly, so it runs on old phones as well.
 */
public class MainActivity extends Activity implements SurfaceHolder.Callback, Runnable {
    private static final String TAG = "RangerGames";
    private SurfaceView view;
    private Painter painter;
    private final Sound sound = new Sound();
    private Sensors sensors;
    private Camera camera;
    private SharedPreferences saves;
    private Thread thread;
    private volatile boolean running;
    private volatile boolean paused;
    private volatile SurfaceHolder surface;
    private volatile int width, height;
    private float density = 1;
    /** touches and keys for the game thread: {kind, id, x, y} or a key name */
    private final ConcurrentLinkedQueue<Object> input = new ConcurrentLinkedQueue<>();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        density = getResources().getDisplayMetrics().density;
        saves = getSharedPreferences("saves", MODE_PRIVATE);
        painter = new Painter(getAssets());
        sensors = new Sensors(this, input);
        camera = new Camera(this, input);
        view = new SurfaceView(this);
        view.getHolder().addCallback(this);
        view.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent e) {
                touch(e);
                return true;
            }
        });
        setContentView(view);
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
        sound.start();
        sound.setPaused(false);
        sensors.resume();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (code == Sensors.PERMISSION_REQUEST) sensors.permissionResult(granted);
        else if (code == Camera.REQ_PERM) camera.permissionResult(granted);
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == Camera.REQ_SHOT) camera.result(result);
    }

    @Override
    protected void onPause() {
        super.onPause();
        paused = true;
        sound.setPaused(true);
        sound.stop();
        sensors.pause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        running = false;
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
    }

    private static byte[] asset(Context c, String name) throws Exception {
        try (InputStream in = c.getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] b = new byte[65536];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
            return out.toByteArray();
        }
    }

    /** The games' pack into the virtual directory, the saves back, the launcher started. */
    private void boot() throws Exception {
        int n = Engine.mount("/games", asset(this, "games.rgpk"));
        if (n < 0) throw new IllegalStateException("games.rgpk is not a pack");
        for (Map.Entry<String, ?> e : saves.getAll().entrySet()) {
            if (e.getKey().startsWith("/save/") && e.getValue() instanceof String) {
                Engine.put(e.getKey(), ((String) e.getValue()).getBytes(StandardCharsets.UTF_8));
            }
        }
        for (Object[] f : camera.stored()) Engine.put((String) f[0], (byte[]) f[1]);
        Engine.seed(System.currentTimeMillis() % 2147483647L);
        Engine.start("");
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
        int lastW = 0, lastH = 0;
        long last = System.nanoTime();
        while (running) {
            SurfaceHolder h = surface;
            int w = width, hgt = height;
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
            Object in;
            while ((in = input.poll()) != null) {
                if (in instanceof Object[] && !(in instanceof String[])) {
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
            long t = System.nanoTime();
            double dt = Math.min(100, (t - last) / 1e6);
            last = t;
            Engine.frame(dt);
            afterCall();
            float[] nums = Engine.draw();
            String strings = Engine.strings();
            double[] v = {Engine.view(0), Engine.view(1), Engine.view(2), Engine.view(3), Engine.view(4)};
            Canvas c = null;
            try {
                c = Build.VERSION.SDK_INT >= 26 ? h.getSurface().lockHardwareCanvas() : h.lockCanvas();
                if (c != null) {
                    painter.paint(c, nums != null ? nums : new float[0], strings != null ? strings.split("\u0000", -1) : new String[0], v, density, 0xff000000);
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
            // the hardware canvas waits for the display's frame; keep to about 60 fps otherwise
            long spent = (System.nanoTime() - t) / 1000000;
            if (spent < 15) sleep(15 - spent);
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
        if (log != null && !log.isEmpty()) Log.i(TAG, log);
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
            case "music": sound.music(name, opts); break;
            case "stop": sound.stopMusic(); break;
            case "vibrate": vibrate(args); break;
            case "sensor": sensors.set(name, !Boolean.FALSE.equals(args)); break;
            case "camera": camera.take(name); break;
            case "photo-delete": camera.delete(name); break;
            case "persist":
                saves.edit().putString(name, args instanceof String ? (String) args : String.valueOf(args)).apply();
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
