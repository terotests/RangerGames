// lib/house.ts: the houses of Talot, as data. A house is six parts, one of
// each kind (base, walls, door, windows, roof, and a last touch on top or in
// the yard). The same numbers make both the 3D house (objects(), for
// rg.three) and its flat picture from the front (front(), for the picture
// cards and the part tiles), so a card always looks like the house built.
//
// World units: the house stands on the ground (y = 0) round the origin, its
// front towards +z. The gable roofs have their ridge from front to back, so
// the front shows the triangle of a child's drawing of a house.

export type Spec = { base: string; walls: string; door: string; win: string; roof: string; top: string; paint: string };
export const CATS = ["base", "walls", "door", "win", "roof", "top"];
export const OPTIONS: any = {
  base: ["kivi", "betoni", "kallio", "lumi", "puu"],
  walls: ["hirsi", "punainen", "keltainen", "kerros", "linna", "lumi", "maja"],
  door: ["puu", "valkoinen", "lasi", "kaari", "tunneli", "tikkaat"],
  win: ["pieni", "risti", "rivi", "kapea", "jaa", "pyorea"],
  roof: ["musta", "punainen", "vihrea", "tasa", "torni", "kupoli"],
  top: ["tiili", "kivi", "lippu", "antenni", "lumiukko", "pontto"],
};
// the model houses of the picture cards
export const HOUSES: any[] = [
  { id: "mokki", base: "kivi", walls: "hirsi", door: "puu", win: "pieni", roof: "vihrea", top: "kivi", paint: "" },
  { id: "punainen", base: "kivi", walls: "punainen", door: "valkoinen", win: "risti", roof: "musta", top: "tiili", paint: "" },
  { id: "kerros", base: "betoni", walls: "kerros", door: "lasi", win: "rivi", roof: "tasa", top: "antenni", paint: "" },
  { id: "linna", base: "kallio", walls: "linna", door: "kaari", win: "kapea", roof: "torni", top: "lippu", paint: "" },
  { id: "iglu", base: "lumi", walls: "lumi", door: "tunneli", win: "jaa", roof: "kupoli", top: "lumiukko", paint: "" },
  { id: "puumaja", base: "puu", walls: "maja", door: "tikkaat", win: "pyorea", roof: "punainen", top: "pontto", paint: "" },
];
export const PAINTS = ["#c0392b", "#f4d03f", "#5dade2", "#58d68d", "#f1948a", "#a569bd", "#f4f6f7", "#a0522d"];

const WALLS: any = {
  hirsi: { w: 2.4, h: 1.3, d: 1.8, c: "#9c6b3c" },
  punainen: { w: 2.4, h: 1.5, d: 1.8, c: "#a82c25" },
  keltainen: { w: 2.4, h: 1.5, d: 1.8, c: "#f2c14e" },
  kerros: { w: 2.2, h: 3.6, d: 1.8, c: "#e9dcc9" },
  linna: { w: 2.4, h: 1.7, d: 2.0, c: "#a3a8ad" },
  lumi: { w: 2.6, h: 0.55, d: 2.6, c: "#f2f7fc", round: true },
  maja: { w: 1.6, h: 1.0, d: 1.3, c: "#c8a165" },
};
const BASE_H: any = { kivi: 0.3, betoni: 0.15, kallio: 0.6, lumi: 0.25, puu: 2.5 };
const ROOF_C: any = { musta: "#3a3a3a", punainen: "#c0392b", vihrea: "#2e7d32" };
const GLASS = "#8fd3f4", WHITE = "#f8f9fa", DARK = "#2d3436";

export function empty(): Spec { return { base: "", walls: "", door: "", win: "", roof: "", top: "", paint: "" }; }
export function copy(s: Spec): Spec { return { base: s.base, walls: s.walls, door: s.door, win: s.win, roof: s.roof, top: s.top, paint: s.paint }; }
export function get(s: Spec, cat: string): string { return (s as any)[cat] || ""; }
export function set(s: Spec, cat: string, v: string) { (s as any)[cat] = v; }

// the sizes everything else is placed by
export type Dims = { w: number; h: number; d: number; y0: number; round: boolean; color: string; hr: number; k: number };
export function dims(s: Spec): Dims {
  const W = WALLS[s.walls || "punainen"];
  const y0 = s.base ? BASE_H[s.base] : 0;
  return { w: W.w, h: W.h, d: W.d, y0, round: !!W.round, color: s.paint || W.c, hr: W.w * 0.42, k: Math.min(1, W.w / 2.4) };
}

// how high the roof's top is at x (for the chimney and the aerial)
export function roofAt(s: Spec, x: number): number {
  const m = dims(s), top = m.y0 + m.h;
  if (ROOF_C[s.roof]) return top + m.hr * Math.max(0, 1 - Math.abs(x) / (m.w / 2));
  if (s.roof === "tasa") return top + 0.16;
  if (s.roof === "torni") return top;
  if (s.roof === "kupoli") { const r = m.w / 2; return top + Math.sqrt(Math.max(0, r * r - x * x)); }
  return top;
}
// the highest point of the house (for the camera)
export function tallness(s: Spec): number {
  const m = dims(s);
  let t = roofAt(s, 0);
  if (s.roof === "torni") t = m.y0 + m.h + (s.walls === "linna" ? 0.5 : 0) + (s.top === "lippu" ? 0.85 : 0.95);
  if (s.top === "lippu" || s.top === "antenni") t += 0.85;
  if (s.base === "puu") t = Math.max(t, 4.4);
  return t;
}

