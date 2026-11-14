// Kello: learning to read a clock, for 6–8 year olds. Five levels:
//   1 Tasatunnit   the long hand points up: "tasan kolme"
//   2 Puolet       the long hand points down: "puoli neljä" (by the NEXT hour)
//   3 Vartit       quarter past and quarter to: "varttia yli", "varttia vaille"
//   4 Käännä       the child turns the hands to a time that is said aloud
//   5 Leiki        a free clock: turn the hands and hear the time
//
// Reading levels ask "Paljonko kello on?" and offer the time as words and
// digits. Every level adapts in three steps: three right first tries in a
// row go one step up, two misses in a row one step down (saved). The first
// step offers far-off answers; later steps offer the answers children really
// mix up (puoli kolme for 3.30, yli for vaille, the hands swapped).
//
// A miss is never a dead end: the wrong button fades, the hint for that kind
// of time is said and drawn (the part of the face the long hand has gone
// round lights up), and on the turning level a second miss shows the right
// hands as a faint ghost. The 💡 button gives the same hint any time.
//
// The face is drawn with divs: the right half ("yli") and left half
// ("vaille") are tinted, the hour hand is short, thick and red, the minute
// hand long, thin and blue, and the hour hand stands where it really is
// (half way to four at 3.30). The words: lib/time.ts (tested in tests/kello.ts).
import { Time, Lang, words, digits, clip, minuteAngle, hourAngle, confusions, farOff, same, angleOf, dragMinute, dragHour } from "lib/time";

type Mode = "menu" | "play" | "done";
type Kind = "read" | "set" | "free";
type Level = { name: string; kind: Kind; color: string; icon: string };
type Spark = { x: number; y: number; vx: number; vy: number; t: number; c: string };

const LEVELS: Level[] = [
  { name: rg.t("Tasatunnit", "O'clock", "En punto"), kind: "read", color: "#06d6a0", icon: "🕒" },
  { name: rg.t("Puolet", "Half past", "Y media"), kind: "read", color: "#118ab2", icon: "🕞" },
  { name: rg.t("Vartit", "Quarters", "Cuartos"), kind: "read", color: "#ef476f", icon: "🕒" },
  { name: rg.t("Käännä viisarit", "Turn the hands", "Mueve las agujas"), kind: "set", color: "#f77f00", icon: "👆" },
  { name: rg.t("Leiki kellolla", "Play with the clock", "Juega con el reloj"), kind: "free", color: "#7b2cbf", icon: "🎈" },
];
const ROUND = 8;
const STEPS = 3;
const SPARK = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#ffffff"];
const HOUR_C = "#e63946";
const MIN_C = "#1d6fd8";
const SECTOR_C = "rgba(255,209,102,0.75)";

const L: Lang = rg.lang === "en" ? "en" : rg.lang === "es" ? "es" : "fi";

let mode: Mode = "menu";
let level = 0;
let target: Time = { h: 3, m: 0 };
let shown: Time = { h: 3, m: 0 };       // what the clock shows (the child's hands on the turning levels)
let choices: Time[] = [];
let wrong: number[] = [];              // faded choices
let question = 0;
let right = 0;
let firstTry = true;
let misses = 0;                        // misses on this question (turning level: the ghost after two)
let t = 0;
let solved = -1;
let shake: { i: number; t: number } = { i: -1, t: 0 };
let wobble = "";                       // "h" or "m": the hand that is wrong
let wobbleT = -10;
let hintT = -10;                       // when the hint was asked; the sector shows for a while
let sparks: Spark[] = [];
let best: number[] = [];
let steps: number[] = [];
let streak = 0;
let missRow = 0;
let stepMsg = -10;
let stepUp = true;
let grab = "";                         // the hand being turned
let lastSaid = "";

function fill(arr: number[], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(arr && i < arr.length ? arr[i] : 0);
  return out;
}

function init() {
  best = fill(rg.load("best", []), LEVELS.length);
  steps = fill(rg.load("steps", []), LEVELS.length);
}

function kind(): Kind { return LEVELS[level].kind; }
function step(): number { return steps[level]; }

const PRAISE = ["hyva", "hienoa", "mahtavaa", "oikein", "loistavaa", "jee", "taitava", "osaat"];
let praiseN = 0;
function praise() { praiseN++; return PRAISE[praiseN % PRAISE.length]; }
function wclip(x: Time) { return "kel_w_" + x.h + "_" + x.m; }

