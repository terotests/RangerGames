// lib/truck.ts: the tipper truck of Työmaa's Kaivuri level, drawn with the
// engine's 3D shapes (our own design, no model file).
//
// Each part is [id, shape, size, along, across, height, colour, kind]:
//   along   along the truck, + towards the back (the cab is at the front, -)
//   across  across the truck
//   kind    undefined: a box (size along, height, across) or an upright cylinder;
//           "wheel": a cylinder whose axle lies across the truck;
//           "along": a cylinder lying along the truck
// The bed's floor and walls keep their ids and sizes: the game's sand and the
// bucket's bumps are measured against them.
const RED = "#d62828", RED2 = "#a4161a", GLASS = "#9ad1f0", CHROME = "#ced4da", DARK = "#2b2d31", TYRE = "#1f2124";
const BED_C = "#f4a261", RIB = "#d9823b", RIM = "#c0682a";

export function truckParts(len: number, wid: number): any[] {
  const h = len / 2, out: any[] = [];
  const add = (...p: any[]) => out.push(p);
  // chassis: two rails and the dark parts under the cab
  for (const s of [-1, 1]) add("tRail" + (s > 0 ? "a" : "b"), "box", [3.9, 0.22, 0.14], -0.75, s * 0.5, 0.62, DARK);
  add("tUnder", "box", [1.2, 0.3, 1.2], -h - 0.8, 0, 0.7, DARK);
  // the cab: a lower body, a narrower top with the windows, a roof
  add("tCab", "box", [1.25, 0.75, 1.62], -h - 0.8, 0, 1.15, RED);
  add("tCabTop", "box", [1.0, 0.56, 1.56], -h - 0.7, 0, 1.8, RED);
  add("tRoof", "box", [1.06, 0.06, 1.62], -h - 0.7, 0, 2.1, RED2);
  add("tWin", "box", [0.04, 0.44, 1.36], -h - 1.205, 0, 1.82, GLASS);
  for (const s of [-1, 1]) {
    const k = s > 0 ? "a" : "b";
    add("tSide" + k, "box", [0.66, 0.38, 0.04], -h - 0.72, s * 0.785, 1.83, GLASS);
    add("tDoor" + k, "box", [0.7, 0.03, 0.03], -h - 0.75, s * 0.815, 1.42, RED2);
    add("tStep" + k, "box", [0.42, 0.06, 0.2], -h - 0.85, s * 0.78, 0.5, CHROME);
    add("tLamp" + k, "box", [0.05, 0.16, 0.26], -h - 1.44, s * 0.6, 1.05, "#fff3b0");
    add("tArm" + k, "box", [0.04, 0.04, 0.16], -h - 1.1, s * 0.87, 1.76, DARK);
    add("tMirror" + k, "box", [0.06, 0.28, 0.12], -h - 1.1, s * 0.98, 1.76, DARK);
    add("tFender" + k, "box", [0.92, 0.06, 0.32], -1.7, s * 0.76, 0.8, DARK);
    add("tFlap" + k, "box", [0.03, 0.34, 0.3], h + 0.2, s * 0.75, 0.42, DARK);
    add("tTail" + k, "box", [0.04, 0.1, 0.18], h + 0.06, s * 0.6, 0.66, "#e5383b");
  }
  // the front: grille with chrome bars, bumper
  add("tGrille", "box", [0.04, 0.5, 0.86], -h - 1.44, 0, 1.0, DARK);
  for (let i = 0; i < 3; i++) add("tBar" + i, "box", [0.05, 0.04, 0.84], -h - 1.45, 0, 0.84 + i * 0.16, CHROME);
  add("tBumper", "box", [0.18, 0.2, 1.72], -h - 1.47, 0, 0.6, "#6c757d");
  // exhaust stack behind the cab, fuel tank on the side
  add("tPipe", "cylinder", [0.06, 0.06, 0.95], -h - 0.12, 0.66, 1.62, CHROME);
  add("tTank", "cylinder", [0.2, 0.2, 0.5], -0.8, -0.6, 0.62, CHROME, "along");
  // the tipper bed: floor and walls (the game measures these), ribs, rims, the ram
  add("tFloor", "box", [len, 0.12, wid], 0, 0, 0.82, RIM);
  add("tWallA", "box", [len, 0.45, 0.07], 0, wid / 2, 1.05, BED_C);
  add("tWallB", "box", [len, 0.45, 0.07], 0, -wid / 2, 1.05, BED_C);
  add("tWallC", "box", [0.07, 0.45, wid], h, 0, 1.05, BED_C);
  add("tWallD", "box", [0.07, 0.45, wid], -h, 0, 1.05, BED_C);
  for (const s of [-1, 1]) {
    const k = s > 0 ? "a" : "b";
    add("tRimS" + k, "box", [len + 0.06, 0.06, 0.11], 0, s * wid / 2, 1.3, RIM);
    for (let i = 0; i < 4; i++) add("tRib" + k + i, "box", [0.06, 0.45, 0.04], -h + 0.3 + i * (len - 0.6) / 3, s * (wid / 2 + 0.05), 1.05, RIB);
  }
  add("tRimF", "box", [0.11, 0.06, wid + 0.06], -h, 0, 1.3, RIM);
  add("tRimB", "box", [0.11, 0.06, wid + 0.06], h, 0, 1.3, RIM);
  add("tRam", "cylinder", [0.07, 0.07, 0.32], -h + 0.25, 0, 0.62, CHROME);
  // wheels: one at the front, two behind; each a tyre, a rim and a hub
  [-1.7, -0.1, 0.8].forEach((al, i) => {
    for (const ac of [-0.75, 0.75]) {
      const k = "tw" + i + (ac > 0 ? "a" : "b");
      add(k, "cylinder", [0.38, 0.38, 0.26], al, ac, 0.38, TYRE, "wheel");
      add(k + "r", "cylinder", [0.21, 0.21, 0.28], al, ac, 0.38, CHROME, "wheel");
      add(k + "h", "cylinder", [0.08, 0.08, 0.3], al, ac, 0.38, "#6c757d", "wheel");
    }
  });
  return out;
}
