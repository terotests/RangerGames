// Laskupeli: sums for 1st and 2nd graders. Ten questions a round, a star for
// each right answer. The first levels count fruit (plus and minus up to 10).
// The harder levels go to 100 the way a Finnish 2nd grade does: over ten up
// to 20, plus and minus to 100 with carrying and borrowing (tens are drawn as
// bars, ones as cubes), the 2, 3, 4, 5 and 10 times tables (rows of dots),
// missing numbers and short word problems.
//
// The harder levels adapt: each has three steps; three right first tries in
// a row move one step up, two misses in a row one step down. The step a
// level reached is saved, so the next round starts there.

type Mode = "menu" | "play" | "done";
type Kind = "plus" | "minus" | "over" | "plus100" | "minus100" | "times" | "missing" | "story";
type Level = { name: string; kind: Kind; max: number; color: string };
type Spark = { x: number; y: number; vx: number; vy: number; t: number; c: string };

const LEVELS: Level[] = [
  { name: rg.t("Plussa 1–5", "Plus 1–5", "Sumas 1–5"), kind: "plus", max: 5, color: "#06d6a0" },
  { name: rg.t("Plussa 1–10", "Plus 1–10", "Sumas 1–10"), kind: "plus", max: 10, color: "#118ab2" },
  { name: rg.t("Miinus 1–10", "Minus 1–10", "Restas 1–10"), kind: "minus", max: 10, color: "#ef476f" },
  { name: rg.t("Yli kympin", "Over ten", "Pasar de diez"), kind: "over", max: 20, color: "#f77f00" },
  { name: rg.t("Plussa 100", "Plus 100", "Sumas 100"), kind: "plus100", max: 100, color: "#2a9d8f" },
  { name: rg.t("Miinus 100", "Minus 100", "Restas 100"), kind: "minus100", max: 100, color: "#d62828" },
  { name: rg.t("Kertotaulut", "Times tables", "Tablas"), kind: "times", max: 100, color: "#7b2cbf" },
  { name: rg.t("Mikä puuttuu?", "Missing number", "¿Qué falta?"), kind: "missing", max: 100, color: "#3a86ff" },
  { name: rg.t("Tarinat", "Stories", "Problemas"), kind: "story", max: 100, color: "#bc6c25" },
];
const FRUIT = ["🍎", "🍐", "🍓", "🍊", "🍌", "🍇", "🥕", "🐟"];
const SPARK = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#ffffff"];
const ROUND = 10;
const STEPS = 3;

// a question: what is shown and what is the answer
//   expr: the line with "?" (or a box) where the answer goes
//   left/right: the numbers drawn as pictures (right -1 = only left)
//   op: "+", "−", "×"
//   text: a word problem, shown instead of the pictures
type Q = { expr: string; answer: number; a: number; b: number; op: string; pic: string; text: string; say: string[] };

let mode: Mode = "menu";
let level = 0;
let q: Q = { expr: "", answer: 0, a: 0, b: 0, op: "+", pic: "fruit", text: "", say: [] };
let choices: number[] = [];
let fruit = "🍎";
let question = 0;
let right = 0;
let firstTry = true;
let t = 0;
let solved = -1;          // the time it was solved; the next question follows
let shake: { i: number; t: number } = { i: -1, t: 0 };
let sparks: Spark[] = [];
let best: number[] = [];
let steps: number[] = [];  // the step (0–2) each level has reached
let streak = 0;            // right first tries in a row
let misses = 0;            // missed questions in a row
let stepMsg = 0;           // when the step changed (shows a ▲ or ▼)
let stepUp = true;

function fill(arr: number[], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(arr && i < arr.length ? arr[i] : 0);
  return out;
}

function init() {
  best = fill(rg.load("best", []), LEVELS.length);
  steps = fill(rg.load("steps", []), LEVELS.length);
}

function adaptive(): boolean { return level >= 3; }
function step(): number { return adaptive() ? steps[level] : 0; }

// speech (rg.say): the sum is said aloud for children who cannot read numbers yet
const PRAISE = ["hyva", "hienoa", "mahtavaa", "oikein", "loistavaa", "jee", "taitava", "osaat"];
let praiseN = 0;
function praise() { praiseN++; return PRAISE[praiseN % PRAISE.length]; }
function N(n: number) { return rg.sayId.number(n); }
function instruct() { if (q.say.length) rg.say(q.say); }

function r(lo: number, hi: number): number { return rg.range(lo, hi); }

// ---- question makers -------------------------------------------------------

