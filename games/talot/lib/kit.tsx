// GENERATED from tools/rakennus/kit.tsx by tools/rakennus/sync.sh: edit that file, not this copy.
// lib/kit.tsx: what the Rakennuspelit games (section "rakennus") share.
// The source is tools/rakennus/kit.tsx; tools/rakennus/sync.sh copies it into
// each game as lib/kit.tsx (and kit.css as style.css), because a game can only
// import files from its own folder.
//
// The games are for 5-year-olds who do not read yet, so they follow the
// pedagogue review's rules: everything is said aloud (rg.say), the menus are
// pictures, a miss is never a dead end (the first miss says "try again", the
// second one gives the hint and shows it), and each level adapts in three
// steps: three right first tries in a row go one step up, two misses in a row
// one step down (saved as rg.save "steps").
export type Level = { name: string; color: string; say: string; pic: (x: number, y: number, s: number) => any[] };
type Spark = { x: number; y: number; vx: number; vy: number; t: number; c: string };

export const K: any = {
  t: 0, mode: "menu", level: 0, levels: [], round: 6, steps: [], best: [],
  question: 0, right: 0, firstTry: true, misses: 0, solved: -1, streak: 0, missRow: 0,
  stepMsg: -10, stepUp: true, sparks: [], praiseN: 0, next: null, wait: 1.8, title: "",
};
export const STEPS = 3;
const SPARK = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#ffffff"];
const PRAISE = ["hyva", "hienoa", "mahtavaa", "oikein", "loistavaa", "jee", "taitava", "osaat"];

function fill(arr: number[], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(arr && i < arr.length ? arr[i] : 0);
  return out;
}

// levels, questions in a round, and the game's function that sets up a question
export function setup(title: string, levels: Level[], round: number, next: () => void) {
  K.title = title;
  K.levels = levels;
  K.round = round;
  K.next = next;
  K.best = fill(rg.load("best", []), levels.length);
  K.steps = fill(rg.load("steps", []), levels.length);
}

export function step(): number { return K.steps[K.level]; }

export function start(i: number) {
  K.level = i;
  K.question = 0;
  K.right = 0;
  K.streak = 0;
  K.missRow = 0;
  K.stepMsg = -10;
  K.mode = "play";
  rg.sound("click");
  question();
}

// a new question: the game's next() sets it up
export function question() {
  K.firstTry = true;
  K.misses = 0;
  K.solved = -1;
  K.next();
}

function setStep(d: number) {
  const s = Math.max(0, Math.min(STEPS - 1, K.steps[K.level] + d));
  K.streak = 0;
  K.missRow = 0;
  if (s === K.steps[K.level]) return;
  K.steps[K.level] = s;
  rg.save("steps", K.steps);
  K.stepMsg = K.t;
  K.stepUp = d > 0;
}

export function praise(): string { K.praiseN++; return PRAISE[K.praiseN % PRAISE.length]; }

export function burst(x: number, y: number, n: number) {
  for (let k = 0; k < n; k++) {
    const a = rg.random() * Math.PI * 2, sp = 80 + rg.random() * 220;
    K.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, t: 0, c: rg.pick(SPARK) });
  }
}

// the question is solved: stars, praise, and the next question after a while
export function win(x: number, y: number, say?: string[]) {
  if (K.solved >= 0) return;
  K.solved = K.t;
  if (K.firstTry) { K.right++; K.streak++; K.missRow = 0; }
  rg.celebrate(x, y, { sound: false });
  rg.sound(K.firstTry ? "star" : "coin");
  rg.vibrate(40);
  rg.say((say || []).concat([praise()]));
  burst(x, y, 22);
  if (K.streak >= 3) setStep(1);
}

// a miss: returns how many misses this question has had (1 = say "try
// again", 2 or more = give the hint)
export function miss(): number {
  if (K.firstTry) { K.missRow++; K.streak = 0; if (K.missRow >= 2) setStep(-1); }
  K.firstTry = false;
  K.misses++;
  rg.sound("wrong");
  rg.vibrate(60);
  return K.misses;
}

export function update(dt: number) {
  K.t += dt;
  for (const s of K.sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 500 * dt; }
  K.sparks = K.sparks.filter((s: Spark) => s.t < 1.2);
  if (K.mode === "play" && K.solved >= 0 && K.t - K.solved > K.wait) {
    K.question++;
    if (K.question >= K.round) {
      K.mode = "done";
      const r = K.right;
      if (r > K.best[K.level]) { K.best[K.level] = r; rg.save("best", K.best); }
      if (r >= K.round - 2) rg.celebrate(width / 2, height * 0.3, { big: true }); else rg.sound("coin");
      rg.say(r >= 2 ? [r >= K.round - 1 ? "mahtavaa" : r >= K.round / 2 ? "hienoa" : "hyvin_meni", "sait", rg.sayId.number(r), "tahtea"] : ["hyvin_meni"]);
    } else question();
  }
}

