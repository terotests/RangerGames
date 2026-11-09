// Aakkoset: letters, syllables and words with pictures. Two levels:
//  Eskari   - which letter does the picture start with, and find every
//             copy of a letter (big or small) on the board
//  2. lk    - fill in the missing syllable, and pick the right spelling
// Ten tasks a round; a star for each task solved without a mistake.

type Mode = "menu" | "play" | "done";
type Kind = "first" | "find" | "syll" | "word";
type Word = { e: string; s: string[] };
type Tile = { ch: string; ok: boolean; got: boolean; shake: number };
type Spark = { x: number; y: number; vx: number; vy: number; t: number; c: string };

const WORDS: Word[] = [
  { e: "🐱", s: ["KIS", "SA"] }, { e: "🐶", s: ["KOI", "RA"] }, { e: "🐟", s: ["KA", "LA"] },
  { e: "🍎", s: ["O", "ME", "NA"] }, { e: "☀️", s: ["AU", "RIN", "KO"] }, { e: "🏠", s: ["TA", "LO"] },
  { e: "🚗", s: ["AU", "TO"] }, { e: "⚽", s: ["PAL", "LO"] }, { e: "🌙", s: ["KUU"] },
  { e: "🐄", s: ["LEH", "MÄ"] }, { e: "🐭", s: ["HII", "RI"] }, { e: "🐷", s: ["SI", "KA"] },
  { e: "🐔", s: ["KA", "NA"] }, { e: "🦆", s: ["ANK", "KA"] }, { e: "🐰", s: ["JÄ", "NIS"] },
  { e: "🐻", s: ["KAR", "HU"] }, { e: "🦔", s: ["SII", "LI"] }, { e: "🌸", s: ["KUK", "KA"] },
  { e: "🌳", s: ["PUU"] }, { e: "⛵", s: ["LAI", "VA"] }, { e: "🚂", s: ["JU", "NA"] },
  { e: "⭐", s: ["TÄH", "TI"] }, { e: "❤️", s: ["SY", "DÄN"] }, { e: "🍓", s: ["MAN", "SIK", "KA"] },
  { e: "🍌", s: ["BA", "NAA", "NI"] }, { e: "🥕", s: ["PORK", "KA", "NA"] }, { e: "⏰", s: ["KEL", "LO"] },
  { e: "📖", s: ["KIR", "JA"] }, { e: "🐸", s: ["SAM", "MAK", "KO"] }, { e: "⛄", s: ["LU", "MI", "UK", "KO"] },
  { e: "🐴", s: ["HE", "VO", "NEN"] }, { e: "🍞", s: ["LEI", "PÄ"] }, { e: "🚀", s: ["RA", "KET", "TI"] },
  { e: "🦋", s: ["PER", "HO", "NEN"] }, { e: "🐌", s: ["E", "TA", "NA"] }, { e: "🦉", s: ["PÖL", "LÖ"] },
  { e: "🐍", s: ["KÄÄR", "ME"] }, { e: "🍄", s: ["SIE", "NI"] }, { e: "🧀", s: ["JUUS", "TO"] },
  { e: "🐝", s: ["MEH", "I", "LÄI", "NEN"] }, { e: "👑", s: ["KRUU", "NU"] }, { e: "🦊", s: ["KET", "TU"] },
];
const ABC = "ABDEFGHIJKLMNOPRSTUVYÄÖ";
const FIND = "AEIOUSKLMNPRTVJHYÄÖ";
const SPARK = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#ffffff"];
const LEVELS = [
  { name: "Eskari", sub: "Alkukirjaimet ja kirjainten etsintä", color: "#06d6a0", kinds: ["first", "find"] },
  { name: "2. luokka", sub: "Tavut ja sanojen kirjoitus", color: "#118ab2", kinds: ["syll", "word"] },
];
const ROUND = 10;

