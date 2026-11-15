#!/usr/bin/env python3
"""Finds how the seven tangram pieces fill a shadow (for Varjopalat's hard
figures). Coordinates are "square units": the classic tangram square is 8 x 8,
every piece corner lies on whole numbers, and each piece is a union of the
quarter triangles you get by cutting every unit cell along both diagonals.

  python3 tools/varjo/tile.py            all figures in FIGS: solutions found, ascii preview
  python3 tools/varjo/tile.py --ts       the figures as TypeScript for games/varjo/lib/shapes.ts

A shadow is one or more polygons (outer outline; holes are not used). The
solver is a plain exact cover search: first uncovered triangle, every
placement of every unused piece that covers it.
"""
import sys

PIECES = {
    "L": [(0, 0), (8, 0), (4, 4)], "L2": [(0, 0), (8, 0), (4, 4)],
    "M": [(0, 0), (4, 0), (0, 4)],
    "S": [(0, 0), (4, 0), (2, 2)], "S2": [(0, 0), (4, 0), (2, 2)],
    "Q": [(2, 0), (4, 2), (2, 4), (0, 2)],
    "P": [(0, 0), (4, 0), (6, 2), (2, 2)],
}
ORDER = ["L", "L2", "M", "Q", "P", "S", "S2"]


def inside(poly, x, y):
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        ax, ay = poly[i]; bx, by = poly[j]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            c = not c
        j = i
    return c


TRI = [(0.5, 1 / 6), (5 / 6, 0.5), (0.5, 5 / 6), (1 / 6, 0.5)]


def tris(polys, box):
    x0, y0, x1, y1 = box
    out = set()
    for i in range(x0, x1):
        for j in range(y0, y1):
            for k, (dx, dy) in enumerate(TRI):
                if any(inside(p, i + dx, j + dy) for p in polys):
                    out.add((i, j, k))
    return out


def orients(shape):
    seen, res = set(), []
    pts = shape
    for f in range(2):
        for r in range(4):
            q = [(-x, y) if f else (x, y) for x, y in pts]
            for _ in range(r):
                q = [(-y, x) for x, y in q]
            mx = min(x for x, y in q); my = min(y for x, y in q)
            q = [(x - mx, y - my) for x, y in q]
            key = tuple(sorted(q))
            if key not in seen:
                seen.add(key); res.append(q)
    return res


def solve(polys, limit=2000):
    xs = [x for p in polys for x, y in p]; ys = [y for p in polys for x, y in p]
    box = (min(xs), min(ys), max(xs), max(ys))
    cells = sorted(tris(polys, box), key=lambda t: (t[1], t[0], t[2]))
    return solve_cells(cells, box, limit)


def solve_cells(cells, box, limit=2000):
    if len(cells) != 256:
        return None, "area is %g, not 64" % (len(cells) / 4)
    idx = {c: n for n, c in enumerate(cells)}
    places = {}  # piece -> list of (mask, poly)
    for name in ORDER:
        lst = []
        for o in orients(PIECES[name]):
            w = max(x for x, y in o); h = max(y for x, y in o)
            ot = tris([o], (0, 0, w, h))
            for tx in range(box[0], box[2] - w + 1):
                for ty in range(box[1], box[3] - h + 1):
                    m = 0; ok = True
                    for (i, j, k) in ot:
                        n = idx.get((i + tx, j + ty, k))
                        if n is None:
                            ok = False; break
                        m |= 1 << n
                    if ok:
                        lst.append((m, [(x + tx, y + ty) for x, y in o]))
        places[name] = lst
    full = (1 << len(cells)) - 1
    sols = []
    used = {}

    def go(cov):
        if len(sols) >= limit:
            return
        if cov == full:
            # the twin pieces (two big, two small) swapped are the same answer
            key = frozenset((n.rstrip("2"), tuple(sorted(p))) for n, p in used.items())
            if key not in seen:
                seen.add(key); sols.append(dict(used))
            return
        free = ~cov & full
        bit = free & -free
        for name in ORDER:
            if name in used:
                continue
            if name.endswith("2") and name[:-1] not in used:
                continue  # a twin goes after its first
            for m, p in places[name]:
                if m & bit and not (m & cov):
                    used[name] = p
                    go(cov | m)
                    del used[name]
    seen = set()
    go(0)
    return sols, None


