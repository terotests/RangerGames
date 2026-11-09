// Kielipelit: English and Spanish for children (5–8 years). The flag picks
// the language; everything is said aloud, so no reading is needed. Four games:
//  Sanat    - words: hear and pick the picture, memory pairs, which word is
//             this (8 v), make the word from letters (8 v)
//  Etsi     - "Find the red key.": coloured things in a room open a treasure
//             chest; 8 v: "Put the red ball" + "under the bed."
//  Kahvila  - a café: animals order ("I'd like two apples, please.") and
//             the child serves them
//  Tarina   - a short story about Pip the dog, where the child chooses what happens
// Words come back in every game. Sanat remembers how well each word is
// known (Leitner boxes) and asks the weak and the due ones more often.
// A wrong answer is a hint, never a punishment: the thing tapped is named,
// and the question is said again.

import { WORDS, COLORS, OBJECTS, FIND_COLORS, PLACES, MENU, CAFE_MAX, STORY, clipTexts } from "lib/words";

type Mode = "menu" | "sanat" | "etsi" | "kahvila" | "tarina" | "done";
type Later = { at: number; f: () => void };
type Spark = { x: number; y: number; vx: number; vy: number; t: number; c: string };

const SPARK = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#ffffff"];
const PRAISE = ["great", "well_done", "super", "good_job", "correct"];
const GAMES = [
  { id: "sanat", e: "🍎", name: "Sanat", sub: "Kuuntele ja valitse kuva", color: "#ef476f" },
  { id: "etsi", e: "🔑", name: "Etsi", sub: "Etsi värikkäät esineet", color: "#118ab2" },
  { id: "kahvila", e: "🍰", name: "Kahvila", sub: "Palvele eläinasiakkaita", color: "#f78c6b" },
  { id: "tarina", e: "📖", name: "Tarina", sub: "Pip-koiran päivä", color: "#06a77d" },
];

let mode: Mode = "menu";
let game = "sanat";          // the game the "done" screen belongs to
let lang = "en";
let hard = false;
let t = 0;
let laters: Later[] = [];
let sparks: Spark[] = [];
let praiseN = 0;
let stars = 0;               // this round
let rounds = 0;              // rounds played (for the word memory)
let mem: any = { en: {}, es: {} };
let best: any = {};

function init() {
  const r: any = rg;
  const g = typeof r.lang === "string" ? r.lang : "";
  lang = g === "en" || g === "es" ? g : rg.load("lang", "en");
  hard = rg.load("hard", false);
  mem = rg.load("mem", { en: {}, es: {} });
  rounds = rg.load("rounds", 0);
  best = rg.load("best", {});
}

// ---- helpers ---------------------------------------------------------------

// a clip in the chosen language (voice/<lang>/*.json)
function say(ids: any, opts?: any) {
  const a = Array.isArray(ids) ? ids : [ids];
  const out: string[] = [];
  for (const id of a) if (id) out.push(lang + ":" + id);
  rg.say(out, opts);
}
// the clip texts, shown on the screen as they are said (the game works without sound too)
const TEXTS: any = { en: clipTexts("en"), es: clipTexts("es") };
function txt(id: string) { const T = TEXTS[lang]; return T.game[id] || T.common[id] || ""; }
// the task card: the sentence in the chosen language, and in Finnish what to do
let card = { text: "", fi: "", bold: "" };
// bold: the words of the text to show in bold (the word being learnt)
function setCard(text: string, fi: string, bold?: string) { card = { text: text, fi: fi, bold: bold || "" }; }
// feedback: ✓ or ✗ with what was said, shown for a moment
let fb = { text: "", ok: true, at: -9 };
function feedback(ok: boolean, ids: string[]) {
  fb = { text: (ok ? "✓ " : "✗ ") + ids.map((i) => txt(i)).filter((x) => !!x).join(" "), ok: ok, at: t };
  say(ids);
}
function Card(small?: boolean) {
  return (
    <div className="task" id="task" onClick={() => repeat()}>
      <div className="twords">{Words(card.text, card.bold, small)}</div>
      <div className="tfi">{card.fi}</div>
    </div>
  );
}
// the text as one box per word, so that the learnt word can be bold and coloured
function Words(text: string, bold: string, small?: boolean) {
  const bw = bold.toLowerCase().split(" ").filter((x) => !!x);
  const ws = text.split(" ").filter((x) => !!x);
  // where the bold words start in the text (ignoring punctuation and case)
  const clean = (x: string) => x.toLowerCase().replace(/[¿?¡!.,:]/g, "");
  let at = -1;
  for (let i = 0; bw.length && i + bw.length <= ws.length; i++) {
    let ok = true;
    for (let k = 0; k < bw.length; k++) if (clean(ws[i + k]) !== clean(bw[k])) ok = false;
    if (ok) { at = i; break; }
  }
  return ws.map((w, i) => {
    const b = at >= 0 && i >= at && i < at + bw.length;
    return <div className={(small ? "tw s" : "tw") + (b ? " b" : "")}>{w}</div>;
  });
}
function Feedback() {
  const age = t - fb.at;
  if (age > 2.6 || !fb.text) return null;
  return <div className={fb.ok ? "fb ok" : "fb bad"} style={{ opacity: String(Math.min(1, (2.6 - age) * 3)) }}>{fb.text}</div>;
}
function repeat() {
  if (mode === "sanat") sAsk(); else if (mode === "etsi") eAsk(); else if (mode === "kahvila") cAsk(false); else if (mode === "tarina") say("kp_" + scene.id);
}
function fiWord(w: any) { return w.fi; }
function praise() { praiseN++; return PRAISE[praiseN % PRAISE.length]; }
function later(s: number, f: () => void) { laters.push({ at: t + s, f: f }); }
function word(id: string): any { for (const w of WORDS) if (w.id === id) return w; return WORDS[0]; }
function color(id: string): any { for (const c of COLORS) if (c.id === id) return c; return COLORS[0]; }
function label(w: any) { return w[lang]; }
function bare(w: any) { return lang === "es" ? w.es.replace(/^(el|la) /, "") : w.en; }
function burst(x: number, y: number, n: number) {
  for (let k = 0; k < n; k++) {
    const a = rg.random() * Math.PI * 2, sp = 80 + rg.random() * 220;
    sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, t: 0, c: rg.pick(SPARK) });
  }
}
function shakeX(at: number) {
  if (at <= 0) return 0;
  const k = Math.max(0, 1 - (t - at) / 0.4);
  return Math.sin((t - at) * 50) * 9 * k;
}

