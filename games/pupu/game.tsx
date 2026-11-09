// Pupu hyppii: a bunny bounces up from cloud to cloud. Touch the screen
// and the bunny hops toward your finger (or use the arrow keys); the bunny jumps by
// itself. Carrots are points, a spring throws you high, a grey cloud breaks
// after one bounce, and a cloud that sways moves under you.
// Made for small children: the bunny is slow and stops when you let go, the
// screen edges are walls, clouds are wide and close together, and a fall
// only costs a heart: a rescue cloud catches the bunny. The round ends when
// all hearts are gone; every 500 points gives a heart back.

type Kind = "cloud" | "move" | "crumble" | "spring";
type Platform = { x: number; y: number; w: number; kind: Kind; vx: number; broken: number; carrot: boolean; got: number; bounce: number };
type Puff = { x: number; y: number; t: number; c: string };
type Mode = "title" | "play" | "over";

// same jump height as before (about 170 px) but floatier, so there is time to steer
const GRAVITY = 1050;
const JUMP = -600;
const SPRING = -1000;
const PW = 96;
const SPEED = 175;      // steering speed, px/s
const LIVES = 3;
const MAX_LIVES = 5;

let mode: Mode = "title";
let t = 0;
let modeClock = 0;
let P = { x: 160, y: 500, vx: 0, vy: 0, face: 1, squash: 0 };
let cam = 0;
let top = 0;            // the highest platform made so far
let plats: Platform[] = [];
let puffs: Puff[] = [];
let carrots = 0;
let climbed = 0;
let best = 0;
let newBest = false;
let lives = LIVES;
let nextLife = 500;     // score that gives a heart back
let safe = 0;          // seconds left of the rescue blink
let target = -1;       // x the bunny heads for after a touch, -1 = none
let waitLift = false;  // the tap that started the round doesn't steer
let stars: { x: number; y: number; s: number }[] = [];

function init() {
  best = rg.load("best", 0);
  for (let i = 0; i < 40; i++) stars.push({ x: rg.random() * 360, y: rg.random() * 2000, s: 1 + rg.random() * 2 });
  reset();
}

function score() { return Math.floor(climbed / 10) + carrots * 10; }

function reset() {
  P = { x: width / 2 - 16, y: height - 120, vx: 0, vy: JUMP, face: 1, squash: 0 };
  cam = 0;
  plats = [];
  puffs = [];
  carrots = 0;
  climbed = 0;
  newBest = false;
  lives = LIVES;
  nextLife = 500;
  safe = 0;
  target = -1;
  // a long first cloud, so the first jumps cannot miss
  const first = makePlatform(20, height - 60, "cloud");
  first.w = width - 40;
  plats.push(first);
  top = height - 60;
  fill();
}

function makePlatform(x: number, y: number, kind: Kind): Platform {
  return { x, y, w: PW, kind, vx: kind === "move" ? (rg.random() < 0.5 ? -40 : 40) : 0, broken: 0, carrot: false, got: 0, bounce: 0 };
}

// clouds up to a screen above the camera; harder the higher it goes
function fill() {
  while (top > cam - height) {
    // the first ~2000 px are plain clouds; tricky ones come slowly after that
    const level = Math.max(0, Math.min(1, (-top - 2000) / 25000));
    const gap = 52 + rg.random() * (30 + level * 45);
    top -= gap;
    const r = rg.random();
    let kind: Kind = "cloud";
    if (-top < 1200) kind = r < 0.12 ? "spring" : "cloud";
    else if (r < 0.06 + level * 0.12) kind = "move";
    else if (r < 0.10 + level * 0.18) kind = "crumble";
    else if (r < 0.18 + level * 0.18) kind = "spring";
    const p = makePlatform(8 + rg.random() * (width - PW - 16), top, kind);
    p.carrot = kind !== "crumble" && rg.random() < 0.28;
    plats.push(p);
    // a crumbling cloud never stands alone: there is a safe one near it
    if (kind === "crumble") {
      top -= 30;
      plats.push(makePlatform(8 + rg.random() * (width - PW - 16), top, "cloud"));
    }
  }
}

