// Kielisaari: every word and sentence of the game in English, Spanish and
// Finnish. The English and Spanish ones are voice clips: tools/kielisaari/voice.js
// copies them into voice/en/island.json and voice/es/island.json (ids isl_*),
// and the build renders them with CHIMERA. The Finnish is the hint (💡) on the
// screen, never spoken, so the child hears only the language being learned.

export type Lang = "en" | "es";

// a sentence in three languages
export type Line = { en: string; es: string; fi: string };

// The 8 nouns of the island, by place. es: with its article (la concha), as
// a Spanish word is learned with its gender; esWord: the bare word for the
// letter puzzle; pl: the plural for "Give me two …".
export type Word = {
  id: string; place: string;
  en: string; enPl: string;
  es: string; esWord: string; esPl: string; esF: boolean;
  fi: string;
};

export const WORDS: Word[] = [
  { id: "shell", place: "beach", en: "shell", enPl: "shells", es: "la concha", esWord: "concha", esPl: "conchas", esF: true, fi: "simpukka" },
  { id: "fish", place: "beach", en: "fish", enPl: "fish", es: "el pez", esWord: "pez", esPl: "peces", esF: false, fi: "kala" },
  { id: "star", place: "beach", en: "star", enPl: "stars", es: "la estrella", esWord: "estrella", esPl: "estrellas", esF: true, fi: "tähti" },
  { id: "apple", place: "garden", en: "apple", enPl: "apples", es: "la manzana", esWord: "manzana", esPl: "manzanas", esF: true, fi: "omena" },
  { id: "banana", place: "garden", en: "banana", enPl: "bananas", es: "el plátano", esWord: "plátano", esPl: "plátanos", esF: false, fi: "banaani" },
  { id: "flower", place: "garden", en: "flower", enPl: "flowers", es: "la flor", esWord: "flor", esPl: "flores", esF: true, fi: "kukka" },
  { id: "cake", place: "cafe", en: "cake", enPl: "cakes", es: "el pastel", esWord: "pastel", esPl: "pasteles", esF: false, fi: "kakku" },
  { id: "key", place: "cave", en: "key", enPl: "keys", es: "la llave", esWord: "llave", esPl: "llaves", esF: true, fi: "avain" },
];

// colours and numbers are words too (learned on the way, used in "Give me two red apples")
export const COLORS = [
  { id: "red", en: "red", es: "rojo", esF: "roja", fi: "punainen", hex: "#e63946" },
  { id: "blue", en: "blue", es: "azul", esF: "azul", fi: "sininen", hex: "#3a86ff" },
  { id: "yellow", en: "yellow", es: "amarillo", esF: "amarilla", fi: "keltainen", hex: "#ffd60a" },
  { id: "green", en: "green", es: "verde", esF: "verde", fi: "vihreä", hex: "#52b788" },
];
export const NUMBERS = [
  { id: "n1", en: "one", es: "uno", fi: "yksi" },
  { id: "n2", en: "two", es: "dos", fi: "kaksi" },
  { id: "n3", en: "three", es: "tres", fi: "kolme" },
];

