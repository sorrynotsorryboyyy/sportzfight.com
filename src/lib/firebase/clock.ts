'use client';

import {
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './client';

/**
 * Server clock estimation.
 *
 * The problem: both players must see "GO" at the same instant, but each
 * client's Date.now() can be minutes off. Everything is derived from
 * `startedAt` (a server timestamp), so we need to convert server time into
 * local time accurately.
 *
 * The formula, for a write whose commit we can bracket locally:
 *
 *     offset = serverCommitMs - (tBefore + (tAfter - tBefore) / 2)
 *     serverNow() = Date.now() + offset
 *
 * The midpoint is the best point estimate of when the commit happened in
 * local time; the error is bounded by half the round trip (~125ms on 4G),
 * far below the 1Hz resolution a countdown needs.
 */

let offsetMs = 0;
let confidenceMs = Number.POSITIVE_INFINITY;
let degraded = true;

/** Frozen for the duration of a battle so the countdown cannot stutter. */
let frozen: { anchorPerf: number; anchorServerMs: number } | null = null;

/** Offsets beyond this are nonsense — a broken or hostile clock. */
const SANITY_MS = 24 * 60 * 60 * 1000;

export function clockState() {
  return { offsetMs, confidenceMs, degraded };
}

/**
 * Current server time in epoch millis.
 *
 * Once a battle goes live the value is anchored and advanced with
 * performance.now(), which is monotonic: an NTP correction landing
 * mid-battle cannot rewind the timer.
 */
export function serverNow(): number {
  if (frozen) {
    return frozen.anchorServerMs + (performance.now() - frozen.anchorPerf);
  }
  return Date.now() + offsetMs;
}

/** Call once when a battle transitions to live. Idempotent. */
export function freezeClock(): void {
  if (frozen) return;
  frozen = { anchorPerf: performance.now(), anchorServerMs: Date.now() + offsetMs };
}

export function unfreezeClock(): void {
  frozen = null;
}

function applySample(sampleOffset: number, halfRtt: number, weight = 1): void {
  if (!Number.isFinite(sampleOffset) || Math.abs(sampleOffset) > SANITY_MS) {
    degraded = true;
    return;
  }
  if (degraded || halfRtt < confidenceMs) {
    // First good sample, or a tighter one: take it.
    offsetMs = degraded ? sampleOffset : offsetMs * (1 - weight) + sampleOffset * weight;
    confidenceMs = halfRtt;
    degraded = false;
  }
}

/**
 * Free estimator, preferred.
 *
 * When a client writes serverTimestamp(), onSnapshot fires twice: once
 * immediately with hasPendingWrites (the sentinel reads as null locally), then
 * again on ack with the resolved Timestamp. Bracketing those two local instants
 * gives the midpoint formula on the exact document that matters, at no extra
 * cost. Callers record the local instants and hand them here.
 */
export function observeWriteEcho(
  resolved: Timestamp,
  tLocalIssue: number,
  tLocalAck: number,
): void {
  const rtt = Math.max(0, tLocalAck - tLocalIssue);
  const midpoint = tLocalIssue + rtt / 2;
  applySample(resolved.toMillis() - midpoint, rtt / 2, 0.7);
}

/**
 * Fallback estimator: an explicit probe. Used by a client that never writes
 * startedAt itself (player 2) so it still has an offset before GO.
 * Writes to users/{uid}/clock/probe, which rules restrict to the owner.
 */
async function probeOnce(uid: string): Promise<{ offset: number; halfRtt: number } | null> {
  try {
    const ref = doc(db(), 'users', uid, 'clock', 'probe');
    const t0 = Date.now();
    await setDoc(ref, { t: serverTimestamp(), c: t0 });
    const t1 = Date.now();

    // The write ack does not carry the resolved value; read it back from the
    // server (not cache) to learn the commit time.
    const snap = await getDocFromServer(ref);
    const ts = snap.get('t') as Timestamp | null;
    if (!ts) return null;

    const rtt = Math.max(0, t1 - t0);
    return { offset: ts.toMillis() - (t0 + rtt / 2), halfRtt: rtt / 2 };
  } catch {
    return null;
  }
}

/**
 * Take a few probes and keep the tightest. Median-of-survivors would also
 * work; we take the minimum-RTT sample because RTT inflation is one-sided
 * (network stalls only ever make it look longer, never shorter).
 */
export async function bootstrapClock(uid: string, samples = 3): Promise<void> {
  const results: { offset: number; halfRtt: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const r = await probeOnce(uid);
    if (r) results.push(r);
    if (i < samples - 1) await new Promise((res) => setTimeout(res, 250));
  }
  if (!results.length) {
    degraded = true;
    return;
  }
  results.sort((a, b) => a.halfRtt - b.halfRtt);
  const best = results[0];
  offsetMs = best.offset;
  confidenceMs = best.halfRtt;
  degraded = false;
}

/** Reset — used on sign-out so a new user does not inherit an offset. */
export function resetClock(): void {
  offsetMs = 0;
  confidenceMs = Number.POSITIVE_INFINITY;
  degraded = true;
  frozen = null;
}
