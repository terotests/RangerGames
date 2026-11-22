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
import java.util.HashMap;
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
    private static final String VS = "#version 300 es\nin vec2 a; out vec2 uv; out vec3 wpos; void main() { uv = a; wpos = vec3(0.0); gl_Position = vec4(a.x * 2.0 - 1.0, a.y * 2.0 - 1.0, 0.0, 1.0); }";
    // The ground close by as a mesh (meshM 1 in the shader): rings round the
    // point under the eye at angles growing by a constant factor, spokes over
    // the side the camera looks to, each corner lifted to the ground's height
    // with the shader's own ground(). Prepended: the fragment shader's
    // functions (shape, bumps, lonlat...), see meshVs().
    // a = (ring, spoke); mgrid = (rings, spokes, first ring's angle, growth);
    // mspoke = (azimuth of the middle spoke, half the fan); mclip = (nearest
    // depth, 1 / log(farthest / nearest)); mcullM 1: keep only round the
    // window mcull, 2: leave out the inside of the hole mcull
    private static final String MESH_MAIN = "uniform vec4 mgrid, mcull; uniform vec2 mspoke, mclip; uniform float mcullM;\n" +
            "void main() {\n" +
            "  vec3 e = normalize(eye); vec3 E = normalize(vec3(-e.y, e.x, 0.0) + vec3(1e-6, 0.0, 0.0)); vec3 N = cross(e, E);\n" +
            "  float ang = a.x < 0.5 ? 0.0 : mgrid.z * pow(mgrid.w, a.x - 1.0);\n" +
            "  float ph = mspoke.x - mspoke.y + 2.0 * mspoke.y * a.y / mgrid.y;\n" +
            "  vec3 dir = cos(ang) * e + sin(ang) * (cos(ph) * E + sin(ph) * N);\n" +
            // a corner farther than a cell from the window (or inside the hole by more) is left out: its triangles lie wholly outside
            "  bool cut = false;\n" +
            "  if (mcullM > 0.5) { float cell = 1.5 * max(ang, mgrid.z) * max(mgrid.w - 1.0, 2.0 * mspoke.y / mgrid.y) + 1e-5;\n" +
            "    vec2 w = lonlat(dir); float mu = cell / 6.2831853 / max(0.02, sqrt(1.0 - dir.z * dir.z)), mv = cell / 3.1415927;\n" +
            "    float uw = w.x;\n" +
            "    if (mcullM < 1.5) { if (uw < mcull.x - mu) uw += 1.0; else if (uw > mcull.z + mu) uw -= 1.0;\n" +
            "      cut = uw < mcull.x - mu || uw > mcull.z + mu || w.y < mcull.y - mv || w.y > mcull.w + mv; }\n" +
            "    else { if (uw < mcull.x) uw += 1.0; else if (uw > mcull.z) uw -= 1.0;\n" +
            "      cut = uw > mcull.x + mu && uw < mcull.z - mu && w.y > mcull.y + mv && w.y < mcull.w - mv; } }\n" +
            "  float h = ground(dir, octs(length(dir - eye) / focal));\n" +
            "  wpos = dir * h; uv = vec2(0.0);\n" +
            "  vec3 rel = wpos - eye; vec3 v = vec3(dot(rel, rgt), dot(rel, upv), dot(rel, fwd));\n" +
            "  float cx = ((view.x * 0.5 - box.x) * v.z + focal * v.x) / box.z * 2.0 - v.z;\n" +
            "  float cy = ((view.y * 0.5 - box.y) * v.z - focal * v.y) / box.w * 2.0 - v.z;\n" +
            // depth by the log of the distance: from metres to the horizon in 24 bits
            "  float zl = log(max(v.z, mclip.x) / mclip.x) * mclip.y;\n" +
            "  gl_Position = cut ? vec4(0.0, 0.0, 2.0, 1.0) : vec4(cx, cy, (zl * 2.0 - 1.0) * v.z, v.z);\n" +
            "}\n";
    private static final int RINGS = 96, SPOKES = 160;
    private static final String[] MNAMES = {"mgrid", "mspoke", "mclip", "mcull", "mcullM"};
    private static final int MGRID = 0, MSPOKE = 1, MCLIP = 2, MCULL = 3, MCULLM = 4;
    private static final String[] NAMES = {"tex", "ltex", "eye", "rgt", "upv", "fwd", "sun", "airc", "box", "view", "focal", "night", "lit", "win", "useWin", "air", "lgain", "useL", "relief", "htex", "gtex", "useH", "hlo", "hhi", "hamp", "nearM", "hrel", "hfreq", "crat", "mapAz", "mapK", "useHole", "hole", "lite", "meshM"};
    private static final int TEX = 0, LTEX = 1, EYE = 2, RGT = 3, UPV = 4, FWD = 5, SUN = 6, AIRC = 7, BOX = 8, VIEW = 9, FOCAL = 10, NIGHT = 11, LIT = 12, WIN = 13, USEWIN = 14, AIR = 15, LGAIN = 16, USEL = 17, RELIEF = 18, HTEX = 19, GTEX = 20, USEH = 21, HLO = 22, HHI = 23, HAMP = 24, NEARM = 25, HREL = 26, HFREQ = 27, CRAT = 28, MAPAZ = 29, MAPK = 30, USEHOLE = 31, HOLE = 32, LITE = 33, MESHM = 34;
    /** the pictures on the GPU, the least recently used dropped past this many bytes */
    private static final long TEXTURE_BUDGET = 160L * 1024 * 1024;

    private EGLDisplay display = EGL14.EGL_NO_DISPLAY;
    private EGLContext context = EGL14.EGL_NO_CONTEXT;
    private EGLSurface surface = EGL14.EGL_NO_SURFACE;
    private int prog, vbo, fbo, target, maxTex = 2048;
    private int fbW, fbH, depth;
    // drawn 4 samples a pixel (msFbo), then resolved into fbo: the mesh's edge at the horizon smooth
    private int msFbo, msColor, msDepth, samples, maxSamples, msW, msH;
    /** samples a pixel wanted: adb shell setprop debug.rg.glmsaa 0, 2 or 4 (2 by default: most of the smoothing for half the cost) */
    int msaa = 2;
    private final int[] u = new int[NAMES.length];
    // the mesh program (its own uniform locations), its grid and triangles; 0 when it did not build
    private int progMesh, meshVbo, meshIbo, meshCount;
    private final int[] um = new int[NAMES.length], mu = new int[MNAMES.length];
    boolean ok;
    /** the mesh close by in use (adb shell setprop debug.rg.glmesh 0: rays instead, for comparing) */
    boolean meshOn = true;
    /** set by Painter while a detail picture of the batch is still decoding: the ball leaves no hole for it */
    boolean noHole;

    private static final class Tex {
        int id;
        long bytes;
    }

    private long texBytes;
    private final LinkedHashMap<String, Tex> textures = new LinkedHashMap<>(32, 0.75f, true);

    private ByteBuffer pixels = ByteBuffer.allocateDirect(4);
    private int stN, stFrames;

    /** the end of a frame (for the pictures-a-frame count in the log) */
    void frameDone() {
        stFrames++;
    }
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
            GLES30.glGenRenderbuffers(1, ids, 0);
            depth = ids[0];
            GLES30.glGetIntegerv(GLES30.GL_MAX_SAMPLES, ids, 0);
            maxSamples = ids[0];
            samples = Math.min(msaa, maxSamples);
            if (maxSamples > 1) {
                int[] m = new int[3];
                GLES30.glGenFramebuffers(1, m, 0);
                GLES30.glGenRenderbuffers(2, m, 1);
                msFbo = m[0];
                msColor = m[1];
                msDepth = m[2];
            }
            GLES30.glGenTextures(1, ids, 0);
            target = ids[0];
            GLES30.glGetIntegerv(GLES30.GL_MAX_TEXTURE_SIZE, ids, 0);
            maxTex = Math.min(4096, Math.max(2048, ids[0]));
            GLES30.glUseProgram(prog);
            GLES30.glUniform1i(u[TEX], 0);
            GLES30.glUniform1i(u[LTEX], 1);
            GLES30.glUniform1i(u[HTEX], 2);
            GLES30.glUniform1i(u[GTEX], 3);
            // the shader's cheaper rays close by (fewer steps, no finest bumps), for a phone's GPU
            GLES30.glUniform1f(u[LITE], 1);
            try {
                buildMesh(fs);
            } catch (Throwable t) {
                Log.w(TAG, "GL globes: no mesh close by (rays instead): " + t.getMessage());
                progMesh = 0;
            }
            ok = GLES30.glGetError() == GLES30.GL_NO_ERROR;
            Log.i(TAG, "GL globes: " + (ok ? "on" : "GL error") + ", " + GLES30.glGetString(GLES30.GL_RENDERER) + ", max texture " + maxTex + (progMesh != 0 ? ", mesh close by" : ""));
        } catch (Throwable t) {
            Log.w(TAG, "GL globes off (software globes): " + t.getMessage());
            ok = false;
        }
        return ok;
    }

    /** The mesh's vertex shader: the fragment shader's declarations and functions, then MESH_MAIN. */
    static String meshVs(String fs) {
        String pre = fs.substring(0, fs.indexOf("void main()"));
        pre = pre.replace("in vec2 uv;", "in vec2 a; out vec2 uv;").replace("in vec3 wpos;", "out vec3 wpos;").replace("out vec4 o;", "");
        return pre + "\n" + MESH_MAIN;
    }

    private void buildMesh(String fs) {
        progMesh = GLES30.glCreateProgram();
        GLES30.glAttachShader(progMesh, shader(GLES30.GL_VERTEX_SHADER, meshVs(fs)));
        GLES30.glAttachShader(progMesh, shader(GLES30.GL_FRAGMENT_SHADER, fs));
        GLES30.glBindAttribLocation(progMesh, 0, "a");
        GLES30.glLinkProgram(progMesh);
        int[] st = new int[1];
        GLES30.glGetProgramiv(progMesh, GLES30.GL_LINK_STATUS, st, 0);
        if (st[0] == 0) throw new IllegalStateException("mesh link: " + GLES30.glGetProgramInfoLog(progMesh));
        for (int k = 0; k < NAMES.length; k++) um[k] = GLES30.glGetUniformLocation(progMesh, NAMES[k]);
        for (int k = 0; k < MNAMES.length; k++) mu[k] = GLES30.glGetUniformLocation(progMesh, MNAMES[k]);
        GLES30.glUseProgram(progMesh);
        GLES30.glUniform1i(um[TEX], 0);
        GLES30.glUniform1i(um[LTEX], 1);
        GLES30.glUniform1i(um[HTEX], 2);
        GLES30.glUniform1i(um[GTEX], 3);
        GLES30.glUniform1f(um[LITE], 1);
        GLES30.glUniform1f(um[MESHM], 1);
        int cols = SPOKES + 1;
        float[] grid = new float[RINGS * cols * 2];
        for (int i = 0, k = 0; i < RINGS; i++) {
            for (int j = 0; j < cols; j++) {
                grid[k++] = i;
                grid[k++] = j;
            }
        }
        short[] idx = new short[(RINGS - 1) * SPOKES * 6];
        int n = 0;
        for (int i = 0; i < RINGS - 1; i++) {
            for (int j = 0; j < SPOKES; j++) {
                int a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
                idx[n++] = (short) a; idx[n++] = (short) c; idx[n++] = (short) b;
                idx[n++] = (short) b; idx[n++] = (short) c; idx[n++] = (short) d;
            }
        }
        meshCount = n;
        int[] ids = new int[2];
        GLES30.glGenBuffers(2, ids, 0);
        meshVbo = ids[0];
        meshIbo = ids[1];
        FloatBuffer gb = ByteBuffer.allocateDirect(grid.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        gb.put(grid).position(0);
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, meshVbo);
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, grid.length * 4, gb, GLES30.GL_STATIC_DRAW);
        java.nio.ShortBuffer ib = ByteBuffer.allocateDirect(idx.length * 2).order(ByteOrder.nativeOrder()).asShortBuffer();
        ib.put(idx).position(0);
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, meshIbo);
        GLES30.glBufferData(GLES30.GL_ELEMENT_ARRAY_BUFFER, idx.length * 2, ib, GLES30.GL_STATIC_DRAW);
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo);
        GLES30.glUseProgram(prog);
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
        return texture(src, clamp, flat, false);
    }

    /**
     * height: a height picture (16 bits as red * 256 + green), sent as one
     * float channel so that the GPU blends and shrinks the heights, not their
     * bytes: blending the bytes with the GPU's 8-bit weights made the
     * relief's slopes shimmer as the camera moved. The shader's dec() reads
     * red * 65280 / 65535 + green * 255 / 65535, so red holds h * 65535 / 65280.
     */
    private Tex texture(String src, boolean clamp, boolean flat, boolean height) {
        String key = src + (clamp ? "|c" : "") + (flat ? "|f" : "") + (height ? "|h" : "");
        Tex t = textures.get(key);
        if (t != null) return t;
        // a detail picture (clamped) is decoded on another thread: until it is ready the ball's own picture shows
        // (decoding one on this thread stopped the frame for ~22 ms on the test tablet)
        if (clamp) {
            java.util.concurrent.Future<Object[]> f = pending.get(key);
            if (f == null) {
                byte[] bytes = src.startsWith("/") ? Engine.read(src) : null;
                if (bytes == null) return null;
                pending.put(key, decoder.submit(() -> decode(bytes)));
                return null;
            }
            if (!f.isDone()) return null;
            pending.remove(key);
            Object[] d;
            try {
                d = f.get();
            } catch (Exception e) {
                d = null;
            }
            if (d == null) return null;
            return upload(key, (Integer) d[0], (Integer) d[1], (ByteBuffer) d[2], clamp, flat, height);
        }
        byte[] bytes = src.startsWith("/") ? Engine.read(src) : null;
        if (bytes == null) return null;
        Object[] d = decode(bytes);
        if (d == null) return null;
        return upload(key, (Integer) d[0], (Integer) d[1], (ByteBuffer) d[2], clamp, flat, height);
    }

    /** whether the picture is on the GPU (a detail picture may still be decoding); starts it if not */
    boolean ready(String src) {
        return texture(src, true, false) != null;
    }

    private final java.util.concurrent.ExecutorService decoder = java.util.concurrent.Executors.newSingleThreadExecutor();
    private final HashMap<String, java.util.concurrent.Future<Object[]>> pending = new HashMap<>();

    /** A picture's bytes to RGBA pixels: {width, height, pixels}, or null. Any thread. */
    private Object[] decode(byte[] bytes) {
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
        return new Object[] {w, h, px};
    }

    private Tex upload(String key, int w, int h, ByteBuffer px, boolean clamp, boolean flat, boolean height) {
        Tex t;
        int[] ids = new int[1];
        GLES30.glGenTextures(1, ids, 0);
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, ids[0]);
        GLES30.glPixelStorei(GLES30.GL_UNPACK_ALIGNMENT, 1);
        if (height) {
            float[] lv = new float[w * h];
            for (int i = 0; i < w * h; i++) lv[i] = ((px.get(i * 4) & 255) * 256 + (px.get(i * 4 + 1) & 255)) / 65280f;
            // the smaller levels by hand (glGenerateMipmap may refuse a half-float texture)
            int lw = w, lh = h;
            for (int level = 0; ; level++) {
                FloatBuffer hf = ByteBuffer.allocateDirect(lw * lh * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
                hf.put(lv, 0, lw * lh).position(0);
                GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, level, GLES30.GL_R16F, lw, lh, 0, GLES30.GL_RED, GLES30.GL_FLOAT, hf);
                if (lw == 1 && lh == 1) break;
                int nw = Math.max(1, lw / 2), nh = Math.max(1, lh / 2);
                float[] nv = new float[nw * nh];
                for (int y = 0; y < nh; y++) {
                    for (int x = 0; x < nw; x++) {
                        int x0 = Math.min(lw - 1, x * 2), x1 = Math.min(lw - 1, x * 2 + 1), y0 = Math.min(lh - 1, y * 2), y1 = Math.min(lh - 1, y * 2 + 1);
                        nv[y * nw + x] = (lv[y0 * lw + x0] + lv[y0 * lw + x1] + lv[y1 * lw + x0] + lv[y1 * lw + x1]) * 0.25f;
                    }
                }
                lv = nv;
                lw = nw;
                lh = nh;
            }
            flat = false;
        } else {
            GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, w, h, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, px);
        }
        // flat: no smaller levels (the ground's shape is read bilinearly, as the game reads it)
        if (!flat && !height) GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D);
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
        // depth for the mesh close by (its hills cover each other)
        GLES30.glBindRenderbuffer(GLES30.GL_RENDERBUFFER, depth);
        GLES30.glRenderbufferStorage(GLES30.GL_RENDERBUFFER, GLES30.GL_DEPTH_COMPONENT24, fbW, fbH);
        GLES30.glFramebufferRenderbuffer(GLES30.GL_FRAMEBUFFER, GLES30.GL_DEPTH_ATTACHMENT, GLES30.GL_RENDERBUFFER, depth);
    }

    /** the multisampled target at least w × h (when the phone has it) */
    private void msTarget(int w, int h) {
        if (w <= msW && h <= msH) return;
        msW = Math.max(w, msW);
        msH = Math.max(h, msH);
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, msFbo);
        GLES30.glBindRenderbuffer(GLES30.GL_RENDERBUFFER, msColor);
        GLES30.glRenderbufferStorageMultisample(GLES30.GL_RENDERBUFFER, samples, GLES30.GL_RGBA8, msW, msH);
        GLES30.glFramebufferRenderbuffer(GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0, GLES30.GL_RENDERBUFFER, msColor);
        GLES30.glBindRenderbuffer(GLES30.GL_RENDERBUFFER, msDepth);
        GLES30.glRenderbufferStorageMultisample(GLES30.GL_RENDERBUFFER, samples, GLES30.GL_DEPTH_COMPONENT24, msW, msH);
        GLES30.glFramebufferRenderbuffer(GLES30.GL_FRAMEBUFFER, GLES30.GL_DEPTH_ATTACHMENT, GLES30.GL_RENDERBUFFER, msDepth);
        if (GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER) != GLES30.GL_FRAMEBUFFER_COMPLETE) {
            Log.w(TAG, "GL globes: no multisampling");
            samples = 0;
            maxSamples = 0;
        }
    }

    private boolean ms;

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
        int want = Math.min(msaa, maxSamples);
        if (want != samples && msFbo != 0) {
            // another number of samples: the target again
            samples = want;
            msW = msH = 0;
        }
        ms = samples > 1 && msFbo != 0;
        if (ms) msTarget(bpw + 1, bph + 1);
        ms = ms && samples > 1;
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, ms ? msFbo : fbo);
        GLES30.glViewport(0, 0, bpw, bph);
        GLES30.glDisable(GLES30.GL_SCISSOR_TEST);
        GLES30.glClearColor(0, 0, 0, 0);
        GLES30.glClearDepthf(1);
        GLES30.glDepthMask(true);
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT | GLES30.GL_DEPTH_BUFFER_BIT);
        GLES30.glDisable(GLES30.GL_DEPTH_TEST);
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
    boolean draw(String src, String lsrc, String hs, String gs, float x, float y, float w, float h, float[] p, int at, int nx, float gnd) {
        boolean w32 = nx >= 32;
        boolean w4 = w32 ? p[at + 24] > 0.5f : nx >= 24;
        Tex tx = texture(src, w4, false);
        if (tx == null) return false;
        Tex lt = w32 && lsrc != null && !lsrc.isEmpty() ? texture(lsrc, false, false) : null;
        Tex ht = null, gt = null;
        if (nx >= 40 && hs != null && gs != null) {
            ht = texture(hs, false, false, true);
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
        boolean ho = !noHole && w40 && !w4 && p[at + 35] > 0.5f && (p[at + 20] != 0 || p[at + 21] != 0 || p[at + 22] != 1 || p[at + 23] != 1);
        // this globe's box inside the picture (pixels, y up in GL)
        int vx = Math.round((x - bx) * bk), vy = Math.round((y - by) * bk);
        int vw = Math.max(1, Math.round(w * bk)), vh = Math.max(1, Math.round(h * bk));
        GLES30.glViewport(vx, vy, vw, vh);
        // the shader gets the box the whole pixels cover, so each pixel's ray is where the pixel is shown
        // (rounding it to the picture's pixels moved a small far globe by up to a pixel, frame by frame)
        x = bx + vx / bk;
        y = by + vy / bk;
        w = vw / bk;
        h = vh / bk;
        boolean mesh = w40 && p[at + 35] > 0.5f && progMesh != 0 && meshOn;
        if (!mesh || !w4) {
            // the ball with a ray for each pixel, or close by only the air round the mesh
            GLES30.glUseProgram(prog);
            uniforms(u, p, at, w32, w4, w40, lt != null, ho, x, y, w, h);
            GLES30.glUniform1f(u[MESHM], mesh ? 2 : 0);
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo);
            GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, 0, 0);
            GLES30.glDrawArrays(GLES30.GL_TRIANGLES, 0, 6);
        }
        if (mesh) meshDraw(p, at, w4, ho, w32, w40, lt != null, x, y, w, h, gnd);
        return true;
    }

    private void uniforms(int[] L, float[] p, int at, boolean w32, boolean w4, boolean w40, boolean useL, boolean ho, float x, float y, float w, float h) {
        GLES30.glUniform1f(L[USEL], useL ? 1 : 0);
        GLES30.glUniform1f(L[AIR], w32 ? p[at + 25] : 0);
        GLES30.glUniform3f(L[AIRC], w32 ? p[at + 26] : 0, w32 ? p[at + 27] : 0, w32 ? p[at + 28] : 0);
        GLES30.glUniform1f(L[LGAIN], w32 ? p[at + 29] : 0);
        GLES30.glUniform1f(L[RELIEF], w32 ? p[at + 30] : 0);
        GLES30.glUniform1f(L[USEH], w40 ? 1 : 0);
        GLES30.glUniform1f(L[HLO], w40 ? p[at + 32] : 0);
        GLES30.glUniform1f(L[HHI], w40 ? p[at + 33] : 0);
        GLES30.glUniform1f(L[HAMP], w40 ? p[at + 34] : 0);
        GLES30.glUniform1f(L[NEARM], w40 ? p[at + 35] : 0);
        GLES30.glUniform1f(L[HREL], w40 ? p[at + 36] : 0);
        GLES30.glUniform1f(L[HFREQ], w40 ? p[at + 37] : 1);
        GLES30.glUniform1f(L[CRAT], w40 ? p[at + 38] : 0);
        GLES30.glUniform1f(L[MAPAZ], w40 && w4 ? p[at + 31] : 0);
        GLES30.glUniform1f(L[MAPK], w40 && w4 ? p[at + 39] : 0);
        GLES30.glUniform1f(L[USEHOLE], ho ? 1 : 0);
        GLES30.glUniform4f(L[HOLE], ho ? p[at + 20] : 0, ho ? p[at + 21] : 0, ho ? p[at + 22] : 0, ho ? p[at + 23] : 0);
        GLES30.glUniform3f(L[EYE], p[at], p[at + 1], p[at + 2]);
        GLES30.glUniform3f(L[RGT], p[at + 3], p[at + 4], p[at + 5]);
        GLES30.glUniform3f(L[UPV], p[at + 6], p[at + 7], p[at + 8]);
        GLES30.glUniform3f(L[FWD], p[at + 9], p[at + 10], p[at + 11]);
        GLES30.glUniform3f(L[SUN], p[at + 12], p[at + 13], p[at + 14]);
        GLES30.glUniform1f(L[FOCAL], p[at + 15]);
        GLES30.glUniform2f(L[VIEW], p[at + 16], p[at + 17]);
        GLES30.glUniform1f(L[NIGHT], p[at + 18]);
        GLES30.glUniform1f(L[LIT], p[at + 19]);
        GLES30.glUniform1f(L[USEWIN], w4 ? 1 : 0);
        GLES30.glUniform4f(L[WIN], w4 ? p[at + 20] : 0, w4 ? p[at + 21] : 0, w4 ? p[at + 22] : 1, w4 ? p[at + 23] : 1);
        GLES30.glUniform4f(L[BOX], x, y, w, h);
    }

    /**
     * The ground close by as a mesh, as Terrain.java lays it out: gnd is the
     * ground's distance from the centre under the eye (radii).
     */
    private void meshDraw(float[] p, int at, boolean w4, boolean ho, boolean w32, boolean w40, boolean useL, float x, float y, float w, float h, float gnd) {
        double ex = p[at], ey = p[at + 1], ez = p[at + 2];
        double el = Math.sqrt(ex * ex + ey * ey + ez * ez);
        double cx = ex / el, cy = ey / el, cz = ez / el;
        double ax0 = -cy, ay0 = cx, al = Math.sqrt(ax0 * ax0 + ay0 * ay0);
        if (al < 1e-6) { ax0 = 1; ay0 = 0; al = 1; }
        ax0 /= al;
        ay0 /= al;
        double bx0 = -cz * ay0, by0 = cz * ax0, bz0 = cx * ay0 - cy * ax0;
        double hhi = p[at + 33], amp = p[at + 34], freq = Math.max(p[at + 37], 1e-9), crat = p[at + 38];
        double top = 1 + hhi + 2 * amp + 0.05 * crat / freq;
        double alt = Math.max(el - gnd, 1e-7);
        double reach = Math.min(0.6, Math.acos(Math.min(1, 1 / Math.max(el, 1))) + Math.acos(Math.min(1, 1 / top)) + 0.002);
        double a0 = Math.max(alt * 0.15, 2e-7);
        if (reach <= a0 * 2) reach = a0 * 2;
        double g = Math.pow(reach / a0, 1.0 / (RINGS - 2));
        // the spokes: the side the camera looks to (all round when it looks down)
        double fx = p[at + 9], fy = p[at + 10], fz = p[at + 11];
        double fd = fx * cx + fy * cy + fz * cz;
        double ffx = fx - cx * fd, ffy = fy - cy * fd, ffz = fz - cz * fd;
        double fl = Math.sqrt(ffx * ffx + ffy * ffy + ffz * ffz);
        double az = Math.atan2(ffx * bx0 + ffy * by0 + ffz * bz0, ffx * ax0 + ffy * ay0);
        double half = fl < 0.3 || -fd > 0.85 ? Math.PI : Math.min(Math.PI, Math.atan(p[at + 16] * 0.5 / p[at + 15]) + 1.0);
        double near = Math.max(alt * 0.2, 1e-8), far = 2.5 * reach + alt;
        GLES30.glUseProgram(progMesh);
        uniforms(um, p, at, w32, w4, w40, useL, ho, x, y, w, h);
        GLES30.glUniform4f(mu[MGRID], RINGS, SPOKES, (float) a0, (float) g);
        GLES30.glUniform2f(mu[MSPOKE], (float) az, (float) half);
        GLES30.glUniform2f(mu[MCLIP], (float) near, (float) (1 / Math.log(far / near)));
        if (w4) {
            GLES30.glUniform1f(mu[MCULLM], 1);
            GLES30.glUniform4f(mu[MCULL], p[at + 20], p[at + 21], p[at + 22], p[at + 23]);
        } else if (ho) {
            GLES30.glUniform1f(mu[MCULLM], 2);
            GLES30.glUniform4f(mu[MCULL], p[at + 20], p[at + 21], p[at + 22], p[at + 23]);
        } else {
            GLES30.glUniform1f(mu[MCULLM], 0);
        }
        GLES30.glEnable(GLES30.GL_DEPTH_TEST);
        GLES30.glDepthFunc(GLES30.GL_LEQUAL);
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, meshVbo);
        GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, 0, 0);
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, meshIbo);
        GLES30.glDrawElements(GLES30.GL_TRIANGLES, meshCount, GLES30.GL_UNSIGNED_SHORT, 0);
        GLES30.glDisable(GLES30.GL_DEPTH_TEST);
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo);
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
        if (ms) {
            // the samples into one pixel each
            GLES30.glDisable(GLES30.GL_SCISSOR_TEST);
            GLES30.glBindFramebuffer(GLES30.GL_READ_FRAMEBUFFER, msFbo);
            GLES30.glBindFramebuffer(GLES30.GL_DRAW_FRAMEBUFFER, fbo);
            GLES30.glBlitFramebuffer(0, 0, bpw + 1, bph + 1, 0, 0, bpw + 1, bph + 1, GLES30.GL_COLOR_BUFFER_BIT, GLES30.GL_NEAREST);
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo);
        }
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
            Log.i(TAG, String.format(java.util.Locale.ROOT, "GL globes: %d px, gpu %.1f ms, read %.1f ms, copy %.1f ms, %.1f pictures a frame",
                    stPx / stN, stDraw / 1e6 / stN, stRead / 1e6 / stN, stCopy / 1e6 / stN, stN / (float) Math.max(1, stFrames)));
            stN = 0;
            stFrames = 0;
            stPx = stDraw = stRead = stCopy = 0;
        }
        evict();
        return bm;
    }

    /** pixels per game unit of the last picture: it covers width() / scale() units from its corner */
    float scale() {
        return bk;
    }

    /** the size of the last picture in pixels */
    int width() {
        return bpw;
    }

    int height() {
        return bph;
    }
}
