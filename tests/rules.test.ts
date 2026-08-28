import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  deleteDoc,
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

/** Write any path with rules disabled — the emulator's stand-in for the console. */
async function consoleWrite(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const [col, id, ...rest] = path.split('/');
    const fs = ctx.firestore() as unknown as Firestore;
    await setDoc(rest.length ? doc(fs, col, id, ...rest) : doc(fs, col, id), data);
  });
}

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
        avatar: null,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('REJECTS an email on the profile document', async () => {
    // users/{uid} is listable by any signed-in client so the leaderboard can
    // rank it. Anything personal on it would be harvestable in one query.
    await assertFails(
      setDoc(doc(dbOf(P1), 'users', P1), {
        username: 'Rocky',
        email: 'r@example.com',
        avatar: null,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('rejects adding an email later', async () => {
    await consoleWrite('users/' + P1, { username: 'Rocky', avatar: null });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { email: 'r@example.com' }),
    );
  });

  it('keeps the email readable only by its owner', async () => {
    await assertSucceeds(
      setDoc(doc(dbOf(P1), 'users', P1, 'private', 'contact'), {
        email: 'r@example.com',
      }),
    );
    await assertFails(getDoc(doc(dbOf(P2), 'users', P1, 'private', 'contact')));
  });

  it("rejects creating somebody else's profile", async () => {
    await assertFails(
      setDoc(doc(dbOf(P2), 'users', P1), {
        username: 'Impostor',
        avatar: null,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('rejects smuggling counters onto a fresh profile', async () => {
    for (const extra of [{ wins: 99 }, { xp: 5000 }, { coins: 1000 }, { level: 40 }]) {
      await assertFails(
        setDoc(doc(dbOf(P1), 'users', P1), {
          username: 'Rocky',
          avatar: null,
          createdAt: serverTimestamp(),
          ...extra,
        }),
      );
    }
  });

  it('enforces the username charset at creation', async () => {
    for (const bad of ['Ro', 'Roc ky', 'Léo', '1Rocky', 'a'.repeat(17), 'Roc-ky']) {
      await assertFails(
        setDoc(doc(dbOf(P1), 'users', P1), {
          username: bad,
          avatar: null,
          createdAt: serverTimestamp(),
        }),
      );
    }
  });

  it('lets a signed-in user read another profile', async () => {
    await consoleWrite('users/' + P1, { username: 'Rocky', avatar: null });
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
      // No email: it lives in users/{uid}/private/contact now, and the update
      // rule denies any write that touches an email field on the profile.
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'users', uid), {
        username: 'Rocky',
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
    // Avatar, not username: renaming moved behind /api/username when the
    // client lost the right to write it. The point of the test is unchanged —
    // an admin profile must not be frozen.
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), { avatar: 'https://x/y.png' }),
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


describe('progression — counters cannot be invented', () => {
  /**
   * A client writes its own counters, so the rules must verify every delta
   * against the finished battle it claims to come from. These are the attacks
   * a modified client would actually try.
   *
   * Award contract (mirrors src/lib/progression/awards.ts):
   *   win 100 XP / 3 SC, draw 60 / 2, loss 40 / 1, plus 2 XP per rep.
   *   Beating your own bestScore adds a further 10 SC. Every fixture below
   *   starts at bestScore 0, so every payout here includes that bonus.
   */
  const FINISHED = 3 + 60 + 5;

  /** A finished battle P1 won 32-27. */
  async function seedFinished(over = {}) {
    await seedLive(FINISHED, {
      status: 'finished',
      player1Score: 32,
      player2Score: 27,
      player1Meta: { autoReps: 32, manualAdjust: 0, source: 'camera' },
      player2Meta: { autoReps: 27, manualAdjust: 0, source: 'camera' },
      winner: P1,
      endReason: 'time',
      endedAt: Timestamp.now(),
      ...over,
    });
  }

  const profile = (over = {}) => ({
    username: 'Rocky',
    avatar: null,
    wins: 0,
    losses: 0,
    draws: 0,
    humanWins: 0,
    xp: 0,
    coins: 0,
    totalReps: 0,
    battlesPlayed: 0,
    bestScore: 0,
    ...over,
  });

  /** P1's win: 100 + 32*2 = 164 XP, 3 SC + 10 PR bonus (32 > bestScore 0). */
  const p1Settle = (over = {}) => ({
    pendingBattleId: null,
    battlesPlayed: 1,
    xp: 164,
    coins: 13,
    totalReps: 32,
    wins: 1,
    losses: 0,
    draws: 0,
    // Required since bot battles arrived: the rule recomputes it, so a settle
    // that omits it is denied outright.
    humanWins: 1,
    bestScore: 32,
    ...over,
  });

  it('REJECTS inventing a win with no battle at all', async () => {
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { wins: 1, xp: 164 }),
    );
  });

  it('REJECTS setting xp or coins directly', async () => {
    await consoleWrite('users/' + P1, profile());
    for (const patch of [{ xp: 99999 }, { coins: 99999 }, { totalReps: 5000 }]) {
      await assertFails(updateDoc(doc(dbOf(P1), 'users', P1), patch));
    }
  });

  it('REJECTS writing a level field (level is derived from xp)', async () => {
    await consoleWrite('users/' + P1, profile());
    await assertFails(updateDoc(doc(dbOf(P1), 'users', P1), { level: 50 }));
  });

  it('accepts a claim for a battle you really played', async () => {
    await seedFinished();
    await consoleWrite('users/' + P1, profile());
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), { pendingBattleId: BID }),
    );
  });

  it('REJECTS claiming a battle you did not play', async () => {
    await seedFinished();
    await consoleWrite('users/' + P3, profile());
    await assertFails(
      updateDoc(doc(dbOf(P3), 'users', P3), { pendingBattleId: BID }),
    );
  });

  it('REJECTS claiming a battle that is not finished', async () => {
    await seedLive(10);
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { pendingBattleId: BID }),
    );
  });

  it('REJECTS claiming a battle id that does not exist', async () => {
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { pendingBattleId: 'no-such-battle' }),
    );
  });

  it('settles a claimed win with exactly the right amounts', async () => {
    await seedFinished();
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID }));
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), p1Settle()),
    );
  });

  it('REJECTS a settle that inflates the XP', async () => {
    await seedFinished();
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), p1Settle({ xp: 5000 })),
    );
  });

  it('REJECTS the LOSER claiming a win', async () => {
    // P2 lost 27-32. Claiming wins:1 must fail even though the battle is real
    // and P2 really played it.
    await seedFinished();
    await consoleWrite('users/' + P2, profile({ pendingBattleId: BID }));
    await assertFails(
      updateDoc(doc(dbOf(P2), 'users', P2), {
        pendingBattleId: null,
        battlesPlayed: 1,
        xp: 94,
        coins: 11,
        totalReps: 27,
        wins: 1,
        losses: 0,
        draws: 0,
        humanWins: 1,
        bestScore: 27,
      }),
    );
  });

  it("accepts the loser's correct payout", async () => {
    // 40 + 27*2 = 94 XP, 1 SC + 10 PR bonus (27 > bestScore 0), losses+1.
    await seedFinished();
    await consoleWrite('users/' + P2, profile({ pendingBattleId: BID }));
    await assertSucceeds(
      updateDoc(doc(dbOf(P2), 'users', P2), {
        pendingBattleId: null,
        battlesPlayed: 1,
        xp: 94,
        coins: 11,
        totalReps: 27,
        wins: 0,
        losses: 1,
        draws: 0,
        humanWins: 0,
        bestScore: 27,
      }),
    );
  });

  it('REJECTS claiming reps you did not do', async () => {
    await seedFinished();
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), p1Settle({ totalReps: 200 })),
    );
  });

  it('REJECTS a settle with no claim standing', async () => {
    await seedFinished();
    await consoleWrite('users/' + P1, profile()); // pendingBattleId absent
    await assertFails(updateDoc(doc(dbOf(P1), 'users', P1), p1Settle()));
  });

  it('does not let bestScore be ratcheted down', async () => {
    await seedFinished();
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID, bestScore: 90 }));
    // 32 does not beat a best of 90, so this settle earns the base 3 SC and
    // NOT the personal-record bonus.
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), p1Settle({ bestScore: 32, coins: 3 })),
    );
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), p1Settle({ bestScore: 90, coins: 3 })),
    );
  });

  it('pays the personal-record bonus only when the record actually falls', async () => {
    // The bonus is what makes progress pay more than volume, so it must not
    // leak onto every battle. 32 reps against a best of 90 earns the base only.
    await seedFinished();
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID, bestScore: 90 }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), p1Settle({ bestScore: 90, coins: 13 })),
    );
  });

  it('pays the record bonus when the score edges past the old best by one', async () => {
    await seedFinished();
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID, bestScore: 31 }));
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), p1Settle({ bestScore: 32, coins: 13 })),
    );
  });

  it('pays no record bonus for merely equalling the old best', async () => {
    await seedFinished();
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID, bestScore: 32 }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), p1Settle({ bestScore: 32, coins: 13 })),
    );
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), p1Settle({ bestScore: 32, coins: 3 })),
    );
  });

  it('lets a stuck claim be abandoned without payout', async () => {
    await seedFinished();
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID }));
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), { pendingBattleId: null }),
    );
  });

  it('THE BIG ONE: cannot claim a battle that was already credited', async () => {
    // The receipt is the only thing standing between one battle and infinite
    // XP. Rules have no memory of previous writes, so this document IS the
    // memory.
    await seedFinished();
    await consoleWrite('users/' + P1, profile());
    await consoleWrite('users/' + P1 + '/creditedBattles/' + BID, {
      at: Timestamp.now(),
    });

    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { pendingBattleId: BID }),
    );
  });

  it('a receipt can only be written for the currently claimed battle', async () => {
    await seedFinished();
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID }));

    await assertFails(
      setDoc(doc(dbOf(P1), 'users', P1, 'creditedBattles', 'some-other-battle'), {
        at: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      setDoc(doc(dbOf(P1), 'users', P1, 'creditedBattles', BID), {
        at: serverTimestamp(),
      }),
    );
  });

  it('a receipt is immutable once written', async () => {
    await consoleWrite('users/' + P1 + '/creditedBattles/' + BID, {
      at: Timestamp.now(),
    });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1, 'creditedBattles', BID), {
        at: serverTimestamp(),
      }),
    );
  });

  it("rejects touching another player's counters", async () => {
    await seedFinished();
    await consoleWrite('users/' + P2, profile({ pendingBattleId: BID }));
    await assertFails(updateDoc(doc(dbOf(P1), 'users', P2), p1Settle()));
  });
});

