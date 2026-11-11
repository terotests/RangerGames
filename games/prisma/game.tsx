// Prisma: white light through a prism becomes a rainbow. Five small
// investigations for children around 8:
//   1 find the rainbow: turn the prism until the colours land on the screen
//   2 spread the colours: move the screen further and measure the width
//   3 water or glass: change the prism's material and compare the bending
//   4 make white light: three coloured lamps, mix them to white
//   5 why does the rainbow disappear: one-coloured light makes one ray
// Optics (Snell's law, refractive index per wavelength): lib/optics.ts.

import { trace, MATERIALS, waveRGB, css, corners, whiteWaves, turned, addLight, circle, clipPoly, Prism, Screen, Ray } from "lib/optics";

const TOP = 58;
const SW = 360, SH = 400;
const SRC_X = 48, SRC_Y = 250, SRC_A = -12;
const GOOD_ROT = 0;
const WAVES = whiteWaves(16);
const MONO: { [k: string]: number } = { red: 650, green: 530, blue: 460 };

type Q = { id: string; text: string; options: string[]; right: number; hint: string };

let mode = "menu";
let srcY = SRC_Y;          // the lamp's height (level 3 is higher: the wall catches all)
let t = 0;
let lv = 0;
let done: { [k: string]: boolean } = {};
let prism: Prism = { cx: 112, cy: 236, s: 100, rot: GOOD_ROT, mat: MATERIALS.glass };
let screens: Screen[] = [];
let rays: Ray[] = [];
let light = "white";
let dist = 150;          // level 2: the screen's distance from the prism, px
let wasOn = false;       // the colours were all on the screen last frame
let glassN = 0;          // which of the three glass tings is next
let saidTir = false;
let rail = { x: 0, y: 0, dx: 1, dy: 0 };
let goodClock = 0;
let won = false;
let wonClock = 0;
let quiz: Q | null = null;
let quizWrong = -1;
let quizMsg = "";
let drag: { kind: string; a0: number; rot0: number; lamp: number } | null = null;
let measures: number[][] = [];       // level 2: [distance px, width px]
let tried: { [k: string]: number } = {}; // level 3: material → degrees; level 5: light → 1
let marks: { nm: number; u: number }[] = [];   // level 5: where single colours landed
let lamps = [0.8, 0.3, 0];           // level 4: red, green, blue
let found: { [k: string]: boolean } = {};
let foundClock: { [k: string]: number } = {};
let flash = "";
let flashClock = 0;

const LEVELS = [
  { icon: "🌈", name: () => rg.t("Löydä sateenkaari", "Find the rainbow", "Encuentra el arcoíris"),
    tip: () => rg.t("Käännä prismaa sormella niin, että valo osuu valkokankaalle.", "Turn the prism with your finger so the light hits the screen.", "Gira el prisma con el dedo para que la luz llegue a la pantalla.") },
  { icon: "📏", name: () => rg.t("Levitä värit", "Spread the colours", "Separa los colores"),
    tip: () => rg.t("Vedä kangasta kauemmas ja lähemmäs. Mittaa leveys kolmesta kohdasta.", "Drag the screen further and closer. Measure the width in three places.", "Aleja y acerca la pantalla. Mide el ancho en tres sitios.") },
  { icon: "💧", name: () => rg.t("Vesi vai lasi?", "Water or glass?", "¿Agua o vidrio?"),
    tip: () => rg.t("Vaihda prisman ainetta. Kuinka paljon valo kääntyy?", "Change what the prism is made of. How much does the light turn?", "Cambia el material del prisma. ¿Cuánto gira la luz?") },
  { icon: "💡", name: () => rg.t("Tee valkoista valoa", "Make white light", "Haz luz blanca"),
    tip: () => rg.t("Säädä lamppuja vetämällä. Mitä värejä keskelle tulee?", "Drag the lamps' sliders. What colours appear in the middle?", "Mueve los reguladores. ¿Qué colores salen en el centro?") },
  { icon: "🔦", name: () => rg.t("Miksi sateenkaari katoaa?", "Why does the rainbow vanish?", "¿Por qué desaparece el arcoíris?"),
    tip: () => rg.t("Vaihda valon väriä. Kokeile kaikkia neljää.", "Change the colour of the light. Try all four.", "Cambia el color de la luz. Prueba los cuatro.") },
];

function facts(i: number): string {
  if (i === 0) return rg.t("Valkoinen valo on monta väriä yhdessä. Prisma taittaa jokaista väriä vähän eri verran, ja niin syntyy sateenkaari.",
    "White light is many colours together. The prism bends each colour a little differently, and that makes a rainbow.",
    "La luz blanca son muchos colores juntos. El prisma desvía cada color un poco distinto y así sale el arcoíris.");
  if (i === 1) return rg.t("Värit lähtevät prismasta eri suuntiin. Mitä kauempana kangas on, sitä leveämmäksi ne ehtivät levitä.",
    "The colours leave the prism in different directions. The further the screen, the wider they spread.",
    "Los colores salen del prisma en direcciones distintas. Cuanto más lejos la pantalla, más se separan.");
  if (i === 2) return rg.t("Lasi taittaa valoa enemmän kuin vesi, ja ilma ei juuri ollenkaan. Siksi lasiprisma tekee leveimmän sateenkaaren.",
    "Glass bends light more than water, and air hardly at all. That is why a glass prism makes the widest rainbow.",
    "El vidrio desvía la luz más que el agua, y el aire casi nada. Por eso el prisma de vidrio hace el arcoíris más ancho.");
  if (i === 3) return rg.t("Punainen, vihreä ja sininen valo yhdessä näyttävät valkoiselta. Puhelimen ruutu tekee kaikki värinsä näistä kolmesta.",
    "Red, green and blue light together look white. A phone screen makes all its colours from these three.",
    "La luz roja, verde y azul juntas se ven blancas. La pantalla del móvil hace todos sus colores con estas tres.");
  return rg.t("Prisma ei tee värejä, se vain erottelee ne. Yksivärisessä valossa on vain yksi väri. Punainen taittuu vähiten, sininen eniten.",
    "A prism does not make colours, it only separates them. One-coloured light has just one colour. Red bends least, blue most.",
    "El prisma no crea colores, solo los separa. La luz de un color tiene un solo color. El rojo se desvía menos y el azul más.");
}

