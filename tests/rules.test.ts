import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * These tests are the regression suite for the trust boundary. Every case
 * below is an attack a modified client could attempt; all of them must fail.
 */

let env: RulesTestEnvironment;

const P1 = 'player-one';
const P2 = 'player-two';
const P3 = 'player-three';
const BID = 'battle-1';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'sportzfight-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const dbOf = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

// No `code`: entry is random matchmaking and battles are addressed by
// document id. The create rule uses hasAll, so a legacy client still sending
// one is tolerated — see "still accepts a battle carrying a legacy code field".
const baseBattle = (over: Record<string, unknown> = {}) => ({
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
  createdAt: serverTimestamp(),
  startedAt: null,
  endedAt: null,
  ...over,
});

/**
 * The payload a real client sends to create a battle. Differs from the seed
 * fixture in one way that matters: the creator stamps its own heartbeat, which
 * the create rule now requires so matchmaking can see the battle immediately.
 */
const createPayload = (over: Record<string, unknown> = {}) =>
  baseBattle({ player1HeartbeatAt: serverTimestamp(), ...over });

/** Seed a doc bypassing rules. */
async function seed(data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, 'battles', BID), data);
  });
}

/** A battle mid-effort, started `agoSecs` ago in real server time. */
async function seedLive(agoSecs: number, over: Record<string, unknown> = {}) {
  await seed(
    baseBattle({
      status: 'live',
      player2: P2,
      players: [P1, P2],
      player1Ready: true,
      player2Ready: true,
      createdAt: Timestamp.now(),
      startedAt: Timestamp.fromMillis(Date.now() - agoSecs * 1000),
      ...over,
    }),
  );
}

describe('battle creation', () => {
  it('creates a battle with no code field', async () => {
    await assertSucceeds(setDoc(doc(dbOf(P1), 'battles', BID), createPayload()));
  });

  it('still accepts a battle carrying a legacy code field', async () => {
    // hasAll, not hasOnly: a client cached from before the code removal must
    // not be broken by the deploy.
    await assertSucceeds(
      setDoc(doc(dbOf(P1), 'battles', BID), createPayload({ code: 'ABC346' })),
    );
  });

  it('rejects creating a battle owned by someone else', async () => {
    await assertFails(setDoc(doc(dbOf(P2), 'battles', BID), createPayload()));
  });

  it('rejects a battle that starts with a non-zero score', async () => {
    await assertFails(
      setDoc(doc(dbOf(P1), 'battles', BID), createPayload({ player1Score: 50 })),
    );
  });

  it('rejects a battle created already live', async () => {
    await assertFails(
      setDoc(doc(dbOf(P1), 'battles', BID), createPayload({ status: 'live' })),
    );
  });

  it('rejects a create missing a required field', async () => {
    const { player1Meta: _omitted, ...withoutMeta } = createPayload() as Record<
      string,
      unknown
    >;
    await assertFails(setDoc(doc(dbOf(P1), 'battles', BID), withoutMeta));
  });

  it('requires the creator to stamp its own heartbeat', async () => {
    // Matchmaking filters candidates on heartbeat freshness, so a battle
    // created with a null heartbeat would be invisible to every searcher.
    await assertFails(
      setDoc(
        doc(dbOf(P1), 'battles', BID),
        createPayload({ player1HeartbeatAt: null }),
      ),
    );
  });

  it('rejects a forged (non-server) creation heartbeat', async () => {
    await assertFails(
      setDoc(
        doc(dbOf(P1), 'battles', BID),
        createPayload({
          player1HeartbeatAt: Timestamp.fromMillis(Date.now() + 600_000),
        }),
      ),
    );
  });

  it("rejects a creator stamping the opponent's heartbeat", async () => {
    await assertFails(
      setDoc(
        doc(dbOf(P1), 'battles', BID),
        createPayload({ player2HeartbeatAt: serverTimestamp() }),
      ),
    );
  });

  it('rejects an unauthenticated create', async () => {
    const anon = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(setDoc(doc(anon, 'battles', BID), createPayload()));
  });
});