function sum(a: number, op: string, b: number, ans: number, pic: string): Q {
  const say = [N(a), op === "+" ? "plus" : op === "−" ? "miinus" : "kertaa", N(b)];
  return { expr: a + " " + op + " " + b + " = ?", answer: ans, a, b, op, pic, text: "", say };
}

function makePlus(max: number): Q {
  const a = r(1, max - 1), b = r(1, max - a);
  const qq = sum(a, "+", b, a + b, "fruit");
  qq.say.push("yhteensa");
  return qq;
}
function makeMinus(max: number): Q {
  const a = r(2, max), b = r(1, a - 1);
  const qq = sum(a, "−", b, a - b, "fruit");
  qq.say.push("jaljelle");
  return qq;
}

// over ten up to 20: 8 + 5, 13 − 6
function makeOver(s: number): Q {
  if (s === 0 || (s === 2 && rg.random() < 0.5)) {
    const a = r(s === 0 ? 6 : 3, 9);
    const b = r(11 - a, s === 0 ? Math.min(9, 14 - a) : 9);
    return sum(a, "+", b, a + b, "blocks");
  }
  if (s === 1) {
    // a teen number plus ones without going over 20, or tens and ones
    if (rg.random() < 0.5) { const a = r(11, 16), b = r(1, 19 - a); return sum(a, "+", b, a + b, "blocks"); }
    const a = r(12, 19), b = r(1, a - 10); return sum(a, "−", b, a - b, "blocks");
  }
  const a = r(11, 18), b = r(a - 9, 9);
  return sum(a, "−", b, a - b, "blocks");
}

// plus to 100: 30 + 40, 34 + 5 / 47 + 8 / 38 + 45
function makePlus100(s: number): Q {
  let a = 0, b = 0;
  if (s === 0) {
    if (rg.random() < 0.5) { a = r(1, 8) * 10; b = r(1, 9 - a / 10) * 10; }
    else { a = r(2, 8) * 10 + r(0, 5); b = r(1, 9 - (a % 10)); }
  } else if (s === 1) {
    a = r(1, 8) * 10 + r(3, 9); b = r(10 - (a % 10), 9);
    if (rg.random() < 0.35) { b = r(1, 5) * 10 + r(0, 9 - (a % 10)); if (a + b > 100) b = r(1, 9); }
  } else {
    a = r(1, 6) * 10 + r(2, 9); b = r(1, 8 - Math.floor(a / 10)) * 10 + r(10 - (a % 10), 9);
    if (a + b > 100) b = 100 - a;
  }
  return sum(a, "+", b, a + b, "blocks");
}

// minus to 100: 70 − 30, 58 − 3 / 52 − 7 / 73 − 28
function makeMinus100(s: number): Q {
  let a = 0, b = 0;
  if (s === 0) {
    if (rg.random() < 0.5) { a = r(3, 10) * 10; b = r(1, a / 10 - 1) * 10; }
    else { a = r(2, 9) * 10 + r(3, 9); b = r(1, a % 10); }
  } else if (s === 1) {
    a = r(2, 9) * 10 + r(0, 6); b = r((a % 10) + 1, 9);
    if (rg.random() < 0.35) { a = r(4, 9) * 10 + r(2, 9); b = r(1, Math.floor(a / 10) - 2) * 10 + r(1, a % 10); }
  } else {
    a = r(4, 9) * 10 + r(0, 7); const bt = r(1, Math.floor(a / 10) - 2); b = bt * 10 + r((a % 10) + 1, 9);
  }
  return sum(a, "−", b, a - b, "blocks");
}

// times tables: 2, 5 and 10 first, then 3 and 4, then all with bigger rows
function makeTimes(s: number): Q {
  const tables = s === 0 ? [2, 5, 10] : [2, 3, 4, 5, 10];
  const b = rg.pick(tables);
  const a = s === 2 ? r(4, 10) : r(2, s === 0 ? 5 : 7);
  return sum(a, "×", b, a * b, "rows");
}

