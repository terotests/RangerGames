// Vuodenajat: the rhythm of the Finnish year through its animals.
//
// One scene, seen from the side: a forest edge on top (a spruce with the
// bear's den under its roots, a leaf pile, a badger's burrow, a birch with a
// squirrel's hole) and a lake below it, down to its muddy bottom. The scene
// follows the seasons: in winter the ground is under snow and the lake is
// under ice, in spring the floes melt away.
//
// "Vuoden kierros" goes through one year, spring to winter, with a few tasks
// in every season: wake the bear, pick the hare's / stoat's / ptarmigan's coat
// for the season (the wrong one would show from far away), which bird flies
// south, help the squirrel and the jay store food for the winter, put every
// animal to its winter bed, fish from a boat in summer and through the ice in
// winter (the burbot spawns under the ice). "Katsele" lets a child flip the
// seasons and tap the animals to hear what each one does then.
//
// Every instruction is spoken (rg.say, voice/fi.json clips vj_*), so no
// reading is needed. The texts below are the clips' texts too:
// tools/vuodenajat/voice.js copies them into voice/fi.json.
// The pictures are our own drawings (tools/vuodenajat/art.js → img/*.png); the
// fish are Onkipeli's drawings.

const T: { [id: string]: string } = {
  vj_nimi: "Vuodenajat. Mitä eläimet tekevät kesällä ja talvella?",
  vj_katsele: "Valitse vuodenaika ja napauta eläimiä.",
  vj_kevat_tuli: "Kevät tuli! Lumi sulaa, ja jäät lähtevät järvestä.",
  vj_kesa_tuli: "Nyt on kesä. On lämmintä, ja kaikkialla kasvaa.",
  vj_syksy_tuli: "Syksy tuli. Lehdet putoavat, ja eläimet valmistautuvat talveen.",
  vj_talvi_tuli: "Talvi tuli. Maa on lumen alla, ja järvi on jäässä.",
  vj_heraa: "Karhu nukkuu vielä talvipesässään. Herätä karhu: napauta pesää.",
  vj_heraa_ok: "Karhu heräsi talviunesta. Sillä on kova nälkä!",
  vj_q_janis_kesa: "Millainen turkki jäniksellä on kesällä?",
  vj_q_janis_talvi: "Millainen turkki jäniksellä on talvella?",
  vj_q_karppa_kesa: "Millainen turkki kärpällä on kesällä?",
  vj_q_karppa_talvi: "Millainen turkki kärpällä on talvella?",
  vj_q_riekko_kesa: "Millainen höyhenpuku riekolla on kesällä?",
  vj_q_riekko_talvi: "Millainen höyhenpuku riekolla on talvella?",
  vj_f_janis_kesa: "Kesällä jänis on ruskea. Silloin se ei näy metsässä.",
  vj_f_janis_talvi: "Talvella jänis on valkoinen kuin lumi. Kettu ei huomaa sitä.",
  vj_f_karppa_kesa: "Kesällä kärppä on ruskea, ja sen vatsa on valkoinen.",
  vj_f_karppa_talvi: "Talvella kärppä on valkoinen. Vain hännän pää on musta.",
  vj_f_riekko_kesa: "Kesällä riekko on ruskea kuin suo ja kanerva.",
  vj_f_riekko_talvi: "Talvella riekko on valkoinen. Sen karvaiset jalat ovat kuin lumikengät.",
  vj_vaara_turkki: "Hups! Tuolla turkilla eläin näkyisi kauas. Kokeile toista.",
  vj_q_palaa: "Linnut palaavat etelästä. Mikä lintu palasi?",
  vj_q_lahtee: "Mikä lintu lentää etelään talveksi?",
  vj_f_kurki_palaa: "Kurki palasi etelästä. Se pesii suolla koko kesän.",
  vj_f_paasky_palaa: "Pääsky palasi etelästä. Se syö lentäviä hyönteisiä.",
  vj_f_kurki_lahtee: "Kurjet lentävät syksyllä etelään, kauas lämpimään.",
  vj_f_paasky_lahtee: "Talvella ei ole hyönteisiä. Siksi pääsky lentää etelään.",
  vj_vaara_tiainen: "Talitiainen ei lähde. Se on Suomessa koko talven.",
  vj_vaara_narhi: "Närhi ei lähde. Se jää talveksi ja syö kätköjään.",
  vj_orava_keraa: "Orava kerää ruokaa talveksi. Vie kävyt ja pähkinä oravan koloon ja sienet oksalle kuivumaan.",
  vj_orava_valmis: "Hienoa! Nyt oravalla on ruokaa koko talveksi.",
  vj_narhi_katkee: "Närhi piilottaa tammenterhoja sammaleeseen. Vie terhot sammaleeseen.",
  vj_narhi_valmis: "Närhi muistaa kätkönsä ja löytää ne talvella lumen alta.",
  vj_vihje_kolo: "Tämä menee oravan koloon.",
  vj_vihje_oksa: "Tämä menee oksalle kuivumaan.",
  vj_vihje_sammal: "Tämä menee sammaleeseen.",
  vj_ei_sinne: "Ei sinne. Kokeile toista paikkaa.",
  vj_q_karhu: "Missä karhu nukkuu talvella? Vie karhu sen talvipesään.",
  vj_q_siili: "Missä siili nukkuu talvella?",
  vj_q_mayra: "Missä mäyrä nukkuu talvella?",
  vj_q_sammakko: "Missä sammakko nukkuu talvella?",
  vj_q_orava: "Missä orava nukkuu talvella?",
  vj_f_karhu: "Karhu nukkuu talviunta pesässä kuusen juurella.",
  vj_f_siili: "Siili nukkuu talviunta lehtikasan alla.",
  vj_f_mayra: "Mäyrä nukkuu talven maan alla kolossaan.",
  vj_f_sammakko: "Sammakko nukkuu talven järven pohjassa mudassa.",
  vj_f_orava: "Orava ei nuku talviunta. Se nukkuu puun kolossa ja syö varastojaan.",
  vj_ongi_ahven: "Ongi ahven! Pidä sormea vedessä, niin koukku laskeutuu. Päästä irti kalan suun kohdalla.",
  vj_kairaa: "Järvi on jäässä. Tee jäähän reikä: napauta jäätä monta kertaa.",
  vj_ongi_made: "Nyt voit pilkkiä. Ongi made!",
  vj_f_ahven: "Ahven ui kesällä lämpimässä rantavedessä.",
  vj_f_made: "Made kutee keskellä talvea jään alla. Jään alla vesi ei jäädy.",
  vj_vaara_kala: "Tuo oli väärä kala. Etsi oikea kala.",
  vj_vuosi_valmis: "Vuosi on kierretty! Kevät, kesä, syksy ja talvi.",
  vj_e_janis_kevat: "Keväällä jäniksen valkoinen turkki vaihtuu ruskeaksi.",
  vj_e_sammakko_kevat: "Keväällä sammakko herää ja munii kutua veteen.",
  vj_e_orava_kevat: "Keväällä orava syö talven varastojaan ja puiden silmuja.",
  vj_e_siili_kesa: "Kesällä siili syö etanoita ja kovakuoriaisia.",
  vj_e_karhu_syksy: "Syksyllä karhu syö paljon marjoja ja lihoo talveksi.",
  vj_e_mayra_syksy: "Syksyllä mäyrä kantaa kuivaa heinää kolonsa pohjalle.",
  vj_e_narhi: "Närhi piilottaa syksyllä tammenterhoja sammaleeseen.",
  vj_e_orava_syksy: "Syksyllä orava kerää käpyjä ja kuivattaa sieniä oksilla.",
  vj_e_orava_talvi: "Talvella oravan turkki on harmaampi, ja korvissa on tupsut.",
  vj_e_tiainen_talvi: "Talitiainen käy talvella lintulaudalla syömässä siemeniä.",
  vj_e_kalat_talvi: "Talvella kalat uivat hitaasti, koska vesi on kylmää.",
  vj_e_hauki: "Hauki on nopea saalistaja. Se väijyy kaislikossa.",
  vj_e_made_kesa: "Made viihtyy kesällä syvällä, kylmässä vedessä.",
  vj_e_sarki: "Särki on yksi Suomen yleisimmistä kaloista.",
};

