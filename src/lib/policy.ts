// Release behavior, not user controls. Keep each threshold's boundary fixtures when changing it.
export const IN_TUNE_CENTS = 5;
export const SEARCH_CENTS = 250; // Covers a whole-tone preset change with room to approach.
export const TARGET_MARGIN_CENTS = 30; // Refuse ties between neighboring physical strings.
export const FRAME_INTERVAL_MS = 90;
export const CONTINUATION_GAP_MS = 360; // Lost observations cannot silently renew a track.
export const CONTINUATION_LIFETIME_MS = 2500;
export const CONTINUATION_DRIFT_CENTS = 12; // Anchored to acquisition, not a random walk.
export const CONTINUATION_FLOOR_DB = -85;
export const CONTINUATION_BELOW_GATE_DB = 18;
export const CONFIRMATION_FRAMES = 3;
