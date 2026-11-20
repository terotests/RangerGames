// node --experimental-strip-types tools/tietokoneet/gen-voice.ts
// Writes the speech of the Tietokoneet games (robotti, omenalinja): the tk_
// and ol_ clips and the games' names into voice/fi.json, and
// voice/en/tietokoneet.json, voice/es/tietokoneet.json. Numbers, praise and
// "kokeile toista" are the shared clips (n1…, hyva, …).
import * as fs from "node:fs";

type T = [string, string, string];   // fi, en, es
const TEXT: Record<string, T> = {
  peli_robotti: ["Robotti", "Robot", "Robot"],
  peli_omenalinja: ["Omenalinjasto", "Apple line", "Línea de manzanas"],

  tk_ylos: ["Ylös.", "Up.", "Arriba."],
  tk_oikealle: ["Oikealle.", "Right.", "Derecha."],
  tk_alas: ["Alas.", "Down.", "Abajo."],
  tk_vasemmalle: ["Vasemmalle.", "Left.", "Izquierda."],

  // Robotti
  tk_r_askeleet: ["Robotin akku on tyhjä. Tee sille ohjelma: paina nuolia, ja käynnistä vihreästä napista.", "The robot's battery is empty. Make it a program: press the arrows, then start with the green button.", "La batería del robot está vacía. Hazle un programa: pulsa las flechas y empieza con el botón verde."],
  tk_r_toista: ["Robotilla on vain vähän laatikoita. Paina samaa nuolta monta kertaa, niin laatikkoon tulee luku. Robotti toistaa askeleen niin monta kertaa.", "The robot has only a few boxes. Press the same arrow many times and the box gets a number. The robot repeats the step that many times.", "El robot tiene pocas cajas. Pulsa la misma flecha varias veces y la caja tendrá un número. El robot repite el paso ese número de veces."],
  tk_r_jos: ["Robotti kävelee itse. Kun se astuu värilliselle ruudulle, se kääntyy. Valitse jokaiselle värille nuoli.", "The robot walks by itself. When it steps on a coloured square, it turns. Choose an arrow for each colour.", "El robot camina solo. Cuando pisa una casilla de color, gira. Elige una flecha para cada color."],
  tk_r_tormasi: ["Hups, robotti törmäsi! Punainen laatikko on bugi eli virhe. Korjaa se.", "Oops, the robot crashed! The red box is a bug, a mistake. Fix it.", "¡Uy, el robot chocó! La caja roja es un error. Arréglala."],
  tk_r_tormasi_jos: ["Hups, robotti törmäsi! Tarkista värien nuolet.", "Oops, the robot crashed! Check the arrows of the colours.", "¡Uy, el robot chocó! Revisa las flechas de los colores."],
  tk_r_ei_perille: ["Ohjelma loppui, mutta akku jäi kauas. Lisää askeleita.", "The program ended, but the battery is still far away. Add more steps.", "El programa terminó, pero la batería sigue lejos. Añade pasos."],
  tk_r_ikuinen: ["Robotti kulkee ympyrää eikä pääse perille.", "The robot goes round and round and never gets there.", "El robot da vueltas y no llega."],
  tk_r_perilla: ["Robotti sai virtaa!", "The robot got power!", "¡El robot tiene energía!"],
  tk_r_taynna: ["Ohjelma on täynnä.", "The program is full.", "El programa está lleno."],
  tk_r_vihje_askeleet: ["Seuraa keltaisia pisteitä. Ensimmäinen nuoli on", "Follow the yellow dots. The first arrow is", "Sigue los puntos amarillos. La primera flecha es"],
  tk_r_vihje_toista: ["Laske ruudut ennen mutkaa. Paina samaa nuolta yhtä monta kertaa. Mutkan jälkeen tulee uusi laatikko.", "Count the squares before the turn. Press the same arrow that many times. After the turn comes a new box.", "Cuenta las casillas antes de la curva. Pulsa la misma flecha ese número de veces. Después de la curva viene una caja nueva."],
  tk_r_vihje_jos: ["Valkoinen nuoli näyttää, mihin polku jatkuu värillisen ruudun jälkeen.", "The white arrow shows where the path goes after the coloured square.", "La flecha blanca muestra adónde sigue el camino después de la casilla de color."],

  // Omenalinjasto: the start
  ol_i1: ["Tämä on omenalinjasto. Omenat tulevat hihnaa pitkin.", "This is the apple line. Apples come along the belt.", "Esta es la línea de manzanas. Las manzanas llegan por la cinta."],
  ol_i2: ["Mittari katsoo jokaisen omenan.", "A machine looks at every apple.", "Una máquina mira cada manzana."],
  ol_i3: ["Väärät putoavat luukusta pois.", "The wrong ones drop through the hatch.", "Las que no valen caen por la trampilla."],
  ol_i4: ["Leikkuri pilkkoo omenat, ja laatikko täyttyy. Robotti vie täyden laatikon pois.", "The slicer cuts the apples, and the crate fills. A robot takes the full crate away.", "La cortadora corta las manzanas y la caja se llena. Un robot se lleva la caja llena."],
  ol_i5: ["Sinä päätät, mitä mittarit päästävät läpi. Paina Aloita!", "You decide what the machines let through. Press Start!", "Tú decides qué dejan pasar las máquinas. ¡Pulsa Empezar!"],
  // the challenges
  ol_l1: ["Hei, olen pomo! Tänään lajitellaan omenoita värin mukaan.", "Hi, I'm the boss! Today we sort apples by colour.", "¡Hola, soy el jefe! Hoy separamos manzanas por color."],
  ol_l2: ["Nyt katsotaan kokoa. Vertaa omenoita kirsikkaan, tennispalloon tai meloniin.", "Now we look at size. Compare the apples with a cherry, a tennis ball or a melon.", "Ahora miramos el tamaño. Compara las manzanas con una cereza, una pelota de tenis o un melón."],
  ol_l3: ["Nyt tarvitaan vaakaa. Paino ei näy päältä, mutta vaaka tietää sen.", "Now we need the scale. You can't see weight, but the scale knows it.", "Ahora hace falta la báscula. El peso no se ve, pero la báscula lo sabe."],
  ol_l4: ["Nyt pomo haluaa kahta asiaa yhtä aikaa. Laita linjalle kaksi mittaria.", "Now the boss wants two things at once. Put two machines on the line.", "Ahora el jefe quiere dos cosas a la vez. Pon dos máquinas en la línea."],
  ol_l5: ["Joskus on helpompi sanoa, mitä ei haluta. Kokeile ei ole.", "Sometimes it's easier to say what you don't want. Try is not.", "A veces es más fácil decir lo que no quieres. Prueba no es."],
  // the boss's orders
  ol_o_vari_punainen: ["Kauppaan vain punaiset omenat.", "Only red apples to the shop.", "Solo manzanas rojas a la tienda."],
  ol_o_vari_vihrea: ["Nyt kauppaan vihreät omenat.", "Now green apples to the shop.", "Ahora manzanas verdes a la tienda."],
  ol_o_vari_keltainen: ["Nyt kauppa haluaa keltaiset omenat.", "Now the shop wants yellow apples.", "Ahora la tienda quiere manzanas amarillas."],
  ol_o_koko_iso: ["Kauppaan isot omenat, isommat kuin tennispallo.", "Big apples to the shop, bigger than a tennis ball.", "Manzanas grandes a la tienda, más grandes que una pelota de tenis."],
  ol_o_koko_pieni: ["Mehuasemalle pienet omenat, pienemmät kuin tennispallo.", "Small apples to the juice station, smaller than a tennis ball.", "Manzanas pequeñas al zumo, más pequeñas que una pelota de tenis."],
  ol_o_koko_kirsikka: ["Mehuun pienet omenat, mutta kirsikat eivät kuulu mukaan.", "Small apples for juice, but no cherries.", "Manzanas pequeñas para zumo, pero sin cerezas."],
  ol_o_paino_pallo: ["Linjalle on sekoittunut vaahtopalloja. Ne näyttävät omenoilta, mutta ovat kevyitä. Vain omenat kauppaan.", "Foam balls got onto the line. They look like apples but they are light. Only apples to the shop.", "Se han mezclado pelotas de espuma. Parecen manzanas, pero son ligeras. Solo manzanas a la tienda."],
  ol_o_paino_kurpitsa: ["Kurpitsat pois! Ne ovat niin painavia, että ne jumittavat leikkurin.", "Pumpkins off! They are so heavy they jam the slicer.", "¡Fuera las calabazas! Son tan pesadas que atascan la cortadora."],
  ol_o_paino_molemmat: ["Nyt linjalla on sekä vaahtopalloja että kurpitsoita. Vain omenat kauppaan.", "Now there are foam balls and pumpkins on the line. Only apples to the shop.", "Ahora hay pelotas de espuma y calabazas. Solo manzanas a la tienda."],
  ol_o_ja_punainen_iso: ["Kauppaan omenat, jotka ovat punaisia ja isoja.", "To the shop, apples that are red and big.", "A la tienda, manzanas rojas y grandes."],
  ol_o_ja_vihrea_pieni: ["Mehuun omenat, jotka ovat vihreitä ja pieniä.", "For juice, apples that are green and small.", "Para zumo, manzanas verdes y pequeñas."],
  ol_o_ja_punainen_aito: ["Kauppaan punaiset omenat, mutta ei vaahtopalloja.", "Red apples to the shop, but no foam balls.", "Manzanas rojas a la tienda, pero sin pelotas de espuma."],
  ol_o_ei_vihrea: ["Kauppaan kaikki omenat paitsi vihreät.", "All apples to the shop except the green ones.", "Todas las manzanas a la tienda menos las verdes."],
  ol_o_ei_punainen: ["Mehuun kaikki omenat paitsi punaiset.", "All apples for juice except the red ones.", "Todas las manzanas para zumo menos las rojas."],
  ol_o_ei_vihrea_iso: ["Kauppaan isot omenat, mutta ei vihreitä.", "Big apples to the shop, but no green ones.", "Manzanas grandes a la tienda, pero no verdes."],
  // the boss looks at what came out
  ol_pomo_hyva: ["Hyvä! Kolme puhdasta laatikkoa. Linjasto toimii juuri oikein.", "Good! Three clean crates. The line works just right.", "¡Bien! Tres cajas limpias. La línea funciona perfecta."],
  ol_pomo_vari: ["Hups! Mukaan pääsi vääränvärisiä.", "Oops! Some of the wrong colour got through.", "¡Uy! Pasaron algunas del color equivocado."],
  ol_pomo_koko: ["Hups! Mukaan pääsi vääränkokoisia.", "Oops! Some of the wrong size got through.", "¡Uy! Pasaron algunas del tamaño equivocado."],
  ol_pomo_paino: ["Hups! Mukaan pääsi jotain liian kevyttä tai painavaa.", "Oops! Something too light or too heavy got through.", "¡Uy! Pasó algo demasiado ligero o pesado."],
  ol_pomo_jumi: ["Kurpitsa jumitti leikkurin!", "A pumpkin jammed the slicer!", "¡Una calabaza atascó la cortadora!"],
  ol_pomo_hukka: ["Hyviä omenoita meni roskiin.", "Good apples went in the bin.", "Manzanas buenas acabaron en la basura."],
  // hints
  ol_v_vari: ["Katso väriä. Minkä värisiä pomo halusi?", "Look at the colour. Which colour did the boss want?", "Mira el color. ¿Qué color quería el jefe?"],
  ol_v_koko: ["Vertaa kokoa. Isompi vai pienempi kuin mikä?", "Compare the size. Bigger or smaller than what?", "Compara el tamaño. ¿Más grande o más pequeño que qué?"],
  ol_v_paino: ["Vaaka huomaa painon. Laita vaaka linjalle.", "The scale notices weight. Put the scale on the line.", "La báscula nota el peso. Pon la báscula en la línea."],
  ol_v_jumi: ["Kurpitsa on tosi painava. Vaaka huomaa sen.", "A pumpkin is really heavy. The scale notices it.", "Una calabaza pesa mucho. La báscula lo nota."],
  ol_v_hukka: ["Jokin mittari pudottaa hyviä omenoita. Napauta omenaa ja katso, mikä mittari sen pysäyttää.", "A machine drops good apples. Tap an apple and see which machine stops it.", "Una máquina tira manzanas buenas. Toca una manzana y mira qué máquina la para."],
  ol_v_kesken: ["Mittarissa on vielä kysymysmerkki. Napauta sitä ja valitse.", "A machine still has a question mark. Tap it and choose.", "Una máquina todavía tiene un signo de interrogación. Tócala y elige."],
  ol_v_valmis: ["Mittarit näyttävät hyviltä. Katso, miten laatikot täyttyvät!", "The machines look good. Watch the crates fill!", "Las máquinas están bien. ¡Mira cómo se llenan las cajas!"],
  // the parts of a rule
  ol_k_raahaa: ["Raahaa mittari linjalle.", "Drag a machine onto the line.", "Arrastra una máquina a la línea."],
  ol_k_valitse: ["Valitse, mitä se päästää läpi.", "Choose what it lets through.", "Elige qué deja pasar."],
  ol_tavoite: ["Täytä kolme laatikkoa niin, ettei mukana ole yhtään väärää.", "Fill three crates with no wrong ones in them.", "Llena tres cajas sin ninguna equivocada."],
  ol_c_vari: ["Väri.", "Colour.", "Color."],
  ol_c_koko: ["Koko.", "Size.", "Tamaño."],
  ol_c_paino: ["Paino.", "Weight.", "Peso."],
  ol_c_on: ["On.", "Is.", "Es."],
  ol_c_ei: ["Ei ole.", "Is not.", "No es."],
  ol_c_yli: ["Suurempi kuin.", "More than.", "Más que."],
  ol_c_alle: ["Pienempi kuin.", "Less than.", "Menos que."],
  ol_c_punainen: ["Punainen.", "Red.", "Rojo."],
  ol_c_vihrea: ["Vihreä.", "Green.", "Verde."],
  ol_c_keltainen: ["Keltainen.", "Yellow.", "Amarillo."],
  ol_c_kirsikka: ["Kirsikka.", "A cherry.", "Una cereza."],
  ol_c_tennis: ["Tennispallo.", "A tennis ball.", "Una pelota de tenis."],
  ol_c_meloni: ["Meloni.", "A melon.", "Un melón."],
  ol_c_kurpitsa: ["Kurpitsa.", "A pumpkin.", "Una calabaza."],
};

function clips(i: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(TEXT)) out[k] = TEXT[k][i];
  return out;
}

const GAMES = ["robotti", "omenalinja", "tietokone", "robottitehdas"];
const fiPath = "voice/fi.json";
const fi = JSON.parse(fs.readFileSync(fiPath, "utf8"));
for (const k of Object.keys(fi.clips)) if (k.startsWith("tk_") || k.startsWith("ol_") || GAMES.some((g) => k === "peli_" + g)) delete fi.clips[k];
Object.assign(fi.clips, clips(0));
fs.writeFileSync(fiPath, JSON.stringify(fi, null, 1) + "\n");
["en", "es"].forEach((lang, j) => {
  const doc = { _comment: "Tietokoneet (games/robotti, omenalinja): generated by tools/tietokoneet/gen-voice.ts, same ids as voice/fi.json.", lang, clips: clips(j + 1) };
  fs.writeFileSync("voice/" + lang + "/tietokoneet.json", JSON.stringify(doc, null, 1) + "\n");
});
console.log("tk clips:", Object.keys(TEXT).length, "per language");
