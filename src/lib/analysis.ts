import { tuningFor } from './tunings.ts';
import type {
  DetectorOptions,
  Settings,
  Reading,
  StringTarget,
  Peaks,
  ProminentPeak,
  Peak,
} from './types.ts';
import { IN_TUNE_CENTS, SEARCH_CENTS, TARGET_MARGIN_CENTS } from './policy.ts';
// Standard remains the default for callers without a saved tuning.
export const STRINGS = tuningFor('standard').strings;
export const FFT_SIZE = 32768;
export const defaults = { gate: -60, rejection: 0.35 };
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export function settings(value: unknown = {}): Settings {
  const input = value && typeof value === 'object' ? (value as Partial<Settings>) : {};
  return {
    gate:
      typeof input.gate === 'number' && Number.isFinite(input.gate)
        ? clamp(input.gate, -85, -15)
        : defaults.gate,
    rejection:
      typeof input.rejection === 'number' && Number.isFinite(input.rejection)
        ? clamp(input.rejection, 0, 1)
        : defaults.rejection,
  };
}
export function levelDb(samples: Float32Array | readonly number[]) {
  let energy = 0;
  for (const v of samples) energy += v * v;
  return samples.length ? 10 * Math.log10(Math.max(1e-12, energy / samples.length)) : -120;
}
const empty = (strings: StringTarget[]): Reading[] =>
  strings.map((s) => ({ ...s, state: 'quiet', cents: null, confidence: 0, level: 0 }));

// The peak list the detector and the hum tracker both read, so a masked peak is exactly the
// peak that would otherwise have been a candidate.
export function spectralPeaks(db: Float32Array, sampleRate: number, rejection: number): Peaks {
  const binHz = sampleRate / (db.length * 2),
    prominent: ProminentPeak[] = [],
    rawPeaks: Peak[] = [];
  for (let i = 2; i < db.length - 2 && i * binHz < 2200; i++) {
    if (!Number.isFinite(db[i]) || db[i] <= db[i - 1] || db[i] <= db[i + 1]) continue;
    const denominator = db[i - 1] - 2 * db[i] + db[i + 1];
    const offset =
      Number.isFinite(denominator) && denominator < 0
        ? clamp((db[i - 1] - db[i + 1]) / (2 * denominator), -0.5, 0.5)
        : 0;
    const peak = { hz: (i + offset) * binHz, db: db[i] };
    rawPeaks.push(peak);
    // Measure above the nearby noise, excluding the FFT window's main lobe.
    // Counting arbitrary bumps as harmonics made broadband noise look like strings.
    // Absolute FFT magnitudes vary with the window and input level: a -100 dB
    // cutoff discarded faint periodic notes even when they cleared this noise test.
    const neighbours = [];
    for (let d = -12; d <= 12; d++)
      if (Math.abs(d) >= 4 && i + d >= 0 && i + d < db.length)
        neighbours.push(Number.isFinite(db[i + d]) ? db[i + d] : -120);
    neighbours.sort((a, b) => a - b);
    const prominence = db[i] - neighbours[Math.floor(neighbours.length / 2)];
    if (prominence < 10 + rejection * 10) continue;
    prominent.push({ ...peak, prominence });
  }
  return { binHz, prominent, rawPeaks };
}