type Season = { id: string; name: string; icon: string; color: string };
const SEASONS: Season[] = [
  { id: "kevat", name: "Kevät", icon: "🌸", color: "#5fb85a" },
  { id: "kesa", name: "Kesä", icon: "☀️", color: "#f3a712" },
  { id: "syksy", name: "Syksy", icon: "🍂", color: "#e0662a" },
  { id: "talvi", name: "Talvi", icon: "❄️", color: "#4a90d9" },
];

// picture sizes (img/<name>.png)
const IMG: { [n: string]: number[] } = {
  janis_kesa: [200, 170], janis_talvi: [200, 170], karppa_kesa: [220, 130], karppa_talvi: [220, 130],
  riekko_kesa: [200, 170], riekko_talvi: [200, 170], orava_kesa: [190, 190], orava_talvi: [190, 190],
  karhu: [240, 170], karhu_uni: [200, 130], siili: [180, 120], siili_uni: [150, 120], sammakko: [160, 120],
  sammakko_uni: [160, 120], mayra: [220, 130], mayra_uni: [220, 130], narhi: [190, 150], kurki: [170, 220],
  paasky: [190, 130], tiainen: [150, 140], kapy: [80, 100], pahkina: [80, 80], sieni: [90, 90], terho: [70, 90],
};

// the fish (Onkipeli's pictures: 400x160, the body over the middle 80 %)
type Species = { id: string; name: string; L: number; H: number };
const FISH: Species[] = [
  { id: "ahven", name: "Ahven", L: 70, H: 32 },
  { id: "hauki", name: "Hauki", L: 124, H: 26 },
  { id: "made", name: "Made", L: 104, H: 24 },
  { id: "sarki", name: "Särki", L: 62, H: 28 },
];

const LAND = 330;           // the land picture's height (the screen is 360 wide)
const WATER = LAND + 2;     // the lake's surface

// where things go in the land picture: centre and reach
type Zone = { x: number; y: number; r: number };
function zone(id: string): Zone {
  if (id === "pesa") return { x: 97, y: 286, r: 42 };
  if (id === "lehti") return { x: 206, y: 298, r: 34 };
  if (id === "maakolo") return { x: 272, y: 304, r: 30 };
  if (id === "kolo") return { x: 330, y: 170, r: 36 };
  if (id === "oksa") return { x: 268, y: 120, r: 40 };
  if (id === "sammal") return { x: 150, y: 314, r: 26 };
  return { x: 110, y: height - 26, r: 70 }; // muta: the lake bottom
}

// ---- state ---------------------------------------------------------------------

type Mode = "menu" | "year" | "explore" | "done";
type Task = { kind: string; season: number; a: string; b: string };
type Item = { img: string; x: number; y: number; w: number; h: number; hx: number; hy: number; zone: string; done: boolean; sx: number; sy: number; tries: number };
type Fish = { sp: number; x: number; y: number; dir: number; v: number; wob: number; flee: number; hooked: boolean };
type Flake = { x: number; y: number; r: number; v: number };
type Shown = { img: string; x: number; y: number; w: number; tmp: boolean; t: number };

let mode: Mode = "menu";
let season = 0;
let t = 0;
let tasks: Task[] = [];
let ti = 0;
let task: Task = { kind: "", season: 0, a: "", b: "" };
let phase = "";           // what the current task is doing
let clock = 0;            // time in the phase
let say = "";             // the instruction clip (🔊 says it again)
let text = "";            // the instruction or fact on the screen
let ok = false;           // the task is done: the Next button shows
let firstTry = true;
let stars = 0;
let best = 0;
let wrongClock = 0;
let choices: string[] = [];
let shake = -1;
let items: Item[] = [];
let drag: Item | null = null;
let dragPointer = -1;
let dragMoved = false;
let selected: Item | null = null;
let shown: Shown[] = [];  // animals placed in the scene by finished tasks
let flyer = "";           // a bird crossing the sky
let flyClock = 0;
let flyDir = 1;
let fish: Fish[] = [];
let target = 0;
let hookX = 180;
let hookY = 0;
let picked: Fish | null = null;
let finger = -1;
let missed = false;
let drill = 0;
let flakes: Flake[] = [];
let menuClock = 0;
let exploreSel = -1;
let bounce = 0;

function init() {
  best = rg.load("best", 0);
  for (let i = 0; i < 26; i++) flakes.push({ x: rg.random() * 360, y: rg.random() * 700, r: 1.5 + rg.random() * 2.5, v: 18 + rg.random() * 26 });
  rg.say("vj_nimi");
}

function mud(): number { return height - 46; }

