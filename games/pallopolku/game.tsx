// Pallopolku: a ball rolls down an endless road in 3D. Tap the left or right
// side to change lane, swipe up (or tap the ball) to jump. Stars are points;
// a crate costs a heart. The 3D is the engine's own rg.three scene, drawn
// under this 2D view, so it runs the same on the phone and the web.

type Mode = "title" | "play" | "over";
type Thing = { id: string; kind: "star" | "crate"; lane: number; z: number; got: number };

const LANES = [-1.6, 0, 1.6];
const TILE = 4;
const TILES = 16;
const TREES = 12;
const R = 0.45;
const CRATE_COLORS = ["#e63946", "#457b9d", "#f4a261", "#8e44ad"];

let mode: Mode = "title";
let t = 0;
let clock = 0;
let z = 0;               // the ball's position along the road (goes negative)
let speed = 8;
let lane = 1;
let x = 0;               // the ball's x, easing towards its lane
let y = R;
let vy = 0;
let roll = 0;
let hearts = 3;
let hurt = -10;
let stars = 0;
let best = 0;
let things: Thing[] = [];
let nextRow = -24;
let nextId = 0;
let tileZ: number[] = [];
let treeZ: number[] = [];
let downAt = { x: 0, y: 0, t: 0 };

function init() {
  best = rg.load("best", 0);
  build();
}

function build() {
  rg.three("clear");
  rg.three("scene", { background: ["#6ec6ff", "#d8f1ff"], fog: [14, 46], fogColor: "#d8f1ff", ground: { y: -0.2, color: "#7bc950" } });
  rg.three("light", { id: "sun", type: "directional", x: 3, y: 6, z: 2, intensity: 0.6 });
  rg.three("light", { id: "ambient", type: "ambient", intensity: 0.48 });
  tileZ = [];
  for (let i = 0; i < TILES; i++) {
    tileZ.push(-i * TILE);
    rg.three("add", { id: "tile" + i, shape: "box", size: [5.2, 0.2, TILE], color: i % 2 ? "#f2e8cf" : "#e9d8a6", x: 0, y: -0.1, z: -i * TILE, layer: -1 });
    rg.three("add", { id: "edgeL" + i, shape: "box", size: [0.3, 0.35, TILE], color: i % 2 ? "#ffffff" : "#e63946", x: -2.75, y: 0, z: -i * TILE });
    rg.three("add", { id: "edgeR" + i, shape: "box", size: [0.3, 0.35, TILE], color: i % 2 ? "#e63946" : "#ffffff", x: 2.75, y: 0, z: -i * TILE });
  }
  treeZ = [];
  for (let i = 0; i < TREES; i++) {
    const side = i % 2 ? 1 : -1;
    const tz = -i * 5.5 - rg.random() * 2;
    const tx = side * (4.2 + rg.random() * 2.5);
    treeZ.push(tz);
    rg.three("add", { id: "trunk" + i, shape: "cylinder", size: [0.18, 0.22, 1], detail: 6, color: "#8d5524", x: tx, y: 0.3, z: tz });
    rg.three("add", { id: "crown" + i, shape: "cone", size: [0.9, 1.9], detail: 7, color: i % 3 ? "#2d6a4f" : "#40916c", x: tx, y: 1.6, z: tz });
  }
  rg.three("add", { id: "ball", shape: "sphere", size: [R], detail: 12, color: "#ff006e", x: 0, y: R, z: 0 });
  rg.three("add", { id: "band", shape: "torus", size: [R * 1.0, 0.09], detail: 12, color: "#ffbe0b", x: 0, y: R, z: 0, ry: Math.PI / 2 });
  rg.three("add", { id: "shadow", shape: "cylinder", size: [R * 0.9, R * 0.9, 0.01], detail: 10, color: "#b8a98a", x: 0, y: 0.005, z: 0, layer: -1 });
  camera();
}

function reset() {
  for (const th of things) rg.three("remove", { id: th.id });
  things = [];
  z = 0; speed = 8; lane = 1; x = 0; y = R; vy = 0; hearts = 3; hurt = -10; stars = 0; nextRow = -24;
  for (let i = 0; i < TILES; i++) { tileZ[i] = -i * TILE; place("tile", i); }
}

function place(kind: string, i: number) {
  if (kind === "tile") {
    rg.three("set", { id: "tile" + i, z: tileZ[i] });
    rg.three("set", { id: "edgeL" + i, z: tileZ[i] });
    rg.three("set", { id: "edgeR" + i, z: tileZ[i] });
  } else {
    rg.three("set", { id: "trunk" + i, z: treeZ[i] });
    rg.three("set", { id: "crown" + i, z: treeZ[i] });
  }
}

function camera() {
  rg.three("camera", { x: x * 0.5, y: 3.1, z: z + 5.6, lookAt: [x * 0.6, 0.5, z - 6], fov: 60 });
}

function spawnRow(at: number) {
  const r = rg.random();
  const crateLane = Math.floor(rg.random() * 3);
  if (r < 0.55 + Math.min(0.3, -z / 2000)) {
    const id = "o" + nextId++;
    things.push({ id, kind: "crate", lane: crateLane, z: at, got: 0 });
    rg.three("add", { id, shape: "box", size: [1.1, 1.1, 1.1], color: rg.pick(CRATE_COLORS), x: LANES[crateLane], y: 0.55, z: at, ry: rg.random() * 0.4 - 0.2 });
  }
  if (rg.random() < 0.7) {
    let sl = Math.floor(rg.random() * 3);
    if (sl === crateLane) sl = (sl + 1 + Math.floor(rg.random() * 2)) % 3;
    for (let k = 0; k < 3; k++) {
      const id = "o" + nextId++;
      things.push({ id, kind: "star", lane: sl, z: at - k * 1.6, got: 0 });
      rg.three("add", { id, shape: "star", size: [0.42, 0.16], color: "#ffd60a", emissive: true, x: LANES[sl], y: 0.9, z: at - k * 1.6 });
    }
  }
}