describe('usernames — the uniqueness lock', () => {
  it('lets a user claim a free name', async () => {
    await assertSucceeds(
      setDoc(doc(dbOf(P1), 'usernames', 'rocky'), { uid: P1 }),
    );
  });

  it('REJECTS claiming a name somebody else holds', async () => {
    await consoleWrite('usernames/rocky', { uid: P1 });
    await assertFails(setDoc(doc(dbOf(P2), 'usernames', 'rocky'), { uid: P2 }));
  });

  it('REJECTS pointing a lock at another uid', async () => {
    await assertFails(setDoc(doc(dbOf(P1), 'usernames', 'rocky'), { uid: P2 }));
  });

  it('enforces the charset on the lock key itself', async () => {
    for (const bad of ['ro', '1rocky', 'roc ky', 'Rocky']) {
      await assertFails(setDoc(doc(dbOf(P1), 'usernames', bad), { uid: P1 }));
    }
  });

  it('lets a user release only their own lock', async () => {
    await consoleWrite('usernames/rocky', { uid: P1 });
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(dbOf(P2), 'usernames', 'rocky')));
    await assertSucceeds(deleteDoc(doc(dbOf(P1), 'usernames', 'rocky')));
  });

  it('never allows a lock to be reassigned in place', async () => {
    await consoleWrite('usernames/rocky', { uid: P1 });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'usernames', 'rocky'), { uid: P2 }),
    );
  });
});

describe('usernames — legacy migration', () => {
  // Both production accounts were seeded from a Google display name
  // ("Léo Chevalier": space and accent), which the charset now rejects.
  const LEGACY = { username: 'Léo Chevalier', avatar: null };

  it('lets a legacy account change its AVATAR without fixing the name first', async () => {
    // The grandfather clause. Rules validate the post-write document, so
    // without it this write carries the illegal username and is denied —
    // freezing the account out of the very screen that fixes it.
    await consoleWrite('users/' + P1, LEGACY);
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), { avatar: 'https://x/y.png' }),
    );
  });

  it('cannot fix a legacy name from the client any more', async () => {
    // The forced-rename flow now goes through /api/username, which holds the
    // lock. A legacy name has no lock at all, which is exactly the case the
    // server route handles and the rules cannot.
    await consoleWrite('users/' + P1, LEGACY);
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { username: 'LeoChevalier' }),
    );
  });

  it('REJECTS replacing it with another non-compliant name', async () => {
    // Still denied, now for two reasons rather than one: the charset, and
    // username being server-only.
    await consoleWrite('users/' + P1, LEGACY);
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { username: 'Léo Chevalier 2' }),
    );
  });

  it('lets a legacy account still be credited for a battle', async () => {
    // The credit path must not be blocked by an old name, or legacy players
    // silently stop earning XP.
    await seedLive(3 + 60 + 5, {
      status: 'finished',
      player1Score: 10,
      player2Score: 4,
      winner: P1,
      endReason: 'time',
      endedAt: Timestamp.now(),
    });
    await consoleWrite('users/' + P1, LEGACY);
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), { pendingBattleId: BID }),
    );
  });
});

