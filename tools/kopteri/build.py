#!/usr/bin/env python3
"""Data for the helicopter geography game "Kopterilento" (games/kopteri).

  python3 tools/kopteri/build.py [ne_110m_admin_0_countries.geojson]

writes
  games/kopteri/lib/world.ts   the countries of the world as outlines for the
                               engine's globe (rg.three("globe")), grouped by
                               continent, and the targets of each stage with
                               Finnish names
  games/kopteri/map/C_R.png    Tampere from helicopter height: the Liikenneretki
                               map tiles (games/tampere/tiles) at 1.5 px a metre
  voice/fi.json                the clips "Etsi Afrikka." etc. (ids k_<id>)

Country outlines: Natural Earth 1:110m Admin 0 – Countries (public domain,
https://www.naturalearthdata.com/). Without an argument the file is
downloaded from Natural Earth's GitHub repository.
"""
import json, math, os, sys, urllib.request
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
GAME = os.path.join(ROOT, "games", "kopteri")
NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson"

CONTINENTS = [
    # key, Finnish name, Natural Earth CONTINENT, label lon, lat, colour
    ("af", "Afrikka", "Africa", 20, 5, "#f4a261"),
    ("eu", "Eurooppa", "Europe", 18, 52, "#b185db"),
    ("as", "Aasia", "Asia", 95, 45, "#ffd166"),
    ("na", "Pohjois-Amerikka", "North America", -100, 48, "#ef6f6c"),
    ("sa", "Etelä-Amerikka", "South America", -60, -15, "#7bc950"),
    ("oc", "Australia", "Oceania", 134, -25, "#f78fb3"),
    ("an", "Etelämanner", "Antarctica", 0, -82, "#eef3f8"),
]

# stage 1..3 countries: ADM0_A3, Finnish name
STAGES = [
    [("FIN", "Suomi"), ("SWE", "Ruotsi"), ("NOR", "Norja"), ("RUS", "Venäjä"), ("CHN", "Kiina"),
     ("USA", "Yhdysvallat"), ("CAN", "Kanada"), ("BRA", "Brasilia"), ("IND", "Intia"), ("AUS", "Australia"),
     ("EGY", "Egypti"), ("JPN", "Japani"), ("MEX", "Meksiko"), ("GRL", "Grönlanti"), ("ARG", "Argentiina")],
    [("DEU", "Saksa"), ("FRA", "Ranska"), ("ITA", "Italia"), ("ESP", "Espanja"), ("GBR", "Iso-Britannia"),
     ("EST", "Viro"), ("ISL", "Islanti"), ("ZAF", "Etelä-Afrikka"), ("TUR", "Turkki"), ("IDN", "Indonesia"),
     ("MDG", "Madagaskar"), ("NZL", "Uusi-Seelanti"), ("CHL", "Chile"), ("KAZ", "Kazakstan"),
     ("MNG", "Mongolia"), ("SAU", "Saudi-Arabia")],
    [("POL", "Puola"), ("UKR", "Ukraina"), ("GRC", "Kreikka"), ("PRT", "Portugali"), ("DNK", "Tanska"),
     ("LVA", "Latvia"), ("LTU", "Liettua"), ("IRL", "Irlanti"), ("IRN", "Iran"), ("PAK", "Pakistan"),
     ("THA", "Thaimaa"), ("VNM", "Vietnam"), ("PHL", "Filippiinit"), ("KOR", "Etelä-Korea"),
     ("NGA", "Nigeria"), ("KEN", "Kenia"), ("MAR", "Marokko"), ("DZA", "Algeria"), ("COL", "Kolumbia"),
     ("PER", "Peru"), ("CUB", "Kuuba")],
]

