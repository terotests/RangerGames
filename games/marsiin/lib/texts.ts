// What the game says: the modules, the tasks and the events, in Finnish,
// English and Spanish ([fi, en, es]). The facts are true of the ISS.

export type T3 = string[];

export const MODULE_TEXT: { [id: string]: { name: T3; info: T3 } } = {
  unity: {
    name: ["Unity · solmu 1", "Unity · Node 1", "Unity · Nodo 1"],
    info: ["Ensimmäinen amerikkalainen moduuli (1998). Kuusi luukkua joka suuntaan.", "The first American module (1998). Six hatches in every direction.", "El primer módulo estadounidense (1998). Seis escotillas en todas direcciones."],
  },
  destiny: {
    name: ["Destiny · laboratorio", "Destiny · laboratory", "Destiny · laboratorio"],
    info: ["Yhdysvaltain laboratorio, 8,5 m pitkä, 24 laitekaappia. Lattiassa on 51 cm ikkuna.", "The US laboratory, 8.5 m long, 24 racks. There is a 51 cm window in the floor.", "El laboratorio de EE. UU., 8,5 m de largo, 24 armarios. Hay una ventana de 51 cm en el suelo."],
  },
  harmony: {
    name: ["Harmony · solmu 2", "Harmony · Node 2", "Harmony · Nodo 2"],
    info: ["Neljä makuuhyttiä, yksi joka seinällä. Täältä pääsee Euroopan ja Japanin laboratorioihin.", "Four crew cabins, one on each wall. It leads to the European and Japanese labs.", "Cuatro camarotes, uno en cada pared. Lleva a los laboratorios europeo y japonés."],
  },
  columbus: {
    name: ["Columbus · Eurooppa", "Columbus · Europe", "Columbus · Europa"],
    info: ["Euroopan avaruusjärjestön laboratorio, 6,9 m. Täällä kasvatetaan kasveja.", "The European Space Agency's lab, 6.9 m. Plants are grown here.", "El laboratorio de la Agencia Espacial Europea, 6,9 m. Aquí se cultivan plantas."],
  },
  kibo: {
    name: ["Kibo · Japani", "Kibo · Japan", "Kibo · Japón"],
    info: ["Japanin laboratorio, aseman pisin moduuli: 11,2 m. Päässä on pieni ilmalukko kokeille.", "Japan's lab, the station's longest module: 11.2 m. At its end is a small airlock for experiments.", "El laboratorio de Japón, el módulo más largo: 11,2 m. Al final hay una pequeña esclusa para experimentos."],
  },
  tranquility: {
    name: ["Tranquility · solmu 3", "Tranquility · Node 3", "Tranquility · Nodo 3"],
    info: ["Koneet tekevät happea vedestä ja juomavettä virtsasta. Täällä on vessa, juoksumatto ja kyykkylaite.", "Machines make oxygen from water and drinking water from urine. The toilet, the treadmill and the squat machine are here.", "Las máquinas hacen oxígeno del agua y agua potable de la orina. Aquí están el baño, la cinta y la máquina de sentadillas."],
  },
  cupola: {
    name: ["Cupola · näköalakupoli", "Cupola · the window dome", "Cupola · la cúpula"],
    info: ["Seitsemän ikkunaa. Keskimmäinen on 80 cm leveä, suurin avaruudessa koskaan ollut ikkuna.", "Seven windows. The middle one is 80 cm wide, the largest window ever flown in space.", "Siete ventanas. La del centro mide 80 cm, la mayor ventana que ha volado al espacio."],
  },
  leonardo: {
    name: ["Leonardo · varasto", "Leonardo · storage", "Leonardo · almacén"],
    info: ["Italiassa rakennettu varastomoduuli, 6,6 m. Täältä löytyy ruokaa ja varaosia.", "A storage module built in Italy, 6.6 m. Food and spare parts are kept here.", "Un módulo almacén construido en Italia, 6,6 m. Aquí hay comida y repuestos."],
  },
  beam: {
    name: ["BEAM · puhallettava", "BEAM · inflatable", "BEAM · inflable"],
    info: ["Puhallettava moduuli! Se täytettiin ilmalla avaruudessa. Seinät ovat monta kerrosta kangasta.", "An inflatable module! It was filled with air in space. Its walls are many layers of fabric.", "¡Un módulo inflable! Se llenó de aire en el espacio. Sus paredes son muchas capas de tela."],
  },
  quest: {
    name: ["Quest · ilmalukko", "Quest · airlock", "Quest · esclusa"],
    info: ["Täältä lähdetään avaruuskävelylle. Avaruuspuvut odottavat seinällä.", "Spacewalks start here. The spacesuits wait on the wall.", "Los paseos espaciales empiezan aquí. Los trajes esperan en la pared."],
  },
  pma1: {
    name: ["PMA-1 · sovite", "PMA-1 · adapter", "PMA-1 · adaptador"],
    info: ["Kartio, joka yhdistää amerikkalaisen ja venäläisen puolen.", "A cone that joins the American and Russian sides.", "Un cono que une los lados estadounidense y ruso."],
  },
  zarya: {
    name: ["Zarja · varasto", "Zarya · storage", "Zariá · almacén"],
    info: ["Aseman ensimmäinen moduuli, laukaistiin 1998. Nyt täynnä varastolaukkuja. 12,6 m.", "The station's first module, launched in 1998. Now full of storage bags. 12.6 m.", "El primer módulo, lanzado en 1998. Ahora lleno de bolsas. 12,6 m."],
  },
  zvezda: {
    name: ["Zvezda · palvelumoduuli", "Zvezda · service module", "Zvezdá · módulo de servicio"],
    info: ["Keittiön pöytä, kaksi pientä hyttiä ja ikkunoita. Moottorit ovat sen perässä.", "The galley table, two small cabins and windows. The engines are at its back.", "La mesa de la cocina, dos camarotes pequeños y ventanas. Los motores están detrás."],
  },
};