let mode: Mode = "menu";
let level = 0;
let task = 0;
let right = 0;
let t = 0;
let kind: Kind = "first";
let word: Word = WORDS[0];
let hole = 0;            // the missing syllable
let target = "A";        // the letter to find
let choices: string[] = [];
let tiles: Tile[] = [];
let answer = "";
let mistakes = 0;
let solved = -1;
let shake = { i: -1, t: 0 };
let sparks: Spark[] = [];
let best: number[] = [0, 0];
let recent: number[] = [];

function init() { best = rg.load("best", [0, 0]); }

function text(w: Word) { return w.s.join(""); }

function freshWord(test: (w: Word) => boolean): Word {
  for (let k = 0; k < 60; k++) {
    const i = Math.floor(rg.random() * WORDS.length);
    if (recent.indexOf(i) >= 0 || !test(WORDS[i])) continue;
    recent.push(i);
    if (recent.length > 8) recent.shift();
    return WORDS[i];
  }
  return WORDS[0];
}

// a plausible wrong spelling: a doubled letter made single, a single made
// double, or a vowel swapped for its neighbour
function misspell(w: string): string {
  const pairs: string[][] = [["A", "Ä"], ["O", "Ö"], ["U", "Y"], ["E", "I"], ["O", "U"], ["K", "G"], ["T", "D"]];
  for (let k = 0; k < 30; k++) {
    const i = Math.floor(rg.random() * w.length);
    const r = rg.random();
    let v = w;
    if (r < 0.35 && i > 0 && w.charAt(i) === w.charAt(i - 1)) v = w.slice(0, i) + w.slice(i + 1);
    else if (r < 0.65 && i > 0 && w.charAt(i) !== w.charAt(i - 1) && w.charAt(i) !== w.charAt(i + 1)) v = w.slice(0, i) + w.charAt(i) + w.slice(i);
    else {
      for (const p of pairs) {
        const c = w.charAt(i);
        if (c === p[0]) { v = w.slice(0, i) + p[1] + w.slice(i + 1); break; }
        if (c === p[1]) { v = w.slice(0, i) + p[0] + w.slice(i + 1); break; }
      }
    }
    if (v !== w) return v;
  }
  return w + w.charAt(w.length - 1);
}

function next() {
  const L = LEVELS[level];
  kind = L.kinds[task % L.kinds.length] as Kind;
  mistakes = 0;
  solved = -1;
  shake = { i: -1, t: 0 };
  if (kind === "first") {
    word = freshWord((w) => ABC.indexOf(text(w).charAt(0)) >= 0);
    answer = text(word).charAt(0);
    const set = [answer];
    while (set.length < 3) { const c = ABC.charAt(Math.floor(rg.random() * ABC.length)); if (set.indexOf(c) < 0) set.push(c); }
    choices = rg.shuffle(set);
  } else if (kind === "find") {
    target = FIND.charAt(Math.floor(rg.random() * FIND.length));
    const n = 3 + (task % 2);
    tiles = [];
    for (let i = 0; i < 12; i++) {
      if (i < n) tiles.push({ ch: rg.random() < 0.5 ? target : target.toLowerCase(), ok: true, got: false, shake: 0 });
      else {
        let c = target;
        while (c === target) c = FIND.charAt(Math.floor(rg.random() * FIND.length));
        tiles.push({ ch: rg.random() < 0.5 ? c : c.toLowerCase(), ok: false, got: false, shake: 0 });
      }
    }
    tiles = rg.shuffle(tiles);
  } else if (kind === "syll") {
    word = freshWord((w) => w.s.length >= 2);
    hole = Math.floor(rg.random() * word.s.length);
    answer = word.s[hole];
    const set = [answer];
    let guard = 0;
    while (set.length < 3 && guard++ < 200) {
      const w = rg.pick(WORDS);
      const s = rg.pick(w.s);
      if (set.indexOf(s) < 0 && Math.abs(s.length - answer.length) <= 1) set.push(s);
    }
    choices = rg.shuffle(set);
  } else {
    word = freshWord((w) => text(w).length >= 4);
    answer = text(word);
    const set = [answer];
    let guard = 0;
    while (set.length < 3 && guard++ < 50) { const v = misspell(answer); if (set.indexOf(v) < 0) set.push(v); }
    choices = rg.shuffle(set);
  }
}