// Where a string is plucked shapes its harmonic comb: a pluck at fraction p of the
// length drives partial n by |sin(n*pi*p)|, so the harmonics near 1/p, 2/p ... are
// nulled. Read that back: flatten each harmonic's ideal 1/n rolloff and its own
// neighbourhood (which removes mic/string colour, leaving only the comb dips), then
// find the p whose |sin(n*pi*p)| dips line up with the measured ones.
//
// Two honest limits, by design: p and 1-p null the SAME harmonics, so this cannot tell
// bridge-side from nut-side and always reports the near-bridge half (p <= 0.5); and it
// resolves to roughly 1/N, so it is a flavour estimate, never a measurement. `strength`
// (0..1) is how convincingly a null was actually present; a caller shows nothing when it
// is low. `db` is indexed by harmonic, index 0 = the fundamental, null = absent (a null).
export function estimatePluck(db: (number | null)[]): { pluck: number; strength: number } {
  const flat = db.map((d, i) => (d == null ? 0 : 10 ** (d / 20) * (i + 1)));
  // Relative to each partial's neighbours, so a genuine dip survives and smooth colour cancels.
  const q = flat.map((c, n) => {
    const lo = flat[n - 1],
      hi = flat[n + 1],
      base = ((lo || 0) + (hi || 0)) / ((lo ? 1 : 0) + (hi ? 1 : 0) || 1);
    return base > 0 ? c / base : 1;
  });
  // Every harmonic the caller sampled is in range, so an absent one is a real null and
  // must stay in (it is the dip that carries the pluck point); only the unreliable
  // fundamental is dropped. The gate wants enough PRESENT partials for a real note.
  const idx = q.map((_, n) => n).filter((n) => n >= 1);
  const present = idx.filter((n) => flat[n] > 0).length;
  const dip = Math.min(1, ...idx.map((n) => q[n]));
  if (present < 3 || dip > 0.6) return { pluck: 0.5, strength: 0 };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const qbar = mean(idx.map((n) => q[n]));
  let best = { pluck: 0.5, strength: 0 };
  for (let p = 0.06; p <= 0.5001; p += 0.004) {
    const s = idx.map((n) => Math.abs(Math.sin((n + 1) * Math.PI * p)));
    const sbar = mean(s);
    let num = 0,
      dq = 0,
      ds = 0;
    idx.forEach((n, k) => {
      const a = q[n] - qbar,
        b = s[k] - sbar;
      num += a * b;
      dq += a * a;
      ds += b * b;
    });
    const r = dq > 0 && ds > 0 ? num / Math.sqrt(dq * ds) : 0;
    if (r > best.strength) best = { pluck: p, strength: r };
  }
  // Fold the correlation with the null depth: a shallow-but-correlated comb is weak.
  return { pluck: best.pluck, strength: clamp(best.strength * (1 - dip), 0, 1) };
}

