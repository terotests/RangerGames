// Ristinolla: three in a row. Two players on one phone, against the
// phone (an easy opponent that sometimes misses, so a child can win), or on
// two phones over Bluetooth (rg.net; on the web two browser tabs). On two
// phones the host keeps the game: it is X, the guest O, the guest's taps go
// to the host and the host sends the whole game back after every change.

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
let netNote = "";              // on the two-phone screen: what went wrong last
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

function openNet() {
  rg.sound("click");
  mode = "net"; netNote = "";
  rg.net.close();
  rg.say("net_aloita_tai_liity");
}

function leaveNet() {
  rg.sound("click");
  rg.net.close();
  net = false; mode = "menu";
}

const NET_ERRORS: { [k: string]: string[] } = {
  "no-bluetooth": ["Tässä laitteessa ei ole Bluetoothia.", "This device has no Bluetooth.", "Este dispositivo no tiene Bluetooth."],
  "bluetooth-off": ["Bluetooth ei mennyt päälle.", "Bluetooth did not turn on.", "El Bluetooth no se encendió."],
  "permission": ["Peli tarvitsee luvan käyttää Bluetoothia.", "The game needs permission to use Bluetooth.", "El juego necesita permiso para usar Bluetooth."],
  "connect-failed": ["Kaverin puhelimeen ei saatu yhteyttä.", "Could not reach your friend's phone.", "No se pudo conectar con el teléfono de tu amigo."],
  "busy": ["Kaverin pelissä on jo pelaaja.", "Your friend's game already has a player.", "La partida de tu amigo ya tiene jugador."]
};