describe('progression — backfilling battles the client missed', () => {
  /**
   * Crediting normally happens on the battle screen. If the player closed the
   * tab, lost connection, or played before the XP system shipped, the payout
   * never happened — and rules cannot backfill on their own. /compte therefore
   * reconciles on load, so these are the writes that recovery depends on.
   */
  const FINISHED = 3 + 60 + 5;

  const profile = (over = {}) => ({
    username: 'Rocky',
    avatar: null,
    ...over,
  });

  it('credits an OLD finished battle that was never claimed', async () => {
    await seedLive(FINISHED, {
      status: 'finished',
      player1Score: 12,
      player2Score: 4,
      player1Meta: { autoReps: 12, manualAdjust: 0, source: 'camera' },
      player2Meta: { autoReps: 4, manualAdjust: 0, source: 'camera' },
      winner: P1,
      endReason: 'time',
      endedAt: Timestamp.now(),
    });
    // A profile with no counters at all — exactly what predates the feature.
    await consoleWrite('users/' + P1, profile());

    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), { pendingBattleId: BID }),
    );
    // 100 + 12*2 = 124 xp, 3 + 10 PR bonus = 13 coins.
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        pendingBattleId: null,
        battlesPlayed: 1,
        xp: 124,
        coins: 13,
        totalReps: 12,
        wins: 1,
        losses: 0,
        draws: 0,
        humanWins: 1,
        bestScore: 12,
      }),
    );
  });

  it('credits a 0-0 draw, the case that pays the least', async () => {
    await seedLive(FINISHED, {
      status: 'finished',
      player1Score: 0,
      player2Score: 0,
      player1Meta: { autoReps: 0, manualAdjust: 0, source: 'camera' },
      player2Meta: { autoReps: 0, manualAdjust: 0, source: 'camera' },
      winner: 'draw',
      endReason: 'time',
      endedAt: Timestamp.now(),
    });
    await consoleWrite('users/' + P1, profile());

    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), { pendingBattleId: BID }),
    );
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        pendingBattleId: null,
        battlesPlayed: 1,
        // A 0-0 draw ties bestScore 0 rather than beating it: no PR bonus.
        xp: 60,
        coins: 2,
        totalReps: 0,
        wins: 0,
        losses: 0,
        draws: 1,
        humanWins: 0,
        bestScore: 0,
      }),
    );
  });

  it('a profile carrying a console-set role can still be credited', async () => {
    // The admin account is the one being tested with; a role must not block
    // the payout path.
    await seedLive(FINISHED, {
      status: 'finished',
      player1Score: 5,
      player2Score: 1,
      winner: P1,
      endReason: 'time',
      endedAt: Timestamp.now(),
    });
    await consoleWrite('users/' + P1, profile({ role: 'admin' }));
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), { pendingBattleId: BID }),
    );
  });

  it('reconciling twice pays exactly once', async () => {
    await seedLive(FINISHED, {
      status: 'finished',
      player1Score: 12,
      player2Score: 4,
      winner: P1,
      endReason: 'time',
      endedAt: Timestamp.now(),
    });
    await consoleWrite('users/' + P1, profile());

    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), { pendingBattleId: BID }),
    );
    await assertSucceeds(
      setDoc(doc(dbOf(P1), 'users', P1, 'creditedBattles', BID), {
        at: serverTimestamp(),
      }),
    );
    // Settle clears the claim, as the real client does.
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        pendingBattleId: null,
        battlesPlayed: 1,
        xp: 124,
        coins: 13,
        totalReps: 12,
        wins: 1,
        losses: 0,
        draws: 0,
        humanWins: 1,
        bestScore: 12,
      }),
    );

    // A second pass over the same battle must now be refused at the claim —
    // the receipt is what makes reconciliation safe to run on every visit.
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { pendingBattleId: BID }),
    );
  });
});

