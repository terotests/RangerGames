// GENERATED from tools/kortteli/template/lib/rules.ts by tools/kortteli/sync.sh: edit that file, not this copy.
// lib/rules.ts: the rules of Korttelikauppa, without any drawing or speech, so
// that tests/kortteli.ts can play whole games with node.
//
// The board is a ring of 24 squares: four corners (start, jail, park, police)
// and between them 16 plots in 8 blocks of two (a "kortteli"), three surprise
// squares and an ice cream kiosk. A plot can be bought; on an own plot you
// build a hut, a house, a block of flats and, when you own the whole block, a
// hotel. Whoever lands on someone else's plot pays rent. Passing the start
// gives 150 €. Fees go into the park, and whoever stops in the park finds them.
// The game ends after the chosen number of rounds, or when someone cannot pay:
// the richest (money + plots + buildings) wins.

export const N = 24;
export const START = 0, JAIL = 6, PARK = 12, POLICE = 18, KIOSK = 9;
export const START_MONEY = 1000, PASS_BONUS = 150, JAIL_FINE = 50, KIOSK_FEE = 20;
export const MAX_LEVEL = 4;                // 1 hut, 2 house, 3 flats, 4 hotel
export const MAX_ROUNDS = 50;               // "to the end" ends here at the latest
export const RENT_MULT = [1, 3, 6, 10, 15];

export type Sq = { kind: string; id: string; block: number; price: number };
// [id, price] of the plots, in board order, two per block
const PLOTS: any[] = [
  ["siili", 60], ["myyra", 60], ["kala", 100], ["simpukka", 120], ["perhonen", 140], ["kukka", 160], ["kettu", 180], ["orava", 200],
  ["mansikka", 220], ["kirsikka", 240], ["aurinko", 260], ["banaani", 280], ["sammakko", 300], ["omena", 320], ["valas", 350], ["meri", 400],
];
export const BLOCK_COLORS = ["#8d5a2b", "#5dade2", "#e84393", "#f39c12", "#e74c3c", "#f1c40f", "#27ae60", "#2e59d9"];

function board(): Sq[] {
  const kinds: any = { 0: "start", 3: "chance", 6: "jail", 9: "kiosk", 12: "park", 15: "chance", 18: "police", 21: "chance" };
  const out: Sq[] = [];
  let k = 0;
  for (let i = 0; i < N; i++) {
    if (kinds[i]) { out.push({ kind: kinds[i], id: kinds[i], block: -1, price: 0 }); continue; }
    out.push({ kind: "plot", id: PLOTS[k][0], block: Math.floor(k / 2), price: PLOTS[k][1] });
    k++;
  }
  return out;
}
export const SQ: Sq[] = board();

function round5(x: number): number { return Math.max(5, Math.round(x / 5) * 5); }
export function baseRent(i: number): number { return round5(SQ[i].price / 10); }
export function buildCost(i: number): number { return Math.round(SQ[i].price / 20) * 10; }

// the surprise cards
export const CARDS = ["loysit", "synttarit", "pyora", "piirustus", "lahtoon", "vankilaan", "peruuta", "vapaa", "puistoon", "jaatelo"];

export type Player = { tok: number; name?: string; ai: boolean; pos: number; money: number; jail: number; free: number; out: boolean };
export type Game = { players: Player[]; owner: number[]; level: number[]; pot: number; cur: number; round: number; rounds: number; deck: number[]; doubles: number; over: boolean };

export function newGame(toks: number[], ais: boolean[], rounds: number, rnd: () => number): Game {
  const players: Player[] = toks.map((t, i) => ({ tok: t, ai: ais[i], pos: START, money: START_MONEY, jail: 0, free: 0, out: false }));
  const owner: number[] = [], level: number[] = [];
  for (let i = 0; i < N; i++) { owner.push(-1); level.push(0); }
  return { players, owner, level, pot: 0, cur: 0, round: 1, rounds, deck: shuffle(CARDS.map((_, i) => i), rnd), doubles: 0, over: false };
}
export function shuffle(a: number[], rnd: () => number): number[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

export function blockOf(b: number): number[] { const out: number[] = []; for (let i = 0; i < N; i++) if (SQ[i].block === b) out.push(i); return out; }
// does the owner of plot i own its whole block?
export function wholeBlock(g: Game, i: number): boolean {
  const o = g.owner[i];
  return o >= 0 && blockOf(SQ[i].block).every((j) => g.owner[j] === o);
}
export function rent(g: Game, i: number): number {
  const l = g.level[i];
  if (l === 0 && wholeBlock(g, i)) return baseRent(i) * 2;
  return baseRent(i) * RENT_MULT[l];
}
export function rentAt(i: number, level: number): number { return baseRent(i) * RENT_MULT[level]; }
// can player p build one level more on plot i (money aside)?
export function canBuild(g: Game, p: number, i: number): boolean {
  if (SQ[i].kind !== "plot" || g.owner[i] !== p) return false;
  const l = g.level[i];
  if (l >= MAX_LEVEL) return false;
  if (l === MAX_LEVEL - 1 && !wholeBlock(g, i)) return false;   // a hotel needs the whole block
  return true;
}
export function buildable(g: Game, p: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < N; i++) if (canBuild(g, p, i)) out.push(i);
  return out;
}
export function owned(g: Game, p: number): number[] { const out: number[] = []; for (let i = 0; i < N; i++) if (g.owner[i] === p) out.push(i); return out; }
export function worth(g: Game, p: number): number {
  let w = g.players[p].money;
  for (const i of owned(g, p)) w += SQ[i].price + g.level[i] * buildCost(i);
  return w;
}

