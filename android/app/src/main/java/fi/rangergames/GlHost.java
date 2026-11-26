// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.opengl.GLES30;
import android.opengl.GLUtils;
import android.util.Log;

/**
 * What the GL painter (crates/rg_gl, Engine.glRender) asks the app for, on
 * the game thread with the GL context current: pictures uploaded into the
 * bound texture, text runs measured and written into the bound texture
 * (Android's own fonts), and globes drawn by {@link GlSphere} into a texture.
 * Called from Rust (crates/rg_android/src/jni.rs, JniGlHost).
 */
final class GlHost {
    private static final String TAG = "RangerGames";
    static Painter painter;
    private static final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
    private static final Paint.FontMetrics fm = new Paint.FontMetrics();
    private static int maxTex;

    private GlHost() {
    }

    /** pictures being decoded off the game thread, by path (a 2048×1024 JPEG took
     *  ~30 ms to decode there, four at once stalled a frame ~0.35 s on the tablet) */
    private static final java.util.HashMap<String, java.util.concurrent.Future<Bitmap>> decoding = new java.util.HashMap<>();
    private static final java.util.concurrent.ExecutorService decoder = java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "rg-image");
        t.setPriority(Thread.NORM_PRIORITY - 1);
        return t;
    });
    /** one picture uploaded a frame, so several do not land in the same one */
    private static boolean uploaded;

    /** Dev reload: the picture at path changed (rg_gl forgets its texture in Engine.devChanged). */
    static void forget(String path) {
        decoding.remove(path);
    }

    /** A new frame: another picture may be uploaded (MainActivity, after each GL frame). */
    static void frameDone() {
        uploaded = false;
    }

    /**
     * The picture at path into the bound TEXTURE_2D: its width << 16 | height,
     * -1 while it is still being decoded (on a thread of its own; asked again
     * next frame), -2 when it does not decode.
     */
    static int image(String path) {
        try {
            java.util.concurrent.Future<Bitmap> f = decoding.get(path);
            if (f == null) {
                byte[] bytes = path.startsWith("/") ? Engine.read(path) : null;
                if (bytes == null) return -2;
                f = decoder.submit(() -> {
                    BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inPreferredConfig = Bitmap.Config.ARGB_8888;
                    return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
                });
                decoding.put(path, f);
                // a short wait first: most pictures decode in ~30 ms, and one shown
                // missing for a frame (a white Earth) flashed; a longer one waits
                if (uploaded) return -1;
                try {
                    f.get(40, java.util.concurrent.TimeUnit.MILLISECONDS);
                } catch (java.util.concurrent.TimeoutException e) {
                    return -1;
                }
            }
            if (!f.isDone() || uploaded) return -1;
            decoding.remove(path);
            Bitmap b = f.get();
            if (b == null) return -2;
            uploaded = true;
            if (maxTex == 0) {
                int[] m = new int[1];
                GLES30.glGetIntegerv(GLES30.GL_MAX_TEXTURE_SIZE, m, 0);
                maxTex = Math.max(2048, Math.min(4096, m[0]));
            }
            int w = b.getWidth(), h = b.getHeight();
            if (w > maxTex || h > maxTex) {
                float k = maxTex / (float) Math.max(w, h);
                Bitmap s = Bitmap.createScaledBitmap(b, Math.max(1, (int) (w * k)), Math.max(1, (int) (h * k)), true);
                b.recycle();
                b = s;
            }
            // premultiplied, as the painter blends
            GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, b, 0);
            int r = (b.getWidth() << 16) | b.getHeight();
            b.recycle();
            return r;
        } catch (Throwable t) {
            decoding.remove(path);
            Log.w(TAG, "GL image " + path + ": " + t);
            return -2;
        }
    }

    private static void font(String weight, boolean italic, float size, float spacing) {
        text.setTypeface(painter.font(weight, italic));
        text.setTextSize(size);
        text.setLetterSpacing(spacing != 0 && size > 0 ? spacing / size : 0);
    }

    /** out: the run's advance, ascent (negative) and descent, in pixels. */
    static boolean textMeasure(String s, String weight, boolean italic, float size, float spacing, float[] out) {
        if (size <= 0) return false;
        font(weight, italic, size, spacing);
        text.getFontMetrics(fm);
        out[0] = text.measureText(s);
        out[1] = fm.ascent;
        out[2] = fm.descent;
        return true;
    }

    /** The run into the bound texture at x, y (w × h): it starts at pad, its baseline at pad − ascent. */
    static boolean textDraw(String s, String weight, boolean italic, float size, float spacing, int rgb, int pad, int x, int y, int w, int h) {
        if (w <= 0 || h <= 0) return false;
        try {
            font(weight, italic, size, spacing);
            text.getFontMetrics(fm);
            text.setColor(0xff000000 | rgb);
            Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            new Canvas(b).drawText(s, pad, pad - fm.ascent, text);
            GLES30.glPixelStorei(GLES30.GL_UNPACK_ALIGNMENT, 4);
            GLUtils.texSubImage2D(GLES30.GL_TEXTURE_2D, 0, x, y, b);
            b.recycle();
            return true;
        } catch (Throwable t) {
            Log.w(TAG, "GL text: " + t);
            return false;
        }
    }

    /** The globes of nums (one run of sphere commands) into a texture; out as Painter.glGlobes. */
    static boolean globes(float[] nums, String[] strings, float px, float[] out) {
        try {
            return painter != null && painter.glGlobes(nums, strings, px, out);
        } catch (Throwable t) {
            Log.w(TAG, "GL globes: " + t);
            return false;
        }
    }
}
