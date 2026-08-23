import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';

import { deriveView, deriveWinner, slotOf } from '../src/lib/battle/machine';
import { COUNTDOWN_MS } from '../src/lib/battle/constants';
import type { BattleDoc } from '../src/lib/battle/types';

/**
 * End-to-end walk of the real user journey against the Firestore + Auth
 * emulators, with the production security rules loaded:
 *
 *   signup -> create -> join -> ready -> start -> score -> finish -> result
 *
 * Two separate Firebase apps stand in for the two players' browsers, so every
 * write is made by a genuinely different authenticated user and is subject to
 * the same rules a real client would face.
 *
 * Requires the emulators: npm run emu
 */

const PROJECT = 'demo-sportzfight';

interface Client {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  uid: string;
}

async function makeClient(name: string, email: string): Promise<Client> {
  const app = initializeApp(
    { apiKey: 'demo-key', projectId: PROJECT, appId: `demo-${name}` },
    `e2e-${name}-${Date.now()}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  // The app itself signs in with Google only. Here we just need two distinct
  // authenticated UIDs to exercise the Firestore rules, and the Auth emulator's
  // email/password path is the simplest way to mint them headlessly — the
  // rules care about request.auth.uid, not how the token was obtained.
  const cred = await createUserWithEmailAndPassword(auth, email, 'passw0rd!');
  const uid = cred.user.uid;

  await setDoc(doc(db, 'users', uid), {
    username: name,
    email,
    avatar: null,
    createdAt: serverTimestamp(),
  });

  return { app, auth, db, uid };
}

const read = async (c: Client, id: string) =>
  (await getDoc(doc(c.db, 'battles', id))).data() as BattleDoc;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let p1: Client;
let p2: Client;
let battleId: string;
const CODE = 'E2E' + Math.floor(Math.random() * 900 + 100);

beforeAll(async () => {
  const stamp = Date.now();
  p1 = await makeClient('Rocky', `rocky${stamp}@example.com`);
  p2 = await makeClient('Apollo', `apollo${stamp}@example.com`);
}, 30000);

afterAll(async () => {
  await signOut(p1.auth).catch(() => {});
  await signOut(p2.auth).catch(() => {});
  await deleteApp(p1.app).catch(() => {});
  await deleteApp(p2.app).catch(() => {});
});

describe('full battle journey', () => {
  it('player 1 creates a battle', async () => {
    const ref = doc(p1.db, 'battles', `e2e-${CODE}`);
    battleId = ref.id;

    await setDoc(ref, {
      exercise: 'pushups',
      durationSecs: 60,
      status: 'waiting',
      player1: p1.uid,
      player2: null,
      players: [p1.uid],
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

    const b = await read(p1, battleId);
    expect(b.status).toBe('waiting');
    expect(b.player1).toBe(p1.uid);
    expect(slotOf(b, p1.uid)).toBe(1);
  });

  it('player 2 is matched into the battle', async () => {
    // The exact write matchmaking's claim transaction sends.
    await updateDoc(doc(p2.db, 'battles', battleId), {
      player2: p2.uid,
      players: [p1.uid, p2.uid],
      status: 'ready',
      player2HeartbeatAt: serverTimestamp(),
    });

    const b = await read(p2, battleId);
    expect(b.player2).toBe(p2.uid);
    expect(b.status).toBe('ready');
    expect(slotOf(b, p2.uid)).toBe(2);
  });

  it('both players mark ready', async () => {
    await updateDoc(doc(p1.db, 'battles', battleId), { player1Ready: true });
    await updateDoc(doc(p2.db, 'battles', battleId), { player2Ready: true });

    const b = await read(p1, battleId);
    expect(b.player1Ready && b.player2Ready).toBe(true);
  });

  it('player 1 arms the battle and the clock starts server-side', async () => {
    await updateDoc(doc(p1.db, 'battles', battleId), {
      status: 'live',
      startedAt: serverTimestamp(),
    });

    const b = await read(p1, battleId);
    expect(b.status).toBe('live');
    expect(b.startedAt).toBeTruthy();

    // Both clients derive the same phase from that one timestamp.
    const startedMs = (b.startedAt as Timestamp).toMillis();
    expect(deriveView(b, startedMs).phase).toBe('countdown');
    expect(deriveView(b, startedMs).countdownDigit).toBe(3);
    expect(deriveView(b, startedMs + COUNTDOWN_MS).phase).toBe('active');
    expect(deriveView(b, startedMs + COUNTDOWN_MS + 60_000).phase).toBe('ending');
  });

  it('the opponent sees the start over a live subscription', async () => {
    const seen = await new Promise<BattleDoc>((resolve) => {
      const unsub = onSnapshot(doc(p2.db, 'battles', battleId), (snap) => {
        const d = snap.data() as BattleDoc | undefined;
        if (d?.status === 'live' && d.startedAt) {
          unsub();
          resolve(d);
        }
      });
    });
    expect(seen.status).toBe('live');
  });

  it('both players log reps, each writing only their own score', async () => {
    // Wait out the countdown so writes land inside the server-verified window.
    await wait(COUNTDOWN_MS + 300);

    for (const [n, score] of [
      [1, 12],
      [2, 24],
      [3, 32],
    ] as const) {
      await updateDoc(doc(p1.db, 'battles', battleId), {
        player1Score: score,
        player1Meta: { autoReps: score, manualAdjust: 0, source: 'camera' },
      });
      void n;
    }
    for (const score of [10, 20, 27] as const) {
      await updateDoc(doc(p2.db, 'battles', battleId), {
        player2Score: score,
        player2Meta: { autoReps: score, manualAdjust: 0, source: 'camera' },
      });
    }

    const b = await read(p1, battleId);
    expect(b.player1Score).toBe(32);
    expect(b.player2Score).toBe(27);
  }, 20000);

  it('each player latches their final score', async () => {
    await updateDoc(doc(p1.db, 'battles', battleId), {
      player1Score: 32,
      player1Final: true,
      player1Meta: { autoReps: 32, manualAdjust: 0, source: 'camera' },
    });
    await updateDoc(doc(p2.db, 'battles', battleId), {
      player2Score: 27,
      player2Final: true,
      player2Meta: { autoReps: 27, manualAdjust: 0, source: 'camera' },
    });

    const b = await read(p1, battleId);
    expect(b.player1Final && b.player2Final).toBe(true);
  });

  it('the battle finalizes with the correct winner once time is up', async () => {
    const before = await read(p1, battleId);
    const startedMs = (before.startedAt as Timestamp).toMillis();
    const hardEnd = startedMs + COUNTDOWN_MS + before.durationSecs * 1000;

    // The rule gates finishing on the server clock, so an early attempt fails.
    await expect(
      updateDoc(doc(p1.db, 'battles', battleId), {
        status: 'finished',
        endedAt: serverTimestamp(),
        endReason: 'time',
        winner: deriveWinner(before),
      }),
    ).rejects.toThrow();

    // Wait out the real 60s window plus slack.
    const remaining = hardEnd + 2500 - Date.now();
    if (remaining > 0) await wait(remaining);

    await updateDoc(doc(p1.db, 'battles', battleId), {
      status: 'finished',
      endedAt: serverTimestamp(),
      endReason: 'time',
      winner: deriveWinner(before),
    });

    const b = await read(p1, battleId);
    expect(b.status).toBe('finished');
    expect(b.winner).toBe(p1.uid);
    expect(b.player1Score).toBe(32);
    expect(b.player2Score).toBe(27);
    expect(deriveView(b, Date.now()).phase).toBe('finished');
  }, 90000);

  it('scores are frozen after the battle ends', async () => {
    await expect(
      updateDoc(doc(p2.db, 'battles', battleId), {
        player2Score: 99,
        player2Meta: { autoReps: 99, manualAdjust: 0, source: 'camera' },
      }),
    ).rejects.toThrow();

    const b = await read(p2, battleId);
    expect(b.player2Score).toBe(27);
  });
});