function init() {
  done = rg.load("done", {}) || {};
  rg.title(rg.t("Prisma", "Prism", "Prisma"));
}

// --- the scene -------------------------------------------------------------

function exitRay(): Ray {
  // the yellow ray at the prism's best angle: where the screen goes
  const p = { cx: prism.cx, cy: prism.cy, s: prism.s, rot: GOOD_ROT, mat: prism.mat };
  return trace(p, [], SRC_X, srcY, SRC_A, 589, SW, SH);
}

function screenAt(d: number, len: number): Screen {
  const cx = rail.x + rail.dx * d, cy = rail.y + rail.dy * d;
  const px = -rail.dy, py = rail.dx;
  return { x0: cx - px * len / 2, y0: cy - py * len / 2, x1: cx + px * len / 2, y1: cy + py * len / 2 };
}

function setRail() {
  const r = exitRay();
  const n = r.pts.length;
  const a = r.pts[n - 2], b = r.pts[n - 1];
  const l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) || 1;
  rail = { x: a[0], y: a[1], dx: (b[0] - a[0]) / l, dy: (b[1] - a[1]) / l };
}

function placeScreens() {
  if (lv === 2) screens = [{ x0: SW - 4, y0: 0, x1: SW - 4, y1: SH - 4 }, { x0: 0, y0: SH - 4, x1: SW - 4, y1: SH - 4 }];
  else if (lv === 1) screens = [screenAt(dist, 120)];
  else screens = [screenAt(150, 120)];
}

function retrace() {
  if (lv === 3) { rays = []; return; }
  placeScreens();
  const waves = light === "white" ? WAVES : [MONO[light]];
  rays = [];
  for (const nm of waves) rays.push(trace(prism, screens, SRC_X, srcY, SRC_A, nm, SW, SH));
}

function start(i: number) {
  lv = i;
  srcY = i === 2 ? SRC_Y - 90 : SRC_Y;
  prism = { cx: 112, cy: i === 2 ? 146 : 236, s: 100, rot: i === 0 ? 40 : GOOD_ROT, mat: MATERIALS.glass };
  light = "white";
  dist = 50;
  measures = []; tried = {}; marks = []; found = {}; foundClock = {};
  lamps = [0.8, 0.3, 0];
  goodClock = 0; won = false; wonClock = 0; quiz = null; quizWrong = -1; quizMsg = ""; drag = null; flash = "";
  setRail();
  retrace();
  if (i === 2) tryMaterial("glass", true);
  mode = "play";
  wasOn = allOnScreen(); saidTir = false;
  sfx("glass2", 0.6);
  rg.say("prisma_tip" + (i + 1));
}

// --- level logic -------------------------------------------------------------

function allOnScreen(): boolean {
  if (!rays.length) return false;
  for (const r of rays) if (!r.hit || r.inside > 0) return false;
  return true;
}

