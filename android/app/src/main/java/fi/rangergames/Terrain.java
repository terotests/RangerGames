// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

/**
 * Real heights on a textured globe (draw kind 8 with 40 numbers,
 * crates/rg_engine/src/draw.rs {@code sphere}), for the phone: the ground's
 * shape (the coarse height picture read bilinearly, plus the made-up bumps
 * and craters, the same formula as web/js/painter.js and the game's physics)
 * and, close by, a mesh of it round the point under the eye: rings at
 * distances growing by a constant factor (so the triangles are about the
 * same size on the screen), from the farthest in, so nearer hills cover
 * farther ones. The phone has no shader; the mesh is drawn with
 * Canvas.drawVertices, the map as its texture and the light in the vertex
 * colours. Plain Java (no Android classes), so it is tested on a desktop JVM.
 */
final class Terrain {
    // the shape picture's heights (0…1) and size
    private float[] shape;
    private int sw, sh;
    private int[] shapeSrc;
    // in radii: the heights of 0 and 1, the bumps' amplitude; lattice cells per radius; craters
    double lo, hi, amp, freq, crat;

    /** Takes the 40-number command's heights (from offset at) and the shape picture (ARGB). */
    void set(float[] p, int at, int[] shapePx, int w, int h) {
        lo = p[at + 32];
        hi = p[at + 33];
        amp = p[at + 34];
        freq = p[at + 37];
        crat = p[at + 38];
        if (shapePx != shapeSrc) {
            shapeSrc = shapePx;
            sw = w;
            sh = h;
            shape = new float[w * h];
            for (int i = 0; i < w * h; i++) {
                int c = shapePx[i];
                shape[i] = (((c >> 16) & 255) * 256 + ((c >> 8) & 255)) / 65535f;
            }
        }
    }

    static int hash(int x, int y, int z) {
        int h = (x * 0x8da6b343) ^ (y * 0xd8163841) ^ (z * 0xcb1ab31f);
        h ^= h >>> 16;
        h *= 0x7feb352d;
        h ^= h >>> 15;
        h *= 0x846ca68b;
        h ^= h >>> 16;
        return h;
    }

    private static double hv(int x, int y, int z) {
        return (hash(x, y, z) >>> 8) / 16777215.0;
    }

    static double vnoise(double x, double y, double z) {
        double fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
        int ix = (int) fx, iy = (int) fy, iz = (int) fz;
        double tx = x - fx, ty = y - fy, tz = z - fz;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        tz = tz * tz * (3 - 2 * tz);
        double a = mix(hv(ix, iy, iz), hv(ix + 1, iy, iz), tx), b = mix(hv(ix, iy + 1, iz), hv(ix + 1, iy + 1, iz), tx);
        double e = mix(hv(ix, iy, iz + 1), hv(ix + 1, iy, iz + 1), tx), g = mix(hv(ix, iy + 1, iz + 1), hv(ix + 1, iy + 1, iz + 1), tx);
        return mix(mix(a, b, ty), mix(e, g, ty), tz);
    }

    private static double mix(double a, double b, double t) {
        return a + (b - a) * t;
    }

    private static double smooth(double a, double b, double v) {
        double t = Math.max(0, Math.min(1, (v - a) / (b - a)));
        return t * t * (3 - 2 * t);
    }

