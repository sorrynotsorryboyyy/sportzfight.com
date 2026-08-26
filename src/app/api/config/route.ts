import { NextResponse } from 'next/server';
import { paymentsEnabled } from '@/lib/server/env';

/**
 * What the client is allowed to know about the server's configuration.
 *
 * Exactly one boolean. The shop needs to know whether to render a real
 * subscribe button or the "Bientôt" state, and that answer depends on secrets
 * the browser must never see.
 */

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(
    { payments: paymentsEnabled },
    // Short cache: flipping the env vars should take effect quickly, but this
    // must not be re-asked on every render.
    { headers: { 'cache-control': 'public, max-age=60' } },
  );
}