// missing numbers: 7 + ? = 12, ? − 8 = 15, 4 × ? = 20
function makeMissing(s: number): Q {
  const hi = s === 0 ? 20 : 100;
  const k = r(0, s === 2 ? 4 : 2);
  let expr = "", ans = 0;
  if (k === 0) {
    const a = r(2, hi - 3), c = r(a + 1, Math.min(hi, a + (s === 0 ? 10 : 40)));
    expr = a + " + ? = " + c; ans = c - a;
  } else if (k === 1) {
    const a = r(4, hi), b = r(1, Math.min(a - 1, s === 0 ? 10 : 40));
    expr = a + " − ? = " + (a - b); ans = b;
  } else if (k === 2) {
    const b = r(2, s === 0 ? 9 : 30), c = r(1, hi - b);
    expr = "? + " + b + " = " + (b + c); ans = c;
  } else if (k === 3) {
    const b = r(2, 30), c = r(1, hi - b);
    expr = "? − " + b + " = " + c; ans = b + c;
  } else {
    const t2 = rg.pick([2, 3, 4, 5, 10]), m = r(2, 10);
    expr = t2 + " × ? = " + t2 * m; ans = m;
  }
  return { expr, answer: ans, a: 0, b: 0, op: "", pic: "none", text: "", say: ["mika_luku_puuttuu"] };
}

// word problems with animals; numbers grow with the step
type Who = { fi: string; ade: string; en: string; es: string };
const WHO: Who[] = [
  { fi: "Karhu", ade: "Karhulla", en: "Bear", es: "El oso" },
  { fi: "Pupu", ade: "Pupulla", en: "Bunny", es: "El conejo" },
  { fi: "Siili", ade: "Siilillä", en: "Hedgehog", es: "El erizo" },
  { fi: "Orava", ade: "Oravalla", en: "Squirrel", es: "La ardilla" },
  { fi: "Kettu", ade: "Ketulla", en: "Fox", es: "El zorro" },
];
const WHO_EMOJI = ["🐻", "🐰", "🦔", "🐿️", "🦊"];

function story(fi: string, en: string, es: string, ans: number, pic: string): Q {
  return { expr: "= ?", answer: ans, a: 0, b: 0, op: "", pic, text: rg.t(fi, en, es), say: [] };
}

function makeStory(s: number): Q {
  const hi = s === 0 ? 20 : s === 1 ? 50 : 100;
  const lo = s === 0 ? 0 : s === 1 ? 10 : 25;
  const wi = r(0, WHO.length - 1);
  const w = WHO[wi], e = WHO_EMOJI[wi];
  const w2 = WHO[(wi + 1 + r(0, WHO.length - 2)) % WHO.length];
  const k = r(0, s === 0 ? 4 : 7);
  if (k === 0) {
    const a = r(lo + 3, hi - 4), b = r(2, Math.min(hi - a, s === 0 ? 9 : 30));
    return story(w.fi + " keräsi " + a + " käpyä. Sitten se löysi vielä " + b + ". Montako käpyä sillä on nyt?",
      w.en + " picked " + a + " pine cones and then found " + b + " more. How many does it have now?",
      w.es + " recogió " + a + " piñas y luego encontró " + b + " más. ¿Cuántas tiene ahora?", a + b, e + " 🌰");
  }
  if (k === 1) {
    const a = r(lo + 5, hi), b = r(2, Math.min(a - 1, s === 0 ? 9 : 30));
    return story(w.ade + " oli " + a + " mansikkaa. Se söi " + b + ". Montako mansikkaa jäi?",
      w.en + " had " + a + " strawberries and ate " + b + ". How many are left?",
      w.es + " tenía " + a + " fresas y se comió " + b + ". ¿Cuántas quedan?", a - b, e + " 🍓");
  }
  if (k === 2) {
    const b = r(lo + 3, hi - 6), a = r(b + 2, Math.min(hi, b + (s === 0 ? 9 : 30)));
    return story(w.ade + " on " + a + " porkkanaa ja " + w2.ade.toLowerCase() + " " + b + ". Montako enemmän " + w.ade.toLowerCase() + " on?",
      w.en + " has " + a + " carrots and " + w2.en + " has " + b + ". How many more does " + w.en + " have?",
      w.es + " tiene " + a + " zanahorias y " + w2.es.toLowerCase() + " " + b + ". ¿Cuántas más tiene " + w.es.toLowerCase() + "?", a - b, e + " 🥕");
  }
  if (k === 3) {
    const a = r(lo + 5, hi), b = r(2, Math.min(a - 1, s === 0 ? 9 : 30));
    return story("Bussissa on " + a + " eläintä. Pysäkillä " + b + " jää pois. Montako on vielä bussissa?",
      "There are " + a + " animals on the bus. At the stop " + b + " get off. How many are still on the bus?",
      "Hay " + a + " animales en el autobús. En la parada bajan " + b + ". ¿Cuántos quedan?", a - b, "🚌");
  }
  if (k === 4) {
    const b = rg.pick(s === 0 ? [2, 5, 10] : [2, 3, 4, 5, 10]), a = r(2, s === 0 ? 5 : 10);
    return story("Pöydällä on " + a + " lautasta. Jokaisella on " + b + " keksiä. Montako keksiä on yhteensä?",
      "There are " + a + " plates on the table with " + b + " cookies on each. How many cookies altogether?",
      "Hay " + a + " platos en la mesa con " + b + " galletas en cada uno. ¿Cuántas galletas hay en total?", a * b, "🍽️ 🍪");
  }
  if (k === 5) {
    const a = r(5, 60), b = r(5, Math.min(40, 100 - a));
    return story("Jäätelö maksaa " + a + " senttiä ja mehu " + b + " senttiä. Paljonko ne maksavat yhteensä?",
      "Ice cream costs " + a + " cents and juice " + b + " cents. How much do they cost together?",
      "Un helado cuesta " + a + " céntimos y un zumo " + b + ". ¿Cuánto cuestan juntos?", a + b, "🍦 🧃");
  }
  if (k === 6) {
    const a = r(20, hi), b = r(5, a - 5);
    return story("Kirjassa on " + a + " sivua. " + w.fi + " on lukenut " + b + " sivua. Montako sivua on vielä lukematta?",
      "A book has " + a + " pages. " + w.en + " has read " + b + ". How many pages are left?",
      "Un libro tiene " + a + " páginas. " + w.es + " ha leído " + b + ". ¿Cuántas faltan?", a - b, e + " 📖");
  }
  const per = rg.pick([2, 3, 4, 5, 10]), n = r(2, 5);
  return story(w.ade + " on " + per * n + " tarraa. Se jakaa ne tasan " + n + " kaverille. Montako tarraa kukin saa?",
    w.en + " has " + per * n + " stickers and shares them equally with " + n + " friends. How many does each get?",
    w.es + " tiene " + per * n + " pegatinas y las reparte entre " + n + " amigos. ¿Cuántas recibe cada uno?", per, e + " ⭐");
}

