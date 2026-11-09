// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * The games' sounds, synthesized as web/js/audio.js does with WebAudio:
 * the same built-in effects and little looping tunes, mixed here in
 * software into one AudioTrack (no files, works offline and on old phones).
 * WAV files from the engine's virtual directory play too: the games' sound
 * files and the Finnish voice clips of {@code rg.say} (8-bit μ-law WAVs from
 * crates/rg_voice), one after another on their own speech channel.
 */
final class Sound implements Runnable {
    private static final int RATE = 22050;
    private static final int SINE = 0, SQUARE = 1, TRIANGLE = 2, SAW = 3;
    private static final float MASTER = 0.5f;

    /** One note or noise burst: starts at sample `at`, lasts `len` samples. */
    private static final class Voice {
        int wave = SINE;
        boolean noise;
        double f0, f1, vol, phase;
        long at, len;
        // the noise's band-pass filter state
        double x1, x2, y1, y2;
        /** a sound file's samples at RATE, or null for a synthesized voice */
        short[] pcm;
    }

    /** A voice clip on the speech channel. */
    private static final class Clip {
        final short[] pcm;
        final double vol;
        int pos;

        Clip(short[] pcm, double vol) {
            this.pcm = pcm;
            this.vol = vol;
        }
    }

    /** A tune: [midi note or 0, beats] … */
    private static final class Tune {
        final int bpm, wave;
        final double vol;
        final int[] notes;

        Tune(int bpm, int wave, double vol, int... notes) {
            this.bpm = bpm;
            this.wave = wave;
            this.vol = vol;
            this.notes = notes;
        }
    }

    private static final Tune HAPPY = new Tune(132, SQUARE, 0.05, 72, 1, 76, 1, 79, 1, 76, 1, 77, 1, 74, 1, 71, 2, 72, 1, 76, 1, 79, 1, 84, 1, 83, 2, 79, 2);
    private static final Tune CALM = new Tune(84, TRIANGLE, 0.08, 60, 2, 64, 2, 67, 2, 64, 2, 62, 2, 65, 2, 69, 2, 65, 2);
    private static final Tune CHASE = new Tune(160, SQUARE, 0.04, 64, 1, 64, 1, 67, 1, 64, 1, 62, 1, 60, 1, 62, 2, 64, 1, 67, 1, 69, 1, 67, 1, 64, 2, 0, 2);

    private final ConcurrentLinkedQueue<Voice> incoming = new ConcurrentLinkedQueue<>();
    private final ArrayList<Voice> voices = new ArrayList<>();
    private final java.util.Random random = new java.util.Random();
    /** decoded sound files by path (the game thread's) */
    private final java.util.HashMap<String, short[]> files = new java.util.HashMap<>();
    /** the speech channel: clips said one after another (guarded by itself) */
    private final ArrayList<Clip> speech = new ArrayList<>();
    private volatile boolean running;
    private volatile boolean paused;
    private Thread thread;
    /** samples written so far: the mixer's clock */
    private volatile long now;
    // the music: read by the mixer thread
    private volatile Tune tune;
    private volatile double tuneVol = 1;
    private long tuneNext;
    private int tuneStep;

    void start() {
        if (running) return;
        running = true;
        thread = new Thread(this, "rg-sound");
        thread.setPriority(Thread.MAX_PRIORITY);
        thread.start();
    }

    void stop() {
        running = false;
        if (thread != null) {
            try {
                thread.join(500);
            } catch (InterruptedException ignored) {
            }
        }
        thread = null;
    }

    void setPaused(boolean p) {
        paused = p;
    }

    private static double midi(double n) {
        return 440 * Math.pow(2, (n - 69) / 12);
    }

    private static int wave(String name) {
        if ("square".equals(name)) return SQUARE;
        if ("triangle".equals(name)) return TRIANGLE;
        if ("sawtooth".equals(name)) return SAW;
        return SINE;
    }

