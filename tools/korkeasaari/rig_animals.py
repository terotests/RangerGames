#!/usr/bin/env python3
# The Korkeasaari animals as rigged drawings, made the same way as the Kolmården
# animals (rigkit.py): every animal is parts (body, two-piece legs, neck, head,
# tail, wings …), each its own PNG with a pivot and a parent, drawn in one
# 200 x 200 rig space in the rest pose (feet on y = 190, facing right).
# Our own drawings. The goat, tiger and bear are the Kolmården ones.
#   python3 tools/korkeasaari/rig_animals.py   → games/korkeasaari/rig/<animal>/<part>.png, lib/rigs.ts
from rigkit import *

RIGS = []

# goat ------------------------------------------------------------------------

GO = "#e9e3d6"
RIGS.append(quad(
    "vuohi", GO, "#f6f2ea", dict(cx=90, cy=112, rx=42, ry=22),
    dict(b=dict(x=64, top=118, thigh=30, shin=42, w=(13, 8, 6), kx=-3), fr=dict(x=112, top=118, thigh=30, shin=42, w=(12, 8, 6), kx=2)),
    dict(pivot=(138, 80), svg=(
        P("M132 74 C138 66 150 68 156 76 L166 92 C168 100 160 104 154 100 L138 88 C132 84 130 78 132 74 Z", GO)
        + P("M140 72 C134 56 124 50 116 54 C124 56 130 62 134 74 Z", "#8c7c66", True, 1.2)
        + P("M146 70 C142 54 132 46 124 48 C132 52 138 60 140 72 Z", "#9c8c74", True, 1.2)
        + E(134, 80, 9, 3.5, shade(GO, 0.9), 20, 1.2)
        + P("M156 100 C158 108 156 114 152 116 C150 110 150 104 152 100 Z", "#d8d0c0", True, 1)
        + eye(148, 78, 2.6, "#c8a040") + '<circle cx="164" cy="94" r="1.2" fill="#333"/>')),
    neck=dict(pivot=(118, 106), svg=P("M110 108 L132 78 C138 72 146 76 144 84 L128 112 Z", GO, False)),
    tail=[((48, 102), P("M48 102 C42 96 40 90 44 88 C48 92 50 96 50 100 Z", GO, True, 1))],
    hoof=hoof_of("#4a3c30")))

def tiger_stripes(cx, cy, rx, ry):
    return ''.join('<path d="M%g %g q-6 %g 2 %g l4 0 q-6 %g 0 %g Z" fill="#1e140c"/>' % (
        cx - rx * 0.85 + i * rx * 0.24, cy - ry * 1.1, ry * 0.6, ry * 1.2, -ry * 0.5, -ry * 1.2) for i in range(8))


TI = "#e8842a"
RIGS.append(quad(
    "tiikeri", TI, "#fbefe0", dict(cx=92, cy=116, rx=52, ry=24),
    dict(b=dict(x=62, top=122, thigh=32, shin=38, w=(20, 12, 11), kx=-4), fr=dict(x=120, top=122, thigh=32, shin=38, w=(18, 12, 11), kx=2)),
    dict(pivot=(146, 102), svg=(
        P("M138 88 C144 76 168 74 176 86 C182 94 184 106 178 114 C170 122 152 122 144 116 C136 108 134 96 138 88 Z", TI)
        + flat("M152 104 C156 116 172 120 180 110 C178 106 170 102 160 102 Z", "#fbefe0")
        + E(144, 82, 6, 6, TI, 0, 1.2) + E(166, 78, 6, 6, TI, 0, 1.2)
        + '<path d="M150 84 l4 6 M158 80 l0 7 M166 84 l-4 6" stroke="#1e140c" stroke-width="2" stroke-linecap="round"/>'
        + eye(160, 94, 2.8, "#c8a020") + eye(172, 94, 2.4, "#c8a020")
        + '<path d="M174 104 l5 0 l-2.5 3 Z" fill="#c8606c"/><path d="M170 110 q4 3 8 0" stroke="#3a2410" stroke-width="1" fill="none"/>')),
    neck=dict(pivot=(128, 108), svg=P("M120 108 C124 94 142 88 152 96 L150 116 C140 120 126 120 120 108 Z", TI, False)),
    tail=[((42, 106), limb(42, 106, 22, 132, 6, 5, TI, 1.2)),
          ((22, 132), limb(22, 132, 10, 108, 5, 4, TI, 1.2) + E(10, 106, 3, 4, "#1e140c", 0, 1))],
    pattern=tiger_stripes, hoof=paw_of(TI)))

# bear ------------------------------------------------------------------------

