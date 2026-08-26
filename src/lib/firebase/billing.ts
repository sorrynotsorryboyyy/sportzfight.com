'use client';

import { auth } from './client';

/**
 * Client side of the payment flow.
 *
 * Both calls send a fresh Firebase ID token; the server verifies it and derives
 * the uid from there. Nothing here asserts who the user is, because nothing the
 * client asserts would be trusted.
 */

async function post(path: string, body?: unknown): Promise<string | null> {
  const user = auth().currentUser;
  if (!user) return null;

  try {
    const token = await user.getIdToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

/** Start a subscription. Resolves to the Checkout URL, or null on failure. */
export const startCheckout = (plan: string) => post('/api/checkout', { plan });

/** Open the billing portal: change card, download invoices, cancel. */
export const openPortal = () => post('/api/portal');
