// Shakki's rules and computer player: node --experimental-strip-types tests/shakki.ts
// Perft counts (all legal move sequences to a depth) against the known values
// of the standard test positions, which cover castling, en passant,
// promotion and checks; then each level must find a mate in one.
import { newGame, perft, think, san, status, play } from "../games/shakki/lib/chess.ts";

let failed = 0;
const cases: [string, number, number][] = [
  ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 4, 197281],
  ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 3, 97862],
  ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 5, 674624],
  ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 4, 422333],
  ["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 3, 62379],
];
for (const [fen, depth, want] of cases) {
  const got = perft(newGame(fen), depth);
  if (got !== want) failed++;
  console.log(got === want ? "ok  " : "FAIL", "perft", depth, got, "(" + want + ")", fen);
}
let seed = 5;
const rand = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
for (const level of [1, 2, 3] as const) {
  const g = newGame("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1");
  const m = think(g, level, rand, 25000);
  const name = san(g, m);
  play(g, m);
  const ok = status(g) === "mate";
  if (!ok) failed++;
  console.log(ok ? "ok  " : "FAIL", "level", level, "mates in one:", name);
}
for (const [fen, want] of [["7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", "stalemate"], ["8/8/8/4k3/8/8/2B5/4K3 w - - 0 1", "material"]]) {
  const got = status(newGame(fen));
  if (got !== want) failed++;
  console.log(got === want ? "ok  " : "FAIL", "status", got, fen);
}
if (failed) { console.log(failed + " failed"); process.exit(1); }
