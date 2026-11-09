#!/usr/bin/env python3
"""Board and pictures of the board game "Kanada-malja" (games/kanadamalja).

  python3 tools/kanadamalja/build.py

writes
  games/kanadamalja/lib/board.ts   the board as data: places, the dots of the
                                   walking paths, who is next to whom, the
                                   tram lines and the boats
  games/kanadamalja/img/board.png  the board drawn (lakes, parks, paths, tram
                                   lines, landmarks, the places' names)
  games/kanadamalja/img/*.png      pawns, tokens and finds

Everything is drawn here as SVG and rasterised with cairosvg
(pip install cairosvg). The map is a hand-made picture of Tampere: the two
lakes, Tammerkoski and public places only, not a real map.
"""
import json, math, os
import cairosvg

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
GAME = os.path.join(ROOT, "games", "kanadamalja")
W, H = 360, 540          # board units (the game scales them to the screen)
SCALE = 3                # board.png pixels per unit (the game zooms in)
STEP = 17                # the distance of two dots on a path

# id, name, x, y, kind, label side (b below, t above, l left, r right)
PLACES = [
    ("arena", "Nokia Areena", 236, 258, "start", "r"),
    ("lentava", "Lentävänniemi", 28, 174, "", "b"),
    ("hiedanranta", "Hiedanranta", 70, 144, "", "t"),
    ("santalahti", "Santalahti", 104, 182, "", "b"),
    ("sarkanniemi", "Särkänniemi", 140, 118, "double", "l"),
    ("pispala", "Pispala", 52, 238, "", "b"),
    ("pyynikintori", "Pyynikintori", 128, 234, "", "t"),
    ("pyynikki", "Pyynikki", 92, 302, "", "b"),
    ("finlayson", "Finlayson", 168, 172, "", "t"),
    ("keskustori", "Keskustori", 176, 246, "start2", "b"),
    ("laukontori", "Laukontori", 182, 318, "", "l"),
    ("viikinsaari", "Viikinsaari", 74, 428, "", "b"),
    ("tuomiokirkko", "Tuomiokirkko", 232, 182, "", "t"),
    ("ratina", "Ratina", 226, 344, "", "l"),
    ("hatanpaa", "Hatanpää", 190, 420, "", "r"),
    ("harmala", "Härmälä", 152, 494, "", "l"),
    ("tammela", "Tammela", 298, 198, "", "t"),
    ("asema", "Rautatieasema", 270, 238, "start2", "t"),
    ("sori", "Sori", 288, 288, "jail", "t"),
    ("rauhaniemi", "Rauhaniemi", 262, 128, "", "b"),
    ("kauppi", "Kauppi", 330, 150, "", "t"),
    ("kaleva", "Kaleva", 328, 220, "", "b"),
    ("tays", "TAYS", 334, 288, "", "b"),
    ("viinikka", "Viinikka", 258, 396, "", "l"),
    ("hakametsa", "Hakametsä", 306, 346, "", "r"),
    ("kaukajarvi", "Kaukajärvi", 314, 446, "", "l"),
    ("hervanta", "Hervanta", 280, 508, "", "r"),
]
P = {p[0]: i for i, p in enumerate(PLACES)}

# walking paths: a, b, bend (the curve's sideways offset in units)
PATHS = [
    ("lentava", "hiedanranta", 0), ("lentava", "pispala", -6), ("hiedanranta", "santalahti", 0),
    ("santalahti", "sarkanniemi", 4), ("santalahti", "pispala", 0), ("santalahti", "pyynikintori", 0),
    ("pispala", "pyynikki", 0), ("pispala", "pyynikintori", 4), ("pyynikintori", "sarkanniemi", -6),
    ("pyynikintori", "finlayson", 0), ("pyynikintori", "pyynikki", 0), ("pyynikintori", "keskustori", 0),
    ("sarkanniemi", "finlayson", 0), ("finlayson", "keskustori", 0), ("finlayson", "tuomiokirkko", 0),
    ("keskustori", "laukontori", 0), ("keskustori", "arena", 0), ("tuomiokirkko", "arena", 0),
    ("tuomiokirkko", "tammela", 0), ("tuomiokirkko", "rauhaniemi", 0), ("laukontori", "ratina", 0),
    ("laukontori", "pyynikki", 6), ("ratina", "arena", 0), ("ratina", "hatanpaa", 0),
    ("ratina", "viinikka", 0), ("arena", "sori", 0), ("arena", "asema", 0), ("asema", "tammela", 0), ("asema", "tuomiokirkko", 0), ("tammela", "kaleva", 0),
    ("tammela", "rauhaniemi", 0), ("rauhaniemi", "kauppi", 6), ("kauppi", "kaleva", 0),
    ("kaleva", "tays", 0), ("sori", "tays", 0), ("sori", "hakametsa", 0), ("sori", "viinikka", 0),
    ("tays", "hakametsa", 0), ("hakametsa", "kaukajarvi", 0), ("viinikka", "hervanta", -8),
    ("hatanpaa", "harmala", 0), ("harmala", "hervanta", 10), ("kaukajarvi", "hervanta", 0),
    ("viinikka", "hatanpaa", 0), ("viinikka", "kaukajarvi", 0),
    ("viikinsaari", "harmala", 14),   # the ice road over Pyhäjärvi
]
ICE = {("viikinsaari", "harmala")}