// ---- the windows: where they go -----------------------------------------------
// a slot: a point on a wall and the way the wall faces (ry: 0 front, π/2 right, π back, -π/2 left)
type Slot = { x: number; y: number; z: number; ry: number };
export function slots(s: Spec): Slot[] {
  const m = dims(s), out: Slot[] = [];
  if (m.round) {
    const r = m.w / 2 + 0.01, y = m.y0 + m.h * 0.5;
    for (const a of [-0.95, 0.95, 2.3, -2.3]) out.push({ x: Math.sin(a) * r, y, z: Math.cos(a) * r, ry: a });
    return out;
  }
  const rows = Math.max(1, Math.floor(m.h / 0.85)), many = s.win === "rivi";
  const fx = many ? [-0.34, 0, 0.34] : [-0.3, 0.3];
  const sz = many && m.d > 1.5 ? [-0.25, 0.25] : [0];
  for (let r = 0; r < rows; r++) {
    const y = m.y0 + (r + 0.56) * m.h / rows;
    for (const f of fx) {
      if (r === 0 && f === 0) continue;   // the door
      out.push({ x: f * m.w, y, z: m.d / 2 + 0.01, ry: 0 });
      out.push({ x: -f * m.w, y, z: -m.d / 2 - 0.01, ry: Math.PI });
    }
    for (const f of sz) {
      out.push({ x: m.w / 2 + 0.01, y, z: -f * m.d, ry: Math.PI / 2 });
      out.push({ x: -m.w / 2 - 0.01, y, z: f * m.d, ry: -Math.PI / 2 });
    }
  }
  return out;
}

// a window's size: a little smaller on small or low walls
function winScale(s: Spec): number {
  const m = dims(s), rows = Math.max(1, Math.floor(m.h / 0.85));
  return Math.min(m.k, (m.h / rows) / 0.95);
}

// ---- 3D ---------------------------------------------------------------------------
// one rg.three object: the 3D house is a list of these
export type Obj = { cat: string; id: string; shape: string; size: number[]; color: string; x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number; layer: number; detail: number; face: number; vis: boolean; deco: boolean };
// face: the way a thing on a wall faces (ry as in slots), 99 for none. A thin
// thing on a wall is drawn over the walls (a higher layer), so it must be hidden
// when its wall faces away from the camera: see visible().
export function visible(o: Obj, cam: number[]): boolean {
  if (o.face === 99) return true;
  // seen very much from the side (under ~12°) a wall's things are hidden too:
  // the castle's towers and the log ends would be drawn under them
  const dx = cam[0] - o.x, dz = cam[2] - o.z;
  return dx * Math.sin(o.face) + dz * Math.cos(o.face) > 0.2 * Math.sqrt(dx * dx + dz * dz);
}
// layers: walls 0, frames 1, glass 2, bars 3, roof 4, things on the roof 5
let list: Obj[] = [];
let curCat = "";
function add(shape: string, size: number[], color: string, x: number, y: number, z: number, o?: any) {
  const ob: Obj = { cat: curCat, id: "", shape, size, color, x, y, z, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, layer: 0, detail: 12, face: 99, vis: true, deco: false };
  if (o) for (const k of Object.keys(o)) (ob as any)[k] = o[k];
  list.push(ob);
}
// a flat thing on a wall at a slot: (u, v) offset along the wall and up, t thick
function onWall(sl: Slot, u: number, v: number, w: number, h: number, t: number, color: string, layer: number) {
  const c = Math.cos(sl.ry), sn = Math.sin(sl.ry);
  add("box", [w, h, t], color, sl.x + u * c, sl.y + v, sl.z - u * sn, { ry: sl.ry, layer, face: sl.ry });
}
function discOnWall(sl: Slot, v: number, r: number, color: string, layer: number, out: number) {
  const c = Math.cos(sl.ry), sn = Math.sin(sl.ry);
  add("cylinder", [r, r, 0.03], color, sl.x + sn * out, sl.y + v, sl.z + c * out, { rx: Math.PI / 2, ry: sl.ry, layer, detail: 14, face: sl.ry });
}

function base3(s: Spec, m: Dims) {
  const b = s.base;
  if (b === "kivi") {
    add("box", [m.w + 0.24, 0.3, m.d + 0.24], "#8d939b", 0, 0.15, 0);
    for (let i = 0; i < 4; i++) add("box", [0.34, 0.12, 0.03], "#6c737c", -m.w / 2 + 0.3 + i * (m.w - 0.4) / 3, 0.17, m.d / 2 + 0.125, { layer: 1, deco: true, face: 0 });
  } else if (b === "betoni") {
    add("box", [m.w + 1.0, 0.15, m.d + 1.0], "#c4c8cc", 0, 0.075, 0);
  } else if (b === "kallio") {
    add("box", [m.w + 1.3, 0.35, m.d + 1.2], "#7d756d", 0, 0.175, 0, { ry: 0.08 });
    add("box", [m.w + 0.5, 0.3, m.d + 0.45], "#958c83", 0.05, 0.45, 0);
    add("box", [0.8, 0.5, 0.7], "#857c74", m.w / 2 + 0.5, 0.25, m.d / 2 + 0.2, { ry: 0.5 });
  } else if (b === "lumi") {
    add("cylinder", [m.w * 0.78, m.w * 0.82, 0.25], "#f4f8fc", 0, 0.125, 0, { detail: 16 });
  } else if (b === "puu") {
    add("cylinder", [0.32, 0.42, 2.5], "#7a4f2a", 0, 1.25, -0.1, { detail: 10 });
    add("box", [0.18, 0.18, 1.2], "#7a4f2a", 0, 1.9, -0.6, { rx: 0.6 });
    // the crown behind the hut, drawn first (layer -1) so that it never covers the hut
    add("sphere", [1.15], "#43a047", -1.25, 3.3, -1.4, { detail: 10, layer: -1 });
    add("sphere", [1.0], "#66bb6a", 1.3, 3.5, -1.3, { detail: 10, layer: -1 });
    add("sphere", [1.0], "#4caf50", 0.0, 4.2, -1.6, { detail: 10, layer: -1 });
    add("box", [m.w + 0.6, 0.16, m.d + 0.6], "#a0703e", 0, 2.42, 0);
  }
}

