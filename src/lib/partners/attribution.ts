'use client';

import { apiPost } from '@/lib/firebase/api';
import { normaliseCode } from './commission';
import { ATTRIBUTION_DAYS } from './types';

/**
 * Carrying a referral code from /p/CODE to a finished signup.
 *
 * The gap this bridges: a visitor lands on a partner page, leaves for Google
 * sign-in, comes back, and only then has an account to attribute. The code has
 * to survive that round trip.
 *
 * localStorage rather than a cookie: nothing server-rendered needs to read it,
 * a cookie would ride on every request for no reason, and this way it is
 * plainly first-party storage tied to one purpose.
 */

const KEY = 'sf_ref';

interface Stored {
  code: string;
  at: number;
}

/** Called by the partner landing page. */
export function rememberReferral(raw: string): void {
  const code = normaliseCode(raw);
  if (!code) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() } satisfies Stored));
  } catch {
    // Private mode, storage disabled. The visit still works; it just will not
    // be credited, which is the right way to fail.
  }
}

/** The remembered code, if it has not expired. */
export function pendingReferral(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const { code, at } = JSON.parse(raw) as Stored;
    const ageDays = (Date.now() - at) / 86_400_000;
    if (!code || ageDays > ATTRIBUTION_DAYS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

export function clearReferral(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

/**
 * Attribute a freshly created account, once.
 *
 * Safe to call on every load: the server refuses to overwrite an existing
 * attribution, and the code is cleared locally as soon as it has been used or
 * rejected — a stale code must not keep being retried at every page view.
 */
export async function claimReferral(): Promise<boolean> {
  const code = pendingReferral();
  if (!code) return false;

  const r = await apiPost<{ attributed: boolean; reason?: string }>(
    '/api/referral',
    { code },
  );

  // Clear on success AND on a definitive refusal. Only a transient failure
  // (network, 503) leaves the code in place for the next attempt.
  if (r.ok) {
    clearReferral();
    return r.data?.attributed === true;
  }
  if (r.status === 400 || r.status === 404) clearReferral();
  return false;
}