TRAMS = [
    {"id": "1", "color": "#e63946", "stops": ["santalahti", "pyynikintori", "keskustori", "arena", "kaleva", "tays", "hervanta"]},
    {"id": "3", "color": "#3a86ff", "stops": ["lentava", "pispala", "pyynikintori", "keskustori", "arena", "sori", "hakametsa", "hervanta"]},
]
# fare by the number of stops ridden
FARES = [(2, 50), (4, 100), (99, 150)]
BOATS = [
    {"a": "laukontori", "b": "viikinsaari", "price": 100, "via": (118, 382)},
    {"a": "sarkanniemi", "b": "rauhaniemi", "price": 100, "via": (200, 70)},
]

NASI = [(0, 150), (18, 148), (38, 134), (56, 118), (78, 114), (96, 128), (110, 150), (122, 146), (124, 122),
        (130, 102), (146, 94), (160, 102), (164, 126), (178, 144), (200, 148), (222, 152), (240, 142),
        (252, 116), (274, 106), (298, 118), (322, 126), (346, 120), (360, 116)]
PYHA = [(0, 262), (22, 270), (44, 266), (62, 282), (78, 320), (104, 332), (132, 338), (158, 344), (180, 344),
        (198, 340), (208, 356), (206, 376), (190, 392), (172, 402), (166, 420), (176, 436), (160, 452),
        (140, 468), (128, 490), (130, 516), (118, 540)]
RIVER = [(197, 148), (199, 190), (205, 232), (201, 272), (204, 310), (203, 342)]
KAUKA = (346, 398, 18, 34)
IIDES = (284, 400, 9, 15)


def smooth(pts, closed=False):
    """A Catmull-Rom curve through the points as an SVG path."""
    if closed:
        pts = pts + pts[:2]
    d = "M %.1f %.1f" % pts[0]
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i > 0 else pts[0]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += " C %.1f %.1f %.1f %.1f %.1f %.1f" % (c1 + c2 + p2)
    return d


def bez(a, b, bend, t):
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dy) or 1
    cx, cy = mx - dy / n * bend * 2, my + dx / n * bend * 2
    u = 1 - t
    return (u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1])


def path_points(a, b, bend):
    """Places a and b and the dots between them, evenly along the curve."""
    samples = [bez(a, b, bend, i / 200) for i in range(201)]
    acc = [0.0]
    for i in range(1, len(samples)):
        acc.append(acc[-1] + math.dist(samples[i - 1], samples[i]))
    total = acc[-1]
    steps = max(2, round(total / STEP))
    out = []
    j = 0
    for k in range(steps + 1):
        target = total * k / steps
        while j < len(acc) - 1 and acc[j + 1] < target:
            j += 1
        out.append(samples[j])
    return out, samples


# ---- the graph ---------------------------------------------------------
nodes = [[p[2], p[3], i] for i, p in enumerate(PLACES)]   # x, y, place index (-1 = a dot)
adj = [[] for _ in nodes]
road_curves = []
for a, b, bend in PATHS:
    pa, pb = PLACES[P[a]], PLACES[P[b]]
    pts, samples = path_points((pa[2], pa[3]), (pb[2], pb[3]), bend)
    road_curves.append((samples, (a, b) in ICE))
    prev = P[a]
    for x, y in pts[1:-1]:
        nodes.append([round(x, 1), round(y, 1), -1])
        adj.append([])
        cur = len(nodes) - 1
        adj[prev].append(cur); adj[cur].append(prev)
        prev = cur
    adj[prev].append(P[b]); adj[P[b]].append(prev)

