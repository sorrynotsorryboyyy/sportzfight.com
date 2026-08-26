import * as Sentry from '@sentry/nextjs';

/**
 * Error reporting.
 *
 * The audit counted zero logging lines in the whole of src/, in a codebase that
 * deliberately swallows errors — leaderboard.ts returns an empty array when an
 * index is missing, so a broken leaderboard would look like an empty one
 * forever. Without this, a production failure surfaces as a player writing
 * "ça marche pas".
 *
 * It matters more than usual here: the detector runs in the player's browser,
 * on phones and camera stacks nobody can reproduce locally.
 *
 * Optional by design. No DSN, no reporting, no crash — the same all-or-nothing
 * treatment as the payment configuration.
 */

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const monitoringEnabled = Boolean(DSN);

export function initMonitoring(): void {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    // No session replay, no performance tracing: both record what the user
    // does, and this app points a camera at them. Errors only.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    environment: process.env.NODE_ENV,

    beforeSend(event) {
      // Strip anything identifying before it leaves the device. The privacy
      // policy says we do not profile; an error report must not become the
      // exception to that.
      delete event.user;
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
      }
      return event;
    },
  });
}

/**
 * Report a swallowed failure without changing behaviour.
 *
 * For the catch blocks that must keep degrading gracefully — a missing index,
 * an offline read — but should no longer be invisible.
 */
export function reportSilent(error: unknown, context: string): void {
  if (!DSN) return;
  Sentry.captureException(error, { tags: { silent: context } });
}
