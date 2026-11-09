# SPDX-License-Identifier: AGPL-3.0-or-later
"""Reads Tampere Taxi Driver's map text (data/tampere-full.ttd.gz,
github.com/terotests/TampereTaxiDriver): names, then records separated by
';'. Coordinates are decimetres, x east and z south of 61.4994 N 23.7640 E.
Map data (c) OpenStreetMap contributors (ODbL), Tampereen kaupunki /
Maanmittauslaitos (CC BY 4.0)."""
import gzip, math

LAT0, LON0 = 61.4994, 23.764
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110950.0


def to_latlon(x, z):
    return LAT0 - z / KY, LON0 + x / KX


def to_xz(lat, lon):
    return (lon - LON0) * KX, (LAT0 - lat) * KY


def _pts(v, i):
    n = int(v[i]); i += 1
    p = [(int(v[i + 2 * k]) / 10.0, int(v[i + 2 * k + 1]) / 10.0) for k in range(n)]
    return p, i + 2 * n


def read(path):
    raw = gzip.open(path, "rt", encoding="utf8").read() if path.endswith(".gz") else open(path, encoding="utf8").read()
    names_s, rest = raw.split("%", 1)
    names = names_s.split("|")
    out = {k: [] for k in "S F B G W R L M H T P C Y N".split()}
    last_s = None
    for rec in rest.split(";"):
        if not rec:
            continue
        v = rec.split(" ")
        k = v[0]
        if k == "S":
            p, _ = _pts(v, 3)
            last_s = {"cls": int(v[1]) % 10, "oneway": int(v[1]) >= 10, "name": names[int(v[2])], "p": p, "speed": 0}
            out["S"].append(last_s)
        elif k == "V":
            if last_s is not None:
                last_s["speed"] = int(v[2])
        elif k == "F":
            out["F"].append({"kind": int(v[1]), "p": _pts(v, 2)[0]})
        elif k == "B":
            out["B"].append({"h": int(v[1]), "p": _pts(v, 3)[0]})
        elif k == "G":
            out["G"].append({"kind": int(v[1]), "p": _pts(v, 2)[0]})
        elif k == "W":
            out["W"].append({"name": names[int(v[1])], "p": _pts(v, 2)[0]})
        elif k == "R":
            out["R"].append({"name": names[int(v[1])], "w": int(v[2]) / 10.0, "p": _pts(v, 3)[0]})
        elif k in ("L", "M", "H", "T"):
            out[k].append({"p": _pts(v, 1)[0]})
        elif k == "Y":
            out["Y"].append({"layer": int(v[1]), "p": _pts(v, 2)[0]})
        elif k in ("P", "C"):
            if k == "P":
                out["P"].append({"name": names[int(v[1])], "x": int(v[2]) / 10.0, "z": int(v[3]) / 10.0})
            else:
                out["C"].append({"x": int(v[1]) / 10.0, "z": int(v[2]) / 10.0})
        elif k == "N":
            out["N"].append({"type": v[1], "name": names[int(v[2])], "p": _pts(v, 3)[0]})
    return out
