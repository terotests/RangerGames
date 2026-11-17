#!/usr/bin/env python3
"""Puts Google TTS clips (made for the Sliqtly copies of the games with the speak
tool, voice fi-FI-Chirp3-HD-Aoede) into a local clip folder for a build made on
one's own machine. These clips never go to GitHub: not into the voice-clips
branch, not into any commit. The output folder must be outside every git
checkout (the script refuses otherwise); a local build reads it through
RG_VOICE_CLIPS.

    python3 tools/google-voice/import.py <clips>/fi ~/tmp/voice-local

<clips>/fi/<id>.wav are 16-bit PCM WAVs (any rate, mono). Only ids in
voice/fi.json are taken; each gets <id>.json with the list's text, so rg_voice
uses it while the text stays the same, and render.py leaves it alone
("engine": "google:...").
"""
import json, os, shutil, subprocess, sys, wave

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "chatterbox"))
import render  # noqa: E402  (lists, spoken, expression)

ENGINE = "google:fi-FI-Chirp3-HD-Aoede"


def main():
    src, out = sys.argv[1], os.path.join(sys.argv[2], "fi")
    os.makedirs(out, exist_ok=True)
    inside = subprocess.run(["git", "-C", out, "rev-parse", "--is-inside-work-tree"],
                            capture_output=True, text=True).stdout.strip()
    if inside == "true":
        sys.exit(out + " is inside a git checkout: Google clips stay out of git, pick a local folder")
    clips = render.lists("fi")
    n = skipped = 0
    for name in sorted(os.listdir(src)):
        if not name.endswith(".wav"):
            continue
        cid = name[:-4]
        if cid not in clips:
            skipped += 1
            continue
        w = os.path.join(src, name)
        with wave.open(w) as f:
            if f.getsampwidth() != 2 or f.getnframes() == 0:
                print(cid, ": not 16-bit PCM, skipped")
                continue
        shutil.copyfile(w, os.path.join(out, name))
        text = clips[cid]
        info = {"text": text, "spoken": render.spoken("fi", text), "engine": ENGINE, "exaggeration": render.expression(cid)}
        with open(os.path.join(out, cid + ".json"), "w", encoding="utf-8") as fh:
            json.dump(info, fh, ensure_ascii=False)
        n += 1
    print(n, "clips imported,", skipped, "not in voice/fi.json")


if __name__ == "__main__":
    main()