describe('daily bonus - the streak cannot be forged', () => {
  /**
   * The retention mechanism, and therefore the thing worth attacking: the
   * bonus pays 5-45 SC for showing up, against 3 SC for winning a battle.
   *
   * Rules cannot count a collection, so the client NAMES the three battles
   * behind its claim and each one is verified. Rules also cannot see sibling
   * writes in a batch, so this is two phases like the battle payout: the
   * receipt commits first and proves the day, then the counters move against it.
   *
   * Contract (mirrors awards.ts): 5 SC per day, +10 every 3rd, +40 every 7th.
   * A "day" is a rolling 20h window; past 48h the streak restarts at 1.
   */
  const HOUR = 3_600_000;

  /** A finished battle `id`, concluded `hoursAgo`, that P1 really played. */
  async function seedBattle(id: string, hoursAgo: number) {
    await consoleWrite('battles/' + id, baseBattle({
      status: 'finished',
      player2: P2,
      players: [P1, P2],
      player1Ready: true,
      player2Ready: true,
      player1Score: 30,
      player2Score: 20,
      winner: P1,
      endReason: 'time',
      createdAt: Timestamp.fromMillis(Date.now() - hoursAgo * HOUR),
      startedAt: Timestamp.fromMillis(Date.now() - hoursAgo * HOUR),
      endedAt: Timestamp.fromMillis(Date.now() - hoursAgo * HOUR),
    }));
  }

  /** Three fresh finished battles: the daily objective, satisfied. */
  async function seedThree(hoursAgo = 1) {
    await seedBattle('b-a', hoursAgo);
    await seedBattle('b-b', hoursAgo);
    await seedBattle('b-c', hoursAgo);
  }

  const player = (over = {}) => ({
    username: 'Rocky',
    avatar: null,
    coins: 0,
    streak: 0,
    bonusCount: 0,
    ...over,
  });

  const receipt = (over = {}) => ({
    at: serverTimestamp(),
    streak: 1,
    b1: 'b-a',
    b2: 'b-b',
    b3: 'b-c',
    ...over,
  });

  const claimRef = (k: number) => doc(dbOf(P1), 'users', P1, 'dailyBonus', String(k));

  // ---------------- the legitimate path ----------------

  it('accepts a first claim backed by three real battles', async () => {
    await seedThree();
    await consoleWrite('users/' + P1, player());
    await assertSucceeds(setDoc(claimRef(1), receipt()));
  });

  it('pays exactly the first day rate, and refuses any other amount', async () => {
    await seedThree();
    await consoleWrite('users/' + P1, player());
    await assertSucceeds(setDoc(claimRef(1), receipt()));

    const at = (await getDoc(claimRef(1))).data()!.at;
    const payout = (coins: number) => ({
      coins,
      streak: 1,
      bonusCount: 1,
      lastBonusAt: at,
    });

    await assertFails(updateDoc(doc(dbOf(P1), 'users', P1), payout(45)));
    await assertFails(updateDoc(doc(dbOf(P1), 'users', P1), payout(6)));
    await assertSucceeds(updateDoc(doc(dbOf(P1), 'users', P1), payout(5)));
  });

  it('pays the 3rd-day and 7th-day milestones exactly', async () => {
    // Day 3 is 5 + 10; day 7 is 5 + 40. These are the numbers that make a
    // streak worth protecting, so they must be exact.
    //
    // A prior receipt has to exist and be old enough, because a FIRST receipt
    // is day 1 by rule however the client labels it — that is what stops
    // someone opening on a milestone.
    for (const [streak, coins] of [[3, 15], [7, 45]] as const) {
      await env.clearFirestore();
      await seedThree(1);
      await consoleWrite('users/' + P1, player({ streak: streak - 1, bonusCount: 1 }));
      // Yesterday's receipt: inside the 48h grace, past the 20h window.
      await consoleWrite('users/' + P1 + '/dailyBonus/1', {
        at: Timestamp.fromMillis(Date.now() - 24 * HOUR),
        streak: streak - 1,
        b1: 'old-a',
        b2: 'old-b',
        b3: 'old-c',
      });

      await assertSucceeds(setDoc(claimRef(2), receipt({ streak })));
      const at = (await getDoc(claimRef(2))).data()!.at;
      await assertSucceeds(
        updateDoc(doc(dbOf(P1), 'users', P1), {
          coins,
          streak,
          bonusCount: 2,
          lastBonusAt: at,
        }),
      );
    }
  });

  it('restarts the streak at 1 once the grace period has lapsed', async () => {
    // Three days running then a week off must not resume at day 4.
    await seedThree(1);
    await consoleWrite('users/' + P1, player({ streak: 3, bonusCount: 1 }));
    await consoleWrite('users/' + P1 + '/dailyBonus/1', {
      at: Timestamp.fromMillis(Date.now() - 96 * HOUR),
      streak: 3,
      b1: 'old-a',
      b2: 'old-b',
      b3: 'old-c',
    });

    await assertFails(setDoc(claimRef(2), receipt({ streak: 4 })));
    await assertSucceeds(setDoc(claimRef(2), receipt({ streak: 1 })));
  });

  it('continues the streak inside the grace period', async () => {
    await seedThree(1);
    await consoleWrite('users/' + P1, player({ streak: 3, bonusCount: 1 }));
    await consoleWrite('users/' + P1 + '/dailyBonus/1', {
      at: Timestamp.fromMillis(Date.now() - 30 * HOUR),
      streak: 3,
      b1: 'old-a',
      b2: 'old-b',
      b3: 'old-c',
    });

    await assertFails(setDoc(claimRef(2), receipt({ streak: 1 })));
    await assertSucceeds(setDoc(claimRef(2), receipt({ streak: 4 })));
  });

  it('REFUSES replaying battles that predate the previous bonus', async () => {
    // One good day must not be farmed forever: the battles behind a claim have
    // to have finished after the last one was paid.
    await seedThree(60);
    await consoleWrite('users/' + P1, player({ streak: 1, bonusCount: 1 }));
    await consoleWrite('users/' + P1 + '/dailyBonus/1', {
      at: Timestamp.fromMillis(Date.now() - 30 * HOUR),
      streak: 1,
      b1: 'old-a',
      b2: 'old-b',
      b3: 'old-c',
    });

    await assertFails(setDoc(claimRef(2), receipt({ streak: 2 })));
  });

  // ---------------- the attacks ----------------

  it('REFUSES a second claim inside the same window', async () => {
    await seedThree();
    await consoleWrite('users/' + P1, player());
    await assertSucceeds(setDoc(claimRef(1), receipt()));
    await consoleWrite('users/' + P1, player({ bonusCount: 1, streak: 1 }));
    await assertFails(setDoc(claimRef(2), receipt({ streak: 2 })));
  });

  it('REFUSES skipping a receipt number to reach a milestone early', async () => {
    await seedThree();
    await consoleWrite('users/' + P1, player());
    // Jumping straight to receipt 7 would pay the 45 SC milestone on day one.
    await assertFails(setDoc(claimRef(7), receipt({ streak: 7 })));
  });

  it('REFUSES a streak number the elapsed time does not justify', async () => {
    await seedThree();
    await consoleWrite('users/' + P1, player());
    // A first receipt is day 1, whatever the client would like it to be.
    await assertFails(setDoc(claimRef(1), receipt({ streak: 7 })));
    await assertFails(setDoc(claimRef(1), receipt({ streak: 2 })));
  });

  it('REFUSES the same battle counted three times', async () => {
    await seedBattle('b-a', 1);
    await consoleWrite('users/' + P1, player());
    await assertFails(
      setDoc(claimRef(1), receipt({ b1: 'b-a', b2: 'b-a', b3: 'b-a' })),
    );
  });

  it('REFUSES a battle the player never took part in', async () => {
    await seedThree();
    await consoleWrite('battles/b-other', baseBattle({
      status: 'finished',
      player1: P2,
      player2: P3,
      players: [P2, P3],
      winner: P2,
      endReason: 'time',
      createdAt: Timestamp.now(),
      startedAt: Timestamp.now(),
      endedAt: Timestamp.now(),
    }));
    await consoleWrite('users/' + P1, player());
    await assertFails(setDoc(claimRef(1), receipt({ b3: 'b-other' })));
  });

  it('REFUSES a battle that never finished', async () => {
    await seedBattle('b-a', 1);
    await seedBattle('b-b', 1);
    await consoleWrite('battles/b-open', baseBattle({
      status: 'live',
      player2: P2,
      players: [P1, P2],
      createdAt: Timestamp.now(),
      startedAt: Timestamp.now(),
    }));
    await consoleWrite('users/' + P1, player());
    await assertFails(setDoc(claimRef(1), receipt({ b3: 'b-open' })));
  });

  it('REFUSES a battle that does not exist at all', async () => {
    await seedBattle('b-a', 1);
    await seedBattle('b-b', 1);
    await consoleWrite('users/' + P1, player());
    await assertFails(setDoc(claimRef(1), receipt({ b3: 'b-ghost' })));
  });

  it('REFUSES a client-chosen timestamp instead of the server clock', async () => {
    // Faking `at` is how a client would shrink the 20h window.
    await seedThree();
    await consoleWrite('users/' + P1, player());
    await assertFails(
      setDoc(claimRef(1), receipt({ at: Timestamp.fromMillis(Date.now() - 40 * HOUR) })),
    );
  });

  it('REFUSES rewriting or deleting a receipt once it exists', async () => {
    // Immutability is what makes the receipt a memory rules otherwise lack.
    await seedThree();
    await consoleWrite('users/' + P1, player());
    await assertSucceeds(setDoc(claimRef(1), receipt()));
    await assertFails(setDoc(claimRef(1), receipt({ streak: 7 })));
    await assertFails(deleteDoc(claimRef(1)));
  });

  it('REFUSES paying without a committed receipt', async () => {
    // The whole point of two phases: money never moves on an unproven claim.
    await consoleWrite('users/' + P1, player());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        coins: 5,
        streak: 1,
        bonusCount: 1,
        lastBonusAt: Timestamp.now(),
      }),
    );
  });

  it('REFUSES a payout whose streak disagrees with its receipt', async () => {
    await seedThree();
    await consoleWrite('users/' + P1, player());
    await assertSucceeds(setDoc(claimRef(1), receipt({ streak: 1 })));
    const at = (await getDoc(claimRef(1))).data()!.at;
    // The receipt says day 1 (5 SC); claiming day 7 against it must fail.
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        coins: 45,
        streak: 7,
        bonusCount: 1,
        lastBonusAt: at,
      }),
    );
  });

  it('REFUSES a payout stamped with anything but the receipt instant', async () => {
    await seedThree();
    await consoleWrite('users/' + P1, player());
    await assertSucceeds(setDoc(claimRef(1), receipt()));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        coins: 5,
        streak: 1,
        bonusCount: 1,
        lastBonusAt: Timestamp.fromMillis(Date.now() - 30 * HOUR),
      }),
    );
  });

  it('REFUSES touching other counters while claiming a bonus', async () => {
    // The bonus branch must not become a door onto wins or xp.
    await seedThree();
    await consoleWrite('users/' + P1, player({ wins: 0, xp: 0 }));
    await assertSucceeds(setDoc(claimRef(1), receipt()));
    const at = (await getDoc(claimRef(1))).data()!.at;
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        coins: 5,
        streak: 1,
        bonusCount: 1,
        lastBonusAt: at,
        wins: 99,
      }),
    );
  });

  it('REFUSES claiming into another account streak', async () => {
    await seedThree();
    await consoleWrite('users/' + P2, player());
    await assertFails(
      setDoc(doc(dbOf(P1), 'users', P2, 'dailyBonus', '1'), receipt()),
    );
  });

  it('keeps a streak private to its owner', async () => {
    await seedThree();
    await consoleWrite('users/' + P1, player());
    await consoleWrite('users/' + P1 + '/dailyBonus/1', {
      at: Timestamp.now(),
      streak: 1,
      b1: 'b-a',
      b2: 'b-b',
      b3: 'b-c',
    });
    await assertFails(getDoc(doc(dbOf(P2), 'users', P1, 'dailyBonus', '1')));
  });
});

