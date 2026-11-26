// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.content.Context;
import android.content.Intent;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.LinkedBlockingQueue;

/**
 * Dev reload (scripts/dev.sh, docs/dev-reload.md): the files saved on the
 * computer come to the running app without a new APK. On only while
 * files/dev.json exists (dev.sh writes it, dev.sh --off removes it) or the
 * app was started with --es dev &lt;url&gt;. The computer's server is reached at
 * the app's own 127.0.0.1 through adb reverse.
 *
 * A thread of its own asks the server for changes (it holds the question
 * until a file is saved) and fetches them; the game thread puts them into the
 * virtual directory in {@link #apply}, between frames. The engine's log goes
 * to the computer's terminal.
 */
final class DevLink {
    private static final String TAG = "RangerGames";
    private final String base;
    /** fetched files waiting for the game thread: {path, bytes} */
    private final ConcurrentLinkedQueue<Object[]> got = new ConcurrentLinkedQueue<>();
    /** log lines for the computer */
    private final LinkedBlockingQueue<String> logs = new LinkedBlockingQueue<>(2000);
    private volatile boolean on = true;

    private DevLink(String base) {
        this.base = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }

    /** The link, if dev reload is on for this start (the intent's "dev" or files/dev.json), else null. */
    static DevLink start(Context c, Intent intent) {
        String url = intent != null ? intent.getStringExtra("dev") : null;
        if (url == null || url.isEmpty()) {
            try {
                File dir = c.getExternalFilesDir(null);
                File f = dir != null ? new File(dir, "dev.json") : null;
                if (f == null || !f.isFile()) return null;
                byte[] b = new byte[(int) f.length()];
                try (InputStream in = new FileInputStream(f)) {
                    int off = 0, n;
                    while (off < b.length && (n = in.read(b, off, b.length - off)) > 0) off += n;
                }
                url = new JSONObject(new String(b, StandardCharsets.UTF_8)).optString("url", "http://127.0.0.1:8787");
            } catch (Throwable t) {
                Log.w(TAG, "dev.json not read", t);
                return null;
            }
        }
        DevLink d = new DevLink(url);
        Thread t = new Thread(d::changes, "rg-dev");
        t.setDaemon(true);
        t.start();
        Thread s = new Thread(d::sendLogs, "rg-dev-log");
        s.setDaemon(true);
        s.start();
        Log.i(TAG, "dev reload on: " + url);
        return d;
    }

    void stop() {
        on = false;
    }

    private void changes() {
        long since = 0;
        boolean told = false;
        while (on) {
            try {
                JSONObject r = new JSONObject(new String(get("/dev/changes?wait=1&since=" + since, 30000), StandardCharsets.UTF_8));
                if (!told) {
                    log("dev: connected to " + base);
                    told = true;
                }
                JSONArray files = r.getJSONArray("files");
                ArrayList<Object[]> batch = new ArrayList<>();
                for (int i = 0; i < files.length(); i++) {
                    String p = files.getJSONObject(i).getString("p");
                    batch.add(new Object[] {"/games/" + p, get("/f/" + enc(p), 30000)});
                }
                // all at once, so the game starts again with every file of a save
                got.addAll(batch);
                since = r.getLong("v");
            } catch (Throwable t) {
                if (told) Log.i(TAG, "dev: server gone (" + t + ")");
                told = false;
                sleep(2000);
            }
        }
    }

    /**
     * On the game thread: the fetched files into the virtual directory and the
     * host's decoded copies of them forgotten; the engine starts the game
     * again or restyles it. True when it did something (commands to read).
     */
    boolean apply(Painter painter, Sound sound) {
        if (got.isEmpty()) return false;
        StringBuilder paths = new StringBuilder();
        int n = 0;
        Object[] f;
        while ((f = got.poll()) != null) {
            String p = (String) f[0];
            Engine.put(p, (byte[]) f[1]);
            if (painter != null) painter.forget(p);
            if (sound != null) sound.forget(p);
            GlHost.forget(p);
            paths.append(p).append('\n');
            n++;
        }
        long t0 = System.nanoTime();
        int r = Engine.devChanged(paths.toString());
        String what = r == 2 ? "game started again" : r == 1 ? "restyled" : "put";
        log("dev: " + n + " file" + (n == 1 ? "" : "s") + ", " + what + " (" + (System.nanoTime() - t0) / 1000000 + " ms)");
        return true;
    }

    /** Log lines (one or more) to the computer's terminal. */
    void log(String lines) {
        if (lines == null || lines.isEmpty()) return;
        logs.offer(lines);
    }

    private void sendLogs() {
        while (on) {
            try {
                StringBuilder b = new StringBuilder(logs.take());
                String more;
                while (b.length() < 65536 && (more = logs.poll()) != null) b.append('\n').append(more);
                post("/dev/log?from=" + enc(android.os.Build.MODEL), b.toString());
            } catch (InterruptedException e) {
                return;
            } catch (Throwable t) {
                // the server is not there: these lines are only in logcat
                sleep(1000);
            }
        }
    }

    private byte[] get(String path, int timeout) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        c.setConnectTimeout(3000);
        c.setReadTimeout(timeout);
        c.setUseCaches(false);
        try {
            if (c.getResponseCode() != 200) throw new IllegalStateException(path + ": HTTP " + c.getResponseCode());
            try (InputStream in = c.getInputStream()) {
                int len = c.getContentLength();
                ByteArrayOutputStream out = new ByteArrayOutputStream(len > 0 ? len : 65536);
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return out.toByteArray();
            }
        } finally {
            c.disconnect();
        }
    }

    private void post(String path, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        c.setConnectTimeout(3000);
        c.setReadTimeout(5000);
        c.setDoOutput(true);
        c.setRequestMethod("POST");
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        c.setFixedLengthStreamingMode(b.length);
        try (OutputStream out = c.getOutputStream()) {
            out.write(b);
        }
        c.getResponseCode();
        c.disconnect();
    }

    private static String enc(String p) throws Exception {
        // the path's parts encoded, its slashes kept
        StringBuilder b = new StringBuilder();
        for (String part : p.split("/", -1)) {
            if (b.length() > 0) b.append('/');
            b.append(URLEncoder.encode(part, "UTF-8").replace("+", "%20"));
        }
        return b.toString();
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
        }
    }
}
