// Nappulasota: toy soldiers on a 5 × 5 board in 3D. Tap one of yours, then
// a square next to it: it turns and walks there. On an enemy's square it
// swings its sword; when the blow lands (the "osuma" marker of the Attack
// clip) the enemy flinches and falls. Take all of theirs to win. Against the
// phone or a friend on the same phone. Turn the board with a finger (orbit).
//
// Written with three.js's names as React Three Fiber does: the world is JSX
// in <scene3d>, the soldiers are a glTF model (models/, made by
// tools/three/make-soldier.mjs) played by THREE.AnimationMixer with
// crossfades, and a tap on a soldier or a square is its onClick.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

type Side = "w" | "b";
type Piece = {
  id: string; side: Side; c: number; r: number;
  x: number; z: number; ry: number;
  model: any; mixer: any; act: any; cur: string;
  alive: boolean; gone: number;
};
type Mode = "title" | "play" | "over";

const N = 5;
const WALK = 1.3;                 // squares a second
const loader = new GLTFLoader();
const MODELS: any = { w: loader.loadSync("models/sotilas-valkoinen.glb"), b: loader.loadSync("models/sotilas-musta.glb") };

let mode: Mode = "title";
let players = 1;
let turn: Side = "w";
let pieces: Piece[] = [];
let sel: Piece | null = null;
let busy = false;                 // a move is being played
let winner: Side | null = null;
let aiWait = 0;
// the move being played: walk (to the square, or up to the enemy), fight, then the rest of the walk
let plan: any = null;

const sq = (c: number, r: number) => ({ x: c - 2, z: r - 2 });
const at = (c: number, r: number) => pieces.find((p) => p.alive && p.c === c && p.r === r) || null;
const other = (s: Side): Side => (s === "w" ? "b" : "w");

function makePiece(side: Side, c: number, r: number, i: number): Piece {
  const model = MODELS[side].scene.clone();
  const mixer = new THREE.AnimationMixer(model);
  const act: any = {};
  for (const clip of MODELS[side].animations) act[clip.name] = mixer.clipAction(clip);
  for (const n of ["Attack", "Hit", "Death", "Victory"]) { act[n].setLoop(THREE.LoopOnce, 1); act[n].clampWhenFinished = true; }
  act.Attack.addMarker("osuma", 0.5);
  act.Idle.play();
  act.Idle.time = (i * 0.37) % 2;   // not all breathing in step
  const p = sq(c, r);
  const piece: Piece = { id: side + i, side, c, r, x: p.x, z: p.z, ry: side === "w" ? Math.PI : 0, model, mixer, act, cur: "Idle", alive: true, gone: 0 };
  mixer.addEventListener("marker", (e: any) => { if (e.name === "osuma") blowLands(piece); });
  mixer.addEventListener("finished", (e: any) => finished(piece, e.action));
  return piece;
}

// crossfade to another clip (three.js: reset().fadeIn() + crossFadeFrom)
function play(p: Piece, name: string, fade = 0.2) {
  if (p.cur === name) return;
  const from = p.act[p.cur], to = p.act[name];
  to.reset().play();
  to.crossFadeFrom(from, fade);
  p.cur = name;
}

function start(n: number) {
  players = n;
  pieces = [];
  for (let i = 0; i < 3; i++) {
    pieces.push(makePiece("w", 1 + i, 4, i));
    pieces.push(makePiece("b", 1 + i, 0, i));
  }
  turn = "w"; sel = null; busy = false; winner = null; plan = null; aiWait = 0;
  mode = "play";
  rg.orbit.reset();      // back to the camera's own view after the title's turning
  rg.sound("click");
}

function moves(p: Piece): { c: number; r: number }[] {
  const out = [];
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
    if (!dc && !dr) continue;
    const c = p.c + dc, r = p.r + dr;
    if (c < 0 || r < 0 || c >= N || r >= N) continue;
    const o = at(c, r);
    if (o && o.side === p.side) continue;
    out.push({ c, r });
  }
  return out;
}

function tapPiece(p: Piece) {
  if (mode !== "play" || busy || !isHuman(turn)) return;
  if (p.side === turn) { sel = p; rg.sound("pop"); rg.vibrate(15); return; }
  if (sel && moves(sel).some((m) => m.c === p.c && m.r === p.r)) go(sel, p.c, p.r);
}

