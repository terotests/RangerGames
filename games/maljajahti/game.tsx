// Maljajahti: Ilves and Tappara hunt for the Canada Cup in Tampere.
//
// Two players (or one against the phone) roll a die and walk the city's
// streets. Every big place has a face-down puck; opening one costs 100 € or
// a lucky roll (4–6). Under the pucks: hockey legends (Kummola 300 €,
// Raipe 600 €, Barkov 1000 €), diamonds, robbers who take all your cash,
// worthless black sausages (one gets you out of the Sori police station
// lock-up), empty pucks and the Cup itself. Whatever is found in
// Särkänniemi pays double. The tram takes you between stops for 50 €.
// Whoever carries the Cup to Nokia Arena first wins, but the other team can
// tackle the carrier by landing on the very same spot and take the Cup.

type Team = "ilves" | "tappara";
type Phase = "menu" | "pick" | "turn" | "roll" | "choose" | "move" | "place" | "luck" | "reveal" | "tram" | "jailroll" | "over";
type Kind = "cup" | "kummola" | "raipe" | "barkov" | "diamond" | "robber" | "sausage" | "empty";

interface Node { id: string; x: number; y: number; kind: string; name: string; tram: boolean; label: number }
interface Player { team: Team; node: string; money: number; sausages: number; cup: boolean; jail: boolean; ai: boolean }
interface Option { node: string; path: string[]; exact: boolean }

const MW = 360, MH = 480;
const OPEN_COST = 100, TRAM_COST = 50, FINE = 100, START_MONEY = 300;

// big places: id, name, x, y, tram stop, label position (0 below, 1 above, 2 left, 3 right)
const PLACES: any[] = [
  ["lentavanniemi", "Lentävänniemi", 28, 70, true, 3],
  ["lielahti", "Lielahti", 56, 140, true, 2],
  ["sarkanniemi", "Särkänniemi", 112, 122, false, 1],
  ["pispala", "Pispala", 78, 205, false, 3],
  ["tesoma", "Tesoma", 22, 252, false, 0],
  ["pyynikki", "Pyynikki", 108, 272, true, 0],
  ["keskustori", "Keskustori", 138, 236, true, 1],
  ["nokia", "Nokia Areena", 190, 254, true, 3],
  ["sori", "Sorin asema", 220, 294, false, 3],
  ["hatanpaa", "Hatanpää", 180, 342, false, 2],
  ["harmala", "Härmälä", 118, 410, false, 3],
  ["peltolammi", "Peltolammi", 190, 450, false, 0],
  ["hervanta", "Hervanta", 306, 450, true, 1],
  ["viinikka", "Viinikka", 250, 352, false, 0],
  ["kaukajarvi", "Kaukajärvi", 318, 320, false, 2],
  ["hakametsa", "Hakametsä", 314, 236, true, 1],
  ["kaleva", "Kaleva", 262, 204, true, 1],
  ["kauppi", "Kauppi", 248, 128, false, 1],
  ["linnainmaa", "Linnainmaa", 326, 146, false, 0],
];

// streets: from, to, dots between, bend
const ROADS: any[] = [
  ["lentavanniemi", "lielahti", 2, 0], ["lielahti", "sarkanniemi", 2, -6], ["lielahti", "pispala", 2, 0],
  ["lielahti", "tesoma", 3, 8], ["tesoma", "pispala", 2, 0], ["tesoma", "pyynikki", 3, -10],
  ["pispala", "sarkanniemi", 3, 0], ["pispala", "pyynikki", 2, 0], ["sarkanniemi", "keskustori", 3, 6],
  ["pyynikki", "keskustori", 1, 0], ["keskustori", "nokia", 1, 0], ["keskustori", "hatanpaa", 3, -8],
  ["nokia", "sori", 1, 0], ["nokia", "kaleva", 2, 6], ["nokia", "kauppi", 3, -8], ["sori", "hatanpaa", 2, 0],
  ["sori", "viinikka", 2, 0], ["sori", "kaleva", 2, 0], ["kaleva", "kauppi", 2, 0], ["kauppi", "linnainmaa", 2, 6],
  ["linnainmaa", "hakametsa", 3, 0], ["kaleva", "hakametsa", 1, 0], ["hakametsa", "kaukajarvi", 2, 0],
  ["kaukajarvi", "hervanta", 4, 10], ["viinikka", "kaukajarvi", 2, 0], ["viinikka", "peltolammi", 3, 0],
  ["hatanpaa", "viinikka", 2, 0], ["hatanpaa", "harmala", 3, 10], ["harmala", "peltolammi", 2, -6],
  ["peltolammi", "hervanta", 4, 10],
];

const TOKENS: Kind[] = ["cup", "robber", "robber", "robber", "sausage", "sausage", "empty", "empty", "empty", "empty",
  "kummola", "kummola", "raipe", "raipe", "barkov", "diamond", "diamond"];

const VALUE: any = { kummola: 300, raipe: 600, barkov: 1000, diamond: 500 };

const TEAM: any = {
  ilves: { name: "Ilves", icon: "🐆", main: "#1d7a3e", accent: "#ffd23f", text: "#ffffff" },
  tappara: { name: "Tappara", icon: "🪓", main: "#f37021", accent: "#13306b", text: "#ffffff" },
};

// ---- the board graph ----
const nodes: any = {};
const adj: any = {};
const roadPaths: string[] = [];
const tramIds: string[] = [];

function addNode(n: Node) { nodes[n.id] = n; adj[n.id] = []; }
function link(a: string, b: string) { adj[a].push(b); adj[b].push(a); }