# Tampere: id, name, icon, x, z (metres in Liikenneretki's frame, x east, z south).
# The homes of Liikenneretki are left out on purpose.
TAMPERE = [
    ("nasinneula", "Näsinneula", "🗼", -1099, -659),
    ("tuomiokirkko", "Tuomiokirkko", "⛪", 327, -357),
    ("asema", "Rautatieasema", "🚉", 465, 95),
    ("kauppahalli", "Kauppahalli", "🧺", -289, 283),
    ("keskustori", "Keskustori", "⛲", -189, 151),
    ("koskikeskus", "Koskikeskus", "🛍", 201, 363),
    ("finlayson", "Finlayson", "🏭", -443, -281),
    ("tampella", "Tampella", "🧱", -77, -559),
    ("metso", "Metso-kirjasto", "📚", -731, 207),
    ("koskipuisto", "Koskipuisto", "🌳", 51, 31),
    ("hameenpuisto", "Hämeenpuisto", "🌷", -639, 121),
    ("nasinpuisto", "Näsinpuisto", "🌲", -639, -499),
    ("pikkukakkonen", "Pikku Kakkosen puisto", "🛝", 99, -37),
    ("sorinaukio", "Sorin aukion leikkikenttä", "🎠", 313, 447),
    ("tammerkoski", "Tammerkoski", "🌊", -90, -160),
    ("nasijarvi", "Näsijärvi", "⛵", -1400, -690),
]
MAP_X0, MAP_Z0, MAP_W, MAP_H = -1460, -780, 2400, 1400
SRC_PPM, SRC_TILE = 3, 100
PPM, TILE = 1.5, 400


def clip_lon(ring, lon, keep_west):
    """Sutherland–Hodgman against the meridian `lon` (rings in lon/lat)."""
    out = []
    n = len(ring)
    inside = (lambda p: p[0] <= lon) if keep_west else (lambda p: p[0] >= lon)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        if inside(a):
            out.append(a)
        if inside(a) != inside(b):
            t = (lon - a[0]) / (b[0] - a[0])
            out.append((lon, a[1] + (b[1] - a[1]) * t))
    return out


