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

console.log("rg_core (JavaScript from rgrc): ok");