// the colours' width on the screen, px (red to violet)
function spreadPx(): number {
  if (rays.length < 2) return 0;
  const a = rays[0].hit, b = rays[rays.length - 1].hit;
  if (!a || !b) return 0;
  return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

function cm(px: number): string {
  const v = Math.round(px) / 10;
  const s = v % 1 ? v.toFixed(1) : String(v);
  return (rg.lang === "en" ? s : s.split(".").join(",")) + " cm";
}

function say(msg: string) { flash = msg; flashClock = 2.6; }

// a sound file of this game (sfx/, made by tools/prisma/sfx.py)
function sfx(name: string, vol?: number) { rg.sound(rg.asset("sfx/" + name + ".wav"), { volume: vol === undefined ? 1 : vol }); }

function measure() {
  if (won || quiz) return;
  const w = spreadPx();
  if (!allOnScreen()) { sfx("hmm"); say(rg.t("Kaikki värit eivät osu kankaalle.", "Not all colours hit the screen.", "No todos los colores llegan a la pantalla.")); return; }
  for (const m of measures) if (Math.abs(m[0] - dist) < 30) {
    sfx("hmm");
    say(rg.t("Siirrä kangasta ensin toiseen kohtaan.", "Move the screen somewhere else first.", "Mueve antes la pantalla a otro sitio."));
    return;
  }
  measures.push([dist, w]);
  measures.sort((a, b) => a[0] - b[0]);
  sfx("measure");
  rg.vibrate(15);
  rg.say(measures.length < 3 ? "prisma_measure" + measures.length : "prisma_measure3");
  if (measures.length >= 3) askLater(() => ({
    id: "prisma_q2",
    text: rg.t("Mitä värikaistalle tapahtui, kun kangas meni kauemmas?", "What happened to the colours when the screen went further?", "¿Qué pasó con los colores al alejar la pantalla?"),
    options: [rg.t("Kapeni", "Got narrower", "Se estrechó"), rg.t("Pysyi samana", "Stayed the same", "Quedó igual"), rg.t("Leveni", "Got wider", "Se ensanchó")],
    right: 2,
    hint: rg.t("Katso mittauksia: kauempana leveys oli isompi.", "Look at the measurements: further away it was wider.", "Mira las medidas: más lejos era más ancho."),
  }));
}

let pendingQuiz: (() => Q) | null = null;
let pendingClock = 0;
function askLater(f: () => Q) { pendingQuiz = f; pendingClock = 1.2; }

function tryMaterial(id: string, quiet?: boolean) {
  prism.mat = MATERIALS[id];
  const r = trace(prism, [], SRC_X, srcY, SRC_A, 589, SW, SH);
  const first = tried[id] === undefined;
  tried[id] = turned(r);
  placeScreens();
  rays = [];
  for (const nm of WAVES) rays.push(trace(prism, screens, SRC_X, srcY, SRC_A, nm, SW, SH));
  if (!quiet) { sfx(id); rg.say("prisma_" + id); }
  if (first && tried.air !== undefined && tried.water !== undefined && tried.glass !== undefined) askLater(() => ({
    id: "prisma_q3",
    text: rg.t("Mikä taittoi valoa eniten?", "What bent the light the most?", "¿Qué desvió más la luz?"),
    options: [rg.t("Ilma", "Air", "Aire"), rg.t("Vesi", "Water", "Agua"), rg.t("Lasi", "Glass", "Vidrio")],
    right: 2,
    hint: rg.t("Katso, montako astetta valo kääntyi kullakin.", "Look how many degrees the light turned with each.", "Mira cuántos grados giró la luz con cada uno."),
  }));
}

function setLight(k: string) {
  if (won || quiz) return;
  light = k;
  retrace();
  sfx("light_" + k);
  rg.vibrate(8);
  const first = !tried[k];
  tried[k] = 1;
  if (first) rg.say("prisma_light_" + k);
  if (k !== "white" && rays.length && rays[0].hit) {
    marks = marks.filter((m) => m.nm !== MONO[k]);
    marks.push({ nm: MONO[k], u: rays[0].hit.along });
  }
  if (first && tried.white && tried.red && tried.green && tried.blue) askLater(() => ({
    id: "prisma_q5",
    text: rg.t("Miksi yksivärinen valo ei tee sateenkaarta?", "Why doesn't one-coloured light make a rainbow?", "¿Por qué la luz de un color no hace arcoíris?"),
    options: [rg.t("Prisma meni rikki", "The prism broke", "El prisma se rompió"), rg.t("Siinä on vain yksi väri", "It has only one colour", "Solo tiene un color"), rg.t("Valo on liian heikko", "The light is too weak", "La luz es muy débil")],
    right: 1,
    hint: rg.t("Valkoisessa valossa on kaikki värit. Montako väriä on punaisessa valossa?", "White light has all colours. How many colours does red light have?", "La luz blanca tiene todos los colores. ¿Cuántos tiene la luz roja?"),
  }));
}

function answer(i: number) {
  if (!quiz) return;
  if (i === quiz.right) {
    quiz = null;
    sfx("right");
    rg.say("prisma_right");
    win();
  } else {
    rg.say(quiz.id.split("_q").join("_hint"));
    quizWrong = i;
    quizMsg = quiz.hint;
    sfx("hmm");
    rg.vibrate(30);
  }
}

// level 4: the colours to find in the middle
const MIXES = [
  { id: "yellow", rgb: [255, 230, 0], test: (r: number, g: number, b: number) => r > 0.7 && g > 0.7 && b < 0.2 && Math.abs(r - g) < 0.15 },
  { id: "magenta", rgb: [255, 0, 220], test: (r: number, g: number, b: number) => r > 0.7 && b > 0.7 && g < 0.2 && Math.abs(r - b) < 0.15 },
  { id: "cyan", rgb: [0, 230, 255], test: (r: number, g: number, b: number) => g > 0.7 && b > 0.7 && r < 0.2 && Math.abs(g - b) < 0.15 },
  { id: "white", rgb: [255, 255, 255], test: (r: number, g: number, b: number) => r > 0.75 && g > 0.75 && b > 0.75 && Math.max(r, g, b) - Math.min(r, g, b) < 0.1 },
];

function mixName(id: string): string {
  if (id === "yellow") return rg.t("Keltainen", "Yellow", "Amarillo");
  if (id === "magenta") return rg.t("Pinkki", "Magenta", "Magenta");
  if (id === "cyan") return rg.t("Turkoosi", "Cyan", "Cian");
  return rg.t("Valkoinen", "White", "Blanco");
}

function win() {
  won = true; wonClock = 0; drag = null;
  done[String(lv)] = true;
  rg.save("done", done);
  sfx("fanfare");
  rg.vibrate([50, 40, 90]);
  rg.celebrate(width / 2, TOP + SH * 0.45, { big: lv === LEVELS.length - 1 });
  rg.say("prisma_fact" + (lv + 1), { queue: true });
}

// --- input -----------------------------------------------------------------

const LAMP_X = [80, 180, 280];
const SLIDER_TOP = 292, SLIDER_BOT = 380;

function onPointerDown(px: number, py: number) {
  if (mode !== "play" || won || quiz) return;
  const x = px, y = py - TOP;
  if (y < 0 || y > SH) return;
  if (lv === 3) {
    for (let i = 0; i < 3; i++) if (Math.abs(x - LAMP_X[i]) < 46 && y > SLIDER_TOP - 30) { drag = { kind: "lamp", a0: 0, rot0: 0, lamp: i }; slide(i, y); return; }
    return;
  }
  if (lv === 0) {
    drag = { kind: "rot", a0: Math.atan2(y - prism.cy, x - prism.cx), rot0: prism.rot, lamp: -1 };
    return;
  }
  if (lv === 1) { drag = { kind: "screen", a0: 0, rot0: 0, lamp: -1 }; slideScreen(x, y); }
}

function onPointerUp() { drag = null; }

function slide(i: number, y: number) {
  const v = rg.clamp((SLIDER_BOT - y) / (SLIDER_BOT - SLIDER_TOP), 0, 1);
  const before = lamps[i];
  lamps[i] = Math.round(v * 20) / 20;
  if (lamps[i] !== before) {
    if (before === 0) sfx("lamp", 0.8);
    else rg.sound("tick", { pitch: 0.7 + lamps[i] * 0.8, volume: 0.4 });
    rg.vibrate(4);
  }
}

function slideScreen(x: number, y: number) {
  const d = (x - rail.x) * rail.dx + (y - rail.y) * rail.dy;
  const nd = rg.clamp(d, 25, 190);
  if (Math.floor(nd / 20) !== Math.floor(dist / 20)) { sfx("slide", 0.7); rg.vibrate(4); }
  dist = nd;
  retrace();
}

function turnBy(deg: number) {
  if (won || quiz) return;
  prism.rot += deg;
  glassTing();
  rg.vibrate(6);
  retrace();
}

function glassTing() {
  glassN = (glassN + 1) % 3;
  sfx("glass" + (glassN + 1), 0.5);
}

function onBack() {
  if (mode === "play") { mode = "menu"; rg.sound("click"); } else rg.exit();
}

// --- time ------------------------------------------------------------------

function tick(dt: number, input: any) {
  t += dt;
  if (mode !== "play") return;
  if (flashClock > 0) flashClock -= dt;
  if (drag && input.pointer.down) {
    const x = input.pointer.x, y = input.pointer.y - TOP;
    if (drag.kind === "rot") {
      const a = Math.atan2(y - prism.cy, x - prism.cx);
      let da = (a - drag.a0) * 180 / Math.PI;
      while (da > 180) da -= 360;
      while (da < -180) da += 360;
      const r = drag.rot0 + da;
      if (Math.floor(r / 10) !== Math.floor(prism.rot / 10)) { glassTing(); rg.vibrate(4); }
      prism.rot = r;
      retrace();
    } else if (drag.kind === "screen") slideScreen(x, y);
    else if (drag.kind === "lamp") slide(drag.lamp, y);
  }
  if (pendingQuiz) {
    pendingClock -= dt;
    if (pendingClock <= 0) { quiz = pendingQuiz(); pendingQuiz = null; quizWrong = -1; quizMsg = ""; rg.sound("pop"); rg.say(quiz.id, { queue: true }); }
  }
  if (won) { wonClock += dt; return; }
  // the colours land on the screen: a shimmer (and in the first level, a cheer)
  const on = lv !== 3 && light === "white" && allOnScreen();
  if (on && !wasOn) { sfx("rainbow", 0.8); if (lv === 0) rg.say("prisma_hit"); }
  wasOn = on;
  if (lv === 0 && !saidTir && !on) {
    for (const r of rays) if (r.inside > 0) { saidTir = true; rg.say("prisma_tir"); break; }
  }
  if (lv === 0) {
    if (allOnScreen()) { goodClock += dt; if (goodClock > 0.9) win(); } else goodClock = 0;
  }
  if (lv === 3) {
    for (const m of MIXES) {
      if (found[m.id]) continue;
      if (m.test(lamps[0], lamps[1], lamps[2])) {
        foundClock[m.id] = (foundClock[m.id] || 0) + dt;
        if (foundClock[m.id] > 0.6) {
          found[m.id] = true;
          sfx("found");
          rg.say("prisma_mix_" + m.id);
          rg.vibrate(20);
          rg.celebrate(180, TOP + 150, {});
          let all = true;
          for (const k of MIXES) if (!found[k.id]) all = false;
          if (all) win();
        }
      } else foundClock[m.id] = 0;
    }
  }
}

// --- drawing ---------------------------------------------------------------

const VB = "0 0 " + SW + " " + SH;
const FULL = { position: "absolute", left: 0, top: 0, width: SW, height: SH };

function poly(pts: number[][], close: boolean): string {
  let d = "";
  for (let i = 0; i < pts.length; i++) d += (i ? " L " : "M ") + pts[i][0].toFixed(1) + " " + pts[i][1].toFixed(1);
  return close ? d + " Z" : d;
}

function Fill(pts: number[][], color: string) {
  return <path d={poly(pts, true)} fill={color} viewBox={VB} style={FULL} />;
}

function Line(pts: number[][], color: string, w: number) {
  return <path d={poly(pts, false)} stroke={color} strokeWidth={String(w)} fill="none" viewBox={VB} style={FULL} />;
}

function mid(a: number[], b: number[]): number[] { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }

function Light() {
  const out: any[] = [];
  if (!rays.length) return out;
  const r0 = rays[0];
  const white = light === "white";
  const col0 = white ? [255, 252, 235] : waveRGB(r0.nm);
  // the beam from the lamp to the prism
  const inPts = [r0.pts[0], r0.pts[1]];
  const pulse = 0.85 + Math.sin(t * 5) * 0.15;
  out.push(Line(inPts, css(col0, 0.25 * pulse), 12));
  out.push(Line(inPts, css(col0, 0.9), 4));
  out.push(Line(inPts, "#ffffff", 1.5));
  if (!white) {
    out.push(Line(r0.pts.slice(1), css(col0, 0.3 * pulse), 10));
    out.push(Line(r0.pts.slice(1), css(col0, 1), 3));
    return out;
  }
  const last = rays[rays.length - 1];
  const e0 = r0.pts[r0.pts.length - 1], e1 = last.pts[last.pts.length - 1];
  if (Math.abs(e0[0] - e1[0]) + Math.abs(e0[1] - e1[1]) < 3) {
    // the colours stay together: the light stays white
    out.push(Line(r0.pts.slice(1), css(col0, 0.25 * pulse), 12));
    out.push(Line(r0.pts.slice(1), css(col0, 0.9), 4));
    out.push(Line(r0.pts.slice(1), "#ffffff", 1.5));
    return out;
  }
  // inside the prism: faint colours
  for (const r of rays) if (r.pts.length > 2) out.push(Line(r.pts.slice(1, r.pts.length - 1), css(waveRGB(r.nm), 0.55), 1.5));
  // out of the prism: a fan of colour between neighbouring rays
  for (let i = 0; i + 1 < rays.length; i++) {
    const a = rays[i], b = rays[i + 1];
    const na = a.pts.length, nb = b.pts.length;
    if (na === nb && na >= 4 && a.inside === b.inside) {
      const c = waveRGB((a.nm + b.nm) / 2);
      out.push(Fill([a.pts[na - 2], a.pts[na - 1], b.pts[nb - 1], b.pts[nb - 2]], css(c, 0.8)));
    } else {
      out.push(Line(a.pts.slice(na - 2), css(waveRGB(a.nm), 0.9), 2));
      out.push(Line(b.pts.slice(nb - 2), css(waveRGB(b.nm), 0.9), 2));
    }
  }
  return out;
}

function PrismView() {
  const cs = corners(prism);
  const id = prism.mat.id;
  const fill = id === "water" ? "rgba(72,160,255,0.55)" : id === "glass" ? "rgba(200,235,255,0.38)" : "rgba(255,255,255,0.06)";
  const out: any[] = [Fill(cs, fill)];
  if (id === "water") {
    // little waves on the water
    const a = cs[0], b = cs[1], c = cs[2];
    const k = 0.32 + Math.sin(t * 2) * 0.02;
    const p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], q = [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k];
    const wv: number[][] = [];
    for (let i = 0; i <= 10; i++) {
      const f = i / 10;
      wv.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f + Math.sin(f * 12 + t * 4) * 1.5]);
    }
    out.push(Line(wv, "rgba(255,255,255,0.7)", 1.5));
  }
  // a shine on one face
  const s0 = mid(cs[0], cs[2]), s1 = [cs[0][0] + (cs[2][0] - cs[0][0]) * 0.85, cs[0][1] + (cs[2][1] - cs[0][1]) * 0.85];
  out.push(Line([[cs[0][0] + (s0[0] - cs[0][0]) * 0.3, cs[0][1] + (s0[1] - cs[0][1]) * 0.3], s1], "rgba(255,255,255,0.35)", 3));
  out.push(Line(cs.concat([cs[0]]), id === "air" ? "rgba(255,255,255,0.55)" : "rgba(235,248,255,0.95)", 2.5));
  return out;
}