    /** A made-up crater: at most one in each lattice cell (layer o), inside it; in radii. */
    static double crater(double px, double py, double pz, double f, int o) {
        double sh = (o & 1) != 0 ? 1 : 0;
        double x = px * f + 0.37 * sh, y = py * f + 0.61 * sh, z = pz * f + 0.19 * sh;
        double fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
        int cx = (int) fx, cy = (int) fy, cz = (int) fz;
        int h = hash(cx + 1000 * (o + 1), cy, cz);
        if ((h & 255) >= 170) return 0;
        int g = hash(cx, cy + 7919, cz + 31 * o);
        double jx = ((h >>> 8) & 255) / 255.0 * 0.5 + 0.25, jy = ((h >>> 16) & 255) / 255.0 * 0.5 + 0.25, jz = ((g >>> 8) & 255) / 255.0 * 0.5 + 0.25;
        double rr = 0.08 + 0.1 * (g & 255) / 255.0;
        double dx = x - fx - jx, dy = y - fy - jy, dz = z - fz - jz;
        double dd = Math.sqrt(dx * dx + dy * dy + dz * dz) / rr;
        if (dd >= 1.4) return 0;
        double b = dd < 1 ? 0.4 * (dd * dd - 1) + 0.08 * smooth(0.6, 1, dd) : 0.08 * (1 - smooth(1, 1.4, dd));
        return b * rr / f;
    }

    /** The bumps: five octaves of value noise and craters in three sizes (two layers each), in radii. */
    double bumps(double x, double y, double z) {
        if (amp <= 0) return 0;
        double s = 0, a = 1, f = freq;
        for (int k = 0; k < 5; k++) {
            s += a * (2 * vnoise(x * f, y * f, z * f) - 1);
            a *= 0.48;
            f *= 2.03;
        }
        double c = 0;
        if (crat > 0) {
            double cf = freq * 0.9;
            for (int k = 0; k < 3; k++) {
                c += crater(x, y, z, cf, 2 * k) + crater(x, y, z, cf, 2 * k + 1);
                cf *= 2.7;
            }
        }
        return s * amp + c * crat;
    }

    /** The ground's distance from the centre (radii) at the unit direction (x, y, z). */
    double ground(double x, double y, double z) {
        double u = Math.atan2(y, x) / (2 * Math.PI) + 0.5;
        double v = 0.5 - Math.asin(Math.max(-1, Math.min(1, z))) / Math.PI;
        double gx = u * sw - 0.5, gy = v * sh - 0.5;
        double fx = Math.floor(gx), fy = Math.floor(gy);
        double ax = gx - fx, ay = gy - fy;
        int i0 = (((int) fx % sw) + sw) % sw, i1 = (i0 + 1) % sw;
        int j0 = Math.max(0, Math.min(sh - 1, (int) fy)), j1 = Math.max(0, Math.min(sh - 1, (int) fy + 1));
        double top = shape[j0 * sw + i0] * (1 - ax) + shape[j0 * sw + i1] * ax;
        double bot = shape[j1 * sw + i0] * (1 - ax) + shape[j1 * sw + i1] * ax;
        return 1 + lo + (hi - lo) * (top * (1 - ay) + bot * ay) + bumps(x, y, z);
    }

    /** The highest the ground can be (radii from the centre). */
    double top() {
        return 1 + hi + 2 * amp + 0.05 * crat / Math.max(freq, 1e-9);
    }

    // ---- the mesh close by ----

    static final int RINGS = 40, SPOKES = 56;
    /** The mesh's output: per triangle three corners (screen x, y), texture u, v (0…1 of the map, u may pass 1) and colour. */
    float[] verts = new float[RINGS * SPOKES * 12];
    float[] texs = new float[RINGS * SPOKES * 12];
    int[] colors = new int[RINGS * SPOKES * 6];
    int count;          // vertices written (3 a triangle)
    /** the mesh reaches this angle (radians) from the point under the eye: the cast ball beyond it */
    double reach;
    // grid: positions (radii), screen points, light
    private final double[] gx = new double[(RINGS + 1) * (SPOKES + 1)], gy = new double[gx.length], gz = new double[gx.length];
    private final float[] sx = new float[gx.length], sy = new float[gx.length], gu = new float[gx.length], gv = new float[gx.length];
    private final boolean[] ok = new boolean[gx.length];
    private final float[] light = new float[gx.length];

