// Nappulasota: chess with toy soldiers in 3D. Every piece is a little
// soldier (the pawn a helmeted one, the rook carries a tower, the knight a
// horse's head, the bishop a tall hat, the queen and the king crowns) that
// walks to its square; a capture is a sword fight: the attacker swings, the
// blow lands on the "osuma" marker of its Attack clip and the other one
// flinches and falls. All of chess's rules (lib/chess.ts, the same as
// Shakki's). Against the phone on four levels, the first of which a child
// beats; two players on one phone; or chess puzzles: mate in one or two.
//
// Written with three.js's names as React Three Fiber does: the world is JSX
// in <scene3d>, the pieces are glTF models (models/, made by
// tools/three/make-soldier.mjs) played by THREE.AnimationMixer with
// crossfades, and a tap on a piece or a square is its onClick.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  Game, Level, Thinker, newGame, legalMoves, status, play, takeBack, inCheck,
  startThink, stepThink, think, from, to, promo, flag, EP, CASTLE, PAWN, QUEEN, KING,
} from "lib/chess";
import { PUZZLES, matedWithin, solution } from "lib/puzzles";

type Piece = {
  id: number; p: number; sq: number; x: number; z: number; ry: number;
  model: any; mixer: any; act: any; cur: string; alive: boolean; gone: number; stay: boolean;
};
type Walk = { pc: Piece; path: { x: number; z: number }[]; target: Piece | null; phase: string; promote: number; dist: number };
type Screen = "menu" | "level" | "play";
type Mode = "ai" | "two" | "puzzle";

const LETTER = ["", "p", "n", "b", "r", "q", "k"];
const SAY = ["", "sk_sotilas", "sk_ratsu", "sk_lahetti", "sk_torni", "sk_kuningatar", "sk_kuningas"];
const SCALE = [0, 0.6, 0.66, 0.66, 0.66, 0.7, 0.74];
const BUDGET = [0, 400, 4000, 25000];      // nodes the phone may look at per move (as Shakki)
const LEVELS = [
  ["Harjoittelu", "Practice", "Práctica"],
  ["Helppo", "Easy", "Fácil"],
  ["Keskitaso", "Medium", "Medio"],
  ["Vaikea", "Hard", "Difícil"],
];
const loader = new GLTFLoader();
const MODELS: any = {};
for (const s of ["w", "b"]) for (const k of LETTER.slice(1)) MODELS[s + k] = loader.loadSync("models/" + s + k + ".glb");

let screen: Screen = "menu";
let mode: Mode = "ai";
let level = rg.load("level", 0);
let g: Game = newGame();
let pieces: Piece[] = [];
let nextId = 1;
let sel = -1;                 // the selected square
let targets: number[] = [];   // where it can go
let walks: Walk[] = [];       // the move being played
let thinker: Thinker | null = null;
let thinkWait = 0;
let over = "";                // the result when the game has ended
let hintMove = 0;
let t = 0;
let msg = "";                 // a short message under the top bar
let msgTime = 0;
// puzzles
let pz = rg.load("puzzle", 0);
let pzLeft = 0;               // the player's moves left to mate
let pzSolved = false;
let pzWrong = 0;              // time left showing "not mate": then the position comes back

rg.seed(Math.floor(Date.now() % 100000) + 1);

const fileOf = (sq: number) => sq & 7;
const rankOf = (sq: number) => sq >> 4;
const spot = (sq: number) => ({ x: fileOf(sq) - 3.5, z: 3.5 - rankOf(sq) });
const pieceAt = (sq: number) => pieces.find((q) => q.alive && q.sq === sq) || null;
const tr = (fi: string, en: string, es: string) => rg.t(fi, en, es);

// --- the pieces in 3D ----------------------------------------------------------