describe('matchmaking join', () => {
  beforeEach(() =>
    seed(
      baseBattle({
        createdAt: Timestamp.now(),
        player1HeartbeatAt: Timestamp.now(),
      }),
    ),
  );

  /** Exactly what matchmaking's claim transaction writes. */
  const claim = (uid: string) => ({
    player2: uid,
    players: [P1, uid],
    status: 'ready',
    player2HeartbeatAt: serverTimestamp(),
  });

  it('lets a second player join an open battle', async () => {
    await assertSucceeds(
      updateDoc(doc(dbOf(P2), 'battles', BID), {
        player2: P2,
        players: [P1, P2],
        status: 'ready',
      }),
    );
  });

  it('accepts the claim write matchmaking actually sends', async () => {
    // If onlyTouches did not cover player2HeartbeatAt the whole client flow
    // would be denied at runtime and nothing else here would notice.
    await assertSucceeds(updateDoc(doc(dbOf(P2), 'battles', BID), claim(P2)));
  });

  it('rejects a claim on your own battle', async () => {
    await assertFails(updateDoc(doc(dbOf(P1), 'battles', BID), claim(P1)));
  });

  it("rejects a joiner stamping the creator's heartbeat", async () => {
    await assertFails(
      updateDoc(doc(dbOf(P2), 'battles', BID), {
        ...claim(P2),
        player1HeartbeatAt: serverTimestamp(),
      }),
    );
  });

  it('rejects a joiner arriving pre-readied', async () => {
    await assertFails(
      updateDoc(doc(dbOf(P2), 'battles', BID), {
        ...claim(P2),
        player2Ready: true,
      }),
    );
  });

  it('rejects a players array inconsistent with the slots', async () => {
    await assertFails(
      updateDoc(doc(dbOf(P2), 'battles', BID), {
        player2: P2,
        players: [P2, P1], // wrong order
        status: 'ready',
      }),
    );
  });

  it('rejects joining a cancelled battle', async () => {
    // Matchmaking cancels its own orphan in phase B; a racing scanner may
    // still hold a stale snapshot of that document.
    await seed(
      baseBattle({ status: 'cancelled', createdAt: Timestamp.now() }),
    );
    await assertFails(updateDoc(doc(dbOf(P2), 'battles', BID), claim(P2)));
  });

  it('rejects joining a live battle', async () => {
    await seed(
      baseBattle({
        status: 'live',
        createdAt: Timestamp.now(),
        startedAt: Timestamp.now(),
      }),
    );
    await assertFails(updateDoc(doc(dbOf(P2), 'battles', BID), claim(P2)));
  });

  it('rejects an unauthenticated join', async () => {
    const anon = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(
      updateDoc(doc(anon, 'battles', BID), {
        player2: P2,
        players: [P1, P2],
        status: 'ready',
      }),
    );
  });

  it('rejects the creator joining their own battle as player2', async () => {
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player2: P1,
        players: [P1, P1],
        status: 'ready',
      }),
    );
  });

  it('rejects joining as somebody else', async () => {
    await assertFails(
      updateDoc(doc(dbOf(P2), 'battles', BID), {
        player2: P3,
        players: [P1, P3],
        status: 'ready',
      }),
    );
  });

  it('BLOCKS A THIRD PLAYER once the battle is full', async () => {
    await seed(
      baseBattle({
        status: 'ready',
        player2: P2,
        players: [P1, P2],
        createdAt: Timestamp.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(dbOf(P3), 'battles', BID), {
        player2: P3,
        players: [P1, P3],
        status: 'ready',
      }),
    );
  });
});

describe('heartbeats and reaping — the matchmaking pool', () => {
  const waiting = (over: Record<string, unknown> = {}) =>
    baseBattle({
      createdAt: Timestamp.now(),
      player1HeartbeatAt: Timestamp.now(),
      ...over,
    });

  it('lets player1 keep a waiting battle fresh', async () => {
    // This is what keeps a battle in the candidate pool. If a rules edit ever
    // narrows validHeartbeat's status list, matchmaking goes dark.
    await seed(waiting());
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player1HeartbeatAt: serverTimestamp(),
      }),
    );
  });

  it('rejects a stranger heartbeating a waiting battle', async () => {
    // Otherwise a third party could keep a dead battle looking alive forever.
    await seed(waiting());
    await assertFails(
      updateDoc(doc(dbOf(P3), 'battles', BID), {
        player1HeartbeatAt: serverTimestamp(),
      }),
    );
  });

  it('rejects a forged heartbeat timestamp', async () => {
    // Freshness is a server-clock property; a client that can forge it can pin
    // a zombie battle at the top of the pool.
    await seed(waiting());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player1HeartbeatAt: Timestamp.fromMillis(Date.now() + 600_000),
      }),
    );
  });

  it('lets the creator cancel their own waiting battle immediately', async () => {
    // Matchmaking's phase-B orphan cleanup depends on this.
    await seed(waiting());
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        status: 'cancelled',
        endReason: 'abandoned',
        endedAt: serverTimestamp(),
      }),
    );
  });

  it('lets anyone reap a battle abandoned for over an hour', async () => {
    await seed(
      waiting({ createdAt: Timestamp.fromMillis(Date.now() - 3_700_000) }),
    );
    await assertSucceeds(
      updateDoc(doc(dbOf(P3), 'battles', BID), {
        status: 'cancelled',
        endReason: 'abandoned',
        endedAt: serverTimestamp(),
      }),
    );
  });

  it('REJECTS a stranger reaping a fresh waiting battle', async () => {
    // Stops the opportunistic reaper being weaponised into a denial of
    // service that empties the matchmaking pool.
    await seed(waiting());
    await assertFails(
      updateDoc(doc(dbOf(P3), 'battles', BID), {
        status: 'cancelled',
        endReason: 'abandoned',
        endedAt: serverTimestamp(),
      }),
    );
  });
});