export function toMenu() { K.mode = "menu"; rg.sound("click"); rg.three("clear"); }

export function back() { if (K.mode === "menu") rg.exit(); else toMenu(); }

// ---- drawing helpers: polygons in screen coordinates ------------------------

const FULL: any = { position: "absolute", left: 0, top: 0 };
function full() { return { position: "absolute", left: 0, top: 0, width, height }; }
function vb() { return "0 0 " + width + " " + height; }
function d(pts: number[][], close: boolean): string {
  let s = "";
  for (let i = 0; i < pts.length; i++) s += (i ? " L " : "M ") + pts[i][0].toFixed(1) + " " + pts[i][1].toFixed(1);
  return close ? s + " Z" : s;
}

export function Poly(pts: number[][], color: string, edge?: string, ew?: number) {
  if (edge) return <path d={d(pts, true)} fill={color} stroke={edge} strokeWidth={String(ew || 2)} viewBox={vb()} style={full()} />;
  return <path d={d(pts, true)} fill={color} viewBox={vb()} style={full()} />;
}
export function Line(pts: number[][], color: string, w: number) {
  return <path d={d(pts, false)} stroke={color} strokeWidth={String(w)} fill="none" viewBox={vb()} style={full()} />;
}
export function Circle(x: number, y: number, r: number, color: string, edge?: string) {
  const st: any = { position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: color };
  if (edge) { st.borderWidth = 3; st.borderColor = edge; st.borderStyle = "solid"; }
  return <div style={st} />;
}
export function Box(x: number, y: number, w: number, h: number, color: string, r?: number) {
  return <div style={{ position: "absolute", left: x, top: y, width: w, height: h, backgroundColor: color, borderRadius: r || 0 }} />;
}
// points turned by `a` radians about (cx, cy) and moved by (dx, dy)
export function turn(pts: number[][], cx: number, cy: number, a: number): number[][] {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map((p) => [cx + (p[0] - cx) * c - (p[1] - cy) * s, cy + (p[0] - cx) * s + (p[1] - cy) * c]);
}
export function rect(x: number, y: number, w: number, h: number): number[][] {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}
export function ngon(cx: number, cy: number, r: number, n: number, a0: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) { const a = a0 + i * Math.PI * 2 / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
export function star(cx: number, cy: number, r: number, r2: number, n: number, a0: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n * 2; i++) { const a = a0 + i * Math.PI / n, rr = i % 2 ? r2 : r; out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  return out;
}

// a round arrow about (cx, cy): dir 1 clockwise, -1 counter-clockwise
export function TurnArrow(cx: number, cy: number, r: number, dir: number, color: string) {
  const a0 = K.t * 2 * dir;
  const pts: number[][] = [];
  const span = Math.PI * 1.4;
  for (let i = 0; i <= 24; i++) { const a = a0 + dir * span * i / 24; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  const end = a0 + dir * span, ex = cx + Math.cos(end) * r, ey = cy + Math.sin(end) * r;
  const tx = -Math.sin(end) * dir, ty = Math.cos(end) * dir;      // the way the arrow goes
  const nx = Math.cos(end), ny = Math.sin(end);
  const head = [[ex + tx * 18, ey + ty * 18], [ex + nx * 13, ey + ny * 13], [ex - nx * 13, ey - ny * 13]];
  return [Line(pts, color, 9), Poly(head, color)];
}

// a pointing hand-like marker: a bouncing arrow down to (x, y)
export function PointAt(x: number, y: number, color: string) {
  const b = Math.abs(Math.sin(K.t * 5)) * 12;
  const yy = y - 18 - b;
  return Poly([[x, yy + 14], [x - 16, yy - 6], [x - 6, yy - 6], [x - 6, yy - 30], [x + 6, yy - 30], [x + 6, yy - 6], [x + 16, yy - 6]], color, "#ffffff", 2);
}

// ---- screens --------------------------------------------------------------------

export function Progress() {
  const dots = [];
  for (let i = 0; i < K.round; i++) dots.push(<div className={i < K.question ? "dot done" : i === K.question ? "dot now" : "dot"} />);
  return <div className="progress" style={{ left: width / 2 - K.round * 12, top: 14 }}>{dots}</div>;
}

export function StepBadge() {
  const s = step();
  const bars = [];
  for (let i = 0; i < STEPS; i++) bars.push(<div className={i <= s ? "sbar on" : "sbar"} style={{ height: 8 + i * 6 }} />);
  const fresh = K.t - K.stepMsg < 1.6;
  return (
    <div className="stepline" style={{ left: width / 2 - 50, top: 38 }}>
      {bars}
      {fresh ? <div className={K.stepUp ? "stepmsg up" : "stepmsg"}>{K.stepUp ? "▲" : "▼"}</div> : null}
    </div>
  );
}

// the top of a play screen: progress dots, the steps, the spoken prompt and 💡
export function Header(text: string, onSay: () => void, onHint: (() => void) | null) {
  const out: any[] = [Progress(), StepBadge()];
  out.push(
    <div className="prompt" id="prompt" style={{ left: onHint ? 64 : 14, top: 64, width: width - (onHint ? 76 : 28) }} onClick={() => onSay()}>
      <div className={text.length > 22 ? "ptext small" : "ptext"}>{"🔊 " + text}</div>
    </div>
  );
  if (onHint) out.push(<div className="hintbtn" id="hint" style={{ left: 10, top: 64 }} onClick={() => onHint()}>💡</div>);
  return out;
}

// the menu: a picture tile for each level, two in a row
export function Menu(deco: any[]) {
  const bob = Math.sin(K.t * 2.5) * 4;
  const out: any[] = [<div className="titlebox" style={{ left: 0, top: 14 + bob, width }}><div className="title">{K.title}</div></div>];
  for (const e of deco) out.push(e);
  const n = K.levels.length, cols = 2;
  const tw = Math.min(160, (width - 36) / 2), th = Math.min(150, Math.floor((height - 150 - 70) / Math.ceil(n / cols)) - 10);
  const x0 = width / 2 - tw - 6, y0 = 120;
  K.levels.forEach((lv: Level, i: number) => {
    const x = x0 + (i % cols) * (tw + 12), y = y0 + Math.floor(i / cols) * (th + 10);
    const badge = (K.best[i] > 0 ? "⭐" + K.best[i] : "") + (K.steps[i] > 0 ? " " + ["", "▮▮", "▮▮▮"][K.steps[i]] : "");
    out.push(
      <div className="tile" id={"lv" + i} onClick={() => { start(i); }} style={{ left: x, top: y, width: tw, height: th, backgroundColor: lv.color }}>
        <div className="tnum">{String(i + 1)}</div>
      </div>
    );
    for (const e of lv.pic(x + tw / 2, y + th / 2 - 8, Math.min(tw, th) / 120)) out.push(e);
    out.push(<div className="tname" style={{ left: x, top: y + th - 30, width: tw }}>{lv.name}</div>);
    if (badge) out.push(<div className="tbest" style={{ left: x + tw - 70, top: y + 6, width: 64 }}>{badge}</div>);
  });
  // the pictures are drawn over the tiles, so a tap on a picture must start the level too
  K.levels.forEach((lv: Level, i: number) => {
    const x = x0 + (i % cols) * (tw + 12), y = y0 + Math.floor(i / cols) * (th + 10);
    out.push(<div className="hit" id={"lvhit" + i} onClick={() => { start(i); }} style={{ left: x, top: y, width: tw, height: th }} />);
  });
  const rows = Math.ceil(n / cols);
  out.push(<div className="level back" id="exit" onClick={() => rg.exit()} style={{ left: width / 2 - 110, top: y0 + rows * (th + 10) + 6 }}><div className="lvname">{rg.t("← Valikkoon", "← Menu", "← Menú")}</div></div>);
  return <div className="screen">{out}</div>;
}

export function Done() {
  const stars = [];
  const r = K.right, n = K.round;
  for (let i = 0; i < n; i++) stars.push(<div className={i < r ? "bigstar" : "bigstar off"}>⭐</div>);
  return (
    <div className="screen flow">
      <div className="dtitle" style={{ marginTop: 80 }}>{r >= n - 1 ? rg.t("Mahtavaa!", "Awesome!", "¡Fantástico!") : r >= n / 2 ? rg.t("Hienoa!", "Great!", "¡Genial!") : rg.t("Hyvä yritys!", "Good try!", "¡Buen intento!")}</div>
      <div className="stars">{stars}</div>
      <div className="lead">{r} / {n} {rg.t("heti oikein", "right first time", "a la primera")}</div>
      <div className="level flowbtn" id="again" onClick={() => start(K.level)} style={{ backgroundColor: K.levels[K.level].color }}><div className="lvname">{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div></div>
      <div className="level back flowbtn" id="menu" onClick={() => toMenu()}><div className="lvname">{rg.t("← Takaisin", "← Back", "← Atrás")}</div></div>
    </div>
  );
}

export function Sparks() {
  return K.sparks.map((s: Spark) => <div className="spark" style={{ left: s.x, top: s.y, opacity: 1 - s.t / 1.2, backgroundColor: s.c }} />);
}

// a big round button at the bottom
export function Button(id: string, label: string, x: number, y: number, w: number, color: string, onTap: () => void) {
  return <div className="btn" id={id} onClick={() => onTap()} style={{ left: x, top: y, width: w, backgroundColor: color }}><div className="btext">{label}</div></div>;
}