BR = "#7a4a2a"
RIGS.append(quad(
    "karhu", BR, "#8a5a38", dict(cx=90, cy=114, rx=56, ry=34, chest=1.15),
    dict(b=dict(x=58, top=132, thigh=28, shin=32, w=(28, 22, 21)), fr=dict(x=120, top=132, thigh=28, shin=32, w=(26, 22, 21))),
    dict(pivot=(138, 108), svg=(
        P("M132 94 C138 80 166 78 174 92 C180 102 180 116 172 124 C162 130 144 128 136 120 C130 112 128 102 132 94 Z", BR)
        + E(140, 84, 8, 8, BR, 0, 1.2) + E(166, 82, 8, 8, BR, 0, 1.2)
        + '<circle cx="140" cy="84" r="4" fill="#4a2a14"/><circle cx="166" cy="82" r="4" fill="#4a2a14"/>'
        + P("M160 106 C166 100 182 102 184 110 C184 118 172 122 164 118 Z", "#b58a64", True, 1.2)
        + E(181, 106, 3.5, 2.6, "#1a100a", 0, 1) + eye(156, 98, 2.6)
        + '<path d="M170 116 q5 3 10 0" stroke="#3a2410" stroke-width="1.2" fill="none"/>')),
    tail=[((34, 104), E(34, 104, 5, 5, shade(BR, 0.9), 0, 1))],
    hoof=paw_of(BR)))


# ---- cats --------------------------------------------------------------------


def rosettes(col, ring=True, n=14):
    def f(cx, cy, rx, ry):
        s = ""
        for i in range(n):
            x = cx - rx * 0.9 + (i * 37 % 100) / 100 * rx * 1.8
            y = cy - ry * 0.9 + (i * 61 % 100) / 100 * ry * 1.5
            if ring:
                s += '<circle cx="%g" cy="%g" r="4" fill="none" stroke="%s" stroke-width="2.2" stroke-dasharray="5 2"/>' % (x, y, col)
            else:
                s += '<circle cx="%g" cy="%g" r="2.4" fill="%s"/>' % (x, y, col)
        return s
    return f


def cat(name, c, belly, pattern, ears="round", mane=None, tail="long", spot=None, legs=1.0, size=1.0, eyec="#c8a020", tufts=False, ruff=False):
    s = size
    body = dict(cx=92, cy=118 + (1 - s) * 30, rx=50 * s, ry=23 * s)
    by = body["cy"]
    top = by + 6
    th, sh = 30 * legs * s + (1 - s) * 10, 36 * legs * s + (1 - s) * 14
    # the legs must reach the ground (y = 190)
    k = (190 - top) / (th + sh)
    th, sh = th * k, sh * k
    hx, hy = 92 + 50 * s + 4, by - 16 * s
    def hp(d):  # move a head path drawn round (158, 98) to the head's place
        return '<g transform="translate(%g %g) scale(%g)">%s</g>' % (hx - 158 * s, hy - 98 * s, s, d)
    head = ""
    if mane:
        head += E(152, 100, 28, 30, mane, -10, 1.4) + E(146, 100, 22, 26, shade(mane, 0.85), -10, 0)
    if ears == "round":
        head += E(144, 82, 6, 6, c, 0, 1.2) + E(166, 78, 6, 6, c, 0, 1.2) + E(144, 82, 3, 3, shade(c, 0.6), 0, 0)
    elif ears == "point":
        head += P("M138 88 L140 70 L152 82 Z", c, True, 1.2) + P("M158 80 L166 64 L172 82 Z", c, True, 1.2)
        if tufts:
            head += '<path d="M140 70 l-1 -10 M166 64 l1 -11" stroke="#1e140c" stroke-width="2.2" stroke-linecap="round"/>'
    elif ears == "flat":
        head += E(140, 88, 7, 4, c, -30, 1.2) + E(172, 84, 7, 4, c, 20, 1.2)
    head += P("M138 88 C144 76 168 74 176 86 C182 94 184 106 178 114 C170 122 152 122 144 116 C136 108 134 96 138 88 Z", c)
    if ruff:
        head += P("M142 112 L136 124 L146 118 L148 128 L154 118 L158 126 L160 116 Z", shade(c, 1.15), True, 1)
    head += flat("M152 104 C156 116 172 120 180 110 C178 106 170 102 160 102 Z", belly)
    if spot:
        head += ''.join('<circle cx="%g" cy="%g" r="1.6" fill="%s"/>' % (x, y, spot) for x, y in [(150, 86), (156, 84), (162, 86), (148, 92), (168, 88)])
    head += (eye(160, 94, 2.8, eyec) + eye(172, 94, 2.4, eyec)
             + '<path d="M174 104 l5 0 l-2.5 3 Z" fill="#c8606c"/><path d="M170 110 q4 3 8 0" stroke="#3a2410" stroke-width="1" fill="none"/>'
             + '<path d="M176 108 l12 -2 M176 110 l12 2" stroke="#ffffff" stroke-width="0.6" opacity="0.8"/>')
    tl = []
    tx, ty = 92 - 50 * s + 8, by - 10 * s
    if tail == "long":
        tl = [((tx, ty), limb(tx, ty, tx - 22, ty + 26, 7 * s, 6 * s, c, 1.2)),
              ((tx - 22, ty + 26), limb(tx - 22, ty + 26, tx - 34, ty + 4, 6 * s, 5.5 * s, c, 1.2) + E(tx - 34, ty + 2, 3.5 * s, 4.5 * s, shade(c, 0.4), 0, 1))]
    elif tail == "thick":  # snow leopard: a long, thick tail
        tl = [((tx, ty), limb(tx, ty, tx - 26, ty + 30, 11, 10, c, 1.2) + (pattern(tx - 13, ty + 15, 6, 6) if pattern else "")),
              ((tx - 26, ty + 30), limb(tx - 26, ty + 30, tx - 40, ty + 2, 10, 9, c, 1.2) + E(tx - 40, ty, 5, 5, shade(c, 0.5), 0, 1))]
    elif tail == "ringed":
        tl = [((tx, ty), limb(tx, ty, tx - 22, ty + 18, 10, 10, c, 1.2)
               + '<path d="M%g %g l6 -6 M%g %g l6 -6" stroke="%s" stroke-width="2.4"/>' % (tx - 12, ty + 14, tx - 18, ty + 19, shade(c, 0.5))),
              ((tx - 22, ty + 18), limb(tx - 22, ty + 18, tx - 30, ty + 4, 10, 9, c, 1.2) + E(tx - 30, ty + 3, 5, 5, shade(c, 0.4), 0, 1))]
    elif tail == "bob":
        tl = [((tx, ty), E(tx - 4, ty + 2, 6, 4, c, -30, 1.2) + E(tx - 8, ty + 1, 2.5, 2.5, "#1e140c", 0, 0))]
    elif tail == "tuft":
        tl = [((tx, ty), limb(tx, ty, tx - 24, ty + 30, 4, 3, c, 1.2)),
              ((tx - 24, ty + 30), limb(tx - 24, ty + 30, tx - 32, ty + 10, 3, 3, c, 1.2) + E(tx - 33, ty + 8, 5, 6, mane or "#5a3a1a", 0, 1))]
    return quad(name, c, belly, body,
                dict(b=dict(x=92 - 30 * s, top=top, thigh=th, shin=sh, w=(20 * s, 12 * s, 11 * s), kx=-4), fr=dict(x=92 + 28 * s, top=top, thigh=th, shin=sh, w=(18 * s, 12 * s, 11 * s), kx=2)),
                dict(pivot=(hx - 12 * s, hy + 4 * s), svg=hp(head)),
                neck=dict(pivot=(92 + 36 * s, by - 8 * s), svg=P("M%g %g C%g %g %g %g %g %g L%g %g C%g %g %g %g %g %g Z" % (
                    92 + 28 * s, by - 6 * s, 92 + 32 * s, by - 20 * s, 92 + 50 * s, by - 26 * s, 92 + 60 * s, by - 18 * s,
                    92 + 58 * s, by + 2 * s, 92 + 48 * s, by + 6 * s, 92 + 34 * s, by + 6 * s, 92 + 28 * s, by - 6 * s), c, False)),
                tail=tl, pattern=pattern, hoof=paw_of(c))


