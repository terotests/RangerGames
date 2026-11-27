// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

/**
 * The engine (crates/rg_android, librg_android.so): CErXes runs the game's
 * TSX, EVG lays it out, and each frame gives a draw stream that
 * {@link Painter} paints. Call it from one thread only (the game thread).
 */
final class Engine {
    static {
        System.loadLibrary("rg_android");
    }

    private Engine() {
    }

    static native int mount(String prefix, byte[] pack);

    static native void put(String path, byte[] data);

    static native int start(String id);

    /** Dev reload ({@link DevLink}): these files (paths, one a line) were put again; 2 the game started again, 1 restyled, 0 nothing. */
    static native int devChanged(String paths);

    static native void resize(double w, double h);

    static native void seed(double seed);

    /** kind 0 down, 1 move, 2 up; x and y in dp. */
    static native void pointer(int kind, int id, double x, double y);

    static native void key(boolean down, String key);

    /** A sensor reading: "location", "heading" or "orient" (or "error") and its JSON. */
    static native void sensor(String name, String json);

    static native int frame(double dtMs);

    /** One frame from the display's vsync time and period (ms): steps of whole display frames (rg_core::clock). */
    static native int frameAt(double vsyncMs, double periodMs);

    static native float[] draw();

    /** on: the app draws the 3D scene itself with GLES ({@link Gl3D}); then it is in tris(), not in draw(). */
    static native void gl3d(boolean on);

    /** on: the app draws textured globes (draw kind 8, {@link Sphere}). */
    static native void textures(boolean on);
    /** the app draws real heights on globes (Terrain.java) */
    static native void terrain(boolean on);
    /** the app draws baked particle runs as liquid splats (GlSplats.java) */
    static native void splats(boolean on);
    /** the app draws a planet's detail pictures (GlSphere: GPU globes) */
    static native void detail(boolean on);

    /** on: the app installs games from the download list ({@link Store}, rg.store). */
    static native void store(boolean on);

    /** The frame's 3D triangles, 6 floats a corner: x, y (dp of the game), depth 0…1, r, g, b. */
    static native float[] tris();

    static native String strings();

    static native String commands();

    static native String log();
    /** a shader stage, built-in (shaders/&lt;path&gt;) or a game's ("game:&lt;key&gt;"), assembled with the defines, or null (rg_shader) */
    static native String shader(String path, String defines);
    /** a driver's compile log for that stage in the source's own lines; also goes to the game's log */
    static native String shaderError(String path, String defines, String log);

    /** 0 scale, 1 x offset, 2 y offset, 3 game width, 4 game height. */
    static native double view(int i);

    static native byte[] read(String path);

    /** on: the app paints everything with GL (glRender); 3D as triangles in the stream. */
    static native void glAll(boolean on);

    /** on: the app can paint either way (⚙ → Piirto: GL / Canvas, rg.paints). */
    static native void paints(boolean on);

    /** Paints the last frame into the current GL surface (w × h pixels); false when GL failed. */
    static native boolean glRender(int w, int h, float density, float r, float g, float b);

    /** The GL painter's numbers and last error, for the log. */
    static native String glStats();

    // ---- VR headsets (Meta Quest): OpenXR, XrActivity (crates/rg_android/src/xr_android.rs) ----

    /** Starts OpenXR in the game thread's GL context; false when there is no headset (log() says why). */
    static native boolean xrStart(android.app.Activity activity);

    /** One headset frame with the game's frame in it: 1 drawn, 0 waiting (not shown), -1 the headset ended the app. */
    static native int xrFrame();

    /** Lets go of OpenXR. */
    static native void xrStop();
}
