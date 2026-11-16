// The reading material of Lukuseikkailu (games/lukupeli), written for a
// second grader who already reads sentences but slowly. Every word is a thing
// with a picture (an emoji that old Android phones draw, no variation
// selectors), split into syllables by hand; tests/lukupeli.ts checks the
// splits against the Finnish syllable rule.

export type Word = { s: string; e: string };            // "per-ho-nen", "🦋"
export type Sentence = { t: string; ok: boolean };      // true or false
export type Question = { q: string; a: string[] };      // a[0] is right
export type Story = { id: string; title: string; icon: string; text: string; qs: Question[] };

export const WORDS: Word[] = [
  // one syllable
  { s: "puu", e: "🌳" }, { s: "kuu", e: "🌙" }, { s: "suu", e: "👄" }, { s: "jää", e: "🧊" },
  // two syllables
  { s: "ka-la", e: "🐟" }, { s: "ka-na", e: "🐔" }, { s: "ka-ni", e: "🐇" }, { s: "ta-lo", e: "🏠" },
  { s: "kis-sa", e: "🐱" }, { s: "koi-ra", e: "🐶" }, { s: "au-to", e: "🚗" }, { s: "mu-na", e: "🥚" },
  { s: "tu-li", e: "🔥" }, { s: "tuu-li", e: "💨" }, { s: "lai-va", e: "🚢" }, { s: "kuk-ka", e: "🌸" },
  { s: "kuk-ko", e: "🐓" }, { s: "pal-lo", e: "⚽" }, { s: "pöl-lö", e: "🦉" }, { s: "kak-ku", e: "🎂" },
  { s: "hii-ri", e: "🐭" }, { s: "leh-mä", e: "🐮" }, { s: "sie-ni", e: "🍄" }, { s: "kuu-si", e: "🌲" },
  { s: "jä-nis", e: "🐰" }, { s: "kar-hu", e: "🐻" }, { s: "ket-tu", e: "🦊" }, { s: "ju-na", e: "🚂" },
  { s: "ruu-su", e: "🌹" }, { s: "kir-ja", e: "📖" }, { s: "täh-ti", e: "⭐" }, { s: "sy-dän", e: "💛" },
  { s: "nor-su", e: "🐘" }, { s: "lin-tu", e: "🐦" }, { s: "si-ka", e: "🐷" },
  { s: "bus-si", e: "🚌" }, { s: "kel-lo", e: "⏰" }, { s: "a-vain", e: "🔑" }, { s: "kruu-nu", e: "👑" },
  { s: "lah-ja", e: "🎁" }, { s: "rum-pu", e: "🥁" }, { s: "ken-kä", e: "👟" }, { s: "hat-tu", e: "🎩" },
  { s: "me-ri", e: "🌊" }, { s: "lin-na", e: "🏰" }, { s: "telt-ta", e: "⛺" }, { s: "kou-lu", e: "🏫" },
  { s: "kas-si", e: "👜" }, { s: "suk-laa", e: "🍫" }, { s: "sor-mus", e: "💍" },
  // three syllables
  { s: "o-me-na", e: "🍎" }, { s: "ba-naa-ni", e: "🍌" }, { s: "man-sik-ka", e: "🍓" }, { s: "sam-mak-ko", e: "🐸" },
  { s: "he-vo-nen", e: "🐴" }, { s: "ping-vii-ni", e: "🐧" }, { s: "pe-ru-na", e: "🥔" }, { s: "por-kan-na", e: "🥕" },
  { s: "sit-ruu-na", e: "🍋" }, { s: "a-na-nas", e: "🍍" }, { s: "kir-sik-ka", e: "🍒" }, { s: "ra-ket-ti", e: "🚀" },
  { s: "a-pi-na", e: "🐵" }, { s: "ka-me-li", e: "🐫" }, { s: "per-ho-nen", e: "🦋" }, { s: "e-ta-na", e: "🐌" },
  { s: "lei-jo-na", e: "🦁" }, { s: "tii-ke-ri", e: "🐯" }, { s: "del-fii-ni", e: "🐬" }, { s: "trak-to-ri", e: "🚜" },
  { s: "jää-te-lö", e: "🍦" }, { s: "ku-nin-gas", e: "🤴" }, { s: "ki-ta-ra", e: "🎸" }, { s: "va-sa-ra", e: "🔨" },
  { s: "pu-he-lin", e: "📱" }, { s: "kuk-ka-ro", e: "👛" }, { s: "sai-raa-la", e: "🏥" }, { s: "me-lo-ni", e: "🍉" },
  { s: "pii-rak-ka", e: "🥧" }, { s: "ka-ru-sel-li", e: "🎠" },
  // four or more syllables
  { s: "kil-pi-kon-na", e: "🐢" }, { s: "kro-ko-tii-li", e: "🐊" }, { s: "pol-ku-pyö-rä", e: "🚲" }, { s: "me-hi-läi-nen", e: "🐝" },
  { s: "il-ma-pal-lo", e: "🎈" }, { s: "sa-teen-kaa-ri", e: "🌈" }, { s: "tu-li-vuo-ri", e: "🌋" }, { s: "tie-to-ko-ne", e: "💻" },
  { s: "man-da-rii-ni", e: "🍊" }, { s: "lu-mi-uk-ko", e: "⛄" }, { s: "he-li-kop-te-ri", e: "🚁" }, { s: "vii-ni-ry-pä-le", e: "🍇" },
  { s: "ham-pu-ri-lai-nen", e: "🍔" }, { s: "pa-lo-au-to", e: "🚒" }, { s: "po-lii-si-au-to", e: "🚓" }, { s: "am-bu-lans-si", e: "🚑" },
  { s: "lep-pä-kert-tu", e: "🐞" }, { s: "ki-rah-vi", e: "🦒" }, { s: "kur-pit-sa", e: "🎃" },
];