function makePiece(p: number, sq: number): Piece {
  const m = MODELS[(p > 0 ? "w" : "b") + LETTER[Math.abs(p)]];
  const model = m.scene.clone();
  const mixer = new THREE.AnimationMixer(model);
  const act: any = {};
  for (const clip of m.animations) act[clip.name] = mixer.clipAction(clip);
  for (const n of ["Attack", "Hit", "Death"]) { act[n].setLoop(THREE.LoopOnce, 1); act[n].clampWhenFinished = true; }
  act.Attack.addMarker("osuma", 0.5);
  const s = spot(sq);
  const pc: Piece = { id: nextId++, p, sq, x: s.x, z: s.z, ry: p > 0 ? Math.PI : 0, model, mixer, act, cur: "", alive: true, gone: 0, stay: false };
  mixer.addEventListener("marker", (e: any) => { if (e.name === "osuma") blowLands(pc); });
  mixer.addEventListener("finished", (e: any) => finished(pc, e.action.getClip().name));
  return pc;
}

// a clip with a crossfade from the one playing; "" = stand still (no clip:
// the engine draws a standing piece from its cache, cheap for 32 pieces)
function anim(pc: Piece, name: string, fade = 0.2) {
  if (pc.cur === name) return;
  const old = pc.cur ? pc.act[pc.cur] : null;
  if (!name) { if (old) old.fadeOut(fade); pc.cur = ""; return; }
  const a = pc.act[name];
  a.reset().play();
  if (old) a.crossFadeFrom(old, fade); else a.fadeIn(fade);
  pc.cur = name;
}

// the pieces as the board has them now (a new game, a take-back, a puzzle)
function syncPieces() {
  pieces = [];
  for (let sq = 0; sq < 128; sq++) if (!(sq & 0x88) && g.b[sq]) pieces.push(makePiece(g.b[sq], sq));
  walks = []; sel = -1; targets = []; hintMove = 0;
}

// --- starting ----------------------------------------------------------------------

function startGame(m: Mode) {
  mode = m; screen = "play"; over = ""; thinker = null; thinkWait = 0;
  if (m === "puzzle") { loadPuzzle(); } else { g = newGame(); syncPieces(); }
  rg.orbit.reset();
  rg.sound("click");
  if (m === "ai") rg.say("sk_sinun_vuorosi"); else if (m === "two") rg.say("sk_valkoisen_vuoro");
}

function loadPuzzle() {
  if (pz >= PUZZLES.length) pz = 0;
  const P = PUZZLES[pz];
  g = newGame(P.fen);
  pzLeft = P.n; pzSolved = false; pzWrong = 0; over = "";
  syncPieces();
}

// --- tapping -------------------------------------------------------------------------

const humanTurn = () => mode !== "ai" || g.side > 0;
const busy = () => walks.length > 0 || pzWrong > 0;

function tapSquare(sq: number) {
  if (screen !== "play" || over || busy() || !humanTurn() || pzSolved) return;
  const p = g.b[sq];
  if (sel >= 0 && targets.indexOf(sq) >= 0) {
    let ms = legalMoves(g).filter((m) => from(m) === sel && to(m) === sq);
    // a pawn at the far end becomes a queen (the simplest for a child)
    if (ms.length > 1) ms = ms.filter((m) => promo(m) === QUEEN);
    hintMove = 0;
    doMove(ms[0]);
    return;
  }
  if (p && Math.sign(p) === g.side) {
    sel = sq;
    targets = legalMoves(g).filter((m) => from(m) === sq).map((m) => to(m));
    rg.sound("pop"); rg.vibrate(15);
    rg.say(SAY[Math.abs(p)]);
    for (const q of pieces) if (q.alive && q.cur === "Idle") anim(q, "");
    const pc = pieceAt(sq);
    if (pc) anim(pc, "Idle");
    if (!targets.length && inCheck(g, g.side)) rg.say("sk_kuningas_vaarassa");
    return;
  }
  if (sel >= 0) rg.sound("wrong");
}

// --- playing a move: the pieces walk, fight and fall -------------------------------

