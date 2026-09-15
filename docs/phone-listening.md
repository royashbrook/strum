# phone listening (refs #7)

## evidence and scope

The iPhone Air report was brief detection after hard strums, especially poor on nylon strings despite minimum volume gate. The existing capture request already disabled echo cancellation, noise suppression and automatic gain. A request is not proof of what the browser or OS actually applies.

The analyser separately required multiple overtones. At the previously saved 0.6 threshold, a fading fundamental with only one or two overtones could never qualify, regardless of volume-gate position. The old gate also stopped at -65 dBFS. A replay over 36 generated PCM/Blackman-FFT cases (six strings, 44.1/48 kHz, three amplitudes, detuned 20 cents low) yielded 0 correct directions on v0.1.3 and 36 on this change. These are synthesized decaying signals, not recorded nylon guitars.

Changes: default gate -60 dBFS, minimum -85; clear isolated fundamentals qualify without multiple overtones; peaks must rise above local spectral noise before they count as notes or harmonics. Tests sweep phase, amplitude, decay, sample rate, multiple noise seeds and filter settings. Six-string mixtures still report overlapping low-E/B/high-E evidence as uncertain. A native Web Audio oscillator-to-MediaStream-to-analyser browser check additionally tests soft low notes, in-tune acquisition and fade memory without a mocked analyser.

The raw input meter is before pitch rejection. About shows only reported processing flags, sample rate and channel count, never device identifiers. Unknown processing remains “not reported”. No digital gain is pretending to recover information removed by the OS.

Real iPhone/nylon capture is not verified by these browser tests. Voice/hum discrimination and full polyphonic overlap remain open in #1. No automatic recording, upload or microphone restart is added.

## v0.1.5 review follow-up (refs #9)

A synthesized low-E pluck filtered through six 300 Hz high-pass stages exposed a false B: the missing fundamental prevented the original overlap guard from running. The detector now checks for two other audible partials supporting an implied lower string, even if that lower fundamental is absent. Those partials must be distinct from the candidate's own harmonics and pass the existing local-noise prominence test. The result is uncertain regardless of filter sensitivity. This is conservative ambiguity handling, not source recognition; a fully isolated overtone with no other evidence remains indistinguishable here from a real note.

The regression sweeps 44.1/48 kHz, ten seeds, three detunings and four filter settings. Genuine filtered B/high E and the existing quiet overtone-light decays are controls. An actual app test verifies no ghost-green latch, followed by acquisition and fade memory for a real quiet B. Alternating tuned/quiet or tuned/uncertain readings now explicitly test that only consecutive frames can latch green.

The inferred-lower check runs only when that lower string is quiet or uncertain; already-detected strings use their measured frequencies in the original overlap guard. The first candidate incorrectly hid a genuinely sharp B in a detuned six-string strum. A failing mixed-detuning fixture at both sample rates caught that overreach before release and now pins the distinction.

Humming still qualifies as pitch evidence in the isolated path. Requiring decay is only a hypothesis and is not shipped: it needs attack/sustain controls before risking the quiet-string improvement. Real recordings, voice/hum discrimination and final accuracy acceptance remain on #1.

The release check pins `_headers` exclusion from the worker precache. HTML and worker entry points request no-store, and the manifest explicitly allows either orientation without changing app identity. CSP is unchanged; the blocked injected analytics beacon still needs a host-level decision.

## interface audit and decisions

Targeted evolution of the existing rounded charcoal/green interface, not a new marketing design. Preserve #15171a background, #3ddc84 tuned-green, system rounded type, six strings and explanatory motion. Design variance/motion/density: 3/4/3, preserving the symmetric instrument and keeping motion for readings only. No new visual assets or framework.

One Listen/Stop button. Remove fixed motion preview and bottom navigation bar. About/back remain accessible 44px header controls; version moves top-right. Sensitivity says hear less/hear more and shows the real cutoff. Note filter uses gentle/balanced/strict while preserving old saved values. Installation gets a dismissible tip; manual help remains in About. Prototype/test-release copy is removed from the app on direct request; honest verification limits stay here and in the issue.

Listen stays explicit. Permission persistence varies by browser and installation, and Web Audio can require activation or become interrupted. Keeping one tap avoids silently acquiring the microphone or presenting an “always listening” promise that is not reliable on every iPhone session.

## platform references

- [Apple Mic Modes](https://support.apple.com/en-us/101993): Voice Isolation prioritizes speech; Wide Spectrum leaves ambient audio unfiltered, where supported. These OS options are not remotely controlled by this app.
- [Media capture noise-suppression constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/noiseSuppression): boolean requests can be ignored if not supported; exact requests can fail capture. The app deliberately does not require unsupported hardware features.
- [Reported track settings](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings): use actual reported values, not the requested values, for diagnostics.
