# strum

An original six-string guitar tuner prototype. Standard EADGBE, A4 = 440 Hz.

`npm test` runs deterministic spectral tests. `npm run dev` opens the local-only development server at http://127.0.0.1:4193. Microphone access requires localhost or HTTPS. No runtime dependencies and no audio recording, upload, or playback.

## Phone-test release, not an accuracy claim

- The six-string UI and original FFT peak/harmonic estimator are a scaffold. Synthetic spectra validate logic, not real-world tuning accuracy.
- Exact harmonic overlap is unresolved. Low E's third and fourth harmonics overlap B and high E. Those readings remain `?` when supported only by ambiguous evidence; no fabricated all-green result.
- Harmonic filtering is not reliable voice classification. Voices, mains hum and broadband noise can register false strings. Phase-dependent low-E uncertainty also remains under review.
- Recorded guitar, noisy-room, missing-fundamental, onset separation, and real iPhone/Android microphone validation are required before an accuracy claim.
- Final brand/icon approval is pending; the six-bar icon is explicitly a draft for phone testing.

## Install and updates

Phone-test origin: https://strum.royashbrook.com. On iOS, open in Safari, Share, Add to Home Screen. Keep the same shortcut and origin so local settings stay in the same installation.

The app checks for updates every minute while visible, on return, and on demand in About. A fully installed waiting worker offers **update now**; it never interrupts listening automatically. Accepting an update stops the microphone and reloads. About shows the running version and build. The installed shell opens offline; permissions and microphone behavior still need real-device checks.

`npm run build` makes content-addressed modules, a version receipt and an atomic precache list in generated `dist/`. `npm run icons` regenerates committed PNGs from the draft vector using Playwright. `npm run test:browser` owns a separate test server and tests Chromium and WebKit, including real service-worker A-to-B updates. `npm run deploy` builds and deploys the static assets with the configured Cloudflare login. Only `dist/` is published; the source repository stays private.

## Implementation

`analysis.js` is a pure spectrum-to-six-readings function. `microphone.js` owns permission, tracks, context and cancellation. `app.js` owns UI and explanatory motion; the display is not an oscilloscope. Demo mode is explicitly simulated. Backgrounding or leaving the tuner stops microphone tracks; a late permission result is discarded.

Original implementation, not copied from reference tuner projects. Platform references: [Web Audio analyser](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode), [microphone constraints](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints).
