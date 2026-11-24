// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.graphics.Bitmap;
import android.opengl.GLES30;
import android.util.Log;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/**
 * Liquid splats (draw kind 10, a baked particle run; painter.js Splats): each
 * splat adds a soft round weight into a density picture at half the screen's
 * pixels (red: weight, green: weight × temperature); where the density is
 * thick enough it shows as a liquid surface, coloured by the mean temperature
 * and lit by the density's slope. Drawn in GlSphere's context and read back
 * into a bitmap for the Canvas.
 */
final class GlSplats {
    private static final String TAG = "RangerGames";
    private static final String SPLAT_VS = "#version 300 es\nlayout(location=0) in vec2 q; layout(location=1) in vec4 s; uniform vec4 xf; out vec2 lq; out float tt;" +
            "void main() { lq = q; tt = s.w; vec2 p = s.xy + q * s.z * 1.6; gl_Position = vec4(p * xf.xy + xf.zw, 0.0, 1.0); }";
    private static final String SPLAT_FS = "#version 300 es\nprecision highp float; in vec2 lq; in float tt; uniform float gain; out vec4 o;" +
            "void main() { float d = dot(lq, lq); if (d > 1.0) discard; float w = exp(-4.0 * d) * gain; o = vec4(w, w * tt, 0.0, 0.0); }";
    private static final String SHOW_VS = "#version 300 es\nlayout(location=0) in vec2 q; out vec2 uv; void main() { uv = q * 0.5 + 0.5; gl_Position = vec4(q, 0.0, 1.0); }";
    private static final String SHOW_FS = "#version 300 es\nprecision highp float; in vec2 uv; uniform sampler2D den, pal; uniform vec2 texel; uniform vec3 light; uniform float npal, gain, opac; out vec4 o;" +
            "float D(vec2 t) { return texture(den, t).r / gain; }" +
            "void main() { vec4 a = texture(den, uv); float d = a.r / gain; if (d < 0.02) discard;" +
            "  float tm = clamp(a.g / max(a.r, 1e-6), 0.0, 1.0);" +
            "  vec3 c = texture(pal, vec2((tm * (npal - 1.0) + 0.5) / npal, 0.5)).rgb;" +
            "  float gx = D(uv + vec2(texel.x, 0.0)) - D(uv - vec2(texel.x, 0.0)), gy = D(uv + vec2(0.0, texel.y)) - D(uv - vec2(0.0, texel.y));" +
            "  vec3 n = normalize(vec3(-gx * 3.0, gy * 3.0, 1.0)); vec3 l = normalize(light * vec3(1.0, -1.0, 1.0));" +
            "  float dif = 0.45 + 0.55 * max(dot(n, l), 0.0), spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0) * 0.5;" +
            "  float glow = smoothstep(0.35, 0.9, tm); vec3 col = c * mix(dif, 1.0, glow * 0.7) + spec * mix(vec3(1.0), c, 0.4);" +
            "  float body = smoothstep(0.3, 0.55, d), halo = smoothstep(0.02, 0.3, d) * 0.35 * (0.3 + glow);" +
            "  float al = max(body, halo) * opac; o = vec4(mix(c * (0.6 + glow), col, body) * al, al); }";

    /** see-through gas (look "gas"), painter.js gasFs; the picture's v against the screen's up as the liquid's normal here */
    private static final String GAS_FS = "#version 300 es\nprecision highp float; in vec2 uv; uniform sampler2D den, pal; uniform vec2 texel; uniform vec3 light; uniform float npal, gain, opac, kd; out vec4 o;" +
            "float D(vec2 t) { return texture(den, t).r / gain; }" +
            "void main() { vec4 a = texture(den, uv); float d = a.r / gain; if (d < 0.004) discard;" +
            "  float tm = clamp(a.g / max(a.r, 1e-6), 0.0, 1.0);" +
            "  vec3 c = texture(pal, vec2((tm * (npal - 1.0) + 0.5) / npal, 0.5)).rgb;" +
            "  vec3 l = normalize(light * vec3(1.0, -1.0, 1.0)); vec2 s = vec2(l.x, l.y * -1.0) * texel;" +
            "  float db = 0.5 * d + 0.125 * (D(uv + vec2(texel.x, 0.0)) + D(uv - vec2(texel.x, 0.0)) + D(uv + vec2(0.0, texel.y)) + D(uv - vec2(0.0, texel.y)));" +
            "  float al = 1.0 - exp(-kd * db);" +
            "  float occ = D(uv + s * 4.0) + D(uv + s * 12.0) + D(uv + s * 28.0);" +
            "  float lit = exp(-kd * 0.12 * occ);" +
            "  float front = 0.5 + 0.5 * l.z, back = max(-l.z, 0.0);" +
            "  float dif = 0.25 + 0.75 * lit * mix(0.4, 1.0, front);" +
            "  float fwd = back * back * (1.0 - al) * lit * 1.6;" +
            "  float glow = smoothstep(0.35, 0.9, tm);" +
            "  vec3 col = mix(c * (dif + fwd), c * 1.25, glow);" +
            "  float oa = al * opac; o = vec4(col * oa, oa); }";

