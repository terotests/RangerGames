#!/usr/bin/env python3
"""Builds the offline map of the Korkeasaari game (games/korkeasaari) from
OpenStreetMap data of the island (tools/korkeasaari/data/korkeasaari.osm.gz,
downloaded 2026-11-09 from api.openstreetmap.org, bbox 24.9715,60.1700,24.9940,60.1800):

  games/korkeasaari/tiles/d/<i>_<j>.webp   map tiles, 0.5 m a pixel, 512 px = 256 m
  games/korkeasaari/tiles/o/<i>_<j>.webp   overview tiles, 1.25 m a pixel
  games/korkeasaari/lib/mapdata.ts         the walking paths, the animals' enclosures

Usage: python3 tools/korkeasaari/build_map.py [--no-tiles]

Map data (c) OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright).
Where each animal lives comes from the OSM enclosure tags (attraction=animal,
name, species:wikidata)."""
import gzip, json, math, os, sys
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
GAME = os.path.join(ROOT, "games", "korkeasaari")
SRC = os.path.join(HERE, "data", "korkeasaari.osm.gz")

# metres: x east, z south of the middle of the island
LAT0, LON0 = 60.1755, 24.9838
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110950
BOX = (-440, -400, 840, 880)  # x0 z0 x1 z1
TILE = 512
LEVELS = {"d": 0.5, "o": 1.25}
SS = 2  # supersampling

# the animals of the game: id -> the OSM way of its enclosure (the biggest one if
# the animal has several). The facts and the quiz are in games/korkeasaari/lib/animals.ts.
ANIMALS = {
    "lumileopardi": 27169780,
    "amurinleopardi": 27169727,
    "tiikeri": 27169738,
    "leijona": 27169734,
    "karhu": 27169776,
    "ahma": 29702481,
    "ilves": 763312873,
    "manuli": 1182246477,
    "pikkupanda": 965902547,
    "saukko": 27169728,
    "metsapeura": 29702114,
    "myskiharka": 763312878,
    "takini": 29702128,
    "visentti": 27169778,
    "kameli": 1571371698,
    "villihevonen": 1571371696,
    "markhor": 29711088,
    "vuohi": 444644857,
    "tunturipollo": 444644859,
    "kenguru": 123265673,
    "preerikko": 921686799,
    "aavikkokettu": 763312877,
    "berberiapina": 29702302,
}

SEA = (124, 196, 238)
SEA_EDGE = (96, 172, 222)
LAND = (236, 236, 208)
GRASS = (198, 230, 160)
WOOD = (150, 204, 126)
SCRUB = (176, 214, 140)
ROCK = (214, 210, 196)
SAND = (244, 228, 176)
WATER = (124, 196, 238)
PEN = (232, 220, 170)
PEN_EDGE = (176, 132, 82)
BUILD = (240, 196, 160)
BUILD_EDGE = (204, 150, 112)
PLAY = (255, 214, 224)
PATH = (255, 255, 255)
PATH_EDGE = (196, 176, 140)
STEPS = (236, 226, 206)

WALK = {"footway", "path", "pedestrian", "steps", "cycleway", "service", "residential",
        "living_street", "track", "unclassified", "tertiary", "construction"}


def load():
    root = ET.parse(gzip.open(SRC)).getroot()
    nodes, ways, rels = {}, {}, []
    for el in root:
        tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
        if el.tag == "node":
            lat, lon = float(el.get("lat")), float(el.get("lon"))
            nodes[el.get("id")] = ((lon - LON0) * KX, (LAT0 - lat) * KY)
        elif el.tag == "way":
            ways[el.get("id")] = {"nd": [n.get("ref") for n in el.findall("nd")], "tags": tags}
        elif el.tag == "relation":
            rels.append({"members": [(m.get("type"), m.get("ref"), m.get("role")) for m in el.findall("member")], "tags": tags})
    return nodes, ways, rels


def pts(nodes, nd):
    return [nodes[i] for i in nd if i in nodes]