def dp(pts, tol):
    """Douglas–Peucker on an open polyline."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = pts[i]
        bx, by = pts[j]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, bi = -1, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            d = abs(dx * (ay - py) - dy * (ax - px)) / L if L > 0 else math.hypot(px - ax, py - ay)
            if d > best:
                best, bi = d, k
        if best > tol:
            keep[bi] = True
            stack += [(i, bi), (bi, j)]
    return [p for p, k in zip(pts, keep) if k]


def area(r):
    return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2


def simplify(ring, tol):
    ring = ring[:-1] if ring[0] == ring[-1] else ring
    # split in two halves so that DP keeps a closed shape
    h = len(ring) // 2
    a = dp(ring[: h + 1], tol)
    b = dp(ring[h:] + [ring[0]], tol)
    out = a[:-1] + b[:-1]
    # long edges get points in between, so that they bend with the globe
    dense = []
    for i in range(len(out)):
        p, q = out[i], out[(i + 1) % len(out)]
        dense.append(p)
        steps = int(math.hypot(q[0] - p[0], q[1] - p[1]) / 3)
        for s in range(1, steps + 1):
            t = s / (steps + 1)
            dense.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return dense


def world(src):
    if src:
        data = json.load(open(src))
    else:
        print("downloading", NE_URL)
        data = json.load(urllib.request.urlopen(NE_URL))
    ckey = {c[2]: c[0] for c in CONTINENTS}
    regions = []
    labels = {}
    names = {code: name for st in STAGES for code, name in st}
    npts = 0
    for f in data["features"]:
        p = f["properties"]
        code = p["ADM0_A3"]
        k = ckey.get(p["CONTINENT"])
        if not k:
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rings_by_k = {}
        biggest = max(area(P[0]) for P in polys)
        for P in polys:
            outer = [tuple(x) for x in P[0]]
            if area(outer) < 0.25 and area(outer) < biggest:
                continue                     # tiny islands
            pieces = [(k, outer)]
            if code == "RUS":                # Europe up to the Urals (60°E), Asia beyond
                pieces = [("eu", clip_lon(outer, 60, True)), ("as", clip_lon(outer, 60, False))]
            for kk, r in pieces:
                if len(r) < 3 or area(r) < 0.01:
                    continue
                s = simplify(r + [r[0]], 0.2 if area(r) > 2 else 0.08)
                if len(s) >= 3:
                    rings_by_k.setdefault(kk, []).append([v for pt in s for v in (round(pt[0] * 10), round(pt[1] * 10))])
                    npts += len(s)
        for kk, rings in rings_by_k.items():
            regions.append([code, kk] + rings)
        if code in names:
            labels[code] = (round(p["LABEL_X"], 1), round(p["LABEL_Y"], 1), k)
    missing = [c for c in names if c not in labels]
    if missing:
        sys.exit("missing countries: %s" % missing)
    stages = [[{"id": c[0], "name": c[1], "lon": c[3], "lat": c[4], "group": c[0]} for c in CONTINENTS]]
    for st in STAGES:
        stages.append([{"id": code, "name": name, "lon": labels[code][0], "lat": labels[code][1], "group": labels[code][2]} for code, name in st])
    colors = {c[0]: c[5] for c in CONTINENTS}
    path = os.path.join(GAME, "lib", "world.ts")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as o:
        o.write("// GENERATED by tools/kopteri/build.py. Country outlines: Natural Earth 1:110m (public domain),\n")
        o.write("// naturalearthdata.com. Rings are [lon, lat, ...] in tenths of a degree.\n")
        o.write("export const REGIONS: any[] = %s;\n" % json.dumps(regions, separators=(",", ":"), ensure_ascii=False))
        o.write("export const STAGES: any[] = %s;\n" % json.dumps(stages, ensure_ascii=False))
        o.write("export const CONTINENT_COLORS: any = %s;\n" % json.dumps(colors))
        o.write("export const TAMPERE: any[] = %s;\n" % json.dumps(
            [{"id": t[0], "name": t[1], "icon": t[2], "x": t[3], "z": t[4]} for t in TAMPERE], ensure_ascii=False))
        o.write("export const MAPINFO: any = %s;\n" % json.dumps(
            {"X0": MAP_X0, "Z0": MAP_Z0, "W": MAP_W, "H": MAP_H, "PPM": PPM, "TILE": TILE,
             "NCOL": math.ceil(MAP_W / TILE), "NROW": math.ceil(MAP_H / TILE)}))
    print("world.ts: %d regions, %d points, %d KB" % (len(regions), npts, os.path.getsize(path) // 1024))
    return stages


def tampere_tiles():
    src = os.path.join(ROOT, "games", "tampere", "tiles")
    ncol, nrow = MAP_W // SRC_TILE, MAP_H // SRC_TILE
    s = SRC_TILE * SRC_PPM
    full = Image.new("RGB", (ncol * s, nrow * s))
    for c in range(ncol):
        for r in range(nrow):
            full.paste(Image.open(os.path.join(src, "%d_%d.png" % (c, r))).convert("RGB"), (c * s, r * s))
    full = full.resize((int(MAP_W * PPM), int(MAP_H * PPM)), Image.LANCZOS)
    out = os.path.join(GAME, "map")
    os.makedirs(out, exist_ok=True)
    t = int(TILE * PPM)
    total = 0
    for c in range(math.ceil(MAP_W / TILE)):
        for r in range(math.ceil(MAP_H / TILE)):
            tile = full.crop((c * t, r * t, min(full.width, (c + 1) * t), min(full.height, (r + 1) * t)))
            p = os.path.join(out, "%d_%d.png" % (c, r))
            tile.quantize(colors=96, method=Image.MEDIANCUT, dither=Image.NONE).save(p, optimize=True)
            total += os.path.getsize(p)
    print("map tiles: %d KB" % (total // 1024))


def voice(stages):
    path = os.path.join(ROOT, "voice", "fi.json")
    d = json.load(open(path))
    clips = d["clips"]
    for k in [k for k in clips if k.startswith("k_")]:
        del clips[k]
    clips["peli_kopteri"] = "Kopterilento"
    clips["k_tervetuloa"] = "Lennetään helikopterilla!"
    clips["k_loysit"] = "Löysit sen!"
    clips["k_kaikki"] = "Löysit kaikki!"
    for st in stages:
        for t in st:
            clips["k_" + t["id"].lower()] = "Etsi %s." % t["name"]
    for t in TAMPERE:
        clips["k_" + t[0]] = "Etsi %s." % t[1]
    with open(path, "w") as o:
        json.dump(d, o, ensure_ascii=False, indent=1)
        o.write("\n")


if __name__ == "__main__":
    st = world(sys.argv[1] if len(sys.argv) > 1 else None)
    if not os.environ.get("NOTILES"):
        tampere_tiles()
    voice(st)
