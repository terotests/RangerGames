// Kielipelit: the words and sentences of the English/Spanish/Finnish games.
// tools/kielipelit/gen-voice.js reads this file and writes the voice clip
// lists voice/en|es/common.json (the words, numbers, colours, praise: shared
// with the other games) and voice/en|es/kielipelit.json (this game's
// sentences). The Finnish clips (for preschoolers, "viskari") go into
// voice/fi.json with the prefix kl_ (FI_PREFIX), as fi.json is one shared list.
// After a change here run: node tools/kielipelit/gen-voice.js
//
// es: the Spanish word with its article (el/la), which carries the gender.
// Emoji only up to Emoji 11 (Android 9 draws nothing for newer ones).

export const WORDS: any[] = [
  // animals
  { id: "cat", e: "🐱", en: "cat", es: "el gato", fi: "kissa", c: "animal" },
  { id: "dog", e: "🐶", en: "dog", es: "el perro", fi: "koira", c: "animal" },
  { id: "fish", e: "🐟", en: "fish", es: "el pez", fi: "kala", c: "animal" },
  { id: "bird", e: "🐦", en: "bird", es: "el pájaro", fi: "lintu", c: "animal" },
  { id: "cow", e: "🐮", en: "cow", es: "la vaca", fi: "lehmä", c: "animal" },
  { id: "pig", e: "🐷", en: "pig", es: "el cerdo", fi: "possu", c: "animal" },
  { id: "horse", e: "🐴", en: "horse", es: "el caballo", fi: "hevonen", c: "animal" },
  { id: "duck", e: "🦆", en: "duck", es: "el pato", fi: "ankka", c: "animal" },
  { id: "rabbit", e: "🐰", en: "rabbit", es: "el conejo", fi: "pupu", c: "animal" },
  { id: "mouse", e: "🐭", en: "mouse", es: "el ratón", fi: "hiiri", c: "animal" },
  { id: "bear", e: "🐻", en: "bear", es: "el oso", fi: "karhu", c: "animal" },
  { id: "frog", e: "🐸", en: "frog", es: "la rana", fi: "sammakko", c: "animal" },
  { id: "lion", e: "🦁", en: "lion", es: "el león", fi: "leijona", c: "animal" },
  { id: "monkey", e: "🐵", en: "monkey", es: "el mono", fi: "apina", c: "animal" },
  { id: "elephant", e: "🐘", en: "elephant", es: "el elefante", fi: "norsu", c: "animal" },
  { id: "sheep", e: "🐑", en: "sheep", es: "la oveja", fi: "lammas", c: "animal" },
  // food
  { id: "apple", e: "🍎", en: "apple", es: "la manzana", fi: "omena", c: "food" },
  { id: "banana", e: "🍌", en: "banana", es: "el plátano", fi: "banaani", c: "food" },
  { id: "strawberry", e: "🍓", en: "strawberry", es: "la fresa", fi: "mansikka", c: "food" },
  { id: "orange", e: "🍊", en: "orange", es: "la naranja", fi: "appelsiini", c: "food" },
  { id: "bread", e: "🍞", en: "bread", es: "el pan", fi: "leipä", c: "food" },
  { id: "cheese", e: "🧀", en: "cheese", es: "el queso", fi: "juusto", c: "food" },
  { id: "milk", e: "🥛", en: "milk", es: "la leche", fi: "maito", c: "food" },
  { id: "juice", e: "🥤", en: "juice", es: "el zumo", fi: "mehu", c: "food" },
  { id: "cookie", e: "🍪", en: "cookie", es: "la galleta", fi: "keksi", c: "food" },
  { id: "cake", e: "🍰", en: "cake", es: "la tarta", fi: "kakku", c: "food" },
  { id: "ice_cream", e: "🍦", en: "ice cream", es: "el helado", fi: "jäätelö", c: "food" },
  { id: "sandwich", e: "🥪", en: "sandwich", es: "el bocadillo", fi: "voileipä", c: "food" },
  { id: "pizza", e: "🍕", en: "pizza", es: "la pizza", fi: "pizza", c: "food" },
  { id: "carrot", e: "🥕", en: "carrot", es: "la zanahoria", fi: "porkkana", c: "food" },
  { id: "egg", e: "🥚", en: "egg", es: "el huevo", fi: "muna", c: "food" },
  // things
  { id: "ball", e: "⚽", en: "ball", es: "la pelota", fi: "pallo", c: "thing" },
  { id: "key", e: "🔑", en: "key", es: "la llave", fi: "avain", c: "thing" },
  { id: "hat", e: "🎩", en: "hat", es: "el sombrero", fi: "hattu", c: "thing" },
  { id: "car", e: "🚗", en: "car", es: "el coche", fi: "auto", c: "thing" },
  { id: "book", e: "📖", en: "book", es: "el libro", fi: "kirja", c: "thing" },
  { id: "star", e: "⭐", en: "star", es: "la estrella", fi: "tähti", c: "thing" },
  { id: "sun", e: "☀️", en: "sun", es: "el sol", fi: "aurinko", c: "thing" },
  { id: "moon", e: "🌙", en: "moon", es: "la luna", fi: "kuu", c: "thing" },
  { id: "house", e: "🏠", en: "house", es: "la casa", fi: "talo", c: "thing" },
  { id: "tree", e: "🌳", en: "tree", es: "el árbol", fi: "puu", c: "thing" },
  { id: "flower", e: "🌸", en: "flower", es: "la flor", fi: "kukka", c: "thing" },
  { id: "boat", e: "⛵", en: "boat", es: "el barco", fi: "vene", c: "thing" },
  { id: "train", e: "🚂", en: "train", es: "el tren", fi: "juna", c: "thing" },
  { id: "bike", e: "🚲", en: "bike", es: "la bicicleta", fi: "pyörä", c: "thing" },
  { id: "balloon", e: "🎈", en: "balloon", es: "el globo", fi: "ilmapallo", c: "thing" },
  { id: "teddy", e: "🧸", en: "teddy bear", es: "el osito", fi: "nalle", c: "thing" },
  { id: "shoe", e: "👟", en: "shoe", es: "el zapato", fi: "kenkä", c: "thing" },
  { id: "umbrella", e: "☂️", en: "umbrella", es: "el paraguas", fi: "sateenvarjo", c: "thing" },
  { id: "cup", e: "☕", en: "cup", es: "la taza", fi: "kuppi", c: "thing" },
  { id: "bed", e: "🛏️", en: "bed", es: "la cama", fi: "sänky", c: "thing" },
  { id: "box", e: "📦", en: "box", es: "la caja", fi: "laatikko", c: "thing" },
  { id: "basket", e: "🧺", en: "basket", es: "la cesta", fi: "kori", c: "thing" },
];

