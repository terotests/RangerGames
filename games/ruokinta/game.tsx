// Nälkäiset eläimet: an animal feeding game for preschoolers. Real photos of
// animals (the same Wikimedia Commons photos as Kenen luut?) and of foods
// (Commons, CC / public domain). The child drags a food onto the animal that
// eats it; a tap works too. Everything is said aloud, nothing has to be read.
//
//   Mitä syön?       one hungry animal, three foods: which one does it eat?
//   Kuka syö?        one food, three animals: who eats it?
//   Ruokintakierros  three animals and three foods: everyone gets their own
//
// Wrong choices are always clearly wrong: tools/ruokinta/data.json lists what
// each animal eats ("eats"), what would be arguable ("maybe", never offered),
// and the rest of the foods are wrong answers only when they are a different
// kind of food (a cow and a bone, a frog and a banana). lib/data.ts is
// generated from it by tools/ruokinta/build.py.

import { ANIMALS, FOODS, CREDITS } from "lib/data";

type Mode = "menu" | "play" | "done" | "credits";
type Animal = { id: string; name: string[]; img: string; eats: string[]; no: string[] };
type Food = { id: string; name: string[]; img: string };
type Fly = { f: number; x0: number; y0: number; x1: number; y1: number; t0: number; eat: boolean; a: number };

const A: Animal[] = ANIMALS as any;
const F: Food[] = FOODS as any;
const LEVELS = [
  { name: rg.t("Mitä syön?", "What do I eat?", "¿Qué como?"), sub: rg.t("Anna eläimelle oikea ruoka", "Give the animal the right food", "Dale al animal su comida"), icon: "🥕", color: "#e76f51", round: 8 },
  { name: rg.t("Kuka syö?", "Who eats it?", "¿Quién lo come?"), sub: rg.t("Vie ruoka oikealle eläimelle", "Take the food to the right animal", "Lleva la comida al animal correcto"), icon: "🍌", color: "#2a9d8f", round: 8 },
  { name: rg.t("Ruokintakierros", "Feeding round", "Hora de comer"), sub: rg.t("Jokaiselle oma ruoka", "Everyone gets their own food", "Cada uno su comida"), icon: "🐾", color: "#7b5ea7", round: 4 },
];
const LI = rg.lang === "en" ? 1 : rg.lang === "es" ? 2 : 0;
const PER_PAGE = 6;

let mode: Mode = "menu";
let level = 0;
let task = 0;
let right = 0;
let t = 0;
let best: number[] = [0, 0, 0];
let page = 0;

// the current task: animals on screen, foods on screen, and which food goes where
let animals: number[] = [];
let foods: number[] = [];
let answer: number[] = [];      // answer[j] = index in `animals` that food j belongs to (-1: nobody)
let fed: number[] = [];         // fed[k] = food index (in F) the animal k got, -1 not yet
let used: boolean[] = [];       // food j is eaten
let tried: boolean[] = [];      // food j was offered to the wrong animal (level 0: dimmed)
let missed = false;             // a wrong try in this task
let solved = -1;                // time the task was finished
let selected = -1;              // a food chosen by tapping (levels 1 and 2)
let shake = { k: -1, t: 0 };    // an animal shaking its head
let chew = { k: -1, t: -9 };    // an animal eating
let fly: Fly[] = [];
let recent: number[] = [];

type Drag = { on: boolean; j: number; x0: number; y0: number; x: number; y: number; dx: number; dy: number; moved: boolean };
let drag: Drag = { on: false, j: -1, x0: 0, y0: 0, x: 0, y: 0, dx: 0, dy: 0, moved: false };