function speak(id: string) {
  say = id;
  text = T[id] || "";
  rg.say(id);
}

function praise(): string { return rg.pick(["hienoa", "hyva", "mahtavaa", "oikein", "loistavaa"]); }

// ---- the year ------------------------------------------------------------------

function buildYear() {
  const coats = rg.shuffle(["janis", "karppa", "riekko"]);
  const migrant = rg.shuffle(["kurki", "paasky"]);
  const stay = rg.shuffle(["tiainen", "narhi"]);
  tasks = [
    { kind: "wake", season: 0, a: "", b: "" },
    { kind: "coat", season: 0, a: coats[0], b: "kesa" },
    { kind: "birds", season: 0, a: migrant[0], b: stay[0] },
    { kind: "fish", season: 1, a: "ahven", b: "" },
    { kind: "coat", season: 1, a: coats[1], b: "kesa" },
    { kind: "squirrel", season: 2, a: "", b: "" },
    { kind: "jay", season: 2, a: "", b: "" },
    { kind: "birds", season: 2, a: migrant[1], b: stay[1] },
    { kind: "sleep", season: 3, a: "", b: "" },
    { kind: "coat", season: 3, a: coats[2], b: "talvi" },
    { kind: "fish", season: 3, a: "made", b: "" },
  ];
}

function startYear() {
  mode = "year";
  stars = 0;
  ti = -1;
  shown = [];
  buildYear();
  rg.sound("click");
  rg.music("calm", { volume: 0.4 });
  nextTask();
}

function nextTask() {
  ti++;
  if (ti >= tasks.length) { finishYear(); return; }
  const prev = task;
  task = tasks[ti];
  ok = false;
  firstTry = true;
  items = [];
  drag = null;
  selected = null;
  choices = [];
  flyer = "";
  if (ti === 0 || prev.season !== task.season) {
    season = task.season;
    shown = [];
    phase = "season";
    clock = 0;
    speak("vj_" + SEASONS[season].id + "_tuli");
    rg.sound("whoosh");
    return;
  }
  beginTask();
}

function beginTask() {
  clock = 0;
  const k = task.kind;
  if (k === "wake") { phase = "wake"; speak("vj_heraa"); }
  else if (k === "coat") {
    phase = "coat";
    choices = rg.shuffle([task.a + "_kesa", task.a + "_talvi"]);
    speak("vj_q_" + task.a + "_" + task.b);
  } else if (k === "birds") {
    phase = "birds";
    choices = rg.shuffle([task.a, task.b]);
    speak(season === 0 ? "vj_q_palaa" : "vj_q_lahtee");
  } else if (k === "squirrel") {
    phase = "drag";
    shown.push({ img: "orava_kesa", x: 282, y: 64, w: 50, tmp: false, t: 0 });
    setItems([["kapy", "kolo"], ["sieni", "oksa"], ["pahkina", "kolo"], ["kapy", "kolo"], ["sieni", "oksa"]]);
    speak("vj_orava_keraa");
  } else if (k === "jay") {
    phase = "drag";
    shown.push({ img: "narhi", x: 104, y: 270, w: 50, tmp: false, t: 0 });
    setItems([["terho", "sammal"], ["terho", "sammal"], ["terho", "sammal"]]);
    speak("vj_narhi_katkee");
  } else if (k === "sleep") {
    phase = "drag";
    const order = rg.shuffle([["karhu", "pesa"], ["siili", "lehti"], ["mayra", "maakolo"], ["sammakko", "muta"], ["orava_talvi", "kolo"]]);
    setItems([order[0]]);
    task.a = JSON.stringify(order.slice(1));
    askSleep();
  } else if (k === "fish") {
    target = task.a === "made" ? 2 : 0;
    missed = false;
    picked = null;
    hookX = 180;
    hookY = WATER - 8;
    stock();
    if (season === 3) { phase = "drill"; drill = 0; speak("vj_kairaa"); }
    else { phase = "aim"; speak("vj_ongi_ahven"); }
  }
}

function askSleep() {
  const it = items[0];
  const name = it.img === "orava_talvi" ? "orava" : it.img;
  speak("vj_q_" + name);
}

// drag items, laid on a tray over the lake
function setItems(list: string[][]) {
  items = [];
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const img = list[i][0];
    const big = n === 1;
    const w = big ? (img === "karhu" ? 130 : img === "mayra" ? 110 : 90) : 48;
    const h = (w * IMG[img][1]) / IMG[img][0];
    const hx = big ? 180 - w / 2 : 180 + (i - (n - 1) / 2) * 62 - w / 2;
    const hy = WATER + 30 + (big ? 80 - h : 62 - h) / 2 + 6;
    items.push({ img, x: hx, y: hy, w, h, hx, hy, zone: list[i][1], done: false, sx: 0, sy: 0, tries: 0 });
  }
}

function finishYear() {
  mode = "done";
  clock = 0;
  rg.stopMusic();
  rg.celebrate(width / 2, height * 0.3, { big: true });
  rg.say(["vj_vuosi_valmis", "sait", rg.sayId.number(stars), "tahtea"]);
  if (stars > best) { best = stars; rg.save("best", stars); }
}

function success(factId: string, x: number, y: number) {
  ok = true;
  if (firstTry) stars++;
  rg.celebrate(x, y, { count: 16 });
  rg.vibrate([30, 30, 30]);
  rg.say([praise(), factId]);
  say = factId;
  text = T[factId] || "";
}

function oops(id: string) {
  firstTry = false;
  wrongClock = 0.5;
  rg.sound("wrong");
  rg.vibrate(40);
  speak(id);
}

// ---- input -------------------------------------------------------------------------

function pick(c: string, i: number) {
  if (ok) return;
  if (phase === "coat") {
    const right = task.a + "_" + task.b;
    if (c === right) {
      shown.push({ img: c, x: 150, y: 286 - coatH(c), w: coatW(c), tmp: false, t: 0 });
      success("vj_f_" + right, 180, 250);
      choices = [right];
    } else {
      shake = i;
      // the wrong coat stands out in the scene for a moment
      shown.push({ img: c, x: 150, y: 286 - coatH(c), w: coatW(c), tmp: true, t: -1.6 });
      oops("vj_vaara_turkki");
    }
  } else if (phase === "birds") {
    if (c === task.a) {
      flyer = c;
      flyClock = 0;
      flyDir = season === 0 ? 1 : 1;
      success("vj_f_" + c + (season === 0 ? "_palaa" : "_lahtee"), 180, 140);
      choices = [c];
    } else {
      shake = i;
      oops("vj_vaara_" + c);
    }
  }
}