function make(): Q {
  const L = LEVELS[level], s = step();
  if (L.kind === "plus") return makePlus(L.max);
  if (L.kind === "minus") return makeMinus(L.max);
  if (L.kind === "over") return makeOver(s);
  if (L.kind === "plus100") return makePlus100(s);
  if (L.kind === "minus100") return makeMinus100(s);
  if (L.kind === "times") return makeTimes(s);
  if (L.kind === "missing") return makeMissing(s);
  return makeStory(s);
}

// wrong answers that look right: one off, ten off (a forgotten carry), the
// tens and ones swapped, the neighbouring row of the table
function options(ans: number, n: number): number[] {
  const set = [ans];
  const near = [-1, 1, -2, 2];
  if (ans >= 10 || level >= 4) near.push(-10, 10);
  if (q.op === "×") near.push(-q.b, q.b);
  if (ans >= 12 && ans % 10 !== Math.floor(ans / 10) && ans < 100) near.push((ans % 10) * 10 + Math.floor(ans / 10) - ans);
  let guard = 0;
  while (set.length < n && guard < 200) {
    guard++;
    const o = guard < 60 ? ans + rg.pick(near) : ans + r(-9, 9);
    if (o >= 0 && o <= 120 && set.indexOf(o) < 0) set.push(o);
  }
  return rg.shuffle(set);
}

function next() {
  q = make();
  choices = options(q.answer, adaptive() ? 4 : 3);
  fruit = rg.pick(FRUIT);
  firstTry = true;
  solved = -1;
  instruct();
}

function startLevel(i: number) {
  level = i;
  question = 0;
  right = 0;
  streak = 0;
  misses = 0;
  stepMsg = -10;
  mode = "play";
  rg.sound("click");
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
  misses = 0;
}

function choiceX(i: number) {
  const n = choices.length, w = n === 4 ? 82 : 108;
  return width / 2 + (i - (n - 1) / 2) * w;
}

function pick(i: number) {
  if (solved >= 0) return;
  if (choices[i] === q.answer) {
    solved = t;
    const x = choiceX(i);
    if (firstTry) { right++; streak++; misses = 0; }
    rg.celebrate(x, height - 150, { sound: false });
    rg.sound(firstTry ? "star" : "coin");
    rg.say([N(q.answer), praise()]);
    for (let k = 0; k < 24; k++) {
      const ang = rg.random() * Math.PI * 2, sp = 80 + rg.random() * 220;
      sparks.push({ x, y: height - 150, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120, t: 0, c: rg.pick(SPARK) });
    }
    if (adaptive() && streak >= 3) setStep(1);
  } else {
    if (firstTry) { misses++; streak = 0; if (adaptive() && misses >= 2) setStep(-1); }
    firstTry = false;
    shake = { i, t };
    rg.sound("wrong");
    rg.vibrate(60);
    rg.say("kokeile_toista");
  }
}