// sentences to read and judge: true or false. Three steps of length.
export const SENTENCES: Sentence[][] = [
  [
    { t: "Kala ui.", ok: true }, { t: "Kissa lentää.", ok: false }, { t: "Lumi on valkoinen.", ok: true },
    { t: "Koira haukkuu.", ok: true }, { t: "Auto syö.", ok: false }, { t: "Aurinko on kuuma.", ok: true },
    { t: "Lehmä laulaa.", ok: false }, { t: "Jää on kylmää.", ok: true }, { t: "Kivi itkee.", ok: false },
    { t: "Lintu lentää.", ok: true }, { t: "Puu juoksee.", ok: false }, { t: "Banaani on keltainen.", ok: true },
    { t: "Sammakko hyppii.", ok: true }, { t: "Kuu on vihreä.", ok: false }, { t: "Tuli on märkä.", ok: false },
  ],
  [
    { t: "Kala ui järvessä.", ok: true }, { t: "Talvella sataa lunta.", ok: true }, { t: "Hiiri on isompi kuin norsu.", ok: false },
    { t: "Lehmä antaa maitoa.", ok: true }, { t: "Kesällä järvi on jäässä.", ok: false }, { t: "Mansikka on punainen.", ok: true },
    { t: "Junalla on siivet.", ok: false }, { t: "Yöllä taivaalla näkyy tähtiä.", ok: true }, { t: "Porkkana kasvaa puussa.", ok: false },
    { t: "Kissalla on neljä jalkaa.", ok: true }, { t: "Jäätelö on kuumaa.", ok: false }, { t: "Mehiläinen tekee hunajaa.", ok: true },
    { t: "Kanalla on kaksi jalkaa.", ok: true }, { t: "Kirjassa on sivuja.", ok: true }, { t: "Etana juoksee nopeasti.", ok: false },
  ],
  [
    { t: "Kun sataa, maahan tulee lätäköitä.", ok: true }, { t: "Karhu nukkuu talvella pesässään.", ok: true },
    { t: "Viikossa on kymmenen päivää.", ok: false }, { t: "Lentokone lentää korkealla pilvien yllä.", ok: true },
    { t: "Kilpikonna kantaa kotiaan selässään.", ok: true }, { t: "Syksyllä puiden lehdet muuttuvat siniseksi.", ok: false },
    { t: "Pingviini asuu kuumassa aavikossa.", ok: false }, { t: "Hammasharjalla pestään hampaat aamulla ja illalla.", ok: true },
    { t: "Perhonen oli ensin pieni toukka.", ok: true }, { t: "Kirahvilla on lyhyt kaula.", ok: false },
    { t: "Keväällä linnut palaavat etelästä.", ok: true }, { t: "Kahdella kädellä on yhteensä viisi sormea.", ok: false },
    { t: "Lumiukko sulaa, kun aurinko paistaa.", ok: true }, { t: "Kala hengittää ilmaa keuhkoilla.", ok: false },
    { t: "Vuodessa on kaksitoista kuukautta.", ok: true },
  ],
];

