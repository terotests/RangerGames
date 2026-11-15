// Ruoki eläimet: a feeding game for pre-schoolers. A photo of an animal and
// four photos of food; the child picks the food the animal really eats. The
// food flies into the animal's mouth, hearts pop up and the animal's real diet
// is said aloud ("Kissa syö kalaa, hiiriä ja lihaa."). Nothing needs reading:
// the question and every food's name are spoken, and tapping the animal
// repeats the question.
//
// Feeding again: after the right answer the food stays on the screen and can
// be tapped again and again (the animal eats every time), and the ➜ button
// goes on only when the child wants. Every animal fed once moves into the
// 🐾 Eläintarha (the zoo), where it can be fed again any time with all of its
// own foods.
//
// Stars and points: a round has ten animals. Right at once gives a ⭐ and 10
// points, right after a miss 5 points; each extra feeding gives 1 more point
// (at most 3 per animal).
//
// Diets: lib/diet.ts (only foods the animal does not eat are ever wrong
// answers). Photos: Wikimedia Commons (CC0 / public domain / CC BY / CC BY-SA),
// lib/photos.ts and CREDITS.md, made by tools/ruokinta/build.py.

import { FOODS, ANIMALS, ANSWER } from "lib/diet";
import { PHOTO, CREDITS } from "lib/photos";

type Mode = "menu" | "play" | "done" | "zoo" | "feed" | "credits";
type Fly = { food: string; x0: number; y0: number; t0: number };
type Heart = { x: number; y: number; t0: number; vx: number; icon: string };

const ROUND = 10;
const EXTRA = 3;            // extra feedings that still give a point
const FLY = 0.55;           // seconds for the food to fly to the animal
const PRAISE = ["hyva", "hienoa", "mahtavaa", "oikein", "loistavaa", "jee", "taitava", "osaat"];
const NAM = ["rk_nam", "rk_nam2", "rk_nam3"];
const PER_PAGE = 6;

let mode: Mode = "menu";
let t = 0;
let task = 0;
let stars = 0;
let points = 0;
let best = 0;
let animal = 0;             // index into ANIMALS
let opts: string[] = [];    // food ids on the screen
let wrong: string[] = [];
let fed = false;            // the right food has been given to this animal
let extra = 0;
let order: number[] = [];   // the round's animals
let shake = { i: -1, t: 0 };
let flies: Fly[] = [];
let hearts: Heart[] = [];
let bounce = -9;            // time the animal last got food
let zoo: any = {};          // animal id -> times fed (saved)
let page = 0;
let praiseN = 0;
let gain = { n: 0, t: -9 }; // "+10" shown over the score

function food(id: string) { for (const f of FOODS) if (f.id === id) return f; return FOODS[0]; }
function nm(o: any) { return rg.t(o.fi, o.en, o.es); }
function A() { return ANIMALS[animal]; }

function init() {
  best = rg.load("best", 0);
  zoo = rg.load("zoo", {});
}

// ---- layout (one place, so the flying food knows where it starts and lands) ----

function L() {
  const ph = Math.max(140, Math.min(240, height - 480));
  const pw = Math.round(ph * 4 / 3);
  const px = Math.round((width - pw - 12) / 2), py = 48;
  const ay = py + ph + 18;
  const gy = ay + 42;
  const ow = 156, oh = 136;
  return { ph, pw, px, py, ay, gy, ow, oh, ny: gy + 2 * (oh + 10) };
}
function optPos(j: number, n: number) {
  const l = L();
  const left = Math.round(width / 2 - 6 - l.ow), right = Math.round(width / 2 + 6);
  if (n === 1) return { x: Math.round((width - l.ow) / 2), y: l.gy };
  if (n === 3 && j === 2) return { x: Math.round((width - l.ow) / 2), y: l.gy + l.oh + 10 };
  return { x: j % 2 === 0 ? left : right, y: l.gy + Math.floor(j / 2) * (l.oh + 10) };
}

// ---- questions -------------------------------------------------------------------

function wrongFoods(a: any) {
  return FOODS.map((f) => f.id).filter((id) => a.eats.indexOf(id) < 0 && a.maybe.indexOf(id) < 0);
}

function newRound() {
  // ten different animals, not the same ones as last time if possible
  const last: string[] = rg.load("last", []);
  let pool = ANIMALS.map((_, i) => i).filter((i) => last.indexOf(ANIMALS[i].id) < 0);
  if (pool.length < ROUND) pool = ANIMALS.map((_, i) => i);
  order = rg.shuffle(pool).slice(0, ROUND);
  rg.save("last", order.map((i) => ANIMALS[i].id));
}

