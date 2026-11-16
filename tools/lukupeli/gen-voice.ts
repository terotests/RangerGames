// node --experimental-strip-types tools/lukupeli/gen-voice.ts
// Writes the speech of Lukuseikkailu (games/lukupeli) into voice/fi.json: the
// instructions, every word (lu_w_), sentence (lu_s_<step>_<i>), story (lu_t_)
// and story question (lu_q_) from games/lukupeli/lib/data.ts, so the model
// reading after the child's answer is exactly the text on the screen. The game
// teaches reading Finnish, so there are no English or Spanish clips (rg.say
// falls back to Finnish).
import * as fs from "node:fs";
import { WORDS, SENTENCES, STORIES, plain, wordClip } from "../../games/lukupeli/lib/data.ts";

const TEXT: Record<string, string> = {
  peli_lukupeli: "Lukuseikkailu",
  lu_tervetuloa: "Tervetuloa lukuseikkailuun! Valitse peli. Lue ääneen, niin mikrofoni kuulee.",
  lu_lue_sana: "Lue sana ääneen.",
  lu_mika_kuva: "Mikä kuva sopii sanaan?",
  lu_lue_tavut: "Lue tavut ääneen, yksi kerrallaan.",
  lu_lue_koko: "Lue nyt koko sana.",
  lu_lue_lause: "Lue lause ääneen.",
  lu_totta_tarua: "Onko se totta vai tarua?",
  lu_lue_uudestaan: "Lue vielä kerran tarkasti.",
  lu_tarina_alku: "Lue tarina ääneen. Sinulla on minuutti aikaa. Paina aloita, kun olet valmis.",
  lu_mihin: "Aika loppui! Napauta sanaa, johon pääsit.",
  lu_kysymys: "Kysymys.",
  lu_luit: "Luit",
  lu_sanaa_minuutissa: "sanaa minuutissa.",
};

const clips: Record<string, string> = { ...TEXT };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
for (const w of WORDS) {
  const id = wordClip(w);
  if (clips[id]) throw new Error("clip id twice: " + id);
  clips[id] = cap(plain(w)) + ".";
}
SENTENCES.forEach((list, s) => list.forEach((x, i) => { clips["lu_s_" + s + "_" + i] = x.t; }));
for (const list of STORIES) for (const st of list) {
  clips["lu_t_" + st.id] = st.title + ". " + st.text;
  st.qs.forEach((q, i) => { clips["lu_q_" + st.id + "_" + i] = q.q; });
}

const fiPath = "voice/fi.json";
const fi = JSON.parse(fs.readFileSync(fiPath, "utf8"));
for (const k of Object.keys(fi.clips)) if (k.startsWith("lu_") || k === "peli_lukupeli") delete fi.clips[k];
Object.assign(fi.clips, clips);
fs.writeFileSync(fiPath, JSON.stringify(fi, null, 1) + "\n");
console.log("lu_ clips:", Object.keys(clips).length);
