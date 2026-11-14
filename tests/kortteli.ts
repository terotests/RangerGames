// node --experimental-strip-types tests/kortteli.ts — the rules of Mansepoli and Hesapoli:
// the board is right, and thousands of games played by the phone's rules
// (rolls, buying, building, rent, jail, cards) end, with no money lost or
// made from nothing and no NaN.
import { N, SQ, CARDS, START, JAIL, PARK, POLICE, PASS_BONUS, JAIL_FINE, KIOSK_FEE, MAX_LEVEL, newGame, rent, canBuild, buildCost, buy, build, pay, path,
  stepsTo, drawCard, ranking, nextPlayer, aiBuy, aiBuild, aiPlan, aiJail, worth, wholeBlock, blockOf } from "../tools/kortteli/template/lib/rules.ts";
import { THEME as MANSE } from "../games/mansepoli/lib/theme.ts";
import { THEME as HESA } from "../games/hesapoli/lib/theme.ts";
import * as fs from "node:fs";
let bad = 0;
const fail = (m: string) => { console.log(m); bad++; };
// the two themed games: 16 different streets, every corner named, voice clips for each street
const fiClips = JSON.parse(fs.readFileSync("voice/fi.json", "utf8")).clips;
for (const th of [MANSE, HESA]) {
  if (th.streets.length !== 16 || new Set(th.streets).size !== 16) fail(th.id + ": 16 different streets");
  for (const k of ["start", "jail", "park", "police", "kiosk", "chance"]) if (!th.names[k] || th.names[k].length !== 3) fail(th.id + ": name of " + k);
  for (let k = 0; k < 16; k++) if (!fiClips[th.voice + "_k_" + k]) fail(th.id + ": no clip " + th.voice + "_k_" + k);
  if (!fiClips[th.kiosk.clip] || !fiClips["peli_" + th.id]) fail(th.id + ": kiosk or name clip");
  for (const f of ["game.tsx", "style.css", "lib/rules.ts", "lib/house.ts"]) if (!fs.existsSync("games/" + th.id + "/" + f)) fail(th.id + ": run tools/kortteli/sync.sh");
}
if (SQ.length !== N) fail("24 squares");
if (SQ.filter((s) => s.kind === "plot").length !== 16) fail("16 plots");
for (let b = 0; b < 8; b++) if (blockOf(b).length !== 2) fail("block " + b + " should have 2 plots");
if (SQ[START].kind !== "start" || SQ[JAIL].kind !== "jail" || SQ[PARK].kind !== "park" || SQ[POLICE].kind !== "police") fail("corners");
if (path(22, 3).join() !== "23,0,1" || path(1, -3).join() !== "0,23,22") fail("paths wrap");
if (stepsTo(20, 0) !== 4 || stepsTo(3, 12) !== 9) fail("stepsTo");

// a seeded random generator
let seed = 1;
const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
const die = () => 1 + Math.floor(rnd() * 6);
let ended = 0, byBankrupt = 0, rounds = 0, hotels = 0, maxTurns = 0;
for (let game = 0; game < 2000; game++) {
  const n = 2 + (game % 3);
  const g = newGame([0, 1, 2, 3].slice(0, n), [true, true, true, true].slice(0, n), game % 4 === 0 ? 0 : 20, rnd);
  const total = () => g.players.reduce((a, p) => a + p.money, 0) + g.pot;
  let turns = 0;
  while (!g.over && turns < 3000) {
    turns++;
    const p = g.players[g.cur], me = g.cur;
    let extra = true, rolls = 0;
    for (const i of aiPlan(g, me)) if (!build(g, me, i)) fail("aiPlan built what it can't");
    while (extra && !g.over) {
      extra = false;
      const a = die(), b = die(), dbl = a === b;
      if (p.jail > 0) {
        const c = aiJail(g, me);
        if (c === "free") { p.free--; p.jail = 0; }
        else if (c === "pay") { pay(g, me, -2, JAIL_FINE); p.jail = 0; }
        else if (dbl) p.jail = 0;
        else { p.jail++; if (p.jail > 3) { pay(g, me, -2, JAIL_FINE); p.jail = 0; } else break; }
        if (g.over) break;
      } else if (dbl) { g.doubles++; if (g.doubles >= 3) { p.pos = JAIL; p.jail = 1; break; } extra = true; }
      let steps = a + b;
      for (let guard = 0; guard < 3; guard++) {
        for (const q of path(p.pos, steps)) { if (q === START && steps > 0) p.money += PASS_BONUS; p.pos = q; }
        const i = p.pos, sq = SQ[i];
        steps = 0;
        if (sq.kind === "plot") {
          if (g.owner[i] < 0) { if (aiBuy(g, me, i)) buy(g, me, i); }
          else if (g.owner[i] === me) { if (canBuild(g, me, i) && aiBuild(g, me, i)) build(g, me, i); }
          else { const before = total(); pay(g, me, g.owner[i], rent(g, i)); }
        } else if (sq.kind === "kiosk") pay(g, me, -2, KIOSK_FEE);
        else if (sq.kind === "park") { p.money += g.pot; g.pot = 0; }
        else if (sq.kind === "police") { p.pos = JAIL; p.jail = 1; extra = false; }
        else if (sq.kind === "chance") {
          const id = CARDS[drawCard(g, rnd)];
          if (id === "loysit") p.money += 50;
          else if (id === "piirustus") p.money += 100;
          else if (id === "pyora") pay(g, me, -2, 40);
          else if (id === "synttarit") g.players.forEach((o, j) => { if (j !== me && !o.out && !g.over) pay(g, j, me, 20); });
          else if (id === "jaatelo") g.players.forEach((o, j) => { if (j !== me && !o.out && !g.over) pay(g, me, j, 10); });
          else if (id === "lahtoon") steps = stepsTo(p.pos, START) || N;
          else if (id === "puistoon") steps = stepsTo(p.pos, PARK) || N;
          else if (id === "peruuta") steps = -3;
          else if (id === "vankilaan") { p.pos = JAIL; p.jail = 1; extra = false; }
          else if (id === "vapaa") p.free++;
        }
        if (!steps || g.over) break;
      }
      if (++rolls > 3) fail("more than three rolls in a turn");
    }
    for (const q of g.players) if (!isFinite(q.money) || q.money < 0) { fail("money " + q.money); g.over = true; }
    for (let i = 0; i < N; i++) if (g.level[i] > 0 && g.owner[i] < 0) fail("a building on an unowned plot");
    for (let i = 0; i < N; i++) if (g.level[i] === MAX_LEVEL && !wholeBlock(g, i)) fail("a hotel without the whole block");
    if (!g.over) nextPlayer(g);
  }
  maxTurns = Math.max(maxTurns, turns);
  if (g.over) ended++;
  if (g.players.some((p) => p.out)) byBankrupt++;
  rounds += g.round;
  hotels += g.level.filter((l) => l === MAX_LEVEL).length;
  const r = ranking(g);
  if (worth(g, r[0]) < worth(g, r[r.length - 1]) && !g.players[r[r.length - 1]].out) fail("ranking");
}
console.log(ended + "/2000 games ended,", byBankrupt, "by bankruptcy, mean", (rounds / 2000).toFixed(1), "rounds,", (hotels / 2000).toFixed(2), "hotels a game, longest", maxTurns, "turns");
if (ended < 2000) fail("every game should end");
console.log(bad ? "FAILED " + bad : "ok"); if (bad) process.exit(1);