# ---- board.svg ---------------------------------------------------------
svg = []
A = svg.append
A('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (W * SCALE, H * SCALE, W, H))
A('''<defs>
<radialGradient id="land" cx="0.55" cy="0.45" r="0.8"><stop offset="0" stop-color="#cfe9a6"/><stop offset="1" stop-color="#9fcf7c"/></radialGradient>
<linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5cb8ec"/><stop offset="1" stop-color="#2f8fd0"/></linearGradient>
<pattern id="waves" width="28" height="16" patternUnits="userSpaceOnUse">
  <path d="M 2 8 q 3 -3 6 0 t 6 0" fill="none" stroke="#a9dcfa" stroke-width="0.9" stroke-linecap="round" opacity="0.8"/>
  <path d="M 16 15 q 3 -3 6 0" fill="none" stroke="#a9dcfa" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/>
</pattern>
</defs>''')
A('<rect width="%d" height="%d" fill="url(#land)"/>' % (W, H))
# city blocks in the centre and Hervanta
for (x0, y0, x1, y1) in [(150, 160, 300, 300), (240, 470, 330, 540), (120, 200, 160, 250)]:
    for gx in range(x0, x1, 13):
        for gy in range(y0, y1, 11):
            if (gx * 7 + gy * 3) % 5 == 0:
                continue
            A('<rect x="%d" y="%d" width="10" height="8" rx="1.5" fill="#e9dfc4" opacity="0.55"/>' % (gx, gy))
# forests (Pyynikki ridge, Kauppi, Hatanpää, Kaukajärvi, Pispala slope)
import random
rnd = random.Random(7)
for (cx, cy, rx, ry, n) in [(98, 292, 28, 16, 26), (334, 168, 24, 26, 30), (176, 422, 12, 16, 10),
                            (330, 470, 20, 14, 14), (60, 210, 20, 10, 12), (20, 200, 18, 20, 12),
                            (300, 150, 16, 10, 8), (200, 470, 26, 16, 16), (90, 430, 14, 10, 9)]:
    for _ in range(n):
        a = rnd.random() * math.tau; r = math.sqrt(rnd.random())
        x, y = cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r
        s = 3 + rnd.random() * 2.5
        A('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#4f9d4a"/><circle cx="%.1f" cy="%.1f" r="%.1f" fill="#6cbf5c"/>' % (x, y + 0.8, s, x - 0.6, y - 0.4, s * 0.72))
# lakes: a sandy shore line, the water, waves and an outline
nasi = smooth(NASI) + " L 360 0 L 0 0 Z"
pyha = smooth(PYHA) + " L 0 540 Z"
river = smooth(RIVER)
kx, ky, krx, kry = KAUKA
ix, iy, irx, iry = IIDES
for d in (nasi, pyha):
    A('<path d="%s" fill="none" stroke="#efe6b8" stroke-width="7" stroke-linejoin="round"/>' % d)
A('<path d="%s" fill="none" stroke="#efe6b8" stroke-width="10" stroke-linecap="round"/>' % river)
A('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="none" stroke="#efe6b8" stroke-width="6"/>' % (kx, ky, krx, kry))
A('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="none" stroke="#efe6b8" stroke-width="5"/>' % (ix, iy, irx, iry))
for d in (nasi, pyha):
    A('<path d="%s" fill="url(#lake)"/><path d="%s" fill="url(#waves)"/>' % (d, d))
    A('<path d="%s" fill="none" stroke="#2a78b4" stroke-width="1.2"/>' % d)
A('<path d="%s" fill="none" stroke="#2a78b4" stroke-width="7.4" stroke-linecap="round"/>' % river)
A('<path d="%s" fill="none" stroke="#4fb0e8" stroke-width="5" stroke-linecap="round"/>' % river)
# the rapids: white foam
for (x, y) in [(200, 200), (204, 226), (203, 252), (202, 280)]:
    A('<path d="M %d %d q 2 -2 4 0" fill="none" stroke="#ffffff" stroke-width="0.9"/>' % (x - 2, y))
for (cx, cy, rx, ry) in (KAUKA, IIDES):
    A('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="url(#lake)" stroke="#2a78b4" stroke-width="1.2"/>' % (cx, cy, rx, ry))
    A('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="url(#waves)"/>' % (cx, cy, rx, ry))
# Viikinsaari: an island
A('<path d="%s" fill="#a9d683" stroke="#efe6b8" stroke-width="2.5"/>' % smooth([(54, 424), (66, 412), (86, 414), (96, 426), (88, 440), (66, 442), (54, 434)], True))
for (x, y) in [(62, 420), (88, 432), (70, 438)]:
    A('<circle cx="%d" cy="%d" r="3.6" fill="#4f9d4a"/><circle cx="%.1f" cy="%.1f" r="2.6" fill="#6cbf5c"/>' % (x, y, x - 0.6, y - 0.5))

# ---- landmarks --------------------------------------------------------
def tower(x, y):   # Näsinneula
    return ('<path d="M %s %s L %s %s L %s %s Z" fill="#d9dde3" stroke="#6c757d" stroke-width="0.6"/>' % (x - 2.4, y, x + 2.4, y, x, y - 30) +
            '<ellipse cx="%s" cy="%s" rx="6.5" ry="2.6" fill="#f1f3f5" stroke="#6c757d" stroke-width="0.6"/>' % (x, y - 30) +
            '<path d="M %s %s L %s %s" stroke="#6c757d" stroke-width="0.8"/>' % (x, y - 32, x, y - 40))
A(tower(156, 112))
# roller coaster near Särkänniemi
A('<path d="M 118 132 q 6 -18 12 -4 q 5 10 10 -6" fill="none" stroke="#ef476f" stroke-width="1.6"/>')
A('<path d="M 118 132 l 0 4 M 124 122 l 0 14 M 130 128 l 0 8 M 136 130 l 0 6" stroke="#9d4edd" stroke-width="0.7"/>')
# Nokia Areena: the arena's oval roof
A('<ellipse cx="236" cy="258" rx="24" ry="15" fill="#e8ecef" stroke="#495057" stroke-width="1"/>')
A('<ellipse cx="236" cy="258" rx="18" ry="10" fill="#ced4da"/>')
# Tuomiokirkko
A('<path d="M 244 176 l 10 0 l 0 -10 l -5 -6 l -5 6 Z M 252 176 l 0 -18 l 2 -6 l 2 6 l 0 18 Z" fill="#8d99ae" stroke="#4a4e69" stroke-width="0.6"/>')
# Finlayson: brick factory with a chimney
A('<rect x="146" y="176" width="16" height="10" fill="#c1121f" stroke="#7a0b14" stroke-width="0.6"/><rect x="149" y="160" width="3" height="18" fill="#9b2226"/>')
A('<path d="M 150.5 158 q 3 -4 0 -7 q -3 -3 1 -6" fill="none" stroke="#adb5bd" stroke-width="1.2"/>')
# Pyynikki observation tower
A('<rect x="104" y="282" width="5" height="12" fill="#b08968" stroke="#6f4518" stroke-width="0.5"/><path d="M 103 282 l 3.5 -5 l 3.5 5 Z" fill="#9c6644"/>')
# Rautatieasema: the station with its clock tower
A('<rect x="276" y="246" width="20" height="8" fill="#e9c46a" stroke="#6c584c" stroke-width="0.6"/><rect x="283" y="236" width="5" height="12" fill="#e9c46a" stroke="#6c584c" stroke-width="0.6"/><circle cx="285.5" cy="239.5" r="1.6" fill="#ffffff" stroke="#6c584c" stroke-width="0.4"/>')
# Ratina stadium
A('<ellipse cx="240" cy="360" rx="12" ry="7" fill="#57cc99" stroke="#495057" stroke-width="0.8"/><ellipse cx="240" cy="360" rx="7" ry="3.6" fill="none" stroke="#ffffff" stroke-width="0.6"/>')
# Hakametsä: an ice rink
A('<rect x="290" y="360" width="26" height="14" rx="6" fill="#f8f9fa" stroke="#495057" stroke-width="0.8"/>')
A('<path d="M 303 360 l 0 14" stroke="#e63946" stroke-width="0.7"/><path d="M 296 360 l 0 14 M 310 360 l 0 14" stroke="#3a86ff" stroke-width="0.6"/><circle cx="303" cy="367" r="2" fill="none" stroke="#3a86ff" stroke-width="0.5"/>')
# Kaleva church: tall and narrow
A('<path d="M 340 212 l 4 -18 l 4 18 Z" fill="#f8f9fa" stroke="#6c757d" stroke-width="0.6"/>')
# Sori: the police station
A('<rect x="296" y="296" width="18" height="12" fill="#adb5bd" stroke="#343a40" stroke-width="0.6"/>')
for gx in range(299, 313, 4):
    A('<rect x="%d" y="299" width="2" height="6" fill="#343a40"/>' % gx)
A('<circle cx="305" cy="294" r="2" fill="#3a86ff"/>')
# Rauhaniemi: a sauna with steam
A('<rect x="272" y="134" width="10" height="7" fill="#a0522d"/><path d="M 271 134 l 6 -5 l 6 5 Z" fill="#7f3b14"/><path d="M 280 128 q 2 -3 0 -6 q -2 -3 1 -5" fill="none" stroke="#ffffff" stroke-width="0.9"/>')
# Hervanta: tall blocks
for (x, h) in [(296, 14), (304, 20), (312, 12), (262, 16)]:
    A('<rect x="%d" y="%d" width="7" height="%d" fill="#dee2e6" stroke="#868e96" stroke-width="0.5"/>' % (x, 520 - h, h))
# TAYS: a big building
A('<rect x="342" y="296" width="14" height="12" fill="#e9ecef" stroke="#868e96" stroke-width="0.6"/><rect x="347" y="298" width="4" height="4" fill="#3a86ff"/>')
# Pispala: small houses on the slope
for (x, y, c) in [(30, 244, "#e76f51"), (38, 254, "#f4a261"), (66, 252, "#e9c46a"), (74, 226, "#2a9d8f")]:
    A('<rect x="%d" y="%d" width="6" height="5" fill="%s"/><path d="M %d %d l 3.5 -3 l 3.5 3 Z" fill="#6d4c41"/>' % (x, y, c, x - 0.5, y))
# Viikinsaari: the dance pavilion
A('<path d="M 74 414 l 6 -5 l 6 5 Z" fill="#e63946"/><rect x="75" y="414" width="10" height="4" fill="#fff"/>')

# ---- tram lines (two lines next to each other where they share a street) --
seg_count = {}
for line in TRAMS:
    s = line["stops"]
    for i in range(len(s) - 1):
        k = tuple(sorted((s[i], s[i + 1])))
        seg_count[k] = seg_count.get(k, 0) + 1
seg_done = {}
for line in TRAMS:
    s = line["stops"]
    for i in range(len(s) - 1):
        a, b = PLACES[P[s[i]]], PLACES[P[s[i + 1]]]
        k = tuple(sorted((s[i], s[i + 1])))
        n = seg_count[k]
        j = seg_done.get(k, 0); seg_done[k] = j + 1
        off = 0 if n == 1 else (j - 0.5) * 3.4
        dx, dy = b[2] - a[2], b[3] - a[3]
        L = math.hypot(dx, dy)
        ox, oy = -dy / L * off, dx / L * off
        if s[i] > s[i + 1]:
            ox, oy = -ox, -oy
        A('<path d="M %.1f %.1f L %.1f %.1f" stroke="%s" stroke-width="2.6" stroke-linecap="round" opacity="0.8"/>' % (a[2] + ox, a[3] + oy, b[2] + ox, b[3] + oy, line["color"]))

# ---- boats ---------------------------------------------------------------
for bt in BOATS:
    a, b = PLACES[P[bt["a"]]], PLACES[P[bt["b"]]]
    vx, vy = bt["via"]
    A('<path d="M %d %d Q %d %d %d %d" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-dasharray="4 3" opacity="0.9"/>' % (a[2], a[3], vx, vy, b[2], b[3]))
    mx, my = 0.25 * a[2] + 0.5 * vx + 0.25 * b[2], 0.25 * a[3] + 0.5 * vy + 0.25 * b[3]
    A('<path d="M %.1f %.1f l 12 0 l -3 4 l -6 0 Z" fill="#ffffff" stroke="#264653" stroke-width="0.7"/><rect x="%.1f" y="%.1f" width="4" height="3" fill="#e63946"/>' % (mx - 6, my, mx - 2, my - 3))

# ---- walking paths: a sandy road, bridges over the river, the dots --------
for samples, ice in road_curves:
    d = "M " + " L ".join("%.1f %.1f" % p for p in samples[::4] + [samples[-1]])
    A('<path d="%s" fill="none" stroke="%s" stroke-width="5" stroke-linecap="round" opacity="%s"/>' % (d, "#e3f4ff" if ice else "#e9d8a6", "0.85" if ice else "0.7"))
# bridges: where a road crosses the river
riv = [bez(RIVER[0], RIVER[0], 0, 0)]
def seg_cross(p1, p2, p3, p4):
    d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0])
    if abs(d) < 1e-9:
        return None
    t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d
    u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d
    if 0 <= t <= 1 and 0 <= u <= 1:
        return (p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]), math.atan2(p2[1] - p1[1], p2[0] - p1[0]))
    return None