function tapSquare(c: number, r: number) {
  if (mode !== "play" || busy || !sel || !isHuman(turn)) return;
  const o = at(c, r);
  if (o && o.side === turn) { sel = o; rg.sound("pop"); return; }
  if (moves(sel).some((m) => m.c === c && m.r === r)) go(sel, c, r);
  else rg.sound("wrong");
}

const isHuman = (s: Side) => players === 2 || s === "w";

function go(p: Piece, c: number, r: number) {
  const target = at(c, r);
  const to = sq(c, r);
  busy = true; sel = null;
  p.ry = Math.atan2(to.x - p.x, to.z - p.z);
  // to an enemy: stop a little short, fight, then step onto the square
  const k = target ? 0.45 : 1;
  plan = { p, target, c, r, stop: { x: p.x + (to.x - p.x) * k, z: p.z + (to.z - p.z) * k }, end: to, phase: "walk" };
  play(p, "Walk");
  rg.sound("whoosh", { volume: 0.4 });
}

function blowLands(attacker: Piece) {
  if (!plan || plan.p !== attacker || !plan.target) return;
  const t = plan.target;
  rg.sound("hit"); rg.vibrate([20, 30, 40]);
  t.ry = Math.atan2(attacker.x - t.x, attacker.z - t.z);
  play(t, "Hit", 0.08);
}

function finished(p: Piece, action: any) {
  const name = action.getClip().name;
  if (name === "Hit") { play(p, "Death", 0.1); rg.sound("lose", { volume: 0.5 }); }
  else if (name === "Death") { p.alive = false; p.gone = 0.001; }
  else if (name === "Attack" && plan && plan.p === p) { plan.phase = "wait"; }
}

function stepToward(p: Piece, goal: { x: number; z: number }, dt: number): boolean {
  const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz), s = WALK * dt;
  if (d <= s) { p.x = goal.x; p.z = goal.z; return true; }
  p.x += dx / d * s; p.z += dz / d * s;
  return false;
}

function playPlan(dt: number) {
  const pl = plan;
  if (!pl) return;
  const p: Piece = pl.p;
  if (pl.phase === "walk" && stepToward(p, pl.stop, dt)) {
    if (pl.target) { pl.phase = "fight"; play(p, "Attack", 0.15); }
    else pl.phase = "done";
  } else if (pl.phase === "wait" && (!pl.target.alive || pl.target.gone)) {
    // the enemy is down: the rest of the way
    pl.phase = "walk2"; play(p, "Walk");
  } else if (pl.phase === "walk2" && stepToward(p, pl.end, dt)) {
    pl.phase = "done";
  }
  if (pl.phase === "done") {
    p.c = pl.c; p.r = pl.r;
    play(p, "Idle", 0.3);
    plan = null; busy = false;
    const left = pieces.filter((q) => q.alive && q.side === other(p.side));
    if (!left.length) { win(p.side); return; }
    turn = other(turn);
    aiWait = 0.5;
  }
}

function win(s: Side) {
  winner = s; mode = "over";
  for (const q of pieces) if (q.alive && q.side === s) play(q, "Victory", 0.3);
  rg.celebrate(width / 2, height / 2, { big: true });
}

// the phone: a capture if it can, else a step towards the nearest white
function aiMove() {
  const mine = pieces.filter((p) => p.alive && p.side === "b");
  const foes = pieces.filter((p) => p.alive && p.side === "w");
  let best: any = null, bestScore = -1e9;
  for (const p of mine) for (const m of moves(p)) {
    const t = at(m.c, m.r);
    let score = t ? 100 : 0;
    const near = Math.min(...foes.map((f) => Math.max(Math.abs(f.c - m.c), Math.abs(f.r - m.r))));
    score -= near * 3;
    // a square a white soldier could take next turn is risky
    if (foes.some((f) => Math.max(Math.abs(f.c - m.c), Math.abs(f.r - m.r)) === 1)) score -= t ? 20 : 8;
    score += rg.random() * 4;
    if (score > bestScore) { bestScore = score; best = { p, m }; }
  }
  if (best) go(best.p, best.m.c, best.m.r);
  else turn = other(turn);
}

function tick(dt: number) {
  for (const p of pieces) {
    p.mixer.update(dt);
    if (p.gone > 0) p.gone += dt;
  }
  if (mode === "play") {
    playPlan(dt);
    if (!busy && !isHuman(turn)) { aiWait -= dt; if (aiWait <= 0) aiMove(); }
  }
  // the fallen sink into the board
  pieces = pieces.filter((p) => p.alive || p.gone < 1.6);
}

