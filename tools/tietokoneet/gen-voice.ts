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

  // Omenalinjasto: the start
  ol_i1: ["Tämä on omenalinjasto. Omenat tulevat hihnaa pitkin.", "This is the apple line. Apples come along the belt.", "Esta es la línea de manzanas. Las manzanas llegan por la cinta."],
  ol_i2: ["Suodatin mittaa jokaisen: värin, koon ja painon.", "The filter measures each one: its colour, size and weight.", "El filtro mide cada una: su color, tamaño y peso."],
  ol_i3: ["Sääntö päättää, meneekö se eteenpäin vai pois.", "The rule decides if it goes on or off.", "La regla decide si sigue adelante o sale."],
  ol_i4: ["Koura nostaa hylätyt pois.", "The claw takes the rejected ones off.", "La garra quita las rechazadas."],
  ol_i5: ["Leikkuri pilkkoo omenat. Sinä teet säännön. Paina Aloita!", "The slicer cuts the apples. You make the rule. Press Start!", "La cortadora corta las manzanas. Tú haces la regla. ¡Pulsa Empezar!"],
  // the challenges
  ol_l1: ["Hei, olen pomo! Tänään lajitellaan omenoita värin mukaan.", "Hi, I'm the boss! Today we sort apples by colour.", "¡Hola, soy el jefe! Hoy separamos manzanas por color."],
  ol_l2: ["Nyt katsotaan kokoa. Vertaa omenoita kirsikkaan, tennispalloon tai meloniin.", "Now we look at size. Compare the apples with a cherry, a tennis ball or a melon.", "Ahora miramos el tamaño. Compara las manzanas con una cereza, una pelota de tenis o un melón."],
  ol_l3: ["Nyt tarvitaan vaakaa. Paino ei näy päältä, mutta vaaka tietää sen.", "Now we need the scale. You can't see weight, but the scale knows it.", "Ahora hace falta la báscula. El peso no se ve, pero la báscula lo sabe."],
  ol_l4: ["Nyt pomo haluaa kahta asiaa yhtä aikaa. Lisää sääntöön rivi sanalla ja.", "Now the boss wants two things at once. Add a row to the rule with and.", "Ahora el jefe quiere dos cosas a la vez. Añade una fila a la regla con y."],
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
  ol_pomo_hyva: ["Hyvä! Linjasto toimii juuri oikein.", "Good! The line works just right.", "¡Bien! La línea funciona perfecta."],
  ol_pomo_vari: ["Hups! Mukaan pääsi vääränvärisiä.", "Oops! Some of the wrong colour got through.", "¡Uy! Pasaron algunas del color equivocado."],
  ol_pomo_koko: ["Hups! Mukaan pääsi vääränkokoisia.", "Oops! Some of the wrong size got through.", "¡Uy! Pasaron algunas del tamaño equivocado."],
  ol_pomo_paino: ["Hups! Mukaan pääsi jotain liian kevyttä tai painavaa.", "Oops! Something too light or too heavy got through.", "¡Uy! Pasó algo demasiado ligero o pesado."],
  ol_pomo_jumi: ["Kurpitsa jumitti leikkurin!", "A pumpkin jammed the slicer!", "¡Una calabaza atascó la cortadora!"],
  ol_pomo_hukka: ["Hyviä omenoita meni roskiin.", "Good apples went in the bin.", "Manzanas buenas acabaron en la basura."],
  ol_korjaa: ["Napauta tuotetta ja katso, mitä suodatin teki. Korjaa sääntö ja kokeile uudestaan.", "Tap a thing and see what the filter did. Fix the rule and try again.", "Toca una cosa y mira qué hizo el filtro. Arregla la regla y prueba otra vez."],
  ol_eteen: ["Eteenpäin.", "On you go.", "Adelante."],
  ol_pois: ["Pois.", "Off.", "Fuera."],
  // hints
  ol_v_vari: ["Katso väriä. Minkä värisiä pomo halusi?", "Look at the colour. Which colour did the boss want?", "Mira el color. ¿Qué color quería el jefe?"],
  ol_v_koko: ["Vertaa kokoa. Isompi vai pienempi kuin mikä?", "Compare the size. Bigger or smaller than what?", "Compara el tamaño. ¿Más grande o más pequeño que qué?"],
  ol_v_paino: ["Vaaka huomaa painon. Käytä painoa säännössä.", "The scale notices weight. Use weight in the rule.", "La báscula nota el peso. Usa el peso en la regla."],
  ol_v_jumi: ["Kurpitsa on tosi painava. Vaaka huomaa sen.", "A pumpkin is really heavy. The scale notices it.", "Una calabaza pesa mucho. La báscula lo nota."],
  ol_v_hukka: ["Jokin rivi pudottaa hyviä omenoita. Napauta omenaa ja katso, mikä rivi on punainen.", "A row stops good apples. Tap an apple and see which row is red.", "Una fila quita manzanas buenas. Toca una manzana y mira qué fila está roja."],
  ol_v_kesken: ["Säännössä on vielä kysymysmerkki. Napauta sitä.", "The rule still has a question mark. Tap it.", "La regla todavía tiene un signo de interrogación. Tócalo."],
  ol_v_valmis: ["Sääntö näyttää hyvältä. Kokeile!", "The rule looks good. Try it!", "La regla parece buena. ¡Pruébala!"],
  // the parts of a rule
  ol_k_mika: ["Mitä suodatin katsoo?", "What does the filter look at?", "¿Qué mira el filtro?"],
  ol_k_miten: ["Miten verrataan?", "How do we compare?", "¿Cómo comparamos?"],
  ol_k_mihin: ["Mihin verrataan?", "Compared with what?", "¿Comparado con qué?"],
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