SL = "#dcd9d0"
RIGS.append(cat("lumileopardi", SL, "#f7f5ef", rosettes("#5a5a5e"), ears="round", tail="thick", spot="#5a5a5e", eyec="#9ab0a0", size=0.95))
RIGS.append(cat("amurinleopardi", "#e2a24a", "#fbf0dc", rosettes("#3a2410"), ears="round", tail="long", spot="#3a2410", size=0.92))
RIGS.append(cat("leijona", "#d9a85e", "#f6e6c4", None, ears="round", mane="#9a5a24", tail="tuft"))
RIGS.append(cat("ilves", "#c9a074", "#f4e8d4", rosettes("#6a4a2a", ring=False), ears="point", tufts=True, ruff=True, tail="bob", spot="#6a4a2a", legs=1.15, size=0.8))
RIGS.append(cat("manuli", "#a8a096", "#e8e2da", lambda cx, cy, rx, ry: ''.join('<path d="M%g %g q-3 8 0 16" stroke="#6a625a" stroke-width="2" fill="none"/>' % (cx - rx * 0.6 + i * 9, cy - ry * 0.9) for i in range(4)),
                ears="flat", tail="ringed", spot="#5a524a", legs=0.8, size=0.68, eyec="#d8c040", ruff=True))

# ---- the bear's small cousins and the dog family -------------------------------


def small_quad(name, c, belly, size, legs, head, tail, pattern=None, low=0.0):
    s = size
    by = 190 - (30 + 34 * legs) * s - 4 - low
    body = dict(cx=92, cy=by, rx=52 * s, ry=22 * s)
    top = by + 6 * s
    L = 190 - top
    return quad(name, c, belly, body,
                dict(b=dict(x=92 - 32 * s, top=top, thigh=L * 0.48, shin=L * 0.52, w=(18 * s, 12 * s, 11 * s), kx=-3),
                     fr=dict(x=92 + 30 * s, top=top, thigh=L * 0.48, shin=L * 0.52, w=(16 * s, 11 * s, 10 * s), kx=2)),
                head(92 + 52 * s, by - 10 * s, s), tail=tail(92 - 52 * s + 6, by - 6 * s, s), pattern=pattern, hoof=paw_of(c))


def tr_head(hx, hy, s, inner, pivot_dx=-14):
    return dict(pivot=(hx + pivot_dx * s, hy + 6 * s), svg='<g transform="translate(%g %g) scale(%g)">%s</g>' % (hx, hy, s, inner))


