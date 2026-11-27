// rg_core as Ranger writes it in JavaScript (scripts/check-ranger.sh) must
// answer what the cargo build answers (crates/rg_core/tests/core.rs).
const assert = require("assert");
const m = require("../target/ranger/rg_core.es6.js");

const r = new m.Rng();
r.state = 42;
assert.deepStrictEqual([r.next_int(), r.next_int(), r.next_int(), r.next_int()], [2027382, 1226992407, 551494037, 961371815]);

const v = new m.Vfs();
v.add_text("/p/game.json", "{}");
v.add_text("/p/img/a.txt", "hei");
const w = new m.Vfs();
assert.strictEqual(w.mount_pack("/games/q", v.pack("/p")), 2);
assert.strictEqual(w.read_text("/games/q/img/a.txt"), "hei");
assert.deepStrictEqual(w.list("/games/q"), ["game.json", "img/"]);
assert.strictEqual(w.write_text("/games/q/game.json", "x"), false);
assert.strictEqual(w.write_text("/save/q.json", "{}"), true);

// clocks, easing and animations (crates/rg_core/tests/anim.rs parity_frames)
{
  const J = m.RsMod_json, W = m.RsImpl_Json.write;
  const E = m.RsMod_easing;
  assert.strictEqual(E.parse("ease").at(0.5).toFixed(9), "0.802403388");
  assert.strictEqual(E.parse("steps(4, jump-start)").at(0.3), 0.5);
  assert.strictEqual(E.parse("linear(0, 0.25 75%, 1)").at(0.875), 0.625);
  const w = m.Anims.new_();
  const req = (o) => w.request(J.parse(JSON.stringify(o)));
  req({ op: "anim", target: 1, props: [{ name: "x", kfs: [{ v: "#000000" }, { v: "#ff0000" }] }], timing: { duration: 1000 } });
  req({ op: "anim", target: 1, props: [{ name: "y", kfs: [{ v: "translate(0px, 10px)" }, { v: "translate(100px, -10px)" }] }], timing: { duration: 1000, easing: "ease" } });
  req({ op: "spring", target: 2, prop: "z", value: 0, to: 100, stiffness: 170, damping: 12 });
  const s = Number(W(req({ op: "seq" })));
  req({ op: "add", seq: s, kind: "sound", path: "/a.wav" });
  req({ op: "add", seq: s, kind: "gap", dur: 300, name: "g" });
  req({ op: "add", seq: s, kind: "call" });
  let out;
  for (let i = 0; i < 30; i++) out = w.advance(1000 / 60);
  assert.strictEqual(W(w.frame_json(out)), "{\"o\":[[1,\"x\",\"rgb(128, 0, 0)\"],[1,\"y\",\"translate(80.24px, -6.048px)\"],[2,\"z\",96.84598274203736]],\"s\":[[1,500.0000000000002,1,1],[2,500.0000000000002,1,1],[4,0,1,1,300,true]],\"sp\":[[3,[96.84598274203736],[-34.749634617366674],false]],\"c\":[[500.0000000000002,1,false]]}");
  w.sound_length(s, 5, 200);
  for (let i = 0; i < 40; i++) out = w.advance(1000 / 60);
  assert.strictEqual(W(w.frame_json(out)), "{\"o\":[[2,\"z\",99.90799314371816]],\"e\":[[\"sound\",4,5,0,0],[\"finish\",1,0,0,0],[\"finish\",2,0,0,0],[\"finish\",4,0,0,0],[\"call\",4,7,0,0]],\"s\":[[1,1000,3,1],[2,1000,3,1],[4,500,3,1,500,false]],\"sp\":[[3,[99.90799314371816],[1.0804858062152365],false]],\"c\":[[1166.6666666666663,1,false]]}");
  const c = m.FrameClock.new_();
  let t = 0, sum = 0;
  c.frame_vsync(0, 1000 / 60);
  for (let i = 0; i < 600; i++) { t += (i % 3 === 0 ? 2000 / 60 : 1000 / 60) + (i % 2 ? -0.7 : 0.7); sum += c.frame_vsync(t, 1000 / 60); }
  assert.ok(Math.abs(sum - t) < 1000 / 60);
}

console.log("rg_core (JavaScript from rgrc): ok");
