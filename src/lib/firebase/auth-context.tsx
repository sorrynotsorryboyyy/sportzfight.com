'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './client';
import { bootstrapClock, resetClock } from './clock';

interface AuthValue {
  user: User | null;
  username: string | null;
  avatar: string | null;
  loading: boolean;
  /** Google is the only sign-in method in V1. */
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

/** Ensure users/{uid} exists. Safe to call on every sign-in. */
async function ensureUserDoc(user: User) {
  const ref = doc(db(), 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  // Google always gives us a display name; keep the fallbacks for the rare
  // account that has none, and respect the 24-char cap the rules enforce.
  const name = (
    user.displayName ||
    user.email?.split('@')[0] ||
    'Athlete'
  ).slice(0, 24);

  await setDoc(ref, {
    username: name,
    email: user.email ?? '',
    avatar: user.photoURL ?? null,
    createdAt: serverTimestamp(),
  });
}

/** Popup is blocked in some in-app browsers; fall back to a full redirect. */
function shouldFallbackToRedirect(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? '';
  return (
    code === 'auth/popup-blocked' ||
    code === 'auth/operation-not-supported-in-this-environment'
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  // When Firebase is absent there is no auth state to wait for, so the
  // provider starts settled rather than flipping `loading` from an effect.
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    // Completes a redirect sign-in started on a previous page load.
    void getRedirectResult(auth()).catch(() => {
      /* no pending redirect, or it failed; onAuthStateChanged still governs */
    });

    return onAuthStateChanged(auth(), async (u) => {
      setUser(u);
      setUsername(u?.displayName ?? null);
      setAvatar(u?.photoURL ?? null);
      if (u) {
        try {
          await ensureUserDoc(u);
          // Establish a clock offset early so the lobby is already accurate.
          void bootstrapClock(u.uid);
        } catch {
          /* non-fatal: the battle screen re-measures before it matters */
        }
      } else {
        resetClock();
      }
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      username,
      avatar,
      loading,
      async signInWithGoogle() {
        const provider = new GoogleAuthProvider();
        // Always show the chooser: people testing a 1vs1 app routinely want a
        // second account rather than silent re-use of the first.
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
          await signInWithPopup(auth(), provider);
        } catch (e) {
          if (shouldFallbackToRedirect(e)) {
            await signInWithRedirect(auth(), provider);
            return;
          }
          throw e;
        }
      },
      async signOut() {
        await fbSignOut(auth());
        resetClock();
      },
    }),
    [user, username, avatar, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
