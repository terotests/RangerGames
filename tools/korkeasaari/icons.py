#!/usr/bin/env python3
"""Draws the picture answers of the Korkeasaari quiz that have no emoji on an
old phone: footprints (kuvat/jalki_*.png) and body coverings (kuvat/peite_*.png).
Our own drawings.   python3 tools/korkeasaari/icons.py"""
import os, subprocess, tempfile
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "games", "korkeasaari", "kuvat")
S = 96  # pixels; drawn in a 100 x 100 box

INK = "#5a4632"
def ell(cx, cy, rx, ry, rot=0, c=INK):
    return '<ellipse cx="%g" cy="%g" rx="%g" ry="%g" transform="rotate(%g %g %g)" fill="%s"/>' % (cx, cy, rx, ry, rot, cx, cy, c)

ICONS = {
    # a cat's or dog's paw: four toes and the pad
    "jalki_tassu": ell(50, 64, 20, 16) + ell(28, 38, 7, 9, -20) + ell(43, 26, 7, 9, -5) + ell(58, 26, 7, 9, 5) + ell(72, 38, 7, 9, 20),
    # cloven hoof (deer, bison, goat): two halves
    "jalki_sorkka": '<path d="M47 18 C36 22 30 48 32 70 C34 84 44 84 46 74 C48 58 49 36 47 18 Z M53 18 C64 22 70 48 68 70 C66 84 56 84 54 74 C52 58 51 36 53 18 Z" fill="%s"/>' % INK,
    # a horse's hoof: one round print
    "jalki_kavio": '<path d="M50 14 C24 14 16 44 20 66 C24 86 38 84 42 74 L46 62 L54 62 L58 74 C62 84 76 86 80 66 C84 44 76 14 50 14 Z" fill="%s"/>' % INK,
    # a bird: three toes forward, one back
    "jalki_lintu": '<path d="M50 60 L50 90 M50 60 L26 22 M50 60 L50 14 M50 60 L74 22" stroke="%s" stroke-width="8" stroke-linecap="round" fill="none"/>' % INK,
    # a monkey's hand
    "jalki_kasi": ell(50, 64, 18, 20) + ''.join(ell(x, y, 5, 13, r) for x, y, r in [(34, 34, -12), (45, 28, -4), (56, 28, 4), (67, 34, 12)]) + ell(26, 66, 6, 12, -50),
    # fur: soft brown with hairs
    "peite_turkki": '<rect x="8" y="8" width="84" height="84" rx="20" fill="#b07a48"/>' + ''.join(
        '<path d="M%g %g q4 8 0 16" stroke="#7a4e28" stroke-width="3" fill="none" stroke-linecap="round"/>' % (16 + (i % 6) * 13, 14 + (i // 6) * 20 + (i % 2) * 6) for i in range(24)),
    # feathers
    "peite_hoyhenet": '<rect x="8" y="8" width="84" height="84" rx="20" fill="#e8f0f8"/>' + ''.join(
        '<path d="M%g %g q14 -10 28 0 q-14 14 -28 0 Z" fill="#ffffff" stroke="#8aa0b8" stroke-width="2"/><path d="M%g %g l26 0" stroke="#8aa0b8" stroke-width="1.5"/>' % (x, y, x + 1, y) for x, y in
        [(14, 24), (48, 24), (30, 44), (64, 44), (14, 64), (48, 64), (30, 84)]),
    # scales
    "peite_suomut": '<rect x="8" y="8" width="84" height="84" rx="20" fill="#6aa84f"/>' + ''.join(
        '<path d="M%g %g a8 8 0 0 0 16 0" stroke="#2f6b26" stroke-width="3" fill="#8cc870"/>' % (12 + (i % 5) * 16 + ((i // 5) % 2) * 8, 18 + (i // 5) * 14) for i in range(30)),
    # a shell (tortoise)
    "peite_kuori": '<rect x="8" y="8" width="84" height="84" rx="20" fill="#c89a5a"/><path d="M50 22 L74 36 L74 64 L50 78 L26 64 L26 36 Z" fill="#a8783a" stroke="#5a3a18" stroke-width="4"/>'
                   '<path d="M50 22 L50 8 M74 36 L92 28 M74 64 L92 72 M50 78 L50 92 M26 64 L8 72 M26 36 L8 28" stroke="#5a3a18" stroke-width="4"/>',
}

os.makedirs(OUT, exist_ok=True)
for name, body in ICONS.items():
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="%d" height="%d">%s</svg>' % (S, S, body)
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(svg)
    subprocess.run(["rsvg-convert", f.name, "-o", os.path.join(OUT, name + ".png")], check=True)
    os.unlink(f.name)
print(len(ICONS), "icons in", os.path.normpath(OUT))
