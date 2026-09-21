import { test, expect } from '@playwright/test';
import { fakeMic } from './microphone-fixture.js';
import { spectrum } from './spectrum.js';
import { STRINGS, FFT_SIZE } from '../src/lib/analysis.ts';

const setBins = (page, bins) => page.evaluate((b) => (window.testSpectrum = b), Array.from(bins));
// The synthetic spectrum has no pluck comb, so null one harmonic to fake a pluck at 1/h.
function plucked(index, h, rate = 48000) {
  const bins = spectrum([[index, 0]], rate);
  const peak = ((STRINGS[index].hz * h) / rate) * FFT_SIZE;
  for (let b = Math.floor(peak) - 4; b <= Math.ceil(peak) + 4; b++) bins[b] = -120;
  return bins;
}
// x samples of the wave path: a resting string is all 12, a wiggling one is not.
const xs = (d) => (d.match(/[ML]([\d.]+) /g) || []).map((m) => Number(m.slice(1)));
const swing = (d) => Math.max(...xs(d).map((x) => Math.abs(x - 12)));
const markY = (g) => g.evaluate((n) => Number(n.getAttribute('transform').match(/ ([\d.]+)\)/)[1]));

async function listen(page, bins) {
  await fakeMic(page);
  await page.goto('/');
  await page.locator('#listen').click();
  await setBins(page, bins);
}

test('a sounding string wiggles down its lane and the wiggle moves', async ({ page }) => {
  await listen(page, spectrum([[0, 0]]));
  const string = page.locator('.string').nth(0);
  await expect(string).toHaveAttribute('data-state', 'tuned');
  const wave = string.locator('.string-line .wave');
  await expect.poll(async () => swing(await wave.getAttribute('d'))).toBeGreaterThan(3);
  const before = await wave.getAttribute('d');
  await page.waitForTimeout(120);
  expect(await wave.getAttribute('d')).not.toBe(before);
  // A silent string stays a straight line at the centre.
  const quiet = page.locator('.string').nth(5).locator('.string-line .wave');
  expect(swing(await quiet.getAttribute('d'))).toBeLessThan(0.01);
});

test('two strings with different harmonic content draw different shapes', async ({ page }) => {
  // low E with its full ladder, A with only partials 1..3 (the detector wants two overtones
  // before it calls a string): a jagged string vs a rounder one
  const bins = spectrum([
    [0, 0],
    [1, 0],
  ]);
  for (let h = 4; h <= 6; h++) {
    const peak = ((STRINGS[1].hz * h) / 48000) * FFT_SIZE;
    for (let b = Math.floor(peak) - 4; b <= Math.ceil(peak) + 4; b++) bins[b] = -120;
  }
  await listen(page, bins);
  const e = page.locator('.string').nth(0).locator('.string-line .wave'),
    a = page.locator('.string').nth(1).locator('.string-line .wave');
  await expect.poll(async () => swing(await e.getAttribute('d'))).toBeGreaterThan(3);
  await expect.poll(async () => swing(await a.getAttribute('d'))).toBeGreaterThan(3);
  // Same instant, each shape normalised to its own swing: a different mode mix gives a
  // different profile along the string, well beyond the sampling noise.
  const [de, da] = await page.evaluate(() => {
    const w = document.querySelectorAll('.string-line .wave');
    return [w[0].getAttribute('d'), w[1].getAttribute('d')];
  });
  const profile = (d) => {
    const v = xs(d).map((x) => x - 12),
      m = Math.max(...v.map(Math.abs)) || 1;
    return v.map((x) => x / m);
  };
  const pe = profile(de),
    pa = profile(da);
  const diff = pe.reduce((s, x, i) => s + Math.abs(Math.abs(x) - Math.abs(pa[i])), 0) / pe.length;
  // Smoke level only: the fixture's overtones are gentle (8 dB per octave), so the shapes
  // differ modestly. That the partials themselves follow the spectrum is pinned in
  // pluck.test.mjs; this checks the renderer actually consumes them.
  expect(diff).toBeGreaterThan(0.04);
});

test('the pluck mark locks on the attack and holds while the string rings', async ({ page }) => {
  await listen(page, plucked(0, 4)); // pluck at 1/4: mark low on the lane
  const string = page.locator('.string').nth(0);
  await expect(string).toHaveAttribute('data-state', 'tuned');
  const mark = string.locator('.string-line .pluck-node');
  await expect
    .poll(async () => Number(await mark.evaluate((n) => n.style.opacity)))
    .toBeGreaterThan(0.1);
  const locked = await markY(mark);
  expect(locked).toBeGreaterThan(60); // 1 - 0.25 -> 75
  // The estimate moves while the note rings (harmonics decay); the mark must not.
  await setBins(page, plucked(0, 2)); // now reads as a mid-string pluck
  await page.waitForTimeout(400);
  expect(await markY(mark)).toBe(locked);
  // Silence, then a new pluck: the mark may move now.
  await page.evaluate(() => (window.testSpectrum = null));
  await expect
    .poll(async () => swing(await string.locator('.string-line .wave').getAttribute('d')))
    .toBeLessThan(0.05);
  await setBins(page, plucked(0, 2));
  await expect.poll(async () => markY(mark)).toBeLessThan(60);
});
