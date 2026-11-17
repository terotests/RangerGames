// Lukuseikkailu: reading fluency for a second grader who reads sentences but
// slowly. 5–10 minutes a day, four ways to play:
//   1 Sanasalama     a word appears (and on later steps flashes away); read it
//                    aloud, then pick its picture from three
//   2 Tavuraketti    a long word in syllables on a rocket: every syllable read
//                    aloud lights the next one, then the whole word, then the
//                    picture
//   3 Lausemestari   read a sentence aloud, then say if it is true or false
//   4 Lukulohikäärme a minute of reading a short story aloud: words per
//                    minute, then questions about the story; the same story
//                    again later shows the child's own progress
//
// The microphone (rg.sensor("mic")) only listens to the loudness: no speech
// recognition, works offline. Voice for long enough means "read aloud" (🎤);
// without a microphone a "Luin!" button does the same. Stars come only from
// right answers (the picture, true/false, the story questions): reading
// correctly is what counts, not speed. Each mode adapts in three steps (three
// right first tries up, two misses down). The stars grow the dragon; the
// progress page shows the week's reading days and the story speeds.
import { WORDS, SENTENCES, STORIES, Word, Sentence, Story, plain, syllables, syllableCount, wordsOf, wordPool, distractors, wordClip } from "lib/data";
import { Ear, newEar, hear, resetCount, needVoice, doneReading, readProgress } from "lib/voice";

type Mode = "menu" | "play" | "done" | "story" | "progress";
type Kind = "flash" | "syll" | "sent" | "story";
type Spark = { x: number; y: number; vx: number; vy: number; t: number; c: string };
type Day = { d: string; s: number; r: number };            // date, seconds played, read aloud
type Speed = { d: string; id: string; wpm: number; ok: number };

const MODES = [
  { kind: "flash" as Kind, name: "Sanasalama", icon: "⚡", color: "#f8961e", info: "Lue sana ja valitse kuva" },
  { kind: "syll" as Kind, name: "Tavuraketti", icon: "🚀", color: "#577590", info: "Lue tavut ja koko sana" },
  { kind: "sent" as Kind, name: "Lausemestari", icon: "🤔", color: "#43aa8b", info: "Totta vai tarua?" },
  { kind: "story" as Kind, name: "Lukulohikäärme", icon: "🐉", color: "#9b5de5", info: "Minuutin tarina" },
];
const ROUND = 8;
const STEPS = 3;
const STORY_TIME = 60;
const SPARK = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#ffffff"];
const WEEK = ["Su", "Ma", "Ti", "Ke", "To", "Pe", "La"];
// the week's plan (getDay(): 0 = Sunday): which mode is "today's"
const PLAN = [-1, 0, 1, 3, 2, 3, -1];
const GROW = [10, 40, 100, 200];                            // stars for the dragon's next stage
const PRAISE = ["hyva", "hienoa", "mahtavaa", "oikein", "loistavaa", "jee", "taitava", "osaat"];

let mode: Mode = "menu";
let cur = 0;                        // the mode played
let t = 0;
let sparks: Spark[] = [];
let steps: number[] = [0, 0, 0, 0];
let best: number[] = [0, 0, 0, 0];
let stars = 0;                      // all stars ever (the dragon)
let days: Day[] = [];
let speeds: Speed[] = [];
let praiseN = 0;

// the microphone
let ear: Ear = newEar();
let mic = "wait";                   // "wait" | "on" | "off"
let micSeen = -10;                  // when the last level came

// a round of words or sentences
type Phase = "read" | "whole" | "pick" | "solved";
let phase: Phase = "read";
let question = 0;
let right = 0;
let aloud = 0;                      // tasks read aloud (heard) this round
let firstTry = true;
let streak = 0;
let missRow = 0;
let stepMsg = -10;
let stepUp = true;
let shownAt = 0;                    // when the task appeared
let heardAt = -10;                  // when the voice was enough
let solvedAt = -10;
let word: Word = WORDS[0];
let pics: Word[] = [];
let wrong: number[] = [];
let shake = { i: -1, t: -10 };
let sylI = 0;                       // Tavuraketti: the syllable being read
let sylBursts = 0;
let sent: Sentence = SENTENCES[0][0];
let sentI = 0;
let used: string[] = [];
let answerOk = false;               // Lausemestari: the child's last answer was right

// the story
type SPhase = "start" | "read" | "where" | "quiz" | "result";
let sphase: SPhase = "start";
let story: Story = STORIES[0][0];
let pages: string[] = [];
let page = 0;
let storyT = 0;                     // seconds read
let storyWords = 0;
let storyWpm = 0;
let storyErr = 0;
let qI = 0;
let qOrder: string[] = [];
let qWrong: number[] = [];
let qRight = 0;
let qFirst = true;
let qSolvedAt = -10;
let pageVoice = 0;
let lastSpeed: Speed | null = null;

function fill(arr: number[], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(arr && i < arr.length ? arr[i] : 0);
  return out;
}

function today(): string {
  const d = new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1 < 10 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate();
}

function init() {
  steps = fill(rg.load("steps", []), MODES.length);
  best = fill(rg.load("best", []), MODES.length);
  stars = rg.load("stars", 0);
  days = rg.load("days", []);
  speeds = rg.load("speeds", []);
  rg.seed(Math.floor(Date.now() % 100000) + 1);
  rg.sensor("mic", true);
  rg.say("lu_tervetuloa");
}

function onMic(m: any) {
  if (mic !== "on") mic = "on";
  micSeen = t;
  hear(ear, m.db, !!m.talk, 0.05);
}

function onSensor(name: string, data: any) {
  if (name === "error" && data && data.sensor === "mic") mic = "off";
}

// no level for a while: the microphone is not there (a desktop without one)
function micOn(): boolean { return mic === "on" && t - micSeen < 2; }

function praise() { praiseN++; return PRAISE[praiseN % PRAISE.length]; }

function kind(): Kind { return MODES[cur].kind; }
function step(): number { return steps[cur]; }

// ---- time and days --------------------------------------------------------------

