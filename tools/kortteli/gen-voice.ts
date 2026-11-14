// node --experimental-strip-types tools/kortteli/gen-voice.ts
// Writes the speech of Mansepoli and Hesapoli (games/mansepoli, games/hesapoli):
// the shared kt_ clips, each game's street clips (mp_k_N, hp_k_N, from the
// game's lib/theme.ts), mp_kioski and peli_mansepoli, peli_hesapoli into
// voice/fi.json, and voice/en/kortteli.json, voice/es/kortteli.json.
// Numbers (the dice) are the shared clips n1…
import * as fs from "node:fs";
import { THEME as MANSE } from "../../games/mansepoli/lib/theme.ts";
import { THEME as HESA } from "../../games/hesapoli/lib/theme.ts";

type T = [string, string, string];   // fi, en, es
const TOK: T[] = [["Auto", "Car", "El coche"], ["Raketti", "Rocket", "El cohete"], ["Ankka", "Duck", "El pato"], ["Kilpikonna", "Turtle", "La tortuga"]];
const TURN: T[] = [["Auton vuoro.", "Car's turn.", "Turno del coche."], ["Raketin vuoro.", "Rocket's turn.", "Turno del cohete."],
  ["Ankan vuoro.", "Duck's turn.", "Turno del pato."], ["Kilpikonnan vuoro.", "Turtle's turn.", "Turno de la tortuga."]];
const RENT: T[] = [["Tontti on Auton. Maksa vuokraa.", "This plot is the Car's. Pay rent.", "El terreno es del coche. Paga el alquiler."],
  ["Tontti on Raketin. Maksa vuokraa.", "This plot is the Rocket's. Pay rent.", "El terreno es del cohete. Paga el alquiler."],
  ["Tontti on Ankan. Maksa vuokraa.", "This plot is the Duck's. Pay rent.", "El terreno es del pato. Paga el alquiler."],
  ["Tontti on Kilpikonnan. Maksa vuokraa.", "This plot is the Turtle's. Pay rent.", "El terreno es de la tortuga. Paga el alquiler."]];