// the word memory: box 0–4 per word and language, and the round it was last seen
function memOf(id: string) { const m = mem[lang] || (mem[lang] = {}); return m[id]; }
function grade(id: string, ok: boolean) {
  const m = mem[lang] || (mem[lang] = {});
  const o = m[id] || { b: 0, r: rounds };
  o.b = ok ? Math.min(4, o.b + 1) : Math.max(0, o.b - 1);
  o.r = rounds;
  m[id] = o;
}
function weight(w: any) {
  const m = memOf(w.id);
  if (!m) return 3;                                   // new: comes in steadily
  const due = rounds - m.r >= (1 << m.b);
  return (due ? 4 : 1) * (5 - m.b);
}
// n different words, the weak and the due ones first
function pickWords(n: number, ok: (w: any) => boolean, not?: string[]): any[] {
  let pool = WORDS.filter((w: any) => ok(w) && (!not || not.indexOf(w.id) < 0));
  const out: any[] = [];
  while (out.length < n && pool.length) {
    let sum = 0;
    for (const w of pool) sum += weight(w);
    let r = rg.random() * sum, i = 0;
    for (; i < pool.length - 1; i++) { r -= weight(pool[i]); if (r <= 0) break; }
    out.push(pool[i]);
    pool = pool.filter((_w: any, k: number) => k !== i);
  }
  return out;
}

function finish(n: number, of: number) {
  stars = n;
  game = mode;
  mode = "done";
  rounds++;
  const k = game + (hard ? "2" : "1");
  if (!best[k] || n > best[k]) best[k] = n;
  rg.save("best", best);
  rg.save("mem", mem);
  rg.save("rounds", rounds);
  rg.stopMusic();
  if (n * 2 >= of) rg.celebrate(width / 2, height * 0.3, { big: true }); else rg.sound("coin");
}

function onClose() {
  if (mode !== "menu") { toMenu(); return false; }
  return true;
}
function onBack() { if (mode === "menu") rg.exit(); else toMenu(); }
function toMenu() { mode = "menu"; laters = []; rg.stopMusic(); rg.stopSay(); rg.sound("click"); }

function start(id: string) {
  rg.sound("click");
  laters = [];
  stars = 0;
  if (id === "sanat") startSanat();
  else if (id === "etsi") startEtsi();
  else if (id === "kahvila") startCafe();
  else startStory();
}

// ==== Sanat ===================================================================

type Card = { w: any; text: boolean; open: boolean; done: boolean; at: number };
const S_ROUND = 8;
let sKind = "pick";
let sTask = 0;
let sTarget: any = WORDS[0];
let sChoices: any[] = [];
let sShake: number[] = [];
let sTapped: number[] = [];      // the wrong pictures tapped: their words are shown
let sSolved = -1;
let sMistakes = 0;
let sRecent: string[] = [];
let sCards: Card[] = [];
let sFirst = -1;                 // the open card waiting for its pair
let sBuilt = "";
let sLetters: { ch: string; used: boolean; at: number }[] = [];

function startSanat() {
  mode = "sanat";
  sTask = 0;
  rg.music("calm", { volume: 0.3 });
  sNext();
}

function sNext() {
  const kinds = hard ? ["pick", "recall", "build", "memory"] : ["pick", "pick", "memory", "pick"];
  sKind = kinds[sTask % kinds.length];
  sSolved = -1;
  sMistakes = 0;
  sFirst = -1;
  if (sKind === "memory") {
    const ws = pickWords(hard ? 4 : 3, (w: any) => true, sRecent);
    let cards: Card[] = [];
    for (const w of ws) {
      cards.push({ w: w, text: false, open: false, done: false, at: 0 });
      cards.push({ w: w, text: hard, open: false, done: false, at: 0 });
    }
    sCards = rg.shuffle(cards);
    sAsk();
    return;
  }
  const short = (w: any) => { const b = bare(w); return b.indexOf(" ") < 0 && b.length <= 7; };
  sTarget = pickWords(1, sKind === "build" ? short : (w: any) => true, sRecent)[0];
  sRecent.push(sTarget.id);
  if (sRecent.length > 6) sRecent.shift();
  const n = sKind === "recall" ? 3 : hard ? 4 : 3;
  // the other choices: the same kind of thing (animals with animals), so the picture alone does not tell
  const others = rg.shuffle(WORDS.filter((w: any) => w.id !== sTarget.id && w.c === sTarget.c)).slice(0, n - 1);
  sChoices = rg.shuffle([sTarget].concat(others));
  sShake = sChoices.map(() => 0);
  sTapped = [];
  if (sKind === "build") {
    sBuilt = "";
    const letters = bare(sTarget).toUpperCase().split("");
    sLetters = rg.shuffle(letters.map((ch: string) => ({ ch: ch, used: false, at: 0 })));
  }
  sAsk();
}

