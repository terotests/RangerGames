// The game menu. The front page shows the sections (Älypelit, Korttipelit,
// Tiedelabra, …); a tap opens the section's games as tiles, and a tap on a
// tile starts the game. Back from a game returns to the same section. A
// game's section comes from "section" in its game.json, or else from
// SECTION_OF below. ⚙️ turns to the settings: a tap on a tile then turns
// that game's speech on or off.

type Game = { id: string; name: string; description: string; icon: string; color: string; players: string; i18n?: any; speech?: boolean; section?: string };
type Section = { id: string; icon: string; color: string; fi: string; en: string; es: string };

const SECTIONS: Section[] = [
  { id: "aly", icon: "♟️", color: "#6a994e", fi: "Älypelit", en: "Strategy", es: "Estrategia" },
  { id: "kortit", icon: "🃏", color: "#9d4edd", fi: "Korttipelit", en: "Card games", es: "Cartas" },
  { id: "labra", icon: "🔬", color: "#f4a100", fi: "Tiedelabra", en: "Science lab", es: "Laboratorio" },
  { id: "tutkimus", icon: "🧭", color: "#2a9d8f", fi: "Tutkimusmatkat", en: "Expeditions", es: "Expediciones" },
  { id: "opi", icon: "🔤", color: "#118ab2", fi: "Opi", en: "Learn", es: "Aprende" },
  { id: "seikkailu", icon: "🚀", color: "#ef476f", fi: "Seikkailut", en: "Adventures", es: "Aventuras" },
  { id: "muut", icon: "🎈", color: "#7b2cbf", fi: "Muut", en: "Other", es: "Otros" },
];
// games whose game.json has no "section"
const SECTION_OF: any = {
  shakki: "aly", pallosade: "aly", ristinolla: "aly",
  lampolabra: "labra", lamppu: "labra", magneetti: "labra", peilit: "labra", vesilabra: "labra", vesiputket: "labra", vipu: "labra",
  korkeasaari: "tutkimus", muutto: "tutkimus", kopteri: "tutkimus", vuodenajat: "tutkimus", luut: "tutkimus", navi: "tutkimus", kolmarden: "tutkimus", tampere: "tutkimus",
  aakkoset: "opi", laskupeli: "opi", kielipelit: "opi", kielisaari: "opi",
  haamujahti: "seikkailu", pupu: "seikkailu", pallopolku: "seikkailu", painovoima: "seikkailu", kanadamalja: "seikkailu", nappikisa: "seikkailu",
};
type Bubble = { x: number; y: number; r: number; v: number; c: string };

const COLORS = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#f78c6b", "#c77dff"];
let games: Game[] = [];
let bubbles: Bubble[] = [];
let t = 0;
let pressed = "";
let leaving = "";
let leaveClock = 0;
let settings = false;          // ⚙️: tiles turn speech on and off instead of starting the game
let section = "";              // the open section, "" the front page

function sectionOf(g: Game) {
  const s = g.section || SECTION_OF[g.id] || "muut";
  for (const x of SECTIONS) if (x.id === s) return s;
  return "muut";
}
function gamesIn(s: string) { return games.filter((g) => sectionOf(g) === s); }
function sectionName(x: Section) { return rg.t(x.fi, x.en, x.es); }

function openSection(s: string) {
  section = s;
  rg.save("section", s);
  rg.sound("click");
  rg.vibrate(15);
}

function onBack() {
  if (section) { section = ""; rg.save("section", ""); rg.sound("click"); } else rg.exit();
}

function init() {
  games = rg.games();
  section = rg.load("section", "");
  if (section && !gamesIn(section).length) section = "";
  for (let i = 0; i < 14; i++) {
    bubbles.push({ x: rg.random() * width, y: rg.random() * height, r: 8 + rg.random() * 26, v: 10 + rg.random() * 30, c: COLORS[i % COLORS.length] });
  }
}

function tick(dt: number) {
  t += dt;
  for (const b of bubbles) {
    b.y -= b.v * dt;
    if (b.y < -b.r * 2) { b.y = height + b.r; b.x = rg.random() * width; }
  }
  if (leaving) {
    leaveClock += dt;
    if (leaveClock > 0.18) { const id = leaving; leaving = ""; rg.launch(id); }
  }
}

function open(id: string) {
  if (settings) { toggleSpeech(id); return; }
  if (leaving) return;
  pressed = id;
  leaving = id;
  leaveClock = 0;
  rg.sound("click");
  rg.vibrate(15);
  if (rg.speechOn(id)) rg.say("peli_" + id);  // the game's name aloud (a clip in voice/fi.json, if there is one)
}

