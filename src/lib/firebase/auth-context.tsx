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
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './client';
import type { UserDoc } from '@/lib/battle/types';
import { bootstrapClock, resetClock } from './clock';

interface AuthValue {
  user: User | null;
  username: string | null;
  avatar: string | null;
  loading: boolean;
  /**
   * Set BY HAND in the Firestore console. The rules forbid every client write
   * path, but they also cannot READ it (no Cloud Functions means no custom
   * claims), so this gates a dev-only UI and is not an authorization boundary.
   */
  isAdmin: boolean;
  /** True until the profile document has resolved. */
  roleLoading: boolean;
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
  // `null` means "not resolved yet" for the CURRENT user. Signed-out is
  // derived during render rather than written from an effect: there is no
  // profile to wait for, so there is nothing to synchronise.
  const [adminFlag, setAdminFlag] = useState<boolean | null>(null);

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

  // Live subscription rather than a one-shot read: flipping the field in the
  // Firestore console should light up the nav without a reload, which is the
  // entire point of a hand-managed dev flag.
  useEffect(() => {
    if (!isFirebaseConfigured || !user) return;
    return onSnapshot(
      doc(db(), 'users', user.uid),
      (snap) =>
        setAdminFlag((snap.data() as UserDoc | undefined)?.role === 'admin'),
      () => setAdminFlag(false),
    );
  }, [user]);

  // Reset when the account changes, so a previous admin session cannot leak
  // its flag onto the next user for a frame.
  const [flagOwner, setFlagOwner] = useState<string | null>(user?.uid ?? null);
  if (flagOwner !== (user?.uid ?? null)) {
    setFlagOwner(user?.uid ?? null);
    setAdminFlag(null);
  }

  const isAdmin = !!user && adminFlag === true;
  const roleLoading = !!user && adminFlag === null;

  const value = useMemo<AuthValue>(
    () => ({
      user,
      username,
      avatar,
      loading,
      isAdmin,
      roleLoading,
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
    [user, username, avatar, loading, isAdmin, roleLoading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