// colours: es m/f is the form after a masculine/feminine noun
export const COLORS: any[] = [
  { id: "red", hex: "#e63946", dark: "#a4161a", en: "red", es: "rojo", esf: "roja", fi: "punainen" },
  { id: "blue", hex: "#1d7fe0", dark: "#0b4f99", en: "blue", es: "azul", esf: "azul", fi: "sininen" },
  { id: "green", hex: "#2bb24c", dark: "#16762e", en: "green", es: "verde", esf: "verde", fi: "vihreä" },
  { id: "yellow", hex: "#ffd23f", dark: "#c99a00", en: "yellow", es: "amarillo", esf: "amarilla", fi: "keltainen" },
  { id: "purple", hex: "#8e44ad", dark: "#5b2172", en: "purple", es: "morado", esf: "morada", fi: "violetti" },
  { id: "orange_c", hex: "#ff8c1a", dark: "#c45f00", en: "orange", es: "naranja", esf: "naranja", fi: "oranssi" },
  { id: "pink", hex: "#ff7eb6", dark: "#d1478a", en: "pink", es: "rosa", esf: "rosa", fi: "pinkki" },
  { id: "white", hex: "#ffffff", dark: "#b8b8b8", en: "white", es: "blanco", esf: "blanca", fi: "valkoinen" },
  { id: "black", hex: "#2b2b2b", dark: "#000000", en: "black", es: "negro", esf: "negra", fi: "musta" },
  { id: "brown", hex: "#8b5a2b", dark: "#5c3a17", en: "brown", es: "marrón", esf: "marrón", fi: "ruskea" },
];

