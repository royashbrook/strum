import { listeningProfile } from './listening.ts';
import { tuningFor } from './tunings.ts';

export function loadPreferences() {
  let profile = listeningProfile(null);
  let tuning = tuningFor();
  try {
    profile = listeningProfile(
      localStorage.getItem('strum.listening.v2'),
      JSON.parse(localStorage.getItem('strum.settings.v1') ?? 'null'),
    );
  } catch {
    /* Blocked or malformed storage leaves the quiet-guitar default. */
  }
  try {
    tuning = tuningFor(localStorage.getItem('strum.tuning.v1'));
  } catch {
    /* Standard remains usable. */
  }
  return { profile, tuning };
}

export function savePreference(key: 'strum.listening.v2' | 'strum.tuning.v1', value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Current-session settings still work. */
  }
}
