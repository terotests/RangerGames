// Copies the speech texts of games/vuodenajat/game.tsx (the T table, ids vj_*)
// into voice/fi.json, so the clips and the texts on the screen stay the same.
//   node tools/vuodenajat/voice.js
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(root, "games/vuodenajat/game.tsx"), "utf8");
const file = path.join(root, "voice/fi.json");
const voice = JSON.parse(fs.readFileSync(file, "utf8"));
let n = 0;
for (const m of src.matchAll(/^\s+(vj_\w+): "([^"]*)",$/gm)) {
  if (voice.clips[m[1]] !== m[2]) n++;
  voice.clips[m[1]] = m[2];
}
fs.writeFileSync(file, JSON.stringify(voice, null, 1) + "\n");
console.log("voice/fi.json: " + n + " vj_ clips added or changed");
