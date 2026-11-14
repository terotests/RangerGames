#!/usr/bin/env python3
# Builds games/ruokinta (Nälkäiset eläimet) from tools/ruokinta/data.json and pick.json:
#   - food photos: raw/<food>/c<N>.jpg (from fetch_commons.py, run on a machine that
#     reaches Wikimedia) cropped to 240x240 → games/ruokinta/img/<food>.jpg
#   - animal photos: copied from games/luut/img (Kenen luut?), credits from its CREDITS.md
#   - games/ruokinta/lib/data.ts, games/ruokinta/CREDITS.md
#   - speech: ru_* clips into voice/fi.json, voice/en/ruokinta.json, voice/es/ruokinta.json
# Usage: python3 tools/ruokinta/build.py <raw dir with meta.json>
import json, os, re, shutil, sys
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GAME = os.path.join(ROOT, "games", "ruokinta")
LUUT = os.path.join(ROOT, "games", "luut")
S = 240

def square(im, crop=None, pad=False):
    im = im.convert("RGB")
    w, h = im.size
    if crop:
        im = im.crop((int(crop[0] * w), int(crop[1] * h), int((crop[0] + crop[2]) * w), int((crop[1] + crop[3]) * h)))
        w, h = im.size
    if pad:
        n = max(w, h)
        bg = Image.new("RGB", (n, n), im.getpixel((2, 2)))
        bg.paste(im, ((n - w) // 2, (n - h) // 2))
        im = bg
    else:
        n = min(w, h)
        im = im.crop(((w - n) // 2, (h - n) // 2, (w - n) // 2 + n, (h - n) // 2 + n))
    return im.resize((S, S), Image.LANCZOS)

def bone():
    # our own drawing: a cartoon bone on a light plate, drawn 4x and scaled down
    k = 4; n = S * k
    im = Image.new("RGB", (n, n), (250, 244, 230))
    d = ImageDraw.Draw(im)
    def shape(col, grow):
        g = grow * k
        # the shaft, at 30 degrees, as a thick polygon
        import math
        a = math.radians(-30); cx, cy = n / 2, n / 2; L = 62 * k; T = 27 * k + g
        dx, dy = math.cos(a), math.sin(a); px, py = -dy, dx
        pts = [(cx - dx * L + px * T, cy - dy * L + py * T), (cx + dx * L + px * T, cy + dy * L + py * T),
               (cx + dx * L - px * T, cy + dy * L - py * T), (cx - dx * L - px * T, cy - dy * L - py * T)]
        d.polygon(pts, fill=col)
        for s in (-1, 1):
            ex, ey = cx + s * dx * L, cy + s * dy * L
            for o in (-1, 1):
                r = 30 * k + g
                bx, by = ex + px * o * 24 * k + s * dx * 12 * k, ey + py * o * 24 * k + s * dy * 12 * k
                d.ellipse((bx - r, by - r, bx + r, by + r), fill=col)
    shape((120, 96, 70), 5)       # outline
    shape((247, 236, 210), 0)     # bone
    return im.resize((S, S), Image.LANCZOS)

def credits_luut():
    out = {}
    for line in open(os.path.join(LUUT, "CREDITS.md"), encoding="utf-8"):
        m = re.match(r"^\| ([^|,]+) \| (.*?) \| (.*?) \| \[(File:[^\]]+)\]\((\S+)\) \|$", line.strip())
        if m: out.setdefault(m.group(1).strip(), (m.group(2), m.group(3), m.group(4), m.group(5)))
    return out

def cap(s): return s[:1].upper() + s[1:]

def author(a):
    # Commons "Artist" fields can be long sentences or doubled
    a = (a or "?").strip()
    if len(a) > 60 and ". " in a: a = a.split(". ")[0]
    h = len(a) // 2
    if len(a) % 2 == 0 and a[:h] == a[h:]: a = a[:h]
    return a

def main():
    raw = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw")
    data = json.load(open(os.path.join(HERE, "data.json"), encoding="utf-8"))
    pick = json.load(open(os.path.join(HERE, "pick.json"), encoding="utf-8"))
    meta = json.load(open(os.path.join(raw, "meta.json"), encoding="utf-8"))
    os.makedirs(os.path.join(GAME, "img"), exist_ok=True)
    os.makedirs(os.path.join(GAME, "lib"), exist_ok=True)
    FOODS = data["foods"]; ANIM = data["animals"]
    credits = []   # (what, author, license, file, url)

    foods = []
    for fid, fd in FOODS.items():
        p = pick[fid]
        dst = os.path.join(GAME, "img", fid + ".jpg")
        if p.get("draw") == "bone":
            bone().save(dst, quality=82)
            credits.append((cap(fd["fi"][0]), "RangerGames (oma piirros)", "CC0", "", ""))
        else:
            e = meta[fid][p["c"]]
            square(Image.open(os.path.join(raw, fid, "c%d.jpg" % p["c"])), p.get("crop"), p.get("pad")).save(dst, quality=82)
            credits.append((cap(fd["fi"][0]), author(e["artist"]), e["license"], e["title"], e["page"]))
        foods.append({"id": fid, "name": [fd["fi"][0], fd["en"][0], fd["es"][0]], "img": "img/" + fid + ".jpg"})

    lc = credits_luut()
    animals = []
    cls = {f: FOODS[f]["cls"] for f in FOODS}
    for aid, ad in ANIM.items():
        src = ad.get("img", aid)
        shutil.copyfile(os.path.join(LUUT, "img", src + ".jpg"), os.path.join(GAME, "img", "e_" + aid + ".jpg"))
        luut_name = {"lehma": "Lehmä"}.get(src, cap(src).replace("Kaarme", "Käärme").replace("Pollo", "Pöllö"))
        c = lc.get(luut_name)
        if not c: sys.exit("no credit for " + luut_name)
        credits.append((cap(ad["fi"]), c[0], c[1], c[2], c[3]))
        eats_cls = {cls[f] for f in ad["eats"]}
        if "no" in ad: no = [f for f in ad["no"]]
        else: no = [f for f in FOODS if cls[f] not in eats_cls and f not in ad.get("maybe", [])]
        no = [f for f in no if f not in ad["eats"] and f not in ad.get("maybe", [])]
        es = ad["es"]
        animals.append({"id": aid, "name": [ad["fi"], ad["en"], es[1], es[0] + " " + es[1]], "img": "img/e_" + aid + ".jpg",
                        "eats": ad["eats"], "no": no})

    cr = [{"what": w, "author": a, "license": l, "file": f[5:] if f.startswith("File:") else f} for (w, a, l, f, u) in credits]
    with open(os.path.join(GAME, "lib", "data.ts"), "w", encoding="utf-8") as o:
        o.write("// GENERATED by tools/ruokinta/build.py from tools/ruokinta/data.json. Photos: see ../CREDITS.md\n")
        o.write("export const ANIMALS: any[] = " + json.dumps(animals, ensure_ascii=False) + ";\n")
        o.write("export const FOODS: any[] = " + json.dumps(foods, ensure_ascii=False) + ";\n")
        o.write("export const CREDITS: any[] = " + json.dumps(cr, ensure_ascii=False) + ";\n")
    with open(os.path.join(GAME, "CREDITS.md"), "w", encoding="utf-8") as o:
        o.write("# Nälkäiset eläimet – kuvien tekijät\n\nRuokakuvat ovat Wikimedia Commonsista (luu on oma piirros). Eläinkuvat ovat samat kuin Kenen luut? -pelissä (games/luut), nekin Wikimedia Commonsista. Kuvia on rajattu ja pienennetty peliä varten. Lisenssit: CC0 / public domain, CC BY ja CC BY-SA; CC BY-SA -kuvien muokatut versiot jaetaan samalla lisenssillä.\n\n")
        o.write("| Kuva | Tekijä | Lisenssi | Lähde |\n| --- | --- | --- | --- |\n")
        for (w, a, l, f, u) in credits:
            o.write("| %s | %s | %s | %s |\n" % (w, a.replace("|", "/"), l, "[%s](%s)" % (f, u) if u else "–"))

    # ---- speech ----
    fi, en, es = {}, {}, {}
    fi["peli_ruokinta"] = "Nälkäiset eläimet"; en["peli_ruokinta"] = "Hungry animals"; es["peli_ruokinta"] = "Animales hambrientos"
    fi["ru_nam"] = "Nam nam!"; en["ru_nam"] = "Yum yum!"; es["ru_nam"] = "¡Ñam, ñam!"
    fi["ru_ei"] = "Ei kelpaa! Kokeile toista."; en["ru_ei"] = "No, thank you! Try another one."; es["ru_ei"] = "¡No, gracias! Prueba otra."
    fi["ru_kierros"] = "Anna jokaiselle eläimelle oma ruoka."; en["ru_kierros"] = "Give every animal its own food."; es["ru_kierros"] = "Dale a cada animal su comida."
    fi["ru_kiitos"] = "Kiitos! Nyt kaikilla on maha täynnä."; en["ru_kiitos"] = "Thank you! Now everyone is full."; es["ru_kiitos"] = "¡Gracias! Ahora todos están llenos."
    for fid, fd in FOODS.items():
        fi["ru_f_" + fid] = cap(fd["fi"][0]); en["ru_f_" + fid] = cap(fd["en"][0]); es["ru_f_" + fid] = cap(fd["es"][0])
        fi["ru_kuka_" + fid] = "Kuka syö " + fd["fi"][1] + "?"; en["ru_kuka_" + fid] = "Who eats " + fd["en"][1] + "?"; es["ru_kuka_" + fid] = "¿Quién come " + fd["es"][1] + "?"
    for aid, ad in ANIM.items():
        esn = ad["es"][0] + " " + ad["es"][1]
        fi["ru_n_" + aid] = cap(ad["fi"]); en["ru_n_" + aid] = cap(ad["en"]); es["ru_n_" + aid] = cap(esn)
        fi["ru_mita_" + aid] = "Mitä " + ad["fi"] + " syö?"; en["ru_mita_" + aid] = "What does the " + ad["en"] + " eat?"; es["ru_mita_" + aid] = "¿Qué come " + esn + "?"
        for f in ad["eats"]:
            fd = FOODS[f]
            fi["ru_%s_%s" % (aid, f)] = cap(ad["fi"]) + " syö " + fd["fi"][1] + "."
            en["ru_%s_%s" % (aid, f)] = "The " + ad["en"] + " eats " + fd["en"][1] + "."
            es["ru_%s_%s" % (aid, f)] = cap(esn) + " come " + fd["es"][1] + "."
    vp = os.path.join(ROOT, "voice", "fi.json")
    v = json.load(open(vp, encoding="utf-8"))
    for k in [k for k in v["clips"] if k.startswith("ru_")]: del v["clips"][k]
    v["clips"].update(fi)
    open(vp, "w", encoding="utf-8").write(json.dumps(v, indent=1, ensure_ascii=False) + "\n")
    for lang, clips in (("en", en), ("es", es)):
        doc = {"_comment": "Nälkäiset eläimet (games/ruokinta): generated by tools/ruokinta/build.py, same ids as voice/fi.json.", "lang": lang, "clips": clips}
        open(os.path.join(ROOT, "voice", lang, "ruokinta.json"), "w", encoding="utf-8").write(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    print(len(foods), "foods,", len(animals), "animals,", len(fi), "clips per language")

main()