for samples, ice in road_curves:
    for i in range(0, len(samples) - 4, 4):
        for j in range(len(RIVER) - 1):
            c = seg_cross(samples[i], samples[i + 4], RIVER[j], RIVER[j + 1])
            if c:
                x, y, ang = c
                A('<g transform="translate(%.1f %.1f) rotate(%.1f)"><rect x="-8" y="-4" width="16" height="8" rx="1" fill="#d4a373" stroke="#7f5539" stroke-width="0.8"/></g>' % (x, y, math.degrees(ang)))
for x, y, pi in nodes:
    if pi < 0:
        A('<circle cx="%.1f" cy="%.1f" r="3.1" fill="#fffaf0" stroke="#6b4f2a" stroke-width="0.9"/>' % (x, y))

# ---- the places ----------------------------------------------------------
for i, (pid, name, x, y, kind, side) in enumerate(PLACES):
    lines = [t for t in TRAMS if pid in t["stops"]]
    if kind == "start":
        pts = []
        for k in range(10):
            r = 16 if k % 2 == 0 else 8
            a = -math.pi / 2 + k * math.pi / 5
            pts.append("%.1f %.1f" % (x + math.cos(a) * r, y + math.sin(a) * r))
        A('<path d="M %s Z" fill="#ffd166" stroke="#9c6500" stroke-width="1.4"/>' % " L ".join(pts))
        A('<circle cx="%d" cy="%d" r="9.5" fill="#fff3c4" stroke="#9c6500" stroke-width="1"/>' % (x, y))
        continue
    ring = {"jail": "#343a40", "double": "#ef476f", "start2": "#2a9d8f"}.get(kind, "#f4a300")
    A('<circle cx="%d" cy="%d" r="11.5" fill="%s" stroke="#5a3e1b" stroke-width="0.8"/>' % (x, y, ring))
    A('<circle cx="%d" cy="%d" r="8.6" fill="#fff8e1"/>' % (x, y))
    if kind == "start2":   # a start place: a little flag
        A('<path d="M %.1f %.1f l 0 -12 l 8 3 l -8 3" fill="#2a9d8f" stroke="#1b4332" stroke-width="0.8"/>' % (x + 8, y - 6))
    if kind == "jail":
        for gx in (-4, 0, 4):
            A('<rect x="%.1f" y="%d" width="1.6" height="12" fill="#343a40"/>' % (x + gx - 0.8, y - 6))
    if kind == "double":
        A('<circle cx="%d" cy="%d" r="6" fill="#ef476f" stroke="#ffffff" stroke-width="1"/><text x="%d" y="%.1f" font-family="DejaVu Sans" font-weight="bold" font-size="6.4" fill="#ffffff" text-anchor="middle">x2</text>' % (x + 11, y - 10, x + 11, y - 7.8))
    for k, t in enumerate(lines):   # tram stop: the line's colour and number
        bx, by = x - 11 - k * 9, y + 8
        if pid == "hervanta":
            bx = x - 13 - k * 9
        A('<rect x="%.1f" y="%.1f" width="8" height="7.5" rx="2" fill="%s" stroke="#ffffff" stroke-width="0.8"/><text x="%.1f" y="%.1f" font-family="DejaVu Sans" font-weight="bold" font-size="6" fill="#ffffff" text-anchor="middle">%s</text>' % (bx - 4, by - 3.8, t["color"], bx, by + 2.2, t["id"]))
    if any(pid in (b["a"], b["b"]) for b in BOATS):
        A('<circle cx="%d" cy="%d" r="4.4" fill="#ffffff" stroke="#264653" stroke-width="0.7"/><path d="M %.1f %.1f l 5 0 l -1.2 1.8 l -2.6 0 Z" fill="#264653"/>' % (x + 10, y + 9, x + 7.5, y + 9))

