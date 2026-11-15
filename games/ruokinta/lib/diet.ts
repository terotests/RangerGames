// What the animals eat. Checked against what the animal really eats in the
// wild or in a zoo:
//   eats  – foods that are the animal's real food: one of them is the right answer
//   maybe – foods the animal can also eat now and then (or is given in a zoo);
//           they are never shown as a wrong answer, so no answer in the game
//           is false. Every food not in eats or maybe is something the animal
//           does not eat, and wrong answers are picked from those.
// The id is the photo's name (img/<id>.jpg) and the voice clips' suffix
// (rk_q_<id> "Mitä kissa syö?", rk_a_<id> "Kissa syö kalaa, hiiriä ja lihaa.").

export const FOODS: any[] = [
  { id: "liha", fi: "Liha", en: "Meat", es: "Carne" },
  { id: "kala", fi: "Kala", en: "Fish", es: "Pescado" },
  { id: "hiiri", fi: "Hiiri", en: "Mouse", es: "Ratón" },
  { id: "mato", fi: "Mato", en: "Worm", es: "Gusano" },
  { id: "karpanen", fi: "Kärpänen", en: "Fly", es: "Mosca" },
  { id: "simpukka", fi: "Simpukka", en: "Mussel", es: "Mejillón" },
  { id: "heina", fi: "Heinä", en: "Hay", es: "Heno" },
  { id: "lehdet", fi: "Lehdet", en: "Leaves", es: "Hojas" },
  { id: "voikukka", fi: "Voikukka", en: "Dandelion", es: "Diente de león" },
  { id: "porkkana", fi: "Porkkana", en: "Carrot", es: "Zanahoria" },
  { id: "banaani", fi: "Banaani", en: "Banana", es: "Plátano" },
  { id: "marjat", fi: "Marjat", en: "Berries", es: "Bayas" },
  { id: "pahkinat", fi: "Pähkinät", en: "Nuts", es: "Nueces" },
  { id: "kapy", fi: "Käpy", en: "Cone", es: "Piña" },
  { id: "jyvat", fi: "Jyvät", en: "Grain", es: "Grano" },
];

