// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.util.Log;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

import javax.microedition.khronos.egl.EGL10;
import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.egl.EGLDisplay;
import javax.microedition.khronos.opengles.GL10;

/**
 * The engine's 3D scene with a real depth buffer (GLES 2.0), on a
 * GLSurfaceView under the 2D one: the engine projects and lights every face
 * (crates/rg_engine/src/scene3d.rs, render_gl) and hands over triangles,
 * 6 floats a corner (x, y in the game's units, depth 0…1, r, g, b), so parts
 * of the scene never show through each other. The same as web/js/gl3d.js.
 */
final class Gl3D implements GLSurfaceView.Renderer {
    private static final String TAG = "RangerGames";
    private static final String VS = "attribute vec2 p; attribute float d; attribute vec3 c; uniform vec4 xf; varying vec3 v;"
            + "void main() { v = c; gl_Position = vec4(p.x * xf.x + xf.z, p.y * xf.y + xf.w, d * 2.0 - 1.0, 1.0); }";
    private static final String FS = "precision mediump float; varying vec3 v; void main() { gl_FragColor = vec4(v, 1.0); }";

    /** true once the GL context and the shaders work (the game thread then asks the engine for triangles) */
    volatile boolean ready;
    private int prog, aP, aD, aC, uXf;
    private int width, height;
    private FloatBuffer buf;
    // the latest frame from the game thread
    private final Object lock = new Object();
    private float[] tris;
    private double[] view;
    private float density = 1;

    /** From the game thread: the frame's triangles and the game's place (Engine.view). */
    void submit(float[] t, double[] v, float dens) {
        synchronized (lock) {
            tris = t;
            view = v;
            density = dens;
        }
    }

    @Override
    public void onSurfaceCreated(GL10 unused, EGLConfig config) {
        ready = false;
        int vs = shader(GLES20.GL_VERTEX_SHADER, VS), fs = shader(GLES20.GL_FRAGMENT_SHADER, FS);
        prog = GLES20.glCreateProgram();
        GLES20.glAttachShader(prog, vs);
        GLES20.glAttachShader(prog, fs);
        GLES20.glLinkProgram(prog);
        int[] ok = new int[1];
        GLES20.glGetProgramiv(prog, GLES20.GL_LINK_STATUS, ok, 0);
        if (ok[0] == 0) {
            Log.w(TAG, "gl3d: " + GLES20.glGetProgramInfoLog(prog));
            return;
        }
        aP = GLES20.glGetAttribLocation(prog, "p");
        aD = GLES20.glGetAttribLocation(prog, "d");
        aC = GLES20.glGetAttribLocation(prog, "c");
        uXf = GLES20.glGetUniformLocation(prog, "xf");
        int[] bits = new int[1];
        GLES20.glGetIntegerv(GLES20.GL_DEPTH_BITS, bits, 0);
        Log.i(TAG, "gl3d: depth " + bits[0] + " bits");
        ready = true;
    }

    private static int shader(int kind, String src) {
        int s = GLES20.glCreateShader(kind);
        GLES20.glShaderSource(s, src);
        GLES20.glCompileShader(s);
        return s;
    }

    @Override
    public void onSurfaceChanged(GL10 unused, int w, int h) {
        width = w;
        height = h;
        GLES20.glViewport(0, 0, w, h);
    }

