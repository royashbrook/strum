# a small, typed tuner

Svelte owns the interface. TypeScript owns the application contracts. Vite compiles and
bundles the app and worker. There is no server, account, uploaded audio or runtime framework
for signal processing. SvelteKit is omitted because this is one local screen with panels,
not a routed or server-rendered application.

## ownership

| boundary | owner | rule |
|---|---|---|
| microphone permission, tracks, context, polling | `src/lib/microphone.ts` | an obsolete permission result cannot reopen a stopped session |
| peak detection and pitch refinement | `src/lib/analysis.ts` | pure inputs/outputs, no browser or UI state |
| hum and fading-note history | `src/lib/hum.ts`, `resonance.ts` | one peak extraction per frame; room history and string history are separate |
| tuning memory | `src/lib/tuning-memory.ts` | remembered green is not new pitch evidence |
| spring motion | `src/components/Tuner.svelte`, `pitch-motion.ts` | presentation only; stop requesting frames when settled or hidden |
| app navigation and preferences | `src/App.svelte`, `preferences.ts` | settings stay live, About/backgrounding stops capture; storage failures are nonfatal |
| install/update lifecycle | `src/lib/pwa.ts` | explicit update consent, stable installation identity, owned listeners/timer with disposal |
| production build | `scripts/build.mjs`, `vite.config.ts` | Vite bundles both entries; precache derives from emitted artifacts, excluding host configuration |

`src/lib/types.ts` names readings, tuning targets, microphone state and tracking state.
`policy.ts` names the cross-stage thresholds with units. Local interpolation/window constants
remain next to the math they describe. The existing threshold values were not tuned during
the migration.

## checks

- `npm run check`: formatting and strict TypeScript/Svelte checks, warnings fail.
- `npm test`: detector, lifecycle policy and release-artifact tests. The migration oracle
  compares against commit `9ca8d5c4011a64d2c34b22f659a82ae4d0f7fc65`, not a copied rewrite.
  Independently assembled boundary cases add 373 scenarios, 1,873 timestamped frames and
  11,238 readings, including display memory. The input recipes are committed; the pinned
  release supplies expected outputs at test time, so there is no generated-output blob to maintain.
  Keep git history available (`fetch-depth: 0` in CI).
- `npm run test:browser`: builds first, then Playwright Chromium/WebKit against Vite preview.
  The worker suite builds the actual installed v0.1.10 from git and upgrades it to the new app,
  then also exercises a Svelte-to-Svelte release update.
- `npm run test:edge`: Chromium/WebKit against the local Cloudflare asset runtime, including
  the actual CSP/permissions/cache headers, tuning/motion and installed worker. Live-origin
  verification after deployment remains a separate check.
- `node --experimental-strip-types scripts/benchmark.mjs`: warm median/p95 detector timing
  against the same pinned release. Synthetic fixtures are generated outside the timed region.
- `npm run test:mutations`: isolated copies deliberately change five decision boundaries;
  each must fail the independent migration comparison. The phase-energy backstop is not
  covered by these boundary recipes; direct refinement tests cover absent-tone refusal.

The manifest id `/`, start URL `/`, service-worker scope, `strum-*` cache family and preference
keys remain stable. An existing shortcut updates in place. In development, HMR does not
register a worker; use the production preview for offline/update validation.

## evidence and limits

The user reported successful tuning of every guitar in the house and positive shared-user
feedback before this migration. That is real playtest evidence, not a calibrated accuracy
study. The synthetic fixtures cover four tunings, sample rates, harmonics, hum, weak notes,
decay and ambiguity; they are not microphone recordings.

There is not yet a consented, annotated real-guitar recording set in this repository.
Do not manufacture one or relabel generated sine waves. Future recordings should include
instrument/string/tuning, reference pitch, microphone/device, room conditions, sample rate,
and rights/consent, and stay local in test tooling. Production still never records or uploads.

Exact coincident harmonics and a voice singing a target frequency remain ambiguous. Linux
WebKit's native-audio fixture variance is tracked in #19; the migration does not claim to have
found its cause. Device tests remain distinct from browser automation.

## performance

One warm Node run on the development Mac measured median detector-only milliseconds:

| synthetic input | v0.1.10 | typed single-scan implementation |
|---|---:|---:|
| pluck | 0.700 | 0.389 |
| strum | 0.819 | 0.529 |
| noise | 0.566 | 0.285 |

Not an iPhone result, battery claim, end-to-end latency claim, or CI timing threshold. Capture,
the browser's native FFT and rendering are excluded. Browser/device profiling is separate;
this Node benchmark cannot establish phone performance. Numerical parity, not timing,
gates this change.
