export const listeningProfiles = {
  quiet: { gate: -85, rejection: 0.35 },
  noisy: { gate: -55, rejection: 0.6 },
};

// Retain the intent of older controls, not a strict filter that can silently
// veto quiet notes. Unknown/blocked storage starts with the quiet-guitar preset.
export type ListeningProfile = keyof typeof listeningProfiles;
export function listeningProfile(saved: unknown, legacy?: unknown): ListeningProfile {
  if (saved === 'quiet' || saved === 'noisy') return saved;
  const gate = legacy && typeof legacy === 'object' && 'gate' in legacy ? legacy.gate : undefined;
  return typeof gate === 'number' && Number.isFinite(gate) && gate > -60 ? 'noisy' : 'quiet';
}
