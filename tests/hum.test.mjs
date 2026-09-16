import test from 'node:test';
import assert from 'node:assert/strict';
import {STRINGS, analyseSpectrum} from '../public/analysis.js';
import {humSeries, trackHum, HUM_SETTLE_MS, HUM_HOLD_MS} from '../public/hum.js';
import {followResonance} from '../public/resonance.js';
import {rememberTuning} from '../public/tuning-memory.js';
import {tuningFor} from '../public/tunings.js';
import {listeningProfiles} from '../public/listening.js';
import {audioFixture} from './waveform.js';

const measured = s => ['flat','sharp','tuned'].includes(s.state);
const series = (hz, db) => ({hz, db, harmonics: 12});
const pluck = [1, .5, .33, .25, .2, .16];
const HOP = 90, SETTLED = Math.ceil((HUM_SETTLE_MS + 700) / HOP) + 2;
// Feed one fixture per 90 ms frame through the continuation path, like microphone.js does.
function play(frames, {rate = 48000, tuning = 'standard', profile = listeningProfiles.quiet} = {}) {
  const history = [], memory = [], out = [];
  frames.forEach((spec, i) => {
    const f = audioFixture({rate, noise: -95, ...spec});
    const raw = followResonance(f.spectrum, f.rate, f.rms, {...profile, tuning}, history, i * HOP);
    out.push({raw, shown: rememberTuning(raw, memory)});
  });
  return out;
}
const repeat = (spec, n) => Array.from({length: n}, () => spec);
const nothingLit = rows => rows.every(r => r.raw.every(s => !measured(s)));

test('the series needs its base: a sharp Open G chord supplies 100, 150 and 200 Hz but never 50', () => {
  const binHz = 48000 / 32768, peak = (hz, db) => ({hz, db});
  assert.equal(humSeries([peak(100, -55), peak(150, -58), peak(200, -60), peak(300, -66)], binHz), null);
  assert.equal(humSeries([peak(50, -60), peak(100, -66), peak(150, -70), peak(200, -72)], binHz)?.base, 50);
  assert.equal(humSeries([peak(60, -60), peak(180, -70), peak(240, -72), peak(300, -74)], binHz)?.base, 60);
  // the base plus one more low member is not a series; sparse high multiples never are
  assert.equal(humSeries([peak(60, -60), peak(120, -66), peak(600, -70), peak(660, -72)], binHz), null);
  assert.equal(humSeries([peak(60, -60), peak(660, -50), peak(780, -52), peak(900, -55)], binHz), null);
  // half a percent, or 0.4 bins: 120.5 Hz is the second multiple of 60, 121 is not
  assert.equal(humSeries([peak(60, -60), peak(120.5, -66), peak(180, -70), peak(240, -72)], binHz).members.size, 4);
  assert.equal(humSeries([peak(60, -60), peak(121, -66), peak(180, -70), peak(240, -72)], binHz).members.size, 3);
});

