#!/usr/bin/env python3
"""Draws the world map of the Korkeasaari game's "where in the world" question:
games/korkeasaari/kuvat/maailma.png, each continent its own colour.

Source: Natural Earth 1:110m countries (public domain), the copy that comes with
geopandas 0.14 (geopandas/datasets/naturalearth_lowres). Needs pyshp and Pillow.
  python3 tools/korkeasaari/world_map.py <dir with naturalearth_lowres.shp>
The game places things on the map with the same bounds (LON0..LON1, LAT0..LAT1)."""
import os, sys
import shapefile
from PIL import Image, ImageDraw

LON0, LON1, LAT0, LAT1 = -170.0, 190.0, 80.0, -50.0
W, H = 720, 260
SS = 3
COL = {
    "Europe": (120, 170, 250), "Asia": (250, 196, 90), "Africa": (240, 128, 96),
    "North America": (130, 200, 120), "South America": (190, 140, 220), "Oceania": (110, 200, 200),
}
SEA = (206, 234, 250)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "games", "korkeasaari", "kuvat", "maailma.png")


def main(d):
    r = shapefile.Reader(os.path.join(d, "naturalearth_lowres.shp"))
    names = [f[0] for f in r.fields[1:]]
    img = Image.new("RGB", (W * SS, H * SS), SEA)
    dr = ImageDraw.Draw(img)
    px = lambda lon, lat: (((lon - LON0) / (LON1 - LON0)) * W * SS, ((LAT0 - lat) / (LAT0 - LAT1)) * H * SS)
    euro = Image.new("RGB", img.size, COL["Europe"])
    ural = Image.new("L", img.size, 0)  # Russia west of the Urals (60 E) is Europe, the rest Asia
    ImageDraw.Draw(ural).rectangle([0, 0, px(60, 0)[0], H * SS], fill=255)
    for rec, shp in zip(r.records(), r.shapes()):
        cont = rec[names.index("continent")]
        if cont not in COL: continue
        russia = rec[names.index("name")] == "Russia"
        c = COL["Asia"] if russia else COL[cont]
        parts = list(shp.parts) + [len(shp.points)]
        for a, b in zip(parts, parts[1:]):
            ring = shp.points[a:b]
            for shift in (0, 360):
                pts = [px(lon + shift, lat) for lon, lat in ring]
                dr.polygon(pts, fill=c)
                if russia:
                    m = Image.new("L", img.size, 0)
                    ImageDraw.Draw(m).polygon(pts, fill=255)
                    img.paste(euro, (0, 0), Image.fromarray(__import__("numpy").minimum(__import__("numpy").array(m), __import__("numpy").array(ural))))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.resize((W, H), Image.LANCZOS).save(OUT, optimize=True)
    print(OUT, os.path.getsize(OUT))


if __name__ == "__main__":
    main(sys.argv[1])
