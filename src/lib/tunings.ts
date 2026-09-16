// Six physical strings, low to high. Equal temperament, A4 = 440 Hz.
import type { Tuning } from './types.ts';
const presets: [string, string, string[], number[]][] = [
  ['standard', 'Standard', ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], [40, 45, 50, 55, 59, 64]],
  ['drop-d', 'Drop D', ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'], [38, 45, 50, 55, 59, 64]],
  ['open-d', 'Open D', ['D2', 'A2', 'D3', 'F♯3', 'A3', 'D4'], [38, 45, 50, 54, 57, 62]],
  ['open-g', 'Open G', ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'], [38, 43, 50, 55, 59, 62]],
];
export const TUNINGS: Tuning[] = presets.map(([id, name, notes, midi]) => ({
  id,
  name,
  strings: notes.map((n, i) => ({
    note: n.slice(0, -1),
    octave: Number(n.at(-1)),
    hz: 440 * 2 ** ((midi[i] - 69) / 12),
  })),
}));

export const tuningFor = (id?: string | null): Tuning =>
  TUNINGS.find((t) => t.id === id) ?? TUNINGS[0];