function walls3(s: Spec, m: Dims) {
  const y = m.y0, W = m.w, D = m.d, H = m.h;
  if (m.round) {
    add("cylinder", [W / 2, W / 2, H], m.color, 0, y + H / 2, 0, { detail: 16 });
    return;
  }
  add("box", [W, H, D], m.color, 0, y + H / 2, 0);
  // the triangle under a gable roof is part of the walls
  if (ROOF_C[s.roof]) { curCat = "roof"; add("prism", [D, m.hr, W], m.color, 0, y + H, 0, { ry: Math.PI / 2 }); curCat = "walls"; }
  const w = s.walls;
  if (w === "hirsi") {
    // logs: a dark line between each, and the log ends crossing at the corners
    for (let i = 1; i < 6; i++) {
      const ly = y + i * H / 6;
      add("box", [W, 0.035, 0.02], "#6d4524", 0, ly, D / 2 + 0.01, { layer: 1, deco: true, face: 0 });
      add("box", [W, 0.035, 0.02], "#6d4524", 0, ly, -D / 2 - 0.01, { layer: 1, deco: true, face: Math.PI });
      add("box", [0.02, 0.035, D], "#6d4524", W / 2 + 0.01, ly, 0, { layer: 1, deco: true, face: Math.PI / 2 });
      add("box", [0.02, 0.035, D], "#6d4524", -W / 2 - 0.01, ly, 0, { layer: 1, deco: true, face: -Math.PI / 2 });
    }
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) add("box", [0.2, H, 0.2], "#86582f", cx * (W / 2 + 0.02), y + H / 2, cz * (D / 2 + 0.02));
  } else if (w === "punainen" || w === "keltainen") {
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) add("box", [0.13, H, 0.13], WHITE, cx * W / 2, y + H / 2, cz * D / 2);
  } else if (w === "kerros") {
    const rows = Math.max(1, Math.floor(H / 0.85));
    for (let i = 1; i < rows; i++) {
      const ly = y + i * H / rows;
      add("box", [W, 0.06, 0.02], "#c9b8a3", 0, ly, D / 2 + 0.01, { layer: 1, deco: true, face: 0 });
      add("box", [W, 0.06, 0.02], "#c9b8a3", 0, ly, -D / 2 - 0.01, { layer: 1, deco: true, face: Math.PI });
      add("box", [0.02, 0.06, D], "#c9b8a3", W / 2 + 0.01, ly, 0, { layer: 1, deco: true, face: Math.PI / 2 });
      add("box", [0.02, 0.06, D], "#c9b8a3", -W / 2 - 0.01, ly, 0, { layer: 1, deco: true, face: -Math.PI / 2 });
    }
  } else if (w === "linna") {
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) add("cylinder", [0.42, 0.42, H + 0.5], "#949aa0", cx * W / 2, y + (H + 0.5) / 2, cz * D / 2, { detail: 10 });
    const st = [[-0.6, 0.3], [0.5, 0.65], [-0.2, 0.9], [0.7, 0.2], [-0.75, 1.2], [0.2, 1.35]];
    for (const p of st) add("box", [0.26, 0.12, 0.02], "#8a9096", p[0] * W / 2 + 0.0, y + p[1] * H / 1.7, D / 2 + 0.01, { layer: 1, deco: true, face: 0 });
  } else if (w === "maja") {
    for (let i = 1; i < 5; i++) add("box", [0.025, H, 0.02], "#9c7a45", -W / 2 + i * W / 5, y + H / 2, D / 2 + 0.01, { layer: 1, deco: true, face: 0 });
  }
}