def rings(nodes, ways, refs):
    """joins the member ways of a multipolygon into closed rings"""
    segs = [list(ways[r]["nd"]) for r in refs if r in ways]
    out = []
    while segs:
        ring = segs.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]: ring += s[1:]
                elif s[-1] == ring[-1]: ring += s[::-1][1:]
                elif s[-1] == ring[0]: ring = s[:-1] + ring
                elif s[0] == ring[0]: ring = s[::-1][:-1] + ring
                else: continue
                segs.pop(i); changed = True
                break
        p = pts(nodes, ring)
        if len(p) >= 3: out.append(p)
    return out


def area_of(tags):
    """the fill of an area, or None"""
    if tags.get("attraction") == "animal": return ("pen", PEN)
    if "building" in tags: return ("build", BUILD)
    if tags.get("natural") == "water" or tags.get("water"): return ("water", WATER)
    if tags.get("leisure") == "playground": return ("play", PLAY)
    if tags.get("natural") in ("wood",) or tags.get("landuse") == "forest": return ("wood", WOOD)
    if tags.get("natural") in ("scrub", "heath"): return ("scrub", SCRUB)
    if tags.get("natural") in ("bare_rock", "scree"): return ("rock", ROCK)
    if tags.get("natural") in ("sand", "beach"): return ("sand", SAND)
    if tags.get("landuse") in ("grass", "meadow", "flowerbed", "village_green", "recreation_ground") or \
            tags.get("natural") == "grassland" or tags.get("leisure") in ("park", "garden"):
        return ("grass", GRASS)
    return None


ORDER = ["land", "grass", "scrub", "wood", "rock", "sand", "play", "water", "pen", "build"]


def features(nodes, ways, rels):
    areas = []  # (kind, colour, points)
    lines = []  # (kind, points)
    for w in ways.values():
        t = w["tags"]
        closed = len(w["nd"]) > 3 and w["nd"][0] == w["nd"][-1]
        if closed and t.get("place") in ("island", "islet"):
            areas.append(("land", LAND, pts(nodes, w["nd"])))
        elif closed and t.get("natural") == "coastline":
            areas.append(("land", LAND, pts(nodes, w["nd"])))
        if closed and t.get("highway") is None:
            a = area_of(t)
            if a: areas.append((a[0], a[1], pts(nodes, w["nd"])))
        hw = t.get("highway")
        if hw in WALK and t.get("area") != "yes":
            lines.append(("steps" if hw == "steps" else "path", pts(nodes, w["nd"])))
        elif hw == "pedestrian" and t.get("area") == "yes":
            areas.append(("land", PATH, pts(nodes, w["nd"])))
        if t.get("barrier") in ("fence", "wall") and t.get("attraction") != "animal":
            lines.append(("fence", pts(nodes, w["nd"])))
    for r in rels:
        t = r["tags"]
        outer = [ref for typ, ref, role in r["members"] if typ == "way" and role in ("outer", "")]
        kind = None
        if t.get("place") in ("island", "islet"): kind = ("land", LAND)
        elif t.get("type") == "multipolygon": kind = area_of(t)
        elif t.get("highway") == "pedestrian": kind = ("land", PATH)
        if kind:
            for ring in rings(nodes, ways, outer):
                areas.append((kind[0], kind[1], ring))
    areas.sort(key=lambda a: ORDER.index(a[0]))
    return areas, lines


