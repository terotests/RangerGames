// Nappulasota's chess puzzles: White to move and mate in one or two. The
// positions are our own, checked by tests/nappulasota.ts with mateIn below,
// so every puzzle has a mate and none is shorter than it says.
import { Game, legalMoves, make, unmake, inCheck } from "lib/chess";

export type Puzzle = { fen: string; n: number };

export const PUZZLES: Puzzle[] = [
  { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", n: 1 },        // the back rank
  { fen: "4k3/8/4K3/8/8/8/8/R7 w - - 0 1", n: 1 },              // king and rook
  { fen: "7k/8/6K1/8/8/8/8/Q7 w - - 0 1", n: 1 },               // king and queen
  { fen: "k7/7R/8/8/8/8/8/K5R1 w - - 0 1", n: 1 },              // two rooks, a ladder
  { fen: "6k1/5p1p/5PpQ/8/8/8/8/6K1 w - - 0 1", n: 1 },         // the queen with her pawn
  { fen: "3r2k1/5ppp/8/8/8/8/5PPP/3RR1K1 w - - 0 1", n: 1 },    // take and mate
  { fen: "7k/R7/5N2/8/8/8/8/6K1 w - - 0 1", n: 1 },             // knight and rook
  { fen: "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1", n: 1 },           // the smothered king
  { fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1", n: 1 }, // the shortest game
  { fen: "7k/8/8/8/8/8/R7/1R4K1 w - - 0 1", n: 2 },             // the ladder in two
  { fen: "k7/8/2K5/8/8/8/8/7R w - - 0 1", n: 2 },               // the king helps the rook
  { fen: "k7/8/8/1K6/8/8/8/6Q1 w - - 0 1", n: 2 },              // the king helps the queen
  { fen: "6k1/6p1/6Kp/8/8/8/8/5Q2 w - - 0 1", n: 2 },
  { fen: "5r1k/6pp/7N/8/8/8/Q7/6K1 w - - 0 1", n: 2 },          // give the queen, then smother
];

// Does the side to move mate within n of its moves, whatever the other side
// answers? (Only for small puzzle positions: it looks at every move.)
export function mateIn(g: Game, n: number): boolean {
  for (const m of legalMoves(g)) {
    make(g, m);
    const ok = matedWithin(g, n - 1);
    unmake(g);
    if (ok) return true;
  }
  return false;
}

// The side to move is mated now, or every move it makes leaves a mate in n.
export function matedWithin(g: Game, n: number): boolean {
  const replies = legalMoves(g);
  if (!replies.length) return inCheck(g, g.side);
  if (n <= 0) return false;
  for (const r of replies) {
    make(g, r);
    const ok = mateIn(g, n);
    unmake(g);
    if (!ok) return false;
  }
  return true;
}

// A good move for a hint: one that keeps the mate within the moves left.
export function solution(g: Game, n: number): number {
  for (const m of legalMoves(g)) {
    make(g, m);
    const ok = matedWithin(g, n - 1);
    unmake(g);
    if (ok) return m;
  }
  return 0;
}