export function analyseSpectrum(
  db: Float32Array,
  sampleRate: number,
  rmsDb: number,
  options: DetectorOptions = defaults,
  frame?: Peaks,
): Reading[] {
  const config = settings(options),
    strings = tuningFor(options?.tuning).strings,
    output = empty(strings);
  if (!(sampleRate > 0) || !Number.isFinite(rmsDb) || rmsDb < config.gate || db.length < 1024)
    return output;
  const { binHz, prominent, rawPeaks } = frame ?? spectralPeaks(db, sampleRate, config.rejection);
  // Established hum members (resonance.js tracks them over time) leave the candidate,
  // harmonic and loudest-peak sets. The isolation rule still sees them among the raw
  // maxima, so a note beside hum is not called isolated.
  const mask = [...(options?.mask ?? [])];
  const peaks = mask.length
    ? prominent.filter((p) => !mask.some((hz) => Math.abs(p.hz - hz) < binHz * 0.4))
    : prominent;
  if (!peaks.length) return output;
  const loudest = Math.max(...peaks.map((p) => p.db));
  const near = (hz: number, tolerance: number) =>
    peaks
      .filter((p) => Math.abs(p.hz - hz) < tolerance)
      .sort((a, b) => Math.abs(a.hz - hz) - Math.abs(b.hz - hz))[0];
  for (let i = 0; i < strings.length; i++) {
    const string = strings[i];
    // Cover the whole-tone trip between these presets. Only the nearest target
    // owns a peak, so adjacent search ranges never assign it to two strings.
    const distance = (hz: number, s: StringTarget) => Math.abs(1200 * Math.log2(hz / s.hz));
    const candidates = peaks.filter(
      (p) =>
        distance(p.hz, string) < SEARCH_CENTS &&
        p.db > loudest - 35 &&
        !strings.some(
          (s, j) => j !== i && distance(p.hz, s) < distance(p.hz, string) + TARGET_MARGIN_CENTS,
        ),
    );
    let best: (ProminentPeak & { confidence: number }) | null = null;
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
      const isolated =
        fundamental.db >= loudest - 3 &&
        !rawPeaks.some((p) => {
          if (p.db < fundamental.db - 6 || Math.abs(p.hz - fundamental.hz) < binHz * 3)
            return false;
          const h = Math.round(p.hz / fundamental.hz);
          return h < 2 || h > 6 || Math.abs(p.hz - h * fundamental.hz) > binHz * 2;
        });
      const confidence = isolated ? 1 : harmonics / 4;
      if (
        !best ||
        confidence > best.confidence ||
        (confidence === best.confidence && fundamental.db > best.db)
      )
        best = { ...fundamental, confidence };
    }
    if (!best) continue;
    // A microphone can lose the lower fundamental while leaving its overtones.
    // Two other partials must support that lower string before calling this
    // ambiguous; a genuine quiet B/high E alone must remain readable.
    const selected = best;
    const missingLower = strings.slice(0, i).some((lower, j) => {
      if (!['quiet', 'uncertain'].includes(output[j].state)) return false;
      const harmonic = Math.round(selected.hz / lower.hz),
        implied = selected.hz / harmonic;
      if (
        harmonic < 2 ||
        harmonic > 5 ||
        Math.abs(1200 * Math.log2(implied / lower.hz)) >= SEARCH_CENTS
      )
        return false;
      let support = 0;
      for (let h = 2; h <= 7; h++) {
        if (h % harmonic === 0) continue;
        const p = near(implied * h, Math.max(binHz * 1.7, implied * h * 0.004));
        if (p && p.db > selected.db - 30) support++;
      }
      return support >= 2;
    });
    const cents = 1200 * Math.log2(best.hz / string.hz);
    // Sample the harmonic ladder (fundamental first) for the pluck-comb read. A partial
    // that is absent from the peak list is a real null, so it stays null here.
    const ladder: (number | null)[] = [];
    for (let h = 1; best.hz * h < 2100; h++) {
      const p = near(best.hz * h, Math.max(binHz * 1.7, best.hz * h * 0.004));
      ladder.push(p ? p.db : null);
    }
    const { pluck, strength } = estimatePluck(ladder);
    // The first six partials as linear amplitudes relative to the strongest, so the UI can
    // draw this string's own vibration (a sum of its modes) instead of a generic wave.
    const linear = ladder.slice(0, 6).map((d) => (d == null ? 0 : 10 ** (d / 20)));
    const top = Math.max(...linear, 1e-9);
    output[i] = {
      ...string,
      measuredHz: best.hz,
      peakDb: best.db,
      confidence: missingLower ? 0 : best.confidence,
      level: clamp((best.db - loudest + 40) / 40, 0, 1),
      pluck,
      pluckStrength: strength,
      partials: linear.map((a) => a / top),
      cents,
      state:
        missingLower || best.confidence === 0 || best.confidence < config.rejection
          ? 'uncertain'
          : Math.abs(cents) <= IN_TUNE_CENTS
            ? 'tuned'
            : cents < 0
              ? 'flat'
              : 'sharp',
    };
  }
  // A single steady spectrum cannot distinguish a string from an exactly overlapping
  // overtone. Never invent an independent high E/B from the low E's harmonics.
  for (let i = 1; i < output.length; i++) {
    const upper = output[i];
    if (upper.state === 'quiet') continue;
    for (let j = 0; j < i; j++) {
      const lower = output[j];
      if (lower.state === 'quiet' || lower.state === 'uncertain') continue;
      const ratio = upper.measuredHz / lower.measuredHz,
        harmonic = Math.round(ratio);
      if (
        harmonic >= 2 &&
        harmonic <= 5 &&
        Math.abs(upper.measuredHz - harmonic * lower.measuredHz) < binHz * 1.7
      )
        upper.state = 'uncertain';
    }
  }
  return output;
}

