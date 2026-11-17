import { AREAS } from "lib/areas";
import { LEVELS, L } from "lib/levels";

type Line = { t: string; a: string; op: string; b: string };

// Robo's voice clips that exist in sounds/ (key -> true). Keys: intro, l<level>, ok<level>.
const VOICE: any = {};
const INTRO_TEXT = "Hei, olen Robo! Neljä asiaa riittää ohjelmointiin: muuttuja, operaattori, lista ja funktio. Aloitetaanko?";

const SLOTN = ["A", "B", "C", "D"];
const TARGETS = SLOTN;
const OPERANDS = ["x", "A", "B", "C", "D", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const OPS = ["+", "−", "×", ">", "=", "max", "min"];
const INITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "[]"];

const FLY2 = 1.4, GAP2 = 0.4, POP3 = 0.7, FLY3 = 1.0, FLY4 = 1.2;
const DUR = [0, 1.2, 0, 2.4, 2.2];

let screen = "intro";
let backTo = "intro";
let lvl = 0;
let unlocked = 0;
let lines: Line[] = [];
let start: any[] = [0, 0, 0, 0];
let sel: any = null;
let running = false, ran = false, fast = false, waiting = false, wrote = false;
let item = 0, ln = 0, timer = 0, curItem = -1, curLine = -1;
let phase = 1, phaseT = 0;
let stA: any = 0, stB: any = 0, stV: any = 0, prevV: any = 0;
let mem: any[] = [0, 0, 0, 0];
let rows: any[] = [];
let rdA = -1, rdB = -1, writeIdx = -1;
let msg = "", msgOk = false, solved = false, showHint = false;
let picked = "";
let focusDone = false;
let clock = 0;
let doneT = 0;
let talkT = 0; // Robo moves while this counts down
let OX = 0, OY = 0;

function init() { unlocked = rg.load("unlocked4", 0); }

// Robo speaks: plays the clip when it exists and moves for about as long as the text takes to say
function say(key: string, text: string) {
  talkT = Math.min(9, 0.8 + text.length * 0.065);
  if (VOICE[key]) rg.sound("sounds/" + key + ".wav");
}

function roboStyle() {
  return talkT > 0
    ? { transform: "rotate(" + (9 * Math.sin(clock * 13)).toFixed(1) + "deg) scale(" + (1.05 + 0.05 * Math.sin(clock * 21)).toFixed(3) + ")" }
    : { transform: "scale(" + (1 + 0.03 * Math.sin(clock * 2.5)).toFixed(3) + ")" };
}

function robot(key: string, text: string) {
  return (
    <div className="roboBox" onClick={() => say(key, text)}>
      <div className="robo" style={roboStyle()}>🤖</div>
      <div className="roboName">Robo</div>
    </div>
  );
}

// a rounded button with a dark edge underneath, the RangerGames style
function pill(cls: string, label: string, onClick: any, style?: any) {
  return (
    <div className={"pill " + cls} style={style || {}} onClick={onClick}>
      <div className={"face " + cls}>{label}</div>
    </div>
  );
}

function isList(v: any) { return Array.isArray(v); }
function cloneV(v: any) { return isList(v) ? v.slice() : v; }
function cloneVals(a: any[]) { return a.map(cloneV); }

// variables the function or the goal uses, plus any with a start value other than 0
function usedVars() {
  const lv = LEVELS[lvl];
  const used: any = {};
  used[lv.res] = true;
  for (const l of lines) { used[l.t] = true; used[l.a] = true; used[l.b] = true; }
  SLOTN.forEach((n, i) => { if (isList(start[i]) || start[i] !== 0) used[n] = true; });
  return used;
}

// the table lists only the variables in use; picking B in the function adds B's row
function initRows() {
  const used = usedVars();
  rows = [];
  SLOTN.forEach((n, i) => { if (used[n]) rows.push({ n: n, v: cloneV(start[i]), init: true }); });
  writeIdx = -1; rdA = -1; rdB = -1;
}

function curRow(n: string) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].n === n) return i; return -1; }

function taskText(i: number) { const lv = LEVELS[i]; return lv.kind === "Q" ? lv.prompt : lv.task; }

function startLevel(i: number) {
  lvl = i;
  const lv = LEVELS[i];
  sel = null; running = false; ran = false; fast = false; waiting = false;
  curItem = -1; curLine = -1;
  msg = ""; msgOk = false; solved = false; showHint = false; picked = "";
  if (lv.kind !== "Q") {
    lines = lv.lines.map((l: Line) => ({ t: l.t, a: l.a, op: l.op, b: l.b }));
    start = cloneVals(lv.init);
    mem = cloneVals(start);
    focusDone = !lv.focus || lv.focus === "run";
    initRows();
  }
  screen = "play";
  say("l" + i, taskText(i));
}

// choosing an area opens it even when earlier areas are not done (skipping ahead is allowed)
function openArea(a: any) {
  rg.sound("pop");
  if (unlocked < a.from) { unlocked = a.from; rg.save("unlocked4", unlocked); }
  backTo = "areas";
  startLevel(Math.min(Math.max(a.from, Math.min(unlocked, a.to)), LEVELS.length - 1));
}