function puff(x: number, y: number, c: string) {
  for (let i = 0; i < 5; i++) puffs.push({ x: x + rg.random() * 30 - 15, y: y + rg.random() * 8, t: 0, c });
}

// The bunny goes toward the finger, measured from the bunny itself, not from
// the middle of the screen. A short tap is enough: it keeps going to the
// tapped spot after the finger lifts and stops under it.
function steer(): number {
  let d = 0;
  if (__input.keys["ArrowLeft"] || __input.keys["a"]) d -= 1;
  if (__input.keys["ArrowRight"] || __input.keys["d"]) d += 1;
  if (d !== 0) { target = -1; return d; }
  let down = false;
  for (const p of __input.pointers) if (p.down) { down = true; if (!waitLift) target = p.x; }
  if (!down) waitLift = false;
  if (target < 0) return 0;
  const dx = target - (P.x + 16);
  if (Math.abs(dx) < 6) { target = -1; return 0; }
  // slows down for the last few pixels so it doesn't overshoot
  return Math.max(-1, Math.min(1, dx / 30));
}

function tick(dt: number) {
  t += dt;
  modeClock += dt;
  for (const f of puffs) { f.t += dt; f.y += 20 * dt; }
  puffs = puffs.filter((f) => f.t < 0.5);
  if (mode !== "play") return;

  const d = steer();
  if (d !== 0) P.face = d;
  // eases in, and stops quickly when the finger is lifted
  P.vx += (d * SPEED - P.vx) * Math.min(1, dt * (d === 0 ? 14 : 8));
  P.vy += GRAVITY * dt;
  P.x += P.vx * dt;
  const oldY = P.y;
  P.y += P.vy * dt;
  P.squash = Math.max(0, P.squash - dt * 4);
  safe = Math.max(0, safe - dt);
  // the edges are walls: the bunny never vanishes off one side
  if (P.x < 0) { P.x = 0; P.vx = 0; if (target < 16) target = -1; }
  if (P.x > width - 32) { P.x = width - 32; P.vx = 0; if (target > width - 16) target = -1; }

  for (const p of plats) {
    if (p.kind === "move") {
      p.x += p.vx * dt;
      if (p.x < 4 || p.x > width - p.w - 4) p.vx = -p.vx;
    }
    if (p.broken > 0) { p.broken += dt; continue; }
    p.bounce = Math.max(0, p.bounce - dt * 3);
    // landing: falling, feet crossing the cloud's top this frame
    const feet = P.x + 16;
    if (P.vy > 0 && oldY <= p.y && P.y >= p.y && feet > p.x - 14 && feet < p.x + p.w + 14) {
      P.y = p.y;
      P.squash = 1;
      p.bounce = 1;
      if (p.kind === "spring") {
        P.vy = SPRING;
        rg.sound("whoosh");
        rg.sound("jump", { pitch: 1.6 });
        rg.vibrate(40);
      } else {
        P.vy = JUMP;
        rg.sound("jump", { pitch: 0.9 + rg.random() * 0.25, volume: 0.6 });
      }
      if (p.kind === "crumble") { p.broken = 0.01; rg.sound("hit", { volume: 0.5 }); puff(p.x + p.w / 2, p.y, "#b8c0cc"); }
      else puff(feet, p.y, "#ffffff");
    }
    // a carrot sits above its cloud
    if (p.carrot && !p.got && Math.abs(P.x + 16 - (p.x + p.w / 2)) < 32 && Math.abs(P.y - 20 - (p.y - 30)) < 36) {
      p.got = t;
      carrots++;
      rg.celebrate(p.x + p.w / 2, p.y - 30 - cam, { count: 8, sound: false });
      rg.sound("coin");
      rg.vibrate(15);
    }
  }

  // the camera only goes up
  const line = cam + height * 0.42;
  if (P.y < line) { climbed += line - P.y; cam = P.y - height * 0.42; }
  plats = plats.filter((p) => p.y < cam + height + 60 && p.broken < 1);
  fill();

  if (score() >= nextLife) {
    nextLife += 500;
    if (lives < MAX_LIVES) { lives++; rg.sound("coin", { pitch: 1.4 }); rg.celebrate(width - 120, 30, { count: 10, sound: false }); }
  }

  if (P.y > cam + height + 50) {
    lives--;
    if (lives > 0) { rescue(); return; }
    mode = "over";
    modeClock = 0;
    const s = score();
    if (s > best) { best = s; newBest = true; rg.save("best", best); rg.celebrate(width / 2, height * 0.35, { big: true, sound: false }); }
    rg.sound("lose");
    rg.vibrate([80, 60, 200]);
    rg.say(newBest ? "uusi_ennatys" : "voi_ei");
  }
}