# labels last, on top of everything
def label(x, y, text, anchor):
    w = len(text) * 6.0     # about the text's width, to keep it on the board
    if anchor == "middle": x = min(max(x, w / 2 + 3), W - w / 2 - 3)
    elif anchor == "end": x = max(x, w + 3)
    else: x = min(x, W - w - 3)
    s = '<text x="%.1f" y="%.1f" font-family="DejaVu Sans" font-weight="bold" font-size="8" text-anchor="%s"' % (x, y, anchor)
    return s + ' fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linejoin="round">%s</text>' % text + s + ' fill="#2b2d42">%s</text>' % text
for (pid, name, x, y, kind, side) in PLACES:
    r = 18 if kind == "start" else 14
    if side == "b": A(label(x, y + r + 6, name, "middle"))
    elif side == "t": A(label(x, y - r + 1, name, "middle"))
    elif side == "l": A(label(x - r, y + 3, name, "end"))
    else: A(label(x + r, y + 3, name, "start"))
A('</svg>')
os.makedirs(os.path.join(GAME, "img"), exist_ok=True)
os.makedirs(os.path.join(GAME, "lib"), exist_ok=True)
board_svg = "\n".join(svg)
cairosvg.svg2png(bytestring=board_svg.encode(), write_to=os.path.join(GAME, "img", "board.png"))


