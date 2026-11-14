// lib/theme.ts: what makes the board game Hesapoli (Helsinki). The game itself
// (game.tsx, style.css, lib/rules.ts, lib/house.ts) is generated from
// tools/kortteli/template by tools/kortteli/sync.sh; this file is the game's own.
const DOME = "#5f9e8f";   // copper gone green
export const THEME: any = {
  id: "hesapoli",
  title: ["Hesapoli", "Hesapoli", "Hesapoli"],
  subtitle: ["Osta Helsingin katuja ja rakenna taloja ja hotelleja!", "Buy the streets of Helsinki and build houses and hotels!", "¡Compra las calles de Helsinki y construye casas y hoteles!"],
  voice: "hp",          // street clips hp_k_0 … hp_k_15, the game's name peli_hesapoli
  streets: ["Kontulantie", "Myllypurontie", "Hämeentie", "Sturenkatu", "Fredrikinkatu", "Iso Roobertinkatu",
    "Tehtaankatu", "Bulevardi", "Mannerheimintie", "Runeberginkatu", "Kaivokatu", "Erottaja",
    "Aleksanterinkatu", "Pohjoisesplanadi", "Senaatintori", "Kauppatori"],
  names: {
    start: ["Lähtö", "Start", "Salida"], jail: ["Vankila", "Jail", "Cárcel"], park: ["Kaivopuisto", "Kaivopuisto park", "Parque Kaivopuisto"],
    police: ["Poliisi", "Police", "Policía"], kiosk: ["Jäätelökioski", "Ice cream kiosk", "Heladería"], chance: ["Yllätys", "Surprise", "Sorpresa"],
  },
  kiosk: { kind: "ice", icon: "🍦", color: "#f15bb5", roof: "#f15bb5", clip: "kt_kioski",
    text: ["Jäätelö maksaa {fee} €. Raha menee puistoon.", "An ice cream costs {fee} €. The money goes to the park.", "Un helado cuesta {fee} €. El dinero va al parque."] },
  // the town's wall colours: the yellow, ochre and pale stone of the old centre
  walls: ["#f3d27a", "#e9c46a", "#f2e2c4", "#e8e1d7", "#d9a76a", "#c9ced6", "#efe3b8", "#b9c7a3", "#e3b6a0", "#a9bcd0"],
  // Tuomiokirkko in the middle: white, on steps, a green dome and four small ones
  landmark: [
    { shape: "box", size: [5.0, 0.6, 5.0], color: "#a8a39a", x: 0, y: 0.3, z: 0 },
    { shape: "box", size: [4.6, 2.6, 1.8], color: "#f8f6f0", x: 0, y: 1.9, z: 0, layer: 1 },
    { shape: "box", size: [1.8, 2.6, 4.6], color: "#f8f6f0", x: 0, y: 1.9, z: 0, layer: 1 },
    { shape: "prism", size: [4.6, 0.6, 1.8], color: "#ecebe4", x: 0, y: 3.2, z: 0, layer: 2 },
    { shape: "prism", size: [4.6, 0.6, 1.8], color: "#ecebe4", x: 0, y: 3.2, z: 0, ry: 1.5708, layer: 2 },
    { shape: "box", size: [2.8, 3.4, 2.8], color: "#ffffff", x: 0, y: 2.3, z: 0, layer: 3 },
    { shape: "cylinder", size: [0.95, 0.95, 1.1], color: "#ffffff", x: 0, y: 4.55, z: 0, detail: 16, layer: 4 },
    { shape: "dome", size: [1.0], color: DOME, x: 0, y: 5.1, z: 0, detail: 16, layer: 5 },
    { shape: "cylinder", size: [0.18, 0.18, 0.5], color: "#ffffff", x: 0, y: 6.3, z: 0, detail: 8, layer: 6 },
    { shape: "sphere", size: [0.14], color: "#e9c46a", x: 0, y: 6.65, z: 0, detail: 6, layer: 7 },
    { shape: "cylinder", size: [0.3, 0.3, 0.5], color: "#ffffff", x: 1.1, y: 4.25, z: 1.1, detail: 10, layer: 4 },
    { shape: "dome", size: [0.32], color: DOME, x: 1.1, y: 4.5, z: 1.1, detail: 10, layer: 5 },
    { shape: "cylinder", size: [0.3, 0.3, 0.5], color: "#ffffff", x: -1.1, y: 4.25, z: 1.1, detail: 10, layer: 4 },
    { shape: "dome", size: [0.32], color: DOME, x: -1.1, y: 4.5, z: 1.1, detail: 10, layer: 5 },
    { shape: "cylinder", size: [0.3, 0.3, 0.5], color: "#ffffff", x: 1.1, y: 4.25, z: -1.1, detail: 10, layer: 4 },
    { shape: "dome", size: [0.32], color: DOME, x: 1.1, y: 4.5, z: -1.1, detail: 10, layer: 5 },
    { shape: "cylinder", size: [0.3, 0.3, 0.5], color: "#ffffff", x: -1.1, y: 4.25, z: -1.1, detail: 10, layer: 4 },
    { shape: "dome", size: [0.32], color: DOME, x: -1.1, y: 4.5, z: -1.1, detail: 10, layer: 5 },
  ],
};
