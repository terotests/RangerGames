#!/usr/bin/env python3
"""Puts the Korkeasaari game's voice clips (ks_*) in voice/fi.json, from the
animals in games/korkeasaari/lib/animals.ts and the game's own sentences below.
  python3 tools/korkeasaari/voice.py"""
import json, os, re
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
src = open(os.path.join(ROOT, "games", "korkeasaari", "lib", "animals.ts"), encoding="utf-8").read()

GENERAL = {
    "ks_tervetuloa": "Tervetuloa Korkeasaareen!",
    "ks_valitse": "Valitse eläin, jonka luo mennään.",
    "ks_napauta": "Napauta karttaa, niin kävelet sinne.",
    "ks_lahella": "Olet jo lähellä!",
    "ks_tarra": "Sait tarran!",
    "ks_kaikki": "Löysit kaikki eläimet! Olet oikea eläintenhoitaja!",
    "ks_ei_saarella": "Et ole nyt Korkeasaaressa. Kävele kartalla sormella.",
    "ks_etsitaan": "Etsitään paikkaa.",
    "ks_kumpi_isompi": "Kumpi on isompi?",
    "ks_mika_elain": "Mikä eläin tämä on?",
    "ks_montako_jalkaa": "Montako jalkaa sillä on?",
    "ks_totta_vai": "Onko tämä totta?",
    "ks_totta": "Totta!",
    "ks_ei_totta": "Ei ole totta.",
    "ks_seuraava": "Mennäänkö seuraavan eläimen luo?",
}
FOODS = {"liha": "Lihaa.", "kala": "Kalaa.", "kasvit": "Kasveja.", "marjat": "Marjoja.", "hyonteiset": "Hyönteisiä.", "hiiret": "Hiiriä.", "bambu": "Bambua."}
HOMES = {"vuoret": "Vuorilla.", "metsa": "Metsässä.", "aavikko": "Aavikolla.", "tundra": "Kylmällä tundralla.", "aro": "Ruohoarolla.", "joki": "Joen rannalla.", "maatila": "Maatilalla."}

WORLD = {"eurooppa": "Euroopassa.", "aasia": "Aasiassa.", "afrikka": "Afrikassa.", "pamerikka": "Pohjois-Amerikassa.", "eamerikka": "Etelä-Amerikassa.", "australia": "Australiassa."}
clips = dict(GENERAL)
for k, v in WORLD.items(): clips["ks_mt_" + k] = v
for k, v in FOODS.items(): clips["ks_ruoka_" + k] = v
for k, v in HOMES.items(): clips["ks_koti_" + k] = v
for m in re.finditer(r'\{ id: "(\w+)", name: "([^"]+)", gen: "([^"]+)".*?fact: "([^"]+)"', src, re.S):
    aid, name, gen, fact = m.groups()
    l = name.lower()
    clips["ks_" + aid] = name + "!"
    clips["ks_%s_etsi" % aid] = "Etsi %s!" % l
    clips["ks_%s_loysit" % aid] = "Löysit %s!" % gen
    clips["ks_%s_syo" % aid] = "Mitä %s syö?" % l
    clips["ks_%s_asuu" % aid] = "Missä %s asuu luonnossa?" % l
    clips["ks_%s_kuka" % aid] = "Mikä näistä on %s?" % l
    clips["ks_%s_maailma" % aid] = "Missä päin maailmaa %s asuu?" % l
    clips["ks_%s_fakta" % aid] = fact

path = os.path.join(ROOT, "voice", "fi.json")
d = json.load(open(path, encoding="utf-8"))
old = {k: v for k, v in d["clips"].items() if not k.startswith("ks_")}
old.update(clips)
old["peli_korkeasaari"] = "Korkeasaari"
d["clips"] = old
with open(path, "w", encoding="utf-8") as f:
    f.write(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print(len(clips), "ks_ clips")