function Lamp() {
  const col = light === "white" ? "#fff6c9" : css(waveRGB(MONO[light]));
  return (
    <div className="lampbox" style={{ left: SRC_X - 46, top: srcY - 15, width: 48, height: 30, transform: "rotate(" + SRC_A + "deg)" }}>
      <div className="lamplens" style={{ backgroundColor: col }} />
    </div>
  );
}

function ScreenView(s: Screen, i: number) {
  const out: any[] = [];
  const legs = lv !== 2;
  if (legs) {
    const m = mid([s.x0, s.y0], [s.x1, s.y1]);
    out.push(Line([m, [m[0], SH - 6]], "#8d99ae", 3));
    out.push(Line([[m[0] - 14, SH - 6], [m[0] + 14, SH - 6]], "#8d99ae", 4));
  }
  out.push(Line([[s.x0, s.y0], [s.x1, s.y1]], "#adb5bd", 9));
  out.push(Line([[s.x0, s.y0], [s.x1, s.y1]], "#f8f9fa", 6));
  // where the light lands on it
  const hits: { u: number; nm: number; x: number; y: number }[] = [];
  for (const r of rays) if (r.hit && r.hit.screen === i) hits.push({ u: r.hit.along, nm: r.nm, x: r.hit.x, y: r.hit.y });
  if (hits.length === 1) {
    const h = hits[0];
    out.push(<div className="dot" style={{ left: h.x - 6, top: h.y - 6, backgroundColor: css(waveRGB(h.nm)) }} />);
  } else {
    for (let k = 0; k + 1 < hits.length; k++) {
      const a = hits[k], b = hits[k + 1];
      out.push(Line([[a.x, a.y], [b.x, b.y]], css(waveRGB((a.nm + b.nm) / 2)), 6));
    }
  }
  return out;
}