// ---- the questions ----------------------------------------------------------

// which minutes a level asks at its step, and which the answers may have
function asks(): number[] {
  const s = step();
  if (level === 0) return [0];
  if (level === 1) return s === 0 ? [30, 30, 0] : [30, 30, 30, 0];
  if (level === 2) return s === 0 ? [15, 15, 30] : s === 1 ? [15, 45, 45, 30] : [15, 45, 30, 0];
  if (s === 0) return [0];
  if (s === 1) return [0, 30, 30];
  return [15, 45, 30];
}
function answerKinds(): number[] {
  if (level === 0) return [0];
  if (level === 1) return [0, 30];
  return [0, 15, 30, 45];
}

function pickTarget(): Time {
  let x: Time = { h: rg.range(1, 12), m: rg.pick(asks()) };
  let guard = 0;
  while (same(x, target) && guard++ < 20) x = { h: rg.range(1, 12), m: rg.pick(asks()) };
  return x;
}

function makeChoices(): Time[] {
  const s = step(), k = answerKinds();
  let wrongs: Time[];
  if (s === 0) wrongs = farOff(target, k, rg.random).slice(0, 2);
  else {
    const c = confusions(target, k);
    const far = farOff(target, k, rg.random).filter((x) => !c.some((y) => same(x, y)));
    wrongs = s === 1 ? c.slice(0, 1).concat(rg.shuffle(c.slice(1).concat(far)).slice(0, 1)) : c.slice(0, 3);
    while (wrongs.length < (s === 2 ? 3 : 2) && far.length) wrongs.push(far.shift() as Time);
  }
  return rg.shuffle([target].concat(wrongs));
}

function instruct() {
  if (kind() === "read") rg.say("kel_mika_aika");
  else if (kind() === "set") rg.say(["kel_kaanna", wclip(target)]);
  else rg.say("kel_leiki");
}

function next() {
  target = pickTarget();
  firstTry = true;
  misses = 0;
  solved = -1;
  wrong = [];
  hintT = -10;
  wobble = "";
  if (kind() === "read") { shown = target; choices = makeChoices(); }
  else {
    // the child's clock starts at a full hour that is not the answer
    let h = rg.range(1, 12);
    if (h === target.h) h = h === 12 ? 1 : h + 1;
    shown = { h, m: 0 };
    choices = [];
  }
  instruct();
}

function startLevel(i: number) {
  level = i;
  question = 0;
  right = 0;
  streak = 0;
  missRow = 0;
  stepMsg = -10;
  mode = "play";
  rg.sound("click");
  if (kind() === "free") { shown = { h: 3, m: 0 }; target = shown; lastSaid = ""; hintT = -10; rg.say(["kel_leiki"]); return; }
  next();
}

function setStep(d: number) {
  const s = Math.max(0, Math.min(STEPS - 1, steps[level] + d));
  if (s === steps[level]) return;
  steps[level] = s;
  rg.save("steps", steps);
  stepMsg = t;
  stepUp = d > 0;
  streak = 0;
  missRow = 0;
}

function hintFor(m: number): string {
  return m === 0 ? "kel_vihje_tasan" : m === 30 ? "kel_vihje_puoli" : m === 15 ? "kel_vihje_yli" : "kel_vihje_vaille";
}

function hint() {
  hintT = t;
  rg.sound("click");
  rg.say(hintFor(target.m));
}

function success(x: number, y: number) {
  solved = t;
  if (firstTry) { right++; streak++; missRow = 0; }
  rg.celebrate(x, y, { sound: false });
  rg.sound(firstTry ? "star" : "coin");
  rg.say([clip(target), praise()]);
  for (let k = 0; k < 24; k++) {
    const ang = rg.random() * Math.PI * 2, sp = 80 + rg.random() * 220;
    sparks.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120, t: 0, c: rg.pick(SPARK) });
  }
  if (streak >= 3) setStep(1);
}

function miss() {
  if (firstTry) { missRow++; streak = 0; if (missRow >= 2) setStep(-1); }
  firstTry = false;
  misses++;
  rg.sound("wrong");
  rg.vibrate(60);
}

