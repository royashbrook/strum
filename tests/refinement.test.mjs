import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {STRINGS, FFT_SIZE, analyseSpectrum, refineHz, refineReadings} from '../public/analysis.js';
import {followResonance} from '../public/resonance.js';
import {listeningProfiles} from '../public/listening.js';
import {audioFixture, sampleFixture} from './waveform.js';

const measured = s => ['flat','sharp','tuned'].includes(s.state);
const cfg = {...listeningProfiles.quiet, tuning: 'standard'};
const pluck = [1, .5, .33, .25, .2, .16];
// A phase-continuous tone that steps by `cents` at one second, amplitude .01, like the report.
function stepped(rate, hz, cents, {from = 0, to = 99} = {}) {
  const x = new Float32Array(rate * 2); let phase = .7;
  for (let n = 0; n < x.length; n++) { const t = n / rate; phase += 2 * Math.PI * hz * 2 ** ((t >= 1 ? cents : 0) / 1200) / rate; x[n] = t >= from && t <= to ? .01 * Math.sin(phase) : 0; }
  return x;
}
// The detector then the refinement, on the window ending at `tEnd` seconds.
function readAt(x, rate, tEnd, i) {
  const end = Math.round(tEnd * rate), f = sampleFixture(x.slice(end - FFT_SIZE, end), rate);
  const raw = analyseSpectrum(f.spectrum, rate, f.rms, cfg), refined = refineReadings(raw, f.samples, rate);
  return {fft: raw[i].cents, refined: refined[i].cents === raw[i].cents ? null : refined[i].cents, state: raw[i].state};
}

test('a wrapped estimate is refused: steady high E 100 cents sharp, refined from an in-tune guess', () => {
  const x = stepped(48000, STRINGS[5].hz, 100);
  assert.equal(refineHz(x.slice(x.length - FFT_SIZE), STRINGS[5].hz, 48000, -60), null);
});

test('after a step the refinement is right or refused, never the wrong direction, and right within half a second', () => {
  let right = 0, refused = 0;
  for (const rate of [44100, 48000]) for (const i of [0, 3, 5]) for (const step of [-200, -100, -60, -40, -20, 20, 40, 60, 100, 200]) {
    const x = stepped(rate, STRINGS[i].hz, step);
    for (const dt of [.09, .24, .5, .7]) {
      const r = readAt(x, rate, 1 + dt, i);
      if (r.fft == null) continue;
      if (r.refined == null) { refused++; continue; }
      assert.ok(Math.sign(r.refined) === Math.sign(step) || Math.abs(r.refined) <= 5, JSON.stringify({rate, i, step, dt, r}));
      assert.ok(Math.abs(r.refined - step) < 9, JSON.stringify({rate, i, step, dt, r}));
      if (dt >= .5) { assert.ok(Math.abs(r.refined - step) < 2, JSON.stringify({rate, i, step, dt, r})); right++; }
    }
  }
  assert.ok(right >= 100 && refused >= 40, `right ${right}, refused ${refused}`);
});

test('the reading settles within three cents a quarter second after the peg reaches pitch and within two by 360 ms, where the window alone takes half a second', () => {
  for (const rate of [44100, 48000]) for (const i of [0, 3, 5]) {
    const flatThenTuned = (() => { const y = new Float32Array(rate * 2); let phase = .7; for (let n = 0; n < y.length; n++) { phase += 2 * Math.PI * STRINGS[i].hz * 2 ** ((n / rate < 1 ? -30 : 0) / 1200) / rate; y[n] = .01 * Math.sin(phase); } return y; })();
    const at = dt => readAt(flatThenTuned, rate, 1 + dt, i);
    // at 44.1 kHz the two fine segments span 371 ms, so the older still carries a tail of the old pitch at 270 ms
    assert.ok(Math.abs(at(.27).refined ?? 99) <= 3, JSON.stringify({rate, i, r: at(.27)}));
    assert.ok(Math.abs(at(.36).refined ?? 99) <= 2, JSON.stringify({rate, i, r: at(.36)}));
    assert.ok(Math.abs(at(.27).fft) > 5 && Math.abs(at(.36).fft) > 2, 'the window alone is still off here: ' + JSON.stringify([at(.27), at(.36)]));
  }
});