# a head drawn round (0, 0) at the front of the body, facing right
AH = "#4a3424"
RIGS.append(small_quad(
    "ahma", AH, "#5a4230", 0.95, 0.75,
    lambda hx, hy, s: tr_head(hx, hy, s,
        E(-4, -14, 7, 6, AH, 0, 1.2) + P("M-12 -6 C-8 -20 16 -22 24 -10 C30 -2 30 8 22 14 C10 20 -6 16 -12 6 Z", AH)
        + P("M-6 -14 C2 -20 14 -20 20 -14 C12 -12 2 -12 -6 -14 Z", "#a07850", True, 0.8)
        + P("M14 2 C20 -2 30 0 32 4 C32 10 24 12 18 10 Z", "#6a5040", True, 1) + E(30, 3, 2.8, 2.2, "#111", 0, 1) + eye(10, -4, 2.4)),
    lambda tx, ty, s: [((tx, ty), P("M%g %g C%g %g %g %g %g %g C%g %g %g %g %g %g Z" % (tx, ty, tx - 14, ty, tx - 26, ty + 10, tx - 30, ty + 22,
                                                                               tx - 20, ty + 24, tx - 8, ty + 14, tx, ty + 8), AH, True, 1.2))],
    pattern=lambda cx, cy, rx, ry: flat("M%g %g Q%g %g %g %g L%g %g Q%g %g %g %g Z" % (cx - rx * 0.9, cy - ry * 0.1, cx, cy - ry * 0.7, cx + rx * 0.7, cy - ry * 0.2,
                                                                                       cx + rx * 0.7, cy + ry * 0.15, cx, cy - ry * 0.25, cx - rx * 0.9, cy + ry * 0.3), "#c09a62", 0.95)))

OT = "#6b4a30"
RIGS.append(small_quad(
    "saukko", OT, "#c8a888", 0.9, 0.45,
    lambda hx, hy, s: tr_head(hx, hy, s,
        E(-2, -10, 4, 4, OT, 0, 1) + P("M-10 -4 C-6 -16 14 -18 22 -8 C28 0 26 8 18 12 C6 16 -6 12 -10 4 Z", OT)
        + P("M10 0 C16 -4 28 -2 28 4 C28 10 20 12 12 10 Z", "#d8c0a0", True, 1) + E(27, 0, 2.6, 2, "#111", 0, 1) + eye(8, -6, 2.4)
        + '<path d="M22 6 l10 -2 M22 8 l10 2" stroke="#ffffff" stroke-width="0.6"/>'),
    lambda tx, ty, s: [((tx, ty), limb(tx, ty, tx - 26, ty + 14, 12, 8, OT, 1.2)),
                       ((tx - 26, ty + 14), limb(tx - 26, ty + 14, tx - 50, ty + 26, 8, 3, OT, 1.2))], low=-4))

RP = "#c4502a"
RIGS.append(small_quad(
    "pikkupanda", RP, "#3a2018", 0.85, 0.7,
    lambda hx, hy, s: tr_head(hx, hy, s,
        E(-6, -18, 7, 7, "#ffffff", 0, 1.2) + E(14, -20, 7, 7, "#ffffff", 0, 1.2) + E(-6, -18, 4, 4, RP, 0, 0) + E(14, -20, 4, 4, RP, 0, 0)
        + P("M-12 -4 C-10 -22 20 -26 28 -10 C32 -2 30 8 22 12 C10 18 -8 14 -12 4 Z", RP)
        + E(2, -2, 7, 5, "#fff8ee", -10, 0) + E(18, -6, 6, 5, "#fff8ee", 10, 0) + E(26, 2, 6, 5, "#fff8ee", 0, 0)
        + '<path d="M2 -6 q4 10 -2 16" stroke="#8a2a14" stroke-width="3" fill="none" opacity="0.7"/>'
        + eye(6, -8, 2.4) + eye(18, -9, 2.2) + E(30, 2, 2.6, 2, "#111", 0, 1)),
    lambda tx, ty, s: [((tx, ty), limb(tx, ty, tx - 20, ty + 22, 14, 13, RP, 1.2)
                        + '<path d="M%g %g l11 -8 M%g %g l11 -8" stroke="#e8b080" stroke-width="3"/>' % (tx - 14, ty + 14, tx - 22, ty + 22)),
                       ((tx - 20, ty + 22), limb(tx - 20, ty + 22, tx - 30, ty + 46, 13, 11, RP, 1.2)
                        + '<path d="M%g %g l12 -4 M%g %g l12 -2" stroke="#e8b080" stroke-width="3"/>' % (tx - 30, ty + 30, tx - 33, ty + 40))],
    pattern=lambda cx, cy, rx, ry: flat("M%g %g L%g %g L%g %g L%g %g Z" % (cx - rx, cy + ry * 0.5, cx + rx, cy + ry * 0.5, cx + rx, cy + ry * 2, cx - rx, cy + ry * 2), "#2a1810", 1)))

