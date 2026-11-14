// node --experimental-strip-types tools/rakennus/gen-voice.ts
// Writes the speech of the Rakennuspelit games (ruuvit, vasara, jakoavain,
// mittaus, sahat, pora, tyomaa): the rk_ clips and the games' names into
// voice/fi.json, and voice/en/rakennus.json, voice/es/rakennus.json.
// Numbers, praise and "kokeile toista" are the shared clips (n1…, hyva, …).
import * as fs from "node:fs";

type T = [string, string, string];   // fi, en, es
const TEXT: Record<string, T> = {
  peli_ruuvit: ["Ruuvit", "Screws", "Tornillos"],
  peli_vasara: ["Vasara", "Hammer", "Martillo"],
  peli_jakoavain: ["Jakoavain", "Wrench", "Llave inglesa"],
  peli_mittaus: ["Mittaus", "Measuring", "Medir"],
  peli_sahat: ["Sahat", "Saws", "Sierras"],
  peli_pora: ["Porakone", "Drill", "Taladro"],
  peli_tyomaa: ["Työmaa", "Building site", "La obra"],

  // shared: turning directions
  rk_toiseen_suuntaan: ["Toiseen suuntaan!", "The other way!", "¡Hacia el otro lado!"],
  rk_vihje_myota: ["Myötäpäivään on sama suunta, johon kellon viisarit kulkevat. Silloin ruuvi ja mutteri menevät kiinni.", "Clockwise is the way the hands of a clock go. That way screws and nuts get tight.", "En el sentido del reloj, como sus agujas. Así se aprietan tornillos y tuercas."],
  rk_vihje_vasta: ["Vastapäivään on kellon viisareita vastaan. Silloin ruuvi ja mutteri aukeavat.", "Anticlockwise is against the clock's hands. That way screws and nuts come loose.", "Al revés que las agujas del reloj. Así se aflojan tornillos y tuercas."],

  // Ruuvit
  rk_r_kierra: ["Kierrä ruuvi kiinni. Pyöritä sormella myötäpäivään.", "Screw it in. Turn your finger round clockwise.", "Atornilla. Gira el dedo en el sentido del reloj."],
  rk_r_avaa: ["Avaa ruuvi. Pyöritä vastapäivään.", "Unscrew it. Turn anticlockwise.", "Desatornilla. Gira al revés que el reloj."],
  rk_r_valitse: ["Valitse meisseli, jonka kärki sopii ruuviin.", "Pick the screwdriver whose tip fits the screw.", "Elige el destornillador cuya punta encaja en el tornillo."],
  rk_r_sopii: ["Sopii!", "It fits!", "¡Encaja!"],
  rk_r_ei_sovi: ["Ei sovi. Katso ruuvin kantaa.", "It doesn't fit. Look at the screw head.", "No encaja. Mira la cabeza del tornillo."],
  rk_r_vihje_ura: ["Ruuvin kannassa on suora viiva. Etsi meisseli, jonka kärki on suora.", "The screw head has a straight line. Find the flat screwdriver.", "La cabeza tiene una raya recta. Busca el destornillador plano."],
  rk_r_vihje_risti: ["Ruuvin kannassa on risti. Etsi ristipäämeisseli.", "The screw head has a cross. Find the cross screwdriver.", "La cabeza tiene una cruz. Busca el destornillador de estrella."],
  rk_r_vihje_torx: ["Ruuvin kannassa on tähti. Etsi tähtikärki.", "The screw head has a star. Find the star tip.", "La cabeza tiene una estrella. Busca la punta de estrella."],
  rk_r_vihje_kolo: ["Ruuvin kannassa on kuusikulmainen kolo. Etsi kuusiokolokärki.", "The screw head has a hexagon hole. Find the hexagon tip.", "La cabeza tiene un hueco de seis lados. Busca la punta hexagonal."],
  rk_r_pidike: ["Ruuvi heiluu. Laita pidike ruuvin ympärille.", "The screw wobbles. Put the holder round it.", "El tornillo se tambalea. Pon el soporte alrededor."],
  rk_r_vihje_pidike: ["Vedä oranssi pidike ruuvin luo. Pidike pitää ruuvin suorassa.", "Drag the orange holder to the screw. It keeps the screw straight.", "Lleva el soporte naranja al tornillo. Lo mantiene recto."],
  rk_r_pysyy: ["Nyt ruuvi pysyy suorassa.", "Now the screw stays straight.", "Ahora el tornillo está recto."],
  rk_r_kaatui: ["Hups, ruuvi kaatui.", "Oops, the screw fell over.", "¡Uy, el tornillo se cayó!"],
  rk_r_vie_reikaan: ["Vie ruuvi reikään.", "Put the screw in the hole.", "Pon el tornillo en el agujero."],
  rk_r_kiinni: ["Ruuvi on kiinni!", "The screw is in!", "¡El tornillo está puesto!"],
  rk_r_auki: ["Ruuvi on auki!", "The screw is out!", "¡El tornillo está fuera!"],

  // Vasara
  rk_v_naulaa: ["Lyö naulat puuhun. Napauta naulaa.", "Hammer the nails in. Tap a nail.", "Clava los clavos. Toca un clavo."],
  rk_v_vihje_naulaa: ["Napauta naulan kantaa, niin vasara lyö sitä.", "Tap the nail head and the hammer hits it.", "Toca la cabeza del clavo y el martillo la golpea."],
  rk_v_osu: ["Napauta, kun vasara on naulan päällä.", "Tap when the hammer is over the nail.", "Toca cuando el martillo esté sobre el clavo."],
  rk_v_vino: ["Hups, naula meni vinoon. Napauta sitä, niin pihdit oikaisevat sen.", "Oops, the nail bent. Tap it and the pliers straighten it.", "¡Uy, el clavo se torció! Tócalo y los alicates lo enderezan."],
  rk_v_vihje_osu: ["Odota, että vasara on juuri naulan päällä. Lyö suoraan naulan kantaan.", "Wait until the hammer is right over the nail. Hit the head straight.", "Espera a que el martillo esté justo encima. Golpea recto."],
  rk_v_pihdit: ["Pidä naulaa pihdeillä. Vie pihdit naulan luo.", "Hold the nail with the pliers. Bring the pliers to the nail.", "Sujeta el clavo con los alicates. Llévalos al clavo."],
  rk_v_kaatui: ["Naula kaatui. Pidä sitä ensin pihdeillä, niin sormet pysyvät turvassa.", "The nail fell over. Hold it with pliers first, so your fingers stay safe.", "El clavo se cayó. Sujétalo con alicates, así los dedos están seguros."],
  rk_v_pysyy: ["Nyt naula pysyy itse. Jatka!", "Now the nail stands by itself. Keep going!", "Ahora el clavo se sostiene solo. ¡Sigue!"],
  rk_v_vie_naula: ["Vie naula punaisen merkin kohdalle.", "Put the nail on the red mark.", "Pon el clavo en la marca roja."],
  rk_v_ponto: ["Rakennetaan linnunpönttö! Lyö naulat puuhun.", "Let's build a birdhouse! Hammer the nails in.", "¡Construyamos una pajarera! Clava los clavos."],
  rk_v_valmis: ["Linnunpönttö on valmis!", "The birdhouse is ready!", "¡La pajarera está lista!"],

  // Jakoavain
  rk_j_saada: ["Säädä jakoavain mutterin kokoiseksi. Vedä rullaa.", "Make the wrench fit the nut. Drag the wheel.", "Ajusta la llave a la tuerca. Arrastra la rueda."],
  rk_j_vihje_saada: ["Leukojen pitää koskea mutterin molempiin reunoihin, ei rakoa eikä liian tiukka.", "The jaws must touch both sides of the nut, no gap and not too tight.", "Las mordazas deben tocar ambos lados de la tuerca, sin hueco."],
  rk_j_liian_iso: ["Liian iso, avain lipsuu.", "Too big, the wrench slips.", "Demasiado grande, la llave resbala."],
  rk_j_liian_pieni: ["Liian pieni, avain ei mene mutteriin.", "Too small, it doesn't go on the nut.", "Demasiado pequeña, no entra en la tuerca."],
  rk_j_sopii: ["Sopii!", "It fits!", "¡Encaja!"],
  rk_j_valitse: ["Mikä avain sopii mutteriin?", "Which wrench fits the nut?", "¿Qué llave encaja en la tuerca?"],
  rk_j_vihje_valitse: ["Katso avaimen suuta. Sen pitää olla yhtä leveä kuin mutteri.", "Look at the wrench's mouth. It must be as wide as the nut.", "Mira la boca de la llave. Debe ser tan ancha como la tuerca."],
  rk_j_kirista: ["Kiristä mutteri. Vedä vartta myötäpäivään.", "Tighten the nut. Pull the handle clockwise.", "Aprieta la tuerca. Gira el mango como el reloj."],
  rk_j_avaa: ["Avaa mutteri. Vedä vartta vastapäivään.", "Loosen the nut. Pull the handle anticlockwise.", "Afloja la tuerca. Gira el mango al revés."],
  rk_j_kiinni: ["Mutteri on tiukalla!", "The nut is tight!", "¡La tuerca está apretada!"],
  rk_j_auki: ["Mutteri on auki!", "The nut is loose!", "¡La tuerca está floja!"],

  // Mittaus
  rk_m_pidempi: ["Kumpi lauta on pidempi?", "Which board is longer?", "¿Qué tabla es más larga?"],
  rk_m_pisin: ["Mikä lauta on pisin?", "Which board is the longest?", "¿Qué tabla es la más larga?"],
  rk_m_vihje_pidempi: ["Laitetaan laudat samasta päästä viivalle. Katso, mikä jatkuu pisimmälle.", "Let's line the boards up at one end. See which goes furthest.", "Ponemos las tablas en la misma línea. Mira cuál llega más lejos."],
  rk_m_palikat: ["Montako palikkaa pitkä lauta on?", "How many blocks long is the board?", "¿Cuántos bloques mide la tabla?"],
  rk_m_vihje_palikat: ["Lasketaan palikat yhdessä.", "Let's count the blocks together.", "Contemos los bloques juntos."],
  rk_m_merkitse: ["Vedä kynä kohtaan", "Drag the pencil to", "Lleva el lápiz al"],
  rk_m_vihje_merkitse: ["Etsi viivoittimesta numero", "Find on the ruler the number", "Busca en la regla el número"],
  rk_m_pidemmalle: ["Vähän pidemmälle.", "A bit further.", "Un poco más allá."],
  rk_m_takaisin: ["Vähän takaisin.", "A bit back.", "Un poco atrás."],

  // Sahat
  rk_s_sahaa: ["Sahaa lauta poikki. Vedä sahaa edestakaisin.", "Saw the board through. Drag the saw back and forth.", "Sierra la tabla. Mueve la sierra adelante y atrás."],
  rk_s_sahaa_nyt: ["Sahaa poikki. Vedä edestakaisin.", "Saw it through. Back and forth.", "Córtalo. Adelante y atrás."],
  rk_s_vihje_sahaa: ["Pitkiä, rauhallisia vetoja edestakaisin, niin saha uppoaa puuhun.", "Long, calm strokes back and forth, and the saw goes in.", "Movimientos largos y tranquilos, y la sierra entra."],
  rk_s_poikki: ["Poikki meni!", "Cut through!", "¡Cortado!"],
  rk_s_valitse: ["Millä sahalla tämä sahataan?", "Which saw cuts this?", "¿Con qué sierra se corta esto?"],
  rk_s_sopii: ["Oikea saha!", "The right saw!", "¡La sierra correcta!"],
  rk_s_ei_sovi: ["Tällä sahalla se ei onnistu.", "That saw won't do it.", "Con esta sierra no se puede."],
  rk_s_vihje_puu: ["Puulauta sahataan käsisahalla. Siinä on isot hampaat ja puinen kahva.", "A board is cut with a hand saw. It has big teeth and a wooden handle.", "Una tabla se corta con el serrucho. Tiene dientes grandes."],
  rk_s_vihje_metalli: ["Metalliputki sahataan rautasahalla. Sen terässä on pienet hampaat.", "A metal pipe is cut with a hacksaw. Its blade has small teeth.", "Un tubo de metal se corta con la sierra de arco. Tiene dientes pequeños."],
  rk_s_vihje_oksa: ["Oksa sahataan pokasahalla. Se on kaaren muotoinen.", "A branch is cut with a bow saw. It is shaped like a bow.", "Una rama se corta con el serrucho de arco, con forma de arco."],
  rk_s_vihje_kuvio: ["Ohut levy ja kaarevat kuviot sahataan lehtisahalla. Sen terä on ohut.", "Thin boards and curves are cut with a fret saw. Its blade is thin.", "Las tablas finas y las curvas se cortan con la segueta."],
  rk_s_suojaimet: ["Sirkkeliä käyttää aikuinen. Valitse, mitä hän tarvitsee.", "A grown-up uses the circular saw. Pick what they need.", "La sierra circular la usa un adulto. Elige lo que necesita."],
  rk_s_g_lasit: ["Suojalasit suojaavat silmiä.", "Goggles protect the eyes.", "Las gafas protegen los ojos."],
  rk_s_g_korvat: ["Kuulosuojaimet suojaavat korvia.", "Ear defenders protect the ears.", "Los protectores protegen los oídos."],
  rk_s_g_kapula: ["Työntökapulalla kädet pysyvät kaukana terästä.", "With the push stick, hands stay far from the blade.", "Con el empujador, las manos quedan lejos de la hoja."],
  rk_s_ei_tarvita: ["Tätä ei tarvita sirkkelin kanssa.", "That's not needed with the saw.", "Eso no hace falta con la sierra."],
  rk_s_huivi: ["Huivi voi tarttua terään. Se otetaan pois.", "A scarf can get caught in the blade. Take it off.", "Una bufanda puede engancharse. Se quita."],
  rk_s_vihje_suojaimet: ["Suojalasit silmille, kuulosuojaimet korville ja työntökapula, niin kädet pysyvät kaukana terästä.", "Goggles for the eyes, ear defenders for the ears, and a push stick to keep hands away from the blade.", "Gafas para los ojos, protectores para los oídos y un empujador para las manos."],
  rk_s_kaynnista: ["Nyt sirkkelin voi käynnistää. Paina vihreää nappia.", "Now the saw can be started. Press the green button.", "Ahora se puede arrancar. Pulsa el botón verde."],
  rk_s_tyonna: ["Työnnä lautaa työntökapulalla.", "Push the board with the push stick.", "Empuja la tabla con el empujador."],
  rk_s_sammuta: ["Lauta on sahattu. Paina punaista nappia.", "The board is cut. Press the red button.", "La tabla está cortada. Pulsa el botón rojo."],
  rk_s_odota: ["Odota, että terä pysähtyy kokonaan.", "Wait until the blade stops completely.", "Espera a que la hoja pare del todo."],
  rk_s_vihje_odota: ["Terä pyörii vielä hetken sammuttamisen jälkeen. Palaa ei oteta ennen kuin terä on pysähtynyt.", "The blade keeps turning for a while after stopping. Don't take the piece until it has stopped.", "La hoja sigue girando un rato. No cojas la pieza hasta que pare."],
  rk_s_ota: ["Nyt terä on pysähtynyt. Ota pala.", "Now the blade has stopped. Take the piece.", "La hoja ha parado. Coge la pieza."],
  rk_s_valmis: ["Hienoa, turvallisesti tehty!", "Great, done safely!", "¡Genial, hecho con seguridad!"],

  // Porakone
  rk_p_valitse: ["Valitse terä, joka on yhtä paksu kuin tulppa.", "Pick the bit as thick as the wall plug.", "Elige la broca tan gruesa como el taco."],
  rk_p_liian_ohut: ["Tämä terä on liian ohut.", "This bit is too thin.", "Esta broca es demasiado fina."],
  rk_p_liian_paksu: ["Tämä terä on liian paksu.", "This bit is too thick.", "Esta broca es demasiado gruesa."],
  rk_p_vihje_valitse: ["Katso vihreitä viivoja. Oikea terä mahtuu juuri niiden väliin.", "Look at the green lines. The right bit just fits between them.", "Mira las líneas verdes. La broca correcta cabe justo entre ellas."],
  rk_p_sopii: ["Oikea terä!", "The right bit!", "¡La broca correcta!"],
  rk_p_kiinnita: ["Vie terä porakoneen istukkaan.", "Put the bit in the drill's chuck.", "Pon la broca en el portabrocas."],
  rk_p_kirista: ["Kiristä istukka. Pyöritä myötäpäivään.", "Tighten the chuck. Turn clockwise.", "Aprieta el portabrocas. Gira como el reloj."],
  rk_p_heiluu: ["Terä heiluu. Kiristä istukka ensin.", "The bit wobbles. Tighten the chuck first.", "La broca se mueve. Aprieta primero el portabrocas."],
  rk_p_kiinni: ["Terä on tiukasti kiinni!", "The bit is in tight!", "¡La broca está bien sujeta!"],
  rk_p_poraa: ["Pidä nappia pohjassa ja poraa. Päästä irti, kun teippi koskee puuhun.", "Hold the button to drill. Let go when the tape touches the wood.", "Mantén el botón para taladrar. Suelta cuando la cinta toque la madera."],
  rk_p_syvemmalle: ["Vähän syvemmälle.", "A bit deeper.", "Un poco más hondo."],
  rk_p_liian_syva: ["Liian syvä. Päästä irti, kun teippi koskee puuhun.", "Too deep. Let go when the tape touches the wood.", "Demasiado hondo. Suelta cuando la cinta toque la madera."],
  rk_p_vihje_poraa: ["Katso punaista teippiä. Kun se koskee puuta, päästä napista irti.", "Watch the red tape. When it touches the wood, let go.", "Mira la cinta roja. Cuando toque la madera, suelta."],
  rk_p_reika: ["Hyvä reikä!", "A good hole!", "¡Buen agujero!"],

  // Työmaa
  rk_t_lapio: ["Lapioi hiekkaa kottikärryihin.", "Shovel sand into the wheelbarrow.", "Echa arena en la carretilla."],
  rk_t_lapio_n: ["Laita kärryihin", "Put in the wheelbarrow", "Echa en la carretilla"],
  rk_t_lapiollinen: ["lapiollinen.", "shovelful.", "palada."],
  rk_t_lapiollista: ["lapiollista.", "shovelfuls.", "paladas."],
  rk_t_viela: ["Vielä lisää.", "Some more.", "Un poco más."],
  rk_t_liikaa: ["Nyt tuli liikaa. Otetaan yksi pois.", "That's too many. Let's take one out.", "Son demasiadas. Quitamos una."],
  rk_t_vihje_lapio: ["Katso pallot ylhäällä. Niitä on", "Look at the circles at the top. There are", "Mira los círculos de arriba. Hay"],
  rk_t_valmis: ["Kärryt on täynnä!", "The wheelbarrow is full!", "¡La carretilla está llena!"],
  rk_t_mylly: ["Tehdään betonia. Vie myllyyn sementtiä, hiekkaa ja vettä niin monta kuin pallot näyttävät.", "Let's make concrete. Put cement, sand and water in the mixer, as many as the dots show.", "Hagamos hormigón. Echa cemento, arena y agua, tantos como los puntos."],
  rk_t_vihje_mylly: ["Katso palloja. Jokaista tulee niin monta kuin palloja on.", "Look at the dots. Each one needs as many as its dots.", "Mira los puntos. De cada uno, tantos como puntos."],
  rk_t_riittaa: ["Tätä on jo tarpeeksi.", "There's enough of that.", "De eso ya hay bastante."],
  rk_t_kaynnista: ["Käynnistä mylly.", "Start the mixer.", "Arranca la hormigonera."],
  rk_t_kaada: ["Betoni on valmista. Kaada se muottiin.", "The concrete is ready. Pour it into the mould.", "El hormigón está listo. Viértelo en el molde."],
  rk_t_betoni_valmis: ["Muotti on täynnä betonia!", "The mould is full of concrete!", "¡El molde está lleno!"],
  rk_t_kaivuri: ["Täytä auto hiekalla. Napauta hiekkakasaa ja sitten autoa.", "Fill the truck with sand. Tap the sand pile, then the truck.", "Llena el camión. Toca la arena y luego el camión."],
  rk_t_vipu: ["Täytä auto hiekalla. Liikuta kaivurin vipua.", "Fill the truck with sand. Move the digger's lever.", "Llena el camión. Mueve la palanca de la excavadora."],
  rk_t_kauha: ["Liikuta vipua ja käytä kauhaa. Sulje kauha hiekassa ja avaa se auton päällä.", "Move the lever and use the bucket. Close it in the sand, open it over the truck.", "Mueve la palanca y usa la pala. Ciérrala en la arena y ábrela sobre el camión."],
  rk_t_vihje_kaivuri: ["Ensin kauha hiekkakasalle, sitten auton päälle.", "First the bucket to the sand pile, then over the truck.", "Primero la pala a la arena, luego sobre el camión."],
  rk_t_kauha_taynna: ["Kauha on täynnä.", "The bucket is full.", "La pala está llena."],
  rk_t_tyhja: ["Kauha on tyhjä. Hae ensin hiekkaa.", "The bucket is empty. Get sand first.", "La pala está vacía. Coge arena primero."],
  rk_t_vie_autoon: ["Vie hiekka autoon.", "Take the sand to the truck.", "Lleva la arena al camión."],
  rk_t_valui: ["Hups, hiekka valui maahan.", "Oops, the sand spilled.", "¡Uy, la arena se cayó!"],
  rk_t_auto_taynna: ["Auto on täynnä hiekkaa!", "The truck is full of sand!", "¡El camión está lleno de arena!"],
};

function clips(i: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(TEXT)) out[k] = TEXT[k][i];
  return out;
}

const GAMES = ["ruuvit", "vasara", "jakoavain", "mittaus", "sahat", "pora", "tyomaa"];
const fiPath = "voice/fi.json";
const fi = JSON.parse(fs.readFileSync(fiPath, "utf8"));
for (const k of Object.keys(fi.clips)) if (k.startsWith("rk_") || GAMES.some((g) => k === "peli_" + g)) delete fi.clips[k];
Object.assign(fi.clips, clips(0));
fs.writeFileSync(fiPath, JSON.stringify(fi, null, 1) + "\n");
["en", "es"].forEach((lang, j) => {
  const doc = { _comment: "Rakennuspelit (games/ruuvit, vasara, jakoavain, mittaus, sahat, pora, tyomaa): generated by tools/rakennus/gen-voice.ts, same ids as voice/fi.json.", lang, clips: clips(j + 1) };
  fs.writeFileSync("voice/" + lang + "/rakennus.json", JSON.stringify(doc, null, 1) + "\n");
});
console.log("rk clips:", Object.keys(TEXT).length, "per language");
