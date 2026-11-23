#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Mars detail-tile heights for a globe's detail windows (engine globe detail
`height`, rg.height): the MGS MOLA 463 m DEM (NASA/GSFC, USGS Astrogeology,
public domain) cut into the 16 x 8 tiles of the detail pictures (tile c_r
covers longitude -180 + 22.5 c ... and latitude 90 - 22.5 r ... southwards),
each 512 x 512, as PNG with the height in red * 256 + green, 0..65535 from
LO to HI km (Solar Pilot's TERRAIN for Mars), in steps of 8 (about 3.6 m).

The DEM is read straight from the USGS archive with HTTP range requests, a few
hundred rows at a time, so it never needs the 2 GB file on disk (or pass a
local copy with --tif).

usage: python3 scripts/mars-height-tiles.py OUTDIR [--tif mola463.tif] [--tiles 5_4,6_4]
needs: numpy, Pillow
"""
import argparse
import os
import sys
import urllib.request

import numpy as np
from PIL import Image

URL = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
W, H = 46080, 23040          # the DEM: int16 metres, one row per strip, origin -180 / +90
LO, HI = -8.0, 21.2          # km, as lib/terrain.ts TERRAIN.mars
TILE = 512
SRC = W // 16                # 2880 source pixels per tile
STEP = 5                     # first a 5 x 5 mean (2880 -> 576), then 576 -> 512 by area
CHUNK = 320                  # rows read at a time (a multiple of STEP)


def first_strip_offset(read):
    """The file offset of row 0 (classic TIFF, uncompressed strips)."""
    head = read(0, 65536)
    bo = "<" if head[:2] == b"II" else ">"
    if int.from_bytes(head[2:4], "little" if bo == "<" else "big") != 42:
        sys.exit("not a classic TIFF")
    end = "little" if bo == "<" else "big"
    ifd = int.from_bytes(head[4:8], end)
    if ifd + 2 > len(head):
        head = read(0, ifd + 4096)
    n = int.from_bytes(head[ifd:ifd + 2], end)
    for k in range(n):
        e = ifd + 2 + 12 * k
        tag = int.from_bytes(head[e:e + 2], end)
        typ = int.from_bytes(head[e + 2:e + 4], end)
        val = int.from_bytes(head[e + 8:e + 12], end)
        if tag == 259 and val != 1:
            sys.exit("compressed TIFF")
        if tag == 273:
            # StripOffsets: a pointer to the table; its first entry is row 0
            size = 4 if typ == 4 else 8
            t = read(val, size)
            return int.from_bytes(t, end), bo
    sys.exit("no strip offsets")


def reader(tif):
    if tif:
        f = open(tif, "rb")

        def read(off, n):
            f.seek(off)
            return f.read(n)
        return read

    def read(off, n):
        req = urllib.request.Request(URL, headers={"Range": "bytes=%d-%d" % (off, off + n - 1)})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    b = r.read()
                if len(b) == n:
                    return b
            except OSError as e:
                print("retry", attempt + 1, e, file=sys.stderr)
        sys.exit("download failed at %d" % off)
    return read


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--tif", help="a local copy of the DEM instead of the archive")
    ap.add_argument("--tiles", help="only these tiles, e.g. 5_4,6_4")
    a = ap.parse_args()
    want = set(a.tiles.split(",")) if a.tiles else None
    os.makedirs(a.out, exist_ok=True)
    read = reader(a.tif)
    row0, bo = first_strip_offset(read)
    for r in range(8):
        cols = [c for c in range(16) if want is None or "%d_%d" % (c, r) in want]
        if not cols:
            continue
        # the tile row, 5 x 5 means: 576 x (16 * 576)
        small = np.zeros((SRC // STEP, W // STEP), np.float32)
        for y in range(0, SRC, CHUNK):
            rows = np.frombuffer(read(row0 + (r * SRC + y) * W * 2, CHUNK * W * 2), dtype=bo + "i2")
            rows = rows.reshape(CHUNK, W).astype(np.float32)
            small[y // STEP:(y + CHUNK) // STEP] = rows.reshape(CHUNK // STEP, STEP, W // STEP, STEP).mean(axis=(1, 3))
        for c in cols:
            part = small[:, c * (SRC // STEP):(c + 1) * (SRC // STEP)]
            km = np.array(Image.fromarray(part, "F").resize((TILE, TILE), Image.BOX)) / 1000.0
            v = np.clip(np.round((km - LO) / (HI - LO) * 65535 / 8) * 8, 0, 65535).astype(np.uint32)
            rgb = np.zeros((TILE, TILE, 3), np.uint8)
            rgb[..., 0] = v >> 8
            rgb[..., 1] = v & 255
            Image.fromarray(rgb, "RGB").save(os.path.join(a.out, "%d_%d.png" % (c, r)), optimize=True)
            print("%d_%d.png" % (c, r), flush=True)


if __name__ == "__main__":
    main()