function buildBoard() {
  for (const p of PLACES) {
    const kind = p[0] === "nokia" ? "arena" : p[0] === "sori" ? "jail" : "place";
    addNode({ id: p[0], name: p[1], x: p[2], y: p[3], kind: kind, tram: p[4], label: p[5] });
    if (p[4]) tramIds.push(p[0]);
  }
  for (const r of ROADS) {
    const a = nodes[r[0]], b = nodes[r[1]], n = r[2], bend = r[3];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    const px = -dy / len * bend, py = dx / len * bend;
    const cx = (a.x + b.x) / 2 + px * 2, cy = (a.y + b.y) / 2 + py * 2;
    roadPaths.push("M " + a.x + " " + a.y + " Q " + cx + " " + cy + " " + b.x + " " + b.y);
    let prev = a.id;
    for (let i = 1; i <= n; i++) {
      const tt = i / (n + 1), u = 1 - tt;
      const id = r[0] + "-" + r[1] + "-" + i;
      addNode({ id: id, name: "", x: u * u * a.x + 2 * u * tt * cx + tt * tt * b.x, y: u * u * a.y + 2 * u * tt * cy + tt * tt * b.y, kind: "dot", tram: false, label: 0 });
      link(prev, id);
      prev = id;
    }
    link(prev, b.id);
  }
}
buildBoard();

// ---- game state ----
let phase: Phase = "menu";
let players: Player[] = [];
let cur = 0;
let tokens: any = {};            // place id -> { kind, open }
let dice = 1;
let diceShow = 1;
let diceClock = 0;
let options: Option[] = [];
let tramTargets: string[] = [];
let movePath: string[] = [];
let moveK = 0;
let moveExact = false;
let moveTram = false;
let reveal: any = null;          // { kind, place, gain, double }
let msg = "";
let t = 0;
let aiClock = 0;
let winner = -1;
let overClock = 0;
let vsPhone = false;
let ev = "";                     // what happened on the turn that just ended

rg.seed(Math.floor(Date.now() % 100000) + 1);

function P(): Player { return players[cur]; }
function team(p: Player) { return TEAM[p.team]; }
function isPlace(id: string) { return nodes[id].kind === "place"; }
function unopened(id: string) { return isPlace(id) && tokens[id] && !tokens[id].open; }

function newGame(phone: boolean, humanTeam: Team) {
  vsPhone = phone;
  const other: Team = humanTeam === "ilves" ? "tappara" : "ilves";
  players = [
    { team: humanTeam, node: "nokia", money: START_MONEY, sausages: 0, cup: false, jail: false, ai: false },
    { team: other, node: "nokia", money: START_MONEY, sausages: 0, cup: false, jail: false, ai: phone },
  ];
  tokens = {};
  const places = PLACES.filter((p) => p[0] !== "nokia" && p[0] !== "sori").map((p) => p[0]);
  const kinds = rg.shuffle(TOKENS);
  for (let i = 0; i < places.length; i++) tokens[places[i]] = { kind: kinds[i], open: false };
  cur = 0; winner = -1;
  ev = rg.t("Kanada-malja on piilossa jonkin kiekon alla. Löydä se ja tuo Nokia Areenalle!",
    "The Canada Cup is hidden under one of the pucks. Find it and bring it to Nokia Arena!",
    "La copa está escondida bajo un disco. ¡Encuéntrala y llévala al Nokia Arena!");
  startTurn();
}

function startTurn() {
  phase = "turn";
  aiClock = 0;
  const p = P();
  const turnText = p.jail ? rg.t(team(p).name + " on putkassa.", team(p).name + " is locked up.", team(p).name + " está encerrado.")
    : rg.t(p.team === "ilves" ? "Ilveksen vuoro." : "Tapparan vuoro.", team(p).name + "'s turn.", "Turno de " + team(p).name + ".");
  msg = (ev ? ev + " " : "") + turnText;
  ev = "";
  rg.say(P().team === "ilves" ? "mj_ilves_vuoro" : "mj_tappara_vuoro");
}

function endTurn() {
  cur = 1 - cur;
  startTurn();
}

// ---- moves ----
// every spot exactly `steps` away along a street without stepping back, and
// every unopened place (or Nokia Arena with the Cup) passed on the way
function reachable(from: string, steps: number, me: Player): Option[] {
  const out: Option[] = [];
  const seen: any = {};
  const add = (node: string, path: string[], exact: boolean) => {
    const key = node;
    if (seen[key] !== undefined) { if (exact && !out[seen[key]].exact) { out[seen[key]] = { node: node, path: path, exact: true }; } return; }
    seen[key] = out.length;
    out.push({ node: node, path: path, exact: exact });
  };
  const walk = (node: string, path: string[], left: number) => {
    if (path.length > 1) {
      if (left === 0) { add(node, path.slice(), true); return; }
      if (unopened(node) || (node === "nokia" && me.cup)) add(node, path.slice(), false);
    }
    for (const nb of adj[node]) {
      if (path.indexOf(nb) >= 0) continue;
      path.push(nb);
      walk(nb, path, left - 1);
      path.pop();
    }
  };
  walk(from, [from], steps);
  return out;
}

function roll() {
  dice = rg.range(1, 6);
  diceClock = 0;
  rg.sound("tick");
  rg.vibrate(15);
}

function doRoll() {
  if (phase !== "turn") return;
  roll();
  phase = "roll";
}

function doLuck() {
  if (phase !== "turn" && phase !== "place") return;
  roll();
  phase = "luck";
}

function doJailRoll() {
  if (phase !== "turn") return;
  roll();
  phase = "jailroll";
}

