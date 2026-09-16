// Exact critically damped spring step. Visual position only; never filters the
// detector's confidence or decides whether a string is in tune.
import type { Motion } from './types.ts';
export function easePitch(motion: Motion, target: number, seconds: number, reduced = false) {
  if (reduced) {
    motion.value = target;
    motion.velocity = 0;
    return motion.value;
  }
  const dt = Math.min(0.05, Math.max(0, seconds)),
    speed = 18;
  const offset = motion.value - target,
    term = motion.velocity + speed * offset;
  const decay = Math.exp(-speed * dt);
  motion.value = target + (offset + term * dt) * decay;
  motion.velocity = (motion.velocity - speed * term * dt) * decay;
  return motion.value;
}