function board() {
  const out = [];
  const hint = sel ? moves(sel) : [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const p = sq(c, r);
    const lit = hint.some((m) => m.c === c && m.r === r);
    const isSel = sel && sel.c === c && sel.r === r;
    const dark = (c + r) % 2 === 1;
    const color = isSel ? "#ffd23f" : lit ? (at(c, r) ? "#ff6b6b" : "#7bd389") : dark ? "#8a5a3b" : "#e9d3a6";
    out.push(
      <mesh key={"s" + c + r} name={"sq" + c + r} position={[p.x, -0.1, p.z]} onClick={() => tapSquare(c, r)}>
        <boxGeometry args={[1, 0.2, 1]} />
        <meshLambertMaterial color={color} />
      </mesh>
    );
  }
  return out;
}

function view() {
  const world = (
    <scene3d>
      <color attach="background" args={["#9fd3ff"]} />
      <fog attach="fog" args={["#9fd3ff", 14, 40]} />
      <perspectiveCamera position={[0, 9, 8.6]} fov={42} lookAt={[0, 0, 0.3]} />
      <orbitControls target={[0, 0, 0.3]} minDistance={5} maxDistance={13} minPolarAngle={0.35} maxPolarAngle={1.25} enablePan={false} autoRotate={mode === "title"} autoRotateSpeed={1.5} />
      <hemisphereLight args={["#ffffff", "#8a6e4b", 0.55]} />
      <directionalLight position={[3, 7, 4]} intensity={1.05} />
      <mesh name="frame" position={[0, -0.32, 0]} renderOrder={-1}>
        <boxGeometry args={[5.6, 0.3, 5.6]} />
        <meshLambertMaterial color="#5b3a24" />
      </mesh>
      <mesh name="grass" position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-2}>
        <circleGeometry args={[14, 24]} />
        <meshLambertMaterial color="#6fbf5f" />
      </mesh>
      {board()}
      {pieces.map((p) => (
        <primitive key={p.id} name={p.id} object={p.model} position={[p.x, p.gone > 0 ? -p.gone * 0.4 : 0, p.z]}
          rotation={[0, p.ry, 0]} scale={0.7} onClick={() => tapPiece(p)} />
      ))}
    </scene3d>
  );
  const w = pieces.filter((p) => p.alive && p.side === "w").length;
  const b = pieces.filter((p) => p.alive && p.side === "b").length;
  return (
    <div class="screen">
      {world}
      {mode !== "title" && (
        <div class="top">
          <div class="turn">
            <div class={"dot " + (turn === "w" ? "white" : "black")} />
            <div class="ttext">{mode === "over" ? (winner === "w" ? "Valkoiset voittivat!" : "Mustat voittivat!") : turn === "w" ? "Valkoisen vuoro" : players === 1 ? "Puhelin miettii…" : "Mustan vuoro"}</div>
          </div>
        </div>
      )}
      {mode === "play" && (
        <div class="count">
          <div class="pill">{[0, 1, 2].map((i) => <div class={"mini " + (i < w ? "white" : "")} />)}</div>
          <div class="pill">{[0, 1, 2].map((i) => <div class={"mini " + (i < b ? "black" : "")} />)}</div>
        </div>
      )}
      {mode === "title" && (
        <div class="menu">
          <div class="title">Nappulasota</div>
          <div class="hint">Napauta omaa sotilasta ja sitten vihreää ruutua. Punaisella ruudulla on vastustaja!</div>
          <div class="btn" onClick={() => start(1)}>🤖 Puhelinta vastaan</div>
          <div class="btn alt" onClick={() => start(2)}>👫 Kaksi pelaajaa</div>
        </div>
      )}
      {mode === "over" && (
        <div class="over">
          <div class="btn again" onClick={() => start(players)}>Uudestaan</div>
        </div>
      )}
    </div>
  );
}

function init() {
  // the title screen: a soldier from each side already on the board
  pieces = [makePiece("w", 2, 3, 0), makePiece("b", 2, 1, 1)];
  pieces[0].act.Idle.stop(); pieces[0].act.Victory.setLoop(THREE.LoopRepeat, Infinity).play(); pieces[0].cur = "Victory";
}
