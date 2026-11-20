# RangerDOM-renderöijä

Pelin 2D-näkymä voidaan asetella ja piirtää myös
[RangerDOMin](https://github.com/terotests/RangerDOM) kautta, samalla tavalla
kuin M-Files UI Extensionit tekevät: pelin skriptillä on oikea DOM
(RangerDOMin `webapi.js`), CSS-kaskadi on DOMin oma, ja sivun render tree
asetellaan EVG:llä (RangerDOMin `DomPage` / `DomView`).

- **Web ja Sliqtly Games:** EVG on oletus (2026-11-18). `rg_web.wasm` on
  EVG-moottori ja `rg_web_dom.wasm` RangerDOM-moottori (`?dom=1`);
  `rg_web_evg.wasm` on kopio EVG-moottorista vanhoille `?evg=1`-linkeille.
- **Puhelin:** APK:ssa ovat molemmat, oletus on EVG (2026-11-18: RangerDOMin täydet ruudut jumittivat puhelimessa 1–6 s). Valikon ⚙️-asetuksissa
  on kohta *Pelimoottori: EVG / RangerDOM*.
- Valinta (`rg.setRenderer("dom" | "evg")`, asetus `renderer`) koskee kaikkia
  pelejä ja käynnistää käynnissä olevan pelin uudelleen. `rg.renderer` kertoo
  käytössä olevan ja `rg.renderers` saatavilla olevat moottorit.

## Miten se kulkee

```text
 game.tsx: tick(), view()  ── runtime.js tekee puun {t, id, cls, a, s, c} kuten ennenkin
        │
        ▼  js/dom.js: puu document.bodyyn (edellisen ruudun elementit pidetään ja muutetaan)
 RangerDOM webapi.js (samassa CErXes-moottorissa): CSS-kaskadi, getComputedStyle, render tree
        │  __renderDelta(): vain muuttuneet solmut
        ▼
 rg_web_dom (dom.rs): DomPage → EVG-elementit → EVGLayout → laatikot takaisin (__layout)
        │  EVG display list → moottorin piirtovirta (draw_command!)
        ▼
 painter.js piirtää kuten ennenkin; äänet, 3D, vesi, tallennus ym. kulkevat entisellään
```

- Kosketus: EVG:n osumatesti antaa sivun solmun, `dom.js` etsii siitä
  ylöspäin elementin, jolla on käsittelijä (`onClick` ym.).
- `rg.box`: `getBoundingClientRect()` aseteltuun sivuun.
- EVG:n omat oletukset on annettu CSS:nä (`div` on flex-sarake,
  `position: absolute` on suhteessa vanhempaan), ja `shadow-color`,
  `shadow-offset-*`, `shadow-radius` muutetaan `box-shadow`:ksi.
- `<path d fill stroke viewBox>` on laatikko, jossa on `<svg><path>`.
- Kuvat: sivu nimeää ne osoitteella, moottori kertoo koon (PNG, JPEG, GIF)
  virtuaalihakemistosta.

## Tiedostot

| Polku | Mitä |
| --- | --- |
| `scripts/setup-dom.sh` | RangerDOM ja sen tarvitsema uudempi EVG hakemistoon `.deps/` (`.deps/domtree`) |
| `crates/rg_engine/src/js/dom.js` | puu DOMiin, osumat, `rg.box` |
| `crates/rg_engine/src/lib.rs` | `DomBackend`-rajapinta; `Engine::dom` (None = EVG suoraan) |
| `crates/rg_web_dom/` | oma Cargo-työtila: `dom.rs` (renderöijä), `lib.rs` (sama C ABI kuin rg_web), `examples/domtest.rs` |
| `crates/rg_web_dom/android/` | Android-moottori (rg_android:n `jni.rs`) RangerDOMilla; `build-android.sh` käyttää sitä, kun `.deps/domtree` on olemassa (`RG_NO_DOM=1` ohittaa) |

Rakentaminen: `bash scripts/setup.sh && bash scripts/setup-dom.sh && bash scripts/build-web.sh`
(build-web tekee RangerDOM-moottorin, kun `.deps/domtree` on olemassa).
Kaikki pelit ilman ruutua molemmilla renderöijillä:

```sh
cd crates/rg_web_dom && CARGO_TARGET_DIR=../../target/dom cargo run --release --example domtest -- ../../games 120
```

## Mittaukset (2026-11-17, natiivi x86, 58 peliä)

- Kaikki 58 peliä käynnistyvät ja pyörivät ilman virheitä.
- Käynnistys: noin 75–140 ms (EVG-polulla 8–50 ms). Lisä on `webapi.js`:n
  (15 000 riviä) ajaminen joka pelin alussa.
  2026-11-20: `webapi.js` käännetään build-aikana CErXes-unitiksi
  (`crates/rg_web_dom/build.rs`), ja käynnistys ajaa sen: `webapi.js`:n osuus
  64 ms → 22 ms, 58 pelin käynnistykset yhteensä 5,2 s → 2,8 s.
- Ruutu, joka ei muutu: noin 0,2 ms. Ruutu, jossa paljon muuttuu
  (näkymän vaihto): 10–30 ms, josta melkein kaikki on DOMin tyylilaskentaa
  ja render treen tekemistä JS:ssä; EVG:n asettelu on alle 1 ms.
- `rg_web_dom.wasm` 7,9 MB (`rg_web.wasm` 5,6 MB).
- Valikko, jossa kuplat ja ruudut liikkuvat joka ruutu ja sivu skrollaa:
  21 ms ruudulta, kun `dom.js` kirjoitti koko style-attribuutin; 8 ms, kun se
  asettaa vain muuttuneet ominaisuudet (`el.style.setProperty`), jolloin
  RangerDOM paikkaa elementin entistä tyyliä (EVG-polulla 2 ms).
  `DOMTEST_SCROLL=1` vetää sivua domtestissä.

## Hyvää ja huonoa EVG-polkuun verrattuna

Hyvää:
- Oikea CSS: spesifisyys, yhdistetyt valitsimet, periytyminen ja
  `getComputedStyle` toimivat kuten selaimessa (EVG-polussa järjestys
  ratkaisee, ja `.a.b` on paikattu erikseen).
- Pelin koodilla on DOM: `document`, tapahtumat, `querySelector`, ja samalla
  pohjalla toimivat React, Preact ja Vue (RangerDOM ajaa niitä jo).
  Sliqtly Gamesin pelit voisivat käyttää tavallista web-koodia.
- Sama tie kuin M-Files UI Extensioneissa: yksi DOM-toteutus ylläpidettävänä.
- Uudempi EVG (z-index, sticky, svg-kuvat, varjot).

Huonoa:
- Hitaampi: näkymän vaihto maksaa 10–30 ms natiivisti, vanhalla puhelimella
  moninkertaisesti (puhelimessa käytännössä riittävän nopea).
- Isompi wasm ja hitaampi käynnistys.
- Kaksi EVG-versiota rinnakkain, kunnes moottorin oma EVG päivitetään
  samaan versioon.
- Fontit ja rivikorkeudet poikkeavat vähän (lihavointi näkyy oikeasti
  lihavana, rivit ovat hieman korkeampia).

## Nopea reitti ja puhelinmittaukset (2026-11-18)

Kun ruudussa muuttuvat vain inline-arvot, jotka eivät muuta rakennetta
(absoluuttisen laatikon `left/top/right/bottom/width/height`,
`border-radius`, transform, flex-lapsen marginaalit ja koko, näkyvä
taustaväri, läpinäkyvyys välillä 0–1, elementin ainoa teksti),
`dom.js` lähettää muutokset paikkauksina ja `dom.rs` kirjoittaa ne
asetelluille EVG-elementeille (EVGRetain) ilman DOMia. DOM saa arvot
seuraavassa täydessä ruudussa. `RG_DOMCHECK=1` vertaa jokaista nopeaa
ruutua täyteen reittiin (domtest: kaikki samat), `RG_DOMFULL=1` ottaa
reitin pois. Moottori kirjoittaa 120 ruudun välein lokiin rivin
`perf <peli> dom|evg: …` (puhelimessa logcat).

Huawei EML-L29, ms/ruutu keskiarvo (pahin):

| Peli | EVG | RangerDOM |
| --- | --- | --- |
| Launcher | 8,8 (13) | 13,8 (2 097) |
| Pallopolku | 4,8 (50) | 8,9 (907) |
| Talot | 5,0 (82) | 9,6 (224) |
| Kanada-malja | 10,4 (30) | 23,2 (6 080) |
| Haamujahti | 12,5 (30) | 43,5 (2 888) |
| Nappulasota | 13,9 | 15,6 |

Jumien syy oli kaksi muistivuotoa, joiden takia CErXesin koko keon
läpikäyvä roskienkeruu kesti yhä kauemmin:

- RangerDOMin paikattu tyyli (`diffFrom`) piti viitteen edelliseen
  tyyliin ja se omaansa, joten jokaisen ruudun koko laskettu tyyli jäi
  muistiin (Kanada-maljassa ~40 000 objektia minuutissa). Korjattu
  RangerDOMissa (26a6f8c).
- Nopean reitin jono (`pending` dom.js:ssä) kasvoi joka ruudulla, kun
  peli animoi ilman täyttä ruutua, ja seuraava täysi ruutu ajoi kaikki
  kymmenet tuhannet muutokset kerralla. Nyt jonossa on yksi arvo
  elementtiä ja ominaisuutta kohden.

Korjausten jälkeen Kanada-maljan elävä keko pysyy 22 000 objektissa
(ennen 97 000 / 3 000 ruutua) ja koko keräys kestää koneella 10 ms
(ennen 30 ms ja kasvoi). EVG:llä keko on noin 2 000 objektia.
domtestissä `DOMTEST_HEAP=<n>` tulostaa keon n ruudun välein,
`DOMTEST_CENSUS=1` elävät objektit lajeittain ja `DOMTEST_SLOW=<ms>`
hitaat ruudut.