function leaveLevel() { running = false; screen = backTo; }

function unlockNext() {
  if (lvl + 1 > unlocked) { unlocked = Math.min(lvl + 1, LEVELS.length); rg.save("unlocked4", unlocked); }
}

function nextLevel() {
  rg.sound("pop");
  if (lvl + 1 < LEVELS.length) startLevel(lvl + 1);
  else { screen = "done"; rg.celebrate(width / 2, 200, { big: true }); }
}

function nextLabel() {
  if (lvl + 1 >= LEVELS.length) return "Valmis 🎉";
  const a = LEVELS[lvl].kind, b = LEVELS[lvl + 1].kind;
  if (a !== b && b === "H") return "Funktioon ▶";
  if (a !== b && b === "T") return "Tehtäviin ▶";
  return "Seuraava ▶";
}

function pickAnswer(o: string) {
  const lv = LEVELS[lvl];
  if (solved) return;
  picked = o;
  if (o === lv.answer) {
    solved = true; msgOk = true; msg = lv.idea; doneT = 0;
    rg.celebrate(width / 2, 260, { big: true });
    rg.vibrate(60);
    unlockNext();
    say("ok" + lvl, lv.idea);
  } else {
    msgOk = false; msg = "Ei aivan. Kokeile uudestaan!";
    rg.sound("wrong", { volume: 0.5 });
  }
}

function val(o: string, x: number): any {
  if (o === "x") return x;
  const s = SLOTN.indexOf(o);
  if (s >= 0) return cloneV(mem[s]);
  return parseInt(o);
}

function apply(op: string, a: any, b: any): any {
  if (isList(a) || isList(b)) {
    if (op === "+") return (isList(a) ? a : [a]).concat(isList(b) ? b : [b]);
    return a;
  }
  if (op === "+") return a + b;
  if (op === "−") return a - b;
  if (op === "×") return a * b;
  if (op === ">") return a > b ? 1 : 0;
  if (op === "=") return a === b ? 1 : 0;
  if (op === "max") return Math.max(a, b);
  if (op === "min") return Math.min(a, b);
  return 0;
}

function fmt(v: any): string { return isList(v) ? "[" + v.join(", ") + "]" : String(v); }
function shortV(v: any): string {
  if (!isList(v)) return String(v);
  if (v.length <= 2) return "[" + v.join(",") + "]";
  return "[…," + v[v.length - 1] + "]";
}
function clamp01(t: number) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function isLiteral(o: string) { return o !== "x" && SLOTN.indexOf(o) < 0; }

function aStart() { return 0; }
function bStart(l: Line) { return isLiteral(l.a) ? 0 : FLY2 + GAP2; }
function aLand(l: Line) { return isLiteral(l.a) ? 0 : FLY2; }
function bLand(l: Line) { return isLiteral(l.b) ? bStart(l) : bStart(l) + FLY2; }
function durOf(p: number) {
  if (p !== 2) return DUR[p];
  const l = lines[ln];
  return Math.max(aLand(l), bLand(l)) + 0.7;
}
function evaluated() { return (phase === 3 && phaseT >= POP3 + FLY3) || phase === 4; }

function edited() { ran = false; msg = ""; curItem = -1; curLine = -1; mem = cloneVals(start); initRows(); }

function write(t: string, v: any) { mem[SLOTN.indexOf(t)] = v; rows.push({ n: t, v: cloneV(v) }); }

function result() { return mem[SLOTN.indexOf(LEVELS[lvl].res)]; }

function nextPointer(): boolean {
  ln++;
  if (ln >= lines.length) {
    ln = 0; item++;
    if (item >= LEVELS[lvl].list.length) { running = false; finish(); return true; }
  }
  curItem = item; curLine = ln;
  return false;
}

function run() {
  if (lines.length === 0) { msg = "Funktiossa ei ole yhtään riviä. Lisää + rivi."; msgOk = false; return; }
  sel = null; mem = cloneVals(start); initRows(); item = 0; ln = 0; timer = 0;
  phase = 1; phaseT = 0; curItem = 0; curLine = 0;
  running = true; ran = true; fast = false; waiting = false; wrote = false; msg = ""; showHint = false;
  rg.sound("whoosh", { volume: 0.4 });
}

function nextX() {
  if (!waiting) return;
  waiting = false;
  item++; ln = 0; curItem = item; curLine = 0; phase = 1; phaseT = 0; wrote = false;
  rdA = -1; rdB = -1; writeIdx = -1;
  rg.sound("tick", { volume: 0.4 });
}

function fastForward() {
  if (!running || fast) return;
  fast = true; waiting = false; timer = 0;
  rdA = -1; rdB = -1; writeIdx = -1;
  if (phase === 4) { if (!wrote) write(lines[ln].t, stV); nextPointer(); }
}

function step() {
  const x = LEVELS[lvl].list[item];
  const l = lines[ln];
  write(l.t, apply(l.op, val(l.a, x), val(l.b, x)));
  nextPointer();
}