function burst(x: number, y: number, n: number) {
  for (let k = 0; k < n; k++) {
    const a = rg.random() * Math.PI * 2, sp = 80 + rg.random() * 220;
    sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, t: 0, c: rg.pick(SPARK) });
  }
}

function win(x: number, y: number) {
  solved = t;
  if (mistakes === 0) right++;
  rg.sound(mistakes === 0 ? "star" : "coin");
  rg.vibrate(20);
  burst(x, y, 26);
}

function miss(i: number) {
  mistakes++;
  shake = { i, t };
  rg.sound("wrong");
  rg.vibrate(60);
}

function choose(i: number) {
  if (solved >= 0) return;
  if (choices[i] === answer) win(width / 2, height * 0.62);
  else miss(i);
}

function tap(i: number) {
  if (solved >= 0) return;
  const tl = tiles[i];
  if (tl.got) return;
  if (tl.ok) {
    tl.got = true;
    rg.sound("pop", { pitch: 1 + tiles.filter((x) => x.got).length * 0.12 });
    const col = i % 4, row = Math.floor(i / 4);
    burst(width / 2 - 120 + col * 80 + 30, height * 0.42 + row * 80, 8);
    if (tiles.every((x) => !x.ok || x.got)) win(width / 2, height * 0.5);
  } else {
    tl.shake = t;
    miss(i);
  }
}

function startLevel(i: number) {
  level = i;
  task = 0;
  right = 0;
  mode = "play";
  rg.sound("click");
  rg.music("calm", { volume: 0.35 });
  next();
}

function tick(dt: number) {
  t += dt;
  for (const s of sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 500 * dt; }
  sparks = sparks.filter((s) => s.t < 1.2);
  if (mode === "play" && solved >= 0 && t - solved > 1.4) {
    task++;
    if (task >= ROUND) {
      mode = "done";
      rg.stopMusic();
      if (right > best[level]) { best[level] = right; rg.save("best", best); }
      rg.sound(right >= 8 ? "win" : "coin");
    } else next();
  }
}

function onBack() {
  if (mode === "menu") rg.exit(); else { mode = "menu"; rg.stopMusic(); rg.sound("click"); }
}

// ---- drawing -----------------------------------------------------------------

function wobble(i: number) {
  if (shake.i !== i) return 0;
  const k = Math.max(0, 1 - (t - shake.t) / 0.4);
  return Math.sin((t - shake.t) * 50) * 10 * k;
}

function Choices(big: boolean) {
  return (
    <div className={big ? "choices" : "choices col"}>
      {choices.map((c, i) => {
        const ok = solved >= 0 && c === answer;
        const dx = wobble(i);
        return (
          <div className={(big ? "choice" : "wordchoice") + (ok ? " ok" : "")} id={"ch" + i} onClick={() => choose(i)}
            style={{ marginLeft: 8 + dx, marginRight: 8 - dx }}>{c}</div>
        );
      })}
    </div>
  );
}

function Picture() {
  const bob = Math.sin(t * 2.2) * 5;
  return <div className="pic" style={{ marginTop: bob }}>{word.e}</div>;
}

function First() {
  const done = solved >= 0;
  const w = text(word);
  return (
    <div className="screen">
      {Progress()}
      <div className="ask">Millä kirjaimella alkaa?</div>
      <div className="card">
        {Picture()}
        <div className="word">
          <div className="letter first">{done ? w.charAt(0) : "?"}</div>
          {done ? <div className="letter">{w.slice(1)}</div> : null}
        </div>
      </div>
      {Choices(true)}
    </div>
  );
}