function toggleSpeech(id: string) {
  const on = !rg.speechOn(id);
  rg.setSpeech(id, on);
  rg.sound(on ? "pop" : "tick");
  rg.vibrate(15);
  if (on) rg.say("peli_" + id);
}

function Gear() {
  return (
    <div className={settings ? "flag on" : "flag"} id="settings" onClick={() => { settings = !settings; rg.sound("click"); rg.vibrate(15); }}>
      <div className="flagicon">{settings ? "✓" : "⚙️"}</div>
    </div>
  );
}

function players(p: string) {
  return p === "2" ? rg.t("2 pelaajaa", "2 players", "2 jugadores")
    : p === "1-2" ? rg.t("1–2 pelaajaa", "1–2 players", "1–2 jugadores")
    : rg.t("1 pelaaja", "1 player", "1 jugador");
}

// the game's name in the chosen language (game.json "i18n"), Finnish otherwise
function nameOf(g: Game) {
  const tr = g.i18n && g.i18n[rg.lang];
  return tr && tr.name ? tr.name : g.name;
}

// The flags: a tap changes the language of every game, text and speech.
function chooseLang(l: string) {
  if (l === rg.lang) return;
  rg.setLang(l);
  rg.sound("pop");
  rg.vibrate(15);
  rg.say("hei");
}

function Flag(l: string) {
  const on = rg.lang === l;
  return (
    <div className={on ? "flag on" : "flag"} id={"lang-" + l} onClick={() => chooseLang(l)}>
      <div className="flagicon">{rg.flags[l]}</div>
    </div>
  );
}

function SectionTile(x: Section, i: number) {
  const bob = Math.sin(t * 2 + i) * 2;
  const n = gamesIn(x.id).length;
  const icons = gamesIn(x.id).slice(0, 4).map((g) => <div className="mini">{g.icon}</div>);
  return (
    <div className="stile" id={"s-" + x.id} onClick={() => openSection(x.id)} style={{ backgroundColor: x.color, marginTop: 6 + bob }}>
      <div className="sicon">{x.icon}</div>
      <div className="sname">{sectionName(x)}</div>
      <div className="minis">{icons}</div>
      <div className="players">{n === 1 ? rg.t("1 peli", "1 game", "1 juego") : rg.t(n + " peliä", n + " games", n + " juegos")}</div>
    </div>
  );
}

function Tile(g: Game, i: number) {
  const bob = Math.sin(t * 2 + i) * 2;
  const down = pressed === g.id && leaving !== "";
  return (
    <div className="tile" id={"g-" + g.id} onClick={() => open(g.id)}
      style={{ backgroundColor: g.color, marginTop: bob, transform: down ? "scale(0.94)" : "none", opacity: settings && !rg.speechOn(g.id) ? 0.55 : 1 }}>
      <div className="icon">{g.icon}</div>
      <div className={nameOf(g).length > 11 ? "name long" : "name"}>{nameOf(g)}</div>
      <div className="players">{settings ? (rg.speechOn(g.id) ? rg.t("🔊 Puhe päällä", "🔊 Speech on", "🔊 Voz activada") : rg.t("🔇 Ei puhetta", "🔇 No speech", "🔇 Sin voz")) : players(g.players)}</div>
    </div>
  );
}

function view() {
  const bg = bubbles.map((b) => <div className="bubble" style={{ left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2, backgroundColor: b.c }} />);
  if (section) {
    let sec = SECTIONS[SECTIONS.length - 1];
    for (const x of SECTIONS) if (x.id === section) sec = x;
    return (
      <div className="screen">
        {bg}
        <div className="shead">
          <div className="sback" id="back" onClick={() => onBack()}>←</div>
          <div className="stitle">{sec.icon + " " + sectionName(sec)}</div>
          {Gear()}
        </div>
        {settings ? <div className="sub">{rg.t("Napauta peliä: puhe päälle tai pois", "Tap a game: speech on or off", "Toca un juego: voz sí o no")}</div> : null}
        <div className="grid">{gamesIn(section).map((g, i) => Tile(g, i))}</div>
      </div>
    );
  }
  return (
    <div className="screen">
      {bg}
      <div className="header">
        <div className="logo">RangerGames</div>
        <div className="sub">{rg.t("Valitse peli!", "Choose a game!", "¡Elige un juego!")}</div>
        <div className="flags">{rg.langs.map((l) => Flag(l))}</div>
      </div>
      <div className="grid">{SECTIONS.filter((x) => gamesIn(x.id).length > 0).map((x, i) => SectionTile(x, i))}</div>
    </div>
  );
}
