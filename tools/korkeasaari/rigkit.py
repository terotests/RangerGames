#!/usr/bin/env python3
# Drawing kit for rigged animals, shared with the Kolmården game (games/kolmarden/tools/rig_animals.py):
# shapes, gradients, the Rig class, quad() for four-legged animals, and rendering parts to PNGs.
import json, math, os, shutil, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "..", "games", "korkeasaari"))
OUT = os.path.join(GAME, "rig")
K = 2.0           # pixels per rig unit in the PNGs
M = 80            # margin round the rig space while rendering

# ---- colours and shapes ------------------------------------------------------


def rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def hexc(c):
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(v)))) for v in c)


def shade(h, f):
    c = rgb(h)
    if f < 1:
        return hexc([v * f for v in c])
    return hexc([v + (255 - v) * (f - 1) for v in c])


GID = [0]


def grad(c, vertical=True, light=1.18, dark=0.78):
    """a gradient fill: light on top (or on the left), dark below"""
    GID[0] += 1
    gid = "g%d" % GID[0]
    x2, y2 = ("0", "1") if vertical else ("1", "0")
    d = ('<linearGradient id="%s" x1="0" y1="0" x2="%s" y2="%s">'
         '<stop offset="0" stop-color="%s"/><stop offset="0.55" stop-color="%s"/><stop offset="1" stop-color="%s"/>'
         '</linearGradient>') % (gid, x2, y2, shade(c, light), c, shade(c, dark))
    return d, "url(#%s)" % gid


def fill(c, vertical=True, light=1.18, dark=0.78, sw=1.6, extra=""):
    d, u = grad(c, vertical, light, dark)
    return d, 'fill="%s" stroke="%s" stroke-width="%g" stroke-linejoin="round" %s' % (u, shade(c, 0.55), sw, extra)


def P(d, c, vertical=True, sw=1.6, light=1.18, dark=0.78, extra=""):
    defs, a = fill(c, vertical, light, dark, sw, extra)
    return "<defs>%s</defs><path d=\"%s\" %s/>" % (defs, d, a)


def E(cx, cy, rx, ry, c, rot=0, sw=1.6, light=1.18, dark=0.78):
    defs, a = fill(c, True, light, dark, sw)
    tr = ' transform="rotate(%g %g %g)"' % (rot, cx, cy) if rot else ""
    return "<defs>%s</defs><ellipse cx=\"%g\" cy=\"%g\" rx=\"%g\" ry=\"%g\"%s %s/>" % (defs, cx, cy, rx, ry, tr, a)


def flat(d, c, op=1.0):
    return '<path d="%s" fill="%s" opacity="%g"/>' % (d, c, op)


def eye(x, y, r=3.2, iris="#3a2410"):
    return ('<ellipse cx="%g" cy="%g" rx="%g" ry="%g" fill="%s" stroke="#1a120c" stroke-width="0.8"/>'
            '<circle cx="%g" cy="%g" r="%g" fill="#0b0805"/>'
            '<circle cx="%g" cy="%g" r="%g" fill="#fff"/>') % (x, y, r * 1.1, r, iris, x + r * 0.15, y, r * 0.55, x + r * 0.45, y - r * 0.35, r * 0.28)


def limb(x1, y1, x2, y2, w1, w2, c, sw=1.6):
    """a tapered limb from (x1, y1) to (x2, y2), round at both ends"""
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L
    a1 = (x1 + nx * w1 / 2, y1 + ny * w1 / 2)
    b1 = (x1 - nx * w1 / 2, y1 - ny * w1 / 2)
    a2 = (x2 + nx * w2 / 2, y2 + ny * w2 / 2)
    b2 = (x2 - nx * w2 / 2, y2 - ny * w2 / 2)
    d = "M%g %g L%g %g A%g %g 0 0 0 %g %g L%g %g A%g %g 0 0 0 %g %g Z" % (
        a1[0], a1[1], a2[0], a2[1], w2 / 2, w2 / 2, b2[0], b2[1], b1[0], b1[1], w1 / 2, w1 / 2, a1[0], a1[1])
    return P(d, c, False, sw)


