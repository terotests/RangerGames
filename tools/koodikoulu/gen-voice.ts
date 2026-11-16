// node --experimental-strip-types tools/koodikoulu/gen-voice.ts
// Writes Koodikoulu's speech (games/koodikoulu): the kk_ clips and the game's
// name into voice/fi.json, and voice/en/koodikoulu.json, voice/es/koodikoulu.json.
// Numbers and praise are the shared clips (n1…, hyva, …).
import * as fs from "node:fs";

type T = [string, string, string];   // fi, en, es
const TEXT: Record<string, T> = {
  peli_koodikoulu: ["Koodikoulu", "Code School", "Escuela de código"],
  kk_intro: ["Ohjelmoinnissa on neljä tärkeää sanaa: muistipaikka, operaattori, tietorakenne ja funktio. Kun osaat nämä neljä, voit tehdä melkein mitä tahansa!", "Programming has four important words: memory slot, operator, data structure and function. When you know these four, you can make almost anything!", "La programación tiene cuatro palabras importantes: memoria, operador, estructura de datos y función. ¡Si sabes estas cuatro, puedes hacer casi cualquier cosa!"],
  kk_kesken: ["Ohjelmassa on vielä kysymysmerkki. Täytä se ensin.", "The program still has a question mark. Fill it in first.", "El programa todavía tiene un signo de interrogación. Rellénalo primero."],
  kk_kylla: ["Kyllä.", "Yes.", "Sí."],
  kk_ei: ["Ei.", "No.", "No."],

  // 1 memory slots
  kk_l1: ["Robotti leipoo kakun, mutta se ei muista mitään itse. Se lukee kaiken muistipaikoista. Laita tilauksen tiedot muistipaikkoihin ja paina käynnistä.", "The robot bakes a cake, but it remembers nothing by itself. It reads everything from memory slots. Put the order into the memory slots and press run.", "El robot hornea una tarta, pero no recuerda nada por sí mismo. Lo lee todo de la memoria. Pon el pedido en las memorias y pulsa ejecutar."],
  kk_m_luku: ["Muistipaikan nimi on kynttilät. Siihen mahtuu yksi luku. Kun laitat uuden luvun, vanha häviää.", "This memory slot is called candles. It holds one number. When you put in a new number, the old one is gone.", "Esta memoria se llama velas. Guarda un número. Cuando pones uno nuevo, el viejo desaparece."],
  kk_m_teksti: ["Uusi muistipaikka! Nimi muistaa tekstiä, eli sanan. Kirjoita kakkuun asiakkaan nimi.", "A new memory slot! Name holds text, a word. Write the customer's name on the cake.", "¡Una memoria nueva! Nombre guarda texto, una palabra. Escribe el nombre del cliente en la tarta."],
  kk_m_kylla: ["Uusi muistipaikka! Kuorrute muistaa vain kyllä tai ei.", "A new memory slot! Icing only holds yes or no.", "¡Una memoria nueva! Glaseado solo guarda sí o no."],
  kk_m_taas: ["Uusi tilaus! Muuta muistipaikkoja.", "A new order! Change the memory slots.", "¡Un pedido nuevo! Cambia las memorias."],
  kk_m_lue_kynttilat: ["Kynttilät.", "Candles.", "Velas."],
  kk_m_lue_nimi: ["Nimi.", "Name.", "Nombre."],
  kk_m_lue_kuorrute: ["Kuorrute.", "Icing.", "Glaseado."],
  kk_m_vaara_kynttilat: ["Kynttilöitä on väärä määrä. Katso muistipaikkaa kynttilät.", "The number of candles is wrong. Look at the memory slot candles.", "Hay un número equivocado de velas. Mira la memoria velas."],
  kk_m_vaara_nimi: ["Kakussa on väärä nimi. Katso muistipaikkaa nimi.", "The cake has the wrong name. Look at the memory slot name.", "La tarta tiene un nombre equivocado. Mira la memoria nombre."],
  kk_m_vaara_kuorrute: ["Kuorrute meni väärin. Katso muistipaikkaa kuorrute.", "The icing is wrong. Look at the memory slot icing.", "El glaseado está mal. Mira la memoria glaseado."],
  kk_m_valmis: ["Juuri tilauksen mukainen kakku!", "Exactly the cake that was ordered!", "¡Justo la tarta que pidieron!"],
  kk_m_vihje: ["Robotti tekee vain sen, mitä muistipaikoissa lukee. Vertaa jokaista muistipaikkaa tilaukseen.", "The robot only does what the memory slots say. Compare each memory slot with the order.", "El robot solo hace lo que dicen las memorias. Compara cada memoria con el pedido."],

  // 2 operators
  kk_l2: ["Operaattori on kone, joka tekee kahdesta arvosta uuden arvon.", "An operator is a machine that makes a new value out of two values.", "Un operador es una máquina que hace un valor nuevo con dos valores."],
  kk_o_valitse: ["Mikä operaattori tekee luvuista A ja B tavoitteen? Valitse ja käynnistä.", "Which operator makes the goal out of A and B? Choose and run.", "¿Qué operador hace el objetivo con A y B? Elige y ejecuta."],
  kk_o_aseta: ["Nyt operaattori on valmiina. Muuta muistipaikkaa B niin, että tulee tavoite.", "Now the operator is ready. Change memory slot B so that you get the goal.", "Ahora el operador está listo. Cambia la memoria B para lograr el objetivo."],
  kk_o_sanat: ["Plus toimii myös sanoille: se liimaa kaksi sanaa yhteen. Napauta sanat oikeassa järjestyksessä.", "Plus works for words too: it glues two words together. Tap the words in the right order.", "El más también sirve para palabras: pega dos palabras. Toca las palabras en el orden correcto."],
  kk_o_vertaa: ["Vertailuoperaattori vastaa kyllä tai ei. Lamppu syttyy, kun vastaus on kyllä.", "A comparison operator answers yes or no. The lamp lights up when the answer is yes.", "Un operador de comparación responde sí o no. La lámpara se enciende cuando la respuesta es sí."],
  kk_o_sytyta: ["Sytytä lamppu.", "Light the lamp.", "Enciende la lámpara."],
  kk_o_sammuta: ["Nyt lampun pitää jäädä pimeäksi.", "Now the lamp must stay dark.", "Ahora la lámpara tiene que quedarse apagada."],
  kk_o_vertaa_a: ["Operaattori on valmiina. Muuta lukua A niin, että lamppu syttyy.", "The operator is ready. Change number A so the lamp lights up.", "El operador está listo. Cambia el número A para que se encienda la lámpara."],
  kk_o_logiikka: ["Ja ja tai yhdistävät kyllä- ja ei-vastauksia. Ja tarvitsee molemmat avaimet. Tai tyytyy yhteen.", "And and or join yes and no answers. And needs both keys. Or is happy with one.", "Y y o juntan respuestas de sí y no. Y necesita las dos llaves. O se conforma con una."],
  kk_o_auki: ["Ovi pitää saada auki.", "The door must open.", "La puerta tiene que abrirse."],
  kk_o_kiinni: ["Ovi pitää pitää kiinni.", "The door must stay shut.", "La puerta tiene que seguir cerrada."],
  kk_o_vaara: ["Tuli eri tulos kuin tavoite.", "The result is not the goal.", "El resultado no es el objetivo."],
  kk_o_ei_voi: ["Tätä operaattoria ei voi käyttää näille arvoille.", "This operator does not work for these values.", "Este operador no sirve para estos valores."],
  kk_o_vihje: ["Kokeile päässä: mitä tulee, jos laitat tämän operaattorin A:n ja B:n väliin?", "Try it in your head: what do you get with this operator between A and B?", "Pruébalo en tu cabeza: ¿qué sale con este operador entre A y B?"],
  kk_op_plus: ["Plus.", "Plus.", "Más."],
  kk_op_miinus: ["Miinus.", "Minus.", "Menos."],
  kk_op_kertaa: ["Kertaa.", "Times.", "Por."],
  kk_op_suurempi: ["Suurempi kuin.", "Greater than.", "Mayor que."],
  kk_op_pienempi: ["Pienempi kuin.", "Less than.", "Menor que."],
  kk_op_yhta: ["Yhtä suuri kuin.", "Equal to.", "Igual a."],
  kk_op_ja: ["Ja.", "And.", "Y."],
  kk_op_tai: ["Tai.", "Or.", "O."],
  kk_s_paloauto: ["Tee sana paloauto.", "Make the word fire engine: palo plus auto.", "Forma la palabra coche de bomberos: palo más auto."],
  kk_s_lumiukko: ["Tee sana lumiukko.", "Make the word snowman: lumi plus ukko.", "Forma la palabra muñeco de nieve: lumi más ukko."],
  kk_s_lentokone: ["Tee sana lentokone.", "Make the word aeroplane: lento plus kone.", "Forma la palabra avión: lento más kone."],
  kk_s_auringonkukka: ["Tee sana aurinkokukka.", "Make the word sunflower: aurinko plus kukka.", "Forma la palabra girasol: aurinko más kukka."],
  kk_s_kilpikonna: ["Tee sana kilpikonna.", "Make the word turtle: kilpi plus konna.", "Forma la palabra tortuga: kilpi más konna."],
  kk_s_vesimeloni: ["Tee sana vesimeloni.", "Make the word watermelon: vesi plus meloni.", "Forma la palabra sandía: vesi más meloni."],
  kk_s_kirjahylly: ["Tee sana kirjahylly.", "Make the word bookshelf: kirja plus hylly.", "Forma la palabra estantería: kirja más hylly."],
  kk_s_mansikkakakku: ["Tee sana mansikkakakku.", "Make the word strawberry cake: mansikka plus kakku.", "Forma la palabra tarta de fresa: mansikka más kakku."],

  // 3 data structures
  kk_l3: ["Tietorakenne pitää monta asiaa tallessa. Tehdään kerrossmoothie: hedelmien pitää mennä mukiin reseptin järjestyksessä, alhaalta ylös.", "A data structure keeps many things. Let's make a layered smoothie: the fruits must go into the cup in the recipe's order, from the bottom up.", "Una estructura de datos guarda muchas cosas. Hagamos un batido por capas: las frutas van al vaso en el orden de la receta, de abajo arriba."],
  kk_d_lista: ["Tämä on lista. Jokaisella paikalla on numero. Kerro robotille paikkojen numerot reseptin järjestyksessä.", "This is a list. Every place has a number. Tell the robot the numbers of the places in the recipe's order.", "Esto es una lista. Cada sitio tiene un número. Dile al robot los números de los sitios en el orden de la receta."],
  kk_d_jono: ["Tämä on jono, kuin kaupan kassajono. Uusi menee jonon perälle, ja edestä lähtee se, joka tuli ensimmäisenä.", "This is a queue, like the line at a shop. A new one goes to the back, and the one that came first leaves from the front.", "Esto es una cola, como la de la tienda. El nuevo va al final, y sale por delante el que llegó primero."],
  kk_d_pino: ["Tämä on pino, kuin lautaspino. Uusi menee päällimmäiseksi, ja robotti ottaa aina päältä.", "This is a stack, like a stack of plates. A new one goes on top, and the robot always takes from the top.", "Esto es una pila, como una pila de platos. El nuevo va arriba, y el robot siempre coge de arriba."],
  kk_d_lokero: ["Tämä on lokerikko. Jokaisella lokerolla on nimi. Laita jokaisen eläimen lokeroon sen lempiruoka. Eläimet tulevat missä järjestyksessä tahansa.", "These are drawers. Each drawer has a name. Put each animal's favourite food in its drawer. The animals come in any order.", "Estos son cajones. Cada cajón tiene un nombre. Pon en el cajón de cada animal su comida favorita. Los animales llegan en cualquier orden."],
  kk_d_vaara: ["Kerrokset menivät eri järjestykseen kuin reseptissä. Katso, missä järjestyksessä tietorakenne antaa asiat.", "The layers went in another order than the recipe. Look at the order the data structure gives things out.", "Las capas quedaron en otro orden que la receta. Mira en qué orden da las cosas la estructura de datos."],
  kk_d_vaara_pino: ["Pinosta tulee ensin se, joka laitettiin viimeisenä. Laita siis pohjakerros viimeisenä.", "From a stack, the last one put in comes out first. So put the bottom layer in last.", "De una pila sale primero el último que entró. Así que pon la capa de abajo la última."],
  kk_d_vaara_lokero: ["Joku eläin sai väärää ruokaa. Katso lokeroiden nimiä.", "Some animal got the wrong food. Look at the names of the drawers.", "Algún animal recibió la comida equivocada. Mira los nombres de los cajones."],
  kk_d_valmis: ["Täydellinen kerrossmoothie!", "A perfect layered smoothie!", "¡Un batido por capas perfecto!"],
  kk_d_valmis_lokero: ["Kaikki saivat lempiruokansa!", "Everyone got their favourite food!", "¡Todos recibieron su comida favorita!"],
  kk_d_vihje: ["Nuoli näyttää seuraavan. Mieti, mistä päästä tietorakenne antaa asiat.", "The arrow shows the next one. Think about which end the data structure gives things out from.", "La flecha muestra el siguiente. Piensa por qué lado da las cosas la estructura de datos."],

  // 4 functions
  kk_l4: ["Funktio on kone, jolla on resepti. Teet reseptin kerran, ja kone tekee sen joka kerta, kun sitä kutsutaan.", "A function is a machine with a recipe. You make the recipe once, and the machine follows it every time it is called.", "Una función es una máquina con una receta. Haces la receta una vez, y la máquina la sigue cada vez que la llaman."],
  kk_f_luku: ["Katso, minkä luvun kukin tuo ja minkä se haluaa takaisin. Tee yksi resepti, joka toimii kaikille.", "Look at the number each one brings and the number it wants back. Make one recipe that works for everyone.", "Mira qué número trae cada uno y cuál quiere de vuelta. Haz una receta que sirva para todos."],
  kk_f_kysy: ["Tämä funktio vastaa kyllä tai ei. Tee resepti, joka sanoo kyllä juuri oikeille luvuille.", "This function answers yes or no. Make a recipe that says yes to exactly the right numbers.", "Esta función responde sí o no. Haz una receta que diga sí justo a los números correctos."],
  kk_f_kaksi: ["Nyt reseptissä on kaksi vaihetta: ensin yksi laskutoimitus ja sitten toinen.", "Now the recipe has two steps: first one calculation, then another.", "Ahora la receta tiene dos pasos: primero una cuenta y luego otra."],
  kk_f_vaara: ["Kone teki väärin jollekin. Punainen rivi näyttää kenelle.", "The machine got it wrong for someone. The red row shows who.", "La máquina se equivocó con alguien. La fila roja muestra con quién."],
  kk_f_valmis: ["Funktio on valmis! Samaa konetta voi käyttää yhä uudestaan eri luvuilla.", "The function is ready! The same machine works again and again with different numbers.", "¡La función está lista! La misma máquina sirve una y otra vez con números distintos."],
  kk_f_vihje: ["Katso ensimmäistä riviä. Mitä tuodulle luvulle pitää tehdä, että tulee haluttu? Toimiiko sama muillekin?", "Look at the first row. What do you do to the number to get the one wanted? Does the same work for the others?", "Mira la primera fila. ¿Qué hay que hacer al número para obtener el deseado? ¿Sirve lo mismo para los demás?"],

  // 5 all together
  kk_l5: ["Nyt käytetään kaikkia neljää: listaa, muistipaikkaa, operaattoria ja funktiota. Korjaa ohjelma, niin robotti ajaa sen rivi riviltä.", "Now we use all four: a list, a memory slot, an operator and a function. Fix the program, and the robot runs it line by line.", "Ahora usamos las cuatro: lista, memoria, operador y función. Arregla el programa y el robot lo ejecuta línea a línea."],
  kk_k_laske: ["Ohjelman pitää laskea, montako tällaista korissa on.", "The program must count how many of these are in the basket.", "El programa tiene que contar cuántas de estas hay en la cesta."],
  kk_k_summa: ["Ohjelman pitää laskea, paljonko kori maksaa. Hinnat ovat lokerikossa.", "The program must work out what the basket costs. The prices are in the drawers.", "El programa tiene que calcular cuánto cuesta la cesta. Los precios están en los cajones."],
  kk_k_testi: ["Toimii! Testataan vielä toisella korilla.", "It works! Let's test it with another basket too.", "¡Funciona! Probemos también con otra cesta."],
  kk_k_vaara: ["Tulos oli väärä. Katso, miten muistipaikka muuttui joka rivillä.", "The result was wrong. Look at how the memory slot changed on each line.", "El resultado fue incorrecto. Mira cómo cambió la memoria en cada línea."],
  kk_k_vaara_testi: ["Ensimmäinen kori meni oikein, mutta toinen ei. Ohjelman pitää toimia kaikille koreille.", "The first basket was right, but the second was not. The program must work for every basket.", "La primera cesta salió bien, pero la segunda no. El programa tiene que servir para todas las cestas."],
  kk_k_valmis: ["Ohjelma toimii! Näillä neljällä voi tehdä melkein mitä tahansa.", "The program works! With these four you can make almost anything.", "¡El programa funciona! Con estas cuatro puedes hacer casi cualquier cosa."],
  kk_k_vihje: ["Muistipaikka aloittaa jostain luvusta, ja joka kierroksella siihen tehdään jotain. Mistä laskeminen alkaa, ja mitä joka kerta lisätään?", "The memory slot starts from some number, and something is done to it every round. Where does counting start, and what is added each time?", "La memoria empieza en algún número y en cada vuelta se le hace algo. ¿Dónde empieza la cuenta y qué se suma cada vez?"],
};
for (const a of [["kissa", "Kissa.", "Cat. Kissa.", "Gato. Kissa."], ["koira", "Koira.", "Dog. Koira.", "Perro. Koira."], ["pupu", "Pupu.", "Bunny. Pupu.", "Conejo. Pupu."], ["karhu", "Karhu.", "Bear. Karhu.", "Oso. Karhu."], ["hiiri", "Hiiri.", "Mouse. Hiiri.", "Ratón. Hiiri."]]) TEXT["kk_nimi_" + a[0]] = [a[1], a[2], a[3]];

function clips(i: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(TEXT)) out[k] = TEXT[k][i];
  return out;
}
const fiPath = "voice/fi.json";
const fi = JSON.parse(fs.readFileSync(fiPath, "utf8"));
for (const k of Object.keys(fi.clips)) if (k.startsWith("kk_") || k === "peli_koodikoulu") delete fi.clips[k];
Object.assign(fi.clips, clips(0));
fs.writeFileSync(fiPath, JSON.stringify(fi, null, 1) + "\n");
["en", "es"].forEach((lang, j) => {
  const doc = { _comment: "Koodikoulu (games/koodikoulu): generated by tools/koodikoulu/gen-voice.ts, same ids as voice/fi.json.", lang, clips: clips(j + 1) };
  fs.writeFileSync("voice/" + lang + "/koodikoulu.json", JSON.stringify(doc, null, 1) + "\n");
});
console.log("kk clips:", Object.keys(TEXT).length, "per language");
