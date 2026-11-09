// The animals of Korkeasaari: what they eat, where they live in the wild, how
// heavy they are, and one fact. Where their enclosure is comes from OpenStreetMap
// (lib/mapdata.ts). Every sentence the game says is a voice clip in voice/fi.json
// (made by tools/korkeasaari/voice.py from this file).

export type Animal = {
  id: string; name: string; gen: string; // gen: "Löysit lumileopardin!"
  eats: string[];   // the first is the answer; the others also count as right
  home: string[];   // likewise
  kg: number;       // a grown-up animal
  legs: number;
  world: string[];  // continents, the first is the answer; empty: no such question (a farm animal)
  at: number[];     // [lon, lat] of its home in the wild, for the world map
  fact: string; factTrue: boolean;
  color: string;
};

export const FOODS: any = {
  liha: { icon: "🥩", name: "Lihaa" },
  kala: { icon: "🐟", name: "Kalaa" },
  kasvit: { icon: "🌿", name: "Kasveja" },
  marjat: { icon: "🍓", name: "Marjoja" },
  hyonteiset: { icon: "🐛", name: "Hyönteisiä" },
  hiiret: { icon: "🐭", name: "Hiiriä" },
  bambu: { icon: "🎋", name: "Bambua" },
};

export const HOMES: any = {
  vuoret: { icon: "🏔️", name: "Vuorilla", color: "#a8c5e0" },
  metsa: { icon: "🌲", name: "Metsässä", color: "#95d5b2" },
  aavikko: { icon: "🏜️", name: "Aavikolla", color: "#f4d58d" },
  tundra: { icon: "❄️", name: "Kylmällä tundralla", color: "#e0f2ff" },
  aro: { icon: "🌾", name: "Ruohoarolla", color: "#e9edc9" },
  joki: { icon: "🏞️", name: "Joen rannalla", color: "#a2d2ff" },
  maatila: { icon: "🏡", name: "Maatilalla", color: "#ffd6a5" },
};

// the world map (kuvat/maailma.png, tools/korkeasaari/world_map.py): its bounds and the continents' pins
export const WORLD_MAP = { lon0: -170, lon1: 190, lat0: 80, lat1: -50, w: 720, h: 260 };
export const WORLD: any = {
  eurooppa: { name: "Eurooppa", lon: 20, lat: 52, color: "#78aafa" },
  aasia: { name: "Aasia", lon: 95, lat: 45, color: "#fac45a" },
  afrikka: { name: "Afrikka", lon: 20, lat: 5, color: "#f08060" },
  pamerikka: { name: "Pohjois-Amerikka", lon: -100, lat: 48, color: "#82c878" },
  eamerikka: { name: "Etelä-Amerikka", lon: -60, lat: -12, color: "#be8cdc" },
  australia: { name: "Australia", lon: 134, lat: -25, color: "#6ec8c8" },
};