export const NUMBERS_EN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
export const NUMBERS_FI = ["nolla", "yksi", "kaksi", "kolme", "neljä", "viisi", "kuusi", "seitsemän", "kahdeksan", "yhdeksän", "kymmenen"];
export const NUMBERS_ES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
  "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte"];

// short phrases every game can use (common.json)
export const PHRASES: any[] = [
  { id: "great", en: "Great!", es: "¡Genial!", fi: "Hienoa!" },
  { id: "well_done", en: "Well done!", es: "¡Muy bien!", fi: "Hyvin tehty!" },
  { id: "super", en: "Super!", es: "¡Súper!", fi: "Super!" },
  { id: "good_job", en: "Good job!", es: "¡Buen trabajo!", fi: "Hyvää työtä!" },
  { id: "yes", en: "Yes!", es: "¡Sí!", fi: "Kyllä!" },
  { id: "no", en: "No.", es: "No.", fi: "Ei." },
  { id: "correct", en: "Correct!", es: "¡Correcto!", fi: "Oikein!" },
  { id: "try_again", en: "Try again.", es: "Inténtalo otra vez.", fi: "Yritä uudestaan." },
  { id: "oops", en: "Oops!", es: "¡Uy!", fi: "Hups!" },
  { id: "almost", en: "Almost!", es: "¡Casi!", fi: "Melkein!" },
  { id: "listen", en: "Listen.", es: "Escucha.", fi: "Kuuntele." },
  { id: "look", en: "Look!", es: "¡Mira!", fi: "Katso!" },
  { id: "lets_go", en: "Let's go!", es: "¡Vamos!", fi: "Mennään!" },
  { id: "hello", en: "Hello!", es: "¡Hola!", fi: "Hei!" },
  { id: "goodbye", en: "Goodbye!", es: "¡Adiós!", fi: "Hei hei!" },
  { id: "please", en: "please", es: "por favor", fi: "kiitos" },
  { id: "thank_you", en: "Thank you!", es: "¡Gracias!", fi: "Kiitos!" },
  { id: "you_did_it", en: "You did it!", es: "¡Lo lograste!", fi: "Onnistuit!" },
  { id: "again", en: "Again!", es: "¡Otra vez!", fi: "Uudestaan!" },
  { id: "your_turn", en: "Your turn.", es: "Te toca.", fi: "Sinun vuorosi." },
  { id: "the_end", en: "The end.", es: "Fin.", fi: "Loppu." },
];

// --- the games' own sentences (kielipelit.json); {w} is a word ----------------

// Sanat (words): listening and remembering
export const SANAT: any = {
  where: { en: "Where is the {w}?", es: "¿Dónde está {w}?", fi: "Missä on {w}?" },
  what: { en: "What is this?", es: "¿Qué es esto?", fi: "Mikä tämä on?" },
  pairs: { en: "Find the pairs.", es: "Encuentra las parejas.", fi: "Etsi parit." },
  build: { en: "Make the word.", es: "Forma la palabra.", fi: "Kokoa sana." },
};

