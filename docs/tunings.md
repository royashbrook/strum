# tuning presets (refs #17)

The settings-only native picker offers four six-string presets, low to high:

| Preset | Targets |
| --- | --- |
| Standard | E2 A2 D3 G3 B3 E4 |
| Drop D | D2 A2 D3 G3 B3 E4 |
| Open D | D2 A2 D3 F♯3 A3 D4 |
| Open G | D2 G2 D3 G3 B3 D4 |

Targets are equal-tempered MIDI frequencies referenced to A4 = 440 Hz, defined once
in `public/tunings.js`. [Fender's tuning guide](https://www.fender.com/articles/setup/tune-like-a-rock-star)
and [Open D lesson](https://www.fender.com/articles/setup/open-d-tuning) document the note sets.

`strum.tuning.v1` stores only the preset id. Missing, invalid or unavailable storage
falls back to Standard. A change updates labels, targets and About, clears green
memory and marker motion, and invalidates all old resonance history, including
unchanged strings. An active microphone stays open; changing settings never starts it.

The detector searches within 250 cents so changing a string by a whole tone gives
direction before it is close. A peak belongs only to the nearest target, with a
30-cent separation margin: a pitch midway between neighbouring targets remains
unassigned. It cannot identify which physical string produced such an ambiguous
pitch. The five-cent green tolerance, raw-peak isolation and harmonic ambiguity
guards remain. Zero harmonic/isolation confidence never counts as a reading, even
if a caller sets rejection to zero.

Open tunings contain more exact octave/harmonic overlaps. A full strum cannot
always distinguish upper strings from lower-string overtones; those remain
uncertain. Plucking strings individually allows each to confirm and retain green.
These presets do not promise perfect six-string separation or guitar/voice classification.

Checks cover independent string pitches at 44.1/48 kHz, flat/tuned/sharp readings,
standard-to-preset retuning, faint fundamentals, noise, single-pluck ghosts, full-strum
ambiguity, midpoint refusal, resonance reset, active microphone continuity, saved
selection, blocked storage, narrow/landscape layouts and consented offline PWA updates.
Generated audio and browser tests are not a physical-phone guitar accuracy claim.
