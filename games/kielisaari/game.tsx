// Kielisaari (Mystery Island): an English or Spanish adventure for children
// who are about 8 and already read Finnish.
//
// Pip the parrot shows the child an island with a treasure. Its three map
// pieces are got by helping the island's animals: Tilly the turtle's things
// were washed into the sand, Momo the monkey is hungry, and Bruno the bear's
// café has guests waiting. With all three pieces the cave opens, and its box
// has three coloured locks. The animals speak only English or Spanish (the
// flag chosen at the start), so the language is the tool that gets things
// done, not a test.
//
// Every word goes the same way (the learning path): hear it (an animal's
// thing turns up and is named), recognise it ("Where is the shell?"), recall
// it (make the word from letters, then say it aloud), use it ("Give me two
// shells, please." with numbers and colours), and meet it again (later places
// ask for earlier words, and a new day starts with a warm-up of the words
// that are due, by a Leitner box schedule kept per language).
//
// A wrong answer is never punished: the tapped thing says its own name, the
// sentence is said again, and after a second miss the right one glows. 🔊
// says the sentence again, 💡 shows it in Finnish. The pictures are our own
// drawings (tools/kielisaari/art.js → img/*.png); the sentences are in
// lib/texts.ts and are voice clips voice/<lang>/island.json (tools/kielisaari/voice.js).

import { WORDS, COLORS, NUMBERS, T, wordLines, Word, Line } from "lib/texts";

type Lang = "en" | "es";
const LINES: { [id: string]: Line } = {};
for (const k in T) LINES[k] = T[k];
const WL = wordLines();
for (const k in WL) LINES[k] = WL[k];

// ---- the island ---------------------------------------------------------------

type Place = { id: string; name: Line; x: number; y: number; who: string; icon: string };
const PLACES: Place[] = [
  { id: "beach", name: { en: "Beach", es: "Playa", fi: "Ranta" }, x: 82, y: 372, who: "tilly", icon: "🐢" },
  { id: "garden", name: { en: "Garden", es: "Jardín", fi: "Hedelmätarha" }, x: 178, y: 182, who: "momo", icon: "🐒" },
  { id: "cafe", name: { en: "Café", es: "Café", fi: "Kahvila" }, x: 250, y: 380, who: "bruno", icon: "🐻" },
  { id: "cave", name: { en: "Cave", es: "Cueva", fi: "Luola" }, x: 252, y: 286, who: "pip", icon: "💎" },
];

// a thing in a scene: "shell", "apple_red", "key_blue" (img/<kind>.png)
function nounOf(kind: string) { return kind.split("_")[0]; }
function colorOf(kind: string) { const p = kind.split("_"); return p.length > 1 ? p[1] : ""; }

// Tasks. kinds: hunt (things in the scene, tap to meet them), pick (Where is…?),
// build (letters), give (collect things for an animal), key (a lock's key).
type Task = {
  kind: string; who?: string; say?: string; words?: string[]; word?: string;
  want?: { [k: string]: number }; pool?: string; lock?: string; revisit?: boolean;
};

const QUESTS: { [place: string]: Task[] } = {
  beach: [
    { kind: "talk", who: "tilly", say: "b_intro" },
    { kind: "hunt", who: "tilly", say: "b_find", words: ["shell", "fish", "star"] },
    { kind: "pick", who: "tilly", word: "star" },
    { kind: "pick", who: "tilly", word: "shell" },
    { kind: "pick", who: "tilly", word: "fish" },
    { kind: "build", who: "pip", word: "fish" },
    { kind: "give", who: "tilly", say: "b_use1", want: { shell: 2 }, pool: "beach" },
    { kind: "give", who: "tilly", say: "b_use2", want: { fish: 1, star: 1 }, pool: "beach" },
    { kind: "build", who: "pip", word: "star" },
    { kind: "give", who: "tilly", say: "b_use3", want: { star: 3 }, pool: "beach" },
    { kind: "reward", who: "tilly", say: "b_done" },
  ],
  garden: [
    { kind: "talk", who: "momo", say: "g_intro" },
    { kind: "pick", who: "pip", word: "shell", revisit: true },
    { kind: "hunt", who: "momo", say: "listen", words: ["apple", "banana", "flower"] },
    { kind: "hunt", who: "momo", say: "g_colors", words: ["red", "yellow", "blue", "green"] },
    { kind: "pick", who: "momo", word: "banana" },
    { kind: "pick", who: "momo", word: "apple" },
    { kind: "give", who: "momo", say: "g_use1", want: { apple_red: 3 }, pool: "garden" },
    { kind: "build", who: "pip", word: "apple" },
    { kind: "give", who: "momo", say: "g_use3", want: { banana: 2 }, pool: "garden" },
    { kind: "pick", who: "momo", word: "flower" },
    { kind: "give", who: "momo", say: "g_use4", want: { flower_blue: 1 }, pool: "garden" },
    { kind: "give", who: "momo", say: "g_use2", want: { apple_green: 2 }, pool: "garden" },
    { kind: "reward", who: "momo", say: "g_done" },
  ],
  cafe: [
    { kind: "talk", who: "bruno", say: "c_intro" },
    { kind: "hunt", who: "bruno", say: "listen", words: ["cake"] },
    { kind: "pick", who: "pip", word: "fish", revisit: true },
    { kind: "give", who: "momo", say: "c_order1", want: { banana: 2 }, pool: "cafe" },
    { kind: "give", who: "tilly", say: "c_order2", want: { fish: 1 }, pool: "cafe" },
    { kind: "build", who: "pip", word: "cake" },
    { kind: "give", who: "rabbit", say: "c_order3", want: { cake: 1, apple: 1 }, pool: "cafe" },
    { kind: "pick", who: "pip", word: "banana", revisit: true },
    { kind: "give", who: "rabbit", say: "c_order5", want: { flower_red: 1 }, pool: "cafe" },
    { kind: "give", who: "momo", say: "c_order4", want: { cake: 3 }, pool: "cafe" },
    { kind: "reward", who: "bruno", say: "c_done" },
  ],
  cave: [
    { kind: "talk", who: "pip", say: "k_intro" },
    { kind: "hunt", who: "pip", say: "listen", words: ["key"] },
    { kind: "key", who: "pip", lock: "red" },
    { kind: "key", who: "pip", lock: "blue" },
    { kind: "key", who: "pip", lock: "yellow" },
    { kind: "treasure", who: "pip", say: "treasure" },
  ],
};

