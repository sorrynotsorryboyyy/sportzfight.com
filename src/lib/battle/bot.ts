import { MAX_SCORE, MAX_SCORE_JUMP } from './constants';

/**
 * A training opponent.
 *
 * Exists because a lone player used to sit in the lobby forever: matchmaking
 * finds nobody, and nothing in the app rescues them. A bot turns an empty
 * server into a playable product.
 *
 * Driven by the human's own browser, not a server — Vercel does not hold a
 * task alive for 63 seconds, and a real bot queue would be a project of its
 * own. That choice has a consequence, and it is why bot wins are kept out of
 * the world ranking: a modified client could make the bot score zero.
 *
 * The curve is deterministic given a seed, so a battle can be replayed exactly
 * when debugging, and two consecutive matches never feel identical.
 */

/** Reps a bot finishes a 60-second battle with. */
export const BOT_MIN_REPS = 18;
export const BOT_MAX_REPS = 40;

/** How hard the opponent tries. */
export type BotLevel = 'easy' | 'normal' | 'hard';

const TARGET: Record<BotLevel, [number, number]> = {
  easy: [BOT_MIN_REPS, 26],
  normal: [24, 33],
  hard: [31, BOT_MAX_REPS],
};

/**
 * Small deterministic generator.
 *
 * Not Math.random: the same seed must produce the same battle, or a bug seen
 * once can never be reproduced.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32 — short, fast, and good enough for pacing a fake athlete.
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100_000) / 100_000;
  };
}

export interface BotPlan {
  level: BotLevel;
  seed: number;
  /** What the bot ends on. */
  total: number;
  /** Cumulative reps at each 100ms step of the battle. */
  curve: readonly number[];
  stepMs: number;
}

const STEP_MS = 100;

/**
 * Build the whole battle in advance.
 *
 * Precomputed rather than improvised tick by tick: the score must be monotonic
 * and land exactly on its target, and that is far easier to guarantee — and to
 * test — when the curve exists as data.
 */
export function planBot(
  durationSecs: number,
  level: BotLevel = 'normal',
  seed = Math.floor(Math.random() * 1_000_000),
): BotPlan {
  const rand = rng(seed);
  const [lo, hi] = TARGET[level];
  const total = Math.min(MAX_SCORE, lo + Math.floor(rand() * (hi - lo + 1)));

  const steps = Math.max(1, Math.round((durationSecs * 1000) / STEP_MS));
  const curve: number[] = [];

  // A real athlete starts fast and fades. A flat rate is the single clearest
  // tell that an opponent is not human.
  const fatigue = 0.45 + rand() * 0.25; // how much the back half slows

  let emitted = 0;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    // Integral of a linearly decaying rate, normalised to finish at 1.
    const shape = (t * (2 - fatigue * t)) / (2 - fatigue);
    // A little wobble, so the reps do not arrive like clockwork.
    const jitter = (rand() - 0.5) * 0.02;
    const target = Math.round(total * Math.min(1, Math.max(0, shape + jitter)));

    // Monotonic by construction: the rules reject any decrease outright.
    emitted = Math.max(emitted, Math.min(total, target));
    curve.push(emitted);
  }

  // Land exactly on the target: a bot that stops at 27 of an intended 28 looks
  // like a bug to anyone watching the number.
  curve[curve.length - 1] = total;

  return { level, seed, total, curve, stepMs: STEP_MS };
}

/** The bot's score at `elapsedMs` into the battle. */
export function botScoreAt(plan: BotPlan, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  const i = Math.floor(elapsedMs / plan.stepMs);
  if (i >= plan.curve.length) return plan.total;
  return plan.curve[i];
}

/**
 * Is this curve one the security rules would accept?
 *
 * Used by the tests. A jump above MAX_SCORE_JUMP between two writes would be
 * rejected server-side and the bot would simply stop scoring, silently.
 */
export function curveIsWritable(plan: BotPlan, flushMs: number): boolean {
  const perFlush = Math.max(1, Math.round(flushMs / plan.stepMs));
  for (let i = perFlush; i < plan.curve.length; i += perFlush) {
    if (plan.curve[i] - plan.curve[i - perFlush] > MAX_SCORE_JUMP) return false;
  }
  return true;
}

/** Bot display names. Ordinary-looking, because the badge does the disclosure. */
const NAMES = [
  'Alex', 'Sam', 'Charlie', 'Robin', 'Camille', 'Noa',
  'Jules', 'Lou', 'Maxence', 'Ines', 'Theo', 'Manon',
] as const;

export function botName(seed: number): string {
  return NAMES[Math.abs(seed) % NAMES.length];
}