function pick(i: number) {
  if (solved >= 0 || wrong.indexOf(i) >= 0) return;
  if (same(choices[i], target)) { success(width / 2, choiceY(i) + 26); return; }
  miss();
  wrong.push(i);
  shake = { i, t };
  hintT = t;
  rg.say(["kokeile_toista", hintFor(target.m)]);
}

// the turning level: which hand is wrong
function check() {
  if (solved >= 0) return;
  if (same(shown, target)) { success(G.cx, G.cy); return; }
  miss();
  wobbleT = t;
  hintT = t;
  if (shown.m !== target.m) { wobble = "m"; rg.say(["kel_vihje_pitka", hintFor(target.m)]); }
  else { wobble = "h"; rg.say(target.m === 0 ? ["kel_vihje_lyhyt"] : ["kel_vihje_lyhyt", hintFor(target.m)]); }
}

function tick(dt: number, input: any) {
  t += dt;
  for (const s of sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 500 * dt; }
  sparks = sparks.filter((s) => s.t < 1.2);
  if (grab && input && input.pointer) {
    if (input.pointer.down) turn(input.pointer.x, input.pointer.y);
    else release();
  }
  if (mode === "play" && kind() !== "free" && solved >= 0 && t - solved > 1.8) {
    question++;
    if (question >= ROUND) {
      mode = "done";
      if (right > best[level]) { best[level] = right; rg.save("best", best); }
      if (right >= 5) rg.celebrate(width / 2, height * 0.3, { big: true }); else rg.sound("coin");
      rg.say(right >= 2 ? [right >= 7 ? "mahtavaa" : right >= 4 ? "hienoa" : "hyvin_meni", "sait", rg.sayId.number(right), "tahtea"] : ["hyvin_meni"]);
    } else next();
  }
}

function onBack() {
  if (mode === "menu") rg.exit(); else { mode = "menu"; grab = ""; rg.sound("click"); }
}

// ---- layout -------------------------------------------------------------------

// the clock's place, worked out each frame from the screen size
let G = { cx: 180, cy: 260, R: 120 };
const TOP = 118;

function layout() {
  const n = kind() === "read" ? Math.max(3, choices.length) : 1;
  const below = kind() === "read" ? n * 60 + 24 : kind() === "set" ? 96 : 40;
  const room = height - TOP - below - 16;
  const R = Math.max(86, Math.min(140, Math.floor(room / 2) - 6, Math.floor(width / 2) - 34));
  G = { cx: width / 2, cy: TOP + 8 + R, R };
}

function choiceY(i: number) { return G.cy + G.R + 22 + i * 60; }

// ---- turning the hands --------------------------------------------------------

function onPointerDown(x: number, y: number) {
  if (mode !== "play" || kind() === "read" || solved >= 0) return;
  const dx = x - G.cx, dy = y - G.cy, d = Math.sqrt(dx * dx + dy * dy);
  if (d > G.R * 1.15 || d < 8) return;
  const a = angleOf(dx, dy);
  const diff = (b: number) => { const z = Math.abs(((a - b) % 360 + 540) % 360 - 180); return z; };
  const dm = diff(minuteAngle(shown.m)), dh = diff(hourAngle(shown.h, shown.m));
  // the short hand only reaches half way out; inside that, the nearer hand
  grab = d > G.R * 0.62 ? "m" : dh <= dm ? "h" : "m";
  wobble = "";
  rg.sound("click");
  turn(x, y);
}

function turn(x: number, y: number) {
  const a = angleOf(x - G.cx, y - G.cy);
  const before = shown;
  if (grab === "m") shown = dragMinute(shown.h, shown.m, a);
  else shown = { h: dragHour(shown.m, a), m: shown.m };
  if (!same(before, shown)) rg.sound("tick", { volume: 0.4 });
}

function onPointerUp() { release(); }

function release() {
  if (!grab) return;
  grab = "";
  if (kind() === "free" && shown.m % 15 === 0) {
    const id = clip(shown);
    if (id !== lastSaid) { lastSaid = id; rg.say(id); }
  }
}

// ---- drawing --------------------------------------------------------------------

// a stick from the centre at `deg`, `len` long: a box twice the length turned
// about its middle, coloured only in its top half
function Stick(deg: number, len: number, w: number, color: string, opacity: number, round: boolean) {
  return (
    <div className="stick" style={{ left: G.cx - w / 2, top: G.cy - len, width: w, height: len * 2, opacity, transform: "rotate(" + deg.toFixed(1) + "deg)" }}>
      <div style={{ width: w, height: len, backgroundColor: color, borderRadius: round ? w / 2 : 1 }} />
    </div>
  );
}

