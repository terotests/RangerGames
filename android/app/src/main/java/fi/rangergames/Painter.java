// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Build;

import java.util.HashMap;

/**
 * Paints the engine's draw stream (crates/rg_engine/src/draw.rs) on an
 * Android Canvas, as web/js/painter.js does on a 2D canvas: EVG has placed
 * everything, this class only fills, strokes and writes text.
 */
final class Painter {
    private static final int HEADER = 23;
    private static final int RECT = 0, BORDER = 1, IMAGE = 2, TEXT = 3, PUSH_CLIP = 4, POP_CLIP = 5, PATH = 6, STROKE = 7;

    private final AssetManager assets;
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
    private final Paint image = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Path path = new Path();
    private final RectF rf = new RectF();
    private final Rect src = new Rect();
    private final float[] radii = new float[8];
    private final HashMap<String, Typeface> fonts = new HashMap<>();
    private final HashMap<String, Bitmap> images = new HashMap<>();
    private final Paint.FontMetrics fm = new Paint.FontMetrics();

    Painter(AssetManager assets) {
        this.assets = assets;
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        stroke.setStrokeCap(Paint.Cap.ROUND);
    }

    private static int argb(float r, float g, float b, float a) {
        int ai = Math.round(Math.max(0, Math.min(1, a)) * 255);
        return (ai << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
    }

    private static int clamp(float v) {
        return Math.max(0, Math.min(255, (int) v));
    }

    /** Fredoka (assets/fonts) at the weight asked for, else the system's sans. */
    private Typeface font(String weight, boolean italic) {
        String key = weight + (italic ? "i" : "");
        Typeface t = fonts.get(key);
        if (t != null) return t;
        int w = 400;
        if ("bold".equals(weight)) w = 700;
        else if (weight != null && !weight.isEmpty() && !"normal".equals(weight)) {
            try {
                w = Integer.parseInt(weight);
            } catch (NumberFormatException ignored) {
            }
        }
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                t = new Typeface.Builder(assets, "fonts/Fredoka.ttf")
                        .setFontVariationSettings("'wght' " + Math.max(300, Math.min(700, w)))
                        .build();
            } else {
                t = Typeface.createFromAsset(assets, "fonts/Fredoka.ttf");
            }
        } catch (Exception e) {
            t = null;
        }
        if (t == null) t = Typeface.create(Typeface.SANS_SERIF, w >= 600 ? Typeface.BOLD : Typeface.NORMAL);
        if (italic) t = Typeface.create(t, t.isBold() ? Typeface.BOLD_ITALIC : Typeface.ITALIC);
        fonts.put(key, t);
        return t;
    }

    /** An image of the virtual directory, decoded once (PNG, JPEG, WebP). */
    private Bitmap bitmap(String s) {
        if (images.containsKey(s)) return images.get(s);
        Bitmap b = null;
        byte[] bytes = s.startsWith("/") ? Engine.read(s) : null;
        if (bytes != null) b = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        images.put(s, b);
        return b;
    }

    private void roundRect(float x, float y, float w, float h, float tl, float tr, float br, float bl) {
        float lim = Math.min(w, h) / 2;
        tl = Math.max(0, Math.min(tl, lim));
        tr = Math.max(0, Math.min(tr, lim));
        br = Math.max(0, Math.min(br, lim));
        bl = Math.max(0, Math.min(bl, lim));
        radii[0] = radii[1] = tl;
        radii[2] = radii[3] = tr;
        radii[4] = radii[5] = br;
        radii[6] = radii[7] = bl;
        path.reset();
        rf.set(x, y, x + w, y + h);
        path.addRoundRect(rf, radii, Path.Direction.CW);
    }

    /**
     * nums and strings: the frame's stream; view: scale, x, y, game w, h (dp);
     * density: px per dp; background: the colour around and under the game.
     */
    void paint(Canvas c, float[] nums, String[] strings, double[] view, float density, int background) {
        c.drawColor(background);
        float scale = (float) view[0] * density;
        int base = c.save();
        c.translate((float) view[1] * density, (float) view[2] * density);
        c.scale(scale, scale);
        // the game's area clips everything (a letterboxed game stays in its box)
        c.clipRect(0, 0, (float) view[3], (float) view[4]);
        int clips = 0;
        int i = 0, n = nums.length;
        while (i + HEADER <= n) {
            int k = (int) nums[i];
            float x = nums[i + 1], y = nums[i + 2], w = nums[i + 3], h = nums[i + 4];
            float r = nums[i + 5], g = nums[i + 6], b = nums[i + 7], a = nums[i + 8];
            float tl = nums[i + 9], tr = nums[i + 10], br = nums[i + 11], bl = nums[i + 12];
            float t = nums[i + 13], rot = nums[i + 14], rox = nums[i + 15], roy = nums[i + 16];
            int flags = (int) nums[i + 17];
            int s0 = (int) nums[i + 18], s1 = (int) nums[i + 19], s2 = (int) nums[i + 20];
            float ls = nums[i + 21];
            int nx = (int) nums[i + 22];
            int e = i + HEADER;
            i = e + nx;
            int gradAt = -1, shadowAt = -1, cropAt = -1, tileAt = -1, ptsAt = -1;
            if ((flags & 1) != 0) { gradAt = e; e += 4; }
            if ((flags & 4) != 0) { shadowAt = e; e += 7; }
            if ((flags & 64) != 0) { cropAt = e; e += 4; }
            if ((flags & 1024) != 0) { tileAt = e; e += 4; }
            if (k == PATH || k == STROKE) ptsAt = e;

            if (k == PUSH_CLIP) {
                c.save();
                clips++;
                c.clipRect(x, y, x + Math.max(0, w), y + Math.max(0, h));
                continue;
            }
            if (k == POP_CLIP) {
                if (clips > 0) {
                    c.restore();
                    clips--;
                }
                continue;
            }
            if (a <= 0 && (flags & 1) == 0 && k != IMAGE) continue;
            boolean rotated = rot != 0;
            if (rotated) {
                c.save();
                float cx = (flags & 128) != 0 ? rox : x + w / 2;
                float cy = (flags & 128) != 0 ? roy : y + h / 2;
                c.rotate(rot, cx, cy);
            }
            if (k == RECT) {
                if (w > 0 && h > 0) {
                    fill.setShader(null);
                    fill.setColor(argb(r, g, b, a));
                    if (gradAt >= 0) {
                        int far = argb(nums[gradAt], nums[gradAt + 1], nums[gradAt + 2], nums[gradAt + 3]);
                        fill.setColor(0xff000000);
                        fill.setShader((flags & 2) != 0
                                ? new LinearGradient(x, y, x + w, y, argb(r, g, b, a), far, Shader.TileMode.CLAMP)
                                : new LinearGradient(x, y, x, y + h, argb(r, g, b, a), far, Shader.TileMode.CLAMP));
                    }
                    if (shadowAt >= 0) {
                        fill.setShadowLayer(Math.max(0.1f, nums[shadowAt + 2] / 2), nums[shadowAt], nums[shadowAt + 1],
                                argb(nums[shadowAt + 3], nums[shadowAt + 4], nums[shadowAt + 5], nums[shadowAt + 6]));
                    }
                    if (tl != 0 || tr != 0 || br != 0 || bl != 0) {
                        roundRect(x, y, w, h, tl, tr, br, bl);
                        c.drawPath(path, fill);
                    } else {
                        c.drawRect(x, y, x + w, y + h, fill);
                    }
                    if (shadowAt >= 0) fill.clearShadowLayer();
                    fill.setShader(null);
                }
            } else if (k == BORDER) {
                float bt = t != 0 ? t : 1;
                if (w > bt && h > bt) {
                    stroke.setColor(argb(r, g, b, a));
                    stroke.setStrokeWidth(bt);
                    roundRect(x + bt / 2, y + bt / 2, w - bt, h - bt,
                            Math.max(0, tl - bt / 2), Math.max(0, tr - bt / 2), Math.max(0, br - bt / 2), Math.max(0, bl - bt / 2));
                    c.drawPath(path, stroke);
                }
            } else if (k == IMAGE) {
                String s = s0 >= 0 && s0 < strings.length ? strings[s0] : "";
                Bitmap img = s.isEmpty() ? null : bitmap(s);
                if (img != null && w > 0 && h > 0) {
                    c.save();
                    if (tl != 0 || tr != 0 || br != 0 || bl != 0) {
                        roundRect(x, y, w, h, tl, tr, br, bl);
                        c.clipPath(path);
                    } else {
                        c.clipRect(x, y, x + w, y + h);
                    }
                    if ((flags & (8 | 16)) != 0) {
                        c.scale((flags & 8) != 0 ? -1 : 1, (flags & 16) != 0 ? -1 : 1, x + w / 2, y + h / 2);
                    }
                    int iw = img.getWidth(), ih = img.getHeight();
                    if (tileAt >= 0) {
                        float tx0 = nums[tileAt], ty0 = nums[tileAt + 1], tw = nums[tileAt + 2], th = nums[tileAt + 3];
                        if (tw > 0 && th > 0) {
                            for (float ty = ty0; ty < y + h; ty += th) {
                                for (float tx = tx0; tx < x + w; tx += tw) {
                                    rf.set(tx, ty, tx + tw, ty + th);
                                    c.drawBitmap(img, null, rf, image);
                                }
                            }
                        }
                    } else if (cropAt >= 0) {
                        src.set((int) (nums[cropAt] * iw), (int) (nums[cropAt + 1] * ih), (int) (nums[cropAt + 2] * iw), (int) (nums[cropAt + 3] * ih));
                        rf.set(x, y, x + w, y + h);
                        c.drawBitmap(img, src, rf, image);
                    } else {
                        // object-fit: cover, as EVG's other painters do
                        float sc = Math.max(w / iw, h / ih), sw = w / sc, sh = h / sc;
                        src.set((int) ((iw - sw) / 2), (int) ((ih - sh) / 2), (int) ((iw + sw) / 2), (int) ((ih + sh) / 2));
                        rf.set(x, y, x + w, y + h);
                        c.drawBitmap(img, src, rf, image);
                    }
                    c.restore();
                }
            } else if (k == TEXT) {
                String s = s0 >= 0 && s0 < strings.length ? strings[s0] : "";
                if (!s.isEmpty() && t > 0) {
                    String weight = s2 >= 0 && s2 < strings.length ? strings[s2] : "";
                    text.setTypeface(font(weight, (flags & 256) != 0));
                    text.setTextSize(t);
                    text.setLetterSpacing(ls != 0 ? ls / t : 0);
                    text.setColor(argb(r, g, b, a));
                    // EVG placed the run by its own font metrics: keep the run's centre
                    float tw = text.measureText(s);
                    float dx = w > 0 ? (w - tw) / 2 : 0;
                    text.getFontMetrics(fm);
                    float baseline = y + h / 2 - (fm.ascent + fm.descent) / 2;
                    c.drawText(s, x + dx, baseline, text);
                }
            } else if (ptsAt >= 0 && nx > 0) {
                int np = (int) nums[ptsAt];
                int pts = ptsAt + 1;
                int ne = (int) nums[pts + np];
                int ends = pts + np + 1;
                path.reset();
                int at = 0;
                for (int ri = 0; ri < ne; ri++) {
                    int end = (int) nums[ends + ri];
                    if (end - at >= 4) {
                        path.moveTo(nums[pts + at], nums[pts + at + 1]);
                        for (int pi = at + 2; pi + 1 < end; pi += 2) path.lineTo(nums[pts + pi], nums[pts + pi + 1]);
                        if (k == PATH) path.close();
                    }
                    at = end;
                }
                if (k == PATH) {
                    path.setFillType((flags & 32) != 0 ? Path.FillType.EVEN_ODD : Path.FillType.WINDING);
                    fill.setShader(null);
                    fill.setColor(argb(r, g, b, a));
                    c.drawPath(path, fill);
                } else {
                    stroke.setColor(argb(r, g, b, a));
                    stroke.setStrokeWidth(t != 0 ? t : 1);
                    c.drawPath(path, stroke);
                }
            }
            if (rotated) c.restore();
        }
        c.restoreToCount(base);
    }
}
