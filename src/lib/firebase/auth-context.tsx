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
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './client';
import type { UserDoc } from '@/lib/battle/types';
import { ensureProfile } from './profile';
import { needsUsernameFix as isLegacyName } from '@/lib/utils/username';
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
  /** Live users/{uid} document, or null before it resolves. */
  profile: UserDoc | null;
  /**
   * The stored username predates the charset rule and must be replaced before
   * the player can do anything else. Drives the forced-rename gate.
   */
  needsUsernameFix: boolean;
  /**
   * The welcome screen has never been completed. Same shape as
   * needsUsernameFix: a derived boolean, not a self-guarding route.
   */
  needsOnboarding: boolean;
  /**
   * Creating the profile document failed. Previously swallowed, which left the
   * player signed in with nothing and every page spinning.
   */
  profileError: boolean;
  /** Google is the only sign-in method in V1. */
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

/**
 * Is this profile an admin?
 *
 * The value is typed by hand in the Firestore console, so it is trimmed and
 * lower-cased before comparing: pasting the word picks up a trailing newline
 * or a stray capital far too easily, and silently failing the check sends the
 * user to a redirect with no explanation of why.
 */
function isAdminRole(role: unknown): boolean {
  return typeof role === 'string' && role.trim().toLowerCase() === 'admin';
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
  const [profile, setProfile] = useState<UserDoc | null>(null);
  /** ensureProfile threw: the account has no profile document. */
  const [profileError, setProfileError] = useState(false);

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
          await ensureProfile(u);
          setProfileError(false);
        } catch {
          // This used to be swallowed, which left the player signed in with no
          // profile document and /compte spinning forever with no explanation.
          // Onboarding makes this path hotter, so it is now surfaced.
          setProfileError(true);
        }
        // Separate try: a clock probe failing is genuinely non-fatal, and it
        // must not be mistaken for a missing profile.
        try {
          void bootstrapClock(u.uid);
        } catch {
          /* the battle screen re-measures before it matters */
        }
      } else {
        resetClock();
        setProfileError(false);
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
      (snap) => {
        const d = (snap.data() as UserDoc | undefined) ?? null;
        setProfile(d);
        setAdminFlag(isAdminRole(d?.role));
      },
      () => {
        setProfile(null);
        setAdminFlag(false);
      },
    );
  }, [user]);

  // Reset when the account changes, so a previous admin session cannot leak
  // its flag onto the next user for a frame.
  const [flagOwner, setFlagOwner] = useState<string | null>(user?.uid ?? null);
  if (flagOwner !== (user?.uid ?? null)) {
    setFlagOwner(user?.uid ?? null);
    setAdminFlag(null);
    setProfile(null);
  }

  const isAdmin = !!user && adminFlag === true;
  const roleLoading = !!user && adminFlag === null;
  const needsUsernameFix = !!profile && isLegacyName(profile.username);

  // Derived from the profile, exactly like needsUsernameFix — a boolean the
  // pages consult, not a route that guards itself. That shape has already
  // proved it avoids redirect loops.
  //
  // Note profile === null means LOADING, not "absent": the snapshot arrives a
  // round trip after sign-in. Gating on it directly would flash the welcome
  // screen at every returning player.
  const needsOnboarding = !!profile && !profile.onboardedAt;
  // The stored pseudo is the identity players chose; the Google display name is
  // only the seed used before the profile resolves.
  const displayName = profile?.username ?? username;

  const value = useMemo<AuthValue>(
    () => ({
      user,
      username: displayName,
      avatar,
      loading,
      isAdmin,
      roleLoading,
      profile,
      needsUsernameFix,
      needsOnboarding,
      profileError,
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
    [
      user, displayName, avatar, loading, isAdmin, roleLoading, profile,
      needsUsernameFix, needsOnboarding, profileError,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
