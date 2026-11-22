// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLExt;
import android.opengl.EGLSurface;
import android.util.Log;
import android.view.Surface;

/**
 * The GLES 3.0 context the app paints everything with (Engine.glRender,
 * crates/rg_gl), on the game thread: the SurfaceView's window when there is
 * one, a 1 × 1 pbuffer meanwhile, so the context and its textures live as
 * long as the activity. 8-bit colour with alpha, depth and an 8-bit stencil
 * (the painter fills paths through it).
 */
final class GlCtx {
    private static final String TAG = "RangerGames";
    private EGLDisplay display = EGL14.EGL_NO_DISPLAY;
    private EGLContext context = EGL14.EGL_NO_CONTEXT;
    private EGLConfig config;
    private EGLSurface pbuffer = EGL14.EGL_NO_SURFACE;
    private EGLSurface window = EGL14.EGL_NO_SURFACE;
    private Surface attached;
    private final int[] q = new int[1];

    /** Makes the context current on this thread; false when the device has no GLES 3.0 (then Canvas). */
    boolean init() {
        try {
            display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
            int[] ver = new int[2];
            if (!EGL14.eglInitialize(display, ver, 0, ver, 1)) throw new IllegalStateException("eglInitialize");
            config = choose(24);
            if (config == null) config = choose(16);
            if (config == null) throw new IllegalStateException("no GLES 3 config with a stencil");
            context = EGL14.eglCreateContext(display, config, EGL14.EGL_NO_CONTEXT, new int[] {EGL14.EGL_CONTEXT_CLIENT_VERSION, 3, EGL14.EGL_NONE}, 0);
            if (context == EGL14.EGL_NO_CONTEXT) throw new IllegalStateException("eglCreateContext");
            pbuffer = EGL14.eglCreatePbufferSurface(display, config, new int[] {EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE}, 0);
            if (pbuffer == EGL14.EGL_NO_SURFACE) throw new IllegalStateException("pbuffer");
            if (!EGL14.eglMakeCurrent(display, pbuffer, pbuffer, context)) throw new IllegalStateException("eglMakeCurrent");
            return true;
        } catch (Throwable t) {
            Log.w(TAG, "GL painting off (Canvas): " + t.getMessage());
            release();
            return false;
        }
    }

    private EGLConfig choose(int depth) {
        int[] attrs = {EGL14.EGL_RENDERABLE_TYPE, EGLExt.EGL_OPENGL_ES3_BIT_KHR,
                EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT | EGL14.EGL_PBUFFER_BIT,
                EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
                EGL14.EGL_DEPTH_SIZE, depth, EGL14.EGL_STENCIL_SIZE, 8, EGL14.EGL_NONE};
        EGLConfig[] cfg = new EGLConfig[1];
        int[] n = new int[1];
        if (!EGL14.eglChooseConfig(display, attrs, 0, cfg, 0, 1, n, 0) || n[0] < 1) return null;
        return cfg[0];
    }

    /** The window to paint into (made current), or null: the pbuffer again. False when it can't. */
    boolean attach(Surface s) {
        if (s == attached && (s == null || window != EGL14.EGL_NO_SURFACE)) return s != null;
        detach();
        if (s == null || !s.isValid()) return false;
        window = EGL14.eglCreateWindowSurface(display, config, s, new int[] {EGL14.EGL_NONE}, 0);
        if (window == EGL14.EGL_NO_SURFACE) {
            Log.w(TAG, "GL painting: no window surface, error " + EGL14.eglGetError());
            return false;
        }
        if (!EGL14.eglMakeCurrent(display, window, window, context)) {
            Log.w(TAG, "GL painting: eglMakeCurrent " + EGL14.eglGetError());
            detach();
            return false;
        }
        attached = s;
        // one frame for each of the display's: eglSwapBuffers waits
        EGL14.eglSwapInterval(display, 1);
        return true;
    }

    /** Back to the pbuffer (the window going away). */
    void detach() {
        if (display == EGL14.EGL_NO_DISPLAY) return;
        EGL14.eglMakeCurrent(display, pbuffer, pbuffer, context);
        if (window != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, window);
        window = EGL14.EGL_NO_SURFACE;
        attached = null;
    }

    int width() {
        EGL14.eglQuerySurface(display, window, EGL14.EGL_WIDTH, q, 0);
        return q[0];
    }

    int height() {
        EGL14.eglQuerySurface(display, window, EGL14.EGL_HEIGHT, q, 0);
        return q[0];
    }

    /** Shows the frame; false when the window was lost (it is let go). */
    boolean swap() {
        if (window == EGL14.EGL_NO_SURFACE) return false;
        if (EGL14.eglSwapBuffers(display, window)) return true;
        Log.w(TAG, "GL painting: eglSwapBuffers " + EGL14.eglGetError());
        detach();
        return false;
    }

    void release() {
        if (display == EGL14.EGL_NO_DISPLAY) return;
        EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT);
        if (window != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, window);
        if (pbuffer != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, pbuffer);
        if (context != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, context);
        window = pbuffer = EGL14.EGL_NO_SURFACE;
        context = EGL14.EGL_NO_CONTEXT;
        display = EGL14.EGL_NO_DISPLAY;
        attached = null;
    }
}
