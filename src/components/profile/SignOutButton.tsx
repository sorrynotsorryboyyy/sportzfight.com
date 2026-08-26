'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';

/**
 * Sign out.
 *
 * Was a bare <button> duplicated on two pages, with no focus ring and no
 * pending state — signOut() awaits a network round-trip, so a double tap fired
 * it twice against a control that looked inert.
 */
export function SignOutButton() {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut().finally(() => setBusy(false));
      }}
      className="focus-ring rounded-lg px-1 text-sm text-ink-400 transition-colors hover:text-ink-100 disabled:opacity-50"
    >
      {busy ? 'Déconnexion…' : 'Déconnexion'}
    </button>
  );
}
