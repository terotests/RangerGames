// The game menu. The front page shows the sections (Älypelit, Korttipelit,
// Tiedelabra, …); a tap opens the section's games as tiles, and a tap on a
// tile starts the game. Back from a game returns to the same section. A
// game's section comes from "section" in its game.json, or else from
// SECTION_OF below. In a section ⚙️ turns to the speech settings: a tap on a
// tile then turns that game's speech on or off. ⚙️ on the front page opens
// the settings page: the language and connecting two phones (rg.net; the
// link stays up from game to game and the friend's phone follows this one).
// There "📥 Lataa pelejä" (rg.store, where the app can install games) lists
// the games accepted for download on Sliqtly Games: one is installed into
// the app and then plays without a network, in its game.json section or in
// the Ladatut section.

type Game = { image?: string; id: string; name: string; description: string; icon: string; color: string; players: string; i18n?: any; speech?: boolean; section?: string; store?: any };
// an entry of the download list (Sliqtly Games /games/catalog.json)
type Offer = { id: string; name: string; description: string; icon: string; color: string; version: number; bytes: number; pack: string; kind: string; extends?: string; i18n?: any };
type Section = { id: string; icon: string; color: string; fi: string; en: string; es: string };

const SECTIONS: Section[] = [
  { id: "aly", icon: "♟️", color: "#6a994e", fi: "Älypelit", en: "Strategy", es: "Estrategia" },
  { id: "kortit", icon: "🃏", color: "#9d4edd", fi: "Korttipelit", en: "Card games", es: "Cartas" },
  { id: "labra", icon: "🔬", color: "#f4a100", fi: "Tiedelabra", en: "Science lab", es: "Laboratorio" },
  { id: "tutkimus", icon: "🧭", color: "#2a9d8f", fi: "Tutkimusmatkat", en: "Expeditions", es: "Expediciones" },
  { id: "opi", icon: "🔤", color: "#118ab2", fi: "Opi", en: "Learn", es: "Aprende" },
  { id: "seikkailu", icon: "🚀", color: "#ef476f", fi: "Seikkailut", en: "Adventures", es: "Aventuras" },
  { id: "rakennus", icon: "🔨", color: "#f77f00", fi: "Rakennuspelit", en: "Building", es: "Construcción" },
  { id: "tietokoneet", icon: "💻", color: "#3a86ff", fi: "Tietokoneet", en: "Computers", es: "Ordenadores" },
  { id: "ladatut", icon: "📥", color: "#0f9d76", fi: "Ladatut", en: "Downloaded", es: "Descargados" },
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
// the download page (page "store")
let offers: Offer[] = [];      // the list as last read
let storeState = "";           // "loading", "ready", "error"
let storeNote = "";            // what went wrong last, or what was done
let busyId = "";               // the game being downloaded
let busyDone = 0, busyTotal = 0;
// Scrolling: a page taller than the screen moves with a finger or mouse drag
// (a flick keeps it going a moment) and with the mouse wheel. A drag that
// moved more than DRAG_SLOP is not a tap, so it does not open the tile it
// started on.
const DRAG_SLOP = 10;
let scroll = 0;                // how far the page is scrolled, in pixels
let scrollMax = 0;             // from the laid-out height of #content
let scrollPage = "";           // the page the scroll belongs to
let dragFrom = -1;             // the pointer's y when it went down, -1 when up
let dragScroll = 0;            // `scroll` when it went down
let dragging = false;          // past DRAG_SLOP: the page follows the pointer
let dragged = false;           // the last press was a drag: no tap
let flick = 0;                 // the speed after a flick, pixels per second
let lastY = 0;

const NET_ERRORS: { [k: string]: string[] } = {
  "no-bluetooth": ["Tässä laitteessa ei ole Bluetoothia.", "This device has no Bluetooth.", "Este dispositivo no tiene Bluetooth."],
  "bluetooth-off": ["Bluetooth ei mennyt päälle.", "Bluetooth did not turn on.", "El Bluetooth no se encendió."],
  "permission": ["Tarvitaan lupa käyttää Bluetoothia.", "Permission to use Bluetooth is needed.", "Se necesita permiso para usar Bluetooth."],
  "connect-failed": ["Kaverin puhelimeen ei saatu yhteyttä.", "Could not reach your friend's phone.", "No se pudo conectar con el teléfono de tu amigo."],
  "busy": ["Kaverin puhelimeen ei mahdu enempää.", "Your friend's phone is full.", "El teléfono de tu amigo está lleno."]
};

function sectionOf(g: Game) {
  const s = g.section || SECTION_OF[g.id] || (g.store ? "ladatut" : "muut");
  for (const x of SECTIONS) if (x.id === s) return s;
  return "muut";
}
function gamesIn(s: string) { return games.filter((g) => sectionOf(g) === s); }
function sectionName(x: Section) { return rg.t(x.fi, x.en, x.es); }

function onPointerDown(x: number, y: number) {
  dragFrom = y; dragScroll = scroll; lastY = y;
  dragging = false; dragged = false; flick = 0;
}

function onPointerUp(x: number, y: number) {
  if (dragFrom >= 0 && Math.abs(y - dragFrom) > DRAG_SLOP) dragged = true;
  if (dragged) pressed = "";
  dragFrom = -1; dragging = false;
}

function onWheel(dy: number) {
  scroll = rg.clamp(scroll + dy, 0, scrollMax);
  flick = 0;
}

function scrollStep(dt: number, input: any) {
  const key = page + "/" + section;
  if (key !== scrollPage) { scrollPage = key; scroll = 0; flick = 0; }
  const box = rg.box("content");
  if (box) scrollMax = Math.max(0, Math.ceil(box.h + 16 - height));
  const p = input.pointer;
  if (dragFrom >= 0 && p.down) {
    if (!dragging && Math.abs(p.y - dragFrom) > DRAG_SLOP) { dragging = true; dragged = true; pressed = ""; }
    if (dragging) {
      const next = rg.clamp(dragScroll - (p.y - dragFrom), 0, scrollMax);
      if (dt > 0) flick = flick * 0.5 + ((lastY - p.y) / dt) * 0.5;
      scroll = next;
    }
    lastY = p.y;
  } else if (flick !== 0) {
    scroll = rg.clamp(scroll + flick * dt, 0, scrollMax);
    flick *= Math.exp(-4 * dt);
    if (Math.abs(flick) < 20 || scroll <= 0 || scroll >= scrollMax) flick = 0;
  }
  if (scroll > scrollMax) scroll = scrollMax;
}

// a tap, not the end of a drag
function tapped() { return !dragged; }
// an onClick handler that a drag over the button does not set off
function tap(f: () => any) { return () => { if (tapped()) f(); }; }

function openSection(s: string) {
  section = s;
  rg.save("section", s);
  rg.sound("click");
  rg.vibrate(15);
}

function onBack() {
  if (page === "store") { page = "settings"; rg.sound("click"); }
  else if (page) { page = ""; rg.sound("click"); }
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

function tick(dt: number, input: any) {
  t += dt;
  scrollStep(dt, input);
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
    <div className={settings ? "flag on" : "flag"} id="settings" onClick={tap(() => { settings = !settings; rg.sound("click"); rg.vibrate(15); })}>
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
      <div className="nbtn grey" id="net-off" onClick={tap(() => netCancel())}>{rg.t("Katkaise yhteys", "Disconnect", "Desconectar")}</div>
    ];
  } else if (st === "hosting") {
    body = [
      <div className="nicon" style={{ transform: "scale(" + pulse.toFixed(3) + ")" }}>📡</div>,
      <div className="nlabel">{rg.t("Odotetaan kaveria…", "Waiting for your friend…", "Esperando a tu amigo…")}</div>,
      <div className="nhint">{rg.t("Kaveri painaa omassa puhelimessaan Liity ja valitsee tämän:", "Your friend taps Join on their phone and picks this one:", "Tu amigo pulsa Unirse en su teléfono y elige este:")}</div>,
      <div className="nname">📱 {rg.net.name}</div>,
      rg.net.kind === "web" ? <div className="nhint">{rg.t("(Selaimessa: avaa toinen välilehti tai kaksi.html.)", "(In a browser: open another tab or kaksi.html.)", "(En el navegador: abre otra pestaña o kaksi.html.)")}</div> : null,
      <div className="nbtn grey" id="net-cancel" onClick={tap(() => netCancel())}>{rg.t("Peru", "Cancel", "Cancelar")}</div>
    ];
  } else if (st === "searching" || st === "connecting" || st === "connected") {
    const list = rg.net.peers.map((p: any, k: number) => (
      <div className="nbtn blue" id={"peer" + k} onClick={tap(() => { rg.sound("click"); rg.net.join(p.id); })}>📱 {p.name}{p.paired ? " ⭐" : ""}</div>
    ));
    const busy = st !== "searching";
    body = [
      <div className="nicon" style={{ transform: "rotate(" + Math.round(Math.sin(t * 3) * 20) + "deg)" }}>🔍</div>,
      <div className="nlabel">{busy ? rg.t("Yhdistetään…", "Connecting…", "Conectando…") : list.length ? rg.t("Valitse kaverin puhelin", "Pick your friend's phone", "Elige el teléfono de tu amigo") : rg.t("Etsitään kaveria…", "Looking for your friend…", "Buscando a tu amigo…")}</div>,
      busy ? null : list,
      list.length || busy ? null : <div className="nhint">{rg.t("Kaverin puhelimessa pitää olla Aloita painettuna.", "Your friend's phone must have Start pressed.", "El teléfono de tu amigo debe tener pulsado Empezar.")}</div>,
      <div className="nbtn grey" id="net-cancel" onClick={tap(() => netCancel())}>{rg.t("Peru", "Cancel", "Cancelar")}</div>
    ];
  } else {
    body = [
      netNote ? <div className="nnote">{netNote}</div> : <div className="nicon">📱📡📱</div>,
      <div className="nbtn pink" id="net-host" onClick={tap(() => { rg.sound("click"); netNote = ""; rg.net.host(); rg.say("net_odota"); })}>🏠 {rg.t("Aloita", "Start", "Empezar")}</div>,
      <div className="nbtn blue" id="net-join" onClick={tap(() => { rg.sound("click"); netNote = ""; rg.net.find(); rg.say("net_etsi"); })}>🔍 {rg.t("Liity kaverin puhelimeen", "Join a friend's phone", "Unirse a un amigo")}</div>
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
      <div className="sback" id="back" onClick={tap(() => onBack())}>←</div>
      <div className="stitle">⚙️ {rg.t("Asetukset", "Settings", "Ajustes")}</div>
    </div>,
    <div className="panel">
      <div className="ptitle">{rg.t("Kieli", "Language", "Idioma")}</div>
      <div className="flags">{rg.langs.map((l) => Flag(l))}</div>
    </div>,
    NetPanel(),
    StorePanel(),
    RendererPanel(),
    <div className="phint">{rg.t("Pelien puhe: avaa peliryhmä ja paina ⚙️.", "Speech per game: open a group and tap ⚙️.", "Voz de cada juego: abre un grupo y toca ⚙️.")}</div>
  ];
}

// ------------------------------------------------------------ downloads --

const STORE_ERRORS: { [k: string]: string[] } = {
  "offline": ["Ei verkkoyhteyttä. Yhdistä Wi-Fiin ja yritä uudelleen.", "No network. Connect to Wi-Fi and try again.", "Sin conexión. Conéctate a Wi-Fi e inténtalo de nuevo."],
  "http": ["Palvelin ei vastannut oikein. Yritä myöhemmin.", "The server did not answer properly. Try later.", "El servidor no respondió bien. Inténtalo más tarde."],
  "bad-pack": ["Peli ei latautunut oikein.", "The game did not download properly.", "El juego no se descargó bien."],
  "too-big": ["Peli on liian iso tähän puhelimeen.", "The game is too big for this phone.", "El juego es demasiado grande para este teléfono."],
  "no-base": ["Lisäosan peli puuttuu: lataa ensin se.", "The add-on's game is missing: download it first.", "Falta el juego del complemento: descárgalo primero."],
  "taken": ["Puhelimessa on jo samanniminen peli.", "The phone already has a game with this name.", "El teléfono ya tiene un juego con este nombre."],
  "storage": ["Puhelimen muisti on täynnä.", "The phone's storage is full.", "El almacenamiento del teléfono está lleno."]
};

function StorePanel() {
  if (!rg.store.available) return null;
  const n = games.filter((g) => g.store).length;
  return (
    <div className="panel">
      <div className="ptitle">📥 {rg.t("Lataa pelejä", "Download games", "Descargar juegos")}</div>
      <div className="nhint">{rg.t("Uusia pelejä verkosta. Ladattu peli toimii ilman verkkoa.", "New games from the net. A downloaded game plays offline.", "Juegos nuevos de la red. Un juego descargado funciona sin conexión.")}</div>
      {n ? <div className="nhint">{rg.t("Ladattuja pelejä: " + n, "Downloaded games: " + n, "Juegos descargados: " + n)}</div> : null}
      <div className="nbtn blue" id="open-store" onClick={tap(() => openStore())}>📥 {rg.t("Lataa pelejä", "Download games", "Descargar juegos")}</div>
    </div>
  );
}

function openStore() {
  page = "store"; storeNote = ""; storeState = "loading";
  rg.sound("click"); rg.vibrate(15);
  rg.store.catalog();
}

function installed(id: string) {
  for (const g of games) if (g.id === id && g.store) return g;
  return null;
}

function offerName(o: Offer) {
  const tr = o.i18n && o.i18n[rg.lang];
  return tr && tr.name ? tr.name : o.name;
}

function gameName(id: string) {
  for (const g of games) if (g.id === id) return nameOf(g);
  for (const o of offers) if (o.id === id) return offerName(o);
  return id;
}

function onStore(ev: any) {
  games = rg.games();   // an install or removal changed the list
  if (ev.type === "catalog") {
    offers = ev.games || []; storeState = "ready";
  } else if (ev.type === "progress") {
    if (ev.id === busyId) { busyDone = ev.done; busyTotal = ev.total; }
  } else if (ev.type === "installed") {
    busyId = "";
    storeNote = "✅ " + gameName(ev.id) + rg.t(" on ladattu! Löydät sen pelivalikosta.", " is downloaded! You find it in the game menu.", " ¡descargado! Lo encuentras en el menú.");
    rg.sound("win"); rg.vibrate([40, 60, 40]);
    rg.celebrate(width / 2, 160, { big: true });
  } else if (ev.type === "removed") {
    storeNote = "🗑️ " + gameName(ev.id) + rg.t(" poistettu.", " removed.", " eliminado.");
    rg.sound("pop");
  } else if (ev.type === "error") {
    const e = STORE_ERRORS[ev.reason] || STORE_ERRORS["http"];
    if (!ev.id) storeState = "error";
    if (ev.id === busyId) busyId = "";
    storeNote = rg.t(e[0], e[1], e[2]);
    rg.sound("wrong");
  }
}

function mb(n: number) { return (Math.max(0.1, n / 1048576)).toFixed(1).replace(".", rg.lang === "en" ? "." : ",") + " Mt"; }

function installOffer(o: Offer) {
  if (busyId) return;
  busyId = o.id; busyDone = 0; busyTotal = o.bytes; storeNote = "";
  rg.sound("click"); rg.vibrate(15);
  rg.store.install(o);
}

function removeGame(id: string) {
  if (busyId) return;
  rg.sound("click");
  rg.store.remove(id);
}

function OfferRow(o: Offer, i: number) {
  const have = installed(o.id);
  const busy = busyId === o.id;
  const addon = o.kind === "addon";
  const baseMissing = addon && !games.some((g) => g.id === o.extends);
  let action: any;
  if (busy) {
    const pct = busyTotal > 0 ? Math.min(100, Math.floor((100 * busyDone) / busyTotal)) : 0;
    action = [
      <div className="bar"><div className="barfill" style={{ width: Math.round(2.2 * pct) }} /></div>,
      <div className="ometa">{rg.t("Ladataan… ", "Downloading… ", "Descargando… ") + pct + " %"}</div>
    ];
  } else if (have && (have.store.version || 0) >= o.version) {
    action = [
      addon ? null : <div className="obtn green" id={"play-" + o.id} onClick={tap(() => open(o.id))}>▶ {rg.t("Pelaa", "Play", "Jugar")}</div>,
      <div className="obtn ogrey" id={"remove-" + o.id} onClick={tap(() => removeGame(o.id))}>{rg.t("Poista", "Remove", "Eliminar")}</div>
    ];
  } else if (baseMissing) {
    action = <div className="ometa">{rg.t("Lisäosa peliin " + gameName(o.extends || "") + ": lataa se ensin.", "Add-on for " + gameName(o.extends || "") + ": download it first.", "Complemento de " + gameName(o.extends || "") + ": descárgalo primero.")}</div>;
  } else {
    action = <div className={busyId ? "obtn pink dim" : "obtn pink"} id={"get-" + o.id} onClick={tap(() => installOffer(o))}>{have ? "⬆ " + rg.t("Päivitä", "Update", "Actualizar") : "⬇ " + rg.t("Lataa", "Download", "Descargar")}</div>;
  }
  return (
    <div className="offer" id={"offer-" + o.id}>
      <div className="orow">
        <div className="oicon" style={{ backgroundColor: o.color || "#4f7cff" }}>{o.icon || "🎮"}</div>
        <div className="otext">
          <div className="oname">{offerName(o)}</div>
          <div className="ometa">{(addon ? rg.t("Lisäosa · ", "Add-on · ", "Complemento · ") : "") + mb(o.bytes) + (have ? rg.t(" · ladattu", " · downloaded", " · descargado") : "")}</div>
        </div>
      </div>
      {o.description ? <div className="odesc">{o.description}</div> : null}
      <div className="orow">{action}</div>
    </div>
  );
}

function StorePage() {
  let body: any;
  if (storeState === "loading") {
    body = [<div className="nicon" style={{ transform: "rotate(" + Math.round(t * 120) % 360 + "deg)" }}>⏳</div>, <div className="nlabel">{rg.t("Haetaan pelilistaa…", "Fetching the game list…", "Buscando la lista…")}</div>];
  } else if (storeState === "error") {
    body = [
      <div className="nicon">📡</div>,
      <div className="nnote">{storeNote}</div>,
      <div className="nbtn blue" id="store-retry" onClick={tap(() => openStore())}>🔄 {rg.t("Yritä uudelleen", "Try again", "Reintentar")}</div>
    ];
  } else if (!offers.length) {
    body = <div className="nhint">{rg.t("Ladattavia pelejä ei ole vielä.", "No games to download yet.", "Todavía no hay juegos para descargar.")}</div>;
  } else {
    body = offers.map((o, i) => OfferRow(o, i));
  }
  const mine = games.filter((g) => g.store && !offers.some((o) => o.id === g.id));
  return [
    <div className="shead">
      <div className="sback" id="back" onClick={tap(() => onBack())}>←</div>
      <div className="stitle">📥 {rg.t("Lataa pelejä", "Download games", "Descargar juegos")}</div>
    </div>,
    storeNote && storeState !== "error" ? <div className="phint">{storeNote}</div> : null,
    storeState === "ready" ? <div className="phint">{rg.t("Ladattu peli toimii ilman verkkoa.", "A downloaded game plays offline.", "Un juego descargado funciona sin conexión.")}</div> : null,
    body,
    // installed games no longer in the list: can still be played or removed
    mine.length && storeState === "ready" ? <div className="panel">
      <div className="ptitle">{rg.t("Ladatut", "Downloaded", "Descargados")}</div>
      {mine.map((g) => <div className="orow"><div className="oname">{(g.icon || "🎮") + " " + nameOf(g)}</div><div className="obtn ogrey" id={"remove-" + g.id} onClick={tap(() => removeGame(g.id))}>{rg.t("Poista", "Remove", "Eliminar")}</div></div>)}
    </div> : null
  ];
}

// What draws the games (rg.renderer), where the device has both: the
// engine's own EVG or RangerDOM (a real DOM and CSS). A choice starts the
// menu again with it.
function RendererPanel() {
  if (rg.renderers.length < 2) return null;
  const opt = (r: string, label: string) => (
    <div className={rg.renderer === r ? "rbtn on" : "rbtn"} id={"renderer-" + r} onClick={tap(() => { rg.sound("click"); rg.setRenderer(r); })}>{label}</div>
  );
  return (
    <div className="panel">
      <div className="ptitle">{rg.t("Pelimoottori", "Game engine", "Motor de juego")}</div>
      <div className="flags">{opt("evg", "EVG")}{opt("dom", "RangerDOM")}</div>
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
  // a whole sentence in the new language: a lone "Hei!" came out unclear
  rg.say("kieli_" + l);
}

function Flag(l: string) {
  const on = rg.lang === l;
  return (
    <div className={on ? "flag on" : "flag"} id={"lang-" + l} onClick={tap(() => chooseLang(l))}>
      <div className="flagicon">{rg.flags[l]}</div>
    </div>
  );
}

function SectionTile(x: Section, i: number) {
  const bob = Math.sin(t * 2 + i) * 2;
  const n = gamesIn(x.id).length;
  return (
    <div className="stile" id={"s-" + x.id} onClick={tap(() => openSection(x.id))} style={{ backgroundColor: x.color, marginTop: 6 + bob }}>
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
    <div className="tile" id={"g-" + g.id} onClick={tap(() => open(g.id))}
      style={{ backgroundColor: g.color, marginTop: bob, transform: down ? "scale(0.94)" : "none", opacity: settings && !rg.speechOn(g.id) ? 0.55 : 1 }}>
      {g.image ? <img className="iconimg" src={g.image} /> : <div className="icon">{g.icon}</div>}
      <div className={nameOf(g).length > 11 ? "name long" : "name"}>{nameOf(g)}</div>
      <div className="players">{settings ? (rg.speechOn(g.id) ? rg.t("🔊 Puhe päällä", "🔊 Speech on", "🔊 Voz activada") : rg.t("🔇 Ei puhetta", "🔇 No speech", "🔇 Sin voz")) : players(g.players)}</div>
    </div>
  );
}

// the page's content, moved up by the scroll; #content's laid-out height
// gives how far it can scroll
function scrolled(children: any) {
  return <div className="content" id="content" style={{ marginTop: -Math.round(scroll) }}>{children}</div>;
}

function view() {
  const bg = bubbles.map((b) => <div className="bubble" style={{ left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2, backgroundColor: b.c }} />);
  if (page === "settings") return <div className="screen">{bg}{scrolled(Settings())}</div>;
  if (page === "store") return <div className="screen">{bg}{scrolled(StorePage())}</div>;
  if (section) {
    let sec = SECTIONS[SECTIONS.length - 1];
    for (const x of SECTIONS) if (x.id === section) sec = x;
    return (
      <div className="screen">
        {bg}
        {scrolled([
          <div className="shead">
            <div className="sback" id="back" onClick={tap(() => onBack())}>←</div>
            <div className="stitle">{sec.icon + " " + sectionName(sec)}</div>
            {Gear()}
          </div>,
          settings ? <div className="sub">{rg.t("Napauta peliä: puhe päälle tai pois", "Tap a game: speech on or off", "Toca un juego: voz sí o no")}</div> : null,
          <div className="grid">{gamesIn(section).map((g, i) => Tile(g, i))}</div>
        ])}
      </div>
    );
  }
  return (
    <div className="screen">
      {bg}
      {scrolled([
        <div className="header">
          <div className="logo">RangerGames</div>
          <div className="sub">{rg.t("Valitse peli!", "Choose a game!", "¡Elige un juego!")}</div>
          <div className="flags">{rg.langs.map((l) => Flag(l))}<div className="flag" id="open-settings" onClick={tap(() => openSettings())}><div className="flagicon">⚙️</div></div></div>
          {rg.net.connected() ? <div className="linked">📱📱 {rg.net.links.map((l: any) => l.name).join(", ")}</div> : null}
        </div>,
        <div className="grid">{SECTIONS.filter((x) => gamesIn(x.id).length > 0).map((x, i) => SectionTile(x, i))}</div>
      ])}
    </div>
  );
}
