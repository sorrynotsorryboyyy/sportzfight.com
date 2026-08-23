'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-context';

/**
 * Client-side gate for /admin.
 *
 * NOT an authorization boundary. Without Cloud Functions there are no custom
 * claims, so `role` never reaches request.auth.token and no security rule can
 * act on it — anyone can bypass this by editing the bundle. /admin therefore
 * only ever shows things a signed-in user is already permitted to see.
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