function doMove(m: number) {
  const f = from(m), tt = to(m), fl = flag(m);
  const mover = pieceAt(f) as Piece;
  const capSq = fl === EP ? tt - 16 * g.side : tt;
  const victim = pieceAt(capSq);
  play(g, m);
  sel = -1; targets = [];
  const end = spot(tt);
  const w: Walk = { pc: mover, path: [end], target: victim, phase: "walk", promote: promo(m) ? promo(m) * Math.sign(mover.p) : 0, dist: 0 };
  if (victim) {
    // walk up to the enemy, fight, then step onto its square
    const v = spot(capSq);
    const dx = v.x - mover.x, dz = v.z - mover.z, d = Math.hypot(dx, dz);
    const k = Math.max(0, (d - 0.55) / d);
    w.path = [{ x: mover.x + dx * k, z: mover.z + dz * k }, end];
  }
  mover.sq = tt;
  faceTo(mover, w.path[0]);
  anim(mover, "Walk", 0.15);
  walks.push(w);
  if (fl === CASTLE) {
    const rf = tt > f ? f + 3 : f - 4, rt = tt > f ? f + 1 : f - 1;
    const rook = pieceAt(rf) as Piece;
    rook.sq = rt;
    const rw: Walk = { pc: rook, path: [spot(rt)], target: null, phase: "walk", promote: 0, dist: 0 };
    faceTo(rook, rw.path[0]); anim(rook, "Walk", 0.15);
    walks.push(rw);
  }
  rg.sound("whoosh", { volume: 0.4 });
}

function faceTo(pc: Piece, p: { x: number; z: number }) {
  if (Math.hypot(p.x - pc.x, p.z - pc.z) > 0.01) pc.ry = Math.atan2(p.x - pc.x, p.z - pc.z);
}

function blowLands(attacker: Piece) {
  const w = walks.find((x) => x.pc === attacker);
  if (!w || !w.target) return;
  rg.sound("hit"); rg.vibrate([20, 30, 40]);
  faceTo(w.target, { x: attacker.x, z: attacker.z });
  anim(w.target, "Hit", 0.08);
}

function finished(pc: Piece, name: string) {
  if (name === "Hit") { anim(pc, "Death", 0.1); rg.sound("lose", { volume: 0.4 }); }
  else if (name === "Death" && !pc.stay) { pc.alive = false; pc.gone = 0.001; }
  else if (name === "Attack") { const w = walks.find((x) => x.pc === pc); if (w) w.phase = "wait"; }
}

function stepToward(pc: Piece, goal: { x: number; z: number }, dist: number, dt: number): boolean {
  const dx = goal.x - pc.x, dz = goal.z - pc.z, d = Math.hypot(dx, dz);
  const s = Math.max(1.6, dist / 1.4) * dt;      // a long move goes a little faster
  if (d <= s) { pc.x = goal.x; pc.z = goal.z; return true; }
  pc.x += dx / d * s; pc.z += dz / d * s;
  return false;
}

function playWalks(dt: number) {
  for (const w of walks) {
    const pc = w.pc;
    if (w.phase === "walk") {
      const goal = w.path[0];
      if (!w.dist) w.dist = Math.hypot(goal.x - pc.x, goal.z - pc.z);
      if (stepToward(pc, goal, w.dist, dt)) {
        w.path.shift(); w.dist = 0;
        if (w.target && w.target.alive && !w.target.gone) { w.phase = "fight"; anim(pc, "Attack", 0.15); }
        else if (w.path.length) faceTo(pc, w.path[0]);
        else w.phase = "done";
      }
    } else if (w.phase === "wait" && w.target && w.target.gone) {
      w.phase = "walk"; w.target = null; anim(pc, "Walk", 0.2);
      if (w.path.length) faceTo(pc, w.path[0]);
    }
    if (w.phase === "done") {
      pc.ry = pc.p > 0 ? Math.PI : 0;
      anim(pc, "", 0.3);
      if (w.promote) {
        // the pawn reached the far end: now a queen
        pc.alive = false;
        const q = makePiece(w.promote, pc.sq);
        pieces.push(q);
        rg.celebrate(width / 2, height / 2);
        rg.say("sk_korotus");
      }
    }
  }
  const was = walks.length;
  walks = walks.filter((w) => w.phase !== "done");
  if (was && !walks.length) afterMove();
}

