// The game menu: every game under /games as a tile. A tap starts it; the
// Back button (Esc on a keyboard) in a game comes back here.

type Game = { id: string; name: string; description: string; icon: string; color: string; players: string };
type Bubble = { x: number; y: number; r: number; v: number; c: string };

const COLORS = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#f78c6b", "#c77dff"];
let games: Game[] = [];
let bubbles: Bubble[] = [];
let t = 0;
let pressed = "";
let leaving = "";
let leaveClock = 0;

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
  if (leaving) return;
  pressed = id;
  leaving = id;
  leaveClock = 0;
  rg.sound("click");
  rg.vibrate(15);
  rg.say("peli_" + id);  // the game's name aloud (a clip in voice/fi.json, if there is one)
}

function players(p: string) {
  return p === "2" ? "2 pelaajaa" : p === "1-2" ? "1–2 pelaajaa" : "1 pelaaja";
}

function Tile(g: Game, i: number) {
  const bob = Math.sin(t * 2 + i) * 2;
  const down = pressed === g.id && leaving !== "";
  return (
    <div className="tile" id={"g-" + g.id} onClick={() => open(g.id)}
      style={{ backgroundColor: g.color, marginTop: bob, transform: down ? "scale(0.94)" : "none" }}>
      <div className="icon">{g.icon}</div>
      <div className="name">{g.name}</div>
      <div className="players">{players(g.players)}</div>
    </div>
  );
}

function view() {
  return (
    <div className="screen">
      {bubbles.map((b) => <div className="bubble" style={{ left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2, backgroundColor: b.c }} />)}
      <div className="header">
        <div className="logo">RangerGames</div>
        <div className="sub">Valitse peli!</div>
      </div>
      <div className="grid">{games.map((g, i) => Tile(g, i))}</div>
    </div>
  );
}
