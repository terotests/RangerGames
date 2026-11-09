# RangerGames

Pelimoottori ja lasten pelejä puhelimeen, selaimeen ja työpöydälle (myös
Raspberry Pi). Moottori on Rustia: pelien logiikka on TSX:ää, jonka
**CErXes** ajaa, ruutu asetellaan **EVG**:llä HTML + CSS -tyyliin, ja
moottorin alustasta riippumaton ydin on kirjoitettu **Rangerin Rust-osajoukolla**,
joten Ranger kääntää sen myös muille kohteille (JS, C++, Go, Python …).

Pohjana on Rangerin `gallery/game_engine`-moottorin ajatukset (logiikka kerran,
ohut alusta-host, retained UI EVG:llä, TSX-pelit), ei sen koodi 1:1.

```text
 alusta (web / Android / CLI) ──syöte──► Engine::frame
                                            │  CErXes: tick(dt, input), view()  (pelin game.tsx)
                                            │  → elementtipuu (JSX) + komennot (ääni, värinä, tallennus, 3D)
                                            │  EVG: CSS-kaskadi, layout, display list, osumatesti
 alusta ◄── piirtovirta (f32 + merkkijonot), komennot ──┘
```

## Hakemistot

| Polku | Mitä |
| --- | --- |
| `crates/rg_core` | Ydin Rangerin Rust-osajoukolla (`use ranger::prelude::*`): virtuaalinen resurssihakemisto (VFS, `.rgpk`-paketit, kirjoitettava `/save`), JSON, syöte (kosketus/hiiri/näppäimet), host-komennot, siemenellinen satunnaislukugeneraattori. Kääntyy cargolla **ja** `rgrc`:llä. |
| `crates/rg_evg` | EVG (Rangerin `lib/evg`) Rust-craten muodossa: `build.rs` kääntää sen `rgrc`:llä. |
| `crates/rg_engine` | Moottori: CErXes + EVG + rg_core. Pelin ajonaikainen API (`js/runtime.js`), UI-puu → EVG, piirtovirta (`draw.rs`). |
| `crates/rg_web` | Moottori WebAssemblynä (`wasm32-wasip1`, C ABI) selaimelle. |
| `crates/rg_android` | Moottori natiivina kirjastona (NDK, JNI) Android-sovellukselle: ei WebViewiä eikä WebAssemblyä, toimii vanhoillakin puhelimilla. |
| `crates/rg_cli` | Moottori ilman ruutua: `pack`, `run`, `test` (CI ajaa kaikki pelit). |
| `crates/chimera`, `crates/rg_voice` | Puhesyntetisaattori (CHIMERA, MIT) ja suomen ääntäminen; renderöi `voice/fi.json`:n klipit `rg.say`:lle. |
| `web/` | Selain-host: canvas-maalari, WebAudio-äänet (syntetisoidut efektit ja pikku melodiat), värinä, tallennus localStorageen, Three.js-kerros, PWA. |
| `android/` | Android-sovellus natiivisti: Java-host piirtää moottorin piirtovirran Canvasille (`Painter`), syntetisoi äänet AudioTrackilla (`Sound`), värinä, tallennukset ja Takaisin-nappi. |
| `games/` | Pelit: kukin oma kansio (`game.json`, `game.tsx`, `style.css`, kuvat, äänet). |

## Pelit