function afterDice() {
  const p = P();
  if (phase === "roll") {
    rg.say(rg.sayId.number(dice));
    options = reachable(p.node, dice, p);
    if (!options.length) { ev = rg.t("Ei minnekään mentävää.", "Nowhere to go.", "No hay adónde ir."); endTurn(); return; }
    phase = "choose";
    msg = rg.t("Heitit " + dice + ". Valitse kohde kartalta.", "You rolled " + dice + ". Pick a spot on the map.", "Sacaste " + dice + ". Elige un lugar.");
  } else if (phase === "luck") {
    if (dice >= 4) { msg = rg.t("Onnistui!", "Lucky!", "¡Suerte!"); openToken(p.node); }
    else { ev = rg.t("Heitit " + dice + ". Ei auennut, yritä seuraavalla vuorolla.", "You rolled " + dice + ". Try again next turn.", "Sacaste " + dice + ". Inténtalo en el siguiente turno."); rg.sound("wrong"); endTurn(); }
  } else if (phase === "jailroll") {
    if (dice === 6) {
      p.jail = false;
      rg.sound("coin");
      msg = rg.t("Kuutonen! Pääsit putkasta.", "A six! You are out of the lock-up.", "¡Un seis! Sales del calabozo.");
      options = reachable(p.node, 6, p);
      phase = "choose";
    } else {
      ev = rg.t("Heitit " + dice + ". Vielä putkassa.", "You rolled " + dice + ". Still locked up.", "Sacaste " + dice + ". Sigues encerrado.");
      rg.sound("wrong");
      endTurn();
    }
  }
}

function choose(o: Option) {
  if (phase !== "choose") return;
  movePath = o.path; moveK = 0; moveExact = o.exact; moveTram = false;
  phase = "move";
  rg.sound("click");
}

function startTram() {
  if (phase !== "turn") return;
  const p = P();
  tramTargets = tramIds.filter((id) => id !== p.node);
  phase = "tram";
  msg = rg.t("Valitse pysäkki, jonne ratikka vie (" + TRAM_COST + " €).", "Pick the stop the tram takes you to (" + TRAM_COST + " €).", "Elige la parada (" + TRAM_COST + " €).");
  rg.sound("click");
}

function rideTram(id: string) {
  if (phase !== "tram") return;
  const p = P();
  p.money -= TRAM_COST;
  movePath = [p.node, id]; moveK = 0; moveExact = true; moveTram = true;
  phase = "move";
  rg.sound("whoosh");
}

function arrive() {
  const p = P();
  const at = p.node;
  const o = players[1 - cur];
  if (at === "sori" && moveExact && !moveTram) {
    p.jail = true;
    ev = rg.t(team(p).name + " joutui putkaan Sorin asemalle!", team(p).name + " is locked up at Sori station!", "¡" + team(p).name + " va al calabozo de Sori!");
    rg.sound("lose"); rg.vibrate([40, 40, 80]);
    rg.say("mj_putka");
    endTurn();
    return;
  }
  if (o.cup && o.node === at && moveExact && !moveTram) {
    o.cup = false; p.cup = true;
    ev = rg.t("Taklaus! " + team(p).name + " vei Kanada-maljan!", "Tackle! " + team(p).name + " took the Canada Cup!", "¡Placaje! " + team(p).name + " se lleva la copa!");
    rg.sound("hit"); rg.vibrate([60, 30, 60]);
    rg.say("mj_taklaus");
  }
  if (p.cup && at === "nokia") { win(); return; }
  if (!unopened(at)) { endTurn(); return; }
  if (unopened(at)) {
    phase = "place";
    aiClock = 0;
    msg = (ev ? ev + " " : "") + rg.t("Olet paikassa " + nodes[at].name + ". Avaatko kiekon?", "You are at " + nodes[at].name + ". Open the puck?", "Estás en " + nodes[at].name + ". ¿Abres el disco?");
    ev = "";
    return;
  }
  endTurn();
}

function payOpen() {
  const p = P();
  if ((phase !== "turn" && phase !== "place") || p.money < OPEN_COST || !unopened(p.node)) return;
  p.money -= OPEN_COST;
  rg.sound("coin");
  openToken(p.node);
}

function openToken(id: string) {
  const p = P();
  const tk = tokens[id];
  tk.open = true;
  const double = id === "sarkanniemi";
  let gain = 0;
  if (tk.kind === "cup") { p.cup = true; rg.celebrate(width / 2, height * 0.4, { big: true }); rg.say("mj_malja"); }
  else if (tk.kind === "robber") { gain = -p.money; p.money = 0; rg.sound("lose"); rg.vibrate([50, 40, 50]); rg.say("mj_rosvo"); }
  else if (tk.kind === "sausage") { p.sausages += double ? 2 : 1; rg.sound("pop"); rg.say("mj_makkara"); }
  else if (tk.kind === "empty") { rg.sound("wrong"); rg.say("mj_tyhja"); }
  else {
    gain = VALUE[tk.kind] * (double ? 2 : 1);
    p.money += gain;
    rg.celebrate(width / 2, height * 0.4, { sound: false });
    rg.sound("coin");
    rg.say("mj_" + tk.kind);
  }
  reveal = { kind: tk.kind, place: id, gain: gain, double: double, at: t };
  phase = "reveal";
  aiClock = 0;
}

function closeReveal() {
  if (phase !== "reveal") return;
  rg.sound("click");
  const p = P();
  ev = revealText(reveal, p);
  reveal = null;
  // the Cup found right at a tram stop next to the arena still needs a turn to go there
  endTurn();
}

function useSausage() {
  const p = P();
  if (phase !== "turn" || !p.jail || p.sausages < 1) return;
  p.sausages--; p.jail = false;
  rg.sound("pop");
  msg = rg.t("Mustamakkara kelpasi vartijalle. Vapaa! Heitä noppaa.", "The guard liked the black sausage. Free! Roll the die.", "Al guardia le gustó la morcilla. ¡Libre! Tira el dado.");
}