// where things lie in each scene (x, y = the picture's centre; s = size)
type Spot = { kind: string; x: number; y: number; s: number };
const POOLS: { [id: string]: Spot[] } = {
  beach: [
    { kind: "shell", x: 50, y: 360, s: 62 }, { kind: "star", x: 130, y: 330, s: 62 }, { kind: "fish", x: 220, y: 345, s: 66 },
    { kind: "shell", x: 300, y: 380, s: 62 }, { kind: "star", x: 80, y: 430, s: 62 }, { kind: "fish", x: 170, y: 420, s: 66 },
    { kind: "star", x: 260, y: 440, s: 62 }, { kind: "shell", x: 330, y: 300, s: 56 },
  ],
  garden: [
    { kind: "apple_red", x: 70, y: 110, s: 50 }, { kind: "apple_green", x: 120, y: 70, s: 50 }, { kind: "apple_red", x: 175, y: 120, s: 50 },
    { kind: "apple_green", x: 230, y: 75, s: 50 }, { kind: "apple_red", x: 285, y: 120, s: 50 }, { kind: "apple_red", x: 130, y: 160, s: 50 },
    { kind: "apple_green", x: 225, y: 160, s: 50 }, { kind: "banana", x: 40, y: 200, s: 56 }, { kind: "banana", x: 320, y: 190, s: 56 },
    { kind: "banana", x: 300, y: 250, s: 56 }, { kind: "flower_red", x: 60, y: 420, s: 64 }, { kind: "flower_yellow", x: 150, y: 440, s: 64 },
    { kind: "flower_blue", x: 240, y: 420, s: 64 }, { kind: "flower_red", x: 320, y: 450, s: 60 }, { kind: "flower_blue", x: 30, y: 480, s: 56 },
  ],
  cafe: [
    { kind: "banana", x: 40, y: 330, s: 52 }, { kind: "banana", x: 85, y: 330, s: 52 }, { kind: "fish", x: 135, y: 332, s: 52 },
    { kind: "cake", x: 185, y: 328, s: 54 }, { kind: "cake", x: 235, y: 328, s: 54 }, { kind: "cake", x: 285, y: 328, s: 54 },
    { kind: "apple_red", x: 330, y: 332, s: 48 }, { kind: "flower_red", x: 60, y: 375, s: 48 }, { kind: "flower_blue", x: 110, y: 375, s: 48 },
    { kind: "flower_yellow", x: 160, y: 375, s: 48 }, { kind: "apple_green", x: 210, y: 375, s: 46 }, { kind: "fish", x: 260, y: 375, s: 50 },
    { kind: "banana", x: 310, y: 375, s: 50 },
  ],
};

// ---- progress and the word memory -----------------------------------------------

// A word's memory: stage on the learning path (0 new, 1 heard, 2 recognised,
// 3 recalled, 4 used), Leitner box (1–5) and the day it is due again.
type Mem = { stage: number; box: number; due: number; seen: number };
type Save = { done: string[]; maps: number; stars: number; mem: { [w: string]: Mem }; day: number; lastDay: string };
const BOX_DAYS = [0, 1, 2, 4, 7, 14];

let lang: Lang = "en";
let prog: Save = fresh();

function fresh(): Save { return { done: [], maps: 0, stars: 0, mem: {}, day: 0, lastDay: "" }; }