function tick(dt: number) {
  t += dt;
  for (const s of sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 500 * dt; }
  sparks = sparks.filter((s) => s.t < 1.2);
  if (mode === "play" && solved >= 0 && t - solved > 1.1) {
    question++;
    if (question >= ROUND) {
      mode = "done";
      if (right > best[level]) { best[level] = right; rg.save("best", best); }
      if (right >= 5) rg.celebrate(width / 2, height * 0.3, { big: true }); else rg.sound("coin");
      rg.say(right >= 2 ? [right >= 8 ? "mahtavaa" : right >= 5 ? "hienoa" : "hyvin_meni", "sait", N(right), "tahtea"] : ["hyvin_meni"]);
    } else next();
  }
}

function onBack() {
  if (mode === "menu") rg.exit(); else { mode = "menu"; rg.sound("click"); }
}

// ---- pictures --------------------------------------------------------------

function Group(n: number, crossed: number) {
  const items = [];
  for (let i = 0; i < n; i++) {
    const gone = i >= n - crossed;
    items.push(<div className={gone ? "fruit gone" : "fruit"}>{fruit}</div>);
  }
  return <div className="group">{items}</div>;
}

// tens as bars of ten, ones as cubes; the last `gone` units are pale (taken
// away): first the cubes, then the top of the last bar
function Blocks(n: number, gone: number, color: string) {
  const tens = Math.floor(n / 10), ones = n % 10;
  const goneOnes = Math.min(gone, ones);
  let goneRest = gone - goneOnes;
  const bars = [];
  for (let i = tens - 1; i >= 0; i--) {
    const g = Math.min(10, goneRest);
    goneRest -= g;
    bars.unshift(
      <div className="bar">
        {g > 0 ? <div className="barpart gone" style={{ height: g * 11, backgroundColor: color }} /> : null}
        {g < 10 ? <div className="barpart" style={{ height: (10 - g) * 11, backgroundColor: color }} /> : null}
      </div>
    );
  }
  const cubes = [];
  for (let i = 0; i < ones; i++) cubes.push(<div className={i >= ones - goneOnes ? "cube gone" : "cube"} style={{ backgroundColor: color }} />);
  return (
    <div className="blocks">
      {bars}
      {ones > 0 ? <div className="cubes">{cubes}</div> : null}
    </div>
  );
}

// a × b as a rows of b dots (a row of ten is one bar)
function Rows(a: number, b: number) {
  const rows = [];
  for (let i = 0; i < a; i++) {
    const dots = [];
    for (let k = 0; k < b; k++) dots.push(<div className="rdot" />);
    rows.push(<div className="row">{dots}</div>);
  }
  return <div className="rows">{rows}</div>;
}

function Picture() {
  const done = solved >= 0;
  if (q.pic === "fruit") {
    if (q.op === "−") return <div className="groups">{Group(q.a, done ? q.b : 0)}</div>;
    return <div className="groups">{Group(q.a, 0)}<div className="op">+</div>{Group(q.b, 0)}</div>;
  }
  if (q.pic === "blocks") {
    if (q.op === "−") return <div className="groups">{Blocks(q.a, done ? q.b : 0, "#2a9d8f")}</div>;
    return <div className="groups">{Blocks(q.a, 0, "#2a9d8f")}<div className="op">+</div>{Blocks(q.b, 0, "#f4a261")}</div>;
  }
  if (q.pic === "rows") return <div className="groups">{Rows(q.a, q.b)}</div>;
  return null;
}

function Question() {
  const done = solved >= 0;
  const shown = done ? q.expr.split("?").join("" + q.answer) : q.expr;
  if (q.text) {
    return (
      <div className="card">
        <div className="storypic">{q.pic}</div>
        <div className="story">{q.text}</div>
        <div className="sum small">{done ? "= " + q.answer : "= ?"}</div>
      </div>
    );
  }
  const pic = Picture();
  return (
    <div className="card">
      {pic}
      <div className={shown.length > 11 ? "sum small" : "sum"} id="sum" onClick={() => instruct()}>{q.say.length ? "🔊 " : ""}{shown}</div>
    </div>
  );
}

