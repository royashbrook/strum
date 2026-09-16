import { analyseSpectrum, refineReadings, settings, spectralPeaks } from './analysis.ts';
import { humSeries, trackHum } from './hum.ts';
import { tuningFor } from './tunings.ts';
import {
  measured,
  type Reading,
  type Settings,
  type DetectorOptions,
  type DetectorHistory,
} from './types.ts';
import {
  CONTINUATION_GAP_MS,
  CONTINUATION_LIFETIME_MS,
  CONTINUATION_DRIFT_CENTS,
  CONTINUATION_FLOOR_DB,
  CONTINUATION_BELOW_GATE_DB,
} from './policy.ts';

export const createHistory = (): DetectorHistory => ({
  strings: [],
  hum: { base: null, seen: 0, members: {} },
});

// Continue an acquired pitch through a short decay, never acquire a new note
// below the user's gate. Every continuation still passes the full detector.
export function followResonance(
  spectrum: Float32Array,
  rate: number,
  volume: number,
  options: DetectorOptions,
  state: DetectorHistory,
  now: number,
  samples: Float32Array | null = null,
): Reading[] {
  const history = state.strings;
  const config: Settings & { tuning: string; mask?: Set<number> } = {
    ...settings(options),
    tuning: tuningFor(options?.tuning).id,
  };
  // Even unchanged strings must not inherit evidence from another tuning.
  if (history.some((h) => h && h.tuning !== config.tuning)) history.length = 0;
  // Hum is a property of the room, not the tuning, so its memory survives a switch.
  const frame = spectralPeaks(spectrum, rate, config.rejection);
  config.mask = trackHum(humSeries(frame.prominent, frame.binHz), state.hum, now);
  // With the time-domain buffer, a measured string's cents come from the last third of a
  // second rather than the whole window; identification is unchanged and a refused
  // refinement keeps the FFT value.
  const refine = (readings: Reading[]) =>
    samples ? refineReadings(readings, samples, rate) : readings;
  const normal = refine(analyseSpectrum(spectrum, rate, volume, config, frame));
  const eligible = history.some(
    (h) =>
      h &&
      now >= h.seen &&
      now - h.seen <= CONTINUATION_GAP_MS &&
      now - h.acquired <= CONTINUATION_LIFETIME_MS,
  );
  const faint =
    volume < config.gate && eligible
      ? refine(
          analyseSpectrum(
            spectrum,
            rate,
            volume,
            {
              ...config,
              gate: Math.max(CONTINUATION_FLOOR_DB, config.gate - CONTINUATION_BELOW_GATE_DB),
            },
            frame,
          ),
        )
      : normal;
  return normal.map((s, i) => {
    if (measured(s)) {
      history[i] = { cents: s.cents, acquired: now, seen: now, tuning: config.tuning };
      return s;
    }
    const previous = history[i],
      next = faint[i];
    if (
      previous &&
      now >= previous.seen &&
      now - previous.seen <= CONTINUATION_GAP_MS &&
      now - previous.acquired <= CONTINUATION_LIFETIME_MS &&
      measured(next) &&
      Math.abs(next.cents - previous.cents) <= CONTINUATION_DRIFT_CENTS
    ) {
      // Anchor to the acquired pitch, not the last weak frame: noise cannot walk
      // gradually into another note or extend its own lifetime indefinitely.
      previous.seen = now;
      return { ...next, tracking: true };
    }
    if (
      previous &&
      (now < previous.seen ||
        now - previous.seen > CONTINUATION_GAP_MS ||
        now - previous.acquired > CONTINUATION_LIFETIME_MS)
    )
      history[i] = null;
    return s;
  });
}