export type TaskDef = { spot: string; anim: string; time: number; name: T3; fact: T3; npc?: boolean };
export const TASKS: { [id: string]: TaskDef } = {
  breakfast: {
    spot: "galley", anim: "Eat", time: 6,
    name: ["Syö aamiainen Zvezdan pöydässä", "Eat breakfast at Zvezda's table", "Desayuna en la mesa de Zvezdá"],
    fact: ["Ruoka on pusseissa. Juoma imetään pillillä, ettei pisaroita leiju ilmaan. Leivän sijaan syödään tortilloja, koska murut lentäisivät koneisiin.", "Food comes in pouches. Drinks are sipped through a straw so no drops float away. Tortillas are eaten instead of bread, because crumbs would fly into the machines.", "La comida viene en bolsas. Se bebe con pajita para que no floten gotas. Se comen tortillas en vez de pan, porque las migas volarían a las máquinas."],
  },
  run: {
    spot: "treadmill", anim: "Run", time: 8,
    name: ["Juokse juoksumatolla (Tranquility)", "Run on the treadmill (Tranquility)", "Corre en la cinta (Tranquility)"],
    fact: ["Painottomassa tilassa luut ja lihakset heikkenevät, siksi astronautit kuntoilevat kaksi tuntia päivässä. Kuminauhat pitävät juoksijan matossa.", "Without weight, bones and muscles get weaker, so astronauts exercise two hours a day. Bungee cords hold the runner on the belt.", "Sin peso, los huesos y músculos se debilitan, así que los astronautas hacen ejercicio dos horas al día. Unas gomas sujetan al corredor."],
  },
  squat: {
    spot: "ared", anim: "Lift", time: 8,
    name: ["Tee kyykkyjä kyykkylaitteella", "Do squats on the squat machine", "Haz sentadillas en la máquina"],
    fact: ["Laitteessa ei ole painoja: sen tyhjiösylinterit vastustavat liikettä kuin raskas punnus.", "The machine has no weights: its vacuum cylinders push back like a heavy barbell.", "La máquina no tiene pesas: sus cilindros de vacío empujan como una barra pesada."],
  },
  plants: {
    spot: "plants", anim: "Work", time: 6,
    name: ["Kastele salaatit (Columbus)", "Water the lettuce (Columbus)", "Riega las lechugas (Columbus)"],
    fact: ["Kasvit kasvavat punaisen ja sinisen valon alla. Juuret eivät tiedä, mikä on alas, joten varret kasvavat valoa kohti.", "The plants grow under red and blue light. The roots cannot tell which way is down, so the stems grow towards the light.", "Las plantas crecen con luz roja y azul. Las raíces no saben dónde es abajo, así que los tallos crecen hacia la luz."],
  },
  cdra: {
    spot: "cdra", anim: "Work", time: 6,
    name: ["Vaihda hiilidioksidisuodatin (Destiny)", "Change the CO₂ filter (Destiny)", "Cambia el filtro de CO₂ (Destiny)"],
    fact: ["Uloshengitetty hiilidioksidi poistetaan ilmasta. Tuulettimet kierrättävät ilmaa koko ajan: ilman niitä hiilidioksidi jäisi pilveksi kasvojen eteen.", "The carbon dioxide we breathe out is taken out of the air. Fans keep the air moving: without them it would stay as a cloud in front of your face.", "El dióxido de carbono que exhalamos se quita del aire. Los ventiladores mueven el aire: sin ellos se quedaría como una nube delante de la cara."],
  },
  call: {
    spot: "earthcall", anim: "Work", time: 5,
    name: ["Lähetä viesti kotiin Maahan (Destiny)", "Send a message home to Earth (Destiny)", "Envía un mensaje a la Tierra (Destiny)"],
    fact: ["", "", ""],
  },
  crystals: {
    spot: "crystals", anim: "Work", time: 6,
    name: ["Tutki kristalleja (Kibo)", "Study crystals (Kibo)", "Estudia cristales (Kibo)"],
    fact: ["Painottomuudessa kristallit kasvavat isommiksi ja tasaisemmiksi kuin Maassa. Niiden avulla etsitään uusia lääkkeitä.", "Without weight, crystals grow bigger and more even than on Earth. They help to find new medicines.", "Sin peso, los cristales crecen más grandes y regulares que en la Tierra. Ayudan a buscar nuevas medicinas."],
  },
  glovebox: {
    spot: "glovebox", anim: "Work", time: 6,
    name: ["Tee koe hansikaslaatikossa (Destiny)", "Do an experiment in the glovebox (Destiny)", "Haz un experimento en la caja de guantes (Destiny)"],
    fact: ["Hansikaslaatikko pitää aineet suljettuina, ettei mitään pääse leijumaan ilmaan.", "The glovebox keeps things sealed in, so nothing can float out into the air.", "La caja de guantes lo mantiene todo cerrado para que nada flote en el aire."],
  },
  water: {
    spot: "water", anim: "Work", time: 6,
    name: ["Tarkista vedenkierrätys (Tranquility)", "Check the water recycler (Tranquility)", "Revisa el reciclador de agua (Tranquility)"],
    fact: ["Kone tekee virtsasta ja hiestä puhdasta juomavettä. Lähes kaikki vesi käytetään uudelleen: matkalla Marsiin lisää ei voi tilata.", "The machine turns urine and sweat into clean drinking water. Almost all water is used again: on the way to Mars you cannot order more.", "La máquina convierte orina y sudor en agua potable. Casi toda el agua se reutiliza: camino a Marte no se puede pedir más."],
  },
  suits: {
    spot: "suits", anim: "Work", time: 6,
    name: ["Tarkista avaruuspuku (Quest)", "Check a spacesuit (Quest)", "Revisa un traje espacial (Quest)"],
    fact: ["Avaruuspuku on kuin pieni avaruusalus: siinä on happi, lämmitys ja jäähdytys. Maassa se painaa yli 120 kg.", "A spacesuit is like a small spaceship: it has oxygen, heating and cooling. On Earth it weighs over 120 kg.", "Un traje espacial es como una nave pequeña: tiene oxígeno, calefacción y refrigeración. En la Tierra pesa más de 120 kg."],
  },
  cupola: {
    spot: "cupola", anim: "Look", time: 7,
    name: ["Katso Marsia Cupolasta", "Look at Mars from the Cupola", "Mira Marte desde la Cúpula"],
    fact: ["", "", ""],
  },
  earth: {
    spot: "cupola", anim: "Look", time: 7,
    name: ["Katso Maata Cupolasta", "Look at Earth from the Cupola", "Mira la Tierra desde la Cúpula"],
    fact: ["Kiertoradalla 400 km korkeudessa Maa kiertyy alta 90 minuutissa. Ensi kerralla Maa näkyy enää kirkkaana tähtenä.", "In orbit 400 km up, the Earth turns below you every 90 minutes. Next time it will be only a bright star.", "En órbita a 400 km, la Tierra gira debajo cada 90 minutos. La próxima vez solo será una estrella brillante."],
  },
  food: {
    spot: "food", anim: "Work", time: 5,
    name: ["Hae ruokaa varastosta (Leonardo)", "Fetch food from storage (Leonardo)", "Trae comida del almacén (Leonardo)"],
    fact: ["Ruokaa on mukana koko matkaksi: pakkauksineen noin 2 kg päivässä jokaiselle.", "There is food for the whole trip: with its packing about 2 kg a day for each person.", "Hay comida para todo el viaje: con su envase, unos 2 kg al día por persona."],
  },
  window: {
    spot: "destwindow", anim: "Look", time: 6,
    name: ["Kuvaa tähtiä Destinyn ikkunasta", "Photograph stars from Destiny's window", "Fotografía estrellas por la ventana de Destiny"],
    fact: ["Destinyn ikkuna on 51 cm leveä ja niin tarkka, että sen läpi voi kuvata kaukoputkella.", "Destiny's window is 51 cm wide and so clear that you can take telescope pictures through it.", "La ventana de Destiny mide 51 cm y es tan clara que se pueden hacer fotos con telescopio."],
  },
  zarya: {
    spot: "zaryabags", anim: "Work", time: 5,
    name: ["Laske varastolaukut (Zarja)", "Count the storage bags (Zarya)", "Cuenta las bolsas (Zariá)"],
    fact: ["Zarja oli aseman ensimmäinen osa vuonna 1998. Tavarat kiinnitetään tarranauhoilla ja kuminauhoilla, muuten ne leijuisivat pois.", "Zarya was the station's first part in 1998. Things are held with velcro and bungees, or they would float away.", "Zariá fue la primera parte de la estación en 1998. Las cosas se sujetan con velcro y gomas, o se irían flotando."],
  },
  radiation: {
    spot: "beam", anim: "Work", time: 5,
    name: ["Mittaa säteily (BEAM)", "Measure the radiation (BEAM)", "Mide la radiación (BEAM)"],
    fact: ["Matkalla Marsiin säteilyä tulee yhtä paljon kuin tuhansista röntgenkuvista. Siksi aluksessa on suojapaikka aurinkomyrskyjä varten.", "On the way to Mars you get as much radiation as from thousands of X-rays. That is why the ship has a shelter for solar storms.", "Camino a Marte recibes tanta radiación como de miles de radiografías. Por eso la nave tiene un refugio para tormentas solares."],
  },
  sleep: {
    spot: "sleep", anim: "Sleep", time: 4,
    name: ["Mene nukkumaan hyttiisi (Harmony)", "Go to sleep in your cabin (Harmony)", "Vete a dormir a tu camarote (Harmony)"],
    fact: ["Makuupussi on kiinni seinässä, ettei nukkuja leiju pois. Avaruudessa ei ole ylös eikä alas, joten seinäkin käy sängyksi.", "The sleeping bag is fixed to the wall so the sleeper does not float away. In space there is no up or down, so a wall works as a bed.", "El saco de dormir está sujeto a la pared para no flotar. En el espacio no hay arriba ni abajo, así que una pared sirve de cama."],
  },
  shelter: {
    spot: "shelter", anim: "Hold", time: 6,
    name: ["Suojaan Zvezdan perälle!", "Take shelter at the back of Zvezda!", "¡Refúgiate al fondo de Zvezdá!"],
    fact: ["Hyvä! Zvezdan paksut seinät ja vesisäiliöt suojaavat aurinkomyrskyn säteilyltä.", "Well done! Zvezda's thick walls and water tanks shield you from the storm's radiation.", "¡Bien! Las paredes gruesas y los tanques de agua de Zvezdá te protegen de la radiación."],
  },
  leak: {
    spot: "leak", anim: "Work", time: 5,
    name: ["Etsi ilmavuoto ja paikkaa se", "Find the air leak and patch it", "Encuentra la fuga de aire y tápala"],
    fact: ["Paikattu! Oikealla asemalla vuoto etsittiin kerran päästämällä teelehtiä leijumaan: ne ajautuivat kohti reikää.", "Patched! On the real station a leak was once found by letting tea leaves float: they drifted towards the hole.", "¡Tapada! En la estación real una vez se encontró una fuga soltando hojas de té: flotaron hacia el agujero."],
  },
};

