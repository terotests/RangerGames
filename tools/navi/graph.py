# SPDX-License-Identifier: AGPL-3.0-or-later
"""The walking network of tools/navi/ttd.py as a graph: streets a child may
walk along (no motorways or fast roads), footways, cycleways, paths and
steps. The map's lines are simplified, so ways that met at a shared OSM node
may no longer share a vertex: crossings are found geometrically and line
ends are snapped onto a line passing within SNAP metres. A crossing with a
road bridge deck is not a junction.

Edges carry a cost: metres times how pleasant the way is for a child on
foot (footways cheapest, big streets dearest)."""
import math
from collections import defaultdict

SNAP = 3.0
CELL = 40.0
# cost per metre by street class (1 primary .. 4 residential) and footway kind
STREET_COST = {1: 2.2, 2: 1.6, 3: 1.25, 4: 1.0}
FOOT_COST = {1: 0.85, 2: 0.95, 3: 1.05, 4: 1.4}


def walkable_lines(d, box):
    x0, z0, x1, z1 = box
    out = []
    def inside(p):
        return any(x0 <= a <= x1 and z0 <= b <= z1 for a, b in p)
    for s in d["S"]:
        n = s["name"]
        if n.startswith("motorway") or n.startswith("trunk"):
            continue
        if s["speed"] >= 70:
            continue
        if inside(s["p"]):
            out.append((s["p"], STREET_COST[s["cls"]], s["name"] if not n.endswith("_link") else ""))
    for f in d["F"]:
        if inside(f["p"]):
            out.append((f["p"], FOOT_COST.get(f["kind"], 1.0), ""))
    return out


def seg_inter(p, p2, q, q2):
    """Where segments p-p2 and q-q2 cross: (t, u) or None."""
    rx, rz = p2[0] - p[0], p2[1] - p[1]
    sx, sz = q2[0] - q[0], q2[1] - q[1]
    den = rx * sz - rz * sx
    if abs(den) < 1e-9:
        return None
    qpx, qpz = q[0] - p[0], q[1] - p[1]
    t = (qpx * sz - qpz * sx) / den
    u = (qpx * rz - qpz * rx) / den
    if -1e-9 <= t <= 1 + 1e-9 and -1e-9 <= u <= 1 + 1e-9:
        return t, u
    return None


def closest_on_seg(p, a, b):
    vx, vz = b[0] - a[0], b[1] - a[1]
    L2 = vx * vx + vz * vz
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / L2))
    cx, cz = a[0] + vx * t, a[1] + vz * t
    return t, math.hypot(p[0] - cx, p[1] - cz)


def on_deck(a, b, decks):
    """Both ends of a-b lie within 4 m of one bridge deck's centre line."""
    for dk in decks:
        ok = 0
        for p in (a, b, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)):
            best = 1e9
            for i in range(len(dk) - 1):
                best = min(best, closest_on_seg(p, dk[i], dk[i + 1])[1])
            if best < 4.0:
                ok += 1
        if ok == 3:
            return True
    return False


