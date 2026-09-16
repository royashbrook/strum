import { performance } from 'node:perf_hooks';
import { audioFixture } from '../tests/waveform.js';
import { followResonance, createHistory } from '../src/lib/resonance.ts';
import { withLegacy } from '../tests/legacy-release.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Relative evidence on this host, not an iPhone/latency claim. Fixture generation,
// microphone capture, native FFT and rendering are outside the timed section.
function measure(read, state, fixture) {
  const samples = [];
  for (let i = 0; i < 700; i++) {
    const t = performance.now();
    read(
      fixture.spectrum,
      fixture.rate,
      fixture.rms,
      { gate: -85, rejection: 0.35 },
      state,
      i * 90,
      fixture.samples,
    );
    if (i >= 100) samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  return { medianMs: +samples[300].toFixed(3), p95Ms: +samples[570].toFixed(3) };
}
await withLegacy(async (root) => {
  const legacy = await import(pathToFileURL(resolve(root, 'public/resonance.js')));
  for (const [name, options] of Object.entries({
    pluck: { notes: [[0, 15]], weights: [1, 0.4, 0.2, 0.1], noise: -80 },
    strum: {
      notes: [
        [0, 0],
        [1, 12],
        [2, -10],
        [3, 3],
        [4, 8],
        [5, -3],
      ],
      weights: [1, 0.4, 0.2, 0.1],
      noise: -90,
    },
    noise: { frequencies: [], noise: -45 },
  })) {
    const fixture = audioFixture(options);
    console.log(
      JSON.stringify({
        name,
        baseline: measure(legacy.followResonance, [], fixture),
        current: measure(followResonance, createHistory(), fixture),
      }),
    );
  }
});