export function buy(g: Game, p: number, i: number): boolean {
  const pl = g.players[p];
  if (g.owner[i] >= 0 || SQ[i].kind !== "plot" || pl.money < SQ[i].price) return false;
  pl.money -= SQ[i].price;
  g.owner[i] = p;
  return true;
}
export function build(g: Game, p: number, i: number): boolean {
  const pl = g.players[p];
  if (!canBuild(g, p, i) || pl.money < buildCost(i)) return false;
  pl.money -= buildCost(i);
  g.level[i]++;
  return true;
}

// a payment: to >= 0 a player, -1 the bank, -2 the park. If the money is not
// enough, buildings and then plots are sold back to the bank at half price;
// if even that is not enough, the player is out (and the game is over).
// Returns what was sold, for the screen: [plot, levels sold (-1 = the plot)]
export function pay(g: Game, from: number, to: number, amount: number): number[][] {
  const pl = g.players[from];
  const sold: number[][] = [];
  while (pl.money < amount) {
    const mine = owned(g, from);
    if (!mine.length) break;
    // sell the cheapest thing first: a building, then a plot
    const built = mine.filter((i) => g.level[i] > 0);
    if (built.length) {
      built.sort((a, b) => buildCost(a) - buildCost(b));
      const i = built[0];
      g.level[i]--;
      pl.money += buildCost(i) / 2;
      sold.push([i, 1]);
    } else {
      mine.sort((a, b) => SQ[a].price - SQ[b].price);
      const i = mine[0];
      g.owner[i] = -1;
      pl.money += SQ[i].price / 2;
      sold.push([i, -1]);
    }
  }
  const paid = Math.min(amount, pl.money);
  pl.money -= paid;
  if (to >= 0) g.players[to].money += paid;
  else if (to === -2) g.pot += paid;
  if (paid < amount) { pl.out = true; g.over = true; }
  return sold;
}

// the steps of a move from `from`, n steps (negative: backwards)
export function path(from: number, n: number): number[] {
  const out: number[] = [];
  let p = from;
  for (let k = 0; k < Math.abs(n); k++) { p = (p + (n > 0 ? 1 : N - 1)) % N; out.push(p); }
  return out;
}
export function stepsTo(from: number, to: number): number { return ((to - from) % N + N) % N; }

export function drawCard(g: Game, rnd: () => number): number {
  if (!g.deck.length) g.deck = shuffle(CARDS.map((_, i) => i), rnd);
  const c = g.deck.shift();
  return c;
}

// the players in the order of the end: richest first
export function ranking(g: Game): number[] {
  const idx = g.players.map((_, i) => i);
  idx.sort((a, b) => (g.players[a].out ? 1 : 0) - (g.players[b].out ? 1 : 0) || worth(g, b) - worth(g, a));
  return idx;
}
export function nextPlayer(g: Game) {
  const n = g.players.length;
  for (let k = 1; k <= n; k++) {
    const c = (g.cur + k) % n;
    if (!g.players[c].out) {
      if (c <= g.cur) { g.round++; if (g.round > (g.rounds > 0 ? g.rounds : MAX_ROUNDS)) g.over = true; }
      g.cur = c;
      g.doubles = 0;
      return;
    }
  }
}

// ---- the phone's choices ---------------------------------------------------
export function aiBuy(g: Game, p: number, i: number): boolean {
  const pl = g.players[p], left = pl.money - SQ[i].price;
  const completes = blockOf(SQ[i].block).every((j) => j === i || g.owner[j] === p);
  return left >= (completes ? 40 : 120);
}
export function aiBuild(g: Game, p: number, i: number): boolean { return g.players[p].money - buildCost(i) >= 160; }
// what to build before a roll (the dearest first), at most two
export function aiPlan(g: Game, p: number): number[] {
  const out: number[] = [];
  let money = g.players[p].money;
  const can = buildable(g, p).sort((a, b) => SQ[b].price - SQ[a].price);
  for (const i of can) if (out.length < 2 && money - buildCost(i) >= 300) { out.push(i); money -= buildCost(i); }
  return out;
}
export function aiJail(g: Game, p: number): string {
  const pl = g.players[p];
  if (pl.free > 0) return "free";
  return pl.money >= 300 ? "pay" : "roll";
}