function today(): string {
  const d = new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function load(l: Lang) {
  lang = l;
  const s = rg.load("p_" + l, null);
  prog = s && s.mem ? s : fresh();
  // a new day of play: one step on the schedule
  const t = today();
  if (prog.lastDay !== t) { prog.day += 1; prog.lastDay = t; save(); }
}

function save() { rg.save("p_" + lang, prog); }

function mem(w: string): Mem {
  if (!prog.mem[w]) prog.mem[w] = { stage: 0, box: 1, due: 0, seen: 0 };
  return prog.mem[w];
}

// the word was met on the path at `stage`; first try or not decides the box
function learned(w: string, stage: number, firstTry: boolean) {
  const m = mem(w);
  m.seen += 1;
  if (stage > m.stage) m.stage = stage;
  if (stage >= 2) m.box = firstTry ? Math.min(5, m.box + 1) : 1;
  m.due = prog.day + BOX_DAYS[m.box];
  save();
}

// words due again today (seen before, their day has come)
function dueWords(): string[] {
  const out: string[] = [];
  for (const w of WORDS) {
    const m = prog.mem[w.id];
    if (m && m.stage >= 2 && m.due <= prog.day) out.push(w.id);
  }
  return rg.shuffle(out).slice(0, 4);
}

// ---- words in the chosen language ------------------------------------------------

function wordOf(id: string): Word | null {
  for (const w of WORDS) if (w.id === id) return w;
  return null;
}
function writtenWord(id: string): string {
  const w = wordOf(id);
  if (w) return lang === "en" ? w.en : w.es;
  for (const c of COLORS) if (c.id === id) return lang === "en" ? c.en : c.es;
  for (const n of NUMBERS) if (n.id === id) return lang === "en" ? n.en : n.es;
  return id;
}
function spelling(id: string): string {
  const w = wordOf(id);
  if (!w) return writtenWord(id);
  return lang === "en" ? w.en : w.esWord;
}
function line(id: string): string { const l = LINES[id]; return l ? l[lang] : ""; }
function fin(id: string): string { const l = LINES[id]; return l ? l.fi : ""; }
function clip(id: string): string { return lang + ":isl_" + id; }
function speakIds(ids: string[], opts?: any) { rg.say(ids.map((i) => clip(i)), opts); }

// ---- state -------------------------------------------------------------------------

type Mode = "flags" | "map" | "play" | "book" | "end";
type Thing = { kind: string; x: number; y: number; s: number; tx: number; ty: number; t: number; taken: boolean; found: boolean; glow: boolean; shake: number; i: number };

let mode: Mode = "flags";
let place = "";
let tasks: Task[] = [];
let ti = 0;
let task: Task = { kind: "" };
let sayId = "";           // the sentence of the task (🔊 says it again)
let sayExtra: string[] = [];
let showFi = false;
let clock = 0;
let ok = false;           // the task is done; it moves on by itself
let okClock = 0;
let tries = 0;            // misses in this task
let things: Thing[] = [];
let basket: Thing[] = [];
let card = "";            // a word card shown big (hunt), its kind
let cardWord = "";
let options: string[] = [];
let optShake = -1;
let optGlow = -1;
let letters: { c: string; used: boolean; shake: number; glow: boolean }[] = [];
let built = "";
let sayItClock = 0;       // after a word is made: the 🗣️ turn
let opened: string[] = [];
let mapPop = 0;
let warm: string[] = [];  // the day's warm-up words
let bubbleHere = false;   // café: the child's "Here you are!" bubble
let walk = 0;
let bookSel = "";

function init() {
  rg.closeButton = "right";
}

// ---- flow ----------------------------------------------------------------------

function chooseLang(l: Lang) {
  rg.sound("pop");
  rg.vibrate(15);
  load(l);
  const due = dueWords();
  if (prog.done.length > 0 && due.length > 0) {
    // a new day: first the words that are due
    warm = due;
    place = "warm";
    tasks = [{ kind: "talk", who: "pip", say: "warmup" }];
    for (const w of warm) tasks.push(mem(w).stage >= 3 ? { kind: "build", who: "pip", word: w, revisit: true } : { kind: "pick", who: "pip", word: w, revisit: true });
    tasks.push({ kind: "talk", who: "pip", say: "warmup_done" });
    startTasks();
    return;
  }
  toMap(prog.done.length === 0);
}

function toMap(first: boolean) {
  mode = "map";
  ok = false;
  clock = 0;
  sayId = first ? "map" : "map_next";
  sayExtra = [];
  if (first) speakIds(["hello", "welcome", "map"]);
  else speakIds([sayId]);
}

function placeOpen(p: Place): boolean {
  if (p.id === "cave") return prog.maps >= 3;
  return true;
}

function enterPlace(p: Place) {
  rg.sound("whoosh");
  if (!placeOpen(p)) {
    sayId = "k_need_map";
    speakIds([sayId]);
    return;
  }
  place = p.id;
  tasks = QUESTS[p.id];
  startTasks();
}

function startTasks() {
  mode = "play";
  ti = 0;
  startTask();
}

function startTask() {
  task = tasks[ti];
  ok = false;
  okClock = 0;
  tries = 0;
  clock = 0;
  card = "";
  options = [];
  optShake = -1;
  optGlow = -1;
  letters = [];
  built = "";
  sayItClock = 0;
  basket = [];
  bubbleHere = false;
  sayExtra = [];
  things = [];
  showFi = false;
  const k = task.kind;
  if (k === "talk" || k === "reward" || k === "treasure") {
    sayId = task.say || "";
    speakIds([sayId]);
    if (k === "treasure") { opened = []; rg.celebrate(180, 330, { big: true }); }
  } else if (k === "hunt") {
    sayId = task.say || "listen";
    const ws = task.words || [];
    const spots = [{ x: 90, y: 330 }, { x: 270, y: 330 }, { x: 180, y: 410 }, { x: 90, y: 490 }, { x: 270, y: 490 }];
    for (let i = 0; i < ws.length; i++) things.push(thing(huntKind(ws[i]), spots[i].x, spots[i].y, 76, i));
    speakIds([sayId]);
  } else if (k === "pick" || k === "key") {
    const target = k === "key" ? "key_" + task.lock : kindFor(task.word || "");
    sayId = k === "key" ? "k_" + task.lock : "where_" + task.word;
    const others = k === "key"
      ? rg.shuffle(COLORS.map((c) => "key_" + c.id).filter((x) => x !== target)).slice(0, 3)
      : rg.shuffle(learnedKinds().filter((x) => nounOf(x) !== nounOf(target))).slice(0, 2);
    options = rg.shuffle([target].concat(others));
    if (task.revisit) { sayExtra = ["remember"]; speakIds(["remember", sayId]); } else speakIds([sayId]);
  } else if (k === "build") {
    sayId = "build";
    const word = spelling(task.word || "").toLowerCase();
    const extra = rg.shuffle("aeioulnrst".split("").filter((c) => word.indexOf(c) < 0)).slice(0, word.length > 6 ? 1 : 2);
    letters = rg.shuffle(word.split("").concat(extra)).map((c) => ({ c: c, used: false, shake: 0, glow: false }));
    speakIds(task.revisit ? ["whatis", "build"] : ["build"]);
  } else if (k === "give") {
    sayId = task.say || "";
    const pool = POOLS[task.pool || "beach"];
    for (let i = 0; i < pool.length; i++) things.push(thing(pool[i].kind, pool[i].x, poolY(pool[i].y), pool[i].s, i));
    speakIds([sayId]);
  }
}

// the scenes stretch to the screen's height: a spot of the 560-high picture on the screen
function poolY(y: number) { return y * Math.max(1, height / 560); }

function thing(kind: string, x: number, y: number, s: number, i: number): Thing {
  return { kind: kind, x: x, y: y, s: s, tx: x, ty: y, t: 1, taken: false, found: false, glow: false, shake: 0, i: i };
}

function huntKind(w: string): string {
  if (w === "red" || w === "yellow" || w === "blue") return "flower_" + w;
  if (w === "green") return "apple_green";
  return kindFor(w);
}
function kindFor(w: string): string {
  if (w === "apple") return "apple_red";
  if (w === "flower") return "flower_yellow";
  if (w === "key") return "key_yellow";
  return w;
}
// pictures of words met so far (and of this place), for wrong options
function learnedKinds(): string[] {
  const out: string[] = [];
  for (const w of WORDS) if ((prog.mem[w.id] && prog.mem[w.id].stage >= 1) || w.place === place) out.push(kindFor(w.id));
  if (out.length < 3) for (const w of WORDS) if (out.indexOf(kindFor(w.id)) < 0) out.push(kindFor(w.id));
  return out;
}

function success(x: number, y: number, big?: boolean) {
  ok = true;
  okClock = 0;
  prog.stars += 1;
  save();
  rg.celebrate(x, y, { big: !!big });
  if (!big) speakIds([tries === 0 ? rg.pick(["great", "good", "yes", "super"]) : "good"], { queue: true });
}

function next() {
  ti += 1;
  if (ti >= tasks.length) {
    if (place === "warm") { toMap(false); return; }
    if (prog.done.indexOf(place) < 0) prog.done.push(place);
    save();
    toMap(false);
    return;
  }
  startTask();
}

function tick(dt: number) {
  clock += dt;
  walk += dt;
  if (mapPop > 0) mapPop = Math.max(0, mapPop - dt);
  if (sayItClock > 0) {
    sayItClock -= dt;
    if (sayItClock <= 0) { sayItClock = 0; success(180, 220); }
  }
  if (ok && mode === "play") {
    okClock += dt;
    if (okClock > (task.kind === "give" ? 2.6 : 1.8)) next();
  }
  for (const t of things) {
    if (t.t < 1) t.t = Math.min(1, t.t + dt * 2.5);
    if (t.shake > 0) t.shake = Math.max(0, t.shake - dt);
  }
  for (const l of letters) if (l.shake > 0) l.shake = Math.max(0, l.shake - dt);
}

// ---- actions ---------------------------------------------------------------------

function tapTalk() {
  if (ok) return;
  const k = task.kind;
  if (k === "reward") {
    if (place !== "warm" && prog.done.indexOf(place) < 0) prog.maps += 1;
    mapPop = 2.4;
    speakIds(["mappiece"]);
    success(180, 260, true);
    return;
  }
  ok = true;
  okClock = 1.2;
  rg.sound("click");
}

function tapHunt(t: Thing) {
  if (ok || card) return;
  rg.sound("pop");
  card = t.kind;
  cardWord = (task.words || [])[t.i];
  t.found = true;
  const w = cardWord;
  speakIds(wordOf(w) ? ["this_" + w, "w_" + w] : ["this_" + w, "w_" + w]);
}

function closeCard() {
  if (!card) return;
  learned(cardWord, 1, true);
  card = "";
  rg.sound("coin");
  if (things.every((t) => t.found)) success(180, 300);
}

function tapOption(o: string, i: number) {
  if (ok) return;
  const target = task.kind === "key" ? "key_" + task.lock : kindFor(task.word || "");
  if (o === target) {
    optGlow = i;
    if (task.kind === "key") { opened.push(task.lock || ""); learned("key", 2, tries === 0); rg.sound("coin"); }
    else learned(task.word || "", 2, tries === 0);
    success(60 + i * 120, 330);
    return;
  }
  // wrong: the thing says its name, then the question again; the second miss shows the answer
  tries += 1;
  optShake = i;
  rg.sound("tick");
  rg.vibrate(20);
  const name = task.kind === "key" ? "w_" + colorOf(o) : "w_" + nounOf(o);
  speakIds([name, tries >= 2 ? "look" : "almost", sayId]);
  if (tries >= 2) optGlow = options.indexOf(target);
}

function tapLetter(i: number) {
  if (ok || sayItClock > 0) return;
  const word = spelling(task.word || "").toLowerCase();
  const l = letters[i];
  if (l.used) return;
  const want = word.charAt(built.length);
  if (l.c === want) {
    l.used = true;
    built += l.c;
    rg.sound("pop");
    for (const q of letters) q.glow = false;
    if (built.length === word.length) {
      learned(task.word || "", 3, tries === 0);
      // the word aloud, then the child's turn to say it: a quiet moment
      // (about 2.5 s of speech, then 4 s for the child), or a tap on 🗣️ goes on
      speakIds(["w_" + task.word, "sayit"]);
      sayItClock = 6.5;
    }
    return;
  }
  tries += 1;
  l.shake = 0.4;
  rg.sound("tick");
  if (tries >= 2) {
    for (const q of letters) if (!q.used && q.c === want) { q.glow = true; break; }
    speakIds(["w_" + task.word]);
  }
}

function wanted(kind: string): string {
  const want = task.want || {};
  for (const k in want) if (kind === k || nounOf(kind) === k) return k;
  return "";
}

function tapThing(t: Thing) {
  if (ok || t.taken) return;
  t.taken = true;
  t.tx = 84 + basket.length * 44;
  t.ty = height - 118;
  t.t = 0;
  basket.push(t);
  rg.sound("pop");
  rg.vibrate(10);
  // the thing says what it is; the colour when the colour is what matters
  const want = task.want || {};
  let colorMatters = false;
  for (const k in want) if (colorOf(k) && nounOf(k) === nounOf(t.kind)) colorMatters = true;
  speakIds([colorMatters ? "w_" + colorOf(t.kind) : "w_" + nounOf(t.kind)]);
}

function unTake(t: Thing) {
  if (ok) return;
  t.taken = false;
  t.tx = POOLS[task.pool || "beach"][t.i].x;
  t.ty = poolY(POOLS[task.pool || "beach"][t.i].y);
  t.t = 0;
  basket = basket.filter((b) => b !== t);
  basket.forEach((b, k) => { b.tx = 84 + k * 44; b.t = Math.min(b.t, 0.5); });
  rg.sound("click");
}

function deliver() {
  if (ok) return;
  const want = task.want || {};
  const got: { [k: string]: number } = {};
  let wrong = 0;
  for (const b of basket) {
    const k = wanted(b.kind);
    if (!k) wrong++;
    else got[k] = (got[k] || 0) + 1;
  }
  let missing = 0, extra = 0;
  for (const k in want) {
    const n = got[k] || 0;
    if (n < want[k]) missing += want[k] - n;
    if (n > want[k]) extra += n - want[k];
  }
  if (!wrong && !missing && !extra) {
    for (const k in want) learned(nounOf(k), 4, tries === 0);
    things = things.filter((t) => !t.taken);
    basket = [];
    bubbleHere = true;
    speakIds(["here", "thanks"]);
    success(180, 240);
    return;
  }
  tries += 1;
  rg.sound("tick");
  rg.vibrate(20);
  speakIds([extra && !missing && !wrong ? "too_many" : missing && !wrong && !extra ? "more" : "almost", sayId]);
  // the wrong ones go back; after the second try the right things glow
  for (const b of basket.slice()) if (!wanted(b.kind) || extra) unTake(b);
  if (tries >= 2) for (const t of things) t.glow = !!wanted(t.kind) && !t.taken;
}

function again() {
  rg.sound("click");
  if (mode === "map" || task.kind === "talk" || task.kind === "reward") { speakIds([sayId]); return; }
  speakIds(sayExtra.concat([sayId]).filter((x) => !!x));
}

// ---- view ------------------------------------------------------------------------

function img(name: string, x: number, y: number, w: number, h: number, extra?: any) {
  // position "relative": a picture in the flow of its parent (no left/top)
  const flow = extra && extra.position === "relative";
  const st: any = flow ? { width: w, height: h } : { position: "absolute", left: x, top: y, width: w, height: h };
  if (extra) for (const k in extra) if (k !== "position") st[k] = extra[k];
  if (flow && y) st.marginTop = y;
  return <img src={rg.asset("img/" + name + ".png")} style={st} />;
}

function Background(name: string) {
  const k = Math.max(1, height / 560);
  return img("bg_" + name, (360 - 360 * k) / 2, 0, 360 * k, 560 * k);
}

function Bar() {
  return (
    <div className="bar">
      <div className="pill" id="again" onClick={() => again()}>🔊</div>
      <div className={showFi ? "pill pillon" : "pill"} id="fi" onClick={() => { showFi = !showFi; rg.sound("click"); }}>💡</div>
      <div className="pill">⭐ {prog.stars}</div>
      <div className="pill" id="book" onClick={() => { mode = "book"; bookSel = ""; rg.sound("click"); }}>📒</div>
      <div className="pill">🗺️ {prog.maps}/3</div>
    </div>
  );
}

function Bubble(who: string, id: string) {
  const text = line(id);
  if (!text) return null;
  const bob = Math.sin(walk * 2.2) * 3;
  return (
    <div className="talk">
      {img(who, 0, bob, 92, 92, { position: "relative" })}
      <div className="bubble" id="bubble" onClick={() => again()}>
        <div className="btext">{text}</div>
        {showFi ? <div className="bfi">{fin(id)}</div> : null}
      </div>
    </div>
  );
}

function FlagsView() {
  const l0 = rg.lang === "es" ? "es" : "en";
  return (
    <div className="screen sea">
      {Background("map")}
      <div className="center">
        <div className="title">Kielisaari</div>
        <div className="sub">{rg.t("Valitse kieli", "Choose a language", "Elige un idioma")}</div>
        <div className={l0 === "en" ? "flagbtn flagon" : "flagbtn"} id="en" onClick={() => chooseLang("en")}>
          <div className="flagbox">{img("flag_en", 0, 0, 120, 80, { position: "relative" })}</div>
          <div className="flagname">English</div>
        </div>
        <div className={l0 === "es" ? "flagbtn flagon" : "flagbtn"} id="es" onClick={() => chooseLang("es")}>
          <div className="flagbox">{img("flag_es", 0, 0, 120, 80, { position: "relative" })}</div>
          <div className="flagname">Español</div>
        </div>
        {img("pip", 0, 0, 110, 110, { position: "relative", marginTop: 6 })}
      </div>
    </div>
  );
}

function MapView() {
  const k = Math.max(1, height / 560);
  return (
    <div className="screen sea">
      {Background("map")}
      {PLACES.map((p) => {
        const done = prog.done.indexOf(p.id) >= 0;
        const open = placeOpen(p);
        const nextUp = !done && open;
        const pulse = nextUp ? 1 + Math.sin(walk * 4) * 0.06 : 1;
        const s = 74 * pulse;
        return (
          <div className={done ? "spot spotdone" : open ? "spot" : "spot spotlocked"} id={"p-" + p.id} onClick={() => enterPlace(p)}
            style={{ left: p.x * k - s / 2 + (360 - 360 * k) / 2, top: p.y * k - s / 2, width: s, height: s, borderRadius: s / 2 }}>
            <div className="spoticon">{open ? p.icon : "🔒"}</div>
            <div className="spotname">{p.name[lang]}{done ? " ✔" : ""}</div>
          </div>
        );
      })}
      <div className="maps">
        {[0, 1, 2].map((i) => (i < prog.maps ? img("map" + (i + 1), 0, 0, 54, 54, { position: "relative" }) : <div className="mapslot">?</div>))}
      </div>
      {Bubble("pip", sayId)}
      {Bar()}
    </div>
  );
}

function sceneOf(): string {
  if (place === "warm") return "map";
  return place;
}

function PlayView() {
  const k = task.kind;
  const who = task.who || "pip";
  return (
    <div className="screen">
      {Background(sceneOf())}
      {place === "warm" ? <div className="dim" /> : null}
      {k === "hunt" ? HuntView() : null}
      {k === "pick" || k === "key" ? PickView() : null}
      {k === "build" ? BuildView() : null}
      {k === "give" ? GiveView() : null}
      {k === "treasure" || k === "key" ? ChestView() : null}
      {k === "talk" || k === "reward" || k === "treasure" ? TalkTap() : null}
      {Bubble(who, k === "build" && sayItClock > 0 ? "sayit" : sayId)}
      {card ? CardView() : null}
      {mapPop > 0 ? MapPop() : null}
      {Bar()}
    </div>
  );
}

function TalkTap() {
  const k = task.kind;
  const label = k === "reward" ? rg.t("Ota karttapala!", "Take the map piece!", "¡Toma el trozo del mapa!")
    : k === "treasure" ? rg.t("Takaisin kartalle", "Back to the map", "Volver al mapa") : "▶";
  if (k === "treasure") {
    return <div className="go" id="go" style={{ top: height - 90 }} onClick={() => { rg.sound("click"); place = "cave"; ok = false; next(); }}>{label}</div>;
  }
  return (
    <div className="layer" id="go" onClick={() => tapTalk()}>
      {img(task.who || "pip", 80, 250 + Math.sin(walk * 3) * 4, 200, 200)}
      {ok ? null : <div className="go" style={{ top: height - 100 }}>{label}</div>}
    </div>
  );
}

function HuntView() {
  return (
    <div className="layer">
      {things.map((t) => {
        if (t.found) return img(t.kind, t.x - 26, 150, 52, 52, { left: 40 + t.i * 70, top: 160 });
        const wob = Math.sin(walk * 3 + t.i) * 4;
        return (
          <div className="hunt" id={"h" + t.i} onClick={() => tapHunt(t)} style={{ left: t.x - 50, top: t.y - 50 + wob }}>
            <div className="sand" />
            {img(t.kind, 12, 6, 76, 76, { opacity: 0.9 })}
            <div className="qmark">?</div>
          </div>
        );
      })}
    </div>
  );
}

function CardView() {
  return (
    <div className="overlay" id="card" onClick={() => closeCard()}>
      <div className="card">
        {img(card, 0, 0, 170, 170, { position: "relative" })}
        <div className="cardword">{writtenWord(cardWord)}</div>
        <div className="cardline">{line("this_" + cardWord)}</div>
        {showFi ? <div className="bfi">{fin("w_" + cardWord)}</div> : null}
        <div className="cardtap">👆 {rg.t("Napauta: reppuun!", "Tap: into the bag!", "¡Toca: a la mochila!")}</div>
      </div>
    </div>
  );
}

function PickView() {
  const n = options.length;
  const w = n > 3 ? 78 : 104;
  const gap = n > 3 ? 8 : 12;
  const left = (360 - (n * w + (n - 1) * gap)) / 2;
  const top = task.kind === "key" ? height - 170 : 300;
  return (
    <div className="layer">
      {options.map((o, i) => {
        const shake = optShake === i && clock < 99 ? Math.sin(walk * 40) * 0 : 0;
        const cls = optGlow === i ? (ok ? "opt optok" : "opt optglow") : "opt";
        return (
          <div className={cls} id={"o" + i} onClick={() => tapOption(o, i)} style={{ left: left + i * (w + gap) + shake, top: top, width: w, height: w + 10 }}>
            {img(o, 0, 0, w - 18, w - 18, { position: "relative" })}
          </div>
        );
      })}
    </div>
  );
}

function ChestView() {
  const k = task.kind;
  const all = k === "treasure";
  return (
    <div className="layer">
      {img(all ? "chest_open" : "chest", 80, all ? 250 : 230, 200, 200)}
      {k === "key" ? ["red", "blue", "yellow"].map((c, i) => img(opened.indexOf(c) >= 0 ? "key_" + c : "lock_" + c, 110 + i * 50, 340, 40, 46,
        { opacity: opened.indexOf(c) >= 0 ? 1 : 0.95 })) : null}
    </div>
  );
}

function BuildView() {
  const word = spelling(task.word || "").toLowerCase();
  const kind = kindFor(task.word || "");
  const slotW = Math.min(40, 300 / word.length);
  const n = letters.length;
  const tileW = Math.min(52, 320 / Math.ceil(n / (n > 6 ? 2 : 1)) - 8);
  const perRow = n > 6 ? Math.ceil(n / 2) : n;
  return (
    <div className="layer">
      <div className="buildcard" style={{ top: 160 }}>{img(kind, 0, 0, 130, 130, { position: "relative" })}</div>
      <div className="slots" style={{ top: 312 }}>
        {word.split("").map((c, i) => <div className={i < built.length ? "slot slotfull" : "slot"} style={{ width: slotW, height: slotW + 8 }}>{i < built.length ? c : ""}</div>)}
      </div>
      {sayItClock > 0 ? <div className="sayit" id="sayit" onClick={() => { if (sayItClock > 0.05) sayItClock = 0.05; }}>🗣️</div> : letters.map((l, i) => {
        const row = Math.floor(i / perRow), col = i % perRow;
        const rowN = Math.min(perRow, n - row * perRow);
        const x = (360 - rowN * (tileW + 8)) / 2 + col * (tileW + 8) + (l.shake > 0 ? Math.sin(l.shake * 60) * 5 : 0);
        if (l.used || built.length === word.length) return null;
        return <div className={l.glow ? "tile tileglow" : "tile"} id={"l" + i} onClick={() => tapLetter(i)}
          style={{ left: x, top: 392 + row * (tileW + 12), width: tileW, height: tileW + 6 }}>{l.c}</div>;
      })}
    </div>
  );
}

function GiveView() {
  const shop = task.pool === "cafe";
  return (
    <div className="layer">
      {shop ? <div className="guest">{img(task.who || "momo", 0, Math.sin(walk * 2) * 3, 120, 120, { position: "relative" })}</div> : null}
      {things.map((t) => {
        if (t.taken) return null;
        return (
          <div className={t.glow ? "thing thingglow" : "thing"} id={"t" + t.i} onClick={() => tapThing(t)}
            style={{ left: t.x - t.s / 2, top: t.y - t.s / 2, width: t.s, height: t.s, borderRadius: t.s / 2 }}>
            {img(t.kind, 0, 0, t.s, t.s)}
          </div>
        );
      })}
      <div className="basket" style={{ top: height - 150 }}>
        <div className="basketlabel">🧺</div>
      </div>
      {basket.map((b) => {
        const e = rg.ease.out(b.t);
        const x = rg.lerp(b.x, b.tx, e), y = rg.lerp(b.y, b.ty, e);
        return <div className="thing" id={"b" + b.i} onClick={() => unTake(b)} style={{ left: x - 21, top: y - 21, width: 42, height: 42 }}>{img(b.kind, 0, 0, 42, 42)}</div>;
      })}
      {ok ? (bubbleHere ? <div className="here" style={{ top: height - 210 }}>{line("here")}</div> : null)
        : <div className={basket.length ? "give" : "give givedim"} id="give" style={{ top: height - 76 }} onClick={() => deliver()}>
          {line("here")} ✔
        </div>}
    </div>
  );
}

function MapPop() {
  const n = Math.max(1, prog.maps);
  return (
    <div className="overlay overlaylight">
      {img("map" + n, 0, 0, 180, 180, { position: "relative", transform: "rotate(" + Math.round(Math.sin(walk * 3) * 6) + "deg)" })}
    </div>
  );
}

function BookView() {
  const met = WORDS.filter((w) => prog.mem[w.id] && prog.mem[w.id].stage >= 1);
  const extra = COLORS.filter((c) => prog.mem[c.id] && prog.mem[c.id].stage >= 1);
  return (
    <div className="screen book">
      <div className="booktitle">📒 {line("book")}</div>
      <div className="grid">
        {met.map((w) => {
          const m = prog.mem[w.id];
          return (
            <div className={bookSel === w.id ? "wcard wcardon" : "wcard"} id={"w-" + w.id} onClick={() => { bookSel = w.id; speakIds(["w_" + w.id]); }}>
              {img(kindFor(w.id), 0, 0, 64, 64, { position: "relative" })}
              <div className="wword">{lang === "en" ? w.en : w.es}</div>
              <div className="wstars">{"★★★★".slice(0, Math.min(4, m.stage))}{"☆☆☆☆".slice(0, 4 - Math.min(4, m.stage))}</div>
              {showFi ? <div className="wfi">{w.fi}</div> : null}
            </div>
          );
        })}
        {extra.map((c) => (
          <div className="wcard" id={"w-" + c.id} onClick={() => speakIds(["w_" + c.id])}>
            <div className="dot" style={{ backgroundColor: c.hex }} />
            <div className="wword">{lang === "en" ? c.en : c.es}</div>
            {showFi ? <div className="wfi">{c.fi}</div> : null}
          </div>
        ))}
        {met.length === 0 ? <div className="empty">{rg.t("Sanat tulevat tänne, kun löydät niitä.", "Words come here when you find them.", "Las palabras vienen aquí cuando las encuentras.")}</div> : null}
      </div>
      <div className="go" id="back" style={{ top: height - 80 }} onClick={() => { mode = place && tasks.length && ti < tasks.length && mode === "book" && lastMode === "play" ? "play" : "map"; rg.sound("click"); }}>
        ← {rg.t("Takaisin", "Back", "Volver")}
      </div>
      <div className="pill fitoggle" id="fi2" onClick={() => { showFi = !showFi; }}>💡</div>
    </div>
  );
}

let lastMode: Mode = "map";

function view() {
  if (mode !== "book") lastMode = mode;
  if (mode === "flags") return FlagsView();
  if (mode === "map") return MapView();
  if (mode === "book") return BookView();
  return PlayView();
}

function onBack() {
  if (mode === "book") { mode = lastMode; return; }
  if (mode === "play") { toMap(false); return; }
  if (mode === "map") { mode = "flags"; return; }
  rg.exit();
}
