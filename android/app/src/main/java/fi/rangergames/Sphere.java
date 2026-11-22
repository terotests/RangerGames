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
        cast(out, ow, oh, x, y, w, h, tex, tw, th, p, at, false, null, 0, 0);
    }

    /**
     * With {@code more} the command has 32 numbers (draw.rs {@code sphere}):
     * the glowing air round the ball (25 its height in radii, 26-28 its
     * colour), city lights on the night side from lt (29 their strength) and
     * relief shading from the map's brightness (30). Rays that miss the ball
     * but pass through the air get the air's light with its alpha.
     */
    static void cast(int[] out, int ow, int oh, float x, float y, float w, float h,
                     int[] tex, int tw, int th, float[] p, int at, boolean more, int[] lt, int ltw, int lth) {
        cast(out, ow, oh, x, y, w, h, tex, tw, th, p, at, more, lt, ltw, lth, null, 0, 0, -2);
    }

    /**
     * With hm the command has 40 numbers (real heights, draw.rs {@code sphere}):
     * hm is the sharp height picture (ARGB, the height as red × 256 + green),
     * its true slopes shade the ground. meshCos > -2: the ground within the
     * angle whose cosine it is from the point under the eye is left empty
     * (Terrain's mesh is drawn there).
     */
    static void cast(int[] out, int ow, int oh, float x, float y, float w, float h,
                     int[] tex, int tw, int th, float[] p, int at, boolean more, int[] lt, int ltw, int lth,
                     int[] hm, int hw, int hh, double meshCos) {
        float ex = p[at], ey = p[at + 1], ez = p[at + 2];
        float rx = p[at + 3], ry = p[at + 4], rz = p[at + 5];
        float ux = p[at + 6], uy = p[at + 7], uz = p[at + 8];
        float fx = p[at + 9], fy = p[at + 10], fz = p[at + 11];
        float sx = p[at + 12], sy = p[at + 13], sz = p[at + 14];
        float focal = p[at + 15], vw = p[at + 16], vh = p[at + 17];
        float night = p[at + 18];
        boolean lit = p[at + 19] > 0.5f;
        float day = 1 - night;
        float air = more && p[at + 24] < 0.5f ? p[at + 25] : 0;
        float acr = more ? p[at + 26] : 0, acg = more ? p[at + 27] : 0, acb = more ? p[at + 28] : 0;
        float lgain = more ? p[at + 29] : 0, relief = more ? p[at + 30] : 0;
        float R = 1 + air;
        float stepX = w / ow, stepY = h / oh;
        // real heights: the picture's range and how much its slopes tilt the ground
        float hspan = hm != null ? p[at + 33] - p[at + 32] : 0, hrel = hm != null ? p[at + 36] : 0;
        float eyeL = (float) Math.sqrt(ex * ex + ey * ey + ez * ez);
        float cex = ex / eyeL, cey = ey / eyeL, cez = ez / eyeL;
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
                float q2 = qx * qx + qy * qy + qz * qz;
                float disc = 1 - q2;
                if (disc < 0 || -b < (float) Math.sqrt(disc)) {
                    // past the ball: the air's glow, if the ray goes through it
                    if (air > 0 && q2 < R * R && -b > 0) {
                        float hq = (float) Math.sqrt(q2);
                        glow(dx, dy, dz, qx / hq, qy / hq, qz / hq, sx, sy, sz, (hq - 1) / air, 2 * (float) Math.sqrt(R * R - q2), air, acr, acg, acb);
                        float a = gA;
                        if (a < 0.003f) {
                            out[row + i] = 0;
                        } else {
                            // premultiplied, as Android's bitmaps are
                            out[row + i] = ((int) (a * 255) << 24) | ((int) (Math.min(1, gR) * a * 255) << 16) | ((int) (Math.min(1, gG) * a * 255) << 8) | (int) (Math.min(1, gB) * a * 255);
                        }
                    } else {
                        out[row + i] = 0;
                    }
                    continue;
                }
                float sq = (float) Math.sqrt(disc);
                float nx = qx - sq * dx, ny = qy - sq * dy, nz = qz - sq * dz;
                if (meshCos > -2 && nx * cex + ny * cey + nz * cez > meshCos) {
                    out[row + i] = 0;
                    continue;
                }
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
                    float sn = s;
                    float k = smooth(-0.06f, 0.3f, s);
                    if (hm != null) {
                        // real heights: the sharp picture's slope east and north tilts the normal
                        int hi = (int) (u * hw), hj = (int) (v * hh);
                        float clat = Math.max(0.05f, (float) Math.sqrt(1 - nz * nz));
                        float hx = hspan * (height(hm, hw, hh, hi + 1, hj) - height(hm, hw, hh, hi - 1, hj)) / (2f / hw * 6.2831853f * clat);
                        float hy = hspan * (height(hm, hw, hh, hi, hj - 1) - height(hm, hw, hh, hi, hj + 1)) / (2f / hh * 3.1415927f);
                        float el2 = (float) Math.sqrt(nx * nx + ny * ny) + 1e-6f;
                        float ex2 = -ny / el2, ey2 = nx / el2;
                        float nox = -nz * ey2, noy = nz * ex2, noz = nx * ey2 - ny * ex2;
                        float mx = nx - hrel * (hx * ex2 + hy * nox), my = ny - hrel * (hx * ey2 + hy * noy), mz = nz - hrel * hy * noz;
                        float ml = (float) Math.sqrt(mx * mx + my * my + mz * mz);
                        sn = (mx * sx + my * sy + mz * sz) / ml;
                        k = smooth(-0.04f, 0.3f, s) * Math.max(0, Math.min(1.6f, sn / Math.max(s, 0.06f)));
                        k = Math.min(k, 1.25f);
                    } else if (relief != 0) {
                        // the map's brightness as height: its slope east and north tilts the normal
                        float clat = Math.max(0.05f, (float) Math.sqrt(1 - nz * nz));
                        float hx = (lum(tex, tw, th, ti + 1, tj) - lum(tex, tw, th, ti - 1, tj)) / (2f / tw * 6.2831853f * clat);
                        float hy = (lum(tex, tw, th, ti, tj - 1) - lum(tex, tw, th, ti, tj + 1)) / (2f / th * 3.1415927f);
                        float el = (float) Math.sqrt(nx * nx + ny * ny) + 1e-6f;
                        float ex2 = -ny / el, ey2 = nx / el;                       // east
                        float nox = -nz * ey2, noy = nz * ex2, noz = nx * ey2 - ny * ex2;   // north = p × east
                        float mx = nx - relief * (hx * ex2 + hy * nox), my = ny - relief * (hx * ey2 + hy * noy), mz = nz - relief * hy * noz;
                        float ml = (float) Math.sqrt(mx * mx + my * my + mz * mz);
                        sn = (mx * sx + my * sy + mz * sz) / ml;
                        k *= smooth(-0.25f, 0.2f, sn) * (0.55f + 0.45f * smooth(0f, 0.6f, sn / Math.max(s, 0.05f)));
                    }
                    float l = hm != null ? day + (1 - day) * k : (day + (1 - day) * k) * (0.8f + 0.2f * Math.max(sn, 0));
                    float cr = ((c >> 16) & 255) * l, cg = ((c >> 8) & 255) * l, cb = (c & 255) * l;
                    if (lt != null) {
                        // city lights on the night side
                        int li = Math.min(ltw - 1, Math.max(0, (int) (u * ltw))), lj = Math.min(lth - 1, Math.max(0, (int) (v * lth)));
                        int lc = lt[lj * ltw + li];
                        float kn = lgain * (1 - smooth(-0.12f, 0.06f, s));
                        cr += ((lc >> 16) & 255) * kn;
                        cg += ((lc >> 8) & 255) * kn * 0.88f;
                        cb += (lc & 255) * kn * 0.65f;
                    }
                    if (air > 0) {
                        // the air in front of the ground, thicker towards the rim
                        float t0 = -b - (float) Math.sqrt(Math.max(R * R - q2, 0)), t1 = -b - sq;
                        glow(dx, dy, dz, nx, ny, nz, sx, sy, sz, 0, Math.max(t1 - Math.max(t0, 0), 0), air, acr, acg, acb);
                        float a = gA * 0.85f;
                        cr = cr * (1 - a) + Math.min(1, gR) * 255 * a;
                        cg = cg * (1 - a) + Math.min(1, gG) * 255 * a;
                        cb = cb * (1 - a) + Math.min(1, gB) * 255 * a;
                    }
                    c = 0xff000000 | ((int) Math.min(255, cr) << 16) | ((int) Math.min(255, cg) << 8) | (int) Math.min(255, cb);
                } else {
                    c |= 0xff000000;
                }
                out[row + i] = c;
            }
        }
    }

    // the air's light along a ray (glow's result; the caster runs on one thread)
    private static float gR, gG, gB, gA;

    /** The same as airGlow in web/js/painter.js. lo: the ray's lowest point (unit). */
    private static void glow(float dx, float dy, float dz, float lx, float ly, float lz, float sx, float sy, float sz,
                             float alt, float len, float air, float cr, float cg, float cb) {
        float up = lx * sx + ly * sy + lz * sz;
        float day = smooth(-0.28f, 0.12f, up);
        float ds = Math.max(dx * sx + dy * sy + dz * sz, 0);
        float d2 = ds * ds, d4 = d2 * d2, d8 = d4 * d4;
        float fw = d8 * d2 * smooth(-0.45f, 0.02f, up);
        float dusk = smooth(-0.3f, -0.02f, up) * (1 - smooth(0f, 0.25f, up));
        float dens = (float) Math.exp(-alt * 4.5f) * (1 - alt);
        float depth = dens * len / (air * 2);
        gA = Math.max(0, Math.min(1, depth * (0.55f * day + 2.6f * fw + 0.25f * dusk)));
        float k = 0.7f + 0.6f * day;
        gR = cr * k + fw * 3f + dusk * 0.8f;
        gG = cg * k + 0.96f * fw * 3f + 0.55f * dusk * 0.8f;
        gB = cb * k + 0.9f * fw * 3f + 0.3f * dusk * 0.8f;
    }

    /** A height picture's value (0…1) at texel i, j (red × 256 + green). */
    private static float height(int[] hm, int hw, int hh, int i, int j) {
        i = ((i % hw) + hw) % hw;
        j = Math.max(0, Math.min(hh - 1, j));
        int c = hm[j * hw + i];
        return (((c >> 16) & 255) * 256 + ((c >> 8) & 255)) / 65535f;
    }

    private static float lum(int[] tex, int tw, int th, int i, int j) {
        i = ((i % tw) + tw) % tw;
        j = Math.max(0, Math.min(th - 1, j));
        int c = tex[j * tw + i];
        return (((c >> 16) & 255) * 0.3f + ((c >> 8) & 255) * 0.5f + (c & 255) * 0.2f) / 255f;
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
