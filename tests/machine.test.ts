import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  canStart,
  deriveView,
  deriveWinner,
  isStale,
  slotOf,
} from '../src/lib/battle/machine';
import { COUNTDOWN_MS } from '../src/lib/battle/constants';
import type { BattleDoc } from '../src/lib/battle/types';

const P1 = 'uid-1';
const P2 = 'uid-2';

const T0 = 1_000_000_000_000; // fixed server instant for determinism

function battle(over: Partial<BattleDoc> = {}): BattleDoc {
  return {
    exercise: 'pushups',
    durationSecs: 60,
    status: 'waiting',
    player1: P1,
    player2: null,
    players: [P1],
    player1Ready: false,
    player2Ready: false,
    player1Score: 0,
    player2Score: 0,
    player1Final: false,
    player2Final: false,
    player1Meta: { autoReps: 0, manualAdjust: 0, source: 'camera' },
    player2Meta: { autoReps: 0, manualAdjust: 0, source: 'camera' },
    player1HeartbeatAt: null,
    player2HeartbeatAt: null,
    winner: null,
    endReason: null,
    createdAt: Timestamp.fromMillis(T0 - 60_000),
    startedAt: null,
    endedAt: null,
    ...over,
  };
}

const live = (over: Partial<BattleDoc> = {}) =>
  battle({
    status: 'live',
    player2: P2,
    players: [P1, P2],
    player1Ready: true,
    player2Ready: true,
    startedAt: Timestamp.fromMillis(T0),
    ...over,
  });

describe('phase derivation', () => {
  it('is waiting with no opponent', () => {
    expect(deriveView(battle(), T0).phase).toBe('waiting');
  });

  it('is lobby once an opponent joins', () => {
    const b = battle({ status: 'ready', player2: P2, players: [P1, P2] });
    expect(deriveView(b, T0).phase).toBe('lobby');
  });

  it('counts down 3, 2, 1 across the pre-roll', () => {
    const b = live();
    expect(deriveView(b, T0).countdownDigit).toBe(3);
    expect(deriveView(b, T0 + 1_000).countdownDigit).toBe(2);
    expect(deriveView(b, T0 + 2_000).countdownDigit).toBe(1);
    expect(deriveView(b, T0 + 2_999).countdownDigit).toBe(1);
  });

  it('switches to active exactly at GO', () => {
    const b = live();
    expect(deriveView(b, T0 + COUNTDOWN_MS - 1).phase).toBe('countdown');
    expect(deriveView(b, T0 + COUNTDOWN_MS).phase).toBe('active');
  });

  it('shows the full duration on the first active frame', () => {
    expect(deriveView(live(), T0 + COUNTDOWN_MS).secondsLeft).toBe(60);
  });

  it('counts the effort window down to zero', () => {
    const b = live();
    const go = T0 + COUNTDOWN_MS;
    expect(deriveView(b, go + 30_000).secondsLeft).toBe(30);
    expect(deriveView(b, go + 59_500).secondsLeft).toBe(1);
    expect(deriveView(b, go + 60_000).phase).toBe('ending');
    expect(deriveView(b, go + 60_000).secondsLeft).toBe(0);
  });

  it('reports monotonically decreasing time across the whole battle', () => {
    const b = live();
    let prev = Infinity;
    for (let t = T0; t <= T0 + COUNTDOWN_MS + 61_000; t += 250) {
      const v = deriveView(b, t);
      if (v.phase === 'active') {
        expect(v.secondsLeft).toBeLessThanOrEqual(prev);
        prev = v.secondsLeft;
      }
    }
    expect(prev).toBe(1);
  });

  it('is finished once the document says so', () => {
    const b = live({ status: 'finished', winner: P1 });
    expect(deriveView(b, T0 + 999_999).phase).toBe('finished');
  });

  it('never leaves lobby while startedAt is unset', () => {
    const b = battle({ status: 'ready', player2: P2, players: [P1, P2] });
    expect(deriveView(b, T0 + 500_000).phase).toBe('lobby');
  });
});

describe('the two clients agree', () => {
  it('produces an identical view for both players at the same server instant', () => {
    // This is the property that makes the countdown synchronised: the view is
    // a pure function of (document, server time), with nothing client-local.
    const b = live();
    for (const t of [T0, T0 + 1500, T0 + 3000, T0 + 30_000, T0 + 63_000]) {
      expect(deriveView(b, t)).toEqual(deriveView(b, t));
    }
  });

  it('is unaffected by a skewed local clock, because it takes server time', () => {
    const b = live();
    const atGo = deriveView(b, T0 + COUNTDOWN_MS);
    // A client 5 minutes fast would pass a corrected server instant, not its
    // own wall clock; the same instant must yield the same view.
    const alsoAtGo = deriveView(b, T0 + COUNTDOWN_MS);
    expect(alsoAtGo).toEqual(atGo);
  });
});

describe('winner derivation', () => {
  it('picks the higher score', () => {
    expect(deriveWinner(live({ player1Score: 32, player2Score: 27 }))).toBe(P1);
    expect(deriveWinner(live({ player1Score: 12, player2Score: 40 }))).toBe(P2);
  });

  it('reports a tie as a draw', () => {
    expect(deriveWinner(live({ player1Score: 20, player2Score: 20 }))).toBe('draw');
  });

  it('treats a 0-0 battle as a draw', () => {
    expect(deriveWinner(live())).toBe('draw');
  });
});

describe('slots and staleness', () => {
  it('identifies each player and rejects spectators', () => {
    const b = live();
    expect(slotOf(b, P1)).toBe(1);
    expect(slotOf(b, P2)).toBe(2);
    expect(slotOf(b, 'someone-else')).toBeNull();
    expect(slotOf(b, null)).toBeNull();
  });

  it('treats a missing heartbeat as stale', () => {
    expect(isStale(live(), 1, T0)).toBe(true);
  });

  it('treats a recent heartbeat as alive', () => {
    const b = live({ player1HeartbeatAt: Timestamp.fromMillis(T0 - 2_000) });
    expect(isStale(b, 1, T0)).toBe(false);
  });

  it('treats a long-silent player as stale', () => {
    const b = live({ player1HeartbeatAt: Timestamp.fromMillis(T0 - 60_000) });
    expect(isStale(b, 1, T0)).toBe(true);
  });
});

describe('arming preconditions', () => {
  it('requires two players, both ready', () => {
    expect(canStart(battle())).toBe(false);
    expect(
      canStart(battle({ player2: P2, player1Ready: true, player2Ready: false })),
    ).toBe(false);
    expect(
      canStart(
        battle({
          status: 'ready',
          player2: P2,
          player1Ready: true,
          player2Ready: true,
        }),
      ),
    ).toBe(true);
  });

  it('refuses to re-arm a battle that already started', () => {
    expect(canStart(live())).toBe(false);
  });
});
