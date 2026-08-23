/**
 * Timing contract shared by the client state machine and firestore.rules.
 *
 * IMPORTANT: firestore.rules hardcodes these same numbers (rules cannot import
 * TS). If you change a value here, change it in firestore.rules too — the
 * rules are the server-side authority and a mismatch means the client will
 * compute a deadline the backend refuses to honour.
 */

/** 3 - 2 - 1 - GO occupies [startedAt, startedAt + COUNTDOWN_MS). */
export const COUNTDOWN_MS = 3_000;

/** Effort window length for V1. Also stored per-doc as durationSecs. */
export const DEFAULT_DURATION_SECS = 60;

/**
 * Grace after the hard end during which a late score flush is still accepted.
 * Covers network latency on the final write. Rules allow writes until
 * hardEnd + SCORE_GRACE_MS; finishing is allowed from hardEnd + FINISH_SLACK_MS.
 */
export const SCORE_GRACE_MS = 2_000;
export const FINISH_SLACK_MS = 2_000;

/** Heartbeat cadence and the staleness window for captaincy handover. */
export const HEARTBEAT_MS = 5_000;
export const STALE_MS = 15_000;

/** Upper bound on a plausible score. Anything above is a tampered client. */
export const MAX_SCORE = 200;

/** Largest increase a single score flush may carry. */
export const MAX_SCORE_JUMP = 40;

/** Score flush cadence — never write at frame rate. */
export const SCORE_FLUSH_MS = 1_500;

/** How long the result screen waits for both `final` latches before showing. */
export const FINAL_LATCH_TIMEOUT_MS = 3_000;

/** A `waiting` battle older than this may be cancelled by anyone. */
export const ABANDON_WAITING_MS = 60 * 60 * 1000;

/** A `live` battle stranded this long past hard end may be finalized by anyone. */
export const STALE_LIVE_MS = 5 * 60 * 1000;

/** Derived instants, all as server-clock epoch millis. */
export const goInstantMs = (startedAtMs: number) => startedAtMs + COUNTDOWN_MS;

export const hardEndMs = (startedAtMs: number, durationSecs: number) =>
  startedAtMs + COUNTDOWN_MS + durationSecs * 1000;
