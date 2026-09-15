# phone listening and tap-then-strum teaching (refs #15)

## interaction

The viewport is fixed and cannot scroll. Listening/About own their internal
overflow; listening also disables the elastic overscroll effect. All app targets
explicitly use `touch-action: manipulation`. A small touch-end fallback cancels
only a second stationary background tap within 350ms/24px. It does not cancel
control taps, swipes, long presses or multi-touch pinch. No unscalable viewport
meta tag is used. Actual Chromium touch drags plus mobile Chromium/WebKit double
taps, visual viewport scale, root position and panel scrolling are checked.
Those checks are not a physical iPhone rubber-band test.

Listening has two choices. Quiet guitar uses -85 dBFS with the balanced spectral
check; Noisy room uses -55 dBFS with the stricter check. New installs use Quiet
guitar. The competing note-filter knob is removed. Legacy saved cutoffs above
-60 become Noisy room; -60 or lower become Quiet guitar. This preserves intent,
not exact old numbers. The old key is retained; subsequent choices persist in
`strum.listening.v2`. Invalid or unavailable storage uses Quiet guitar.

The input meter distinguishes no sound, below-cutoff sound, sound without a
clear note, and measured pitch. It is not a tuning-confidence bar. Raw dB and the
cutoff remain available in About's microphone details.

## sound

A fixed -100 dB spectral cutoff discarded quiet periodic peaks before judging
their prominence above local noise. Removing it recovers all 36 deterministic
faint-tone cases (six strings, two sample rates, three noise seeds) previously
rejected: tone amplitude -90 dBFS with -75 dBFS generated white noise, detuned
20 cents. Both native browser analysers additionally measure this signal through
a real Web Audio MediaStream without hand-painted spectral bins or extra gain.

Removing that cutoff alone exposed a second defect: isolation was judged only
against already-filtered peaks, so a lone lucky noise peak could look like a
pure tone. Isolation now compares all raw local maxima, requiring 6 dB clearance
from unrelated peaks; the harmonic path and its prominence requirements remain.
The regression includes the concrete 48 kHz/seed-5/-55 dB noise false reading,
160 extra broadband-noise cases, and the existing quiet-note, ghost-B, missing
fundamental, six-string, decay and tuning-memory controls.

This is still pitch evidence, not guaranteed guitar recognition. Hum/voice and
truly absent fundamentals remain limitations. Generated signals do not prove
that an unplugged electric is audible to a particular phone. Capture still
requests noise suppression/echo cancellation/automatic gain off and reports
the browser's actual settings. No recording, upload or silent microphone start.

## visual teaching

The existing hand first points at the actual ear button with a tap ripple,
then travels to a separate ghost guitar illustration. After a real user tap
grants capture, only the guitar-strum action repeats. The readout is never
animated as though it were a playable instrument. First measured pitch retires
the cue; silence/noise does not. Permission requests, settings, About and hidden
pages hide it. Reduced motion uses static step-specific pictures. Existing
Tabler controls remain; the guitar illustration is ISC-licensed Lucide artwork
with its notice in the offline package.

## references

- [WebKit fast taps](https://webkit.org/blog/5610/more-responsive-tapping-on-ios/): manipulation removes double-tap gestures while retaining deliberate pinch.
- [Overscroll behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior): `none` additionally suppresses overscroll effects.
- [Capture settings](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints): requested constraints and reported hardware settings are distinct.
