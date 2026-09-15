import { FFT_SIZE, STRINGS } from '../public/analysis.js';
import { sampleFixture } from './waveform.js';

// A decaying pluck followed by cascaded first-order high-pass filters. This is
// a stress model, not a measurement of any particular phone microphone.
export function filteredPluck({ rate = 48000, string = 0, cents = 0, notes = [[string, cents]], seed = 700, cutoff = 300, poles = 6 } = {}) {
  const samples = new Float32Array(FFT_SIZE + Math.round(rate * .05));
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (const [string, cents] of notes) for (let h = 1; h <= 12; h++) {
    const hz = STRINGS[string].hz * 2 ** (cents / 1200) * h * Math.sqrt(1 + .0001 * h * h);
    const phase = random() * 2 * Math.PI;
    for (let i = 0; i < samples.length; i++) {
      const t = .08 + i / rate;
      samples[i] += .2 / h * Math.exp(-.4 * Math.sqrt(h) * t) * Math.sin(2 * Math.PI * hz * t + phase);
    }
  }
  for (let i = 0; i < samples.length; i++) samples[i] += .0005 * (random() * 2 - 1);
  const rc = 1 / (2 * Math.PI * cutoff), a = rc / (rc + 1 / rate);
  for (let p = 0; p < poles; p++) {
    let previous = samples[0], output = 0;
    for (let i = 0; i < samples.length; i++) {
      output = a * (output + samples[i] - previous);
      previous = samples[i]; samples[i] = output;
    }
  }
  return sampleFixture(samples, rate);
}