function sAsk() {
  if (sKind === "pick") {
    setCard(txt("kp_where_" + sTarget.id), "Missä on " + fiWord(sTarget) + "? Napauta oikeaa kuvaa.", label(sTarget));
    // the sentence, then the word alone: the word is the one to learn
    say(["kp_where_" + sTarget.id, sTarget.id]);
  } else if (sKind === "recall") {
    setCard(txt("kp_what"), "Mikä tämä on? Napauta oikeaa sanaa. 🔊 sanoo sanan ääneen.");
    say("kp_what");
  } else if (sKind === "build") {
    setCard(txt("kp_build") + "  " + bare(sTarget).toUpperCase(), "Kokoa sana kirjaimista oikeassa järjestyksessä (" + fiWord(sTarget) + ").", bare(sTarget).toUpperCase());
    say(["kp_build", sTarget.id]);
  } else {
    setCard(txt("kp_pairs"), hard ? "Käännä kortteja: yhdistä kuva ja sana." : "Käännä kaksi korttia. Etsi samat kuvat.");
    say("kp_pairs");
  }
}

function sWin() {
  sSolved = t;
  if (sMistakes === 0) stars++;
  rg.sound(sMistakes === 0 ? "star" : "coin");
  rg.celebrate(width / 2, height * 0.45, { sound: false });
  later(1.8, () => { sTask++; if (sTask >= S_ROUND) finish(stars, S_ROUND); else sNext(); });
}

function sPick(i: number) {
  if (sSolved >= 0) return;
  const w = sChoices[i];
  if (w.id === sTarget.id) {
    grade(w.id, sMistakes === 0);
    feedback(true, [w.id, sKind === "pick" ? "correct" : praise()]);
    sWin();
  } else {
    sMistakes++;
    sShake[i] = t;
    sTapped.push(i);
    rg.sound("wrong");
    rg.vibrate(50);
    // name what was tapped, then ask again
    feedback(false, [w.id, sKind === "pick" ? "kp_where_" + sTarget.id : "try_again"]);
  }
}

function sCard(i: number) {
  const c = sCards[i];
  if (c.open || c.done || sSolved >= 0) return;
  if (sCards.filter((x) => x.open && !x.done).length >= 2) return;
  c.open = true;
  c.at = t;
  rg.sound("pop");
  say(c.w.id);
  if (sFirst < 0) { sFirst = i; return; }
  const a = sCards[sFirst];
  sFirst = -1;
  if (a.w.id === c.w.id) {
    later(0.5, () => {
      a.done = true; c.done = true;
      rg.sound("coin");
      burst(width / 2, height * 0.5, 10);
      grade(c.w.id, true);
      if (sCards.every((x) => x.done)) { feedback(true, [praise()]); sWin(); }
      else fb = { text: "✓ " + label(c.w), ok: true, at: t };
    });
  } else {
    sMistakes++;
    fb = { text: "✗ " + label(a.w) + " ≠ " + label(c.w), ok: false, at: t };
    later(1.1, () => { a.open = false; c.open = false; });
  }
}

function sLetter(i: number) {
  if (sSolved >= 0) return;
  const l = sLetters[i];
  if (l.used) return;
  const want = bare(sTarget).toUpperCase().charAt(sBuilt.length);
  if (l.ch === want) {
    l.used = true;
    sBuilt += l.ch;
    rg.sound("pop", { pitch: 1 + sBuilt.length * 0.08 });
    if (sBuilt.length === bare(sTarget).length) {
      grade(sTarget.id, sMistakes === 0);
      feedback(true, [sTarget.id, praise()]);
      sWin();
    }
  } else {
    l.at = t;
    sMistakes++;
    fb.text = "✗ " + (lang === "es" ? "No es " : "Not ") + l.ch;
    rg.sound("wrong");
    rg.vibrate(40);
  }
}

