# Pelit

Jokainen kansio on yksi peli (`game.json`, `game.tsx`, `style.css`). Moottori listaa ne valikkoon, ja valikkoa voi vierittää sormella. Jokaisen pelin oikeassa yläkulmassa on ✕, josta pääsee takaisin valikkoon.

Kuvat on otettu web-versiosta (360 × 720) komennolla `node tools/shot.js`, ja ne ovat kansiossa [`docs/screenshots`](../docs/screenshots).

| | Peli | Kansio | Mitä siinä tehdään |
|---|---|---|---|
| <img src="../docs/screenshots/launcher.png" width="160"> | **Valikko** | `launcher` | Kaikki pelit ruutuina. Napauta peliä, ja se käynnistyy. |
| <img src="../docs/screenshots/pupu.png" width="160"> | **Pupu hyppii** | `pupu` | Pupu hyppii pilveltä toiselle ja kerää porkkanoita. Ohjataan pitämällä sormea vasemmalla tai oikealla puolella. |
| <img src="../docs/screenshots/ristinolla.png" width="160"> | **Ristinolla** | `ristinolla` | Ristinollaa puhelinta tai kaveria vastaan. |
| <img src="../docs/screenshots/shakki.png" width="160"> | **Shakki** | `shakki` | Shakkia kahdestaan tai puhelinta vastaan (helppo, keskitaso, vaikea). Kaikki säännöt: linnoitus, ohestalyönti, korotus, shakki, matti, patti ja tasapelit. Napautettu nappula näyttää siirtonsa ja sanoo nimensä, 💡 antaa vihjeen ja ↶ perii siirron. Kesken jäänyt peli jatkuu. Nappulat piirretty itse (`tools/shakki/pieces.js`). |
| <img src="../docs/screenshots/laskupeli.png" width="160"> | **Laskupeli** | `laskupeli` | Lasketaan hedelmiä: plussaa ja miinusta, tehtävät luetaan ääneen. |
| <img src="../docs/screenshots/nappikisa.png" width="160"> | **Nappikisa** | `nappikisa` | Kaksinpeli: puhelin on pelaajien välissä, ja se voittaa, joka napauttaa ensin, kun valo vaihtuu. |
| <img src="../docs/screenshots/aakkoset.png" width="160"> | **Aakkoset** | `aakkoset` | Eskari: alkukirjaimet ja kirjainten etsintä. 2. luokka: tavut ja oikea kirjoitusasu. |
| <img src="../docs/screenshots/haamujahti.png" width="160"> | **Haamujahti** | `haamujahti` | 3D-linna ensimmäisestä persoonasta: pahikset (haamut, luurangot, peikot, noita, susi, lohikäärme) muuttuvat tähdiksi, kilttejä eläimiä ja tonttuja ei ammuta, ja ovet aukeavat laskutehtävillä. |
| <img src="../docs/screenshots/pallopolku.png" width="160"> | **Pallopolku** | `pallopolku` | 3D-juoksupeli moottorin omalla 3D-kerroksella (`rg.three`): vaihda kaistaa, hyppää laatikoiden yli ja kerää tähtiä. |
| <img src="../docs/screenshots/peilit.png" width="160"> | **Valopeilit** | `peilit` | Valo-opin peli: aurinko tai taskulamppu loistaa, ja peileillä valo ohjataan kukalle, aurinkopaneelille, päiväunia haluavalle kissalle, kylmälle liskolle tai märälle pyykille, mutta ei päivällä nukkuvalle pöllölle. Napautettu peili kääntyy 22,5°, ja valitun peilin kohdalla näkyy, että tulokulma = heijastuskulma. Puolipeili jakaa valon kahtia, lukittuja peilejä ei voi kääntää, ja lammen yli valo kulkee. 12 tasoa; tähdet sen mukaan, montako peiliä käytti (vähin määrä tarkistetaan `tools/peilit/solve.ts`:llä). |
| <img src="../docs/screenshots/navi.png" width="160"> | **Kotiin** | `navi` | Lapsen kävelynavigaattori: GPS, iso nuoli ja reittiviiva kotiin, kouluun tai päiväkotiin. Toimii ilman nettiä. |
| <img src="../docs/screenshots/vuodenajat.png" width="160"> | **Vuodenajat** | `vuodenajat` | Eläinten vuosi: herätä karhu, valitse jäniksen, kärpän ja riekon turkki vuodenajan mukaan, mitkä linnut lentävät etelään, auta oravaa ja närheä varastoimaan ruokaa, vie eläimet talvipesiin ja onki kesällä veneestä ja talvella pilkillä jään alta. Katsele-tilassa vuodenaikaa vaihdetaan ja eläimiä napautetaan. Kaikki ohjeet puhutaan. |
| <img src="../docs/screenshots/korkeasaari.png" width="160"> | **Korkeasaari** | `korkeasaari` | Suunnistus Korkeasaaren eläintarhassa: etsi eläin kartalta, kävele sen luo sormella tai oikeasti GPS:n kanssa (toimii ilman nettiä), ja vastaa ääneen luettuihin kuvakysymyksiin. Jokaisesta eläimestä saa tarran. 🐣 Eskari / 🎒 Koulu. Kartta ja eläinten paikat © OpenStreetMap-tekijät (ODbL), ks. `tools/korkeasaari`. |
| <img src="../docs/screenshots/luut.png" width="160"> | **Kenen luut?** | `luut` | Oikea valokuva eläimen pääkallosta tai luurangosta, ja neljästä eläimestä valitaan oikea. Kuvat Wikimedia Commonsista (CC/PD), tekijät `games/luut/CREDITS.md`. |
| <img src="../docs/screenshots/kopteri.png" width="160"> | **Kopterilento** | `kopteri` | Maantietoa helikopterilla: Tampereen paikat ylhäältä ja maapallolla mantereet ja maat. |
| <img src="../docs/screenshots/muutto.png" width="160"> | **Muuttolintu** | `muutto` | Lennä muuttolintuna Suomeen pesimään ja takaisin. Vuodenajat ja aurinko näkyvät maapallolla. |
| <img src="../docs/screenshots/kielipelit.png" width="160"> | **Kielipelit** | `kielipelit` | Englantia ja espanjaa: sanat, "Find the red key", kahvila ja tarina. Ohjeet puhutaan. |
| <img src="../docs/screenshots/kielisaari.png" width="160"> | **Kielisaari** | `kielisaari` | Englantia tai espanjaa (lippu valitaan alussa) seikkaillen: auta kilpikonnaa, apinaa ja karhun kahvilaa, kerää kolme karttapalaa ja avaa luolan aarrearkku. Jokainen sana kulkee polun kuule → tunnista → muista (kokoa kirjaimista ja sano ääneen) → käytä ("Give me two red apples") → kertaa; uusi päivä alkaa kertauksella (Leitner-laatikot). Väärästä vastauksesta tulee vihje, ei rangaistusta. 💡 näyttää lauseen suomeksi. |

Seuraavat pelit tehtiin puhelinta varten Macilla, ja ne tulevat tähän listaan, kun ne on viety GitHubiin: Kirjainpallot, Onkipeli, Avaruusretki, Sanaseikkailu ja Kolmården.

Kotien tarkat paikat ovat vain git-ignoroiduissa `places.local.js`-tiedostoissa, ja Kolmårdenin perhekuvat (`perhe/`) eivät koskaan mene repoon.
