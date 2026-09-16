import { tuningFor } from './tunings.js';
// Standard remains the default for callers without a saved tuning.
export const STRINGS = tuningFor('standard').strings;
export const FFT_SIZE = 32768;
export const defaults = { gate: -60, rejection: 0.35 };
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function settings(value = {}) {
  return { gate: Number.isFinite(value?.gate) ? clamp(value.gate, -85, -15) : defaults.gate,
    rejection: Number.isFinite(value?.rejection) ? clamp(value.rejection, 0, 1) : defaults.rejection };
}
export function levelDb(samples) {
  let energy = 0;
  for (const v of samples) energy += v * v;
  return samples.length ? 10 * Math.log10(Math.max(1e-12, energy / samples.length)) : -120;
}
const empty = strings => strings.map(s => ({ ...s, state: 'quiet', cents: null, confidence: 0, level: 0 }));

// The peak list the detector and the hum tracker both read, so a masked peak is exactly the
// peak that would otherwise have been a candidate.
export function spectralPeaks(db, sampleRate, rejection) {
  const binHz = sampleRate / (db.length * 2), prominent = [], rawPeaks = [];
  for (let i = 2; i < db.length - 2 && i * binHz < 2200; i++) {
    if (!Number.isFinite(db[i]) || db[i] <= db[i - 1] || db[i] <= db[i + 1]) continue;
    const denominator = db[i - 1] - 2 * db[i] + db[i + 1];
    const offset = Number.isFinite(denominator) && denominator < 0
      ? clamp((db[i - 1] - db[i + 1]) / (2 * denominator), -0.5, 0.5) : 0;
    const peak = { hz: (i + offset) * binHz, db: db[i] };
    rawPeaks.push(peak);
    // Measure above the nearby noise, excluding the FFT window's main lobe.
    // Counting arbitrary bumps as harmonics made broadband noise look like strings.
    // Absolute FFT magnitudes vary with the window and input level: a -100 dB
    // cutoff discarded faint periodic notes even when they cleared this noise test.
    const neighbours = [];
    for (let d = -12; d <= 12; d++) if (Math.abs(d) >= 4 && i + d >= 0 && i + d < db.length)
      neighbours.push(Number.isFinite(db[i + d]) ? db[i + d] : -120);
    neighbours.sort((a, b) => a - b);
    const prominence = db[i] - neighbours[Math.floor(neighbours.length / 2)];
    if (prominence < 10 + rejection * 10) continue;
    prominent.push({ ...peak, prominence });
  }
  return { binHz, prominent, rawPeaks };
}

export function analyseSpectrum(db, sampleRate, rmsDb, options = defaults) {
  const config = settings(options), strings = tuningFor(options?.tuning).strings, output = empty(strings);
  if (!(sampleRate > 0) || !Number.isFinite(rmsDb) || rmsDb < config.gate || db.length < 1024) return output;
  const { binHz, prominent, rawPeaks } = spectralPeaks(db, sampleRate, config.rejection);
  // Established hum members (resonance.js tracks them over time) leave the candidate,
  // harmonic and loudest-peak sets. The isolation rule still sees them among the raw
  // maxima, so a note beside hum is not called isolated.
  const mask = options?.mask, peaks = mask?.size ? prominent.filter(p => ![...mask].some(hz => Math.abs(p.hz - hz) < binHz * 0.4)) : prominent;
  if (!peaks.length) return output;
  const loudest = Math.max(...peaks.map(p => p.db));
  const near = (hz, tolerance) => peaks.filter(p => Math.abs(p.hz - hz) < tolerance)
    .sort((a, b) => Math.abs(a.hz - hz) - Math.abs(b.hz - hz))[0];
  for (let i = 0; i < strings.length; i++) {
    const string = strings[i];
    // Cover the whole-tone trip between these presets. Only the nearest target
    // owns a peak, so adjacent search ranges never assign it to two strings.
    const distance = (hz, s) => Math.abs(1200 * Math.log2(hz / s.hz));
    const candidates = peaks.filter(p => distance(p.hz, string) < 250 && p.db > loudest - 35
      && !strings.some((s,j) => j !== i && distance(p.hz,s) < distance(p.hz,string) + 30));
    let best = null;
    for (const fundamental of candidates) {
      let harmonics = 0;
      for (let h = 2; h <= 5; h++) {
        const p = near(fundamental.hz * h, Math.max(binHz * 1.7, fundamental.hz * h * 0.004));
        if (p && p.db > fundamental.db - 30 && p.db > loudest - 48) harmonics++;
      }
      // A clear, isolated fundamental is useful after its overtones fade, notably
      // on nylon strings. Require it to dominate unrelated tones, not many overtones.
      // Judge isolation against ALL spectral peaks: filtering the competing
      // noise peaks first made a lone lucky noise peak look like a pure note.
      const isolated = fundamental.db >= loudest - 3 && !rawPeaks.some(p => {
        if (p.db < fundamental.db - 6 || Math.abs(p.hz - fundamental.hz) < binHz * 3) return false;
        const h = Math.round(p.hz / fundamental.hz);
        return h < 2 || h > 6 || Math.abs(p.hz - h * fundamental.hz) > binHz * 2;
      });
      const confidence = isolated ? 1 : harmonics / 4;
      if (!best || confidence > best.confidence || (confidence === best.confidence && fundamental.db > best.db))
        best = { ...fundamental, confidence };
    }
    if (!best) continue;
    // A microphone can lose the lower fundamental while leaving its overtones.
    // Two other partials must support that lower string before calling this
    // ambiguous; a genuine quiet B/high E alone must remain readable.
    const missingLower = strings.slice(0, i).some((lower, j) => {
      if (!['quiet', 'uncertain'].includes(output[j].state)) return false;
      const harmonic = Math.round(best.hz / lower.hz), implied = best.hz / harmonic;
      if (harmonic < 2 || harmonic > 5 || Math.abs(1200 * Math.log2(implied / lower.hz)) >= 250) return false;
      let support = 0;
      for (let h = 2; h <= 7; h++) {
        if (h % harmonic === 0) continue;
        const p = near(implied * h, Math.max(binHz * 1.7, implied * h * .004));
        if (p && p.db > best.db - 30) support++;
      }
      return support >= 2;
    });
    const cents = 1200 * Math.log2(best.hz / string.hz);
    output[i] = { ...string, measuredHz: best.hz, peakDb: best.db, confidence: missingLower ? 0 : best.confidence,
      level: clamp((best.db - loudest + 40) / 40, 0, 1), cents,
      state: missingLower || best.confidence === 0 || best.confidence < config.rejection ? 'uncertain' : Math.abs(cents) <= 5 ? 'tuned' : cents < 0 ? 'flat' : 'sharp' };
  }
  // A single steady spectrum cannot distinguish a string from an exactly overlapping
  // overtone. Never invent an independent high E/B from the low E's harmonics.
  for (let i = 1; i < output.length; i++) {
    if (output[i].state === 'quiet') continue;
    for (let j = 0; j < i; j++) {
      if (['quiet', 'uncertain'].includes(output[j].state)) continue;
      const ratio = output[i].measuredHz / output[j].measuredHz, harmonic = Math.round(ratio);
      if (harmonic >= 2 && harmonic <= 5 && Math.abs(output[i].measuredHz - harmonic * output[j].measuredHz) < binHz * 1.7)
        output[i].state = 'uncertain';
    }
  }
  return output;
}
