import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { followResonance, createHistory } from '../src/lib/resonance.ts';
import { TUNINGS } from '../src/lib/tunings.ts';
import { audioFixture } from './waveform.js';
import { withLegacy } from './legacy-release.js';

test('typed single-scan detector exactly preserves v0.1.10 across tunings, noise, hum and decay', async () => {
  await withLegacy(async root => {
    const legacy = await import(pathToFileURL(resolve(root, 'public/resonance.js')));
    for (const rate of [44100, 48000]) for (const tuning of TUNINGS) {
      for (const gate of [-85, -55]) {
        const options = { gate, rejection: gate === -85 ? .35 : .6, tuning: tuning.id };
        const oldState = [], state = createHistory();
        const notes = audioFixture({ rate, frequencies: tuning.strings.map((s, i) => s.hz * 2 ** ((i % 2 ? -18 : 22) / 1200)), weights: [1,.5,.33,.25,.2,.16], noise: -100 });
        const faint = audioFixture({ rate, frequencies: [tuning.strings[1].hz * 2 ** (-18 / 1200)], db: -68, noise: -110 });
        const noise = audioFixture({ rate, frequencies: [], noise: -45 });
        const hum = audioFixture({ rate, frequencies: [], hum: { hz: 50, db: -60, harmonics: 12 }, noise: -110 });
        const frames = [...Array(4).fill(notes), ...Array(8).fill(faint), noise, ...Array(35).fill(hum), notes];
        for (const [i, f] of frames.entries()) {
          const expected = legacy.followResonance(f.spectrum, rate, f.rms, options, oldState, i * 90, f.samples);
          const actual = followResonance(f.spectrum, rate, f.rms, options, state, i * 90, f.samples);
          assert.deepEqual(actual, expected, `${rate}/${tuning.id}/${gate}/frame ${i}`);
        }
      }
    }
  });
});