const CARD: Record<string, T> = {
  loysit: ["Löysit kadulta viisikymmentä euroa!", "You found fifty euros in the street!", "¡Encontraste cincuenta euros en la calle!"],
  synttarit: ["Synttärit! Jokainen antaa sinulle kaksikymmentä euroa.", "Birthday! Everyone gives you twenty euros.", "¡Cumpleaños! Todos te dan veinte euros."],
  pyora: ["Pyörä hajosi. Korjaus maksaa neljäkymmentä euroa.", "Your bike broke. The repair costs forty euros.", "Se rompió tu bici. Arreglarla cuesta cuarenta euros."],
  piirustus: ["Voitit piirustuskilpailun! Saat sata euroa.", "You won the drawing contest! You get one hundred euros.", "¡Ganaste el concurso de dibujo! Recibes cien euros."],
  lahtoon: ["Mene lähtöruutuun ja ota sataviisikymmentä euroa.", "Go to the start and take one hundred and fifty euros.", "Ve a la salida y toma ciento cincuenta euros."],
  vankilaan: ["Poliisi! Mene suoraan vankilaan.", "Police! Go straight to jail.", "¡Policía! Ve directo a la cárcel."],
  peruuta: ["Peruuta kolme askelta.", "Go back three steps.", "Retrocede tres pasos."],
  vapaa: ["Vapaakortti! Sillä pääset pois vankilasta.", "A free card! It gets you out of jail.", "¡Tarjeta libre! Te saca de la cárcel."],
  puistoon: ["Hyppää puistoon!", "Jump to the park!", "¡Salta al parque!"],
  jaatelo: ["Jäätelöä kaikille! Anna jokaiselle kymmenen euroa.", "Ice cream for everyone! Give everyone ten euros.", "¡Helado para todos! Da diez euros a cada uno."],
};
const TEXT: Record<string, T> = {
  peli_mansepoli: ["Mansepoli", "Mansepoli", "Mansepoli"],
  peli_hesapoli: ["Hesapoli", "Hesapoli", "Hesapoli"],
  mp_kioski: ["Makkarakoju! Mustamakkara maksaa kaksikymmentä euroa.", "The sausage stand! A black sausage costs twenty euros.", "¡El puesto de morcilla! Una morcilla cuesta veinte euros."],
  kt_heita: ["Heitä nopat! Napauta noppia.", "Throw the dice! Tap them.", "¡Tira los dados! Tócalos."],
  kt_tuplat: ["Tuplat!", "Doubles!", "¡Dobles!"],
  kt_uudestaan: ["Tuplat! Heitä uudestaan.", "Doubles! Throw again.", "¡Dobles! Tira otra vez."],
  kt_kolmet_tuplat: ["Kolmet tuplat! Poliisi vie vankilaan.", "Three doubles! The police take you to jail.", "¡Tres dobles! La policía te lleva a la cárcel."],
  kt_lahto: ["Kierros täynnä! Saat sataviisikymmentä euroa.", "A full lap! You get one hundred and fifty euros.", "¡Vuelta completa! Recibes ciento cincuenta euros."],
  kt_osta: ["Haluatko ostaa tämän tontin?", "Do you want to buy this plot?", "¿Quieres comprar este terreno?"],
  kt_ostit: ["Ostit tontin!", "You bought the plot!", "¡Compraste el terreno!"],
  kt_koko: ["Koko kortteli on sinun! Vuokra on nyt tuplana.", "The whole block is yours! The rent is now double.", "¡Toda la manzana es tuya! El alquiler ahora es doble."],
  kt_ei_rahaa: ["Rahat eivät riitä.", "You don't have enough money.", "No tienes suficiente dinero."],
  kt_oma: ["Tämä on oma tonttisi.", "This is your own plot.", "Este es tu terreno."],
  kt_oma_rakenna: ["Oma tonttisi! Rakennetaanko?", "Your own plot! Shall we build?", "¡Tu terreno! ¿Construimos?"],
  kt_valitse_tontti: ["Valitse tontti, jolle rakennat.", "Pick the plot to build on.", "Elige el terreno donde construir."],
  kt_rakennettu_1: ["Maja on valmis!", "The hut is ready!", "¡La cabaña está lista!"],
  kt_rakennettu_2: ["Talo on valmis!", "The house is ready!", "¡La casa está lista!"],
  kt_rakennettu_3: ["Kerrostalo on valmis!", "The block of flats is ready!", "¡El edificio está listo!"],
  kt_hotelli: ["Hotelli on valmis! Nyt vuokra on iso.", "The hotel is ready! Now the rent is big.", "¡El hotel está listo! Ahora el alquiler es grande."],
  kt_myit: ["Rahat loppuivat, joten myit rakennuksia pankille.", "The money ran out, so you sold buildings to the bank.", "Se acabó el dinero y vendiste edificios al banco."],
  kt_kioski: ["Jäätelökioski! Jäätelö maksaa kaksikymmentä euroa.", "The ice cream kiosk! An ice cream costs twenty euros.", "¡La heladería! Un helado cuesta veinte euros."],
  kt_puisto: ["Löysit puistosta lompakon!", "You found a wallet in the park!", "¡Encontraste una cartera en el parque!"],
  kt_lepo: ["Lepotauko puistossa.", "A rest in the park.", "Un descanso en el parque."],
  kt_poliisi: ["Poliisi! Nyt mennään vankilaan.", "Police! Off to jail.", "¡Policía! A la cárcel."],
  kt_vankilaan: ["Olet vankilassa.", "You are in jail.", "Estás en la cárcel."],
  kt_vankilassa: ["Olet vankilassa. Heitä tuplat, käytä vapaakortti tai maksa viisikymmentä euroa.", "You are in jail. Roll doubles, use a free card or pay fifty euros.", "Estás en la cárcel. Saca dobles, usa una tarjeta libre o paga cincuenta euros."],
  kt_ei_tuplia: ["Ei tuplia. Odota vankilassa.", "No doubles. Wait in jail.", "No hay dobles. Espera en la cárcel."],
  kt_tuplat_vapaa: ["Tuplat! Pääsit vapaaksi.", "Doubles! You are free.", "¡Dobles! Estás libre."],
  kt_kolmas: ["Kolmas yritys. Maksoit ja pääset lähtemään.", "Third try. You paid and can go.", "Tercer intento. Pagaste y puedes salir."],
  kt_vapaa: ["Pääsit vapaaksi! Heitä nopat.", "You are free! Throw the dice.", "¡Estás libre! Tira los dados."],
  kt_vierailu: ["Vierailet vankilassa.", "Just visiting the jail.", "Solo visitas la cárcel."],
  kt_yllatys: ["Yllätyskortti!", "A surprise card!", "¡Una tarjeta sorpresa!"],
  kt_peli_loppui: ["Peli loppui.", "The game is over.", "Se acabó el juego."],
  kt_kuka_pelaa: ["Kuka pelaa? Valitse pelaajat.", "Who plays? Choose the players.", "¿Quién juega? Elige los jugadores."],
  kt_ohje: ["Heitä kahta noppaa ja kulje katua pitkin. Osta tontteja ja rakenna niille taloja. Kun joku pysähtyy sinun tontillesi, hän maksaa sinulle vuokraa. Rikkain voittaa!",
    "Throw two dice and go along the street. Buy plots and build houses on them. When someone stops on your plot, they pay you rent. The richest wins!",
    "Tira dos dados y avanza por la calle. Compra terrenos y construye casas. Cuando alguien para en tu terreno, te paga alquiler. ¡Gana el más rico!"],
};
for (let k = 0; k < 4; k++) {
  TEXT["kt_vuoro_" + k] = TURN[k];
  TEXT["kt_vuokra_" + k] = RENT[k];
  TEXT["kt_voitti_" + k] = [TOK[k][0] + " voitti!", "The " + TOK[k][1] + " wins!", "¡" + TOK[k][2] + " gana!"];
}
// street names are Finnish in every language; the English and Spanish voices get them without ä and ö
const ascii = (x: string) => x.replace(/ä/g, "a").replace(/ö/g, "o").replace(/Ä/g, "A").replace(/Ö/g, "O");
for (const th of [MANSE, HESA]) th.streets.forEach((name: string, k: number) => { TEXT[th.voice + "_k_" + k] = [name, ascii(name), ascii(name)]; });
for (const id of Object.keys(CARD)) TEXT["kt_y_" + id] = CARD[id];

function clips(i: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(TEXT)) out[k] = TEXT[k][i];
  return out;
}
const fiPath = "voice/fi.json";
const fi = JSON.parse(fs.readFileSync(fiPath, "utf8"));
for (const k of Object.keys(fi.clips)) if (/^(kt_|mp_k_|hp_k_|mp_kioski$)/.test(k) || ["peli_kortteli", "peli_mansepoli", "peli_hesapoli"].includes(k)) delete fi.clips[k];
Object.assign(fi.clips, clips(0));
fs.writeFileSync(fiPath, JSON.stringify(fi, null, 1) + "\n");
["en", "es"].forEach((lang, j) => {
  const doc = { _comment: "Mansepoli and Hesapoli (games/mansepoli, games/hesapoli): generated by tools/kortteli/gen-voice.ts, same ids as voice/fi.json.", lang, clips: clips(j + 1) };
  fs.writeFileSync("voice/" + lang + "/kortteli.json", JSON.stringify(doc, null, 1) + "\n");
});
console.log("clips:", Object.keys(TEXT).length, "per language");
