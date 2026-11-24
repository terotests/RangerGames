// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Build;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Paints the engine's draw stream (crates/rg_engine/src/draw.rs) on an
 * Android Canvas, as web/js/painter.js does on a 2D canvas: EVG has placed
 * everything, this class only fills, strokes and writes text.
 */
final class Painter {
    private static final int HEADER = 23;
    private static final android.graphics.PorterDuffXfermode ADD = new android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.ADD);
    private static final int RECT = 0, BORDER = 1, IMAGE = 2, TEXT = 3, PUSH_CLIP = 4, POP_CLIP = 5, PATH = 6, STROKE = 7, SPHERE = 8, SPLATS = 10;

    private final AssetManager assets;
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
    private final Paint image = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Path path = new Path();
    private final RectF rf = new RectF();
    private final Rect src = new Rect();
    private final float[] radii = new float[8];
    private final HashMap<String, Typeface> fonts = new HashMap<>();
    /** decoded images, the least recently drawn dropped past IMAGE_BUDGET bytes (map tiles add up) */
    private static final long IMAGE_BUDGET = 48L * 1024 * 1024;
    private long imageBytes;
    private final LinkedHashMap<String, Bitmap> images = new LinkedHashMap<String, Bitmap>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Bitmap> eldest) {
            if (imageBytes <= IMAGE_BUDGET || size() <= 24) return false;
            Bitmap b = eldest.getValue();
            if (b != null) imageBytes -= b.getByteCount();
            return true;
        }
    };
    private final Paint.FontMetrics fm = new Paint.FontMetrics();
    /** textured globes (kind 8): the maps as pixels, at most 1024 wide */
    private final HashMap<String, int[]> maps = new HashMap<>();
    private final HashMap<String, int[]> mapSizes = new HashMap<>();
    private int[] sphereOut = new int[0];
    // The globe pictures go round a ring: the hardware canvas only records
    // drawBitmap, and the render thread reads the pixels later, so a bitmap
    // written again for the next globe or the next frame could show the new
    // picture in the old box (the Moon flicked aside for a moment).
    private final Bitmap[] sphereBitmaps = new Bitmap[6];
    private int sphereNext;
    /** pixels of the cast globe per game unit (the bitmap is drawn smoothed) */
    private static final float SPHERE_RES = 0.5f;
    /** real heights close by: the ground's mesh (Terrain), its map as a texture */
    private final Terrain terrain = new Terrain();
    private final HashMap<String, Bitmap> mapBitmaps = new HashMap<>();
    private final Paint meshPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private float[] meshTex = new float[0];
    /** the globes on the GPU (GlSphere), when the phone has GLES 3.0; else Sphere and Terrain in software */
    private GlSphere gl;
    /** pixels per device pixel of the GPU globes, far and close by the ground (painter.js: 1 and 0.6; a phone's GPU is slower) */
    private static final float GL_RES = 0.5f, GL_RES_NEAR = 0.4f;
    /** at most this many pixels in one globe picture (it is read back every frame) */
    private static final int GL_MAX_PIXELS = 1600 * 1000;

    Painter(AssetManager assets) {
        this.assets = assets;
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        stroke.setStrokeCap(Paint.Cap.ROUND);
    }

    /** Starts the GPU globes on this (the game's) thread; true when they work. */
    // adb shell setprop debug.rg.glres 0.5: the GPU globes' resolution times
    // this, read every two seconds (for measuring on a device)
    private float glTune = 1;
    private long glTuneAt;

    private float glTune() {
        long now = System.currentTimeMillis();
        if (now - glTuneAt > 2000) {
            glTuneAt = now;
            try {
                Object v = Class.forName("android.os.SystemProperties").getMethod("get", String.class, String.class).invoke(null, "debug.rg.glres", "1");
                glTune = Math.max(0.1f, Math.min(2f, Float.parseFloat((String) v)));
                Object m = Class.forName("android.os.SystemProperties").getMethod("get", String.class, String.class).invoke(null, "debug.rg.glmesh", "1");
                if (gl != null) gl.meshOn = !"0".equals(m);
                Object bp = Class.forName("android.os.SystemProperties").getMethod("get", String.class, String.class).invoke(null, "debug.rg.glbake", "1");
                glBake = !"0".equals(bp);
                Object li = Class.forName("android.os.SystemProperties").getMethod("get", String.class, String.class).invoke(null, "debug.rg.gllite", "2");
                if (gl != null) gl.lite = "0".equals(li) ? 0 : "1".equals(li) ? 1 : 2;
                Object ed = Class.forName("android.os.SystemProperties").getMethod("get", String.class, String.class).invoke(null, "debug.rg.gledge", "1");
                if (gl != null) gl.edge = !"0".equals(ed);
                Object ma = Class.forName("android.os.SystemProperties").getMethod("get", String.class, String.class).invoke(null, "debug.rg.glmsaa", "0");
                if (gl != null) {
                    try {
                        gl.msaa = Math.max(0, Math.min(4, Integer.parseInt((String) ma)));
                    } catch (NumberFormatException e) {
                        gl.msaa = 0;
                    }
                }
            } catch (Throwable ignored) {
                glTune = 1;
            }
        }
        return glTune;
    }

    boolean startGl() {
        GlSphere g = new GlSphere();
        if (g.init(assets)) gl = g;
        return gl != null;
    }

    /** The GPU globes in the context the app paints everything with (GlCtx, current now). */
    boolean startGlShared() {
        GlSphere g = new GlSphere();
        if (g.initShared(assets)) gl = g;
        return gl != null;
    }

    /** the end of a GL-painted frame (the globes' log) */
    void glFrameDone() {
        if (gl != null) gl.frameDone();
        glTune();
    }

    /** liquid splats (kind 10) in the GPU globes' context, when it works */
    private GlSplats splats;

    boolean canSplats() {
        if (gl == null || !gl.ok) return false;
        GlSplats s = new GlSplats(gl);
        if (s.ok) splats = s;
        return splats != null;
    }

    /** where a command's extra numbers after the optional parts begin */
    private static int extras(float[] nums, int i) {
        int flags = (int) nums[i + 17];
        int e = i + HEADER;
        if ((flags & 1) != 0) e += 4;
        if ((flags & 4) != 0) e += 7;
        if ((flags & 64) != 0) e += 4;
        if ((flags & 1024) != 0) e += 4;
        return e;
    }

    /**
     * The globes from command i on that follow one another (a planet's ball
     * and its detail pictures) drawn on the GPU into one picture; returns the
     * index after the last one, or -1 when the GPU failed (nothing drawn).
     */
    private int glSpheres(Canvas c, float[] nums, String[] strings, int i, float scale) {
        return glSpheres(c, nums, strings, i, scale, null);
    }

    /**
     * For GL painting (GlHost.globes, the shared context): the globes of
     * nums (one run of them) into a texture; out: texture, x, y, w, h (game
     * units), the texture's part across and down, 0 (its first row is the
     * top). False when nothing is to be shown.
     */
    boolean glGlobes(float[] nums, String[] strings, float px, float[] out) {
        if (gl == null || !gl.ok) return false;
        out[0] = 0;
        if (nums.length > HEADER && (int) nums[0] == SPLATS) {
            // liquid splats over the game's box: their picture as a texture, rows from below (flipped)
            float w = nums[3], h = nums[4];
            if (splats == null || !splats.ok || w <= 0 || h <= 0) return false;
            int tex = splats.texture(nums, extras(nums, 0), w, h, px, nums[8]);
            if (tex == 0) return false;
            put(out, tex, 0, 0, w, h, splats.pw / (float) splats.texWidth(), splats.ph / (float) splats.texHeight());
            out[7] = 1;
            return true;
        }
        int r = glSpheres(null, nums, strings, 0, px, out);
        return r >= 0 && out[0] != 0;
    }

    private int glSpheres(Canvas c, float[] nums, String[] strings, int i, float scale, float[] out) {
        int n = nums.length, j = i;
        float x0 = Float.MAX_VALUE, y0 = Float.MAX_VALUE, x1 = -Float.MAX_VALUE, y1 = -Float.MAX_VALUE;
        boolean near = false;
        while (j + HEADER <= n && (int) nums[j] == SPHERE) {
            float x = nums[j + 1], y = nums[j + 2], w = nums[j + 3], h = nums[j + 4];
            int s0 = (int) nums[j + 18], s2 = (int) nums[j + 20], nx = (int) nums[j + 22];
            if (nx >= 20 && w > 0 && h > 0 && s0 >= 0 && s0 < strings.length && !strings[s0].isEmpty()) {
                x0 = Math.min(x0, x);
                y0 = Math.min(y0, y);
                x1 = Math.max(x1, x + w);
                y1 = Math.max(y1, y + h);
                if (nx >= 40 && s2 >= 0 && s2 < strings.length && strings[s2].indexOf('|') > 0 && nums[extras(nums, j) + 35] > 0.5f) near = true;
            }
            j = j + HEADER + (int) nums[j + 22];
        }
        if (x1 <= x0 || y1 <= y0) return j;
        // far off: the last picture again, moved and scaled, while the globe looks the same from here
        Baked bk = !near && glBake ? baked(nums, strings, i, j, x0, y0, x1, y1) : null;
        if (bk != null && c == null && bk.tex != 0 && bk.kept) {
            put(out, bk.tex, x0, y0, x1 - x0, y1 - y0, bk.pw / (float) bk.tw, bk.ph / (float) bk.th);
            return j;
        }
        if (bk != null && c != null && bk.bm != null) {
            src.set(0, 0, bk.pw, bk.ph);
            rf.set(x0, y0, x1, y1);
            c.drawBitmap(bk.bm, src, rf, image);
            if (++bakedReused == 300) {
                android.util.Log.i("RangerGames", "GL globes: 300 kept pictures reused");
                bakedReused = 0;
            }
            return j;
        }
        float k = scale * (near ? GL_RES_NEAR : GL_RES);
        // a small globe (far off) is cheap: at the screen's own pixels, sharp and steady
        if (!near && (x1 - x0) * (y1 - y0) * scale * scale < 250000) k = scale;
        float px = (x1 - x0) * (y1 - y0) * k * k;
        if (px > GL_MAX_PIXELS) k *= (float) Math.sqrt(GL_MAX_PIXELS / px);
        k *= glTune();
        // detail pictures still decoding (another thread): the ball covers their place meanwhile
        boolean allReady = true;
        for (int q = i; q < j; q = q + HEADER + (int) nums[q + 22]) {
            int s0 = (int) nums[q + 18], nx = (int) nums[q + 22];
            if (nx >= 32 && nums[extras(nums, q) + 24] > 0.5f && s0 >= 0 && s0 < strings.length && !strings[s0].isEmpty() && !gl.ready(strings[s0])) allReady = false;
        }
        gl.noHole = !allReady;
        gl.begin(x0, y0, x1 - x0, y1 - y0, k);
        boolean any = false;
        for (int q = i; q < j; q = q + HEADER + (int) nums[q + 22]) {
            float x = nums[q + 1], y = nums[q + 2], w = nums[q + 3], h = nums[q + 4];
            int s0 = (int) nums[q + 18], s1 = (int) nums[q + 19], s2 = (int) nums[q + 20], nx = (int) nums[q + 22];
            if (nx < 20 || w <= 0 || h <= 0 || s0 < 0 || s0 >= strings.length || strings[s0].isEmpty()) continue;
            String ls = s1 >= 0 && s1 < strings.length ? strings[s1] : "";
            // "shading|shape" or "shading|shape|window heights" (a detail window's own heights)
            String hs = null, gs = null, ds = null;
            if (nx >= 40 && s2 >= 0 && s2 < strings.length) {
                String[] parts = strings[s2].split("\\|");
                if (parts.length >= 2 && !parts[0].isEmpty()) {
                    hs = parts[0];
                    gs = parts[1];
                    if (parts.length > 2 && !parts[2].isEmpty()) ds = parts[2];
                }
            }
            int at = extras(nums, q);
            // close by: the ground's height under the eye, for the mesh's first ring
            float gnd = 1;
            if (gs != null && nums[at + 35] > 0.5f) {
                int[] gm = map(gs);
                int[] gsz = mapSizes.get(gs);
                if (gm != null && gsz != null) {
                    terrain.set(nums, at, gm, gsz[0], gsz[1]);
                    double ex = nums[at], ey = nums[at + 1], ez = nums[at + 2], el = Math.sqrt(ex * ex + ey * ey + ez * ez);
                    gnd = (float) terrain.ground(ex / el, ey / el, ez / el);
                }
            }
            // the rings' pictures "colour|opacity" (slot 21, with 44 numbers)
            int rsi = (int) nums[q + 21];
            gl.rings = nx >= 44 && nums[at + 42] > 0.5f && rsi >= 0 && rsi < strings.length ? strings[rsi] : null;
            any |= gl.draw(strings[s0], ls, hs, gs, ds, x, y, w, h, nums, at, nx, gnd);
        }
        if (c == null) {
            int tex = gl.endTexture();
            if (tex == 0) return -1;
            if (any) {
                put(out, tex, x0, y0, gl.width() / gl.scale(), gl.height() / gl.scale(), gl.width() / (float) gl.texWidth(), gl.height() / (float) gl.texHeight());
                if (bk != null) {
                    // kept in a texture of its own for the next frames
                    bk.tex = gl.keep(bk.tex);
                    bk.tw = gl.width() + 1;
                    bk.th = gl.height() + 1;
                    bk.pw = gl.width();
                    bk.ph = gl.height();
                    bk.at = System.currentTimeMillis();
                    bk.bw = gl.width() / gl.scale();
                    bk.bh = gl.height() / gl.scale();
                    bk.kept = true;
                }
            } else if (bk != null) {
                bk.kept = false;
            }
            return j;
        }
        Bitmap bm = gl.end();
        if (bm == null) return -1;
        if (any) {
            src.set(0, 0, gl.width(), gl.height());
            rf.set(x0, y0, x0 + gl.width() / gl.scale(), y0 + gl.height() / gl.scale());
            c.drawBitmap(bm, src, rf, image);
            if (bk != null) {
                // kept for the next frames: a copy (the ring's bitmap is written again soon); the box the picture covers
                bk.bm = Bitmap.createBitmap(bm, 0, 0, gl.width(), gl.height());
                bk.pw = gl.width();
                bk.ph = gl.height();
                bk.at = System.currentTimeMillis();
                bk.bw = gl.width() / gl.scale();
                bk.bh = gl.height() / gl.scale();
            }
        } else if (bk != null) {
            bk.bm = null;
        }
        return j;
    }

    // ---- far globes kept as pictures (Tero's idea: compute once, then a texture) ----
    // adb shell setprop debug.rg.glbake 0: every frame drawn again (for comparing)
    private boolean glBake = true;
    private int bakedReused;

    private static void put(float[] out, int tex, float x, float y, float w, float h, float u1, float v1) {
        out[0] = tex;
        out[1] = x;
        out[2] = y;
        out[3] = w;
        out[4] = h;
        out[5] = u1;
        out[6] = v1;
        out[7] = 0;
    }

    private static final class Baked {
        String key;
        // GL painting: the kept picture's texture (w × h), and whether it holds the entry's picture
        int tex, tw, th;
        boolean kept;
        float[] eye = new float[3], sun = new float[3], cam = new float[9];
        float el, w, h, bw, bh;
        int count, pw, ph;
        long at;
        Bitmap bm;
    }

    private final HashMap<String, Baked> bakes = new HashMap<>();

    /**
     * The kept picture of these globes (from command i to j) when it still
     * shows them right: the eye's direction and distance from the globe and
     * the sun moved less than about half a pixel of the picture, the same
     * pictures, at most a second old. Otherwise the entry to fill (its
     * picture null). The camera's turn only moves the picture on the screen.
     */
    private Baked baked(float[] nums, String[] strings, int i, int j, float x0, float y0, float x1, float y1) {
        int at = extras(nums, i);
        int s0 = (int) nums[i + 18];
        StringBuilder key = new StringBuilder();
        int count = 0;
        for (int q = i; q < j; q = q + HEADER + (int) nums[q + 22]) {
            int sq = (int) nums[q + 18];
            if (sq >= 0 && sq < strings.length) key.append(strings[sq]).append('|');
            count++;
        }
        String k = key.toString();
        String slot = s0 >= 0 && s0 < strings.length ? strings[s0] : "";
        Baked b = bakes.get(slot);
        if (b == null) {
            b = new Baked();
            bakes.put(slot, b);
        }
        float ex = nums[at], ey = nums[at + 1], ez = nums[at + 2];
        float el = (float) Math.sqrt(ex * ex + ey * ey + ez * ez);
        float w = x1 - x0, h = y1 - y0;
        // drifting cloud bands or morphing clouds (48 or 72 numbers) change every frame: drawn anew
        boolean moving = false;
        for (int q = i; q < j; q = q + HEADER + (int) nums[q + 22]) {
            int nq = (int) nums[q + 22], aq = extras(nums, q);
            if (nq >= 48 && nums[aq + 44] > 0) moving = true;
            if (nq >= 72 && (nums[aq + 48] > 0 || nums[aq + 50] > 0)) moving = true;
        }
        boolean same = !moving && (b.bm != null || b.kept) && k.equals(b.key) && count == b.count && System.currentTimeMillis() - b.at < 1000;
        if (same) {
            // a third of a pixel of the picture (about half a screen pixel), as an angle seen from the globe and as a share of its size
            float tol = 0.3f / Math.max(8, Math.max(b.pw, b.ph));
            float dx = ex / el - b.eye[0], dy = ey / el - b.eye[1], dz = ez / el - b.eye[2];
            float sx = nums[at + 12] - b.sun[0], sy = nums[at + 13] - b.sun[1], sz = nums[at + 14] - b.sun[2];
            // close to the globe a small turn of the eye round it moves the ground under the eye a lot
            // (by 1 / height): the eye's tolerance shrinks with the height (at 400 km over the Moon the
            // picture used to jump by several pixels, step by step)
            float m = Math.max(0.01f, (el - 1) / el);
            same = Math.sqrt(dx * dx + dy * dy + dz * dz) < tol * m
                    && Math.abs(el / b.el - 1) < tol * m
                    && Math.sqrt(sx * sx + sy * sy + sz * sz) < tol * 4
                    && Math.abs(w / b.w - 1) < tol * 2 && Math.abs(h / b.h - 1) < tol * 2;
            // cut by the screen's edge: a turn of the camera changes what shows, not only where
            float vw = nums[at + 16], vh = nums[at + 17];
            if (same && (x0 <= 0.5f || y0 <= 0.5f || x1 >= vw - 0.5f || y1 >= vh - 0.5f)) {
                for (int a = 3; a < 12 && same; a++) same = Math.abs(nums[at + a] - b.cam[a - 3]) < tol;
            }
        }
        if (same) return b;
        b.key = k;
        b.count = count;
        b.eye[0] = ex / el;
        b.eye[1] = ey / el;
        b.eye[2] = ez / el;
        b.el = el;
        b.sun[0] = nums[at + 12];
        b.sun[1] = nums[at + 13];
        b.sun[2] = nums[at + 14];
        b.w = w;
        b.h = h;
        for (int a = 3; a < 12; a++) b.cam[a - 3] = nums[at + a];
        b.bm = null;
        b.kept = false;
        return b;
    }

    private static int argb(float r, float g, float b, float a) {
        int ai = Math.round(Math.max(0, Math.min(1, a)) * 255);
        return (ai << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
    }

    private static int clamp(float v) {
        return Math.max(0, Math.min(255, (int) v));
    }

    /** Fredoka (assets/fonts) at the weight asked for, else the system's sans. */
    Typeface font(String weight, boolean italic) {
        String key = weight + (italic ? "i" : "");
        Typeface t = fonts.get(key);
        if (t != null) return t;
        int w = 400;
        if ("bold".equals(weight)) w = 700;
        else if (weight != null && !weight.isEmpty() && !"normal".equals(weight)) {
            try {
                w = Integer.parseInt(weight);
            } catch (NumberFormatException ignored) {
            }
        }
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                t = new Typeface.Builder(assets, "fonts/Fredoka.ttf")
                        .setFontVariationSettings("'wght' " + Math.max(300, Math.min(700, w)))
                        .build();
            } else {
                t = Typeface.createFromAsset(assets, "fonts/Fredoka.ttf");
            }
        } catch (Exception e) {
            t = null;
        }
        if (t == null) t = Typeface.create(Typeface.SANS_SERIF, w >= 600 ? Typeface.BOLD : Typeface.NORMAL);
        if (italic) t = Typeface.create(t, t.isBold() ? Typeface.BOLD_ITALIC : Typeface.ITALIC);
        fonts.put(key, t);
        return t;
    }

    /** An image of the virtual directory, decoded once (PNG, JPEG, WebP). */
    private Bitmap bitmap(String s) {
        if (images.containsKey(s)) return images.get(s);
        Bitmap b = null;
        byte[] bytes = s.startsWith("/") ? Engine.read(s) : null;
        if (bytes != null) b = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (b != null) imageBytes += b.getByteCount();
        images.put(s, b);
        return b;
    }

    /** A map picture as ARGB pixels (scaled to at most 1024 × 512), decoded once. */
    private int[] map(String s) {
        if (maps.containsKey(s)) return maps.get(s);
        int[] px = null;
        byte[] bytes = s.startsWith("/") ? Engine.read(s) : null;
        if (bytes != null) {
            Bitmap b = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (b != null) {
                if (b.getWidth() > 1024) {
                    Bitmap sb = Bitmap.createScaledBitmap(b, 1024, Math.max(1, b.getHeight() * 1024 / b.getWidth()), true);
                    b.recycle();
                    b = sb;
                }
                int w = b.getWidth(), h = b.getHeight();
                px = new int[w * h];
                b.getPixels(px, 0, w, 0, 0, w, h);
                b.recycle();
                mapSizes.put(s, new int[] {w, h});
            }
        }
        maps.put(s, px);
        return px;
    }

    private void sphere(Canvas c, String s, String ls, String hs, float x, float y, float w, float h, float[] nums, int at, int nx) {
        int[] tex = map(s);
        if (tex == null) return;
        int[] size = mapSizes.get(s);
        // the 32-number form: the air, the city lights (second picture) and the relief
        int[] lt = nx >= 32 && !ls.isEmpty() ? map(ls) : null;
        int[] lsize = lt != null ? mapSizes.get(ls) : null;
        // the 40-number form: real heights, "shading|shape" (Terrain)
        int[] hm = null, gm = null;
        int bar = hs.indexOf('|');
        // a third part (a detail window's own heights) is only for the GPU's ground
        int bar2 = bar > 0 ? hs.indexOf('|', bar + 1) : -1;
        String gname = bar > 0 ? (bar2 > 0 ? hs.substring(bar + 1, bar2) : hs.substring(bar + 1)) : "";
        if (nx >= 40 && bar > 0) {
            hm = map(hs.substring(0, bar));
            gm = map(gname);
            if (hm == null || gm == null) hm = gm = null;
        }
        boolean window = nx >= 32 && nums[at + 24] > 0.5f;
        boolean near = hm != null && nums[at + 35] > 0.5f;
        // close by the ground is a mesh; a detail picture (a ball of radius 1) would cover it
        if (near && window) return;
        boolean mesh = false;
        if (near) {
            int[] gsize = mapSizes.get(gname);
            terrain.set(nums, at, gm, gsize[0], gsize[1]);
            mesh = terrain.mesh(nums, at);
        }
        int[] hsize = hm != null ? mapSizes.get(hs.substring(0, bar)) : null;
        int ow = Math.max(1, Math.round(w * SPHERE_RES)), oh = Math.max(1, Math.round(h * SPHERE_RES));
        if (sphereOut.length < ow * oh) sphereOut = new int[ow * oh];
        Sphere.cast(sphereOut, ow, oh, x, y, w, h, tex, size[0], size[1], nums, at, nx >= 32,
                lt, lsize != null ? lsize[0] : 0, lsize != null ? lsize[1] : 0,
                hm, hsize != null ? hsize[0] : 0, hsize != null ? hsize[1] : 0, mesh ? Math.cos(terrain.reach) : -2);
        int slot = sphereNext;
        sphereNext = (sphereNext + 1) % sphereBitmaps.length;
        Bitmap bm = sphereBitmaps[slot];
        if (bm == null || bm.getWidth() < ow || bm.getHeight() < oh) {
            // no recycle(): an earlier frame may still be drawing the old one
            bm = Bitmap.createBitmap(Math.max(ow, 64), Math.max(oh, 64), Bitmap.Config.ARGB_8888);
            sphereBitmaps[slot] = bm;
        }
        bm.setPixels(sphereOut, 0, ow, 0, 0, ow, oh);
        if (mesh && terrain.count > 0) {
            // the ground close by: its mesh over the cast ball, into the same
            // bitmap with a software canvas (drawVertices needs one before Android 10)
            Bitmap tb = mapBitmaps.get(s);
            if (tb == null) {
                tb = Bitmap.createBitmap(tex, size[0], size[1], Bitmap.Config.ARGB_8888);
                mapBitmaps.put(s, tb);
            }
            int nv = terrain.count * 2;
            if (meshTex.length < nv) meshTex = new float[nv];
            for (int k = 0; k < nv; k += 2) {
                meshTex[k] = terrain.texs[k] * size[0];
                meshTex[k + 1] = terrain.texs[k + 1] * size[1];
            }
            meshPaint.setShader(new BitmapShader(tb, Shader.TileMode.REPEAT, Shader.TileMode.CLAMP));
            Canvas sc = new Canvas(bm);
            sc.clipRect(0, 0, ow, oh);
            sc.scale(ow / w, oh / h);
            sc.translate(-x, -y);
            sc.drawVertices(Canvas.VertexMode.TRIANGLES, nv, terrain.verts, 0, meshTex, 0, terrain.colors, 0, null, 0, 0, meshPaint);
        }
        src.set(0, 0, ow, oh);
        rf.set(x, y, x + w, y + h);
        c.drawBitmap(bm, src, rf, image);
    }

    private void roundRect(float x, float y, float w, float h, float tl, float tr, float br, float bl) {
        float lim = Math.min(w, h) / 2;
        tl = Math.max(0, Math.min(tl, lim));
        tr = Math.max(0, Math.min(tr, lim));
        br = Math.max(0, Math.min(br, lim));
        bl = Math.max(0, Math.min(bl, lim));
        radii[0] = radii[1] = tl;
        radii[2] = radii[3] = tr;
        radii[4] = radii[5] = br;
        radii[6] = radii[7] = bl;
        path.reset();
        rf.set(x, y, x + w, y + h);
        path.addRoundRect(rf, radii, Path.Direction.CW);
    }

    /**
     * nums and strings: the frame's stream; view: scale, x, y, game w, h (dp);
     * density: px per dp; background: the colour around and under the game.
     */
    void paint(Canvas c, float[] nums, String[] strings, double[] view, float density, int background) {
        c.drawColor(background);
        float scale = (float) view[0] * density;
        int base = c.save();
        c.translate((float) view[1] * density, (float) view[2] * density);
        c.scale(scale, scale);
        // the game's area clips everything (a letterboxed game stays in its box)
        c.clipRect(0, 0, (float) view[3], (float) view[4]);
        int clips = 0;
        int i = 0, n = nums.length;
        while (i + HEADER <= n) {
            int k = (int) nums[i];
            if (k == SPLATS) {
                int nx = (int) nums[i + 22], e = extras(nums, i);
                float w = nums[i + 3], h = nums[i + 4];
                if (splats != null && splats.ok && gl.ok && w > 0 && h > 0 && e + nx <= n) {
                    Bitmap bm = splats.draw(nums, e, w, h, scale, nums[i + 8]);
                    if (bm != null) {
                        // GL's rows from below: flipped into place
                        c.save();
                        c.translate(0, h);
                        c.scale(1, -1);
                        src.set(0, 0, splats.pw, splats.ph);
                        rf.set(0, 0, w, h);
                        c.drawBitmap(bm, src, rf, image);
                        c.restore();
                    }
                }
                i = i + HEADER + nx;
                continue;
            }
            if (k == SPHERE && gl != null && gl.ok) {
                int next = glSpheres(c, nums, strings, i, scale);
                if (next >= 0) {
                    i = next;
                    continue;
                }
            }
            float x = nums[i + 1], y = nums[i + 2], w = nums[i + 3], h = nums[i + 4];
            float r = nums[i + 5], g = nums[i + 6], b = nums[i + 7], a = nums[i + 8];
            float tl = nums[i + 9], tr = nums[i + 10], br = nums[i + 11], bl = nums[i + 12];
            float t = nums[i + 13], rot = nums[i + 14], rox = nums[i + 15], roy = nums[i + 16];
            int flags = (int) nums[i + 17];
            int s0 = (int) nums[i + 18], s1 = (int) nums[i + 19], s2 = (int) nums[i + 20];
            float ls = nums[i + 21];
            int nx = (int) nums[i + 22];
            int e = i + HEADER;
            i = e + nx;
            int gradAt = -1, shadowAt = -1, cropAt = -1, tileAt = -1, ptsAt = -1;
            if ((flags & 1) != 0) { gradAt = e; e += 4; }
            if ((flags & 4) != 0) { shadowAt = e; e += 7; }
            if ((flags & 64) != 0) { cropAt = e; e += 4; }
            if ((flags & 1024) != 0) { tileAt = e; e += 4; }
            if (k == PATH || k == STROKE) ptsAt = e;

            if (k == SPHERE) {
                String s = s0 >= 0 && s0 < strings.length ? strings[s0] : "";
                String lsrc = s1 >= 0 && s1 < strings.length ? strings[s1] : "";
                String hs = s2 >= 0 && s2 < strings.length ? strings[s2] : "";
                if (!s.isEmpty() && nx >= 20 && w > 0 && h > 0) sphere(c, s, lsrc, hs, x, y, w, h, nums, e, nx);
                continue;
            }
            if (k == PUSH_CLIP) {
                c.save();
                clips++;
                c.clipRect(x, y, x + Math.max(0, w), y + Math.max(0, h));
                continue;
            }
            if (k == POP_CLIP) {
                if (clips > 0) {
                    c.restore();
                    clips--;
                }
                continue;
            }
            if (a <= 0 && (flags & 1) == 0 && k != IMAGE) continue;
            boolean rotated = rot != 0;
            if (rotated) {
                c.save();
                float cx = (flags & 128) != 0 ? rox : x + w / 2;
                float cy = (flags & 128) != 0 ? roy : y + h / 2;
                c.rotate(rot, cx, cy);
            }
            if (k == RECT) {
                if (w > 0 && h > 0) {
                    fill.setShader(null);
                    fill.setColor(argb(r, g, b, a));
                    if (gradAt >= 0) {
                        int far = argb(nums[gradAt], nums[gradAt + 1], nums[gradAt + 2], nums[gradAt + 3]);
                        fill.setColor(0xff000000);
                        fill.setShader((flags & 2) != 0
                                ? new LinearGradient(x, y, x + w, y, argb(r, g, b, a), far, Shader.TileMode.CLAMP)
                                : new LinearGradient(x, y, x, y + h, argb(r, g, b, a), far, Shader.TileMode.CLAMP));
                    }
                    if (shadowAt >= 0) {
                        fill.setShadowLayer(Math.max(0.1f, nums[shadowAt + 2] / 2), nums[shadowAt], nums[shadowAt + 1],
                                argb(nums[shadowAt + 3], nums[shadowAt + 4], nums[shadowAt + 5], nums[shadowAt + 6]));
                    }
                    if (tl != 0 || tr != 0 || br != 0 || bl != 0) {
                        roundRect(x, y, w, h, tl, tr, br, bl);
                        c.drawPath(path, fill);
                    } else {
                        c.drawRect(x, y, x + w, y + h, fill);
                    }
                    if (shadowAt >= 0) fill.clearShadowLayer();
                    fill.setShader(null);
                }
            } else if (k == BORDER) {
                float bt = t != 0 ? t : 1;
                if (w > bt && h > bt) {
                    stroke.setColor(argb(r, g, b, a));
                    stroke.setStrokeWidth(bt);
                    roundRect(x + bt / 2, y + bt / 2, w - bt, h - bt,
                            Math.max(0, tl - bt / 2), Math.max(0, tr - bt / 2), Math.max(0, br - bt / 2), Math.max(0, bl - bt / 2));
                    c.drawPath(path, stroke);
                }
            } else if (k == IMAGE) {
                String s = s0 >= 0 && s0 < strings.length ? strings[s0] : "";
                Bitmap img = s.isEmpty() ? null : bitmap(s);
                if (img != null && w > 0 && h > 0) {
                    c.save();
                    if (tl != 0 || tr != 0 || br != 0 || bl != 0) {
                        roundRect(x, y, w, h, tl, tr, br, bl);
                        c.clipPath(path);
                    } else {
                        c.clipRect(x, y, x + w, y + h);
                    }
                    if ((flags & (8 | 16)) != 0) {
                        c.scale((flags & 8) != 0 ? -1 : 1, (flags & 16) != 0 ? -1 : 1, x + w / 2, y + h / 2);
                    }
                    int iw = img.getWidth(), ih = img.getHeight();
                    if (tileAt >= 0) {
                        float tx0 = nums[tileAt], ty0 = nums[tileAt + 1], tw = nums[tileAt + 2], th = nums[tileAt + 3];
                        if (tw > 0 && th > 0) {
                            for (float ty = ty0; ty < y + h; ty += th) {
                                for (float tx = tx0; tx < x + w; tx += tw) {
                                    rf.set(tx, ty, tx + tw, ty + th);
                                    c.drawBitmap(img, null, rf, image);
                                }
                            }
                        }
                    } else if (cropAt >= 0) {
                        src.set((int) (nums[cropAt] * iw), (int) (nums[cropAt + 1] * ih), (int) (nums[cropAt + 2] * iw), (int) (nums[cropAt + 3] * ih));
                        rf.set(x, y, x + w, y + h);
                        c.drawBitmap(img, src, rf, image);
                    } else {
                        // object-fit: cover, as EVG's other painters do
                        float sc = Math.max(w / iw, h / ih), sw = w / sc, sh = h / sc;
                        src.set((int) ((iw - sw) / 2), (int) ((ih - sh) / 2), (int) ((iw + sw) / 2), (int) ((ih + sh) / 2));
                        rf.set(x, y, x + w, y + h);
                        c.drawBitmap(img, src, rf, image);
                    }
                    c.restore();
                }
            } else if (k == TEXT) {
                String s = s0 >= 0 && s0 < strings.length ? strings[s0] : "";
                if (!s.isEmpty() && t > 0) {
                    String weight = s2 >= 0 && s2 < strings.length ? strings[s2] : "";
                    text.setTypeface(font(weight, (flags & 256) != 0));
                    text.setTextSize(t);
                    text.setLetterSpacing(ls != 0 ? ls / t : 0);
                    text.setColor(argb(r, g, b, a));
                    // EVG placed the run by its own font metrics: keep the run's centre
                    float tw = text.measureText(s);
                    float dx = w > 0 ? (w - tw) / 2 : 0;
                    text.getFontMetrics(fm);
                    float baseline = y + h / 2 - (fm.ascent + fm.descent) / 2;
                    c.drawText(s, x + dx, baseline, text);
                }
            } else if (ptsAt >= 0 && nx > 0) {
                int np = (int) nums[ptsAt];
                int pts = ptsAt + 1;
                int ne = (int) nums[pts + np];
                int ends = pts + np + 1;
                path.reset();
                int at = 0;
                for (int ri = 0; ri < ne; ri++) {
                    int end = (int) nums[ends + ri];
                    if (end - at >= 4) {
                        path.moveTo(nums[pts + at], nums[pts + at + 1]);
                        for (int pi = at + 2; pi + 1 < end; pi += 2) path.lineTo(nums[pts + pi], nums[pts + pi + 1]);
                        if (k == PATH) path.close();
                    }
                    at = end;
                }
                if (k == PATH) {
                    path.setFillType((flags & 32) != 0 ? Path.FillType.EVEN_ODD : Path.FillType.WINDING);
                    fill.setShader(null);
                    fill.setColor(argb(r, g, b, a));
                    // added (sparks): brighter where they overlap
                    if ((flags & 2048) != 0) fill.setXfermode(ADD);
                    c.drawPath(path, fill);
                    if ((flags & 2048) != 0) fill.setXfermode(null);
                } else {
                    stroke.setColor(argb(r, g, b, a));
                    stroke.setStrokeWidth(t != 0 ? t : 1);
                    c.drawPath(path, stroke);
                }
            }
            if (rotated) c.restore();
        }
        c.restoreToCount(base);
        if (gl != null) gl.frameDone();
    }
}
