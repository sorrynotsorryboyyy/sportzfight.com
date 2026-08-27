import { MAX_SCORE, MAX_SCORE_JUMP } from './constants';
import type { Experience } from '@/lib/profile/onboarding';

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
 * How many battles before real results outrank the self-assessment.
 *
 * Three, not one: a first battle is heavily contaminated by learning the
 * camera framing, and a single fluke would pin the player to the wrong tier
 * for several matches afterwards.
 */
export const BOT_LEVEL_MIN_BATTLES = 3;

/*
 * bestScore cutoffs, read against TARGET above.
 *
 *   easy   [18, 26]  midpoint 22
 *   normal [24, 33]  midpoint 28.5
 *   hard   [31, 40]  midpoint 35.5
 *
 * A player whose best is 22 meets an easy bot averaging 22: a coin flip. Same
 * at 29 against normal, and at 36 against hard. The boundaries sit midway
 * between those midpoints, so whichever side of one a player falls on, they
 * get the bot whose band their score sits nearest the centre of.
 */
const EASY_MAX_BEST = 25;
const NORMAL_MAX_BEST = 32;

const BY_EXPERIENCE: Record<Experience, BotLevel> = {
  beginner: 'easy',
  intermediate: 'normal',
  advanced: 'hard',
};

/**
 * Just the fields the tier decision reads.
 *
 * Structural rather than importing UserDoc, which already imports BotLevel
 * from this file. UserDoc satisfies it, so call sites need no cast.
 */
export interface TieringProfile {
  experience?: Experience;
  battlesPlayed?: number;
  bestScore?: number;
}

/**
 * Pick a difficulty that gives this player a real fight.
 *
 * Two-stage, because the two available signals are good at different moments.
 * Before three battles the only honest signal is what the player DECLARED at
 * onboarding — noisy, but it is what they told us, and it beats what this
 * shipped with: a hardcoded 'normal' for everyone, which left 'easy' and
 * 'hard' as dead code and sent every beginner against a 28-rep opponent.
 *
 * From three battles on, bestScore is a measurement, and a measurement beats a
 * self-assessment: people who call themselves beginners routinely put up 30
 * reps, and the reverse happens just as often.
 *
 * The goal is a CLOSE match, not a guaranteed win and not a guaranteed loss.
 *
 * `profile` is null while the auth snapshot is still in flight — that means
 * LOADING, not "no account". Callers should wait for it rather than rely on
 * this function to be right (/matchmaking already does). The fallback exists
 * so a caller that forgets gets the middle answer instead of an extreme one.
 */
export function botLevelFor(profile: TieringProfile | null | undefined): BotLevel {
  if (!profile) return 'normal';

  // Enough real results to trust them over the self-assessment.
  if ((profile.battlesPlayed ?? 0) >= BOT_LEVEL_MIN_BATTLES) {
    const best = profile.bestScore ?? 0;
    if (best <= EASY_MAX_BEST) return 'easy';
    if (best <= NORMAL_MAX_BEST) return 'normal';
    return 'hard';
  }

  // Onboarding is skippable and `experience` is optional, so its absence is
  // ordinary rather than an error. 'normal' is the honest answer to "unknown".
  const declared = profile.experience;
  return declared ? BY_EXPERIENCE[declared] : 'normal';
}

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
