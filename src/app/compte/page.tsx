'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { BottomNav } from '@/components/ui/BottomNav';
import { Spinner } from '@/components/ui/Spinner';
import { LevelRing, XpBar } from '@/components/profile/LevelRing';
import { UsernameEditor } from '@/components/profile/UsernameEditor';
import { StreakCard } from '@/components/profile/StreakCard';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { useRequireAuth } from '@/lib/firebase/useRequireAuth';
import { useAuth } from '@/lib/firebase/auth-context';
import { battleHistory } from '@/lib/firebase/battles';
import { reconcileCredits } from '@/lib/firebase/stats';
import { resumeDailyBonus } from '@/lib/firebase/daily';
import { outcomeFor, xpFor } from '@/lib/progression/awards';
import { getExercise } from '@/lib/exercise/registry';
import { cn } from '@/lib/utils/cn';
import type { BattleWithId } from '@/lib/battle/types';

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: 'volt' | 'flare' | 'gold';
}) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-3 text-center">
      <p
        className={cn(
          'tnum text-2xl font-black leading-none',
          accent === 'volt' && 'text-volt-500',
          accent === 'flare' && 'text-flare-400',
          accent === 'gold' && 'text-gold',
          !accent && 'text-ink-100',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[0.6rem] font-bold uppercase tracking-widest text-ink-500">
        {label}
      </p>
    </div>
  );
}

function HistoryRow({ battle, uid }: { battle: BattleWithId; uid: string }) {
  const mine = uid === battle.player1;
  const myScore = mine ? battle.player1Score : battle.player2Score;
  const theirScore = mine ? battle.player2Score : battle.player1Score;
  const outcome = outcomeFor(battle.winner, uid);
  const ex = getExercise(battle.exercise);

  const when = battle.endedAt?.toDate?.();
  const date = when
    ? when.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    : '';

  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2.5">
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-lg text-xs font-black',
          outcome === 'win' && 'bg-volt-500/15 text-volt-500',
          outcome === 'loss' && 'bg-flare-500/15 text-flare-400',
          outcome === 'draw' && 'bg-ink-800 text-ink-400',
        )}
      >
        {outcome === 'win' ? 'V' : outcome === 'loss' ? 'D' : 'N'}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-200">
          {ex.emoji} {ex.label}
        </p>
        <p className="text-[0.65rem] text-ink-600">{date}</p>
      </div>

      <span className="tnum shrink-0 text-sm font-black">
        <span
          className={
            outcome === 'win' ? 'text-volt-500' : 'text-ink-200'
          }
        >
          {myScore}
        </span>
        <span className="mx-1 text-ink-700">—</span>
        <span className="text-ink-400">{theirScore}</span>
      </span>

      <span className="tnum w-14 shrink-0 text-right text-xs font-semibold text-cyan-glow">
        +{xpFor(outcome, myScore)}
        <span className="ml-0.5 text-[0.6rem] text-ink-600">XP</span>
      </span>
    </div>
  );
}

export default function AccountPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const { profile, needsUsernameFix, avatar, signOut } = useAuth();
  const [history, setHistory] = useState<BattleWithId[] | null>(null);

  const uid = user?.uid ?? null;

  // Pay out anything the battle screen missed — a tab closed before the
  // result landed, a dropped connection, or a battle played before the XP
  // system existed. Idempotent: receipts make an already-paid battle a no-op,
  // so this is safe to run on every visit.
  useEffect(() => {
    if (!uid) return;
    void reconcileCredits(uid)
      .then((r) => {
        // The profile updates itself through its onSnapshot subscription; only
        // the history list needs a nudge, and only if something actually paid.
        if (r.credited > 0) void battleHistory(uid, 20).then(setHistory);
      })
      .catch(() => {});

    // Same duty for the streak: a bonus whose receipt committed but whose
    // payout did not is owed, and finishing it here is idempotent.
    void resumeDailyBonus(uid).catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void battleHistory(uid, 20).then((h) => {
      if (alive) setHistory(h);
    });
    return () => {
      alive = false;
    };
  }, [uid]);

  if (!isFirebaseConfigured) return <SetupNotice />;
  if (authLoading || !uid || !profile) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <Spinner label="Chargement du compte…" />
      </main>
    );
  }

  const xp = profile.xp ?? 0;
  const wins = profile.wins ?? 0;
  const losses = profile.losses ?? 0;
  const draws = profile.draws ?? 0;
  const played = profile.battlesPlayed ?? 0;
  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;

  return (
    <>
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 p-5 pb-32">
      <header className="flex items-center justify-between py-1">
        <Link href="/">
          <Logo className="text-xl" />
        </Link>
        <button
          onClick={() => void signOut()}
          className="text-sm text-ink-400 transition-colors hover:text-ink-100"
        >
          Déconnexion
        </button>
      </header>

      {/* Forced rename: a legacy Google display name must be replaced before
          the player can get back to the rest of the app. */}
      {needsUsernameFix && (
        <Card className="border-gold/50 bg-gold/5">
          <h2 className="text-lg font-black uppercase tracking-tight text-gold">
            Choisis ton pseudo
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-300">
            Les pseudos sont désormais uniques et sans espaces ni accents.
            Voici une proposition à partir de ton nom — tu peux la garder ou en
            choisir une autre.
          </p>
          <div className="mt-4">
            <UsernameEditor uid={uid} current={profile.username} forced />
          </div>
        </Card>
      )}

      {/* identity */}
      <Card className="flex items-center gap-4">
        <LevelRing xp={xp} size={88} />
        <div className="min-w-0 flex-1">
          {needsUsernameFix ? (
            <p className="truncate text-2xl font-black tracking-tight text-ink-500">
              {profile.username}
            </p>
          ) : (
            <UsernameEditor uid={uid} current={profile.username} />
          )}
          <div className="mt-2 flex items-center gap-2">
            {avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt=""
                referrerPolicy="no-referrer"
                className="size-6 rounded-full border border-ink-700 object-cover"
              />
            )}
            <span className="tnum rounded-full bg-gold/10 px-2.5 py-0.5 text-sm font-black text-gold">
              {profile.coins ?? 0} $SC
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <XpBar xp={xp} />
      </Card>

      {/* The retention loop: streak, daily objective, and what they pay. */}
      {uid && <StreakCard uid={uid} />}

      {/* stats */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-400">
          Statistiques
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Victoires" value={wins} accent="volt" />
          <Stat label="Défaites" value={losses} accent="flare" />
          <Stat label="Nuls" value={draws} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat label="% victoire" value={`${winRate}%`} />
          <Stat label="Pompes" value={profile.totalReps ?? 0} />
          <Stat label="Record" value={profile.bestScore ?? 0} accent="gold" />
        </div>
      </section>

      {/* history */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-ink-400">
            Historique
          </h2>
          <Link
            href="/classement"
            className="text-xs font-semibold text-volt-500 hover:underline"
          >
            Top Mondial →
          </Link>
        </div>

        {history === null ? (
          <Spinner />
        ) : history.length === 0 ? (
          <Card className="text-center">
            <p className="text-sm text-ink-400">Aucun battle terminé.</p>
            <Link href="/matchmaking" className="mt-3 block">
              <Button size="md">Trouver un adversaire</Button>
            </Link>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((b) => (
              <HistoryRow key={b.id} battle={b} uid={uid} />
            ))}
          </div>
        )}
      </section>

    </main>

    <BottomNav />
    </>
  );
}