function advance() {
  const x = LEVELS[lvl].list[item];
  const l = lines[ln];
  if (phase === 1) {
    stA = val(l.a, x); stB = val(l.b, x);
    rdA = SLOTN.indexOf(l.a) >= 0 ? curRow(l.a) : -1;
    rdB = SLOTN.indexOf(l.b) >= 0 ? curRow(l.b) : -1;
    phase = 2;
  }
  else if (phase === 2) { stV = apply(l.op, stA, stB); phase = 3; rg.sound("pop", { volume: 0.4 }); }
  else if (phase === 3) {
    prevV = val(l.t, x);
    writeIdx = rows.length;
    phase = 4; wrote = false; rg.sound("whoosh", { volume: 0.25 });
  }
  else {
    if (!wrote) { write(l.t, stV); wrote = true; }
    if (ln + 1 < lines.length) { ln++; curLine = ln; phase = 1; wrote = false; rdA = -1; rdB = -1; writeIdx = -1; }
    else if (item + 1 < LEVELS[lvl].list.length) { waiting = true; phaseT = 99; }
    else { running = false; finish(); }
  }
}

function finish() {
  const lv = LEVELS[lvl];
  const got = result();
  curItem = -1; curLine = -1; waiting = false; doneT = 0; rdA = -1; rdB = -1; writeIdx = -1;
  if (JSON.stringify(got) === JSON.stringify(lv.goal)) {
    solved = true; msgOk = true;
    msg = lv.idea;
    rg.celebrate(width / 2, 220, { big: true });
    rg.vibrate(60);
    unlockNext();
    say("ok" + lvl, lv.idea);
  } else {
    msgOk = false;
    // a common slip: writing a number over the list instead of adding to it
    if (isList(lv.goal) && !isList(got)) msg = lv.res + " ei ole enää lista: luku kirjoitettiin listan päälle. Listaan lisätään rivillä " + lv.res + " ← " + lv.res + " + …";
    else msg = "Muuta funktiota ja aja uudestaan.";
    rg.sound("wrong", { volume: 0.5 });
  }
}

function tick(dt: number, input: any) {
  clock += dt; doneT += dt;
  if (talkT > 0) talkT -= dt;
  if (!running) return;
  if (fast) {
    timer -= dt;
    while (timer <= 0 && running) { step(); timer += 0.05; }
    return;
  }
  if (waiting) return;
  const before = phaseT;
  phaseT += dt;
  if (phase === 2) {
    const l = lines[ln];
    if (!isLiteral(l.a) && before <= 0.001 && phaseT > 0) rg.sound("whoosh", { volume: 0.25 });
    if (!isLiteral(l.b) && before < bStart(l) && phaseT >= bStart(l) && bStart(l) > 0) rg.sound("whoosh", { volume: 0.25 });
    if (!isLiteral(l.b) && bStart(l) === 0 && before <= 0.001) rg.sound("whoosh", { volume: 0.25 });
  }
  if (phase === 4 && !wrote && phaseT >= FLY4) {
    write(lines[ln].t, stV); wrote = true;
    rg.sound("note", { note: 76 + ln * 3, len: 0.12, wave: "triangle", volume: 0.35 });
  }
  if (phaseT >= durOf(phase)) { phaseT = 0; advance(); }
}

function onBack() {
  if (screen === "play") leaveLevel();
  else if (screen === "areas" || screen === "done") screen = "intro";
  else rg.exit();
}

function pick(v: string) {
  if (!sel) return;
  const lv = LEVELS[lvl];
  if (sel.kind === "slot") { start[sel.i] = v === "[]" ? [] : parseInt(v); }
  else {
    (lines[sel.line] as any)[sel.field] = v;
    if (lv.focus && lv.focus !== "run" && lv.focus.line === sel.line && lv.focus.field === sel.field) focusDone = true;
  }
  rg.sound("click", { volume: 0.4 });
  sel = null; edited();
}

function selCell(line: number, field: string) {
  if (running) return;
  if (sel && sel.kind === "cell" && sel.line === line && sel.field === field) sel = null;
  else sel = { kind: "cell", line, field };
  rg.sound("tick", { volume: 0.3 });
}

function selSlot(i: number) {
  if (running) return;
  if (sel && sel.kind === "slot" && sel.i === i) sel = null; else sel = { kind: "slot", i };
  rg.sound("tick", { volume: 0.3 });
}

function isSel(line: number, field: string) { return sel && sel.kind === "cell" && sel.line === line && sel.field === field; }

function pulse() { return { transform: "scale(" + (1 + 0.04 * Math.sin(clock * 6)).toFixed(3) + ")" }; }
function bigPulse() { return { transform: "scale(" + (1.1 + 0.12 * Math.sin(clock * 9)).toFixed(3) + ")" }; }

function popAt(t: number) {
  const k = clamp01(t / 0.45);
  return { transform: "scale(" + (0.4 + 0.6 * rg.ease.back(k)).toFixed(3) + ")", opacity: clamp01(t / 0.2) };
}