// the days that are played: each one has these tasks (and maybe an event)
export const DAYS: { day: number; tasks: string[]; event?: string }[] = [
  { day: 1, tasks: ["breakfast", "earth", "suits"], event: "depart" },
  { day: 37, tasks: ["run", "plants", "call"] },
  { day: 74, tasks: ["squat", "cdra", "crystals"] },
  { day: 111, tasks: ["breakfast", "water", "cupola"], event: "storm" },
  { day: 148, tasks: ["run", "glovebox", "food"] },
  { day: 185, tasks: ["squat", "radiation", "window"], event: "leak" },
  { day: 222, tasks: ["breakfast", "zarya", "call"] },
  { day: 259, tasks: ["cupola"], event: "arrive" },
];

export const SAY: { [k: string]: T3 } = {
  title: ["Matka Marsiin", "Journey to Mars", "Viaje a Marte"],
  intro: ["Aluksesi on rakennettu kuin kansainvälinen avaruusasema ISS. Matka Marsiin kestää 259 päivää. Liiku painottomassa tilassa: työnnä itseäsi eteenpäin ja ota kaiteesta kiinni.",
    "Your ship is built like the International Space Station. The trip to Mars takes 259 days. Move without weight: push yourself forward and grab a handrail.",
    "Tu nave está construida como la Estación Espacial Internacional. El viaje a Marte dura 259 días. Muévete sin peso: empújate y agárrate a un pasamanos."],
  start: ["Lähde matkaan", "Start the journey", "Empezar el viaje"],
  cont: ["Jatka matkaa", "Continue", "Continuar"],
  restart: ["Aloita alusta", "Start over", "Empezar de nuevo"],
  push: ["TYÖNNÄ", "PUSH", "EMPUJA"],
  hold: ["PIDÄ KIINNI", "HOLD ON", "AGÁRRATE"],
  doit: ["Tee: ", "Do: ", "Haz: "],
  day: ["Päivä", "Day", "Día"],
  today: ["Päivän tehtävät", "Today's tasks", "Tareas de hoy"],
  done: ["Valmis!", "Done!", "¡Hecho!"],
  bump: ["Tömps!", "Bump!", "¡Pum!"],
  toEarth: ["Maahan", "to Earth", "a la Tierra"],
  toMars: ["Marsiin", "to Mars", "a Marte"],
  delay: ["viive", "delay", "retraso"],
  min: ["min", "min", "min"],
  mkm: ["milj. km", "million km", "millones de km"],
  kkm: ["tuhatta km", "thousand km", "mil km"],
  nightNext: ["Päivät kuluvat…", "Days go by…", "Pasan los días…"],
  mapTitle: ["Aluksen kartta", "Ship map", "Mapa de la nave"],
  close: ["Sulje", "Close", "Cerrar"],
  you: ["Sinä", "You", "Tú"],
  burnSoon: ["Moottorit käynnistyvät! Pidä kiinni kaiteesta!", "Engines starting! Hold on to a handrail!", "¡Se encienden los motores! ¡Agárrate a un pasamanos!"],
  burnNow: ["MOOTTORIT PÄÄLLÄ", "ENGINES ON", "MOTORES ENCENDIDOS"],
  burnDepart: ["Suunta Mars! Matka kestää 259 päivää. Kun moottori työntää alusta, irtonaiset tavarat valuvat perää kohti.", "Heading for Mars! The trip takes 259 days. When the engine pushes the ship, loose things drift to the back.", "¡Rumbo a Marte! El viaje dura 259 días. Cuando el motor empuja la nave, las cosas sueltas van hacia atrás."],
  burnArrive: ["Olemme Marsin kiertoradalla 400 km korkeudessa! Mene Cupolaan katsomaan.", "We are in orbit around Mars, 400 km up! Go to the Cupola and look.", "¡Estamos en órbita de Marte a 400 km! Ve a la Cúpula a mirar."],
  storm: ["Aurinkomyrsky! Säteilyä tulee. Mene suojaan Zvezdan perälle!", "A solar storm! Radiation is coming. Take shelter at the back of Zvezda!", "¡Tormenta solar! Llega radiación. ¡Refúgiate al fondo de Zvezdá!"],
  leak: ["Ilmanpaine laskee! Jossain on vuoto. Kuuntele suhinaa ja etsi se.", "The air pressure is falling! There is a leak somewhere. Listen to the hiss and find it.", "¡La presión baja! Hay una fuga. Escucha el silbido y encuéntrala."],
  pressure: ["Paine", "Pressure", "Presión"],
  radiation: ["Säteily", "Radiation", "Radiación"],
  end: ["Matka Marsiin onnistui! 259 päivää avaruudessa. Seuraavaksi: laskeutuminen pinnalle.", "The journey to Mars worked! 259 days in space. Next: landing on the surface.", "¡El viaje a Marte salió bien! 259 días en el espacio. Lo siguiente: aterrizar en la superficie."],
  view1: ["Silmät", "Eyes", "Ojos"],
  view3: ["Takaa", "Behind", "Detrás"],
  goSleep: ["Kaikki tehty! Mene nukkumaan hyttiisi Harmonyyn.", "All done! Go to sleep in your cabin in Harmony.", "¡Todo hecho! Ve a dormir a tu camarote en Harmony."],
  crew: ["Kaisa (komentaja)", "Kaisa (commander)", "Kaisa (comandante)"],
};