function makeQuestion() {
  animal = order[task];
  const a = A();
  const right = rg.pick(a.eats);
  const bad = rg.shuffle(wrongFoods(a));
  // wrong answers from different kinds of food where possible (not three plants)
  const out: string[] = [];
  const plant = (id: string) => ["heina", "lehdet", "voikukka", "porkkana", "banaani", "marjat", "pahkinat", "kapy", "jyvat"].indexOf(id) >= 0;
  for (const id of bad) { if (out.length >= 3) break; if (out.filter((o) => plant(o) === plant(id)).length < 2) out.push(id); }
  for (const id of bad) { if (out.length >= 3) break; if (out.indexOf(id) < 0) out.push(id); }
  opts = rg.shuffle([right].concat(out));
}

function ask() { rg.say("rk_q_" + A().id); }

function next() {
  wrong = [];
  fed = false;
  extra = 0;
  flies = [];
  shake = { i: -1, t: 0 };
  makeQuestion();
  ask();
}

function start() {
  task = 0; stars = 0; points = 0;
  mode = "play";
  rg.sound("click");
  rg.music("calm", { volume: 0.25 });
  newRound();
  next();
}

function feed(j: number) {
  const p = optPos(j, opts.length);
  const l = L();
  flies.push({ food: opts[j], x0: p.x + 6, y0: p.y + 6, t0: t });
  rg.sound("whoosh");
  const id = A().id;
  zoo[id] = (zoo[id] || 0) + 1;
  rg.save("zoo", zoo);
}

function addPoints(n: number) { points += n; gain = { n, t }; }

function choose(j: number) {
  const id = opts[j];
  const a = A();
  if (mode === "feed") { feed(j); rg.say(rg.pick(NAM)); return; }
  if (fed) {
    if (a.eats.indexOf(id) >= 0) {
      feed(j);
      if (extra < EXTRA) { extra++; addPoints(1); }
      rg.say(rg.pick(NAM));
    } else rg.say("rk_no_" + id);
    return;
  }
  if (wrong.indexOf(id) >= 0) { rg.say("rk_no_" + id); return; }
  if (a.eats.indexOf(id) >= 0) {
    fed = true;
    if (wrong.length === 0) { stars++; addPoints(10); } else addPoints(5);
    feed(j);
    rg.sound(wrong.length === 0 ? "star" : "coin");
    praiseN++;
    rg.say([PRAISE[praiseN % PRAISE.length], "rk_a_" + a.id]);
  } else {
    wrong.push(id);
    shake = { i: j, t };
    rg.sound("wrong");
    rg.vibrate(60);
    rg.say("rk_no_" + id);
  }
}

function goNext() {
  rg.sound("click");
  task++;
  if (task >= ROUND) {
    mode = "done";
    rg.stopMusic();
    if (points > best) { best = points; rg.save("best", best); }
    if (stars >= 5) rg.celebrate(width / 2, height * 0.3, { big: true }); else rg.sound("coin");
    rg.say(stars >= 2 ? [stars >= 8 ? "mahtavaa" : stars >= 5 ? "hienoa" : "hyvin_meni", "sait", rg.sayId.number(stars), "tahtea"] : ["hyvin_meni"]);
  } else next();
}

// the zoo: feed an animal again with all of its own foods
function openFeed(i: number) {
  animal = i;
  opts = ANIMALS[i].eats.slice();
  fed = true;
  wrong = [];
  flies = [];
  mode = "feed";
  rg.sound("click");
  rg.say("rk_q_" + ANIMALS[i].id);
}
function zooList() { return ANIMALS.map((_, i) => i).filter((i) => zoo[ANIMALS[i].id] > 0); }

function tick(dt: number) {
  t += dt;
  // food that reached the animal: hearts and a little hop
  const l = L();
  for (const f of flies) {
    if (t - f.t0 >= FLY) {
      bounce = t;
      for (let k = 0; k < 6; k++) hearts.push({ x: width / 2 + rg.range(-60, 60), y: l.py + l.ph * 0.55, t0: t + k * 0.05, vx: rg.range(-30, 30), icon: k % 3 === 2 ? "⭐" : "❤️" });
      if (mode === "play") rg.sound("pop");
    }
  }
  flies = flies.filter((f) => t - f.t0 < FLY);
  hearts = hearts.filter((h) => t - h.t0 < 1.3);
}

function toMenu() { mode = "menu"; rg.stopMusic(); rg.stopSay(); rg.sound("click"); }
function onBack() {
  if (mode === "menu") rg.exit();
  else if (mode === "feed") { mode = "zoo"; rg.stopSay(); rg.sound("click"); }
  else toMenu();
}

// ---- drawing -----------------------------------------------------------------

function wobble(j: number) {
  if (shake.i !== j) return 0;
  const k = Math.max(0, 1 - (t - shake.t) / 0.4);
  return Math.sin((t - shake.t) * 50) * 9 * k;
}

