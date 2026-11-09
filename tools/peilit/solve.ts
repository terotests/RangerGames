// Checks every Valopeilit level: it is solvable with the pieces in its tray,
// the fewest pieces it needs (`par`), and that the hint in the level is a
// solution.   node tools/peilit/solve.ts [level number] [--all]
import { parseMap, trace, traceFree, solved } from "../../games/peilit/lib/optics.ts";
import { LEVELS } from "../../games/peilit/lib/levels.ts";

import type { Cell } from "../../games/peilit/lib/optics.ts";
type Put = [number, number, string, number];

function beamCells(g: (Cell | null)[][], rows: string[]): number[][] {
  const tr = trace(g, rows[0].length, rows.length);
  const out: number[][] = [];
  const seen: { [k: string]: boolean } = {};
  for (const s of tr.segs) {
    const n = Math.max(Math.abs(s[2] - s[0]), Math.abs(s[3] - s[1])) * 2;
    for (let k = 0; k <= n; k++) {
      const px = s[0] + ((s[2] - s[0]) * k) / n, py = s[1] + ((s[3] - s[1]) * k) / n;
      if (Math.abs(px % 1 - 0.5) > 1e-6 || Math.abs(py % 1 - 0.5) > 1e-6) continue;
      const x = Math.floor(px), y = Math.floor(py);
      if (rows[y].charAt(x) !== "." || g[y][x] || seen[x + "," + y]) continue;
      seen[x + "," + y] = true;
      out.push([x, y]);
    }
  }
  return out;
}

function search(g: (Cell | null)[][], rows: string[], left: { [k: string]: number }, depth: number, path: Put[], found: Put[][], all: boolean): boolean {
  const tr = trace(g, rows[0].length, rows.length);
  if (solved(g, tr)) { found.push(path.slice()); return !all; }
  if (depth === 0) return false;
  for (const [x, y] of beamCells(g, rows)) {
    for (const kind of ["mirror", "split"]) {
      if (!left[kind]) continue;
      left[kind]--;
      for (let m = 0; m < 8; m++) {
        g[y][x] = { k: kind, m: m };
        path.push([x, y, kind, m]);
        const stop = search(g, rows, left, depth - 1, path, found, all);
        path.pop();
        if (stop) { g[y][x] = null; left[kind]++; return true; }
      }
      g[y][x] = null;
      left[kind]++;
    }
  }
  return false;
}

function solveLevel(lv: any, all: boolean) {
  const rows: string[] = lv.map;
  const turn: number[][] = [];
  const base = parseMap(rows);
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const c = base[y][x];
    if (c && c.fixed && !c.lock) turn.push([x, y]);
  }
  const total = (lv.tray.mirror || 0) + (lv.tray.split || 0);
  for (let depth = 0; depth <= total; depth++) {
    const found: Put[][] = [];
    const combos = Math.pow(8, turn.length);
    let turns: number[] = [];
    for (let i = 0; i < combos; i++) {
      const g = parseMap(rows);
      let v = i;
      const ms: number[] = [];
      for (const [x, y] of turn) { (g[y][x] as Cell).m = v % 8; ms.push(v % 8); v = Math.floor(v / 8); }
      const before = found.length;
      search(g, rows, { mirror: lv.tray.mirror || 0, split: lv.tray.split || 0 }, depth, [], found, all);
      if (found.length > before && !turns.length) turns = ms;
      if (found.length && !all) break;
    }
    if (found.length) return { par: depth, solutions: found, turns: turns, turnCells: turn };
  }
  return null;
}

function checkHint(lv: any): boolean {
  const g = parseMap(lv.map);
  for (const h of lv.hint || []) {
    const [x, y, kind, m] = h;
    const c = g[y][x];
    if (c && c.fixed) c.m = m; else g[y][x] = { k: kind, m: m };
  }
  // the game traces the light at any angle: the hint must solve it there too
  return solved(g, trace(g, lv.map[0].length, lv.map.length)) && solved(g, traceFree(g, lv.map[0].length, lv.map.length) as any);
}

const args = process.argv.slice(2);
const all = args.indexOf("--all") >= 0;
const only = args.filter((a) => a[0] !== "-").map(Number);
let bad = 0;
LEVELS.forEach((lv: any, i: number) => {
  if (only.length && only.indexOf(i + 1) < 0) return;
  const r = solveLevel(lv, all);
  const hintOk = checkHint(lv);
  const used = (lv.hint || []).filter((h: any) => lv.map[h[1]].charAt(h[0]) === ".").length;
  const line = (i + 1) + " " + lv.name.fi + ": " + (r ? "par " + r.par + (all ? ", " + r.solutions.length + " solutions" : "") + " e.g. " + JSON.stringify(r.solutions[0]) + (r.turnCells.length ? " turns " + JSON.stringify(r.turnCells) + "=" + JSON.stringify(r.turns) : "") : "UNSOLVABLE") +
    " | hint " + (hintOk ? "ok" : "BAD") + (lv.par !== undefined && r && lv.par !== r.par ? " | par in level " + lv.par + " != " + r.par : "") + (r && used !== r.par && hintOk ? " | hint uses " + used : "");
  if (!r || !hintOk || (lv.par !== undefined && lv.par !== r.par)) bad++;
  console.log(line);
});
if (bad) { console.log(bad + " level(s) need work"); process.exit(1); }