// short stories for the minute of reading; three steps of length
export const STORIES: Story[][] = [
  [
    {
      id: "pupu", title: "Pupun porkkana", icon: "🐰",
      text: "Pupu asui metsässä. Pupulla oli nälkä. Se etsi porkkanaa. Porkkana oli pellolla. Pupu hyppäsi pellolle. Siellä oli iso porkkana. Pupu söi porkkanan. Nyt pupulla ei ollut nälkä.",
      qs: [
        { q: "Mistä pupu löysi porkkanan?", a: ["Pellolta", "Järvestä", "Kaupasta"] },
        { q: "Miksi pupu etsi porkkanaa?", a: ["Sillä oli nälkä", "Se halusi leikkiä", "Se oli väsynyt"] },
      ],
    },
    {
      id: "pallo", title: "Punainen pallo", icon: "🎈",
      text: "Mia sai punaisen pallon. Tuuli tuli. Pallo lensi ylös. Se lensi puun yli. Mia juoksi pallon perään. Pallo jäi kiinni puuhun. Isä otti pallon alas. Mia sitoi narun käteensä.",
      qs: [
        { q: "Minkä värinen pallo oli?", a: ["Punainen", "Sininen", "Keltainen"] },
        { q: "Kuka otti pallon alas?", a: ["Isä", "Mia", "Tuuli"] },
      ],
    },
    {
      id: "kissa", title: "Kissa ja lanka", icon: "🐱",
      text: "Kissa löysi langan. Lanka oli sininen. Kissa leikki langalla. Lanka pyöri lattialla. Kissa juoksi perässä. Pian koko huone oli täynnä lankaa. Kissa oli väsynyt. Se nukahti sohvalle.",
      qs: [
        { q: "Minkä värinen lanka oli?", a: ["Sininen", "Vihreä", "Musta"] },
        { q: "Mihin kissa nukahti?", a: ["Sohvalle", "Sänkyyn", "Lattialle"] },
      ],
    },
  ],
  [
    {
      id: "lohi", title: "Pieni lohikäärme", icon: "🐉",
      text: "Vuoren luolassa asui pieni lohikäärme. Se halusi oppia lentämään. Ensin se hyppäsi kiveltä, mutta putosi heti alas. Seuraavana päivänä se yritti uudelleen. Siivet heiluivat vähän paremmin. Joka päivä se harjoitteli. Lopulta lohikäärme nousi korkealle pilvien yläpuolelle. Se oli iloinen, koska ei ollut luovuttanut.",
      qs: [
        { q: "Mitä lohikäärme halusi oppia?", a: ["Lentämään", "Uimaan", "Laulamaan"] },
        { q: "Miksi lohikäärme oppi lopulta?", a: ["Se harjoitteli joka päivä", "Se sai uudet siivet", "Tuuli kantoi sen"] },
      ],
    },
    {
      id: "kalastus", title: "Kalaretki", icon: "🎣",
      text: "Aamulla Eetu ja vaari lähtivät soutuveneellä järvelle. Vaari antoi Eetulle oman ongen. Eetu odotti kauan, mutta kalaa ei kuulunut. Sitten koho painui veden alle. Eetu veti siimaa, ja vedestä nousi iso ahven. Vaari taputti Eetua olalle. Illalla he paistoivat kalan nuotiolla.",
      qs: [
        { q: "Minkä kalan Eetu sai?", a: ["Ahvenen", "Hauen", "Lohen"] },
        { q: "Kenen kanssa Eetu oli järvellä?", a: ["Vaarin", "Äidin", "Ystävän"] },
      ],
    },
    {
      id: "lumi", title: "Ensilumi", icon: "⛄",
      text: "Kun Ella heräsi, ikkunan takana oli valkoista. Yöllä oli satanut ensimmäinen lumi. Ella puki toppahousut ja pipon ja juoksi pihalle. Hän teki lumipallon ja vieritti sitä, kunnes siitä tuli iso. Naapurin poika auttoi nostamaan pään paikalleen. Lumiukko sai porkkananenän ja kivisilmät.",
      qs: [
        { q: "Mitä Ella teki pihalla?", a: ["Lumiukon", "Hiekkalinnan", "Majan"] },
        { q: "Mistä lumiukon nenä tehtiin?", a: ["Porkkanasta", "Kivestä", "Oksasta"] },
      ],
    },
  ],
  [
    {
      id: "kirjasto", title: "Kadonnut kirja", icon: "📚",
      text: "Koulun kirjastosta oli kadonnut kirja, jossa kerrottiin avaruudesta. Opettaja kysyi luokalta, oliko joku nähnyt sitä. Kukaan ei muistanut mitään. Välitunnilla Aino huomasi, että kirjaston ikkunalaudalla istui kissa. Kissan alla oli jotain sinistä. Se oli kadonnut kirja! Kissa oli nukkunut sen päällä koko aamun, koska aurinko lämmitti ikkunalautaa. Aino vei kirjan opettajalle, ja kissa sai jäädä nukkumaan.",
      qs: [
        { q: "Mistä kadonnut kirja kertoi?", a: ["Avaruudesta", "Dinosauruksista", "Merestä"] },
        { q: "Miksi kissa nukkui ikkunalaudalla?", a: ["Aurinko lämmitti sitä", "Se oli piilossa", "Kirja oli pehmeä"] },
      ],
    },
    {
      id: "siili", title: "Siilin talvi", icon: "🦔",
      text: "Syksyllä siili söi paljon matoja, kovakuoriaisia ja marjoja. Sen piti lihoa, jotta se jaksaisi koko talven. Kun ilmat kylmenivät, siili keräsi lehtiä ja heinää kasaan pihan nurkkaan. Se kaivautui kasan sisälle ja käpertyi palloksi. Koko talven siili nukkui syvää unta, eikä se syönyt mitään. Keväällä, kun lumi suli, siili heräsi nälkäisenä ja lähti etsimään ruokaa.",
      qs: [
        { q: "Miksi siili söi syksyllä paljon?", a: ["Jotta se jaksaisi talven", "Koska ruoka loppui", "Koska se oli sairas"] },
        { q: "Milloin siili heräsi?", a: ["Keväällä", "Jouluna", "Syksyllä"] },
      ],
    },
    {
      id: "robotti", title: "Robotti leipoo", icon: "🤖",
      text: "Tomin perhe sai uuden robotin, joka osasi leipoa. Tomi pyysi robottia tekemään mustikkapiirakan. Robotti luki ohjeen, mutta se sekoitti sokerin ja suolan. Piirakka näytti hienolta, mutta se maistui kamalalta. Kaikki nauroivat, ja robotin valot vilkkuivat punaisina. Tomi näytti robotille, kummassa purkissa oli sokeria. Toinen piirakka onnistui niin hyvin, että naapuritkin tulivat maistamaan.",
      qs: [
        { q: "Mikä meni ensimmäisellä kerralla pieleen?", a: ["Sokeri ja suola sekoittuivat", "Uuni oli kylmä", "Mustikat loppuivat"] },
        { q: "Kuka auttoi robottia?", a: ["Tomi", "Naapuri", "Äiti"] },
      ],
    },
  ],
];