    @Override
    public void onDrawFrame(GL10 unused) {
        float[] t;
        double[] v;
        float dens;
        synchronized (lock) {
            t = tris;
            v = view;
            dens = density;
        }
        GLES20.glDisable(GLES20.GL_SCISSOR_TEST);
        GLES20.glClearColor(0, 0, 0, 1);
        GLES20.glClearDepthf(1);
        GLES20.glDepthMask(true);
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        if (!ready || t == null || t.length == 0 || v == null) return;
        if (buf == null || buf.capacity() < t.length) {
            buf = ByteBuffer.allocateDirect(Math.max(t.length, 6 * 3 * 1024) * 4 * 3 / 2).order(ByteOrder.nativeOrder()).asFloatBuffer();
        }
        buf.clear();
        buf.put(t);
        // v: 0 scale, 1 x, 2 y, 3 game width, 4 game height, in dp
        double s = v[0] * dens, x = v[1] * dens, y = v[2] * dens;
        GLES20.glEnable(GLES20.GL_SCISSOR_TEST);
        GLES20.glScissor((int) Math.round(x), (int) Math.round(height - y - v[4] * s), (int) Math.round(v[3] * s), (int) Math.round(v[4] * s));
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthFunc(GLES20.GL_LEQUAL);
        GLES20.glDisable(GLES20.GL_CULL_FACE);
        GLES20.glUseProgram(prog);
        GLES20.glUniform4f(uXf, (float) (2 * s / width), (float) (-2 * s / height), (float) (2 * x / width - 1), (float) (1 - 2 * y / height));
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0);
        GLES20.glEnableVertexAttribArray(aP);
        GLES20.glEnableVertexAttribArray(aD);
        GLES20.glEnableVertexAttribArray(aC);
        buf.position(0);
        GLES20.glVertexAttribPointer(aP, 2, GLES20.GL_FLOAT, false, 24, buf);
        buf.position(2);
        GLES20.glVertexAttribPointer(aD, 1, GLES20.GL_FLOAT, false, 24, buf);
        buf.position(3);
        GLES20.glVertexAttribPointer(aC, 3, GLES20.GL_FLOAT, false, 24, buf);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, t.length / 6);
    }

    /**
     * RGB 888 with the deepest depth buffer there is (24 bits, else 16), with
     * 4x multisampling when the phone has it, for smooth edges.
     */
    static final class Config implements GLSurfaceView.EGLConfigChooser {
        @Override
        public EGLConfig chooseConfig(EGL10 egl, EGLDisplay display) {
            int[][] wants = {
                    {EGL10.EGL_RED_SIZE, 8, EGL10.EGL_GREEN_SIZE, 8, EGL10.EGL_BLUE_SIZE, 8, EGL10.EGL_DEPTH_SIZE, 16,
                            EGL10.EGL_RENDERABLE_TYPE, 4, EGL10.EGL_SAMPLE_BUFFERS, 1, EGL10.EGL_SAMPLES, 4, EGL10.EGL_NONE},
                    {EGL10.EGL_RED_SIZE, 8, EGL10.EGL_GREEN_SIZE, 8, EGL10.EGL_BLUE_SIZE, 8, EGL10.EGL_DEPTH_SIZE, 16,
                            EGL10.EGL_RENDERABLE_TYPE, 4, EGL10.EGL_NONE},
                    {EGL10.EGL_DEPTH_SIZE, 16, EGL10.EGL_RENDERABLE_TYPE, 4, EGL10.EGL_NONE},
                    {EGL10.EGL_RENDERABLE_TYPE, 4, EGL10.EGL_NONE},
            };
            for (int[] want : wants) {
                int[] n = new int[1];
                if (!egl.eglChooseConfig(display, want, null, 0, n) || n[0] <= 0) continue;
                EGLConfig[] list = new EGLConfig[n[0]];
                egl.eglChooseConfig(display, want, list, n[0], n);
                // the deepest depth, then the fewest extra (alpha, stencil) bits
                EGLConfig best = null;
                int bestScore = Integer.MIN_VALUE;
                for (EGLConfig c : list) {
                    if (c == null) continue;
                    int depth = attr(egl, display, c, EGL10.EGL_DEPTH_SIZE);
                    int extra = attr(egl, display, c, EGL10.EGL_ALPHA_SIZE) + attr(egl, display, c, EGL10.EGL_STENCIL_SIZE);
                    int r = attr(egl, display, c, EGL10.EGL_RED_SIZE);
                    int score = Math.min(depth, 24) * 100 - extra - Math.abs(r - 8) * 10;
                    if (score > bestScore) {
                        bestScore = score;
                        best = c;
                    }
                }
                if (best != null) return best;
            }
            throw new IllegalArgumentException("no GLES 2 config");
        }

        private static int attr(EGL10 egl, EGLDisplay d, EGLConfig c, int name) {
            int[] v = new int[1];
            return egl.eglGetConfigAttrib(d, c, name, v) ? v[0] : 0;
        }
    }
}