function init() {
  best = rg.load("best", [0, 0, 0]);
  while (best.length < LEVELS.length) best.push(0);
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function an(i: number) { return A[i].name[LI]; }
function fn(i: number) { return F[i].name[LI]; }
function fi(id: string) { for (let i = 0; i < F.length; i++) if (F[i].id === id) return i; return -1; }
function eats(a: number, f: number) { return A[a].eats.indexOf(F[f].id) >= 0; }
function wrongFor(a: number, f: number) { return A[a].no.indexOf(F[f].id) >= 0; }

// ---- layout (all positions absolute, 360 wide) -------------------------------

function H() { return Math.max(560, height); }
type R = { x: number; y: number; w: number; h: number };
// photo rectangles of the animals
function animalRect(k: number): R {
  if (level === 0) return { x: 42, y: 92, w: 276, h: 207 };
  const n = animals.length, w = 112, gap = (360 - n * w) / (n + 1);
  const y = level === 1 ? Math.min(H() - 196, 370) : 98;
  return { x: gap + k * (w + gap), y: y, w: w, h: 84 };
}
// photo rectangles of the foods (where they rest)
function foodRect(j: number): R {
  if (level === 1) return { x: 110, y: 104, w: 140, h: 140 };
  const n = foods.length, w = 100, gap = (360 - n * w) / (n + 1);
  return { x: gap + j * (w + gap), y: Math.min(H() - 168, level === 0 ? 400 : 360), w: w, h: w };
}
function inR(x: number, y: number, r: R, pad: number) {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}
function centre(r: R) { return [r.x + r.w / 2, r.y + r.h / 2]; }

// ---- making tasks --------------------------------------------------------------

function freshPick(pool: number[]): number {
  let p = pool.filter((i) => recent.indexOf(i) < 0);
  if (p.length === 0) { recent = []; p = pool; }
  const i = rg.pick(p);
  recent.push(i);
  while (recent.length > Math.floor(pool.length * 0.6)) recent.shift();
  return i;
}

function makeTask() {
  const all = A.map((_, i) => i);
  if (level === 0) {
    const a = freshPick(all);
    const right = fi(rg.pick(A[a].eats));
    const wrong = rg.shuffle(F.map((_, i) => i).filter((f) => wrongFor(a, f))).slice(0, 2);
    animals = [a];
    foods = rg.shuffle([right].concat(wrong));
    answer = foods.map((f) => (f === right ? 0 : -1));
  } else if (level === 1) {
    const eaten = F.map((_, i) => i).filter((f) => A.some((_, a) => eats(a, f)));
    const f = freshPick(eaten);
    const a = rg.pick(all.filter((x) => eats(x, f)));
    const others = rg.shuffle(all.filter((x) => wrongFor(x, f)));
    const pick = [a];
    for (const o of others) { if (pick.length >= 3) break; if (A[o].img !== A[pick[pick.length - 1]].img) pick.push(o); }
    animals = rg.shuffle(pick);
    foods = [f];
    answer = [animals.indexOf(a)];
  } else {
    // three animals, each with a food that the two others clearly don't eat
    for (let tries = 0; tries < 400; tries++) {
      const as = rg.shuffle(all).slice(0, 3);
      const fs = as.map((a) => fi(rg.pick(A[a].eats)));
      let ok = fs[0] !== fs[1] && fs[1] !== fs[2] && fs[0] !== fs[2];
      for (let i = 0; i < 3 && ok; i++) for (let j = 0; j < 3; j++) if (i !== j && !wrongFor(as[i], fs[j])) ok = false;
      if (!ok) continue;
      animals = as;
      const order = rg.shuffle([0, 1, 2]);
      foods = order.map((k) => fs[k]);
      answer = order.slice();
      break;
    }
  }
  fed = animals.map(() => -1);
  used = foods.map(() => false);
  tried = foods.map(() => false);
}

function ask() {
  if (level === 0) rg.say("ru_mita_" + A[animals[0]].id);
  else if (level === 1) rg.say("ru_kuka_" + F[foods[0]].id);
  else rg.say("ru_kierros");
}

function next() {
  missed = false;
  solved = -1;
  selected = -1;
  shake = { k: -1, t: 0 };
  chew = { k: -1, t: -9 };
  fly = [];
  makeTask();
  ask();
}

// ---- feeding -----------------------------------------------------------------

// food j (resting or dragged to x, y) goes to animal k
function feed(j: number, k: number, x: number, y: number) {
  selected = -1;
  const a = animals[k], f = foods[j];
  const c = centre(animalRect(k));
  if (answer[j] === k) {
    used[j] = true;
    fed[k] = f;
    fly.push({ f: j, x0: x, y0: y, x1: c[0], y1: c[1], t0: t, eat: true, a: k });
    rg.sound("whoosh", { pitch: 1.6 });
    const done = used.every((u) => u);
    rg.say(done && level === 2 ? ["ru_nam", "ru_" + A[a].id + "_" + F[f].id, "ru_kiitos"] : ["ru_nam", "ru_" + A[a].id + "_" + F[f].id]);
    if (done) solved = t + 0.4;
  } else {
    tried[j] = true;
    missed = true;
    shake = { k: k, t: t };
    const r = foodRect(j);
    fly.push({ f: j, x0: x, y0: y, x1: r.x + r.w / 2, y1: r.y + r.h / 2, t0: t, eat: false, a: k });
    rg.sound("wrong");
    rg.vibrate(60);
    rg.say(["ru_n_" + A[a].id, "ru_ei"]);
  }
}

function flying(j: number) { return fly.some((q) => q.f === j && t - q.t0 < 0.35); }

function onPointerDown(x: number, y: number) {
  if (mode !== "play" || solved >= 0) return;
  for (let j = 0; j < foods.length; j++) {
    if (used[j] || flying(j)) continue;
    const r = foodRect(j);
    if (inR(x, y, r, 6)) {
      drag = { on: true, j: j, x0: x, y0: y, x: x, y: y, dx: x - (r.x + r.w / 2), dy: y - (r.y + r.h / 2), moved: false };
      rg.sound("click", { pitch: 1.3 });
      rg.say("ru_f_" + F[foods[j]].id);
      return;
    }
  }
  for (let k = 0; k < animals.length; k++) {
    if (!inR(x, y, animalRect(k), 6)) continue;
    if (fed[k] >= 0) { rg.say("ru_n_" + A[animals[k]].id); return; }
    // levels 1 and 2: a food chosen by tapping (level 1 has just one) goes to the tapped animal
    const j = level === 1 ? 0 : selected;
    if (level > 0 && j >= 0 && !used[j]) { const r = foodRect(j); feed(j, k, r.x + r.w / 2, r.y + r.h / 2); }
    else if (level === 0) ask();
    else rg.say("ru_n_" + A[animals[k]].id);
    return;
  }
}

function dropOn(x: number, y: number): number {
  for (let k = 0; k < animals.length; k++) if (fed[k] < 0 && inR(x, y, animalRect(k), level === 0 ? 30 : 16)) return k;
  return -1;
}

function onPointerUp() {
  if (!drag.on) return;
  const d = drag;
  drag = { on: false, j: -1, x0: 0, y0: 0, x: 0, y: 0, dx: 0, dy: 0, moved: false };
  const cx = d.x - d.dx, cy = d.y - d.dy;
  if (d.moved) {
    const k = dropOn(d.x, d.y);
    if (k >= 0) { feed(d.j, k, cx, cy); return; }
    const r = foodRect(d.j);
    fly.push({ f: d.j, x0: cx, y0: cy, x1: r.x + r.w / 2, y1: r.y + r.h / 2, t0: t, eat: false, a: -1 });
    return;
  }
  // a tap: level 0 feeds the only animal, otherwise the food is chosen
  if (level === 0) { const r = foodRect(d.j); feed(d.j, 0, r.x + r.w / 2, r.y + r.h / 2); }
  else if (level === 2) selected = selected === d.j ? -1 : d.j;
}

function dragStep(input: any) {
  if (!drag.on) return;
  drag.x = input.pointer.x;
  drag.y = input.pointer.y;
  if (!drag.moved && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > 10) drag.moved = true;
  if (!input.pointer.down) onPointerUp();
}

function startLevel(i: number) {
  level = i;
  task = 0;
  right = 0;
  recent = [];
  mode = "play";
  rg.sound("click");
  rg.music("happy", { volume: 0.25 });
  next();
}

function tick(dt: number, input: any) {
  t += dt;
  if (mode !== "play") return;
  dragStep(input);
  // a food arriving in an animal's mouth: munch
  for (const q of fly) {
    if (q.eat && q.a >= 0 && t - q.t0 >= 0.35 && chew.t < q.t0) {
      chew = { k: q.a, t: t };
      rg.sound("pop", { pitch: 0.8 });
      const c = centre(animalRect(q.a));
      rg.celebrate(c[0], c[1] - 20, { sound: false });
      rg.vibrate(30);
    }
  }
  if (chew.k >= 0 && t - chew.t > 0.18 && t - chew.t < 0.18 + dt + 0.001) rg.sound("pop", { pitch: 0.65 });
  if (solved >= 0 && t - solved > 2.2) {
    if (!missed) right++;
    task++;
    if (task >= LEVELS[level].round) finish();
    else next();
  }
}

function finish() {
  mode = "done";
  rg.stopMusic();
  const n = LEVELS[level].round;
  if (right > best[level]) { best[level] = right; rg.save("best", best); }
  if (right * 2 >= n) rg.celebrate(width / 2, height * 0.3, { big: true }); else rg.sound("coin");
  rg.say(right >= 2 ? [right * 4 >= n * 3 ? "mahtavaa" : right * 2 >= n ? "hienoa" : "hyvin_meni", "sait", rg.sayId.number(right), "tahtea"] : ["hyvin_meni"]);
}

function toMenu() { mode = "menu"; rg.stopMusic(); rg.stopSay(); rg.sound("click"); }
function onBack() { if (mode === "menu") rg.exit(); else toMenu(); }

// ---- drawing -----------------------------------------------------------------

function wobble(k: number) {
  if (shake.k !== k) return 0;
  const e = Math.max(0, 1 - (t - shake.t) / 0.5);
  return Math.sin((t - shake.t) * 40) * 10 * e;
}
function munch(k: number) {
  if (chew.k !== k) return 0;
  const e = t - chew.t;
  return e < 0.8 ? Math.abs(Math.sin(e * 18)) * (1 - e / 0.8) : 0;
}

function Progress() {
  const dots = [];
  const n = LEVELS[level].round;
  for (let i = 0; i < n; i++) dots.push(<div className={i < task ? "dotdone" : i === task ? "dotnow" : "dot"} />);
  return <div className="progress">{dots}</div>;
}

function AnimalCard(k: number) {
  const r = animalRect(k);
  const m = munch(k) * (level === 0 ? 14 : 7);
  const dx = wobble(k);
  const big = level === 0;
  const done = fed[k] >= 0;
  const hot = drag.on && drag.moved && dropOn(drag.x, drag.y) === k;
  const pad = 6;
  const out = [
    <div className={done ? "card fedcard" : hot ? "card hotcard" : "card"} style={{ left: r.x - pad + dx - m / 2, top: r.y - pad - m / 2, width: r.w + pad * 2 + m, height: r.h + pad * 2 + (big ? 0 : 26) + m }} />,
    <img className="abs pic" src={rg.asset(A[animals[k]].img)} style={{ left: r.x + dx - m / 2, top: r.y - m / 2, width: r.w + m, height: r.h + m }} />,
  ];
  if (!big) out.push(<div className="abs aname" style={{ left: r.x + dx - 10, top: r.y + r.h + 2, width: r.w + 20 }}>{cap(an(animals[k]))}</div>);
  // what it ate, as a little badge on the photo (round 3), a heart when it is happy
  if (done && level === 2) {
    const fr = { x: r.x + r.w - 40, y: r.y + r.h - 40 };
    out.push(<img className="abs badge" src={rg.asset(F[fed[k]].img)} style={{ left: fr.x + dx, top: fr.y, width: 44, height: 44 }} />);
  }
  if (done && chew.k === k && t - chew.t < 2) {
    const up = (t - chew.t) * 30;
    out.push(<div className="abs heart" style={{ left: r.x + r.w / 2 - 20, top: r.y - 34 - up, opacity: Math.max(0, 1 - (t - chew.t) / 2) }}>💖</div>);
  }
  return out;
}

function FoodTile(j: number) {
  const r = foodRect(j);
  const out = [];
  const big = level === 1;
  // resting place: a plate
  out.push(<div className="plate" style={{ left: r.x - 6, top: r.y - 6, width: r.w + 12, height: r.h + 12 + (big ? 0 : 24) }} />);
  let x = r.x, y = r.y, w = r.w, h = r.h, show = !used[j], op = tried[j] && level === 0 ? 0.35 : 1;
  for (const q of fly) {
    if (q.f !== j) continue;
    const e = Math.min(1, (t - q.t0) / 0.35);
    if (e >= 1) { if (q.eat) show = false; continue; }
    const s = 1 - e * e * (q.eat ? 0.7 : 0);
    const cx = q.x0 + (q.x1 - q.x0) * e, cy = q.y0 + (q.y1 - q.y0) * e - Math.sin(e * Math.PI) * 40;
    w = r.w * s; h = r.h * s; x = cx - w / 2; y = cy - h / 2; show = true; op = 1;
  }
  if (drag.on && drag.j === j) { w = r.w * 1.1; h = r.h * 1.1; x = drag.x - drag.dx - w / 2; y = drag.y - drag.dy - h / 2; op = 1; }
  if (!big) out.push(<div className="abs fname" style={{ left: r.x - 10, top: r.y + r.h + 2, width: r.w + 20, opacity: used[j] ? 0.3 : 1 }}>{cap(fn(foods[j]))}</div>);
  if (selected === j && !used[j]) out.push(<div className="selring" style={{ left: r.x - 8, top: r.y - 8, width: r.w + 16, height: r.h + 16 }} />);
  return { base: out, top: show ? <img className="abs food" src={rg.asset(F[foods[j]].img)} style={{ left: x, top: y, width: w, height: h, opacity: op }} /> : null };
}

function Play() {
  const q = level === 0 ? rg.t("Mitä " + an(animals[0]) + " syö?", "What does the " + an(animals[0]) + " eat?", "¿Qué come " + A[animals[0]].name[3] + "?")
    : level === 1 ? rg.t("Kuka syö?", "Who eats it?", "¿Quién lo come?")
    : rg.t("Anna jokaiselle oma ruoka", "Feed everyone", "Dale a cada uno su comida");
  const tiles = foods.map((_, j) => FoodTile(j));
  const out = [<div className="abs head">{Progress()}<div className="ask" id="ask" onClick={() => ask()}>🔊 {q}</div></div>];
  for (const ti of tiles) for (const b of ti.base) out.push(b);
  for (let k = 0; k < animals.length; k++) for (const e of AnimalCard(k)) out.push(e);
  if (level === 0) out.push(<div className="abs aname bigname" style={{ left: 30, top: 306, width: 300 }}>{cap(an(animals[0]))}</div>);
  if (level === 1) out.push(<div className="abs aname bigname" style={{ left: 30, top: 254, width: 300 }}>{cap(fn(foods[0]))}</div>);
  if (level === 1) out.push(<div className="abs arrow" style={{ left: 154, top: animalRect(0).y - 56 }}>👇</div>);
  // foods last, so a dragged one is on top of everything
  for (let j = 0; j < tiles.length; j++) if (!(drag.on && drag.j === j) && tiles[j].top) out.push(tiles[j].top);
  if (drag.on && tiles[drag.j] && tiles[drag.j].top) out.push(tiles[drag.j].top);
  return <div className="screen">{out}</div>;
}

function Menu() {
  const bob = Math.sin(t * 2.5) * 6;
  return (
    <div className="screen col">
      <div className="title" style={{ marginTop: 40 + bob }}>{rg.t("Nälkäiset eläimet", "Hungry animals", "Animales hambrientos")}</div>
      <div className="lead">🐄 🥕 🐿️ 🌰 🐒 🍌</div>
      {LEVELS.map((L, i) => (
        <div className="level" id={"lv" + i} onClick={() => startLevel(i)} style={{ backgroundColor: L.color }}>
          <div className="lvname">{L.icon} {L.name}</div>
          <div className="lvsub">{L.sub}</div>
          <div className="lvbest">{best[i] > 0 ? "⭐ " + best[i] + "/" + L.round : ""}</div>
        </div>
      ))}
      <div className="small" id="credits" onClick={() => { mode = "credits"; page = 0; rg.sound("click"); }}><div className="lvname">📷 {rg.t("Kuvat", "Photos", "Fotos")}</div></div>
      <div className="small back" id="exit" onClick={() => rg.exit()}><div className="lvname">{rg.t("← Valikkoon", "← Menu", "← Menú")}</div></div>
    </div>
  );
}

function Credits() {
  const pages = Math.max(1, Math.ceil(CREDITS.length / PER_PAGE));
  const rows = (CREDITS as any[]).slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  return (
    <div className="screen col">
      <div className="ctitle">📷 {rg.t("Kuvien tekijät", "Photo credits", "Autores de las fotos")}</div>
      <div className="cnote">{rg.t("Kaikki kuvat Wikimedia Commonsista, vapailla lisensseillä (CC tai vapaa käyttö).", "All photos from Wikimedia Commons under free licences (CC or public domain).", "Todas las fotos son de Wikimedia Commons con licencias libres (CC o dominio público).")}</div>
      {rows.map((c) => (
        <div className="crow">
          <div className="cwhat">{c.what}</div>
          <div className="cwho">{c.author} · {c.license}</div>
          <div className="csrc">{c.file}</div>
        </div>
      ))}
      <div className="pager">
        <div className={page > 0 ? "pbtn" : "pbtnoff"} id="prev" onClick={() => { if (page > 0) { page--; rg.sound("click"); } }}>◀</div>
        <div className="pnum">{page + 1} / {pages}</div>
        <div className={page < pages - 1 ? "pbtn" : "pbtnoff"} id="next" onClick={() => { if (page < pages - 1) { page++; rg.sound("click"); } }}>▶</div>
      </div>
      <div className="small back" id="cback" onClick={() => toMenu()}><div className="lvname">{rg.t("← Takaisin", "← Back", "← Atrás")}</div></div>
    </div>
  );
}

function Done() {
  const n = LEVELS[level].round;
  const stars = [];
  for (let i = 0; i < n; i++) stars.push(<div className={i < right ? "bigstar" : "bigstaroff"}>⭐</div>);
  return (
    <div className="screen col">
      <div className="title" style={{ marginTop: 80 }}>{right * 4 >= n * 3 ? rg.t("Mahtavaa!", "Awesome!", "¡Fantástico!") : right * 2 >= n ? rg.t("Hienoa!", "Great!", "¡Genial!") : rg.t("Hyvä yritys!", "Good try!", "¡Buen intento!")}</div>
      <div className="lead">🐄 💖 🐿️ 💖 🐒</div>
      <div className="stars">{stars}</div>
      <div className="lead">{right} / {n} {rg.t("heti oikein", "right first time", "a la primera")}</div>
      <div className="level" id="again" onClick={() => startLevel(level)} style={{ backgroundColor: LEVELS[level].color }}><div className="lvname">{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div></div>
      <div className="small back" id="menu" onClick={() => toMenu()}><div className="lvname">{rg.t("← Takaisin", "← Back", "← Atrás")}</div></div>
    </div>
  );
}

function view() {
  let body;
  if (mode === "menu") body = Menu();
  else if (mode === "done") body = Done();
  else if (mode === "credits") body = Credits();
  else body = Play();
  return <div className="root">{body}</div>;
}
