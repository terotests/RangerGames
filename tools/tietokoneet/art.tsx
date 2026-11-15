
// ---- Tietokoneet: shared pictures (tools/tietokoneet/art.tsx, appended to the kit by sync.sh) ----

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

// a block arrow pointing `dir` (0 up, 1 right, 2 down, 3 left), about 2r long
export function Arrow(x: number, y: number, r: number, dir: number, color: string) {
  const p = [[0, -r], [r * 0.85, -r * 0.05], [r * 0.32, -r * 0.05], [r * 0.32, r], [-r * 0.32, r], [-r * 0.32, -r * 0.05], [-r * 0.85, -r * 0.05]];
  const pts = p.map((q) => [x + q[0], y + q[1]]);
  return Poly(turn(pts, x, y, dir * Math.PI / 2), color, "#ffffff", 2);
}

// the robot helper: a round head with an antenna, eyes that look `dir`
// (-1 straight ahead), mood "ok" | "happy" | "dizzy" | "sleep"; about 100 × 120 at s = 1
export function Robot(x: number, y: number, s: number, color: string, dir: number, mood: string) {
  const out: any[] = [];
  const bob = mood === "happy" ? Math.abs(Math.sin(K.t * 8)) * -6 * s : 0;
  y += bob;
  // antenna
  out.push(Line([[x, y - 44 * s], [x, y - 60 * s]], "#3d405b", Math.max(2, 4 * s)));
  out.push(Circle(x, y - 62 * s, 7 * s, mood === "dizzy" ? "#ef476f" : Math.sin(K.t * 6) > 0 ? "#ffd166" : "#ffb703"));
  // body and arms
  out.push(Box(x - 30 * s, y + 10 * s, 60 * s, 44 * s, color, 12 * s));
  const big = s >= 0.6;
  if (big) {
    out.push(Box(x - 16 * s, y + 20 * s, 32 * s, 18 * s, "rgba(255,255,255,0.55)", 6 * s));
    out.push(Circle(x - 8 * s, y + 29 * s, 4 * s, "#06d6a0"));
    out.push(Circle(x + 8 * s, y + 29 * s, 4 * s, mood === "dizzy" ? "#ef476f" : "#ffd166"));
  } else out.push(Box(x - 10 * s, y + 24 * s, 20 * s, 10 * s, "rgba(255,255,255,0.6)", 4 * s));
  // arms: turned (and waving when happy) on big robots, plain boxes on small ones
  if (big || mood === "happy") {
    const wave = mood === "happy" ? Math.sin(K.t * 10) * 0.6 : 0;
    out.push(Poly(turn(rect(x - 46 * s, y + 14 * s, 14 * s, 30 * s), x - 32 * s, y + 16 * s, 0.25 + wave), color, "#3d405b", Math.max(1, 2 * s)));
    out.push(Poly(turn(rect(x + 32 * s, y + 14 * s, 14 * s, 30 * s), x + 32 * s, y + 16 * s, -0.25 - wave), color, "#3d405b", Math.max(1, 2 * s)));
  } else {
    out.push(Box(x - 44 * s, y + 14 * s, 12 * s, 28 * s, color, 5 * s));
    out.push(Box(x + 32 * s, y + 14 * s, 12 * s, 28 * s, color, 5 * s));
  }
  // head
  out.push(Box(x - 38 * s, y - 46 * s, 76 * s, 56 * s, color, 18 * s));
  out.push(Box(x - 30 * s, y - 38 * s, 60 * s, 40 * s, "#e8f4ff", 12 * s));
  const lx = dir >= 0 ? DX[dir] * 5 * s : 0, ly = dir >= 0 ? DY[dir] * 4 * s : 0;
  if (mood === "dizzy") {
    for (const ex of [-13, 13]) {
      out.push(Line([[x + (ex - 6) * s, y - 24 * s], [x + (ex + 6) * s, y - 12 * s]], "#3d405b", Math.max(2, 3 * s)));
      out.push(Line([[x + (ex + 6) * s, y - 24 * s], [x + (ex - 6) * s, y - 12 * s]], "#3d405b", Math.max(2, 3 * s)));
    }
  } else if (mood === "sleep") {
    out.push(Line([[x - 19 * s, y - 18 * s], [x - 7 * s, y - 18 * s]], "#3d405b", Math.max(2, 3 * s)));
    out.push(Line([[x + 7 * s, y - 18 * s], [x + 19 * s, y - 18 * s]], "#3d405b", Math.max(2, 3 * s)));
  } else {
    out.push(Circle(x - 13 * s, y - 19 * s, 9 * s, "#ffffff", undefined));
    out.push(Circle(x + 13 * s, y - 19 * s, 9 * s, "#ffffff", undefined));
    out.push(Circle(x - 13 * s + lx, y - 19 * s + ly, 5 * s, "#1d3557"));
    out.push(Circle(x + 13 * s + lx, y - 19 * s + ly, 5 * s, "#1d3557"));
  }
  if (mood === "happy") out.push(Poly([[x - 10 * s, y - 6 * s], [x + 10 * s, y - 6 * s], [x + 6 * s, y], [x - 6 * s, y]], "#ef476f"));
  else if (mood === "dizzy") out.push(Circle(x, y - 3 * s, 4 * s, "#3d405b"));
  else out.push(Box(x - 8 * s, y - 5 * s, 16 * s, 3 * s, "#3d405b", 2 * s));
  return out;
}

// a battery with a lightning bolt, about 40 × 60 at s = 1
export function Battery(x: number, y: number, s: number) {
  const glow = 0.5 + Math.sin(K.t * 4) * 0.2;
  return [
    Circle(x, y, 34 * s, "rgba(255,209,102," + glow.toFixed(2) + ")"),
    Box(x - 8 * s, y - 32 * s, 16 * s, 8 * s, "#495057", 2 * s),
    Box(x - 18 * s, y - 26 * s, 36 * s, 54 * s, "#06d6a0", 7 * s),
    Box(x - 18 * s, y + 6 * s, 36 * s, 22 * s, "#04a77d", 7 * s),
    Poly([[x + 4 * s, y - 20 * s], [x - 10 * s, y + 3 * s], [x - 1 * s, y + 3 * s], [x - 5 * s, y + 22 * s], [x + 10 * s, y - 3 * s], [x + 1 * s, y - 3 * s]], "#ffd166", "#3d405b", 1),
  ];
}

// a coin, r = radius
export function Coin(x: number, y: number, r: number) {
  return [Circle(x, y, r, "#ffd166", "#e09f3e"), <div className="coinmark" style={{ left: x - r, top: y - r * 0.9, width: r * 2, height: r * 1.8, fontSize: Math.round(r * 1.2) }}>€</div>];
}
