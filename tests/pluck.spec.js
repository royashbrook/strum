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

test('a sounding string wiggles down its lane and the wiggle moves', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/');
  await page.locator('#listen').click();
  await setBins(page, spectrum([[0, 0]]));
  const string = page.locator('.string').nth(0);
  await expect(string).toHaveAttribute('data-state', 'tuned');
  const wave = string.locator('.string-line .wave');
  await expect
    .poll(async () => Math.max(...xs(await wave.getAttribute('d')).map((x) => Math.abs(x - 12))))
    .toBeGreaterThan(3);
  const before = await wave.getAttribute('d');
  await page.waitForTimeout(120);
  expect(await wave.getAttribute('d')).not.toBe(before);
  // A silent string stays a straight line at the centre.
  const quiet = page.locator('.string').nth(5).locator('.string-line .wave');
  expect(Math.max(...xs(await quiet.getAttribute('d')).map((x) => Math.abs(x - 12)))).toBeLessThan(
    0.01,
  );
});

test('a nulled harmonic lights the pluck node at the matching height', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/');
  await page.locator('#listen').click();
  await setBins(page, plucked(0, 4)); // pluck at 1/4 of the string: node near the bridge
  const string = page.locator('.string').nth(0);
  await expect(string).toHaveAttribute('data-state', 'tuned');
  const node = string.locator('.string-line .pluck-node');
  await expect
    .poll(async () => Number(await node.evaluate((n) => n.style.opacity)))
    .toBeGreaterThan(0.1);
  const cy = Number(await node.getAttribute('cy'));
  expect(cy).toBeGreaterThan(60); // 1 - 0.25 -> 75, low on the lane (bridge end)
});