    /**
     * Builds the mesh for the command's camera (p from offset at, draw.rs
     * {@code sphere}): x, y the box's corner in game units. Returns false
     * when the eye is not close.
     */
    boolean mesh(float[] p, int at) {
        count = 0;
        double ex = p[at], ey = p[at + 1], ez = p[at + 2];
        double rx = p[at + 3], ry = p[at + 4], rz = p[at + 5];
        double ux = p[at + 6], uy = p[at + 7], uz = p[at + 8];
        double fx = p[at + 9], fy = p[at + 10], fz = p[at + 11];
        double snx = p[at + 12], sny = p[at + 13], snz = p[at + 14];
        double focal = p[at + 15], vw = p[at + 16], vh = p[at + 17];
        double night = p[at + 18];
        boolean lit = p[at + 19] > 0.5f;
        double el = Math.sqrt(ex * ex + ey * ey + ez * ez);
        // the point under the eye and two directions across the ground there
        double cx = ex / el, cy = ey / el, cz = ez / el;
        double ax0 = -cy, ay0 = cx, az0 = 0;
        double al = Math.sqrt(ax0 * ax0 + ay0 * ay0);
        if (al < 1e-6) { ax0 = 1; ay0 = 0; al = 1; }
        ax0 /= al; ay0 /= al;
        double bx0 = cy * az0 - cz * ay0, by0 = cz * ax0 - cx * az0, bz0 = cx * ay0 - cy * ax0;
        // how far: past the ball's horizon by as far as the highest hills show
        double alt = Math.max(el - 1, 1e-7);
        double ht = top();
        reach = Math.min(0.6, Math.acos(Math.min(1, 1 / Math.max(el, 1))) + Math.acos(Math.min(1, 1 / ht)) + 0.002);
        double th0 = Math.max(alt * 0.15, 2e-7);
        if (reach <= th0 * 2) return false;
        double q = Math.pow(reach / th0, 1.0 / (RINGS - 1));
        // the spokes: the side the camera looks to (all round when it looks down)
        double ffx = fx - cx * (fx * cx + fy * cy + fz * cz), ffy = fy - cy * (fx * cx + fy * cy + fz * cz), ffz = fz - cz * (fx * cx + fy * cy + fz * cz);
        double fl = Math.sqrt(ffx * ffx + ffy * ffy + ffz * ffz);
        double down = -(fx * cx + fy * cy + fz * cz);
        double az = Math.atan2(ffx * bx0 + ffy * by0 + ffz * bz0, ffx * ax0 + ffy * ay0 + ffz * az0);
        double half = fl < 0.3 || down > 0.85 ? Math.PI : Math.min(Math.PI, Math.atan(vw * 0.5 / focal) + 1.0);
        double day = 1 - night;
        for (int i = 0; i <= RINGS; i++) {
            double th = i == 0 ? 0 : th0 * Math.pow(q, i - 1);
            double st = Math.sin(th), ct = Math.cos(th);
            for (int j = 0; j <= SPOKES; j++) {
                int k = i * (SPOKES + 1) + j;
                double ph = az - half + 2 * half * j / SPOKES;
                double cp = Math.cos(ph), sp = Math.sin(ph);
                double dx = ct * cx + st * (cp * ax0 + sp * bx0), dy = ct * cy + st * (cp * ay0 + sp * by0), dz = ct * cz + st * (cp * az0 + sp * bz0);
                double r = ground(dx, dy, dz);
                gx[k] = dx * r;
                gy[k] = dy * r;
                gz[k] = dz * r;
                double vx = gx[k] - ex, vy = gy[k] - ey, vz = gz[k] - ez;
                double zz = vx * fx + vy * fy + vz * fz;
                ok[k] = zz > 1e-9;
                if (ok[k]) {
                    sx[k] = (float) (vw * 0.5 + focal * (vx * rx + vy * ry + vz * rz) / zz);
                    sy[k] = (float) (vh * 0.5 - focal * (vx * ux + vy * uy + vz * uz) / zz);
                }
                gu[k] = (float) (Math.atan2(dy, dx) / (2 * Math.PI) + 0.5);
                gv[k] = (float) (0.5 - Math.asin(Math.max(-1, Math.min(1, dz))) / Math.PI);
            }
        }
        // the light at each corner: the ground's normal from its neighbours
        for (int i = 0; i <= RINGS; i++) {
            for (int j = 0; j <= SPOKES; j++) {
                int k = i * (SPOKES + 1) + j;
                int ia = Math.max(0, i - 1), ib = Math.min(RINGS, i + 1), ja = Math.max(0, j - 1), jb = Math.min(SPOKES, j + 1);
                if (i == 0) { ia = 1; ib = 2; }
                int k1 = ia * (SPOKES + 1) + j, k2 = ib * (SPOKES + 1) + j, k3 = i * (SPOKES + 1) + ja, k4 = i * (SPOKES + 1) + jb;
                double ax = gx[k2] - gx[k1], ay = gy[k2] - gy[k1], azz = gz[k2] - gz[k1];
                double bx = gx[k4] - gx[k3], by = gy[k4] - gy[k3], bz = gz[k4] - gz[k3];
                double nx = ay * bz - azz * by, ny = azz * bx - ax * bz, nz = ax * by - ay * bx;
                double nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
                double pl = Math.sqrt(gx[k] * gx[k] + gy[k] * gy[k] + gz[k] * gz[k]);
                double px = gx[k] / pl, py = gy[k] / pl, pz = gz[k] / pl;
                if (nl < 1e-15 || i == 0) { nx = px; ny = py; nz = pz; nl = 1; }
                nx /= nl; ny /= nl; nz /= nl;
                if (nx * px + ny * py + nz * pz < 0) { nx = -nx; ny = -ny; nz = -nz; }
                double l = 1;
                if (lit) {
                    double s = px * snx + py * sny + pz * snz;
                    double sn = nx * snx + ny * sny + nz * snz;
                    double kk = smooth(-0.04, 0.22, s) * Math.max(0, Math.min(1.6, sn / Math.max(s, 0.06)));
                    l = day + (1 - day) * Math.min(kk, 1.25);
                }
                light[k] = (float) l;
            }
        }
        // the triangles, the farthest ring first
        int n = 0;
        for (int i = RINGS - 1; i >= 0; i--) {
            for (int j = 0; j < SPOKES; j++) {
                int a = i * (SPOKES + 1) + j, b = a + 1, c = a + SPOKES + 1, d = c + 1;
                n = tri(n, a, c, d);
                if (i > 0) n = tri(n, a, d, b);
            }
        }
        count = n;
        return true;
    }