function payFine() {
  const p = P();
  if (phase !== "turn" || !p.jail || p.money < FINE) return;
  p.money -= FINE; p.jail = false;
  rg.sound("coin");
  msg = rg.t("Sakko maksettu. Vapaa! Heitä noppaa.", "Fine paid. Free! Roll the die.", "Multa pagada. ¡Libre! Tira el dado.");
}

function win() {
  winner = cur;
  phase = "over";
  overClock = 0;
  rg.celebrate(width / 2, height * 0.4, { big: true });
  rg.say(P().team === "ilves" ? "mj_ilves_voitti" : "mj_tappara_voitti");
  rg.vibrate([60, 40, 120]);
}

function revealText(r: any, p: Player): string {
  const who = team(p).name;
  if (r.kind === "cup") return rg.t(who + " löysi Kanada-maljan! Vie se Nokia Areenalle.", who + " found the Canada Cup! Take it to Nokia Arena.", who + " encontró la copa. ¡Llévala al Nokia Arena!");
  if (r.kind === "robber") return rg.t("Rosvo vei " + who + ":lta kaikki rahat!", "A robber took all of " + who + "'s money!", "¡Un ladrón le quitó todo el dinero a " + who + "!");
  if (r.kind === "sausage") return rg.t(who + " sai mustamakkaran. Sillä pääsee putkasta.", who + " got a black sausage. It gets you out of the lock-up.", who + " consiguió una morcilla.");
  if (r.kind === "empty") return rg.t("Tyhjä kiekko.", "An empty puck.", "Un disco vacío.");
  return rg.t(who + " sai " + r.gain + " €.", who + " got " + r.gain + " €.", who + " ganó " + r.gain + " €.");
}

// ---- the phone's play ----
function distTo(from: string, goal: (id: string) => boolean): number {
  const d: any = {};
  d[from] = 0;
  const q = [from];
  while (q.length) {
    const n = q.shift() as string;
    if (n !== from && goal(n)) return d[n];
    for (const nb of adj[n]) if (d[nb] === undefined) { d[nb] = d[n] + 1; q.push(nb); }
  }
  return 999;
}

function aiStep() {
  const p = P();
  if (phase === "turn") {
    if (p.jail) {
      if (p.sausages > 0) useSausage();
      else if (p.money >= FINE + OPEN_COST) payFine();
      else doJailRoll();
      return;
    }
    if (unopened(p.node)) { if (p.money >= OPEN_COST) payOpen(); else doLuck(); return; }
    if (p.node !== "nokia" && nodes[p.node].tram && p.money >= TRAM_COST) {
      if (p.cup) { startTram(); return; }
      const near = distTo(p.node, (id) => unopened(id));
      const tramPlace = tramIds.filter((id) => unopened(id) && id !== p.node);
      if (near > 6 && tramPlace.length && p.money >= TRAM_COST + OPEN_COST) { startTram(); return; }
    }
    doRoll();
  } else if (phase === "tram") {
    if (p.cup) { rideTram("nokia"); return; }
    const c = tramTargets.filter((id) => unopened(id));
    rideTram(c.length ? rg.pick(c) : rg.pick(tramTargets));
  } else if (phase === "choose") {
    const o = players[1 - cur];
    let best = options[0], bestScore = -1e9;
    for (const op of options) {
      let s = 0;
      const id = op.node;
      if (p.cup) s = -distTo(id, (n) => n === "nokia") * 10 + (id === "nokia" ? 1000 : 0);
      else {
        if (o.cup && o.node === id && op.exact) s += 900;
        if (unopened(id)) s += 500 + (id === "sarkanniemi" ? 100 : 0);
        s -= distTo(id, (n) => unopened(n)) * 10;
        if (o.cup) s -= distTo(id, (n) => n === o.node) * 5;
      }
      if (id === "sori" && op.exact) s -= 2000;
      s += rg.random();
      if (s > bestScore) { bestScore = s; best = op; }
    }
    choose(best);
  } else if (phase === "place") {
    if (p.money >= OPEN_COST) payOpen(); else doLuck();
  } else if (phase === "reveal") {
    closeReveal();
  }
}

function tick(dt: number) {
  t += dt;
  if (phase === "roll" || phase === "luck" || phase === "jailroll") {
    diceClock += dt;
    if (diceClock < 0.7) { if (Math.floor(diceClock * 14) !== Math.floor((diceClock - dt) * 14)) diceShow = rg.range(1, 6); }
    else { diceShow = dice; if (diceClock > 1.0) afterDice(); }
  }
  if (phase === "move") {
    moveK += dt * (moveTram ? 1.6 : 6);
    if (moveK >= movePath.length - 1) {
      P().node = movePath[movePath.length - 1];
      if (!moveTram) rg.sound("pop", { pitch: 1.2 });
      arrive();
    } else if (!moveTram && Math.floor(moveK) !== Math.floor(moveK - dt * 6)) rg.sound("tick", { volume: 0.4 });
  }
  if (phase === "over") overClock += dt;
  if (players.length && P().ai && phase !== "over" && phase !== "menu" && phase !== "pick" && phase !== "move"
    && phase !== "roll" && phase !== "luck" && phase !== "jailroll") {
    aiClock += dt;
    if (aiClock > (phase === "reveal" ? 2.2 : 0.9)) { aiClock = 0; aiStep(); }
  }
}

function onBack() {
  if (phase === "menu") rg.exit(); else { phase = "menu"; rg.sound("click"); }
}

// ---- drawing ----
let S = 1, OX = 0, OY = 0;
function sx(x: number) { return OX + x * S; }
function sy(y: number) { return OY + y * S; }