// Sentences. Clip id = "isl_" + key.
export const T: { [id: string]: Line } = {
  // Pip the parrot, the guide
  hello: { en: "Hello! I am Pip.", es: "¡Hola! Soy Pip.", fi: "Hei! Minä olen Pip." },
  welcome: { en: "Welcome to Mystery Island!", es: "¡Bienvenido a la Isla Misteriosa!", fi: "Tervetuloa Salaperäiselle saarelle!" },
  map: { en: "Let's find the treasure! Tap a place on the map.", es: "¡Vamos a buscar el tesoro! Toca un lugar en el mapa.", fi: "Etsitään aarre! Napauta paikkaa kartalla." },
  map_next: { en: "Where now? Tap the next place.", es: "¿Adónde vamos ahora? Toca el siguiente lugar.", fi: "Minne nyt? Napauta seuraavaa paikkaa." },
  listen: { en: "Listen and tap.", es: "Escucha y toca.", fi: "Kuuntele ja napauta." },
  good: { en: "Good job!", es: "¡Muy bien!", fi: "Hyvää työtä!" },
  great: { en: "Great!", es: "¡Genial!", fi: "Mahtavaa!" },
  yes: { en: "Yes! Well done!", es: "¡Sí! ¡Bien hecho!", fi: "Kyllä! Hienosti tehty!" },
  super: { en: "Super!", es: "¡Súper!", fi: "Super!" },
  almost: { en: "Almost! Listen again.", es: "¡Casi! Escucha otra vez.", fi: "Melkein! Kuuntele uudestaan." },
  look: { en: "Look! It is moving.", es: "¡Mira! Se está moviendo.", fi: "Katso! Se liikkuu." },
  thanks: { en: "Thank you!", es: "¡Gracias!", fi: "Kiitos!" },
  remember: { en: "Do you remember?", es: "¿Te acuerdas?", fi: "Muistatko?" },
  whatis: { en: "What is this?", es: "¿Qué es esto?", fi: "Mikä tämä on?" },
  sayit: { en: "Now you say it!", es: "¡Ahora dilo tú!", fi: "Sano sinä nyt!" },
  build: { en: "Make the word.", es: "Forma la palabra.", fi: "Kokoa sana kirjaimista." },
  mappiece: { en: "You found a piece of the map!", es: "¡Encontraste un trozo del mapa!", fi: "Löysit palan aarrekarttaa!" },
  treasure: { en: "You found the treasure! You are a star!", es: "¡Encontraste el tesoro! ¡Eres una estrella!", fi: "Löysit aarteen! Olet tähti!" },
  bye: { en: "See you soon!", es: "¡Hasta pronto!", fi: "Nähdään pian!" },
  warmup: { en: "Hello again! Do you remember these words?", es: "¡Hola otra vez! ¿Te acuerdas de estas palabras?", fi: "Hei taas! Muistatko nämä sanat?" },
  warmup_done: { en: "You remember a lot!", es: "¡Recuerdas mucho!", fi: "Muistat paljon!" },
  book: { en: "My word book.", es: "Mi libro de palabras.", fi: "Minun sanakirjani." },
  here: { en: "Here you are!", es: "¡Aquí tienes!", fi: "Ole hyvä!" },
  more: { en: "More, please.", es: "Más, por favor.", fi: "Lisää, kiitos." },
  too_many: { en: "Oops, too many!", es: "¡Uy, demasiados!", fi: "Hups, liian monta!" },

  // the beach: Tilly the turtle
  b_intro: { en: "Oh no! The waves took my things. Can you help me?", es: "¡Oh, no! Las olas se llevaron mis cosas. ¿Me ayudas?", fi: "Voi ei! Aallot veivät tavarani. Autatko minua?" },
  b_find: { en: "My things are in the sand. Tap them!", es: "Mis cosas están en la arena. ¡Tócalas!", fi: "Tavarani ovat hiekassa. Napauta niitä!" },
  b_done: { en: "Thank you! Here is a piece of the map.", es: "¡Gracias! Aquí tienes un trozo del mapa.", fi: "Kiitos! Tässä on pala karttaa." },
  b_use1: { en: "Give me two shells, please.", es: "Dame dos conchas, por favor.", fi: "Anna minulle kaksi simpukkaa, kiitos." },
  b_use2: { en: "Give me one fish and one star.", es: "Dame un pez y una estrella.", fi: "Anna minulle yksi kala ja yksi tähti." },
  b_use3: { en: "Give me three stars, please.", es: "Dame tres estrellas, por favor.", fi: "Anna minulle kolme tähteä, kiitos." },

  // the garden: Momo the monkey
  g_intro: { en: "I am hungry! Can you help me find food?", es: "¡Tengo hambre! ¿Me ayudas a buscar comida?", fi: "Minulla on nälkä! Autatko minua löytämään ruokaa?" },
  g_colors: { en: "Look at the colours!", es: "¡Mira los colores!", fi: "Katso värejä!" },
  g_done: { en: "Yummy! Thank you! Here is a piece of the map.", es: "¡Qué rico! ¡Gracias! Aquí tienes un trozo del mapa.", fi: "Nam! Kiitos! Tässä on pala karttaa." },
  g_use1: { en: "Give me three red apples, please.", es: "Dame tres manzanas rojas, por favor.", fi: "Anna minulle kolme punaista omenaa, kiitos." },
  g_use2: { en: "Give me two green apples.", es: "Dame dos manzanas verdes.", fi: "Anna minulle kaksi vihreää omenaa." },
  g_use3: { en: "Give me two bananas, please.", es: "Dame dos plátanos, por favor.", fi: "Anna minulle kaksi banaania, kiitos." },
  g_use4: { en: "Give me a blue flower.", es: "Dame una flor azul.", fi: "Anna minulle sininen kukka." },
  g_use5: { en: "Give me a yellow flower, please.", es: "Dame una flor amarilla, por favor.", fi: "Anna minulle keltainen kukka, kiitos." },

  // the café: Bruno the bear
  c_intro: { en: "Welcome to my cafe! Can you help me? Listen to my friends.", es: "¡Bienvenido a mi café! ¿Me ayudas? Escucha a mis amigos.", fi: "Tervetuloa kahvilaani! Autatko minua? Kuuntele ystäviäni." },
  c_done: { en: "You are a great waiter! Here is a piece of the map.", es: "¡Eres un camarero genial! Aquí tienes un trozo del mapa.", fi: "Olet loistava tarjoilija! Tässä on pala karttaa." },
  c_order1: { en: "I would like two bananas, please.", es: "Quiero dos plátanos, por favor.", fi: "Haluaisin kaksi banaania, kiitos." },
  c_order2: { en: "I would like a fish, please.", es: "Quiero un pez, por favor.", fi: "Haluaisin kalan, kiitos." },
  c_order3: { en: "I would like a cake and an apple, please.", es: "Quiero un pastel y una manzana, por favor.", fi: "Haluaisin kakun ja omenan, kiitos." },
  c_order4: { en: "I would like three cakes, please.", es: "Quiero tres pasteles, por favor.", fi: "Haluaisin kolme kakkua, kiitos." },
  c_order5: { en: "I would like a red flower, please.", es: "Quiero una flor roja, por favor.", fi: "Haluaisin punaisen kukan, kiitos." },
  c_say_here: { en: "Tap the bubble and say it too!", es: "¡Toca la burbuja y dilo tú también!", fi: "Napauta puhekuplaa ja sano se itsekin!" },

  // the cave
  k_intro: { en: "The treasure is in the cave. The box has three locks.", es: "El tesoro está en la cueva. La caja tiene tres candados.", fi: "Aarre on luolassa. Arkussa on kolme lukkoa." },
  k_red: { en: "Find the red key.", es: "Busca la llave roja.", fi: "Etsi punainen avain." },
  k_blue: { en: "Find the blue key.", es: "Busca la llave azul.", fi: "Etsi sininen avain." },
  k_yellow: { en: "Find the yellow key.", es: "Busca la llave amarilla.", fi: "Etsi keltainen avain." },
  k_green: { en: "Find the green key.", es: "Busca la llave verde.", fi: "Etsi vihreä avain." },
  k_need_map: { en: "We need all three pieces of the map first.", es: "Primero necesitamos los tres trozos del mapa.", fi: "Tarvitsemme ensin kaikki kolme karttapalaa." },
};

