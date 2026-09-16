# strum

An original six-string guitar tuner. Standard, Drop D, Open D and Open G, A4 = 440 Hz. Choose a tuning in settings; the six target labels follow it. The choice stays on this device. See [tuning presets](docs/tunings.md).

`npm test` runs deterministic spectral tests. `npm run dev` opens the local-only development server at http://127.0.0.1:4193. Microphone access requires localhost or HTTPS. No runtime dependencies and no audio recording, upload, or playback.

## Phone-test release, not an accuracy claim

- The six-string UI and original FFT peak/harmonic estimator are a scaffold. Synthetic spectra validate logic, not real-world tuning accuracy.
- Exact harmonic overlap is unresolved. Low E's third and fourth harmonics overlap B and high E. Those readings remain `?` when supported only by ambiguous evidence; no fabricated all-green result.
- Note filtering is not voice classification. A clear voice or hum at a string frequency can still register as a note. Broadband-noise rejection and fundamental-dominant decay checks are now waveform-tested, not a blanket claim about every microphone or room.
- Recorded guitar, noisy-room, missing-fundamental, onset separation, and real iPhone/Android microphone validation are required before an accuracy claim.
- Final brand/icon approval is pending; the six-bar icon is explicitly a draft for phone testing.

## Install and updates

The tuner shows pitch markers with directional arrows and a green thumbs-up at the middle. Optional numbers expose **low**, **high**, **tuned** and cents. Three consecutive in-tune readings remember green for that listening session; a hollow green marker distinguishes a remembered result from a fresh measurement. A new low/high reading clears green immediately. Stopping listening, changing tuning, switching apps, or entering About clears remembered results. Settings leave the microphone running. There is no simulated pitch preview.

Listening offers **Quiet guitar** and **Noisy room**. The input meter measures raw microphone samples before pitch rejection; technical dBFS values are in About. Legacy numeric preferences migrate to the closest cutoff intent, not an exact filter match. A clear isolated fundamental no longer needs several audible overtones. See [phone-controls evidence](docs/phone-controls.md).

Phone-test origin: https://strum.royashbrook.com. On iOS, open in Safari, Share, Add to Home Screen. Keep the same shortcut and origin so local settings stay in the same installation.

The app checks for updates every minute while visible, on return, and on demand in About. A fully installed waiting worker offers **update now**; it never interrupts listening automatically. Accepting an update stops the microphone and reloads. About shows the running version and build. The installed shell opens offline; permissions and microphone behavior still need real-device checks.

`npm run build` makes content-addressed modules, a version receipt and an atomic precache list in generated `dist/`. `npm run icons` regenerates committed PNGs from the draft vector using Playwright. `npm run test:browser` owns a separate test server and tests Chromium and WebKit, including real service-worker A-to-B updates. `npm run deploy` builds and deploys the static assets with the configured Cloudflare login. Only `dist/` is published; the source repository stays private.

## Implementation

`analysis.js` is a pure spectrum-to-six-readings function. `microphone.js` owns permission, tracks, context and cancellation. `app.js` owns UI and explanatory motion; the display is not an oscilloscope. Backgrounding or leaving the tuner stops microphone tracks; a late permission result is discarded. Listen remains an explicit action, with no silent reopening of the microphone.

Original implementation, not copied from reference tuner projects. Platform references: [Web Audio analyser](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode), [microphone constraints](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints).
