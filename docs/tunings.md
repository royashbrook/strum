# tuning presets (refs #17)

The settings-only native picker offers four six-string presets, low to high:

| Preset | Targets |
| --- | --- |
| Standard | E2 A2 D3 G3 B3 E4 |
| Drop D | D2 A2 D3 G3 B3 E4 |
| Open D | D2 A2 D3 F♯3 A3 D4 |
| Open G | D2 G2 D3 G3 B3 D4 |

Targets are equal-tempered MIDI frequencies referenced to A4 = 440 Hz, defined once
in `src/lib/tunings.ts`. [Fender's tuning guide](https://www.fender.com/articles/setup/tune-like-a-rock-star)
and [Open D lesson](https://www.fender.com/articles/setup/open-d-tuning) document the note sets.

`strum.tuning.v1` stores only the preset id. Missing, invalid or unavailable storage
falls back to Standard. A change updates labels, targets and About, clears green
memory and marker motion, and invalidates all old resonance history, including
unchanged strings. An active microphone stays open; changing settings never starts it.

The detector searches within 250 cents so changing a string by a whole tone gives
direction before it is close. A peak belongs only to the nearest target, with a
30-cent separation margin: the unassigned band is 30 cents wide, approximately
15 cents on either side of a midpoint between neighbouring targets. It cannot
identify which physical string produced such an ambiguous pitch. Fretted notes,
a capo, or a different string can now produce a confident large error against
the nearest target; use open strings without a capo. The five-cent green tolerance, raw-peak isolation and harmonic ambiguity
guards remain. Zero harmonic/isolation confidence never counts as a reading, even
if a caller sets rejection to zero.

Open tunings contain more exact octave/harmonic overlaps. A full strum cannot
always distinguish upper strings from lower-string overtones; those remain
uncertain. Mute the other strings before plucking each one to confirm and retain
green; a still-ringing bass string can keep an upper string ambiguous.
These presets do not promise perfect six-string separation or guitar/voice classification.

Checks cover independent string pitches at 44.1/48 kHz, flat/tuned/sharp readings,
standard-to-preset retuning, faint fundamentals, noise, single-pluck ghosts, full-strum
ambiguity, midpoint refusal, resonance reset, active microphone continuity, saved
selection, blocked storage, narrow/landscape layouts and consented offline PWA updates.
Generated audio and browser tests are not a physical-phone guitar accuracy claim.

The native fading-stream browser fixture holds a -68 dB peak sine, measured at
-71 dB RMS, inside the noisy preset's -73..-55 dB continuation band. It also checks
rejection at -81 dB RMS. The old -72 dB peak target settled at -75 dB RMS, below
the continuation floor, so a successful assertion depended on catching its brief
transition through the band. Both browser engines reproduced that distinction;
the fixture is corrected without changing capture, timing or detector thresholds.

Both drops use a 0.01-second audio time constant. The test snapshots the meter and
string state together in the page, before two seconds have elapsed, rather than
polling until refusal could be caused by the 2.5-second history expiry. Eight
repeats passed across Chromium and WebKit. Intercepting only the test's resonance
module and replacing the continuation floor with -115 dB makes both engines fail
at the -81 dB assertion: the mutant reports flat/tracking instead of quiet.
Acquisition and the in-band snapshot also wait for the oscillator's known 20-cent
offset. Linux WebKit produced a transient 33-cent reading at -71 dB before this
guard: reaching the RMS level alone does not establish a settled pitch spectrum.

One subsequent Linux WebKit run exhausted the observation budget at -76 dB.
A source-side analyser trace then matched captured levels at -71/-81 dB in both
Linux engines (44.1 kHz), with the second observation at 1.63/1.65 seconds. This
does not establish why the earlier native stream varied. The bounded diagnostic
remains in the fixture, including source and wall clocks; budget exhaustion throws
before recording a later observation. The detector and capture remain unchanged.
