// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;

import java.util.Locale;
import java.util.Queue;

/**
 * The microphone for rg.sensor("mic"): only the loudness, about 20 times a
 * second as {"db": dBFS, "talk": the phone itself makes a sound}, on the game
 * thread's input queue. Nothing is recorded, kept or sent. Asks for the
 * RECORD_AUDIO permission the first time a game wants it.
 */
final class Mic implements Runnable {
    static final int PERMISSION_REQUEST = 44;
    private static final int RATE = 16000;
    private static final int BLOCK = RATE / 20;   // 50 ms
    private final Activity activity;
    private final Queue<Object> out;
    private final Sound sound;
    private boolean want, paused, asked;
    private volatile boolean running;
    private Thread thread;

    Mic(Activity activity, Queue<Object> out, Sound sound) {
        this.activity = activity;
        this.out = out;
        this.sound = sound;
    }

    /** From the game thread. */
    void set(final boolean on) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (on && !want) asked = false;
                want = on;
                apply();
            }
        });
    }

    void pause() {
        paused = true;
        apply();
    }

    void resume() {
        paused = false;
        apply();
    }

    void permissionResult(boolean granted) {
        if (!granted) send("error", "{\"sensor\":\"mic\",\"reason\":\"permission\"}");
        apply();
    }

    private boolean hasPermission() {
        return Build.VERSION.SDK_INT < 23
                || activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void apply() {
        boolean on = want && !paused;
        if (on && !running) {
            if (!hasPermission()) {
                if (Build.VERSION.SDK_INT >= 23 && !asked) {
                    asked = true;
                    activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, PERMISSION_REQUEST);
                }
                return;
            }
            running = true;
            thread = new Thread(this, "rg-mic");
            thread.start();
        } else if (!on && running) {
            running = false;
            if (thread != null) {
                try {
                    thread.join(300);
                } catch (InterruptedException ignored) {
                }
            }
            thread = null;
        }
    }

    private void send(String name, String json) {
        out.add(new String[]{name, json});
    }

    @Override
    public void run() {
        AudioRecord rec = null;
        try {
            int min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            // VOICE_RECOGNITION: no automatic gain, so loud and quiet stay apart
            rec = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT, Math.max(min, BLOCK * 4));
            if (rec.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("mic");
            rec.startRecording();
            short[] buf = new short[BLOCK];
            while (running) {
                int n = 0;
                while (n < BLOCK && running) {
                    int r = rec.read(buf, n, BLOCK - n);
                    if (r <= 0) throw new IllegalStateException("read");
                    n += r;
                }
                double sum = 0;
                for (int i = 0; i < n; i++) {
                    double v = buf[i] / 32768.0;
                    sum += v * v;
                }
                double rms = n > 0 ? Math.sqrt(sum / n) : 0;
                double db = rms > 0.00001 ? 20 * Math.log10(rms) : -100;
                send("mic", String.format(Locale.US, "{\"db\":%.1f,\"talk\":%b}", db, sound.busy()));
            }
        } catch (Exception e) {
            if (running) send("error", "{\"sensor\":\"mic\",\"reason\":\"unavailable\"}");
            running = false;
        } finally {
            if (rec != null) {
                try {
                    rec.stop();
                } catch (Exception ignored) {
                }
                rec.release();
            }
        }
    }
}