describe('subscription - only the webhook can grant a paid plan', () => {
  /**
   * `subscription` is written exclusively by the Stripe webhook through the
   * Admin SDK, which bypasses rules by design. So the rules' job here is
   * absolute: NO client path may touch the field, on any branch.
   *
   * If any of these passed, anyone could give themselves Premium for free —
   * and, worse, could extend it indefinitely without ever paying.
   */
  const FINISHED = 3 + 60 + 5;

  const paid = (over = {}) => ({
    plan: 'premium',
    status: 'active',
    currentPeriodEnd: { seconds: Math.floor(Date.now() / 1000) + 86_400 },
    ...over,
  });

  const profile = (over = {}) => ({
    username: 'Rocky',
    avatar: null,
    wins: 0,
    losses: 0,
    draws: 0,
    humanWins: 0,
    xp: 0,
    coins: 0,
    totalReps: 0,
    battlesPlayed: 0,
    bestScore: 0,
    ...over,
  });

  it('REFUSES granting oneself a subscription', async () => {
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { subscription: paid() }),
    );
  });

  it('REFUSES smuggling one alongside a legitimate profile edit', async () => {
    // The profile branch is the widest client-writable path, so it is the most
    // tempting carrier.
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        username: 'Balboa',
        subscription: paid(),
      }),
    );
  });

  it('REFUSES extending an existing subscription', async () => {
    // Having paid once must not allow renewing for free.
    await consoleWrite('users/' + P1, profile({ subscription: paid() }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        subscription: paid({
          currentPeriodEnd: { seconds: Math.floor(Date.now() / 1000) + 31_536_000 },
        }),
      }),
    );
  });

  it('REFUSES upgrading the plan without paying', async () => {
    await consoleWrite('users/' + P1, profile({ subscription: paid() }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        subscription: paid({ plan: 'soutien' }),
      }),
    );
  });

  it('REFUSES reviving an expired subscription', async () => {
    await consoleWrite(
      'users/' + P1,
      profile({
        subscription: paid({
          status: 'canceled',
          currentPeriodEnd: { seconds: Math.floor(Date.now() / 1000) - 86_400 },
        }),
      }),
    );
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { subscription: paid() }),
    );
  });

  it('REFUSES deleting a subscription to dodge a failed payment', async () => {
    await consoleWrite('users/' + P1, profile({ subscription: paid({ status: 'past_due' }) }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { subscription: deleteField() }),
    );
  });

  it('REFUSES granting one to somebody else', async () => {
    await consoleWrite('users/' + P2, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P2), { subscription: paid() }),
    );
  });

  it('REFUSES riding along on a battle settle', async () => {
    // The settle branch moves real money-adjacent counters, so it must not
    // become a door onto the paid field.
    await seedLive(FINISHED, {
      status: 'finished',
      player1Score: 32,
      player2Score: 27,
      player1Meta: { autoReps: 32, manualAdjust: 0, source: 'camera' },
      player2Meta: { autoReps: 27, manualAdjust: 0, source: 'camera' },
      winner: P1,
      endReason: 'time',
      endedAt: Timestamp.now(),
    });
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        pendingBattleId: null,
        battlesPlayed: 1,
        xp: 164,
        coins: 13,
        totalReps: 32,
        wins: 1,
        losses: 0,
        draws: 0,
        humanWins: 1,
        bestScore: 32,
        subscription: paid(),
      }),
    );
  });

  it('still allows an ordinary profile edit on an account that has one', async () => {
    // The guard must not freeze a paying customer's profile.
    await consoleWrite('users/' + P1, profile({ subscription: paid() }));
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), { avatar: 'https://x/y.png' }),
    );
  });

  it('lets a subscription be read, since the badge is public', async () => {
    await consoleWrite('users/' + P1, profile({ subscription: paid() }));
    await assertSucceeds(getDoc(doc(dbOf(P2), 'users', P1)));
  });
});

