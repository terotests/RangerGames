// Hahmostudio: the Cat Federation officer of Trade Frontier, drawn with the
// engine's toon shading (crates/rg_engine/src/fiber.rs `Toon`: sharp light
// bands, a violet shadow, rim light, highlights on metal, eyes and gems, and
// an outline). The model is ours; it is built from the character's data in the
// private Trade Frontier repository (characters/cat/make-cat.mjs writes
// models/cat.glb here) and is not part of this repository. Without it the
// studio says so.
//
// Its clips are in three groups that play at once, each on its own bones:
// one body clip at a time (cross-faded), Talk (the jaw) and Blink (the eyes)
// over it, and Tail (tail and ears) always.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

let gltf: any = null;
let sketchGltf: any = null;
try {
  gltf = new GLTFLoader().loadSync("models/cat.glb");
  sketchGltf = new GLTFLoader().loadSync("models/cat-sketch.glb");
} catch (e) {
  gltf = null;
}
const HAVE = !!gltf;
if (!HAVE) { gltf = { scene: null, animations: [] }; sketchGltf = gltf; }
const cat = gltf.scene;
const mixer: any = HAVE ? new THREE.AnimationMixer(cat) : null;
const act: any = {};
if (HAVE) for (const clip of gltf.animations) act[clip.name] = mixer.clipAction(clip);
// the construction sketch (thin lines on the same skeleton, make-cat.mjs
// sketch()): its own model and mixer, driven by the same actions as the cat
const sketchModel = sketchGltf.scene;
const mixer2: any = HAVE ? new THREE.AnimationMixer(sketchModel) : null;
const act2: any = {};
if (HAVE) for (const clip of sketchGltf.animations) act2[clip.name] = mixer2.clipAction(clip);
if (HAVE) for (const A of [act, act2]) for (const n of ["Nod", "Bow", "Blink"]) { A[n].setLoop(THREE.LoopOnce, 1); A[n].clampWhenFinished = n !== "Blink"; }

const tr = (fi: string, en: string, es: string) => rg.t(fi, en, es);
const POSES = [
  ["Idle", "Lepo", "Idle", "Reposo"],
  ["Still", "Perusasento", "Bind pose", "Pose base"],
  ["Wave", "Heilutus", "Wave", "Saludo"],
  ["Explain", "Selitys", "Explain", "Explica"],
  ["Think", "Ajattelu", "Think", "Piensa"],
  ["ArmsCrossed", "Kädet ristissä", "Arms crossed", "Brazos cruzados"],
  ["Point", "Osoitus", "Point", "Señala"],
  ["Nod", "Nyökkäys", "Nod", "Asiente"],
  ["Bow", "Kumarrus", "Bow", "Reverencia"],
  ["Mo:walk", "Kävely", "Walk", "Caminar"],
  ["Mo:walk-formal", "Juhlava kävely", "Formal walk", "Paseo formal"],
  ["Mo:walk-mocap", "Kävely (mocap)", "Walk (mocap)", "Caminar (mocap)"],
  ["Mo:talk", "Puhe-eleet", "Talking", "Hablando"],
];

const FACES = [
  ["Neutral", "😐", "Neutraali", "Neutral", "Neutral"],
  ["Smile", "🙂", "Ystävällinen", "Friendly", "Amable"],
  ["Determined", "😠", "Päättäväinen", "Determined", "Decidida"],
  ["Worried", "😟", "Huolestunut", "Worried", "Preocupada"],
  ["Surprised", "😮", "Yllättynyt", "Surprised", "Sorprendida"],
];

let body = "";
let face = "";
let talking = false;
let toon = true;
let sketchMode = 0;         // 0: the character, 1: the sketch over it, 2: the sketch alone
let close = false;          // the camera on the face
let clean = false;          // tap the title: only the character, for screenshots and comparisons
let reorbit = 0;            // frames left to put the orbit camera back to its props
let blinkIn = 2;
let t = 0;

function pose(name: string, fade = 0.35) {
  if (!HAVE) return;
  for (const A of [act, act2]) {
    const old = body ? A[body] : null;
    const a = A[name];
    a.reset().play();
    if (old && old !== a) a.crossFadeFrom(old, fade); else if (fade > 0) a.fadeIn(fade);
  }
  body = name;
}

function expression(name: string) {
  if (!HAVE || face === name) return;
  for (const A of [act, act2]) {
    const old = face ? A["Face" + face] : null;
    const a = A["Face" + name];
    a.reset().play();
    if (old) a.crossFadeFrom(old, 0.25);
  }
  face = name;
}

function talk(on: boolean) {
  talking = on;
  if (!HAVE) return;
  for (const A of [act, act2]) { if (on) A.Talk.reset().fadeIn(0.15).play(); else A.Talk.fadeOut(0.2); }
}

