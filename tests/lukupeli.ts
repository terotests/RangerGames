// node --experimental-strip-types tests/lukupeli.ts — Lukuseikkailu's words
// (syllable splits by the Finnish rule, pictures unique), sentences, stories
// and the microphone's voice detector on made-up loudness.
import { WORDS, SENTENCES, STORIES, plain, syllables, syllableCount, distractors, wordPool, wordClip, distance } from "../games/lukupeli/lib/data.ts";
import { newEar, hear, resetCount, needVoice, doneReading } from "../games/lukupeli/lib/voice.ts";
let bad = 0;
const fail = (...a: unknown[]) => { console.log("FAIL", ...a); bad++; };
const eq = (a: unknown, b: unknown, what: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(what, JSON.stringify(a), "!=", JSON.stringify(b)); };

// the Finnish syllable rule: a syllable starts at the last consonant before a
// vowel; two vowels part unless long or a diphthong (ie, uo, yö only first)
const V = "aeiouyäö";
const END_I = ["ai", "ei", "oi", "ui", "yi", "äi", "öi", "au", "eu", "iu", "ou", "ey", "iy", "äy", "öy"];
function hyphenate(w: string): string {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < w.length; i++) {
    const c = w[i], isV = V.includes(c);
    if (!isV && i + 1 < w.length && V.includes(w[i + 1]) && /[aeiouyäö]/.test(cur)) { out.push(cur); cur = c; continue; }
    if (isV && cur.length > 0 && V.includes(cur[cur.length - 1])) {
      const p = cur[cur.length - 1], first = out.length === 0;
      const vs = cur.replace(/[^aeiouyäö]/g, "");
      const pair = p + c;
      const joins = vs.length === 1 && (p === c || END_I.includes(pair) || (first && ["ie", "uo", "yö"].includes(pair)));
      if (!joins) { out.push(cur); cur = c; continue; }
    }
    cur += c;
  }
  out.push(cur);
  return out.join("-");
}
eq(hyphenate("kaupunki"), "kau-pun-ki", "rule kaupunki");
eq(hyphenate("perhonen"), "per-ho-nen", "rule perhonen");
eq(hyphenate("lumiukko"), "lu-miuk-ko", "rule (compound breaks it)");
const COMPOUND = ["lu-mi-uk-ko", "pa-lo-au-to", "po-lii-si-au-to", "il-ma-pal-lo", "sa-teen-kaa-ri", "tu-li-vuo-ri", "tie-to-ko-ne", "pol-ku-pyö-rä", "lep-pä-kert-tu", "vii-ni-ry-pä-le"];
const seenE = new Set<string>(), seenW = new Set<string>();
for (const w of WORDS) {
  const p = plain(w);
  if (!COMPOUND.includes(w.s) && hyphenate(p) !== w.s) fail("syllables", w.s, "rule says", hyphenate(p));
  if (seenE.has(w.e)) fail("picture twice", w.e, w.s);
  if (seenW.has(p)) fail("word twice", p);
  seenE.add(w.e); seenW.add(p);
  if (/️/.test(w.e)) fail("variation selector", w.s);
  if (!/^lu_w_[a-z_]+$/.test(wordClip(w))) fail("clip id", wordClip(w));
}
eq(syllableCount("Kala ui järvessä."), 6, "syllables of a sentence");
eq(syllableCount("perhonen"), 3, "syllables perhonen");
eq(distance("tuli", "tuuli"), 1, "distance");

// pools are big enough for a round of 8 without repeats, distractors never the word
for (const m of ["flash", "syll"] as const) for (let s = 0; s < 3; s++) {
  const pool = wordPool(m, s);
  if (pool.length < 10) fail("pool small", m, s, pool.length);
}
let r = 7;
const rnd = () => { r = (r * 48271) % 2147483647; return r / 2147483647; };
for (const w of WORDS) for (let s = 0; s < 3; s++) {
  const d = distractors(w, s, rnd);
  if (d.length !== 2 || d.some((x) => x.e === w.e) || d[0].e === d[1].e) fail("distractors", w.s, s);
}
eq(distractors({ s: "tu-li", e: "🔥" }, 2, rnd).map(plain).includes("tuuli"), true, "tuli's look-alike is tuuli");