function afterMove() {
  const st = status(g);
  pieces = pieces.filter((q) => q.alive || q.gone > 0);
  if (mode === "puzzle") { puzzleMove(st); return; }
  if (st === "mate") {
    const winner = -g.side;
    over = winner > 0 ? tr("Matti! Valkoinen voitti", "Checkmate! White wins", "¡Jaque mate! Ganan las blancas") : tr("Matti! Musta voitti", "Checkmate! Black wins", "¡Jaque mate! Ganan las negras");
    if (mode === "ai" && winner < 0) { rg.sound("lose"); rg.say("sk_matti_puhelin"); }
    else { rg.celebrate(width / 2, height / 2, { big: true }); rg.say(mode === "ai" ? "sk_matti_voitit" : winner > 0 ? "sk_matti_valkoinen" : "sk_matti_musta"); }
    for (const q of pieces) if (q.alive && Math.sign(q.p) === winner) anim(q, "Victory", 0.3);
    kingFalls(-winner);
    return;
  }
  if (st === "stalemate" || st === "fifty" || st === "repetition" || st === "material") {
    over = st === "stalemate" ? tr("Patti: tasapeli", "Stalemate: a draw", "Ahogado: tablas") : tr("Tasapeli", "A draw", "Tablas");
    rg.say(st === "stalemate" ? "sk_patti" : st === "repetition" ? "sk_toisto" : "sk_tasapeli");
    return;
  }
  if (st === "check") { rg.say("sk_shakki"); rg.vibrate([40, 30, 40]); say(tr("Shakki!", "Check!", "¡Jaque!")); }
  if (mode === "ai" && g.side < 0) thinkWait = 0.25;
}

function say(s: string) { msg = s; msgTime = 2; }

// the mated king falls over (and stays on the board)
function kingFalls(side: number) {
  const k = pieces.find((q) => q.alive && q.p === KING * side);
  if (k) { k.stay = true; anim(k, "Hit", 0.1); }
}

// --- the phone's move ------------------------------------------------------------

function phoneThinks(dt: number) {
  if (mode !== "ai" || over || g.side > 0 || busy()) return;
  if (!thinker) {
    thinkWait -= dt;
    if (thinkWait > 0) return;
    if (level === 0) { doMove(practiceMove()); return; }
    thinker = startThink(g, level as Level, BUDGET[level]);
  }
  if (stepThink(g, thinker, rg.random, 18)) { const m = thinker.result; thinker = null; doMove(m); }
}

// Practice: the phone plays almost at random. It takes a piece now and then
// and never sees a mate coming, so a child who attacks wins.
function practiceMove(): number {
  const ms = legalMoves(g);
  const caps = ms.filter((m) => g.b[to(m)] !== 0);
  if (caps.length && rg.random() < 0.4) return rg.pick(caps);
  return rg.pick(ms);
}

// --- help: take back, hint ------------------------------------------------------

function undo() {
  if (busy() || thinker) return;
  if (mode === "puzzle") { loadPuzzle(); return; }
  if (!g.hist.length) return;
  takeBack(g);
  if (mode === "ai" && g.side < 0 && g.hist.length) takeBack(g);
  over = "";
  syncPieces();
  rg.sound("whoosh");
}

function hint() {
  if (busy() || over || !humanTurn() || pzSolved) return;
  hintMove = mode === "puzzle" ? solution(g, pzLeft) : think(g, 2, rg.random, 3000);
  if (hintMove) { sel = -1; targets = []; rg.sound("star"); }
}

// --- puzzles ------------------------------------------------------------------------

function puzzleMove(st: string) {
  if (g.side < 0) {
    // the player moved: is it (still) a mate?
    pzLeft--;
    if (st === "mate") {
      pzSolved = true;
      rg.celebrate(width / 2, height / 2, { big: true }); rg.say("sk_matti_voitit");
      for (const q of pieces) if (q.alive && q.p > 0) anim(q, "Victory", 0.3);
      kingFalls(-1);
      rg.save("puzzle", Math.min(pz + 1, PUZZLES.length - 1));
      return;
    }
    if (pzLeft > 0 && matedWithin(g, pzLeft)) {
      // right: the other side defends as well as it can
      thinkWait = 0.4;
      return;
    }
    pzWrong = 2.2; rg.sound("wrong");
    say(st === "stalemate" ? tr("Patti! Musta ei voi liikkua mutta ei ole shakissa", "Stalemate! Black cannot move but is not in check", "¡Ahogado! Las negras no pueden moverse") : tr("Ei mattia. Yritä uudestaan!", "Not mate. Try again!", "No es mate. ¡Inténtalo otra vez!"));
    return;
  }
  // the defence was played: the player's turn again
  if (st === "check") say(tr("Shakki!", "Check!", "¡Jaque!"));
}