def bean(cx, cy, rx, ry, rump=1.0, chest=1.0):
    """a body seen from the side: withers a little higher than the back, a round belly"""
    return ("M%g %g C%g %g %g %g %g %g C%g %g %g %g %g %g C%g %g %g %g %g %g C%g %g %g %g %g %g Z" % (
        cx - rx, cy,
        cx - rx, cy - ry * 1.05 * rump, cx - rx * 0.2, cy - ry * 1.02, cx + rx * 0.45, cy - ry,
        cx + rx * 0.95, cy - ry * 0.98 * chest, cx + rx * 1.05, cy - ry * 0.1, cx + rx * 0.85, cy + ry * 0.55,
        cx + rx * 0.6, cy + ry * 1.05, cx - rx * 0.3, cy + ry * 1.08, cx - rx * 0.75, cy + ry * 0.7,
        cx - rx * 1.02, cy + ry * 0.4, cx - rx * 1.0, cy + ry * 0.2, cx - rx, cy))


def clip(shape_d, inner):
    GID[0] += 1
    cid = "c%d" % GID[0]
    return '<defs><clipPath id="%s"><path d="%s"/></clipPath></defs><g clip-path="url(#%s)">%s</g>' % (cid, shape_d, cid, inner)


# ---- the rig -----------------------------------------------------------------

class Rig:
    def __init__(self, name, kind):
        self.name, self.kind, self.parts = name, kind, []

    def add(self, pid, parent, z, pivot, svg):
        self.parts.append({"id": pid, "parent": parent, "z": z, "pivot": pivot, "svg": svg})


def quad(name, c, belly, body, legs, head, neck=None, tail=None, pattern=None, hoof=None, far=0.82, kind="quad", extra=None):
    """a four-legged animal: body, two-piece legs (far ones behind the body), neck, head, tail"""
    r = Rig(name, kind)
    cx, cy, rx, ry = body["cx"], body["cy"], body["rx"], body["ry"]
    bd = bean(cx, cy, rx, ry, body.get("rump", 1), body.get("chest", 1))
    inner = flat("M%g %g Q%g %g %g %g L%g %g Q%g %g %g %g Z" % (cx - rx * 0.7, cy + ry * 0.5, cx, cy + ry * 1.3, cx + rx * 0.75, cy + ry * 0.45,
                                                          cx + rx * 0.75, cy + ry * 1.5, cx, cy + ry * 1.6, cx - rx * 0.7, cy + ry * 1.5), belly, 0.9)
    pat = pattern(cx, cy, rx, ry) if pattern else ""
    svg = P(bd, c) + clip(bd, inner + pat)
    if body.get("rot"):
        svg = '<g transform="rotate(%g %g %g)">%s</g>' % (body["rot"], cx, cy, svg)
    r.add("body", None, 10, (cx, cy), svg)
    for side, dz, f, dx in (("f", -10, far, 7), ("n", 20, 1.0, 0)):
        for end in ("b", "fr"):
            L = legs[end]
            x, top = L["x"] + dx, L["top"]
            t, s = L["thigh"], L["shin"]
            wt, wk, wa = L["w"]
            lc = shade(c, f)
            knee = (x + L.get("kx", 0), top + t)
            foot = (x + L.get("fx", 0), top + t + s)
            r.add("thigh_%s%s" % (end, side), "body", 5 + dz if side == "f" else 15 + dz, (x, top),
                  limb(x, top - wt * 0.2, knee[0], knee[1], wt, wk, lc))
            shin = limb(knee[0], knee[1], foot[0], foot[1], wk, wa, lc)
            if hoof:
                shin += hoof(foot[0], foot[1], wa, f)
            r.add("shin_%s%s" % (end, side), "thigh_%s%s" % (end, side), 4 + dz if side == "f" else 14 + dz, knee, shin)
    parent = "body"
    if neck:
        r.add("neck", "body", 12, neck["pivot"], neck["svg"])
        parent = "neck"
    r.add("head", parent, 13, head["pivot"], head["svg"])
    for e in head.get("extra", []):
        r.add(e[0], "head", e[1], e[2], e[3])
    if tail:
        prev = "body"
        for i, (pv, svg) in enumerate(tail):
            r.add("tail%d" % (i + 1), prev, 9 - i, pv, svg)
            prev = "tail%d" % (i + 1)
    for e in (extra or []):
        r.add(*e)
    return r