def build(d, box):
    lines = walkable_lines(d, box)
    decks = [y["p"] for y in d["Y"]]
    deck_grid = defaultdict(list)
    for i, dk in enumerate(decks):
        xs = [p[0] for p in dk]; zs = [p[1] for p in dk]
        for gx in range(int((min(xs) - 10) // 100), int((max(xs) + 10) // 100) + 1):
            for gz in range(int((min(zs) - 10) // 100), int((max(zs) + 10) // 100) + 1):
                deck_grid[(gx, gz)].append(i)
    segs = []  # (line, index)
    grid = defaultdict(list)
    for li, (p, _, _) in enumerate(lines):
        for i in range(len(p) - 1):
            a, b = p[i], p[i + 1]
            si = len(segs)
            segs.append((li, i))
            for gx in range(int(math.floor((min(a[0], b[0]) - SNAP) / CELL)), int(math.floor((max(a[0], b[0]) + SNAP) / CELL)) + 1):
                for gz in range(int(math.floor((min(a[1], b[1]) - SNAP) / CELL)), int(math.floor((max(a[1], b[1]) + SNAP) / CELL)) + 1):
                    grid[(gx, gz)].append(si)
    deck_cache = {}
    def seg_on_deck(si):
        if si not in deck_cache:
            li, i = segs[si]
            a, b = lines[li][0][i], lines[li][0][i + 1]
            near = set()
            for gx in (int(a[0] // 100), int(b[0] // 100)):
                for gz in (int(a[1] // 100), int(b[1] // 100)):
                    near.update(deck_grid.get((gx, gz), ()))
            deck_cache[si] = on_deck(a, b, [decks[k] for k in near]) if near else False
        return deck_cache[si]

    # split points per segment: (t, key)
    splits = defaultdict(list)
    def key(x, z):
        return (round(x * 10), round(z * 10))
    # 1. crossings
    pairs = set()
    for cell, ss in grid.items():
        for ai in range(len(ss)):
            for bi in range(ai + 1, len(ss)):
                s1, s2 = ss[ai], ss[bi]
                if s1 > s2: s1, s2 = s2, s1
                if (s1, s2) in pairs: continue
                pairs.add((s1, s2))
                l1, i1 = segs[s1]; l2, i2 = segs[s2]
                if l1 == l2 and abs(i1 - i2) <= 1: continue
                p1, p2 = lines[l1][0][i1], lines[l1][0][i1 + 1]
                q1, q2 = lines[l2][0][i2], lines[l2][0][i2 + 1]
                r = seg_inter(p1, p2, q1, q2)
                if r is None: continue
                t, u = r
                if seg_on_deck(s1) != seg_on_deck(s2): continue
                x, z = p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t
                k = key(x, z)
                splits[s1].append((t, k, (x, z)))
                splits[s2].append((u, k, (x, z)))
    # 2. line ends snapped onto other lines
    for li, (p, _, _) in enumerate(lines):
        for end in (0, len(p) - 1):
            e = p[end]
            best = None
            for si in grid.get((int(math.floor(e[0] / CELL)), int(math.floor(e[1] / CELL))), ()):
                l2, i2 = segs[si]
                if l2 == li: continue
                a, b = lines[l2][0][i2], lines[l2][0][i2 + 1]
                t, dist = closest_on_seg(e, a, b)
                if dist <= SNAP and (best is None or dist < best[0]):
                    best = (dist, si, t)
            if best is not None:
                dist, si, t = best
                l2, i2 = segs[si]
                a, b = lines[l2][0][i2], lines[l2][0][i2 + 1]
                x, z = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
                k = key(e[0], e[1])
                splits[si].append((t, k, (e[0], e[1])))  # join at the end's own point
    # 3. walk each line into a vertex chain; vertices keyed by position
    seg_of = {}
    for si, (li, i) in enumerate(segs):
        seg_of[(li, i)] = si
    pos = {}
    use = defaultdict(int)  # how many chains touch a vertex
    chains = []
    for li, (p, cost, name) in enumerate(lines):
        chain = []
        def add(k, xz):
            if chain and chain[-1] == k: return
            pos.setdefault(k, xz)
            chain.append(k)
        for i in range(len(p) - 1):
            add(key(*p[i]), p[i])
            for t, k, xz in sorted(splits.get(seg_of[(li, i)], []), key=lambda s: s[0]):
                add(k, xz)
        add(key(*p[-1]), p[-1])
        if len(chain) >= 2:
            chains.append((chain, cost, name))
    deg = defaultdict(int)
    for chain, _, _ in chains:
        for j, k in enumerate(chain):
            deg[k] += 1 if j in (0, len(chain) - 1) else 2
    # junction vertices: ends, crossings, vertices on two chains
    def junction(k):
        return deg[k] != 2
    # 4. contract into edges between junctions
    node_id = {}
    nodes = []
    def nid(k):
        if k not in node_id:
            node_id[k] = len(nodes); nodes.append(pos[k])
        return node_id[k]
    edges = []
    for chain, cost, name in chains:
        start = 0
        for j in range(1, len(chain)):
            if junction(chain[j]) or j == len(chain) - 1:
                part = chain[start:j + 1]
                L = sum(math.hypot(pos[part[m + 1]][0] - pos[part[m]][0], pos[part[m + 1]][1] - pos[part[m]][1]) for m in range(len(part) - 1))
                if L > 0:
                    edges.append((nid(part[0]), nid(part[-1]), L, L * cost, [pos[k] for k in part[1:-1]], name))
                start = j
    return nodes, edges


def components(nodes, edges):
    parent = list(range(len(nodes)))
    def f(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for a, b, *_ in edges:
        ra, rb = f(a), f(b)
        if ra != rb: parent[ra] = rb
    size = defaultdict(int)
    for i in range(len(nodes)): size[f(i)] += 1
    return f, size