test('steady, faint and strummed notes are never less precise than the window, or the window is kept', () => {
  for (const rate of [44100, 48000]) for (let i = 0; i < 6; i++) {
    const f = audioFixture({rate, frequencies: [STRINGS[i].hz * 2 ** (-15 / 1200)], weights: pluck, db: -40, noise: -95});
    const r = refineReadings(analyseSpectrum(f.spectrum, rate, f.rms, cfg), f.samples, rate)[i];
    assert.ok(measured(r) && Math.abs(r.cents + 15) < .3, JSON.stringify({rate, i, r}));
  }
  const faint = audioFixture({frequencies: [STRINGS[0].hz * 2 ** (-15 / 1200)], weights: pluck, db: -75, noise: -85});
  const fr = refineReadings(analyseSpectrum(faint.spectrum, 48000, faint.rms, cfg), faint.samples, 48000)[0];
  assert.ok(measured(fr) && Math.abs(fr.cents + 15) < 1.5, JSON.stringify(fr));
  const detune = [-25, 15, 0, -20, 20, -18];
  const s = audioFixture({frequencies: STRINGS.map((t, i) => t.hz * 2 ** (detune[i] / 1200)), weights: pluck, db: -30, noise: -95});
  const raw = analyseSpectrum(s.spectrum, 48000, s.rms, cfg), refined = refineReadings(raw, s.samples, 48000);
  for (let i = 0; i < 6; i++) if (measured(raw[i])) assert.ok(refined[i].cents === raw[i].cents || Math.abs(refined[i].cents - detune[i]) < .5, JSON.stringify({i, raw: raw[i], refined: refined[i]}));
});

test('an onset is refined once the tone fills the last segments, and a vanished tone is refused', () => {
  for (const i of [0, 5]) {
    const onset = stepped(48000, STRINGS[i].hz, 0, {from: 1}), offset = stepped(48000, STRINGS[i].hz, 0, {to: 1});
    for (const dt of [.5, .7]) { const r = readAt(onset, 48000, 1 + dt, i); assert.ok(r.refined != null && Math.abs(r.refined) < 1, JSON.stringify({i, dt, r})); }
    for (const dt of [.09, .24]) { const r = readAt(offset, 48000, 1 + dt, i); if (r.fft != null) assert.equal(r.refined, null, JSON.stringify({i, dt, r})); }
  }
});

test('the continuation path uses the refined pitch for state, and only for measured strings', () => {
  const rate = 48000, i = 1, x = (() => { const y = new Float32Array(rate * 2); let phase = .3; for (let n = 0; n < y.length; n++) { phase += 2 * Math.PI * STRINGS[i].hz * 2 ** ((n / rate < 1 ? -14 : 0) / 1200) / rate; y[n] = .01 * Math.sin(phase); } return y; })();
  const end = Math.round(1.3 * rate), f = sampleFixture(x.slice(end - FFT_SIZE, end), rate);
  const without = followResonance(f.spectrum, rate, f.rms, cfg, [], 0)[i], withSamples = followResonance(f.spectrum, rate, f.rms, cfg, [], 0, f.samples)[i];
  assert.equal(without.state, 'flat'); assert.equal(withSamples.state, 'tuned');
  assert.equal(Math.abs(withSamples.cents) <= 5, true); assert.equal(withSamples.measuredHz, STRINGS[i].hz * 2 ** (withSamples.cents / 1200));
  // an uncertain reading stays uncertain whatever the buffer holds
  const hum = audioFixture({frequencies: [60], weights: [1, .8, .6, .5, .4, .3, .25, .2], db: -60, noise: -110});
  const rows = refineReadings(analyseSpectrum(hum.spectrum, 48000, hum.rms, cfg), hum.samples, 48000);
  for (const s of rows) if (!measured(s)) assert.ok(!('tracking' in s) && s.state !== 'tuned');
});

test('the capture loop hands the buffer it already reads to the continuation path', async () => {
  const source = await readFile(new URL('../public/microphone.js', import.meta.url), 'utf8');
  assert.match(source, /followResonance\([^;]*performance\.now\(\), samples\)/);
});
