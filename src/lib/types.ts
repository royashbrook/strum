export interface StringTarget {
  note: string;
  octave: number;
  hz: number;
}
export interface Tuning {
  id: string;
  name: string;
  strings: StringTarget[];
}
export interface Settings {
  gate: number;
  rejection: number;
}
export interface DetectorOptions extends Partial<Settings> {
  tuning?: string;
  mask?: Set<number>;
}
export type MeasuredState = 'flat' | 'sharp' | 'tuned';
export interface QuietReading extends StringTarget {
  state: 'quiet';
  cents: null;
  confidence: number;
  level: number;
  measuredHz?: never;
  peakDb?: never;
  tracking?: boolean;
}
export interface PitchReading extends StringTarget {
  state: MeasuredState | 'uncertain';
  cents: number;
  confidence: number;
  level: number;
  measuredHz: number;
  peakDb: number;
  tracking?: boolean;
  // Pluck location along the string, 0 = bridge, 1 = nut, estimated from the
  // harmonic comb. Bridge/nut mirror is unresolved, so this is the near-bridge
  // half (<= 0.5). Absent when the comb is too weak to place it.
  pluck?: number;
  pluckStrength?: number;
  // Linear amplitude of partials 1..6 relative to the strongest, for drawing the string's
  // own vibration shape.
  partials?: number[];
}
export type Reading = QuietReading | PitchReading;
export interface DisplayReading extends StringTarget {
  state: Reading['state'] | 'checking';
  cents: number | null;
  confidence: number;
  level: number;
  measuredHz?: number;
  peakDb?: number;
  tracking?: boolean;
  held?: boolean;
  pluck?: number;
  pluckStrength?: number;
  partials?: number[];
}
export interface Peak {
  hz: number;
  db: number;
}
export interface ProminentPeak extends Peak {
  prominence: number;
}
export interface Peaks {
  binHz: number;
  prominent: ProminentPeak[];
  rawPeaks: Peak[];
}
export interface HumMember {
  since: number;
  anchor: number;
  level: number;
  seen: number;
  graceUntil: number;
}
export interface HumState {
  base: number | null;
  seen: number;
  members: Record<number, HumMember>;
}
export interface StringHistory {
  cents: number;
  acquired: number;
  seen: number;
  tuning: string;
}
export interface DetectorHistory {
  strings: (StringHistory | null)[];
  hum: HumState;
}
export interface TuningMemory {
  frames: number;
  tuned: boolean;
}
export interface Motion {
  value: number;
  velocity: number;
}
export type MicrophoneState = 'idle' | 'requesting' | 'listening' | 'error';
export interface Capture {
  sampleRate: number;
  channelCount?: number;
  echoCancellation?: boolean | string;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export const measured = (reading: Reading): reading is PitchReading & { state: MeasuredState } =>
  reading.state === 'flat' || reading.state === 'sharp' || reading.state === 'tuned';