    private final GlSphere gl;
    boolean ok;
    private boolean f16;
    private int add, show, gas, quad, inst, vao, den, denFbo, out, outFbo, pal;
    private int uXf, uGain, uDen, uPal, uTexel, uLight, uNpal, uSGain, uOpac;
    private int gDen, gPal, gTexel, gLight, gNpal, gGain, gOpac, gKd;
    private int dw, dh, ow, oh;
    /** the last picture's pixels (its part of the bitmap) */
    int pw, ph;
    private FloatBuffer pts = ByteBuffer.allocateDirect(4 * 4 * 1024).order(ByteOrder.nativeOrder()).asFloatBuffer();
    private ByteBuffer pixels = ByteBuffer.allocateDirect(4);
    private final ByteBuffer palBytes = ByteBuffer.allocateDirect(4 * 256).order(ByteOrder.nativeOrder());
    // read pictures go round a ring (the hardware canvas reads a bitmap later)
    private final Bitmap[] ring = new Bitmap[3];
    private int ringNext;

    GlSplats(GlSphere gl) {
        this.gl = gl;
        try {
            gl.current();
            String ext = GLES30.glGetString(GLES30.GL_EXTENSIONS);
            f16 = ext != null && (ext.contains("GL_EXT_color_buffer_half_float") || ext.contains("GL_EXT_color_buffer_float"));
            add = program(SPLAT_VS, SPLAT_FS);
            show = program(SHOW_VS, SHOW_FS);
            uXf = GLES30.glGetUniformLocation(add, "xf");
            uGain = GLES30.glGetUniformLocation(add, "gain");
            uDen = GLES30.glGetUniformLocation(show, "den");
            uPal = GLES30.glGetUniformLocation(show, "pal");
            uTexel = GLES30.glGetUniformLocation(show, "texel");
            uLight = GLES30.glGetUniformLocation(show, "light");
            uNpal = GLES30.glGetUniformLocation(show, "npal");
            uSGain = GLES30.glGetUniformLocation(show, "gain");
            uOpac = GLES30.glGetUniformLocation(show, "opac");
            gas = program(SHOW_VS, GAS_FS);
            gDen = GLES30.glGetUniformLocation(gas, "den");
            gPal = GLES30.glGetUniformLocation(gas, "pal");
            gTexel = GLES30.glGetUniformLocation(gas, "texel");
            gLight = GLES30.glGetUniformLocation(gas, "light");
            gNpal = GLES30.glGetUniformLocation(gas, "npal");
            gGain = GLES30.glGetUniformLocation(gas, "gain");
            gOpac = GLES30.glGetUniformLocation(gas, "opac");
            gKd = GLES30.glGetUniformLocation(gas, "kd");
            int[] ids = new int[7];
            GLES30.glGenBuffers(2, ids, 0);
            quad = ids[0];
            inst = ids[1];
            GLES30.glGenVertexArrays(1, ids, 2);
            vao = ids[2];
            GLES30.glGenFramebuffers(2, ids, 3);
            denFbo = ids[3];
            outFbo = ids[4];
            GLES30.glGenTextures(2, ids, 5);
            den = ids[5];
            out = ids[6];
            int[] t = new int[1];
            GLES30.glGenTextures(1, t, 0);
            pal = t[0];
            float[] q = {-1, -1, 1, -1, -1, 1, 1, 1};
            FloatBuffer fb = ByteBuffer.allocateDirect(q.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
            fb.put(q).position(0);
            GLES30.glBindVertexArray(vao);
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, quad);
            GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, q.length * 4, fb, GLES30.GL_STATIC_DRAW);
            GLES30.glEnableVertexAttribArray(0);
            GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, 0, 0);
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, inst);
            GLES30.glEnableVertexAttribArray(1);
            GLES30.glVertexAttribPointer(1, 4, GLES30.GL_FLOAT, false, 0, 0);
            GLES30.glVertexAttribDivisor(1, 1);
            GLES30.glBindVertexArray(0);
            ok = GLES30.glGetError() == GLES30.GL_NO_ERROR;
            Log.i(TAG, "GL splats: " + (ok ? "on" : "GL error") + (f16 ? ", half floats" : ", 8 bits"));
        } catch (Throwable e) {
            Log.w(TAG, "GL splats off: " + e.getMessage());
            ok = false;
        }
    }

    private static int program(String vs, String fs) {
        int p = GLES30.glCreateProgram();
        GLES30.glAttachShader(p, shader(GLES30.GL_VERTEX_SHADER, vs));
        GLES30.glAttachShader(p, shader(GLES30.GL_FRAGMENT_SHADER, fs));
        GLES30.glLinkProgram(p);
        int[] st = new int[1];
        GLES30.glGetProgramiv(p, GLES30.GL_LINK_STATUS, st, 0);
        if (st[0] == 0) throw new IllegalStateException("link: " + GLES30.glGetProgramInfoLog(p));
        return p;
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

    private static void linear(int tex) {
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE);
    }

    /** the density and the shown picture at least w × h */
    private void targets(int w, int h) {
        if (w > dw || h > dh) {
            dw = Math.max(w, dw);
            dh = Math.max(h, dh);
            linear(den);
            if (f16) GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA16F, dw, dh, 0, GLES30.GL_RGBA, GLES30.GL_HALF_FLOAT, null);
            else GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, dw, dh, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, null);
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, denFbo);
            GLES30.glFramebufferTexture2D(GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0, GLES30.GL_TEXTURE_2D, den, 0);
            if (f16 && GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER) != GLES30.GL_FRAMEBUFFER_COMPLETE) {
                // no half floats to draw into after all: 8 bits
                Log.w(TAG, "GL splats: 8 bits");
                f16 = false;
                dw = dh = 0;
                targets(w, h);
                return;
            }
        }
        if (w > ow || h > oh) {
            ow = Math.max(w, ow);
            oh = Math.max(h, oh);
            linear(out);
            GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, ow, oh, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, null);
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, outFbo);
            GLES30.glFramebufferTexture2D(GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0, GLES30.GL_TEXTURE_2D, out, 0);
        }
    }

    /**
     * The splats of a kind 10 command (its extras from e: palette count, the
     * colours, the light, the splat count, x, y, radius, temperature a
     * splat) over w × h game units at px pixels a unit; the picture is the
     * bitmap's pw × ph corner, rows from below. Null when the GPU failed.
     */
    Bitmap draw(float[] nums, int e, float w, float h, float px, float opac, float res, float kd) {
        gl.current();
        if (!passes(nums, e, w, h, px, opac, res, kd)) return null;
        return readBack();
    }

    /** the two passes into the shown picture (out), pw × ph of it; false when there is nothing to draw */
    private boolean passes(float[] nums, int e, float w, float h, float px, float opac, float res, float kd) {
        int np = Math.max(1, Math.min(256, (int) nums[e]));
        int at = e + 1 + np * 3;
        float lx = nums[at], ly = nums[at + 1], lz = nums[at + 2];
        int m = (int) nums[at + 3];
        int p0 = at + 4;
        if (m <= 0 || p0 + m * 4 > nums.length) return false;
        float k = px * (res > 0 ? res : 0.5f);
        int cw = Math.max(1, Math.min(2048, Math.round(w * k))), ch = Math.max(1, Math.min(2048, Math.round(h * k)));
        targets(cw, ch);
        pw = cw;
        ph = ch;
        float gain = f16 ? 1f : 0.25f;
        palBytes.position(0);
        for (int i = 0; i < np; i++) {
            for (int c = 0; c < 3; c++) palBytes.put((byte) Math.round(Math.max(0, Math.min(1, nums[e + 1 + i * 3 + c])) * 255));
            palBytes.put((byte) 255);
        }
        palBytes.position(0);
        linear(pal);
        GLES30.glPixelStorei(GLES30.GL_UNPACK_ALIGNMENT, 4);
        GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, np, 1, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, palBytes);
        if (pts.capacity() < m * 4) pts = ByteBuffer.allocateDirect(m * 16 + 4096).order(ByteOrder.nativeOrder()).asFloatBuffer();
        pts.position(0);
        pts.put(nums, p0, m * 4);
        pts.position(0);
        // 1: the weights added up
        GLES30.glDisable(GLES30.GL_SCISSOR_TEST);
        GLES30.glDisable(GLES30.GL_DEPTH_TEST);
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, denFbo);
        GLES30.glViewport(0, 0, cw, ch);
        GLES30.glClearColor(0, 0, 0, 0);
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT);
        GLES30.glEnable(GLES30.GL_BLEND);
        GLES30.glBlendFunc(GLES30.GL_ONE, GLES30.GL_ONE);
        GLES30.glUseProgram(add);
        // game units to clip space (y down); the density's part of its picture
        float sx = (float) cw / dw, sy = (float) ch / dh;
        GLES30.glViewport(0, 0, dw, dh);
        GLES30.glEnable(GLES30.GL_SCISSOR_TEST);
        GLES30.glScissor(0, 0, cw, ch);
        GLES30.glUniform4f(uXf, 2 * sx / w, -2 * sy / h, -1, -1 + 2 * sy);
        GLES30.glUniform1f(uGain, gain);
        GLES30.glBindVertexArray(vao);
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, inst);
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, m * 16, pts, GLES30.GL_STREAM_DRAW);
        GLES30.glDrawArraysInstanced(GLES30.GL_TRIANGLE_STRIP, 0, 4, m);
        // 2: the surface into the shown picture (the density's corner over the whole of it)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, outFbo);
        GLES30.glViewport(0, 0, cw, ch);
        GLES30.glScissor(0, 0, cw, ch);
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT);
        GLES30.glDisable(GLES30.GL_BLEND);
        boolean g = kd > 0;
        GLES30.glUseProgram(g ? gas : show);
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0);
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, den);
        GLES30.glUniform1i(g ? gDen : uDen, 0);
        GLES30.glActiveTexture(GLES30.GL_TEXTURE1);
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, pal);
        GLES30.glUniform1i(g ? gPal : uPal, 1);
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0);
        GLES30.glUniform2f(g ? gTexel : uTexel, 1f / dw, 1f / dh);
        GLES30.glUniform3f(g ? gLight : uLight, lx, ly, lz);
        GLES30.glUniform1f(g ? gNpal : uNpal, np);
        GLES30.glUniform1f(g ? gGain : uSGain, gain);
        GLES30.glUniform1f(g ? gOpac : uOpac, opac);
        if (g) GLES30.glUniform1f(gKd, kd);
        // the density's corner: uv runs 0..sx, 0..sy (the show pass's quad stretched by the viewport)
        GLES30.glViewport(0, 0, dw, dh);
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4);
        GLES30.glBindVertexArray(0);
        GLES30.glDisable(GLES30.GL_SCISSOR_TEST);
        return true;
    }

    /**
     * As draw, for the GL painter (the context current, GlHost): the picture
     * left in a texture, rows from below; 0 when nothing was drawn or the GPU
     * failed. Its part of the texture: pw × ph of tw × th.
     */
    int texture(float[] nums, int e, float w, float h, float px, float opac, float res, float kd) {
        if (!passes(nums, e, w, h, px, opac, res, kd)) return 0;
        int err = GLES30.glGetError();
        if (err != GLES30.GL_NO_ERROR) {
            Log.w(TAG, "GL splats: error " + err + ", off from now on");
            ok = false;
            return 0;
        }
        return out;
    }

    int texWidth() {
        return ow;
    }

    int texHeight() {
        return oh;
    }

    private Bitmap readBack() {
        int cw = pw, ch = ph;
        // read back
        int slot = ringNext;
        ringNext = (ringNext + 1) % ring.length;
        Bitmap bm = ring[slot];
        if (bm == null || bm.getWidth() < cw || bm.getHeight() < ch || bm.getWidth() > cw * 5 / 4 + 64) {
            bm = Bitmap.createBitmap(cw + cw / 8 + 16, ch + ch / 8 + 16, Bitmap.Config.ARGB_8888);
            ring[slot] = bm;
        }
        int bytes = bm.getRowBytes() * bm.getHeight();
        if (pixels.capacity() < bytes) pixels = ByteBuffer.allocateDirect(bytes).order(ByteOrder.nativeOrder());
        pixels.position(0);
        GLES30.glPixelStorei(GLES30.GL_PACK_ALIGNMENT, 4);
        GLES30.glPixelStorei(GLES30.GL_PACK_ROW_LENGTH, bm.getRowBytes() / 4);
        GLES30.glReadPixels(0, 0, cw, ch, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, pixels);
        GLES30.glPixelStorei(GLES30.GL_PACK_ROW_LENGTH, 0);
        int err = GLES30.glGetError();
        if (err != GLES30.GL_NO_ERROR) {
            Log.w(TAG, "GL splats: error " + err + ", off from now on");
            ok = false;
            return null;
        }
        pixels.position(0);
        pixels.limit(bytes);
        bm.copyPixelsFromBuffer(pixels);
        pixels.limit(pixels.capacity());
        return bm;
    }
}