function addTime(dt: number, read: number) {
  const d = today();
  let e = days.length ? days[days.length - 1] : null;
  if (!e || e.d !== d) { e = { d, s: 0, r: 0 }; days.push(e); if (days.length > 60) days.shift(); }
  e.s += dt;
  e.r += read;
}

let saveT = 0;
function saveDays() { rg.save("days", days); saveT = t; }

function dayOf(offset: number): Day | null {
  const d = new Date(Date.now() - offset * 86400000);
  const k = d.getFullYear() + "-" + (d.getMonth() + 1 < 10 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate();
  for (const e of days) if (e.d === k) return e;
  return null;
}

// ---- rounds of words and sentences ---------------------------------------------------

function pickWord() {
  const pool = wordPool(kind() === "flash" ? "flash" : "syll", step()).filter((w) => used.indexOf(w.s) < 0);
  word = pool.length ? rg.pick(pool) : rg.pick(wordPool("flash", 2));
  used.push(word.s);
  pics = rg.shuffle([word].concat(distractors(word, step(), rg.random)));
}

function pickSentence() {
  const list = SENTENCES[step()];
  let i = rg.range(0, list.length - 1), guard = 0;
  while (used.indexOf("s" + step() + "_" + i) >= 0 && guard++ < 40) i = rg.range(0, list.length - 1);
  used.push("s" + step() + "_" + i);
  sentI = i;
  sent = list[i];
}

function next() {
  firstTry = true;
  wrong = [];
  phase = "read";
  shownAt = t;
  heardAt = -10;
  solvedAt = -10;
  sylI = 0;
  sylBursts = 0;
  resetCount(ear);
  if (kind() === "sent") { pickSentence(); rg.say("lu_lue_lause"); }
  else {
    pickWord();
    if (kind() === "syll") rg.say("lu_lue_tavut"); else if (question === 0) rg.say("lu_lue_sana");
  }
}

function startMode(i: number) {
  cur = i;
  rg.sound("click");
  if (kind() === "story") { openStory(); return; }
  mode = "play";
  question = 0;
  right = 0;
  aloud = 0;
  streak = 0;
  missRow = 0;
  stepMsg = -10;
  used = [];
  next();
}

function setStep(d: number) {
  const s = Math.max(0, Math.min(STEPS - 1, steps[cur] + d));
  if (s === steps[cur]) return;
  steps[cur] = s;
  rg.save("steps", steps);
  stepMsg = t;
  stepUp = d > 0;
  streak = 0;
  missRow = 0;
}

// how long a flashed word stays on the screen (Sanasalama, later steps)
function flashTime(): number {
  if (kind() !== "flash" || step() === 0) return 1000;
  const n = syllables(word).length;
  return (step() === 1 ? 2.2 : 1.4) + n * 0.35;
}

function wordHidden(): boolean {
  return kind() === "flash" && phase !== "solved" && wrong.length === 0 && t - shownAt > flashTime();
}

// the syllables to read now (how long the child may take)
function needed(): number {
  if (kind() === "sent") return syllableCount(sent.t);
  return syllables(word).length;
}

// the voice was enough: on to the answer
function heard(byMic: boolean) {
  if (heardAt >= 0) return;
  heardAt = t;
  if (byMic) {
    aloud++;
    addTime(0, 1);
    rg.sound("pop", { volume: 0.7 });
  } else rg.sound("click");
  if (kind() === "sent") rg.say("lu_totta_tarua");
  else if (kind() === "flash" && question === 0) rg.say("lu_mika_kuva");
  phase = "pick";
}

function sylNext(byMic: boolean) {
  if (phase !== "read") return;
  sylI++;
  sylBursts = ear.bursts;
  rg.sound("tick", { pitch: 1 + sylI * 0.15 });
  if (sylI >= syllables(word).length) {
    phase = "whole";
    resetCount(ear);
    shownAt = t;
    rg.say("lu_lue_koko");
  }
}

function success(x: number, y: number) {
  phase = "solved";
  solvedAt = t;
  if (firstTry) {
    right++;
    stars++;
    rg.save("stars", stars);
    streak++;
    missRow = 0;
  }
  rg.celebrate(x, y, { sound: false });
  rg.sound(firstTry ? "star" : "coin");
  // the model reading: the word or the sentence said right after the child
  if (kind() === "sent") rg.say(["lu_s_" + step() + "_" + sentI, praise()]);
  else rg.say([wordClip(word), praise()]);
  for (let k = 0; k < 24; k++) {
    const ang = rg.random() * Math.PI * 2, sp = 80 + rg.random() * 220;
    sparks.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120, t: 0, c: rg.pick(SPARK) });
  }
  if (streak >= 3) setStep(1);
}

function miss() {
  if (firstTry) { missRow++; streak = 0; if (missRow >= 2) setStep(-1); }
  firstTry = false;
  rg.sound("wrong");
  rg.vibrate(60);
}

function pickPic(i: number) {
  if (phase !== "pick" || wrong.indexOf(i) >= 0) return;
  if (pics[i] === word) { success(picX(i) + 48, picY() + 48); return; }
  miss();
  wrong.push(i);
  shake = { i, t };
  rg.say(["kokeile_toista", "lu_lue_uudestaan"]);
}

function answer(ok: boolean) {
  if (phase !== "pick") return;
  answerOk = ok === sent.ok;
  if (answerOk) { success(width / 2, sentY() + 40); return; }
  miss();
  shake = { i: ok ? 0 : 1, t };
  rg.say(["kokeile_toista", "lu_lue_uudestaan"]);
  // read it again: the answer buttons wait for the voice once more
  phase = "read";
  heardAt = -10;
  resetCount(ear);
  shownAt = t;
}

function endRound() {
  mode = "done";
  if (right > best[cur]) { best[cur] = right; rg.save("best", best); }
  saveDays();
  if (right >= 5) rg.celebrate(width / 2, height * 0.3, { big: true }); else rg.sound("coin");
  rg.say(right >= 2 ? [right >= 7 ? "mahtavaa" : right >= 4 ? "hienoa" : "hyvin_meni", "sait", rg.sayId.number(right), "tahtea"] : ["hyvin_meni"]);
}