// ---------- curved paths ----------
function arcPoint(from: any, to: any, u: number) {
  const x1 = from.x + from.w / 2, y1 = from.y + from.h / 2, x2 = to.x + to.w / 2, y2 = to.y + to.h / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const nx = dy / len, ny = -dx / len;
  const bend = Math.min(45, len * 0.22);
  const off = bend * Math.sin(Math.PI * u);
  const doff = bend * Math.PI * Math.cos(Math.PI * u);
  return { x: x1 + dx * u + nx * off, y: y1 + dy * u + ny * off, tx: dx + nx * doff, ty: dy + ny * doff };
}

function slider(text: string, from: any, to: any, t: number, cls: string) {
  if (!from || !to || t <= 0 || t >= 1) return null;
  const e = rg.ease.inOut(t);
  const x = rg.lerp(from.x + from.w / 2, to.x + to.w / 2, e);
  const y = rg.lerp(from.y + from.h / 2, to.y + to.h / 2, e);
  const hw = text.length > 3 ? 32 : 22;
  return <div className={"fly " + cls + (text.length > 3 ? " wide" : "")} style={{ left: x - hw - OX, top: y - 22 - OY }}>{text}</div>;
}

function flyer(text: string, from: any, to: any, t: number, cls: string) {
  if (!from || !to || t <= 0 || t >= 1) return null;
  const e = rg.ease.inOut(t);
  const p = arcPoint(from, to, e);
  const s = 1 + 0.4 * Math.sin(Math.PI * e);
  const hw = text.length > 3 ? 32 : 22;
  return <div className={"fly " + cls + (text.length > 3 ? " wide" : "")} style={{ left: p.x - hw - OX, top: p.y - 22 - OY, transform: "scale(" + s.toFixed(3) + ")" }}>{text}</div>;
}

function bar(x1: number, y1: number, x2: number, y2: number, cls: string) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;
  return <div className={"seg " + cls} style={{ left: (x1 + x2) / 2 - len / 2 - 0.5 - OX, top: (y1 + y2) / 2 - 1.5 - OY, width: len + 1, transform: "rotate(" + ang.toFixed(1) + "deg)" }}></div>;
}

function inside(b: any, p: any, m: number) { return p.x > b.x - m && p.x < b.x + b.w + m && p.y > b.y - m && p.y < b.y + b.h + m; }

function curve(from: any, to: any, prog: number, cls: string, clipFrom?: any, clipTo?: any): any[] {
  const res: any[] = [];
  if (!from || !to || prog <= 0) return res;
  const cf = clipFrom || from, ct = clipTo || to;
  let ua = 0;
  while (ua < 0.5 && inside(cf, arcPoint(from, to, ua), 3)) ua += 0.01;
  let ub = 1;
  while (ub > 0.5 && inside(ct, arcPoint(from, to, ub), 7)) ub -= 0.01;
  const e = rg.ease.inOut(clamp01(prog));
  const uEnd = Math.min(ub, e);
  if (uEnd <= ua) return res;
  const N = 22;
  let prev = arcPoint(from, to, ua);
  for (let k = 1; k <= N; k++) {
    const u = ua + (ub - ua) * k / N;
    const cu = Math.min(u, uEnd);
    const p = arcPoint(from, to, cu);
    res.push(bar(prev.x, prev.y, p.x, p.y, cls));
    prev = p;
    if (u >= uEnd) break;
  }
  if (prog >= 1) {
    const tip = arcPoint(from, to, ub);
    const a = Math.atan2(tip.ty, tip.tx);
    for (const side of [-1, 1]) {
      const b = a + Math.PI + side * 0.5;
      res.push(bar(tip.x, tip.y, tip.x + Math.cos(b) * 12, tip.y + Math.sin(b) * 12, cls));
    }
  }
  return res;
}

function srcBox(o: string, rd: number) {
  if (o === "x") return rg.box("chip" + curItem);
  return rd >= 0 ? rg.box("val" + rd) : null;
}
function srcClip(o: string, rd: number) {
  if (o === "x") return rg.box("chip" + curItem);
  return rd >= 0 ? rg.box("trow" + rd) : null;
}

function exprBox() {
  const a = rg.box("c_a"), b = rg.box("c_b");
  if (!a || !b) return null;
  return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: a.h };
}

function areaOf(i: number) { for (const a of AREAS) if (i >= a.from && i <= a.to) return a; return AREAS[0]; }

function levelLabel(i: number) {
  const a = areaOf(i);
  const n = a.to - a.from + 1;
  return n > 1 ? a.short + " " + (i - a.from + 1) + "/" + n : a.short;
}

// front page: Robo, Aloita/Jatka and Valitse aihealue
function introView() {
  return (
    <div className="screen intro">
      <div className="bigTitle">Ohjelmointia</div>
      <div className="heroRobo" onClick={() => say("intro", INTRO_TEXT)}>
        <div className="robo big" style={roboStyle()}>🤖</div>
      </div>
      <div className="bubble"><div className="bubbleText center">{INTRO_TEXT}</div></div>
      <div className="spacer"></div>
      {pill("go wideBtn", unlocked > 0 && unlocked < LEVELS.length ? "Jatka ▶" : "Aloita ▶", () => { rg.sound("pop"); backTo = "intro"; startLevel(unlocked < LEVELS.length ? unlocked : 0); })}
      {pill("blue wideBtn", "Valitse aihealue", () => { rg.sound("pop"); screen = "areas"; })}
      <div className="gap"></div>
    </div>
  );
}

