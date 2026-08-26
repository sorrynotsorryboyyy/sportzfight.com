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

/** Pull the bearer token out of an Authorization header. */
export function bearer(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export { getApp };
