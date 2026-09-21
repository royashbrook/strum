import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatePluck } from '../src/lib/analysis.ts';

// An ideal string plucked at fraction p drives harmonic n by |sin(n*pi*p)|/n, so the
// partials near 1/p, 2/p ... vanish. Build that ladder (index 0 = fundamental, null =
// a partial too weak to appear) and check the estimator reads p back from the nulls.
const ladder = (p, harmonics = 10) =>
  Array.from({ length: harmonics }, (_, i) => {
    const a = Math.abs(Math.sin((i + 1) * Math.PI * p)) / (i + 1);
    return a < 0.02 ? null : 20 * Math.log10(a);
  });

for (const p of [0.5, 0.25, 0.2, 0.167]) {
  test(`recovers a pluck at ${p} from its harmonic comb`, () => {
    const r = estimatePluck(ladder(p));
    assert.ok(Math.abs(r.pluck - p) < 0.02, `got ${r.pluck}`);
    assert.ok(r.strength > 0.6, `weak strength ${r.strength}`);
  });
}

test('reports no pluck when there is no comb (flat / too few partials)', () => {
  assert.equal(estimatePluck([-20, -26, -30]).strength, 0); // smooth rolloff, no null
  assert.equal(estimatePluck([-20, null]).strength, 0); // not enough partials
});

test('always returns the near-bridge half, so p and 1-p do not disagree', () => {
  const near = estimatePluck(ladder(0.2)),
    far = estimatePluck(ladder(0.8));
  assert.ok(near.pluck <= 0.5 && far.pluck <= 0.5);
  assert.ok(Math.abs(near.pluck - far.pluck) < 0.02); // the mirror lands in one place
});

// The renderer draws each string as the sum of its own partials, so the detector must
// hand them over and they must follow the spectrum, not a fixed template.
import { analyseSpectrum, STRINGS, FFT_SIZE } from '../src/lib/analysis.ts';
import { spectrum } from './spectrum.js';
test('a reading carries its partials, and a nulled harmonic shows up as a hole', () => {
  const full = analyseSpectrum(spectrum([[0, 0]]), 48000, -20)[0];
  assert.ok(full.partials.length >= 4 && full.partials[0] > 0.9, JSON.stringify(full.partials));
  const bins = spectrum([[0, 0]]);
  const peak = ((STRINGS[0].hz * 3) / 48000) * FFT_SIZE;
  for (let b = Math.floor(peak) - 4; b <= Math.ceil(peak) + 4; b++) bins[b] = -120;
  const holed = analyseSpectrum(bins, 48000, -20)[0];
  assert.ok(
    holed.partials[2] < 0.05 && full.partials[2] > 0.1,
    `partial 3: ${full.partials[2]} -> ${holed.partials[2]}`,
  );
});
