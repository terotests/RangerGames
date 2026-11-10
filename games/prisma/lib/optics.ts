// Prisma's optics: light of one wavelength as a ray, refracted at every
// surface it meets by Snell's law (n1 sin a1 = n2 sin a2) or reflected inside
// when it cannot get out (total internal reflection).
//
// The refractive index depends on the wavelength (Cauchy: n = A + B / λ²,
// λ in micrometres), fitted to measured values: water n = 1.343 at 404 nm and
// 1.330 at 706 nm, crown glass (BK7) 1.530 and 1.513. Red bends least, violet
// most, and glass bends more than water. In a real 60° prism the colours fan
// out only by ~1.5° (glass), too narrow to see on a phone, so the spread
// around the yellow index is shown SPREAD times larger. The yellow index
// itself (how much the light turns) is the real one.
//
// Coordinates are the stage's pixels, y down.

export const SPREAD = 6;

export type Material = { id: string; A: number; B: number };

export const MATERIALS: { [k: string]: Material } = {
  air: { id: "air", A: 1.0003, B: 0 },
  water: { id: "water", A: 1.3237, B: 0.00315 },
  glass: { id: "glass", A: 1.5045, B: 0.0042 },
};

const YELLOW = 0.589;

// the real index of the material at wavelength nm
export function realIndex(m: Material, nm: number): number {
  const l = nm / 1000;
  return m.A + m.B / (l * l);
}

// the index the game uses: the real yellow index, the spread around it larger
export function indexOf(m: Material, nm: number): number {
  const ny = realIndex(m, YELLOW * 1000);
  return ny + (realIndex(m, nm) - ny) * SPREAD;
}

// a wavelength as an sRGB colour (after Dan Bruton's approximation), 0–255
export function waveRGB(nm: number): number[] {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else r = 1;
  // dimmer at the ends of the eye's range
  let f = 1;
  if (nm < 420) f = 0.35 + 0.65 * (nm - 380) / 40;
  else if (nm > 680) f = 0.35 + 0.65 * (750 - nm) / 70;
  const c = (v: number) => Math.round(255 * Math.pow(Math.max(0, v * f), 0.8));
  return [c(r), c(g), c(b)];
}

export function css(rgb: number[], a?: number): string {
  if (a === undefined) return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
  return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a.toFixed(2) + ")";
}

// a prism: an equilateral triangle around (cx, cy), side s, turned by rot
// degrees (0 = apex up)
export type Prism = { cx: number; cy: number; s: number; rot: number; mat: Material };

export function corners(p: Prism): number[][] {
  const r = p.s / Math.sqrt(3);
  const out: number[][] = [];
  for (let k = 0; k < 3; k++) {
    const a = (p.rot - 90 + k * 120) * Math.PI / 180;
    out.push([p.cx + Math.cos(a) * r, p.cy + Math.sin(a) * r]);
  }
  return out;
}

// a screen: a segment that catches the light
export type Screen = { x0: number; y0: number; x1: number; y1: number };

export type Hit = { x: number; y: number; along: number; screen: number };
export type Ray = { nm: number; pts: number[][]; hit: Hit | null; inside: number };

// where the ray from (ox,oy) along (dx,dy) meets the segment, or -1
function cross(ox: number, oy: number, dx: number, dy: number, ax: number, ay: number, bx: number, by: number): number[] {
  const ex = bx - ax, ey = by - ay;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return [-1, 0];
  const t = ((ax - ox) * ey - (ay - oy) * ex) / den;
  const u = ((ax - ox) * dy - (ay - oy) * dx) / den;
  if (t <= 1e-6 || u < 0 || u > 1) return [-1, 0];
  return [t, u];
}

