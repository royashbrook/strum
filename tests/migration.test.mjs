import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { followResonance, createHistory } from '../src/lib/resonance.ts';
import { TUNINGS } from '../src/lib/tunings.ts';
import { audioFixture } from './waveform.js';
import { withLegacy } from './legacy-release.js';
import { rememberTuning } from '../src/lib/tuning-memory.ts';
import { listeningProfiles } from '../src/lib/listening.ts';
import { migrationCases, migrationFrame, HOP } from './migration-cases.js';

test('independent boundary sequences preserve detector AND display memory from the installed release', async () => {
  await withLegacy(async (root) => {
    const old = async (name) => import(pathToFileURL(resolve(root, `public/${name}.js`)));
    const [analysis, tunings, resonance, memory] = await Promise.all(
      ['analysis', 'tunings', 'resonance', 'tuning-memory'].map(old),
    );
    const cases = migrationCases({ ...analysis, ...tunings });
    assert.equal(cases.length, 373);
    assert.equal(
      cases.reduce((n, s) => n + s.frames.length, 0),
      1873,
    );
    for (const scenario of cases) {
      const before = [],
        after = createHistory(),
        oldMemory = [],
        newMemory = [];
      for (const [i, spec] of scenario.frames.entries()) {
        const f = migrationFrame(spec);
        const tuning =
          scenario.switchAt != null && i >= scenario.switchAt ? scenario.switchTo : scenario.tuning;
        const options = { ...listeningProfiles[scenario.profile], tuning };
        const expected = resonance.followResonance(
          f.spectrum,
          f.rate,
          f.rms,
          options,
          before,
          i * HOP,
          f.samples,
        );
        const actual = followResonance(
          f.spectrum,
          f.rate,
          f.rms,
          options,
          after,
          i * HOP,
          f.samples,
        );
        const label = `${scenario.name} frame ${i}`;
        assert.deepEqual(actual, expected, label + ' detector');
        assert.deepEqual(
          rememberTuning(actual, newMemory),
          memory.rememberTuning(expected, oldMemory),
          label + ' display',
        );
      }
    }
  });
});

test('typed single-scan detector exactly preserves v0.1.10 across tunings, noise, hum and decay', async () => {
  await withLegacy(async (root) => {
    const legacy = await import(pathToFileURL(resolve(root, 'public/resonance.js')));
    for (const rate of [44100, 48000])
      for (const tuning of TUNINGS) {
        for (const gate of [-85, -55]) {
          const options = { gate, rejection: gate === -85 ? 0.35 : 0.6, tuning: tuning.id };
          const oldState = [],
            state = createHistory();
          const notes = audioFixture({
            rate,
            frequencies: tuning.strings.map((s, i) => s.hz * 2 ** ((i % 2 ? -18 : 22) / 1200)),
            weights: [1, 0.5, 0.33, 0.25, 0.2, 0.16],
            noise: -100,
          });
          const faint = audioFixture({
            rate,
            frequencies: [tuning.strings[1].hz * 2 ** (-18 / 1200)],
            db: -68,
            noise: -110,
          });
          const noise = audioFixture({ rate, frequencies: [], noise: -45 });
          const hum = audioFixture({
            rate,
            frequencies: [],
            hum: { hz: 50, db: -60, harmonics: 12 },
            noise: -110,
          });
          const frames = [
            ...Array(4).fill(notes),
            ...Array(8).fill(faint),
            noise,
            ...Array(35).fill(hum),
            notes,
          ];
          for (const [i, f] of frames.entries()) {
            const expected = legacy.followResonance(
              f.spectrum,
              rate,
              f.rms,
              options,
              oldState,
              i * 90,
              f.samples,
            );
            const actual = followResonance(
              f.spectrum,
              rate,
              f.rms,
              options,
              state,
              i * 90,
              f.samples,
            );
            assert.deepEqual(actual, expected, `${rate}/${tuning.id}/${gate}/frame ${i}`);
          }
        }
      }
  });
});
