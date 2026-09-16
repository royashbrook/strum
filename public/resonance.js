import { analyseSpectrum, refineReadings, settings, spectralPeaks } from './analysis.js';
import { humSeries, trackHum } from './hum.js';
import { tuningFor } from './tunings.js';

const measured = s => ['flat', 'sharp', 'tuned'].includes(s.state);

// Continue an acquired pitch through a short decay, never acquire a new note
// below the user's gate. Every continuation still passes the full detector.
export function followResonance(spectrum, rate, volume, options, history, now, samples = null) {
  const config = { ...settings(options), tuning:tuningFor(options?.tuning).id };
  // Even unchanged strings must not inherit evidence from another tuning.
  if (history.some(h => h && h.tuning !== config.tuning)) history.length = 0;
  // Hum is a property of the room, not the tuning, so its memory survives a switch.
  const { binHz, prominent } = spectralPeaks(spectrum, rate, config.rejection);
  config.mask = trackHum(humSeries(prominent, binHz), history.hum ??= { base: null, seen: 0, members: {} }, now);
  // With the time-domain buffer, a measured string's cents come from the last third of a
  // second rather than the whole window; identification is unchanged and a refused
  // refinement keeps the FFT value.
  const refine = readings => samples ? refineReadings(readings, samples, rate) : readings;
  const normal = refine(analyseSpectrum(spectrum, rate, volume, config));
  const eligible = history.some(h => h && now >= h.seen && now - h.seen <= 360 && now - h.acquired <= 2500);
  const faint = volume < config.gate && eligible
    ? refine(analyseSpectrum(spectrum, rate, volume, { ...config, gate: Math.max(-85, config.gate - 18) })) : normal;
  return normal.map((s, i) => {
    if (measured(s)) {
      history[i] = { cents: s.cents, acquired: now, seen: now, tuning:config.tuning };
      return s;
    }
    const previous = history[i], next = faint[i];
    if (previous && now >= previous.seen && now - previous.seen <= 360 && now - previous.acquired <= 2500
      && measured(next) && Math.abs(next.cents - previous.cents) <= 12) {
      // Anchor to the acquired pitch, not the last weak frame: noise cannot walk
      // gradually into another note or extend its own lifetime indefinitely.
      previous.seen = now;
      return { ...next, tracking: true };
    }
    if (previous && (now < previous.seen || now - previous.seen > 360 || now - previous.acquired > 2500)) history[i] = null;
    return s;
  });
}