export const ANIMALS: any[] = [
  // meat eaters
  { id: "kissa", fi: "Kissa", en: "Cat", es: "Gato", eats: ["kala", "hiiri", "liha"], maybe: ["heina", "mato", "karpanen", "jyvat"] },
  { id: "leijona", fi: "Leijona", en: "Lion", es: "León", eats: ["liha"], maybe: ["hiiri", "kala"] },
  { id: "tiikeri", fi: "Tiikeri", en: "Tiger", es: "Tigre", eats: ["liha"], maybe: ["kala", "hiiri"] },
  { id: "susi", fi: "Susi", en: "Wolf", es: "Lobo", eats: ["liha"], maybe: ["hiiri", "kala", "marjat", "karpanen", "mato"] },
  { id: "kettu", fi: "Kettu", en: "Fox", es: "Zorro", eats: ["hiiri"], maybe: ["marjat", "mato", "karpanen", "liha", "kala", "banaani", "porkkana", "jyvat", "simpukka", "pahkinat", "voikukka"] },
  { id: "pollo", fi: "Huuhkaja", en: "Owl", es: "Búho", eats: ["hiiri"], maybe: ["kala", "liha", "karpanen", "mato"] },
  { id: "krokotiili", fi: "Krokotiili", en: "Crocodile", es: "Cocodrilo", eats: ["liha", "kala"], maybe: ["hiiri", "simpukka", "karpanen", "mato"] },
  // in the sea
  { id: "pingviini", fi: "Pingviini", en: "Penguin", es: "Pingüino", eats: ["kala"], maybe: ["simpukka", "liha"] },
  { id: "hylje", fi: "Hylje", en: "Seal", es: "Foca", eats: ["kala"], maybe: ["simpukka", "liha"] },
  { id: "delfiini", fi: "Delfiini", en: "Dolphin", es: "Delfín", eats: ["kala"], maybe: ["simpukka", "liha"] },
  { id: "mursu", fi: "Mursu", en: "Walrus", es: "Morsa", eats: ["simpukka"], maybe: ["kala", "mato", "liha"] },
  // plant eaters
  { id: "lehma", fi: "Lehmä", en: "Cow", es: "Vaca", eats: ["heina"], maybe: ["lehdet", "jyvat", "porkkana", "voikukka", "banaani", "marjat"] },
  { id: "hevonen", fi: "Hevonen", en: "Horse", es: "Caballo", eats: ["heina", "porkkana"], maybe: ["jyvat", "lehdet", "voikukka", "banaani", "marjat"] },
  { id: "lammas", fi: "Lammas", en: "Sheep", es: "Oveja", eats: ["heina"], maybe: ["lehdet", "jyvat", "voikukka", "porkkana", "banaani", "marjat"] },
  { id: "kani", fi: "Kani", en: "Rabbit", es: "Conejo", eats: ["heina", "voikukka", "porkkana"], maybe: ["lehdet", "jyvat", "banaani", "marjat"] },
  { id: "seepra", fi: "Seepra", en: "Zebra", es: "Cebra", eats: ["heina"], maybe: ["lehdet", "voikukka", "porkkana", "jyvat"] },
  { id: "kirahvi", fi: "Kirahvi", en: "Giraffe", es: "Jirafa", eats: ["lehdet"], maybe: ["heina", "porkkana", "voikukka", "jyvat", "banaani"] },
  { id: "norsu", fi: "Norsu", en: "Elephant", es: "Elefante", eats: ["heina", "lehdet", "banaani"], maybe: ["porkkana", "voikukka", "jyvat", "marjat", "pahkinat"] },
  { id: "virtahepo", fi: "Virtahepo", en: "Hippo", es: "Hipopótamo", eats: ["heina"], maybe: ["lehdet", "porkkana", "voikukka", "banaani", "jyvat"] },
  { id: "sarvikuono", fi: "Sarvikuono", en: "Rhino", es: "Rinoceronte", eats: ["heina"], maybe: ["lehdet", "porkkana", "voikukka", "banaani", "jyvat"] },
  { id: "kameli", fi: "Kameli", en: "Camel", es: "Camello", eats: ["heina", "lehdet"], maybe: ["jyvat", "porkkana", "voikukka", "banaani"] },
  { id: "kenguru", fi: "Kenguru", en: "Kangaroo", es: "Canguro", eats: ["heina"], maybe: ["lehdet", "voikukka", "porkkana", "jyvat"] },
  { id: "hirvi", fi: "Hirvi", en: "Moose", es: "Alce", eats: ["lehdet"], maybe: ["heina", "voikukka", "porkkana", "marjat", "jyvat"] },
  { id: "majava", fi: "Majava", en: "Beaver", es: "Castor", eats: ["lehdet"], maybe: ["heina", "voikukka", "porkkana", "jyvat", "banaani", "marjat", "pahkinat"] },
  { id: "orava", fi: "Orava", en: "Squirrel", es: "Ardilla", eats: ["kapy", "pahkinat"], maybe: ["marjat", "jyvat", "voikukka", "porkkana", "banaani", "lehdet", "mato", "karpanen", "liha"] },
  { id: "gorilla", fi: "Gorilla", en: "Gorilla", es: "Gorila", eats: ["lehdet", "banaani"], maybe: ["porkkana", "voikukka", "marjat", "karpanen", "pahkinat", "jyvat", "heina", "mato"] },
  { id: "kilpikonna", fi: "Kilpikonna", en: "Tortoise", es: "Tortuga", eats: ["voikukka", "lehdet"], maybe: ["heina", "marjat", "banaani", "porkkana", "mato", "karpanen", "liha"] },
  // all sorts
  { id: "simpanssi", fi: "Simpanssi", en: "Chimpanzee", es: "Chimpancé", eats: ["banaani"], maybe: ["lehdet", "karpanen", "pahkinat", "marjat", "liha", "porkkana", "voikukka", "jyvat", "mato", "hiiri", "kala"] },
  // small animals that eat small animals
  { id: "siili", fi: "Siili", en: "Hedgehog", es: "Erizo", eats: ["mato", "karpanen"], maybe: ["liha", "marjat", "hiiri", "kala", "banaani", "jyvat", "simpukka", "porkkana"] },
  { id: "sammakko", fi: "Sammakko", en: "Frog", es: "Rana", eats: ["karpanen", "mato"], maybe: ["hiiri", "simpukka"] },
];