# ---- sprites ---------------------------------------------------------------
def png(name, w, h, body, scale=1):
    s = '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">%s</svg>' % (w * scale, h * scale, w, h, body)
    cairosvg.svg2png(bytestring=s.encode(), write_to=os.path.join(GAME, "img", name + ".png"))

# a face-down token: a puck seen from above
png("puck", 64, 64, '''
<defs><radialGradient id="g" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#4a4e69"/><stop offset="1" stop-color="#11121a"/></radialGradient></defs>
<circle cx="32" cy="34" r="28" fill="#000" opacity="0.3"/>
<circle cx="32" cy="31" r="28" fill="url(#g)" stroke="#000" stroke-width="2"/>
<circle cx="32" cy="31" r="21" fill="none" stroke="#6c757d" stroke-width="1.5" stroke-dasharray="3 3"/>
<text x="32" y="42" font-family="DejaVu Sans" font-weight="bold" font-size="30" fill="#ffd166" text-anchor="middle">?</text>''')

# pawns: Ilves (green and yellow, a lynx) and Tappara (orange and blue, an axe)
png("ilves", 96, 96, '''
<circle cx="48" cy="51" r="42" fill="#000" opacity="0.28"/>
<circle cx="48" cy="47" r="42" fill="#0b7a3e" stroke="#ffd200" stroke-width="6"/>
<path d="M 24 40 L 22 14 L 38 30 Z" fill="#f2b632" stroke="#5c3b00" stroke-width="2"/>
<path d="M 72 40 L 74 14 L 58 30 Z" fill="#f2b632" stroke="#5c3b00" stroke-width="2"/>
<path d="M 22 14 l -2 -8 M 74 14 l 2 -8" stroke="#1b1b1b" stroke-width="3" stroke-linecap="round"/>
<path d="M 20 44 Q 20 26 48 26 Q 76 26 76 44 Q 80 58 70 68 L 48 76 L 26 68 Q 16 58 20 44 Z" fill="#f2b632" stroke="#5c3b00" stroke-width="2"/>
<path d="M 22 58 l -10 2 M 22 63 l -9 6 M 74 58 l 10 2 M 74 63 l 9 6" stroke="#5c3b00" stroke-width="1.6"/>
<path d="M 32 34 l 4 6 M 44 30 l 0 6 M 52 30 l 0 6 M 64 34 l -4 6" stroke="#8a5a00" stroke-width="2" stroke-linecap="round"/>
<ellipse cx="37" cy="48" rx="6" ry="7" fill="#fff"/><ellipse cx="59" cy="48" rx="6" ry="7" fill="#fff"/>
<ellipse cx="38" cy="49" rx="3" ry="5" fill="#1b4332"/><ellipse cx="58" cy="49" rx="3" ry="5" fill="#1b4332"/>
<path d="M 44 58 L 52 58 L 48 63 Z" fill="#6d2e1f"/>
<path d="M 48 63 q -5 6 -10 3 M 48 63 q 5 6 10 3" fill="none" stroke="#5c3b00" stroke-width="1.8" stroke-linecap="round"/>''')
png("tappara", 96, 96, '''
<circle cx="48" cy="51" r="42" fill="#000" opacity="0.28"/>
<circle cx="48" cy="47" r="42" fill="#f47920" stroke="#13306b" stroke-width="6"/>
<path d="M 28 82 L 58 18" stroke="#5a3215" stroke-width="8" stroke-linecap="round"/>
<path d="M 28 82 L 58 18" stroke="#a0632f" stroke-width="3.5" stroke-linecap="round"/>
<path d="M 50 22 L 60 28 Q 80 36 78 62 Q 70 48 56 44 L 46 38 Z" fill="#13306b" stroke="#0a1838" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M 50 22 Q 54 6 76 6 Q 70 20 60 28 Z" fill="#13306b" stroke="#0a1838" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M 74 10 Q 66 22 62 28 M 77 58 Q 70 46 60 42" fill="none" stroke="#c9d8f5" stroke-width="2.5" stroke-linecap="round"/>
''')

