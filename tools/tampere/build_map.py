#!/usr/bin/env python3
"""Tampere city-centre map for the game "Tampereen kävelijä" (games/tampere).

Reads the map data of Tampere Taxi Driver (terotests/TampereTaxiDriver):
  data/tampere-full.ttd.gz        streets, buildings, greens, water, trees,
                                  traffic signals, tram routes (OSM + city data)
  data/src/streets.geojson        the city's street-area polygons
                                  (carriageway, sidewalk, cycle path, square)
  data/src/tampere-osm.json       OSM: pedestrian crossings, tram platforms

and writes into games/tampere/:
  tiles/<col>_<row>.png           the map drawn at PPM pixels a metre, TILE m tiles
  overview.png                    the whole map small, for the map view
  lib/mapdata.ts                  walk grid, crossings, signals, car roads,
                                  bike paths, tram lines and stops, places

Usage: python3 tools/tampere/build_map.py <TampereTaxiDriver dir>
  GTFS=<dir>  the unzipped Nysse GTFS (only the trams is enough): real tram
              lines, stops and timetables (Mon-Thu, Fri, Sat, Sun) instead
              of Tampere Taxi Driver's tram routes
Map data (c) OpenStreetMap contributors (ODbL); Tampereen kaupunki /
Maanmittauslaitos (CC BY 4.0); Nysse (CC BY 4.0).
"""
import gzip, json, math, os, sys
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC = sys.argv[1] if len(sys.argv) > 1 else "../TampereTaxiDriver"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "games", "tampere")
X0, Z0, X1, Z1 = -1460, -780, 940, 620     # metres, x east, z south (TTD frame)
PPM = 3                                     # pixels a metre in the tiles (= game px)
TILE = 100                                  # metres a tile
SS = 2                                      # supersampling
CELL = 2                                    # walk grid cell, metres
LAT0, LON0 = 61.4994, 23.764
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110950
W, H = X1 - X0, Z1 - Z0
GW, GH = W // CELL, H // CELL

def proj(lon, lat):
    return ((lon - LON0) * KX, -(lat - LAT0) * KY)

# ---------------------------------------------------------------- load TTD
ttd = gzip.open(os.path.join(SRC, "data/tampere-full.ttd.gz"), "rt", encoding="utf8").read()
names_s, rest = ttd.split("%", 1)
NAMES = names_s.split("|")
M = 60  # margin for clipping
def inb(pts, m=M):
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    return max(xs) > X0 - m and min(xs) < X1 + m and max(zs) > Z0 - m and min(zs) < Z1 + m

def pts_of(nums):
    return [(nums[i] / 10, nums[i + 1] / 10) for i in range(0, len(nums), 2)]

streets, greens, waters, buildings, foots, trams_m, rails, trees, signals, routes = [], [], [], [], [], [], [], [], [], []
for rec in rest.split(";"):
    p = rec.split()
    if not p: continue
    k = p[0]
    try:
        if k == "S":
            cls = int(p[1]); n = int(p[3]); pts = pts_of(list(map(int, p[4:4 + 2 * n])))
            if inb(pts): streets.append({"cls": cls % 10, "oneway": cls >= 10, "name": NAMES[int(p[2])], "p": pts})
        elif k == "G":
            n = int(p[2]); pts = pts_of(list(map(int, p[3:3 + 2 * n])))
            if inb(pts): greens.append((int(p[1]), pts))
        elif k == "W":
            n = int(p[2]); pts = pts_of(list(map(int, p[3:3 + 2 * n])))
            if inb(pts): waters.append(pts)
        elif k == "B":
            n = int(p[3]); pts = pts_of(list(map(int, p[4:4 + 2 * n])))
            if inb(pts): buildings.append((int(p[1]), int(p[2]), pts))
        elif k == "F":
            n = int(p[2]); pts = pts_of(list(map(int, p[3:3 + 2 * n])))
            if inb(pts): foots.append((int(p[1]), pts))
        elif k == "M":
            n = int(p[1]); pts = pts_of(list(map(int, p[2:2 + 2 * n])))
            if inb(pts): trams_m.append(pts)
        elif k == "L":
            n = int(p[1]); pts = pts_of(list(map(int, p[2:2 + 2 * n])))
            if inb(pts): rails.append(pts)
        elif k == "T":
            n = int(p[1]); pts = pts_of(list(map(int, p[2:2 + 2 * n])))
            trees += [q for q in pts if X0 - 10 < q[0] < X1 + 10 and Z0 - 10 < q[1] < Z1 + 10]
        elif k == "C":
            x, z = int(p[1]) / 10, int(p[2]) / 10
            if X0 - 20 < x < X1 + 20 and Z0 - 20 < z < Z1 + 20: signals.append((x, z))
        elif k == "N" and p[1] == "0":
            n = int(p[3]); pts = pts_of(list(map(int, p[4:4 + 2 * n])))
            routes.append((NAMES[int(p[2])], pts))
    except (ValueError, IndexError):
        pass
print(f"ttd: {len(streets)} streets, {len(buildings)} buildings, {len(greens)} greens, {len(waters)} water, "
      f"{len(foots)} paths, {len(trees)} trees, {len(signals)} signals, {len(routes)} tram shapes")

