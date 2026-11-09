#!/usr/bin/env python3
# Fetch candidate CC / public-domain photos from Wikimedia Commons for the
# RangerGames skull & skeleton quiz. Stdlib only. Writes ./raw/<key>/*.jpg and ./raw/meta.json
import json, os, re, sys, time, urllib.parse, urllib.request

UA = "RangerGamesQuiz/1.0 (kids educational game; https://github.com/terotests/RangerGames)"
API = "https://commons.wikimedia.org/w/api.php"
WAPI = "https://en.wikipedia.org/w/api.php"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")

# key, latin/english search name, english wikipedia article (living-animal lead image)
ANIMALS = [
 ("kissa", "Felis catus", "Cat"), ("koira", "Canis familiaris", "Dog"), ("hevonen", "Equus caballus", "Horse"),
 ("lehma", "Bos taurus", "Cattle"), ("sika", "Sus scrofa", "Wild boar"), ("lammas", "Ovis aries", "Sheep"),
 ("kani", "Oryctolagus cuniculus", "European rabbit"), ("kettu", "Vulpes vulpes", "Red fox"),
 ("karhu", "Ursus arctos", "Brown bear"), ("susi", "Canis lupus", "Wolf"), ("leijona", "Panthera leo", "Lion"),
 ("tiikeri", "Panthera tigris", "Tiger"), ("norsu", "Loxodonta africana", "African bush elephant"),
 ("krokotiili", "Crocodylus niloticus", "Nile crocodile"), ("virtahepo", "Hippopotamus amphibius", "Hippopotamus"),
 ("kirahvi", "Giraffa camelopardalis", "Giraffe"), ("simpanssi", "Pan troglodytes", "Chimpanzee"),
 ("gorilla", "Gorilla gorilla", "Western gorilla"), ("ihminen", "Homo sapiens", "Human"),
 ("kana", "Gallus gallus domesticus", "Chicken"), ("pollo", "Bubo bubo", "Eurasian eagle-owl"),
 ("kaarme", "Python", "Burmese python"), ("sammakko", "Rana temporaria", "Common frog"),
 ("kilpikonna", "Testudo", "Hermann's tortoise"), ("kala", "Perca fluviatilis", "European perch"),
 ("hai", "Carcharodon carcharias", "Great white shark"), ("delfiini", "Tursiops truncatus", "Common bottlenose dolphin"),
 ("valas", "Megaptera novaeangliae", "Humpback whale"), ("lepakko", "Pteropus", "Megabat"),
 ("hirvi", "Alces alces", "Moose"), ("peura", "Cervus elaphus", "Red deer"), ("majava", "Castor fiber", "Eurasian beaver"),
 ("orava", "Sciurus vulgaris", "Red squirrel"), ("siili", "Erinaceus europaeus", "European hedgehog"),
 ("hylje", "Halichoerus grypus", "Grey seal"), ("pingviini", "Aptenodytes", "King penguin"),
 ("kenguru", "Macropus", "Red kangaroo"), ("rotta", "Rattus norvegicus", "Brown rat"),
 ("seepra", "Equus quagga", "Plains zebra"), ("mursu", "Odobenus rosmarus", "Walrus"),
 ("sarvikuono", "Rhinoceros", "White rhinoceros"), ("kameli", "Camelus dromedarius", "Dromedary"),
 ("strutsi", "Struthio camelus", "Common ostrich"), ("dinosaurus", "Tyrannosaurus", "Tyrannosaurus"),
]

def get(url, params):
    q = url + "?" + urllib.parse.urlencode(params)
    for k in range(4):
        try:
            req = urllib.request.Request(q, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:
            print("  retry", e, file=sys.stderr); time.sleep(2 + 2 * k)
    return {}

def download(url, path):
    if os.path.exists(path): return True
    for k in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
                f.write(r.read())
            return True
        except Exception as e:
            print("  retry", e, file=sys.stderr); time.sleep(2 + 2 * k)
    return False

OK = re.compile(r"^(cc0|cc[- ]by(-sa)?[- ]?[0-9.]*.*|public domain|pd.*|no restrictions|attribution)$", re.I)

def info(titles):
    d = get(API, {"action": "query", "format": "json", "prop": "imageinfo", "titles": "|".join(titles),
                  "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 800})
    out = []
    for p in (d.get("query", {}).get("pages", {}) or {}).values():
        ii = (p.get("imageinfo") or [None])[0]
        if not ii or ii.get("mime") not in ("image/jpeg", "image/png", "image/webp"): continue
        m = ii.get("extmetadata", {})
        g = lambda k: re.sub(r"<[^>]+>", "", (m.get(k, {}) or {}).get("value", "")).strip()
        lic = g("LicenseShortName")
        if not OK.match(lic) or "nc" in lic.lower().split("-") or "nd" in lic.lower().split("-"): continue
        out.append({"title": p["title"], "thumb": ii.get("thumburl"), "page": ii.get("descriptionurl"),
                    "license": lic, "licenseUrl": g("LicenseUrl"), "artist": g("Artist") or g("Credit"),
                    "credit": g("Credit"), "desc": g("ImageDescription")[:300], "w": ii.get("width"), "h": ii.get("height")})
    return out

def search(q, n):
    d = get(API, {"action": "query", "format": "json", "list": "search", "srsearch": q + " filetype:bitmap",
                  "srnamespace": 6, "srlimit": n})
    return [s["title"] for s in d.get("query", {}).get("search", [])]

def lead(article):
    d = get(WAPI, {"action": "query", "format": "json", "prop": "pageimages", "piprop": "name", "titles": article, "redirects": 1})
    for p in (d.get("query", {}).get("pages", {}) or {}).values():
        if p.get("pageimage"): return "File:" + p["pageimage"]
    return None

def main():
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:]
    mp = os.path.join(OUT, "meta.json")
    meta = json.load(open(mp)) if os.path.exists(mp) else {}
    for key, latin, art in ANIMALS:
        if only and key not in only: continue
        print(key, flush=True)
        d = os.path.join(OUT, key); os.makedirs(d, exist_ok=True)
        entry = {"living": [], "skull": [], "skeleton": []}
        t = lead(art)
        if t: entry["living"] = info([t])
        entry["skull"] = info(search('"%s" skull' % latin, 8))[:6]
        entry["skeleton"] = info(search('"%s" skeleton' % latin, 8))[:5]
        for kind in entry:
            for i, e in enumerate(entry[kind]):
                fn = "%s_%d.jpg" % (kind, i)
                if e["thumb"] and download(e["thumb"], os.path.join(d, fn)): e["file"] = key + "/" + fn
        meta[key] = entry
        json.dump(meta, open(mp, "w"), indent=1, ensure_ascii=False)
        time.sleep(0.5)
    print("done", sum(len(v[k]) for v in meta.values() for k in v), "images")

main()