function coatW(c: string): number { return c.indexOf("karppa") === 0 ? 96 : 78; }
function coatH(c: string): number { return (coatW(c) * IMG[c][1]) / IMG[c][0]; }

function nearZone(x: number, y: number, ids: string[]): string {
  let bestId = "", bd = 1e9;
  for (const id of ids) {
    const z = zone(id);
    const d = Math.sqrt((z.x - x) * (z.x - x) + (z.y - y) * (z.y - y));
    if (d < z.r + 14 && d < bd) { bd = d; bestId = id; }
  }
  return bestId;
}

function dragZones(): string[] {
  if (task.kind === "squirrel") return ["kolo", "oksa", "sammal", "pesa", "lehti"];
  if (task.kind === "jay") return ["sammal", "kolo", "oksa", "lehti", "pesa"];
  return ["pesa", "lehti", "maakolo", "kolo", "muta"];
}

function onPointerDown(x: number, y: number, info: any) {
  if (info && info.id) return; // a button
  if (mode === "explore") { exploreTap(x, y); return; }
  if (mode !== "year" || ok) return;
  if (phase === "season") { if (clock > 0.8) beginTask(); return; }
  if (phase === "wake") {
    const z = zone("pesa");
    if (Math.abs(x - z.x) < 60 && Math.abs(y - z.y) < 50) {
      phase = "woke";
      shown.push({ img: "karhu", x: 20, y: 196, w: 110, tmp: false, t: 0 });
      success("vj_heraa_ok", z.x, z.y - 20);
    }
    return;
  }
  if (phase === "drag") {
    for (const it of items) {
      if (it.done) continue;
      if (x >= it.x - 6 && x <= it.x + it.w + 6 && y >= it.y - 6 && y <= it.y + it.h + 6) {
        drag = it;
        dragPointer = info ? info.pointer : 0;
        dragMoved = false;
        it.sx = x - it.x;
        it.sy = y - it.y;
        rg.sound("pop", { volume: 0.4 });
        return;
      }
    }
    // a tap on a place sends the chosen (or the only) item there
    const z = nearZone(x, y, dragZones());
    let it = selected;
    if (!it) for (const q of items) if (!q.done) { it = q; break; }
    if (z && it && !it.done) drop(it, z);
    return;
  }
  if (phase === "drill") {
    if (y > WATER - 30 && y < WATER + 60) {
      drill++;
      rg.sound("pop");
      rg.vibrate(25);
      if (drill >= 4) { phase = "aim"; rg.sound("coin"); speak("vj_ongi_made"); }
    }
    return;
  }
  if (phase === "aim" && y > WATER - 40) {
    finger = info ? info.pointer : 0;
    if (season !== 3) hookX = rg.clamp(x, 30, width - 30);
    phase = "sink";
    clock = 0;
    rg.sound("whoosh", { volume: 0.3 });
  }
}

function drop(it: Item, z: string) {
  if (z === it.zone) {
    it.done = true;
    selected = null;
    const zz = zone(z);
    placeDone(it, zz);
    rg.sound("coin");
    const left = items.filter((q) => !q.done).length;
    if (task.kind === "sleep") {
      const name = it.img === "orava_talvi" ? "orava" : it.img;
      const rest: string[][] = JSON.parse(task.a);
      if (rest.length) {
        rg.celebrate(zz.x, zz.y, { count: 10, sound: false });
        rg.say([praise(), "vj_f_" + name]);
        text = T["vj_f_" + name];
        phase = "sleepnext";
        clock = 0;
      } else success("vj_f_" + name, zz.x, zz.y);
    } else if (left === 0) {
      success(task.kind === "jay" ? "vj_narhi_valmis" : "vj_orava_valmis", zz.x, zz.y);
    } else {
      rg.celebrate(zz.x, zz.y, { count: 8, sound: false });
    }
  } else {
    it.tries++;
    it.x = it.hx;
    it.y = it.hy;
    selected = it;
    if (task.kind === "sleep") oops("vj_ei_sinne");
    else oops(it.tries >= 2 ? "vj_vihje_" + it.zone : "vj_ei_sinne");
  }
}

// a finished item stays where it went
function placeDone(it: Item, z: Zone) {
  const n = items.filter((q) => q.done && q.zone === it.zone).length;
  if (it.zone === "kolo" && task.kind === "squirrel") { it.w = 20; it.h = (20 * IMG[it.img][1]) / IMG[it.img][0]; it.x = 318 + (n % 2) * 6; it.y = 166 + n * 4; return; }
  if (it.zone === "oksa") { it.w = 26; it.h = 26; it.x = 244 + n * 26; it.y = 126; return; }
  if (it.zone === "sammal") { it.w = 16; it.h = 20; it.x = 132 + n * 14; it.y = 304; return; }
  // a sleeping animal in its winter bed
  const sleepImg = it.img === "orava_talvi" ? "orava_talvi" : it.img + "_uni";
  const w = it.img === "karhu" ? 74 : it.img === "orava_talvi" ? 30 : it.img === "mayra" ? 48 : 40;
  const h = (w * IMG[sleepImg][1]) / IMG[sleepImg][0];
  it.img = sleepImg;
  it.w = w;
  it.h = h;
  it.x = z.x - w / 2;
  it.y = it.zone === "kolo" ? z.y - h / 2 - 2 : it.zone === "muta" ? mud() + 4 : z.y - h / 2 + 4;
  if (it.zone === "pesa") it.y = 270;
  if (it.zone === "maakolo") it.y = 292;
}

function next() {
  rg.sound("click");
  nextTask();
}

function onBack() {
  if (mode === "year" || mode === "explore" || mode === "done") { mode = "menu"; rg.stopMusic(); rg.stopSay(); }
  else rg.exit();
}

// ---- fishing (Onkipeli's way: hold to sink the hook, let go at the fish's mouth) ----

function spawn(sp: number, anywhere: boolean): Fish {
  const dir = rg.random() < 0.5 ? 1 : -1;
  const L = FISH[sp].L;
  const top = WATER + (season === 3 ? 60 : 40);
  const deep = sp === 2; // the burbot keeps to the deep water
  const span = Math.max(60, mud() - top - 50);
  const y = top + (deep ? span * 0.45 + rg.random() * span * 0.5 : rg.random() * span);
  const x = anywhere ? rg.random() * (width - L) : (dir > 0 ? -L - rg.random() * 120 : width + rg.random() * 120);
  const v = season === 3 ? 12 + rg.random() * 10 : 18 + rg.random() * 16;
  return { sp, x, y, dir, v, wob: rg.random() * 6, flee: 0, hooked: false };
}