// ---- the story -----------------------------------------------------------------

function splitPages(text: string): string[] {
  // the sentences: split after . ! ?
  const parts: string[] = [];
  let acc = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    acc += c;
    if ((c === "." || c === "!" || c === "?") && (i + 1 >= text.length || text.charAt(i + 1) === " ")) { parts.push(acc); acc = ""; }
  }
  if (acc.trim()) parts.push(acc);
  const out: string[] = [];
  let curP = "";
  for (const p0 of parts) {
    const p = p0.trim();
    if (curP && wordsOf(curP + " " + p).length > 16) { out.push(curP); curP = p; }
    else curP = curP ? curP + " " + p : p;
  }
  if (curP) out.push(curP);
  return out;
}

function storyPick(): Story {
  // Wednesday is for reading the same story again; otherwise the next new one
  const list = STORIES[step()];
  const d = new Date().getDay();
  const read = speeds.filter((s) => list.some((x) => x.id === s.id));
  if (d === 3 && read.length) {
    const last = read[read.length - 1];
    for (const x of list) if (x.id === last.id) return x;
  }
  for (const x of list) if (!speeds.some((s) => s.id === x.id)) return x;
  return rg.pick(list);
}

function openStory(again?: boolean) {
  mode = "story";
  if (!again) story = storyPick();
  pages = splitPages(story.text);
  page = 0;
  sphase = "start";
  storyT = 0;
  storyWords = 0;
  storyErr = 0;
  qI = 0;
  qRight = 0;
  lastSpeed = null;
  for (const s of speeds) if (s.id === story.id) lastSpeed = s;
  rg.say("lu_tarina_alku");
}

function storyStart() {
  sphase = "read";
  storyT = 0;
  page = 0;
  pageVoice = 0;
  resetCount(ear);
  rg.sound("click");
}

function wordsBefore(p: number): number {
  let n = 0;
  for (let i = 0; i < p; i++) n += wordsOf(pages[i]).length;
  return n;
}

function storyNextPage() {
  if (sphase !== "read") return;
  rg.sound("click");
  if (page + 1 < pages.length) { page++; pageVoice = 0; resetCount(ear); return; }
  // the whole story before the minute was up
  storyWords = wordsBefore(pages.length);
  finishReading();
}

function storyWhere(i: number) {
  if (sphase !== "where") return;
  storyWords = wordsBefore(page) + i + 1;
  rg.sound("click");
  finishReading();
}

function finishReading() {
  const secs = Math.max(10, Math.min(STORY_TIME, storyT));
  storyWpm = Math.round(storyWords * 60 / secs);
  sphase = "quiz";
  qI = 0;
  qRight = 0;
  startQuestion();
}

function startQuestion() {
  const q = story.qs[qI];
  qOrder = rg.shuffle(q.a.slice());
  qWrong = [];
  qFirst = true;
  qSolvedAt = -10;
  rg.say(["lu_kysymys", "lu_q_" + story.id + "_" + qI], { queue: false });
}

function storyAnswer(i: number) {
  if (sphase !== "quiz" || qSolvedAt >= 0 || qWrong.indexOf(i) >= 0) return;
  const q = story.qs[qI];
  if (qOrder[i] === q.a[0]) {
    qSolvedAt = t;
    if (qFirst) { qRight++; stars++; rg.save("stars", stars); }
    rg.celebrate(width / 2, qY(i) + 26, { sound: false });
    rg.sound(qFirst ? "star" : "coin");
    rg.say(praise());
  } else {
    qFirst = false;
    qWrong.push(i);
    rg.sound("wrong");
    rg.vibrate(60);
    rg.say(["kokeile_toista"]);
  }
}

function storyResult() {
  sphase = "result";
  // finishing the minute is worth a star too: reading is the work
  stars++;
  rg.save("stars", stars);
  const sp: Speed = { d: today(), id: story.id, wpm: storyWpm, ok: Math.max(0, storyWpm - storyErr) };
  speeds.push(sp);
  if (speeds.length > 80) speeds.shift();
  rg.save("speeds", speeds);
  const all = qRight + 1;
  if (all >= 3) { streak = 0; setStep(1); } else if (qRight === 0) setStep(-1);
  if (all > best[cur]) { best[cur] = all; rg.save("best", best); }
  saveDays();
  rg.celebrate(width / 2, 200, { big: all >= 3 });
  rg.say(["lu_luit", rg.sayId.number(Math.min(100, storyWpm)), "lu_sanaa_minuutissa"]);
}

function setErrors(d: number) {
  storyErr = Math.max(0, Math.min(storyWords, storyErr + d));
  const sp = speeds[speeds.length - 1];
  if (sp && sp.id === story.id) { sp.ok = Math.max(0, storyWpm - storyErr); rg.save("speeds", speeds); }
  rg.sound("click");
}

// ---- the frame -------------------------------------------------------------------------

function tick(dt: number) {
  t += dt;
  for (const s of sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 500 * dt; }
  sparks = sparks.filter((s) => s.t < 1.2);
  if (mode === "play" || mode === "story") addTime(dt, 0);
  if (t - saveT > 20 && (mode === "play" || mode === "story")) saveDays();

  if (mode === "play") {
    if (phase === "read") {
      if (kind() === "syll") {
        // every new burst of voice lights the next syllable
        if (ear.bursts > sylBursts && !ear.on) sylNext(true);
      } else if (doneReading(ear, needed())) heard(true);
    } else if (phase === "whole" && doneReading(ear, syllables(word).length)) {
      heard(true);
    }
    if (phase === "solved" && t - solvedAt > 1.8) {
      question++;
      if (question >= ROUND) endRound(); else next();
    }
  }
  if (mode === "story") {
    if (sphase === "read") {
      storyT += dt;
      pageVoice = ear.voiced;
      if (storyT >= STORY_TIME) {
        sphase = "where";
        rg.sound("win");
        rg.say("lu_mihin");
      }
    }
    if (sphase === "quiz" && qSolvedAt >= 0 && t - qSolvedAt > 1.6) {
      qI++;
      if (qI >= story.qs.length) storyResult(); else startQuestion();
    }
  }
}