// Etsi (find): objects drawn in colour; level 1 "Find the red key.",
// level 2 "Put the red ball" + "in the box."
export const OBJECTS: any[] = [
  { id: "key", g: "f" }, { id: "ball", g: "f" }, { id: "hat", g: "m" },
  { id: "car", g: "m" }, { id: "balloon", g: "m" }, { id: "cup", g: "f" },
];
export const FIND_COLORS = ["red", "blue", "green", "yellow", "purple", "orange_c"];
export const PLACES: any[] = [
  { id: "in_box", en: "in the box.", es: "en la caja.", fi: "laatikkoon", fiS: "laatikkoon." },
  { id: "in_basket", en: "in the basket.", es: "en la cesta.", fi: "koriin", fiS: "koriin." },
  { id: "on_bed", en: "on the bed.", es: "encima de la cama.", fi: "sängyn päälle", fiS: "sängyn päälle." },
  { id: "under_bed", en: "under the bed.", es: "debajo de la cama.", fi: "sängyn alle", fiS: "sängyn alle." },
];
export const ETSI: any = {
  find: { en: "Find the {w}.", es: "Busca {w}.", fi: "Etsi {w}." },
  put: { en: "Put the {w}", es: "Pon {w}", fi: "Laita {w}" },
  open: { en: "The treasure chest is open!", es: "¡El cofre del tesoro está abierto!", fi: "Aarrearkku aukesi!" },
  keys: { en: "Find the keys to open the chest.", es: "Busca las llaves para abrir el cofre.", fi: "Etsi avaimet, niin aarrearkku aukeaa." },
  tidy: { en: "Let's tidy the room!", es: "¡Vamos a ordenar la habitación!", fi: "Siivotaan huone!" },
};

// Kahvila (café): the menu and the orders
// fi1: one, as an object ("Haluaisin omenan"); fi: after a number ("kaksi omenaa")
export const MENU: any[] = [
  { id: "apple", en1: "an apple", en: "apples", es1: "una manzana", es: "manzanas", fi1: "omenan", fi: "omenaa" },
  { id: "banana", en1: "a banana", en: "bananas", es1: "un plátano", es: "plátanos", fi1: "banaanin", fi: "banaania" },
  { id: "cookie", en1: "a cookie", en: "cookies", es1: "una galleta", es: "galletas", fi1: "keksin", fi: "keksiä" },
  { id: "cake", en1: "a cake", en: "cakes", es1: "una tarta", es: "tartas", fi1: "kakun", fi: "kakkua" },
  { id: "ice_cream", en1: "an ice cream", en: "ice creams", es1: "un helado", es: "helados", fi1: "jäätelön", fi: "jäätelöä" },
  { id: "juice", en1: "a juice", en: "juices", es1: "un zumo", es: "zumos", fi1: "mehun", fi: "mehua" },
  { id: "sandwich", en1: "a sandwich", en: "sandwiches", es1: "un bocadillo", es: "bocadillos", fi1: "voileivän", fi: "voileipää" },
  { id: "pizza", en1: "a pizza", en: "pizzas", es1: "una pizza", es: "pizzas", fi1: "pizzan", fi: "pizzaa" },
];
export const CAFE_MAX = 4;
export const KAHVILA: any = {
  like: { en: "I'd like {w}, please.", es: "Quiero {w}, por favor.", fi: "Haluaisin {w}, kiitos." },
  like2: { en: "I'd like", es: "Quiero", fi: "Haluaisin" },
  and: { en: "and", es: "y", fi: "ja" },
  here: { en: "Here you are!", es: "¡Aquí tienes!", fi: "Ole hyvä!" },
  yummy: { en: "Yummy!", es: "¡Qué rico!", fi: "Nam, herkullista!" },
  more: { en: "More, please!", es: "¡Más, por favor!", fi: "Lisää, kiitos!" },
  too_many: { en: "That's too many!", es: "¡Son demasiados!", fi: "Liian monta!" },
  not_this: { en: "I didn't order that.", es: "Eso no lo he pedido.", fi: "En tilannut tuota." },
  welcome: { en: "Welcome to the cafe!", es: "¡Bienvenidos a la cafetería!", fi: "Tervetuloa kahvilaan!" },
  closed: { en: "The cafe is closed. Good job!", es: "La cafetería está cerrada. ¡Buen trabajo!", fi: "Kahvila on kiinni. Hienoa työtä!" },
};