function Choices() {
  const four = choices.length === 4;
  return (
    <div className="choices">
      {choices.map((n, i) => {
        const k = shake.i === i ? Math.max(0, 1 - (t - shake.t) / 0.4) : 0;
        const dx = Math.sin((t - shake.t) * 50) * 10 * k;
        const ok = solved >= 0 && n === q.answer;
        const pop = ok ? 1 + 0.15 * Math.max(0, 1 - (t - solved) * 2) : 1;
        const size = four ? 72 : 92;
        return (
          <div className={(ok ? "choice ok" : "choice") + (four ? " four" : "")} id={"ch" + i} onClick={() => pick(i)}
            style={{ marginLeft: (four ? 5 : 8) + dx, marginRight: (four ? 5 : 8) - dx, width: size * pop, height: size * pop, borderRadius: size * pop / 2 }}>{n}</div>
        );
      })}
    </div>
  );
}

function Progress() {
  const dots = [];
  for (let i = 0; i < ROUND; i++) dots.push(<div className={i < question ? "dot done" : i === question ? "dot now" : "dot"} />);
  return <div className="progress">{dots}</div>;
}

// the step of an adaptive level: three little bars, and ▲/▼ when it changes
function StepBadge() {
  if (!adaptive()) return null;
  const s = step();
  const bars = [];
  for (let i = 0; i < STEPS; i++) bars.push(<div className={i <= s ? "sbar on" : "sbar"} style={{ height: 8 + i * 6 }} />);
  const fresh = t - stepMsg < 1.6;
  return (
    <div className="stepline">
      <div className="steplabel">{rg.t("Taso", "Level", "Nivel")}</div>
      {bars}
      {fresh ? <div className={stepUp ? "stepmsg up" : "stepmsg"}>{stepUp ? "▲" : "▼"}</div> : null}
    </div>
  );
}

function Menu() {
  const bob = Math.sin(t * 2.5) * 4;
  return (
    <div className="screen">
      <div className="title" style={{ marginTop: 24 + bob }}>{rg.t("Laskupeli", "Counting", "Contar")}</div>
      <div className="lead">🍎 + 🍎🍎 = ?</div>
      <div className="levels">
        {LEVELS.map((L, i) => (
          <div className={i >= 3 ? "level half" : "level wide"} id={"lv" + i} onClick={() => startLevel(i)} style={{ backgroundColor: L.color }}>
            <div className="lvname">{L.name}</div>
            <div className="lvbest">{(best[i] > 0 ? "⭐ " + best[i] + "/" + ROUND : "") + (i >= 3 && steps[i] > 0 ? "  " + ["▮", "▮▮", "▮▮▮"][steps[i]] : "")}</div>
          </div>
        ))}
      </div>
      <div className="level back" id="exit" onClick={() => rg.exit()}><div className="lvname">{rg.t("← Valikkoon", "← Menu", "← Menú")}</div></div>
    </div>
  );
}

function Done() {
  const stars = [];
  for (let i = 0; i < ROUND; i++) stars.push(<div className={i < right ? "bigstar" : "bigstar off"}>⭐</div>);
  return (
    <div className="screen">
      <div className="title" style={{ marginTop: 80 }}>{right >= 8 ? rg.t("Mahtavaa!", "Awesome!", "¡Fantástico!") : right >= 5 ? rg.t("Hienoa!", "Great!", "¡Genial!") : rg.t("Hyvä yritys!", "Good try!", "¡Buen intento!")}</div>
      <div className="stars">{stars}</div>
      <div className="lead">{right} / {ROUND} {rg.t("oikein heti", "right first time", "a la primera")}</div>
      <div className="level wide" id="again" onClick={() => startLevel(level)} style={{ backgroundColor: LEVELS[level].color }}><div className="lvname">{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div></div>
      <div className="level back" id="menu" onClick={() => { mode = "menu"; rg.sound("click"); }}><div className="lvname">{rg.t("← Takaisin", "← Back", "← Atrás")}</div></div>
    </div>
  );
}

function view() {
  let body;
  if (mode === "menu") body = Menu();
  else if (mode === "done") body = Done();
  else body = (
    <div className="screen">
      {Progress()}
      {StepBadge()}
      {Question()}
      {Choices()}
    </div>
  );
  return (
    <div className="root">
      {body}
      {sparks.map((s) => <div className="spark" style={{ left: s.x, top: s.y, opacity: 1 - s.t / 1.2, backgroundColor: s.c }} />)}
    </div>
  );
}
