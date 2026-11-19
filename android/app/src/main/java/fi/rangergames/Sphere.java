// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

/**
 * A textured globe (draw kind 8, crates/rg_engine/src/draw.rs {@code sphere}),
 * cast on the CPU: for every pixel of the box a ray from the camera, and
 * where it meets the ball the map picture's colour at that longitude and
 * latitude, lit by the sun. The same as the shader in web/js/painter.js.
 * Plain Java (no Android classes), so it is tested on a desktop JVM.
 */
final class Sphere {
    private Sphere() {
    }

    /**
     * Fills out (ow × oh pixels, ARGB; 0 where the ray misses) for the box
     * x, y, w, h of the view; tex: the map (tw × th ARGB); p: the command's
     * 20 extra numbers from offset at.
     */
    static void cast(int[] out, int ow, int oh, float x, float y, float w, float h,
                     int[] tex, int tw, int th, float[] p, int at) {
        float ex = p[at], ey = p[at + 1], ez = p[at + 2];
        float rx = p[at + 3], ry = p[at + 4], rz = p[at + 5];
        float ux = p[at + 6], uy = p[at + 7], uz = p[at + 8];
        float fx = p[at + 9], fy = p[at + 10], fz = p[at + 11];
        float sx = p[at + 12], sy = p[at + 13], sz = p[at + 14];
        float focal = p[at + 15], vw = p[at + 16], vh = p[at + 17];
        float night = p[at + 18];
        boolean lit = p[at + 19] > 0.5f;
        float day = 1 - night;
        float stepX = w / ow, stepY = h / oh;
        for (int j = 0; j < oh; j++) {
            float py = y + (j + 0.5f) * stepY - vh * 0.5f;
            // the ray for the row's first pixel, then step along `right`
            float bx = fx * focal - ux * py, by = fy * focal - uy * py, bz = fz * focal - uz * py;
            int row = j * ow;
            for (int i = 0; i < ow; i++) {
                float px = x + (i + 0.5f) * stepX - vw * 0.5f;
                float dx = bx + rx * px, dy = by + ry * px, dz = bz + rz * px;
                float inv = 1f / (float) Math.sqrt(dx * dx + dy * dy + dz * dz);
                dx *= inv;
                dy *= inv;
                dz *= inv;
                float b = ex * dx + ey * dy + ez * dz;
                float qx = ex - b * dx, qy = ey - b * dy, qz = ez - b * dz;
                float disc = 1 - (qx * qx + qy * qy + qz * qz);
                if (disc < 0) {
                    out[row + i] = 0;
                    continue;
                }
                float sq = (float) Math.sqrt(disc);
                if (-b < sq) {
                    out[row + i] = 0;
                    continue;
                }
                float nx = qx - sq * dx, ny = qy - sq * dy, nz = qz - sq * dz;
                float u = atan2(ny, nx) * 0.15915494f + 0.5f;
                float v = 0.5f - asin(Math.max(-1f, Math.min(1f, nz))) * 0.31830988f;
                int ti = (int) (u * tw);
                int tj = (int) (v * th);
                if (ti >= tw) ti = tw - 1;
                if (ti < 0) ti = 0;
                if (tj >= th) tj = th - 1;
                if (tj < 0) tj = 0;
                int c = tex[tj * tw + ti];
                if (lit) {
                    float s = nx * sx + ny * sy + nz * sz;
                    float k = smooth(-0.06f, 0.3f, s);
                    float l = (day + (1 - day) * k) * (0.8f + 0.2f * Math.max(s, 0));
                    int cr = (int) (((c >> 16) & 255) * l), cg = (int) (((c >> 8) & 255) * l), cb = (int) ((c & 255) * l);
                    c = 0xff000000 | (cr << 16) | (cg << 8) | cb;
                } else {
                    c |= 0xff000000;
                }
                out[row + i] = c;
            }
        }
    }

    private static float smooth(float a, float b, float v) {
        float t = Math.max(0, Math.min(1, (v - a) / (b - a)));
        return t * t * (3 - 2 * t);
    }

    /** atan2 to about 0.0002 rad, much faster than Math.atan2. */
    static float atan2(float y, float x) {
        float ax = Math.abs(x), ay = Math.abs(y);
        float mx = Math.max(ax, ay), mn = Math.min(ax, ay);
        if (mx == 0) return 0;
        float a = mn / mx;
        float s = a * a;
        float r = ((-0.0464964749f * s + 0.15931422f) * s - 0.327622764f) * s * a + a;
        if (ay > ax) r = 1.57079637f - r;
        if (x < 0) r = 3.14159274f - r;
        return y < 0 ? -r : r;
    }

    /** asin to about 0.0001 rad (Abramowitz and Stegun 4.4.46). */
    static float asin(float v) {
        float a = Math.abs(v);
        float r = 1.5707288f + a * (-0.2121144f + a * (0.0742610f + a * -0.0187293f));
        r = 1.57079637f - (float) Math.sqrt(1 - a) * r;
        return v < 0 ? -r : r;
    }
}
