import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  getDocs,
  getFirestore,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';

import type { BattleDoc } from '../src/lib/battle/types';

/**
 * Matchmaking races, against the real emulator with the production rules.
 *
 * The property that matters: N people searching at the same instant must end
 * up correctly paired. Never two lonely battles when two people are looking,
 * never three players in one battle, never two half-full battles.
 *
 * Requires the emulators (npm run emu). The client modules import
 * `@/lib/firebase/client`, which is bound to a single app instance, so this
 * suite drives the same ALGORITHM against per-user app handles rather than
 * importing matchmaking.ts directly.
 */

const PROJECT = 'demo-sportzfight';

interface Client {
  app: FirebaseApp;
  db: Firestore;
  uid: string;
}

let clients: Client[] = [];

async function makeClient(n: number): Promise<Client> {
  const app = initializeApp(
    { apiKey: 'demo-key', projectId: PROJECT, appId: `mm-${n}` },
    `mm-${n}-${Date.now()}-${Math.random()}`,
  );
  const auth: Auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  const cred = await createUserWithEmailAndPassword(
    auth,
    `mm${n}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    'passw0rd!',
  );
  return { app, db, uid: cred.user.uid };
}

/**
 * A faithful port of src/lib/firebase/matchmaking.ts, parameterised by client
 * so several can run concurrently in one process. Kept deliberately in step
 * with the real implementation: phase A scan, phase B create + re-scan with
 * the id tie-break, phase C wait.
 */
async function findOrCreate(c: Client): Promise<{ id: string; role: string }> {
  const { doc, setDoc, updateDoc, runTransaction, serverTimestamp, orderBy, limit } =
    await import('firebase/firestore');

  const scan = async (belowId: string | null) => {
    const snap = await getDocs(
      query(
        collection(c.db, 'battles'),
        where('status', '==', 'waiting'),
        where('exercise', '==', 'pushups'),
        where('durationSecs', '==', 60),
        orderBy('createdAt', 'desc'),
        limit(10),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as BattleDoc) }))
      .filter(
        (b) =>
          b.player1 !== c.uid &&
          b.player2 === null &&
          (belowId === null || b.id < belowId),
      );
  };

  const claim = async (cands: { id: string; player1: string }[]) => {
    for (const cand of cands) {
      try {
        await runTransaction(c.db, async (tx) => {
          const snap = await tx.get(doc(c.db, 'battles', cand.id));
          const b = snap.data() as BattleDoc | undefined;
          if (!b || b.player2 !== null || b.status !== 'waiting') {
            throw new Error('taken');
          }
          tx.update(doc(c.db, 'battles', cand.id), {
            player2: c.uid,
            players: [b.player1, c.uid],
            status: 'ready',
            player2HeartbeatAt: serverTimestamp(),
          });
        });
        return cand.id;
      } catch {
        /* lost the race; next candidate */
      }
    }
    return null;
  };

  const joined = await claim(await scan(null));
  if (joined) return { id: joined, role: 'player2' };

  const ref = doc(collection(c.db, 'battles'));
  await setDoc(ref, {
    exercise: 'pushups',
    durationSecs: 60,
    status: 'waiting',
    player1: c.uid,
    player2: null,
    players: [c.uid],
    player1Ready: false,
    player2Ready: false,
    player1Score: 0,
    player2Score: 0,
    player1Final: false,
    player2Final: false,
    player1Meta: { autoReps: 0, manualAdjust: 0, source: 'camera' },
    player2Meta: { autoReps: 0, manualAdjust: 0, source: 'camera' },
    player1HeartbeatAt: serverTimestamp(),
    player2HeartbeatAt: null,
    winner: null,
    endReason: null,
    createdAt: serverTimestamp(),
    startedAt: null,
    endedAt: null,
  });

  await new Promise((r) => setTimeout(r, 400 + Math.random() * 250));

  const late = await claim(await scan(ref.id));
  if (late) {
    await updateDoc(doc(c.db, 'battles', ref.id), {
      status: 'cancelled',
      endReason: 'abandoned',
      endedAt: serverTimestamp(),
    }).catch(() => {});
    return { id: late, role: 'player2' };
  }

  return { id: ref.id, role: 'player1' };
}

/** Every battle currently in the collection, whatever its status. */
async function allBattles(c: Client) {
  const snap = await getDocs(collection(c.db, 'battles'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as BattleDoc) }));
}

beforeAll(async () => {
  clients = await Promise.all([0, 1, 2, 3].map(makeClient));
}, 40000);

afterAll(async () => {
  await Promise.all(clients.map((c) => deleteApp(c.app).catch(() => {})));
});

/** Wipe the collection between runs so each race starts from an empty pool. */
beforeEach(async () => {
  // Rules forbid deletes outright, so clear via the emulator's own endpoint,
  // which bypasses them the way the console does.
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
});

describe('matchmaking races', () => {
  it('pairs two simultaneous searchers into ONE battle', async () => {
    const [a, b] = clients;
    const [ra, rb] = await Promise.all([findOrCreate(a), findOrCreate(b)]);

    // Both must land in the same battle.
    expect(ra.id).toBe(rb.id);
    // One posted it, the other claimed it.
    expect([ra.role, rb.role].sort()).toEqual(['player1', 'player2']);

    const live = (await allBattles(a)).filter((x) => x.status !== 'cancelled');
    expect(live).toHaveLength(1);
    expect(live[0].players.sort()).toEqual([a.uid, b.uid].sort());
  }, 40000);

  it('leaves no orphan waiting battle behind', async () => {
    const [a, b] = clients;
    await Promise.all([findOrCreate(a), findOrCreate(b)]);

    const stillOpen = (await allBattles(a)).filter(
      (x) => x.status === 'waiting',
    );
    expect(stillOpen).toHaveLength(0);
  }, 40000);

  it('a lone searcher waits, and is picked up by the next arrival', async () => {
    const [a, b] = clients;
    const first = await findOrCreate(a);
    expect(first.role).toBe('player1');

    const second = await findOrCreate(b);
    expect(second.role).toBe('player2');
    expect(second.id).toBe(first.id);
  }, 40000);

  it('four simultaneous searchers form exactly two full battles', async () => {
    const results = await Promise.all(clients.map(findOrCreate));
    const live = (await allBattles(clients[0])).filter(
      (x) => x.status !== 'cancelled',
    );

    // Every battle that survived must be full, and nobody may appear twice.
    for (const b of live) {
      expect(b.player2, `battle ${b.id} left half full`).not.toBeNull();
      expect(b.players).toHaveLength(2);
    }
    const seated = live.flatMap((b) => b.players);
    expect(new Set(seated).size).toBe(seated.length);
    expect(seated.sort()).toEqual(clients.map((c) => c.uid).sort());
    expect(live).toHaveLength(2);
    expect(new Set(results.map((r) => r.id)).size).toBe(2);
  }, 60000);

  it('never seats a third player', async () => {
    const [a, b, c] = clients;
    await Promise.all([findOrCreate(a), findOrCreate(b)]);
    await findOrCreate(c);

    for (const battle of await allBattles(a)) {
      expect(battle.players.length).toBeLessThanOrEqual(2);
    }
  }, 40000);
});