    private int tri(int n, int a, int b, int c) {
        if (!ok[a] || !ok[b] || !ok[c]) return n;
        // across longitude 180 the map's u jumps: keep the three together
        float ua = gu[a], ub = gu[b], uc = gu[c];
        float mx = Math.max(ua, Math.max(ub, uc));
        if (mx - Math.min(ua, Math.min(ub, uc)) > 0.5f) {
            if (ua < 0.5f) ua += 1;
            if (ub < 0.5f) ub += 1;
            if (uc < 0.5f) uc += 1;
        }
        int v = n * 2;
        verts[v] = sx[a]; verts[v + 1] = sy[a];
        verts[v + 2] = sx[b]; verts[v + 3] = sy[b];
        verts[v + 4] = sx[c]; verts[v + 5] = sy[c];
        texs[v] = ua; texs[v + 1] = gv[a];
        texs[v + 2] = ub; texs[v + 3] = gv[b];
        texs[v + 4] = uc; texs[v + 5] = gv[c];
        colors[n] = grey(light[a]);
        colors[n + 1] = grey(light[b]);
        colors[n + 2] = grey(light[c]);
        return n + 3;
    }

    private static int grey(float l) {
        int g = Math.max(0, Math.min(255, (int) (l * 255)));
        return 0xff000000 | (g << 16) | (g << 8) | g;
    }
}
