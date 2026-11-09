// Laskupeli: count the fruit. A sum (or a difference) is shown as fruit in
// two groups; tap the right answer of three. Ten questions a round, a star
// for each right answer. Three levels: plus up to 5, plus up to 10, minus.

type Mode = "menu" | "play" | "done";
type Level = { name: string; max: number; minus: boolean; color: string };
type Spark = { x: number; y: number; vx: number; vy: number; t: number; c: string };

const LEVELS: Level[] = [
  { name: "Plussa 1–5", max: 5, minus: false, color: "#06d6a0" },
  { name: "Plussa 1–10", max: 10, minus: false, color: "#118ab2" },
  { name: "Miinus", max: 10, minus: true, color: "#ef476f" },
];
const FRUIT = ["🍎", "🍐", "🍓", "🍊", "🍌", "🍇", "🥕", "🐟"];
const SPARK = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#ffffff"];
const ROUND = 10;

let mode: Mode = "menu";
let level = 0;
let a = 0, b = 0, answer = 0;
let choices: number[] = [];
let fruit = "🍎";
let question = 0;
let right = 0;
let firstTry = true;
let t = 0;
let solved = -1;          // the time it was solved; the next question follows
let shake: { i: number; t: number } = { i: -1, t: 0 };
let sparks: Spark[] = [];
let best: number[] = [0, 0, 0];

function init() {
  best = rg.load("best", [0, 0, 0]);
}

function next() {
  const L = LEVELS[level];
  if (L.minus) {
    a = rg.range(2, L.max);
    b = rg.range(1, a - 1);
    answer = a - b;
  } else {
    a = rg.range(1, L.max - 1);
    b = rg.range(1, L.max - a);
    answer = a + b;
  }
  const set = [answer];
  while (set.length < 3) {
    const n = answer + rg.pick([-2, -1, 1, 2, 3]);
    if (n >= 0 && set.indexOf(n) < 0) set.push(n);
  }
  choices = rg.shuffle(set);
  fruit = rg.pick(FRUIT);
  firstTry = true;
  solved = -1;
}

function startLevel(i: number) {
  level = i;
  question = 0;
  right = 0;
  mode = "play";
  rg.sound("click");
  next();
}

function pick(i: number) {
  if (solved >= 0) return;
  if (choices[i] === answer) {
    solved = t;
    if (firstTry) right++;
    rg.celebrate(60 + i * 120, height - 150, { sound: false });
    rg.sound(firstTry ? "star" : "coin");
    for (let k = 0; k < 24; k++) {
      const ang = rg.random() * Math.PI * 2, sp = 80 + rg.random() * 220;
      sparks.push({ x: 60 + i * 120, y: height - 150, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120, t: 0, c: rg.pick(SPARK) });
    }
  } else {
    firstTry = false;
    shake = { i, t };
    rg.sound("wrong");
    rg.vibrate(60);
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
    } else next();
  }
}

function onBack() {
  if (mode === "menu") rg.exit(); else { mode = "menu"; rg.sound("click"); }
}

function Group(n: number, crossed: number) {
  const items = [];
  for (let i = 0; i < n; i++) {
    const gone = i >= n - crossed;
    items.push(<div className={gone ? "fruit gone" : "fruit"}>{fruit}</div>);
  }
  return <div className="group">{items}</div>;
}

function Question() {
  const L = LEVELS[level];
  const done = solved >= 0;
  return (
    <div className="card">
      {L.minus ? (
        <div className="groups">{Group(a, done ? b : 0)}</div>
      ) : (
        <div className="groups">{Group(a, 0)}<div className="op">+</div>{Group(b, 0)}</div>
      )}
      <div className="sum">{a} {L.minus ? "−" : "+"} {b} = {done ? answer : "?"}</div>
    </div>
  );
}

function Choices() {
  return (
    <div className="choices">
      {choices.map((n, i) => {
        const k = shake.i === i ? Math.max(0, 1 - (t - shake.t) / 0.4) : 0;
        const dx = Math.sin((t - shake.t) * 50) * 10 * k;
        const ok = solved >= 0 && n === answer;
        const pop = ok ? 1 + 0.15 * Math.max(0, 1 - (t - solved) * 2) : 1;
        return (
          <div className={ok ? "choice ok" : "choice"} id={"ch" + i} onClick={() => pick(i)}
            style={{ marginLeft: 8 + dx, marginRight: 8 - dx, width: 92 * pop, height: 92 * pop }}>{n}</div>
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

function Menu() {
  const bob = Math.sin(t * 2.5) * 6;
  return (
    <div className="screen">
      <div className="title" style={{ marginTop: 50 + bob }}>Laskupeli</div>
      <div className="lead">🍎 + 🍎🍎 = ?</div>
      {LEVELS.map((L, i) => (
        <div className="level" id={"lv" + i} onClick={() => startLevel(i)} style={{ backgroundColor: L.color }}>
          <div className="lvname">{L.name}</div>
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
      <div className="lead">{right} / {ROUND} oikein heti</div>
      <div className="level" id="again" onClick={() => startLevel(level)} style={{ backgroundColor: LEVELS[level].color }}><div className="lvname">Uudestaan!</div></div>
      <div className="level back" id="menu" onClick={() => { mode = "menu"; rg.sound("click"); }}><div className="lvname">← Takaisin</div></div>
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
