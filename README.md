# strum

An original six-string guitar tuner. Standard, Drop D, Open D and Open G, A4 = 440 Hz. Choose a tuning in settings; the six target labels follow it. The choice stays on this device. See [tuning presets](docs/tunings.md).

Svelte + strict TypeScript + Vite, with a browser-native audio engine independent of the UI.
`npm run dev` opens http://127.0.0.1:4193 with hot reload. `npm run build && npm run preview`
serves the production PWA at http://127.0.0.1:4194. Microphone access requires localhost or
HTTPS. No audio recording, upload, or playback. See [architecture and evidence](docs/architecture.md).

## tuning evidence and limits

- The existing tuner has been used successfully on real guitars. Synthetic spectra and waveform tests validate the detector's logic, not a universal accuracy claim for every microphone.
- Exact harmonic overlap is unresolved. Low E's third and fourth harmonics overlap B and high E. Those readings remain `?` when supported only by ambiguous evidence; no fabricated all-green result.
- Note filtering is not voice classification. A clear voice or hum at a string frequency can still register as a note. Broadband-noise rejection and fundamental-dominant decay checks are now waveform-tested, not a blanket claim about every microphone or room.
- Recorded-guitar validation is a separate next evidence layer. Synthetic missing-fundamental, noisy-signal and onset checks are not substitutes for microphone recordings or calibrated device measurements.
- Final brand/icon approval is pending; the six-bar icon is explicitly a draft for phone testing.

## Install and updates

The tuner shows pitch markers with directional arrows and a green thumbs-up at the middle. Optional numbers expose **low**, **high**, **tuned** and cents. Three consecutive in-tune readings remember green for that listening session; a hollow green marker distinguishes a remembered result from a fresh measurement. A new low/high reading clears green immediately. Stopping listening, changing tuning, switching apps, or entering About clears remembered results. Settings leave the microphone running. There is no simulated pitch preview.

Listening offers **Quiet guitar** and **Noisy room**. The input meter measures raw microphone samples before pitch rejection; technical dBFS values are in About. Legacy numeric preferences migrate to the closest cutoff intent, not an exact filter match. A clear isolated fundamental no longer needs several audible overtones. See [phone-controls evidence](docs/phone-controls.md).

App origin: https://strum.royashbrook.com. On iOS, open in Safari, Share, Add to Home Screen. Keep the same shortcut and origin so local settings stay in the same installation.

The app checks for updates every minute while visible, on return, and on demand in About. A fully installed waiting worker offers **update now**; it never interrupts listening automatically. Accepting an update stops the microphone and reloads. About shows the running version and build. The installed shell opens offline; permissions and microphone behavior still need real-device checks.

`npm run build` bundles/minifies the app and worker with Vite, generates hashed assets and
a version receipt, and derives the precache list from the finished artifact in `dist/`.
`npm run check` checks formatting and strict types. `npm test` runs deterministic unit and migration tests.
`npm run test:browser` owns a separate production-preview server and tests Chromium/WebKit,
including the real v0.1.10-to-v1 installed update and Svelte-to-Svelte updates.
`npm run test:edge` checks the built app under the local Cloudflare asset runtime's security
and cache headers. `npm run verify` runs all gates. Only `dist/` is published.

## Implementation

`src/lib/analysis.ts` is the pure detector. `microphone.ts` owns capture and cancellation.
`src/App.svelte` owns navigation, with string presentation and the gesture cue in separate
components. SvelteKit is optional and unnecessary for these three local panels. Backgrounding
or entering About stops microphone tracks; settings leave them running. Listening starts only
with an explicit gesture. [Source map and release gates](docs/architecture.md).

Original implementation, not copied from reference tuner projects. Platform references: [Web Audio analyser](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode), [microphone constraints](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints).