function onNet(ev: any) {
  if (ev.type === "join") {
    // the friend is here: the host starts, X begins the first round
    net = true; vsPhone = false; netNote = "";
    me = rg.net.role === "host" ? "X" : "O";
    score = { X: 0, O: 0 }; starts = "X";
    rg.sound("win");
    rg.vibrate([40, 60, 40]);
    if (me === "X") { newRound(); rg.say(["net_yhdistetty", turn === me ? "sinun_vuorosi" : "kaverin_vuoro"]); }
    else { board = ["", "", "", "", "", "", "", "", ""]; born = [0, 0, 0, 0, 0, 0, 0, 0, 0]; mode = "play"; turn = "X"; firstState = true; }
  } else if (ev.type === "leave") {
    if (net) { net = false; mode = "net"; netNote = rg.t("Yhteys katkesi.", "The connection was lost.", "Se perdió la conexión."); rg.sound("lose"); rg.say("net_katkesi"); }
  } else if (ev.type === "other-game") {
    netNote = rg.t("Kaveri on eri pelissä.", "Your friend is in another game.", "Tu amigo está en otro juego.");
  } else if (ev.type === "state" && ev.state === "error") {
    const e = NET_ERRORS[ev.reason];
    netNote = e ? rg.t(e[0], e[1], e[2]) : rg.t("Yhteys ei onnistunut.", "Could not connect.", "No se pudo conectar.");
    rg.sound("wrong"); rg.say("net_virhe");
  } else if (ev.type === "message" && net) {
    const m = ev.data || {};
    if (rg.net.role === "host") {
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
  vsPhone = phone; net = false; score = { X: 0, O: 0 }; starts = "X";
  rg.sound("click");
  newRound();
}

function onBack() {
  if (mode === "menu") rg.exit();
  else if (mode === "net" || net) leaveNet();
  else { mode = "menu"; rg.sound("click"); }
}

function onClose() {
  rg.net.close();
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
      <div className="btn" id="vsphone" onClick={() => start(true)}>📱 {rg.t("Puhelinta vastaan", "Against the phone", "Contra el teléfono")}</div>
      <div className="btn alt" id="vsfriend" onClick={() => start(false)}>👫 {rg.t("Kaverin kanssa", "With a friend", "Con un amigo")}</div>
      <div className="btn two" id="twophones" onClick={() => openNet()}>📱📱 {rg.t("Kaksi puhelinta", "Two phones", "Dos teléfonos")}</div>
      <div className="btn back" id="exit" onClick={() => rg.exit()}>{rg.t("← Valikkoon", "← Menu", "← Menú")}</div>
    </div>
  );
}

// the two-phone screen: start a game (host) or join a friend's (find)
function NetMenu() {
  const st = rg.net.state;
  const pulse = 1 + Math.sin(t * 4) * 0.08;
  const web = rg.net.kind === "web";
  let body;
  if (!rg.net.available) {
    body = <div className="note">{rg.t("Tässä laitteessa ei voi pelata kahdella puhelimella.", "Two-phone play does not work on this device.", "En este dispositivo no se puede jugar con dos teléfonos.")}</div>;
  } else if (st === "hosting" || (st === "connected" && !net)) {
    body = [
      <div className="bigicon" style={{ transform: "scale(" + pulse.toFixed(3) + ")" }}>📡</div>,
      <div className="label">{st === "connected" ? rg.t("Yhdistetään…", "Connecting…", "Conectando…") : rg.t("Odotetaan kaveria…", "Waiting for your friend…", "Esperando a tu amigo…")}</div>,
      <div className="hint">{rg.t("Kaveri painaa omassa puhelimessaan Liity ja valitsee tämän:", "Your friend taps Join on their phone and picks this one:", "Tu amigo pulsa Unirse en su teléfono y elige este:")}</div>,
      <div className="myname">📱 {rg.net.name}</div>,
      web ? <div className="hint">{rg.t("(Selaimessa: avaa peli toiseen välilehteen.)", "(In a browser: open the game in another tab.)", "(En el navegador: abre el juego en otra pestaña.)")}</div> : null,
      <div className="btn back small" id="cancel" onClick={() => openNet()}>{rg.t("Peru", "Cancel", "Cancelar")}</div>
    ];
  } else if (st === "searching" || st === "connecting") {
    const list = rg.net.peers.map((p: any, k: number) => (
      <div className="btn peer" id={"peer" + k} onClick={() => { rg.sound("click"); rg.net.join(p.id); }}>📱 {p.name}{p.paired ? " ⭐" : ""}</div>
    ));
    body = [
      <div className="bigicon" style={{ transform: "rotate(" + Math.round(Math.sin(t * 3) * 20) + "deg)" }}>🔍</div>,
      <div className="label">{st === "connecting" ? rg.t("Yhdistetään…", "Connecting…", "Conectando…") : list.length ? rg.t("Valitse kaverin puhelin", "Pick your friend's phone", "Elige el teléfono de tu amigo") : rg.t("Etsitään kaveria…", "Looking for your friend…", "Buscando a tu amigo…")}</div>,
      st === "connecting" ? null : <div className="peers">{list}</div>,
      list.length || st === "connecting" ? null : <div className="hint">{rg.t("Kaverin puhelimessa pitää olla Aloita peli painettuna.", "Your friend's phone must have Start a game pressed.", "El teléfono de tu amigo debe tener pulsado Empezar partida.")}</div>,
      <div className="btn back small" id="cancel" onClick={() => openNet()}>{rg.t("Peru", "Cancel", "Cancelar")}</div>
    ];
  } else {
    body = [
      netNote ? <div className="note">{netNote}</div> : <div className="demo small">📱📡📱</div>,
      <div className="btn" id="host" onClick={() => { rg.sound("click"); netNote = ""; rg.net.host({ max: 1 }); rg.say("net_odota"); }}>🏠 {rg.t("Aloita peli", "Start a game", "Empezar partida")}</div>,
      <div className="btn alt" id="join" onClick={() => { rg.sound("click"); netNote = ""; rg.net.find(); rg.say("net_etsi"); }}>🔍 {rg.t("Liity kaverin peliin", "Join a friend's game", "Unirse a un amigo")}</div>
    ];
  }
  return (
    <div className="screen menu">
      <div className="title small" style={{ marginTop: 50 }}>{rg.t("Kaksi puhelinta", "Two phones", "Dos teléfonos")}</div>
      {body}
      <div className="btn back small" id="netback" onClick={() => leaveNet()}>{rg.t("← Takaisin", "← Back", "← Atrás")}</div>
    </div>
  );
}

function view() {
  if (mode === "menu") return Menu();
  if (mode === "net") return NetMenu();
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