function onBack() {
  if (mode === "menu") rg.exit();
  else { saveDays(); mode = "menu"; rg.stopSay(); rg.sound("click"); }
}

function onClose() {
  saveDays();
  return true;
}

// ---- drawing: the dragon -----------------------------------------------------------------

function stage(): number {
  let s = 0;
  for (const g of GROW) if (stars >= g) s++;
  return s;
}

// a path drawn in its own units (M/L/Q pairs), stretched to the box w × h
const BOXES: any = {};
function P(d: string, fill: string, x: number, y: number, w: number, h: number) {
  let vb = BOXES[d];
  if (!vb) {
    const nums = d.split(" ").filter((p) => p !== "" && !isNaN(Number(p))).map(Number);
    let mx = 1, my = 1;
    for (let i = 0; i + 1 < nums.length; i += 2) { mx = Math.max(mx, nums[i]); my = Math.max(my, nums[i + 1]); }
    vb = "0 0 " + mx + " " + my;
    BOXES[d] = vb;
  }
  return <path d={d} fill={fill} viewBox={vb} style={{ position: "absolute", left: x, top: y, width: w, height: h }} />;
}

function Oval(x: number, y: number, w: number, h: number, c: string, extra?: any) {
  const st: any = { left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: Math.min(w, h) / 2, backgroundColor: c };
  if (extra) for (const k in extra) st[k] = extra[k];
  return <div className="blob" style={st} />;
}

// the dragon drawn from ovals and paths; it grows with the stars:
// 0 an egg, 1 a hatchling, 2 wings, 3 a flame, 4 a crown
function Dragon(cx: number, cy: number, size: number, st: number) {
  const out: any[] = [];
  const bob = Math.sin(t * 2.4) * size * 0.03;
  const y = cy + bob;
  if (st === 0) {
    const w = Math.sin(t * 3) * 4;
    out.push(Oval(cx, cy + size * 0.42, size * 0.6, size * 0.1, "rgba(0,0,0,0.12)"));
    out.push(<div className="blob" style={{ left: cx - size * 0.28, top: cy - size * 0.38, width: size * 0.56, height: size * 0.76, borderRadius: size * 0.28, backgroundColor: "#fff3d6", border: "3px solid #e9c46a", transform: "rotate(" + w.toFixed(1) + "deg)" }}>
      <div className="blob" style={{ left: size * 0.1, top: size * 0.16, width: size * 0.12, height: size * 0.12, borderRadius: size * 0.06, backgroundColor: "#90be6d" }} />
      <div className="blob" style={{ left: size * 0.3, top: size * 0.36, width: size * 0.15, height: size * 0.15, borderRadius: size * 0.08, backgroundColor: "#43aa8b" }} />
      <div className="blob" style={{ left: size * 0.12, top: size * 0.52, width: size * 0.1, height: size * 0.1, borderRadius: size * 0.05, backgroundColor: "#90be6d" }} />
    </div>);
    return out;
  }
  const s = size * (0.62 + st * 0.1);
  const body = "#43aa8b", dark = "#2d7d65", belly = "#f9e3a3", wing = "#9b5de5";
  out.push(Oval(cx, cy + size * 0.44, s * 0.9, s * 0.1, "rgba(0,0,0,0.12)"));
  // tail
  out.push(P("M 0 40 Q 30 60 70 30 L 80 10 L 60 28 Q 30 44 4 26 Z", body, cx + s * 0.12, y + s * 0.05, s * 0.5, s * 0.36));
  // wings (from stage 2)
  if (st >= 2) {
    const flap = Math.sin(t * 6) * 6;
    out.push(<div className="blob" style={{ left: cx - s * 0.52, top: y - s * 0.38, width: s * 0.4, height: s * 0.4, transform: "rotate(" + (-10 + flap).toFixed(1) + "deg)" }}>
      {P("M 100 100 L 0 10 Q 30 40 20 60 Q 50 60 50 80 Q 80 75 100 100 Z", wing, 0, 0, s * 0.4, s * 0.4)}
    </div>);
    out.push(<div className="blob" style={{ left: cx + s * 0.12, top: y - s * 0.38, width: s * 0.4, height: s * 0.4, transform: "rotate(" + (10 - flap).toFixed(1) + "deg)" }}>
      {P("M 0 100 L 100 10 Q 70 40 80 60 Q 50 60 50 80 Q 20 75 0 100 Z", wing, 0, 0, s * 0.4, s * 0.4)}
    </div>);
  }
  // back spikes and the body
  out.push(P("M 0 30 L 10 0 L 20 30 L 30 2 L 40 30 L 50 4 L 60 30 Z", "#f9844a", cx - s * 0.22, y - s * 0.3, s * 0.44, s * 0.2));
  out.push(Oval(cx, y + s * 0.05, s * 0.62, s * 0.66, body));
  out.push(Oval(cx, y + s * 0.12, s * 0.38, s * 0.44, belly));
  // feet
  out.push(Oval(cx - s * 0.18, y + s * 0.38, s * 0.2, s * 0.12, dark));
  out.push(Oval(cx + s * 0.18, y + s * 0.38, s * 0.2, s * 0.12, dark));
  // head
  const hy = y - s * 0.36;
  out.push(Oval(cx, hy, s * 0.5, s * 0.42, body));
  out.push(Oval(cx, hy + s * 0.1, s * 0.34, s * 0.2, "#5fbf9f"));
  out.push(Oval(cx - s * 0.06, hy + s * 0.08, s * 0.04, s * 0.04, dark));
  out.push(Oval(cx + s * 0.06, hy + s * 0.08, s * 0.04, s * 0.04, dark));
  // eyes blink now and then
  const blink = (t % 4) < 0.15;
  out.push(Oval(cx - s * 0.11, hy - s * 0.06, s * 0.13, blink ? s * 0.02 : s * 0.14, "#ffffff"));
  out.push(Oval(cx + s * 0.11, hy - s * 0.06, s * 0.13, blink ? s * 0.02 : s * 0.14, "#ffffff"));
  if (!blink) {
    out.push(Oval(cx - s * 0.1, hy - s * 0.05, s * 0.065, s * 0.075, "#1b1b2f"));
    out.push(Oval(cx + s * 0.12, hy - s * 0.05, s * 0.065, s * 0.075, "#1b1b2f"));
  }
  out.push(Oval(cx - s * 0.19, hy + s * 0.06, s * 0.08, s * 0.05, "rgba(255,120,140,0.6)"));
  out.push(Oval(cx + s * 0.19, hy + s * 0.06, s * 0.08, s * 0.05, "rgba(255,120,140,0.6)"));
  // horns
  out.push(P("M 0 30 L 8 0 L 16 30 Z", "#f9c74f", cx - s * 0.17, hy - s * 0.3, s * 0.08, s * 0.14));
  out.push(P("M 0 30 L 8 0 L 16 30 Z", "#f9c74f", cx + s * 0.09, hy - s * 0.3, s * 0.08, s * 0.14));
  // a little flame now and then (from stage 3)
  if (st >= 3 && (t % 3) < 0.9) {
    const k = 0.6 + Math.sin(t * 20) * 0.15;
    out.push(P("M 0 20 Q 40 0 100 10 Q 70 20 100 30 Q 40 40 0 20 Z", "#f9844a", cx + s * 0.2, hy + s * 0.02, s * 0.5 * k, s * 0.2));
    out.push(P("M 0 20 Q 40 8 80 14 Q 60 20 80 26 Q 40 32 0 20 Z", "#ffd166", cx + s * 0.2, hy + s * 0.02, s * 0.4 * k, s * 0.2));
  }
  if (st >= 4) out.push(P("M 0 40 L 0 10 L 20 25 L 40 0 L 60 25 L 80 10 L 80 40 Z", "#ffd166", cx - s * 0.12, hy - s * 0.36, s * 0.24, s * 0.12));
  return out;
}