// Tarina (story): Pip's day. A scene is a line said aloud with a picture;
// "ask" scenes offer two choices, each with its own next scene.
export const STORY: any[] = [
  { id: "s1", bg: "#ffe8b0", pic: ["🐶"], en: "This is Pip. Pip is a little dog.", es: "Este es Pip. Pip es un perrito.", fi: "Tämä on Pip. Pip on pieni koira.", next: "s2" },
  { id: "s2", bg: "#ffe8b0", pic: ["🌞", "🐶"], en: "Good morning, Pip! Pip is hungry.", es: "¡Buenos días, Pip! Pip tiene hambre.", fi: "Hyvää huomenta, Pip! Pipillä on nälkä.", next: "q1" },
  { id: "q1", bg: "#ffe8b0", pic: ["🐶", "❓"], en: "What does Pip eat?", es: "¿Qué come Pip?", fi: "Mitä Pip syö?",
    choices: [
      { e: "🦴", id: "c1a", en: "A bone!", es: "¡Un hueso!", fi: "Luun!", next: "r1a" },
      { e: "🍰", id: "c1b", en: "A cake!", es: "¡Una tarta!", fi: "Kakun!", next: "r1b" },
    ] },
  { id: "r1a", bg: "#ffe8b0", pic: ["🐶", "🦴"], en: "Yum! Pip loves bones.", es: "¡Qué rico! A Pip le encantan los huesos.", fi: "Nam! Pip rakastaa luita.", next: "s3" },
  { id: "r1b", bg: "#ffe8b0", pic: ["🐶", "🍰"], en: "Cake for breakfast? Pip is very happy!", es: "¿Tarta para desayunar? ¡Pip está muy contento!", fi: "Kakkua aamupalaksi? Pip on tosi iloinen!", next: "s3" },
  { id: "s3", bg: "#ffe8b0", pic: ["🐶", "🚪"], en: "Now Pip wants to go out.", es: "Ahora Pip quiere salir.", fi: "Nyt Pip haluaa ulos.", next: "q2" },
  { id: "q2", bg: "#cfe8ff", pic: ["🐶", "❓"], en: "Is it sunny or rainy?", es: "¿Hace sol o llueve?", fi: "Paistaako aurinko vai sataako?",
    choices: [
      { e: "☀️", id: "c2a", en: "Sunny!", es: "¡Hace sol!", fi: "Aurinkoista!", next: "r2a" },
      { e: "🌧️", id: "c2b", en: "Rainy!", es: "¡Llueve!", fi: "Sateista!", next: "r2b" },
    ] },
  { id: "r2a", bg: "#bff0a8", pic: ["☀️", "🐶", "🌳"], en: "It is sunny. Pip runs to the park.", es: "Hace sol. Pip corre al parque.", fi: "Aurinko paistaa. Pip juoksee puistoon.", next: "s4" },
  { id: "r2b", bg: "#b9c7d8", pic: ["🌧️", "🐶", "💦"], en: "It is rainy. Pip jumps in the puddles. Splash!", es: "Llueve. Pip salta en los charcos. ¡Chof!", fi: "Sataa. Pip hyppii lätäköissä. Plits!", next: "s4" },
  { id: "s4", bg: "#bff0a8", pic: ["🐶", "👀"], en: "Look! Pip sees a friend.", es: "¡Mira! Pip ve a un amigo.", fi: "Katso! Pip näkee ystävän.", next: "q3" },
  { id: "q3", bg: "#bff0a8", pic: ["🐶", "❓"], en: "Who is it?", es: "¿Quién es?", fi: "Kuka se on?",
    choices: [
      { e: "🐱", id: "c3a", en: "A cat!", es: "¡Un gato!", fi: "Kissa!", next: "r3a" },
      { e: "🦆", id: "c3b", en: "A duck!", es: "¡Un pato!", fi: "Ankka!", next: "r3b" },
    ] },
  { id: "r3a", bg: "#bff0a8", pic: ["🐱", "⚽", "🐶"], en: "The cat and Pip play with a ball.", es: "El gato y Pip juegan con una pelota.", fi: "Kissa ja Pip leikkivät pallolla.", next: "s5" },
  { id: "r3b", bg: "#bff0a8", pic: ["🦆", "🐶"], en: "The duck says quack! Pip says woof!", es: "El pato dice cuac. ¡Pip dice guau!", fi: "Ankka sanoo kvaak! Pip sanoo hau!", next: "s5" },
  { id: "s5", bg: "#2c3e78", pic: ["🌙", "🐶", "💤"], en: "Now Pip is tired. Good night, Pip!", es: "Ahora Pip está cansado. ¡Buenas noches, Pip!", fi: "Nyt Pip on väsynyt. Hyvää yötä, Pip!", next: "end" },
  { id: "end", bg: "#2c3e78", pic: ["⭐", "🐶", "⭐"], en: "The end.", es: "Fin.", fi: "Loppu.", next: "" },
];

