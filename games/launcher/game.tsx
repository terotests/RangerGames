// The game menu. The front page shows the sections (Älypelit, Korttipelit,
// Tiedelabra, …); a tap opens the section's games as tiles, and a tap on a
// tile starts the game. Back from a game returns to the same section. A
// game's section comes from "section" in its game.json, or else from
// SECTION_OF below. In a section ⚙️ turns to the speech settings: a tap on a
// tile then turns that game's speech on or off. ⚙️ on the front page opens
// the settings page: the language and connecting two phones (rg.net; the
// link stays up from game to game and the friend's phone follows this one).

type Game = { image?: string; id: string; name: string; description: string; icon: string; color: string; players: string; i18n?: any; speech?: boolean; section?: string };
type Section = { id: string; icon: string; color: string; fi: string; en: string; es: string };

const SECTIONS: Section[] = [
  { id: "aly", icon: "♟️", color: "#6a994e", fi: "Älypelit", en: "Strategy", es: "Estrategia" },
  { id: "kortit", icon: "🃏", color: "#9d4edd", fi: "Korttipelit", en: "Card games", es: "Cartas" },
  { id: "labra", icon: "🔬", color: "#f4a100", fi: "Tiedelabra", en: "Science lab", es: "Laboratorio" },
  { id: "tutkimus", icon: "🧭", color: "#2a9d8f", fi: "Tutkimusmatkat", en: "Expeditions", es: "Expediciones" },
  { id: "opi", icon: "🔤", color: "#118ab2", fi: "Opi", en: "Learn", es: "Aprende" },
  { id: "seikkailu", icon: "🚀", color: "#ef476f", fi: "Seikkailut", en: "Adventures", es: "Aventuras" },
  { id: "rakennus", icon: "🔨", color: "#f77f00", fi: "Rakennuspelit", en: "Building", es: "Construcción" },
  { id: "muut", icon: "🎈", color: "#7b2cbf", fi: "Muut", en: "Other", es: "Otros" },
];
// games whose game.json has no "section"
const SECTION_OF: any = {
  shakki: "aly", pallosade: "aly", ristinolla: "aly",
  lampolabra: "labra", lamppu: "labra", magneetti: "labra", peilit: "labra", prisma: "labra", vesilabra: "labra", vesiputket: "labra", vipu: "labra",
  korkeasaari: "tutkimus", muutto: "tutkimus", kopteri: "tutkimus", vuodenajat: "tutkimus", luut: "tutkimus", navi: "tutkimus", kolmarden: "tutkimus", tampere: "tutkimus",
  aakkoset: "opi", laskupeli: "opi", kello: "opi", raha: "opi", kielipelit: "opi", kielisaari: "opi",
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
let page = "";                 // "settings": the settings page
let netNote = "";              // on the settings page: what went wrong last

const NET_ERRORS: { [k: string]: string[] } = {
  "no-bluetooth": ["Tässä laitteessa ei ole Bluetoothia.", "This device has no Bluetooth.", "Este dispositivo no tiene Bluetooth."],
  "bluetooth-off": ["Bluetooth ei mennyt päälle.", "Bluetooth did not turn on.", "El Bluetooth no se encendió."],
  "permission": ["Tarvitaan lupa käyttää Bluetoothia.", "Permission to use Bluetooth is needed.", "Se necesita permiso para usar Bluetooth."],
  "connect-failed": ["Kaverin puhelimeen ei saatu yhteyttä.", "Could not reach your friend's phone.", "No se pudo conectar con el teléfono de tu amigo."],
  "busy": ["Kaverin puhelimeen ei mahdu enempää.", "Your friend's phone is full.", "El teléfono de tu amigo está lleno."]
};

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
  if (page) { page = ""; rg.sound("click"); }
  else if (section) { section = ""; rg.save("section", ""); rg.sound("click"); } else rg.exit();
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

function openSettings() {
  page = "settings"; netNote = "";
  rg.sound("click"); rg.vibrate(15);
  if (!rg.net.connected() && rg.net.state === "off") rg.say("net_aloita_tai_liity");
}

function onNet(ev: any) {
  if (ev.type === "join") {
    netNote = "";
    rg.sound("win"); rg.vibrate([40, 60, 40]);
    rg.say("net_yhdistetty");
  } else if (ev.type === "leave" && !rg.net.links.some((l: any) => l.id === ev.peer.id)) {
    netNote = rg.t("Yhteys katkesi.", "The connection was lost.", "Se perdió la conexión.");
    rg.sound("lose"); rg.say("net_katkesi");
  } else if (ev.type === "state" && ev.state === "error") {
    const e = NET_ERRORS[ev.reason];
    netNote = e ? rg.t(e[0], e[1], e[2]) : rg.t("Yhteys ei onnistunut.", "Could not connect.", "No se pudo conectar.");
    rg.sound("wrong"); rg.say("net_virhe");
  }
}

function netCancel() { rg.sound("click"); rg.net.close(); netNote = ""; }

// the two phones: start (host) or join a friend's, then who is connected
function NetPanel() {
  const st = rg.net.state;
  const pulse = 1 + Math.sin(t * 4) * 0.08;
  const linked = rg.net.links;
  let body: any;
  if (!rg.net.available) {
    body = <div className="nnote">{rg.t("Tässä laitteessa ei voi yhdistää puhelimia.", "Phones cannot be connected on this device.", "En este dispositivo no se pueden conectar teléfonos.")}</div>;
  } else if (linked.length) {
    const host = rg.net.role === "host";
    body = [
      <div className="nicon">✅</div>,
      <div className="nlabel">{rg.t("Yhdistetty", "Connected", "Conectado")}</div>,
      linked.map((l: any) => <div className="nname">📱 {l.name}</div>),
      <div className="nhint">{host
        ? rg.t("Valitse peli, niin kaveri tulee samaan peliin.", "Choose a game and your friend comes along.", "Elige un juego y tu amigo viene contigo.")
        : rg.t("Kaveri valitsee pelin, ja tämä puhelin tulee mukaan.", "Your friend chooses the game, and this phone comes along.", "Tu amigo elige el juego y este teléfono le sigue.")}</div>,
      host && st === "hosting" ? <div className="nhint">{rg.t("Lisää kavereita voi vielä liittyä.", "More friends can still join.", "Todavía pueden unirse más amigos.")}</div> : null,
      <div className="nbtn grey" id="net-off" onClick={() => netCancel()}>{rg.t("Katkaise yhteys", "Disconnect", "Desconectar")}</div>
    ];
  } else if (st === "hosting") {
    body = [
      <div className="nicon" style={{ transform: "scale(" + pulse.toFixed(3) + ")" }}>📡</div>,
      <div className="nlabel">{rg.t("Odotetaan kaveria…", "Waiting for your friend…", "Esperando a tu amigo…")}</div>,
      <div className="nhint">{rg.t("Kaveri painaa omassa puhelimessaan Liity ja valitsee tämän:", "Your friend taps Join on their phone and picks this one:", "Tu amigo pulsa Unirse en su teléfono y elige este:")}</div>,
      <div className="nname">📱 {rg.net.name}</div>,
      rg.net.kind === "web" ? <div className="nhint">{rg.t("(Selaimessa: avaa toinen välilehti tai kaksi.html.)", "(In a browser: open another tab or kaksi.html.)", "(En el navegador: abre otra pestaña o kaksi.html.)")}</div> : null,
      <div className="nbtn grey" id="net-cancel" onClick={() => netCancel()}>{rg.t("Peru", "Cancel", "Cancelar")}</div>
    ];
  } else if (st === "searching" || st === "connecting" || st === "connected") {
    const list = rg.net.peers.map((p: any, k: number) => (
      <div className="nbtn blue" id={"peer" + k} onClick={() => { rg.sound("click"); rg.net.join(p.id); }}>📱 {p.name}{p.paired ? " ⭐" : ""}</div>
    ));
    const busy = st !== "searching";
    body = [
      <div className="nicon" style={{ transform: "rotate(" + Math.round(Math.sin(t * 3) * 20) + "deg)" }}>🔍</div>,
      <div className="nlabel">{busy ? rg.t("Yhdistetään…", "Connecting…", "Conectando…") : list.length ? rg.t("Valitse kaverin puhelin", "Pick your friend's phone", "Elige el teléfono de tu amigo") : rg.t("Etsitään kaveria…", "Looking for your friend…", "Buscando a tu amigo…")}</div>,
      busy ? null : list,
      list.length || busy ? null : <div className="nhint">{rg.t("Kaverin puhelimessa pitää olla Aloita painettuna.", "Your friend's phone must have Start pressed.", "El teléfono de tu amigo debe tener pulsado Empezar.")}</div>,
      <div className="nbtn grey" id="net-cancel" onClick={() => netCancel()}>{rg.t("Peru", "Cancel", "Cancelar")}</div>
    ];
  } else {
    body = [
      netNote ? <div className="nnote">{netNote}</div> : <div className="nicon">📱📡📱</div>,
      <div className="nbtn pink" id="net-host" onClick={() => { rg.sound("click"); netNote = ""; rg.net.host(); rg.say("net_odota"); }}>🏠 {rg.t("Aloita", "Start", "Empezar")}</div>,
      <div className="nbtn blue" id="net-join" onClick={() => { rg.sound("click"); netNote = ""; rg.net.find(); rg.say("net_etsi"); }}>🔍 {rg.t("Liity kaverin puhelimeen", "Join a friend's phone", "Unirse a un amigo")}</div>
    ];
  }
  return (
    <div className="panel">
      <div className="ptitle">📱📱 {rg.t("Kaksi puhelinta", "Two phones", "Dos teléfonos")}</div>
      {body}
    </div>
  );
}

function Settings() {
  return [
    <div className="shead">
      <div className="sback" id="back" onClick={() => onBack()}>←</div>
      <div className="stitle">⚙️ {rg.t("Asetukset", "Settings", "Ajustes")}</div>
    </div>,
    <div className="panel">
      <div className="ptitle">{rg.t("Kieli", "Language", "Idioma")}</div>
      <div className="flags">{rg.langs.map((l) => Flag(l))}</div>
    </div>,
    NetPanel(),
    <div className="phint">{rg.t("Pelien puhe: avaa peliryhmä ja paina ⚙️.", "Speech per game: open a group and tap ⚙️.", "Voz de cada juego: abre un grupo y toca ⚙️.")}</div>
  ];
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
  // a whole sentence in the new language: a lone "Hei!" came out unclear
  rg.say("kieli_" + l);
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
  return (
    <div className="stile" id={"s-" + x.id} onClick={() => openSection(x.id)} style={{ backgroundColor: x.color, marginTop: 6 + bob }}>
      <div className="sicon">{x.icon}</div>
      <div className="sname">{sectionName(x)}</div>
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
      {g.image ? <img className="iconimg" src={g.image} /> : <div className="icon">{g.icon}</div>}
      <div className={nameOf(g).length > 11 ? "name long" : "name"}>{nameOf(g)}</div>
      <div className="players">{settings ? (rg.speechOn(g.id) ? rg.t("🔊 Puhe päällä", "🔊 Speech on", "🔊 Voz activada") : rg.t("🔇 Ei puhetta", "🔇 No speech", "🔇 Sin voz")) : players(g.players)}</div>
    </div>
  );
}

function view() {
  const bg = bubbles.map((b) => <div className="bubble" style={{ left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2, backgroundColor: b.c }} />);
  if (page === "settings") return <div className="screen">{bg}{Settings()}</div>;
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
        <div className="flags">{rg.langs.map((l) => Flag(l))}<div className="flag" id="open-settings" onClick={() => openSettings()}><div className="flagicon">⚙️</div></div></div>
        {rg.net.connected() ? <div className="linked">📱📱 {rg.net.links.map((l: any) => l.name).join(", ")}</div> : null}
      </div>
      <div className="grid">{SECTIONS.filter((x) => gamesIn(x.id).length > 0).map((x, i) => SectionTile(x, i))}</div>
    </div>
  );
}