// the city: two lakes with the rapids between them, streets and the tram line
const LAKE_N = "M0 0 H360 V85 C330 92 300 72 270 84 C240 96 210 92 185 106 C172 113 160 113 150 110 C140 92 118 84 100 98 C88 108 76 114 62 114 C50 112 46 90 46 70 C46 50 30 40 18 52 C10 60 8 72 0 76 Z";
const LAKE_S = "M0 302 C25 294 50 298 75 312 C100 324 128 314 145 330 C158 345 150 364 132 374 C112 384 96 382 90 402 C86 422 100 452 92 480 L0 480 Z";
const LAKE_K = "M334 292 C340 274 360 278 360 290 L360 318 C352 318 338 310 334 292 Z";
const RAPIDS = "M168 108 C172 160 156 200 160 240 C163 280 152 302 146 328";
const TRAM = "M28 70 L56 140 Q112 186 108 272 L138 236 L190 254 L262 204 L314 236 Q276 346 306 450";
const RIDGE = "M30 238 C60 226 90 228 120 250";

// every street dot as one path: far cheaper than an element each
function dotPath(): string {
  const r = 3.6;
  let d = "";
  for (const id in nodes) {
    const n = nodes[id];
    if (n.kind !== "dot") continue;
    d += "M " + (n.x - r).toFixed(1) + " " + n.y.toFixed(1) + " A " + r + " " + r + " 0 1 0 " + (n.x + r).toFixed(1) + " " + n.y.toFixed(1)
      + " A " + r + " " + r + " 0 1 0 " + (n.x - r).toFixed(1) + " " + n.y.toFixed(1) + " Z ";
  }
  return d;
}

let mapCache: any = null;
let mapKey = "";
function MapArt() {
  const key = S + ":" + OX + ":" + OY;
  if (mapCache && mapKey === key) return mapCache;
  const box = { position: "absolute", left: OX, top: OY, width: MW * S, height: MH * S };
  const vb = "0 0 " + MW + " " + MH;
  const labels: any[] = [];
  for (const id in nodes) {
    const n = nodes[id];
    if (n.kind === "dot") continue;
    const w = 90;
    const r = n.kind === "place" ? 13 : 17;
    let lx = n.x - w / 2, ly = n.y + r + 1, align = "center";
    if (n.label === 1) ly = n.y - r - 12;
    if (n.label === 2) { lx = n.x - r - w - 2; ly = n.y - 6; align = "right"; }
    if (n.label === 3) { lx = n.x + r + 2; ly = n.y - 6; align = "left"; }
    if (n.kind === "arena") { lx = n.x + 20; ly = n.y + 2; }
    if (lx < 1) { lx = 1; align = "left"; }
    labels.push(<div className="label" style={{ left: sx(lx), top: sy(ly), width: w * S, textAlign: align, fontSize: Math.max(8, 9 * S) }}>{n.name}</div>);
  }
  mapCache = [
    <div className="land" style={box} />,
    <path d={LAKE_N} fill="#5fa8d3" viewBox={vb} style={box} />,
    <path d={LAKE_S} fill="#5fa8d3" viewBox={vb} style={box} />,
    <path d={LAKE_K} fill="#5fa8d3" viewBox={vb} style={box} />,
    <path d={RAPIDS} stroke="#5fa8d3" strokeWidth="6" fill="none" viewBox={vb} style={box} />,
    <path d={RIDGE} stroke="#8fbf6a" strokeWidth="14" fill="none" viewBox={vb} style={box} />,
    <div className="lakename" style={{ left: sx(210), top: sy(30), fontSize: Math.max(9, 12 * S) }}>Näsijärvi</div>,
    <div className="lakename" style={{ left: sx(10), top: sy(430), fontSize: Math.max(9, 12 * S) }}>Pyhäjärvi</div>,
    <path d={TRAM} stroke="rgba(214,40,57,0.55)" strokeWidth="7" fill="none" viewBox={vb} style={box} />,
    <path d={roadPaths.join(" ")} stroke="#f4ecd8" strokeWidth="3" fill="none" viewBox={vb} style={box} />,
    <path d={dotPath()} fill="#8a6d3b" viewBox={vb} style={box} />,
    labels,
  ];
  mapKey = key;
  return mapCache;
}

// a spot that is not highlighted is the same object frame after frame, so
// the engine serializes it only once
const spotCache: any = {};
function Spot(id: string) {
  const hl = (phase === "choose" && options.some((o) => o.node === id)) || (phase === "tram" && tramTargets.indexOf(id) >= 0);
  if (hl) return SpotNow(id);
  const tk = tokens[id];
  const key = S + ":" + OX + ":" + OY + ":" + (tk ? (tk.open ? tk.kind : "x") : "");
  const c = spotCache[id];
  if (c && c.key === key) return c.el;
  const el = SpotNow(id);
  spotCache[id] = { key: key, el: el };
  return el;
}