function areasView() {
  return (
    <div className="screen intro">
      <div className="top"><div className="back" onClick={() => { screen = "intro"; }}>‹</div></div>
      <div className="bigTitle small">Valitse aihealue</div>
      <div className="sub">Helpoimmat ensin. Voit hypätä suoraan vaikeampaan, jos osaat jo alun.</div>
      {AREAS.map((a) => {
        const total = a.to - a.from + 1;
        const done = Math.max(0, Math.min(total, unlocked - a.from));
        const all = done >= total;
        return (
          <div className={"area" + (all ? " done" : "")} onClick={() => openArea(a)}>
            <div className="wordIcon">{a.icon}</div>
            <div className="wordText"><div className="wordName">{a.name}</div><div className="wordDesc">{a.desc}</div></div>
            <div className={"areaCount" + (all ? " done" : "")}>{all ? "✔" : done + "/" + total}</div>
          </div>
        );
      })}
    </div>
  );
}

function doneView() {
  const rws = [
    ["🔁", "Silmukka", "= funktio ajettuna listan jokaiselle luvulle"],
    ["❓", "Ehto", "= vertailuoperaattori (> tai =) ja summa"],
    ["🧮", "Summa, laskuri, suurin", "= muuttuja ja operaattori"],
    ["🌀", "Fibonacci", "= muuttujat muistavat menneen"],
    ["📤", "Uusi lista", "= muuttuja, jonka arvo on lista, ja + lisää siihen"],
  ];
  return (
    <div className="screen intro">
      <div className="bigTitle">Neljä asiaa riitti 🎉</div>
      <div className="sub">Et käyttänyt yhtään if- tai for-sanaa. Ne syntyivät itsestään:</div>
      {rws.map((r) => (
        <div className="word">
          <div className="wordIcon">{r[0]}</div>
          <div className="wordText"><div className="wordName">{r[1]}</div><div className="wordDesc">{r[2]}</div></div>
        </div>
      ))}
      <div className="sub small">Seuraavaksi: millaisia muita muuttujia, operaattoreita, tietorakenteita ja funktioita voisi olla?</div>
      <div className="spacer"></div>
      {pill("go wideBtn", "Alkuun", () => { rg.sound("pop"); screen = "intro"; })}
    </div>
  );
}

// the task card: Robo on the left says the task (or the lesson once solved)
function taskCard(cls: string, showGoal: boolean) {
  const lv = LEVELS[lvl];
  const done = solved;
  const key = done ? "ok" + lvl : "l" + lvl;
  const text = done ? lv.idea : taskText(lvl);
  return (
    <div className={"task robRow " + cls + (done ? " solvedCard" : "")}>
      {robot(key, text)}
      <div className="wordText">
        <div className="taskTitle">{(done ? "✔ " : "") + lv.title}</div>
        <div className="taskText">{text}</div>
        {showGoal && !done ? <div className="goalBig">{"🎯 Tavoite: " + lv.res + " = " + fmt(lv.goal)}</div> : null}
      </div>
    </div>
  );
}

// ---------- basics: answer by tapping ----------
function quizView() {
  const lv = LEVELS[lvl];
  const parts: any[] = [];
  if (lv.vars) {
    parts.push(
      <div className="box">
        <div className="label">🗃️ Muuttujat</div>
        <div className="vtable">
          <div className="thead"><div className="th tn">Nimi</div><div className="th">Arvo</div></div>
          {lv.vars.map((nv: any) => (
            <div className="trow cur"><div className="tname">{nv[0]}</div><div className="tcell"><div className="tval">{fmt(nv[1])}</div></div></div>
          ))}
        </div>
      </div>
    );
  }
  if (lv.expr) {
    parts.push(
      <div className="box">
        <div className="label">➕ Lauseke</div>
        <div className="qexpr">
          {lv.expr.map((tk: string) => <div className={"cell qcell " + (OPS.indexOf(tk) >= 0 ? "op" : "opd")}><div className="cv">{tk}</div></div>)}
          <div className="qeq">=</div>
          <div className={"cell qcell " + (solved ? "resv" : "qmark")} style={solved ? popAt(doneT) : {}}><div className="cv">{solved ? lv.answer : "?"}</div></div>
        </div>
      </div>
    );
  }
  if (lv.list) {
    const lp: any[] = [<div className="brk">[</div>];
    lv.list.forEach((v: number, i: number) => {
      lp.push(<div className="li"><div className={"chip" + (solved ? " cur" : "")}>{String(v)}</div><div className="tri">{solved ? String(i + 1) + "." : ""}</div></div>);
      if (i < lv.list.length - 1) lp.push(<div className="comma">,</div>);
    });
    lp.push(<div className="brk">]</div>);
    parts.push(<div className="box"><div className="label">📦 Lista</div><div className="listRow">{lp}</div></div>);
  }
  const size = lv.options.length <= 2 ? " full" : " half";
  return (
    <div className="screen">
      <div className="top">
        <div className="back" onClick={leaveLevel}>‹</div>
        <div className="lvl">{levelLabel(lvl)}</div>
      </div>
      {taskCard("basics", false)}
      {parts}
      <div className="label big center">Valitse vastaus</div>
      <div className="qopts">
        {lv.options.map((o: string) => {
          let cls = "opt" + size;
          if (picked === o) cls += o === lv.answer ? " right" : " wrong";
          else if (solved) cls += " faded";
          return pill(cls, o, () => pickAnswer(o));
        })}
      </div>
      {msg && !msgOk ? <div className="result bad"><div className="resSub">{msg}</div></div> : null}
      <div className="spacer"></div>
      {solved ? <div className="bar">{pill("go", nextLabel(), nextLevel, pulse())}</div> : null}
    </div>
  );
}