// traces light of wavelength nm from (ox, oy) along angle deg (0 = right),
// through the prism to a screen or out of the stage (w × h)
export function trace(p: Prism, screens: Screen[], ox: number, oy: number, deg: number, nm: number, w: number, h: number): Ray {
  let dx = Math.cos(deg * Math.PI / 180), dy = Math.sin(deg * Math.PI / 180);
  let x = ox, y = oy;
  const pts: number[][] = [[x, y]];
  const cs = corners(p);
  const n = indexOf(p.mat, nm);
  let inGlass = false;
  let inside = 0;
  let hit: Hit | null = null;
  for (let step = 0; step < 12; step++) {
    let best = 1e9, kind = "", idx = -1, along = 0;
    for (let k = 0; k < 3; k++) {
      const a = cs[k], b = cs[(k + 1) % 3];
      const c = cross(x, y, dx, dy, a[0], a[1], b[0], b[1]);
      if (c[0] > 0 && c[0] < best) { best = c[0]; kind = "face"; idx = k; along = c[1]; }
    }
    if (!inGlass) {
      for (let k = 0; k < screens.length; k++) {
        const s = screens[k];
        const c = cross(x, y, dx, dy, s.x0, s.y0, s.x1, s.y1);
        if (c[0] > 0 && c[0] < best) { best = c[0]; kind = "screen"; idx = k; along = c[1]; }
      }
    }
    if (kind === "") {
      // out of the stage: to its edge
      let tEdge = 1e9;
      if (dx > 1e-9) tEdge = Math.min(tEdge, (w - x) / dx);
      if (dx < -1e-9) tEdge = Math.min(tEdge, (-x) / dx);
      if (dy > 1e-9) tEdge = Math.min(tEdge, (h - y) / dy);
      if (dy < -1e-9) tEdge = Math.min(tEdge, (-y) / dy);
      if (tEdge > 5000) tEdge = 5000;
      pts.push([x + dx * tEdge, y + dy * tEdge]);
      break;
    }
    x += dx * best; y += dy * best;
    pts.push([x, y]);
    if (kind === "screen") { hit = { x: x, y: y, along: along, screen: idx }; break; }
    // a face of the prism: its outward normal
    const a = cs[idx], b = cs[(idx + 1) % 3];
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const nl = Math.sqrt(nx * nx + ny * ny);
    nx /= nl; ny /= nl;
    if (nx * (x - p.cx) + ny * (y - p.cy) < 0) { nx = -nx; ny = -ny; }
    // the normal against the ray
    let cosi = -(dx * nx + dy * ny);
    let mx = nx, my = ny;
    if (cosi < 0) { cosi = -cosi; mx = -nx; my = -ny; }
    const eta = inGlass ? n : 1 / n;
    const k2 = 1 - eta * eta * (1 - cosi * cosi);
    if (k2 < 0) {
      // total internal reflection
      dx = dx + 2 * cosi * mx; dy = dy + 2 * cosi * my;
      inside++;
    } else {
      const f = eta * cosi - Math.sqrt(k2);
      dx = eta * dx + f * mx; dy = eta * dy + f * my;
      inGlass = !inGlass;
    }
    const dl = Math.sqrt(dx * dx + dy * dy);
    dx /= dl; dy /= dl;
    x += dx * 1e-4; y += dy * 1e-4;
  }
  return { nm: nm, pts: pts, hit: hit, inside: inside };
}

// the wavelengths a white light is traced with, red to violet
export function whiteWaves(count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(680 - (280 * i) / (count - 1));
  return out;
}

// how many degrees a ray turned from where it started
export function turned(r: Ray): number {
  if (r.pts.length < 3) return 0;
  const a = r.pts[0], b = r.pts[1];
  const c = r.pts[r.pts.length - 2], d = r.pts[r.pts.length - 1];
  const a0 = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const a1 = Math.atan2(d[1] - c[1], d[0] - c[0]);
  let da = (a1 - a0) * 180 / Math.PI;
  while (da > 180) da -= 360;
  while (da < -180) da += 360;
  return Math.abs(da);
}

// additive light: lamps' colours (0–1 each channel) summed on a dark wall
export function addLight(base: number[], lights: number[][]): number[] {
  const out = [base[0], base[1], base[2]];
  for (const l of lights) { out[0] += l[0] * 255; out[1] += l[1] * 255; out[2] += l[2] * 255; }
  return [Math.min(255, Math.round(out[0])), Math.min(255, Math.round(out[1])), Math.min(255, Math.round(out[2]))];
}

// a circle as a polygon
export function circle(cx: number, cy: number, r: number, n: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

// the part of polygon `subject` inside convex polygon `clip` (both counter-
// or clockwise alike; Sutherland–Hodgman)
export function clipPoly(subject: number[][], clip: number[][]): number[][] {
  let out = subject;
  // orientation of clip
  let area = 0;
  for (let i = 0; i < clip.length; i++) { const a = clip[i], b = clip[(i + 1) % clip.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const inside = (p: number[]) => sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j], prev = input[(j + input.length - 1) % input.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci !== pi) {
        const ex = cur[0] - prev[0], ey = cur[1] - prev[1];
        const fx = b[0] - a[0], fy = b[1] - a[1];
        const den = ex * fy - ey * fx;
        if (Math.abs(den) > 1e-12) {
          const t = ((a[0] - prev[0]) * fy - (a[1] - prev[1]) * fx) / den;
          out.push([prev[0] + ex * t, prev[1] + ey * t]);
        }
      }
      if (ci) out.push(cur);
    }
  }
  return out;
}
