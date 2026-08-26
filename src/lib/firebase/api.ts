'use client';

import { auth } from './client';

/**
 * Calling our own API routes as the signed-in user.
 *
 * `billing.ts` already does the Bearer-token dance, but its helper is hardwired
 * to `{ url?: string }` and collapses every failure to null — unusable for a
 * dashboard, which needs the data back and needs to tell 403 from 500.
 *
 * The token is minted per call: an ID token lasts an hour and the SDK refreshes
 * it, so caching one here would eventually send an expired credential.
 */

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** The server's error code, when it sent one. */
  error: string | null;
}

async function call<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<ApiResult<T>> {
  const user = auth().currentUser;
  if (!user) return { ok: false, status: 401, data: null, error: 'unauthenticated' };

  try {
    const token = await user.getIdToken();
    const res = await fetch(path, {
      method: init.method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    // A route may answer 503 with no body at all.
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const error =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : 'request_failed';
      return { ok: false, status: res.status, data: null, error };
    }

    return { ok: true, status: res.status, data: payload as T, error: null };
  } catch {
    // Offline, DNS, CORS — indistinguishable from here and all equally fatal.
    return { ok: false, status: 0, data: null, error: 'network' };
  }
}

export const apiGet = <T,>(path: string) => call<T>(path, { method: 'GET' });

export const apiPost = <T,>(path: string, body?: unknown) =>
  call<T>(path, { method: 'POST', body: body ?? {} });

export const apiPatch = <T,>(path: string, body: unknown) =>
  call<T>(path, { method: 'PATCH', body });
