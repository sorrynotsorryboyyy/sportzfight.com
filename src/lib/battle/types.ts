import type { BotLevel } from './bot';
import type { AccountType, Experience, Goal } from '@/lib/profile/onboarding';
import type { Subscription } from '@/lib/subscription';
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

  /**
   * Present only on training battles against a bot. Set at creation and never
   * written again, so an ordinary battle cannot be turned into one to unlock
   * the opponent's seat.
   */
  botLevel?: BotLevel | null;
  /** Seeds the bot's curve, so a battle can be replayed when debugging. */
  botSeed?: number | null;
}

export type BattleWithId = BattleDoc & { id: string };

/**
 * Public profile.
 *
 * Deliberately holds NO email: this document is listable by any signed-in
 * client so the leaderboard can rank it, and anything personal on it would be
 * harvestable in a single query. Email lives in users/{uid}/private/contact.
 *
 * The counters are written by the client but every delta is verified by the
 * security rules against the finished battle it claims to come from.
 */
export interface UserDoc {
  username: string;
  avatar: string | null;
  createdAt: Timestamp | null;

  /** Progression. Absent on documents created before this shipped: read as 0. */
  wins?: number;
  losses?: number;
  draws?: number;
  /**
   * Wins against a real account, and the only counter the world ranking uses.
   *
   * A bot battle still credits `wins` — the player did the reps — but the bot
   * is driven by that player's own browser, so its score is forgeable. Ranking
   * on `wins` would make the leaderboard forgeable with it.
   */
  humanWins?: number;
  xp?: number;
  coins?: number;
  totalReps?: number;
  battlesPlayed?: number;
  bestScore?: number;

  /**
   * Consecutive days claimed. Resets to 1 when the grace period lapses.
   *
   * `bonusCount` is the total number of bonuses ever claimed and never resets:
   * it names the receipt document, so a restarted streak cannot collide with
   * its own past. Both are verified by the rules against a committed receipt.
   */
  streak?: number;
  bonusCount?: number;
  lastBonusAt?: Timestamp | null;

  /**
   * Set while a finished battle is being credited, cleared when the payout
   * settles. Its presence is what lets an interrupted credit resume instead of
   * being lost or paid twice.
   */
  pendingBattleId?: string | null;

  /**
   * Onboarding answers, public half. The personal details (age, height,
   * weight, gender, city) live in users/{uid}/private/profile instead: this
   * document is listable by every signed-in account for the leaderboard.
   *
   * `experience` deliberately avoids the name `level`, which already means the
   * XP-derived level and is denied to clients.
   *
   * `accountType` is capped at 'player' for client writes — 'pro' is granted
   * by an admin approving an application.
   */
  accountType?: AccountType;
  experience?: Experience;
  goal?: Goal;
  /** Server-stamped, write-once. Its absence is what shows /bienvenue. */
  onboardedAt?: Timestamp | null;

  /**
   * Referral attribution. Written only by /api/referral through the Admin SDK
   * and denied to clients: these decide who is paid a commission.
   */
  partnerId?: string | null;
  referredBy?: string | null;
  referredAt?: Timestamp | null;

  /**
   * Paid plan, or absent for a free account.
   *
   * Written ONLY by the Stripe webhook via the Admin SDK. The rules deny this
   * field on every client path, exactly like `role`, so what a client reads
   * here is something it could not have written.
   */
  subscription?: Subscription;

  /**
   * Set BY HAND in the Firestore console; the security rules forbid every
   * client write path.
   *
   * It is NOT inert: firestore.rules reads it with a get() in isAdmin() to gate
   * partner writes, and requireAdmin() checks it server-side on every
   * /api/admin route. Custom claims would need Cloud Functions; reading the
   * document does not.
   *
   * Typed as a plain string, not the literal 'admin': the value is whatever a
   * human typed into the console, so readers must normalise before comparing.
   */
  role?: string;
}

export type UserWithId = UserDoc & { id: string };