function stock() {
  fish = [];
  const kinds = season === 3 ? [2, 2, 0, 1, 3] : [0, 0, 1, 3, 2, 3];
  for (const k of kinds) fish.push(spawn(k, true));
}

function mouth(f: Fish): number[] {
  const S = FISH[f.sp];
  return [f.x + (f.dir > 0 ? S.L * 0.96 : S.L * 0.04), f.y + S.H * 0.55];
}

function settle() {
  const reach = 34;
  let bestF: Fish | null = null, bd = reach;
  for (const f of fish) {
    if (f.flee > 0 || f.hooked) continue;
    const m = mouth(f);
    const d = Math.sqrt((m[0] - hookX) * (m[0] - hookX) + (m[1] - hookY) * (m[1] - hookY));
    if (d < bd) { bd = d; bestF = f; }
  }
  if (bestF && bestF.sp === target) {
    picked = bestF;
    bestF.hooked = true;
    phase = "reel";
    clock = 0;
    rg.vibrate([40, 30, 40]);
    rg.sound("coin");
  } else {
    if (bestF) {
      bestF.flee = 0.01;
      bestF.dir = hookX < bestF.x ? 1 : -1;
      missed = true;
      oops("vj_vaara_kala");
    }
    phase = "up";
    clock = 0;
  }
}

function fishTick(dt: number) {
  for (const f of fish) {
    if (f.hooked) continue;
    f.wob += dt * 4;
    const sp = f.flee > 0 ? 220 : f.v;
    f.x += f.dir * sp * dt;
    f.y += Math.sin(f.wob * 0.5) * 5 * dt;
    if (f.flee > 0) f.flee += dt;
    const L = FISH[f.sp].L;
    if ((f.dir > 0 && f.x > width + 20) || (f.dir < 0 && f.x < -L - 20)) {
      const n = spawn(f.sp, false);
      f.x = n.x; f.y = n.y; f.dir = n.dir; f.v = n.v; f.flee = 0;
    }
  }
  if (mode !== "year" || task.kind !== "fish") return;
  const top = season === 3 ? WATER + 16 : WATER - 8;
  if (phase === "aim" || phase === "drill") hookY = top;
  if (phase === "sink") {
    let held = false;
    for (const q of __input.pointers) if (q.id === finger && q.down) { held = true; if (season !== 3) hookX += (rg.clamp(q.x, 30, width - 30) - hookX) * Math.min(1, dt * 6); }
    if (held) hookY = Math.min(mud() - 10, hookY + 80 * __dt);
    else settle();
  } else if (phase === "up") {
    hookY = Math.max(top, hookY - 160 * __dt);
    if (hookY <= top) phase = "aim";
  } else if (phase === "reel" && picked) {
    hookY -= 260 * __dt;
    const S = FISH[picked.sp];
    picked.y = hookY - S.H * 0.55;
    picked.x = hookX - (picked.dir > 0 ? S.L * 0.96 : S.L * 0.04);
    if (hookY < top - 10) {
      phase = "caught";
      fish = fish.filter((f) => f !== picked);
      success(target === 2 ? "vj_f_made" : "vj_f_ahven", hookX, WATER);
    }
  }
}

let __dt = 0;

function tick(dt: number) {
  __dt = dt;
  t += dt;
  clock += dt;
  wrongClock = Math.max(0, wrongClock - dt);
  bounce = Math.max(0, bounce - dt);
  for (const f of flakes) {
    f.y += f.v * dt;
    f.x += Math.sin(t + f.r * 3) * 8 * dt;
    if (f.y > height) { f.y = -6; f.x = rg.random() * width; }
  }
  for (const s of shown) s.t += dt;
  // a wrong coat shows until its clock (started below 0) reaches 0
  shown = shown.filter((s) => !(s.tmp && s.t >= 0));
  if (flyer) flyClock += dt;
  if (mode === "menu") {
    menuClock += dt;
    if (menuClock > 3.5) { menuClock = 0; season = (season + 1) % 4; }
  }
  if (mode === "year") {
    if (phase === "season" && clock > 4.5) beginTask();
    if (phase === "sleepnext" && clock > 3.6) {
      const rest: string[][] = JSON.parse(task.a);
      const doneItems = items.slice();
      setItems([rest[0]]);
      for (const d of doneItems) items.unshift(d);
      task.a = JSON.stringify(rest.slice(1));
      phase = "drag";
      askSleep();
    }
    if (drag) {
      let held = false;
      for (const q of __input.pointers) if (q.id === dragPointer && q.down) {
        held = true;
        const nx = q.x - drag.sx, ny = q.y - drag.sy;
        if (Math.abs(nx - drag.x) + Math.abs(ny - drag.y) > 1) { if (Math.abs(nx - drag.hx) + Math.abs(ny - drag.hy) > 10) dragMoved = true; }
        drag.x = nx;
        drag.y = ny;
      }
      if (!held) {
        const it = drag;
        drag = null;
        if (!dragMoved) { it.x = it.hx; it.y = it.hy; selected = it; }
        else {
          const z = nearZone(it.x + it.w / 2, it.y + it.h / 2, dragZones());
          if (z) drop(it, z);
          else { it.x = it.hx; it.y = it.hy; }
        }
      }
    }
  }
  fishTick(dt);
}

// ---- explore: flip the seasons, tap the animals ------------------------------------

type Thing = { img: string; x: number; y: number; w: number; say: string; zz: boolean; fish: number; dir: number };