FX = "#e8c88c"
RIGS.append(small_quad(
    "aavikkokettu", FX, "#fbf2de", 0.7, 0.9,
    lambda hx, hy, s: tr_head(hx, hy, s,
        P("M-8 -10 L-14 -46 L8 -16 Z", FX, True, 1.2) + flat("M-8 -14 L-12 -40 L3 -18 Z", "#f4c0b0", 0.9)
        + P("M4 -12 L10 -46 L20 -12 Z", shade(FX, 0.95), True, 1.2) + flat("M7 -14 L10 -40 L16 -14 Z", "#f4c0b0", 0.9)
        + P("M-10 -4 C-6 -16 12 -16 18 -8 L34 2 C36 6 32 8 26 8 L10 10 C-2 10 -10 4 -10 -4 Z", FX)
        + E(34, 3, 2.6, 2, "#111", 0, 1) + eye(8, -4, 2.6, "#4a2a10")),
    lambda tx, ty, s: [((tx, ty), P("M%g %g C%g %g %g %g %g %g C%g %g %g %g %g %g Z" % (tx, ty, tx - 14, ty + 4, tx - 26, ty + 18, tx - 30, ty + 34,
                                                                               tx - 20, ty + 36, tx - 8, ty + 22, tx + 2, ty + 8), FX, True, 1.2)
                        + E(tx - 28, ty + 34, 4, 4, "#3a2a1a", 0, 0))]))

# ---- hoofed animals ------------------------------------------------------------


def hoofed(name, c, belly, size, legs, head, neck=None, tail=None, pattern=None, hoof="#3a2a1c", chest=1.0, rump=1.0, extra_body=""):
    s = size
    by = 190 - (32 + 40 * legs) * s
    body = dict(cx=92, cy=by, rx=48 * s, ry=24 * s, chest=chest, rump=rump)
    top = by + 8 * s
    L = 190 - top
    q = quad(name, c, belly, body,
             dict(b=dict(x=92 - 28 * s, top=top, thigh=L * 0.45, shin=L * 0.55, w=(16 * s, 9 * s, 7 * s), kx=-3),
                  fr=dict(x=92 + 26 * s, top=top, thigh=L * 0.45, shin=L * 0.55, w=(15 * s, 9 * s, 7 * s), kx=2)),
             head(92 + 48 * s, by - 18 * s, s, by), neck=neck(by, s) if neck else None,
             tail=tail(92 - 48 * s + 4, by - 8 * s, s) if tail else None, pattern=pattern, hoof=hoof_of(hoof))
    if extra_body:
        q.parts[0]["svg"] = extra_body(by, s) + q.parts[0]["svg"]
    return q


def std_neck(c, mane=None):
    def f(by, s):
        x0 = 92 + 30 * s
        d = "M%g %g L%g %g C%g %g %g %g %g %g L%g %g Z" % (x0 - 8 * s, by, x0 + 12 * s, by - 34 * s, x0 + 16 * s, by - 40 * s,
                                                      x0 + 28 * s, by - 38 * s, x0 + 26 * s, by - 30 * s, x0 + 10 * s, by + 6 * s)
        svg = P(d, c, False)
        if mane:
            svg += flat("M%g %g L%g %g L%g %g L%g %g Z" % (x0 - 8 * s, by - 2 * s, x0 + 12 * s, by - 36 * s, x0 + 8 * s, by - 40 * s, x0 - 12 * s, by - 6 * s), mane, 1)
        return dict(pivot=(x0, by), svg=svg)
    return f


def horse_head(c, muzzle, ears=True, extra=""):
    def f(hx, hy, s, by):
        hx, hy = hx - 4 * s, hy - 18 * s
        inner = (P("M-6 -8 C0 -16 12 -14 18 -6 L30 12 C34 20 26 24 20 20 L4 8 C-4 2 -10 -2 -6 -8 Z", c)
                 + flat("M20 20 C26 24 34 20 30 12 L26 8 C22 12 18 16 20 20 Z", muzzle)
                 + (P("M-4 -10 l0 -12 l7 9 Z", c, True, 1.1) if ears else "")
                 + eye(8, -4, 2.4) + '<circle cx="28" cy="16" r="1.2" fill="#222"/>' + extra)
        return dict(pivot=(hx - 2 * s, hy + 4 * s), svg='<g transform="translate(%g %g) scale(%g)">%s</g>' % (hx, hy, s, inner))
    return f


def thin_tail(c, tip):
    return lambda tx, ty, s: [((tx, ty), limb(tx, ty, tx - 8 * s, ty + 34 * s, 3, 2, c, 1) + E(tx - 9 * s, ty + 40 * s, 4, 7, tip, 10, 1))]


def antlers():
    a = '<path d="M-2 -10 C-8 -24 -4 -36 -12 -46 M-6 -26 L-18 -30 M-8 -36 L-20 -42 M-6 -20 l8 -8 M6 -10 C6 -26 14 -36 10 -48 M10 -30 L22 -36 M10 -40 L20 -48" stroke="#d8c8a0" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
    return a