test('a member is masked only after holding steady for two seconds, a rise releases it, absence is held briefly', () => {
  const binHz = 48000 / 32768, state = {base: null, seen: 0, members: {}};
  const hum = db => humSeries([{hz: 60, db}, {hz: 120, db: db - 6}, {hz: 180, db: db - 10}, {hz: 240, db: db - 12}], binHz);
  for (let t = 0; t < HUM_SETTLE_MS; t += HOP) assert.equal(trackHum(hum(-60), state, t).size, 0, `not yet at ${t}`);
  assert.equal(trackHum(hum(-60), state, HUM_SETTLE_MS).size, 4);
  // a 7 dB jump on the 120 Hz member is a pluck landing on it: that member alone is released
  const plucked = humSeries([{hz: 60, db: -60}, {hz: 120, db: -59}, {hz: 180, db: -70}, {hz: 240, db: -72}], binHz);
  const masked = trackHum(plucked, state, HUM_SETTLE_MS + HOP);
  assert.equal(masked.size, 3); assert.ok(!masked.has(120) && masked.has(180));
  // gone for a second (a loud note buried it), back at its old level: the clock continues
  for (let t = HUM_SETTLE_MS + 2 * HOP; t < HUM_SETTLE_MS + 1000; t += HOP) trackHum(null, state, t);
  assert.equal(trackHum(hum(-60), state, HUM_SETTLE_MS + 1000).size, 3, 'held members still masked, the plucked one still settling');
  // gone longer than the hold: everything starts over
  for (let t = HUM_SETTLE_MS + 1000 + HOP; t < HUM_SETTLE_MS + 1000 + HUM_HOLD_MS + 2 * HOP; t += HOP) trackHum(null, state, t);
  assert.equal(trackHum(hum(-60), state, HUM_SETTLE_MS + 1000 + HUM_HOLD_MS + 3 * HOP).size, 0);
  // a peak 12 dB above the hum's own level keeps its reading even on a multiple
  const loud = {base: null, seen: 0, members: {}};
  const withLoud = humSeries([{hz: 60, db: -60}, {hz: 120, db: -40}, {hz: 180, db: -70}, {hz: 240, db: -72}], binHz);
  for (let t = 0; t <= HUM_SETTLE_MS; t += HOP) trackHum(withLoud, loud, t);
  assert.ok(!trackHum(withLoud, loud, HUM_SETTLE_MS + HOP).has(120));
});

for (const hz of [50, 60]) for (const rate of [44100, 48000]) {
  test(`${hz} Hz mains hum alone at ${rate} shows nothing once the tracker has settled`, () => {
    for (const db of [-45, -60, -75]) for (const [name, profile] of Object.entries(listeningProfiles)) {
      const rows = play(repeat({frequencies: [], hum: series(hz, db)}, SETTLED + 10), {rate, profile});
      assert.ok(nothingLit(rows.slice(SETTLED)), JSON.stringify({hz, rate, db, name, last: rows.at(-1).raw}));
    }
  });
  test(`${hz} Hz hum at ${rate} changes nothing while a note or a strum rings, and stays masked after`, () => {
    // hum from the start, in-tune A2 plucked after the tracker settled, decaying 3 dB a second
    const frames = [...repeat({frequencies: [], hum: series(hz, -60)}, SETTLED),
      ...Array.from({length: 40}, (_, i) => ({frequencies: [110], weights: pluck, db: -35 - 3 * i * HOP / 1000, hum: series(hz, -60)}))];
    const rows = play(frames, {rate});
    for (const r of rows.slice(SETTLED + 2)) {
      assert.equal(r.raw[1].state, 'tuned', JSON.stringify(r.raw));
      assert.ok(r.raw.every((s, i) => i === 1 || !measured(s)), 'nothing but the A string may light while hum is masked: ' + JSON.stringify(r.raw));
    }
    const detune = [-25, 15, 0, -20, 20, -18];
    const strum = hum => play(repeat({frequencies: STRINGS.map((s, i) => s.hz * 2 ** (detune[i] / 1200)), weights: pluck, db: -30, hum}, SETTLED + 5), {rate}).at(-1).raw;
    assert.deepEqual(strum(series(hz, -60)).map(s => s.state), strum(null).map(s => s.state));
  });
}