function SpotNow(id: string) {
  const n = nodes[id];
  const x = sx(n.x), y = sy(n.y);
  const optIdx = phase === "choose" ? options.findIndex((o) => o.node === id) : -1;
  const tramOpt = phase === "tram" && tramTargets.indexOf(id) >= 0;
  const human = players.length > 0 && !P().ai;
  const hot = (optIdx >= 0 || tramOpt) && human;
  const pulse = 1 + Math.sin(t * 7) * 0.12;
  const out: any[] = [];
  const click = hot ? (optIdx >= 0 ? () => choose(options[optIdx]) : () => rideTram(id)) : undefined;
  if (n.kind === "dot") {
    if (optIdx >= 0 || tramOpt) {
      const R = 11 * S * pulse;
      out.push(<div className="ring" id={"o" + id} onClick={click} style={{ left: x - R, top: y - R, width: R * 2, height: R * 2, borderRadius: R }} />);
    }
    return out;
  }
  if (optIdx >= 0 || tramOpt) {
    const R = 20 * S * pulse;
    out.push(<div className="ring" id={"o" + id} onClick={click} style={{ left: x - R, top: y - R, width: R * 2, height: R * 2, borderRadius: R }} />);
  }
  if (n.kind === "arena") {
    const w = 46 * S, h = 30 * S;
    out.push(<div className="arena" id={hot ? "a" + id : undefined} onClick={click} style={{ left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: 8 * S }}><div style={{ fontSize: 15 * S }}>🏒</div></div>);
  } else if (n.kind === "jail") {
    const w = 26 * S;
    out.push(<div className="jail" style={{ left: x - w / 2, top: y - w / 2, width: w, height: w, borderRadius: 5 * S }}><div style={{ fontSize: 13 * S }}>🚓</div></div>);
  } else {
    const r = 12 * S;
    const tk = tokens[id];
    const cls = id === "sarkanniemi" ? "place gold" : "place";
    out.push(<div className={cls} id={hot ? "p" + id : undefined} onClick={click} style={{ left: x - r - 2 * S, top: y - r - 2 * S, width: r * 2 + 4 * S, height: r * 2 + 4 * S, borderRadius: r + 2 * S }} />);
    if (tk && !tk.open) {
      out.push(<div className="puck" style={{ left: x - r * 0.78, top: y - r * 0.78, width: r * 1.56, height: r * 1.56, borderRadius: r }}><div className="puckq" style={{ fontSize: 10 * S }}>?</div></div>);
    } else if (tk) {
      out.push(<div className="found" style={{ left: x - r, top: y - r, width: r * 2, height: r * 2, fontSize: 12 * S }}>{tk.kind === "cup" ? "" : smallIcon(tk.kind)}</div>);
    }
  }
  if (n.tram) {
    const r = 6 * S;
    out.push(<div className="tramdot" style={{ left: x + 8 * S, top: y - 15 * S, width: r * 2, height: r * 2, borderRadius: r, fontSize: 7 * S }}>🚋</div>);
  }
  return out;
}

function smallIcon(k: Kind): string {
  return k === "robber" ? "🦹" : k === "sausage" ? "🌭" : k === "diamond" ? "💎" : k === "empty" ? "·" : k === "cup" ? "🏆" : "🏒";
}

function Pieces() {
  const out: any[] = [];
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    let x = nodes[p.node].x, y = nodes[p.node].y;
    if (phase === "move" && i === cur) {
      const k = Math.min(moveK, movePath.length - 1.001);
      const a = nodes[movePath[Math.floor(k)]], b = nodes[movePath[Math.floor(k) + 1]];
      const f = k - Math.floor(k);
      x = a.x + (b.x - a.x) * f; y = a.y + (b.y - a.y) * f;
      if (!moveTram) y -= Math.sin(f * Math.PI) * 6;
    }
    const same = players.length === 2 && players[0].node === players[1].node && !(phase === "move");
    if (same) x += i === 0 ? -10 : 10;
    const r = 11 * S * (i === cur && phase !== "over" ? 1 + Math.sin(t * 5) * 0.06 : 1);
    const tm = team(p);
    out.push(<div className="piece" style={{ left: sx(x) - r, top: sy(y) - r * 1.6, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: tm.main, borderColor: tm.accent, borderWidth: Math.max(2, 2.5 * S) }}>
      <div style={{ fontSize: 12 * S }}>{tm.icon}</div>
    </div>);
    if (p.cup) out.push(<div className="cupflag" style={{ left: sx(x) + r * 0.4, top: sy(y) - r * 2.9, fontSize: 14 * S }}>🏆</div>);
    if (p.jail) out.push(<div className="bars" style={{ left: sx(x) - r, top: sy(y) - r * 1.6, width: r * 2, height: r * 2, borderRadius: r }} />);
  }
  return out;
}

function Die(v: number, size: number) {
  const pips: any = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
  const d = size * 0.18;
  const kids = pips[v].map((c: number[]) => <div className="pip" style={{ left: size * 0.16 + c[0] * size * 0.25, top: size * 0.16 + c[1] * size * 0.25, width: d, height: d, borderRadius: d / 2 }} />);
  return <div className="die" style={{ width: size, height: size, borderRadius: size * 0.18 }}>{kids}</div>;
}

function PlayerCard(i: number) {
  const p = players[i];
  const tm = team(p);
  const active = i === cur && phase !== "over";
  return (
    <div className={active ? "card active" : "card"} style={{ backgroundColor: tm.main, borderColor: active ? tm.accent : "rgba(0,0,0,0)" }}>
      <div className="cardtop">
        <div className="cardicon">{tm.icon}</div>
        <div className="cardname">{tm.name}{p.ai ? " 📱" : ""}</div>
      </div>
      <div className="cardrow">
        <div className="money">{p.money} €</div>
        <div className="items">{(p.sausages > 0 ? "🌭" + (p.sausages > 1 ? "×" + p.sausages : "") : "") + (p.cup ? " 🏆" : "") + (p.jail ? " 🔒" : "")}</div>
      </div>
    </div>
  );
}

function Btn(id: string, text: string, cls: string, fn: () => void) {
  return <div className={"btn " + cls} id={id} onClick={fn}>{text}</div>;
}

