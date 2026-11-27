# Animation on one clock

Every game animates with the same engine code, run natively in Rust
(`crates/rg_core/src/anim.rs`, `clock.rs`, `easing.rs`) before the game's
`tick` each frame. The game's script only describes the motion; the engine
times it, eases it, interpolates it and writes the values onto the game's
objects. The same source builds into Ranger's other targets (JavaScript,
C++, Go, Python), and `tests/rg_core_js.cjs` checks that the JavaScript
build gives the very frames the Rust build gives.

The API follows standards: the **W3C Web Animations** model
(`Element.animate`, `Animation`), **CSS Easing Functions Level 2**
(`cubic-bezier`, `steps`, `linear()`), Robert Penner's named curves as
GSAP names them, and a **GSAP-style timeline** (positions `"<"`, `">"`,
`"+=500"`, labels) for sequences. Times are **milliseconds**, as in the
standard (the `dt` that `tick` gets stays in seconds).

## The clock

The host gives each frame the display's vsync time (Android: Choreographer,
`VsyncClock.java`; web: `requestAnimationFrame`'s time) and the display's
period. `FrameClock` makes the frame's step **a whole number of display
frames**, carrying the rest to the next frame, so:

- the motion matches the pictures as the display shows them (no 11/22 ms
  judder on a 90 Hz screen),
- the game's time never drifts from the wall clock, so music and speech stay
  with the picture,
- a stall longer than 100 ms is cut to 100 ms and counted in `rg.frame.lost`.

`rg.frame` is this frame's `{ now, dt, frames, period, lost, count }` (ms).
A host that only gives the time since the last frame (an older build) gets
the same steps with the period estimated from the frames.

## rg.animate — Element.animate()

```ts
const ball = { x: 0, y: 0 };
const a = rg.animate(ball, [{ x: 0 }, { x: 100, easing: "ease-out" }, { x: 80 }],
  { duration: 600, iterations: 2, direction: "alternate", fill: "forwards" });
a.onfinish = () => rg.sound("pop");
a.pause(); a.currentTime = 300; a.play(); a.reverse(); a.updatePlaybackRate(2);
a.playState;            // "idle" | "running" | "paused" | "finished"
await a.finished;       // where Promise is there

rg.animate("#star", { opacity: [0, 1], transform: ["scale(0.5)", "scale(1)"] }, 400);
```

- The target is a JS object (its properties; `"pos.0"` and `"cam.dist"`
  paths too) or `"#id"`, an element's style (the element keeps its own
  style, the animated one goes over it while the effect applies).
- Keyframes in either form of the standard; missing offsets are spread as
  the standard spreads them; a property without a keyframe at 0 or 1 starts
  or ends at the object's value now (implicit keyframes).
- Values: numbers, lists of numbers (`[x, y, z]`), colours (`#rgb`,
  `#rrggbb`, `rgb()`, `rgba()`) and any text with numbers in it
  (`"translate(10px, 20px) rotate(30deg)"`), interpolated number by number
  when both keyframes have the same shape; otherwise they switch half-way,
  as CSS does.
- Options: `duration`, `delay`, `endDelay`, `iterations` (`Infinity`),
  `iterationStart`, `direction`, `fill`, `easing`, `playbackRate`, and two of
  ours: `clock` (a name from `rg.clock`) and `autoplay: false` (paused at 0).

## rg.sequence — a timeline with sounds and pauses

```ts
const s = rg.sequence({ clock: "sim" })
  .say("planeetat_syntyy")                       // a voice clip; its length from the file
  .to(cam, { dist: 2000, duration: 4000, ease: "power2.inOut" }, "<")
  .music("sounds/clair.wav", { volume: 0.4 }, "<")
  .gap(800)                                      // a fixed pause
  .hold("vastaus", { timeout: 30000 })           // waits for s.resolve / s.cancel
  .call(() => rg.celebrate())
  .label("törmäys")
  .fromTo(theia, { glow: 0 }, { glow: 1, duration: 1000 }, "törmäys+=200");

function onAnswer(right) { s.cancel("vastaus"); }   // the rest moves up
```

- `to`, `from`, `fromTo` (GSAP's), `animate(target, keyframes, timing)` (the
  standard's), `call`, `label`, `gap(ms)`, `hold(name)`, `sound(file)`,
  `say(id)`, `music(file)`.
- Positions: `""` (after the end), `"<"` (with the previous entry), `">"`
  (after it), `"<200"`, `">-100"`, `"+=500"`, `"-=500"`, `"label"`,
  `"label+=300"`, or a time in ms.
- A `to` starts from where the tween before it on the same property ends,
  so a sequence can be sought anywhere and still looks right.
- A sound's length comes from the file itself (WAV, MP3, Ogg Vorbis/Opus in
  the game's files) as soon as it is there. Until then the sequence **waits
  at its start** (a clip still downloading), at most `timeout` ms (10 s by
  default for sounds), then the sound is dropped and the rest moves up.
  `dur` gives a length by hand; `wait: false` does not wait.
- `cancel(name)` on an entry under way ends it now; on one ahead removes it;
  either way the entries after it move up. `resolve(name, ms)` gives a hold
  (or a sound) its length.
- The sequence starts each sound with the delay from this frame to its exact
  start and the offset into it (a seek, a late load), so the host starts it
  on the sample (`delay`/`offset` in `rg.sound`'s options, seconds). Pausing
  the sequence pauses its sounds, seeking restarts them from the new place,
  cancelling stops them. `say` stays silent when speech is off, but keeps its
  time.
- Control as an Animation: `play`, `pause`, `reverse`, `seek(ms)`,
  `playbackRate`, `finish`, `cancel()`, `kill()`; `duration`, `holding`,
  `onfinish`, `ontimeout(entryId)`.

## rg.clock — time scales

```ts
const sim = rg.clock("sim", { rate: 60 });
sim.setRate(4000, { glide: 2000, log: true });   // ×60 → ×4000 in 2 s on a log scale
sim.currentTime; sim.rate; sim.pause(); sim.play();
```

Animations and sequences given `clock: "sim"` run on it. The glide is
integrated over each frame (Simpson's rule), so it moves the same at 30 or
90 frames a second.

## rg.spring and rg.follow

```ts
const sp = rg.spring(cam, "zoom", { to: 2, stiffness: 170, damping: 26 });
sp.to(3); sp.push(5); sp.jump(1); sp.onrest = () => {};
const s2 = rg.spring({ value: [0, 0, 0], to: [1, 2, 3] });  // read s2.value

camOff = rg.follow(camOff, want, 140);   // the gap halves every 140 ms
```

The spring is solved exactly for each step (under-, critically and
over-damped), so it is the same at any frame rate. `rg.follow` replaces
`x += (target - x) * 0.15`, which moves twice as fast at 60 fps as at 30.

## Credits

The easing curves follow the CSS Easing Functions Level 2 specification;
the cubic Bézier is solved with Newton's method and bisection as WebKit's
`UnitBezier` (BSD licence) solves it. The named curves are Robert Penner's
easing equations (BSD licence). The timing model and the play states are the
W3C Web Animations Level 1 specification; the sequence positions follow
GSAP's timeline (its API's shape only, no code). The spring is the closed
form of the damped harmonic oscillator, with Motion's (MIT) parameter names.