// the generated sentences of every noun, colour and number (ids isl_w_*, isl_this_*, isl_where_*)
export function wordLines(): { [id: string]: Line } {
  const out: { [id: string]: Line } = {};
  for (const w of WORDS) {
    const una = w.esF ? "una" : "un";
    const en1 = /^[aeiou]/.test(w.en) ? "an" : "a";
    out["w_" + w.id] = { en: w.en, es: w.es, fi: w.fi };
    out["this_" + w.id] = { en: "This is " + en1 + " " + w.en + ".", es: "Esto es " + una + " " + w.esWord + ".", fi: "Tämä on " + w.fi + "." };
    out["where_" + w.id] = { en: "Where is the " + w.en + "?", es: "¿Dónde está " + w.es + "?", fi: "Missä on " + w.fi + "?" };
  }
  for (const c of COLORS) out["w_" + c.id] = { en: c.en, es: c.es, fi: c.fi };
  for (const n of NUMBERS) out["w_" + n.id] = { en: n.en, es: n.es, fi: n.fi };
  // the colours shown on flowers and apples
  out["this_red"] = { en: "A red flower.", es: "Una flor roja.", fi: "Punainen kukka." };
  out["this_yellow"] = { en: "A yellow flower.", es: "Una flor amarilla.", fi: "Keltainen kukka." };
  out["this_blue"] = { en: "A blue flower.", es: "Una flor azul.", fi: "Sininen kukka." };
  out["this_green"] = { en: "A green apple.", es: "Una manzana verde.", fi: "Vihreä omena." };
  return out;
}