# a diamond
png("timantti", 128, 128, '''
<ellipse cx="64" cy="116" rx="36" ry="6" fill="#000" opacity="0.2"/>
<path d="M 30 44 L 46 22 L 82 22 L 98 44 L 64 108 Z" fill="#7fdbff" stroke="#0b5394" stroke-width="3" stroke-linejoin="round"/>
<path d="M 30 44 L 98 44 M 46 22 L 54 44 L 64 22 L 74 44 L 82 22 M 54 44 L 64 108 L 74 44" fill="none" stroke="#0b5394" stroke-width="2"/>
<path d="M 48 26 L 54 40 L 40 40 Z" fill="#ffffff" opacity="0.8"/>
<path d="M 100 16 l 3 7 l 7 3 l -7 3 l -3 7 l -3 -7 l -7 -3 l 7 -3 Z" fill="#ffffff" stroke="#7fdbff" stroke-width="1"/>
''')

# the trophy (the game's own cup, drawn here)
png("malja", 128, 128, '''
<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d99ae"/><stop offset="0.35" stop-color="#ffffff"/><stop offset="0.6" stop-color="#ced4da"/><stop offset="1" stop-color="#6c757d"/></linearGradient></defs>
<ellipse cx="64" cy="120" rx="34" ry="6" fill="#000" opacity="0.25"/>
<path d="M 26 18 Q 4 18 8 40 Q 12 58 36 60" fill="none" stroke="url(#s)" stroke-width="7"/>
<path d="M 102 18 Q 124 18 120 40 Q 116 58 92 60" fill="none" stroke="url(#s)" stroke-width="7"/>
<path d="M 24 12 L 104 12 Q 104 66 64 74 Q 24 66 24 12 Z" fill="url(#s)" stroke="#495057" stroke-width="2"/>
<ellipse cx="64" cy="12" rx="40" ry="6" fill="#e9ecef" stroke="#495057" stroke-width="2"/>
<rect x="56" y="72" width="16" height="18" fill="url(#s)" stroke="#495057" stroke-width="2"/>
<path d="M 38 116 L 44 90 L 84 90 L 90 116 Z" fill="#6f4518" stroke="#3b2409" stroke-width="2"/>
<rect x="52" y="98" width="24" height="10" rx="2" fill="#ffd166"/>
<path d="M 44 22 Q 46 50 60 62" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.8"/>''')

# mustamakkara with lingonberry jam
png("makkara", 128, 128, '''
<ellipse cx="64" cy="98" rx="54" ry="18" fill="#ffffff" stroke="#adb5bd" stroke-width="3"/>
<path d="M 22 80 Q 20 40 64 38 Q 108 40 106 80" fill="none" stroke="#1b1b1b" stroke-width="24" stroke-linecap="round"/>
<path d="M 30 70 Q 32 48 64 46" fill="none" stroke="#5a5a5a" stroke-width="5" stroke-linecap="round"/>
<circle cx="22" cy="82" r="5" fill="#3d3d3d"/><circle cx="106" cy="82" r="5" fill="#3d3d3d"/>
<ellipse cx="66" cy="98" rx="16" ry="8" fill="#c1121f"/>
<circle cx="60" cy="96" r="3" fill="#e5383b"/><circle cx="70" cy="99" r="3" fill="#e5383b"/><circle cx="66" cy="94" r="2.5" fill="#ff6b6b"/>''')

# a robber: striped cap, eye mask, a bag
png("rosvo", 128, 128, '''
<circle cx="64" cy="66" r="40" fill="#f1c27d" stroke="#6d4c41" stroke-width="3"/>
<path d="M 24 56 Q 26 18 64 18 Q 102 18 104 56 Z" fill="#212529"/>
<path d="M 30 40 L 98 40 M 26 50 L 102 50" stroke="#e63946" stroke-width="5"/>
<circle cx="64" cy="16" r="7" fill="#e63946"/>
<path d="M 26 62 Q 64 50 102 62 L 100 78 Q 64 70 28 78 Z" fill="#111"/>
<ellipse cx="48" cy="68" rx="7" ry="5" fill="#fff"/><ellipse cx="80" cy="68" rx="7" ry="5" fill="#fff"/>
<circle cx="50" cy="68" r="3" fill="#111"/><circle cx="82" cy="68" r="3" fill="#111"/>
<path d="M 50 92 Q 64 86 78 92" fill="none" stroke="#6d4c41" stroke-width="3" stroke-linecap="round"/>
<path d="M 40 86 q 4 8 0 14 M 88 86 q -4 8 0 14" stroke="#6d4c41" stroke-width="2" fill="none"/>''')

