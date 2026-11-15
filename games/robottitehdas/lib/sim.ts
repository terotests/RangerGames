// The factory's rules without pictures, so tests/robottitehdas.ts can check them.

// ---- level 1: the order of the line --------------------------------------------
export const ORDER = ["sekoitus", "muotti", "uuni", "koriste", "paketti"];
export function lineFor(n: number): string[] {
  if (n <= 3) return ["sekoitus", "uuni", "paketti"];
  if (n === 4) return ["sekoitus", "muotti", "uuni", "paketti"];
  return ORDER.slice(0);
}

// what a cookie has been through
export type Cookie = { mixed: boolean; shaped: boolean; baked: number; deco: number; boxed: boolean; flour: boolean; broken: boolean; lumpy: boolean; blocked: boolean };
export function raw(): Cookie { return { mixed: false, shaped: false, baked: 0, deco: 0, boxed: false, flour: false, broken: false, lumpy: false, blocked: false }; }

// one robot does its job on the cookie (whatever state it is in)
export function apply(c: Cookie, st: string) {
  if (c.boxed) { c.blocked = true; return; }          // it cannot reach into a closed box
  if (st === "sekoitus") { if (c.baked) c.broken = true; else c.mixed = true; }
  else if (st === "muotti") { if (!c.mixed) c.flour = true; else if (c.baked) c.broken = true; else c.shaped = true; }
  else if (st === "uuni") { c.baked = c.mixed ? (c.baked ? 2 : 1) : 2; if (c.deco) c.deco = 2; }
  else if (st === "koriste") { c.deco = 1; }
  else if (st === "paketti") { c.boxed = true; }
}

export function good(c: Cookie, n: number): boolean {
  return c.mixed && c.baked === 1 && c.boxed && !c.flour && !c.broken && !c.blocked && (n < 4 || c.shaped) && (n < 5 || c.deco === 1);
}

export function runLine(line: string[]): Cookie {
  const c = raw();
  for (const st of line) apply(c, st);
  return c;
}

// ---- level 4: the bottleneck ----------------------------------------------------
// stations[i] = seconds one robot needs for one cookie; workers[i] robots at it.
// The first station takes from an endless pile of flour. Returns the cookies
// that came out of the last station in `day` seconds, and the longest queue
// each station had (the pile in front of it).
export type Sim = { times: number[]; queue: number[]; busy: number[][]; longest: number[]; out: number; t: number; acc: number };
export function makeSim(times: number[], workers: number[]): Sim {
  const s: Sim = { times, queue: [], busy: [], longest: [], out: 0, t: 0, acc: 0 };
  for (let i = 0; i < times.length; i++) { s.queue.push(0); s.busy.push([]); s.longest.push(0); for (let k = 0; k < workers[i]; k++) s.busy[i].push(-1); }
  return s;
}
// advances the factory by `dt` seconds, in fixed small steps so it always counts the same
export function stepSim(s: Sim, dt: number) {
  const h = 0.05;
  s.acc += dt;
  while (s.acc >= h - 1e-9) {
    s.acc -= h;
    s.t += h;
    const n = s.times.length;
    for (let i = n - 1; i >= 0; i--) {
      const b = s.busy[i];
      for (let k = 0; k < b.length; k++) {
        if (b[k] >= 0) {
          b[k] -= h;
          if (b[k] <= 1e-9) { b[k] = -1; if (i === n - 1) s.out++; else s.queue[i + 1]++; }
        }
        if (b[k] < 0 && (i === 0 || s.queue[i] > 0)) { if (i > 0) s.queue[i]--; b[k] = s.times[i]; }
      }
      s.longest[i] = Math.max(s.longest[i], s.queue[i]);
    }
  }
}
export function simulate(times: number[], workers: number[], day: number) {
  const s = makeSim(times, workers);
  for (let k = 0; k < Math.round(day / 0.05); k++) stepSim(s, 0.05);
  return { out: s.out, longest: s.longest };
}

// the most cookies `extra` helper robots can give, and where they go
export function best(times: number[], extra: number, day: number) {
  let top = -1, where: number[] = [];
  const n = times.length;
  const tryAll = (i: number, left: number, w: number[]) => {
    if (i === n - 1) { const ww = w.concat([1 + left]); const r = simulate(times, ww, day).out; if (r > top) { top = r; where = ww; } return; }
    for (let k = 0; k <= left; k++) tryAll(i + 1, left - k, w.concat([1 + k]));
  };
  tryAll(0, extra, []);
  return { out: top, workers: where };
}