function puzzleDefends(dt: number) {
  if (mode !== "puzzle" || pzSolved || g.side > 0 || busy() || pzWrong > 0) return;
  thinkWait -= dt;
  if (thinkWait > 0) return;
  doMove(think(g, 3, rg.random, 6000));
}

function nextPuzzle() { pz = (pz + 1) % PUZZLES.length; rg.save("puzzle", pz); loadPuzzle(); rg.sound("click"); }

// --- the frame -----------------------------------------------------------------------

function tick(dt: number) {
  t += dt;
  if (msgTime > 0) msgTime -= dt;
  for (const q of pieces) {
    q.mixer.update(dt);
    if (q.gone > 0) q.gone += dt;
  }
  pieces = pieces.filter((q) => q.alive || q.gone < 1.6);
  if (screen !== "play") return;
  playWalks(dt);
  phoneThinks(dt);
  puzzleDefends(dt);
  if (pzWrong > 0) { pzWrong -= dt; if (pzWrong <= 0) loadPuzzle(); }
}

function squares() {
  const out = [];
  const lastM = g.hist.length ? g.hist[g.hist.length - 1].m : 0;
  const blink = Math.sin(t * 8) > 0;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = r * 16 + f;
    const s = spot(sq);
    const dark = (f + r) % 2 === 0;
    let color = dark ? "#8a5a3b" : "#e8cf9c";
    if (lastM && (from(lastM) === sq || to(lastM) === sq)) color = dark ? "#a7894a" : "#f3e7a2";
    if (hintMove && blink && (from(hintMove) === sq || to(hintMove) === sq)) color = "#5fd3ff";
    if (sq === sel) color = "#ffd23f";
    else if (targets.indexOf(sq) >= 0) {
      const takes = g.b[sq] !== 0 || (Math.abs(g.b[sel]) === PAWN && fileOf(sq) !== fileOf(sel));
      color = takes ? "#ff6b6b" : "#7bd389";
    }
    const king = g.b[sq] === KING * g.side && inCheckNow;
    if (king) color = "#ff3b3b";
    out.push(
      <mesh key={"s" + sq} name={"sq" + sq} position={[s.x, -0.1, s.z]} onClick={() => tapSquare(sq)}>
        <boxGeometry args={[1, 0.2, 1]} />
        <meshLambertMaterial color={color} />
      </mesh>
    );
  }
  return out;
}

let inCheckNow = false;

function world() {
  inCheckNow = screen === "play" && !busy() && inCheck(g, g.side);
  return (
    <scene3d>
      <color attach="background" args={["#9fd3ff"]} />
      <fog attach="fog" args={["#9fd3ff", 40, 90]} />
      <perspectiveCamera position={[0, 19, 9]} fov={40} lookAt={[0, 0, 0.6]} />
      <orbitControls target={[0, 0, 0.9]} minDistance={8} maxDistance={30} minPolarAngle={0.2} maxPolarAngle={1.2} enablePan={false} autoRotate={screen !== "play"} autoRotateSpeed={1.2} />
      <hemisphereLight args={["#ffffff", "#8a6e4b", 0.55]} />
      <directionalLight position={[3, 9, 5]} intensity={1.05} />
      <mesh name="frame" position={[0, -0.32, 0]} renderOrder={-1}>
        <boxGeometry args={[8.36, 0.3, 8.36]} />
        <meshLambertMaterial color="#5b3a24" />
      </mesh>
      <mesh name="grass" position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-2}>
        <circleGeometry args={[22, 24]} />
        <meshLambertMaterial color="#6fbf5f" />
      </mesh>
      {squares()}
      {pieces.map((q) => (
        <primitive key={"p" + q.id} name={"p" + q.id} object={q.model} position={[q.x, q.gone > 0 ? -q.gone * 0.35 : 0, q.z]}
          rotation={[0, q.ry, 0]} scale={SCALE[Math.abs(q.p)]} onClick={() => tapSquare(q.sq)} />
      ))}
    </scene3d>
  );
}