function cell(i: number, field: string, l: Line, cls: string) {
  const lv = LEVELS[lvl];
  const text = (l as any)[field];
  const live = running && !fast && i === curLine;
  let shown = text, src = "", extra = "", style: any = {};
  if (live) {
    const t = phaseT;
    const spent = evaluated() && field !== "t";
    if (field === "a" || field === "b") {
      if (phase >= 2) {
        const lit = isLiteral(text);
        const landT = field === "a" ? aLand(l) : bLand(l);
        if (phase > 2 || t >= landT) {
          shown = shortV(field === "a" ? stA : stB);
          src = lit ? "luku" : "= " + text;
          extra = " val";
          if (phase === 2 && !lit) style = popAt(t - landT);
        } else {
          const startT = field === "a" ? aStart() : bStart(l);
          extra = t >= startT ? " fetching" : " ghost";
        }
      }
    } else if (field === "op") {
      if (phase === 3 && t < POP3) style = bigPulse();
    } else if (field === "t") {
      if (evaluated()) {
        shown = shortV(stV);
        src = text;
        extra = " resv";
        if (phase === 3) style = popAt(t - POP3 - FLY3);
      }
    }
    if (spent) extra += " spent";
  }
  const f = !focusDone && !solved && !running && lv.focus && lv.focus !== "run" && lv.focus.line === i && lv.focus.field === field;
  if (f) style = pulse();
  const id = running && i === curLine ? "c_" + field : undefined;
  return (
    <div id={id} className={"cell " + cls + extra + (isSel(i, field) ? " sel" : "") + (f ? " focus" : "") + (shown.length > 3 ? " small" : "")} style={style} onClick={() => selCell(i, field)}>
      <div className="cv">{shown}</div>
      {src ? <div className="cs">{src}</div> : null}
    </div>
  );
}

function fetchText(o: string, v: any) {
  return o === "x" ? "x haetaan listasta: " + v : "Haetaan muuttujan " + o + " arvo " + fmt(v);
}

function caption() {
  const l = lines[curLine];
  if (!l) return "";
  if (waiting) return "✔ Valmis tälle x:lle. Poimi seuraava!";
  if (phase === 1) return (curLine === 0 ? "x = " + LEVELS[lvl].list[curItem] + ". " : "") + "Rivi " + (curLine + 1) + ": " + l.t + " ← " + l.a + " " + l.op + " " + l.b;
  if (phase === 2) {
    const t = phaseT;
    if (!isLiteral(l.a) && t < aLand(l) + GAP2) return fetchText(l.a, stA);
    if (!isLiteral(l.b)) return fetchText(l.b, stB);
    return "Arvot haettu";
  }
  if (phase === 3) {
    if (isList(stA) || isList(stB)) return fmt(stB) + " lisätään listan perään: " + fmt(stV);
    return "Lasketaan " + stA + " " + l.op + " " + stB + " = " + stV;
  }
  return wrote ? l.t + " sai uuden arvon: " + fmt(prevV) + " → " + fmt(stV) : l.t + " saa uuden arvon";
}

function resultView() {
  const lv = LEVELS[lvl];
  const got = result();
  return (
    <div className={"result" + (solved ? " ok" : " bad")}>
      <div className="resRow">
        <div className="robo small" style={talkT > 0 ? roboStyle() : {}} onClick={() => { if (solved) say("ok" + lvl, lv.idea); }}>🤖</div>
        <div className="resLabel">Lopussa</div>
        <div className={"resVal" + (isList(got) ? " list" : "")} style={popAt(doneT)}>{lv.res + " = " + fmt(got)}</div>
        <div className="resMark">{solved ? "✔" : "✘"}</div>
      </div>
      <div className="resSub">{solved ? msg : "Tavoite oli " + lv.res + " = " + fmt(lv.goal) + ". " + msg}</div>
    </div>
  );
}