| Peli | Mitä |
| --- | --- |
| `pupu` – **Pupu hyppii** | Hyppelypeli: pupu pomppii pilviltä toisille, porkkanoita, jouset, särkyvät ja liikkuvat pilvet, taivas muuttuu illaksi ja yöksi. Ohjaus: pidä sormea vasemmalla/oikealla puolella (tai nuolinäppäimet). |
| `ristinolla` – **Ristinolla** | Kaverin kanssa samalla puhelimella tai puhelinta vastaan (helppo vastustaja, jonka lapsi voi voittaa). |
| `laskupeli` – **Laskupeli** | Opetuspeli: hedelmien laskeminen, plussa 1–5, plussa 1–10, miinus; tähdet ja ennätykset. |
| `nappikisa` – **Nappikisa** | Kaksinpeli: puhelin pöydällä pelaajien välissä, kumpi napauttaa ensin kun valo vaihtuu vihreäksi. Yläpuoli on käännetty vastapuolen pelaajalle. |
| `haamujahti` – **Haamujahti** | 3D-labyrintti (raycasting EVG:llä): ammu haamut taikatähdillä, avaa lukitut ovet laskutehtävillä, kolme kerrosta ja lopussa Mörkö. Ohjaus: nuolinapit ja tähtinappi (tai nuolinäppäimet ja välilyönti). |
| `tampere` – **Liikenneretki** | Tampereen keskusta (2,4 × 1,4 km) ylhäältä: kävele äidin tai isän luota, koulusta tai päiväkodista puistoon, kouluun, kotiin tai nähtävyydelle. Kadun yli vain suojatietä: valoissa odotetaan vihreää, muualla varotaan autoja, pyörätiellä pyöräilijöitä. Ratikalla (linjat 1 ja 3) voi matkustaa pysäkiltä toiselle. Kartta Tampere Taxi Driverin aineistosta (OSM + Tampereen kaupunki), `tools/tampere/build_map.py`. Ohjaus: pidä sormea siellä, minne haluat kävellä (tai nuolinäppäimet). |
| `navi` – **Kotiin** | Lapsen kävelynavigaattori: puhelimen GPS näyttää paikan Tampereen kartalla, iso nuoli ja reittiviiva ohjaavat isän, äidin, koulun tai päiväkodin luo, värinä ennen käännöstä ja juhlat perillä. Toimii ilman nettiä: kartta (kuvatiilet) ja kävelyverkko tulevat pelin mukana (`tools/navi/build.py` Tampere Taxi Driverin kartasta), reitti lasketaan puhelimessa. Kotien paikat asetetaan puhelimessa (pidä ⚙️ painettuna) tai git-ignoroidussa `games/navi/places.local.js`:ssä, ei koskaan repoon. |
| `luut` – **Kenen luut?** | Oikea valokuva eläimen pääkallosta tai luurangosta ja neljä eläintä vaihtoehdoiksi (eläinten kuvat ja nimet, nimi sanotaan ääneen). 44 eläintä, 109 luukuvaa. Kierroksen alussa väärät vaihtoehdot ovat eri eläinryhmistä, lopussa samasta (kissa vai koira), mutta toistensa näköisiä (kissa/leijona/tiikeri, koira/susi/kettu …) ei koskaan näytetä yhdessä. Kaikki kuvat Wikimedia Commonsista (CC0 / public domain / CC BY / CC BY-SA): tekijä ja lisenssi näkyvät kuvan alla ja pelin Kuvat-sivulla, lista `games/luut/CREDITS.md`. Kuvat haetaan `tools/luut/fetch_commons.py`:llä ja rakennetaan `tools/luut/build.py`:llä (valinnat `tools/luut/pick.json`). |
| `kopteri` – **Kopterilento** | Maantietoa helikopterilla. Tampere ylhäältä (Liikenneretken kartta): etsi Näsinneula, tuomiokirkko, rautatieasema, Tammerkoski … (kotien paikat eivät ole mukana). Maapallo: ensin mantereet (jokaisella oma väri ja muoto tehtäväkortissa, joten lukutaitoa ei tarvita), sitten tutut maat, lisää maita ja vaikeat maat. Pallo pyörii kopterin alla, löydöstä pisteitä (nopeasta enemmän), ja hetken päästä nuoli näyttää suunnan (❓ heti). Ohjaus: pidä sormea sinne, minne haluat lentää (tai nuolinäppäimet), ➕/➖ zoomaa. Maiden rajat: Natural Earth (public domain), `tools/kopteri/build.py`. |
| `vuodenajat` – **Vuodenajat** | Suomen eläinten vuosi yhdessä maisemassa (metsänreuna ja järvi pohjaan asti): talvi- ja kesäturkit (jänis, kärppä, riekko), talvipesät (karhu, siili, mäyrä, sammakko, orava), ruokavarastot (orava, närhi), muuttolinnut, onkiminen veneestä kesällä ja pilkkiminen talvella (made kutee jään alla). Ohjeet puhutaan, joten lukutaitoa ei tarvita. Kuvat ovat omia piirroksia (`tools/vuodenajat/art.js` → `render.js`), kalat Onkipelistä; puheet `tools/vuodenajat/voice.js` → `voice/fi.json`. |
| `muutto` – **Muuttolintu** | Vuodenajat ja aurinko muuttolinnun silmin. Valitse laji (laulujoutsen ⇄ Tanska, kurki ⇄ Etiopia, haarapääsky ⇄ Etelä-Afrikka, lapintiira ⇄ Etelämanner) ja lennä keväällä Suomeen pesimään, ruoki poikaset ja lennä syksyllä takaisin. Vuosi kulkee nopeasti lentäessä: maapallolla lumi sulaa ja tulee, kevään vihreä ja syksyn ruska kulkevat leveyspiirejä pitkin, ja valaistus on keskipäivä linnun kohdalla, joten talven puoleinen napa on pimeässä. Pieni ikkuna näyttää maapallon kiertämässä aurinkoa akseli aina samaan suuntaan kallellaan (napauta: aurinko selitetään ääneen). Pisteet näyttävät lajin oikean reitin, ruoka matkalla antaa voimia, lumessa tulee kylmä. Ohjaus kuin Kopterilennossa. `tools/muutto/build.py`. |
| `launcher` | Pelivalikko. |