def render(areas, lines, x0, z0, mpp, w, h):
    S = SS
    img = Image.new("RGB", (w * S, h * S), SEA)
    dr = ImageDraw.Draw(img)
    k = S / mpp
    x1, z1 = x0 + w * mpp, z0 + h * mpp
    tr = lambda p: [((a - x0) * k, (b - z0) * k) for a, b in p]
    lw = lambda m, lo=1: max(lo, int(round(m * k)))

    def near(p):
        xs = [a for a, b in p]; zs = [b for a, b in p]
        return not (max(xs) < x0 - 20 or min(xs) > x1 + 20 or max(zs) < z0 - 20 or min(zs) > z1 + 20)
    for kind, col, p in areas:
        if len(p) < 3 or not near(p): continue
        if kind == "land":
            dr.polygon(tr(p), fill=col, outline=SEA_EDGE if col == LAND else None, width=lw(1.2))
        elif kind == "pen":
            dr.polygon(tr(p), fill=col)
            dr.line(tr(p), fill=PEN_EDGE, width=lw(0.9), joint="curve")
        elif kind == "build":
            dr.polygon(tr(p), fill=col, outline=BUILD_EDGE if mpp < 1 else None, width=lw(0.5))
        else:
            dr.polygon(tr(p), fill=col)
    for kind, p in lines:
        if kind == "fence" and mpp < 1 and len(p) >= 2 and near(p):
            dr.line(tr(p), fill=(190, 170, 140), width=lw(0.3))
    for kind, p in lines:
        if kind != "fence" and len(p) >= 2 and near(p):
            dr.line(tr(p), fill=PATH_EDGE, width=lw(3.6, 2), joint="curve")
    for kind, p in lines:
        if kind != "fence" and len(p) >= 2 and near(p):
            dr.line(tr(p), fill=STEPS if kind == "steps" else PATH, width=lw(2.4, 1), joint="curve")
    return img.resize((w, h), Image.LANCZOS)


def tiles(areas, lines):
    have = {}
    for lv, mpp in LEVELS.items():
        span = TILE * mpp
        d = os.path.join(GAME, "tiles", lv)
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d): os.remove(os.path.join(d, f))
        nx = int(-(-(BOX[2] - BOX[0]) // span)); nz = int(-(-(BOX[3] - BOX[1]) // span))
        have[lv] = []
        for j in range(nz):
            for i in range(nx):
                img = render(areas, lines, BOX[0] + i * span, BOX[1] + j * span, mpp, TILE, TILE)
                if all(lo == hi for lo, hi in img.getextrema()):
                    continue  # all sea: the game paints the background
                img.save(os.path.join(d, f"{i}_{j}.webp"), quality=82, method=6)
                have[lv].append(f"{i}_{j}")
        print(f"tiles {lv}: {len(have[lv])} of {nx * nz}")
    return have


def graph(nodes, ways):
    """the walking network: every node of the walkable ways (the island is small)"""
    use, edges = {}, set()
    for w in ways.values():
        t = w["tags"]
        if t.get("highway") not in WALK or t.get("area") == "yes": continue
        if t.get("access") in ("private", "no") and t.get("highway") == "service": continue
        nd = [i for i in w["nd"] if i in nodes]
        for a, b in zip(nd, nd[1:]):
            pa, pb = nodes[a], nodes[b]
            inside = lambda p: BOX[0] <= p[0] <= BOX[2] and BOX[1] <= p[1] <= BOX[3]
            if not (inside(pa) and inside(pb)): continue
            for i in (a, b): use.setdefault(i, len(use))
            edges.add((min(use[a], use[b]), max(use[a], use[b])))
    xy = [None] * len(use)
    for i, k in use.items(): xy[k] = nodes[i]
    # keep the biggest connected piece
    par = list(range(len(xy)))
    def f(i):
        while par[i] != i: par[i] = par[par[i]]; i = par[i]
        return i
    for a, b in edges: par[f(a)] = f(b)
    size = {}
    for i in range(len(xy)): size[f(i)] = size.get(f(i), 0) + 1
    main = max(size, key=size.get)
    keep = [i for i in range(len(xy)) if f(i) == main]
    new = {o: n for n, o in enumerate(keep)}
    xy = [xy[o] for o in keep]
    edges = sorted((new[a], new[b]) for a, b in edges if a in new and b in new)
    print(f"paths: {len(xy)} points, {len(edges)} pieces")
    return xy, edges


def centroid(p):
    a = cx = cz = 0.0
    for (x1, z1), (x2, z2) in zip(p, p[1:] + p[:1]):
        c = x1 * z2 - x2 * z1
        a += c; cx += (x1 + x2) * c; cz += (z1 + z2) * c
    if abs(a) < 1e-6:
        return sum(x for x, z in p) / len(p), sum(z for x, z in p) / len(p)
    return cx / (3 * a), cz / (3 * a)


def seg_dist(px, pz, ax, az, bx, bz):
    vx, vz = bx - ax, bz - az
    L2 = vx * vx + vz * vz
    t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * vx + (pz - az) * vz) / L2))
    return math.hypot(px - ax - vx * t, pz - az - vz * t)