# the police: a cap with a badge
png("poliisi", 128, 128, '''
<circle cx="64" cy="76" r="36" fill="#f1c27d" stroke="#6d4c41" stroke-width="3"/>
<path d="M 18 52 Q 64 6 110 52 Z" fill="#1d3557" stroke="#0b1d33" stroke-width="3"/>
<path d="M 22 52 L 106 52 L 96 62 L 32 62 Z" fill="#0b1d33"/>
<path d="M 64 22 l 7 8 l -7 10 l -7 -10 Z" fill="#ffd166" stroke="#9c6500" stroke-width="1.5"/>
<circle cx="52" cy="78" r="4" fill="#111"/><circle cx="76" cy="78" r="4" fill="#111"/>
<path d="M 52 94 Q 64 100 76 94" fill="none" stroke="#6d4c41" stroke-width="3" stroke-linecap="round"/>
<path d="M 46 88 Q 64 82 82 88" fill="none" stroke="#6d4c41" stroke-width="4" stroke-linecap="round"/>''')

# an empty token: the puck turned over, nothing under it
png("tyhja", 128, 128, '''
<ellipse cx="64" cy="76" rx="46" ry="30" fill="#000" opacity="0.25"/>
<ellipse cx="64" cy="70" rx="46" ry="30" fill="#e9ecef" stroke="#adb5bd" stroke-width="3"/>
<ellipse cx="64" cy="70" rx="30" ry="18" fill="none" stroke="#ced4da" stroke-width="2" stroke-dasharray="5 4"/>
<path d="M 52 64 q 6 -8 12 0 q 6 8 12 0" fill="none" stroke="#adb5bd" stroke-width="3" stroke-linecap="round"/>''')

# hockey cards: bronze, silver and gold
def card(name, title, value, c1, c2, jersey):
    png(name, 120, 168, '''
<defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%s"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="1" stop-color="%s"/></linearGradient></defs>
<rect x="2" y="2" width="116" height="164" rx="12" fill="url(#f)" stroke="#3d3d3d" stroke-width="2"/>
<rect x="10" y="10" width="100" height="104" rx="8" fill="#a8dadc" stroke="#3d3d3d" stroke-width="1.5"/>
<rect x="10" y="84" width="100" height="30" fill="#f1faee"/>
<path d="M 10 84 L 110 84" stroke="#e63946" stroke-width="2"/>
<path d="M 34 100 Q 34 64 60 62 Q 86 64 86 100 Z" fill="%s" stroke="#1b1b1b" stroke-width="2"/>
<circle cx="60" cy="46" r="17" fill="#f1c27d" stroke="#6d4c41" stroke-width="2"/>
<path d="M 42 44 Q 42 24 60 24 Q 78 24 78 44 L 74 44 Q 72 34 60 34 Q 48 34 46 44 Z" fill="#1b1b1b"/>
<path d="M 42 44 L 46 44 M 74 44 L 78 44" stroke="#1b1b1b" stroke-width="3"/>
<circle cx="54" cy="48" r="2" fill="#111"/><circle cx="66" cy="48" r="2" fill="#111"/>
<path d="M 54 55 Q 60 59 66 55" fill="none" stroke="#6d4c41" stroke-width="2" stroke-linecap="round"/>
<text x="60" y="94" font-family="DejaVu Sans" font-weight="bold" font-size="14" fill="#ffffff" text-anchor="middle">%s</text>
<path d="M 92 112 L 102 70" stroke="#6f4518" stroke-width="4" stroke-linecap="round"/><path d="M 92 112 L 82 112" stroke="#6f4518" stroke-width="5" stroke-linecap="round"/>
<text x="60" y="134" font-family="DejaVu Sans" font-weight="bold" font-size="17" fill="#1b1b1b" text-anchor="middle">%s</text>
<rect x="24" y="142" width="72" height="18" rx="9" fill="#2b2d42"/>
<text x="60" y="156" font-family="DejaVu Sans" font-weight="bold" font-size="13" fill="#ffd166" text-anchor="middle">%s €</text>''' % (c1, c2, c1, jersey, title, value))
card("kummola", "Kummola", 300, "#cd7f32", "#8c5523", "300")
card("raipe", "Raipe", 600, "#9aa5b1", "#5c6670", "600")
card("barkov", "Barkov", 1000, "#ffd700", "#b8860b", "1000")

# ---- board.ts -------------------------------------------------------------
data = {
    "W": W, "H": H,
    "places": [{"id": p[0], "name": p[1], "x": p[2], "y": p[3], "kind": p[4]} for p in PLACES],
    "nodes": nodes,
    "adj": adj,
    "trams": [{"id": t["id"], "color": t["color"], "stops": [P[s] for s in t["stops"]]} for t in TRAMS],
    "fares": FARES,
    "boats": [{"a": P[b["a"]], "b": P[b["b"]], "price": b["price"]} for b in BOATS],
}
with open(os.path.join(GAME, "lib", "board.ts"), "w") as f:
    f.write("// GENERATED by tools/kanadamalja/build.py: the board of Kanada-malja.\n")
    f.write("// nodes: [x, y, place index or -1 for a dot on a path]; adj: neighbours of each node.\n")
    f.write("export const BOARD: any = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("nodes", len(nodes), "places", len(PLACES))