// a tick on the rim: a box across the face turned about its middle
function Tick(deg: number, len: number, w: number, color: string) {
  const R = G.R - 6;
  return (
    <div className="stick" style={{ left: G.cx - w / 2, top: G.cy - R, width: w, height: R * 2, transform: "rotate(" + deg + "deg)" }}>
      <div style={{ width: w, height: len, backgroundColor: color, borderRadius: w / 2 }} />
    </div>
  );
}

function Hands(x: Time, opacity: number, wob: string) {
  const k = t - wobbleT < 1.2 ? Math.sin((t - wobbleT) * 30) * 8 * (1 - (t - wobbleT) / 1.2) : 0;
  const R = G.R;
  const ha = hourAngle(x.h, x.m) + (wob === "h" ? k : 0);
  const ma = minuteAngle(x.m) + (wob === "m" ? k : 0);
  const big = grab ? 1.15 : 1;
  return [
    Stick(ha, R * 0.52, 14 * (grab === "h" ? big : 1), HOUR_C, opacity, true),
    Stick(ma, R * 0.84, 9 * (grab === "m" ? big : 1), MIN_C, opacity, true),
  ];
}

// a slice of the face from angle a0 to a1 (degrees clockwise from 12) as a
// path of short lines
function Slice(a0: number, a1: number, fill: string) {
  const { cx, cy, R } = G;
  let d = "M " + R + " " + R;
  for (let a = a0; a <= a1 + 0.01; a += 6) {
    const r = a * Math.PI / 180;
    d += " L " + (R + Math.sin(r) * R).toFixed(1) + " " + (R - Math.cos(r) * R).toFixed(1);
  }
  d += " Z";
  return <path d={d} fill={fill} viewBox={"0 0 " + R * 2 + " " + R * 2} style={{ position: "absolute", left: cx - R, top: cy - R, width: R * 2, height: R * 2 }} />;
}

// the part of the face the long hand has gone round, lit up as a hint
function Sector(m: number) {
  const { cx, cy, R } = G;
  if (m === 15) return Slice(0, 90, SECTOR_C);
  if (m === 30) return Slice(0, 180, SECTOR_C);
  if (m === 45) return Slice(270, 360, SECTOR_C);
  return <div className="sector top" style={{ left: cx - 26, top: cy - R + 4, width: 52, height: 52, borderRadius: 26 }} />;
}

function Clock(opts: { halves: boolean; legend: boolean; ghost: Time | null; hint: number }) {
  const { cx, cy, R } = G;
  const out: any[] = [];
  out.push(<div className="face" style={{ left: cx - R - 8, top: cy - R - 8, width: R * 2 + 16, height: R * 2 + 16, borderRadius: R + 8 }} />);
  if (opts.halves) {
    out.push(Slice(0, 180, "rgba(6,214,160,0.13)"));
    out.push(Slice(180, 360, "rgba(247,127,0,0.13)"));
  }
  if (opts.hint >= 0) out.push(Sector(opts.hint));
  for (let i = 0; i < 60; i++) {
    if (i % 5 === 0) out.push(Tick(i * 6, 12, 4, "#3d405b"));
    else out.push(Tick(i * 6, 6, 2, "#9a8c98"));
  }
  if (opts.halves) {
    out.push(<div className="halflabel" style={{ left: cx + R * 0.3, top: cy + R * 0.22, width: R * 0.5, color: "#0f9d76" }}>{rg.t("yli", "past", "y")}</div>);
    out.push(<div className="halflabel" style={{ left: cx - R * 0.8, top: cy + R * 0.22, width: R * 0.5, color: "#c2410c" }}>{rg.t("vaille", "to", "menos")}</div>);
  }
  const fs = Math.round(R * 0.2);
  for (let n = 1; n <= 12; n++) {
    const a = n * Math.PI / 6, r = R * 0.74;
    out.push(<div className="num" style={{ left: cx + Math.sin(a) * r - 20, top: cy - Math.cos(a) * r - 20, fontSize: fs }}>{n}</div>);
  }
  if (opts.ghost) for (const h of Hands(opts.ghost, 0.28, "")) out.push(h);
  for (const h of Hands(shown, 1, wobble)) out.push(h);
  out.push(<div className="cap" style={{ left: cx - 11, top: cy - 11 }} />);
  if (opts.legend) {
    out.push(
      <div className="legend" style={{ left: cx - 150, top: cy + R + 12 }}>
        <div className="lgbar" style={{ width: 22, height: 10, backgroundColor: HOUR_C }} />
        <div className="lgtext">{rg.t("lyhyt = tunti", "short = hour", "corta = hora")}</div>
        <div className="lgbar" style={{ width: 36, height: 6, backgroundColor: MIN_C, marginLeft: 14 }} />
        <div className="lgtext">{rg.t("pitkä = minuutit", "long = minutes", "larga = minutos")}</div>
      </div>
    );
  }
  return out;
}

