#!/usr/bin/env python3
"""Build games/luut from photos fetched by fetch_commons.py.

    python3 tools/luut/fetch_commons.py            # where Wikimedia Commons is reachable -> tools/luut/raw/
    python3 tools/luut/build.py <raw dir>          # -> games/luut/img/*.jpg, lib/data.ts, CREDITS.md

pick.json (next to this script) says which photos are used: per animal the
living-animal photo and the skull / skeleton photos (file names in raw/<key>/),
optional crop boxes [x0, y0, x1, y1] as fractions of the photo.
Only CC0 / public domain / CC BY / CC BY-SA photos are accepted. (The committed
photos were built from a copy of raw/ shrunk to 560 px, which gives the same result.)
"""
import json, os, re, sys
from PIL import Image, ImageOps, ImageStat

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GAME = os.path.join(ROOT, "games", "luut")

# id, Finnish name, kind of animal (wrong answers are first taken from other kinds)
ANIMALS = [
 ("kissa", "Kissa", "peto"), ("koira", "Koira", "peto"), ("kettu", "Kettu", "peto"), ("susi", "Susi", "peto"),
 ("karhu", "Karhu", "peto"), ("leijona", "Leijona", "peto"), ("tiikeri", "Tiikeri", "peto"),
 ("hevonen", "Hevonen", "kavio"), ("seepra", "Seepra", "kavio"), ("lehma", "Lehmä", "kavio"), ("sika", "Sika", "kavio"),
 ("lammas", "Lammas", "kavio"), ("hirvi", "Hirvi", "kavio"), ("peura", "Peura", "kavio"), ("kirahvi", "Kirahvi", "kavio"),
 ("kameli", "Kameli", "kavio"), ("virtahepo", "Virtahepo", "kavio"), ("sarvikuono", "Sarvikuono", "kavio"),
 ("norsu", "Norsu", "kavio"), ("kenguru", "Kenguru", "kavio"),
 ("kani", "Kani", "pieni"), ("rotta", "Rotta", "pieni"), ("orava", "Orava", "pieni"), ("majava", "Majava", "pieni"),
 ("siili", "Siili", "pieni"), ("lepakko", "Lepakko", "pieni"),
 ("simpanssi", "Simpanssi", "apina"), ("gorilla", "Gorilla", "apina"), ("ihminen", "Ihminen", "apina"),
 ("kana", "Kana", "lintu"), ("pollo", "Pöllö", "lintu"), ("strutsi", "Strutsi", "lintu"), ("pingviini", "Pingviini", "lintu"),
 ("krokotiili", "Krokotiili", "matelija"), ("kaarme", "Käärme", "matelija"), ("kilpikonna", "Kilpikonna", "matelija"),
 ("sammakko", "Sammakko", "matelija"), ("dinosaurus", "Dinosaurus", "matelija"),
 ("kala", "Kala", "vesi"), ("hai", "Hai", "vesi"), ("delfiini", "Delfiini", "vesi"), ("valas", "Valas", "vesi"),
 ("hylje", "Hylje", "vesi"), ("mursu", "Mursu", "vesi"),
]
# look-alikes that are never offered in the same question
CONFUSE = [["kissa", "leijona", "tiikeri"], ["koira", "susi", "kettu"], ["hevonen", "seepra"], ["hirvi", "peura"],
           ["simpanssi", "gorilla"], ["delfiini", "valas"], ["rotta", "orava"], ["kana", "strutsi", "pingviini"],
           ["krokotiili", "dinosaurus"], ["hylje", "mursu"]]
KIND = {"skull": "kallo", "skeleton": "luuranko"}
WHAT = {"living": "", "skull": "kallo", "skeleton": "luuranko"}
OK = re.compile(r"^(cc0|cc[- ]by(-sa)?([- ][0-9.]+)?([- ][a-z]{2,})?|public domain|pd[- a-z0-9]*)$", re.I)

