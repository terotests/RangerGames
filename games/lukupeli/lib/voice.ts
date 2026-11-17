// Hearing the child read aloud from the microphone's loudness only (no speech
// recognition: the phone is often offline). rg.sensor("mic") gives the level
// in dBFS about 20 times a second; this keeps a noise floor that follows the
// room, says when the level is clearly above it (voice) and counts the voiced
// time and the bursts (a burst ≈ a syllable or a word read slowly). While the
// phone itself speaks (talk) and a moment after, nothing is counted, so the
// game's own voice is not taken for the child's.

export type Ear = {
  floor: number;      // the room's noise level, dB
  on: boolean;        // voice now
  voiced: number;     // seconds of voice since reset
  bursts: number;     // voice onsets since reset
  quiet: number;      // seconds since the voice stopped
  mute: number;       // seconds still ignored after the phone's own sound
  level: number;      // 0…1 for the meter: how far above the floor
  frames: number;     // levels seen (the first ones set the floor fast)
};

export const ON_DB = 11;      // voice: this much above the floor …
export const OFF_DB = 6;      // … and it ends below this
export const MIN_DB = -62;    // and never quieter than this
export const GAP = 0.12;      // a new burst after this much quiet

export function newEar(): Ear {
  return { floor: -55, on: false, voiced: 0, bursts: 0, quiet: 1, mute: 0, level: 0, frames: 0 };
}

export function resetCount(e: Ear) {
  e.voiced = 0;
  e.bursts = 0;
}

export function hear(e: Ear, db: number, talk: boolean, dt: number) {
  e.frames++;
  if (talk) { e.mute = 0.3; e.on = false; e.level = 0; return; }
  if (e.mute > 0) { e.mute -= dt; e.level = 0; return; }
  // the floor: down fast, up slowly (speech has gaps that pull it back down)
  // the first half second just learns the room
  if (e.frames <= 10) { e.floor += (db - e.floor) * (e.frames === 1 ? 1 : 0.3); e.floor = Math.max(-90, Math.min(-25, e.floor)); e.level = 0; return; }
  if (db < e.floor) e.floor += (db - e.floor) * 0.35;
  else if (!e.on) e.floor += Math.min(db - e.floor, 1.5 * dt);
  e.floor = Math.max(-90, Math.min(-25, e.floor));
  const above = db - e.floor;
  e.level = Math.max(0, Math.min(1, (above - 3) / 25));
  if (!e.on && above > ON_DB && db > MIN_DB) {
    e.on = true;
    if (e.quiet >= GAP) e.bursts++;
  } else if (e.on && above < OFF_DB) {
    e.on = false;
    e.quiet = 0;
  }
  if (e.on) e.voiced += dt; else e.quiet += dt;
}

// Has the child read a text of n syllables? Children of this age often read
// syllable by syllable with long pauses ("sam … mak … ko … hyp … pii"), so
// listening never ends while they are still going: it needs about one burst
// a syllable (or the voiced time of a fluent reader) AND then a real pause
// of PAUSE seconds. If the reader is quiet and soft, a longer pause with some
// voice also ends it.
export const PAUSE = 2.0;
export const GIVE_UP = 5.0;
export function burstsFor(n: number): number { return Math.max(1, Math.ceil(n * 0.8)); }
export function voicedFor(n: number): number { return Math.max(0.4, n * 0.2); }

export function readProgress(e: Ear, n: number): number {
  return Math.max(0, Math.min(1, Math.max(e.bursts / burstsFor(n), e.voiced / voicedFor(n))));
}

export function doneReading(e: Ear, n: number): boolean {
  if (e.on || e.voiced <= 0) return false;
  if (readProgress(e, n) >= 1 && e.quiet >= PAUSE) return true;
  return e.quiet >= GIVE_UP && e.voiced >= needVoice(n);
}

// how much voice reading a text of n syllables aloud needs, at least: a slow
// reader voices about 0.2 s a syllable; a third of that is asked, so pauses,
// soft sounds and a quiet room never block the child
export function needVoice(syllables: number): number {
  return Math.max(0.35, Math.min(6, syllables * 0.07));
}
