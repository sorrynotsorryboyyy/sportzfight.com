'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-context';

/**
 * Client-side gate for /admin.
 *
 * NOT an authorization boundary — it decides what to RENDER, nothing more.
 * Anyone can flip this in devtools.
 *
 * The real enforcement is elsewhere, in two places: firestore.rules gates
 * partner writes on an isAdmin() that reads the role with a get(), and every
 * /api/admin route calls requireAdmin() server-side. Both are unreachable from
 * a modified bundle.
 *
 * (An earlier version of this comment claimed admin could not be enforced at
 * all without Cloud Functions. That was wrong: custom claims need Functions,
 * but a rule reading the user document does not.)
 */
export function useRequireAdmin() {
  const { user, loading, isAdmin, roleLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Waiting on the profile matters: without this a real admin is bounced to
    // "/" on every hard refresh, because role is null for the first frame.
    if (loading || roleLoading) return;
    if (!user) router.replace('/login?next=/admin');
    // A signed-in non-admin is NOT redirected: silently bouncing to "/" makes
    // a mistyped role field indistinguishable from a broken page. The page
    // renders an explanation naming the account instead.
  }, [user, loading, isAdmin, roleLoading, router]);

  return {
    user,
    isAdmin,
    loading: loading || roleLoading,
    /** Signed in, resolved, and simply not an admin. */
    denied: !loading && !roleLoading && !!user && !isAdmin,
  };
}
