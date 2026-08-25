/**
 * Levels, derived from XP.
 *
 * `level` is NEVER stored on the user document. It is a pure function of `xp`,
 * so persisting it would create a second source of truth the security rules
 * would have to police for consistency — all cost, no benefit. The rules deny
 * any write that touches a `level` field.
 *
 * Curve: cumulative XP to reach level L is 50 * (L-1) * L, which starts gentle
 * and stretches out.
 *
 *   L2 = 100    L5 = 1 000    L10 = 4 500    L20 = 19 000
 *
 * Calibrated against a real 60s battle (~30 reps): a win pays 160 XP, a loss
 * 100. So level 2 lands after about one battle, level 5 after ~8, level 10
 * after ~35 — a quick early ramp with a long tail.
 */

/** Total XP needed to have reached level `l`. */
export function xpToReach(l: number): number {
  if (l <= 1) return 0;
  return 50 * (l - 1) * l;
}

/** Current level for a given XP total. Level 1 is the floor. */
export function levelFor(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  // Largest integer L with 50*(L-1)*L <= xp.
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));
}

export interface LevelProgress {
  level: number;
  /** XP accumulated inside the current level. */
  xpIntoLevel: number;
  /** XP the current level spans, i.e. what the bar represents. */
  xpForLevel: number;
  /** Remaining XP to the next level. */
  xpToNext: number;
  /** 0..1, for the progress bar. */
  progress: number;
}

export function levelProgress(xp: number): LevelProgress {
  const safeXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  const level = levelFor(safeXp);

  const floorXp = xpToReach(level);
  const ceilXp = xpToReach(level + 1);
  const xpForLevel = ceilXp - floorXp;
  const xpIntoLevel = safeXp - floorXp;

  return {
    level,
    xpIntoLevel,
    xpForLevel,
    xpToNext: ceilXp - safeXp,
    progress: xpForLevel > 0 ? Math.min(1, xpIntoLevel / xpForLevel) : 0,
  };
}