// ---- drawing: pieces ----------------------------------------------------------------

function MicBadge() {
  const on = micOn();
  const bars = [];
  for (let i = 0; i < 5; i++) {
    const lit = on && ear.level > i / 5;
    bars.push(<div className={lit ? (ear.on ? "mbar voice" : "mbar on") : "mbar"} style={{ height: 6 + i * 4 }} />);
  }
  return (
    <div className={on && ear.on ? "mic hear" : "mic"} style={{ left: 8, top: 8 }}>
      <div className="micicon">{mic === "off" ? "🔇" : "🎤"}</div>
      {on ? bars : null}
    </div>
  );
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
      <div className="steplabel">Taso</div>
      {bars}
      {fresh ? <div className={stepUp ? "stepmsg up" : "stepmsg"}>{stepUp ? "▲" : "▼"}</div> : null}
    </div>
  );
}

// the voice meter under the text: fills as the child reads aloud
function ReadMeter(y: number, need: number) {
  const w = Math.min(280, width - 60);
  const f = readProgress(ear, need);
  const ok = heardAt >= 0 && phase !== "read" && phase !== "whole";
  const out: any[] = [];
  if (micOn()) {
    out.push(
      <div className="meter" style={{ left: width / 2 - w / 2, top: y, width: w }}>
        <div className={ear.on ? "mfill voice" : "mfill"} style={{ width: Math.max(14, w * (ok ? 1 : f)) }} />
      </div>
    );
    out.push(<div className="mlabel" style={{ left: 0, top: y + 22, width }}>{ok ? "🎤 Kuulin, kun luit!" : ear.on || ear.voiced > 0 ? "🎤 Kuuntelen… lue rauhassa" : "🎤 Lue ääneen"}</div>);
  }
  // without a microphone (or if it does not catch a quiet reader) a button
  const late = t - shownAt > (micOn() ? 5 : 0.8);
  if (late && (phase === "read" || phase === "whole")) {
    out.push(
      <div className="luin" id="luin" style={{ left: width / 2 - 90, top: y + (micOn() ? 50 : 0) }} onClick={() => { if (kind() === "syll" && phase === "read") sylNext(false); else heard(false); }}>
        <div className="luintext">{kind() === "syll" && phase === "read" ? "Seuraava tavu ▶" : "Luin! 👍"}</div>
      </div>
    );
  }
  return out;
}

function picX(i: number) { const gap = (width - 3 * 96) / 4; return gap + i * (96 + gap); }
function picY() { return kind() === "syll" ? height - 150 : Math.min(height - 150, 430); }

function Pictures() {
  return pics.map((p, i) => {
    const k = shake.i === i ? Math.max(0, 1 - (t - shake.t) / 0.4) : 0;
    const dx = Math.sin((t - shake.t) * 50) * 10 * k;
    const ok = phase === "solved" && p === word;
    const off = wrong.indexOf(i) >= 0;
    return (
      <div className={ok ? "pic ok" : off ? "pic off" : "pic"} id={"pic" + i} onClick={() => pickPic(i)} style={{ left: picX(i) + dx, top: picY() }}>
        <div className="picemoji">{p.e}</div>
      </div>
    );
  });
}

function WordCard() {
  const w = Math.min(320, width - 40);
  const txt = plain(word);
  const fs = txt.length > 11 ? 34 : txt.length > 8 ? 42 : 52;
  const hidden = wordHidden();
  return (
    <div className="card" id="word" style={{ left: width / 2 - w / 2, top: 120, width: w }} onClick={() => { if (phase === "solved" || wrong.length) rg.say(wordClip(word)); }}>
      {hidden ? <div className="hiddenword">⚡ ? ⚡</div> : <div className="bigword" style={{ fontSize: fs }}>{txt}</div>}
    </div>
  );
}

