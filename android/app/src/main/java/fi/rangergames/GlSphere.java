// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLSurface;
import android.opengl.GLES30;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Textured globes (draw kind 8) on the phone's GPU with the shader of
 * web/js/painter.js (assets/shaders/sphere.fs, made by
 * scripts/sphere-shader.mjs): the same picture as on the web, with real
 * heights close by and the detail pictures.
 *
 * The 2D view is a Canvas over the 3D view, so the globes are drawn in an
 * offscreen GLES 3.0 context of the game thread and read back into a bitmap
 * that the Canvas draws in its place among the other commands. Globes that
 * come one after another in the stream (a planet's ball and its detail
 * pictures) are drawn into one picture and read back once.
 */
final class GlSphere {
    private static final String TAG = "RangerGames";
    // uv 0..1 over the box, y down as on the Canvas; drawn upside down so the
    // rows read back come top row first, as a Bitmap wants them
    private static final String VS = "#version 300 es\nin vec2 a; out vec2 uv; void main() { uv = a; gl_Position = vec4(a.x * 2.0 - 1.0, a.y * 2.0 - 1.0, 0.0, 1.0); }";
    private static final String[] NAMES = {"tex", "ltex", "eye", "rgt", "upv", "fwd", "sun", "airc", "box", "view", "focal", "night", "lit", "win", "useWin", "air", "lgain", "useL", "relief", "htex", "gtex", "useH", "hlo", "hhi", "hamp", "nearM", "hrel", "hfreq", "crat", "mapAz", "mapK", "useHole", "hole"};
    private static final int TEX = 0, LTEX = 1, EYE = 2, RGT = 3, UPV = 4, FWD = 5, SUN = 6, AIRC = 7, BOX = 8, VIEW = 9, FOCAL = 10, NIGHT = 11, LIT = 12, WIN = 13, USEWIN = 14, AIR = 15, LGAIN = 16, USEL = 17, RELIEF = 18, HTEX = 19, GTEX = 20, USEH = 21, HLO = 22, HHI = 23, HAMP = 24, NEARM = 25, HREL = 26, HFREQ = 27, CRAT = 28, MAPAZ = 29, MAPK = 30, USEHOLE = 31, HOLE = 32;
    /** the pictures on the GPU, the least recently used dropped past this many bytes */
    private static final long TEXTURE_BUDGET = 160L * 1024 * 1024;

    private EGLDisplay display = EGL14.EGL_NO_DISPLAY;
    private EGLContext context = EGL14.EGL_NO_CONTEXT;
    private EGLSurface surface = EGL14.EGL_NO_SURFACE;
    private int prog, vbo, fbo, target, maxTex = 2048;
    private int fbW, fbH;
    private final int[] u = new int[NAMES.length];
    boolean ok;

    private static final class Tex {
        int id;
        long bytes;
    }

    private long texBytes;
    private final LinkedHashMap<String, Tex> textures = new LinkedHashMap<>(32, 0.75f, true);

    private ByteBuffer pixels = ByteBuffer.allocateDirect(4);
    private int stN;
    private long stPx, stDraw, stRead, stCopy;
    // the read pictures go round a ring, as in Painter: the hardware canvas
    // reads a bitmap later, on its own thread
    private final Bitmap[] ring = new Bitmap[4];
    private int ringNext;