function Ruler3() {
  // level 3: how many degrees the light turned, drawn at the exit
  const r = trace(prism, [], SRC_X, srcY, SRC_A, 589, SW, SH);
  if (r.pts.length < 4) return null;
  const n = r.pts.length;
  const e = r.pts[n - 2];
  const deg = Math.round(turned(r));
  // the way the light would have gone without the prism
  const a = SRC_A * Math.PI / 180;
  const straight = [e[0] + Math.cos(a) * 90, e[1] + Math.sin(a) * 90];
  const out: any[] = [Line([e, straight], "rgba(255,255,255,0.45)", 2)];
  return (
    <div style={FULL}>
      {out}
      <div className="deglabel" style={{ left: e[0] + 30, top: e[1] - 6 + deg * 0.5 }}>{deg + "°"}</div>
    </div>
  );
}

function Room() {
  const out: any[] = [];
  out.push(<div className="floor" style={{ left: 0, top: SH - 6, width: SW, height: 6 }} />);
  for (const s of screens) out.push(ScreenView(s, screens.indexOf(s)));
  if (lv === 1) {
    // the rail the screen slides on
    const a = [rail.x + rail.dx * 25, rail.y + rail.dy * 25], b = [rail.x + rail.dx * 190, rail.y + rail.dy * 190];
    out.unshift(Line([a, b], "rgba(255,255,255,0.18)", 2));
    // the distance
    const s = screens[0];
    const m = mid([s.x0, s.y0], [s.x1, s.y1]);
    out.push(<div className="deglabel" style={{ left: rg.clamp(m[0] - 30, 0, SW - 76), top: rg.clamp(m[1] - 74, 0, SH - 30) }}>{"↔ " + cm(dist)}</div>);
  }
  return out;
}