// The analyser window is 683 ms at 48 kHz, so a peg turn is smeared across two thirds of a
// second before the FFT peak settles. Given the peak's frequency, the phase advance of that
// tone between two adjacent segments at the end of the same buffer gives the pitch of the
// last 341 ms to well under a cent, and follows a turn about twice as fast.
//
// The advance is unambiguous only within half the segment rate of the starting guess, which
// at 8192 samples is 15 cents at high E, less than a peg turn moves in a third of a second.
// So three stage lengths estimate in turn, each from the last. The lengths are commensurate,
// so agreement alone cannot rule out a shared alias (a residual of one segment rate at 2048
// wraps by one, two and four whole turns); what is checked is agreement within 10 cents
// together with real energy at the answer. While the buffer holds two pitches the stages
// disagree, and a wrapped estimate sits in the sidelobes with a fraction of the energy.
// Anything else keeps the FFT reading. In the sweeps run no accepted refinement pointed
// the wrong way; that is finite coverage, not a guarantee.
export function refineHz(
  samples: Float32Array,
  hz: number,
  sampleRate: number,
  peakDb: number,
  L = 8192,
): number | null {
  if (!samples || samples.length < 2 * L || !(hz > 0) || !Number.isFinite(peakDb)) return null;
  // One rotating phasor per segment: four multiplies a sample instead of two trigonometric
  // calls, so a frame costs well under a millisecond.
  const segment = (f: number, start: number, length: number): [number, number] => {
    const step = (2 * Math.PI * f) / sampleRate,
      cs = Math.cos(step),
      sn = Math.sin(step),
      ws = (2 * Math.PI) / length,
      wc = Math.cos(ws),
      wsn = Math.sin(ws);
    let re = 0,
      im = 0,
      pr = 1,
      pi = 0,
      hr = 1,
      hi = 0;
    for (let n = start; n < start + length; n++) {
      const v = samples[n] * (0.5 - 0.5 * hr);
      re += v * pr;
      im -= v * pi;
      const npr = pr * cs - pi * sn;
      pi = pr * sn + pi * cs;
      pr = npr;
      const nhr = hr * wc - hi * wsn;
      hi = hr * wsn + hi * wc;
      hr = nhr;
    }
    return [re, im];
  };
  const estimates = [];
  let f = hz;
  for (const length of [L / 4, L / 2, L]) {
    const [r1, i1] = segment(f, samples.length - 2 * length, length),
      [r2, i2] = segment(f, samples.length - length, length);
    if (Math.hypot(r1, i1) < 1e-9 || Math.hypot(r2, i2) < 1e-9) return null;
    const advance =
      Math.atan2(i2 * r1 - r2 * i1, r2 * r1 + i2 * i1) -
      (((2 * Math.PI * f * length) / sampleRate) % (2 * Math.PI));
    f += Math.atan2(Math.sin(advance), Math.cos(advance)) / ((2 * Math.PI * length) / sampleRate);
    estimates.push(f);
  }
  if (
    1200 * Math.log2(Math.max(...estimates) / Math.min(...estimates)) > 10 ||
    Math.abs(1200 * Math.log2(f / hz)) >= 250
  )
    return null;
  // Hann over L samples reads a sine of amplitude A as A*L/4; the analyser's Blackman
  // spectrum reads it as 20*log10(0.21*A). A wrapped or vanished tone leaves a fraction.
  const [r, i] = segment(f, samples.length - L, L);
  return (4 * Math.hypot(r, i)) / L >= (0.35 * 10 ** (peakDb / 20)) / 0.21 ? f : null;
}

// Only a measured string is refined, so refinement can never turn uncertainty into evidence,
// and measuredHz, cents and state always move together.
export function refineReadings(
  readings: Reading[],
  samples: Float32Array,
  sampleRate: number,
): Reading[] {
  return readings.map((s) => {
    if (s.state === 'quiet' || s.state === 'uncertain' || !s.measuredHz) return s;
    const hz = refineHz(samples, s.measuredHz, sampleRate, s.peakDb);
    if (hz == null) return s;
    const cents = 1200 * Math.log2(hz / s.hz);
    return {
      ...s,
      measuredHz: hz,
      cents,
      state: Math.abs(cents) <= IN_TUNE_CENTS ? 'tuned' : cents < 0 ? 'flat' : 'sharp',
    };
  });
}