export const ANIMALS: Animal[] = [
  { id: "lumileopardi", name: "Lumileopardi", gen: "lumileopardin", eats: ["liha"], home: ["vuoret"], kg: 45, world: ["aasia"], at: [80, 38], legs: 4,
    fact: "Lumileopardi kietoo pitkän häntänsä peitoksi, kun se nukkuu.", factTrue: true, color: "#8ecae6" },
  { id: "amurinleopardi", name: "Amurinleopardi", gen: "amurinleopardin", eats: ["liha"], home: ["metsa"], kg: 45, world: ["aasia"], at: [132, 44], legs: 4,
    fact: "Amurinleopardi on yksi maailman harvinaisimmista kissoista.", factTrue: true, color: "#f4a261" },
  { id: "tiikeri", name: "Amurintiikeri", gen: "amurintiikerin", eats: ["liha"], home: ["metsa"], kg: 220, world: ["aasia"], at: [135, 47], legs: 4,
    fact: "Amurintiikeri on maailman pienin kissa.", factTrue: false, color: "#fb8500" },
  { id: "leijona", name: "Aasianleijona", gen: "aasianleijonan", eats: ["liha"], home: ["aro", "metsa"], kg: 160, world: ["aasia"], at: [71, 21], legs: 4,
    fact: "Aasianleijonia elää luonnossa vain Intiassa.", factTrue: true, color: "#e9c46a" },
  { id: "karhu", name: "Karhu", gen: "karhun", eats: ["marjat", "kala", "liha", "kasvit", "hyonteiset"], home: ["metsa"], kg: 250, world: ["eurooppa", "aasia", "pamerikka"], at: [28, 63], legs: 4,
    fact: "Karhu nukkuu talven pesässään.", factTrue: true, color: "#bc6c25" },
  { id: "ahma", name: "Ahma", gen: "ahman", eats: ["liha"], home: ["tundra", "metsa"], kg: 15, world: ["eurooppa", "aasia", "pamerikka"], at: [25, 68], legs: 4,
    fact: "Ahma piilottaa ruokaa lumen alle myöhemmäksi.", factTrue: true, color: "#6d597a" },
  { id: "ilves", name: "Ilves", gen: "ilveksen", eats: ["liha"], home: ["metsa"], kg: 20, world: ["eurooppa", "aasia"], at: [26, 62], legs: 4,
    fact: "Ilves on Suomen ainoa villi kissaeläin.", factTrue: true, color: "#dda15e" },
  { id: "manuli", name: "Manuli", gen: "manulin", eats: ["hiiret"], home: ["vuoret", "aro"], kg: 4, world: ["aasia"], at: [103, 46], legs: 4,
    fact: "Manuli on yhtä iso kuin leijona.", factTrue: false, color: "#adb5bd" },
  { id: "pikkupanda", name: "Kultapanda", gen: "kultapandan", eats: ["bambu", "kasvit", "marjat"], home: ["vuoret", "metsa"], kg: 5, world: ["aasia"], at: [90, 27], legs: 4,
    fact: "Kultapanda syö enimmäkseen bambua.", factTrue: true, color: "#e76f51" },
  { id: "saukko", name: "Saukko", gen: "saukon", eats: ["kala"], home: ["joki"], kg: 9, world: ["eurooppa", "aasia", "afrikka"], at: [25, 62], legs: 4,
    fact: "Saukko ui ja sukeltaa taitavasti.", factTrue: true, color: "#48cae4" },
  { id: "metsapeura", name: "Metsäpeura", gen: "metsäpeuran", eats: ["kasvit"], home: ["metsa"], kg: 120, world: ["eurooppa"], at: [29, 64], legs: 4,
    fact: "Metsäpeura on poron villi serkku.", factTrue: true, color: "#99582a" },
  { id: "myskiharka", name: "Myskihärkä", gen: "myskihärän", eats: ["kasvit"], home: ["tundra"], kg: 300, world: ["pamerikka"], at: [-100, 70], legs: 4,
    fact: "Myskihärkä palelee helposti pakkasella.", factTrue: false, color: "#7f5539" },
  { id: "takini", name: "Takini", gen: "takinin", eats: ["kasvit"], home: ["vuoret"], kg: 300, world: ["aasia"], at: [103, 30], legs: 4,
    fact: "Takini kiipeilee korkeilla vuorilla.", factTrue: true, color: "#d4a373" },
  { id: "visentti", name: "Visentti", gen: "visentin", eats: ["kasvit"], home: ["metsa"], kg: 700, world: ["eurooppa"], at: [24, 53], legs: 4,
    fact: "Visentti on Euroopan painavin maaeläin.", factTrue: true, color: "#6f4518" },
  { id: "kameli", name: "Kameli", gen: "kamelin", eats: ["kasvit"], home: ["aavikko"], kg: 500, world: ["aasia"], at: [100, 43], legs: 4,
    fact: "Kamelin kyttyröissä on vettä.", factTrue: false, color: "#e9c46a" },
  { id: "villihevonen", name: "Mongolianvillihevonen", gen: "villihevosen", eats: ["kasvit"], home: ["aro"], kg: 300, world: ["aasia"], at: [96, 46], legs: 4,
    fact: "Mongolianvillihevonen syö heinää.", factTrue: true, color: "#c8a066" },
  { id: "markhor", name: "Markhor", gen: "markhorin", eats: ["kasvit"], home: ["vuoret"], kg: 80, world: ["aasia"], at: [71, 35], legs: 4,
    fact: "Markhorin sarvet ovat kierteiset kuin korkkiruuvi.", factTrue: true, color: "#8d99ae" },
  { id: "vuohi", name: "Vuohi", gen: "vuohen", eats: ["kasvit"], home: ["maatila", "vuoret"], kg: 50, world: [], at: [0, 0], legs: 4,
    fact: "Vuohi kiipeilee mielellään korkealle.", factTrue: true, color: "#90be6d" },
  { id: "tunturipollo", name: "Tunturipöllö", gen: "tunturipöllön", eats: ["hiiret"], home: ["tundra"], kg: 2, world: ["pamerikka", "eurooppa", "aasia"], at: [-150, 70], legs: 2,
    fact: "Tunturipöllö on musta lintu.", factTrue: false, color: "#caf0f8" },
  { id: "kenguru", name: "Punaniskakenguru", gen: "kengurun", eats: ["kasvit"], home: ["aro", "metsa"], kg: 15, world: ["australia"], at: [150, -33], legs: 4,
    fact: "Kengurun poikanen kasvaa emonsa pussissa.", factTrue: true, color: "#b5838d" },
  { id: "preerikko", name: "Preeriakoira", gen: "preeriakoiran", eats: ["kasvit"], home: ["aro"], kg: 1, world: ["pamerikka"], at: [-102, 40], legs: 4,
    fact: "Preeriakoira kaivaa maan alle pitkiä käytäviä.", factTrue: true, color: "#ddb892" },
  { id: "aavikkokettu", name: "Aavikkokettu", gen: "aavikkoketun", eats: ["hyonteiset", "hiiret", "marjat"], home: ["aavikko"], kg: 1.5, world: ["afrikka"], at: [5, 25], legs: 4,
    fact: "Aavikkoketun isot korvat pitävät sen viileänä.", factTrue: true, color: "#ffd166" },
  { id: "berberiapina", name: "Berberiapina", gen: "berberiapinan", eats: ["kasvit", "marjat", "hyonteiset"], home: ["vuoret", "metsa"], kg: 13, world: ["afrikka"], at: [-5, 33], legs: 4,
    fact: "Berberiapinalla on pitkä häntä.", factTrue: false, color: "#a98467" },
];