// a wide cloud appears at the bottom of the screen and catches the bunny
function rescue() {
  const y = cam + height - 70;
  const c = makePlatform(20, y, "cloud");
  c.w = width - 40;
  c.bounce = 1;
  plats.push(c);
  P.x = width / 2 - 16;
  P.y = y;
  P.vx = 0;
  P.vy = JUMP;
  P.squash = 1;
  safe = 1.5;
  puff(width / 2, y, "#ffffff");
  rg.sound("whoosh");
  rg.vibrate(60);
  rg.say(lives === 1 ? "ei_haittaa" : "hups");
}

function startGame() {
  reset();
  waitLift = true;
  mode = "play";
  modeClock = 0;
  rg.sound("click");
  rg.music("happy", { volume: 0.7 });
  rg.say("keraa_porkkanat");
}

function onPointerDown(x: number, y: number) {
  // a tap shorter than a frame never shows as held, so the tap itself sets the target
  if (mode === "play") target = x;
  else if (mode === "title") startGame();
  else if (mode === "over" && modeClock > 0.8) startGame();
}

function onKeyDown(key: string) {
  if ((key === " " || key === "Enter") && mode !== "play") onPointerDown(0, 0);
}

function onBack() {
  if (mode === "play") { mode = "title"; rg.stopMusic(); } else rg.exit();
}

// ---- drawing -----------------------------------------------------------------

function mix(a: number[], b: number[], k: number) {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
}

function Sky() {
  // day, dusk, night as the bunny climbs
  const h = Math.min(1, climbed / 15000);
  const topC = h < 0.5 ? mix([88, 186, 235], [255, 140, 120], h * 2) : mix([255, 140, 120], [25, 25, 70], (h - 0.5) * 2);
  const botC = h < 0.5 ? mix([200, 236, 255], [255, 210, 150], h * 2) : mix([255, 210, 150], [70, 50, 120], (h - 0.5) * 2);
  const starAlpha = Math.max(0, (h - 0.55) * 2.2);
  return (
    <div className="sky" style={{ background: "linear-gradient(180deg, " + topC + ", " + botC + ")" }}>
      {starAlpha > 0 ? stars.map((s) => <div className="star" style={{ left: s.x, top: ((s.y - cam * 0.2) % height + height) % height, width: s.s, height: s.s, opacity: starAlpha }} />) : null}
      <div className="hill far" style={{ top: height - 90 - cam * 0.15 }} />
      <div className="hill near" style={{ top: height - 50 - cam * 0.3 }} />
    </div>
  );
}

function Cloud(p: Platform) {
  const y = p.y - cam;
  const sink = p.bounce * 5;
  const cls = p.kind === "crumble" ? "cloud grey" : p.kind === "move" ? "cloud pink" : "cloud";
  const fall = p.broken > 0 ? p.broken * 300 : 0;
  return (
    <div className="plat" style={{ left: p.x, top: y - 8 + sink + fall, width: p.w, opacity: p.broken > 0 ? 1 - p.broken : 1 }}>
      <div className={cls + " bump1"} />
      <div className={cls + " bump2"} />
      {p.w > PW ? <div className={cls + " bump2"} style={{ left: p.w - 70 }} /> : null}
      <div className={cls + " base"} style={{ width: p.w }} />
      {p.kind === "spring" ? <div className="spring" style={{ top: -14 + sink * 2, height: 14 - sink * 2 }} /> : null}
      {p.carrot && (!p.got || t - p.got < 0.4) ? Carrot(p) : null}
    </div>
  );
}