def simplify(p, eps):
    if len(p) < 3: return p
    (ax, az), (bx, bz) = p[0], p[-1]
    i, d = max(((i, seg_dist(x, z, ax, az, bx, bz)) for i, (x, z) in enumerate(p[1:-1], 1)), key=lambda q: q[1])
    if d < eps: return [p[0], p[-1]]
    return simplify(p[:i + 1], eps)[:-1] + simplify(p[i:], eps)


def animals(nodes, ways, xy):
    out = {}
    for aid, wid in ANIMALS.items():
        w = ways[str(wid)]
        p = pts(nodes, w["nd"])
        if p[0] == p[-1]: p = p[:-1]
        cx, cz = centroid(p)
        # where to stand: the path point nearest to the fence
        best, bd = 0, 1e9
        for i, (x, z) in enumerate(xy):
            d = min(seg_dist(x, z, *p[j], *p[(j + 1) % len(p)]) for j in range(len(p)))
            if d < bd: best, bd = i, d
        out[aid] = {"x": round(cx, 1), "z": round(cz, 1), "node": best, "gap": round(bd, 1),
                    "pen": [round(v, 1) for q in simplify(p + [p[0]], 1.0) for v in q], "osm": wid}
        print(f"  {aid:<14} pen {len(p):3d} pts  stand {bd:5.1f} m from the fence")
    return out


def main():
    nodes, ways, rels = load()
    areas, lines = features(nodes, ways, rels)
    have = None if "--no-tiles" in sys.argv else tiles(areas, lines)
    if have is None:
        have = json.load(open(os.path.join(GAME, "lib", "tiles.json")))
    xy, edges = graph(nodes, ways)
    an = animals(nodes, ways, xy)
    lib = os.path.join(GAME, "lib")
    os.makedirs(lib, exist_ok=True)
    json.dump(have, open(os.path.join(lib, "tiles.json"), "w"))
    # entrances: the bridge from Mustikkamaa and the ferry pier
    def nearest(x, z):
        return min(range(len(xy)), key=lambda i: math.hypot(xy[i][0] - x, xy[i][1] - z))
    gates = {}
    for wid in ("1571344481",):  # the entrance building Paanu
        gx, gz = centroid(pts(nodes, ways[wid]["nd"])[:-1])
        gates["paanu"] = nearest(gx, gz)
    fx, fz = nodes["6461325196"]  # the ferry pier
    gates["laituri"] = nearest(fx, fz)
    data = {
        "box": list(BOX), "tile": TILE, "levels": LEVELS, "have": have,
        "lat0": LAT0, "lon0": LON0, "kx": round(KX, 3), "ky": KY,
        # path points as decimetres, then the pieces as pairs of point numbers
        "nodes": [v for x, z in xy for v in (round(x * 10), round(z * 10))],
        "edges": [v for e in edges for v in e],
        "gates": gates,
        "animals": an,
    }
    with open(os.path.join(lib, "mapdata.ts"), "w") as f:
        f.write("// GENERATED by tools/korkeasaari/build_map.py from OpenStreetMap data\n"
                "// (c) OpenStreetMap contributors, ODbL 1.0. Metres: x east, z south.\n")
        f.write("export const MAP: any = " + json.dumps(data, separators=(",", ":")) + ";\n")
    print("lib/mapdata.ts", os.path.getsize(os.path.join(lib, "mapdata.ts")), "bytes")


if __name__ == "__main__":
    main()