// every clip text of one language: { common: {id: text}, game: {id: text} }
// (tools/kielipelit/gen-voice.js writes them as voice lists; the game shows them as captions)
export const FI_PREFIX = "kl_";
export function clipTexts(lang) {
  const fill = (t, w) => t.split("{w}").join(w);
  const word = (id) => { for (const w of WORDS) if (w.id === id) return w; return null; };
  const color = (id) => { for (const c of COLORS) if (c.id === id) return c; return null; };
  const common = {}, game = {};
  for (const w of WORDS) common[w.id] = w[lang];
  for (const c of COLORS) common[c.id] = c[lang];
  const nums = lang === "en" ? NUMBERS_EN : lang === "fi" ? NUMBERS_FI : NUMBERS_ES;
  // the numbers n0–n20 are in voice/<lang>/games.json (the existing games' list)
  for (const p of PHRASES) common[p.id] = p[lang];

  // Sanat
  for (const w of WORDS) game["kp_where_" + w.id] = fill(SANAT.where[lang], w[lang]);
  game.kp_what = SANAT.what[lang];
  game.kp_pairs = SANAT.pairs[lang];
  game.kp_build = SANAT.build[lang];
  // Etsi: "the red key" / "la llave roja"
  for (const o of OBJECTS) {
    for (const cid of FIND_COLORS) {
      const c = color(cid), w = word(o.id);
      const np = lang === "es" ? w.es + " " + (o.g === "f" ? c.esf : c.es) : c[lang] + " " + w[lang];
      game["kp_find_" + cid + "_" + o.id] = fill(ETSI.find[lang], np);
      game["kp_put_" + cid + "_" + o.id] = fill(ETSI.put[lang], np);
    }
  }
  for (const p of PLACES) game["kp_" + p.id] = lang === "fi" ? p.fiS : p[lang];
  game.kp_open = ETSI.open[lang];
  game.kp_keys = ETSI.keys[lang];
  game.kp_tidy = ETSI.tidy[lang];
  // Kahvila
  for (const m of MENU) {
    for (let n = 1; n <= CAFE_MAX; n++) {
      const np = n === 1 ? m[lang + "1"] : nums[n] + " " + m[lang];
      game["kp_q" + n + "_" + m.id] = np;
      game["kp_order" + n + "_" + m.id] = fill(KAHVILA.like[lang], np);
    }
  }
  for (const k of ["like2", "and", "here", "yummy", "more", "too_many", "not_this", "welcome", "closed"]) game["kp_" + k] = KAHVILA[k][lang];
  // Tarina
  for (const s of STORY) {
    game["kp_" + s.id] = s[lang];
    for (const c of s.choices || []) game["kp_" + c.id] = c[lang];
  }

  return { common: common, game: game };
}
