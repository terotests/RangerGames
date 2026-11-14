#!/usr/bin/env python3
# Fetch candidate CC / public-domain photos from Wikimedia Commons for the
# RangerGames animal feeding game (food photos). Stdlib only. Writes ./raw/<key>/*.jpg and ./raw/meta.json
import json, os, re, sys, time, urllib.parse, urllib.request

UA = "RangerGamesFeeding/1.0 (kids educational game; https://github.com/terotests/RangerGames)"
API = "https://commons.wikimedia.org/w/api.php"
WAPI = "https://en.wikipedia.org/w/api.php"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")

# key, commons search terms, english wikipedia article (lead image)
FOODS = [
 ("heina", ["hay bale", "hay pile barn"], "Hay"),
 ("porkkana", ["carrots bunch", "carrot vegetable"], "Carrot"),
 ("luu", ["dog bone chew", "beef bone raw"], "Dog chew"),
 ("kala", ["whole raw fish", "fresh herring fish"], "Atlantic herring"),
 ("hunaja", ["honey jar honeycomb", "honeycomb"], "Honey"),
 ("mustikka", ["Vaccinium myrtillus berries", "bilberries bowl"], "Vaccinium myrtillus"),
 ("banaani", ["bananas bunch", "banana fruit"], "Banana"),
 ("jyvat", ["chicken feed grain", "wheat grains"], "Cereal"),
 ("pahkina", ["hazelnuts", "hazelnut shell"], "Hazelnut"),
 ("mato", ["earthworm", "Lumbricus terrestris"], "Earthworm"),
 ("karpanen", ["housefly Musca domestica", "Musca domestica"], "Housefly"),
 ("liha", ["raw beef meat", "raw meat steak"], "Red meat"),
 ("oksa", ["willow twig leaves", "birch branch leaves"], "Twig"),
 ("salaatti", ["lettuce head", "green lettuce"], "Lettuce"),
 ("simpukka", ["blue mussels", "Mytilus edulis shells"], "Blue mussel"),
 ("omena", ["red apple", "apple fruit"], "Apple"),
 ("kapy", ["spruce cone", "pine cone"], "Conifer cone"),
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
                  "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 600})
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
    out = sys.argv[1] if len(sys.argv) > 1 else OUT
    os.makedirs(out, exist_ok=True)
    mp = os.path.join(out, "meta.json")
    meta = json.load(open(mp)) if os.path.exists(mp) else {}
    for key, terms, art in FOODS:
        print(key, flush=True)
        d = os.path.join(out, key); os.makedirs(d, exist_ok=True)
        cands, seen = [], set()
        t = lead(art)
        titles = ([t] if t else [])
        for q in terms: titles += search(q, 6)
        titles = [x for x in titles if not (x in seen or seen.add(x))][:12]
        for i in range(0, len(titles), 6): cands += info(titles[i:i + 6])
        for i, e in enumerate(cands[:9]):
            fn = "c%d.jpg" % i
            if e["thumb"] and download(e["thumb"], os.path.join(d, fn)): e["file"] = key + "/" + fn
        meta[key] = cands[:9]
        json.dump(meta, open(mp, "w"), indent=1, ensure_ascii=False)
        time.sleep(0.5)
    print("done", sum(len(v) for v in meta.values()), "images")

main()