export function plain(w: Word): string { return w.s.split("-").join(""); }
export function syllables(w: Word): string[] { return w.s.split("-"); }

// how many syllables a piece of text has (vowel groups that are one syllable:
// long vowels and diphthongs), for how long reading it aloud takes
const VOW = "aeiouyäöå";
const DIPH = ["ai", "ei", "oi", "ui", "yi", "äi", "öi", "au", "eu", "iu", "ou", "ey", "iy", "äy", "öy", "ie", "uo", "yö"];
export function syllableCount(text: string): number {
  const t = text.toLowerCase();
  let n = 0, i = 0;
  while (i < t.length) {
    if (VOW.indexOf(t[i]) < 0) { i++; continue; }
    n++;
    const a = t[i], b = i + 1 < t.length ? t[i + 1] : "";
    if (b === a || DIPH.indexOf(a + b) >= 0) i += 2; else i += 1;
  }
  return Math.max(1, n);
}

// the words of a text (punctuation off), for counting read words
export function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

// edit distance, for distractors that look like the word (kala / kana / kani)
export function distance(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev: number[] = [];
  for (let j = 0; j <= n; j++) prev.push(j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= n; j++) {
      const c = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c));
    }
    prev = cur;
  }
  return prev[n];
}

// words for a step of Sanasalama / Tavuraketti
export function wordPool(mode: "flash" | "syll", step: number): Word[] {
  const n = (w: Word) => syllables(w).length;
  if (mode === "flash") {
    if (step === 0) return WORDS.filter((w) => n(w) <= 2);
    if (step === 1) return WORDS.filter((w) => n(w) === 3);
    return WORDS.filter((w) => n(w) >= 3);
  }
  if (step === 0) return WORDS.filter((w) => n(w) === 2 || n(w) === 3);
  if (step === 1) return WORDS.filter((w) => n(w) === 3 || n(w) === 4);
  return WORDS.filter((w) => n(w) >= 4);
}

// two wrong pictures: far-off ones on the first step, look-alike words later
// (the child has to read every letter: tuli / tuuli, kukka / kukko)
export function distractors(w: Word, step: number, rnd: () => number): Word[] {
  const word = plain(w);
  const others = WORDS.filter((x) => x.e !== w.e && plain(x) !== word);
  const shuffled = others.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t; }
  if (step === 0) return shuffled.slice(0, 2);
  shuffled.sort((a, b) => distance(plain(a), word) - distance(plain(b), word));
  // the nearest look-alike, and on the middle step one random word
  if (step === 1) return [shuffled[0], shuffled[2 + Math.floor(rnd() * (shuffled.length - 2))]];
  return shuffled.slice(0, 2);
}

// a word id for its speech clip: lu_w_<word> (ä→a, ö→o)
export function wordClip(w: Word): string {
  return "lu_w_" + plain(w).replace(/ä/g, "a").replace(/ö/g, "o").replace(/-/g, "_");
}