// what the animal says when fed: "Kissa syö kalaa, hiiriä ja lihaa." (voice clip rk_a_<id>)
export const ANSWER: any = {
  kissa: ["Kissa syö kalaa, hiiriä ja lihaa.", "Cats eat fish, mice and meat.", "Los gatos comen pescado, ratones y carne."],
  leijona: ["Leijona syö lihaa. Se metsästää.", "Lions eat meat. They hunt.", "Los leones comen carne. Cazan."],
  tiikeri: ["Tiikeri syö lihaa. Se metsästää.", "Tigers eat meat. They hunt.", "Los tigres comen carne. Cazan."],
  susi: ["Susi syö lihaa. Se metsästää laumassa.", "Wolves eat meat. They hunt in a pack.", "Los lobos comen carne. Cazan en manada."],
  kettu: ["Kettu syö hiiriä. Kesällä myös marjoja ja matoja.", "Foxes eat mice, and in summer berries and worms too.", "Los zorros comen ratones, y en verano también bayas y gusanos."],
  pollo: ["Huuhkaja syö hiiriä. Se saalistaa yöllä.", "Owls eat mice. They hunt at night.", "Los búhos comen ratones. Cazan de noche."],
  krokotiili: ["Krokotiili syö lihaa ja kalaa.", "Crocodiles eat meat and fish.", "Los cocodrilos comen carne y pescado."],
  pingviini: ["Pingviini syö kalaa. Se sukeltaa meressä.", "Penguins eat fish. They dive in the sea.", "Los pingüinos comen pescado. Bucean en el mar."],
  hylje: ["Hylje syö kalaa.", "Seals eat fish.", "Las focas comen pescado."],
  delfiini: ["Delfiini syö kalaa.", "Dolphins eat fish.", "Los delfines comen pescado."],
  mursu: ["Mursu syö simpukoita merenpohjasta.", "Walruses eat mussels from the sea floor.", "Las morsas comen mejillones del fondo del mar."],
  lehma: ["Lehmä syö heinää ja ruohoa.", "Cows eat hay and grass.", "Las vacas comen heno y hierba."],
  hevonen: ["Hevonen syö heinää. Porkkana on herkkua.", "Horses eat hay. Carrots are a treat.", "Los caballos comen heno. La zanahoria es un premio."],
  lammas: ["Lammas syö heinää ja ruohoa.", "Sheep eat hay and grass.", "Las ovejas comen heno y hierba."],
  kani: ["Kani syö heinää, voikukkaa ja porkkanaa.", "Rabbits eat hay, dandelions and carrots.", "Los conejos comen heno, diente de león y zanahoria."],
  seepra: ["Seepra syö heinää ja ruohoa.", "Zebras eat hay and grass.", "Las cebras comen heno y hierba."],
  kirahvi: ["Kirahvi syö lehtiä korkealta puista.", "Giraffes eat leaves high up in the trees.", "Las jirafas comen hojas de lo alto de los árboles."],
  norsu: ["Norsu syö heinää, lehtiä ja hedelmiä.", "Elephants eat hay, leaves and fruit.", "Los elefantes comen heno, hojas y fruta."],
  virtahepo: ["Virtahepo syö ruohoa ja heinää.", "Hippos eat grass and hay.", "Los hipopótamos comen hierba y heno."],
  sarvikuono: ["Sarvikuono syö ruohoa ja heinää.", "Rhinos eat grass and hay.", "Los rinocerontes comen hierba y heno."],
  kameli: ["Kameli syö heinää ja lehtiä.", "Camels eat hay and leaves.", "Los camellos comen heno y hojas."],
  kenguru: ["Kenguru syö ruohoa ja heinää.", "Kangaroos eat grass and hay.", "Los canguros comen hierba y heno."],
  hirvi: ["Hirvi syö lehtiä ja oksia.", "Moose eat leaves and twigs.", "Los alces comen hojas y ramitas."],
  majava: ["Majava syö lehtiä ja puun kuorta. Kalaa se ei syö.", "Beavers eat leaves and bark. They do not eat fish.", "Los castores comen hojas y corteza. No comen pescado."],
  orava: ["Orava syö kävyn siemeniä ja pähkinöitä.", "Squirrels eat seeds from cones and nuts.", "Las ardillas comen semillas de piñas y nueces."],
  gorilla: ["Gorilla syö lehtiä ja hedelmiä.", "Gorillas eat leaves and fruit.", "Los gorilas comen hojas y fruta."],
  kilpikonna: ["Kilpikonna syö voikukkaa ja lehtiä.", "Tortoises eat dandelions and leaves.", "Las tortugas comen diente de león y hojas."],
  simpanssi: ["Simpanssi syö hedelmiä, lehtiä ja hyönteisiä.", "Chimpanzees eat fruit, leaves and insects.", "Los chimpancés comen fruta, hojas e insectos."],
  siili: ["Siili syö matoja ja hyönteisiä.", "Hedgehogs eat worms and insects.", "Los erizos comen gusanos e insectos."],
  sammakko: ["Sammakko syö kärpäsiä ja matoja.", "Frogs eat flies and worms.", "Las ranas comen moscas y gusanos."],
};