function scene(s: number): Thing[] {
  const L: Thing[] = [];
  const add = (img: string, x: number, y: number, w: number, sayId: string, zz: boolean) => L.push({ img, x, y, w, say: sayId, zz, fish: -1, dir: 1 });
  if (s === 0) {
    add("karhu", 14, 206, 100, "vj_heraa_ok", false);
    add("janis_kesa", 150, 230, 70, "vj_e_janis_kevat", false);
    add("kurki", 236, 176, 52, "vj_f_kurki_palaa", false);
    add("orava_kesa", 282, 64, 50, "vj_e_orava_kevat", false);
    add("sammakko", 36, WATER + 34, 56, "vj_e_sammakko_kevat", false);
  } else if (s === 1) {
    add("karppa_kesa", 120, 262, 90, "vj_f_karppa_kesa", false);
    add("riekko_kesa", 214, 236, 64, "vj_f_riekko_kesa", false);
    add("siili", 172, 290, 52, "vj_e_siili_kesa", false);
    add("paasky", 110, 96, 64, "vj_f_paasky_palaa", false);
    add("janis_kesa", 24, 232, 66, "vj_f_janis_kesa", false);
    add("orava_kesa", 282, 64, 50, "vj_e_orava_kevat", false);
  } else if (s === 2) {
    add("karhu", 4, 206, 100, "vj_e_karhu_syksy", false);
    add("narhi", 104, 270, 50, "vj_e_narhi", false);
    add("mayra", 226, 262, 74, "vj_e_mayra_syksy", false);
    add("kurki", 150, 90, 56, "vj_f_kurki_lahtee", false);
    add("orava_kesa", 282, 64, 50, "vj_e_orava_syksy", false);
  } else {
    add("karhu_uni", 64, 270, 70, "vj_f_karhu", true);
    add("siili_uni", 190, 290, 32, "vj_f_siili", true);
    add("mayra_uni", 252, 293, 42, "vj_f_mayra", true);
    add("orava_talvi", 282, 64, 50, "vj_e_orava_talvi", false);
    add("janis_talvi", 150, 232, 70, "vj_f_janis_talvi", false);
    add("riekko_talvi", 226, 236, 56, "vj_f_riekko_talvi", false);
    add("karppa_talvi", 12, 252, 62, "vj_f_karppa_talvi", false);
    add("tiainen", 250, 104, 34, "vj_e_tiainen_talvi", false);
    add("sammakko_uni", 60, height - 40, 46, "vj_f_sammakko", true);
  }
  return L;
}

function fishFact(sp: number): string {
  if (sp === 1) return "vj_e_hauki";
  if (sp === 3) return "vj_e_sarki";
  if (season === 3) return sp === 2 ? "vj_f_made" : "vj_e_kalat_talvi";
  return sp === 2 ? "vj_e_made_kesa" : "vj_f_ahven";
}

function startExplore() {
  mode = "explore";
  season = 0;
  exploreSel = -1;
  text = T.vj_katsele;
  say = "vj_katsele";
  stock();
  rg.sound("click");
  rg.music("calm", { volume: 0.35 });
  rg.say(["vj_katsele"]);
}

function setSeason(s: number) {
  season = s;
  exploreSel = -1;
  stock();
  rg.sound("whoosh");
  text = T["vj_" + SEASONS[s].id + "_tuli"];
  say = "vj_" + SEASONS[s].id + "_tuli";
  rg.say(say);
}

function exploreTap(x: number, y: number) {
  const L = scene(season);
  for (let i = L.length - 1; i >= 0; i--) {
    const th = L[i];
    const h = (th.w * IMG[th.img][1]) / IMG[th.img][0];
    if (x >= th.x - 8 && x <= th.x + th.w + 8 && y >= th.y - 8 && y <= th.y + h + 8) {
      exploreSel = i;
      bounce = 0.4;
      text = T[th.say];
      say = th.say;
      rg.say(th.say);
      return;
    }
  }
  for (const f of fish) {
    const S = FISH[f.sp];
    if (x >= f.x - 8 && x <= f.x + S.L + 8 && y >= f.y - 12 && y <= f.y + S.H + 12) {
      exploreSel = -1;
      const id = fishFact(f.sp);
      text = S.name + ". " + T[id];
      say = id;
      rg.say(id);
      return;
    }
  }
}

// ---- drawing -------------------------------------------------------------------------

function Img(name: string, x: number, y: number, w: number, extra: any) {
  const h = (w * IMG[name][1]) / IMG[name][0];
  const st: any = { position: "absolute", left: x, top: y, width: w, height: h };
  if (extra) for (const k in extra) st[k] = extra[k];
  return <img src={rg.asset("img/" + name + ".png")} style={st} />;
}

function FishImg(sp: number, x: number, y: number, dir: number, s: number, wob: number) {
  const S = FISH[sp];
  const pw = (S.L * s) / 0.8;
  const ph = pw * 0.4;
  const tilt = Math.sin(wob * 3) * 3;
  return <img src={rg.asset("fish/" + S.id + (dir > 0 ? "_r" : "_l") + ".png")}
    style={{ position: "absolute", left: x - pw * 0.1, top: y + (S.H * s) / 2 - ph / 2, width: pw, height: ph, transform: "rotate(" + tilt.toFixed(1) + "deg)" }} />;
}

// the lake for a season and screen height, built once and kept
let lake: any = null;
let lakeKey = "";

function Lake() {
  const key = season + ":" + height;
  if (lake && lakeKey === key) return lake;
  lakeKey = key;
  const s = SEASONS[season].id;
  const parts: any[] = [];
  parts.push(<div className={"water w_" + s} style={{ top: WATER, height: mud() - WATER + 4 }} />);
  for (let i = 0; i < 3; i++) parts.push(<div className="ray" style={{ left: 40 + i * 110, top: WATER, height: mud() - WATER, transform: "rotate(" + (14 + i * 3) + "deg)" }} />);
  parts.push(<div className="mud" style={{ top: mud(), height: height - mud() }} />);
  for (let i = 0; i < 7; i++) parts.push(<div className="stone" style={{ left: 20 + i * 50 + (i % 2) * 14, top: mud() + 10 + (i % 3) * 8, width: 18 + (i % 3) * 6, height: 10 + (i % 2) * 4 }} />);
  if (s !== "talvi") {
    for (let i = 0; i < 6; i++) {
      const x = 4 + i * 64 + (i % 2) * 18;
      const h = 50 + ((i * 37) % 46);
      parts.push(<div className={"reed r_" + s} style={{ left: x, top: mud() - h + 6, height: h, transform: "rotate(" + ((i % 3) - 1) * 5 + "deg)" }} />);
    }
  }
  if (s === "talvi") {
    parts.push(<div className="ice" style={{ top: WATER - 2, height: 18 }} />);
    parts.push(<div className="snowcap" style={{ top: WATER - 6, height: 7 }} />);
  }
  if (s === "kevat") for (let i = 0; i < 4; i++) parts.push(<div className="floe" style={{ left: 20 + i * 92, top: WATER - 3, width: 40 + (i % 2) * 22 }} />);
  if (s === "kesa") for (let i = 0; i < 3; i++) parts.push(<div className="lily" style={{ left: 70 + i * 100, top: WATER - 3 }} />);
  if (s === "syksy") for (let i = 0; i < 6; i++) parts.push(<div className="leaf" style={{ left: 18 + i * 58, top: WATER - 2, backgroundColor: i % 2 ? "#e2702a" : "#f4a62a", transform: "rotate(" + i * 40 + "deg)" }} />);
  lake = (
    <div className="world">
      <img src={rg.asset("img/maa_" + s + ".png")} style={{ position: "absolute", left: 0, top: 0, width: 360, height: LAND }} />
      {parts}
    </div>
  );
  return lake;
}