function Flying() {
  const l = L();
  const tx = width / 2 - 36, ty = l.py + l.ph * 0.45;
  return flies.map((f) => {
    const k = Math.min(1, (t - f.t0) / FLY);
    const x = f.x0 + (tx - f.x0) * k, y = f.y0 + (ty - f.y0) * k - Math.sin(k * Math.PI) * 90;
    const s = 1 - k * 0.5;
    return <img className="fly" src={rg.asset(PHOTO[f.food].f)} style={{ left: x, top: y, width: 144 * s, height: 96 * s }} />;
  });
}

function Hearts() {
  return hearts.filter((h) => t >= h.t0).map((h) => {
    const k = (t - h.t0) / 1.3;
    return <div className="heart" style={{ left: h.x + h.vx * k, top: h.y - 120 * k, opacity: 1 - k }}>{h.icon}</div>;
  });
}

function AnimalPhoto() {
  const l = L();
  const a = A();
  const hop = Math.max(0, 1 - (t - bounce) / 0.35);
  const dy = -Math.sin(hop * Math.PI) * 12;
  return (
    <div className="photo" id="animal" onClick={() => ask()} style={{ left: l.px, top: l.py + dy, width: l.pw + 12, height: l.ph + 12 }}>
      <img className="photoimg" src={rg.asset(PHOTO[a.id].f)} style={{ width: l.pw, height: l.ph }} />
    </div>
  );
}

function Options() {
  const l = L();
  return opts.map((id, j) => {
    const f = food(id);
    const good = A().eats.indexOf(id) >= 0;
    const ok = fed && good;
    const no = wrong.indexOf(id) >= 0 || (fed && !good);
    const p = optPos(j, opts.length);
    const pulse = ok ? Math.sin(t * 5) * 3 : 0;
    return (
      <div className={ok ? "optok" : no ? "optno" : "opt"} id={"o" + j} onClick={() => choose(j)}
        style={{ left: p.x + wobble(j), top: p.y - pulse, width: l.ow, height: l.oh }}>
        <div className="optpic" style={{ opacity: no ? 0.35 : 1 }}><img className="optimg" src={rg.asset(PHOTO[id].f)} /></div>
        <div className="optname">{ok ? "👆 " + nm(f) : no ? "✕ " + nm(f) : nm(f)}</div>
      </div>
    );
  });
}

function Play() {
  const l = L();
  const dots = [];
  for (let i = 0; i < ROUND; i++) dots.push(<div className={i < task ? "dotdone" : i === task ? "dotnow" : "dot"} />);
  const g = t - gain.t < 1 ? gain : null;
  return (
    <div className="screen">
      <div className="score" style={{ left: 10, top: 10 }}>⭐ {stars}  ·  {points}</div>
      {g ? <div className="gain" style={{ left: 120, top: 10 - (t - g.t) * 20, opacity: 1 - (t - g.t) }}>+{g.n}</div> : null}
      <div className="dots" style={{ left: width - 200, top: 18 }}>{dots}</div>
      {AnimalPhoto()}
      <div className="ask" id="ask" onClick={() => ask()} style={{ left: 0, top: l.ay, width: width }}>
        🔊 {rg.t("Mitä " + A().fi.toLowerCase() + " syö?", "What does the " + A().en.toLowerCase() + " eat?", "" + nm(A()) + ": ¿qué come?")}
      </div>
      {Options()}
      {fed ? <div className="next" id="next" onClick={() => goNext()} style={{ left: (width - 220) / 2, top: l.ny }}><div className="nexttext">➜</div></div> : null}
      {Flying()}
      {Hearts()}
    </div>
  );
}

function Feed() {
  const l = L();
  const a = A();
  return (
    <div className="screen">
      <div className="score" style={{ left: 10, top: 10 }}>❤️ {zoo[a.id] || 0}</div>
      {AnimalPhoto()}
      <div className="ask" id="ask" onClick={() => ask()} style={{ left: 0, top: l.ay, width: width }}>🔊 {nm(a)}</div>
      {Options()}
      <div className="next back" id="zback" onClick={() => onBack()} style={{ left: (width - 220) / 2, top: l.ny }}><div className="nexttext">🐾</div></div>
      {Flying()}
      {Hearts()}
    </div>
  );
}

