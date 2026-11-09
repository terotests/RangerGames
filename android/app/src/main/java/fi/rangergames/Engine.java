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

    static native int frame(double dtMs);

    static native float[] draw();

    static native String strings();

    static native String commands();

    static native String log();

    /** 0 scale, 1 x offset, 2 y offset, 3 game width, 4 game height. */
    static native double view(int i);

    static native byte[] read(String path);
}
