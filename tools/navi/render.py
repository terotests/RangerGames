# SPDX-License-Identifier: AGPL-3.0-or-later
"""Draws the map of tools/navi/ttd.py as PNG tiles in a bright, child-friendly
style. A tile covers TILE pixels; mpp is metres per pixel."""
import math
from PIL import Image, ImageDraw

BG = (238, 234, 214)
GREEN = {1: (196, 228, 160), 2: (170, 222, 140), 3: (140, 200, 120), 4: (180, 214, 150), 5: (150, 214, 130), 6: (226, 222, 210), 7: (246, 240, 226)}
WATER = (130, 196, 240)
WATER_EDGE = (98, 168, 222)
BUILD = (240, 200, 170)
BUILD_EDGE = (214, 164, 130)
STREET = {1: (255, 214, 92), 2: (255, 236, 150), 3: (255, 255, 255), 4: (255, 255, 255)}
CASING = {1: (214, 160, 60), 2: (214, 190, 120), 3: (190, 186, 176), 4: (196, 192, 180)}
WIDTH = {1: 12, 2: 10, 3: 8, 4: 6.5}
FOOT = (255, 255, 255)
FOOT_EDGE = (200, 180, 150)
RAIL = (150, 150, 160)
TRAM = (170, 90, 200)
SS = 2  # supersampling


def bbox(p):
    xs = [a[0] for a in p]; zs = [a[1] for a in p]
    return min(xs), min(zs), max(xs), max(zs)


class Index:
    """Features by a coarse grid so a tile only looks at what is near it."""
    def __init__(self, feats, cell=500.0):
        self.cell = cell; self.grid = {}
        for i, f in enumerate(feats):
            x0, z0, x1, z1 = f["bb"] = bbox(f["p"])
            for gx in range(int(math.floor(x0 / cell)), int(math.floor(x1 / cell)) + 1):
                for gz in range(int(math.floor(z0 / cell)), int(math.floor(z1 / cell)) + 1):
                    self.grid.setdefault((gx, gz), []).append(i)
        self.feats = feats

    def query(self, x0, z0, x1, z1):
        seen = set(); out = []
        c = self.cell
        for gx in range(int(math.floor(x0 / c)), int(math.floor(x1 / c)) + 1):
            for gz in range(int(math.floor(z0 / c)), int(math.floor(z1 / c)) + 1):
                for i in self.grid.get((gx, gz), ()):
                    if i in seen: continue
                    seen.add(i)
                    b = self.feats[i]["bb"]
                    if b[2] < x0 or b[0] > x1 or b[3] < z0 or b[1] > z1: continue
                    out.append(self.feats[i])
        return out


class Renderer:
    def __init__(self, d):
        self.d = d
        walk = [s for s in d["S"]]
        self.idx = {k: Index(d[k]) for k in ("G", "W", "B", "F", "L", "M")}
        self.streets = Index(walk)
        self.trams = Index([n for n in d["N"] if n["type"] == "0"])

    def render(self, x0, z0, mpp, w, h):
        """The area from (x0, z0) east and south, w x h pixels."""
        S = SS
        img = Image.new("RGB", (w * S, h * S), BG)
        dr = ImageDraw.Draw(img)
        x1, z1 = x0 + w * mpp, z0 + h * mpp
        pad = 20
        q = lambda k: self.idx[k].query(x0 - pad, z0 - pad, x1 + pad, z1 + pad)
        k = S / mpp
        tr = lambda p: [((a - x0) * k, (b - z0) * k) for a, b in p]
        lw = lambda m, lo=1: max(lo, int(round(m * k)))
        for g in sorted(q("G"), key=lambda g: g["kind"] in (6, 7)):
            if len(g["p"]) >= 3: dr.polygon(tr(g["p"]), fill=GREEN.get(g["kind"], GREEN[1]))
        for wv in q("W"):
            if len(wv["p"]) >= 3: dr.polygon(tr(wv["p"]), fill=WATER, outline=WATER_EDGE, width=lw(1.5))
        detail = mpp <= 4
        for b in q("B"):
            if len(b["p"]) >= 3:
                if detail: dr.polygon(tr(b["p"]), fill=BUILD, outline=BUILD_EDGE, width=lw(0.8))
                else: dr.polygon(tr(b["p"]), fill=BUILD)
        for l in q("L"):
            dr.line(tr(l["p"]), fill=RAIL, width=lw(2.2))
        feet = q("F")
        if detail:
            for f in feet: dr.line(tr(f["p"]), fill=FOOT_EDGE, width=lw(3.6, 2), joint="curve")
            for f in feet: dr.line(tr(f["p"]), fill=FOOT, width=lw(2.4, 1), joint="curve")
        else:
            for f in feet: dr.line(tr(f["p"]), fill=(250, 248, 240), width=lw(2.5, 1))
        sts = self.streets.query(x0 - pad, z0 - pad, x1 + pad, z1 + pad)
        sts.sort(key=lambda s: -s["cls"])
        mult = 1.0 if detail else 1.6
        for s in sts:
            dr.line(tr(s["p"]), fill=CASING[s["cls"]], width=lw(WIDTH[s["cls"]] * mult + 2.5, 2), joint="curve")
        for s in sts:
            dr.line(tr(s["p"]), fill=STREET[s["cls"]], width=lw(WIDTH[s["cls"]] * mult, 1), joint="curve")
        for t in self.trams.query(x0 - pad, z0 - pad, x1 + pad, z1 + pad):
            dr.line(tr(t["p"]), fill=TRAM, width=lw(2.0 * mult, 2), joint="curve")
        return img.resize((w, h), Image.LANCZOS)
