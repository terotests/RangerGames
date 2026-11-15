// node --experimental-strip-types tools/tietokoneet/gen-voice.ts
// Writes the speech of the Tietokoneet games (robotti, tietokone,
// robottitehdas): the tk_ clips and the games' names into voice/fi.json, and
// voice/en/tietokoneet.json, voice/es/tietokoneet.json. Numbers, praise and
// "kokeile toista" are the shared clips (n1…, hyva, …).
import * as fs from "node:fs";

type T = [string, string, string];   // fi, en, es
const TEXT: Record<string, T> = {
  peli_robotti: ["Robotti", "Robot", "Robot"],
  peli_tietokone: ["Tietokone", "Computer", "Ordenador"],
  peli_robottitehdas: ["Robottitehdas", "Robot factory", "Fábrica de robots"],

  tk_ylos: ["Ylös.", "Up.", "Arriba."],
  tk_oikealle: ["Oikealle.", "Right.", "Derecha."],
  tk_alas: ["Alas.", "Down.", "Abajo."],
  tk_vasemmalle: ["Vasemmalle.", "Left.", "Izquierda."],

  // Robotti
  tk_r_askeleet: ["Robotin akku on tyhjä. Tee sille ohjelma: paina nuolia, ja käynnistä vihreästä napista.", "The robot's battery is empty. Make it a program: press the arrows, then start with the green button.", "La batería del robot está vacía. Hazle un programa: pulsa las flechas y empieza con el botón verde."],
  tk_r_toista: ["Robotilla on vain vähän paikkoja ohjelmalle. Tee kuvio kerran ja valitse, montako kertaa se toistetaan.", "The robot has only a few places for its program. Make the pattern once and choose how many times it repeats.", "El robot tiene pocos huecos para su programa. Haz el patrón una vez y elige cuántas veces se repite."],
  tk_r_jos: ["Robotti kävelee itse. Kun se astuu värilliselle ruudulle, se kääntyy. Valitse jokaiselle värille nuoli.", "The robot walks by itself. When it steps on a coloured square, it turns. Choose an arrow for each colour.", "El robot camina solo. Cuando pisa una casilla de color, gira. Elige una flecha para cada color."],
  tk_r_tormasi: ["Hups, robotti törmäsi! Punainen nuoli on bugi eli virhe. Korjaa se.", "Oops, the robot crashed! The red arrow is a bug, a mistake. Fix it.", "¡Uy, el robot chocó! La flecha roja es un error. Arréglalo."],
  tk_r_tormasi_jos: ["Hups, robotti törmäsi! Tarkista värien nuolet.", "Oops, the robot crashed! Check the arrows of the colours.", "¡Uy, el robot chocó! Revisa las flechas de los colores."],
  tk_r_ei_perille: ["Ohjelma loppui, mutta akku jäi kauas. Lisää askeleita.", "The program ended, but the battery is still far away. Add more steps.", "El programa terminó, pero la batería sigue lejos. Añade pasos."],
  tk_r_ikuinen: ["Robotti kulkee ympyrää eikä pääse perille.", "The robot goes round and round and never gets there.", "El robot da vueltas y no llega."],
  tk_r_perilla: ["Robotti sai virtaa!", "The robot got power!", "¡El robot tiene energía!"],
  tk_r_taynna: ["Ohjelma on täynnä.", "The program is full.", "El programa está lleno."],
  tk_r_vihje_askeleet: ["Seuraa keltaisia pisteitä. Ensimmäinen nuoli on", "Follow the yellow dots. The first arrow is", "Sigue los puntos amarillos. La primera flecha es"],
  tk_r_vihje_toista: ["Katso violetteja pisteitä. Se on kuvio, joka toistuu. Tee se kerran, ja laske, montako kertaa se mahtuu matkalle.", "Look at the purple dots. That is the pattern that repeats. Make it once and count how many times it fits on the way.", "Mira los puntos morados. Es el patrón que se repite. Hazlo una vez y cuenta cuántas veces cabe en el camino."],
  tk_r_vihje_jos: ["Valkoinen nuoli näyttää, mihin polku jatkuu värillisen ruudun jälkeen.", "The white arrow shows where the path goes after the coloured square.", "La flecha blanca muestra adónde sigue el camino después de la casilla de color."],

  // Tietokone
  tk_t_mika: ["Mikä osa tekee tämän?", "Which part does this?", "¿Qué pieza hace esto?"],
  tk_t_rakenna: ["Rakenna puhelin. Vedä osat varjojen päälle.", "Build a phone. Drag the parts onto their shadows.", "Arma un móvil. Arrastra las piezas a sus sombras."],
  tk_t_missa: ["Pyöriikö se puhelimessa vai pilvessä?", "Does it run in the phone or in the cloud?", "¿Funciona en el móvil o en la nube?"],
  tk_t_tama_on: ["Tämä on", "This is the", "Esto es"],
  tk_t_ei_mahdu: ["Se ei kuulu tähän.", "It doesn't go here.", "No va aquí."],
  tk_t_vihje_varjo: ["Katso varjon muotoa. Jokaisella osalla on oma paikkansa.", "Look at the shape of the shadow. Every part has its own place.", "Mira la forma de la sombra. Cada pieza tiene su sitio."],
  tk_t_puhelin_valmis: ["Puhelin on valmis, ja se käynnistyy!", "The phone is ready, and it turns on!", "¡El móvil está listo y se enciende!"],
  tk_t_ei_ihan: ["Ei ihan.", "Not quite.", "No exactamente."],
  tk_t_vihje_p: ["Tähän ei tarvita nettiä. Puhelin osaa sen itse.", "This doesn't need the internet. The phone can do it by itself.", "Esto no necesita internet. El móvil lo hace solo."],
  tk_t_vihje_c: ["Tähän tarvitaan tietoa koko maailmasta tai tosi iso tietokone. Ne ovat pilvessä.", "This needs information from all over the world or a really big computer. Those are in the cloud.", "Esto necesita información de todo el mundo o un ordenador enorme. Están en la nube."],

  tk_t_n_cpu: ["suoritin, laitteen aivot.", "processor, the brain of the device.", "procesador, el cerebro del aparato."],
  tk_t_n_ram: ["työmuisti.", "memory.", "memoria."],
  tk_t_n_ssd: ["tallennustila.", "storage.", "almacenamiento."],
  tk_t_n_akku: ["akku.", "battery.", "batería."],
  tk_t_n_naytto: ["näyttö.", "screen.", "pantalla."],
  tk_t_n_kaiutin: ["kaiutin.", "speaker.", "altavoz."],
  tk_t_n_mikki: ["mikrofoni.", "microphone.", "micrófono."],
  tk_t_n_kamera: ["kamera.", "camera.", "cámara."],
  tk_t_n_antenni: ["antenni.", "antenna.", "antena."],

  tk_t_job_cpu: ["Mikä osa laskee ja päättää, mitä tehdään? Se on laitteen aivot.", "Which part counts and decides what to do? It is the brain of the device.", "¿Qué pieza calcula y decide qué hacer? Es el cerebro del aparato."],
  tk_t_job_ram: ["Mikä osa muistaa sen, mitä teet juuri nyt? Kun virta katkeaa, se unohtaa kaiken.", "Which part remembers what you are doing right now? When the power goes off, it forgets everything.", "¿Qué pieza recuerda lo que haces ahora mismo? Si se apaga, lo olvida todo."],
  tk_t_job_ssd: ["Mikä osa säilyttää kuvat ja pelit, vaikka virta on pois?", "Which part keeps your photos and games, even when the power is off?", "¿Qué pieza guarda tus fotos y juegos aunque esté apagado?"],
  tk_t_job_akku: ["Mikä osa antaa virtaa?", "Which part gives the power?", "¿Qué pieza da la energía?"],
  tk_t_job_naytto: ["Mikä osa näyttää kuvat ja pelit?", "Which part shows pictures and games?", "¿Qué pieza muestra las imágenes y los juegos?"],
  tk_t_job_kaiutin: ["Mikä osa soittaa musiikkia?", "Which part plays music?", "¿Qué pieza pone la música?"],
  tk_t_job_mikki: ["Mikä osa kuulee, kun puhut?", "Which part hears you when you talk?", "¿Qué pieza te oye cuando hablas?"],
  tk_t_job_kamera: ["Mikä osa ottaa valokuvan?", "Which part takes a photo?", "¿Qué pieza hace una foto?"],
  tk_t_job_antenni: ["Mikä osa juttelee muiden laitteiden kanssa ilman johtoa?", "Which part talks with other devices without a wire?", "¿Qué pieza habla con otros aparatos sin cable?"],

  tk_t_vihje_cpu: ["Etsi neliö, jonka reunoilla on kultaisia jalkoja.", "Find the square with golden legs on its sides.", "Busca el cuadrado con patitas doradas."],
  tk_t_vihje_ram: ["Etsi pitkä vihreä kampa, jossa on mustia paloja.", "Find the long green stick with black pieces.", "Busca la tira verde larga con piezas negras."],
  tk_t_vihje_ssd: ["Etsi violetti laatikko. Se on kuin muistikortti.", "Find the purple box. It is like a memory card.", "Busca la caja morada. Es como una tarjeta de memoria."],
  tk_t_vihje_akku: ["Etsi vihreä, jossa on salama.", "Find the green one with a lightning bolt.", "Busca la verde con un rayo."],
  tk_t_vihje_naytto: ["Etsi sininen ruutu, jossa on kasvot.", "Find the blue screen with a face.", "Busca la pantalla azul con una cara."],
  tk_t_vihje_kaiutin: ["Etsi pyöreä musta, josta ääni tulee ulos.", "Find the round black one where the sound comes out.", "Busca el redondo negro por donde sale el sonido."],
  tk_t_vihje_mikki: ["Etsi pieni harmaa, johon puhutaan.", "Find the little grey one you speak into.", "Busca el pequeño gris en el que se habla."],
  tk_t_vihje_kamera: ["Etsi musta, jossa on silmä eli linssi.", "Find the black one with an eye, a lens.", "Busca el negro con un ojo, una lente."],
  tk_t_vihje_antenni: ["Etsi tikku, josta lähtee aaltoja.", "Find the stick that sends out waves.", "Busca el palito que envía ondas."],

  tk_t_th_laskin: ["Laskin.", "A calculator.", "Una calculadora."],
  tk_t_th_lamppu: ["Taskulamppu.", "A torch.", "Una linterna."],
  tk_t_th_videot: ["Videot koko maailmasta.", "Videos from all over the world.", "Vídeos de todo el mundo."],
  tk_t_th_haku: ["Haku netistä.", "Searching the internet.", "Buscar en internet."],
  tk_t_th_kello: ["Herätyskello.", "An alarm clock.", "Un despertador."],
  tk_t_th_saa: ["Huomisen sää.", "Tomorrow's weather.", "El tiempo de mañana."],
  tk_t_th_piirros: ["Piirustusohjelma.", "A drawing app.", "Una app de dibujo."],
  tk_t_th_peli: ["Tämä peli.", "This game.", "Este juego."],
  tk_t_th_viesti: ["Viesti kaverille.", "A message to a friend.", "Un mensaje a un amigo."],
  tk_t_th_tekoaly: ["Iso tekoäly, jolta voi kysyä mitä vain.", "A big AI you can ask anything.", "Una IA grande a la que puedes preguntar de todo."],
  tk_t_th_kuva: ["Valokuvan ottaminen.", "Taking a photo.", "Hacer una foto."],
  tk_t_th_kartta: ["Reittiohjeet ja ruuhkat.", "Directions and traffic jams.", "Rutas y atascos."],

  tk_t_s_laskin: ["Laskin pyörii puhelimessa. Suoritin laskee sen itse.", "The calculator runs in the phone. The processor works it out by itself.", "La calculadora funciona en el móvil. El procesador lo calcula solo."],
  tk_t_s_lamppu: ["Taskulamppu on puhelimessa. Se sytyttää kameran vieressä olevan valon.", "The torch is in the phone. It turns on the light next to the camera.", "La linterna está en el móvil. Enciende la luz junto a la cámara."],
  tk_t_s_videot: ["Videot ovat pilvessä, isoissa palvelinsaleissa. Siellä on tuhansia tietokoneita.", "The videos are in the cloud, in big server halls with thousands of computers.", "Los vídeos están en la nube, en grandes salas con miles de ordenadores."],
  tk_t_s_haku: ["Haku pyörii pilvessä. Palvelimet ovat lukeneet valtavasti nettisivuja.", "Search runs in the cloud. The servers have read a huge number of web pages.", "La búsqueda funciona en la nube. Los servidores han leído muchísimas páginas."],
  tk_t_s_kello: ["Kello pyörii puhelimessa. Se herättää, vaikka nettiä ei olisi.", "The clock runs in the phone. It wakes you even with no internet.", "El reloj funciona en el móvil. Te despierta aunque no haya internet."],
  tk_t_s_saa: ["Sää lasketaan pilvessä. Sinne tulee tietoa sääasemilta ympäri maailmaa.", "The weather is worked out in the cloud, from weather stations all over the world.", "El tiempo se calcula en la nube con datos de estaciones de todo el mundo."],
  tk_t_s_piirros: ["Piirustusohjelma pyörii puhelimessa. Kuva tallentuu tallennustilaan.", "The drawing app runs in the phone. The picture is saved in its storage.", "La app de dibujo funciona en el móvil. El dibujo se guarda en su almacenamiento."],
  tk_t_s_peli: ["Tämä peli pyörii sinun puhelimessasi, ilman nettiä!", "This game runs in your phone, without the internet!", "¡Este juego funciona en tu móvil, sin internet!"],
  tk_t_s_viesti: ["Viesti kulkee pilven kautta. Palvelin vie sen kaverin puhelimeen.", "The message goes through the cloud. A server takes it to your friend's phone.", "El mensaje pasa por la nube. Un servidor lo lleva al móvil de tu amigo."],
  tk_t_s_tekoaly: ["Iso tekoäly pyörii pilvessä. Se tarvitsee monta isoa tietokonetta yhtä aikaa.", "A big AI runs in the cloud. It needs many big computers at once.", "Una IA grande funciona en la nube. Necesita muchos ordenadores a la vez."],
  tk_t_s_kuva: ["Kuva otetaan puhelimessa. Kamera ja suoritin tekevät sen.", "The photo is taken in the phone, by the camera and the processor.", "La foto se hace en el móvil, con la cámara y el procesador."],
  tk_t_s_kartta: ["Ruuhkat tulevat pilvestä. Se tietää, missä kaikki autot ovat juuri nyt.", "The traffic jams come from the cloud. It knows where all the cars are right now.", "Los atascos vienen de la nube. Sabe dónde están todos los coches ahora."],

  // Robottitehdas
  tk_f_kokoa: ["Keksitehtaan robotit tekevät kukin yhden työn. Laita ne oikeaan järjestykseen, ja käynnistä linja.", "Each robot in the cookie factory does one job. Put them in the right order and start the line.", "Cada robot de la fábrica hace un trabajo. Ponlos en orden y arranca la línea."],
  tk_f_tarkastaja: ["Robotit tekevät joskus huonoja keksejä. Valitse, mitä tarkastaja katsoo. Huono keksi menee takaisin alkuun.", "Sometimes the robots make bad cookies. Choose what the inspector checks. A bad cookie goes back to the start.", "A veces los robots hacen galletas malas. Elige qué revisa el inspector. La galleta mala vuelve al inicio."],
  tk_f_palaute: ["Tarkastaja löysi virheen. Kerro sille robotille, joka sen teki. Niin se oppii.", "The inspector found a mistake. Tell the robot that made it. That's how it learns.", "El inspector encontró un error. Díselo al robot que lo hizo. Así aprende."],
  tk_f_pullonkaula: ["Tänään tulee paljon asiakkaita. Katso, missä keksit jonottavat, ja laita apurobotti sinne.", "Lots of customers today. See where the cookies pile up, and put a helper robot there.", "Hoy vienen muchos clientes. Mira dónde se amontonan las galletas y pon un robot ayudante allí."],
  tk_f_kauppa: ["Keksin tekeminen maksaa yhden euron, ja asiakas maksaa siitä kolme euroa. Montako keksiä leivotaan?", "Making a cookie costs one euro, and a customer pays three euros for it. How many cookies shall we bake?", "Hacer una galleta cuesta un euro y el cliente paga tres. ¿Cuántas horneamos?"],
  tk_f_n_sekoitus: ["Sekoittaja tekee taikinan.", "The mixer makes the dough.", "La mezcladora hace la masa."],
  tk_f_n_muotti: ["Muotoilija tekee tähtiä.", "The shaper makes stars.", "La moldeadora hace estrellas."],
  tk_f_n_uuni: ["Uuni paistaa.", "The oven bakes.", "El horno hornea."],
  tk_f_n_koriste: ["Koristelija laittaa nonparelleja.", "The decorator adds sprinkles.", "La decoradora pone fideos de colores."],
  tk_f_n_paketti: ["Pakkaaja laittaa keksin laatikkoon.", "The packer puts the cookie in a box.", "La empaquetadora mete la galleta en una caja."],
  tk_f_tayta: ["Laita ensin robotit kaikille paikoille.", "First put robots in all the places.", "Primero pon robots en todos los sitios."],
  tk_f_herkullinen: ["Herkullinen keksi!", "A delicious cookie!", "¡Una galleta deliciosa!"],
  tk_f_ei_hyva: ["Hups, keksistä tuli outo.", "Oops, the cookie came out funny.", "¡Uy, la galleta salió rara!"],
  tk_f_mieti: ["Mieti, mitä tehdään ensin.", "Think what is done first.", "Piensa qué se hace primero."],
  tk_f_vihje_sekoitus: ["Ensin taikina sekoitetaan.", "First the dough is mixed.", "Primero se mezcla la masa."],
  tk_f_vihje_muotti: ["Sitten taikinasta tehdään muotoja.", "Then the dough is made into shapes.", "Luego la masa se moldea."],
  tk_f_vihje_uuni: ["Sitten keksit paistetaan uunissa.", "Then the cookies are baked in the oven.", "Luego las galletas se hornean."],
  tk_f_vihje_koriste: ["Paistetut keksit koristellaan.", "The baked cookies are decorated.", "Las galletas horneadas se decoran."],
  tk_f_vihje_paketti: ["Lopuksi keksit pakataan.", "Last, the cookies are packed.", "Al final, las galletas se empaquetan."],
  tk_f_d_palanut: ["Palanut.", "Burnt.", "Quemada."],
  tk_f_d_rikki: ["Rikki.", "Broken.", "Rota."],
  tk_f_d_tyhja: ["Ei koristeita.", "No sprinkles.", "Sin adornos."],
  tk_f_d_mytty: ["Möykky.", "Lumpy.", "Grumosa."],
  tk_f_valitse_tarkastus: ["Valitse ensin, mitä tarkastaja katsoo.", "First choose what the inspector checks.", "Primero elige qué revisa el inspector."],
  tk_f_vain_hyvia: ["Asiakkaat saivat vain hyviä keksejä!", "The customers got only good cookies!", "¡Los clientes solo recibieron galletas buenas!"],
  tk_f_huono_paasi: ["Voi ei, huono keksi pääsi asiakkaalle.", "Oh no, a bad cookie got to a customer.", "¡Oh, no! Una galleta mala llegó al cliente."],
  tk_f_vihje_tarkastus: ["Katso eilisiä keksejä. Millaisista asiakas ei pitänyt?", "Look at yesterday's cookies. Which ones did the customers not like?", "Mira las galletas de ayer. ¿Cuáles no gustaron?"],
  tk_f_oppi: ["Robotti sai palautteen ja oppi!", "The robot got the feedback and learned!", "¡El robot recibió el comentario y aprendió!"],
  tk_f_en_mina: ["En minä sitä tehnyt.", "It wasn't me.", "No fui yo."],
  tk_f_vihje_palanut: ["Palanut keksi on ollut liian kauan kuumassa. Kuka paistaa?", "A burnt cookie was too long in the heat. Who bakes?", "Una galleta quemada estuvo mucho tiempo al calor. ¿Quién hornea?"],
  tk_f_vihje_rikki: ["Tähti on mennyt rikki muotissa. Kuka tekee muodot?", "The star broke in the cutter. Who makes the shapes?", "La estrella se rompió en el molde. ¿Quién hace las formas?"],
  tk_f_vihje_tyhja: ["Keksistä puuttuvat koristeet. Kuka koristelee?", "The cookie has no sprinkles. Who decorates?", "A la galleta le faltan adornos. ¿Quién decora?"],
  tk_f_vihje_mytty: ["Taikina on möykkyistä. Kuka sekoittaa taikinan?", "The dough is lumpy. Who mixes the dough?", "La masa tiene grumos. ¿Quién mezcla la masa?"],
  tk_f_katso_jono: ["Katso, missä keksit jonottivat. Siellä robotti on liian hidas. Laita sinne apurobotti.", "See where the cookies piled up. That robot is too slow. Put a helper robot there.", "Mira dónde se amontonaron. Ese robot es lento. Pon allí un ayudante."],
  tk_f_liian_vahan: ["Keksejä ei tullut tarpeeksi.", "Not enough cookies came out.", "No salieron suficientes galletas."],
  tk_f_vihje_jono: ["Apurobotti auttaa vain siellä, missä on jonoa. Linja on yhtä nopea kuin sen hitain robotti.", "A helper only helps where there is a queue. The line is only as fast as its slowest robot.", "Un ayudante solo sirve donde hay cola. La línea es tan rápida como su robot más lento."],
  tk_f_kaikki_saivat: ["Kaikki asiakkaat saivat keksinsä!", "All the customers got their cookies!", "¡Todos los clientes tienen sus galletas!"],
  tk_f_ei_enempaa: ["Apurobotit loppuivat. Siirrä jokin toiseen paikkaan.", "No more helpers. Move one to another place.", "No hay más ayudantes. Mueve uno a otro sitio."],
  tk_f_leivo_ensin: ["Leivo ensin keksejä plus-napista.", "First bake some cookies with the plus button.", "Primero hornea galletas con el botón más."],
  tk_f_voitto: ["Hienoa kauppaa! Voittoa tuli", "Good business! The profit was", "¡Buen negocio! La ganancia fue de"],
  tk_f_euroa: ["euroa.", "euros.", "euros."],
  tk_f_liian_vahan_kekseja: ["Keksit loppuivat kesken, ja osa asiakkaista jäi ilman. Rahaa olisi tullut enemmän.", "The cookies ran out and some customers got none. You could have earned more.", "Se acabaron las galletas y algunos clientes se quedaron sin. Podrías haber ganado más."],
  tk_f_liikaa_kekseja: ["Keksejä jäi yli. Niiden tekeminen maksoi, mutta kukaan ei ostanut niitä.", "Cookies were left over. Making them cost money, but nobody bought them.", "Sobraron galletas. Hacerlas costó dinero, pero nadie las compró."],
  tk_f_vihje_kauppa: ["Laske, montako keksiä asiakkaat haluavat yhteensä. Leivo juuri niin monta.", "Count how many cookies the customers want altogether. Bake exactly that many.", "Cuenta cuántas galletas quieren los clientes en total. Hornea justo esas."],
};

function clips(i: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(TEXT)) out[k] = TEXT[k][i];
  return out;
}

const GAMES = ["robotti", "tietokone", "robottitehdas"];
const fiPath = "voice/fi.json";
const fi = JSON.parse(fs.readFileSync(fiPath, "utf8"));
for (const k of Object.keys(fi.clips)) if (k.startsWith("tk_") || GAMES.some((g) => k === "peli_" + g)) delete fi.clips[k];
Object.assign(fi.clips, clips(0));
fs.writeFileSync(fiPath, JSON.stringify(fi, null, 1) + "\n");
["en", "es"].forEach((lang, j) => {
  const doc = { _comment: "Tietokoneet (games/robotti, tietokone, robottitehdas): generated by tools/tietokoneet/gen-voice.ts, same ids as voice/fi.json.", lang, clips: clips(j + 1) };
  fs.writeFileSync("voice/" + lang + "/tietokoneet.json", JSON.stringify(doc, null, 1) + "\n");
});
console.log("tk clips:", Object.keys(TEXT).length, "per language");