function Progress() {
  const dots = [];
  for (let i = 0; i < ROUND; i++) dots.push(<div className={i < question ? "dot done" : i === question ? "dot now" : "dot"} />);
  return <div className="progress" style={{ left: width / 2 - ROUND * 12, top: 14 }}>{dots}</div>;
}

function StepBadge() {
  const s = step();
  const bars = [];
  for (let i = 0; i < STEPS; i++) bars.push(<div className={i <= s ? "sbar on" : "sbar"} style={{ height: 8 + i * 6 }} />);
  const fresh = t - stepMsg < 1.6;
  return (
    <div className="stepline" style={{ left: width / 2 - 50, top: 40 }}>
      <div className="steplabel">{rg.t("Taso", "Level", "Nivel")}</div>
      {bars}
      {fresh ? <div className={stepUp ? "stepmsg up" : "stepmsg"}>{stepUp ? "▲" : "▼"}</div> : null}
    </div>
  );
}

function Prompt() {
  let text = rg.t("Paljonko kello on?", "What time is it?", "¿Qué hora es?");
  let sub = "";
  if (kind() === "set") {
    text = words(target, L);
    sub = step() < 2 || misses > 0 ? digits(target, L) : "";
  } else if (kind() === "free") {
    text = shown.m % 15 === 0 ? words(shown, L) : digits(shown, L);
    sub = shown.m % 15 === 0 ? digits(shown, L) : "";
  }
  return (
    <div className="prompt" id="prompt" style={{ left: 64, top: 64, width: width - 76 }} onClick={() => { if (kind() === "free") rg.say(shown.m % 15 === 0 ? clip(shown) : "kel_leiki"); else instruct(); }}>
      <div className={text.length > 18 ? "ptext small" : "ptext"}>{"🔊 " + text}</div>
      {sub ? <div className="psub">{sub}</div> : null}
    </div>
  );
}

function Choices() {
  return choices.map((c, i) => {
    const k = shake.i === i ? Math.max(0, 1 - (t - shake.t) / 0.4) : 0;
    const dx = Math.sin((t - shake.t) * 50) * 10 * k;
    const ok = solved >= 0 && same(c, target);
    const off = wrong.indexOf(i) >= 0;
    const w = Math.min(300, width - 40);
    return (
      <div className={ok ? "choice ok" : off ? "choice off" : "choice"} id={"ch" + i} onClick={() => pick(i)}
        style={{ left: width / 2 - w / 2 + dx, top: choiceY(i), width: w }}>
        <div className="crow"><div className={words(c, L).length > 19 ? "cword small" : "cword"}>{words(c, L)}</div><div className="cdig">{digits(c, L)}</div></div>
      </div>
    );
  });
}

function Play() {
  layout();
  const free = kind() === "free";
  const hinting = t - hintT < 6 && (solved < 0 || free);
  const halves = level === 2 || free || (kind() === "set" && step() === 2);
  const legend = kind() === "set" && (step() === 0 || misses > 0);
  const out: any[] = [];
  if (!free) { out.push(Progress()); out.push(StepBadge()); }
  out.push(Prompt());
  if (!free) out.push(<div className="hintbtn" id="hint" style={{ left: 10, top: 64 }} onClick={() => hint()}>💡</div>);
  for (const e of Clock({ halves, legend, ghost: kind() === "set" && misses >= 2 && solved < 0 ? target : null, hint: hinting ? (free ? -1 : target.m) : -1 })) out.push(e);
  if (kind() === "read") for (const e of Choices()) out.push(e);
  if (kind() === "set") {
    out.push(
      <div className={solved >= 0 ? "ready ok" : "ready"} id="ready" style={{ left: width / 2 - 110, top: G.cy + G.R + (legend ? 44 : 26) }} onClick={() => check()}>
        <div className="rtext">{rg.t("Valmis ✓", "Done ✓", "Listo ✓")}</div>
      </div>
    );
  }
  if (free) out.push(<div className="freehelp" style={{ left: 20, top: G.cy + G.R + 18, width: width - 40 }}>{rg.t("Pyöritä viisareita sormella", "Turn the hands with your finger", "Gira las agujas con el dedo")}</div>);
  return <div className="screen">{out}</div>;
}

