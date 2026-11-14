// Ristinolla: three in a row. Two players on one phone, against the
// phone (an easy opponent that sometimes misses, so a child can win), or on
// two phones over Bluetooth (rg.net; on the web two browser tabs). The
// phones are connected in the menu's settings (⚙️ → Kaksi puhelinta); when
// both are in Ristinolla the two-phone game starts by itself (the guest
// follows the host into the game). The host keeps the game: it is X, the
// guest O, the guest's taps go to the host and the host sends the whole game
// back after every change.

type Mark = "" | "X" | "O";
type Mode = "menu" | "net" | "play" | "over";

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
let net = false;               // playing on two phones
let me: Mark = "X";            // on two phones: this phone's mark (host X, guest O)
let netNote = "";              // in the menu: why the two-phone game ended
let partner = "";              // the host's: the guest it plays with
let firstState = false;        // a guest waits for the host's first round

function newRound() {
  board = ["", "", "", "", "", "", "", "", ""];
  born = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  winner = ""; winLine = []; draw = false;
  turn = starts;
  starts = starts === "X" ? "O" : "X";
  mode = "play";
  phoneClock = 0;
  sayTurn(false);
  sync();
}

// who starts, aloud
function sayTurn(queue: boolean) {
  const id = net ? (turn === me ? "sinun_vuorosi" : "kaverin_vuoro")
    : vsPhone ? (turn === "X" ? "sinun_vuorosi" : "minun_vuoroni") : (turn === "X" ? "ristin_vuoro" : "nollan_vuoro");
  rg.say(id, queue ? { queue: true } : undefined);
}

function lineOf(b: Mark[]): number[] {
  for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return l;
  return [];
}

function popSound(m: Mark) {
  rg.sound("pop", { pitch: m === "X" ? 1 : 1.35 });
  rg.vibrate(12);
}

// the end of a round: cheers for the winner, a softer sound for the loser
function announce() {
  if (draw) { rg.sound("wrong"); rg.say("tasapeli"); return; }
  const lost = net ? winner !== me : vsPhone && winner === "O";
  if (lost) rg.sound("lose"); else rg.celebrate(width / 2, height * 0.45, { big: true });
  rg.say(net ? (lost ? "kaveri_voitti" : "voitit")
    : vsPhone ? (winner === "O" ? "puhelin_voitti" : "voitit") : (winner === "X" ? "risti_voitti" : "nolla_voitti"));
  rg.vibrate([60, 40, 120]);
}

function place(i: number) {
  if (mode !== "play" || board[i]) return;
  board[i] = turn; born[i] = t;
  popSound(turn);
  const l = lineOf(board);
  if (l.length) {
    winner = turn; winLine = l; score[turn]++;
    mode = "over"; overClock = 0;
  } else if (board.every((m) => m !== "")) {
    draw = true; mode = "over"; overClock = 0;
  } else {
    turn = turn === "X" ? "O" : "X";
    phoneClock = 0;
  }
  if (mode === "over") announce();
  else if (net && turn === me) rg.say("sinun_vuorosi");
  sync();
}

// ---- two phones ----

// the host sends the whole game to the guest after every change
function sync() {
  if (!net || rg.net.role !== "host") return;
  rg.net.send({ t: "st", board, turn, winner, winLine, draw, score, mode: mode === "over" ? "over" : "play" });
}

// the guest's copy of the host's game: new marks pop in, the end is announced
function applyState(st: any) {
  const fresh = firstState || (st.board.every((m: Mark) => m === "") && (mode !== "play" || board.some((m) => m !== "")));
  for (let i = 0; i < 9; i++) if (st.board[i] && !board[i]) { born[i] = t; popSound(st.board[i]); }
  const ended = st.mode === "over" && mode !== "over";
  board = st.board.slice(); turn = st.turn; winner = st.winner; winLine = st.winLine; draw = st.draw; score = st.score;
  if (fresh) {
    born = [0, 0, 0, 0, 0, 0, 0, 0, 0]; mode = "play";
    const turnClip = turn === me ? "sinun_vuorosi" : "kaverin_vuoro";
    rg.say(firstState ? ["net_yhdistetty", turnClip] : turnClip);
    firstState = false;
  } else if (ended) { mode = "over"; overClock = 0; announce(); }
  else if (st.mode === "play") { mode = "play"; if (turn === me && st.board.some((m: Mark) => m !== "")) rg.say("sinun_vuorosi"); }
}