test('an ordinary sharp chord is never treated as hum: the Open G control, no hum present', () => {
  // three in-tune frames, then the whole guitar 35 cents sharp, exactly as reported
  const t = tuningFor('open-g'), cfg = {gate: -85, rejection: .35, tuning: t.id};
  const fixture = cents => audioFixture({rate: 48000, frequencies: t.strings.map(s => s.hz * 2 ** (cents / 1200)), weights: [1, .6, .3, .15], db: -55, noise: -110});
  const tuned = fixture(0), sharp = fixture(35), history = [], memory = [];
  let shown;
  for (let i = 0; i < 8; i++) { const f = i < 3 ? tuned : sharp; shown = rememberTuning(followResonance(f.spectrum, f.rate, f.rms, cfg, history, i * HOP), memory); }
  for (const i of [0, 1, 4]) { assert.equal(shown[i].state, 'sharp', JSON.stringify(shown)); assert.equal(shown[i].held, false); }
  // and the same chord held for forty frames at every rate, with a slow decay, reads the same on every frame
  for (const rate of [44100, 48000, 96000]) for (const cents of [35, 36.95]) {
    const rows = play(Array.from({length: 40}, (_, i) => ({frequencies: t.strings.map(s => s.hz * 2 ** (cents / 1200)), weights: [1, .6, .3, .15], db: -55 - i * HOP / 1000, noise: -110})), {rate, tuning: 'open-g'});
    for (const r of rows) for (const i of [0, 1, 4]) assert.equal(r.raw[i].state, 'sharp', JSON.stringify({rate, cents, i, r: r.raw}));
  }
});

test('a note plucked onto a hum multiple reads while it rings, and only that member is released', () => {
  // 50 Hz room, tracker settled, then a quiet D3 37 cents sharp (150 Hz) plucked and decaying
  const frames = [...repeat({frequencies: [], hum: series(50, -60)}, SETTLED),
    ...Array.from({length: 20}, (_, i) => ({frequencies: [STRINGS[2].hz * 2 ** (37 / 1200)], weights: pluck, db: -52 - 3 * i * HOP / 1000, hum: series(50, -60)}))];
  const rows = play(frames);
  for (const r of rows.slice(SETTLED + 1, SETTLED + 15)) {
    assert.equal(r.raw[2].state, 'sharp', JSON.stringify(r.raw)); assert.ok(Math.abs(r.raw[2].cents - 37) < 3);
    assert.ok(r.raw.every((s, i) => i === 2 || !measured(s)), 'the 100 and 200 Hz members stay masked: ' + JSON.stringify(r.raw));
  }
});

test('hum that starts later is masked within three seconds and released within a quarter second of stopping', () => {
  const frames = [...repeat({frequencies: []}, 10), ...repeat({frequencies: [], hum: series(60, -60)}, SETTLED + 12), ...repeat({frequencies: []}, 10)];
  const rows = play(frames);
  assert.ok(nothingLit(rows.slice(0, 10)));
  assert.ok(nothingLit(rows.slice(10 + SETTLED, 10 + SETTLED + 12)), JSON.stringify(rows[10 + SETTLED].raw));
  assert.ok(nothingLit(rows.slice(10 + SETTLED + 12 + 3)));
});

test('targets nearest a multiple are never masked in tune, at 96 kHz as well', () => {
  // B3 is 21.3 cents below 250 Hz, G2 is 35 below 100, D3 is 37 below 150
  for (const rate of [44100, 48000, 96000]) for (const [i, tuning] of [[4, 'standard'], [1, 'open-g'], [2, 'standard']]) {
    const t = tuningFor(tuning);
    const rows = play(repeat({frequencies: [t.strings[i].hz], weights: pluck, db: -58, hum: series(50, -60)}, SETTLED + 8), {rate, tuning});
    for (const r of rows.slice(SETTLED)) assert.ok(measured(r.raw[i]) && Math.abs(r.raw[i].cents) < 10, JSON.stringify({rate, tuning, i, r: r.raw[i]}));
  }
});

test('analyseSpectrum alone masks nothing: the mask is the tracker\'s, carried in through options', () => {
  const f = audioFixture({frequencies: [], hum: series(60, -60)});
  const bare = analyseSpectrum(f.spectrum, f.rate, f.rms, listeningProfiles.quiet);
  assert.ok(bare.some(measured), 'without a mask the hum reads as strings, as it did before');
  const masked = analyseSpectrum(f.spectrum, f.rate, f.rms, {...listeningProfiles.quiet, mask: new Set([120, 180, 240, 300, 360])});
  assert.ok(masked.every(s => !measured(s)));
});