// a little clock on the menu whose hands go round
function MenuClock() {
  const save = G;
  G = { cx: width / 2, cy: 112, R: 52 };
  const mm = (t * 40) % 360, hh = (t * 40 / 12) % 360 + 90;
  const out = [
    <div className="face" style={{ left: G.cx - 58, top: G.cy - 58, width: 116, height: 116, borderRadius: 58 }} />,
  ];
  for (let n = 3; n <= 12; n += 3) {
    const a = n * Math.PI / 6;
    out.push(<div className="num" style={{ left: G.cx + Math.sin(a) * 38 - 20, top: G.cy - Math.cos(a) * 38 - 20, fontSize: 16 }}>{n}</div>);
  }
  out.push(Stick(hh, 26, 8, HOUR_C, 1, true));
  out.push(Stick(mm, 42, 5, MIN_C, 1, true));
  out.push(<div className="cap small" style={{ left: G.cx - 6, top: G.cy - 6 }} />);
  G = save;
  return out;
}

function Menu() {
  const bob = Math.sin(t * 2.5) * 4;
  return (
    <div className="screen">
      <div className="titlebox" style={{ left: 0, top: 12 + bob, width }}><div className="title">{rg.t("Kello", "Clock", "El reloj")}</div></div>
      {MenuClock()}
      <div className="levels" style={{ left: width / 2 - 150, top: 186 }}>
        {LEVELS.map((lv, i) => (
          <div className="level" id={"lv" + i} onClick={() => startLevel(i)} style={{ backgroundColor: lv.color }}>
            <div className="lvname">{(i + 1) + ". " + lv.name}</div>
            <div className="lvbest">{(lv.kind !== "free" && best[i] > 0 ? "⭐ " + best[i] + "/" + ROUND : "") + (lv.kind !== "free" && steps[i] > 0 ? "  " + ["▮", "▮▮", "▮▮▮"][steps[i]] : "")}</div>
          </div>
        ))}
        <div className="level back" id="exit" onClick={() => rg.exit()}><div className="lvname">{rg.t("← Valikkoon", "← Menu", "← Menú")}</div></div>
      </div>
    </div>
  );
}

function Done() {
  const stars = [];
  for (let i = 0; i < ROUND; i++) stars.push(<div className={i < right ? "bigstar" : "bigstar off"}>⭐</div>);
  return (
    <div className="screen flow">
      <div className="dtitle" style={{ marginTop: 80 }}>{right >= 7 ? rg.t("Mahtavaa!", "Awesome!", "¡Fantástico!") : right >= 4 ? rg.t("Hienoa!", "Great!", "¡Genial!") : rg.t("Hyvä yritys!", "Good try!", "¡Buen intento!")}</div>
      <div className="stars">{stars}</div>
      <div className="lead">{right} / {ROUND} {rg.t("oikein heti", "right first time", "a la primera")}</div>
      <div className="level flowbtn" id="again" onClick={() => startLevel(level)} style={{ backgroundColor: LEVELS[level].color }}><div className="lvname">{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div></div>
      <div className="level back flowbtn" id="menu" onClick={() => { mode = "menu"; rg.sound("click"); }}><div className="lvname">{rg.t("← Takaisin", "← Back", "← Atrás")}</div></div>
    </div>
  );
}

function view() {
  let body;
  if (mode === "menu") body = Menu();
  else if (mode === "done") body = Done();
  else body = Play();
  return (
    <div className="root">
      {body}
      {sparks.map((s) => <div className="spark" style={{ left: s.x, top: s.y, opacity: 1 - s.t / 1.2, backgroundColor: s.c }} />)}
    </div>
  );
}
