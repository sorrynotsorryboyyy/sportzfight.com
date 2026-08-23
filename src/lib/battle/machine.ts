import type { BattleDoc, PlayerSlot } from './types';
import {
  COUNTDOWN_MS,
  goInstantMs,
  hardEndMs,
  STALE_MS,
} from './constants';

/**
 * What the UI should be showing right now. Derived purely from the battle
 * document plus a server-clock instant — no local state, no message passing.
 * Because both clients evaluate the same function over the same document and
 * a shared clock, they agree on the phase without coordinating.
 */
export type Phase =
  | 'waiting'      // no opponent
  | 'lobby'        // both present, arming
  | 'countdown'    // 3 - 2 - 1
  | 'active'       // effort window
  | 'ending'       // past hard end, waiting for final flushes
  | 'finished'
  | 'cancelled';

export interface BattleView {
  phase: Phase;
  /** 3, 2 or 1 during countdown; 0 at GO; null otherwise. */
  countdownDigit: number | null;
  /** Whole seconds remaining in the effort window (0..duration). */
  secondsLeft: number;
  /** 0..1 progress through the effort window. */
  progress: number;
  msLeft: number;
}

/** Pure: given a doc and the current server time, what should be on screen. */
export function deriveView(doc: BattleDoc, serverNowMs: number): BattleView {
  const idle: BattleView = {
    phase: 'waiting',
    countdownDigit: null,
    secondsLeft: doc.durationSecs,
    progress: 0,
    msLeft: doc.durationSecs * 1000,
  };

  if (doc.status === 'cancelled') return { ...idle, phase: 'cancelled' };
  if (doc.status === 'finished') {
    return { ...idle, phase: 'finished', secondsLeft: 0, progress: 1, msLeft: 0 };
  }

  if (doc.status === 'waiting' || !doc.startedAt) {
    const bothHere = !!doc.player2;
    return { ...idle, phase: bothHere ? 'lobby' : 'waiting' };
  }

  // status === 'live' (or 'ready' with a startedAt already committed)
  const startedAtMs = doc.startedAt.toMillis();
  const go = goInstantMs(startedAtMs);
  const end = hardEndMs(startedAtMs, doc.durationSecs);

  if (serverNowMs < go) {
    // Countdown: 3 while >2s remain, 2 while >1s, 1 while >0s.
    const msToGo = go - serverNowMs;
    const digit = Math.min(3, Math.max(1, Math.ceil(msToGo / 1000)));
    return {
      phase: 'countdown',
      countdownDigit: digit,
      secondsLeft: doc.durationSecs,
      progress: 0,
      msLeft: doc.durationSecs * 1000,
    };
  }

  if (serverNowMs < end) {
    const msLeft = end - serverNowMs;
    const total = doc.durationSecs * 1000;
    return {
      phase: 'active',
      countdownDigit: null,
      // ceil so the display shows "60" for the first instant and only
      // reaches 0 exactly at the end.
      secondsLeft: Math.ceil(msLeft / 1000),
      progress: 1 - msLeft / total,
      msLeft,
    };
  }

  return {
    phase: 'ending',
    countdownDigit: null,
    secondsLeft: 0,
    progress: 1,
    msLeft: 0,
  };
}

/** Which slot a uid occupies, or null for a spectator. */
export function slotOf(doc: BattleDoc, uid: string | null): PlayerSlot | null {
  if (!uid) return null;
  if (doc.player1 === uid) return 1;
  if (doc.player2 === uid) return 2;
  return null;
}

export const scoreOf = (doc: BattleDoc, slot: PlayerSlot) =>
  slot === 1 ? doc.player1Score : doc.player2Score;

export const readyOf = (doc: BattleDoc, slot: PlayerSlot) =>
  slot === 1 ? doc.player1Ready : doc.player2Ready;

export const finalOf = (doc: BattleDoc, slot: PlayerSlot) =>
  slot === 1 ? doc.player1Final : doc.player2Final;

export const uidOf = (doc: BattleDoc, slot: PlayerSlot) =>
  slot === 1 ? doc.player1 : doc.player2;

/** Both players have committed their last rep (or we timed out waiting). */
export const bothFinal = (doc: BattleDoc) => doc.player1Final && doc.player2Final;

/**
 * Is a player's heartbeat stale? Used for captaincy handover and forfeits.
 * Mirrors the STALE_MS window that firestore.rules enforces server-side.
 */
export function isStale(
  doc: BattleDoc,
  slot: PlayerSlot,
  serverNowMs: number,
): boolean {
  const hb = slot === 1 ? doc.player1HeartbeatAt : doc.player2HeartbeatAt;
  if (!hb) return true;
  return serverNowMs - hb.toMillis() > STALE_MS;
}

/**
 * The winner, derived from stored scores. This is the SAME comparison the
 * security rules recompute, so a client that submits anything else is
 * rejected. Never let a client invent this value.
 */
export function deriveWinner(doc: BattleDoc): string | 'draw' {
  if (doc.player1Score > doc.player2Score) return doc.player1;
  if (doc.player2Score > doc.player1Score) return doc.player2 ?? 'draw';
  return 'draw';
}

/** Ready to arm: two players, both toggled ready, not yet started. */
export function canStart(doc: BattleDoc): boolean {
  return (
    !!doc.player2 &&
    doc.player1Ready &&
    doc.player2Ready &&
    !doc.startedAt &&
    (doc.status === 'ready' || doc.status === 'waiting')
  );
}

/** Countdown length, exported for UI copy. */
export const countdownSeconds = COUNTDOWN_MS / 1000;
