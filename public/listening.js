export const listeningProfiles = {
  quiet: { gate: -85, rejection: .35 },
  noisy: { gate: -55, rejection: .6 },
};

// Retain the intent of older controls, not a strict filter that can silently
// veto quiet notes. Unknown/blocked storage starts with the quiet-guitar preset.
export function listeningProfile(saved, legacy) {
  if (saved === 'quiet' || saved === 'noisy') return saved;
  return Number.isFinite(legacy?.gate) && legacy.gate > -60 ? 'noisy' : 'quiet';
}