function Flakes() {
  if (season !== 3) return null;
  return flakes.map((f) => <div className="flake" style={{ left: f.x, top: f.y, width: f.r * 2, height: f.r * 2, borderRadius: f.r }} />);
}

function Zz(x: number, y: number) {
  const a = Math.sin(t * 2) * 3;
  return <div className="zz" style={{ left: x, top: y - 18 + a }}>💤</div>;
}

function Fishes() {
  const order2 = fish.slice().sort((a, b) => a.y - b.y);
  return order2.map((f) => FishImg(f.sp, f.x, f.y, f.dir, 1, f.wob));
}

function Shown() {
  const out: any[] = [];
  for (const s of shown) {
    if (s.tmp) {
      // a wrong coat, standing out
      out.push(Img(s.img, s.x, s.y, s.w, { opacity: Math.min(1, -s.t * 2) }));
      out.push(<div className="exclaim" style={{ left: s.x + s.w / 2 - 12, top: s.y - 30 }}>❗</div>);
    } else {
      const pop = s.t < 0.3 ? 0.6 + s.t * 1.3 : 1;
      out.push(Img(s.img, s.x + (s.w * (1 - pop)) / 2, s.y, s.w * pop, null));
    }
  }
  return out;
}

function Items() {
  if (!items.length) return null;
  const out: any[] = [];
  const left = items.filter((q) => !q.done).length;
  if (left && phase === "drag") out.push(<div className="tray" style={{ top: WATER + 26, height: items.length === 1 || task.kind === "sleep" ? 96 : 74 }} />);
  // hints: the places glow while dragging (or after two misses, the right one)
  if (phase === "drag" && (drag || selected)) {
    const it = drag || selected;
    for (const id of dragZones()) {
      const z = zone(id);
      const right = it && it.tries >= 2 && id === it.zone;
      const r = z.r * (1 + Math.sin(t * 5) * 0.08);
      out.push(<div className={right ? "zone zoneright" : "zone"} style={{ left: z.x - r, top: z.y - r, width: r * 2, height: r * 2, borderRadius: r }} />);
    }
  }
  for (const it of items) {
    if (it === drag) continue;
    const sel = it === selected && !it.done;
    out.push(Img(it.img, it.x, it.y, it.w, sel ? { transform: "rotate(" + (Math.sin(t * 8) * 6).toFixed(1) + "deg)" } : null));
    if (it.done && (it.img.indexOf("_uni") > 0 || it.img === "orava_talvi")) out.push(Zz(it.x + it.w * 0.6, it.y));
  }
  if (drag) out.push(Img(drag.img, drag.x, drag.y, drag.w, { transform: "scale(1.15)" }));
  return out;
}

function SleepingBear() {
  // spring's first task: the bear still asleep in its den
  if (!(mode === "year" && task.kind === "wake" && phase !== "woke")) return null;
  const z = zone("pesa");
  return (
    <div>
      {Img("karhu_uni", z.x - 32, z.y - 16, 64, null)}
      {Zz(z.x + 18, z.y - 22)}
      {phase === "wake" && clock > 2 ? <div className="tap" style={{ left: z.x - 14, top: z.y - 4 + Math.sin(t * 6) * 6 }}>👆</div> : null}
    </div>
  );
}

function Flyer() {
  if (!flyer) return null;
  const w = flyer === "kurki" ? 70 : flyer === "paasky" ? 60 : 44;
  const x = season === 0 ? -80 + flyClock * 90 : 120 + flyClock * 110;
  const y = 80 + Math.sin(flyClock * 3) * 8 - (season === 0 ? 0 : flyClock * 10);
  if (x > width + 60) return null;
  return Img(flyer, Math.min(x, season === 0 ? 150 : 1000), y, w, null);
}

function Fishing() {
  if (!(mode === "year" && task.kind === "fish")) return null;
  const winter = season === 3;
  const top = winter ? WATER - 30 : WATER - 46 + Math.sin(t * 2) * 2;
  const glows: any[] = [];
  if (phase === "aim" || phase === "sink") {
    const r = 30 * (1 + Math.sin(t * 5) * 0.12);
    for (const f of fish) {
      if (f.sp !== target || f.flee > 0) continue;
      const m = mouth(f);
      glows.push(<div className="glow" style={{ left: m[0] - r, top: m[1] - r, width: r * 2, height: r * 2, borderRadius: r }} />);
    }
  }
  const line = phase === "drill" ? null : <div className="line" style={{ left: hookX, top: top + 6, height: Math.max(0, hookY - top - 6) }} />;
  return (
    <div>
      {glows}
      {winter && phase === "drill" ? <div className="crack" style={{ left: hookX - 6 - drill * 3, top: WATER + 2, width: 12 + drill * 6 }} /> : null}
      {winter && phase !== "drill" ? <div className="hole" style={{ left: hookX - 14, top: WATER, width: 28 }} /> : null}
      {line}
      {phase !== "drill" ? <div className="hook" style={{ left: hookX - 4, top: hookY - 2 }} /> : null}
      {winter ? (
        <div className="kidwrap" style={{ left: hookX - 54, top: WATER - 50 }}>
          <div className="stool" />
          <div className="kidbodyw" />
          <div className="kidheadw" />
          <div className="hat" />
          <div className="rod2" />
        </div>
      ) : (
        <div className="boatwrap" style={{ left: hookX - 60, top: WATER - 36 + Math.sin(t * 2) * 2 }}>
          <div className="boat" />
          <div className="kidbody" />
          <div className="kidhead" />
          <div className="rod" />
        </div>
      )}
      {phase === "drill" ? <div className="tap" style={{ left: hookX - 14, top: WATER + 10 + Math.sin(t * 6) * 6 }}>👆</div> : null}
    </div>
  );
}