function door3(s: Spec, m: Dims) {
  const k = m.k, fz = m.round ? m.w / 2 : m.d / 2, y = m.y0;
  const dh = Math.min(0.85 * Math.max(k, 0.8), m.h * 0.8), dw = 0.5 * k;
  const d = s.door;
  if (d === "puu" || d === "valkoinen") {
    add("box", [dw + 0.1, dh + 0.05, 0.03], d === "puu" ? "#4a3220" : "#dee2e6", 0, y + (dh + 0.05) / 2, fz + 0.01, { layer: 1, face: 0 });
    add("box", [dw, dh, 0.05], d === "puu" ? "#7b4f2c" : WHITE, 0, y + dh / 2, fz + 0.02, { layer: 2, face: 0 });
    add("box", [0.06, 0.06, 0.06], "#f4c430", dw * 0.3, y + dh * 0.5, fz + 0.05, { layer: 3, face: 0 });
    if (d === "valkoinen") add("box", [dw * 0.6, dh * 0.3, 0.06], GLASS, 0, y + dh * 0.72, fz + 0.03, { layer: 3, face: 0 });
  } else if (d === "lasi") {
    add("box", [0.7 * k, 0.95, 0.03], "#5c636a", 0, y + 0.475, fz + 0.01, { layer: 1, face: 0 });
    add("box", [0.28 * k, 0.85, 0.05], GLASS, -0.16 * k, y + 0.45, fz + 0.02, { layer: 2, face: 0 });
    add("box", [0.28 * k, 0.85, 0.05], GLASS, 0.16 * k, y + 0.45, fz + 0.02, { layer: 2, face: 0 });
    add("box", [1.0 * k, 0.06, 0.4], "#5c636a", 0, y + 1.0, fz + 0.2, { layer: 3, face: 0 });
  } else if (d === "kaari") {
    const gw = 0.7 * k, gh = Math.min(0.75, m.h * 0.55);
    add("box", [gw + 0.16, gh, 0.03], "#7d8389", 0, y + gh / 2, fz + 0.01, { layer: 1, face: 0 });
    add("cylinder", [gw / 2 + 0.08, gw / 2 + 0.08, 0.03], "#7d8389", 0, y + gh, fz + 0.01, { rx: Math.PI / 2, layer: 1, face: 0, detail: 16 });
    add("box", [gw, gh, 0.05], "#5a3b22", 0, y + gh / 2, fz + 0.02, { layer: 2, face: 0 });
    add("cylinder", [gw / 2, gw / 2, 0.05], "#5a3b22", 0, y + gh, fz + 0.02, { rx: Math.PI / 2, layer: 2, face: 0, detail: 16 });
    for (let i = -1; i <= 1; i++) add("box", [0.035, gh + gw / 2, 0.07], "#3b2616", i * gw * 0.28, y + (gh + gw / 2) / 2, fz + 0.03, { layer: 3, face: 0 });
  } else if (d === "tunneli") {
    const r = 0.5;
    add("dome", [r], m.round ? m.color : "#eef5fb", 0, y, fz + 0.2, { sz: 1.5, detail: 12 });
    add("dome", [r * 0.62], "#2f3e4e", 0, y, fz + 0.2 + r * 1.5 - 0.02, { sz: 0.05, layer: 1, face: 0, detail: 12 });
  } else if (d === "tikkaat") {
    const hw = 0.45 * k, hh = Math.min(0.7, m.h * 0.75);
    add("box", [hw, hh, 0.03], "#3b2a1a", 0, y + hh / 2, fz + 0.01, { layer: 1, face: 0 });
    const top = y + 0.1, lz = fz + 0.45, n = Math.max(2, Math.round(top / 0.32));
    const tilt = Math.atan2(0.35, Math.max(0.4, top));
    for (const sx of [-1, 1]) add("box", [0.06, top + 0.2, 0.06], "#b5803f", sx * 0.24, (top + 0.2) / 2, lz - 0.15, { rx: -tilt, layer: 3, face: 0 });
    for (let i = 1; i <= n; i++) { const ry = i * top / (n + 0.5); add("box", [0.5, 0.05, 0.05], "#d19a52", 0, ry, lz - 0.15 - (ry - (top + 0.2) / 2) * Math.tan(tilt), { layer: 3, face: 0 }); }
  }
}

function win3(s: Spec, m: Dims) {
  const k = winScale(s), wt = s.win;
  for (const sl of slots(s)) {
    if (wt === "pieni" || wt === "rivi") {
      const w = (wt === "pieni" ? 0.42 : 0.38) * k, h = (wt === "pieni" ? 0.42 : 0.48) * k;
      onWall(sl, 0, 0, w + 0.1, h + 0.1, 0.03, WHITE, 1);
      onWall(sl, 0, 0, w, h, 0.05, GLASS, 2);
    } else if (wt === "risti") {
      const w = 0.52 * k, h = 0.6 * k;
      onWall(sl, 0, 0, w + 0.12, h + 0.12, 0.03, WHITE, 1);
      onWall(sl, 0, 0, w, h, 0.05, GLASS, 2);
      onWall(sl, 0, 0, w, 0.05, 0.07, WHITE, 3);
      onWall(sl, 0, 0, 0.05, h, 0.07, WHITE, 3);
    } else if (wt === "kapea") {
      onWall(sl, -0.12 * k, 0, 0.24 * k, 0.6 * k, 0.03, "#c9ccd0", 1);
      onWall(sl, 0.12 * k, 0, 0.24 * k, 0.6 * k, 0.03, "#c9ccd0", 1);
      onWall(sl, -0.12 * k, 0, 0.1 * k, 0.48 * k, 0.05, DARK, 2);
      onWall(sl, 0.12 * k, 0, 0.1 * k, 0.48 * k, 0.05, DARK, 2);
    } else if (wt === "jaa") {
      discOnWall(sl, 0, 0.22 * k, WHITE, 1, 0);
      discOnWall(sl, 0, 0.16 * k, "#bfefff", 2, 0.01);
    } else if (wt === "pyorea") {
      discOnWall(sl, 0, 0.25 * k, "#7b4f2c", 1, 0);
      discOnWall(sl, 0, 0.18 * k, GLASS, 2, 0.01);
      onWall(sl, 0, 0, 0.36 * k, 0.04, 0.07, "#7b4f2c", 3);
    }
  }
}