function listView() {
  const lv = LEVELS[lvl];
  const slow = running && !fast;
  const l = lines[curLine];
  const t = phaseT;
  const xRead = slow && l && phase === 2 && ((l.a === "x" && t < aLand(l)) || (l.b === "x" && t >= bStart(l) && t < bLand(l)));
  const parts: any[] = [<div className="brk">[</div>];
  lv.list.forEach((v: number, i: number) => {
    let cls = "chip";
    let style: any = {};
    const cur = running && i === curItem;
    if (cur) cls += " cur";
    if (running && i < curItem) cls += " past";
    if (xRead && cur) cls += " read";
    if (waiting && i === curItem + 1) { cls += " next"; style = pulse(); }
    parts.push(
      <div className="li">
        <div id={"chip" + i} className={cls} style={style}>{String(v)}</div>
        <div className="tri">{cur ? "▲" : ""}</div>
      </div>
    );
    if (i < lv.list.length - 1) parts.push(<div className="comma">,</div>);
  });
  parts.push(<div className="brk">]</div>);
  return <div className="listRow">{parts}</div>;
}

function tableView() {
  const lv = LEVELS[lvl];
  const slow = running && !fast;
  const t = phaseT;
  const l = lines[curLine];
  const pending = slow && phase === 4 && !wrote && writeIdx >= 0;
  const total = rows.length + (pending ? 1 : 0);
  const maxR = running || ran ? Math.max(4, 8 - lines.length) : 99;

  const keep: any = {};
  for (let i = Math.max(0, total - maxR); i < rows.length; i++) keep[i] = true;
  SLOTN.forEach((n) => { const c = curRow(n); if (c >= 0) keep[c] = true; });
  if (rdA >= 0) keep[rdA] = true;
  if (rdB >= 0) keep[rdB] = true;
  let hidden = 0;
  for (let i = 0; i < rows.length; i++) if (!keep[i]) hidden++;

  let readRow = -1;
  if (slow && l && phase === 2) {
    if (rdA >= 0 && t < aLand(l)) readRow = rdA;
    else if (rdB >= 0 && t >= bStart(l) && t < bLand(l)) readRow = rdB;
  }

  const out: any[] = [
    <div className="thead"><div className="th tn">Nimi</div><div className="th">Arvo</div></div>,
  ];
  if (hidden > 0) out.push(<div className="tmore">{"⋮ " + hidden + " vanhempaa arvoa"}</div>);
  rows.forEach((r, i) => {
    if (!keep[i]) return;
    const cur = curRow(r.n) === i;
    const si = SLOTN.indexOf(r.n);
    const isS = sel && sel.kind === "slot" && sel.i === si && r.init;
    const flash = slow && i === writeIdx && wrote && !waiting;
    let cls = "trow" + (cur ? " cur" : " old");
    if (isS) cls += " sel";
    if (i === readRow) cls += " read";
    if (flash) cls += " flash";
    const canEdit = r.init && !running;
    out.push(
      <div id={"trow" + i} className={cls} onClick={() => { if (canEdit) selSlot(si); }}>
        <div className={"tname" + (cur ? "" : " dimt")}>{r.n + (cur && r.n === lv.res ? " 🎯" : "")}</div>
        <div className="tcell">
          <div id={"val" + i} className={"tval" + (cur ? "" : " dimt") + (isList(r.v) ? " list" : "")} style={flash ? popAt(t - FLY4) : {}}>{fmt(r.v)}</div>
          {r.init ? <div className="ttag">{canEdit ? "alkuarvo ✎" : "alkuarvo"}</div> : null}
        </div>
      </div>
    );
  });
  if (pending) {
    out.push(
      <div id={"trow" + writeIdx} className="trow pending">
        <div className="tname">{l.t}</div>
        <div className="tcell"><div id={"val" + writeIdx} className="tval dimt">?</div></div>
      </div>
    );
  }
  return <div className="vtable">{out}</div>;
}