function Stage() {
  return (
    <div className="stage" style={{ left: 0, top: TOP, width: SW, height: SH }}>
      {lv === 3 ? Mixer() : [Room(), Light(), PrismView(), Lamp(), lv === 2 ? Ruler3() : null]}
    </div>
  );
}

// level 4: three lamps and their spots on the wall
function Mixer() {
  const base = [34, 36, 52];
  const C = [[148, 150], [212, 150], [180, 96]];
  const R = 62;
  const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const L = lamps.map((v, i) => [cols[i][0] * v, cols[i][1] * v, cols[i][2] * v]);
  const circles = C.map((c) => circle(c[0], c[1], R, 40));
  const out: any[] = [<div className="wall" style={{ left: 0, top: 0, width: SW, height: 262 }} />];
  // the cones of light
  for (let i = 0; i < 3; i++) {
    const lx = LAMP_X[i], ly = SLIDER_TOP - 22;
    const c = C[i];
    out.push(Fill([[lx - 8, ly], [c[0] - R * 0.8, c[1] + R * 0.3], [c[0] + R * 0.8, c[1] + R * 0.3], [lx + 8, ly]], css([cols[i][0] * 255, cols[i][1] * 255, cols[i][2] * 255], 0.12 * lamps[i])));
  }
  for (let i = 0; i < 3; i++) out.push(Fill(circles[i], css(addLight(base, [L[i]]))));
  const pairs = [[0, 1], [0, 2], [1, 2]];
  for (const p of pairs) {
    const ab = clipPoly(circles[p[0]], circles[p[1]]);
    if (ab.length > 2) out.push(Fill(ab, css(addLight(base, [L[p[0]], L[p[1]]]))));
  }
  const abc = clipPoly(clipPoly(circles[0], circles[1]), circles[2]);
  if (abc.length > 2) out.push(Fill(abc, css(addLight(base, L))));
  // the lamps and their sliders
  const names = ["#e63946", "#2a9d8f", "#3a86ff"];
  const pure = ["#ff2a2a", "#22e05a", "#2a6bff"];
  for (let i = 0; i < 3; i++) {
    const x = LAMP_X[i];
    const v = lamps[i];
    const ky = SLIDER_BOT - v * (SLIDER_BOT - SLIDER_TOP);
    out.push(<div className="spot" style={{ left: x - 16, top: SLIDER_TOP - 34, backgroundColor: names[i] }}><div className="spotlens" style={{ backgroundColor: v > 0 ? pure[i] : "#333", opacity: (0.4 + 0.6 * v).toFixed(2) }} /></div>);
    out.push(<div className="track" style={{ left: x - 4, top: SLIDER_TOP, height: SLIDER_BOT - SLIDER_TOP }} />);
    out.push(<div className="trackfill" style={{ left: x - 4, top: ky, height: SLIDER_BOT - ky, backgroundColor: pure[i] }} />);
    out.push(<div className="knob" style={{ left: x - 15, top: ky - 15, borderColor: pure[i] }} />);
    out.push(<div className="pct" style={{ left: x + 18, top: ky - 10 }}>{Math.round(v * 100) + "%"}</div>);
  }
  return out;
}

// the screen seen up close, under the stage: the colours and a ruler
function CloseUp() {
  if (lv === 3 || lv === 2) return null;
  const s = screens[0];
  if (!s) return null;
  const len = Math.sqrt((s.x1 - s.x0) * (s.x1 - s.x0) + (s.y1 - s.y0) * (s.y1 - s.y0));
  const W = 300, k = W / len;
  const out: any[] = [];
  const hits: { u: number; nm: number }[] = [];
  for (const r of rays) if (r.hit && r.hit.screen === 0) hits.push({ u: r.hit.along, nm: r.nm });
  if (hits.length === 1) {
    const x = hits[0].u * W;
    out.push(<div className="cband" style={{ left: x - 4, width: 8, backgroundColor: css(waveRGB(hits[0].nm)) }} />);
  } else {
    for (let i = 0; i + 1 < hits.length; i++) {
      const a = hits[i].u * W, b = hits[i + 1].u * W;
      const l = Math.min(a, b), w = Math.max(2, Math.abs(b - a) + 1);
      out.push(<div className="cband" style={{ left: l, width: w, backgroundColor: css(waveRGB((hits[i].nm + hits[i + 1].nm) / 2)) }} />);
    }
  }
  if (lv === 4) for (const m of marks) out.push(<div className="cmark" style={{ left: m.u * W - 5, borderColor: css(waveRGB(m.nm)) }} />);
  // a tick every centimetre (10 px of the stage)
  const ticks: any[] = [];
  for (let c = 0; c * 10 <= len; c++) ticks.push(<div className={c % 5 ? "tick" : "tick big"} style={{ left: Math.round(c * 10 * k) }} />);
  let label = "";
  if (hits.length > 1 && allOnScreen()) label = rg.t("Leveys ", "Width ", "Ancho ") + cm(spreadPx());
  else if (hits.length === 1) label = rg.t("Vain yksi väri", "Only one colour", "Solo un color");
  else if (hits.length === 0) label = rg.t("Ei valoa kankaalla", "No light on the screen", "No hay luz en la pantalla");
  return (
    <div className="closeup">
      <div className="cscreen" style={{ width: W }}>{out}{ticks}</div>
      <div className="clabel">{label}</div>
    </div>
  );
}