function topText(): string {
  if (mode === "puzzle") {
    if (pzSolved) return tr("Matti! Hienoa!", "Checkmate! Well done!", "¡Jaque mate! ¡Muy bien!");
    const P = PUZZLES[pz];
    return tr("Pulma ", "Puzzle ", "Problema ") + (pz + 1) + "/" + PUZZLES.length + " · " +
      (P.n === 1 ? tr("matti 1 siirrolla", "mate in 1", "mate en 1") : tr("matti 2 siirrolla", "mate in 2", "mate en 2"));
  }
  if (over) return over;
  if (mode === "ai") return g.side > 0 ? tr("Sinun vuorosi", "Your turn", "Tu turno") : tr("Puhelin miettii…", "The phone is thinking…", "El teléfono piensa…");
  return g.side > 0 ? tr("Valkoisen vuoro", "White's turn", "Turno de las blancas") : tr("Mustan vuoro", "Black's turn", "Turno de las negras");
}

function view() {
  return (
    <div class="screen">
      {world()}
      {screen === "play" && (
        <div class="top">
          <div class="turn">
            <div class={"dot " + ((over || pzSolved) && inCheck(g, g.side) ? (g.side > 0 ? "black" : "white") : g.side > 0 ? "white" : "black")} />
            <div class="ttext">{topText()}</div>
          </div>
        </div>
      )}
      {screen === "play" && msgTime > 0 && <div class="msgbox"><div class="msg">{msg}</div></div>}
      {screen === "play" && (
        <div class="bar">
          <div class="tool" onClick={() => { screen = "menu"; thinker = null; rg.sound("click"); }}>☰</div>
          {mode === "puzzle" && pzSolved ? (
            <div class="tool wide go" onClick={nextPuzzle}>{tr("Seuraava ▶", "Next ▶", "Siguiente ▶")}</div>
          ) : (
            <div class="tool wide" onClick={hint}>{"💡 " + tr("Vihje", "Hint", "Pista")}</div>
          )}
          <div class="tool wide" onClick={undo}>{mode === "puzzle" ? "↻ " + tr("Alusta", "Restart", "Reiniciar") : "↶ " + tr("Peru", "Undo", "Deshacer")}</div>
        </div>
      )}
      {screen === "play" && over && (
        <div class="over">
          <div class="btn again" onClick={() => startGame(mode)}>{tr("Uusi peli", "New game", "Nueva partida")}</div>
        </div>
      )}
      {screen === "menu" && (
        <div class="menu">
          <div class="panel">
          <div class="title">Nappulasota</div>
          <div class="hint">{tr("Shakkia lelusotilailla. Napauta omaa nappulaa ja sitten vihreää ruutua.", "Chess with toy soldiers. Tap one of yours, then a green square.", "Ajedrez con soldaditos. Toca una pieza tuya y luego una casilla verde.")}</div>
          </div>
          <div class="btn" onClick={() => { screen = "level"; rg.sound("click"); }}>{"🤖 " + tr("Puhelinta vastaan", "Against the phone", "Contra el teléfono")}</div>
          <div class="btn alt" onClick={() => startGame("two")}>{"👫 " + tr("Kaksi pelaajaa", "Two players", "Dos jugadores")}</div>
          <div class="btn puz" onClick={() => startGame("puzzle")}>{"🧩 " + tr("Shakkipulmat", "Chess puzzles", "Problemas")}</div>
        </div>
      )}
      {screen === "level" && (
        <div class="menu">
          <div class="panel"><div class="title">{tr("Taso", "Level", "Nivel")}</div></div>
          {LEVELS.map((L, i) => (
            <div class={"btn lv" + i} onClick={() => { level = i; rg.save("level", i); startGame("ai"); }}>{tr(L[0], L[1], L[2]) + (i === level ? " ✓" : "")}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function init() {
  // the title screen: the starting position, turning slowly
  g = newGame();
  syncPieces();
}