    private void tone(int wave, double f0, double f1, double len, double vol, double delay) {
        Voice v = new Voice();
        v.wave = wave;
        v.f0 = f0;
        v.f1 = f1;
        v.vol = vol;
        v.at = now + (long) (delay * RATE);
        v.len = Math.max(1, (long) (len * RATE));
        incoming.add(v);
    }

    private void noise(double len, double vol, double f0, double f1) {
        Voice v = new Voice();
        v.noise = true;
        v.f0 = f0;
        v.f1 = f1;
        v.vol = vol;
        v.at = now;
        v.len = Math.max(1, (long) (len * RATE));
        incoming.add(v);
    }

    /** A sound by name ("jump", "coin" …), as audio.js's EFFECTS. */
    void play(String name, JSONObject o) {
        if (!running || paused) return;
        double vol = o != null ? o.optDouble("volume", 1) : 1;
        double p = o != null ? o.optDouble("pitch", 1) : 1;
        if (p <= 0) p = 1;
        switch (name) {
            case "jump": tone(SQUARE, 260 * p, 720 * p, 0.16, 0.18 * vol, 0); break;
            case "coin": tone(SQUARE, 988 * p, 988 * p, 0.08, 0.14 * vol, 0); tone(SQUARE, 1319 * p, 1319 * p, 0.22, 0.14 * vol, 0.07); break;
            case "click": tone(TRIANGLE, 1200 * p, 900 * p, 0.04, 0.2 * vol, 0); break;
            case "tick": tone(SINE, 2000 * p, 2000 * p, 0.025, 0.12 * vol, 0); break;
            case "pop": tone(SINE, 700 * p, 180 * p, 0.12, 0.3 * vol, 0); break;
            case "hit": noise(0.18, 0.5 * vol, 900 * p, 200 * p); tone(SQUARE, 160 * p, 60 * p, 0.15, 0.15 * vol, 0); break;
            case "lose": {
                double[] f = {392, 349, 311, 262};
                for (int i = 0; i < f.length; i++) tone(SAW, f[i] * p, f[i] * p * 0.97, 0.22, 0.1 * vol, i * 0.18);
                break;
            }
            case "win": {
                double[] f = {523, 659, 784, 1047};
                for (int i = 0; i < f.length; i++) tone(TRIANGLE, f[i] * p, f[i] * p, i == 3 ? 0.45 : 0.16, 0.22 * vol, i * 0.11);
                break;
            }
            case "whoosh": noise(0.3, 0.35 * vol, 300 * p, 2400 * p); break;
            case "star": {
                double[] f = {1319, 1568, 2093};
                for (int i = 0; i < f.length; i++) tone(SINE, f[i] * p, f[i] * p, 0.18, 0.12 * vol, i * 0.06);
                break;
            }
            case "wrong": tone(SQUARE, 220 * p, 200 * p, 0.14, 0.12 * vol, 0); tone(SQUARE, 180 * p, 160 * p, 0.22, 0.12 * vol, 0.14); break;
            case "note": {
                double f = o != null && o.has("freq") ? o.optDouble("freq", 261.6) : midi(o != null ? o.optDouble("note", 60) : 60);
                tone(wave(o != null ? o.optString("wave", "triangle") : "triangle"), f * p, f * p, o != null ? o.optDouble("len", 0.3) : 0.3, 0.25 * vol, 0);
                break;
            }
            default: {
                short[] pcm = file(name);
                if (pcm == null) break;
                Voice v = new Voice();
                v.pcm = pcm;
                v.vol = vol;
                v.at = now;
                v.len = pcm.length;
                incoming.add(v);
                break;
            }
        }
    }

    /** rg.say: { list: [paths], queue, volume }. A new list cuts the old one unless queue. */
    void say(JSONObject o) {
        JSONArray list = o != null ? o.optJSONArray("list") : null;
        double vol = (o != null ? o.optDouble("volume", 1) : 1) * 1.6;
        ArrayList<Clip> add = new ArrayList<>();
        if (list != null && !paused) {
            for (int i = 0; i < list.length(); i++) {
                short[] pcm = file(list.optString(i));
                if (pcm != null) add.add(new Clip(pcm, vol));
            }
        }
        synchronized (speech) {
            if (o == null || !o.optBoolean("queue", false)) speech.clear();
            speech.addAll(add);
        }
    }

