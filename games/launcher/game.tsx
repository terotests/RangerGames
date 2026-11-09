// The game menu: every game under /games as a tile. A tap starts it; the
// Back button (Esc on a keyboard) in a game comes back here. ⚙️ turns to the
// settings: a tap on a tile then turns that game's speech on or off.

type Game = { id: string; name: string; description: string; icon: string; color: string; players: string; i18n?: any; speech?: boolean };
type Bubble = { x: number; y: number; r: number; v: number; c: string };

const COLORS = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#f78c6b", "#c77dff"];
let games: Game[] = [];
let bubbles: Bubble[] = [];
let t = 0;
let pressed = "";
let leaving = "";
let leaveClock = 0;
let settings = false;          // ⚙️: tiles turn speech on and off instead of starting the game

function init() {
  games = rg.games();
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

function Tile(g: Game, i: number) {
  const bob = Math.sin(t * 2 + i) * 2;
  const down = pressed === g.id && leaving !== "";
  return (
    <div className="tile" id={"g-" + g.id} onClick={() => open(g.id)}
      style={{ backgroundColor: g.color, marginTop: bob, transform: down ? "scale(0.94)" : "none", opacity: settings && !rg.speechOn(g.id) ? 0.55 : 1 }}>
      <div className="icon">{g.icon}</div>
      <div className="name">{nameOf(g)}</div>
      <div className="players">{settings ? (rg.speechOn(g.id) ? rg.t("🔊 Puhe päällä", "🔊 Speech on", "🔊 Voz activada") : rg.t("🔇 Ei puhetta", "🔇 No speech", "🔇 Sin voz")) : players(g.players)}</div>
    </div>
  );
}

function view() {
  return (
    <div className="screen">
      {bubbles.map((b) => <div className="bubble" style={{ left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2, backgroundColor: b.c }} />)}
      <div className="header">
        <div className="logo">RangerGames</div>
        <div className="sub">{settings ? rg.t("Napauta peliä: puhe päälle tai pois", "Tap a game: speech on or off", "Toca un juego: voz sí o no") : rg.t("Valitse peli!", "Choose a game!", "¡Elige un juego!")}</div>
        <div className="flags">{rg.langs.map((l) => Flag(l))}{Gear()}</div>
      </div>
      <div className="grid">{games.map((g, i) => Tile(g, i))}</div>
    </div>
  );
}