def hoof_of(col):
    def h(x, y, w, f):
        return E(x, y - 2, w * 0.62, 4, shade(col, f), 0, 1.2)
    return h


def paw_of(col):
    def h(x, y, w, f):
        return E(x + w * 0.25, y - 2, w * 0.8, w * 0.42, shade(col, f), 0, 1.2)
    return h


# ---- rendering -----------------------------------------------------------------

def render_part(svg, path):
    """renders a part over the rig space with a margin and crops it to what it draws;
    answers its box in rig units (x, y, w, h)"""
    W = 200 + 2 * M
    doc = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%d %d %d %d" width="%d" height="%d">%s</svg>' % (-M, -M, W, W, W * K, W * K, svg)
    with tempfile.TemporaryDirectory() as td:
        s, p = os.path.join(td, "p.svg"), os.path.join(td, "p.png")
        open(s, "w").write(doc)
        subprocess.run(["rsvg-convert", s, "-o", p], check=True)
        geo = subprocess.run(["magick", p, "-format", "%@", "info:"], capture_output=True, text=True, check=True).stdout.strip()
        wh, x, y = geo.split("+")[0], int(geo.split("+")[1]), int(geo.split("+")[2])
        w, h = (int(v) for v in wh.split("x"))
        # one pixel of air round the edges
        x, y, w, h = max(0, x - 1), max(0, y - 1), w + 2, h + 2
        subprocess.run(["magick", p, "-crop", "%dx%d+%d+%d" % (w, h, x, y), "+repage", "-strip",
                        "-define", "png:compression-level=9", path], check=True)
    return (x / K - M, y / K - M, w / K, h / K)


def main(RIGS):
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    data = {}
    for rig in RIGS:
        d = os.path.join(OUT, rig.name)
        os.makedirs(d)
        parts = []
        for p in rig.parts:
            box = render_part(p["svg"], os.path.join(d, p["id"] + ".png"))
            parts.append({"id": p["id"], "parent": p["parent"] or "", "z": p["z"],
                          "x": round(box[0], 2), "y": round(box[1], 2), "w": round(box[2], 2), "h": round(box[3], 2),
                          "px": p["pivot"][0], "py": p["pivot"][1]})
        parts.sort(key=lambda q: q["z"])
        data[rig.name] = {"kind": rig.kind, "parts": parts}
        # the rest pose in one picture, for the chips and cards
        args = ["magick", "-size", "%dx%d" % (int((200 + 2 * M) * K), int((200 + 2 * M) * K)), "xc:none"]
        for q in parts:
            args += [os.path.join(d, q["id"] + ".png"), "-geometry", "+%d+%d" % (round((q["x"] + M) * K), round((q["y"] + M) * K)), "-composite"]
        args += ["-trim", "+repage", "-resize", "150x150", "-gravity", "center", "-background", "none", "-extent", "160x160", "-strip", os.path.join(OUT, rig.name + ".png")]
        subprocess.run(args, check=True)
        print("%-12s %2d parts" % (rig.name, len(parts)))
    lib = os.path.join(GAME, "lib")
    os.makedirs(lib, exist_ok=True)
    with open(os.path.join(lib, "rigs.ts"), "w") as f:
        f.write("// Made by tools/korkeasaari/rig_animals.py: every animal's parts in draw order, each with its box in\n"
                "// rig space (x, y, w, h), its pivot (px, py) and its parent.\n")
        f.write("export const RIGS: any = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")