// Tavuraketti: the syllables as the rocket's parts, nose at the top
function Rocket() {
  const sy = syllables(word);
  const n = sy.length;
  const segH = n >= 4 ? 44 : 54;
  const fly = phase === "pick" || phase === "solved" ? Math.min(1, (t - heardAt) * 1.2) : 0;
  const lift = fly * fly * 60;
  const top = 96 + (5 - n) * 14 - lift;
  const w = 168;
  const x = width / 2 - w / 2;
  const out: any[] = [];
  out.push(P("M 0 60 Q 50 -20 100 60 Z", "#ef476f", x, top, w, 56));
  for (let i = 0; i < n; i++) {
    const lit = phase !== "read" || i < sylI;
    const now = phase === "read" && i === sylI;
    out.push(
      <div className={now ? "seg now" : lit ? "seg lit" : "seg"} id={"syl" + i} style={{ left: x, top: top + 54 + i * segH, width: w, height: segH - 4 }} onClick={() => { if (now) sylNext(false); }}>
        <div className={now ? "segtext now" : "segtext"}>{sy[i]}</div>
      </div>
    );
  }
  const by = top + 54 + n * segH;
  out.push(P("M 0 40 L 30 0 L 30 40 Z", "#118ab2", x - 26, by - 44, 30, 44));
  out.push(P("M 0 0 L 30 40 L 0 40 Z", "#118ab2", x + w - 4, by - 44, 30, 44));
  if (fly > 0 || ear.on) {
    const k = 0.7 + Math.sin(t * 30) * 0.3;
    out.push(P("M 0 0 L 100 0 L 50 100 Z", "#f9844a", width / 2 - 30, by - 2, 60, 40 * k + fly * 30));
    out.push(P("M 0 0 L 100 0 L 50 100 Z", "#ffd166", width / 2 - 18, by - 2, 36, 24 * k + fly * 20));
  }
  if (phase !== "read") {
    out.push(<div className="whole" style={{ left: 0, top: by + 66 + lift, width }}>{plain(word)}</div>);
  }
  return { out, bottom: by + 66 };
}

function sentY() { return 120; }

function SentenceCard() {
  const w = Math.min(330, width - 30);
  const fs = sent.t.length > 34 ? 25 : 30;
  return (
    <div className="card sent" id="sent" style={{ left: width / 2 - w / 2, top: sentY(), width: w }} onClick={() => { if (phase === "solved") rg.say("lu_s_" + step() + "_" + sentI); }}>
      <div className="sentence" style={{ fontSize: fs }}>{sent.t}</div>
    </div>
  );
}

function TrueFalse(y: number) {
  const out: any[] = [];
  const bw = Math.min(150, (width - 50) / 2);
  const opts = [{ ok: true, label: "Totta 👍", cls: "tf yes" }, { ok: false, label: "Tarua 👎", cls: "tf no" }];
  opts.forEach((o, i) => {
    const k = shake.i === i ? Math.max(0, 1 - (t - shake.t) / 0.4) : 0;
    const dx = Math.sin((t - shake.t) * 50) * 10 * k;
    const done = phase === "solved";
    const cls = done ? (o.ok === sent.ok ? o.cls + " ok" : o.cls + " off") : o.cls;
    out.push(
      <div className={cls} id={"tf" + i} onClick={() => answer(o.ok)} style={{ left: (i === 0 ? width / 2 - bw - 8 : width / 2 + 8) + dx, top: y, width: bw }}>
        <div className="tftext">{o.label}</div>
      </div>
    );
  });
  return out;
}

function Play() {
  const out: any[] = [];
  out.push(Progress());
  out.push(StepBadge());
  out.push(MicBadge());
  if (kind() === "flash") {
    out.push(WordCard());
    if (phase === "read") for (const e of ReadMeter(270, needed())) out.push(e);
    else for (const e of Pictures()) out.push(e);
    if (phase === "pick") out.push(<div className="ask" style={{ left: 0, top: picY() - 46, width }}>Mikä kuva?</div>);
  } else if (kind() === "syll") {
    const r = Rocket();
    for (const e of r.out) out.push(e);
    if (phase === "read" || phase === "whole") {
      if (phase === "whole") out.push(<div className="ask" style={{ left: 0, top: r.bottom + 56, width }}>Lue koko sana!</div>);
      for (const e of ReadMeter(Math.min(height - 130, r.bottom + 100), phase === "whole" ? syllables(word).length : 1)) out.push(e);
    } else {
      for (const e of Pictures()) out.push(e);
    }
  } else {
    out.push(SentenceCard());
    const y = 300;
    if (phase === "read") for (const e of ReadMeter(y, needed())) out.push(e);
    else {
      out.push(<div className="ask" style={{ left: 0, top: y - 10, width }}>Totta vai tarua?</div>);
      for (const e of TrueFalse(y + 40)) out.push(e);
    }
  }
  return <div className="screen">{out}</div>;
}

// ---- the story screens ------------------------------------------------------------------

function qY(i: number) { return 250 + i * 66; }

function TimeBar() {
  const w = width - 40;
  const f = Math.min(1, storyT / STORY_TIME);
  return (
    <div className="timebar" style={{ left: 20, top: 60, width: w }}>
      <div className="tfill" style={{ width: Math.max(8, w * f) }} />
      <div className="tdragon" style={{ left: Math.max(0, w * f - 18) }}>🐉</div>
    </div>
  );
}