function roof3(s: Spec, m: Dims) {
  const top = m.y0 + m.h, W = m.w, D = m.d, r = s.roof;
  if (ROOF_C[r]) {
    // the two slopes, a bit over the walls all round, and a darker edge under them
    const half = W / 2 + 0.2, rise = m.hr * half / (W / 2), a = Math.atan2(rise, half), len = Math.sqrt(half * half + rise * rise);
    const y = top + m.hr + 0.05 - rise, edge = r === "musta" ? "#1f1f1f" : r === "punainen" ? "#8e2a1f" : "#1f5a24";
    add("roof", [D + 0.3, rise, half * 2], ROOF_C[r], 0, y, 0, { ry: Math.PI / 2, layer: 4 });
    add("roof", [D + 0.3, rise, half * 2], edge, 0, y - 0.1, 0, { ry: Math.PI / 2, layer: 3 });
    if (r === "punainen") for (let i = 1; i < 4; i++) for (const sd of [-1, 1]) add("box", [len, 0.03, 0.04], "#962d22", sd * half / 2, top + m.hr - rise / 2 + 0.07, -D / 2 - 0.15 + i * (D + 0.3) / 4, { rz: -sd * a, layer: 4, deco: true });
    add("box", [0.14, 0.12, D + 0.32], edge, 0, top + m.hr + 0.06, 0, { layer: 4 });
  } else if (r === "tasa") {
    add("box", [W + 0.2, 0.14, D + 0.2], "#6c757d", 0, top + 0.07, 0, { layer: 4 });
    add("box", [W - 0.1, 0.03, D - 0.1], "#495057", 0, top + 0.15, 0, { layer: 4 });
  } else if (r === "torni") {
    const tw = s.walls === "linna" ? 0.5 : 0, cr = s.walls === "linna" ? 0.52 : 0.32;
    if (!m.round) {
      const n = Math.round(W / 0.4);
      for (let i = 0; i < n; i += 2) {
        const x = -W / 2 + (i + 0.5) * W / n;
        add("box", [W / n, 0.22, 0.16], m.color, x, top + 0.11, D / 2 - 0.08, { layer: 4 });
        add("box", [W / n, 0.22, 0.16], m.color, x, top + 0.11, -D / 2 + 0.08, { layer: 4 });
      }
      const nz = Math.round(D / 0.4);
      for (let i = 0; i < nz; i += 2) {
        const z = -D / 2 + (i + 0.5) * D / nz;
        add("box", [0.16, 0.22, D / nz], m.color, W / 2 - 0.08, top + 0.11, z, { layer: 4 });
        add("box", [0.16, 0.22, D / nz], m.color, -W / 2 + 0.08, top + 0.11, z, { layer: 4 });
      }
    }
    const pts = m.round ? [[0, 0]] : [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const p of pts) add("cone", [cr, 0.95], "#2b59a3", p[0] * W / 2, top + tw + 0.475, p[1] * D / 2, { layer: 4, detail: 10 });
  } else if (r === "kupoli") {
    add("dome", [m.round ? W / 2 : Math.min(W, D) / 2], m.round ? m.color : "#dfe9f2", 0, top, 0, { layer: 4, detail: 16 });
  }
}

function top3(s: Spec, m: Dims) {
  const t = s.top, top = m.y0 + m.h;
  if (t === "tiili" || t === "kivi") {
    const x = m.w * 0.24, z = -m.d * 0.12, y = roofAt(s, x + 0.17) - 0.1, h = 0.9;
    const c = t === "tiili" ? "#a5402d" : "#7f8c8d", w = t === "tiili" ? 0.3 : 0.38;
    add("box", [w, h, w], c, x, y + h / 2, z, { layer: 5 });
    add("box", [w + 0.08, 0.08, w + 0.08], t === "tiili" ? "#7b2d1f" : "#5f6a6a", x, y + h, z, { layer: 5 });
    if (t === "tiili") for (let i = 1; i < 4; i++) add("box", [w + 0.01, 0.025, w + 0.01], "#e6d3c3", x, y + i * h / 4, z, { layer: 5, deco: true });
  } else if (t === "lippu") {
    let x = 0, y = roofAt(s, 0), z = 0;
    if (s.roof === "torni") { x = m.round ? 0 : m.w / 2; z = m.round ? 0 : m.d / 2; y = top + (s.walls === "linna" ? 0.5 : 0) + 0.85; }
    add("cylinder", [0.025, 0.025, 0.8], "#5c636a", x, y + 0.4, z, { layer: 5, detail: 6 });
    add("box", [0.45, 0.28, 0.02], "#e63946", x + 0.24, y + 0.64, z, { layer: 5 });
    add("box", [0.45, 0.07, 0.025], "#ffd166", x + 0.24, y + 0.64, z, { layer: 5 });
  } else if (t === "antenni") {
    const x = -m.w * 0.22, y = roofAt(s, x) - 0.05;
    add("cylinder", [0.025, 0.025, 0.75], "#5c636a", x, y + 0.375, 0, { layer: 5, detail: 6 });
    add("box", [0.6, 0.03, 0.03], "#5c636a", x, y + 0.55, 0, { layer: 5 });
    add("box", [0.4, 0.03, 0.03], "#5c636a", x, y + 0.7, 0, { layer: 5 });
    add("box", [0.5, 0.04, 0.34], "#1f3a5f", m.w * 0.15, y + 0.1, -m.d * 0.15, { rx: -0.5, layer: 5 });
  } else if (t === "lumiukko") {
    const x = m.w / 2 + 0.75, z = m.d / 2 + 0.35;
    add("sphere", [0.32], "#ffffff", x, 0.3, z, { detail: 10 });
    add("sphere", [0.24], "#ffffff", x, 0.78, z, { detail: 10 });
    add("sphere", [0.17], "#ffffff", x, 1.13, z, { detail: 10 });
    add("cone", [0.04, 0.2], "#f77f00", x, 1.14, z + 0.22, { rx: Math.PI / 2, layer: 1, detail: 6, face: 0 });
    add("cylinder", [0.13, 0.13, 0.2], "#222222", x, 1.36, z, { detail: 10 });
    add("cylinder", [0.2, 0.2, 0.03], "#222222", x, 1.26, z, { detail: 10 });
  } else if (t === "pontto") {
    const tree = s.base === "puu";
    const x = tree ? 0 : -m.w / 2 - 0.7, y = tree ? 1.35 : 1.1, z = tree ? 0.38 : m.d / 2 - 0.1;
    if (!tree) add("cylinder", [0.04, 0.04, y], "#6d4c2f", x, y / 2, z - 0.05, { detail: 6 });
    add("box", [0.3, 0.36, 0.28], "#e9c46a", x, y + 0.18, z + 0.1, { layer: tree ? 1 : 0, face: tree ? 0 : 99 });
    add("prism", [0.34, 0.16, 0.42], "#e76f51", x, y + 0.36, z + 0.1, { layer: tree ? 1 : 0, face: tree ? 0 : 99 });
    add("cylinder", [0.06, 0.06, 0.02], "#3b2616", x, y + 0.22, z + 0.25, { rx: Math.PI / 2, layer: tree ? 2 : 1, detail: 10, face: 0 });
  }
}

