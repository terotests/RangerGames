#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The speech clips of games/marsiin from its texts (games/marsiin/lib/texts.ts):
//   node tools/three/marsiin-voice.mjs → mm_* ids in voice/fi.json, voice/en/marsiin.json, voice/es/marsiin.json
// mm_t_<task> the task, mm_f_<task> its fact, mm_m_<module> the module's name,
// mm_c_<n> what the crew say, and the events' lines.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(ROOT, "games/marsiin/lib/texts.ts"), "utf8")
  .replace(/export type \w+ = \{[^}]*\};?/g, "").replace(/export type \w+ = [^;{]+;/g, "")
  .replace(/export const (\w+)\s*:[^=]+=/g, "export const $1 =");
const tmp = path.join(ROOT, "target", "marsiin-texts.mjs");
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, src);
const T = await import(tmp + "?" + Date.now());

const clips = [{}, {}, {}];
const put = (id, t3) => { for (let k = 0; k < 3; k++) if (t3[k]) clips[k][id] = t3[k]; };
for (const [id, def] of Object.entries(T.TASKS)) {
  put("mm_t_" + id, def.name.map((s) => s.replace(/\s*\(([^)]*)\)/, ", $1") + "."));
  if (def.fact[0]) put("mm_f_" + id, def.fact);
}
for (const [id, m] of Object.entries(T.MODULE_TEXT)) put("mm_m_" + id, m.name.map((s) => s.replace(" · ", ", ") + "."));
T.CREW_SAYS.forEach((s, i) => put("mm_c_" + i, s));
const S = T.SAY;
put("mm_intro", S.intro); put("mm_moottorit", S.burnSoon); put("mm_suunta_mars", S.burnDepart); put("mm_perilla", S.burnArrive);
put("mm_myrsky", S.storm); put("mm_vuoto", S.leak); put("mm_kaikki_tehty", S.goSleep); put("mm_loppu", S.end);
put("mm_hyvaa_yota", ["Hyvää yötä!", "Good night!", "¡Buenas noches!"]);

// Finnish: into voice/fi.json (the old mm_ ids replaced)
const fiFile = path.join(ROOT, "voice/fi.json");
const fi = JSON.parse(fs.readFileSync(fiFile, "utf8"));
for (const k of Object.keys(fi.clips)) if (k.startsWith("mm_")) delete fi.clips[k];
Object.assign(fi.clips, clips[0]);
fs.writeFileSync(fiFile, JSON.stringify(fi, null, 1) + "\n");
for (const [k, lang] of [[1, "en"], [2, "es"]]) {
  const file = path.join(ROOT, "voice", lang, "marsiin.json");
  // English words need ASCII (the English voice reads Finnish names badly otherwise)
  const c = {};
  for (const [id, s] of Object.entries(clips[k])) c[id] = lang === "en" ? s.replace(/₂/g, "2").normalize("NFD").replace(/[̀-ͯ]/g, "") : s.replace(/₂/g, "2");
  fs.writeFileSync(file, JSON.stringify({ _comment: "Matka Marsiin (games/marsiin): made by tools/three/marsiin-voice.mjs from lib/texts.ts; the Finnish ones are in voice/fi.json.", lang, clips: c }, null, 1) + "\n");
}
console.log("clips:", Object.keys(clips[0]).length, "fi,", Object.keys(clips[1]).length, "en,", Object.keys(clips[2]).length, "es");
