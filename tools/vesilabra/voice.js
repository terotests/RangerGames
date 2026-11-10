// Copies Vesilabra's spoken texts (the TEXT table between VOICE-BEGIN and
// VOICE-END in games/vesilabra/game.tsx) into the voice files:
// voice/fi.json (the vl_ lines, after vp_tyhja) and voice/en|es/vesilabra.json.
// Run from the repo root: node tools/vesilabra/voice.js
const fs = require("fs");
const src = fs.readFileSync("games/vesilabra/game.tsx", "utf8");
const m = src.match(/\/\/ VOICE-BEGIN\n([\s\S]*?)\/\/ VOICE-END/);
if (!m) throw new Error("no VOICE-BEGIN/VOICE-END block");
const body = m[1].replace(/^const TEXT[^=]*=/m, "return ").replace(/;\s*$/, "");
const TEXT = new Function(body)();
const ids = Object.keys(TEXT);

// Finnish: replace the vl_ lines in place
const fiPath = "voice/fi.json";
let lines = fs.readFileSync(fiPath, "utf8").split("\n").filter(l => !/^  "vl_/.test(l));
const at = lines.findIndex(l => /^  "vp_tyhja"/.test(l));
if (at < 0) throw new Error("vp_tyhja not found in voice/fi.json");
const fi = ids.map(id => "  " + JSON.stringify(id) + ": " + JSON.stringify(TEXT[id][0]) + ",");
lines.splice(at + 1, 0, ...fi);
fs.writeFileSync(fiPath, lines.join("\n"));
JSON.parse(fs.readFileSync(fiPath, "utf8"));

[["en", 1], ["es", 2]].forEach(([lang, i]) => {
  const clips = {};
  for (const id of ids) clips[id] = TEXT[id][i];
  const out = { _comment: "Vesilabra (games/vesilabra): spoken goals, lessons and hints; written by tools/vesilabra/voice.js from the game's TEXT table. The Finnish ones are in voice/fi.json.", lang, clips };
  fs.writeFileSync("voice/" + lang + "/vesilabra.json", JSON.stringify(out, null, 1) + "\n");
});
console.log(ids.length + " clips");
