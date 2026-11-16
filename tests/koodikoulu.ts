// node --experimental-strip-types tests/koodikoulu.ts: every generated task of
// Koodikoulu can be solved with the parts the game offers, and a wrong
// program fails (so the task really asks something).
import { cakeTask, cakeWrong, opTask, opResult, opMax, dsTask, dsOk, fnTask, fnOk, allTask, allOk, ALKU, OPS5, NS, LISA } from "../games/koodikoulu/lib/logic.ts";
let bad = 0, seed = 11;
const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
const fail = (m: string) => { if (bad < 20) console.log(m); bad++; };
for (let rep = 0; rep < 200; rep++) for (let step = 0; step < 3; step++) for (let q = 0; q < 6; q++) {
  // 1 cake: the order itself is right, an empty box is wrong
  const c = cakeTask(rnd, q, step);
  if (cakeWrong(c, c.order).length) fail("cake order wrong");
  if (!cakeWrong(c, { candles: 0, name: -1, icing: false }).length) fail("empty cake right");
  if (c.order.candles < 1 || c.order.candles > 12) fail("candles " + c.order.candles);
  // 2 operators: some choice the game offers makes the goal, and not every one
  const o = opTask(rnd, q, step);
  const max = opMax(o, step);
  let ways = 0, all = 0;
  for (const op of o.palette) {
    if (o.kind === "aseta") for (let b = 0; b <= max; b++) { all++; if (opResult(o, op, o.a, b) === o.goal) ways++; }
    else if (o.kind === "vertaaA") for (let a = 0; a <= max; a++) { all++; if (opResult(o, op, a, o.b) === o.goal) ways++; }
    else if (o.kind === "sanat") for (const a of o.words) for (const b of o.words) { if (a === b) continue; all++; if (opResult(o, op, a, b) === o.goal) ways++; }
    else { all++; if (opResult(o, op, o.a, o.b) === o.goal) ways++; }
  }
  if (!ways || (ways === all && o.kind !== "aseta")) fail("op " + o.kind + " ways " + ways + "/" + all + " " + JSON.stringify(o));
  if (o.kind === "vertaaA" && opResult(o, o.op, o.a, o.b) === o.goal) fail("vertaaA starts solved");
  // 3 structures: the recipe fed the right way works, the plain order fails for a stack
  const d = dsTask(rnd, q, step);
  if (d.kind === "lista") { if (!dsOk(d, d.recipe.map((f) => d.shelf.indexOf(f) + 1), [])) fail("lista"); }
  else if (d.kind === "jono") { if (!dsOk(d, d.recipe, [])) fail("jono"); }
  else if (d.kind === "pino") { if (!dsOk(d, d.recipe.slice().reverse(), []) || dsOk(d, d.recipe, [])) fail("pino"); }
  else {
    const fill = d.drawers.map((a) => d.wants[d.animals.indexOf(a)]);
    if (!dsOk(d, [], fill) || dsOk(d, [], fill.slice().reverse())) fail("lokero");
    if (d.serve.join() === d.drawers.join()) fail("lokero serve order");
  }
  // 4 functions: the solution fits, some other body does not
  const f = fnTask(rnd, q, step);
  if (!fnOk(f, f.sol)) fail("fn sol");
  if (fnOk(f, { op: f.palette[0], n: 0, op2: f.palette2[0] || "", n2: 0 }) && fnOk(f, { op: f.palette[1], n: 10, op2: f.palette2[1] || "", n2: 10 })) fail("fn anything goes");
  // 5 all together: the solution works on both baskets, one hard-coded answer does not
  const t = allTask(rnd, q, step);
  if (!allOk(t, t.sol)) fail("all sol");
  if (ALKU.indexOf(t.sol.alku) < 0 || OPS5.indexOf(t.sol.op) < 0 || NS.indexOf(t.sol.n) < 0 || LISA.indexOf(t.sol.lisa) < 0) fail("all sol not offered");
  const cheat = Object.assign({}, t.sol, { lisa: "1" });
  if (t.kind === "summa" && allOk(t, cheat) && t.open.indexOf("lisa") >= 0) fail("summa with 1 passes");
  if (t.lists[0].join() === t.lists[1].join()) fail("same baskets");
}
console.log(bad ? bad + " problems" : "koodikoulu ok");
process.exit(bad ? 1 : 0);