// the 3D objects of the parts in `cats` (the others are not built yet)
// dx, dz: where the house stands; lite: leave out the small decorations (log
// lines, stones, tiles) of a house far away in the village
export function objects(s: Spec, cats: string[], prefix: string, dx: number, dz?: number, lite?: boolean): Obj[] {
  list = [];
  const m = dims(s);
  const has = (c: string) => cats.indexOf(c) >= 0 && get(s, c) !== "";
  const steps: any = { base: base3, walls: walls3, door: door3, win: win3, roof: roof3, top: top3 };
  for (const c of CATS) {
    if (!has(c)) continue;
    curCat = c;
    // the gable triangle belongs to the walls only once there is a gable roof
    const ss = c === "walls" && !has("roof") ? withRoof(s, "") : s;
    steps[c](ss, m);
  }
  if (lite) list = list.filter((o) => !o.deco);
  const z0 = dz || 0;
  list.forEach((o, i) => { o.id = prefix + o.cat + i; o.x += dx; o.z += z0; });
  return list;
}
function withRoof(s: Spec, r: string): Spec { const c = copy(s); c.roof = r; return c; }

// ---- 2D: the house from the front --------------------------------------------------
// a picture is a list of polygons [points, colour] in screen pixels; (cx, by)
// is the middle of the ground line and u pixels a world unit
export type Pic = { pts: number[][]; c: string; e: string };
let pic: Pic[] = [];
let PX = 0, PY = 0, PU = 20;
function P(x: number, y: number): number[] { return [PX + x * PU, PY - y * PU]; }
function poly(pts: number[][], c: string, e?: string) { pic.push({ pts: pts.map((p) => P(p[0], p[1])), c, e: e || "" }); }
function rect(x: number, y: number, w: number, h: number, c: string, e?: string) { poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], c, e); }
function circ(x: number, y: number, r: number, c: string, e?: string, from?: number, to?: number) {
  const a0 = from === undefined ? 0 : from, a1 = to === undefined ? Math.PI * 2 : to, n = 16, out: number[][] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  poly(out, c, e);
}

function base2(s: Spec, m: Dims) {
  const b = s.base;
  if (b === "kivi") {
    rect(-m.w / 2 - 0.12, 0, m.w + 0.24, 0.3, "#8d939b", "#6c737c");
    for (let i = 0; i < 4; i++) rect(-m.w / 2 + 0.13 + i * (m.w - 0.4) / 3, 0.11, 0.34, 0.12, "#6c737c");
  }
  else if (b === "betoni") rect(-m.w / 2 - 0.5, 0, m.w + 1.0, 0.15, "#c4c8cc", "#9aa0a6");
  else if (b === "kallio") { poly([[-m.w / 2 - 0.8, 0], [m.w / 2 + 0.9, 0], [m.w / 2 + 0.4, 0.45], [m.w / 2 + 0.25, 0.6], [-m.w / 2 - 0.25, 0.6], [-m.w / 2 - 0.55, 0.35]], "#857c74", "#6b635c"); }
  else if (b === "lumi") poly([[-m.w * 0.82, 0], [m.w * 0.82, 0], [m.w * 0.78, 0.25], [-m.w * 0.78, 0.25]], "#f4f8fc", "#c9d6e3");
  else if (b === "puu") {
    circ(-1.25, 3.3, 1.15, "#43a047"); circ(1.3, 3.5, 1.0, "#66bb6a"); circ(0, 4.2, 1.0, "#4caf50");
    poly([[-0.42, 0], [0.42, 0], [0.32, 2.5], [-0.32, 2.5]], "#7a4f2a");
    rect(-m.w / 2 - 0.3, 2.34, m.w + 0.6, 0.16, "#a0703e", "#7a5430");
  }
}

function walls2(s: Spec, m: Dims, gable: boolean) {
  const y = m.y0, W = m.w, H = m.h;
  if (s.walls === "linna") for (const sx of [-1, 1]) rect(sx * W / 2 - 0.42, y, 0.84, H + 0.5, "#949aa0", "#7d8389");
  rect(-W / 2, y, W, H, m.color, "#00000033");
  if (gable && !m.round) poly([[-W / 2, y + H], [W / 2, y + H], [0, y + H + m.hr]], m.color, "#00000033");
  if (s.walls === "hirsi") {
    for (let i = 1; i < 6; i++) rect(-W / 2, y + i * H / 6 - 0.02, W, 0.04, "#6d4524");
    for (const sx of [-1, 1]) rect(sx * (W / 2 + 0.02) - 0.1, y, 0.2, H, "#86582f");
  } else if (s.walls === "punainen" || s.walls === "keltainen") {
    for (const sx of [-1, 1]) rect(sx * W / 2 - 0.065, y, 0.13, H, WHITE);
  } else if (s.walls === "kerros") {
    const rows = Math.max(1, Math.floor(H / 0.85));
    for (let i = 1; i < rows; i++) rect(-W / 2, y + i * H / rows - 0.03, W, 0.06, "#c9b8a3");
  } else if (s.walls === "maja") {
    for (let i = 1; i < 5; i++) rect(-W / 2 + i * W / 5 - 0.012, y, 0.025, H, "#9c7a45");
  } else if (s.walls === "linna") {
    const st = [[-0.6, 0.3], [0.5, 0.65], [-0.2, 0.9], [0.7, 0.2], [-0.75, 1.2], [0.2, 1.35]];
    for (const p of st) rect(p[0] * W / 2 - 0.13, y + p[1] * H / 1.7 - 0.06, 0.26, 0.12, "#8a9096");
  }
}