function tap(i: number) {
  if (!net) { place(i); return; }
  if (mode !== "play" || turn !== me || board[i]) return;
  if (rg.net.role === "host") place(i);
  else rg.net.send({ t: "tap", i });
}

function again() {
  rg.sound("click");
  if (!net) newRound();
  else if (rg.net.role === "host") newRound();
  else rg.net.send({ t: "again" });
}

// back from the two-phone game: to the games menu (a guest follows its host)
function leaveNet() {
  rg.sound("click");
  net = false;
  rg.exit();
}

function beginNet(peer: any) {
  net = true; vsPhone = false; netNote = "";
  me = rg.net.role === "host" ? "X" : "O";
  partner = peer ? peer.id : "";
  score = { X: 0, O: 0 }; starts = "X";
  rg.sound("win");
  rg.vibrate([40, 60, 40]);
  if (me === "X") { newRound(); rg.say(["net_yhdistetty", turn === me ? "sinun_vuorosi" : "kaverin_vuoro"]); }
  else { board = ["", "", "", "", "", "", "", "", ""]; born = [0, 0, 0, 0, 0, 0, 0, 0, 0]; mode = "play"; turn = "X"; firstState = true; }
}

// the menu's two-phone button: start with the friend if it is in Ristinolla too
function twoPhones() {
  rg.sound("click");
  const here = rg.net.here();
  if (here.length && rg.net.role === "host") { beginNet(here[0]); return; }
  if (here.length) { rg.net.send({ t: "start" }); return; }
  mode = "net";
}

function onNet(ev: any) {
  if (ev.type === "join") {
    // the friend came into Ristinolla: the host starts, X begins the first round
    if (net) return;
    if (rg.net.role === "host") beginNet(ev.peer);
    else if (ev.peer.host) beginNet(ev.peer);
  } else if (ev.type === "leave") {
    const mine = rg.net.role === "host" ? ev.peer.id === partner : ev.peer.host;
    if (net && mine) {
      net = false; mode = "menu";
      const linked = rg.net.links.some((l: any) => l.id === ev.peer.id);
      netNote = linked ? rg.t("Kaveri lähti pelistä.", "Your friend left the game.", "Tu amigo salió del juego.") : rg.t("Yhteys katkesi.", "The connection was lost.", "Se perdió la conexión.");
      rg.sound("lose"); rg.say("net_katkesi");
    }
  } else if (ev.type === "message" && !net && rg.net.role === "host" && ev.data && ev.data.t === "start") {
    const p = rg.net.links.filter((l: any) => l.id === ev.from)[0];
    if (p) beginNet(p);
  } else if (ev.type === "message" && net) {
    const m = ev.data || {};
    if (rg.net.role === "host") {
      if (ev.from !== partner) return;
      if (m.t === "tap" && turn !== me && mode === "play") place(m.i);
      else if (m.t === "again" && mode === "over") newRound();
    } else if (m.t === "st") applyState(m);
  }
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
  vsPhone = phone; net = false; netNote = ""; score = { X: 0, O: 0 }; starts = "X";
  rg.sound("click");
  newRound();
}

function onBack() {
  if (mode === "menu") rg.exit();
  else if (net) leaveNet();
  else { mode = "menu"; rg.sound("click"); }
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
    const hot = mode === "play" && !board[i] && (net ? turn === me : !(vsPhone && turn === "O"));
    cells.push(<div className={hot ? "cell hot" : "cell"} id={"c" + i} onClick={() => tap(i)}>{MarkView(board[i], i)}</div>);
  }
  return <div className="board">{cells}</div>;
}

function who(m: Mark) {
  if (net) return m === me ? rg.t("Sinä", "You", "Tú") : rg.t("Kaveri", "Friend", "Amigo");
  if (vsPhone) return m === "X" ? rg.t("Sinä", "You", "Tú") : rg.t("Puhelin", "Phone", "Teléfono");
  return m === "X" ? rg.t("Risti", "Cross", "Equis") : rg.t("Nolla", "Circle", "Círculo");
}

