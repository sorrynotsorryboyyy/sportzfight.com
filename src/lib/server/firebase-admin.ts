import 'server-only';
import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { FIREBASE_SERVICE_ACCOUNT } from './env';

/**
 * The Admin SDK — the only thing in this system that can write a subscription.
 *
 * Security rules deny `subscription` on every client path, exactly as they deny
 * `role`. The Admin SDK bypasses rules by design, so the trust boundary moves
 * to this file: nothing here may run on behalf of an unverified caller.
 *
 * Requires the Blaze plan (a service account). Absent credentials, every caller
 * gets null and the API routes answer "payments not configured" rather than
 * crashing the deployment.
 */

const APP_NAME = 'sportzfight-admin';

let cached: App | null = null;

function adminApp(): App | null {
  if (cached) return cached;
  if (!FIREBASE_SERVICE_ACCOUNT) return null;

  // Lambdas are reused between invocations, so re-initialising would throw.
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) {
    cached = existing;
    return cached;
  }

  try {
    const json = JSON.parse(FIREBASE_SERVICE_ACCOUNT) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };

    cached = initializeApp(
      {
        credential: cert({
          projectId: json.project_id,
          clientEmail: json.client_email,
          // Vercel's environment UI stores newlines escaped; without this the
          // key is malformed and every call fails with an opaque error.
          privateKey: json.private_key.replace(/\\n/g, '\n'),
        }),
      },
      APP_NAME,
    );
    return cached;
  } catch {
    // A malformed service account must not take the whole site down: the app
    // works fine without payments.
    return null;
  }
}

export function adminDb() {
  const app = adminApp();
  return app ? getFirestore(app) : null;
}

/**
 * Verify a Firebase ID token and return the uid it belongs to.
 *
 * This is what stops a caller from opening a checkout — or a billing portal —
 * for somebody else's account. Never trust a uid sent in a request body.
 */
export async function uidFromToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  const app = adminApp();
  if (!app) return null;

  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    return decoded.uid;
  } catch {
    // Expired, forged, or signed for another project.
    return null;
  }
}

/**
 * Who is calling, and may they act as an admin?
 *
 * `uidFromToken` answers WHO; it never answers WHETHER. Every admin route needs
 * both, so the check lives here rather than being re-implemented — and
 * forgotten once — in each route.
 *
 * Returns the uid on success, or null. Callers must answer 403 on null and must
 * not leak whether the account exists.
 */
export type AdminCheck =
  /** Verified admin. */
  | { ok: true; uid: string }
  /** The server cannot check at all — no service account configured. */
  | { ok: false; reason: 'unconfigured' }
  /** No usable credential on the request. */
  | { ok: false; reason: 'unauthenticated' }
  /** Authenticated, but not an admin. */
  | { ok: false; reason: 'forbidden' };

/**
 * Distinguishes "you may not" from "I cannot tell".
 *
 * These are genuinely different problems and used to collapse into one 403:
 * a missing FIREBASE_SERVICE_ACCOUNT rendered "accès refusé" to a real admin,
 * which sent the reader hunting for a role bug that did not exist. Only
 * `forbidden` is an authorization failure.
 */
export async function checkAdmin(req: Request): Promise<AdminCheck> {
  // No service account: the Admin SDK cannot verify a token OR read a role,
  // so nothing here is a statement about the caller.
  if (!FIREBASE_SERVICE_ACCOUNT) return { ok: false, reason: 'unconfigured' };

  const db = adminDb();
  if (!db) return { ok: false, reason: 'unconfigured' };

  const uid = await uidFromToken(bearer(req));
  if (!uid) return { ok: false, reason: 'unauthenticated' };

  try {
    const snap = await db.doc(`users/${uid}`).get();
    const role = snap.get('role');
    // Normalised the same way the client does: the value is whatever a human
    // typed into the Firestore console, and a stray trailing newline has
    // locked an admin out before.
    const isAdmin =
      typeof role === 'string' && role.trim().toLowerCase() === 'admin';
    return isAdmin ? { ok: true, uid } : { ok: false, reason: 'forbidden' };
  } catch {
    // A read failure is an outage, not a refusal.
    return { ok: false, reason: 'unconfigured' };
  }
}

/** The uid of a verified admin, or null. Kept for callers that need no detail. */
export async function requireAdmin(req: Request): Promise<string | null> {
  const check = await checkAdmin(req);
  return check.ok ? check.uid : null;
}

/** Turn a failed check into the response it deserves. */
export function adminDenial(check: AdminCheck): Response {
  if (check.ok) throw new Error('adminDenial called on a successful check');

  if (check.reason === 'unconfigured') {
    return Response.json(
      { error: 'admin_unconfigured' },
      // 503, not 403: the server is missing FIREBASE_SERVICE_ACCOUNT. Saying
      // "forbidden" here blames the user for the operator's configuration.
      { status: 503 },
    );
  }
  if (check.reason === 'unauthenticated') {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }
  return Response.json({ error: 'forbidden' }, { status: 403 });
}

/** Pull the bearer token out of an Authorization header. */
export function bearer(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export { getApp };
