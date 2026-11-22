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

    static native void resize(double w, double h);

    static native void seed(double seed);

    /** kind 0 down, 1 move, 2 up; x and y in dp. */
    static native void pointer(int kind, int id, double x, double y);

    static native void key(boolean down, String key);

    /** A sensor reading: "location" or "heading" (or "error") and its JSON. */
    static native void sensor(String name, String json);

    static native int frame(double dtMs);

    static native float[] draw();

    /** on: the app draws the 3D scene itself with GLES ({@link Gl3D}); then it is in tris(), not in draw(). */
    static native void gl3d(boolean on);

    /** on: the app draws textured globes (draw kind 8, {@link Sphere}). */
    static native void textures(boolean on);
    /** the app draws real heights on globes (Terrain.java) */
    static native void terrain(boolean on);

    /** on: the app installs games from the download list ({@link Store}, rg.store). */
    static native void store(boolean on);

    /** The frame's 3D triangles, 6 floats a corner: x, y (dp of the game), depth 0…1, r, g, b. */
    static native float[] tris();

    static native String strings();

    static native String commands();

    static native String log();

    /** 0 scale, 1 x offset, 2 y offset, 3 game width, 4 game height. */
    static native double view(int i);

    static native byte[] read(String path);
}