    /** Makes the context current on this thread; false (and ok false) when the phone has no GLES 3.0. */
    boolean init(AssetManager assets) {
        try {
            String fs = readAsset(assets, "shaders/sphere.fs");
            display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
            int[] ver = new int[2];
            if (!EGL14.eglInitialize(display, ver, 0, ver, 1)) throw new IllegalStateException("eglInitialize");
            int[] attrs = {EGL14.EGL_RENDERABLE_TYPE, 0x40 /* EGL_OPENGL_ES3_BIT_KHR */, EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT,
                    EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8, EGL14.EGL_NONE};
            EGLConfig[] cfg = new EGLConfig[1];
            int[] nc = new int[1];
            if (!EGL14.eglChooseConfig(display, attrs, 0, cfg, 0, 1, nc, 0) || nc[0] < 1) throw new IllegalStateException("no GLES 3 config");
            context = EGL14.eglCreateContext(display, cfg[0], EGL14.EGL_NO_CONTEXT, new int[] {EGL14.EGL_CONTEXT_CLIENT_VERSION, 3, EGL14.EGL_NONE}, 0);
            if (context == EGL14.EGL_NO_CONTEXT) throw new IllegalStateException("eglCreateContext");
            surface = EGL14.eglCreatePbufferSurface(display, cfg[0], new int[] {EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE}, 0);
            if (!EGL14.eglMakeCurrent(display, surface, surface, context)) throw new IllegalStateException("eglMakeCurrent");
            prog = GLES30.glCreateProgram();
            GLES30.glAttachShader(prog, shader(GLES30.GL_VERTEX_SHADER, VS));
            GLES30.glAttachShader(prog, shader(GLES30.GL_FRAGMENT_SHADER, fs));
            GLES30.glBindAttribLocation(prog, 0, "a");
            GLES30.glLinkProgram(prog);
            int[] st = new int[1];
            GLES30.glGetProgramiv(prog, GLES30.GL_LINK_STATUS, st, 0);
            if (st[0] == 0) throw new IllegalStateException("link: " + GLES30.glGetProgramInfoLog(prog));
            for (int k = 0; k < NAMES.length; k++) u[k] = GLES30.glGetUniformLocation(prog, NAMES[k]);
            int[] ids = new int[1];
            GLES30.glGenBuffers(1, ids, 0);
            vbo = ids[0];
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo);
            float[] quad = {0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1};
            FloatBuffer fb = ByteBuffer.allocateDirect(quad.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
            fb.put(quad).position(0);
            GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, quad.length * 4, fb, GLES30.GL_STATIC_DRAW);
            GLES30.glEnableVertexAttribArray(0);
            GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, 0, 0);
            GLES30.glGenFramebuffers(1, ids, 0);
            fbo = ids[0];
            GLES30.glGenTextures(1, ids, 0);
            target = ids[0];
            GLES30.glGetIntegerv(GLES30.GL_MAX_TEXTURE_SIZE, ids, 0);
            maxTex = Math.min(4096, Math.max(2048, ids[0]));
            GLES30.glUseProgram(prog);
            GLES30.glUniform1i(u[TEX], 0);
            GLES30.glUniform1i(u[LTEX], 1);
            GLES30.glUniform1i(u[HTEX], 2);
            GLES30.glUniform1i(u[GTEX], 3);
            ok = GLES30.glGetError() == GLES30.GL_NO_ERROR;
            Log.i(TAG, "GL globes: " + (ok ? "on" : "GL error") + ", " + GLES30.glGetString(GLES30.GL_RENDERER) + ", max texture " + maxTex);
        } catch (Throwable t) {
            Log.w(TAG, "GL globes off (software globes): " + t.getMessage());
            ok = false;
        }
        return ok;
    }

    private static String readAsset(AssetManager assets, String name) throws Exception {
        try (InputStream in = assets.open(name)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[16384];
            int r;
            while ((r = in.read(b)) > 0) bo.write(b, 0, r);
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static int shader(int kind, String src) {
        int s = GLES30.glCreateShader(kind);
        GLES30.glShaderSource(s, src);
        GLES30.glCompileShader(s);
        int[] st = new int[1];
        GLES30.glGetShaderiv(s, GLES30.GL_COMPILE_STATUS, st, 0);
        if (st[0] == 0) throw new IllegalStateException("shader: " + GLES30.glGetShaderInfoLog(s));
        return s;
    }

    /** A picture of the virtual directory as a texture, decoded and sent once (null when it does not decode). */
    private Tex texture(String src, boolean clamp, boolean flat) {
        String key = src + (clamp ? "|c" : "") + (flat ? "|f" : "");
        Tex t = textures.get(key);
        if (t != null) return t;
        byte[] bytes = src.startsWith("/") ? Engine.read(src) : null;
        if (bytes == null) return null;
        BitmapFactory.Options o = new BitmapFactory.Options();
        // heights are numbers in the colours: not multiplied by alpha
        o.inPremultiplied = false;
        o.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap b = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
        if (b == null) return null;
        if (b.getWidth() > maxTex || b.getHeight() > maxTex) {
            float k = Math.min((float) maxTex / b.getWidth(), (float) maxTex / b.getHeight());
            Bitmap sb = Bitmap.createScaledBitmap(b, Math.max(1, (int) (b.getWidth() * k)), Math.max(1, (int) (b.getHeight() * k)), true);
            b.recycle();
            b = sb;
        }
        if (b.getConfig() != Bitmap.Config.ARGB_8888) {
            Bitmap cb = b.copy(Bitmap.Config.ARGB_8888, false);
            b.recycle();
            b = cb;
        }
        int w = b.getWidth(), h = b.getHeight();
        ByteBuffer px = ByteBuffer.allocateDirect(w * h * 4).order(ByteOrder.nativeOrder());
        b.copyPixelsToBuffer(px);
        b.recycle();
        px.position(0);
        int[] ids = new int[1];
        GLES30.glGenTextures(1, ids, 0);
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, ids[0]);
        GLES30.glPixelStorei(GLES30.GL_UNPACK_ALIGNMENT, 1);
        GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, w, h, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, px);
        // flat: no smaller levels (the ground's shape is read bilinearly, as the game reads it)
        if (!flat) GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, flat ? GLES30.GL_LINEAR : GLES30.GL_LINEAR_MIPMAP_LINEAR);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, clamp ? GLES30.GL_CLAMP_TO_EDGE : GLES30.GL_REPEAT);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE);
        t = new Tex();
        t.id = ids[0];
        t.bytes = (long) w * h * (flat ? 4 : 5);
        texBytes += t.bytes;
        textures.put(key, t);
        return t;
    }

    /** between pictures: drops the least recently used textures past the budget */
    private void evict() {
        Iterator<Map.Entry<String, Tex>> it = textures.entrySet().iterator();
        while (texBytes > TEXTURE_BUDGET && it.hasNext()) {
            Map.Entry<String, Tex> e = it.next();
            GLES30.glDeleteTextures(1, new int[] {e.getValue().id}, 0);
            texBytes -= e.getValue().bytes;
            it.remove();
        }
    }

    private void target(int w, int h) {
        if (w <= fbW && h <= fbH) return;
        fbW = Math.max(w, fbW);
        fbH = Math.max(h, fbH);
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, target);
        GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, fbW, fbH, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, null);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_NEAREST);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_NEAREST);
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo);
        GLES30.glFramebufferTexture2D(GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0, GLES30.GL_TEXTURE_2D, target, 0);
    }

    // the batch being drawn: its box in game units and pixels per unit
    private float bx, by, bw, bh, bk;
    private int bpw, bph;

    /** Starts a picture covering x, y, w, h (game units) at k pixels per unit. */
    void begin(float x, float y, float w, float h, float k) {
        k = Math.min(k, maxTex / Math.max(w, h));
        bx = x;
        by = y;
        bw = w;
        bh = h;
        bk = k;
        bpw = Math.max(1, Math.round(w * k));
        bph = Math.max(1, Math.round(h * k));
        EGL14.eglMakeCurrent(display, surface, surface, context);
        // one row and column more, left clear: the smoothed bitmap reads past its edge
        target(bpw + 1, bph + 1);
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo);
        GLES30.glViewport(0, 0, bpw, bph);
        GLES30.glDisable(GLES30.GL_SCISSOR_TEST);
        GLES30.glClearColor(0, 0, 0, 0);
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT);
        GLES30.glEnable(GLES30.GL_SCISSOR_TEST);
        GLES30.glScissor(0, 0, bpw, bph);
        GLES30.glEnable(GLES30.GL_BLEND);
        GLES30.glBlendFunc(GLES30.GL_ONE, GLES30.GL_ONE_MINUS_SRC_ALPHA);
        GLES30.glUseProgram(prog);
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo);
        GLES30.glEnableVertexAttribArray(0);
        GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, 0, 0);
    }

    /**
     * One globe into the picture, as painter.js Spheres.draw; p from at: the
     * extra numbers (nx of them); hs, gs: the heights' shading and shape
     * pictures or null. False when its main picture does not load.
     */
    boolean draw(String src, String lsrc, String hs, String gs, float x, float y, float w, float h, float[] p, int at, int nx) {
        boolean w32 = nx >= 32;
        boolean w4 = w32 ? p[at + 24] > 0.5f : nx >= 24;
        Tex tx = texture(src, w4, false);
        if (tx == null) return false;
        Tex lt = w32 && lsrc != null && !lsrc.isEmpty() ? texture(lsrc, false, false) : null;
        Tex ht = null, gt = null;
        if (nx >= 40 && hs != null && gs != null) {
            ht = texture(hs, false, false);
            gt = texture(gs, false, true);
            if (ht == null || gt == null) ht = gt = null;
        }
        boolean w40 = ht != null;
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0);
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tx.id);
        GLES30.glActiveTexture(GLES30.GL_TEXTURE1);
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, lt != null ? lt.id : 0);
        GLES30.glActiveTexture(GLES30.GL_TEXTURE2);
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, w40 ? ht.id : 0);
        GLES30.glActiveTexture(GLES30.GL_TEXTURE3);
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, w40 ? gt.id : 0);
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0);
        GLES30.glUniform1f(u[USEL], lt != null ? 1 : 0);
        GLES30.glUniform1f(u[AIR], w32 ? p[at + 25] : 0);
        GLES30.glUniform3f(u[AIRC], w32 ? p[at + 26] : 0, w32 ? p[at + 27] : 0, w32 ? p[at + 28] : 0);
        GLES30.glUniform1f(u[LGAIN], w32 ? p[at + 29] : 0);
        GLES30.glUniform1f(u[RELIEF], w32 ? p[at + 30] : 0);
        GLES30.glUniform1f(u[USEH], w40 ? 1 : 0);
        GLES30.glUniform1f(u[HLO], w40 ? p[at + 32] : 0);
        GLES30.glUniform1f(u[HHI], w40 ? p[at + 33] : 0);
        GLES30.glUniform1f(u[HAMP], w40 ? p[at + 34] : 0);
        GLES30.glUniform1f(u[NEARM], w40 ? p[at + 35] : 0);
        GLES30.glUniform1f(u[HREL], w40 ? p[at + 36] : 0);
        GLES30.glUniform1f(u[HFREQ], w40 ? p[at + 37] : 1);
        GLES30.glUniform1f(u[CRAT], w40 ? p[at + 38] : 0);
        GLES30.glUniform1f(u[MAPAZ], w40 && w4 ? p[at + 31] : 0);
        GLES30.glUniform1f(u[MAPK], w40 && w4 ? p[at + 39] : 0);
        boolean ho = w40 && !w4 && p[at + 35] > 0.5f && (p[at + 20] != 0 || p[at + 21] != 0 || p[at + 22] != 1 || p[at + 23] != 1);
        GLES30.glUniform1f(u[USEHOLE], ho ? 1 : 0);
        GLES30.glUniform4f(u[HOLE], ho ? p[at + 20] : 0, ho ? p[at + 21] : 0, ho ? p[at + 22] : 0, ho ? p[at + 23] : 0);
        GLES30.glUniform3f(u[EYE], p[at], p[at + 1], p[at + 2]);
        GLES30.glUniform3f(u[RGT], p[at + 3], p[at + 4], p[at + 5]);
        GLES30.glUniform3f(u[UPV], p[at + 6], p[at + 7], p[at + 8]);
        GLES30.glUniform3f(u[FWD], p[at + 9], p[at + 10], p[at + 11]);
        GLES30.glUniform3f(u[SUN], p[at + 12], p[at + 13], p[at + 14]);
        GLES30.glUniform1f(u[FOCAL], p[at + 15]);
        GLES30.glUniform2f(u[VIEW], p[at + 16], p[at + 17]);
        GLES30.glUniform1f(u[NIGHT], p[at + 18]);
        GLES30.glUniform1f(u[LIT], p[at + 19]);
        GLES30.glUniform1f(u[USEWIN], w4 ? 1 : 0);
        GLES30.glUniform4f(u[WIN], w4 ? p[at + 20] : 0, w4 ? p[at + 21] : 0, w4 ? p[at + 22] : 1, w4 ? p[at + 23] : 1);
        GLES30.glUniform4f(u[BOX], x, y, w, h);
        // this globe's box inside the picture (pixels, y up in GL)
        int vx = Math.round((x - bx) * bk), vy = Math.round((y - by) * bk);
        int vw = Math.max(1, Math.round(w * bk)), vh = Math.max(1, Math.round(h * bk));
        GLES30.glViewport(vx, vy, vw, vh);
        GLES30.glDrawArrays(GLES30.GL_TRIANGLES, 0, 6);
        return true;
    }

    /** Reads the picture back; null on a GL error (then the globes are left to the software path). */
    Bitmap end() {
        int slot = ringNext;
        ringNext = (ringNext + 1) % ring.length;
        Bitmap bm = ring[slot];
        if (bm == null || bm.getWidth() < bpw + 1 || bm.getHeight() < bph + 1 || bm.getWidth() > bpw * 5 / 4 + 64) {
            // no recycle(): an earlier frame may still be drawing the old one
            bm = Bitmap.createBitmap(bpw + bpw / 8 + 16, bph + bph / 8 + 16, Bitmap.Config.ARGB_8888);
            ring[slot] = bm;
        }
        int bytes = bm.getRowBytes() * bm.getHeight();
        if (pixels.capacity() < bytes) pixels = ByteBuffer.allocateDirect(bytes).order(ByteOrder.nativeOrder());
        pixels.position(0);
        GLES30.glPixelStorei(GLES30.GL_PACK_ALIGNMENT, 4);
        GLES30.glPixelStorei(GLES30.GL_PACK_ROW_LENGTH, bm.getRowBytes() / 4);
        long t0 = System.nanoTime();
        GLES30.glFinish();
        long t1 = System.nanoTime();
        GLES30.glReadPixels(0, 0, bpw + 1, bph + 1, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, pixels);
        long t2 = System.nanoTime();
        GLES30.glPixelStorei(GLES30.GL_PACK_ROW_LENGTH, 0);
        int err = GLES30.glGetError();
        if (err != GLES30.GL_NO_ERROR) {
            Log.w(TAG, "GL globes: error " + err + ", software globes from now on");
            ok = false;
            return null;
        }
        pixels.position(0);
        pixels.limit(bytes);
        bm.copyPixelsFromBuffer(pixels);
        pixels.limit(pixels.capacity());
        long t3 = System.nanoTime();
        // where the time goes, every 60 pictures (logcat RangerGames)
        stDraw += t1 - t0;
        stRead += t2 - t1;
        stCopy += t3 - t2;
        stPx += (long) bpw * bph;
        if (++stN == 60) {
            Log.i(TAG, String.format(java.util.Locale.ROOT, "GL globes: %d px, gpu %.1f ms, read %.1f ms, copy %.1f ms",
                    stPx / stN, stDraw / 1e6 / stN, stRead / 1e6 / stN, stCopy / 1e6 / stN));
            stN = 0;
            stPx = stDraw = stRead = stCopy = 0;
        }
        evict();
        return bm;
    }

    /** the size of the last picture in pixels */
    int width() {
        return bpw;
    }

    int height() {
        return bph;
    }
}
