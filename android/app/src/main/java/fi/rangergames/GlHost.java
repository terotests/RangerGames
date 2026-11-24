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

    /** The picture at path into the bound TEXTURE_2D: its width << 16 | height, -2 when it does not decode. */
    static int image(String path) {
        try {
            byte[] bytes = path.startsWith("/") ? Engine.read(path) : null;
            if (bytes == null) return -2;
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inPreferredConfig = Bitmap.Config.ARGB_8888;
            Bitmap b = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
            if (b == null) return -2;
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
