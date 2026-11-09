#!/usr/bin/env python3
"""Puts the family's own photos on Liikenneretki's map, on this computer only.

Reads every JPEG/HEIC-converted JPEG under <photo dir> that has a GPS position
inside the game's map (Tampere centre), and writes:
  games/tampere/album.local.d/<n>.jpg   a 480x360 copy (git-ignored)
  games/tampere/places.local.js         ALBUM = [{ lat, lon, title, file }]
                                        (git-ignored; PLACES in it is kept)
Nothing here ever goes to git or into a public build.

Usage: python3 tools/tampere/album.py <photo dir> [max photos, default 40]
  OUT=<dir>  write places.local.js and album.local.d/ there instead (e.g. the
             master copy that is copied into the phone build)
  At most one photo per 40 m is taken, so a day of shots in the same park
  makes one spot. The title is the photo's date (edit places.local.js to
  give better ones).
Needs Pillow (pip3 install pillow).
"""
import json, math, os, re, sys
from PIL import Image, ExifTags

LAT0, LON0 = 61.4994, 23.764
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110950
X0, Z0, X1, Z1 = -1460, -780, 940, 620
GAME = os.environ.get("OUT") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "games", "tampere")
OUTD = os.path.join(GAME, "album.local.d")
LOCAL = os.path.join(GAME, "places.local.js")

GPS_TAG = next(k for k, v in ExifTags.TAGS.items() if v == "GPSInfo")

def dms(v, ref):
    d, m, s = [float(x) for x in v]
    r = d + m / 60 + s / 3600
    return -r if ref in ("S", "W") else r

def gps_of(path):
    try:
        im = Image.open(path)
        ex = im.getexif()
        g = ex.get_ifd(GPS_TAG) if hasattr(ex, "get_ifd") else ex.get(GPS_TAG)
        if not g or 2 not in g or 4 not in g: return None
        lat, lon = dms(g[2], g.get(1, "N")), dms(g[4], g.get(3, "E"))
        date = (ex.get(306) or "")[:10].replace(":", ".")
        return lat, lon, date
    except Exception:
        return None

def main():
    src = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 40
    found = []
    for root, _, files in os.walk(src):
        for f in sorted(files):
            if not f.lower().endswith((".jpg", ".jpeg")): continue
            g = gps_of(os.path.join(root, f))
            if not g: continue
            x, z = (g[1] - LON0) * KX, -(g[0] - LAT0) * KY
            if X0 + 10 < x < X1 - 10 and Z0 + 10 < z < Z1 - 10:
                found.append((os.path.join(root, f), g, x, z))
    picked = []
    for path, g, x, z in found:
        if any(math.hypot(x - q[2], z - q[3]) < 40 for q in picked): continue
        picked.append((path, g, x, z))
        if len(picked) >= limit: break
    os.makedirs(OUTD, exist_ok=True)
    album = []
    for n, (path, (lat, lon, date), _, _) in enumerate(picked):
        im = Image.open(path)
        try:
            from PIL import ImageOps
            im = ImageOps.exif_transpose(im)
        except Exception:
            pass
        im = im.convert("RGB")
        w, h = im.size; r = 4 / 3
        if w / h > r: nw = int(h * r); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else: nh = int(w / r); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        im.resize((480, 360), Image.LANCZOS).save(os.path.join(OUTD, f"{n}.jpg"), quality=80)
        album.append({"lat": round(lat, 6), "lon": round(lon, 6), "title": date or "Kuva", "file": f"{n}.jpg"})
    # keep PLACES (homes etc.) from the existing file, replace ALBUM
    old = open(LOCAL, encoding="utf-8").read() if os.path.exists(LOCAL) else "export const PLACES = {};\n"
    old = re.sub(r"\nexport const ALBUM = \[.*?\];\n", "\n", old, flags=re.S)
    if not old.endswith("\n"): old += "\n"
    open(LOCAL, "w", encoding="utf-8").write(old + "export const ALBUM = " + json.dumps(album, ensure_ascii=False, indent=1) + ";\n")
    print(f"{len(found)} photos with a position on the map, {len(album)} spots written")

if __name__ == "__main__":
    main()