function door2(s: Spec, m: Dims) {
  const k = m.k, y = m.y0, d = s.door;
  const dh = Math.min(0.85 * Math.max(k, 0.8), m.h * 0.8), dw = 0.5 * k;
  if (d === "puu" || d === "valkoinen") {
    rect(-dw / 2 - 0.05, y, dw + 0.1, dh + 0.05, d === "puu" ? "#4a3220" : "#dee2e6");
    rect(-dw / 2, y, dw, dh, d === "puu" ? "#7b4f2c" : WHITE, "#00000033");
    if (d === "valkoinen") rect(-dw * 0.3, y + dh * 0.57, dw * 0.6, dh * 0.3, GLASS);
    circ(dw * 0.3, y + dh * 0.5, 0.04, "#f4c430");
  } else if (d === "lasi") {
    rect(-0.35 * k, y, 0.7 * k, 0.95, "#5c636a");
    rect(-0.3 * k, y, 0.28 * k, 0.85, GLASS); rect(0.02 * k, y, 0.28 * k, 0.85, GLASS);
    rect(-0.5 * k, y + 0.97, 1.0 * k, 0.07, "#5c636a");
  } else if (d === "kaari") {
    const gw = 0.7 * k, gh = Math.min(0.75, m.h * 0.55);
    circ(0, y + gh, gw / 2 + 0.08, "#7d8389", "", 0, Math.PI); rect(-gw / 2 - 0.08, y, gw + 0.16, gh, "#7d8389");
    circ(0, y + gh, gw / 2, "#5a3b22", "", 0, Math.PI); rect(-gw / 2, y, gw, gh, "#5a3b22");
    for (let i = -1; i <= 1; i++) rect(i * gw * 0.28 - 0.018, y, 0.035, gh + gw / 2 - 0.05, "#3b2616");
  } else if (d === "tunneli") {
    circ(0, y, 0.5, m.round ? m.color : "#eef5fb", "#c9d6e3", 0, Math.PI);
    circ(0, y, 0.31, "#2f3e4e", "", 0, Math.PI);
  } else if (d === "tikkaat") {
    const hw = 0.45 * k, hh = Math.min(0.7, m.h * 0.75);
    rect(-hw / 2, y, hw, hh, "#3b2a1a");
    const top = y + 0.1;
    for (const sx of [-1, 1]) rect(sx * 0.24 - 0.03, 0, 0.06, top + 0.2, "#b5803f");
    const n = Math.max(2, Math.round(top / 0.32));
    for (let i = 1; i <= n; i++) rect(-0.25, i * top / (n + 0.5) - 0.025, 0.5, 0.05, "#d19a52");
  }
}

function win2(s: Spec, m: Dims) {
  const k = winScale(s), wt = s.win;
  for (const sl of slots(s)) {
    if (Math.abs(sl.ry) > 1.2) continue;     // only the front
    const x = sl.x * (m.round ? 1 : 1), y = sl.y, sq = m.round ? Math.cos(sl.ry) : 1;
    if (wt === "pieni" || wt === "rivi") {
      const w = (wt === "pieni" ? 0.42 : 0.38) * k, h = (wt === "pieni" ? 0.42 : 0.48) * k;
      rect(x - (w / 2 + 0.05) * sq, y - h / 2 - 0.05, (w + 0.1) * sq, h + 0.1, WHITE);
      rect(x - w / 2 * sq, y - h / 2, w * sq, h, GLASS);
    } else if (wt === "risti") {
      const w = 0.52 * k, h = 0.6 * k;
      rect(x - (w / 2 + 0.06) * sq, y - h / 2 - 0.06, (w + 0.12) * sq, h + 0.12, WHITE);
      rect(x - w / 2 * sq, y - h / 2, w * sq, h, GLASS);
      rect(x - w / 2 * sq, y - 0.025, w * sq, 0.05, WHITE); rect(x - 0.025, y - h / 2, 0.05, h, WHITE);
    } else if (wt === "kapea") {
      for (const o of [-0.12, 0.12]) { rect(x + o * k * sq - 0.12 * k * sq, y - 0.3 * k, 0.24 * k * sq, 0.6 * k, "#c9ccd0"); rect(x + o * k * sq - 0.05 * k * sq, y - 0.24 * k, 0.1 * k * sq, 0.48 * k, DARK); }
    } else if (wt === "jaa") {
      circ(x, y, 0.22 * k, WHITE); circ(x, y, 0.16 * k, "#bfefff");
    } else if (wt === "pyorea") {
      circ(x, y, 0.25 * k, "#7b4f2c"); circ(x, y, 0.18 * k, GLASS); rect(x - 0.18 * k, y - 0.02, 0.36 * k, 0.04, "#7b4f2c");
    }
  }
}