describe('partners and payments - the money boundary', () => {
  /**
   * Commissions are real money leaving a real bank account, so the rules here
   * are stricter than anywhere else in the file: partners are admin-only to
   * write, and the payment ledger is readable by nobody at all.
   *
   * The admin check is a get() on the caller's own user document. Comments in
   * this codebase used to claim that was impossible without Cloud Functions;
   * it is not, and these tests are the proof.
   */

  const profile = (over = {}) => ({
    username: 'Rocky',
    avatar: null,
    wins: 0,
    losses: 0,
    draws: 0,
    humanWins: 0,
    xp: 0,
    coins: 0,
    totalReps: 0,
    battlesPlayed: 0,
    bestScore: 0,
    ...over,
  });

  const partner = (over = {}) => ({
    code: 'FITPRO',
    name: 'Salle FitPro',
    kind: 'gym',
    ownerUid: null,
    // The OLD 12%/7% rates, left here deliberately after the move to a flat
    // 25%. These are seed data for permission checks, not assertions about
    // pricing, and a stale rate in the fixture is a free reminder that
    // historical partner documents carry whatever they were created with.
    rateFirstBps: 1200,
    rateRecurringBps: 700,
    city: 'Lyon',
    blurb: null,
    logoUrl: null,
    active: true,
    createdAt: Timestamp.now(),
    ...over,
  });

  const payment = (over = {}) => ({
    uid: P2,
    invoiceId: 'in_1',
    subscriptionId: 'sub_1',
    amountCents: 599,
    currency: 'eur',
    plan: 'premium',
    partnerId: 'partner-1',
    isFirstPayment: true,
    commissionCents: 72,
    commissionBps: 1200,
    paidAt: Timestamp.now(),
    commissionPaidAt: null,
    ...over,
  });

  // ---------------- partners ----------------

  it('lets anyone read a partner page, signed in or not', async () => {
    // /p/CODE is public: a poster in a gym is read by people with no account.
    await consoleWrite('partners/partner-1', partner());
    await assertSucceeds(getDoc(doc(dbOf(P1), 'partners', 'partner-1')));
  });

  it('REFUSES a non-admin creating a partner', async () => {
    // Creating a partner is creating a claim on future revenue.
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      setDoc(doc(dbOf(P1), 'partners', 'mine'), partner({ ownerUid: P1 })),
    );
  });

  it('REFUSES a non-admin editing a partner rate', async () => {
    // The obvious attack: give yourself 100%.
    await consoleWrite('users/' + P1, profile());
    await consoleWrite('partners/partner-1', partner());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'partners', 'partner-1'), { rateFirstBps: 10000 }),
    );
  });

  it('REFUSES a non-admin pointing a partner at their own account', async () => {
    await consoleWrite('users/' + P1, profile());
    await consoleWrite('partners/partner-1', partner());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'partners', 'partner-1'), { ownerUid: P1 }),
    );
  });

  it('lets a real admin create and edit a partner', async () => {
    await consoleWrite('users/' + P1, profile({ role: 'admin' }));
    await assertSucceeds(
      setDoc(doc(dbOf(P1), 'partners', 'partner-2'), partner({ code: 'COACH' })),
    );
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'partners', 'partner-2'), { active: false }),
    );
  });

  it('REFUSES deleting a partner, even as admin', async () => {
    // Deactivate instead: history has to stay explicable.
    await consoleWrite('users/' + P1, profile({ role: 'admin' }));
    await consoleWrite('partners/partner-1', partner());
    await assertFails(deleteDoc(doc(dbOf(P1), 'partners', 'partner-1')));
  });

  it('REFUSES someone who merely CLAIMS to be admin', async () => {
    // No user document at all: isAdmin() must not throw its way to true.
    await assertFails(
      setDoc(doc(dbOf(P3), 'partners', 'ghost'), partner({ code: 'GHOST' })),
    );
  });

  it('REFUSES a role that is not exactly admin', async () => {
    for (const role of ['Admin', 'administrator', 'user', '']) {
      await env.clearFirestore();
      await consoleWrite('users/' + P1, profile({ role }));
      await assertFails(
        setDoc(doc(dbOf(P1), 'partners', 'x'), partner({ code: 'XX1' })),
      );
    }
  });

  // ---------------- payments ----------------

  it('REFUSES every client read of the ledger', async () => {
    // It holds what every player pays. Not even an admin reads it directly —
    // /api/admin/* does, through the Admin SDK.
    await consoleWrite('payments/in_1', payment());
    await consoleWrite('users/' + P1, profile({ role: 'admin' }));
    await assertFails(getDoc(doc(dbOf(P1), 'payments', 'in_1')));
    await assertFails(getDoc(doc(dbOf(P2), 'payments', 'in_1')));
  });

  it('REFUSES a client inventing a payment', async () => {
    // Forging a payment would forge a commission.
    await consoleWrite('users/' + P1, profile({ role: 'admin' }));
    await assertFails(setDoc(doc(dbOf(P1), 'payments', 'in_2'), payment()));
  });

  it('REFUSES marking a commission paid from the client', async () => {
    await consoleWrite('payments/in_1', payment());
    await consoleWrite('users/' + P1, profile({ role: 'admin' }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'payments', 'in_1'), {
        commissionPaidAt: Timestamp.now(),
      }),
    );
  });

  // ---------------- attribution ----------------

  it('REFUSES a client attributing itself to a partner', async () => {
    // This field decides who gets paid, so it is server-written only.
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { partnerId: 'partner-1' }),
    );
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { referredBy: 'FITPRO' }),
    );
  });

  it('REFUSES re-attributing an account to a different partner', async () => {
    // Otherwise a player could move the commission to a friend's code the day
    // before renewing.
    await consoleWrite('users/' + P1, profile({ partnerId: 'partner-1' }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { partnerId: 'partner-2' }),
    );
  });

  it('REFUSES smuggling an attribution into a username change', async () => {
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        username: 'Balboa',
        partnerId: 'partner-1',
      }),
    );
  });

  it('still allows an ordinary edit on an attributed account', async () => {
    // The guard must not freeze a referred player's profile.
    await consoleWrite('users/' + P1, profile({ partnerId: 'partner-1' }));
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), { avatar: 'https://x/y.png' }),
    );
  });

  describe('partner offers - written by the gym, published by us', () => {
    /**
     * A partner writes what they give a subscriber in person; an admin
     * approves before it reaches /p/CODE. Four things must be impossible, and
     * each is tested below:
     *
     *   1. publishing without review
     *   2. editing your own commission rate
     *   3. touching another partner's anything
     *   4. flipping your own active flag
     *
     * (2) and (4) are blocked STRUCTURALLY rather than by a check: rates and
     * the active flag live on the PARENT document, and a subcollection rule
     * confers no access to its parent. That is why offers are a subcollection
     * and not a field.
     */

    const PID = 'partner-1';

    const offer = (over = {}) => ({
      label: '1 séance d’essai offerte',
      details: 'Sur présentation de ton compte SportzFight.',
      status: 'pending',
      authorUid: P1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      reviewNote: null,
      ...over,
    });

    /** A partner document owned by P1. */
    async function seedOwned() {
      await consoleWrite('partners/' + PID, partner({ ownerUid: P1 }));
    }

    it('lets the owner propose an offer', async () => {
      await seedOwned();
      await assertSucceeds(
        setDoc(doc(dbOf(P1), 'partners', PID, 'offers', 'o1'), offer()),
      );
    });

    it('REFUSES publishing without review', async () => {
      // THE test. status is forced to pending on create for anyone but an
      // admin, exactly as partnerApplications forces it.
      await seedOwned();
      await assertFails(
        setDoc(
          doc(dbOf(P1), 'partners', PID, 'offers', 'o1'),
          offer({ status: 'approved' }),
        ),
      );
    });

    it('REFUSES approving an offer after it was written', async () => {
      await seedOwned();
      await consoleWrite('partners/' + PID + '/offers/o1', offer());
      await assertFails(
        updateDoc(doc(dbOf(P1), 'partners', PID, 'offers', 'o1'), {
          status: 'approved',
          updatedAt: serverTimestamp(),
        }),
      );
    });

    it('sends an approved offer back to pending when the owner edits it', async () => {
      // Otherwise an approved offer is quietly rewritten into anything at all
      // and the review reviewed nothing. The edit is allowed; staying approved
      // is not.
      await seedOwned();
      await consoleWrite(
        'partners/' + PID + '/offers/o1',
        offer({ status: 'approved' }),
      );

      // updateDoc, not setDoc: the rule pins createdAt to the stored value, so
      // a client rewriting the whole document with a fresh serverTimestamp()
      // is refused on that alone. Real edits send the changed fields.
      await assertFails(
        updateDoc(doc(dbOf(P1), 'partners', PID, 'offers', 'o1'), {
          label: 'Autre chose',
          status: 'approved',
          updatedAt: serverTimestamp(),
        }),
      );
      await assertSucceeds(
        updateDoc(doc(dbOf(P1), 'partners', PID, 'offers', 'o1'), {
          label: 'Autre chose',
          status: 'pending',
          updatedAt: serverTimestamp(),
        }),
      );
    });

    it('REFUSES editing the commission rate through the offer path', async () => {
      // Structural: rates are on the parent, whose rule is admin-only and
      // untouched by anything in the offers block.
      await seedOwned();
      await assertFails(
        updateDoc(doc(dbOf(P1), 'partners', PID), { rateRecurringBps: 9000 }),
      );
    });

    it('REFUSES flipping the active flag', async () => {
      await seedOwned();
      await assertFails(
        updateDoc(doc(dbOf(P1), 'partners', PID), { active: false }),
      );
    });

    it("REFUSES writing another partner's offers", async () => {
      // partnerId comes from the PATH being written, so to write FITPRO's
      // offers you must be the uid FITPRO's document names.
      await seedOwned();
      await assertFails(
        setDoc(
          doc(dbOf(P2), 'partners', PID, 'offers', 'o1'),
          offer({ authorUid: P2 }),
        ),
      );
    });

    it('REFUSES an offer on a partner with no owner', async () => {
      // ownerUid is null on every partner created from the admin form. It must
      // evaluate to false rather than throw, and must not match anybody.
      await consoleWrite('partners/' + PID, partner({ ownerUid: null }));
      await assertFails(
        setDoc(doc(dbOf(P1), 'partners', PID, 'offers', 'o1'), offer()),
      );
    });

    it('REFUSES an over-long label or details', async () => {
      await seedOwned();
      await assertFails(
        setDoc(
          doc(dbOf(P1), 'partners', PID, 'offers', 'o1'),
          offer({ label: 'x'.repeat(81) }),
        ),
      );
      await assertFails(
        setDoc(
          doc(dbOf(P1), 'partners', PID, 'offers', 'o2'),
          offer({ details: 'x'.repeat(201) }),
        ),
      );
    });

    it('REFUSES an empty label', async () => {
      await seedOwned();
      await assertFails(
        setDoc(
          doc(dbOf(P1), 'partners', PID, 'offers', 'o1'),
          offer({ label: '' }),
        ),
      );
    });

    it('REFUSES smuggling an unvalidated field onto an offer', async () => {
      await seedOwned();
      await assertFails(
        setDoc(doc(dbOf(P1), 'partners', PID, 'offers', 'o1'), {
          ...offer(),
          commissionCents: 99_999,
        }),
      );
    });

    it('REFUSES writing a review note as the partner', async () => {
      // The refusal reason is the admin's words, shown back to the partner.
      await seedOwned();
      await assertFails(
        setDoc(
          doc(dbOf(P1), 'partners', PID, 'offers', 'o1'),
          offer({ reviewNote: 'Approuvé par moi-même' }),
        ),
      );
    });

    it('lets a visitor read the offers', async () => {
      // /p/CODE renders for someone with no account at all.
      await seedOwned();
      await consoleWrite(
        'partners/' + PID + '/offers/o1',
        offer({ status: 'approved' }),
      );
      await assertSucceeds(
        getDoc(doc(env.unauthenticatedContext().firestore() as never, 'partners', PID, 'offers', 'o1')),
      );
    });

    it('lets the owner withdraw an offer', async () => {
      await seedOwned();
      await consoleWrite('partners/' + PID + '/offers/o1', offer());
      await assertSucceeds(
        deleteDoc(doc(dbOf(P1), 'partners', PID, 'offers', 'o1')),
      );
    });
  });

  describe('the partner code lock', () => {
    /**
     * Codes are unique because a lock DOCUMENT holds them, the same way
     * usernames work. Firestore can only guarantee uniqueness of a document
     * id, never of a field, so the previous query-then-write let two admins
     * create the same code at the same instant — and since /api/referral
     * resolves a code with limit(1), one partner would silently collect the
     * other's referrals and their money.
     *
     * The lock is written by the Admin SDK inside a transaction. No client
     * touches it, in either direction.
     */

    it('REFUSES letting anyone read the code locks', async () => {
      await consoleWrite('partnerCodes/FITPRO', { partnerId: 'partner-1' });
      // Not even an admin through the client SDK: enumerating every partner
      // code has no legitimate client-side use.
      await consoleWrite('users/' + P1, profile({ role: 'admin' }));
      await assertFails(getDoc(doc(dbOf(P1), 'partnerCodes', 'FITPRO')));
    });

    it('REFUSES letting a client claim a code', async () => {
      // The attack this closes: claim the lock for a code you do not own, or
      // repoint an existing one at your own partner document.
      await assertFails(
        setDoc(doc(dbOf(P1), 'partnerCodes', 'FITPRO'), { partnerId: 'mine' }),
      );
    });

    it('REFUSES letting a client release a code', async () => {
      // Deleting the lock would reopen the race it exists to close.
      await consoleWrite('partnerCodes/FITPRO', { partnerId: 'partner-1' });
      await assertFails(deleteDoc(doc(dbOf(P1), 'partnerCodes', 'FITPRO')));
    });
  });
});

