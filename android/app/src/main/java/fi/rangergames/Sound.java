// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.content.res.AssetManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaCodec;
import android.media.MediaDataSource;
import android.media.MediaExtractor;
import android.media.MediaFormat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.ShortBuffer;
import java.util.ArrayList;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * The games' sounds, synthesized as web/js/audio.js does with WebAudio:
 * the same built-in effects and little looping tunes, mixed here in
 * software into one AudioTrack (no files, works offline and on old phones).
 * WAV files from the engine's virtual directory play too: the games' sound
 * files and the Finnish voice clips of {@code rg.say} (8-bit μ-law WAVs from
 * crates/rg_voice), one after another on their own speech channel.
 * MP3, AAC and Ogg files are decoded with MediaCodec on a thread of their own
 * and start when ready (a long music file would stall the game otherwise).
 */
final class Sound implements Runnable {
    private static final int RATE = 22050;
    private static final int SINE = 0, SQUARE = 1, TRIANGLE = 2, SAW = 3;
    private static final float MASTER = 0.5f;
    private static final double KNEE = 0.8;

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
        /** a file still being decoded: plays as far as it has come (pcm is its buffer then) */
        Stream st;
        // a sound file's handle (rg.stopSound …), its place, looping, pause
        int h;
        /** the order it was asked in, against the controls' (Ctl.upTo) */
        long serial;
        boolean loop, held;
        long pos;
        // its own level (rg.soundVolume, fades): moves by step a sample to
        // target; gone when it reaches 0 with stopAtZero
        double base = 1, gain = 1, target = 1, step;
        boolean stopAtZero;

