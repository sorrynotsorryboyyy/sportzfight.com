import {
  COINS,
  DAILY_GOAL_BATTLES,
  bonusForStreak,
} from '@/lib/progression/awards';

/**
 * How long a discount actually takes to earn.
 *
 * Shown on every product because an amount in a currency nobody can price is
 * meaningless — "380 $SC" says nothing, "about two weeks" says everything. It
 * also keeps the shop honest: if a figure here looks absurd, the economy is
 * wrong, not the label.
 */

/**
 * What one full day of the intended routine pays: the daily objective met, at
 * an even win rate, on day `n` of a streak.
 *
 * The personal-record bonus is deliberately excluded — it is occasional and
 * front-loaded, so counting on it would understate the wait for the player who
 * has stopped setting records every session.
 */
function coinsOnDay(n: number): number {
  const perBattle = (COINS.win + COINS.loss) / 2;
  return DAILY_GOAL_BATTLES * perBattle + bonusForStreak(n);
}

/** Days of unbroken play needed to reach `coins`. */
export function daysToEarn(coins: number): number {
  if (coins <= 0) return 0;
  let total = 0;
  let day = 0;
  // Bounded: a year of play covers anything the shop can price, and stops a
  // bad constant from hanging the render.
  while (total < coins && day < 365) {
    day += 1;
    total += coinsOnDay(day);
  }
  return day;
}

/** The same, phrased for a product card. */
export function weeksToEarn(coins: number): string {
  const days = daysToEarn(coins);
  if (days <= 0) return 'immédiat';
  if (days < 14) return `${days} jours`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} semaines`;
  const months = Math.round(days / 30);
  return `${months} mois`;
}
