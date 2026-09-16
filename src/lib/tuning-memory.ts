// Display memory only. The analyser remains the source of new pitch evidence.
import type { Reading, DisplayReading, TuningMemory } from './types.ts';
import { CONFIRMATION_FRAMES } from './policy.ts';
export function rememberTuning(readings: Reading[], history: TuningMemory[]): DisplayReading[] {
  return readings.map((reading, i) => {
    const memory = (history[i] ??= { frames: 0, tuned: false });
    if (reading.state === 'tuned') {
      // Three consecutive readings avoid saving a one-frame green flash.
      if (++memory.frames >= CONFIRMATION_FRAMES) memory.tuned = true;
      return { ...reading, state: memory.tuned ? 'tuned' : 'checking', held: false };
    }
    memory.frames = 0;
    if (reading.state === 'flat' || reading.state === 'sharp') memory.tuned = false;
    if (memory.tuned && (reading.state === 'quiet' || reading.state === 'uncertain'))
      return { ...reading, state: 'tuned', cents: null, confidence: 0, level: 0, held: true };
    return { ...reading, held: false };
  });
}