function Menu() {
  const bob = Math.sin(t * 2.5) * 6;
  const n = zooList().length;
  return (
    <div className="col">
      <div className="title" id="title" onClick={() => rg.say("rk_nimi")} style={{ marginTop: 46 + bob }}>{rg.t("Ruoki eläimet", "Feed the animals", "Alimenta a los animales")}</div>
      <div className="lead">🦁 🥩  🐰 🥕  🐿️ 🌰</div>
      <div className="level" id="play" onClick={() => start()}>
        <div className="lvname">▶ {rg.t("Pelaa", "Play", "Jugar")}</div>
        <div className="lvsub">{best > 0 ? "⭐ " + best : ""}</div>
      </div>
      <div className={n > 0 ? "level zoo" : "level zoo off"} id="zoo" onClick={() => { if (n > 0) { mode = "zoo"; page = 0; rg.sound("click"); rg.say("rk_zoo"); } }}>
        <div className="lvname">🐾 {rg.t("Eläintarha", "Zoo", "Zoo")}</div>
        <div className="lvsub">{n} / {ANIMALS.length}</div>
      </div>
      <div className="small" id="credits" onClick={() => { mode = "credits"; page = 0; rg.sound("click"); }}><div className="smname">📷 {rg.t("Kuvat", "Photos", "Fotos")}</div></div>
      <div className="small back" id="exit" onClick={() => rg.exit()}><div className="smname">{rg.t("← Valikkoon", "← Menu", "← Menú")}</div></div>
    </div>
  );
}

function Zoo() {
  const list = zooList();
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (page >= pages) page = pages - 1;
  const rows = list.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  return (
    <div className="col">
      <div className="ctitle">🐾 {rg.t("Eläintarha", "Zoo", "Zoo")}</div>
      <div className="zgrid">
        {rows.map((i) => (
          <div className="zcard" id={"z" + i} onClick={() => openFeed(i)}>
            <img className="zimg" src={rg.asset(PHOTO[ANIMALS[i].id].f)} />
            <div className="zname">❤️ {zoo[ANIMALS[i].id]}</div>
          </div>
        ))}
      </div>
      <div className="pager">
        <div className={page > 0 ? "pbtn" : "pbtn off"} id="zprev" onClick={() => { if (page > 0) { page--; rg.sound("click"); } }}>◀</div>
        <div className="pnum">{page + 1} / {pages}</div>
        <div className={page < pages - 1 ? "pbtn" : "pbtn off"} id="znext" onClick={() => { if (page < pages - 1) { page++; rg.sound("click"); } }}>▶</div>
      </div>
      <div className="small back" id="zmenu" onClick={() => toMenu()}><div className="smname">{rg.t("← Takaisin", "← Back", "← Atrás")}</div></div>
    </div>
  );
}

function Credits() {
  const pages = Math.max(1, Math.ceil(CREDITS.length / PER_PAGE));
  const rows = (CREDITS as any[]).slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  return (
    <div className="col">
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
        <div className={page > 0 ? "pbtn" : "pbtn off"} id="prev" onClick={() => { if (page > 0) { page--; rg.sound("click"); } }}>◀</div>
        <div className="pnum">{page + 1} / {pages}</div>
        <div className={page < pages - 1 ? "pbtn" : "pbtn off"} id="next" onClick={() => { if (page < pages - 1) { page++; rg.sound("click"); } }}>▶</div>
      </div>
      <div className="small back" id="cback" onClick={() => toMenu()}><div className="smname">{rg.t("← Takaisin", "← Back", "← Atrás")}</div></div>
    </div>
  );
}

function Done() {
  const row = [];
  for (let i = 0; i < ROUND; i++) row.push(<div className={i < stars ? "bigstar" : "bigstar off"}>⭐</div>);
  return (
    <div className="col">
      <div className="title" style={{ marginTop: 70 }}>{stars >= 8 ? rg.t("Mahtavaa!", "Awesome!", "¡Fantástico!") : stars >= 5 ? rg.t("Hienoa!", "Great!", "¡Genial!") : rg.t("Hyvä yritys!", "Good try!", "¡Buen intento!")}</div>
      <div className="stars">{row}</div>
      <div className="lead">{points} {rg.t("pistettä", "points", "puntos")}</div>
      <div className="level" id="again" onClick={() => start()}><div className="lvname">{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div></div>
      <div className="level zoo" id="tozoo" onClick={() => { mode = "zoo"; page = 0; rg.sound("click"); rg.say("rk_zoo"); }}><div className="lvname">🐾 {rg.t("Eläintarha", "Zoo", "Zoo")}</div></div>
      <div className="small back" id="menu" onClick={() => toMenu()}><div className="smname">{rg.t("← Takaisin", "← Back", "← Atrás")}</div></div>
    </div>
  );
}

function view() {
  let body;
  if (mode === "menu") body = Menu();
  else if (mode === "done") body = Done();
  else if (mode === "credits") body = Credits();
  else if (mode === "zoo") body = Zoo();
  else if (mode === "feed") body = Feed();
  else body = Play();
  return <div className="root">{body}</div>;
}