if (HAVE) mixer.addEventListener("finished", (e: any) => {
  const n = e.action.getClip().name;
  if (n === "Nod" || n === "Bow") pose("Idle", 0.4);
});

pose("Idle", 0);
expression("Neutral");
if (HAVE) { act.Tail.play(); act2.Tail.play(); }

function tick(dt: number) {
  t += dt;
  if (reorbit > 0) { rg.orbit.reset(); reorbit--; }
  blinkIn -= dt;
  if (HAVE && blinkIn <= 0) {
    act.Blink.reset().play();
    act2.Blink.reset().play();
    blinkIn = 2 + Math.random() * 3.5;
  }
  if (HAVE) { mixer.update(dt); mixer2.update(dt); }
}

const TOON = { bands: 3, outline: 2.2, outlineColor: "#1d1528", shadowColor: "#9c8cc0", rim: 0.8, rimColor: "#4e3f66" };

function world() {
  return (
    <scene3d>
      <color attach="background" args={["#e9e3f5"]} />
      <orbitControls key={close ? "c" : "f"} target={close ? [0, 1.74, 0] : [0, 1.0, 0]} minDistance={0.5} maxDistance={6} minPolarAngle={0.5} maxPolarAngle={1.75} enablePan={false} />
      {close ? <perspectiveCamera position={[0, 1.75, 1.25]} fov={30} lookAt={[0, 1.74, 0]} /> : <perspectiveCamera position={[0, 1.15, 3.9]} fov={34} lookAt={[0, 1.0, 0]} />}
      <hemisphereLight args={["#ffffff", "#b9a8d8", 0.55]} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.15} />
      <mesh name="floor" position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <circleGeometry args={[0.7, 40]} />
        <meshToonMaterial color="#cfc3e6" />
      </mesh>
      {HAVE && sketchMode < 2 ? <primitive name="cat" object={cat} position={[0, 0, 0]} toon={toon ? TOON : false} /> : null}
      {HAVE && sketchMode > 0 ? <primitive name="sketch" object={sketchModel} position={[0, 0, 0]} toon={false} renderOrder={sketchMode === 1 ? 1000 : 0} /> : null}
    </scene3d>
  );
}

function view() {
  return (
    <div class="screen">
      {world()}
      <div class="title" onClick={() => { clean = !clean; }}>{clean ? "" : tr("Kissafederaatio", "Cat Federation", "Federación Felina")}</div>
      {HAVE ? null : <div class="missing">{tr("Hahmon malli puuttuu: se tehdään Trade Frontierin hahmodatasta (characters/cat/make-cat.mjs).", "The character model is missing: it is built from Trade Frontier's character data (characters/cat/make-cat.mjs).", "Falta el modelo del personaje: se crea con los datos de Trade Frontier (characters/cat/make-cat.mjs).")}</div>}
      {clean || !HAVE ? null : controls()}
    </div>
  );
}

function controls() {
  return (
    <div class="ui">
      <div class="side">
        {POSES.map((p) => (
          <div class={"btn" + (body === p[0] ? " on" : "")} onClick={() => { pose(p[0]); rg.sound("click"); }}>{tr(p[1], p[2], p[3])}</div>
        ))}
      </div>
      <div class="faces">
        {FACES.map((f) => (
          <div class={"face" + (face === f[0] ? " on" : "")} onClick={() => expression(f[0])}>{f[1]}</div>
        ))}
      </div>
      <div class="bar">
        <div class={"tool" + (talking ? " on" : "")} onClick={() => talk(!talking)}>{talking ? "🗨️ " + tr("Puhuu", "Talking", "Habla") : "💬 " + tr("Puhu", "Talk", "Hablar")}</div>
        <div class={"tool" + (close ? " on" : "")} onClick={() => { close = !close; reorbit = 3; }}>{close ? "🔍 " + tr("Lähikuva", "Close-up", "Primer plano") : "🧍 " + tr("Koko hahmo", "Full body", "Cuerpo entero")}</div>
        <div class={"tool" + (sketchMode ? " on" : "")} onClick={() => { sketchMode = (sketchMode + 1) % 3; }}>{"📐 " + [tr("Hahmotelma", "Sketch", "Boceto"), tr("Hahmotelma päällä", "Sketch over", "Boceto encima"), tr("Vain hahmotelma", "Sketch only", "Solo boceto")][sketchMode]}</div>
        <div class={"tool" + (toon ? " on" : "")} onClick={() => { toon = !toon; }}>{toon ? "✏️ Toon" : "💡 " + tr("Tavallinen valo", "Plain light", "Luz normal")}</div>
      </div>
    </div>
  );
}