function Actions() {
  const p = P();
  if (p.ai && phase !== "over") return <div className="actions"><div className="thinking">{rg.t("Puhelin miettii…", "The phone is thinking…", "El teléfono piensa…")}</div></div>;
  const b: any[] = [];
  if (phase === "turn") {
    if (p.jail) {
      if (p.sausages > 0) b.push(Btn("sausage", "🌭 " + rg.t("Anna makkara", "Give sausage", "Dar morcilla"), "brown", useSausage));
      if (p.money >= FINE) b.push(Btn("fine", rg.t("Sakko ", "Fine ", "Multa ") + FINE + " €", "blue", payFine));
      b.push(Btn("jailroll", "🎲 " + rg.t("Heitä 6", "Roll a 6", "Saca un 6"), "green", doJailRoll));
    } else {
      b.push(Btn("roll", "🎲 " + rg.t("Heitä", "Roll", "Tirar"), "green", doRoll));
      if (unopened(p.node)) {
        if (p.money >= OPEN_COST) b.push(Btn("open", rg.t("Avaa ", "Open ", "Abrir ") + OPEN_COST + " €", "blue", payOpen));
        b.push(Btn("luck", "🍀 4–6", "purple", doLuck));
      }
      if (nodes[p.node].tram && p.money >= TRAM_COST) b.push(Btn("tram", "🚋 " + TRAM_COST + " €", "red", startTram));
    }
  } else if (phase === "place") {
    if (p.money >= OPEN_COST) b.push(Btn("open", rg.t("Avaa ", "Open ", "Abrir ") + OPEN_COST + " €", "blue", payOpen));
    b.push(Btn("luck", "🍀 " + rg.t("Onnella 4–6", "Luck 4–6", "Suerte 4–6"), "purple", doLuck));
    b.push(Btn("skip", rg.t("Ohita", "Skip", "Pasar"), "grey", () => { rg.sound("click"); endTurn(); }));
  } else if (phase === "tram") {
    b.push(Btn("cancel", rg.t("Peruuta", "Cancel", "Cancelar"), "grey", () => { phase = "turn"; rg.sound("click"); }));
  }
  return <div className="actions">{b}</div>;
}

function Reveal() {
  if (!reveal) return null;
  const k: Kind = reveal.kind;
  const p = P();
  const k01 = Math.min(1, (t - reveal.at) * 4 + 0.05);
  let icon: any = smallIcon(k);
  let title = "";
  let sub = "";
  if (k === "cup") { icon = "🏆"; title = rg.t("KANADA-MALJA!", "THE CANADA CUP!", "¡LA COPA!"); sub = rg.t("Vie se Nokia Areenalle!", "Take it to Nokia Arena!", "¡Llévala al Nokia Arena!"); }
  else if (k === "robber") { title = rg.t("Rosvo!", "Robber!", "¡Ladrón!"); sub = rg.t("Vei kaikki rahat.", "Took all the money.", "Se llevó todo el dinero."); }
  else if (k === "sausage") { icon = <div className="sausage" />; title = rg.t("Mustamakkara", "Black sausage", "Morcilla"); sub = rg.t("Ei paljon arvoa, mutta sillä pääsee putkasta.", "Not worth much, but it gets you out of the lock-up.", "No vale mucho, pero te saca del calabozo."); }
  else if (k === "empty") { icon = <div className="puck big" />; title = rg.t("Tyhjä", "Empty", "Vacío"); sub = rg.t("Ei mitään.", "Nothing.", "Nada."); }
  else if (k === "diamond") { title = rg.t("Timantti!", "A diamond!", "¡Un diamante!"); sub = "+" + reveal.gain + " €"; }
  else {
    const nm = k === "kummola" ? "Kummola" : k === "raipe" ? "Raipe" : "Barkov";
    icon = <div className="jersey" style={{ backgroundColor: k === "raipe" ? "#1d7a3e" : "#f37021" }}><div className="jnum">{k === "kummola" ? "K" : k === "raipe" ? "R" : "B"}</div></div>;
    title = nm + "!";
    sub = "+" + reveal.gain + " €";
  }
  if (reveal.double && (k !== "empty" && k !== "robber" && k !== "cup")) sub += rg.t("  (Särkänniemi: tupla!)", "  (Särkänniemi: double!)", "  (Särkänniemi: ¡doble!)");
  return (
    <div className="veil" id="reveal" onClick={() => { if (!p.ai) closeReveal(); }}>
      <div className="revcard" style={{ transform: "scale(" + rg.ease.back(k01).toFixed(3) + ")" }}>
        <div className="revplace">{nodes[reveal.place].name}</div>
        <div className="revicon">{icon}</div>
        <div className="revtitle">{title}</div>
        <div className="revsub">{sub}</div>
        {!p.ai ? <div className="revtap">{rg.t("Napauta jatkaaksesi", "Tap to continue", "Toca para seguir")}</div> : null}
      </div>
    </div>
  );
}

function Menu() {
  const bob = Math.sin(t * 3) * 5;
  return (
    <div className="screen menu">
      <div className="mtitle" style={{ marginTop: 50 + bob }}>Maljajahti</div>
      <div className="msub">{rg.t("Ilves vastaan Tappara", "Ilves vs Tappara", "Ilves contra Tappara")}</div>
      <div className="mcup">🏆</div>
      <div className="mtext">{rg.t("Etsi Kanada-malja Tampereelta ja vie se ensimmäisenä Nokia Areenalle.", "Find the Canada Cup in Tampere and be the first to bring it to Nokia Arena.", "Encuentra la copa en Tampere y llévala al Nokia Arena.")}</div>
      {Btn("two", "🐆 ⚔️ 🪓  " + rg.t("Kaksi pelaajaa", "Two players", "Dos jugadores"), "green wide", () => { rg.sound("click"); newGame(false, "ilves"); })}
      {Btn("phone", "📱  " + rg.t("Puhelinta vastaan", "Against the phone", "Contra el teléfono"), "orange wide", () => { rg.sound("click"); phase = "pick"; })}
      {Btn("rules", "📜  " + rg.t("Säännöt", "Rules", "Reglas"), "grey wide", () => { rg.sound("click"); showRules = true; })}
      {showRules ? Rules() : null}
    </div>
  );
}

