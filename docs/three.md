# 3D with three.js's names

A game writes its 3D world with **three.js's names, the way React Three Fiber
does**: JSX under `<scene3d>` in `view()`, and a `THREE` object for what code
needs (loading glTF models, playing their animations, raycasting). The
engine draws it in Rust under the 2D view, depth-tested with WebGL on the
web and GLES on Android, or as sorted polygons where there is no GPU (the
Sliqtly Games screenshot tool, `?nogl`). This is the same split as M-Files'
`<scene3d>` (terotests/MFilesAPI), and the geometries come from RangerThree
(terotests/RangerThree, three.js's API in strict Rust), so
`<sphereGeometry args={[1, 32, 16]} />` has three.js's own vertices.

The older `rg.three("add", …)` commands keep working; a game may use both.

A name in the world: `rg.three("add", { id, shape: "label", text, x, y, z,
size: 14, color, opacity, align: "center" | "left" | "right", dx, dy, weight })`
draws `text` where (x, y, z) falls in the view, facing the viewer and the
same size on the screen whatever the distance (`set` changes text, place
and look; `visible: false` hides it). In VR each eye draws it at its place
(1.4× bigger), so a planet's name sits next to the planet when the head turns.

Code: `crates/rg_engine/src/fiber.rs` (the world), `gltf.rs` (models, skins,
clips), `js/three.js` (`THREE`, serialization, taps, orbit controls).
Demo: `games/nappulasota`. Tests: `crates/rg_engine/tests/three_world.rs`.

## The world

```tsx
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const gltf = new GLTFLoader().loadSync("models/soldier.glb");   // or .load(url, onLoad)
const knight = gltf.scene;
const mixer = new THREE.AnimationMixer(knight);
mixer.clipAction("Idle").play();

function tick(dt) { mixer.update(dt); }

function view() {
  return (
    <div class="screen">
      <scene3d>
        <color attach="background" args={["#9fd3ff"]} />
        <fog attach="fog" args={["#9fd3ff", 14, 40]} />
        <perspectiveCamera position={[0, 6, 8]} fov={45} lookAt={[0, 0, 0]} />
        <orbitControls target={[0, 0, 0]} minDistance={4} maxDistance={16} maxPolarAngle={1.3} />
        <hemisphereLight args={["#ffffff", "#8a6e4b", 0.6]} />
        <directionalLight position={[3, 7, 4]} intensity={1.1} />
        <mesh name="a1" position={[0, -0.1, 0]} onClick={(e) => pick(e.object.name, e.point)}>
          <boxGeometry args={[1, 0.2, 1]} />
          <meshLambertMaterial color="#e9d3a6" />
        </mesh>
        <primitive object={knight} position={[0, 0, 0]} rotation={[0, Math.PI, 0]} scale={0.7}
          onClick={() => select()} />
      </scene3d>
      <div class="hud">…2D on top…</div>
    </div>
  );
}
```

| element | props |
| --- | --- |
| `scene3d` | `background` (a colour, as a shortcut) |
| `color attach="background"` | `args={[colour]}` |
| `fog attach="fog"` | `args={[colour, near, far]}` |
| `perspectiveCamera` | `position`, `fov` (75), `near`, `far`, `lookAt={[x, y, z]}`, `up`, `rotation`; the first one (or `makeDefault`) is the camera. Without one: React Three Fiber's default, fov 75 at `[0, 0, 5]` |
| `orbitControls` | drei's names: `target`, `minDistance`, `maxDistance`, `minPolarAngle`, `maxPolarAngle`, `minAzimuthAngle`, `maxAzimuthAngle`, `enableRotate`, `enableZoom`, `rotateSpeed`, `zoomSpeed`, `autoRotate`, `autoRotateSpeed`, `enabled`. One finger turns, two fingers or the wheel zoom. `rg.orbit.reset()` goes back to the camera's props, `rg.orbit.state()` gives `{target, radius, theta, phi}` |
| `ambientLight`, `directionalLight`, `pointLight`, `hemisphereLight` | `color` / `skyColor` + `groundColor`, `intensity`, `position`, `target` (directional), `distance`, `decay` (point), or three.js's constructor `args` |
| `group` | a transform for its children |
| `mesh` | a `…Geometry` child and a `…Material` child (no geometry: a 1 × 1 × 1 box) |
| `primitive` | `object={gltf.scene}` (or a `.clone()` of it): a glTF model with its animation |

Every object: `name`, `position`, `rotation` (radians, `[x, y, z, order?]`),
`quaternion`, `scale` (number or `[x, y, z]`), the dashed forms
(`position-x`, `rotation-y`, `scale-z`), `visible`, `renderOrder` (without
a depth buffer lower orders are drawn first: give a big floor `-1`).

Geometries (three.js's constructor `args` and defaults): `box`, `plane`,
`sphere`, `cylinder`, `cone`, `circle`, `ring`, `torus`, `torusKnot`,
`capsule`, `tetrahedron`, `octahedron`, `icosahedron`, `dodecahedron`
(`…Geometry`).

Materials: `meshStandardMaterial`, `meshLambertMaterial`,
`meshPhongMaterial` (lit), `meshBasicMaterial` (unlit), `meshNormalMaterial`;
props `color`, `emissive`, `emissiveIntensity`, `side` (`THREE.DoubleSide`),
`flatShading`. Colours: `"#rrggbb"`, `"#rgb"`, names, `0xrrggbb`, `rgb()`,
`hsl()`, `[r, g, b]`. Lighting is Lambert, per corner, with three.js's
colour management (sRGB colours lit in linear light); there are no textures,
shadows or transparency (but see Toon shading below).

## Level of detail

Everything is drawn live every frame, in the form its size on the screen
calls for (crates/rg_engine/src/lod.rs). No pictures are kept in between.

An object made with `rg.three("add", …)` can have coarser forms. Each one
is drawn once the object is less than `px` units across on the screen
(its bounding ball's diameter; a unit is about a CSS pixel):

```ts
rg.three("add", { id: "lm", shape: "mesh", verts, tris, colors,
  lod: [
    { px: 80, shape: "mesh", verts: v2, tris: t2, colors: c2 }, // fewer faces
    { px: 12, shape: "box", size: [1, 0.8, 1], color: "#c8a040" },
    { px: 2, hide: true },                                     // too small to see
  ] });
rg.three("add", { id: "ball", shape: "sphere", size: [1], detail: "auto" }); // 48, 24, 12, 6 segments
rg.three("add", { id: "s", shape: "sphere", size: [1], lod: [{ px: 40, detail: 8 }] }); // the same shape, fewer segments
```

A form changes only once the size has passed its limit by `lodMargin`
(0.15 = 15 %, per object), so an object at a limit does not flick between
two forms. `detail: "auto"` works on `sphere`, `cylinder` and `cone`.

A big mesh need not go through the script: `src` names a baked mesh file in the
game's folder, and a lod entry can take another of the file's meshes by `part`:

```js
rg.three("add", { id: "rock", shape: "mesh", src: "rocks/eros.rgm", smooth: true,
  lod: [{ px: 900, part: 1 }, { px: 110, part: 2 }] });
```

The file (little endian): `RGM1`, u32 the count of meshes; each mesh: u32 corners,
u32 triangles, the corners x, y, z (f32), the triangles' corners (u16 when the mesh
has at most 65 536 corners, else u32), a colour r, g, b (u8) a triangle.

Planets (`rg.three("planet", …)`) are cast a ray a pixel, so they have no
triangles to drop. Their level instead follows their size smoothly: 0 at
96 units of radius and over, 1 more each halving of the size. The globe
shader fades its costly parts out over ranges of it (the O'Neil air to
the plain glow, the sea's glint and the hot cap's fine veins from 2 to 3,
the picture's relief from 2.5 to 3.5), so nothing pops in or out. The
phone draws a globe's picture at the screen's own pixels up to 250000
pixels and with about that many past it (down to half the screen's
pixels), without steps.

## Taps (raycasting)

As in React Three Fiber, a mesh or primitive with `onClick`, `onPointerDown`
or `onPointerUp` gets the tap when it is the nearest thing under the finger
and no 2D element with a handler is there. A handler on a `group` catches
taps on its children. The event:

```js
{ object: { name, id }, point: Vector3, distance, normal: Vector3, x, y, pointer }
```

A drag that turned the orbit camera is not a click. A game's own
`onPointerDown(x, y, info)` / `onPointerUp` get `info.hit` (the same event)
when the tap was on 3D but no 3D handler took it, and `info.dragged` on
pointer up.

Anywhere in code:

```js
const hit = rg.raycast(x, y);          // { id, name, distance, point: [x, y, z], normal } | null
const all = rg.raycast(x, y, true);    // every object under the point, nearest first
const r = new THREE.Raycaster();
r.setFromCamera(new THREE.Vector2(ndcX, ndcY));   // or r.setFromScreen(x, y) in game units
r.intersectObjects(["a1", "a2"]);      // three.js's intersections: { distance, point, object: { name }, face: { normal } }
const p = rg.project([x, y, z]);       // where a world point is on the screen: { x, y, depth } | null
```

Raycasts see the world as it was drawn in the last frame.

## glTF models and animation

`new GLTFLoader().load(url, onLoad, onProgress, onError)`, `loadAsync(url)`
or `loadSync(url)` read a `.glb` (or a `.gltf` with embedded or neighbouring
buffers) from the game's folder at once. `gltf.scene` is the model,
`gltf.animations` its clips (`{ name, duration }`); `model.clone()` gives
another copy with its own mixer.

Read: triangle meshes, node hierarchy, skins (up to 4 bones a corner),
`COLOR_0`, materials' `baseColorFactor` / `emissiveFactor` / `doubleSided`,
`KHR_materials_unlit` (the colours are drawn as they are, unlit: for models
whose light is baked into their vertex colours), and animation channels for translation, rotation and scale (STEP, LINEAR,
CUBICSPLINE). Not read: textures (a textured model shows its base colour),
morph targets, cameras and lights in the file. Keep models low-poly
(hundreds of triangles): the posing and skinning run on the phone's CPU.
A model that stands still (no clip playing, the same place) under a still
camera is not posed, lit or projected again: the engine keeps its last
drawing, so many models are cheap as long as few of them move. Leave an
idle model without a clip (stop `Idle`) when a game has many of them.
A model whose bounding sphere (taken from its rest pose, half again larger
for a skinned one) is wholly outside the camera's view is skipped before it
is posed.
`cargo run --release -p rg_engine --example bench3d -- <game> gl` times a
game's frames.

`THREE.AnimationMixer` and `AnimationAction` follow three.js:

```js
const mixer = new THREE.AnimationMixer(model);
const walk = mixer.clipAction("Walk");                 // a name or a clip
const attack = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, "Attack"));
attack.setLoop(THREE.LoopOnce, 1);
attack.clampWhenFinished = true;
attack.reset().play();
attack.crossFadeFrom(walk, 0.2);                       // or walk.crossFadeTo(attack, 0.2)
mixer.addEventListener("finished", (e) => …e.action…);
mixer.addEventListener("loop", (e) => …);
mixer.update(dt);                                      // in tick(dt)
```

Also `stop`, `fadeIn`, `fadeOut`, `setEffectiveWeight`, `getEffectiveWeight`,
`setEffectiveTimeScale`, `setDuration`, `paused`, `time`, `timeScale`,
`LoopRepeat`, `LoopPingPong`, `stopAllAction`, `existingAction`.

**Animation events** (a RangerGames addition; three.js has none):
`action.addMarker("sword_hit", 0.45)` makes the mixer send
`{ type: "marker", name, time, action }` when the action plays past 0.45 s:

```js
attack.addMarker("sword_hit", 0.45);
mixer.addEventListener("marker", (e) => {
  if (e.name === "sword_hit") { rg.sound("hit"); enemyMixer.clipAction("Hit").reset().play(); }
});
```

## THREE

`Vector2`, `Vector3` (the common methods), `MathUtils`, `Clock`,
`GLTFLoader`, `AnimationClip`, `AnimationMixer`, `AnimationAction`,
`Raycaster`, `LoopOnce`, `LoopRepeat`, `LoopPingPong`, `FrontSide`,
`BackSide`, `DoubleSide`. `import * as THREE from "three"` and
`import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"` work, and
`THREE` is also a global.

## Toon shading

A cartoon look, the way a toon shader draws it, on any mesh or model:
`<meshToonMaterial>` (three.js's name), `toon` on a mesh's material, or
`toon` on a `<primitive>`:

```tsx
<primitive object={cat} toon={{ bands: 3, outline: 2.2, outlineColor: "#1d1528",
  shadowColor: "#8c74d8", rim: 0.8, rimColor: "#4b3478" }} />
<mesh><sphereGeometry /><meshToonMaterial color="#cfc3e6" outline={1.5} /></mesh>
```

| prop | what |
| --- | --- |
| `bands` | 2, 3 (default) or 4 even light bands; or `edges` (n·l where a band ends, up to 3) and `levels` (how much of the key light each band gets) |
| `shadowColor` | tints the fill light (ambient and hemisphere) that the shadow band is lit by |
| `specular`, `specularColor` | a highlight where n·h is at least this (0.9–0.97: metal, eyes, gems) |
| `rim`, `rimColor` | rim light where 1 − n·v is at least this (0.8: a thin edge) |
| `outline`, `outlineColor` | the outline, units wide (about CSS pixels) whatever the distance; 0 / false: none |
| `lit` | false: the colours drawn flat (ink, glow), outline kept |

The strongest directional light is the key light that the bands cut; the
ambient and hemisphere lights are a flat fill under it (point lights are
left out). Every edge (band, highlight, rim) is cut through the triangles
on the CPU, so each piece is one flat colour and the edges stay sharp
however big the triangles are; it works the same on the web, the phone's
GL and the painter (no GPU). The outline is an inverted hull: the
corners pushed out along their normals and the faces that then look away
drawn behind the surface, so models want smooth normals (shared corners)
and no inner part close under an outer one (its hull would show through).

A glTF part's material can carry its own settings in `extras.toon` (same
fields), over the primitive's: fur, fabric, metal, gems and the face's ink
of one model each drawn their way. `writeGlb` (`tools/three/glb.mjs`) writes them
(`writeGlb({ meshes: [{ …, extras: { toon: {…} } }] })`); the Character
Studio (`games/hahmostudio`) shows a cat built this way, whose face is drawn as 2D
shapes laid on the head (lines and fills, `lit: false`, no outline) moved by
face bones for its expressions. The cat's data and its build script are
kept in the private Trade Frontier repository (`characters/cat/make-cat.mjs`
writes `games/hahmostudio/models/` here); the studio says so when the model
is missing.

## Making a model

`tools/three/make-soldier.mjs` draws the Nappulasota pieces (a toy soldier
with a different hat and weapon for each chess piece) in code and writes
them as skinned, animated `.glb` files: a small glTF writer that is a
starting point for other original models. `tools/three/glb.mjs` is the shared writer the
Matka Marsiin models use: `make-astronaut.mjs` (skinned crew with 12 clips)
and `make-iss.mjs` (the space station's modules with baked lighting, written
unlit, plus `games/marsiin/lib/station.ts`: free space, hatches and spots). Models made with Blender and
exported as glTF binary work as well; use only our own or CC0 / CC BY
models and list the authors in `CREDITS.md`.
