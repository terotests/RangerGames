// Copies Kielisaari's English and Spanish sentences (games/kielisaari/lib/texts.ts)
// into voice/en/island.json and voice/es/island.json (clip ids isl_*), so the
// clips and the texts on the screen stay the same. The Finnish is never spoken.
//   node tools/kielisaari/voice.js
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "..");
let src = fs.readFileSync(path.join(root, "games/kielisaari/lib/texts.ts"), "utf8");
// texts.ts is plain data and one function: strip the types and run it
src = src
  .replace(/^export type [\s\S]*?;\n(?=\n|export|\/\/)/gm, "")
  .replace(/^export /gm, "")
  .replace(/: \{ \[id: string\]: Line \}/g, "")
  .replace(/: Word\[\]/g, "")
  .replace(/\(\): \{ \[id: string\]: Line \}/g, "()")
  .replace(/const out = \{\}/, "const out = {}");
const m = {};
new Function("m", src + "\nm.T = T; m.wordLines = wordLines;")(m);
const all = Object.assign({}, m.T, m.wordLines());
for (const lang of ["en", "es"]) {
  const clips = {};
  for (const [id, line] of Object.entries(all)) clips["isl_" + id] = line[lang];
  const file = path.join(root, "voice", lang, "island.json");
  const out = {
    _comment: "Kielisaari (games/kielisaari): generated from games/kielisaari/lib/texts.ts by tools/kielisaari/voice.js; edit the texts there.",
    lang,
    clips,
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
  console.log(file + ": " + Object.keys(clips).length + " clips");
}
