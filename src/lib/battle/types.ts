import type { Timestamp } from 'firebase/firestore';

/** Lifecycle of a battle document. */
export type BattleStatus =
  | 'waiting'   // created, no opponent yet
  | 'ready'     // two players present, arming/ready toggles
  | 'live'      // startedAt is set; countdown then effort
  | 'finished'  // scores frozen, winner derived
  | 'cancelled';

export type EndReason = 'time' | 'forfeit' | 'abandoned';

/** 'draw' is a sentinel; otherwise winner holds a uid. */
export type Winner = string | 'draw' | null;

export type PlayerSlot = 1 | 2;

/**
 * Per-player provenance for a score. Rules assert
 * autoReps + manualAdjust === score, so a client cannot inflate the total
 * while claiming it came from the camera.
 */
export interface ScoreMeta {
  autoReps: number;
  manualAdjust: number;
  source: 'camera' | 'manual';
}

export interface BattleDoc {
  exercise: string;          // key into the exercise registry
  durationSecs: number;

  status: BattleStatus;

  player1: string;           // uid, immutable, == creator
  player2: string | null;
  players: string[];         // for array-contains queries

  player1Ready: boolean;
  player2Ready: boolean;

  player1Score: number;
  player2Score: number;
  player1Final: boolean;     // "I have flushed my last rep" latch
  player2Final: boolean;
  player1Meta: ScoreMeta;
  player2Meta: ScoreMeta;

  player1HeartbeatAt: Timestamp | null;
  player2HeartbeatAt: Timestamp | null;

  winner: Winner;
  endReason: EndReason | null;

  createdAt: Timestamp | null;
  startedAt: Timestamp | null;   // the single source of truth for the clock
  endedAt: Timestamp | null;
}

export type BattleWithId = BattleDoc & { id: string };

/** Public profile. wins/losses are derived by query, never client-written. */
export interface UserDoc {
  username: string;
  email: string;
  avatar: string | null;
  createdAt: Timestamp | null;
  /**
   * Set BY HAND in the Firestore console; the security rules forbid every
   * client write path. Absent on normal accounts. Because there are no Cloud
   * Functions there are no custom claims, so this can never reach
   * request.auth.token and no rule can act on it — it gates a dev-only UI and
   * nothing more. See src/app/admin/page.tsx.
   *
   * Typed as a plain string, not the literal 'admin': the value is whatever a
   * human typed into the console, so readers must normalise before comparing.
   */
  role?: string;
}

export type UserWithId = UserDoc & { id: string };