function info(): string {
  if (flashClock > 0) return flash;
  if (lv === 0 && rays.length && !allOnScreen()) {
    for (const r of rays) if (r.inside > 0) return rg.t("Valo heijastuu prisman sisällä. Käännä lisää!", "The light reflects inside the prism. Keep turning!", "La luz se refleja dentro del prisma. ¡Sigue girando!");
  }
  return LEVELS[lv].tip();
}

function Btn(id: string, label: any, on: boolean, cb: () => void, cls?: string) {
  return <div className={"btn" + (on ? " on" : "") + (cls ? " " + cls : "")} id={id} onClick={cb}>{label}</div>;
}

function Controls() {
  const out: any[] = [];
  if (lv === 0) {
    out.push(Btn("rotl", Icon("rotl", 26), false, () => turnBy(-5)));
    out.push(Btn("rotr", Icon("rotr", 26), false, () => turnBy(5)));
  } else if (lv === 1) {
    out.push(Btn("measure", "📏 " + rg.t("Mittaa", "Measure", "Medir"), false, () => measure(), "wide"));
    const recs: any[] = [];
    for (const m of measures) recs.push(<div className="rec">{cm(m[0]) + " → " + cm(m[1])}</div>);
    for (let i = measures.length; i < 3; i++) recs.push(<div className="rec empty">?</div>);
    out.push(<div className="recs">{recs}</div>);
  } else if (lv === 2) {
    const mats = [["air", rg.t("Ilma", "Air", "Aire")], ["water", rg.t("Vesi", "Water", "Agua")], ["glass", rg.t("Lasi", "Glass", "Vidrio")]];
    for (const m of mats) {
      const d = tried[m[0]];
      out.push(Btn("mat_" + m[0], <div className="mat"><div className="matname">{m[1]}</div><div className="matdeg">{d === undefined ? "?" : Math.round(d) + "°"}</div></div>,
        prism.mat.id === m[0], () => { if (!won && !quiz) tryMaterial(m[0]); }, "matbtn"));
    }
  } else if (lv === 3) {
    for (const m of MIXES) out.push(<div className={found[m.id] ? "chip got" : "chip"}><div className="chipdot" style={{ backgroundColor: css(m.rgb) }} /><div className="chiptext">{mixName(m.id)}</div><div className="chiptick">{found[m.id] ? "✓" : ""}</div></div>);
  } else {
    const ls = [["white", "#ffffff"], ["red", css(waveRGB(MONO.red))], ["green", css(waveRGB(MONO.green))], ["blue", css(waveRGB(MONO.blue))]];
    for (const l of ls) out.push(<div className={light === l[0] ? "cbtn on" : "cbtn"} id={"light_" + l[0]} onClick={() => setLight(l[0])}>
      <div className="cdot" style={{ backgroundColor: l[1] }} />{tried[l[0]] ? <div className="ctick">✓</div> : null}</div>);
  }
  return <div className={lv === 3 ? "controls chips" : "controls"}>{out}</div>;
}

function Dock() {
  return (
    <div className="dock" style={{ top: TOP + SH + 4, width: width }}>
      <div className="info">{info()}</div>
      {CloseUp()}
      {Controls()}
    </div>
  );
}

function QuizCard() {
  if (!quiz || won) return null;
  const opts: any[] = [];
  for (let i = 0; i < quiz.options.length; i++) {
    const idx = i;
    opts.push(<div className={quizWrong === i ? "qbtn wrong" : "qbtn"} id={"ans" + (i + 1)} onClick={() => answer(idx)}>{quiz.options[i]}</div>);
  }
  return (
    <div className="cardwrap" style={{ top: TOP + 4, width: width }}>
      <div className="card">
        <div className="qtitle">{"🔬 " + quiz.text}</div>
        <div className="qopts">{opts}</div>
        {quizMsg ? <div className="qhint">{quizMsg}</div> : null}
      </div>
    </div>
  );
}

function WonCard() {
  if (!won || wonClock < 0.7) return null;
  const k = Math.min(1, (wonClock - 0.7) / 0.3);
  const last = lv >= LEVELS.length - 1;
  return (
    <div className="cardwrap" style={{ top: height - 262 + (1 - rg.ease.out(k)) * 270, width: width }}>
      <div className="card">
        <div className="wtitle">{last ? rg.t("Tutkija! 🎉", "Scientist! 🎉", "¡Científico! 🎉") : rg.t("Löysit sen! 🎉", "You found it! 🎉", "¡Lo encontraste! 🎉")}</div>
        <div className="fact">{facts(lv)}</div>
        <div className="wrow">
          <div className="wbtn alt" id="again" onClick={() => start(lv)}>{Icon("reset", 26)}</div>
          <div className="wbtn alt" id="tomenu" onClick={() => { mode = "menu"; rg.sound("click"); }}>{Icon("menu", 22)}</div>
          {last ? null : <div className="wbtn" id="next" onClick={() => start(lv + 1)}>{rg.t("Seuraava ▶", "Next ▶", "Siguiente ▶")}</div>}
        </div>
      </div>
    </div>
  );
}

