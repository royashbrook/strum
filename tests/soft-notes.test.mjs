import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseSpectrum, settings, STRINGS } from '../public/analysis.js';
import { audioFixture } from './waveform.js';
const analyse = (fixture, config = settings()) => analyseSpectrum(fixture.spectrum, fixture.rate, fixture.rms, config);

for (const rate of [44100, 48000]) for (let i = 0; i < 6; i++) {
  test(`${rate}: soft overtone-light string ${i} survives its decay`, () => {
    for (const phase of [0, .8, 2.1]) for (const db of [-42, -55, -72]) {
      const frame = audioFixture({ rate, notes: [[i, -20]], db, phase, decay: 1.5, noise: -100 });
      const result = analyse(frame, { gate: -85, rejection: .6 })[i];
      assert.equal(result.state, 'flat', JSON.stringify({ rate, i, db, phase, result }));
      assert.ok(Math.abs(result.cents + 20) < 2);
    }
  });
}
test('sensitivity controls quiet notes; gate is not confused with note confidence', () => {
  const frame = audioFixture({ notes: [[2, 20]], db: -72 });
  assert.ok(analyse(frame).every(s => s.state === 'quiet'));
  assert.equal(analyse(frame, { gate: -85, rejection: .6 })[2].state, 'sharp');
});
test('broadband noise and silence never become green at maximum sensitivity', () => {
  for (const rate of [44100, 48000]) for (const noise of [-35, -55, -75, -120]) for (const rejection of [0, .35, .6, 1]) for(const seed of [1234567, 913, 7811]) {
    const result = analyse(audioFixture({ rate, frequencies: [], noise, seed }), { gate: -85, rejection });
    assert.ok(result.every(s => !['tuned', 'flat', 'sharp'].includes(s.state)), JSON.stringify({ rate, noise, rejection, result }));
  }
});
test('one real low E waveform does not tune its B and high E overtones', () => {
  const result = analyse(audioFixture({ weights: [1, .8, .7, .6, .5, .4] }));
  assert.equal(result[0].state, 'tuned');
  assert.ok(result.slice(4).every(s => ['uncertain', 'quiet'].includes(s.state)));
});
test('six-string waveform retains tuning directions without inventing certainty for overlapping strings', () => {
  for (const rate of [44100,48000]) for (const cents of [-20,0,20]) {
    const frame=audioFixture({rate,notes:STRINGS.map((_,i)=>[i,cents]),weights:[1,.8,.6,.4,.2]});
    const result=analyse(frame),expected=cents<0?'flat':cents>0?'sharp':'tuned';
    assert.ok(result.slice(0,4).every(s=>s.state===expected));
    assert.ok(result.slice(4).every(s=>s.state==='uncertain'));
  }
});
