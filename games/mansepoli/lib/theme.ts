// lib/theme.ts: what makes the board game Mansepoli (Tampere). The game itself
// (game.tsx, style.css, lib/rules.ts, lib/house.ts) is generated from
// tools/kortteli/template by tools/kortteli/sync.sh; this file is the game's own.
export const THEME: any = {
  id: "mansepoli",
  title: ["Mansepoli", "Mansepoli", "Mansepoli"],
  subtitle: ["Osta Tampereen katuja ja rakenna taloja ja hotelleja!", "Buy the streets of Tampere and build houses and hotels!", "¡Compra las calles de Tampere y construye casas y hoteles!"],
  voice: "mp",          // street clips mp_k_0 … mp_k_15, the game's name peli_mansepoli
  // the 16 plots in board order, cheapest first; street names are the same in every language
  streets: ["Insinöörinkatu", "Hervannan valtaväylä", "Pispalan valtatie", "Pyynikintie", "Kalevantie", "Sammonkatu",
    "Satakunnankatu", "Näsilinnankatu", "Itsenäisyydenkatu", "Hatanpään valtatie", "Rautatienkatu", "Kauppakatu",
    "Aleksanterinkatu", "Hallituskatu", "Hämeenkatu", "Keskustori"],
  names: {
    start: ["Lähtö", "Start", "Salida"], jail: ["Vankila", "Jail", "Cárcel"], park: ["Koskipuisto", "Koskipuisto park", "Parque Koskipuisto"],
    police: ["Poliisi", "Police", "Policía"], kiosk: ["Makkarakoju", "Sausage stand", "Puesto de morcilla"], chance: ["Yllätys", "Surprise", "Sorpresa"],
  },
  // the kiosk square: {fee} is replaced by the price
  kiosk: { kind: "makkara", icon: "🌭", color: "#8d2b1f", roof: "#1d1d1d", clip: "mp_kioski",
    text: ["Mustamakkara maksaa {fee} €. Raha menee puistoon.", "A black sausage costs {fee} €. The money goes to the park.", "Una morcilla cuesta {fee} €. El dinero va al parque."] },
  // the town's wall colours: red brick of the old factories, plaster
  walls: ["#a4472f", "#b5533a", "#8e3b2a", "#e9a46a", "#f2e2c4", "#c9ced6", "#d9c9a8", "#e8e1d7", "#9cc5a1", "#c26a4a"],
  // Näsinneula in the middle of the board: a slim tower with a round top
  landmark: [
    { shape: "box", size: [2.4, 0.9, 1.6], color: "#d8d2c4", x: 0, y: 0.45, z: 0 },
    { shape: "cylinder", size: [0.26, 0.42, 10], color: "#e3ded4", x: 0, y: 5, z: 0, detail: 10, layer: 1 },
    { shape: "cylinder", size: [1.15, 0.45, 0.55], color: "#cfc8bb", x: 0, y: 10.1, z: 0, detail: 16, layer: 2 },
    { shape: "cylinder", size: [1.15, 1.15, 0.45], color: "#5d7f9c", x: 0, y: 10.6, z: 0, detail: 16, layer: 3 },
    { shape: "cylinder", size: [0.7, 1.05, 0.4], color: "#e3ded4", x: 0, y: 11.0, z: 0, detail: 16, layer: 4 },
    { shape: "cylinder", size: [0.05, 0.08, 2.6], color: "#adb5bd", x: 0, y: 12.5, z: 0, detail: 6, layer: 5 },
    { shape: "sphere", size: [0.12], color: "#e63946", x: 0, y: 13.85, z: 0, detail: 6, layer: 6, emissive: true },
  ],
};