function StoryView() {
  const out: any[] = [];
  out.push(MicBadge());
  const w = Math.min(340, width - 20);
  if (sphase === "start") {
    out.push(<div className="stitle" style={{ left: 0, top: 70, width }}>{story.icon + " " + story.title}</div>);
    for (const e of Dragon(width / 2, 240, 150, stage())) out.push(e);
    out.push(<div className="sinfo" style={{ left: 20, top: 350, width: width - 40 }}>Lue tarina ääneen. Sinulla on minuutti aikaa. Lopuksi tulee kysymyksiä.</div>);
    if (lastSpeed) out.push(<div className="sinfo small" style={{ left: 20, top: 420, width: width - 40 }}>{"Viimeksi tällä tarinalla: " + lastSpeed.wpm + " sanaa minuutissa"}</div>);
    out.push(<div className="level abs" id="sgo" onClick={() => storyStart()} style={{ left: width / 2 - 150, top: 470, backgroundColor: "#9b5de5" }}><div className="lvname">Aloita ▶</div></div>);
    out.push(<div className="level abs light" id="slisten" onClick={() => rg.say("lu_t_" + story.id)} style={{ left: width / 2 - 150, top: 540 }}><div className="lvname dark">🔊 Kuuntele ensin</div></div>);
    return out;
  }
  if (sphase === "read" || sphase === "where") {
    out.push(TimeBar());
    const ws = wordsOf(pages[page]);
    out.push(
      <div className="page" style={{ left: width / 2 - w / 2, top: 100, width: w }}>
        {ws.map((x, i) => (
          <div className={sphase === "where" ? "pw tap" : "pw"} id={"w" + i} onClick={() => storyWhere(i)}>{x}</div>
        ))}
      </div>
    );
    out.push(<div className="pagenum" style={{ left: 0, top: height - 196, width }}>{"Sivu " + (page + 1) + " / " + pages.length}</div>);
    if (sphase === "read") {
      const heardPage = ear.voiced >= needVoice(syllableCount(pages[page])) * 0.6;
      out.push(
        <div className={heardPage || !micOn() ? "level abs" : "level abs dim"} id="snext" onClick={() => storyNextPage()} style={{ left: width / 2 - 150, top: height - 160, backgroundColor: "#9b5de5" }}>
          <div className="lvname">{page + 1 < pages.length ? "Seuraava sivu ▶" : "Valmis! ✓"}</div>
        </div>
      );
      if (micOn()) out.push(<div className="mlabel" style={{ left: 0, top: height - 96, width }}>{ear.on ? "🎤 Kuuntelen…" : "🎤 Lue ääneen"}</div>);
    } else {
      out.push(<div className="where" style={{ left: 10, top: height - 170, width: width - 20 }}>⏰ Aika loppui! Napauta sanaa, johon pääsit.</div>);
    }
    return out;
  }
  if (sphase === "quiz") {
    const q = story.qs[qI];
    out.push(<div className="stitle small" style={{ left: 0, top: 60, width }}>{"Kysymys " + (qI + 1) + " / " + story.qs.length}</div>);
    out.push(<div className="card" id="q" style={{ left: width / 2 - w / 2, top: 110, width: w }} onClick={() => rg.say("lu_q_" + story.id + "_" + qI)}><div className="question">{"🔊 " + q.q}</div></div>);
    qOrder.forEach((a, i) => {
      const ok = qSolvedAt >= 0 && a === q.a[0];
      const off = qWrong.indexOf(i) >= 0;
      out.push(<div className={ok ? "choice ok" : off ? "choice off" : "choice"} id={"qa" + i} onClick={() => storyAnswer(i)} style={{ left: width / 2 - 150, top: qY(i), width: 300 }}><div className="cword">{a}</div></div>);
    });
    return out;
  }
  // the result
  const got = qRight + 1;
  const st: any[] = [];
  for (let i = 0; i < story.qs.length + 1; i++) st.push(<div className={i < got ? "bigstar" : "bigstar off"}>⭐</div>);
  out.push(<div className="stitle" style={{ left: 0, top: 50, width }}>{got >= 3 ? "Mahtavaa!" : "Hienoa lukemista!"}</div>);
  out.push(<div className="bignum" style={{ left: 0, top: 110, width }}>{"" + storyWpm}</div>);
  out.push(<div className="sinfo" style={{ left: 0, top: 182, width }}>sanaa minuutissa</div>);
  if (lastSpeed) {
    const d = storyWpm - lastSpeed.wpm;
    out.push(<div className={d > 0 ? "sinfo up" : "sinfo small"} style={{ left: 0, top: 214, width }}>{d > 0 ? "▲ " + d + " enemmän kuin viimeksi!" : "Viimeksi " + lastSpeed.wpm}</div>);
  }
  out.push(<div className="stars" style={{ position: "absolute", left: width / 2 - 150, top: 248 }}>{st}</div>);
  out.push(<div className="sinfo small" style={{ left: 0, top: 316, width }}>{"Kysymykset: " + qRight + " / " + story.qs.length + " oikein"}</div>);
  // the grown-up may count the reading mistakes
  out.push(
    <div className="adult" style={{ left: width / 2 - 160, top: 352, width: 320 }}>
      <div className="adulttext">Aikuinen: lukuvirheet</div>
      <div className="pm" id="errm" onClick={() => setErrors(-1)}>−</div>
      <div className="errn">{"" + storyErr}</div>
      <div className="pm" id="errp" onClick={() => setErrors(1)}>+</div>
    </div>
  );
  if (storyErr > 0) out.push(<div className="sinfo small" style={{ left: 0, top: 406, width }}>{"Oikein luettuja: " + Math.max(0, storyWpm - storyErr) + " / min"}</div>);
  out.push(<div className="level abs" id="sagain" onClick={() => { rg.sound("click"); openStory(true); }} style={{ left: width / 2 - 150, top: 446, backgroundColor: "#9b5de5" }}><div className="lvname">Lue sama uudestaan</div></div>);
  out.push(<div className="level abs" id="snew" onClick={() => { rg.sound("click"); openStory(false); }} style={{ left: width / 2 - 150, top: 512, backgroundColor: "#577590" }}><div className="lvname">Uusi tarina</div></div>);
  out.push(<div className="level abs back" id="smenu" onClick={() => { mode = "menu"; rg.sound("click"); }} style={{ left: width / 2 - 150, top: 578 }}><div className="lvname">← Takaisin</div></div>);
  return out;
}

// ---- menu, done, progress -----------------------------------------------------------------