function jump() {
  if (y <= R + 0.01 && mode === "play") { vy = 7.5; rg.sound("jump"); }
}

function steer(d: number) {
  if (mode !== "play") return;
  const n = Math.max(0, Math.min(2, lane + d));
  if (n !== lane) { lane = n; rg.sound("whoosh", { volume: 0.4 }); }
}

function start() {
  reset();
  mode = "play";
  clock = 0;
  rg.sound("click");
  rg.music("chase", { volume: 0.5 });
}

function onPointerDown(px: number, py: number) {
  downAt = { x: px, y: py, t };
  if (mode === "title") start();
  else if (mode === "over" && clock > 1) start();
}

function onPointerUp(px: number, py: number) {
  if (mode !== "play") return;
  const dx = px - downAt.x, dy = py - downAt.y;
  if (dy < -35 && Math.abs(dy) > Math.abs(dx)) jump();
  else if (Math.abs(dx) > 35) steer(dx > 0 ? 1 : -1);
  else if (Math.abs(px - width / 2) < 50 && py > height * 0.5) jump();
  else steer(px < width / 2 ? -1 : 1);
}

function onKeyDown(key: string) {
  if (key === "ArrowLeft" || key === "a") steer(-1);
  else if (key === "ArrowRight" || key === "d") steer(1);
  else if (key === "ArrowUp" || key === " " || key === "w") { if (mode === "play") jump(); else onPointerDown(0, 0); }
}

function onBack() {
  if (mode === "play") { mode = "title"; rg.stopMusic(); } else rg.exit();
}

function tick(dt: number) {
  t += dt;
  clock += dt;
  for (const th of things) if (th.kind === "star" && !th.got) rg.three("set", { id: th.id, ry: t * 3 + th.z });
  if (mode !== "play") { camera(); return; }

  speed = Math.min(18, speed + dt * 0.15);
  z -= speed * dt;
  x += (LANES[lane] - x) * Math.min(1, dt * 12);
  vy -= 22 * dt;
  y = Math.max(R, y + vy * dt);
  if (y === R) vy = 0;
  roll -= speed * dt / R;
  const blink = t - hurt < 1.2 && Math.floor(t * 12) % 2 === 0;
  rg.three("set", { id: "ball", x, y, z, rx: roll, visible: !blink });
  rg.three("set", { id: "band", x, y, z, rx: roll, visible: !blink });
  const sh = Math.max(0.4, 1 - (y - R) * 0.4);
  rg.three("set", { id: "shadow", x, z, sx: sh, sz: sh });
  camera();

  // recycle the road and the trees that are behind the camera
  for (let i = 0; i < TILES; i++) if (tileZ[i] > z + 8) { tileZ[i] -= TILES * TILE; place("tile", i); }
  for (let i = 0; i < TREES; i++) if (treeZ[i] > z + 8) { treeZ[i] -= TREES * 5.5; place("tree", i); }
  while (nextRow > z - 46) { spawnRow(nextRow); nextRow -= 7 + rg.random() * 5; }

  for (const th of things) {
    if (th.got || Math.abs(th.z - z) > 0.75 || Math.abs(LANES[th.lane] - x) > 0.8) continue;
    if (th.kind === "star") {
      th.got = t;
      stars++;
      rg.three("remove", { id: th.id });
      if (stars % 10 === 0) rg.celebrate(width / 2, height * 0.4, { big: true });
      else { rg.celebrate(width / 2 + (x / 1.6) * 70, height * 0.62, { count: 10, sound: false }); rg.sound("coin"); }
    } else if (y < 1.15 && t - hurt > 1.2) {
      th.got = t;
      hurt = t;
      hearts--;
      rg.three("remove", { id: th.id });
      rg.sound("hit");
      rg.vibrate(120);
      speed = Math.max(8, speed - 3);
      if (hearts <= 0) {
        mode = "over";
        clock = 0;
        rg.stopMusic();
        if (stars > best) { best = stars; rg.save("best", best); rg.celebrate(width / 2, height * 0.35, { big: true, sound: false }); }
        rg.sound("lose");
      }
    }
  }
  const keep: Thing[] = [];
  for (const th of things) {
    if (th.z > z + 7 && !th.got) rg.three("remove", { id: th.id });
    else if (!th.got) keep.push(th);
  }
  things = keep;
}

function view() {
  const heartRow = [];
  for (let i = 0; i < 3; i++) heartRow.push(<div className={i < hearts ? "heart" : "heart off"}>❤️</div>);
  return (
    <div className="screen">
      {mode === "play" ? (
        <div className="hud">
          <div className="pill">⭐ {stars}</div>
          <div className="pill">{heartRow}</div>
        </div>
      ) : null}
      {mode === "title" ? (
        <div className="overlay">
          <div className="big">Pallopolku</div>
          <div className="hintrow"><div className="hintbox">👈</div><div className="hintbox">👆</div><div className="hintbox">👉</div></div>
          <div className="go">Napauta ja aloita!</div>
          {best > 0 ? <div className="hint">Ennätys: ⭐ {best}</div> : null}
        </div>
      ) : null}
      {mode === "over" ? (
        <div className="overlay">
          <div className="big">Hienosti!</div>
          <div className="result">⭐ {stars}</div>
          <div className="hint">Ennätys: ⭐ {best}</div>
          {clock > 1 ? <div className="go">Uudestaan!</div> : null}
        </div>
      ) : null}
    </div>
  );
}
