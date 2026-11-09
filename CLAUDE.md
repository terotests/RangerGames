# Ohjeet AI-avustajille (Claude ym.)

## Mitä saa viedä GitHubiin

- **Yleiset pelit saa viedä**, esimerkiksi Haamujahti, Pallopolku, Pupu hyppii, Laskupeli, Aakkoset, Kirjainpallot, Onkipeli, Avaruusretki ja Sanaseikkailu.
- **Mitään yksityistä ei saa viedä.** Tällaisia ovat perhekuvat, lasten tai muiden ihmisten oikeat nimet ja kasvot, kotiosoitteet tai kotien tarkat koordinaatit, koulun tai päiväkodin yhdistäminen tiettyyn lapseen ja muu henkilökohtainen tieto.
  - Peli, jossa on yksityistä sisältöä, pidetään vain paikallisesti. Esimerkiksi `games/kolmarden` (perhekuvat) ei kuulu repoon.
  - Karttapelien (Liikenneretki `games/tampere`, Kotiin `games/navi`) kotien paikat ovat vain git-ignoroiduissa `games/*/places.local.js`-tiedostoissa, eivät koskaan repossa.
- Jos et ole varma, kysy ennen commitia. Tarkista `git diff --cached --stat` ennen jokaista committia.
- Muiden tekemiä kuvia saa käyttää vain, jos lisenssi on CC0, PD, CC BY tai CC BY-SA. Merkitse tekijät `CREDITS.md`-tiedostoon.

## Muuta

- Teron Macilta ei pushata, koska se avaa Keychain-kyselyn. Tero pushaa itse.
- Puhelimeen asennetaan aina täysi build, jossa ovat kaikki pelit (`scripts/build-android.sh`), ei koskaan suodatettua testiversiota.
