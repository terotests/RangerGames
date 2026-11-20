// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Queue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Downloadable games (rg.store, the launcher's ⚙️ → Lataa pelejä): reads the
 * list of games the admin accepted on Sliqtly Games, downloads one as a pack
 * into the app's own files (files/store/&lt;id&gt;.rgpk) and mounts it over
 * /games, where the launcher finds it; at every start {@link #mountAll}
 * mounts the installed packs again, so they play without a network.
 *
 * The network runs on one background thread; the engine is only called on
 * the game thread (commands come from it, and the background thread hands
 * its results back through the input queue as Runnables). A pack is checked
 * before it is kept: every path must be inside the game's own folder (an
 * add-on's: &lt;base&gt;/addons/&lt;id&gt;/), so a download cannot replace the
 * launcher or another game.
 */
final class Store {
    private static final String TAG = "RangerGames";
    /** the server accepts at most 64 MB of files; the pack adds its headers */
    static final long MAX_PACK = 66L << 20;
    private static final Pattern ID = Pattern.compile("^[a-z0-9][a-z0-9_-]{0,63}$");
    private final Queue<Object> input;
    private final File dir;
    private final File indexFile;
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    /** installed games: id → {version, kind, extends, name, source, at} (game thread only) */
    private JSONObject index;

    Store(Context c, Queue<Object> input) {
        this.input = input;
        dir = new File(c.getFilesDir(), "store");
        indexFile = new File(dir, "index.json");
        index = readIndex();
    }

    private JSONObject readIndex() {
        try {
            if (indexFile.isFile()) return new JSONObject(new String(readFile(indexFile), StandardCharsets.UTF_8));
        } catch (Exception e) {
            Log.w(TAG, "store index", e);
        }
        return new JSONObject();
    }

    private void writeIndex() {
        try {
            dir.mkdirs();
            File tmp = new File(dir, "index.json.tmp");
            try (OutputStream o = new FileOutputStream(tmp)) {
                o.write(index.toString().getBytes(StandardCharsets.UTF_8));
            }
            if (!tmp.renameTo(indexFile)) throw new IOException("rename");
        } catch (Exception e) {
            Log.w(TAG, "store index not written", e);
        }
    }

    static byte[] readFile(File f) throws IOException {
        byte[] data = new byte[(int) f.length()];
        try (InputStream in = new FileInputStream(f)) {
            int off = 0, r;
            while (off < data.length && (r = in.read(data, off, data.length - off)) > 0) off += r;
        }
        return data;
    }

    /** where an installed game's files are in /games: its folder, an add-on's inside its base */
    private static String folder(String id, String kind, String ext) {
        return "addon".equals(kind) ? ext + "/addons/" + id : id;
    }

    /** At start (game thread, after the app's own games): the installed packs. */
    void mountAll() {
        for (Iterator<String> it = index.keys(); it.hasNext(); ) {
            String id = it.next();
            JSONObject e = index.optJSONObject(id);
            File f = new File(dir, id + ".rgpk");
            if (e == null || !f.isFile()) continue;
            try {
                int n = Engine.mount("/games", readFile(f));
                if (n < 0) throw new IOException("not a pack");
                note(id, e, false);
                Log.i(TAG, "store: " + id + " v" + e.optInt("version") + ", " + n + " files");
            } catch (Throwable t) {
                Log.w(TAG, "store: " + id + " not mounted", t);
            }
        }
    }

    /** the game's _store.json, which the engine reads for rg.games() (removed: out of the list) */
    private void note(String id, JSONObject e, boolean removed) throws Exception {
        JSONObject n = new JSONObject();
        n.put("id", id);
        n.put("version", e.optInt("version", 1));
        n.put("kind", e.optString("kind", "game"));
        n.put("extends", e.optString("extends", ""));
        n.put("source", e.optString("source", ""));
        if (removed) n.put("removed", true);
        String at = folder(id, e.optString("kind"), e.optString("extends"));
        Engine.put("/games/" + at + "/_store.json", n.toString().getBytes(StandardCharsets.UTF_8));
    }

    /** an answer for the game's onStore (game thread) */
    private static void event(JSONObject ev) {
        Engine.sensor("store", ev.toString());
    }

    /** the same from the network thread: through the input queue */
    private void later(final JSONObject ev) {
        input.add(new Runnable() {
            @Override
            public void run() {
                event(ev);
            }
        });
    }

    private static JSONObject error(String id, String reason, int status) {
        JSONObject ev = new JSONObject();
        try {
            ev.put("type", "error");
            if (id != null) ev.put("id", id);
            ev.put("reason", reason);
            if (status != 0) ev.put("status", status);
        } catch (Exception ignored) {
        }
        return ev;
    }

    /** A "store" command from the game (game thread). */
    void command(String name, JSONObject opts) {
        if (opts == null) opts = new JSONObject();
        switch (name) {
            case "catalog": catalog(opts.optString("url")); break;
            case "install": install(opts); break;
            case "remove": remove(opts.optString("id")); break;
            default: break;
        }
    }

    private static HttpURLConnection open(String url) throws IOException {
        if (!url.startsWith("https://")) throw new IOException("https only");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "RangerGames-Android");
        return c;
    }

    private void catalog(final String url) {
        net.execute(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection c = null;
                try {
                    c = open(url);
                    int code = c.getResponseCode();
                    if (code != 200) {
                        later(error(null, "http", code));
                        return;
                    }
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    try (InputStream in = c.getInputStream()) {
                        byte[] b = new byte[16384];
                        int n;
                        while ((n = in.read(b)) > 0) {
                            out.write(b, 0, n);
                            if (out.size() > (4 << 20)) throw new IOException("catalog too big");
                        }
                    }
                    JSONObject cat = new JSONObject(out.toString("UTF-8"));
                    JSONObject ev = new JSONObject();
                    ev.put("type", "catalog");
                    ev.put("games", cat.optJSONArray("games") != null ? cat.optJSONArray("games") : new JSONArray());
                    later(ev);
                } catch (java.net.UnknownHostException | java.net.SocketTimeoutException | java.net.ConnectException e) {
                    later(error(null, "offline", 0));
                } catch (Exception e) {
                    Log.w(TAG, "store catalog", e);
                    later(error(null, e instanceof IOException ? "offline" : "http", 0));
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        });
    }

    private void install(final JSONObject g) {
        final String id = g.optString("id");
        final String kind = "addon".equals(g.optString("kind")) ? "addon" : "game";
        final String ext = g.optString("extends");
        final String url = g.optString("pack");
        if (!ID.matcher(id).matches() || id.equals("launcher") || ("addon".equals(kind) && !ID.matcher(ext).matches())) {
            event(error(id, "bad-pack", 0));
            return;
        }
        // not over a game the app came with
        if ("game".equals(kind) && !index.has(id) && Engine.read("/games/" + id + "/game.json") != null) {
            event(error(id, "taken", 0));
            return;
        }
        if ("addon".equals(kind) && Engine.read("/games/" + ext + "/game.json") == null) {
            event(error(id, "no-base", 0));
            return;
        }
        if (g.optLong("bytes") > MAX_PACK) {
            event(error(id, "too-big", 0));
            return;
        }
        final String prefix = folder(id, kind, ext) + "/";
        net.execute(new Runnable() {
            @Override
            public void run() {
                dir.mkdirs();
                final File tmp = new File(dir, id + ".part");
                HttpURLConnection c = null;
                try {
                    c = open(url);
                    int code = c.getResponseCode();
                    if (code != 200) {
                        later(error(id, "http", code));
                        return;
                    }
                    long total = c.getContentLength();
                    if (total > MAX_PACK) {
                        later(error(id, "too-big", 0));
                        return;
                    }
                    long got = 0, told = 0;
                    try (InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(tmp)) {
                        byte[] b = new byte[65536];
                        int n;
                        while ((n = in.read(b)) > 0) {
                            o.write(b, 0, n);
                            got += n;
                            if (got > MAX_PACK) {
                                later(error(id, "too-big", 0));
                                return;
                            }
                            if (got - told >= 256 * 1024) {
                                told = got;
                                JSONObject ev = new JSONObject();
                                ev.put("type", "progress");
                                ev.put("id", id);
                                ev.put("done", got);
                                ev.put("total", total > 0 ? total : g.optLong("bytes"));
                                later(ev);
                            }
                        }
                    }
                    final byte[] data = readFile(tmp);
                    String why = check(data, prefix);
                    if (why != null) {
                        Log.w(TAG, "store: " + id + ": " + why);
                        later(error(id, "bad-pack", 0));
                        return;
                    }
                    final File keep = new File(dir, id + ".rgpk");
                    if (!tmp.renameTo(keep)) throw new IOException("rename");
                    input.add(new Runnable() {
                        @Override
                        public void run() {
                            mounted(g, id, kind, ext, data);
                        }
                    });
                } catch (java.net.UnknownHostException | java.net.SocketTimeoutException | java.net.ConnectException e) {
                    later(error(id, "offline", 0));
                } catch (IOException e) {
                    Log.w(TAG, "store install " + id, e);
                    later(error(id, tmp.getParentFile() != null && tmp.getParentFile().getUsableSpace() < (8L << 20) ? "storage" : "offline", 0));
                } catch (Exception e) {
                    Log.w(TAG, "store install " + id, e);
                    later(error(id, "bad-pack", 0));
                } finally {
                    if (c != null) c.disconnect();
                    if (tmp.exists()) tmp.delete();
                }
            }
        });
    }

    /** the downloaded pack into /games and the index (game thread) */
    private void mounted(JSONObject g, String id, String kind, String ext, byte[] data) {
        try {
            int n = Engine.mount("/games", data);
            if (n < 0) throw new IOException("not a pack");
            JSONObject e = new JSONObject();
            e.put("version", g.optInt("version", 1));
            e.put("kind", kind);
            e.put("extends", ext);
            e.put("name", g.optString("name", id));
            e.put("source", g.optString("source", ""));
            e.put("at", System.currentTimeMillis());
            index.put(id, e);
            writeIndex();
            note(id, e, false);
            JSONObject ev = new JSONObject();
            ev.put("type", "installed");
            ev.put("id", id);
            ev.put("version", e.optInt("version"));
            event(ev);
        } catch (Exception e) {
            Log.w(TAG, "store mount " + id, e);
            event(error(id, "bad-pack", 0));
        }
    }

    /** takes an installed game away: out of the list now, its files from memory at the next start */
    private void remove(String id) {
        JSONObject e = index.optJSONObject(id);
        if (e == null) {
            event(error(id, "not-installed", 0));
            return;
        }
        try {
            note(id, e, true);
            index.remove(id);
            writeIndex();
            new File(dir, id + ".rgpk").delete();
            JSONObject ev = new JSONObject();
            ev.put("type", "removed");
            ev.put("id", id);
            event(ev);
        } catch (Exception x) {
            Log.w(TAG, "store remove " + id, x);
            event(error(id, "storage", 0));
        }
    }

    /**
     * Why the bytes are not a pack of the game's own folder (null: they are).
     * Reads the headers as Vfs.mount_pack does (RGPK1, count, then path,
     * size, bytes per file).
     */
    static String check(byte[] b, String prefix) {
        int[] pos = {0};
        if (!"RGPK1".equals(line(b, pos))) return "not RGPK1";
        long count;
        try {
            count = Long.parseLong(line(b, pos));
        } catch (Exception e) {
            return "no file count";
        }
        if (count < 1 || count > 100000) return "file count " + count;
        for (long i = 0; i < count; i++) {
            String path = line(b, pos);
            long size;
            try {
                size = Long.parseLong(line(b, pos));
            } catch (Exception e) {
                return "no size for " + path;
            }
            if (path == null || !path.startsWith(prefix) || path.length() == prefix.length()) return "outside the folder: " + path;
            if (path.contains("..") || path.contains("//") || path.contains("\\") || path.indexOf('\0') >= 0) return "bad path: " + path;
            if (path.endsWith("/_store.json")) return "reserved: " + path;
            if (size < 0 || pos[0] + size > b.length) return "ends inside " + path;
            pos[0] += (int) size;
        }
        return null;
    }

    private static String line(byte[] b, int[] pos) {
        int start = pos[0];
        int i = start;
        while (i < b.length && b[i] != '\n') {
            if (i - start > 4096) return null;
            i++;
        }
        if (i >= b.length) return null;
        pos[0] = i + 1;
        return new String(b, start, i - start, StandardCharsets.UTF_8);
    }
}