function roof2(s: Spec, m: Dims) {
  const top = m.y0 + m.h, W = m.w, r = s.roof;
  if (ROOF_C[r]) {
    const half = W / 2 + 0.2, rise = m.hr * half / (W / 2), t = 0.13;
    const apex = top + m.hr + 0.05;
    poly([[-half, apex - rise], [0, apex], [half, apex - rise], [half, apex - rise + t], [0, apex + t * 1.2], [-half, apex - rise + t]], ROOF_C[r], "#00000055");
  } else if (r === "tasa") {
    rect(-W / 2 - 0.1, top, W + 0.2, 0.15, "#6c757d");
  } else if (r === "torni") {
    const tw = s.walls === "linna" ? 0.5 : 0, cr = s.walls === "linna" ? 0.52 : 0.32;
    if (!m.round) { const n = Math.round(W / 0.4); for (let i = 0; i < n; i += 2) rect(-W / 2 + i * W / n, top, W / n, 0.22, m.color, "#00000033"); }
    const xs = m.round ? [0] : [-W / 2, W / 2];
    for (const x of xs) poly([[x - cr, top + tw], [x + cr, top + tw], [x, top + tw + 0.95]], "#2b59a3", "#1d3f75");
  } else if (r === "kupoli") {
    const rr = m.round ? W / 2 : Math.min(W, m.d) / 2;
    circ(0, top, rr, m.round ? m.color : "#dfe9f2", "#c9d6e3", 0, Math.PI);
    if (m.round) for (let i = 1; i < 3; i++) { const yy = top + rr * i / 3, hw = Math.sqrt(rr * rr - (rr * i / 3) * (rr * i / 3)); rect(-hw, yy - 0.015, hw * 2, 0.03, "#c9d6e3"); }
  }
}

function top2(s: Spec, m: Dims, back: boolean) {
  const t = s.top, top = m.y0 + m.h;
  if ((t === "tiili" || t === "kivi") && back) {
    const x = m.w * 0.24, y = roofAt(s, x + 0.17) - 0.1, h = 0.9, w = t === "tiili" ? 0.3 : 0.38;
    rect(x - w / 2, y, w, h, t === "tiili" ? "#a5402d" : "#7f8c8d", "#00000044");
    rect(x - w / 2 - 0.04, y + h - 0.04, w + 0.08, 0.08, t === "tiili" ? "#7b2d1f" : "#5f6a6a");
  } else if (t === "lippu" && back) {
    let x = 0, y = roofAt(s, 0);
    if (s.roof === "torni") { x = m.round ? 0 : m.w / 2; y = top + (s.walls === "linna" ? 0.5 : 0) + 0.85; }
    rect(x - 0.02, y, 0.04, 0.8, "#5c636a");
    rect(x + 0.02, y + 0.5, 0.45, 0.28, "#e63946"); rect(x + 0.02, y + 0.605, 0.45, 0.07, "#ffd166");
  } else if (t === "antenni" && back) {
    const x = -m.w * 0.22, y = roofAt(s, x) - 0.05;
    rect(x - 0.02, y, 0.04, 0.75, "#5c636a"); rect(x - 0.3, y + 0.53, 0.6, 0.04, "#5c636a"); rect(x - 0.2, y + 0.68, 0.4, 0.04, "#5c636a");
  } else if (t === "lumiukko" && !back) {
    const x = m.w / 2 + 0.75;
    circ(x, 0.3, 0.32, "#ffffff", "#c9d6e3"); circ(x, 0.78, 0.24, "#ffffff", "#c9d6e3"); circ(x, 1.13, 0.17, "#ffffff", "#c9d6e3");
    poly([[x, 1.16], [x + 0.2, 1.13], [x, 1.1]], "#f77f00");
    rect(x - 0.13, 1.27, 0.26, 0.2, "#222222"); rect(x - 0.2, 1.25, 0.4, 0.04, "#222222");
  } else if (t === "pontto" && !back) {
    const tree = s.base === "puu";
    const x = tree ? 0 : -m.w / 2 - 0.7, y = tree ? 1.35 : 1.1;
    if (!tree) rect(x - 0.04, 0, 0.08, y, "#6d4c2f");
    rect(x - 0.15, y, 0.3, 0.36, "#e9c46a", "#00000033");
    poly([[x - 0.21, y + 0.34], [x + 0.21, y + 0.34], [x, y + 0.52]], "#e76f51");
    circ(x, y + 0.22, 0.06, "#3b2616");
  }
}

// the picture of the parts in `cats`; `ghost`: the other parts as a pale outline
export function front(s: Spec, cats: string[], cx: number, by: number, u: number, ghost: boolean): Pic[] {
  pic = []; PX = cx; PY = by; PU = u;
  const m = dims(s);
  const has = (c: string) => cats.indexOf(c) >= 0 && get(s, c) !== "";
  if (ghost && !has("walls") && s.walls) {
    rect(-m.w / 2, m.y0, m.w, m.h, "#ffffff55", "#00000022");
  }
  if (has("base")) base2(s, m);
  if (has("top")) top2(s, m, true);
  if (has("walls")) walls2(s, m, has("roof") && !!ROOF_C[s.roof]);
  if (has("roof")) roof2(s, m);
  if (has("win")) win2(s, m);
  if (has("door")) door2(s, m);
  if (has("top")) top2(s, m, false);
  return pic;
}
// the size of the picture in world units: [left, right, top] (for fitting it in a box)
export function extent(s: Spec): number[] {
  const m = dims(s);
  let l = -m.w / 2 - 0.3, r = m.w / 2 + 0.3;
  if (s.base === "puu") { l = Math.min(l, -2.4); r = Math.max(r, 2.3); }
  if (s.base === "betoni" || s.base === "kallio") { l = Math.min(l, -m.w / 2 - 0.8); r = Math.max(r, m.w / 2 + 0.9); }
  if (s.top === "lumiukko") r = Math.max(r, m.w / 2 + 1.1);
  if (s.top === "pontto" && s.base !== "puu") l = Math.min(l, -m.w / 2 - 0.95);
  if (s.top === "lippu") r = Math.max(r, (s.roof === "torni" ? m.w / 2 : 0) + 0.5);
  return [l, r, tallness(s)];
}

// where a person stands in front of the door, before going in (from the house's middle)
export function doorFront(s: Spec): number[] {
  const m = dims(s), fz = m.round ? m.w / 2 : m.d / 2;
  return [0, fz + (s.door === "tunneli" ? 1.1 : s.door === "tikkaat" ? 0.65 : 0.35)];
}
