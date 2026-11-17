# RangerDOM-renderöijä (kokeilu, `?dom=1`)

Pelin 2D-näkymä voidaan asetella ja piirtää myös
[RangerDOMin](https://github.com/terotests/RangerDOM) kautta, samalla tavalla
kuin M-Files UI Extensionit tekevät: pelin skriptillä on oikea DOM
(RangerDOMin `webapi.js`), CSS-kaskadi on DOMin oma, ja sivun render tree
asetellaan EVG:llä (RangerDOMin `DomPage` / `DomView`).

Oletus ei muutu: puhelinbuild ja tavallinen web-versio käyttävät edelleen
moottorin omaa EVG-polkua. RangerDOM on päällä vain, kun sivu avataan
osoitteella `?dom=1` (esim. `index.html?game=shakki&dom=1`), jolloin sivu
lataa `rg_web_dom.wasm`:n `rg_web.wasm`:n sijaan.

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

Rakentaminen: `bash scripts/setup.sh && bash scripts/setup-dom.sh && bash scripts/build-web.sh`
(build-web tekee `rg_web_dom.wasm`:n, kun `.deps/domtree` on olemassa).
Kaikki pelit ilman ruutua molemmilla renderöijillä:

```sh
cd crates/rg_web_dom && CARGO_TARGET_DIR=../../target/dom cargo run --release --example domtest -- ../../games 120
```

## Mittaukset (2026-11-17, natiivi x86, 58 peliä)

- Kaikki 58 peliä käynnistyvät ja pyörivät ilman virheitä.
- Käynnistys: noin 75–140 ms (EVG-polulla 8–50 ms). Lisä on `webapi.js`:n
  (15 000 riviä) ajaminen joka pelin alussa.
- Ruutu, joka ei muutu: noin 0,2 ms. Ruutu, jossa paljon muuttuu
  (näkymän vaihto): 10–30 ms, josta melkein kaikki on DOMin tyylilaskentaa
  ja render treen tekemistä JS:ssä; EVG:n asettelu on alle 1 ms.
- `rg_web_dom.wasm` 7,9 MB (`rg_web.wasm` 5,6 MB).

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
  moninkertaisesti. Siksi puhelin pysyy EVG-polulla.
- Isompi wasm ja hitaampi käynnistys.
- Kaksi EVG-versiota rinnakkain, kunnes moottorin oma EVG päivitetään
  samaan versioon.
- Fontit ja rivikorkeudet poikkeavat vähän (lihavointi näkyy oikeasti
  lihavana, rivit ovat hieman korkeampia).