describe('onboarding and the username hole', () => {
  /**
   * The username used to be writable straight onto users/{uid}. The rule
   * checked the CHARSET but never the lock, so a modified client could display
   * a name reserved by somebody else and the leaderboard would show two
   * identical players. Rules cannot close that themselves — no toLower(), so
   * they cannot derive a name's lock key — hence /api/username.
   */

  const profile = (over = {}) => ({
    username: 'Rocky',
    avatar: null,
    wins: 0,
    losses: 0,
    draws: 0,
    humanWins: 0,
    xp: 0,
    coins: 0,
    totalReps: 0,
    battlesPlayed: 0,
    bestScore: 0,
    ...over,
  });

  it('REFUSES writing a username directly, lock or no lock', async () => {
    // THE fix. Previously this succeeded.
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { username: 'Balboa' }),
    );
  });

  it('REFUSES stealing a name whose lock belongs to someone else', async () => {
    await consoleWrite('users/' + P1, profile());
    await consoleWrite('users/' + P2, profile({ username: 'Apollo' }));
    await consoleWrite('usernames/apollo', { uid: P2 });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { username: 'Apollo' }),
    );
  });

  it('still lets a player change their avatar', async () => {
    // Narrowing the rule must not lock everyone out of the rest of the profile.
    await consoleWrite('users/' + P1, profile());
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), { avatar: 'https://x/y.png' }),
    );
  });

  it('accepts the onboarding answers a player may set', async () => {
    await consoleWrite('users/' + P1, profile());
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        accountType: 'player',
        experience: 'beginner',
        goal: 'progress',
        onboardedAt: serverTimestamp(),
      }),
    );
  });

  it('REFUSES declaring oneself a pro', async () => {
    // 'pro' is granted by an admin approving an application. Self-declaring
    // would be a way straight into the partner programme.
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { accountType: 'pro' }),
    );
  });

  it('REFUSES an onboarding value outside its enumeration', async () => {
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { experience: 'godlike' }),
    );
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { goal: 'cheat' }),
    );
  });

  it('REFUSES backdating onboardedAt', async () => {
    // A client-chosen date is how you would fake having been here for months.
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        onboardedAt: Timestamp.fromMillis(Date.now() - 86_400_000),
      }),
    );
  });

  it('REFUSES re-arming the welcome screen once it is done', async () => {
    // Write-once: otherwise the flag could be cleared and reset at will.
    await consoleWrite('users/' + P1, profile({ onboardedAt: Timestamp.now() }));
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { onboardedAt: serverTimestamp() }),
    );
  });

  it('REFUSES smuggling a username into an onboarding write', async () => {
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), {
        accountType: 'player',
        username: 'Balboa',
      }),
    );
  });
});

describe('the private profile', () => {
  const priv = (over = {}) => ({
    birthYear: 1995,
    heightCm: 180,
    weightKg: 72,
    gender: 'm',
    city: 'Lyon',
    ...over,
  });

  it('lets a player write their own details', async () => {
    await assertSucceeds(
      setDoc(doc(dbOf(P1), 'users', P1, 'private', 'profile'), priv()),
    );
  });

  it('REFUSES reading someone else\u2019s details', async () => {
    // The whole reason these live off the public profile: users/{uid} is
    // listable by every signed-in account.
    await consoleWrite('users/' + P1 + '/private/profile', priv());
    await assertFails(
      getDoc(doc(dbOf(P2), 'users', P1, 'private', 'profile')),
    );
  });

  it('REFUSES writing into another account', async () => {
    await assertFails(
      setDoc(doc(dbOf(P1), 'users', P2, 'private', 'profile'), priv()),
    );
  });

  it('REFUSES values outside their bounds', async () => {
    for (const bad of [
      { birthYear: 1850 },
      { heightCm: 5 },
      { heightCm: 400 },
      { weightKg: 2 },
      { weightKg: 900 },
      { gender: 'whatever' },
      { city: 'x'.repeat(200) },
    ]) {
      await assertFails(
        setDoc(doc(dbOf(P1), 'users', P1, 'private', 'profile'), priv(bad)),
      );
    }
  });

  it('REFUSES an unknown field', async () => {
    await assertFails(
      setDoc(doc(dbOf(P1), 'users', P1, 'private', 'profile'), {
        ...priv(),
        bloodType: 'O+',
      }),
    );
  });

  it('leaves the contact subdocument alone', async () => {
    // Only `profile` is shape-checked; `contact` predates this and is written
    // by ensureProfile.
    await assertSucceeds(
      setDoc(doc(dbOf(P1), 'users', P1, 'private', 'contact'), {
        email: 'x@y.z',
      }),
    );
  });
});

describe('pro applications', () => {
  const application = (over = {}) => ({
    uid: P1,
    kind: 'gym',
    structure: 'Salle FitPro',
    city: 'Lyon',
    discipline: 'Cross-training',
    status: 'pending',
    createdAt: serverTimestamp(),
    ...over,
  });

  it('lets a player apply', async () => {
    await assertSucceeds(
      setDoc(doc(dbOf(P1), 'partnerApplications', P1), application()),
    );
  });

  it('REFUSES applying on behalf of someone else', async () => {
    await assertFails(
      setDoc(doc(dbOf(P1), 'partnerApplications', P2), application({ uid: P2 })),
    );
  });

  it('REFUSES self-approving', async () => {
    // The entire point of the separation: an application grants nothing.
    await assertFails(
      setDoc(
        doc(dbOf(P1), 'partnerApplications', P1),
        application({ status: 'approved' }),
      ),
    );
  });

  it('REFUSES editing an application after submitting', async () => {
    // What the admin reviewed and what they approve must be the same thing.
    await consoleWrite('partnerApplications/' + P1, {
      ...application(),
      createdAt: Timestamp.now(),
    });
    await assertFails(
      updateDoc(doc(dbOf(P1), 'partnerApplications', P1), {
        structure: 'Autre chose',
      }),
    );
  });

  it('REFUSES an application with no structure name', async () => {
    await assertFails(
      setDoc(doc(dbOf(P1), 'partnerApplications', P1), application({ structure: '' })),
    );
  });

  it('REFUSES reading another applicant', async () => {
    await consoleWrite('partnerApplications/' + P1, {
      ...application(),
      createdAt: Timestamp.now(),
    });
    await assertFails(getDoc(doc(dbOf(P2), 'partnerApplications', P1)));
  });

  it('lets an admin read and decide', async () => {
    await consoleWrite('users/' + P2, {
      username: 'Boss',
      avatar: null,
      role: 'admin',
    });
    await consoleWrite('partnerApplications/' + P1, {
      ...application(),
      createdAt: Timestamp.now(),
    });
    await assertSucceeds(getDoc(doc(dbOf(P2), 'partnerApplications', P1)));
    await assertSucceeds(
      updateDoc(doc(dbOf(P2), 'partnerApplications', P1), { status: 'approved' }),
    );
  });
});