RD = "#8a6a4c"
RIGS.append(hoofed("metsapeura", RD, "#e2d6c2", 0.95, 0.95,
                   horse_head(RD, "#3a2a1a", extra=antlers() + E(-4, -8, 6, 2.6, RD, -30, 1)),
                   neck=std_neck("#d8cbb4"), tail=lambda tx, ty, s: [((tx, ty), E(tx - 2, ty + 2, 4, 6, "#f4f0e6", 20, 1))]))

MO = "#4a3626"
RIGS.append(hoofed("myskiharka", MO, "#3a2a1e", 1.0, 0.6,
                   lambda hx, hy, s, by: dict(pivot=(hx - 6, hy + 10), svg=(
                       P("M%g %g C%g %g %g %g %g %g C%g %g %g %g %g %g C%g %g %g %g %g %g Z" % (hx - 10, hy, hx - 4, hy - 16, hx + 20, hy - 16, hx + 28, hy - 2,
                                                                                        hx + 34, hy + 10, hx + 30, hy + 30, hx + 20, hy + 34, hx + 6, hy + 34, hx - 10, hy + 20, hx - 10, hy), MO)
                       + P("M%g %g C%g %g %g %g %g %g C%g %g %g %g %g %g Z" % (hx - 6, hy - 6, hx + 4, hy - 16, hx + 20, hy - 14, hx + 18, hy - 4,
                                                                         hx + 10, hy - 8, hx + 2, hy - 2, hx + 4, hy + 14), "#d8c8a8", True, 1.2)
                       + E(hx + 26, hy + 18, 6, 5, "#c8b8a0", 0, 1) + eye(hx + 12, hy + 6, 2.2))),
                   tail=None, chest=1.15, rump=1.0,
                   pattern=lambda cx, cy, rx, ry: (flat("M%g %g Q%g %g %g %g L%g %g Q%g %g %g %g Z" % (cx - rx * 0.2, cy - ry * 0.9, cx + rx * 0.2, cy - ry * 1.3, cx + rx * 0.6, cy - ry * 0.9,
                                                                                                     cx + rx * 0.5, cy - ry * 0.5, cx + rx * 0.2, cy - ry * 0.8, cx - rx * 0.2, cy - ry * 0.5), "#a08a6a", 0.9)
                                                   + ''.join('<path d="M%g %g q-2 14 1 30" stroke="#2e2016" stroke-width="2" fill="none"/>' % (cx - rx + i * 8, cy - ry * 0.3) for i in range(13))),
                   extra_body=lambda by, s: P("M%g %g L%g %g Q%g %g %g %g L%g %g Z" % (40, by, 144, by, 150, by + 48, 140, by + 46, 44, by + 46), MO, True, 1.2)
                   + ''.join('<path d="M%g %g l-1 12" stroke="#2e2016" stroke-width="2"/>' % (46 + i * 7, by + 34) for i in range(14))))

TK = "#c09040"
RIGS.append(hoofed("takini", TK, "#e0c088", 1.0, 0.75,
                   lambda hx, hy, s, by: dict(pivot=(hx - 6, hy + 8), svg=(
                       P("M%g %g C%g %g %g %g %g %g C%g %g %g %g %g %g C%g %g %g %g %g %g Z" % (hx - 10, hy, hx - 2, hy - 14, hx + 22, hy - 12, hx + 32, hy + 4,
                                                                                        hx + 38, hy + 16, hx + 32, hy + 28, hx + 22, hy + 28, hx + 6, hy + 28, hx - 10, hy + 16, hx - 10, hy), TK)
                       + '<path d="M%g %g C%g %g %g %g %g %g" stroke="#2a2018" stroke-width="4" fill="none" stroke-linecap="round"/>' % (hx + 2, hy - 6, hx - 8, hy - 16, hx + 2, hy - 24, hx + 10, hy - 18)
                       + E(hx + 30, hy + 18, 8, 9, "#3a2a1a", 0, 1) + eye(hx + 12, hy + 4, 2.4)
                       + E(hx - 6, hy + 2, 7, 3, TK, 20, 1))),
                   neck=lambda by, s: dict(pivot=(122, by), svg=P("M110 %g C114 %g 130 %g 140 %g L144 %g C134 %g 120 %g 110 %g Z" % (by, by - 24, by - 30, by - 22, by + 4, by + 10, by + 8, by), TK, False)),
                   tail=thin_tail(TK, "#3a2a1a"), chest=1.12))

