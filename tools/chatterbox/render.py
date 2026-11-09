#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Renders the games' voice clips with Chatterbox Multilingual (Resemble AI,
MIT; github.com/resemble-ai/chatterbox), a neural TTS that is far too slow
for the build (about a minute a clip on an M-series Mac), so it runs on its
own, for hours, and can stop and go on at any time:

    python tools/chatterbox/render.py                 # fi, en, es (in that order)
    python tools/chatterbox/render.py fi              # one language
    python tools/chatterbox/render.py --only m_valmis # some ids (all languages)

Each clip goes to .deps/voice-clips/chatterbox/<lang>/<id>.wav with <id>.json
beside it (the text it says). rg_voice build uses a clip whose text still
matches the list and renders the rest itself (Piper or CHIMERA), so a build
never waits for this. A clip whose length is far off for its text (the model
sometimes repeats or trails off) is tried again with another seed.

Needs: pip install chatterbox-tts soundfile (and setuptools<81 for its
watermark library). Every output carries Resemble's inaudible Perth watermark.
"""
import glob, hashlib, json, os, sys, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.environ.get("RG_VOICE_CLIPS", os.path.join(ROOT, ".deps", "voice-clips", "chatterbox"))
# seconds per character, roughly, for the length check
PACE = {"fi": 0.075, "en": 0.065, "es": 0.065}


def lists(lang):
    files = [os.path.join(ROOT, "voice", "fi.json")] if lang == "fi" else sorted(glob.glob(os.path.join(ROOT, "voice", lang, "*.json")))
    clips = {}
    for f in files:
        with open(f, encoding="utf-8") as fh:
            j = json.load(fh)
        for cid, c in j.get("clips", {}).items():
            text = c if isinstance(c, str) else c.get("text", "")
            if text.strip():
                clips[cid] = text
    return clips


def done(lang, cid, text):
    try:
        with open(os.path.join(OUT, lang, cid + ".json"), encoding="utf-8") as fh:
            return json.load(fh).get("text") == text and os.path.exists(os.path.join(OUT, lang, cid + ".wav"))
    except (OSError, ValueError):
        return False


def main():
    args = sys.argv[1:]
    only = None
    if "--only" in args:
        i = args.index("--only")
        only = set(args[i + 1:])
        args = args[:i]
    langs = args or ["fi", "en", "es"]
    todo = []
    for lang in langs:
        for cid, text in lists(lang).items():
            if (only is None or cid in only) and not done(lang, cid, text):
                todo.append((lang, cid, text))
    print(f"{len(todo)} clips to render into {OUT}", flush=True)
    if not todo:
        return
    import torch, soundfile as sf
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
    model = ChatterboxMultilingualTTS.from_pretrained(device=device)
    # the library lets every take run to 1000 speech tokens (~40 s): a take that doesn't stop
    # then costs minutes. Cap it by the text's length (25 tokens a second, 2.5× the expected time)
    limit = [1000]
    t3_inference = model.t3.inference

    def capped(*a, **k):
        k["max_new_tokens"] = min(k.get("max_new_tokens", 1000), limit[0])
        return t3_inference(*a, **k)

    model.t3.inference = capped
    t_all = time.time()
    for n, (lang, cid, text) in enumerate(todo):
        os.makedirs(os.path.join(OUT, lang), exist_ok=True)
        want = len(text) * PACE.get(lang, 0.07)
        limit[0] = int(25 * (2.5 * want + 2.0)) + 25
        best = None
        t0 = time.time()
        for attempt in range(3):
            seed = int(hashlib.sha1(f"{lang}:{cid}:{attempt}".encode()).hexdigest()[:8], 16)
            torch.manual_seed(seed)
            wav = model.generate(text, language_id=lang)
            x = wav.squeeze().detach().cpu().numpy()
            dur = len(x) / model.sr
            # far too long (repeats, trailing noise) or too short (words dropped): try again
            ok = 0.4 * want - 0.3 <= dur <= 2.0 * want + 1.2
            if best is None or abs(dur - want) < abs(best[1] - want):
                best = (x, dur, seed)
            if ok:
                break
        x, dur, seed = best
        sf.write(os.path.join(OUT, lang, cid + ".wav"), x, model.sr, subtype="PCM_16")
        with open(os.path.join(OUT, lang, cid + ".json"), "w", encoding="utf-8") as fh:
            json.dump({"text": text, "engine": "chatterbox-multilingual", "seed": seed, "attempts": attempt + 1}, fh, ensure_ascii=False)
        left = (time.time() - t_all) / (n + 1) * (len(todo) - n - 1)
        print(f"[{n + 1}/{len(todo)}] {lang}/{cid} {dur:.1f} s in {time.time() - t0:.0f} s, tries {attempt + 1}; ~{left / 3600:.1f} h left", flush=True)


if __name__ == "__main__":
    main()