for (const list of SENTENCES) {
  if (list.length < 10) fail("sentences few");
  const t = list.filter((x) => x.ok).length;
  if (t < 4 || list.length - t < 4) fail("true/false balance", t, list.length - t);
}
for (const list of STORIES) for (const s of list) {
  if (s.qs.length < 2) fail("story questions", s.id);
  for (const q of s.qs) if (new Set(q.a).size !== 3) fail("answers", s.id, q.q);
  if (/Iida|Leevi/.test(s.text)) fail("private name in a story", s.id);
}

// the voice detector: a quiet room, then a voice in bursts
const ear = newEar();
const feed = (db: number, n: number, talk = false) => { for (let i = 0; i < n; i++) hear(ear, db + (i % 3) * 0.5, talk, 0.05); };
feed(-58, 20);
if (ear.on || ear.bursts) fail("quiet room heard as voice");
resetCount(ear);
for (let k = 0; k < 4; k++) { feed(-30, 6); feed(-57, 4); }        // four syllables, 0.3 s each
eq(ear.bursts, 4, "four bursts");
if (Math.abs(ear.voiced - 1.2) > 0.21) fail("voiced time", ear.voiced);
if (ear.voiced < needVoice(4)) fail("four syllables are enough");
// the phone's own speech is not counted
resetCount(ear);
feed(-25, 20, true);
feed(-57, 4);                       // still muted for a moment after
eq(ear.bursts, 0, "own voice ignored");
// a loud steady room: the floor follows, the hum is not a voice forever
const e2 = newEar();
for (let i = 0; i < 12; i++) hear(e2, -40, false, 0.05);
resetCount(e2);
for (let i = 0; i < 200; i++) hear(e2, -40 + (i % 2), false, 0.05);
if (e2.voiced > 0.5) fail("steady hum heard as voice", e2.voiced);
for (let i = 0; i < 8; i++) hear(e2, -22, false, 0.05);
if (!e2.on) fail("voice over a hum not heard");

// slow readers: syllables and words with long pauses must not end listening
{
  const e = newEar();
  const f = (db: number, n: number) => { let d = false; for (let i = 0; i < n; i++) { hear(e, db + (i % 3) * 0.5, false, 0.05); d = d || doneReading(e, n5); } return d; };
  const n5 = syllableCount("Sammakko hyppii."); // 5
  f(-58, 20); resetCount(e);
  let ended = false;
  for (const _ of ["sam", "mak", "ko"]) { ended = f(-30, 6) || ended; ended = f(-57, 24) || ended; }   // 1.2 s pauses
  ended = f(-57, 30) || ended;                                                                        // 1.5 s more thinking
  if (ended) fail("listening ended in the middle of Sammakko hyppii");
  ended = f(-30, 6) || ended; ended = f(-57, 10) || ended; ended = f(-30, 6) || ended;               // hyp pii
  if (ended) fail("ended before the pause after the last syllable");
  if (!f(-57, 45)) fail("did not end after the sentence and a pause");
}
{
  const e = newEar();
  const n = syllableCount("Jää on kylmää.");
  const f = (db: number, k: number) => { let d = false; for (let i = 0; i < k; i++) { hear(e, db + (i % 3) * 0.5, false, 0.05); d = d || doneReading(e, n); } return d; };
  f(-58, 20); resetCount(e);
  let ended = f(-30, 8) || f(-57, 36);           // "jää", then 1.8 s
  ended = f(-30, 5) || f(-57, 36) || ended;     // "on", 1.8 s
  if (ended) fail("listening ended after the first words of Jää on kylmää");
  f(-30, 6); f(-57, 3); f(-30, 6);              // kyl-mää
  if (!f(-57, 45)) fail("Jää on kylmää not finished");
}

if (bad) { console.log(bad + " failed"); process.exit(1); }
console.log("lukupeli ok");
