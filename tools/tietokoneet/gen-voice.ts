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

  // Omenalinjasto
  ol_l1: ["Omenat tulevat linjastoa pitkin. Sinä olet suodatin. Päästä punaiset omenat eteenpäin ja laita muut pois.", "Apples come along the line. You are the filter. Let the red apples go on and put the others in the bin.", "Las manzanas llegan por la línea. Tú eres el filtro. Deja pasar las rojas y tira las demás."],
  ol_l1_mato: ["Pomo haluaa vain punaisia omenoita, joissa ei ole matoa. Päätä jokaisesta: eteenpäin vai pois.", "The boss wants only red apples with no worm. Decide for each one: on or in the bin.", "El jefe quiere solo manzanas rojas sin gusano. Decide con cada una: adelante o fuera."],
  ol_eteen: ["Eteenpäin.", "On you go.", "Adelante."],
  ol_pois: ["Pois.", "In the bin.", "Fuera."],
  ol_l2: ["Nyt robotti on suodatin. Opeta sille sääntö: napauta sääntöä, valitse väri ja käynnistä linjasto.", "Now the robot is the filter. Teach it a rule: tap the rule, choose a colour and start the line.", "Ahora el robot es el filtro. Enséñale una regla: toca la regla, elige un color y arranca la línea."],
  ol_goal_red: ["Tänään kauppaan tarvitaan punaisia omenoita.", "Today the shop needs red apples.", "Hoy la tienda necesita manzanas rojas."],
  ol_goal_green: ["Tänään tehdään hilloa vihreistä omenoista.", "Today we make jam from green apples.", "Hoy hacemos mermelada con manzanas verdes."],
  ol_l3: ["Nyt tarvitaan molempia: punaiset kauppaan ja vihreät hilloksi. Mutta matoisia omenoita ei haluta.", "Now we need both: red ones for the shop and green ones for jam. But no apples with worms.", "Ahora hacen falta las dos: rojas para la tienda y verdes para mermelada. Pero ninguna con gusano."],
  ol_l4: ["Liian pienet omenat ovat viallisia, ja kurpitsa tukkii leikkurin. Lisää painosäännöt.", "Apples that are too small are faulty, and a pumpkin jams the slicer. Add weight rules.", "Las manzanas muy pequeñas están mal y una calabaza atasca la cortadora. Añade reglas de peso."],
  ol_l5: ["Linjastolle on eksynyt kenkä ja banaani. Päästä eteenpäin vain hyvät omenat.", "A shoe and a banana got onto the line. Let only good apples go on.", "Un zapato y un plátano se han colado en la línea. Deja pasar solo las manzanas buenas."],
  ol_pomo_hyva: ["Pomo sanoo: Hienoa! Kaikki omenat ovat juuri sopivia.", "The boss says: Great! All the apples are just right.", "El jefe dice: ¡Genial! Todas las manzanas están perfectas."],
  ol_pomo_mato: ["Pomo sanoo: Joukossa oli matoisia omenoita!", "The boss says: Some apples had worms!", "El jefe dice: ¡Había manzanas con gusanos!"],
  ol_pomo_pieni: ["Pomo sanoo: Joukossa oli liian pieniä omenoita.", "The boss says: Some apples were too small.", "El jefe dice: Había manzanas demasiado pequeñas."],
  ol_pomo_vari: ["Pomo sanoo: Joukossa oli vääränvärisiä omenoita.", "The boss says: Some apples were the wrong colour.", "El jefe dice: Había manzanas del color equivocado."],
  ol_pomo_jumi: ["Voi ei, leikkuri jumittui! Sinne pääsi jotain, mikä ei ole omena.", "Oh no, the slicer jammed! Something that is not an apple got in.", "¡Oh, no, la cortadora se atascó! Entró algo que no es una manzana."],
  ol_pomo_hukka: ["Pomo sanoo: Hyviä omenoita heitettiin pois. Ne olisi tarvittu.", "The boss says: Good apples were thrown away. We needed them.", "El jefe dice: Se tiraron manzanas buenas. Las necesitábamos."],
  ol_korjaa: ["Korjataan suodatin ja kokeillaan uudestaan.", "Let's fix the filter and try again.", "Arreglemos el filtro y probemos otra vez."],
  ol_v_k1: ["Punainen omena eteenpäin, muut pois.", "Red apple on, the others in the bin.", "Manzana roja adelante, las demás fuera."],
  ol_v_vari_red: ["Vaihda väriksi punainen.", "Change the colour to red.", "Cambia el color a rojo."],
  ol_v_vari_green: ["Vaihda väriksi vihreä.", "Change the colour to green.", "Cambia el color a verde."],
  ol_v_vari_any: ["Molempia värejä tarvitaan. Valitse väriksi mikä vain.", "Both colours are needed. Choose any colour.", "Hacen falta los dos colores. Elige cualquier color."],
  ol_v_mato: ["Napauta matosääntöä: ei matoa.", "Tap the worm rule: no worm.", "Toca la regla del gusano: sin gusano."],
  ol_v_yli: ["Pieni omena on kevyempi kuin tennispallo. Valitse: paino enemmän kuin tennispallo.", "A small apple is lighter than a tennis ball. Choose: weight more than a tennis ball.", "Una manzana pequeña pesa menos que una pelota de tenis. Elige: peso mayor que la pelota de tenis."],
  ol_v_alle: ["Kurpitsa on liian painava. Valitse: paino vähemmän kuin kurpitsa.", "A pumpkin is too heavy. Choose: weight less than a pumpkin.", "Una calabaza pesa demasiado. Elige: peso menor que la calabaza."],
  ol_v_omena: ["Napauta ylintä sääntöä: on omena.", "Tap the top rule: is an apple.", "Toca la primera regla: es una manzana."],
  ol_v_valmis: ["Sääntö näyttää hyvältä. Käynnistä linjasto.", "The rule looks good. Start the line.", "La regla parece buena. Arranca la línea."],
  ol_c_mika: ["Mikä väri vain.", "Any colour.", "Cualquier color."],
  ol_c_punainen: ["Punainen.", "Red.", "Rojo."],
  ol_c_vihrea: ["Vihreä.", "Green.", "Verde."],
  ol_c_ei_valia: ["Matolla ei väliä.", "Worms don't matter.", "Los gusanos dan igual."],
  ol_c_eimatoa: ["Ei matoa.", "No worm.", "Sin gusano."],
  ol_c_ei: ["Ei painosääntöä.", "No weight rule.", "Sin regla de peso."],
  ol_c_yli_kirsikka: ["Painaa enemmän kuin kirsikka.", "Heavier than a cherry.", "Pesa más que una cereza."],
  ol_c_yli_tennis: ["Painaa enemmän kuin tennispallo.", "Heavier than a tennis ball.", "Pesa más que una pelota de tenis."],
  ol_c_alle_tennis: ["Painaa vähemmän kuin tennispallo.", "Lighter than a tennis ball.", "Pesa menos que una pelota de tenis."],
  ol_c_alle_kurpitsa: ["Painaa vähemmän kuin kurpitsa.", "Lighter than a pumpkin.", "Pesa menos que una calabaza."],
  ol_c_mika_tahansa: ["Mikä tahansa esine.", "Any thing.", "Cualquier cosa."],
  ol_c_omena: ["On omena.", "Is an apple.", "Es una manzana."],
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