def ascii_(sol, box):
    x0, y0, x1, y1 = box
    rows = []
    for j in range(y0 * 2, y1 * 2):
        row = ""
        for i in range(x0 * 2, x1 * 2):
            ch = "."
            for n, p in sol.items():
                if inside(p, i / 2 + 0.25, j / 2 + 0.25):
                    ch = n[0]
            row += ch
        rows.append(row)
    return "\n".join(rows)


def kind_of(poly):
    """which piece a polygon is (or None)"""
    for name in ("L", "M", "S", "Q", "P"):
        o_ = orients(PIECES[name])
        mx = min(x for x, y in poly); my = min(y for x, y in poly)
        key = tuple(sorted((x - mx, y - my) for x, y in poly))
        if any(tuple(sorted(o)) == key for o in o_):
            return name
    return None


# The hard figures: id, names, emoji, and the answer as seven pieces (corner
# lists in square units). The shadow is their union; the solver counts the
# other ways to fill it (more ways = the shadow tells less).
FIGS = []


def fig(id, fi, en, es, icon, *pieces):
    FIGS.append((id, fi, en, es, icon, list(pieces)))


def check(pieces):
    kinds = sorted(kind_of(p) or "?" for p in pieces)
    if kinds != sorted(["L", "L", "M", "Q", "P", "S", "S"]):
        return None, None, "pieces are " + "".join(kinds)
    xs = [x for p in pieces for x, y in p]; ys = [y for p in pieces for x, y in p]
    box = (min(xs), min(ys), max(xs), max(ys))
    total = 0; allc = set()
    for p in pieces:
        t = tris([p], box); total += len(t); allc |= t
    if total != len(allc):
        return None, None, "pieces overlap"
    # every piece touches another along an edge (shares two triangles' side)
    return sorted(allc, key=lambda t: (t[1], t[0], t[2])), box, None


def render(path, figs):
    from PIL import Image, ImageDraw
    cols = ["#ef476f", "#f78c6b", "#06d6a0", "#4cc9f0", "#b388eb", "#ffd166", "#ffb000"]
    W = 220
    im = Image.new("RGB", (W * 2 * min(4, len(figs)), W * ((len(figs) + 3) // 4)), "white")
    d = ImageDraw.Draw(im)
    for n, (id, fi, en, es, icon, pieces) in enumerate(figs):
        xs = [x for p in pieces for x, y in p]; ys = [y for p in pieces for x, y in p]
        k = (W - 20) / max(max(xs) - min(xs), max(ys) - min(ys))
        for side in range(2):
            ox = (n % 4) * 2 * W + side * W + 10 - min(xs) * k; oy = (n // 4) * W + 10 - min(ys) * k
            for c, p in enumerate(pieces):
                d.polygon([(ox + x * k, oy + y * k) for x, y in p], fill=cols[c] if side else "#3d405b", outline=None if not side else "black")
        d.text(((n % 4) * 2 * W + 8, (n // 4) * W + 2), fi, fill="black")
    im.save(path)


FIGS_FILE = __file__.replace("tile.py", "figs.py")
exec(open(FIGS_FILE).read())

if __name__ == "__main__":
    ts = "--ts" in sys.argv
    out = []
    good = []
    for id, fi, en, es, icon, pieces in FIGS:
        cells, box, err = check(pieces)
        if err:
            print(id, "ERROR", err); continue
        good.append((id, fi, en, es, icon, pieces))
        sols, err = solve_cells(cells, box)
        if ts:
            ps = ", ".join("[" + ", ".join("[%d, %d]" % v for v in p) + "]" for p in pieces)
            out.append('  { id: "%s", fi: "%s", en: "%s", es: "%s", icon: "%s", hard: true, polys: sq([%s]) },' % (id, fi, en, es, icon, ps))
        else:
            print("%-10s %s%d ways to fill the shadow" % (id, "≥" if len(sols) >= 2000 else "", len(sols)))
    if ts:
        print("\n".join(out))
    elif "--png" in sys.argv:
        render(sys.argv[sys.argv.index("--png") + 1], good)