describe('starting', () => {
  const armed = (over = {}) =>
    baseBattle({
      status: 'ready',
      player2: P2,
      players: [P1, P2],
      player1Ready: true,
      player2Ready: true,
      createdAt: Timestamp.now(),
      ...over,
    });

  it('lets player1 start when both are ready', async () => {
    await seed(armed());
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        status: 'live',
        startedAt: serverTimestamp(),
      }),
    );
  });

  it('rejects a start before both players are ready', async () => {
    await seed(armed({ player2Ready: false }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        status: 'live',
        startedAt: serverTimestamp(),
      }),
    );
  });

  it('rejects player2 starting while player1 is alive', async () => {
    await seed(armed({ player1HeartbeatAt: Timestamp.now() }));
    await assertFails(
      updateDoc(doc(dbOf(P2), 'battles', BID), {
        status: 'live',
        startedAt: serverTimestamp(),
      }),
    );
  });

  it('lets player2 take over once player1 has gone stale', async () => {
    await seed(
      armed({ player1HeartbeatAt: Timestamp.fromMillis(Date.now() - 60_000) }),
    );
    await assertSucceeds(
      updateDoc(doc(dbOf(P2), 'battles', BID), {
        status: 'live',
        startedAt: serverTimestamp(),
      }),
    );
  });

  it('rejects a client-supplied (backdated) startedAt', async () => {
    await seed(armed());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        status: 'live',
        startedAt: Timestamp.fromMillis(Date.now() - 600_000),
      }),
    );
  });

  it('rejects re-starting a battle that already began', async () => {
    await seed(armed({ status: 'live', startedAt: Timestamp.now() }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        status: 'live',
        startedAt: serverTimestamp(),
      }),
    );
  });
});