function Carrot(p: Platform) {
  const fly = p.got ? (t - p.got) * 120 : 0;
  const bob = Math.sin(t * 4 + p.x) * 3;
  return (
    <div className="carrot" style={{ left: p.w / 2 - 7, top: -46 + bob - fly, opacity: p.got ? 1 - (t - p.got) / 0.4 : 1 }}>
      <div className="leaf" />
      <div className="root" />
    </div>
  );
}

function Bunny() {
  const s = P.squash;
  const stretch = mode === "play" && P.vy < -300 ? 0.12 : 0;
  const bw = 32 * (1 + s * 0.25 - stretch * 0.5);
  const bh = 30 * (1 - s * 0.3 + stretch);
  const y = P.y - cam;
  const eyeX = P.face > 0 ? bw - 12 : 6;
  return (
    <div className="bunny" style={{ opacity: safe > 0 && Math.floor(t * 8) % 2 === 0 ? 0.4 : 1, left: P.x + 16 - bw / 2, top: y - bh - 18, width: bw, height: bh + 18 }}>
      <div className="ear" style={{ left: bw / 2 - 11, transform: "rotate(" + (-12 - s * 10) + "deg)" }}><div className="ear-in" /></div>
      <div className="ear" style={{ left: bw / 2 + 2, transform: "rotate(" + (12 + s * 10) + "deg)" }}><div className="ear-in" /></div>
      <div className="body" style={{ width: bw, height: bh }}>
        <div className="eye" style={{ left: eyeX }} />
        <div className="cheek" style={{ left: P.face > 0 ? bw - 16 : 4 }} />
        <div className="nose" style={{ left: P.face > 0 ? bw - 5 : 1 }} />
      </div>
      <div className="foot" style={{ left: bw / 2 - 12 }} />
      <div className="foot" style={{ left: bw / 2 + 2 }} />
    </div>
  );
}

function hearts() {
  let h = "";
  for (let i = 0; i < lives; i++) h += "❤️";
  return h;
}

function Hud() {
  return (
    <div className="hud">
      <div className="pill">⭐ {score()}</div>
      <div className="pill">🥕 {carrots}</div>
      <div className="pill">{hearts()}</div>
    </div>
  );
}

function Title() {
  const bob = Math.sin(t * 3) * 8;
  return (
    <div className="overlay">
      <div className="big" style={{ marginTop: bob }}>{rg.t("Pupu hyppii", "Bunny Jump", "Salta conejito")}</div>
      <div className="hint">{rg.t("Pupu hyppää sinne, mihin kosket", "The bunny hops to where you touch", "El conejito salta adonde toques")}</div>
      <div className="go">{rg.t("Napauta ja aloita!", "Tap to start!", "¡Toca para empezar!")}</div>
      {best > 0 ? <div className="hint">Ennätys: {best}</div> : null}
    </div>
  );
}

function Over() {
  return (
    <div className="overlay">
      <div className="big">{rg.t("Hups!", "Oops!", "¡Uy!")}</div>
      <div className="result">⭐ {score()}   🥕 {carrots}</div>
      {newBest ? <div className="record">{rg.t("Uusi ennätys!", "New record!", "¡Nuevo récord!")} 🎉</div> : <div className="hint">{rg.t("Ennätys: ", "Record: ", "Récord: ")}{best}</div>}
      {modeClock > 0.8 ? <div className="go">{rg.t("Napauta ja yritä uudestaan", "Tap to try again", "Toca para intentarlo otra vez")}</div> : null}
    </div>
  );
}

function view() {
  return (
    <div className="screen">
      {Sky()}
      {plats.map((p) => Cloud(p))}
      {puffs.map((f) => <div className="puff" style={{ left: f.x - 5, top: f.y - cam - 5, opacity: 1 - f.t * 2, backgroundColor: f.c }} />)}
      {mode !== "title" ? Bunny() : null}
      {mode === "play" ? Hud() : null}
      {mode === "title" ? Title() : null}
      {mode === "over" ? Over() : null}
    </div>
  );
}