function playView() {
  const lv = LEVELS[lvl];
  if (lv.kind === "Q") return quizView();
  const slow = running && !fast;
  const t = phaseT;
  const pb = rg.box("probe");
  if (pb) { OX = pb.x; OY = pb.y; }
  const flyers: any[] = [];
  let arrows: any[] = [];
  const l = lines[curLine];

  if (slow && l) {
    if (phase === 2) {
      if (!isLiteral(l.a)) flyers.push(flyer(shortV(stA), srcBox(l.a, rdA), rg.box("c_a"), (t - aStart()) / FLY2, "fv"));
      if (!isLiteral(l.b)) flyers.push(flyer(shortV(stB), srcBox(l.b, rdB), rg.box("c_b"), (t - bStart(l)) / FLY2, "fv"));
    }
    if (phase === 3) flyers.push(slider(shortV(stV), exprBox(), rg.box("c_t"), (t - POP3) / FLY3, "fr"));
    if (phase === 4) flyers.push(flyer(shortV(stV), rg.box("c_t"), rg.box("val" + writeIdx), t / FLY4, "fr"));

    if (phase >= 2) {
      if (!isLiteral(l.a)) arrows = arrows.concat(curve(srcBox(l.a, rdA), rg.box("c_a"), phase > 2 ? 1 : (t - aStart()) / FLY2, "ay", srcClip(l.a, rdA)));
      if (!isLiteral(l.b)) arrows = arrows.concat(curve(srcBox(l.b, rdB), rg.box("c_b"), phase > 2 ? 1 : (t - bStart(l)) / FLY2, "ay", srcClip(l.b, rdB)));
    }
    if (phase >= 4) arrows = arrows.concat(curve(rg.box("c_t"), rg.box("val" + writeIdx), t / FLY4, "ag", null, rg.box("trow" + writeIdx)));
  }

  const arrowHot = slow && (phase === 3 || phase === 4);
  const progRows = lines.map((ll, i) => (
    <div className={"line" + (running && i === curLine ? " cur" : "") + (running && i !== curLine ? " dim" : "")}>
      {cell(i, "t", ll, "tgt")}
      <div className={"arrow" + (arrowHot && i === curLine ? " hot" : "")} style={arrowHot && i === curLine && phase === 3 && t < POP3 + FLY3 ? bigPulse() : {}}>←</div>
      {cell(i, "a", ll, "opd")}
      {cell(i, "op", ll, "op")}
      {cell(i, "b", ll, "opd")}
      <div className={"del" + (running || lv.rows <= 1 ? " off" : "")} onClick={() => { if (!running && lv.rows > 1) { lines.splice(i, 1); sel = null; edited(); rg.sound("pop", { volume: 0.4 }); } }}>✕</div>
    </div>
  ));

  let palette = null;
  if (sel) {
    let opts = INITS, title = "Alkuarvo";
    if (sel.kind === "cell") {
      if (sel.field === "t") { opts = TARGETS; title = "Mihin muuttujaan tulos menee?"; }
      else if (sel.field === "op") { opts = OPS; title = "➕ Mikä operaattori?"; }
      else { opts = OPERANDS; title = "Mikä arvo? x = listan luku, A B C D = muuttujat"; }
    } else title = SLOTN[sel.i] + ": arvo ennen ensimmäistä kierrosta ([] = tyhjä lista)";
    palette = (
      <div className="palette">
        <div className="palTitle">{title}</div>
        <div className="palRow">{opts.map((o) => <div className={"pal" + (o.length > 2 ? " wide" : "")} onClick={() => pick(o)}>{o}</div>)}</div>
      </div>
    );
  }

  const runFocus = focusDone && !solved && !running && !sel && lv.kind === "H";
  const showResult = ran && !running;
  const compact = running || showResult;

  // one row of buttons; once solved, "run again" shrinks to an icon so Seuraava fits
  let bar;
  if (running) {
    bar = (
      <div className="bar">
        {pill("hint" + (fast ? " off" : ""), "⏩", fastForward)}
        {waiting
          ? pill("go", "Poimi seuraava x ▶", nextX, pulse())
          : pill("go off", fast ? "Ajetaan loppuun…" : "Katso…", null)}
      </div>
    );
  } else if (solved) {
    bar = (
      <div className="bar">
        {pill("hint", "↻", run)}
        {pill("go", nextLabel(), nextLevel, pulse())}
      </div>
    );
  } else {
    bar = (
      <div className="bar">
        {pill("hint", "💡", () => { showHint = !showHint; rg.sound("tick"); })}
        {showResult
          ? pill("again", "↻ Aja uudestaan", run)
          : pill("go", "▶ Aja", run, runFocus ? pulse() : null)}
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="top">
        <div className="back" onClick={leaveLevel}>‹</div>
        <div className="lvl">{levelLabel(lvl) + (compact ? " · " + lv.title : "")}</div>
      </div>

      {compact ? <div className="goalBar">{"🎯 Tavoite: " + lv.res + " = " + fmt(lv.goal)}</div> : taskCard(lv.kind === "H" ? "practice" : "", true)}

      <div className="box">
        <div className="label big">x saa vuorollaan listan arvot</div>
        {listView()}
      </div>

      <div className="box">
        <div className="label">🗃️ Muuttujat</div>
        {tableView()}
      </div>

      <div className={"box func" + (slow ? " live" : "")}>
        <div className="label">{running ? "🔧 funktio(x)" : "🔧 funktio(x): napauta ruutua muuttaaksesi"}</div>
        {progRows}
        {lines.length < lv.rows && !running ? <div className="add" onClick={() => { lines.push(L("A", "A", "+", "x")); edited(); rg.sound("pop", { volume: 0.4 }); }}>+ rivi</div> : null}
      </div>

      {slow ? <div className="caption">{caption()}</div> : null}
      {showResult ? resultView() : null}
      {!running && !showResult && (msg || showHint) ? <div className="msg">{showHint ? "💡 " + lv.hint : msg}</div> : null}
      {showResult && showHint && !solved ? <div className="msg">{"💡 " + lv.hint}</div> : null}
      <div className="spacer"></div>
      {bar}
      {palette}
      <div id="probe" className="probe"></div>
      {arrows}
      {flyers}
    </div>
  );
}

function view() {
  if (screen === "intro") return introView();
  if (screen === "areas") return areasView();
  if (screen === "done") return doneView();
  return playView();
}
