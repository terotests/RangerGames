// node --experimental-strip-types tools/kauppa/gen-voice.ts
// Writes the speech of Oma kauppa (games/kauppa): the ka_ clips and the
// game's name into voice/fi.json, and voice/en/kauppa.json, voice/es/kauppa.json.
// Numbers, praise, "sait" and "kokeile toista" are the shared clips.
import * as fs from "node:fs";

type T = [string, string, string];   // fi, en, es
const TEXT: Record<string, T> = {
  peli_kauppa: ["Oma kauppa", "My shop", "Mi tienda"],
  ka_l_pussi: ["Iso pussi", "Big bag", "Bolsa grande"],
  ka_l_hinta: ["Hinta", "Price", "Precio"],
  ka_l_mainos: ["Mainos", "Advert", "Anuncio"],
  ka_l_kauppa: ["Oma kauppa", "My shop", "Mi tienda"],

  ka_euro: ["euro.", "euro.", "euro."],
  ka_euroa: ["euroa.", "euros.", "euros."],
  ka_keksia: ["keksiä.", "cookies.", "galletas."],

  // 1 Iso pussi
  ka_tarvitset: ["Tarvitset", "You need", "Necesitas"],
  ka_mika_halvin: ["Mikä tapa on halvin?", "Which way is the cheapest?", "¿Qué forma es la más barata?"],
  ka_iso_halvempi: ["Iso pussi on halvempi. Mitä enemmän ostat kerralla, sitä halvemmalla saat.", "The big bag is cheaper. The more you buy at once, the cheaper it gets.", "La bolsa grande es más barata. Cuanto más compras de una vez, más barato sale."],
  ka_vihje_kolikot: ["Laske kolikot. Halvimmassa on vähiten kolikoita.", "Count the coins. The cheapest has the fewest coins.", "Cuenta las monedas. El más barato tiene menos monedas."],
  ka_vihje_kerro: ["Laske, paljonko kaikki pussit maksavat yhteensä. Esimerkiksi kaksi pussia, jotka maksavat neljä euroa, maksavat kahdeksan euroa.", "Work out what all the bags cost together. For example two bags at four euros cost eight euros.", "Calcula cuánto cuestan todas las bolsas juntas. Por ejemplo, dos bolsas de cuatro euros cuestan ocho euros."],

  // 2 Hinta
  ka_ostit: ["Ostit", "You bought", "Compraste"],
  ka_ne_maksoivat: ["Ne maksoivat", "They cost", "Costaron"],
  ka_mika_hinta: ["Millä hinnalla saat eniten rahaa?", "Which price brings the most money?", "¿Con qué precio ganas más dinero?"],
  ka_halpa_kannatti: ["Nyt halpa hinta kannatti, koska ostajia tuli paljon.", "This time the low price paid off, because lots of buyers came.", "Esta vez el precio bajo valió la pena, porque vinieron muchos compradores."],
  ka_kallis_kannatti: ["Kallis hinta kannatti, vaikka ostajia tuli vähemmän. Jokaisesta keksistä sai enemmän.", "The high price paid off, even though fewer buyers came. Each cookie brought more.", "El precio alto valió la pena aunque vinieron menos compradores. Cada galleta dio más."],
  ka_keski_kannatti: ["Paras hinta ei ollut liian halpa eikä liian kallis.", "The best price was not too cheap and not too dear.", "El mejor precio no era ni muy barato ni muy caro."],
  ka_vihje_pino: ["Katso kolikkopinoja. Missä on eniten kolikoita?", "Look at the piles of coins. Where are the most coins?", "Mira los montones de monedas. ¿Dónde hay más?"],
  ka_vihje_hinta: ["Jokainen ostaja maksaa hinnan verran. Laske ostajat kertaa hinta.", "Every buyer pays the price. Count the buyers times the price.", "Cada comprador paga el precio. Cuenta compradores por precio."],
  ka_vihje_loppuu: ["Muista, että keksit voivat loppua. Silloin loput ostajat eivät saa mitään.", "Remember that the cookies can run out. Then the other buyers get nothing.", "Recuerda que las galletas se pueden acabar. Entonces los demás no reciben nada."],

  // 3 Mainos
  ka_hinta_on: ["Keksin hinta on", "A cookie costs", "Una galleta cuesta"],
  ka_mainos_maksaa: ["Mainos maksaa", "An advert costs", "Un anuncio cuesta"],
  ka_kannattaako: ["Kannattaako mainostaa?", "Is an advert worth it?", "¿Vale la pena anunciarse?"],
  ka_montako_mainosta: ["Montako mainosta kannattaa ostaa?", "How many adverts are worth buying?", "¿Cuántos anuncios vale la pena comprar?"],
  ka_mainos_kannattaa: ["Mainos toi lisää ostajia, ja rahaa jäi enemmän.", "The advert brought more buyers, and more money was left.", "El anuncio trajo más compradores y quedó más dinero."],
  ka_mainos_ei_kannata: ["Nyt mainos ei kannattanut. Se maksoi enemmän kuin toi.", "This time the advert didn't pay off. It cost more than it brought.", "Esta vez el anuncio no valió la pena. Costó más de lo que trajo."],
  ka_vihje_mainos: ["Keltaiset kolikot tulevat ostajilta. Punaiset kolikot menevät mainoksiin. Missä jää eniten?", "The yellow coins come from buyers. The red coins pay for adverts. Where is the most left?", "Las monedas amarillas vienen de los compradores. Las rojas pagan los anuncios. ¿Dónde queda más?"],
  ka_vihje_mainos_laske: ["Jokainen uusi ostaja tuo hinnan verran rahaa. Kannattaako mainos, joka tuo vähemmän kuin maksaa?", "Every new buyer brings the price in money. Is an advert worth it if it brings less than it costs?", "Cada comprador nuevo trae el precio en dinero. ¿Vale un anuncio que trae menos de lo que cuesta?"],

  // 4 Oma kauppa
  ka_oma_alku: ["Nyt sinulla on oma keksikauppa ja kymmenen euroa.", "Now you have your own cookie shop and ten euros.", "Ahora tienes tu propia tienda de galletas y diez euros."],
  ka_saasta: ["Säästä", "Save", "Ahorra"],
  ka_euroa_pyoraan: ["euroa polkupyörään.", "euros for a bike.", "euros para una bici."],
  ka_ohje: ["Osta keksejä, valitse hinta ja mainokset, ja avaa kauppa vihreästä napista.", "Buy cookies, choose the price and the adverts, and open the shop with the green button.", "Compra galletas, elige el precio y los anuncios, y abre la tienda con el botón verde."],
  ka_paiva: ["Päivä", "Day", "Día"],
  ka_ei_rahaa: ["Rahat eivät riitä.", "You don't have enough money.", "No tienes suficiente dinero."],
  ka_ei_enempaa: ["Mainoksia ei mahdu enempää.", "There is no room for more adverts.", "No caben más anuncios."],
  ka_mainos: ["mainos.", "advert.", "anuncio."],
  ka_mainosta: ["mainosta.", "adverts.", "anuncios."],
  ka_nain_moni: ["Näin moni tulee ostamaan:", "This many will come to buy:", "Tantos vendrán a comprar:"],
  ka_osta_ensin: ["Osta ensin keksejä. Isossa pussissa yksi keksi on halvin.", "Buy some cookies first. In the big bag one cookie is the cheapest.", "Primero compra galletas. En la bolsa grande cada galleta es más barata."],
  ka_auki: ["Kauppa on auki!", "The shop is open!", "¡La tienda está abierta!"],
  ka_myit: ["Myit", "You sold", "Vendiste"],
  ka_voittoa: ["Voittoa tuli", "The profit was", "La ganancia fue de"],
  ka_tappiota: ["Tappiota tuli", "The loss was", "La pérdida fue de"],
  ka_nolla: ["Rahaa ei tullut eikä mennyt.", "No money came in or went out.", "No ganaste ni perdiste dinero."],
  ka_loppui: ["Keksit loppuivat kesken, ja osa ostajista lähti ilman. Osta enemmän keksejä.", "The cookies ran out and some buyers left with nothing. Buy more cookies.", "Se acabaron las galletas y algunos se fueron sin nada. Compra más galletas."],
  ka_kallis: ["Hinta oli korkea, joten vain harva tuli. Mainos tuo lisää ostajia.", "The price was high, so only a few came. An advert brings more buyers.", "El precio era alto, así que vinieron pocos. Un anuncio trae más compradores."],
  ka_halpa: ["Halvalla tuli paljon ostajia, mutta yhdestä keksistä jäi vähän rahaa.", "The low price brought many buyers, but each cookie left little money.", "El precio bajo trajo muchos compradores, pero cada galleta dejó poco dinero."],
  ka_jai: ["Ylijääneet keksit säilyvät huomiseen.", "The cookies left over keep until tomorrow.", "Las galletas que sobran se guardan para mañana."],
  ka_sinulla_on: ["Sinulla on", "You have", "Tienes"],
  ka_tavoite_ok: ["Hurraa! Säästit tarpeeksi polkupyörään!", "Hooray! You saved enough for the bike!", "¡Hurra! ¡Ahorraste lo suficiente para la bici!"],
  ka_tavoite_ei: ["Polkupyörään ei vielä riittänyt. Kokeile uudestaan!", "Not enough for the bike yet. Try again!", "Todavía no alcanza para la bici. ¡Inténtalo otra vez!"],
  ka_vihje_kauppa: ["Älä myy liian halvalla tai liian kalliilla. Katso, montako ostajaa jonottaa kadulla, ja osta sen verran keksejä. Mainos tuo lisää ostajia.", "Don't sell too cheap or too dear. See how many buyers wait on the street, and buy that many cookies. Adverts bring more buyers.", "No vendas ni muy barato ni muy caro. Mira cuántos compradores esperan en la calle y compra esas galletas. Los anuncios traen más compradores."],
};

function clips(i: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(TEXT)) out[k] = TEXT[k][i];
  return out;
}

const fiPath = "voice/fi.json";
const fi = JSON.parse(fs.readFileSync(fiPath, "utf8"));
for (const k of Object.keys(fi.clips)) if (k.startsWith("ka_") || k === "peli_kauppa") delete fi.clips[k];
Object.assign(fi.clips, clips(0));
fs.writeFileSync(fiPath, JSON.stringify(fi, null, 1) + "\n");
["en", "es"].forEach((lang, j) => {
  const doc = { _comment: "Oma kauppa (games/kauppa): generated by tools/kauppa/gen-voice.ts, same ids as voice/fi.json.", lang, clips: clips(j + 1) };
  fs.writeFileSync("voice/" + lang + "/kauppa.json", JSON.stringify(doc, null, 1) + "\n");
});
console.log("ka clips:", Object.keys(TEXT).length, "per language");