        void fadeTo(double to, double secs) {
            target = to;
            if (secs <= 0) {
                gain = to;
                step = 0;
            } else {
                step = (to - gain) / (secs * RATE);
                if (step == 0) gain = to;
            }
        }
    }

    /** rg.stopSound / soundVolume / pauseSound / resumeSound for the mixer thread. */
    private static final class Ctl {
        final String op;
        final int h;
        final double volume, fade;
        /** applies to the sounds asked for before it, not to later ones in the same buffer */
        final long upTo;

        Ctl(String op, int h, double volume, double fade, long upTo) {
            this.upTo = upTo;
            this.op = op;
            this.h = h;
            this.volume = volume;
            this.fade = fade;
        }
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
    private final ConcurrentLinkedQueue<Ctl> ctls = new ConcurrentLinkedQueue<>();
    private final ArrayList<Voice> voices = new ArrayList<>();
    private final java.util.Random random = new java.util.Random();
    /** decoded sound files by path (the game thread's) */
    private final java.util.HashMap<String, short[]> files = new java.util.HashMap<>();
    /** the speech channel: clips said one after another (guarded by itself) */
    private final ArrayList<Clip> speech = new ArrayList<>();
    /** where the queued sound files end (the mixer's clock; rg.sound { queue }) */
    private long queueEnd;
    private volatile boolean running;
    private volatile boolean paused;
    private Thread thread;
    /** samples written so far: the mixer's clock */
    private volatile long now;
    /** when the mixer last played something (System.currentTimeMillis), for {@link #busy} */
    private volatile long loudAt;
    // the music: read by the mixer thread
    private volatile Tune tune;
    private volatile double tuneVol = 1;
    private volatile boolean tunePaused, tuneOnce;
    /** the music's handle (a tune's or a file's) */
    private volatile int musicH;
    /** counts sounds, tunes and controls as the game thread asks for them */
    private long serial;
    private volatile long tuneSerial;
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

    /**
     * The phone itself speaks or plays a sound (or did a moment ago, the
     * speaker's buffer still plays it): the microphone hears it too.
     */
    boolean busy() {
        return System.currentTimeMillis() - loudAt < 450;
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
            default:
                playFile(name, vol, o != null ? o.optInt("h", 0) : 0, o != null && o.optBoolean("loop", false), o != null ? o.optDouble("fade", 0) : 0, vol,
                        o != null && o.optBoolean("queue", false));
                break;
        }
    }

    private void playFile(String name, double vol, int h, boolean loop, double fade, double base) {
        playFile(name, vol, h, loop, fade, base, false);
    }

    /** queue (as audio.js): the file waits until the queued files before it have
     *  ended, so a spoken line does not talk over the one before it */
    private void playFile(String name, double vol, int h, boolean loop, double fade, double base, boolean queue) {
        boolean known;
        synchronized (files) {
            known = files.containsKey(name);
        }
        if (!known) {
            byte[] b = raw(name);
            if (b != null && !isWav(b)) {
                decodeLater(name, b, vol, h, loop, fade, base, ++serial);
                return;
            }
        }
        short[] pcm = file(name);
        if (pcm == null || pcm.length == 0) return;
        startFile(pcm, vol, h, loop, fade, base, queue, ++serial);
    }

    private void startFile(short[] pcm, double vol, int h, boolean loop, double fade, double base, boolean queue, long ser) {
        startFile(pcm, null, vol, h, loop, fade, base, queue, ser);
    }

    private void startFile(short[] pcm, Stream st, double vol, int h, boolean loop, double fade, double base, boolean queue, long ser) {
        Voice v = new Voice();
        v.pcm = pcm;
        v.st = st;
        v.vol = vol;
        v.at = now;
        if (queue && !loop) {
            v.at = Math.max(now, queueEnd);
            queueEnd = v.at + pcm.length + (long) (0.15 * RATE);
        }
        v.len = pcm.length;
        v.h = h;
        v.loop = loop;
        v.base = base;
        v.serial = ser;
        if (fade > 0) {
            v.gain = 0;
            v.fadeTo(1, fade);
        }
        incoming.add(v);
    }

    /** rg.stopSound and the rest: op "stop", "volume", "pause", "resume"; o { h (0: all), volume, fade }. */
    void control(String op, JSONObject o) {
        if (op.equals("stop") && (o == null || o.optInt("h", 0) == 0)) queueEnd = now;
        if (op.equals("stop")) markStopped(o != null ? o.optInt("h", 0) : 0);
        ctls.add(new Ctl(op, o != null ? o.optInt("h", 0) : 0, o != null ? o.optDouble("volume", 1) : 1, o != null ? o.optDouble("fade", 0) : 0, serial));
    }

    /** On the mixer thread: the controls asked for since the last buffer. */
    private void applyControls() {
        Ctl c;
        while ((c = ctls.poll()) != null) {
            boolean tuneHit = tune != null && tuneSerial <= c.upTo && (c.h == 0 || c.h == musicH);
            if (tuneHit) {
                if (c.op.equals("stop")) tune = null;
                else if (c.op.equals("volume")) tuneVol = c.volume;
                else if (c.op.equals("pause")) tunePaused = true;
                else if (c.op.equals("resume")) tunePaused = false;
            }
            for (int i = voices.size() - 1; i >= 0; i--) {
                Voice v = voices.get(i);
                if (v.pcm == null || v.serial > c.upTo || (c.h != 0 && v.h != c.h)) continue;
                switch (c.op) {
                    case "stop":
                        // a queued sound that has not started yet: gone at once
                        if (v.at > now) {
                            voices.remove(i);
                            break;
                        }
                        if (c.fade > 0 && !v.held) {
                            v.stopAtZero = true;
                            v.fadeTo(0, c.fade);
                        } else voices.remove(i);
                        break;
                    case "volume":
                        if (!v.stopAtZero) v.fadeTo(v.base > 0 ? c.volume / v.base : 1, c.fade);
                        break;
                    case "pause": v.held = true; break;
                    case "resume": v.held = false; break;
                    default: break;
                }
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

    private volatile AssetManager assets;

    /**
     * The voice clips are APK assets (assets/voice/<lang>/<id>.wav), not in the
     * game pack: hundreds of MB of clips in the pack, read into one array at
     * boot, ran the phone out of memory. A clip is read when it is said.
     */
    void setAssets(AssetManager a) {
        assets = a;
    }

    private byte[] voiceAsset(String path) {
        AssetManager a = assets;
        if (a == null) return null;
        try (InputStream in = a.open("voice/" + path.substring("/games/_voice/".length()))) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    /** A WAV file of the virtual directory (or a voice clip asset) as samples at RATE (cached), or null. */
    private short[] file(String path) {
        synchronized (files) {
            if (files.containsKey(path)) return files.get(path);
        }
        short[] pcm = null;
        try {
            byte[] b = raw(path);
            if (b != null) pcm = decodeWav(b);
        } catch (Throwable ignored) {
        }
        synchronized (files) {
            files.put(path, pcm);
        }
        return pcm;
    }

    /** A sound file's bytes: a voice clip asset, a downloaded game's file or the pack's. */
    private byte[] raw(String path) {
        try {
            byte[] b = path.startsWith("/games/_voice/") ? voiceAsset(path) : null;
            if (b == null) b = Store.readLazy(path);   // a downloaded game's sound stays on disk
            if (b == null) b = Engine.read(path);
            return b;
        } catch (Throwable e) {
            return null;
        }
    }

    private static boolean isWav(byte[] b) {
        return b.length >= 4 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F';
    }

    // stops asked while a file was still being decoded: handle → serial (0: all)
    private final java.util.concurrent.ConcurrentHashMap<Integer, Long> stoppedAt = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.HashMap<String, Stream> decoding = new java.util.HashMap<>();

    private void markStopped(int h) {
        stoppedAt.put(h, serial);
    }

    private boolean stoppedSince(int h, long ser) {
        Long all = stoppedAt.get(0), mine = h != 0 ? stoppedAt.get(h) : null;
        return (all != null && all >= ser) || (mine != null && mine >= ser);
    }

    /** A file being decoded: samples [0, avail) of buf are ready; buf may be
     *  swapped for a bigger one (avail is written after, read first). */
    static final class Stream {
        volatile short[] buf = new short[0];
        volatile int avail;
        volatile boolean done;
    }

    /** A compressed file (MP3 …): decoded on its own thread and played as it
     *  comes (a 3-minute MP3 took ~10 s to decode on the tablet, so waiting for
     *  all of it left the start silent), unless it was stopped meanwhile; cached
     *  once whole. */
    private void decodeLater(String name, byte[] b, double vol, int h, boolean loop, double fade, double base, long ser) {
        final Stream st;
        synchronized (decoding) {
            Stream old = decoding.get(name);
            if (old != null) {
                // asked again while still decoding (music stopped and started again):
                // a new voice on the same stream, from its start
                startFile(old.buf, old, vol, h, loop, fade, base, false, ser);
                return;
            }
            st = new Stream();
            decoding.put(name, st);
        }
        Thread t = new Thread(() -> {
            short[] pcm = null;
            final boolean[] started = { false };
            try {
                pcm = decodeCompressed(b, st, () -> {
                    if (!started[0] && !stoppedSince(h, ser)) {
                        started[0] = true;
                        startFile(st.buf, st, vol, h, loop, fade, base, false, ser);
                    }
                });
            } catch (Throwable e) {
                android.util.Log.w("RangerGames", "decode " + name, e);
            }
            st.done = true;
            synchronized (files) {
                files.put(name, pcm);
            }
            synchronized (decoding) {
                decoding.remove(name);
            }
            if (!started[0] && pcm != null && pcm.length > 0 && !stoppedSince(h, ser)) startFile(pcm, vol, h, loop, fade, base, false, ser);
        }, "rg-decode");
        t.setPriority(Thread.NORM_PRIORITY - 1);
        t.start();
    }

    /** MP3/AAC/Ogg → mono 16-bit at RATE (channels averaged, resampled linearly as it comes). */
    static short[] decodeCompressed(final byte[] b) throws Exception {
        return decodeCompressed(b, null, null);
    }

    /** As above, filling st as it goes; ready runs once ~0.5 s is decoded. */
    static short[] decodeCompressed(final byte[] b, Stream st, Runnable ready) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        MediaCodec c = null;
        try {
            ex.setDataSource(new MediaDataSource() {
                @Override public int readAt(long pos, byte[] buf, int off, int size) {
                    if (pos >= b.length) return -1;
                    int n = (int) Math.min(size, b.length - pos);
                    System.arraycopy(b, (int) pos, buf, off, n);
                    return n;
                }
                @Override public long getSize() { return b.length; }
                @Override public void close() {}
            });
            int tr = -1;
            MediaFormat fmt = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String m = f.getString(MediaFormat.KEY_MIME);
                if (m != null && m.startsWith("audio/")) { tr = i; fmt = f; break; }
            }
            if (fmt == null) return null;
            ex.selectTrack(tr);
            int src = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE), ch = Math.max(1, fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT));
            long dur = fmt.containsKey(MediaFormat.KEY_DURATION) ? fmt.getLong(MediaFormat.KEY_DURATION) : 0;
            short[] out = new short[(int) Math.max(RATE, dur * RATE / 1000000L + RATE)];
            if (st != null) st.buf = out;
            int n = 0;
            long si = 0;          // source frames seen
            double prev = 0;
            c = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME));
            c.configure(fmt, null, null, 0);
            c.start();
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            boolean inEnd = false, outEnd = false;
            while (!outEnd) {
                if (!inEnd) {
                    int ii = c.dequeueInputBuffer(10000);
                    if (ii >= 0) {
                        ByteBuffer ib = c.getInputBuffer(ii);
                        int len = ib != null ? ex.readSampleData(ib, 0) : -1;
                        if (len < 0) {
                            c.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inEnd = true;
                        } else {
                            c.queueInputBuffer(ii, 0, len, ex.getSampleTime(), 0);
                            ex.advance();
                        }
                    }
                }
                int oi = c.dequeueOutputBuffer(info, 10000);
                if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat of = c.getOutputFormat();
                    src = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    ch = Math.max(1, of.getInteger(MediaFormat.KEY_CHANNEL_COUNT));
                } else if (oi >= 0) {
                    ByteBuffer ob = c.getOutputBuffer(oi);
                    if (ob != null && info.size > 0) {
                        ob.position(info.offset);
                        ob.limit(info.offset + info.size);
                        ShortBuffer sb = ob.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer();
                        int frames = sb.remaining() / ch;
                        for (int f = 0; f < frames; f++) {
                            int sum = 0;
                            for (int k = 0; k < ch; k++) sum += sb.get(f * ch + k);
                            double s = (double) sum / ch;
                            // output samples whose source place falls in (si-1, si]
                            while (true) {
                                double p = (double) n * src / RATE;
                                if (p > si) break;
                                double fr = p - (si - 1);
                                if (n >= out.length) {
                                    out = java.util.Arrays.copyOf(out, out.length + RATE * 10);
                                    if (st != null) st.buf = out;
                                }
                                out[n++] = (short) Math.round(si == 0 ? s : prev + (s - prev) * fr);
                            }
                            prev = s;
                            si++;
                        }
                    }
                    c.releaseOutputBuffer(oi, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outEnd = true;
                    if (st != null) {
                        st.avail = n;
                        if (ready != null && n >= RATE / 2) { ready.run(); ready = null; }
                    }
                }
            }
            if (st != null) {
                st.avail = n;
                if (ready != null && n > 0) ready.run();
            }
            return n == out.length ? out : java.util.Arrays.copyOf(out, n);
        } finally {
            if (c != null) {
                try { c.stop(); } catch (Throwable ignored) { }
                c.release();
            }
            ex.release();
        }
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

    /** rg.music: a built-in tune or a sound file, looping unless loop is false; o { h, volume, fade, loop }. */
    void music(String name, JSONObject o) {
        stopMusic(null);
        Tune t = "happy".equals(name) ? HAPPY : "calm".equals(name) ? CALM : "chase".equals(name) ? CHASE : null;
        double vol = o != null ? o.optDouble("volume", 1) : 1;
        int h = o != null ? o.optInt("h", 0) : 0;
        boolean loop = o == null || o.optBoolean("loop", true);
        musicH = h;
        if (t == null) {
            // music files: 1.6 × MASTER 0.5 = 0.8 of full scale (0.6 × 0.5 was half as
            // loud as the MediaPlayer music before, and barely audible on the tablet)
            playFile(name, vol * 1.6, h, loop, o != null ? o.optDouble("fade", 0) : 0, vol);
            return;
        }
        tuneVol = vol;
        tunePaused = false;
        tuneOnce = !loop;
        tuneStep = 0;
        tuneNext = now + RATE / 20;
        tuneSerial = ++serial;
        tune = t;
    }

    /** o { fade }: seconds down to silence first (a file; a tune stops at once) */
    void stopMusic(JSONObject o) {
        tune = null;
        if (musicH != 0) ctls.add(new Ctl("stop", musicH, 0, o != null ? o.optDouble("fade", 0) : 0, serial));
        markStopped(musicH != 0 ? musicH : -1);
        musicH = 0;
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
        if (tunePaused) {
            tuneNext = Math.max(tuneNext, end);
            return;
        }
        double beat = 60.0 / t.bpm;
        while (tuneNext < end + RATE / 4) {
            if (tuneOnce && tuneStep >= t.notes.length / 2) {
                tune = null;
                return;
            }
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
            applyControls();
            long start = now;
            if (paused) {
                // a looping sound (music) waits; the rest is let go
                for (int vi = voices.size() - 1; vi >= 0; vi--) if (!voices.get(vi).loop) voices.remove(vi);
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
                    if (v.pcm != null) {
                        // a sound file: from its own place, so it can pause and loop
                        if (v.held) continue;
                        loudAt = System.currentTimeMillis();
                        boolean done = false;
                        // a file still decoding: only as far as it has come (avail before buf)
                        Stream st = v.st;
                        int lim = v.pcm.length;
                        boolean more = false;
                        if (st != null) {
                            more = !st.done;   // first: once done, avail is final
                            lim = st.avail;
                            v.pcm = st.buf;
                        }
                        // nothing came out of the decoder: no samples to loop over
                        if (lim == 0 && !more) {
                            voices.remove(vi);
                            continue;
                        }
                        for (int s = 0; s < frames; s++) {
                            if (start + s < v.at) continue;
                            if (v.pos >= lim) {
                                if (more) break;   // the decoder is behind: wait for it
                                if (!v.loop) {
                                    done = true;
                                    break;
                                }
                                v.pos = 0;
                            }
                            if (v.step != 0) {
                                v.gain += v.step;
                                if (v.step > 0 ? v.gain >= v.target : v.gain <= v.target) {
                                    v.gain = v.target;
                                    v.step = 0;
                                }
                            }
                            if (v.stopAtZero && v.step == 0 && v.gain <= 0) {
                                done = true;
                                break;
                            }
                            mix[s] += v.pcm[(int) v.pos++] / 32768.0 * v.vol * v.gain;
                        }
                        if (done) voices.remove(vi);
                        continue;
                    }
                    loudAt = System.currentTimeMillis();
                    for (int s = 0; s < frames; s++) {
                        long i = start + s - v.at;
                        if (i < 0) continue;
                        if (i >= v.len) break;
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
                        loudAt = System.currentTimeMillis();
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
                    // loud music with speech and effects on top goes over full scale:
                    // above KNEE the level bends towards 1 instead of clipping flat
                    // (a NaN would cast to 0 and silence every sound: left out)
                    if (m != m) m = 0;
                    else if (m > KNEE) m = KNEE + (1 - KNEE) * Math.tanh((m - KNEE) / (1 - KNEE));
                    else if (m < -KNEE) m = -KNEE - (1 - KNEE) * Math.tanh((-m - KNEE) / (1 - KNEE));
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
