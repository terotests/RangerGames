// VR-testi: a test of the engine's VR (rg.xr, docs/vr.md). Balls float
// around the player; point at one (a finger, or a VR controller's ray and
// its trigger) and it pops into a new place. "VR" asks for a headset
// session (Meta Quest: the app or the Quest browser), "Pahvilasit" draws
// both eyes side by side for a phone in a cardboard viewer (turn the phone
// to look around). In VR the buttons float on a panel in front of you.
const COLORS = ["#ff5a5f", "#ffcf33", "#3ddc97", "#4dabf7", "#b197fc", "#ff922b"];
type Ball = { id: number; x: number; y: number; z: number; c: string; pop: number };

let balls: Ball[] = [];
let score = 0;
let note = "";
let seed = 7;
function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

function place(b: Ball) {
  // anywhere around the player, 2.5–6 m away, from knee to well above the head
  const a = rnd() * Math.PI * 2, d = 2.5 + rnd() * 3.5;
  b.x = Math.sin(a) * d;
  b.z = -Math.cos(a) * d;
  b.y = 0.6 + rnd() * 2.4;
  b.c = COLORS[Math.floor(rnd() * COLORS.length)];
}
for (let i = 0; i < 10; i++) { const b = { id: i, x: 0, y: 0, z: 0, c: "", pop: 0 }; place(b); balls.push(b); }

function pop(id: number) {
  const b = balls[id];
  if (!b || b.pop > 0) return;
  b.pop = 0.25;
  score++;
  rg.sound("pop");
  rg.vibrate(30);
  rg.xr.pulse("both", 0.7, 50);
}

function onXR(e: any) {
  if (e.type === "start") note = e.mode === "stereo" ? "Pahvilasit päällä" : "VR päällä";
  else if (e.type === "end") note = "";
  else if (e.type === "error") note = "VR ei onnistunut: " + e.reason;
  else if (e.type === "button" && e.down && (e.button === "a" || e.button === "menu")) rg.xr.recenter();
}

function tick(dt: number) {
  for (const b of balls) {
    if (b.pop > 0) {
      b.pop -= dt;
      if (b.pop <= 0) { b.pop = 0; place(b); }
    }
  }
}

function view() {
  const s = rg.xr.state;
  const on = s.running;
  const hands = (s.hands || []).length;
  return (
    <div class="screen">
      <scene3d>
        <color attach="background" args={["#7ec8ff"]} />
        <fog attach="fog" args={["#9fd6ff", 8, 30]} />
        <perspectiveCamera position={[0, 1.6, 0]} fov={70} lookAt={[0, 1.4, -4]} />
        <hemisphereLight args={["#ffffff", "#5a7a3a", 0.7]} />
        <directionalLight position={[3, 8, 2]} intensity={0.9} />
        <mesh name="ground" position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[30, 40]} />
          <meshLambertMaterial color="#6fbf4a" />
        </mesh>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <mesh name={"post" + i} position={[Math.sin(i * 0.785) * 9, 1, -Math.cos(i * 0.785) * 9]}>
            <cylinderGeometry args={[0.25, 0.3, 2, 10]} />
            <meshLambertMaterial color="#b07a4a" />
          </mesh>
        ))}
        {balls.map((b) => (
          <mesh name={"b" + b.id} position={[b.x, b.y, b.z]} scale={b.pop > 0 ? 1 + (0.25 - b.pop) * 4 : 1} onClick={() => pop(b.id)}>
            <sphereGeometry args={[0.35, 20, 12]} />
            <meshStandardMaterial color={b.c} emissive={b.pop > 0 ? "#ffffff" : "#000000"} />
          </mesh>
        ))}
      </scene3d>
      <div class="title">VR-testi</div>
      <div class="info">{note || (on ? "Osoita palloa ja paina liipaisinta" : "Napauta palloja. VR: lasit päähän")}</div>
      <div class="score">{score}</div>
      <div class="hud">
        <div class="status">{on ? "Tila: " + s.mode + (s.headset ? ", ohjaimia " + hands : "") : (s.vr ? "VR-lasit löytyivät" : "Ei VR-laseja: kokeile pahvilaseja")}</div>
        <div class="row">
          <div id="vr" class={s.vr ? "btn" : "btn off"} onClick={() => rg.xr.enter("vr")}>VR</div>
          <div id="stereo" class="btn" onClick={() => rg.xr.enter("stereo", { fov: 85, panel: false })}>Pahvilasit</div>
        </div>
        <div class="row">
          <div id="center" class="btn off" onClick={() => rg.xr.recenter()}>Keskitä</div>
          <div id="exit" class="btn exit" onClick={() => rg.xr.exit()}>Poistu VR</div>
        </div>
      </div>
    </div>
  );
}