BI = "#5a3a22"
RIGS.append(hoofed("visentti", BI, "#6a4a2e", 1.05, 0.62,
                   lambda hx, hy, s, by: dict(pivot=(hx - 4, hy + 10), svg=(
                       P("M%g %g C%g %g %g %g %g %g C%g %g %g %g %g %g C%g %g %g %g %g %g Z" % (hx - 12, hy, hx - 6, hy - 16, hx + 16, hy - 18, hx + 24, hy - 4,
                                                                                        hx + 32, hy + 8, hx + 30, hy + 26, hx + 20, hy + 30, hx + 6, hy + 32, hx - 12, hy + 18, hx - 12, hy), "#3e2816")
                       + P("M%g %g C%g %g %g %g %g %g Z" % (hx + 6, hy + 28, hx + 4, hy + 44, hx + 16, hy + 46, hx + 20, hy + 28), "#2e1e10", True, 1)
                       + '<path d="M%g %g q-6 -8 2 -14" stroke="#e8e0c8" stroke-width="3" fill="none" stroke-linecap="round"/>' % (hx + 2, hy - 8)
                       + E(hx + 28, hy + 18, 4, 4, "#2a1a10", 0, 1) + eye(hx + 14, hy + 4, 2.3))),
                   tail=thin_tail(BI, "#2a1a10"), chest=1.35, rump=0.85,
                   pattern=lambda cx, cy, rx, ry: flat("M%g %g Q%g %g %g %g L%g %g Z" % (cx + rx * 0.1, cy - ry * 1.4, cx + rx * 0.8, cy - ry * 1.4, cx + rx * 1.2, cy + ry, cx + rx * 0.2, cy + ry), "#3e2816", 0.9)))

CM = "#c9a26a"
RIGS.append(hoofed("kameli", CM, "#e0c494", 1.0, 1.05,
                   horse_head(CM, "#a8844e", ears=True),
                   neck=lambda by, s: dict(pivot=(128, by - 4), svg=P("M118 %g C130 %g 134 %g 146 %g C154 %g 160 %g 156 %g C150 %g 146 %g 138 %g Z" % (
                       by - 4, by + 10, by - 20, by - 34, by - 44, by - 44, by - 36, by - 30, by - 16, by + 4), CM, False)),
                   tail=thin_tail(CM, "#6a4a2a"),
                   extra_body=lambda by, s: E(72, by - 22, 16, 14, CM, 0, 1.4) + E(110, by - 22, 16, 14, CM, 0, 1.4)))

HO = "#c8a066"
RIGS.append(hoofed("villihevonen", HO, "#efe0c4", 1.0, 0.95,
                   horse_head(HO, "#3a2a1a"), neck=std_neck(HO, mane="#3a2a1a"),
                   tail=lambda tx, ty, s: [((tx, ty), P("M%g %g C%g %g %g %g %g %g C%g %g %g %g %g %g Z" % (tx, ty, tx - 10, ty + 10, tx - 14, ty + 30, tx - 10, ty + 50,
                                                                                               tx - 4, ty + 40, tx - 2, ty + 24, tx + 4, ty + 6), "#3a2a1a", True, 1))],
                   pattern=lambda cx, cy, rx, ry: '<path d="M%g %g L%g %g" stroke="#3a2a1a" stroke-width="2.5" opacity="0.8"/>' % (cx - rx, cy - ry * 0.95, cx + rx * 0.8, cy - ry * 0.95),
                   hoof="#2a1a10"))

MH = "#b0a088"
RIGS.append(hoofed("markhor", MH, "#e8e0d0", 0.9, 0.95,
                   lambda hx, hy, s, by: dict(pivot=(hx - 4, hy + 8), svg=(
                       '<path d="M%g %g c-4 -8 6 -12 2 -20 c-4 -8 6 -12 2 -20 c-4 -8 6 -12 2 -20" stroke="#5a4a38" stroke-width="5" fill="none" stroke-linecap="round"/>' % (hx + 2, hy - 2)
                       + '<path d="M%g %g c-4 -8 6 -12 2 -20 c-4 -8 6 -12 2 -20 c-4 -8 6 -12 2 -20" stroke="#7a6a52" stroke-width="4" fill="none" stroke-linecap="round"/>' % (hx + 10, hy - 2)
                       + P("M%g %g C%g %g %g %g %g %g L%g %g C%g %g %g %g %g %g Z" % (hx - 6, hy, hx, hy - 10, hx + 14, hy - 8, hx + 18, hy, hx + 30, hy + 16, hx + 28, hy + 24, hx + 18, hy + 22, hx - 6, hy), MH)
                       + P("M%g %g C%g %g %g %g %g %g Z" % (hx + 4, hy + 10, hx - 4, hy + 30, hx + 6, hy + 40, hx + 16, hy + 20), "#f0ebe0", True, 1)
                       + E(hx - 4, hy + 2, 7, 3, MH, 20, 1) + eye(hx + 10, hy + 2, 2.3, "#c8a040"))),
                   neck=std_neck(MH), tail=lambda tx, ty, s: [((tx, ty), P("M%g %g C%g %g %g %g %g %g Z" % (tx, ty, tx - 6, ty - 6, tx - 8, ty - 10, tx - 4, ty - 12), "#5a4a38", True, 1))]))

# ---- the rest --------------------------------------------------------------------

# snowy owl: body, head, a wing (flaps) and feet; stands on y = 190
r = Rig("tunturipollo", "bird")
OW = "#f6f6f2"
specks = ''.join('<path d="M%g %g q3 2 6 0" stroke="#3a3a3a" stroke-width="1.6" fill="none"/>' % (80 + (i * 29 % 50), 120 + (i * 17 % 50)) for i in range(14))
r.add("body", None, 10, (100, 150), E(100, 146, 32, 42, OW) + specks + E(96, 186, 5, 4, "#2a2a2a", 0, 0) + E(108, 186, 5, 4, "#2a2a2a", 0, 0))
r.add("head", "body", 14, (104, 108), E(106, 92, 26, 22, OW) + eye(98, 90, 4.6, "#f0c020") + eye(116, 90, 4.6, "#f0c020")
      + P("M105 96 L110 96 L107 104 Z", "#3a3a3a", True, 0.8) + ''.join('<circle cx="%g" cy="%g" r="1.2" fill="#3a3a3a"/>' % p for p in [(92, 76), (102, 74), (114, 76)]))