    /** A WAV file of the virtual directory as samples at RATE (cached), or null. */
    private short[] file(String path) {
        if (files.containsKey(path)) return files.get(path);
        short[] pcm = null;
        try {
            byte[] b = Engine.read(path);
            if (b != null) pcm = decodeWav(b);
        } catch (Throwable ignored) {
        }
        files.put(path, pcm);
        return pcm;
    }

    private static int u16(byte[] b, int i) {
        return (b[i] & 0xff) | (b[i + 1] & 0xff) << 8;
    }

    private static int u32(byte[] b, int i) {
        return u16(b, i) | u16(b, i + 2) << 16;
    }

    private static int mulaw(int u) {
        u = ~u & 0xff;
        int t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4);
        return (u & 0x80) != 0 ? 0x84 - t : t - 0x84;
    }

    /** 8/16-bit PCM or 8-bit μ-law WAV → mono 16-bit at RATE (first channel, linear resampling). */
    static short[] decodeWav(byte[] b) {
        if (b.length < 44 || b[0] != 'R' || b[1] != 'I' || b[2] != 'F' || b[3] != 'F') return null;
        int fmt = 0, ch = 1, rate = RATE, bits = 16, at = 12;
        while (at + 8 <= b.length) {
            String id = new String(b, at, 4, java.nio.charset.StandardCharsets.US_ASCII);
            int size = u32(b, at + 4);
            if (id.equals("fmt ")) {
                fmt = u16(b, at + 8);
                ch = Math.max(1, u16(b, at + 10));
                rate = u32(b, at + 12);
                bits = u16(b, at + 22);
            } else if (id.equals("data")) {
                if (!(fmt == 1 || fmt == 7) || rate <= 0) return null;
                int step = bits / 8 * ch;
                if (step <= 0) return null;
                int n = Math.min(size, b.length - at - 8) / step;
                short[] src = new short[n];
                int p = at + 8;
                for (int i = 0; i < n; i++, p += step) {
                    if (fmt == 7) src[i] = (short) mulaw(b[p] & 0xff);
                    else if (bits == 16) src[i] = (short) u16(b, p);
                    else src[i] = (short) (((b[p] & 0xff) - 128) << 8);
                }
                if (rate == RATE) return src;
                int m = (int) ((long) n * RATE / rate);
                short[] out = new short[m];
                for (int i = 0; i < m; i++) {
                    double x = (double) i * rate / RATE;
                    int k = (int) x;
                    double f = x - k;
                    int a = src[Math.min(k, n - 1)], c = src[Math.min(k + 1, n - 1)];
                    out[i] = (short) (a + (c - a) * f);
                }
                return out;
            }
            at += 8 + size + (size & 1);
        }
        return null;
    }

    void music(String name, JSONObject o) {
        Tune t = "happy".equals(name) ? HAPPY : "calm".equals(name) ? CALM : "chase".equals(name) ? CHASE : null;
        tuneVol = o != null ? o.optDouble("volume", 1) : 1;
        tuneStep = 0;
        tuneNext = now + RATE / 20;
        tune = t;
    }

    void stopMusic() {
        tune = null;
    }

    private static double osc(int wave, double ph) {
        switch (wave) {
            case SQUARE: return ph < 0.5 ? 1 : -1;
            case TRIANGLE: return ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
            case SAW: return 2 * ph - 1;
            default: return Math.sin(2 * Math.PI * ph);
        }
    }

    /** The envelope of audio.js: 10 ms up, then down exponentially to the end. */
    private static double env(double vol, long i, long len) {
        long attack = RATE / 100;
        if (i < attack) return vol * i / attack;
        double f = (double) (i - attack) / Math.max(1, len - attack);
        return vol * Math.pow(0.0001 / Math.max(vol, 0.0002), f);
    }

    private void sequence(long end) {
        Tune t = tune;
        if (t == null) return;
        double beat = 60.0 / t.bpm;
        while (tuneNext < end + RATE / 4) {
            int at = (tuneStep % (t.notes.length / 2)) * 2;
            int note = t.notes[at], beats = t.notes[at + 1];
            if (note != 0) {
                Voice v = new Voice();
                v.wave = t.wave;
                v.f0 = v.f1 = midi(note);
                v.vol = t.vol * tuneVol;
                v.at = tuneNext;
                v.len = (long) (beats * beat * 0.9 * RATE);
                voices.add(v);
            }
            tuneNext += (long) (beats * beat * RATE);
            tuneStep++;
        }
    }

    @Override
    public void run() {
        int min = AudioTrack.getMinBufferSize(RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int frames = 512;
        @SuppressWarnings("deprecation")
        AudioTrack track = new AudioTrack(AudioManager.STREAM_MUSIC, RATE, AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT, Math.max(min, frames * 4), AudioTrack.MODE_STREAM);
        short[] buf = new short[frames];
        double[] mix = new double[frames];
        track.play();
        while (running) {
            Voice add;
            while ((add = incoming.poll()) != null) voices.add(add);
            long start = now;
            if (paused) {
                voices.clear();
                synchronized (speech) {
                    speech.clear();
                }
                java.util.Arrays.fill(buf, (short) 0);
            } else {
                sequence(start + frames);
                java.util.Arrays.fill(mix, 0);
                for (int vi = voices.size() - 1; vi >= 0; vi--) {
                    Voice v = voices.get(vi);
                    if (v.at >= start + frames) continue;
                    for (int s = 0; s < frames; s++) {
                        long i = start + s - v.at;
                        if (i < 0) continue;
                        if (i >= v.len) break;
                        if (v.pcm != null) {
                            mix[s] += v.pcm[(int) i] / 32768.0 * v.vol;
                            continue;
                        }
                        double f = v.f0 == v.f1 ? v.f0 : v.f0 * Math.pow(v.f1 / v.f0, (double) i / v.len);
                        double out;
                        if (v.noise) {
                            // white noise through a band-pass (RBJ biquad, Q 1) sweeping f0 → f1
                            double w0 = 2 * Math.PI * Math.min(f, RATE * 0.45) / RATE;
                            double alpha = Math.sin(w0) / 2;
                            double a0 = 1 + alpha;
                            double x0 = random.nextDouble() * 2 - 1;
                            double y0 = (alpha * x0 - alpha * v.x2 + 2 * Math.cos(w0) * v.y1 - (1 - alpha) * v.y2) / a0;
                            v.x2 = v.x1;
                            v.x1 = x0;
                            v.y2 = v.y1;
                            v.y1 = y0;
                            out = y0 * v.vol * Math.pow(0.0001 / Math.max(v.vol, 0.0002), (double) i / v.len);
                        } else {
                            out = osc(v.wave, v.phase) * env(v.vol, i, v.len);
                            v.phase += f / RATE;
                            if (v.phase >= 1) v.phase -= Math.floor(v.phase);
                        }
                        mix[s] += out;
                    }
                    if (start + frames - v.at >= v.len) voices.remove(vi);
                }
                // speech on top, the rest a little quieter while it talks
                synchronized (speech) {
                    if (!speech.isEmpty()) {
                        for (int s = 0; s < frames; s++) mix[s] *= 0.5;
                        int s = 0;
                        while (s < frames && !speech.isEmpty()) {
                            Clip c = speech.get(0);
                            while (s < frames && c.pos < c.pcm.length) {
                                mix[s++] += c.pcm[c.pos++] / 32768.0 * c.vol;
                            }
                            if (c.pos >= c.pcm.length) speech.remove(0);
                        }
                    }
                }
                for (int s = 0; s < frames; s++) {
                    double m = mix[s] * MASTER;
                    m = m > 1 ? 1 : m < -1 ? -1 : m;
                    buf[s] = (short) (m * 32767);
                }
            }
            track.write(buf, 0, frames);
            now = start + frames;
        }
        track.stop();
        track.release();
    }
}