## Aloitus

```sh
bash scripts/setup.sh          # Ranger (+ EVG) ja ComponentEngine (CErXes) hakemistoon .deps/
rustup target add wasm32-wasip1
bash scripts/build-web.sh      # → dist/web
python3 -m http.server -d dist/web 8000   # avaa http://localhost:8000  (?game=pupu, ?debug)
```

Testit:

```sh
cargo test -p rg_core -p rg_engine
cargo run --release -p rg_cli -- test games          # jokainen peli ajetaan ilman ruutua
cargo run --release -p rg_cli -- run games pupu 120 --tap 180,300@5
TARGETS="es6 cpp go python" bash scripts/check-ranger.sh   # rg_core Rangerin osajoukossa + JS-pariteetti
```

### Android (vanha puhelin)

`scripts/build-android.sh` kopioi web-buildin sovelluksen assetteihin ja
kääntää APK:n (vaatii Android SDK:n ja gradlen). Helpoimmin APK syntyy
GitHub Actionsissa: CI:n `android`-jobi tallentaa sen artefaktiksi
**RangerGames-apk**. Asennus: `adb install -r app-release.apk`, tai kopioi
tiedosto puhelimeen ja avaa se (salli kerran "asenna tuntemattomia
sovelluksia").

- `minSdk 24` (Android 7.0). WebView tarvitsee WebAssemblyn (Chrome 57+);
  päivitä *Android System WebView* Play Kaupasta, jos peli ei käynnisty.
- Fontti ja three.js kopioidaan buildissa sovelluksen mukaan, joten pelit
  toimivat ilman verkkoa.
- Toinen tapa: avaa GitHub Pages -osoite puhelimen Chromessa ja valitse
  "Lisää aloitusnäyttöön" (PWA, toimii myös offline).

## Pelin tekeminen

```text
games/oma/
  game.json    { "name": "Oma peli", "icon": "🚀", "color": "#118ab2", "players": "1", "width": 360 }
  game.tsx     tick(dt, input), view() — ja halutessa init, onKeyDown, onPointerDown, onBack
  style.css    EVG:n CSS (flex, position: absolute, border-radius, linear-gradient, varjo, transform …)
  lib/x.ts     import { … } from "lib/x"
  kuvat/a.png  <img src={rg.asset("kuvat/a.png")} />
```

`game.json`: `width` + `height` = kiinteä koko (letterbox), pelkkä `width` =
leveys kiinteä ja korkeus ruudun muodon mukaan, ei kumpaakaan = ruudun
koko CSS-pikseleinä.

Ajonaikainen API (`crates/rg_engine/src/js/runtime.js`):

| | |
| --- | --- |
| `width`, `height` | pelin koko |
| `input.keys`, `input.pointer`, `input.pointers` | syötteen tila (`tick(dt, input)`) |
| `onClick`, `onPointerDown`, `onPointerUp` JSX-elementeissä | napautukset (EVG:n osumatesti) |
| `rg.sound(nimi, {volume, pitch})` | efektit `jump coin click tick pop hit lose win whoosh star wrong note`, tai äänitiedosto pelin kansiosta |
| `rg.say(id \| [id, …], {queue, volume})`, `rg.stopSay()` | suomenkielinen puhe: valmiit klipit `voice/fi.json`:sta, lista sanotaan peräkkäin (`rg.say(["valitse", "punainen"])`). `rg.sayId.number(7)`, `rg.sayId.letter("Ä")`, `rg.sayId.word("Pöllö")` antavat klipin id:n |
| `rg.music("happy" \| "calm" \| "chase" \| tiedosto)`, `rg.stopMusic()` | taustamusiikki |
| `rg.vibrate(ms \| [kuvio])` | värinä |
| `rg.save(avain, arvo)`, `rg.load(avain, oletus)` | tallennus (`/save/<peli>.json` → localStorage / Android) |
| `rg.three(op, args)` | 3D-kerros (three.js): `scene camera light add set remove clear`; `globe` piirtää karttapallon (maiden ääriviivat ortografisena pallona, leikkaus horisontissa Rustissa, ks. `crates/rg_engine/src/globe.rs`) |
| `rg.random()`, `rg.range()`, `rg.pick()`, `rg.shuffle()` | siemenellinen satunnaisuus (sama kaikilla alustoilla kuin rg_core:n `Rng`) |
| `rg.ease.*`, `rg.lerp`, `rg.clamp`, `rg.hit(a, b)` | apufunktiot |
| `rg.launch(id)`, `rg.exit()` | pelistä toiseen / valikkoon |

## Puhe (suomeksi)

Pelit puhuvat, jotta lukutaidoton lapsi pystyy pelaamaan: ohjeet, kehut,
numerot, värit, kirjainten nimet ja Aakkosten kuvasanat. Puhe syntetisoidaan
**CHIMERA**-puhesyntetisaattorilla (Jameson Hodge, MIT,
[chimera-vocal-synth](https://github.com/jamesondh/chimera-vocal-synth)):
se mallintaa fysikaalisesti ilmatiet (keuhkot, äänihuulet, ääntöväylä, huulet,
nenä). Moottori on mukana sellaisenaan (`crates/chimera`), ja
`crates/rg_voice` lisää suomen ääntämissäännöt (kirjoitus → IPA:
kaksoiskirjain = pitkä äänne, `ng` = ŋː, paino ensitavulla, numerot sanoiksi).

Klipit renderöidään etukäteen, joten vanha puhelin vain soittaa ne:

```sh
cargo run --release -p rg_voice -- build voice/fi.json games/_voice/fi   # build-skriptit tekevät tämän
cargo run --release -p rg_voice -- say "Hyvä, osaat!" koe.wav female 215 0.9   # kokeile lausetta
cargo run --release -p rg_voice -- ipa "Käänny vasemmalle."                    # näytä ääntämys
```

Uusi klippi = rivi `voice/fi.json`:iin (`"id": "teksti"`, tai
`{ "text": …, "rate": 0.8, "f0": 240, "body": "child" }`). Äänen asetukset (`voice` tai klippikohtaisesti): `body`, `f0`,
`rate`, `accent` (painollisen tavun sävelnousu), `breathiness`, `drift`,
`roughness`, `tension`, `vibrato` (senttiä), samat kuin CHIMERA-sovelluksen
säätimet. Suomen äänteiden kestot tulevat `rg_voice`:sta (CHIMERAn englannin
Klatt-säännöt lyhentävät painottomat vokaalit liikaa), ja kysymykset laskevat
kuten suomessa. CHIMERA renderöi 48 kHz:llä kuten omassa CLI:ssään (ilmatien
hila ja kalibrointi riippuvat näytetaajuudesta); klipit ovat 24 kHz 16-bittisiä
WAVeja, jotka web-host ja Androidin `Sound.java` purkavat itse.

## Mitä on korjattu Rangerin/EVG:n puolelta (paikattu tässä, ei upstreamissa)

`crates/rg_evg/build.rs` paikkaa Rangerin Rust-kirjoittimen tuottamaa EVG-koodia:

1. `EVGLayout::layout` lainasi samaa `RefCell`iä kahdesti (`&mut … borrow_mut()` kahdessa argumentissa) → paniikki joka layoutissa.
2. Elementin oletusväri oli *asetettu* musta, joten `color` ei periytynyt lapsille.

Lisäksi `rg_engine` antaa tekstiajoille periytyvän fonttikoon ennen layoutia
(EVG mittasi leveyttä hakevan laatikon tekstin oletuskoolla 14 px).
Nämä kannattaa korjata myös Rangeriin ja EVG:hen.

## Aineistot

- Maiden rajat (Kopterilento, Muuttolintu): [Natural Earth](https://www.naturalearthdata.com/) 1:110m, public domain.
- Tampereen kartta (Liikenneretki, Kotiin, Kopterilento): © OpenStreetMap-tekijät (ODbL), Tampereen kaupunki / Maanmittauslaitos (CC BY 4.0), Tampere Taxi Driverin aineiston kautta.

## Lisenssi

AGPL-3.0-or-later (CErXes on AGPL). `rg_evg` on MIT kuten EVG.
