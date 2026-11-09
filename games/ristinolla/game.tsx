// Ristinolla: three in a row. Two players on one phone, or against the
// phone (an easy opponent that sometimes misses, so a child can win).

type Mark = "" | "X" | "O";
type Mode = "menu" | "play" | "over";

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

let mode: Mode = "menu";
let vsPhone = true;
let board: Mark[] = [];
let born: number[] = [];       // when each mark was placed, for its pop-in
let turn: Mark = "X";
let winner: Mark = "";
let winLine: number[] = [];
let draw = false;
let score = { X: 0, O: 0 };
let t = 0;
let phoneClock = 0;
let overClock = 0;
let starts: Mark = "X";

function newRound() {
  board = ["", "", "", "", "", "", "", "", ""];
  born = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  winner = ""; winLine = []; draw = false;
  turn = starts;
  starts = starts === "X" ? "O" : "X";
  mode = "play";
  phoneClock = 0;
  // who starts, aloud
  rg.say(vsPhone ? (turn === "X" ? "sinun_vuorosi" : "minun_vuoroni") : (turn === "X" ? "ristin_vuoro" : "nollan_vuoro"));
}

function lineOf(b: Mark[]): number[] {
  for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return l;
  return [];
}

function place(i: number) {
  if (mode !== "play" || board[i]) return;
  board[i] = turn; born[i] = t;
  rg.sound("pop", { pitch: turn === "X" ? 1 : 1.35 });
  rg.vibrate(12);
  const l = lineOf(board);
  if (l.length) {
    winner = turn; winLine = l; score[turn]++;
    mode = "over"; overClock = 0;
    if (vsPhone && winner === "O") rg.sound("lose"); else rg.celebrate(width / 2, height * 0.45, { big: true });
    rg.say(vsPhone ? (winner === "O" ? "puhelin_voitti" : "voitit") : (winner === "X" ? "risti_voitti" : "nolla_voitti"));
    rg.vibrate([60, 40, 120]);
    return;
  }
  if (board.every((m) => m !== "")) { draw = true; mode = "over"; overClock = 0; rg.sound("wrong"); rg.say("tasapeli"); return; }
  turn = turn === "X" ? "O" : "X";
  phoneClock = 0;
}

// the phone's move: win if it can, block (most of the time), else the
// middle or a random square
function phoneMove(): number {
  const free = board.map((m, i) => (m ? -1 : i)).filter((i) => i >= 0);
  const tryMark = (m: Mark) => {
    for (const i of free) { const b = board.slice(); b[i] = m; if (lineOf(b).length) return i; }
    return -1;
  };
  let i = tryMark("O");
  if (i >= 0) return i;
  if (rg.random() < 0.75) { i = tryMark("X"); if (i >= 0) return i; }
  if (!board[4] && rg.random() < 0.6) return 4;
  return rg.pick(free);
}

function tick(dt: number) {
  t += dt;
  if (mode === "play" && vsPhone && turn === "O") {
    phoneClock += dt;
    if (phoneClock > 0.6) place(phoneMove());
  }
  if (mode === "over") overClock += dt;
}

function start(phone: boolean) {
  vsPhone = phone; score = { X: 0, O: 0 }; starts = "X";
  rg.sound("click");
  newRound();
}

function onBack() {
  if (mode === "menu") rg.exit(); else { mode = "menu"; rg.sound("click"); }
}

function MarkView(m: Mark, i: number) {
  if (!m) return null;
  const k = Math.min(1, (t - born[i]) / 0.25);
  const s = rg.ease.back(k);
  const size = 70 * s;
  const glow = winLine.indexOf(i) >= 0 && Math.floor(t * 4) % 2 === 0;
  if (m === "X") {
    return (
      <div className="mark" style={{ width: size, height: size }}>
        <div className="xbar" style={{ width: size, height: size * 0.2, transform: "rotate(45deg)", backgroundColor: glow ? "#ffffff" : "#ff5d8f" }} />
        <div className="xbar" style={{ width: size, height: size * 0.2, transform: "rotate(-45deg)", backgroundColor: glow ? "#ffffff" : "#ff5d8f" }} />
      </div>
    );
  }
  return <div className="oring" style={{ width: size, height: size, borderWidth: Math.max(2, size * 0.17), borderColor: glow ? "#ffffff" : "#4cc9f0" }} />;
}

function Board() {
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const hot = mode === "play" && !board[i] && !(vsPhone && turn === "O");
    cells.push(<div className={hot ? "cell hot" : "cell"} id={"c" + i} onClick={() => place(i)}>{MarkView(board[i], i)}</div>);
  }
  return <div className="board">{cells}</div>;
}

function who(m: Mark) {
  if (vsPhone) return m === "X" ? rg.t("Sinä", "You", "Tú") : rg.t("Puhelin", "Phone", "Teléfono");
  return m === "X" ? rg.t("Risti", "Cross", "Equis") : rg.t("Nolla", "Circle", "Círculo");
}

function Status() {
  if (mode === "over") {
    const text = draw ? rg.t("Tasapeli!", "Draw!", "¡Empate!") : vsPhone ? (winner === "X" ? rg.t("Voitit! 🎉", "You won! 🎉", "¡Ganaste! 🎉") : rg.t("Puhelin voitti!", "The phone won!", "¡Ganó el teléfono!")) : rg.t(who(winner) + " voitti! 🎉", who(winner) + " won! 🎉", "¡Ganó " + who(winner) + "! 🎉");
    return <div className="status big">{text}</div>;
  }
  return <div className={"status " + (turn === "X" ? "tx" : "to")}>{vsPhone && turn === "O" ? rg.t("Puhelin miettii…", "The phone is thinking…", "El teléfono está pensando…") : rg.t("Vuoro: ", "Turn: ", "Turno: ") + who(turn)}</div>;
}

function Menu() {
  const bob = Math.sin(t * 3) * 6;
  return (
    <div className="screen menu">
      <div className="title" style={{ marginTop: 60 + bob }}>{rg.t("Ristinolla", "Tic-Tac-Toe", "Tres en raya")}</div>
      <div className="demo">❌ ⭕</div>
      <div className="btn" id="vsphone" onClick={() => start(true)}>📱 {rg.t("Puhelinta vastaan", "Against the phone", "Contra el teléfono")}</div>
      <div className="btn alt" id="vsfriend" onClick={() => start(false)}>👫 {rg.t("Kaverin kanssa", "With a friend", "Con un amigo")}</div>
      <div className="btn back" id="exit" onClick={() => rg.exit()}>{rg.t("← Valikkoon", "← Menu", "← Menú")}</div>
    </div>
  );
}

function view() {
  if (mode === "menu") return Menu();
  return (
    <div className="screen">
      <div className="top">
        <div className="score tx">{who("X")}: {score.X}</div>
        <div className="score to">{who("O")}: {score.O}</div>
      </div>
      {Status()}
      {Board()}
      {mode === "over" && overClock > 0.6 ? <div className="btn again" id="again" onClick={() => { rg.sound("click"); newRound(); }}>{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div> : <div className="spacer" />}
      <div className="btn back small" id="menu" onClick={() => { mode = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
    </div>
  );
}