function Sanat() {
  const head = (
    <div className="bar">
      {Dots(sTask, S_ROUND)}
      <div className="speak" id="ask" onClick={() => sAsk()}>🔊</div>
    </div>
  );
  const top = [head, Card()];
  if (sKind === "memory") {
    return (
      <div className="screen">
        {top}
        <div className={hard ? "cards c4" : "cards c3"}>
          {sCards.map((c, i) => (
            <div className={(c.done ? "mcard done" : c.open ? "mcard open" : "mcard") + (hard ? " sm" : "")} id={"mc" + i} onClick={() => sCard(i)}>
              {c.open || c.done ? (c.text ? <div className="mtext">{label(c.w)}</div> : <div className="mpic"><div className={hard ? "memo sm" : "memo"}>{c.w.e}</div><div className="mlabel">{label(c.w)}</div></div>) : <div className="mback">?</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (sKind === "build") {
    const w = bare(sTarget).toUpperCase();
    const slots = [];
    for (let i = 0; i < w.length; i++) slots.push(<div className={i < sBuilt.length ? "slot full" : "slot"}>{i < sBuilt.length ? w.charAt(i) : ""}</div>);
    return (
      <div className="screen">
        {top}
        <div className="bigpic" id="pic" onClick={() => say(sTarget.id)} style={{ marginTop: Math.sin(t * 2.2) * 5 }}>{sTarget.e}</div>
        <div className="slots">{slots}</div>
        <div className="letters">
          {sLetters.map((l, i) => {
            const dx = shakeX(l.at);
            return <div className={l.used ? "ltile used" : "ltile"} id={"lt" + i} onClick={() => sLetter(i)} style={{ marginLeft: 5 + dx, marginRight: 5 - dx }}>{l.used ? "" : l.ch}</div>;
          })}
        </div>
      </div>
    );
  }
  if (sKind === "recall") {
    return (
      <div className="screen">
        {top}
        <div className="bigpic" id="pic" style={{ marginTop: Math.sin(t * 2.2) * 5 }}>{sTarget.e}</div>
        <div className="rlist">
          {sChoices.map((w, i) => {
            const ok = sSolved >= 0 && w.id === sTarget.id;
            const dx = shakeX(sShake[i]);
            return (
              <div className="rrow" style={{ marginLeft: dx }}>
                <div className="rplay" id={"rp" + i} onClick={() => say(w.id)}>🔊</div>
                <div className={ok ? "rword ok" : "rword"} id={"rw" + i} onClick={() => sPick(i)}>{label(w)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="screen">
      {top}
      <div className={sChoices.length > 3 ? "picks p4" : "picks p3"}>
        {sChoices.map((w, i) => {
          const ok = sSolved >= 0 && w.id === sTarget.id;
          const dx = shakeX(sShake[i]);
          return (
            <div className={(ok ? "pcard ok" : "pcard") + (sChoices.length > 3 ? "" : " w3")} id={"pc" + i} onClick={() => sPick(i)} style={{ marginLeft: 8 + dx, marginRight: 8 - dx }}>
              <div className="pemo">{w.e}</div>
              {ok ? <div className="plabel ok">{label(w)}</div> : null}
              {ok ? <div className="pright">{txt("correct")}</div> : null}
              {!ok && sTapped.indexOf(i) >= 0 ? <div className="plabel bad">{label(w)}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==== Etsi ====================================================================

type Item = { o: string; c: string; x: number; y: number; done: boolean; at: number; fly: number; px: number; py: number };
type Zone = { id: string; x: number; y: number; w: number; h: number };
const E_ROUND = 5;
const SCENE_TOP = 184;
let items: Item[] = [];
let eTarget = 0;
let ePlace = "";
let eTask = 0;
let eMistakes = 0;
let eSel = -1;
let eDone = -1;
let eOpen = -1;                  // when the chest opened

function startEtsi() {
  mode = "etsi";
  eTask = 0;
  eOpen = -1;
  rg.music("calm", { volume: 0.3 });
  eLayout();
  eNext();
  eAsk();
}

// spots on the floor and the shelf; in the 8 v room the right side holds the bed, box and basket
function eLayout() {
  const spots: number[][] = hard
    ? [[16, 146], [86, 146], [16, 204], [86, 204], [16, 260], [86, 260], [140, 260]]
    : [[30, 46], [110, 46], [190, 46], [270, 46], [20, 146], [100, 164], [190, 146], [270, 164], [30, 244], [120, 258], [210, 244]];
  const sp = rg.shuffle(spots).slice(0, hard ? 7 : 9);
  items = [];
  const combos: string[] = [];
  for (const s of sp) {
    let o = "", c = "";
    for (let k = 0; k < 40; k++) {
      o = rg.pick(OBJECTS).id; c = rg.pick(FIND_COLORS);
      if (combos.indexOf(o + c) < 0) break;
    }
    combos.push(o + c);
    items.push({ o: o, c: c, x: s[0] + rg.range(-6, 6), y: s[1] + rg.range(-4, 4), done: false, at: 0, fly: -1, px: 0, py: 0 });
  }
}

function zones(): Zone[] {
  return [
    { id: "in_box", x: 196, y: 50, w: 70, h: 64 },
    { id: "in_basket", x: 276, y: 50, w: 70, h: 64 },
    { id: "on_bed", x: 196, y: 146, w: 150, h: 46 },
    { id: "under_bed", x: 196, y: 212, w: 150, h: 50 },
  ];
}

function eNext() {
  eMistakes = 0;
  eSel = -1;
  eDone = -1;
  const left = items.map((_x, i) => i).filter((i) => !items[i].done);
  if (left.length === 0) { eLayout(); return eNext(); }
  // a target whose colour or kind is shared by another thing, so both words matter
  let pick = left[0];
  const sh = rg.shuffle(left);
  for (const i of sh) {
    const it = items[i];
    if (items.some((x, k) => k !== i && !x.done && (x.o === it.o || x.c === it.c))) { pick = i; break; }
  }
  eTarget = pick;
  if (hard) ePlace = rg.pick(PLACES).id;
}

// "the red key" / "la llave roja", and in Finnish "punainen avain"
function np(it: Item) {
  const c = color(it.c), w = word(it.o);
  let g = "m";
  for (const o of OBJECTS) if (o.id === it.o) g = o.g;
  return lang === "en" ? c.en + " " + w.en : w.es + " " + (g === "f" ? c.esf : c.es);
}
function npFi(it: Item) { return color(it.c).fi + " " + word(it.o).fi; }
function placeFi(id: string) { for (const p of PLACES) if (p.id === id) return p.fi; return ""; }
function eAsk() {
  const it = items[eTarget];
  if (hard) {
    setCard(txt("kp_put_" + it.c + "_" + it.o) + " " + txt("kp_" + ePlace), "Napauta " + npFi(it) + ", sitten " + placeFi(ePlace), np(it));
    say(["kp_put_" + it.c + "_" + it.o, "kp_" + ePlace]);
  } else {
    setCard(txt("kp_find_" + it.c + "_" + it.o), "Etsi ja napauta: " + npFi(it), np(it));
    say("kp_find_" + it.c + "_" + it.o);
  }
}

function eWin() {
  eDone = t;
  if (eMistakes === 0) stars++;
  rg.sound(eMistakes === 0 ? "star" : "coin");
  feedback(true, [praise()]);
  later(1.5, () => {
    eTask++;
    if (eTask >= E_ROUND) {
      eOpen = t;
      rg.sound("win");
      feedback(true, [hard ? "you_did_it" : "kp_open"]);
      rg.celebrate(width / 2, height * 0.6, { big: true, sound: false });
      later(3.2, () => { mode = "etsi"; finish(stars, E_ROUND); });
    } else { eNext(); eAsk(); }
  });
}

function eTap(i: number) {
  if (eDone >= 0 || eOpen >= 0) return;
  const it = items[i];
  if (it.done) return;
  if (hard) {
    eSel = i;
    it.at = 0;
    rg.sound("pop");
    fb = { text: "👆 " + np(it) + " → ?", ok: true, at: t };
    return;
  }
  if (i === eTarget) {
    it.done = true;
    it.fly = t;
    rg.celebrate(it.x + 28, SCENE_TOP + it.y + 28, { sound: false });
    eWin();
  } else {
    eMiss(i);
  }
}

function eMiss(i: number) {
  eMistakes++;
  items[i].at = t;
  rg.sound("wrong");
  rg.vibrate(50);
  say(["try_again"]);
  fb = { text: "✗ " + np(items[i]) + " — " + txt("try_again"), ok: false, at: t };
  later(1.0, () => eAsk());
}

function eZone(z: Zone) {
  if (!hard || eDone >= 0 || eOpen >= 0) return;
  if (eSel < 0) { eAsk(); return; }
  const it = items[eSel];
  if (eSel !== eTarget) { const s = eSel; eSel = -1; eMiss(s); return; }
  if (z.id !== ePlace) {
    eMistakes++;
    rg.sound("wrong");
    rg.vibrate(50);
    say(["try_again"]);
    fb = { text: "✗ " + txt("kp_" + z.id) + " — " + txt("try_again"), ok: false, at: t };
    later(1.0, () => eAsk());
    return;
  }
  it.done = true;
  it.fly = t;
  it.px = z.x + 8 + rg.range(0, Math.max(0, z.w - 70));
  it.py = z.y + (z.id === "on_bed" ? -22 : z.id === "under_bed" ? -4 : -10);
  eSel = -1;
  rg.celebrate(z.x + z.w / 2, SCENE_TOP + z.y + 20, { sound: false });
  eWin();
}

// the things, drawn from boxes so that they can have any colour
function Thing(o: string, cid: string) {
  const c = color(cid);
  const parts: any[] = [];
  const P = (x: number, y: number, w: number, h: number, st: any) => {
    const s: any = { position: "absolute", left: x, top: y, width: w, height: h };
    for (const k in st) s[k] = st[k];
    parts.push(<div style={s} />);
  };
  if (o === "key") {
    P(4, 16, 24, 24, { borderRadius: 12, borderWidth: 6, borderColor: c.hex });
    P(26, 24, 26, 8, { backgroundColor: c.hex, borderRadius: 3 });
    P(40, 30, 5, 10, { backgroundColor: c.hex });
    P(48, 30, 5, 13, { backgroundColor: c.hex });
  } else if (o === "ball") {
    P(6, 6, 44, 44, { borderRadius: 22, backgroundColor: c.hex, borderWidth: 2, borderColor: c.dark });
    P(6, 25, 44, 6, { backgroundColor: c.dark, opacity: "0.5" });
    P(15, 13, 10, 8, { borderRadius: 5, backgroundColor: "rgba(255,255,255,0.75)" });
  } else if (o === "hat") {
    P(15, 8, 26, 30, { backgroundColor: c.hex, borderRadius: 4 });
    P(15, 30, 26, 6, { backgroundColor: c.dark });
    P(4, 36, 48, 9, { backgroundColor: c.hex, borderRadius: 5, borderWidth: 2, borderColor: c.dark });
  } else if (o === "car") {
    P(14, 14, 28, 16, { backgroundColor: c.hex, borderRadius: 7 });
    P(18, 17, 9, 9, { backgroundColor: "#bfe6ff", borderRadius: 2 });
    P(29, 17, 9, 9, { backgroundColor: "#bfe6ff", borderRadius: 2 });
    P(3, 26, 50, 16, { backgroundColor: c.hex, borderRadius: 7, borderWidth: 2, borderColor: c.dark });
    P(9, 36, 14, 14, { backgroundColor: "#2b2b2b", borderRadius: 7 });
    P(33, 36, 14, 14, { backgroundColor: "#2b2b2b", borderRadius: 7 });
  } else if (o === "balloon") {
    P(27, 40, 2, 16, { backgroundColor: "#666666" });
    P(24, 37, 8, 6, { backgroundColor: c.dark, borderRadius: 2 });
    P(11, 0, 34, 40, { backgroundColor: c.hex, borderRadius: 17 });
    P(18, 7, 7, 10, { backgroundColor: "rgba(255,255,255,0.6)", borderRadius: 4 });
  } else {
    P(36, 18, 16, 16, { borderRadius: 8, borderWidth: 5, borderColor: c.hex });
    P(8, 12, 34, 30, { backgroundColor: c.hex, borderRadius: 8, borderWidth: 2, borderColor: c.dark });
    P(2, 42, 50, 7, { backgroundColor: c.dark, borderRadius: 4 });
  }
  return parts;
}

function Chest() {
  const open = eOpen >= 0;
  const locks = [];
  for (let i = 0; i < E_ROUND; i++) locks.push(<div className={i < eTask ? "lock got" : "lock"}>{i < eTask ? "🔓" : "🔒"}</div>);
  const lift = open ? Math.min(1, (t - eOpen) / 0.6) : 0;
  return (
    <div className="chestbox">
      <div className="chest">
        <div className="lid" style={{ top: open ? -lift * 34 : 0 }} />
        <div className="base" />
        {open ? null : <div className="clasp" />}
        {open ? <div className="treasure" style={{ top: 20 - lift * 18, transform: "scale(" + (0.5 + lift * 0.6).toFixed(2) + ")" }}>💎👑💎</div> : null}
      </div>
      <div className="locks">{locks}</div>
    </div>
  );
}

function Etsi() {
  const out: any[] = [];
  if (hard) {
    // the bed, the box and the basket
    out.push(<div className="eshelf" style={{ left: 190, top: 112, width: 162 }} />);
    out.push(<div className="ebox" style={{ left: 200, top: 66 }}><div className="eboxlbl">📦</div></div>);
    out.push(<div className="ebasket" style={{ left: 280, top: 66 }}><div className="eboxlbl">🧺</div></div>);
    out.push(<div className="mattress" style={{ left: 196, top: 186 }} />);
    out.push(<div className="pillow" style={{ left: 204, top: 176 }} />);
    out.push(<div className="headboard" style={{ left: 190, top: 156 }} />);
    out.push(<div className="bedleg" style={{ left: 200, top: 204 }} />);
    out.push(<div className="bedleg" style={{ left: 334, top: 204 }} />);
    for (const z of zones()) {
      out.push(<div className={eSel >= 0 ? "zone hot" : "zone"} id={"z-" + z.id} onClick={() => eZone(z)} style={{ left: z.x, top: z.y, width: z.w, height: z.h }} />);
    }
  } else {
    out.push(<div className="eshelf" style={{ left: 16, top: 100, width: 328 }} />);
  }
  items.forEach((it, i) => {
    let x = it.x, y = it.y, sc = 1, op = 1;
    if (it.done && it.fly >= 0) {
      const k = rg.ease.inOut(Math.min(1, (t - it.fly) / 0.7));
      if (hard) { x = rg.lerp(it.x, it.px, k); y = rg.lerp(it.y, it.py, k); sc = 1 - 0.25 * k; }
      else { x = rg.lerp(it.x, 150, k); y = rg.lerp(it.y, 322, k); sc = 1 - 0.6 * k; op = 1 - k; }
    }
    if (!hard && it.done && t - it.fly > 0.7) return;
    const dx = shakeX(it.at);
    const lift = eSel === i ? -10 + Math.sin(t * 8) * 3 : 0;
    out.push(
      <div className={eSel === i ? "thing sel" : "thing"} id={"it" + i} onClick={() => eTap(i)}
        style={{ left: x + dx, top: y + lift, opacity: String(op), transform: "scale(" + sc.toFixed(2) + ")" }}>{Thing(it.o, it.c)}</div>
    );
  });
  return (
    <div className="screen">
      <div className="bar">
        {Dots(eTask, E_ROUND)}
        <div className="speak" id="ask" onClick={() => eAsk()}>🔊</div>
      </div>
      <div className="slim">{Card(true)}</div>
      <div className="room" style={{ top: SCENE_TOP }}>
        <div className="wall" />
        <div className="floor" />
        {out}
      </div>
      {hard ? <div className="tidy">{Dots(stars, E_ROUND)}</div> : Chest()}
    </div>
  );
}

// ==== Kahvila =================================================================

const C_ROUND = 5;
const CUSTOMERS = ["cat", "dog", "rabbit", "bear", "pig", "monkey", "lion", "frog", "elephant", "mouse", "duck", "cow"];
let cTask = 0;
let cWho = "cat";
let cOrder: { id: string; n: number }[] = [];
let tray: string[] = [];
let cHint = false;
let cMistakes = 0;
let cHappy = -1;
let cArrive = 0;
let cSaid = "";
let cText = "";

function startCafe() {
  mode = "kahvila";
  cTask = 0;
  rg.music("calm", { volume: 0.25 });
  say("kp_welcome");
  cNext(2.0);
}

function cNext(delay: number) {
  cMistakes = 0;
  cHint = false;
  cHappy = -1;
  tray = [];
  cArrive = t + delay;
  let w = cWho;
  while (w === cWho) w = rg.pick(CUSTOMERS);
  cWho = w;
  const m = rg.shuffle(MENU);
  cOrder = hard
    ? [{ id: m[0].id, n: rg.range(1, CAFE_MAX) }, { id: m[1].id, n: rg.range(1, 2) }]
    : [{ id: m[0].id, n: rg.range(1, cTask < 2 ? 2 : 3) }];
  later(delay + 0.5, () => { rg.sound("whoosh"); cAsk(true); });
}

function cAsk(hello: boolean) {
  const a: string[] = hello ? ["hello"] : [];
  if (cOrder.length === 1) a.push("kp_order" + cOrder[0].n + "_" + cOrder[0].id);
  else { a.push("kp_like2"); a.push("kp_q" + cOrder[0].n + "_" + cOrder[0].id); a.push("kp_and"); a.push("kp_q" + cOrder[1].n + "_" + cOrder[1].id); a.push("please"); }
  cText = a.filter((x) => x !== "hello").map((x) => txt(x)).join(" ").replace(/ please$/, ", please.").replace(/ por favor$/, ", por favor.");
  say(a);
}

function count(id: string) { return tray.filter((x) => x === id).length; }

// a tap on the menu: the right thing goes on the tray at once (and the order is
// served when it is complete); a wrong one or one too many gets a hint instead
function cAdd(id: string) {
  if (cHappy >= 0 || t < cArrive) return;
  let want = 0;
  for (const o of cOrder) if (o.id === id) want = o.n;
  if (want === 0 || count(id) >= want) {
    cMistakes++;
    cHint = true;
    rg.sound("wrong");
    rg.vibrate(40);
    const why = want === 0 ? "kp_not_this" : "kp_too_many";
    fb = { text: "✗ " + label(word(id)) + " — " + txt(why), ok: false, at: t };
    say([id, why]);
    return;
  }
  tray.push(id);
  rg.sound("pop", { pitch: 1 + tray.length * 0.06 });
  if (cOrder.every((o) => count(o.id) === o.n)) { cServe(); return; }
  fb = { text: "✓ " + word(id).e + " " + label(word(id)), ok: true, at: t };
  say(id);
}
function cRemove(i: number) {
  if (cHappy >= 0) return;
  rg.sound("click");
  tray = tray.filter((_x, k) => k !== i);
}

function cServe() {
  if (cHappy >= 0 || t < cArrive) return;
  if (tray.length === 0) { cAsk(false); return; }
  let extra = false, over = false, under = false;
  for (const id of tray) if (!cOrder.some((o) => o.id === id)) extra = true;
  for (const o of cOrder) { const n = count(o.id); if (n > o.n) over = true; if (n < o.n) under = true; }
  if (!extra && !over && !under) {
    cHappy = t;
    if (cMistakes === 0) stars++;
    for (const o of cOrder) grade(o.id, cMistakes === 0);
    rg.sound(cMistakes === 0 ? "star" : "coin");
    fb = { text: "✓ " + txt("kp_here") + " " + txt("thank_you"), ok: true, at: t };
    say(["kp_here", "thank_you", "kp_yummy"]);
    rg.celebrate(width / 2, 150, { sound: false });
    later(3.4, () => {
      cTask++;
      if (cTask >= C_ROUND) { say("kp_closed"); finish(stars, C_ROUND); }
      else cNext(0.6);
    });
    return;
  }
  cMistakes++;
  cHint = true;
  rg.sound("wrong");
  rg.vibrate(40);
  cSaid = extra ? "kp_not_this" : over ? "kp_too_many" : "kp_more";
  feedback(false, [cSaid]);
  later(1.6, () => cAsk(false));
}

function Kahvila() {
  const here = t >= cArrive;
  const slide = here ? 0 : Math.min(1, cArrive - t) * 300;
  const happy = cHappy >= 0;
  const leave = happy && t - cHappy > 2.4 ? (t - cHappy - 2.4) * 400 : 0;
  const bob = Math.sin(t * 3) * 3;
  const bubble = [];
  if (here && !happy) {
    bubble.push(<div className="btext">{cText}</div>);
    if (cHint || (!hard && cMistakes > 0)) {
      for (const o of cOrder) {
        const n = []; for (let k = 0; k < o.n; k++) n.push(<div className="bemo">{word(o.id).e}</div>);
        bubble.push(<div className="brow"><div className="bnum">{o.n}</div>{n}</div>);
      }
    }
  }
  return (
    <div className="screen cafe">
      <div className="bar">
        {Dots(cTask, C_ROUND)}
        <div className="speak" id="ask" onClick={() => cAsk(false)}>🔊</div>
      </div>
      <div className="awning" />
      <div className="custrow">
        <div className="cust" id="cust" onClick={() => cAsk(false)} style={{ marginLeft: slide + leave, marginTop: bob }}>{word(cWho).e}{happy ? <div className="heart">💖</div> : null}</div>
        {here && !happy ? <div className="bubble" id="bubble" onClick={() => cAsk(false)}>{bubble}</div> : null}
        {happy ? <div className="bubble"><div className="bemo">😋</div></div> : null}
      </div>
      <div className="counter">
        <div className="tray" id="tray">
          {tray.length === 0 ? <div className="trayhelp">Napauta ruokia tarjottimelle 👇</div> : tray.map((id, i) => <div className="titem" id={"tr" + i} onClick={() => cRemove(i)}>{word(id).e}</div>)}
        </div>
      </div>
      <div className="cafefi">Kuuntele tai lue tilaus ja napauta oikeat ruoat.</div>
      <div className="menu">
        {MENU.map((m) => <div className="mitem" id={"m-" + m.id} onClick={() => cAdd(m.id)}><div className="miemo">{word(m.id).e}</div></div>)}
      </div>
    </div>
  );
}

// ==== Tarina ==================================================================

let scene: any = STORY[0];
let chosen = -1;
let showFi = false;
let sceneAt = 0;
let seen: string[] = [];

function startStory() {
  mode = "tarina";
  seen = [];
  rg.music("calm", { volume: 0.2 });
  goScene("s1");
}

function goScene(id: string) {
  for (const s of STORY) if (s.id === id) scene = s;
  chosen = -1;
  sceneAt = t;
  seen.push(id);
  say("kp_" + scene.id);
  if (scene.id === "end") { rg.celebrate(width / 2, height * 0.35, { big: true }); stars = 5; }
}

function tChoose(i: number) {
  if (chosen >= 0) return;
  chosen = i;
  const c = scene.choices[i];
  rg.sound("pop");
  feedback(true, ["kp_" + c.id]);
  later(1.9, () => goScene(c.next));
}

function tNext() {
  if (scene.choices) return;
  rg.sound("click");
  if (scene.next) goScene(scene.next);
  else { mode = "tarina"; finish(5, 5); }
}

function Tarina() {
  const night = scene.bg === "#2c3e78";
  const k = Math.min(1, (t - sceneAt) / 0.5);
  return (
    <div className="screen" style={{ backgroundColor: scene.bg }}>
      <div className="bar">
        <div className={showFi ? "fi on" : "fi"} id="fi" onClick={() => { showFi = !showFi; rg.sound("click"); }}>🇫🇮</div>
        <div className="speak" id="ask" onClick={() => say("kp_" + scene.id)}>🔊</div>
      </div>
      <div className="stage" id="stage" onClick={() => say("kp_" + scene.id)} style={{ opacity: String(k) }}>
        {scene.pic.map((e: string, i: number) => <div className="semo" style={{ marginTop: Math.sin(t * 2 + i) * 6 }}>{e}</div>)}
      </div>
      <div className={night ? "line night" : "line"}>{scene[lang]}</div>
      {showFi ? <div className={night ? "finn night" : "finn"}>{scene.fi}</div> : null}
      <div className={night ? "thelp night" : "thelp"}>{scene.choices ? "Valitse kuva: mitä tapahtuu seuraavaksi?" : scene.next ? "Paina ▶ jatkaaksesi. 🇫🇮 näyttää suomeksi." : "Tarina loppui!"}</div>
      {scene.choices ? (
        <div className="tchoices">
          {scene.choices.map((c: any, i: number) => (
            <div className={chosen === i ? "tchoice ok" : chosen >= 0 ? "tchoice dim" : "tchoice"} id={"tc" + i} onClick={() => tChoose(i)}>
              <div className="temo">{c.e}</div>
              <div className="tlabel">{c[lang]}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="tnext" id="next" onClick={() => tNext()}>{scene.next ? "▶" : "⭐"}</div>
      )}
    </div>
  );
}

// ==== menu, end, frame =========================================================

function setLang(l: string) {
  lang = l;
  rg.save("lang", l);
  const r: any = rg;
  if (typeof r.setLang === "function") r.setLang(l);   // the launcher's language too
  rg.sound("click");
  say("hello");
}

function Dots(n: number, of: number) {
  const d = [];
  for (let i = 0; i < of; i++) d.push(<div className={i < n ? "dot done" : i === n ? "dot now" : "dot"} />);
  return <div className="progress">{d}</div>;
}

function Menu() {
  const bob = Math.sin(t * 2.5) * 5;
  return (
    <div className="screen">
      <div className="title" style={{ marginTop: 34 + bob }}>Kielipelit</div>
      <div className="mhelp">Valitse kieli, taso ja peli</div>
      <div className="flags">
        <div className={lang === "en" ? "flag on" : "flag"} id="en" onClick={() => setLang("en")}>
          <div className="femo">🇬🇧</div><div className="fname">English</div>
        </div>
        <div className={lang === "es" ? "flag on" : "flag"} id="es" onClick={() => setLang("es")}>
          <div className="femo">🇪🇸</div><div className="fname">Español</div>
        </div>
      </div>
      <div className="levels">
        <div className={!hard ? "lvl on" : "lvl"} id="easy" onClick={() => { hard = false; rg.save("hard", false); rg.sound("click"); }}>🐣 Helppo</div>
        <div className={hard ? "lvl on" : "lvl"} id="hard" onClick={() => { hard = true; rg.save("hard", true); rg.sound("click"); }}>🦊 8 v</div>
      </div>
      <div className="games">
        {GAMES.map((g, i) => {
          const b = best[g.id + (hard ? "2" : "1")];
          return (
            <div className="gcard" id={"g-" + g.id} onClick={() => start(g.id)} style={{ backgroundColor: g.color, marginTop: 12 + Math.sin(t * 2 + i) * 2 }}>
              <div className="gemo">{g.e}</div>
              <div className="gname">{g.name}</div>
              <div className="gsub">{g.sub}</div>
              {b ? <div className="gsub">{"⭐ " + b}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Done() {
  const of = game === "sanat" ? S_ROUND : game === "etsi" ? E_ROUND : game === "kahvila" ? C_ROUND : 5;
  const st = [];
  for (let i = 0; i < of; i++) st.push(<div className={i < stars ? "bigstar" : "bigstar off"}>⭐</div>);
  return (
    <div className="screen">
      <div className="title" style={{ marginTop: 90 }}>{stars * 2 >= of ? (lang === "es" ? "¡Muy bien!" : "Well done!") : (lang === "es" ? "¡Buen trabajo!" : "Good job!")}</div>
      <div className="stars">{st}</div>
      <div className="button" id="again" onClick={() => start(game)} style={{ backgroundColor: "#06d6a0" }}>↻</div>
      <div className="button back" id="menu" onClick={() => toMenu()}>☰</div>
    </div>
  );
}

// on the web: k answers the task right (testing)
function onKeyDown(k: string) {
  if (k !== "k") return;
  if (mode === "sanat") {
    if (sKind === "memory") {
      for (let i = 0; i < sCards.length; i++) if (!sCards[i].done && !sCards[i].open) {
        for (let j = i + 1; j < sCards.length; j++) if (sCards[j].w.id === sCards[i].w.id) { sCard(i); sCard(j); return; }
      }
    } else if (sKind === "build") {
      const want = bare(sTarget).toUpperCase().charAt(sBuilt.length);
      for (let i = 0; i < sLetters.length; i++) if (!sLetters[i].used && sLetters[i].ch === want) { sLetter(i); return; }
    } else for (let i = 0; i < sChoices.length; i++) if (sChoices[i].id === sTarget.id) sPick(i);
  } else if (mode === "etsi") {
    eTap(eTarget);
    if (hard) for (const z of zones()) if (z.id === ePlace) eZone(z);
  } else if (mode === "kahvila") {
    if (t < cArrive) return;
    tray = [];
    for (const o of cOrder) for (let n = 0; n < o.n; n++) tray.push(o.id);
    cServe();
  } else if (mode === "tarina") {
    if (scene.choices) tChoose(0); else tNext();
  }
}

function tick(dt: number) {
  t += dt;
  for (const s of sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 500 * dt; }
  sparks = sparks.filter((s) => s.t < 1.2);
  const due = laters.filter((l) => l.at <= t);
  if (due.length) {
    laters = laters.filter((l) => l.at > t);
    for (const l of due) l.f();
  }
}

function view() {
  let body;
  if (mode === "menu") body = Menu();
  else if (mode === "done") body = Done();
  else if (mode === "sanat") body = Sanat();
  else if (mode === "etsi") body = Etsi();
  else if (mode === "kahvila") body = Kahvila();
  else body = Tarina();
  return (
    <div className="root">
      {body}
      {mode !== "menu" && mode !== "done" ? Feedback() : null}
      {sparks.map((s) => <div className="spark" style={{ left: s.x, top: s.y, opacity: String(1 - s.t / 1.2), backgroundColor: s.c }} />)}
    </div>
  );
}
