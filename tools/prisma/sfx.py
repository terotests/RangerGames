#!/usr/bin/env python3
"""Prisma's sound effects, synthesized here (no recordings, ours to use):
glass tings, a rainbow shimmer, coloured light tones, lamp clicks, water,
measuring and answers. Writes 16-bit mono WAVs at 22050 Hz (the phone's mixing
rate) into games/prisma/sfx/.

    python3 tools/prisma/sfx.py
"""
import os
import wave
import numpy as np

RATE = 22050
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "games", "prisma", "sfx")
rng = np.random.default_rng(7)


def t_axis(sec):
    return np.arange(int(sec * RATE)) / RATE


def bell(f, sec, decay=4.0, partials=((1, 1.0), (2.76, 0.45), (5.4, 0.25), (8.93, 0.12)), attack=0.004):
    """a struck glass/bell tone: inharmonic partials, each decaying faster"""
    t = t_axis(sec)
    y = np.zeros_like(t)
    for k, (m, a) in enumerate(partials):
        y += a * np.sin(2 * np.pi * f * m * t + k) * np.exp(-t * decay * (1 + 0.6 * k))
    env = np.minimum(1, t / attack)
    return y * env


def place(buf, y, at):
    i = int(at * RATE)
    n = min(len(y), len(buf) - i)
    buf[i:i + n] += y[:n]


def reverb(y, mix=0.25):
    """a little room: a few fading echoes"""
    out = y.copy()
    for d, g in ((0.031, 0.5), (0.047, 0.4), (0.071, 0.3), (0.113, 0.22), (0.167, 0.15)):
        k = int(d * RATE)
        out[k:] += mix * g * y[:-k]
    return out


def noise(sec):
    return rng.uniform(-1, 1, int(sec * RATE))


def lowpass(x, a):
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += a * (v - acc)
        y[i] = acc
    return y


def write(name, y, peak=0.8):
    y = y / (np.max(np.abs(y)) or 1) * peak
    fade = min(len(y), int(0.01 * RATE))
    y[-fade:] *= np.linspace(1, 0, fade)
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((y * 32767).astype("<i2").tobytes())


# glass tings for turning the prism (three pitches, the game alternates them)
for i, f in enumerate((1568, 1760, 2093)):
    write("glass%d" % (i + 1), reverb(bell(f, 0.45, decay=9)), 0.45)

# the rainbow lands on the screen: seven bell notes up the colours, sparkle on top
buf = np.zeros(int(1.7 * RATE))
for i, f in enumerate((523, 587, 659, 784, 880, 1047, 1175)):
    place(buf, bell(f, 1.0, decay=3.5) * (0.8 + 0.03 * i), i * 0.075)
for i in range(14):
    place(buf, bell(2400 + rng.uniform(0, 1800), 0.25, decay=14) * 0.18, 0.35 + rng.uniform(0, 0.9))
write("rainbow", reverb(buf, 0.35), 0.8)

# one coloured light: red low and warm, green middle, blue high and clear
write("light_red", reverb(bell(330, 0.8, decay=4, partials=((1, 1), (2, 0.3), (3, 0.15)))), 0.6)
write("light_green", reverb(bell(494, 0.8, decay=4, partials=((1, 1), (2, 0.3), (3, 0.15)))), 0.6)
write("light_blue", reverb(bell(740, 0.8, decay=4, partials=((1, 1), (2, 0.3), (3, 0.15)))), 0.6)
# white light: the three together, a chord that shimmers
buf = np.zeros(int(1.1 * RATE))
for i, f in enumerate((330, 494, 740, 988)):
    place(buf, bell(f, 1.0, decay=3.5) * 0.7, i * 0.03)
write("light_white", reverb(buf, 0.35), 0.75)

# a lamp switches on: click and a soft rising hum
t = t_axis(0.35)
click = noise(0.012) * np.exp(-t_axis(0.012) * 300)
hum = np.sin(2 * np.pi * (180 + 80 * t) * t) * np.minimum(1, t / 0.05) * np.exp(-t * 6) * 0.35
buf = np.zeros(len(t))
place(buf, click, 0)
place(buf, hum, 0.01)
write("lamp", buf, 0.55)

# a colour found in the lamps' middle: a magic two-note chime
buf = np.zeros(int(1.2 * RATE))
place(buf, bell(1047, 1.0, decay=3), 0)
place(buf, bell(1568, 1.0, decay=3), 0.12)
place(buf, bell(2093, 0.8, decay=4) * 0.6, 0.24)
write("found", reverb(buf, 0.35), 0.75)

# measuring: a tape measure zip and a click
t = t_axis(0.28)
zip_ = lowpass(noise(0.28), 0.5) * (np.sin(2 * np.pi * 38 * t) > 0) * np.linspace(0.3, 1, len(t)) * 0.5
buf = np.zeros(int(0.45 * RATE))
place(buf, zip_, 0)
place(buf, bell(1320, 0.2, decay=20) * 0.6, 0.28)
write("measure", buf, 0.6)

# the screen slides: a short soft rumble
t = t_axis(0.12)
write("slide", lowpass(noise(0.12), 0.08) * np.sin(np.pi * t / 0.12), 0.35)

# materials: air a breath, water a bubbly splash, glass a ting
t = t_axis(0.5)
write("air", lowpass(noise(0.5), 0.15) * np.sin(np.pi * t / 0.5) ** 2, 0.35)
buf = np.zeros(int(0.7 * RATE))
place(buf, lowpass(noise(0.25), 0.3) * np.exp(-t_axis(0.25) * 12), 0)
for i in range(6):
    f0 = rng.uniform(500, 1100)
    tb = t_axis(0.09)
    place(buf, np.sin(2 * np.pi * (f0 + 2500 * tb) * tb) * np.exp(-tb * 30) * 0.5, 0.05 + i * 0.07 + rng.uniform(0, 0.03))
write("water", reverb(buf, 0.2), 0.6)
write("glass", reverb(bell(1976, 0.7, decay=6)), 0.55)

# answers: right = bright upward bells, wrong = a gentle "hmm" downward
buf = np.zeros(int(1.0 * RATE))
for i, f in enumerate((784, 988, 1175, 1568)):
    place(buf, bell(f, 0.7, decay=5), i * 0.08)
write("right", reverb(buf, 0.3), 0.75)
t = t_axis(0.45)
hmm = np.sin(2 * np.pi * (300 - 90 * t) * t) * np.minimum(1, t / 0.03) * np.exp(-t * 4)
write("hmm", hmm + 0.3 * np.sin(2 * np.pi * 2 * (300 - 90 * t) * t) * np.exp(-t * 6), 0.45)

# finishing an investigation: a sparkling fanfare
buf = np.zeros(int(2.0 * RATE))
for i, f in enumerate((523, 659, 784, 1047)):
    place(buf, bell(f, 1.2, decay=2.5, partials=((1, 1), (2, 0.4), (3, 0.2), (4.2, 0.1))), i * 0.12)
place(buf, bell(1319, 1.4, decay=2.0) * 0.8, 0.5)
for i in range(20):
    place(buf, bell(2500 + rng.uniform(0, 2000), 0.25, decay=14) * 0.15, 0.5 + rng.uniform(0, 1.2))
write("fanfare", reverb(buf, 0.35), 0.85)

print("wrote", sorted(os.listdir(OUT)))
