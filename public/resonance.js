import { analyseSpectrum, settings } from './analysis.js';
import { tuningFor } from './tunings.js';

const measured = s => ['flat', 'sharp', 'tuned'].includes(s.state);

// Continue an acquired pitch through a short decay, never acquire a new note
// below the user's gate. Every continuation still passes the full detector.
export function followResonance(spectrum, rate, volume, options, history, now) {
  const config = { ...settings(options), tuning:tuningFor(options?.tuning).id };
  // Even unchanged strings must not inherit evidence from another tuning.
  if (history.some(h => h && h.tuning !== config.tuning)) history.length = 0;
  const normal = analyseSpectrum(spectrum, rate, volume, config);
  const eligible = history.some(h => h && now >= h.seen && now - h.seen <= 360 && now - h.acquired <= 2500);
  const faint = volume < config.gate && eligible
    ? analyseSpectrum(spectrum, rate, volume, { ...config, gate: Math.max(-85, config.gate - 18) }) : normal;
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
