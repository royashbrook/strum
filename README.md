# strum

An original six-string guitar tuner prototype. Standard EADGBE, A4 = 440 Hz.

`npm test` runs deterministic spectral tests. `npm run dev` opens the local-only development server at http://127.0.0.1:4193. Microphone access requires localhost or HTTPS. No runtime dependencies and no audio recording, upload, or playback.

## Not release-ready

- The six-string UI and original FFT peak/harmonic estimator are a scaffold. Synthetic spectra validate logic, not real-world tuning accuracy.
- Exact harmonic overlap is unresolved. Low E's third and fourth harmonics overlap B and high E. Those readings remain `?` when supported only by ambiguous evidence; no fabricated all-green result.
- Harmonic filtering is not reliable voice classification. A voice with matching harmonics can still register.
- Recorded guitar, noisy-room, missing-fundamental, onset separation, and real iPhone/Android microphone validation are required before an accuracy claim.
- PWA install/update/offline wiring and approved brand/icon assets are still pending. No deployment workflow exists yet. Intended origin: strum.royashbrook.com.

## Implementation

`analysis.js` is a pure spectrum-to-six-readings function. `microphone.js` owns permission, tracks, context and cancellation. `app.js` owns UI and explanatory motion; the display is not an oscilloscope. Demo mode is explicitly simulated. Backgrounding or leaving the tuner stops microphone tracks; a late permission result is discarded.

Original implementation, not copied from reference tuner projects. Platform references: [Web Audio analyser](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode), [microphone constraints](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints).