function Status() {
  if (mode === "over") {
    const text = draw ? rg.t("Tasapeli!", "Draw!", "¡Empate!")
      : net ? (winner === me ? rg.t("Voitit! 🎉", "You won! 🎉", "¡Ganaste! 🎉") : rg.t("Kaveri voitti!", "Your friend won!", "¡Ganó tu amigo!"))
      : vsPhone ? (winner === "X" ? rg.t("Voitit! 🎉", "You won! 🎉", "¡Ganaste! 🎉") : rg.t("Puhelin voitti!", "The phone won!", "¡Ganó el teléfono!")) : rg.t(who(winner) + " voitti! 🎉", who(winner) + " won! 🎉", "¡Ganó " + who(winner) + "! 🎉");
    return <div className="status big">{text}</div>;
  }
  if (net) return <div className={"status " + (turn === "X" ? "tx" : "to")}>{turn === me ? rg.t("Sinun vuorosi!", "Your turn!", "¡Te toca!") : rg.t("Kaverin vuoro…", "Your friend's turn…", "Le toca a tu amigo…")}</div>;
  return <div className={"status " + (turn === "X" ? "tx" : "to")}>{vsPhone && turn === "O" ? rg.t("Puhelin miettii…", "The phone is thinking…", "El teléfono está pensando…") : rg.t("Vuoro: ", "Turn: ", "Turno: ") + who(turn)}</div>;
}

function Menu() {
  const bob = Math.sin(t * 3) * 6;
  return (
    <div className="screen menu">
      <div className="title" style={{ marginTop: 60 + bob }}>{rg.t("Ristinolla", "Tic-Tac-Toe", "Tres en raya")}</div>
      <div className="demo">❌ ⭕</div>
      {netNote ? <div className="note">{netNote}</div> : null}
      <div className="btn" id="vsphone" onClick={() => start(true)}>📱 {rg.t("Puhelinta vastaan", "Against the phone", "Contra el teléfono")}</div>
      <div className="btn alt" id="vsfriend" onClick={() => start(false)}>👫 {rg.t("Kaverin kanssa", "With a friend", "Con un amigo")}</div>
      <div className="btn two" id="twophones" onClick={() => twoPhones()}>📱📱 {rg.t("Kaksi puhelinta", "Two phones", "Dos teléfonos")}</div>
      <div className="btn back" id="exit" onClick={() => rg.exit()}>{rg.t("← Valikkoon", "← Menu", "← Menú")}</div>
    </div>
  );
}

// the two-phone button without a friend in Ristinolla: where to connect
function NetHelp() {
  const linked = rg.net.connected();
  return (
    <div className="screen menu">
      <div className="title small" style={{ marginTop: 50 }}>{rg.t("Kaksi puhelinta", "Two phones", "Dos teléfonos")}</div>
      <div className="demo small">📱📡📱</div>
      <div className="note">{linked
        ? rg.t("Kaveri on toisessa pelissä. Kun kaveri avaa Ristinollan, peli alkaa.", "Your friend is in another game. When they open Tic-Tac-Toe, the game starts.", "Tu amigo está en otro juego. Cuando abra Tres en raya, empieza la partida.")
        : rg.t("Yhdistä puhelimet ensin: valikko → ⚙️ → Kaksi puhelinta.", "Connect the phones first: menu → ⚙️ → Two phones.", "Conecta primero los teléfonos: menú → ⚙️ → Dos teléfonos.")}</div>
      <div className="btn back small" id="netback" onClick={() => { mode = "menu"; rg.sound("click"); }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
    </div>
  );
}

function view() {
  if (mode === "menu") return Menu();
  if (mode === "net") return NetHelp();
  return (
    <div className="screen">
      <div className="top">
        <div className="score tx">{who("X")}: {score.X}</div>
        <div className="score to">{who("O")}: {score.O}</div>
      </div>
      {Status()}
      {Board()}
      {mode === "over" && overClock > 0.6 ? <div className="btn again" id="again" onClick={() => again()}>{rg.t("Uudestaan!", "Again!", "¡Otra vez!")}</div> : <div className="spacer" />}
      <div className="btn back small" id="menu" onClick={() => { if (net) leaveNet(); else { mode = "menu"; rg.sound("click"); } }}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
    </div>
  );
}
