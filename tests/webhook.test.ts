import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The webhook is where money becomes entitlement, so the two ways it can fail
 * quietly are worth a test each.
 *
 * These read the source as text rather than executing the route: the handler
 * needs Stripe credentials and a live Admin SDK, and what is being asserted
 * here is a property of the code's shape, not its runtime behaviour.
 */

const ROUTE = readFileSync('src/app/api/webhook/route.ts', 'utf8');
const ENV_EXAMPLE = readFileSync('.env.local.example', 'utf8');

/** Event names the handler actually switches on. */
function handledEvents(): string[] {
  return [...ROUTE.matchAll(/case '([a-z_]+\.[a-z_.]+)':/g)].map((m) => m[1]);
}

describe('the documented events match the handled ones', () => {
  it('handles invoice.paid, the only event carrying an amount', () => {
    // Without it the payments ledger stays empty and no partner is ever paid.
    expect(handledEvents()).toContain('invoice.paid');
  });

  it('documents every event the code handles', () => {
    // The setup instructions were missing invoice.paid. Following them gave
    // working subscriptions and zero commissions, with nothing to show why.
    for (const event of handledEvents()) {
      expect(
        ENV_EXAMPLE.includes(event),
        `${event} is handled but absent from .env.local.example`,
      ).toBe(true);
    }
  });

  it('handles the subscription lifecycle as well as the payment', () => {
    const events = handledEvents();
    expect(events).toContain('customer.subscription.created');
    expect(events).toContain('customer.subscription.updated');
    expect(events).toContain('customer.subscription.deleted');
    expect(events).toContain('checkout.session.completed');
  });
});

describe('a failure never answers 200', () => {
  it('treats a missing Admin SDK as retryable, not as success', () => {
    // `if (!db) return;` answered 200. Stripe then marks the event delivered
    // and never retries — so a misconfigured service account would charge
    // every customer and grant nothing, permanently and silently.
    expect(ROUTE).not.toMatch(/if \(!db\) return;/);
    expect(ROUTE).toMatch(/if \(!db\) throw new Retryable/);
  });

  it('treats a failed subscription lookup as retryable', () => {
    // Swallowing it dropped the payment record and the partner commission.
    expect(ROUTE).toMatch(/throw new Retryable\('subscription_lookup_failed'\)/);
  });

  it('answers 500 on anything that reaches the catch', () => {
    expect(ROUTE).toMatch(/status: 500/);
  });

  it('still rejects an unsigned or forged event with 400, not 500', () => {
    // A bad signature is not a transient failure: retrying cannot fix it, and
    // 500 would make Stripe hammer the endpoint for three days.
    expect(ROUTE).toMatch(/invalid_signature/);
    expect(ROUTE).toMatch(/status: 400/);
  });

  it('verifies the signature before parsing the body', () => {
    // Order matters: parsing first would mean acting on unverified input.
    const verify = ROUTE.indexOf('constructEventAsync');
    const handle = ROUTE.indexOf('switch (event.type)');
    expect(verify).toBeGreaterThan(-1);
    expect(handle).toBeGreaterThan(verify);
  });
});

describe('the ledger cannot be written twice', () => {
  it('keys payments by the Stripe invoice id', () => {
    // Stripe retries aggressively; the document id is what makes a replay a
    // no-op rather than a double commission.
    expect(ROUTE).toMatch(/payments\/\$\{invoice\.id\}/);
  });

  it('returns early when the invoice is already recorded', () => {
    expect(ROUTE).toMatch(/if \(\(await ref\.get\(\)\)\.exists\) return;/);
  });
});