function Menu() {
  const plan = PLAN[new Date().getDay()];
  const st = stage();
  const nextAt = st < GROW.length ? GROW[st] : 0;
  return (
    <div className="screen">
      {MicBadge()}
      <div className="titlebox" style={{ left: 0, top: 48, width }}><div className="title">Lukuseikkailu</div></div>
      {Dragon(width / 2 - 70, 175, 120, st)}
      <div className="starbox" id="prog" onClick={() => { mode = "progress"; rg.sound("click"); }} style={{ left: width / 2 + 10, top: 128 }}>
        <div className="starnum">{"⭐ " + stars}</div>
        <div className="starnext">{nextAt ? "Lohikäärme kasvaa: " + nextAt : "Täysikasvuinen!"}</div>
        <div className="starnext link">📈 Oma kehitys</div>
      </div>
      <div className="levels" style={{ left: width / 2 - 150, top: 250 }}>
        {MODES.map((m, i) => (
          <div className="level" id={"m" + i} onClick={() => startMode(i)} style={{ backgroundColor: m.color }}>
            <div className="lvname">{m.icon + " " + m.name + (plan === i ? "  ☀️" : "")}</div>
            <div className="lvbest">{(plan === i ? "Tämän päivän harjoitus · " : "") + m.info + (steps[i] > 0 ? "  " + ["▮", "▮▮", "▮▮▮"][steps[i]] : "")}</div>
          </div>
        ))}
        <div className="level back" id="exit" onClick={() => rg.exit()}><div className="lvname">← Valikkoon</div></div>
      </div>
      {mic === "off" ? <div className="micnote" style={{ left: 10, top: height - 44, width: width - 20 }}>🔇 Mikrofoni ei ole käytössä: paina "Luin!", kun olet lukenut.</div> : null}
    </div>
  );
}

function Done() {
  const st = [];
  for (let i = 0; i < ROUND; i++) st.push(<div className={i < right ? "bigstar" : "bigstar off"}>⭐</div>);
  return (
    <div className="screen flow">
      <div className="dtitle" style={{ marginTop: 60 }}>{right >= 7 ? "Mahtavaa!" : right >= 4 ? "Hienoa!" : "Hyvä yritys!"}</div>
      <div className="stars">{st}</div>
      <div className="lead">{right + " / " + ROUND + " oikein heti"}</div>
      {aloud > 0 ? <div className="lead small">{"🎤 Luit ääneen " + aloud + " / " + ROUND}</div> : null}
      <div className="level flowbtn" id="again" onClick={() => startMode(cur)} style={{ backgroundColor: MODES[cur].color }}><div className="lvname">Uudestaan!</div></div>
      <div className="level back flowbtn" id="menu" onClick={() => { mode = "menu"; rg.sound("click"); }}><div className="lvname">← Takaisin</div></div>
    </div>
  );
}

function ProgressView() {
  const out: any[] = [];
  const st = stage();
  out.push(<div className="stitle" style={{ left: 0, top: 14, width }}>Oma kehitys</div>);
  for (const e of Dragon(70, 120, 100, st)) out.push(e);
  const nextAt = st < GROW.length ? GROW[st] : 0;
  out.push(
    <div className="starbox" style={{ left: 140, top: 70 }}>
      <div className="starnum">{"⭐ " + stars}</div>
      <div className="starnext">{nextAt ? "Vielä " + (nextAt - stars) + " tähteä, niin lohikäärme kasvaa" : "Lohikäärme on täysikasvuinen!"}</div>
    </div>
  );
  // the last seven days: a sun when 5 minutes were read
  const cells: any[] = [];
  for (let o = 6; o >= 0; o--) {
    const d = new Date(Date.now() - o * 86400000);
    const e = dayOf(o);
    const min = e ? Math.floor(e.s / 60) : 0;
    cells.push(
      <div className="daycell">
        <div className="dayname">{WEEK[d.getDay()]}</div>
        <div className={min >= 5 ? "daydot full" : min > 0 ? "daydot some" : "daydot"}>{min >= 5 ? "☀" : min > 0 ? "" + min : ""}</div>
        <div className="daymin">{e && e.r > 0 ? "🎤" + e.r : ""}</div>
      </div>
    );
  }
  out.push(<div className="sub" style={{ left: 0, top: 196, width }}>Viikko (aurinko = 5 min luettu)</div>);
  out.push(<div className="week" style={{ left: width / 2 - 168, top: 222 }}>{cells}</div>);
  // the story speeds as bars
  out.push(<div className="sub" style={{ left: 0, top: 316, width }}>Tarinat: sanaa minuutissa</div>);
  const last = speeds.slice(-8);
  if (!last.length) out.push(<div className="sinfo small" style={{ left: 20, top: 360, width: width - 40 }}>Lue Lukulohikäärmeen tarina, niin näet tässä lukunopeutesi.</div>);
  let maxW = 30;
  for (const s of last) maxW = Math.max(maxW, s.wpm);
  const bw = Math.floor((width - 40) / 8);
  last.forEach((s, i) => {
    const h = Math.round(110 * s.wpm / maxW);
    const okH = Math.round(110 * s.ok / maxW);
    const x = 20 + i * bw;
    out.push(<div className="bar" style={{ left: x + 6, top: 480 - h, width: bw - 12, height: h }} />);
    out.push(<div className="bar ok" style={{ left: x + 6, top: 480 - okH, width: bw - 12, height: okH }} />);
    out.push(<div className="barnum" style={{ left: x, top: 480 - h - 22, width: bw }}>{"" + s.wpm}</div>);
    out.push(<div className="barday" style={{ left: x, top: 486, width: bw }}>{s.d.slice(8) + "." + Number(s.d.slice(5, 7)) + "."}</div>);
  });
  out.push(<div className="sinfo small" style={{ left: 20, top: 512, width: width - 40 }}>Vertaa samaa tarinaa: toinen lukukerta on yleensä sujuvampi. Uusi tarina kertoo, siirtyykö sujuvuus muihinkin teksteihin.</div>);
  out.push(<div className="level abs back" id="pback" onClick={() => { mode = "menu"; rg.sound("click"); }} style={{ left: width / 2 - 150, top: Math.min(height - 70, 600) }}><div className="lvname">← Takaisin</div></div>);
  return <div className="screen">{out}</div>;
}

function view() {
  let body;
  if (mode === "menu") body = Menu();
  else if (mode === "done") body = Done();
  else if (mode === "story") body = <div className="screen">{StoryView()}</div>;
  else if (mode === "progress") body = ProgressView();
  else body = Play();
  return (
    <div className="root">
      {body}
      {sparks.map((s) => <div className="spark" style={{ left: s.x, top: s.y, opacity: 1 - s.t / 1.2, backgroundColor: s.c }} />)}
    </div>
  );
}
