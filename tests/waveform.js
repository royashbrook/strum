import { FFT_SIZE, STRINGS, levelDb } from '../src/lib/analysis.ts';

// Deterministic audio samples, not hand-painted spectral peaks. This mirrors the
// Web Audio Blackman window + DFT, using an iterative radix-2 FFT only in tests.
export function audioFixture({ rate = 48000, notes = [[0, 0]], db = -45, weights = [1, .04, .01], noise = -100, phase = 0, decay = 0, frequencies, seed = 1234567, hum = null } = {}) {
  const n = FFT_SIZE, samples = new Float32Array(n);
  const tones = frequencies ?? notes.map(([i, cents]) => STRINGS[i].hz * 2 ** (cents / 1200));
  for (let i = 0; i < n; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    let value = (seed / 2 ** 32 * 2 - 1) * 10 ** (noise / 20);
    for (const hz of tones) for (let h = 0; h < weights.length; h++)
      value += weights[h] * Math.sin(2 * Math.PI * hz * (h + 1) * i / rate + phase * (h + 1)) * 10 ** (db / 20) * Math.exp(-decay * i / rate);
    // Mains hum: a series at multiples of the base falling off as 1/k, like a transformer or a dimmer.
    if (hum) for (let k = 1; k <= hum.harmonics; k++) value += Math.sin(2 * Math.PI * hum.hz * k * i / rate + k) / k * 10 ** (hum.db / 20);
    samples[i] = value;
  }
  return sampleFixture(samples, rate);
}

export function sampleFixture(samples, rate = 48000) {
  const n = FFT_SIZE, real = new Float64Array(n), imag = new Float64Array(n);
  samples = samples.slice(-n);
  for (let i = 0; i < n; i++)
    real[i] = samples[i] * (.42 - .5 * Math.cos(2 * Math.PI * i / n) + .08 * Math.cos(4 * Math.PI * i / n));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [real[i], real[j]] = [real[j], real[i]];
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = -2 * Math.PI / size;
    for (let start = 0; start < n; start += size) for (let j = 0; j < size / 2; j++) {
      const a = start + j, b = a + size / 2, c = Math.cos(angle * j), s = Math.sin(angle * j);
      const r = real[b] * c - imag[b] * s, m = real[b] * s + imag[b] * c;
      real[b] = real[a] - r; imag[b] = imag[a] - m; real[a] += r; imag[a] += m;
    }
  }
  return { rate, rms: levelDb(samples), samples, spectrum: Float32Array.from(real.subarray(0, n / 2), (r, i) => 20 * Math.log10(Math.max(1e-12, Math.hypot(r, imag[i]) / n))) };
}