function Choices() {
  if (!(mode === "year" && (phase === "coat" || phase === "birds"))) return null;
  const cards: any[] = [];
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i];
    const dx = shake === i && wrongClock > 0 ? Math.sin(wrongClock * 40) * 6 : 0;
    const w = IMG[c][0] > IMG[c][1] * 1.4 ? 128 : IMG[c][1] > IMG[c][0] * 1.1 ? 76 : 112;
    cards.push(
      <div className={choices.length === 1 ? "choice choicewon" : "choice"} id={"c" + i} onClick={() => pick(c, i)} style={{ marginLeft: dx }}>
        <img src={rg.asset("img/" + c + ".png")} style={{ width: w, height: (w * IMG[c][1]) / IMG[c][0] }} />
      </div>
    );
  }
  return <div className="choices" style={{ top: WATER + 30 }}>{cards}</div>;
}

function Bar() {
  const S = SEASONS[season];
  return (
    <div className="bar">
      <div className="spill" style={{ backgroundColor: S.color }}>{S.icon + " " + S.name}</div>
      {mode === "year" ? <div className="pill">{"⭐ " + stars}</div> : null}
      <div className="pill speak" id="speak" onClick={() => { if (say) rg.say(say); }}>🔊</div>
    </div>
  );
}

function Wheel() {
  // the year as a ring of four seasons, the current one big
  const out: any[] = [];
  for (let i = 0; i < 4; i++) {
    const S = SEASONS[i];
    const on = i === season;
    out.push(
      <div className={on ? "wseason wseasonon" : "wseason"} id={"s" + i} onClick={() => setSeason(i)} style={{ backgroundColor: S.color }}>
        <div className="wicon">{S.icon}</div>
        <div className="wname">{S.name}</div>
      </div>
    );
  }
  return <div className="wheel" style={{ top: 50 }}>{out}</div>;
}

function Caption() {
  if (!text) return null;
  if (mode === "year" && task.kind === "fish") return <div className="caption" style={{ top: 52 }}>{text}</div>;
  const y = mode === "explore" ? WATER + 24 : phase === "drag" || phase === "coat" || phase === "birds" ? WATER + (phase === "drag" ? (task.kind === "sleep" ? 132 : 110) : 170) : WATER + 24;
  return <div className="caption" style={{ top: Math.min(y, height - 150) }}>{text}</div>;
}

function SeasonCard() {
  const S = SEASONS[season];
  const pop = Math.min(1, clock * 3);
  return (
    <div className="overlay overlaylight">
      <div className="scard" style={{ backgroundColor: S.color, transform: "scale(" + (0.6 + pop * 0.4).toFixed(2) + ")" }}>
        <div className="sicon">{S.icon}</div>
        <div className="sname">{S.name}</div>
      </div>
      <div className="stext">{T["vj_" + S.id + "_tuli"]}</div>
    </div>
  );
}

function Menu() {
  const bob = Math.sin(t * 2) * 5;
  return (
    <div className="overlay">
      <div className="title" style={{ marginTop: bob }}>Vuodenajat</div>
      <div className="lead">{SEASONS[0].icon + " " + SEASONS[1].icon + " " + SEASONS[2].icon + " " + SEASONS[3].icon}</div>
      <div className="lvl" id="year" onClick={() => startYear()} style={{ backgroundColor: "#06a77d" }}>
        <div className="lvname">🔄 Vuoden kierros</div>
        <div className="lvbest">{best > 0 ? "Ennätys ⭐ " + best + "/11" : "Kevät, kesä, syksy, talvi"}</div>
      </div>
      <div className="lvl" id="explore" onClick={() => startExplore()} style={{ backgroundColor: "#f3a712" }}>
        <div className="lvname">👀 Katsele</div>
        <div className="lvbest">Napauta eläimiä</div>
      </div>
      <div className="lvl lvlback" id="exit" onClick={() => rg.exit()}><div className="lvname">← Valikkoon</div></div>
    </div>
  );
}

function Done() {
  const st: string[] = [];
  for (let i = 0; i < tasks.length; i++) st.push(i < stars ? "⭐" : "☆");
  return (
    <div className="overlay">
      <div className="title">Vuosi kierretty!</div>
      <div className="lead">{"🌸 ☀️ 🍂 ❄️"}</div>
      <div className="stars">{st.join("")}</div>
      <div className="lvl" id="again" onClick={() => startYear()} style={{ backgroundColor: "#06a77d" }}><div className="lvname">Uudestaan!</div></div>
      <div className="lvl" id="look" onClick={() => startExplore()} style={{ backgroundColor: "#f3a712" }}><div className="lvname">👀 Katsele</div></div>
      <div className="lvl lvlback" id="menu" onClick={() => { mode = "menu"; rg.sound("click"); }}><div className="lvname">← Takaisin</div></div>
    </div>
  );
}

function ExploreThings() {
  const L = scene(season);
  const out: any[] = [];
  for (let i = 0; i < L.length; i++) {
    const th = L[i];
    const b = i === exploreSel && bounce > 0 ? Math.sin(bounce * 16) * 6 : 0;
    out.push(Img(th.img, th.x, th.y - Math.abs(b), th.w, i === exploreSel ? { shadowColor: "rgba(255,240,120,0.9)", shadowBlur: 14 } : null));
    if (th.zz) out.push(Zz(th.x + th.w * 0.6, th.y));
  }
  return out;
}

function view() {
  const play = mode === "year";
  return (
    <div className="screen">
      {Lake()}
      {mode === "explore" ? ExploreThings() : null}
      {play ? Shown() : null}
      {SleepingBear()}
      {Fishes()}
      {Fishing()}
      {Flyer()}
      {Flakes()}
      {play ? Items() : null}
      {play || mode === "explore" ? Bar() : null}
      {play && phase !== "season" ? Choices() : null}
      {(play && phase !== "season") || mode === "explore" ? Caption() : null}
      {play && ok ? <div className="next" id="next" onClick={() => next()} style={{ top: height - 84 }}>{ti + 1 >= tasks.length ? "Valmis! ⭐" : "Jatka ▶"}</div> : null}
      {mode === "explore" ? Wheel() : null}
      {play && phase === "season" ? SeasonCard() : null}
      {mode === "menu" ? Menu() : null}
      {mode === "done" ? Done() : null}
    </div>
  );
}