let showRules = false;
function Rules() {
  const lines = rg.lang === "en" ? [
    "🎲 Roll and pick where to go. You may stop early at a place with a puck.",
    "🏒 At a place, open the puck for 100 € or roll 4–6.",
    "🏆 Kummola 300 €, Raipe 600 €, Barkov 1000 €, diamond 500 €.",
    "🦹 A robber takes all your money.",
    "🎡 Anything found in Särkänniemi pays double.",
    "🚋 From a tram stop, ride to any other stop for 50 €.",
    "🚓 Land on Sori station and you are locked up: give a black sausage, pay 100 € or roll a 6.",
    "💥 Land exactly on the Cup carrier and you take the Cup.",
    "🏟️ First to bring the Cup to Nokia Arena wins!",
  ] : [
    "🎲 Heitä noppaa ja valitse minne menet. Kiekon kohdalle voi pysähtyä ennen aikojaan.",
    "🏒 Paikassa voit avata kiekon 100 eurolla tai heittämällä 4–6.",
    "🏆 Kummola 300 €, Raipe 600 €, Barkov 1000 €, timantti 500 €.",
    "🦹 Rosvo vie kaikki rahat.",
    "🎡 Särkänniemestä löydetty tavara tulee tuplana.",
    "🚋 Ratikkapysäkiltä pääsee mille tahansa pysäkille 50 eurolla.",
    "🚓 Sorin asemalle osunut joutuu putkaan: anna mustamakkara, maksa 100 € sakko tai heitä kuutonen.",
    "💥 Osu tarkalleen maljan kantajan kohdalle, niin malja vaihtaa omistajaa.",
    "🏟️ Ensimmäinen, joka tuo maljan Nokia Areenalle, voittaa!",
  ];
  return (
    <div className="veil" id="rulesveil" onClick={() => { showRules = false; rg.sound("click"); }}>
      <div className="rules">
        <div className="rtitle">{rg.t("Säännöt", "Rules", "Reglas")}</div>
        {lines.map((l) => <div className="rline">{l}</div>)}
        <div className="revtap">{rg.t("Napauta sulkeaksesi", "Tap to close", "Toca para cerrar")}</div>
      </div>
    </div>
  );
}

function Pick() {
  return (
    <div className="screen menu">
      <div className="mtitle" style={{ marginTop: 70 }}>{rg.t("Valitse joukkue", "Pick your team", "Elige equipo")}</div>
      <div className="teambtn" id="pick_ilves" style={{ backgroundColor: TEAM.ilves.main, borderColor: TEAM.ilves.accent }} onClick={() => { rg.sound("click"); newGame(true, "ilves"); }}>
        <div className="teamicon">🐆</div><div className="teamname">Ilves</div>
      </div>
      <div className="teambtn" id="pick_tappara" style={{ backgroundColor: TEAM.tappara.main, borderColor: TEAM.tappara.accent }} onClick={() => { rg.sound("click"); newGame(true, "tappara"); }}>
        <div className="teamicon">🪓</div><div className="teamname">Tappara</div>
      </div>
      {Btn("back", rg.t("← Takaisin", "← Back", "← Atrás"), "grey", () => { rg.sound("click"); phase = "menu"; })}
    </div>
  );
}

function Over() {
  const p = players[winner];
  const tm = team(p);
  const human = !vsPhone || !p.ai;
  return (
    <div className="veil">
      <div className="revcard" style={{ backgroundColor: tm.main }}>
        <div className="revicon">🏆</div>
        <div className="revtitle" style={{ color: tm.accent }}>{tm.name} {rg.t("voitti!", "wins!", "¡gana!")}</div>
        <div className="revsub" style={{ color: "#ffffff" }}>{vsPhone ? (human ? rg.t("Kanada-malja on Nokia Areenalla!", "The Cup is at Nokia Arena!", "¡La copa está en el Nokia Arena!") : rg.t("Puhelin ehti ensin. Uusi yritys?", "The phone was first. Try again?", "El teléfono ganó. ¿Otra vez?")) : rg.t("Kanada-malja on Nokia Areenalla!", "The Cup is at Nokia Arena!", "¡La copa está en el Nokia Arena!")}</div>
        {overClock > 0.8 ? Btn("again", rg.t("Uusi peli", "New game", "Nuevo juego"), "green", () => { rg.sound("click"); newGame(vsPhone, players[0].team); }) : null}
        {overClock > 0.8 ? Btn("tomenu", rg.t("Valikkoon", "Menu", "Menú"), "grey", () => { rg.sound("click"); phase = "menu"; }) : null}
      </div>
    </div>
  );
}

function view() {
  if (phase === "menu") return Menu();
  if (phase === "pick") return Pick();
  const top = 64, bottom = 160;
  const avail = height - top - bottom;
  S = Math.min(width / MW, avail / MH);
  OX = (width - MW * S) / 2;
  OY = top + (avail - MH * S) / 2;
  const spots: any[] = [];
  for (const id in nodes) if (nodes[id].kind !== "dot" || phase === "choose") spots.push(Spot(id));
  const showDie = phase === "roll" || phase === "luck" || phase === "jailroll" || phase === "choose";
  return (
    <div className="screen game">
      {MapArt()}
      {spots}
      {Pieces()}
      <div className="topbar">{PlayerCard(0)}{PlayerCard(1)}</div>
      <div className="panel" style={{ top: height - bottom }}>
        <div className="msgrow">
          {showDie ? Die(phase === "choose" ? dice : diceShow, 40) : <div className="turnicon" style={{ backgroundColor: team(P()).main }}>{team(P()).icon}</div>}
          <div className="msg">{msg}</div>
        </div>
        {Actions()}
      </div>
      {phase === "reveal" ? Reveal() : null}
      {phase === "over" ? Over() : null}
    </div>
  );
}