describe('bot battles - the seat that opens, and how far', () => {
  /**
   * A bot has no account, so its opponent's own browser writes both sides.
   * That is a real concession and it is deliberately narrow: only on a battle
   * that declared botLevel at creation, and only from its creator.
   *
   * The compensating control is humanWins — the counter the world ranking is
   * built on, which a bot battle never moves.
   */

  const botBattle = (over = {}) =>
    baseBattle({
      botLevel: 'normal',
      botSeed: 42,
      ...over,
    });

  it('accepts a battle that declares itself a training battle', async () => {
    await assertSucceeds(
      setDoc(doc(dbOf(P1), 'battles', BID), {
        ...createPayload(),
        botLevel: 'normal',
        botSeed: 42,
      }),
    );
  });

  it('REFUSES an invented difficulty', async () => {
    await assertFails(
      setDoc(doc(dbOf(P1), 'battles', BID), {
        ...createPayload(),
        botLevel: 'impossible',
      }),
    );
  });

  it('lets the creator seat the bot', async () => {
    await seed(botBattle());
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player2: 'bot',
        players: [P1, 'bot'],
        status: 'ready',
      }),
    );
  });

  it('REFUSES seating a bot into an ordinary battle', async () => {
    // THE containment test. Without botLevel there is no carve-out, so an
    // ordinary match cannot have its opponent seat written by one player.
    await seed(baseBattle());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player2: 'bot',
        players: [P1, 'bot'],
        status: 'ready',
      }),
    );
  });

  it('REFUSES turning an existing battle into a bot battle', async () => {
    // botLevel is write-once by construction: no update rule names it, so it
    // cannot be added later to unlock the opponent seat.
    await seed(baseBattle());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), { botLevel: 'normal' }),
    );
  });

  it('REFUSES seating a real account in the bot slot', async () => {
    // The carve-out accepts the literal 'bot' and nothing else, so it cannot
    // be used to drag someone who never consented into a match.
    await seed(botBattle());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player2: P2,
        players: [P1, P2],
        status: 'ready',
      }),
    );
  });

  it('REFUSES a stranger seating the bot', async () => {
    await seed(botBattle());
    await assertFails(
      updateDoc(doc(dbOf(P3), 'battles', BID), {
        player2: 'bot',
        players: [P3, 'bot'],
        status: 'ready',
      }),
    );
  });

  it('lets the driver ready and score the bot, within the usual limits', async () => {
    // 10s in, not 1: the first 3 seconds are the countdown, during which the
    // score window is shut and this write is legitimately denied.
    await seedLive(10, {
      botLevel: 'normal',
      botSeed: 42,
      player2: 'bot',
      players: [P1, 'bot'],
      player1Ready: true,
      player2Ready: true,
    });

    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player2Score: 12,
        player2Final: false,
        player2Meta: { autoReps: 12, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it('holds the bot to the same score ceiling as a human', async () => {
    await seedLive(10, {
      botLevel: 'normal',
      player2: 'bot',
      players: [P1, 'bot'],
      player1Ready: true,
      player2Ready: true,
    });

    // Above maxJump in one write.
    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player2Score: 100,
        player2Final: false,
        player2Meta: { autoReps: 100, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it('will not let the bot score go backwards', async () => {
    await seedLive(10, {
      botLevel: 'normal',
      player2: 'bot',
      players: [P1, 'bot'],
      player1Ready: true,
      player2Ready: true,
      player2Score: 20,
      player2Meta: { autoReps: 20, manualAdjust: 0, source: 'camera' },
    });

    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player2Score: 5,
        player2Final: false,
        player2Meta: { autoReps: 5, manualAdjust: 0, source: 'camera' },
      }),
    );
  });

  it('REFUSES writing an opponent score in an ordinary battle', async () => {
    // The carve-out must not have widened the human path by accident.
    await seedLive(10, {
      player2: P2,
      players: [P1, P2],
      player1Ready: true,
      player2Ready: true,
    });

    await assertFails(
      updateDoc(doc(dbOf(P1), 'battles', BID), {
        player2Score: 12,
        player2Final: false,
        player2Meta: { autoReps: 12, manualAdjust: 0, source: 'camera' },
      }),
    );
  });
});

describe('humanWins - the counter the ranking is built on', () => {
  const FINISHED = 3 + 60 + 5;

  const profile = (over = {}) => ({
    username: 'Rocky',
    avatar: null,
    wins: 0,
    losses: 0,
    draws: 0,
    humanWins: 0,
    xp: 0,
    coins: 0,
    totalReps: 0,
    battlesPlayed: 0,
    bestScore: 0,
    ...over,
  });

  /** P1 wins 32-27. */
  const settle = (over = {}) => ({
    pendingBattleId: null,
    battlesPlayed: 1,
    xp: 164,
    coins: 13,
    totalReps: 32,
    wins: 1,
    losses: 0,
    draws: 0,
    humanWins: 1,
    bestScore: 32,
    ...over,
  });

  async function seedFinished(over = {}) {
    await seedLive(FINISHED, {
      status: 'finished',
      player1Score: 32,
      player2Score: 27,
      player1Meta: { autoReps: 32, manualAdjust: 0, source: 'camera' },
      player2Meta: { autoReps: 27, manualAdjust: 0, source: 'camera' },
      winner: P1,
      endReason: 'time',
      endedAt: Timestamp.now(),
      ...over,
    });
  }

  it('counts a win over a real opponent', async () => {
    await seedFinished();
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID }));
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), settle()),
    );
  });

  it('does NOT count a win over a bot', async () => {
    // The whole point. XP and coins are still credited below; only the
    // ranking counter stays put.
    await seedFinished({
      botLevel: 'normal',
      player2: 'bot',
      players: [P1, 'bot'],
    });
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID }));

    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), settle({ humanWins: 1 })),
    );
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), settle({ humanWins: 0 })),
    );
  });

  it('still pays XP and coins for a bot battle', async () => {
    // The player did the reps. Only the ranking is protected.
    await seedFinished({
      botLevel: 'normal',
      player2: 'bot',
      players: [P1, 'bot'],
    });
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID }));
    await assertSucceeds(
      updateDoc(doc(dbOf(P1), 'users', P1), settle({ humanWins: 0 })),
    );
  });

  it('REFUSES inflating humanWins on its own', async () => {
    await consoleWrite('users/' + P1, profile());
    await assertFails(
      updateDoc(doc(dbOf(P1), 'users', P1), { humanWins: 99 }),
    );
  });

  it('does not count a loss or a draw', async () => {
    await seedFinished({ winner: P2 });
    await consoleWrite('users/' + P1, profile({ pendingBattleId: BID }));
    await assertFails(
      updateDoc(
        doc(dbOf(P1), 'users', P1),
        settle({ wins: 0, losses: 1, humanWins: 1, xp: 104, coins: 11 }),
      ),
    );
  });
});