function Find() {
  return (
    <div className="screen">
      {Progress()}
      <div className="ask">Etsi kaikki kirjaimet</div>
      <div className="target">{target} {target.toLowerCase()}</div>
      <div className="board">
        {tiles.map((tl, i) => {
          const k = tl.shake > 0 ? Math.max(0, 1 - (t - tl.shake) / 0.4) : 0;
          const dx = Math.sin((t - tl.shake) * 50) * 8 * k;
          return (
            <div className={tl.got ? "tile got" : "tile"} id={"t" + i} onClick={() => tap(i)}
              style={{ marginLeft: 5 + dx, marginRight: 5 - dx }}>{tl.ch}</div>
          );
        })}
      </div>
      <div className="left">{tiles.filter((x) => x.ok && !x.got).length > 0 ? "Vielä " + tiles.filter((x) => x.ok && !x.got).length : "Kaikki löytyi!"}</div>
    </div>
  );
}

function Syll() {
  const done = solved >= 0;
  return (
    <div className="screen">
      {Progress()}
      <div className="ask">Mikä tavu puuttuu?</div>
      <div className="card">
        {Picture()}
        <div className="word">
          {word.s.map((s, i) => (
            <div className="sylrow">
              {i > 0 ? <div className="dash">-</div> : null}
              <div className={i === hole ? (done ? "syl fill" : "syl hole") : "syl"}>{i === hole && !done ? "?" : s}</div>
            </div>
          ))}
        </div>
      </div>
      {Choices(true)}
    </div>
  );
}

function Spell() {
  return (
    <div className="screen">
      {Progress()}
      <div className="ask">Mikä sana on oikein?</div>
      <div className="card">{Picture()}</div>
      {Choices(false)}
    </div>
  );
}

function Progress() {
  const dots = [];
  for (let i = 0; i < ROUND; i++) dots.push(<div className={i < task ? "dot done" : i === task ? "dot now" : "dot"} />);
  return <div className="progress">{dots}</div>;
}

function Menu() {
  const bob = Math.sin(t * 2.5) * 6;
  return (
    <div className="screen">
      <div className="title" style={{ marginTop: 50 + bob }}>Aakkoset</div>
      <div className="lead">A a  B b  C c</div>
      {LEVELS.map((L, i) => (
        <div className="level" id={"lv" + i} onClick={() => startLevel(i)} style={{ backgroundColor: L.color }}>
          <div className="lvname">{L.name}</div>
          <div className="lvsub">{L.sub}</div>
          <div className="lvbest">{best[i] > 0 ? "⭐ " + best[i] + "/" + ROUND : ""}</div>
        </div>
      ))}
      <div className="level back" id="exit" onClick={() => rg.exit()}><div className="lvname">← Valikkoon</div></div>
    </div>
  );
}

function Done() {
  const stars = [];
  for (let i = 0; i < ROUND; i++) stars.push(<div className={i < right ? "bigstar" : "bigstar off"}>⭐</div>);
  return (
    <div className="screen">
      <div className="title" style={{ marginTop: 80 }}>{right >= 8 ? "Mahtavaa!" : right >= 5 ? "Hienoa!" : "Hyvä yritys!"}</div>
      <div className="stars">{stars}</div>
      <div className="lead">{right} / {ROUND} ilman virheitä</div>
      <div className="level" id="again" onClick={() => startLevel(level)} style={{ backgroundColor: LEVELS[level].color }}><div className="lvname">Uudestaan!</div></div>
      <div className="level back" id="menu" onClick={() => { mode = "menu"; rg.sound("click"); }}><div className="lvname">← Takaisin</div></div>
    </div>
  );
}

function view() {
  let body;
  if (mode === "menu") body = Menu();
  else if (mode === "done") body = Done();
  else if (kind === "first") body = First();
  else if (kind === "find") body = Find();
  else if (kind === "syll") body = Syll();
  else body = Spell();
  return (
    <div className="root">
      {body}
      {sparks.map((s) => <div className="spark" style={{ left: s.x, top: s.y, opacity: 1 - s.t / 1.2, backgroundColor: s.c }} />)}
    </div>
  );
}