describe('scoring — the core anti-cheat surface', () => {
  it('lets a player raise their own score mid-battle', async () => {
    await seedLive(10);
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player1Score: 5,
        player1Meta: { autoReps: 5, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it("REJECTS writing the OPPONENT's score", async () => {
    await seedLive(10);
    // Must be a real change: a no-op write produces an empty diff and is
    // harmless by construction, so it would not exercise the rule.
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player2Score: 7,
        player2Meta: { autoReps: 7, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it("REJECTS sabotaging the opponent's score downward", async () => {
    await seedLive(10, {
      player2Score: 25,
      player2Meta: { autoReps: 25, manualAdjust: 0, source: 'camera' },
    });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player2Score: 0,
        player2Meta: { autoReps: 0, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it('REJECTS raising your own score alongside the opponent-field write', async () => {
    await seedLive(10);
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player1Score: 5,
        player1Meta: { autoReps: 5, manualAdjust: 0, source: 'camera' },
        player2Score: 1,
        player2Meta: { autoReps: 1, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it('REJECTS a score decrease', async () => {
    await seedLive(10, { player1Score: 20, player1Meta: { autoReps: 20, manualAdjust: 0, source: 'camera' } });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player1Score: 10,
        player1Meta: { autoReps: 10, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it('REJECTS an absurd score', async () => {
    await seedLive(10);
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player1Score: 999,
        player1Meta: { autoReps: 999, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it('REJECTS a single implausible jump', async () => {
    await seedLive(10);
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player1Score: 150,
        player1Meta: { autoReps: 150, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it('REJECTS provenance that does not add up', async () => {
    await seedLive(10);
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player1Score: 30,
        player1Meta: { autoReps: 2, manualAdjust: 1, source: 'camera' },
      }),
    );
  });

  it('REJECTS scoring before GO (during the countdown)', async () => {
    await seedLive(0);
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player1Score: 3,
        player1Meta: { autoReps: 3, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it('REJECTS scoring long after the timer expired', async () => {
    await seedLive(3 + 60 + 30);
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player1Score: 5,
        player1Meta: { autoReps: 5, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it('REJECTS scoring once the battle is finished', async () => {
    await seedLive(3 + 60 + 5, {
      status: 'finished',
      winner: P1,
      endReason: 'time',
      endedAt: Timestamp.now(),
    });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player1Score: 99,
        player1Meta: { autoReps: 99, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it('REJECTS a second write after the final latch', async () => {
    await seedLive(30, {
      player1Score: 10,
      player1Final: true,
      player1Meta: { autoReps: 10, manualAdjust: 0, source: 'camera' },
    });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player1Score: 20,
        player1Meta: { autoReps: 20, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it('rejects a spectator writing any score', async () => {
    await seedLive(10);
    await assertFails(
      updateDoc(doc(dbOf(P3), 'battles', BID), {
        player1Score: 5,
        player1Meta: { autoReps: 5, manualAdjust: 0, source: 'camera' },
      }),
    );
  });
});

describe('finishing — the winner cannot be asserted', () => {
  const ENDED = 3 + 60 + 5; // comfortably past hard end + slack

  it('accepts a finish naming the true winner', async () => {
    await seedLive(ENDED, {
      player1Score: 32,
      player2Score: 27,
      player1Meta: { autoReps: 32, manualAdjust: 0, source: 'camera' },
      player2Meta: { autoReps: 27, manualAdjust: 0, source: 'camera' },
    });
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        status: 'finished',
        endedAt: serverTimestamp(),
        endReason: 'time',
        winner: P1,
      }),
    );
  });

  it('REJECTS the loser declaring themselves the winner', async () => {
    await seedLive(ENDED, {
      player1Score: 10,
      player2Score: 40,
      player1Meta: { autoReps: 10, manualAdjust: 0, source: 'camera' },
      player2Meta: { autoReps: 40, manualAdjust: 0, source: 'camera' },
    });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        status: 'finished',
        endedAt: serverTimestamp(),
        endReason: 'time',
        winner: P1,
      }),
    );
  });

  it('REJECTS finishing early to freeze a lead', async () => {
    await seedLive(10, {
      player1Score: 12,
      player2Score: 3,
      player1Meta: { autoReps: 12, manualAdjust: 0, source: 'camera' },
      player2Meta: { autoReps: 3, manualAdjust: 0, source: 'camera' },
    });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        status: 'finished',
        endedAt: serverTimestamp(),
        endReason: 'time',
        winner: P1,
      }),
    );
  });

  it('requires a draw to be recorded as a draw', async () => {
    await seedLive(ENDED, {
      player1Score: 20,
      player2Score: 20,
      player1Meta: { autoReps: 20, manualAdjust: 0, source: 'camera' },
      player2Meta: { autoReps: 20, manualAdjust: 0, source: 'camera' },
    });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        status: 'finished',
        endedAt: serverTimestamp(),
        endReason: 'time',
        winner: P1,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        status: 'finished',
        endedAt: serverTimestamp(),
        endReason: 'time',
        winner: 'draw',
      }),
    );
  });

  it('rejects a stranger finalizing a recently-ended battle', async () => {
    await seedLive(ENDED, {
      player1Score: 5,
      player2Score: 1,
      player1Meta: { autoReps: 5, manualAdjust: 0, source: 'camera' },
      player2Meta: { autoReps: 1, manualAdjust: 0, source: 'camera' },
    });
    await assertFails(
      updateDoc(doc(dbOf(P3), 'battles', BID), {
        status: 'finished',
        endedAt: serverTimestamp(),
        endReason: 'time',
        winner: P1,
      }),
    );
  });

  it('lets anyone reap a long-stranded battle, with the true winner', async () => {
    await seedLive(3 + 60 + 400, {
      player1Score: 5,
      player2Score: 1,
      player1Meta: { autoReps: 5, manualAdjust: 0, source: 'camera' },
      player2Meta: { autoReps: 1, manualAdjust: 0, source: 'camera' },
    });
    await assertFails(
      updateDoc(doc(dbOf(P3), 'battles', BID), {
        status: 'finished',
        endedAt: serverTimestamp(),
        endReason: 'time',
        winner: P3,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(dbOf(P3), 'battles', BID), {
        status: 'finished',
        endedAt: serverTimestamp(),
        endReason: 'time',
        winner: P1,
      }),
    );
  });
});

describe('immutability of results', () => {
  it('never allows deleting a battle', async () => {
    await seedLive(3 + 60 + 5, { status: 'finished', winner: P1, endReason: 'time' });
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(dbOf(P1), 'battles', BID)));
  });
});

describe('user profiles', () => {
  it('lets a user create their own profile', async () => {
    await assertSucceeds(
      setDoc(doc(dbOf(P1), 'users', P1), {
        username: 'Rocky',
        email: 'r@example.com',
        avatar: null,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("rejects creating somebody else's profile", async () => {
    await assertFails(
      setDoc(doc(dbOf(P2), 'users', P1), {
        username: 'Impostor',
        email: 'x@example.com',
        avatar: null,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('rejects smuggling a wins counter onto a profile', async () => {
    await assertFails(
      setDoc(doc(dbOf(P1), 'users', P1), {
        username: 'Rocky',
        email: 'r@example.com',
        avatar: null,
        createdAt: serverTimestamp(),
        wins: 999,
      }),
    );
  });

  it('lets a signed-in user read another profile', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'users', P1), {
        username: 'Rocky',
        email: 'r@example.com',
        avatar: null,
        createdAt: Timestamp.now(),
      });
    });
    await assertSucceeds(getDoc(doc(dbOf(P2), 'users', P1)));
  });

  it('keeps the clock probe private to its owner', async () => {
    await assertSucceeds(
      setDoc(doc(dbOf(P1), 'users', P1, 'clock', 'probe'), {
        t: serverTimestamp(),
        c: Date.now(),
      }),
    );
    await assertFails(getDoc(doc(dbOf(P2), 'users', P1, 'clock', 'probe')));
  });
});

describe('user profiles — the admin role', () => {
  /**
   * `role` is set by hand in the Firestore console, which bypasses rules
   * entirely. The client must be able to READ it and never to WRITE it.
   * These are the tests that keep that true.
   */

  /** Stand-in for a console write, which runs with an admin credential. */
  const consoleSetProfile = (uid: string, data: Record<string, unknown>) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'users', uid), {
        username: 'Rocky',
        email: 'r@example.com',
        avatar: null,
        createdAt: Timestamp.now(),
        ...data,
      });
    });

  it('REJECTS a user granting itself a role at sign-up', async () => {
    await assertFails(
      setDoc(doc(dbOf(P1), 'users', P1), {
        username: 'Rocky',
        email: 'r@example.com',
        avatar: null,
        createdAt: serverTimestamp(),
        role: 'admin',
      }),
    );
  });

  it('REJECTS a user adding a role on update', async () => {
    // diff().affectedKeys() reports ADDED keys, not just changed ones.
    await consoleSetProfile(P1, {});
    await assertFails(updateDoc(doc(dbOf(P1), 'users', P1), { role: 'admin' }));
  });

  it('REJECTS a user escalating an existing role', async () => {
    await consoleSetProfile(P1, { role: 'user' });
    await assertFails(updateDoc(doc(dbOf(P1), 'users', P1), { role: 'admin' }));
  });

  it('REJECTS a user deleting its own role', async () => {
    await consoleSetProfile(P1, { role: 'admin' });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { role: deleteField() }),
    );
  });

  it('REJECTS smuggling a role alongside a legitimate username change', async () => {
    // The realistic attack: piggyback on a permitted write.
    await consoleSetProfile(P1, {});
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        username: 'Rocky II',
        role: 'admin',
      }),
    );
  });

  it("REJECTS setting a role on somebody else's profile", async () => {
    await consoleSetProfile(P1, {});
    await assertFails(updateDoc(doc(dbOf(P2), 'users', P1), { role: 'admin' }));
  });

  it('still allows a normal profile update on an account that HAS a role', async () => {
    // Without this, the negative tests above are satisfied by a rule that
    // simply froze every admin profile — a very different bug.
    await consoleSetProfile(P1, { role: 'admin' });
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        username: 'Rocky II',
        avatar: null,
      }),
    );
  });

  it('lets the client read a console-set role', async () => {
    // The whole /admin gate depends on this being readable.
    await consoleSetProfile(P1, { role: 'admin' });
    const snap = await getDoc(doc(dbOf(P1), 'users', P1));
    expect(snap.data()?.role).toBe('admin');
  });

  it('lets a signed-in user read another profile that has a role', async () => {
    await consoleSetProfile(P1, { role: 'admin' });
    await assertSucceeds(getDoc(doc(dbOf(P2), 'users', P1)));
  });
});
