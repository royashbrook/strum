import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseSpectrum } from '../src/lib/analysis.ts';
import { filteredPluck } from './filtered-pluck.js';

for (const rate of [44100, 48000]) {
  test(`${rate}: filtered low E cannot invent B when its own fundamental disappears`, () => {
    for (const cents of [-20, 0, 20]) for (let seed = 700; seed < 710; seed++) {
      const frame = filteredPluck({ rate, cents, seed });
      for (const rejection of [0, .35, .6, 1]) {
        const result = analyseSpectrum(frame.spectrum, rate, frame.rms, { gate: -85, rejection });
        assert.ok(['quiet', 'uncertain'].includes(result[4].state), JSON.stringify({ rate, cents, seed, rejection, result: result[4] }));
      }
    }
  });
  test(`${rate}: filtered genuine B and high E still report their own tuning`, () => {
    for (const string of [4, 5]) for (const cents of [-20, 0, 20]) {
      const frame = filteredPluck({ rate, string, cents });
      const result = analyseSpectrum(frame.spectrum, rate, frame.rms)[string];
      assert.equal(result.state, cents < 0 ? 'flat' : cents > 0 ? 'sharp' : 'tuned');
      assert.ok(Math.abs(result.cents - cents) < 2);
    }
  });
  test(`${rate}: a detected detuned low E does not hide a separately sharp B`, () => {
    const frame = filteredPluck({rate, notes:[-12,6,0,-20,9,3].map((c,i)=>[i,c]), poles:0, seed:200});
    const result=analyseSpectrum(frame.spectrum,rate,frame.rms);
    assert.equal(result[0].state,'flat');
    assert.equal(result[4].state,'sharp');
  });
}
