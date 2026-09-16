// Mains hum is a series at multiples of 50 or 60 Hz. Its members sit inside the search range
// of real targets (120 Hz reads as A2 +151 cents, 180 Hz as G3 -147) and the series supplies
// its own harmonic support, so a silent room with a dimmer or a fridge showed two confident
// wrong strings. A single frame cannot tell hum from a chord: an Open G guitar uniformly 35
// cents sharp puts G2, D3, G3 and D4 on 100, 150, 200 and 300 Hz. Time can. Hum holds its
// level within a decibel for as long as it lasts; a ringing string drops a couple of
// decibels a second even when it sustains well, and arrives with a jump. So a member is
// masked only once it has held within 1.5 dB for two seconds, a rise releases it at once,
// and a fall restarts its clock.
export const HUM_SETTLE_MS = 2000, HUM_STEADY_DB = 1.5, HUM_ONSET_DB = 6, HUM_RELEASE_GRACE_MS = 200;

export function humSeries(peaks, binHz) {
  let best = null;
  for (const base of [50, 60]) {
    const members = new Map();
    for (const p of peaks) {
      const k = Math.round(p.hz / base);
      // Half a percent, or 0.4 bins where that is wider: mains holds to a tenth of a percent
      // and the interpolated peak to a tenth of a bin. 1.2 bins was 30 cents at 100 Hz.
      if (k >= 1 && k <= 24 && Math.abs(p.hz - k * base) < Math.max(binHz * 0.4, k * base * 0.005) && !members.has(k)) members.set(k, p);
    }
    // The base itself must be there: no guitar string can supply 50 or 60 Hz, while an Open G
    // chord 35 cents sharp supplies 100, 150 and 200. Two more low members make a series.
    const low = [1, 2, 3, 4].filter(k => members.has(k));
    if (members.has(1) && low.length >= 3 && (!best || members.size > best.members.size)) best = { base, members, low };
  }
  return best;
}

// A loud note's window skirt can bury faint members for a few frames, and hum does not stop
// because a string was played, so the tracker holds its memory through a short absence.
export const HUM_HOLD_MS = 1500;

// state persists across frames: { base, seen, members: { k: { since, anchor, level, seen, graceUntil } } }
export function trackHum(series, state, now) {
  const stale = state.base != null && (now < state.seen || now - state.seen > HUM_HOLD_MS);
  if (stale || (series && series.base !== state.base)) { state.base = series?.base ?? null; state.members = {}; }
  if (!series) return new Set();
  state.base = series.base; state.seen = now;
  const next = {};
  for (const [k, m] of Object.entries(state.members)) if (now - m.seen <= HUM_HOLD_MS && !series.members.has(Number(k))) next[k] = m;
  for (const [k, p] of series.members) {
    const m = state.members[k], settled = m && now - m.since >= HUM_SETTLE_MS;
    if (!m || now < m.since) next[k] = { since: now, anchor: p.db, level: p.db, seen: now, graceUntil: 0 };
    // A jump, or a rise out of the band, is a pluck: release now, no grace.
    else if (p.db > m.level + HUM_ONSET_DB || p.db > m.anchor + HUM_STEADY_DB) next[k] = { since: now, anchor: p.db, level: p.db, seen: now, graceUntil: 0 };
    // A fall out of the band is decay or the hum stopping: restart the clock, but a settled
    // member keeps its mask briefly so the hum's own tail cannot flash a wrong string.
    else if (p.db < m.anchor - HUM_STEADY_DB) next[k] = { since: now, anchor: p.db, level: p.db, seen: now, graceUntil: settled ? now + HUM_RELEASE_GRACE_MS : m.graceUntil };
    else next[k] = { ...m, level: p.db, seen: now };
  }
  state.members = next;
  const masked = new Set();
  for (const [k, p] of series.members) {
    const m = next[k];
    if (now - m.since < HUM_SETTLE_MS && now >= m.graceUntil) continue;
    // The hum's own level comes from low members that cannot be this peak's partials. A
    // note 12 dB above that keeps its peaks even where they land on a multiple.
    const floor = series.low.filter(j => (k === 1 ? j !== 1 : j % k !== 0)).map(j => series.members.get(j).db).sort((a, b) => a - b);
    if (floor.length >= 2 && p.db < floor[Math.floor(floor.length / 2)] + 12) masked.add(p.hz);
  }
  return masked;
}