# ---------------------------------------------------------------- city street areas
AREA = {
    "AJORATA": "road", "AJORATA/RAITIOTIE": "road", "RAITIOTIE": "tram", "TONTTILIITTYMÄ": "road",
    "JALKAKÄYTÄVÄ": "walk", "PORTAAT": "steps", "TORI / AUKIO": "plaza", "PYSÄKÖINTIALUE": "parking",
    "EROTETTU JK/PP": "bike2", "YHDISTETTY JK/PP": "walk", "PYÖRÄTIE": "bike", "PYÖRÄKAISTA": "road",
}
areas = []
for ft in json.load(open(os.path.join(SRC, "data/src/streets.geojson")))["features"]:
    kind = AREA.get(ft["properties"].get("katuosalaji"))
    if not kind: continue
    g = ft["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    for poly in polys:
        rings = [[proj(*c[:2]) for c in ring] for ring in poly]
        if rings and len(rings[0]) > 2 and inb(rings[0]): areas.append((kind, rings))
print(f"street areas: {len(areas)}")

# ---------------------------------------------------------------- OSM crossings and platforms
osm = json.load(open(os.path.join(SRC, "data/src/tampere-osm.json")))["elements"]
osm_cross, platforms = [], defaultdict(list)
for e in osm:
    t = e.get("tags", {})
    g = e.get("geometry")
    if e["type"] != "way" or not g: continue
    pts = [proj(q["lon"], q["lat"]) for q in g]
    if t.get("public_transport") == "platform" and t.get("name") and e["id"] != 197366106:
        platforms[t["name"].rsplit(" ", 1)[0]].append(pts)
    elif t.get("highway") in ("footway", "cycleway", "path") and (t.get("footway") == "crossing" or t.get("cycleway") == "crossing" or "crossing" in t):
        osm_cross.append((pts, t.get("crossing") == "traffic_signals"))
OSM_XMAX = proj(23.7772976, 61.5)[0] - 15    # east edge of the OSM extract

# ---------------------------------------------------------------- helpers
def to_px(x, z, ox, oz, s):
    return ((x - ox) * s, (z - oz) * s)

def seg_len(a, b): return math.hypot(b[0] - a[0], b[1] - a[1])

def bbox(pts):
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    return (min(xs), min(zs), max(xs), max(zs))

ROAD_W = {1: 15, 2: 12, 3: 9, 4: 7}

# ---------------------------------------------------------------- walk grid (1 m raster, then 2 m cells)
# classes: 0 blocked, 1 walk, 2 road, 3 crossing, 4 bike path, 5 tram track
print("walk grid ...")
R = Image.new("L", (W, H), 1)
d = ImageDraw.Draw(R)
def poly1(pts, v):
    if len(pts) > 2: d.polygon([to_px(x, z, X0, Z0, 1) for x, z in pts], fill=v)
for w in waters: poly1(w, 0)
for kind, rings in areas:
    if kind in ("walk", "plaza", "parking", "steps"): poly1(rings[0], 1)
for kind, rings in areas:
    if kind in ("bike", "bike2"): poly1(rings[0], 4)
for kind, rings in areas:
    if kind == "road": poly1(rings[0], 2)
    elif kind == "tram": poly1(rings[0], 5)
# streets without a city polygon (east edge, outside the city data): a line
area_cover = Image.new("L", (W, H), 0)
ad = ImageDraw.Draw(area_cover)
for kind, rings in areas:
    if len(rings[0]) > 2: ad.polygon([to_px(x, z, X0, Z0, 1) for x, z in rings[0]], fill=1)
for s in streets:
    mid = s["p"][len(s["p"]) // 2]
    mx, mz = int(mid[0] - X0), int(mid[1] - Z0)
    if 0 <= mx < W and 0 <= mz < H and area_cover.getpixel((mx, mz)) == 0 and (mid[0] > 1000):
        d.line([to_px(x, z, X0, Z0, 1) for x, z in s["p"]], fill=2, width=ROAD_W[s["cls"]])

# crossings: OSM ways where the extract has them, generated ones east of it
crossings = []   # {a, b, sig}
for pts, sig in osm_cross:
    if not inb(pts, 0): continue
    a, b = pts[0], pts[-1]
    if seg_len(a, b) < 3: continue
    # it must cross road or tram track
    n = max(2, int(seg_len(a, b)))
    hits = 0
    for i in range(n + 1):
        x = a[0] + (b[0] - a[0]) * i / n; z = a[1] + (b[1] - a[1]) * i / n
        px, pz = int(x - X0), int(z - Z0)
        if 0 <= px < W and 0 <= pz < H and R.getpixel((px, pz)) in (2, 5): hits += 1
    if hits >= 2: crossings.append({"a": a, "b": b, "sig": sig})

# street graph nodes (for generated crossings and signals)
def key(p): return (round(p[0]), round(p[1]))
node_arms = defaultdict(list)
for s in streets:
    p = s["p"]
    for i, q in enumerate(p):   # interior points too: a street can run through a junction
        if i > 0: node_arms[key(q)].append((s, q, p[i - 1]))
        if i < len(p) - 1: node_arms[key(q)].append((s, q, p[i + 1]))
RA = None
def is_road(x, z):
    px, pz = int(x - X0), int(z - Z0)
    return 0 <= px < W and 0 <= pz < H and RA[pz, px] in (2, 5)
def march(cx, cz, ux, uz):
    """from a point on the road, out along (ux, uz) to the first walkable ground
    (short gaps such as traffic islands are crossed); None if it never ends"""
    last_road, t, gap = 0.0, 0.0, 0.0
    while t < 34:
        t += 0.5
        if is_road(cx + ux * t, cz + uz * t):
            last_road, gap = t, 0.0
        else:
            gap += 0.5
            if gap > 4.5: return last_road + 1.0
    return None
import numpy as np
RA = np.array(R, dtype=np.uint8)
def fit_crossing(cx, cz, ux, uz):
    """a crossing through (cx, cz) walking along (ux, uz), kerb to kerb"""
    if not is_road(cx, cz): return None
    ta = march(cx, cz, -ux, -uz); tb = march(cx, cz, ux, uz)
    if ta is None or tb is None or ta + tb > 40: return None
    return {"a": (cx - ux * ta, cz - uz * ta), "b": (cx + ux * tb, cz + uz * tb)}
CROSS = []
def angdiff_(a, b):
    d0 = abs((a - b) % math.pi)
    return min(d0, math.pi - d0)
def mid(c): return ((c["a"][0] + c["b"][0]) / 2, (c["a"][1] + c["b"][1]) / 2)
# Real crossings: where a footway or cycle path of OSM (Tampere Taxi Driver's
# F lines, plus the ways tagged as crossings) runs over a carriageway.
street_segs = []
for st in streets:
    for p0, p1 in zip(st["p"], st["p"][1:]):
        street_segs.append((p0, p1))
def street_dir_near(x, z):
    best = None
    for p0, p1 in street_segs:
        L = seg_len(p0, p1)
        if L < 0.5: continue
        k = max(0, min(1, ((x - p0[0]) * (p1[0] - p0[0]) + (z - p0[1]) * (p1[1] - p0[1])) / (L * L)))
        dd = math.hypot(x - (p0[0] + (p1[0] - p0[0]) * k), z - (p0[1] + (p1[1] - p0[1]) * k))
        if dd < 25 and (best is None or dd < best[0]): best = (dd, math.atan2(p1[1] - p0[1], p1[0] - p0[0]))
    return None if best is None else best[1]
signal_ways = [mid({"a": c["a"], "b": c["b"]}) for c in crossings if c["sig"]]
foot_lines = [pts for kind, pts in foots if kind != 4] + [c[0] for c in osm_cross]
found = []
for pts in foot_lines:
    if not inb(pts, 0): continue
    for p0, p1 in zip(pts, pts[1:]):
        L = seg_len(p0, p1)
        if L < 1: continue
        ux, uz = (p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L
        run = None
        n = int(L / 0.5) + 1
        for i in range(n + 1):
            tt = min(L, i * 0.5)
            x, z = p0[0] + ux * tt, p0[1] + uz * tt
            r = is_road(x, z)
            if r and run is None: run = tt
            if (not r or i == n) and run is not None:
                if not r and run > 0 and 2.0 <= tt - run <= 32:
                    mx, mz = p0[0] + ux * (run + tt) / 2, p0[1] + uz * (run + tt) / 2
                    sd = street_dir_near(mx, mz)
                    if sd is None or angdiff_(sd, math.atan2(uz, ux)) > 0.6:
                        f = fit_crossing(mx, mz, ux, uz)
                        if f and all(math.hypot(mid(f)[0] - q[0], mid(f)[1] - q[1]) > 6 for q in found):
                            f["sig"] = any(math.hypot(mid(f)[0] - q[0], mid(f)[1] - q[1]) < 8 for q in signal_ways)
                            crossings_new = found.append(mid(f))
                            f["gen"] = False
                            CROSS.append(f)
                run = None
crossings = CROSS
print(f"crossings from footways over carriageways: {len(crossings)}")
# arm positions of every street junction: where a crossing would usually be
arm_spots = []
for k, arms in node_arms.items():
    if len(arms) < 3: continue
    nx, nz = arms[0][1]
    if not (X0 < nx < X1 and Z0 < nz < Z1): continue
    lit = any(math.hypot(sx_ - nx, sz_ - nz) < 30 for sx_, sz_ in signals)
    wmax = max(ROAD_W[a[0]["cls"]] for a in arms)
    for st, p0, p1 in arms:
        L = seg_len(p0, p1)
        dd = wmax / 2 + 3
        if L < dd + 2: continue
        ux, uz = (p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L
        arm_spots.append((lit, p0[0] + ux * dd, p0[1] + uz * dd, -uz, ux, st["cls"]))
# Streets often cross without a shared point in the data, so also find the
# junctions geometrically: where two streets' centre lines cross or a street
# ends within a few metres of another.
def walk_poly(p, i, t, sign, dist):
    """point `dist` metres from p[i]+t*(p[i+1]-p[i]) along polyline p (sign +1/-1),
    with the local direction; None if the street ends first"""
    x = p[i][0] + (p[i + 1][0] - p[i][0]) * t; z = p[i][1] + (p[i + 1][1] - p[i][1]) * t
    j = i + 1 if sign > 0 else i
    while 0 <= j < len(p):
        L = math.hypot(p[j][0] - x, p[j][1] - z)
        if L >= dist and L > 0:
            ux, uz = (p[j][0] - x) / L, (p[j][1] - z) / L
            return (x + ux * dist, z + uz * dist, ux, uz)
        dist -= L; x, z = p[j]; j += sign
    return None
segs_all = []
for si, st in enumerate(streets):
    p = st["p"]
    for i in range(len(p) - 1): segs_all.append((si, i))
buck = defaultdict(list)
for k, (si, i) in enumerate(segs_all):
    a, b = streets[si]["p"][i], streets[si]["p"][i + 1]
    for bx in range(int(min(a[0], b[0]) // 20) - 1, int(max(a[0], b[0]) // 20) + 2):
        for bz in range(int(min(a[1], b[1]) // 20) - 1, int(max(a[1], b[1]) // 20) + 2):
            buck[(bx, bz)].append(k)
jpts = []   # (x, z, [(street, seg, t)])
def add_j(x, z, hits):
    for J in jpts:
        if math.hypot(J[0] - x, J[1] - z) < 8:
            J[2].extend(hits); return
    jpts.append((x, z, list(hits)))
seen_pairs = set()
for cellk, ks in buck.items():
    for ia in range(len(ks)):
        for ib in range(ia + 1, len(ks)):
            ka, kb = ks[ia], ks[ib]
            sa, ia_ = segs_all[ka]; sb, ib_ = segs_all[kb]
            if sa == sb or (ka, kb) in seen_pairs: continue
            seen_pairs.add((ka, kb))
            pa, pb = streets[sa]["p"], streets[sb]["p"]
            a0, a1, b0, b1 = pa[ia_], pa[ia_ + 1], pb[ib_], pb[ib_ + 1]
            dx1, dz1 = a1[0] - a0[0], a1[1] - a0[1]; dx2, dz2 = b1[0] - b0[0], b1[1] - b0[1]
            den = dx1 * dz2 - dz1 * dx2
            La, Lb = math.hypot(dx1, dz1), math.hypot(dx2, dz2)
            if abs(den) < 1e-9 or La < 0.5 or Lb < 0.5: continue
            if abs(den) / (La * Lb) < 0.35: continue          # nearly parallel
            t = ((b0[0] - a0[0]) * dz2 - (b0[1] - a0[1]) * dx2) / den
            u = ((b0[0] - a0[0]) * dz1 - (b0[1] - a0[1]) * dx1) / den
            # a street's own ends may fall short of the other street by a few metres
            ea0 = 3 / La if ia_ == 0 else 0; ea1 = 3 / La if ia_ == len(pa) - 2 else 0
            eb0 = 3 / Lb if ib_ == 0 else 0; eb1 = 3 / Lb if ib_ == len(pb) - 2 else 0
            if -ea0 <= t <= 1 + ea1 and -eb0 <= u <= 1 + eb1:
                x, z = a0[0] + dx1 * t, a0[1] + dz1 * t
                if X0 < x < X1 and Z0 < z < Z1:
                    add_j(x, z, [(sa, ia_, max(0, min(1, t))), (sb, ib_, max(0, min(1, u)))])
for x, z, hits in jpts:
    lit = any(math.hypot(sx_ - x, sz_ - z) < 30 for sx_, sz_ in signals)
    wmax = max(ROAD_W[streets[si]["cls"]] for si, _, _ in hits)
    done = set()
    for si, i, t in hits:
        if si in done: continue
        done.add(si)
        p = streets[si]["p"]
        for sign in (1, -1):
            w = walk_poly(p, i, t, sign, wmax / 2 + 3)
            if w and walk_poly(p, i, t, sign, wmax / 2 + 5):
                arm_spots.append((lit, w[0], w[1], -w[3], w[2], streets[si]["cls"]))
print(f"junctions found geometrically: {len(jpts)}")
# junctions with traffic lights have a crossing on every arm
gen = 0
for lit, cx, cz, ux, uz, _cls in arm_spots:
    if not lit: continue
    if any(math.hypot(mid(c)[0] - cx, mid(c)[1] - cz) < 12 for c in crossings): continue
    f = fit_crossing(cx, cz, ux, uz)
    if not f: continue
    f["sig"] = False; f["gen"] = True
    crossings.append(f); gen += 1
print(f"crossings added at traffic lights: {gen}")
# ---- walk grid with the crossings marked
CW = 4.0
def cross_poly(c, w=CW, ext=0.0):
    a, b = c["a"], c["b"]
    L = seg_len(a, b); ux, uz = (b[0] - a[0]) / L, (b[1] - a[1]) / L
    ax, az = a[0] - ux * ext, a[1] - uz * ext; bx, bz = b[0] + ux * ext, b[1] + uz * ext
    nx, nz = -uz * w / 2, ux * w / 2
    return [(ax + nx, az + nz), (bx + nx, bz + nz), (bx - nx, bz - nz), (ax - nx, az - nz)]
BI = Image.new("L", (W, H), 1)
bd = ImageDraw.Draw(BI)
for bld in buildings:
    if len(bld[2]) > 2: bd.polygon([to_px(x, z, X0, Z0, 1) for x, z in bld[2]], fill=0)
B0 = np.array(BI, dtype=np.uint8)
# Other junctions: in the city centre almost every arm of a junction has a
# zebra crossing (the city and OSM data only map some of them).
def on_foot_ground(x, z):
    px, pz = int(x - X0), int(z - Z0)
    if not (0 <= px < W and 0 <= pz < H): return False
    return B0[pz, px] == 1 and RA[pz, px] not in (2, 5)
gen = 0
REJ = defaultdict(int); REJP = []
for lit, cx, cz, ux, uz, cls in arm_spots:
    if lit: continue
    if any(math.hypot(mid(c)[0] - cx, mid(c)[1] - cz) < 7 for c in crossings): REJ["near"] += 1; REJP.append((cx, cz, "near")); continue
    f = fit_crossing(cx, cz, ux, uz)
    if not f: REJ["fit"] += 1; REJP.append((cx, cz, "fit")); continue
    if seg_len(f["a"], f["b"]) > 20: REJ["long"] += 1; REJP.append((cx, cz, "long")); continue
    L = seg_len(f["a"], f["b"]); vx, vz = (f["b"][0] - f["a"][0]) / L, (f["b"][1] - f["a"][1]) / L
    if not (on_foot_ground(f["a"][0] - vx, f["a"][1] - vz) and on_foot_ground(f["b"][0] + vx, f["b"][1] + vz)): REJ["ground"] += 1; REJP.append((cx, cz, "ground")); continue
    f["sig"] = False; f["gen"] = True
    crossings.append(f); gen += 1
print(f"crossings added at other junctions: {gen}", dict(REJ))
if os.environ.get("DEBUGREJ"): json.dump({"rej": REJP, "arms": [(a[1], a[2]) for a in arm_spots]}, open(os.environ["DEBUGREJ"], "w"))
DRIVE_FIX = []   # pavement over driveways: {a, b}
def compute_G(crossings):
    cross_mask = Image.new("L", (W, H), 0)
    cmd = ImageDraw.Draw(cross_mask)
    for c in crossings:
        cmd.polygon([to_px(x, z, X0, Z0, 1) for x, z in cross_poly(c, CW, 1.0)], fill=1)
    for c in DRIVE_FIX:
        cmd.polygon([to_px(x, z, X0, Z0, 1) for x, z in cross_poly(c, 3.0, 1.0)], fill=2)
    A = RA.copy()
    CM = np.array(cross_mask, dtype=np.uint8)
    A[(CM == 1) & ((A == 2) | (A == 5))] = 3
    A[(CM == 2) & (A == 2)] = 1
    A[(B0 == 0) & (A != 3)] = 0
    blocks = A[:GH * CELL, :GW * CELL].reshape(GH, CELL, GW, CELL).transpose(0, 2, 1, 3).reshape(GH, GW, CELL * CELL)
    G = np.zeros((GH, GW), dtype=np.uint8)
    has = lambda v: (blocks == v).any(axis=2)
    cnt = lambda v: (blocks == v).sum(axis=2)
    G[cnt(0) < 3] = 1
    G[(cnt(5) >= 2)] = 5
    G[(cnt(2) >= 2)] = 2
    G[has(4) & (cnt(4) >= 2)] = 4
    G[(cnt(1) >= 2)] = 1
    G[has(3)] = 3
    G[cnt(0) >= 3] = 0
    return G
def components(G):
    walk = np.isin(G, (1, 3, 4))
    lab = np.full(G.shape, -1, dtype=np.int32)
    sizes = []
    for z0 in range(GH):
        for x0 in range(GW):
            if walk[z0, x0] and lab[z0, x0] < 0:
                k = len(sizes); n = 0
                stack = [(x0, z0)]; lab[z0, x0] = k
                while stack:
                    x, z = stack.pop(); n += 1
                    for X, Z in ((x + 1, z), (x - 1, z), (x, z + 1), (x, z - 1)):
                        if 0 <= X < GW and 0 <= Z < GH and walk[Z, X] and lab[Z, X] < 0:
                            lab[Z, X] = k; stack.append((X, Z))
                sizes.append(n)
    return lab, sizes
def comp_at(lab, x, z):
    gx, gz = int((x - X0) / CELL), int((z - Z0) / CELL)
    best = -1
    for dz in (-1, 0, 1):
        for dx in (-1, 0, 1):
            X, Z = gx + dx, gz + dz
            if 0 <= X < GW and 0 <= Z < GH and lab[Z, X] >= 0: return lab[Z, X]
    return best
# join the walkable areas: crossings along streets where two areas meet
G = compute_G(crossings)
for rnd in range(3):
    lab, sizes = components(G)
    parent = list(range(len(sizes)))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for c in crossings:
        ca, cb = comp_at(lab, *c["a"]), comp_at(lab, *c["b"])
        if ca >= 0 and cb >= 0: parent[find(ca)] = find(cb)
    added = 0
    for lit, cx, cz, ux, uz, _cls in arm_spots:
        f = fit_crossing(cx, cz, ux, uz)
        if not f: continue
        ca, cb = comp_at(lab, *f["a"]), comp_at(lab, *f["b"])
        if ca < 0 or cb < 0 or find(ca) == find(cb): continue
        if min(sizes[ca], sizes[cb]) < 25: continue
        if any(math.hypot(mid(c)[0] - cx, mid(c)[1] - cz) < 12 for c in crossings): continue
        parent[find(ca)] = find(cb)
        f["sig"] = False; f["gen"] = True
        crossings.append(f); added += 1
    for st in streets:
        p = st["p"]
        for a0, b0 in zip(p, p[1:]):
            L = seg_len(a0, b0)
            if L < 8: continue
            ux, uz = (b0[0] - a0[0]) / L, (b0[1] - a0[1]) / L
            t = 6.0
            while t < L - 6:
                cx, cz = a0[0] + ux * t, a0[1] + uz * t
                t += 10
                if not (X0 + 5 < cx < X1 - 5 and Z0 + 5 < cz < Z1 - 5): continue
                f = fit_crossing(cx, cz, -uz, ux)
                if not f: continue
                ca, cb = comp_at(lab, *f["a"]), comp_at(lab, *f["b"])
                if ca < 0 or cb < 0 or find(ca) == find(cb): continue
                if min(sizes[ca], sizes[cb]) < 25: continue
                if any(math.hypot(mid(c)[0] - cx, mid(c)[1] - cz) < 25 for c in crossings): continue
                parent[find(ca)] = find(cb)
                f["sig"] = False; f["gen"] = True
                crossings.append(f); added += 1
    print(f"round {rnd}: {len(sizes)} areas, {added} joining crossings")
    if not added: break
    G = compute_G(crossings)

# Where the two kerbs of a street are only reachable from each other by a
# long walk round (no crossing near), add one in the middle of the block.
from collections import deque
def walk_dist(G, a, b, limit):
    ax, az = int((a[0] - X0) / CELL), int((a[1] - Z0) / CELL)
    bx, bz = int((b[0] - X0) / CELL), int((b[1] - Z0) / CELL)
    if not (0 <= ax < GW and 0 <= az < GH and 0 <= bx < GW and 0 <= bz < GH): return 0
    if G[az, ax] not in (1, 3, 4) or G[bz, bx] not in (1, 3, 4): return 0
    D = {(ax, az): 0}; q = deque([(ax, az)])
    while q:
        x, z = q.popleft(); dd = D[(x, z)]
        if (x, z) == (bx, bz): return dd
        if dd >= limit: continue
        for X, Z in ((x + 1, z), (x - 1, z), (x, z + 1), (x, z - 1)):
            if (X, Z) not in D and 0 <= X < GW and 0 <= Z < GH and G[Z, X] in (1, 3, 4):
                D[(X, Z)] = dd + 1; q.append((X, Z))
    return None
gen = 0; added_mid = []
for st in streets:
    p = st["p"]; maxw = 14 if st["cls"] >= 3 else 20
    for i in range(len(p) - 1):
        L = seg_len(p[i], p[i + 1])
        if L < 1: continue
        ux, uz = (p[i + 1][0] - p[i][0]) / L, (p[i + 1][1] - p[i][1]) / L
        t = 3.0
        while t < L - 3:
            cx, cz = p[i][0] + ux * t, p[i][1] + uz * t
            t += 8
            if not (X0 + 5 < cx < X1 - 5 and Z0 + 5 < cz < Z1 - 5): continue
            if any(math.hypot(mid(c)[0] - cx, mid(c)[1] - cz) < 30 for c in crossings): continue
            if any(math.hypot(q[0] - cx, q[1] - cz) < 50 for q in added_mid): continue
            f = fit_crossing(cx, cz, -uz, ux)
            if not f or seg_len(f["a"], f["b"]) > maxw: continue
            Lf = seg_len(f["a"], f["b"]); vx, vz = (f["b"][0] - f["a"][0]) / Lf, (f["b"][1] - f["a"][1]) / Lf
            ea = (f["a"][0] - vx * 1.5, f["a"][1] - vz * 1.5); eb = (f["b"][0] + vx * 1.5, f["b"][1] + vz * 1.5)
            wd = walk_dist(G, ea, eb, 60)   # 60 cells = 120 m
            if wd is not None: continue     # close enough round, or an end is not walkable
            f["sig"] = False; f["gen"] = True
            crossings.append(f); added_mid.append((cx, cz)); gen += 1
print(f"crossings added mid-block where the way round is over 120 m: {gen}")
G = compute_G(crossings)

# Driveways and car park entrances: a short strip of carriageway across the
# pavement (often without a street line of its own). Where the two pavement
# ends are far apart on foot, the pavement simply goes over it (no zebra:
# there is none in reality either, and no car drives there in the game).
def near_street_line(p, r):
    for p0, p1 in street_segs:
        if min(p0[0], p1[0]) - r > p[0] or max(p0[0], p1[0]) + r < p[0] or min(p0[1], p1[1]) - r > p[1] or max(p0[1], p1[1]) + r < p[1]: continue
        L = seg_len(p0, p1)
        if L < 0.01: continue
        k_ = max(0, min(1, ((p[0] - p0[0]) * (p1[0] - p0[0]) + (p[1] - p0[1]) * (p1[1] - p0[1])) / (L * L)))
        if math.hypot(p[0] - p0[0] - (p1[0] - p0[0]) * k_, p[1] - p0[1] - (p1[1] - p0[1]) * k_) < r: return True
    return False
gen = 0; added_dw = []
cxy = lambda gx, gz: (X0 + (gx + 0.5) * CELL, Z0 + (gz + 0.5) * CELL)
road_cells = np.argwhere(G == 2)
for gz, gx in road_cells:
    for dx, dz in ((1, 0), (0, 1), (1, 1), (1, -1)):
        # only start at the first road cell of a run
        if 0 <= gx - dx < GW and 0 <= gz - dz < GH and G[gz - dz, gx - dx] == 2: continue
        n = 0
        while n < 6 and 0 <= gx + dx * n < GW and 0 <= gz + dz * n < GH and G[gz + dz * n, gx + dx * n] == 2: n += 1
        if n >= 6 or n < 1: continue
        ax, az = gx - dx, gz - dz; bx, bz = gx + dx * n, gz + dz * n
        if not (0 <= ax < GW and 0 <= az < GH and 0 <= bx < GW and 0 <= bz < GH): continue
        if G[az, ax] not in (1, 4) or G[bz, bx] not in (1, 4): continue
        a, b = cxy(ax, az), cxy(bx, bz)
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if any(math.hypot(mid(c)[0] - m[0], mid(c)[1] - m[1]) < 15 for c in crossings): continue
        if any(math.hypot(q[0] - m[0], q[1] - m[1]) < 25 for q in added_dw): continue
        if near_street_line(m, 6): continue                    # a real street: cars drive there
        if walk_dist(G, a, b, 40) is not None: continue        # under 80 m round: fine
        DRIVE_FIX.append({"a": a, "b": b}); added_dw.append(m); gen += 1
print(f"driveways made walkable: {gen}")
G = compute_G(crossings)

# signals: a crossing within 22 m of a signal node is controlled by it
for c in crossings:
    mx, mz = (c["a"][0] + c["b"][0]) / 2, (c["a"][1] + c["b"][1]) / 2
    best = None
    for i, (sx, sz) in enumerate(signals):
        dd = math.hypot(sx - mx, sz - mz)
        if dd < 24 and (best is None or dd < best[0]): best = (dd, i)
    c["signal"] = best[1] if best else -1
    if c["signal"] < 0 and c["sig"]:
        c["sig"] = False
print(f"crossings: {len(crossings)} ({sum(1 for c in crossings if c['signal'] >= 0)} with lights)")

# signal intersections: cluster signal nodes within 35 m
groups = []
sig_group = [-1] * len(signals)
for i, (sx, sz) in enumerate(signals):
    if sig_group[i] >= 0: continue
    g = len(groups); groups.append([i]); sig_group[i] = g
    stack = [i]
    while stack:
        j = stack.pop()
        for k2, (tx, tz) in enumerate(signals):
            if sig_group[k2] < 0 and math.hypot(tx - signals[j][0], tz - signals[j][1]) < 35:
                sig_group[k2] = g; groups[g].append(k2); stack.append(k2)
inters = []
for g in groups:
    cx = sum(signals[i][0] for i in g) / len(g); cz = sum(signals[i][1] for i in g) / len(g)
    # main axis: length-weighted street bearing (mod 180) of segments within 45 m
    sx = sy = 0.0
    for s in streets:
        p = s["p"]
        for a, b in zip(p, p[1:]):
            mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            if math.hypot(mx - cx, mz - cz) < 45:
                ang = math.atan2(b[1] - a[1], b[0] - a[0]) * 2
                L = seg_len(a, b) * (4 - min(3, s["cls"] - 1))
                sx += math.cos(ang) * L; sy += math.sin(ang) * L
    axis = math.atan2(sy, sx) / 2
    inters.append({"x": cx, "z": cz, "axis": axis, "off": (len(inters) * 7) % 16})
def angdiff(a, b):
    d0 = abs((a - b) % math.pi)
    return min(d0, math.pi - d0)
for c in crossings:
    if c["signal"] >= 0:
        gi = sig_group[c["signal"]]
        it = inters[gi]
        walk = math.atan2(c["b"][1] - c["a"][1], c["b"][0] - c["a"][0])
        c["inter"] = gi
        c["phase"] = 0 if angdiff(walk, it["axis"]) < math.pi / 4 else 1
    else:
        c["inter"] = -1; c["phase"] = -1

def rle_rows(G):
    rows = []
    for r in range(G.shape[0]):
        row = G[r]; out = []; i = 0; n = len(row)
        while i < n:
            v = row[i]; j = i
            while j < n and row[j] == v: j += 1
            out.append("%d%s" % (v, np.base_repr(j - i, 36).lower()))
            i = j
        rows.append(".".join(out))
    return rows
walk_rows = rle_rows(G)
print(f"walk grid {GW}x{GH}, {sum(len(r) for r in walk_rows) // 1024} kB")

# ---------------------------------------------------------------- car network
# graph from TTD street lines inside the map; points rounded to merge ends
def clip_line(pts):
    out, cur = [], []
    for p in pts:
        if X0 + 2 < p[0] < X1 - 2 and Z0 + 2 < p[1] < Z1 - 2: cur.append(p)
        else:
            if len(cur) >= 2: out.append(cur)
            cur = []
    if len(cur) >= 2: out.append(cur)
    return out
nodes, node_idx = [], {}
def nid(p):
    k = key(p)
    if k not in node_idx: node_idx[k] = len(nodes); nodes.append(k)
    return node_idx[k]
edges = []
for s in streets:
    for part in clip_line(s["p"]):
        a, b = nid(part[0]), nid(part[-1])
        if a == b: continue
        L = sum(seg_len(p, q) for p, q in zip(part, part[1:]))
        if L < 1: continue
        lane = 0 if s["oneway"] else (2.2 if s["cls"] <= 2 else 1.8)
        e = {"a": a, "b": b, "p": part, "cls": s["cls"], "one": s["oneway"], "lane": lane, "len": L, "name": s["name"]}
        edges.append(e)
# directed edges: forward, and backward for two-way streets
dedges = []
for i, e in enumerate(edges):
    dedges.append({"from": e["a"], "to": e["b"], "p": e["p"], "lane": e["lane"], "cls": e["cls"], "name": e["name"]})
    if not e["one"]:
        dedges.append({"from": e["b"], "to": e["a"], "p": e["p"][::-1], "lane": e["lane"], "cls": e["cls"], "name": e["name"]})
out_of = defaultdict(list)
for i, de in enumerate(dedges): out_of[de["from"]].append(i)

def seg_inter(p1, p2, p3, p4):
    d1x, d1z = p2[0] - p1[0], p2[1] - p1[1]; d2x, d2z = p4[0] - p3[0], p4[1] - p3[1]
    den = d1x * d2z - d1z * d2x
    if abs(den) < 1e-9: return None
    t = ((p3[0] - p1[0]) * d2z - (p3[1] - p1[1]) * d2x) / den
    u = ((p3[0] - p1[0]) * d1z - (p3[1] - p1[1]) * d1x) / den
    if 0 <= t <= 1 and 0 <= u <= 1: return t
    return None

def lane_offset(p, off):
    """the polyline moved off metres to the right of travel (z is south, so right = (-dz, dx))"""
    if off == 0: return p
    out = []
    for i, q in enumerate(p):
        a = p[max(0, i - 1)]; b = p[min(len(p) - 1, i + 1)]
        L = seg_len(a, b) or 1
        ux, uz = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        out.append((q[0] - uz * off, q[1] + ux * off))
    return out

for de in dedges:
    de["lp"] = lane_offset(de["p"], de["lane"])
    stops = []
    acc = 0.0
    lp = de["lp"]
    for a, b in zip(lp, lp[1:]):
        L = seg_len(a, b)
        for ci, c in enumerate(crossings):
            # extended crossing line so a lane off the drawn line still meets it
            ca, cb = c["a"], c["b"]
            cl = seg_len(ca, cb); ux, uz = (cb[0] - ca[0]) / cl, (cb[1] - ca[1]) / cl
            t = seg_inter(a, b, (ca[0] - ux * 3, ca[1] - uz * 3), (cb[0] + ux * 3, cb[1] + uz * 3))
            if t is not None:
                ph = -1
                if c["inter"] >= 0:
                    it = inters[c["inter"]]
                    mv = math.atan2(b[1] - a[1], b[0] - a[0])
                    ph = 0 if angdiff(mv, it["axis"]) < math.pi / 4 else 1
                stops.append([round(acc + t * L, 1), ci, c["inter"], ph])
        acc += L
    stops.sort()
    de["stops"] = stops
    de["len"] = acc

# ---------------------------------------------------------------- bike paths
bikes = []
for kind, p in foots:
    if kind != 2: continue
    for part in clip_line(p):
        L = sum(seg_len(a, b) for a, b in zip(part, part[1:]))
        if L > 30: bikes.append(part)
print(f"car edges {len(dedges)}, bike paths {len(bikes)}")

# ---------------------------------------------------------------- tram lines and stops
stops = {}
for name, plist in platforms.items():
    xs = [q[0] for pts in plist for q in pts]; zs = [q[1] for pts in plist for q in pts]
    stops[name] = (sum(xs) / len(xs), sum(zs) / len(zs))
def project(p, line):
    best = (1e9, 0); acc = 0
    for a, b in zip(line, line[1:]):
        L = seg_len(a, b)
        if L == 0: continue
        t = max(0, min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L)))
        q = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        dd = seg_len(p, q)
        if dd < best[0]: best = (dd, acc + t * L)
        acc += L
    return best
tram_lines = []
GTFS = os.environ.get("GTFS")   # unzipped Nysse tram GTFS (tram.zip): real lines, stops, timetables
def tram_cross(part):
    tstops = []
    acc = 0.0
    for a, b in zip(part, part[1:]):
        L2 = seg_len(a, b)
        for ci, c in enumerate(crossings):
            t = seg_inter(a, b, c["a"], c["b"])
            if t is not None: tstops.append([round(acc + t * L2, 1), ci])
        acc += L2
    return sorted(tstops)
if GTFS:
    import csv
    rd = lambda f: list(csv.DictReader(open(os.path.join(GTFS, f), encoding="utf-8-sig")))
    gstops = {r["stop_id"]: (r["stop_name"], proj(float(r["stop_lon"]), float(r["stop_lat"]))) for r in rd("stops.txt")}
    # a stop is its A and B platforms together
    byname = defaultdict(list)
    for sid, (nm, q) in gstops.items(): byname[nm.rsplit(" ", 1)[0]].append(q)
    stops = {nm: (sum(q[0] for q in qs) / len(qs), sum(q[1] for q in qs) / len(qs)) for nm, qs in byname.items()}
    trips = {r["trip_id"]: r for r in rd("trips.txt")}
    # day types: the regular weekly services (the longest-running one for each weekday group)
    DAYS = [("monday", "Ma–To"), ("friday", "Pe"), ("saturday", "La"), ("sunday", "Su")]
    cal = rd("calendar.txt")
    svc_day = {}
    for di, (dname, _) in enumerate(DAYS):
        cs = [c for c in cal if c[dname] == "1"]
        best = max(cs, key=lambda c: int(c["end_date"]) - int(c["start_date"]))
        svc_day[best["service_id"]] = di
    shapes = defaultdict(list)
    for r in rd("shapes.txt"): shapes[r["shape_id"]].append((int(r["shape_pt_sequence"]), proj(float(r["shape_pt_lon"]), float(r["shape_pt_lat"]))))
    st_by_trip = defaultdict(list)
    for r in rd("stop_times.txt"):
        if r["trip_id"] in trips and trips[r["trip_id"]]["service_id"] in svc_day:
            h, m, sec = map(int, r["departure_time"].split(":"))
            st_by_trip[r["trip_id"]].append((int(r["stop_sequence"]), gstops[r["stop_id"]][0].rsplit(" ", 1)[0], h * 3600 + m * 60 + sec))
    inmap = lambda q: X0 < q[0] < X1 and Z0 < q[1] < Z1
    # patterns: route + the stops it serves inside the map, in direction 1 order
    pats = defaultdict(list)
    for tid, sl in st_by_trip.items():
        t = trips[tid]; sl.sort()
        names = tuple(nm for _, nm, _ in sl if inmap(stops[nm]))
        if len(names) < 2: continue
        key = names if t["direction_id"] == "1" else names[::-1]
        pats[(t["route_id"], key)].append((tid, t["direction_id"], sl))
    for (route, key), lst in sorted(pats.items(), key=lambda kv: -len(kv[1])):
        if len(lst) < 100: continue          # odd trips (depot runs and such)
        if any(tl["line"] == route for tl in tram_lines): continue
        # geometry: the most used direction 1 shape, the part inside the map
        sh = defaultdict(int)
        for tid, d, _ in lst:
            if d == "1": sh[trips[tid]["shape_id"]] += 1
        pts = [q for _, q in sorted(shapes[max(sh, key=sh.get)])]
        parts = clip_line(pts)
        part = max(parts, key=lambda q: sum(seg_len(a, b) for a, b in zip(q, q[1:])))
        part = [part[0]] + [q for a, q in zip(part, part[1:]) if seg_len(a, q) > 0.3]
        L = sum(seg_len(a, b) for a, b in zip(part, part[1:]))
        sl = sorted([round(project(stops[nm], part)[1], 1), nm] for nm in key)
        # timetable: for each day type and direction, the time the tram is at its
        # first stop (minutes), and each stop's time after that (seconds, median)
        tt = []
        for di in range(len(DAYS)):
            dirs = []
            for d in ("1", "0"):
                order = [nm for _, nm in sl] if d == "1" else [nm for _, nm in sl][::-1]
                deps, offs = [], defaultdict(list)
                for tid, dd, stl in lst:
                    if dd != d or svc_day[trips[tid]["service_id"]] != di: continue
                    tm = {nm: tt_ for _, nm, tt_ in stl}
                    if order[0] not in tm: continue
                    t0 = tm[order[0]]
                    deps.append(t0 // 60)
                    for nm in order: offs[nm].append(tm.get(nm, t0) - t0)
                med = [sorted(offs[nm])[len(offs[nm]) // 2] if offs[nm] else 0 for nm in order]
                dirs.append({"dep": sorted(deps), "off": med})
            tt.append(dirs)
        tram_lines.append({"line": route, "p": part, "len": L, "stops": sl, "tt": tt,
                           "head": [trips[lst[0][0]]["trip_headsign"] if lst[0][1] == "1" else "", ""]})
        for tid, d, _ in lst:
            tram_lines[-1]["head"][0 if d == "1" else 1] = tram_lines[-1]["head"][0 if d == "1" else 1] or trips[tid]["trip_headsign"]
        print(f"tram {route}: {round(L)} m, stops {[s_[1] for s_ in sl]}, heads {tram_lines[-1]['head']}, "
              f"departures {[len(tt[di][0]['dep']) for di in range(len(DAYS))]}")
        tram_lines[-1]["cross"] = tram_cross(part)
    TT_DAYS = [d[1] for d in DAYS]
else:
  TT_DAYS = []
  cands = defaultdict(list)
  for ln, pts in routes:
    parts = clip_line(pts)
    if not parts: continue
    part = max(parts, key=lambda q: sum(seg_len(a, b) for a, b in zip(q, q[1:])))
    part = [part[0]] + [q for a, q in zip(part, part[1:]) if seg_len(a, q) > 0.3]
    L = sum(seg_len(a, b) for a, b in zip(part, part[1:]))
    sl = []
    for name, p in stops.items():
        dd, s = project(p, part)
        if dd < 20: sl.append([round(s, 1), name])
    sl.sort()
    cands[ln].append((len(sl), L, part, sl))
  for ln in sorted(cands):
    n, L, part, sl = max(cands[ln], key=lambda c: (c[0], c[1]))
    if n < 2: continue
    same = [t for t in tram_lines if [q[1] for q in t["stops"]] == [q[1] for q in sl]]
    if same:
        same[0]["line"] += " ja " + ln
        continue
    tram_lines.append({"line": ln, "p": part, "len": L, "stops": sl})
    print(f"tram {ln}: {round(L)} m, stops {[s[1] for s in sl]}")
    tram_lines[-1]["cross"] = tram_cross(part)

# ---------------------------------------------------------------- places
PLACES = [
    # id, name, kind, x, z, icon   (approximate where noted)
    # Homes, school and day care are only rough (100-200 m off) and generically
    # named here: the real places and names come from the git-ignored
    # games/tampere/places.local.js on the phone build machine.
    ("koti", "Äidin koti", "home", 2, -598, "🏠"),
    ("koulu", "Koulu", "school", 290, -235, "🏫"),
    ("paivakoti", "Päiväkoti", "daycare", 215, -290, "🎈"),
    ("isa", "Isän koti", "home", 900, 60, "🏡"),
    ("pikkukakkonen", "Pikku Kakkosen puisto", "park", 99, -37, "🌳"),
    ("koskipuisto", "Koskipuisto", "park", 50, 30, "🌳"),
    ("nasinpuisto", "Näsinpuisto", "park", -640, -500, "🌳"),
    ("hameenpuisto", "Hämeenpuisto", "park", -640, 120, "🌳"),
    ("kirkkopuisto", "Pyynikin kirkkopuisto", "park", -800, 320, "🌳"),
    ("siltasen", "Aleksandra Siltasen puisto", "park", -235, -470, "🌳"),
    ("sorinaukio", "Sorin aukion leikkikenttä", "park", 312, 446, "🌳"),
    ("tuomiokirkonpuisto", "Tuomiokirkonpuisto", "park", 300, -322, "🌳"),
    ("keskustori", "Keskustori", "sight", -190, 150, "⛲"),
    ("tuomiokirkko", "Tuomiokirkko", "sight", 316, -350, "⛪"),
    ("asema", "Rautatieasema", "sight", 470, 95, "🚉"),
    ("kauppahalli", "Kauppahalli", "sight", -280, 280, "🧺"),
    ("koskikeskus", "Koskikeskus", "sight", 170, 390, "🛍"),
    ("nasinneula", "Särkänniemi ja Näsinneula", "sight", -1100, -660, "🎡"),
    ("finlayson", "Finlayson", "sight", -440, -280, "🏭"),
    ("metso", "Metso-kirjasto", "sight", -731, 200, "📚"),
    ("tampella", "Tampella", "sight", -77, -560, "🏭"),
]
lab, sizes = components(G)
MAIN = max(range(len(sizes)), key=lambda k: sizes[k])
def snap(x, z):
    cx, cz = int((x - X0) / CELL), int((z - Z0) / CELL)
    best = None
    for r in range(0, 60):
        for dz in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dx), abs(dz)) != r: continue
                gx, gz = cx + dx, cz + dz
                if 0 <= gx < GW and 0 <= gz < GH and G[gz, gx] in (1, 4) and lab[gz, gx] == MAIN:
                    dd = dx * dx + dz * dz
                    if best is None or dd < best[0]: best = (dd, gx, gz)
        if best: break
    return (X0 + (best[1] + 0.5) * CELL, Z0 + (best[2] + 0.5) * CELL) if best else (x, z)
places = []
EXACT = json.loads(os.environ.get("EXACT", "{}"))   # {"id": [x, z]}: print snapped points, never written
for pid, (x, z) in EXACT.items():
    print("exact", pid, snap(x, z))
for pid, name, kind, x, z, icon in PLACES:
    sx, sz = snap(x, z)
    places.append({"id": pid, "name": name, "kind": kind, "x": round(sx, 1), "z": round(sz, 1), "icon": icon})
for name, (x, z) in stops.items():
    if X0 < x < X1 and Z0 < z < Z1:
        sx, sz = snap(x, z)
        places.append({"id": "stop:" + name, "name": name, "kind": "stop", "x": round(sx, 1), "z": round(sz, 1), "icon": "🚋",
                       "px": round(x, 1), "pz": round(z, 1)})

# ---------------------------------------------------------------- draw tiles
print("tiles ...")
COL = {
    "ground": (212, 210, 188), "grass": (151, 209, 104), "park": (128, 198, 92), "wood": (92, 165, 80),
    "scrub": (140, 190, 100), "pitch": (110, 190, 110), "parking": (196, 196, 196), "plaza": (232, 222, 196),
    "water": (90, 180, 232), "water2": (70, 160, 220), "road": (104, 108, 118), "walk": (226, 223, 214),
    "bike": (214, 150, 128), "bike2": (226, 186, 166), "steps": (200, 196, 186), "tram": (150, 146, 140), "curb": (250, 250, 250),
    "lane": (245, 245, 245), "zebra": (255, 255, 255), "rail": (70, 64, 60),
}
GREEN_K = {1: "grass", 2: "park", 3: "wood", 4: "scrub", 5: "pitch", 6: "parking", 7: "plaza"}
ROOF = {1: (214, 112, 78), 2: (138, 160, 176), 3: (190, 182, 168), 4: (246, 240, 228), 5: (111, 179, 154), 6: (181, 101, 63)}
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 10 * SS)

def feats_index(items, getpts):
    out = []
    for it in items:
        pts = getpts(it)
        if len(pts) >= 1: out.append((bbox(pts), it))
    return out
IDX = {
    "greens": feats_index(greens, lambda g: g[1]),
    "waters": feats_index(waters, lambda w: w),
    "areas": feats_index(areas, lambda a: a[1][0]),
    "streets": feats_index(streets, lambda s: s["p"]),
    "buildings": feats_index(buildings, lambda b: b[2]),
    "trams": feats_index(trams_m, lambda p: p),
    "rails": feats_index(rails, lambda p: p),
    "cross": feats_index(crossings, lambda c: [c["a"], c["b"]]),
    "foots": feats_index(foots, lambda f: f[1]),
}
def near(name, bx0, bz0, bx1, bz1, m=20):
    return [it for (b, it) in IDX[name] if b[2] > bx0 - m and b[0] < bx1 + m and b[3] > bz0 - m and b[1] < bz1 + m]

# street name labels: along the longest stretch of each name, every ~220 m
labels = []
by_name = defaultdict(list)
for s in streets:
    if s["cls"] <= 4 and not s["name"].islower(): by_name[s["name"]].append(s["p"])
for name, plist in by_name.items():
    segs = []
    for p in plist:
        for a, b in zip(p, p[1:]):
            L = seg_len(a, b)
            if L > 45: segs.append((L, a, b))
    segs.sort(key=lambda t: -t[0])
    placed = []
    for L, a, b in segs:
        mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        if not (X0 + 20 < mx < X1 - 20 and Z0 + 20 < mz < Z1 - 20): continue
        if any(math.hypot(mx - q[0], mz - q[1]) < 220 for q in placed): continue
        if any(math.hypot(mx - l["x"], mz - l["z"]) < 40 for l in labels): continue
        ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
        if ang > 90: ang -= 180
        if ang < -90: ang += 180
        labels.append({"x": mx, "z": mz, "ang": ang, "text": name})
        placed.append((mx, mz))
label_imgs = {}
def label_img(l):
    k = (l["text"], round(l["ang"]))
    if k in label_imgs: return label_imgs[k]
    tw = int(FONT.getlength(l["text"])) + 8 * SS; th = 16 * SS
    im = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    dd = ImageDraw.Draw(im)
    dd.text((4 * SS, 2 * SS), l["text"], font=FONT, fill=(60, 60, 70, 255), stroke_width=2 * SS, stroke_fill=(255, 255, 255, 230))
    im = im.rotate(-l["ang"], expand=True, resample=Image.BICUBIC)
    label_imgs[k] = im
    return im

os.makedirs(os.path.join(OUT, "tiles"), exist_ok=True)
NCOL, NROW = W // TILE, H // TILE
S = PPM * SS
road_bits = []
def draw_tile(col, row):
    ox, oz = X0 + col * TILE, Z0 + row * TILE
    bx1, bz1 = ox + TILE, oz + TILE
    sz = TILE * S
    im = Image.new("RGB", (sz, sz), COL["ground"])
    dr = ImageDraw.Draw(im, "RGBA")
    P = lambda pts: [((x - ox) * S, (z - oz) * S) for x, z in pts]
    def poly(pts, fill, outline=None, width=1):
        if len(pts) > 2: dr.polygon(P(pts), fill=fill, outline=outline, width=width)
    for k, pts in near("greens", ox, oz, bx1, bz1):
        poly(pts, COL[GREEN_K.get(k, "grass")])
    for pts in near("waters", ox, oz, bx1, bz1):
        poly(pts, COL["water"])
    # footpaths in parks (light gravel lines)
    for k, pts in near("foots", ox, oz, bx1, bz1):
        if k in (1, 3): dr.line(P(pts), fill=(236, 226, 200), width=int(2.2 * S), joint="curve")
        elif k == 2: dr.line(P(pts), fill=COL["bike"], width=int(2.6 * S), joint="curve")
    order = {"parking": 0, "plaza": 1, "walk": 2, "steps": 2, "bike": 3, "bike2": 3, "tram": 4, "road": 5}
    ar = sorted(near("areas", ox, oz, bx1, bz1), key=lambda a: order[a[0]])
    road_mask = Image.new("L", (sz, sz), 0)
    rm = ImageDraw.Draw(road_mask)
    for kind, rings in ar:
        if kind in ("road", "tram"):
            rm.polygon(P(rings[0]), fill=255)
    # curbs: road polygons drawn slightly larger in white under the asphalt
    for kind, rings in ar:
        if kind == "road" and len(rings[0]) > 2:
            dr.polygon(P(rings[0]), fill=COL["curb"], outline=COL["curb"], width=int(0.8 * S))
    for kind, rings in ar:
        if len(rings[0]) > 2:
            poly(rings[0], COL[kind])
            for hole in rings[1:]:
                if len(hole) > 2:
                    # a hole (a traffic island): grass
                    poly(hole, COL["grass"])
    # east edge without city polygons
    for s in near("streets", ox, oz, bx1, bz1):
        if s["p"][len(s["p"]) // 2][0] > 1000:
            dr.line(P(s["p"]), fill=COL["road"], width=int(ROAD_W[s["cls"]] * S))
    # lane markings on bigger two-way streets: dashed centre line
    for s in near("streets", ox, oz, bx1, bz1):
        if s["oneway"] or s["cls"] > 3: continue
        p = s["p"]
        for a, b in zip(p, p[1:]):
            L = seg_len(a, b)
            n = int(L / 6)
            for i in range(n):
                t0, t1 = (i * 6 + 1) / L, (i * 6 + 4) / L
                qa = (a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0)
                qb = (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)
                qm = ((qa[0] + qb[0]) / 2, (qa[1] + qb[1]) / 2)
                px_, pz_ = int((qm[0] - ox) * S), int((qm[1] - oz) * S)
                if 0 <= px_ < sz and 0 <= pz_ < sz and road_mask.getpixel((px_, pz_)) == 0: continue
                dr.line(P([qa, qb]), fill=COL["lane"], width=int(0.35 * S))
    # tram rails
    for pts in near("trams", ox, oz, bx1, bz1):
        for off in (-0.75, 0.75):
            dr.line(P(lane_offset(pts, off)), fill=COL["rail"], width=max(2, int(0.22 * S)), joint="curve")
    for pts in near("rails", ox, oz, bx1, bz1):
        dr.line(P(pts), fill=(150, 140, 125), width=int(3 * S))
        for off in (-0.72, 0.72):
            dr.line(P(lane_offset(pts, off)), fill=COL["rail"], width=max(2, int(0.2 * S)))
    # zebra crossings: stripes across the walk direction, only on road
    zebra = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    zd = ImageDraw.Draw(zebra)
    for c in near("cross", ox, oz, bx1, bz1):
        a, b = c["a"], c["b"]
        L = seg_len(a, b); ux, uz = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        nx, nz = -uz * CW / 2, ux * CW / 2
        t = -1.0
        while t < L + 1:
            p0 = (a[0] + ux * t, a[1] + uz * t); p1 = (a[0] + ux * (t + 0.5), a[1] + uz * (t + 0.5))
            zd.polygon(P([(p0[0] + nx, p0[1] + nz), (p1[0] + nx, p1[1] + nz), (p1[0] - nx, p1[1] - nz), (p0[0] - nx, p0[1] - nz)]), fill=(255, 255, 255, 255))
            t += 1.0
    im.paste(zebra, (0, 0), Image.composite(zebra.getchannel("A"), Image.new("L", (sz, sz), 0), road_mask))
    # trees with shadows
    for (x, z) in trees:
        if ox - 5 < x < bx1 + 5 and oz - 5 < z < bz1 + 5:
            px_, pz_ = (x - ox) * S, (z - oz) * S
            r = 2.8 * S
            dr.ellipse([px_ - r + 1.2 * S, pz_ - r + 1.2 * S, px_ + r + 1.2 * S, pz_ + r + 1.2 * S], fill=(0, 0, 0, 50))
            dr.ellipse([px_ - r, pz_ - r, px_ + r, pz_ + r], fill=(74, 150, 66))
            dr.ellipse([px_ - r * 0.6, pz_ - r * 0.7, px_ + r * 0.25, pz_ + r * 0.1], fill=(110, 186, 90))
    # buildings: shadow, wall, roof
    bl = near("buildings", ox, oz, bx1, bz1, 40)
    for h, roof, pts in bl:
        sh = min(8, h * 0.18)
        poly([(x + sh, z + sh * 0.8) for x, z in pts], (0, 0, 0, 60))
    for h, roof, pts in bl:
        c = ROOF.get(roof, ROOF[3])
        poly(pts, c, outline=tuple(int(v * 0.7) for v in c), width=max(1, int(0.4 * S)))
    for l in labels:
        if ox - 120 < l["x"] < bx1 + 120 and oz - 60 < l["z"] < bz1 + 60:
            li = label_img(l)
            px_, pz_ = int((l["x"] - ox) * S - li.width / 2), int((l["z"] - oz) * S - li.height / 2)
            im.paste(li, (px_, pz_), li)
    im = im.resize((TILE * PPM, TILE * PPM), Image.LANCZOS)
    im = im.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    im.save(os.path.join(OUT, "tiles", f"{col}_{row}.png"), optimize=True)
    return im

only = os.environ.get("ONLY")
DRAW_ROWS = 0 if os.environ.get("NOTILES") else NROW
OV = 60
overview = Image.new("RGB", (NCOL * OV, max(1, NROW) * OV))
for row in range(DRAW_ROWS):
    for col in range(NCOL):
        if only and f"{col}_{row}" not in only.split(","): continue
        t = draw_tile(col, row)
        overview.paste(t.convert("RGB").resize((OV, OV), Image.LANCZOS), (col * OV, row * OV))
    print(f"  row {row + 1}/{NROW}")
if not only and DRAW_ROWS:
    overview.quantize(colors=128, dither=Image.Dither.NONE).save(os.path.join(OUT, "overview.png"), optimize=True)

# ---------------------------------------------------------------- data module
def r1(v): return round(v, 1)
def flat(pts): return [r1(c) for p in pts for c in p]
data = {
    "X0": X0, "Z0": Z0, "W": W, "H": H, "PPM": PPM, "TILE": TILE, "CELL": CELL, "GW": GW, "GH": GH,
    "NCOL": NCOL, "NROW": NROW,
    "crossings": [[r1(c["a"][0]), r1(c["a"][1]), r1(c["b"][0]), r1(c["b"][1]), c["inter"], c["phase"]] for c in crossings],
    "inters": [[r1(i["x"]), r1(i["z"]), round(i["axis"], 3), i["off"]] for i in inters],
    "nodes": [list(n) for n in nodes],
    "roads": [{"f": de["from"], "t": de["to"], "p": flat(de["lp"]), "c": de["cls"], "s": de["stops"], "l": r1(de["len"])} for de in dedges],
    "bikes": [flat(p) for p in bikes],
    "trams": [{"line": t["line"], "p": flat(t["p"]), "len": r1(t["len"]), "stops": t["stops"], "x": t["cross"],
               "tt": t.get("tt"), "head": t.get("head")} for t in tram_lines],
    "ttDays": TT_DAYS,
    "places": places,
}
os.makedirs(os.path.join(OUT, "lib"), exist_ok=True)
with open(os.path.join(OUT, "lib", "mapdata.ts"), "w") as f:
    f.write("// GENERATED by tools/tampere/build_map.py from Tampere Taxi Driver's map data.\n")
    f.write("// Map data (c) OpenStreetMap contributors (ODbL); Tampereen kaupunki / Maanmittauslaitos (CC BY 4.0).\n")
    f.write("export const MAP: any = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    f.write("export const WALK: string[] = " + json.dumps(walk_rows, separators=(",", ":")) + ";\n")
print("data", os.path.getsize(os.path.join(OUT, "lib", "mapdata.ts")) // 1024, "kB")