// what the crew say when tapped
export const CREW_SAYS: T3[] = [
  ["Avaruudessa pituus kasvaa pari senttiä, kun selkäranka ei painu kasaan.", "In space you grow a couple of centimetres taller, as your spine is not pressed together.", "En el espacio creces un par de centímetros, porque la columna no se comprime."],
  ["Kyyneleet eivät valu avaruudessa: ne jäävät palloksi silmän päälle.", "Tears do not run in space: they stay as a ball on your eye.", "Las lágrimas no caen en el espacio: se quedan como una bola en el ojo."],
  ["Liekki on avaruudessa pallon muotoinen ja sininen.", "In space a flame is round and blue.", "En el espacio una llama es redonda y azul."],
  ["Muista pitää kiinni! Jos jäät keskelle huonetta liikkumatta, et pääse mihinkään.", "Remember to hold on! If you stop in the middle of a room, you cannot get anywhere.", "¡Recuerda agarrarte! Si te quedas quieto en medio de una sala, no puedes ir a ningún sitio."],
  ["Nenä menee tukkoon, koska nesteet nousevat päähän. Ruoka maistuu siksi vähemmän.", "Your nose gets stuffy because fluids rise to your head. That is why food tastes of less.", "La nariz se tapa porque los líquidos suben a la cabeza. Por eso la comida sabe menos."],
  ["Marsissa painat vain kolmasosan siitä mitä Maassa.", "On Mars you weigh only a third of what you weigh on Earth.", "En Marte pesas solo un tercio de lo que pesas en la Tierra."],
];
export const CREW_NAMES: T3[] = [
  ["Kaisa, komentaja", "Kaisa, commander", "Kaisa, comandante"],
  ["Juri, insinööri", "Yuri, engineer", "Yuri, ingeniero"],
  ["Maya, lääkäri", "Maya, doctor", "Maya, médica"],
];
