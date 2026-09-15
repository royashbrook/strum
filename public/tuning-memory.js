// Display memory only. The analyser remains the source of new pitch evidence.
export function rememberTuning(readings, history) {
  return readings.map((reading, i) => {
    const memory = history[i] ??= { frames: 0, tuned: false };
    if (reading.state === 'tuned') {
      // Three consecutive readings avoid saving a one-frame green flash.
      if (++memory.frames >= 3) memory.tuned = true;
      return { ...reading, state: memory.tuned ? 'tuned' : 'checking', held: false };
    }
    memory.frames = 0;
    if (reading.state === 'flat' || reading.state === 'sharp') memory.tuned = false;
    if (memory.tuned && (reading.state === 'quiet' || reading.state === 'uncertain'))
      return { ...reading, state: 'tuned', cents: null, confidence: 0, level: 0, held: true };
    return { ...reading, held: false };
  });
}