function Play() {
  const L = LEVELS[lv];
  return (
    <div className="screen">
      {Stage()}
      <div className="head" style={{ width: width }}>
        <div className="hbtn" id="menu" onClick={() => { mode = "menu"; rg.sound("click"); }}>{Icon("menu", 22)}</div>
        <div className="htext">
          <div className="hnum">{rg.t("Tutkimus", "Investigation", "Investigación")} {lv + 1}/{LEVELS.length}</div>
          <div className="hname">{L.name()}</div>
        </div>
      </div>
      {Dock()}
      {QuizCard()}
      {WonCard()}
    </div>
  );
}

// --- icons drawn as lines (arrow characters are missing from old phones) ---

function arc(cx: number, cy: number, r: number, a0: number, a1: number): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i <= 16; i++) { const a = (a0 + (a1 - a0) * i / 16) * Math.PI / 180; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}

function head(p: number[], a: number, s: number): string {
  const r = a * Math.PI / 180, b = 2.5;
  const tip = [p[0] + Math.cos(r) * s, p[1] + Math.sin(r) * s];
  const l = [p[0] + Math.cos(r + b) * s * 0.8, p[1] + Math.sin(r + b) * s * 0.8];
  const q = [p[0] + Math.cos(r - b) * s * 0.8, p[1] + Math.sin(r - b) * s * 0.8];
  return poly([tip, l, q], true);
}

function Icon(name: string, size: number) {
  if (name === "menu") {
    return (
      <div style={{ width: size, height: size, flexDirection: "column", justifyContent: "space-around", paddingTop: 3, paddingBottom: 3 }}>
        <div className="mline" /><div className="mline" /><div className="mline" />
      </div>
    );
  }
  const pts = name === "rotr" ? arc(12, 12, 7.5, 200, 400) : name === "rotl" ? arc(12, 12, 7.5, 340, 140) : arc(12, 12, 7.5, -60, 230);
  const e = pts[pts.length - 1], p = pts[pts.length - 2];
  const f = head(e, Math.atan2(e[1] - p[1], e[0] - p[0]) * 180 / Math.PI, 7);
  const st = { position: "absolute", left: 0, top: 0, width: size, height: size };
  return (
    <div style={{ width: size, height: size }}>
      <path d={poly(pts, false)} stroke="#ffffff" strokeWidth="2.6" fill="none" viewBox="0 0 24 24" style={st} />
      <path d={f} fill="#ffffff" viewBox="0 0 24 24" style={st} />
    </div>
  );
}

// --- menu ------------------------------------------------------------------

function MenuPrism() {
  // a little prism splitting a beam under the title
  const w = 300, h = 90;
  const vb = "0 0 " + w + " " + h;
  const st = { position: "absolute", left: 0, top: 0, width: w, height: h };
  const tri = [[150, 8], [190, 78], [110, 78]];
  const out: any[] = [
    <path d={poly([[0, 58], [132, 46]], false)} stroke="rgba(255,250,220,0.35)" strokeWidth="10" fill="none" viewBox={vb} style={st} />,
    <path d={poly([[0, 58], [132, 46]], false)} stroke="#fffbe6" strokeWidth="3" fill="none" viewBox={vb} style={st} />,
  ];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const nm = 680 - i * 270 / (n - 1);
    const y0 = 50 + i * 1.5, y1 = 30 + i * 9 + Math.sin(t * 2) * 2;
    out.push(<path d={poly([[170, y0], [300, y1], [300, y1 + 9], [170, y0 + 1.5]], true)} fill={css(waveRGB(nm), 0.9)} viewBox={vb} style={st} />);
  }
  out.push(<path d={poly(tri, true)} fill="rgba(200,235,255,0.4)" stroke="#eaf6ff" strokeWidth="2.5" viewBox={vb} style={st} />);
  return <div className="mprism" style={{ width: w, height: h }}>{out}</div>;
}

function Menu() {
  const cards: any[] = [];
  let next = 0;
  while (next < LEVELS.length && done[String(next)]) next++;
  for (let i = 0; i < LEVELS.length; i++) {
    const L = LEVELS[i];
    const isNext = i === next;
    cards.push(
      <div className={"lvl" + (done[String(i)] ? " done" : "") + (isNext ? " next" : "")} id={"lvl" + (i + 1)} onClick={() => start(i)}
        style={isNext ? { borderColor: Math.floor(t * 2) % 2 ? "#ffffff" : "#ffd166" } : {}}>
        <div className="licon">{L.icon}</div>
        <div className="ltext">
          <div className="lnum">{rg.t("Tutkimus", "Investigation", "Investigación") + " " + (i + 1)}</div>
          <div className="lname">{L.name()}</div>
        </div>
        <div className="lcheck">{done[String(i)] ? "⭐" : ""}</div>
      </div>
    );
  }
  return (
    <div className="screen menu">
      <div className="title">{rg.t("Prisma", "Prism", "Prisma")}</div>
      <div className="subtitle">{rg.t("Mistä sateenkaaren värit tulevat?", "Where do the rainbow's colours come from?", "¿De dónde salen los colores del arcoíris?")}</div>
      {MenuPrism()}
      <div className="list">{cards}</div>
    </div>
  );
}

function view() {
  return mode === "menu" ? Menu() : Play();
}
