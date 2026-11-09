# Pelit

Jokainen kansio on yksi peli (`game.json`, `game.tsx`, `style.css`). Moottori listaa ne valikkoon, ja valikkoa voi vierittää sormella. Jokaisen pelin oikeassa yläkulmassa on ✕, josta pääsee takaisin valikkoon.

Kuvat on otettu web-versiosta (360 × 720) komennolla `node tools/shot.js`, ja ne ovat kansiossa [`docs/screenshots`](../docs/screenshots).

| | Peli | Kansio | Mitä siinä tehdään |
|---|---|---|---|
| <img src="../docs/screenshots/launcher.png" width="160"> | **Valikko** | `launcher` | Kaikki pelit ruutuina. Napauta peliä, ja se käynnistyy. |
| <img src="../docs/screenshots/pupu.png" width="160"> | **Pupu hyppii** | `pupu` | Pupu hyppii pilveltä toiselle ja kerää porkkanoita. Ohjataan pitämällä sormea vasemmalla tai oikealla puolella. |
| <img src="../docs/screenshots/ristinolla.png" width="160"> | **Ristinolla** | `ristinolla` | Ristinollaa puhelinta tai kaveria vastaan. |
| <img src="../docs/screenshots/laskupeli.png" width="160"> | **Laskupeli** | `laskupeli` | Lasketaan hedelmiä: plussaa ja miinusta, tehtävät luetaan ääneen. |
| <img src="../docs/screenshots/nappikisa.png" width="160"> | **Nappikisa** | `nappikisa` | Kaksinpeli: puhelin on pelaajien välissä, ja se voittaa, joka napauttaa ensin, kun valo vaihtuu. |
| <img src="../docs/screenshots/aakkoset.png" width="160"> | **Aakkoset** | `aakkoset` | Eskari: alkukirjaimet ja kirjainten etsintä. 2. luokka: tavut ja oikea kirjoitusasu. |
| <img src="../docs/screenshots/haamujahti.png" width="160"> | **Haamujahti** | `haamujahti` | 3D-linna ensimmäisestä persoonasta: pahikset (haamut, luurangot, peikot, noita, susi, lohikäärme) muuttuvat tähdiksi, kilttejä eläimiä ja tonttuja ei ammuta, ja ovet aukeavat laskutehtävillä. |
| <img src="../docs/screenshots/pallopolku.png" width="160"> | **Pallopolku** | `pallopolku` | 3D-juoksupeli moottorin omalla 3D-kerroksella (`rg.three`): vaihda kaistaa, hyppää laatikoiden yli ja kerää tähtiä. |
| (ei kuvaa: alkuvalikossa näkyy perheen paikkoja) | **Liikenneretki** | `tampere` | Kävely Tampereen keskustassa: suojatiet, liikennevalot, pyörätiet ja ratikka. Kartta on Tampere Taxi Driverin aineistosta (OSM ja Tampereen kaupunki). |
| <img src="../docs/screenshots/navi.png" width="160"> | **Kotiin** | `navi` | Lapsen kävelynavigaattori: GPS, iso nuoli ja reittiviiva kotiin, kouluun tai päiväkotiin. Toimii ilman nettiä. |
| <img src="../docs/screenshots/vuodenajat.png" width="160"> | **Vuodenajat** | `vuodenajat` | Eläinten vuosi: herätä karhu, valitse jäniksen, kärpän ja riekon turkki vuodenajan mukaan, mitkä linnut lentävät etelään, auta oravaa ja närheä varastoimaan ruokaa, vie eläimet talvipesiin ja onki kesällä veneestä ja talvella pilkillä jään alta. Katsele-tilassa vuodenaikaa vaihdetaan ja eläimiä napautetaan. Kaikki ohjeet puhutaan. |

Seuraavat pelit tehtiin puhelinta varten Macilla, ja ne tulevat tähän listaan, kun ne on viety GitHubiin: Kirjainpallot, Onkipeli, Avaruusretki, Sanaseikkailu ja Kolmården.

Kotien tarkat paikat ovat vain git-ignoroiduissa `places.local.js`-tiedostoissa, ja Kolmårdenin perhekuvat (`perhe/`) eivät koskaan mene repoon.