r.add("wing_r", "body", 12, (92, 120), P("M90 116 C70 124 66 160 78 184 C86 176 96 150 100 124 Z", shade(OW, 0.96), True, 1.4)
      + ''.join('<path d="M%g %g q4 2 8 0" stroke="#3a3a3a" stroke-width="1.6" fill="none"/>' % p for p in [(80, 140), (78, 156), (82, 170)]))
RIGS.append(r)

# red-necked wallaby: sits on its big feet, hops
r = Rig("kenguru", "hop")
WA = "#9a8a7a"
r.add("tail1", "body", 6, (76, 160), limb(76, 160, 30, 186, 14, 7, shade(WA, 0.9), 1.4))
r.add("body", None, 10, (92, 140), P("M70 170 C60 140 70 104 96 96 C116 92 122 120 116 150 C112 172 96 182 80 180 Z", WA)
      + flat("M100 110 C112 120 112 160 100 176 C108 170 116 150 114 130 Z", "#e8dccc", 0.95)
      + flat("M90 98 C100 92 112 96 116 104 C108 104 98 104 90 98 Z", "#b0603a", 0.7))
r.add("thigh_bf", "body", 7, (80, 162), E(84, 168, 20, 13, shade(WA, 0.85), -10) + E(100, 186, 22, 5, shade(WA, 0.75), 0, 1.2))
r.add("thigh_bn", "body", 12, (78, 164), E(82, 170, 20, 13, WA, -10) + E(98, 187, 22, 5, shade(WA, 0.85), 0, 1.2))
r.add("thigh_frn", "body", 13, (110, 126), limb(110, 124, 122, 142, 6, 5, WA))
r.add("head", "body", 14, (104, 96), P("M96 88 C100 72 122 70 134 80 C140 86 140 92 132 94 C120 98 104 100 96 88 Z", WA)
      + E(102, 66, 5, 14, shade(WA, 0.9), -10) + E(102, 68, 2.4, 10, "#e8c0b0", -10, 0)
      + E(112, 66, 5, 14, WA, 10) + E(112, 68, 2.4, 10, "#e8c0b0", 10, 0)
      + eye(116, 82, 2.8) + E(136, 86, 2.4, 2, "#111", 0, 1))
RIGS.append(r)

# prairie dog: sits up, looks round
r = Rig("preerikko", "hop")
PD = "#c8a070"
r.add("body", None, 10, (100, 160), P("M80 188 C70 160 78 124 100 118 C122 114 128 150 122 176 C118 188 100 192 80 188 Z", PD)
      + flat("M104 130 C116 140 118 170 108 184 C116 178 122 160 120 140 Z", "#f0dcc0", 0.95) + E(78, 184, 8, 4, shade(PD, 0.8), 0, 1))
r.add("thigh_bn", "body", 12, (88, 176), E(92, 180, 14, 9, shade(PD, 0.95), 0) + E(102, 189, 10, 3, shade(PD, 0.8), 0, 1))
r.add("thigh_frn", "body", 13, (112, 140), limb(112, 138, 118, 154, 5, 4, PD))
r.add("head", "body", 14, (104, 120), E(108, 108, 16, 13, PD) + E(116, 112, 7, 5, "#f0dcc0", 0, 0)
      + E(100, 98, 4, 3, shade(PD, 0.8), 0, 1) + eye(112, 104, 2.6) + E(122, 108, 2, 1.6, "#3a2410", 0, 0))
RIGS.append(r)

# Barbary macaque: the small monkey without a tail, grey brown, a pink face
MK = "#9a8268"
q = quad(
    "berberiapina", MK, "#d8c8b0", dict(cx=90, cy=134, rx=34, ry=18),
    dict(b=dict(x=70, top=140, thigh=24, shin=26, w=(12, 8, 7), kx=-4), fr=dict(x=110, top=140, thigh=24, shin=26, w=(11, 8, 7), kx=3)),
    dict(pivot=(116, 126), svg=(
        E(128, 118, 18, 16, MK) + E(132, 122, 11, 10, "#e8b0a0", 0, 1.2)
        + E(116, 110, 4, 4, "#e8b0a0", 0, 1)
        + eye(129, 118, 2.4) + eye(138, 118, 2.2) + '<path d="M131 127 q3 2 6 0" stroke="#5a2a20" stroke-width="1" fill="none"/>'
        + '<path d="M114 106 q14 -8 30 2" stroke="#7a644e" stroke-width="3" fill="none" stroke-linecap="round"/>')),
    hoof=paw_of(MK))
RIGS.append(q)

if __name__ == "__main__":
    main(RIGS)
