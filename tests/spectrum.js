import { STRINGS, FFT_SIZE } from '../public/analysis.js';
// Synthetic spectra exercise app behavior, not real-guitar accuracy.
export function spectrum(strings, rate = 48000) {
  const bins = new Float32Array(FFT_SIZE / 2).fill(-120);
  for (const [index, cents = 0] of strings) {
    const f = STRINGS[index].hz * 2 ** (cents / 1200);
    for (let h = 1; h <= 6; h++) {
      const peak = f * h / rate * FFT_SIZE;
      for (let b = Math.floor(peak) - 3; b <= Math.ceil(peak) + 3; b++)
        if (b > 0 && b < bins.length) bins[b] = Math.max(bins[b], -20 - 8 * Math.log2(h) - 8 * (b - peak) ** 2);
    }
  }
  return bins;
}