def edge_color(im):
    w, h = im.size
    strips = [im.crop((0, 0, w, max(1, h // 30))), im.crop((0, h - max(1, h // 30), w, h)),
              im.crop((0, 0, max(1, w // 30), h)), im.crop((w - max(1, w // 30), 0, w, h))]
    px = []
    for s in strips:
        b = s.resize((16, 16)).tobytes()
        px += [tuple(b[i:i + 3]) for i in range(0, len(b), 3)]
    px.sort(key=lambda p: sum(p))
    return px[len(px) // 2]

def make(src, dst, size, crop=None, fit="pad"):
    im = Image.open(src)
    im = ImageOps.exif_transpose(im).convert("RGB")
    if crop:
        w, h = im.size
        im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    W, H = size
    if fit == "cover":
        im = ImageOps.fit(im, size, Image.LANCZOS)
    else:
        bg = Image.new("RGB", size, edge_color(im))
        im.thumbnail((W, H), Image.LANCZOS)
        bg.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
        im = bg
    im.save(dst, "JPEG", quality=80, optimize=True, progressive=False)

FIX = [(r"\s*This file was uploaded by.*", ""), (r"^This image is uploaded as image number \d+ at Amgueddfa Cymru.*", "Amgueddfa Cymru – Museum Wales"),
       (r"^API data Catalogue record Photo$", "Australian Museum")]

def clean(s, n=80):
    s = re.sub(r"\s+", " ", s or "").strip()
    for a, b in FIX: s = re.sub(a, b, s)
    s = re.sub(r"\s*\(talk\)|\s*\(\s*\)", "", s)
    return s if len(s) <= n else s[: n - 1] + "…"

def main():
    raw = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw")
    meta = json.load(open(os.path.join(raw, "meta.json")))
    pick = json.load(open(os.path.join(HERE, "pick.json")))
    img = os.path.join(GAME, "img")
    os.makedirs(img, exist_ok=True)
    for f in os.listdir(img): os.remove(os.path.join(img, f))
    animals, credits, md = [], [], []
    for aid, name, group in ANIMALS:
        p = pick.get(aid)
        if not p: continue
        m = meta[aid]
        def entry(kind, fn):
            for e in m[kind]:
                if e.get("file", "").endswith("/" + fn): return e
            raise SystemExit("no %s/%s in meta" % (aid, fn))
        def use(kind, sel, out, size, fit):
            fn, crop = (sel, None) if isinstance(sel, str) else (sel["f"], sel.get("crop"))
            e = entry(sel.get("from", kind) if isinstance(sel, dict) else kind, fn)
            if not OK.match(e["license"]): raise SystemExit("licence not allowed: %s %s" % (e["title"], e["license"]))
            make(os.path.join(raw, e["file"]), os.path.join(img, out), size, crop, fit)
            author = clean(e["artist"]) or "tuntematon"
            what = name + (", " + WHAT[kind] if WHAT[kind] else "")
            credits.append({"what": what, "author": author, "license": e["license"], "file": e["title"], "url": e["page"]})
            md.append("| %s | %s | %s | [%s](%s) |" % (what, author.replace("|", "/"), e["license"], e["title"].replace("|", "/"), e["page"]))
            return author + " · " + e["license"]
        ac = use("living", p["living"], aid + ".jpg", (288, 216), "cover") if p.get("living") else ""
        pics = []
        for kind in ("skull", "skeleton"):
            for i, sel in enumerate(p.get(kind, [])):
                out = "%s_%s%d.jpg" % (aid, KIND[kind], i + 1)
                c = use(kind, sel, out, (480, 360), "pad")
                pics.append({"f": "img/" + out, "k": KIND[kind], "c": c})
        animals.append({"id": aid, "name": name, "g": group, "alive": "img/" + aid + ".jpg" if ac else "",
                        "emoji": p.get("emoji", ""), "ac": ac, "pics": pics})
    ids = [a["id"] for a in animals]
    confuse = [[x for x in s if x in ids] for s in CONFUSE]
    confuse = [s for s in confuse if len(s) > 1]
    with open(os.path.join(GAME, "lib", "data.ts"), "w") as f:
        f.write("// GENERATED by tools/luut/build.py. Photos: Wikimedia Commons, see ../CREDITS.md\n")
        f.write("export const ANIMALS: any[] = " + json.dumps(animals, ensure_ascii=False) + ";\n")
        f.write("export const CREDITS: any[] = " + json.dumps(credits, ensure_ascii=False) + ";\n")
        f.write("export const CONFUSE: string[][] = " + json.dumps(confuse, ensure_ascii=False) + ";\n")
    with open(os.path.join(GAME, "CREDITS.md"), "w") as f:
        f.write("# Kenen luut? – kuvien tekijät\n\nKaikki kuvat ovat Wikimedia Commonsista. Niitä on rajattu ja pienennetty peliä varten "
                "(muutokset: rajaus, koko, taustan täyttö). Lisenssit: CC0 / public domain, CC BY ja CC BY-SA; "
                "CC BY-SA -kuvien muokatut versiot jaetaan samalla lisenssillä.\n\n"
                "| Kuva | Tekijä | Lisenssi | Lähde |\n| --- | --- | --- | --- |\n" + "\n".join(md) + "\n")
    print(len(animals), "animals,", sum(len(a["pics"]) for a in animals), "photos,", len(credits), "credits")

main()
