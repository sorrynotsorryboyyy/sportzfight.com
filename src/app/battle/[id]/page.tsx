'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { Spinner } from '@/components/ui/Spinner';
import { BattleTimer } from '@/components/battle/BattleTimer';
import { Countdown } from '@/components/battle/Countdown';
import { OpponentPanel } from '@/components/battle/OpponentPanel';
import { PlayerCard } from '@/components/battle/PlayerCard';
import { ResultScreen } from '@/components/battle/ResultScreen';
import { CameraStage } from '@/components/camera/CameraStage';

import { db, isFirebaseConfigured } from '@/lib/firebase/client';
import { useRequireAuth } from '@/lib/firebase/useRequireAuth';
import { cancelBattle, flushScore, setReady } from '@/lib/firebase/battles';
import { serverNow } from '@/lib/firebase/clock';
import { useBattle } from '@/lib/battle/useBattle';
import { useBattleClock } from '@/lib/battle/useBattleClock';
import { useBattleDriver } from '@/lib/battle/useBattleDriver';
import { isStale, readyOf, slotOf } from '@/lib/battle/machine';
import { getExercise } from '@/lib/exercise/registry';
import { useExerciseSession } from '@/lib/exercise/runtime/useExerciseSession';
import { FORM_MESSAGES } from '@/lib/exercise/types';
import type { PlayerSlot, ScoreMeta, UserDoc } from '@/lib/battle/types';

interface Profile {
  username: string;
  avatar: string | null;
}

/** Resolve display name and avatar for both players. */
function useProfiles(p1: string | null, p2: string | null) {
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  useEffect(() => {
    const ids = [p1, p2].filter((x): x is string => !!x);
    let alive = true;

    void Promise.all(
      ids.map(async (id) => {
        try {
          const snap = await getDoc(doc(db(), 'users', id));
          const d = snap.data() as UserDoc | undefined;
          return [
            id,
            { username: d?.username ?? '', avatar: d?.avatar ?? null },
          ] as const;
        } catch {
          return [id, { username: '', avatar: null }] as const;
        }
      }),
    ).then((pairs) => {
      if (!alive) return;
      setProfiles(Object.fromEntries(pairs));
    });

    return () => {
      alive = false;
    };
  }, [p1, p2]);

  return profiles;
}

export default function BattlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, loading: authLoading } = useRequireAuth();
  const uid = user?.uid ?? null;

  const { battle, loading, error } = useBattle(isFirebaseConfigured ? id : null);
  const view = useBattleClock(battle);
  useBattleDriver(battle, uid, view.phase);

  const slot: PlayerSlot | null = battle && uid ? slotOf(battle, uid) : null;
  const profiles = useProfiles(battle?.player1 ?? null, battle?.player2 ?? null);

  const finalizedRef = useRef(false);

  const exercise = getExercise(battle?.exercise ?? 'pushups');

  const write = useCallback(
    (s: PlayerSlot, score: number, meta: ScoreMeta, final: boolean) =>
      flushScore(id, s, score, meta, final),
    [id],
  );

  // The camera is mandatory in V1, so there is no counting mode to choose.
  const session = useExerciseSession({
    exerciseId: battle?.exercise ?? 'pushups',
    mode: 'camera',
    slot,
    active: view.phase === 'active',
    write,
  });

  const { start: startCamera, stop: stopCamera, finalize } = session;

  const isSpectator = slot === null;
  const finished = view.phase === 'finished' || battle?.status === 'finished';

  // Start the camera as soon as a player lands on a live battle — there is no
  // opt-in step, because counting cannot happen without it.
  useEffect(() => {
    if (isSpectator || finished) return;
    if (battle?.status === 'cancelled') return;
    void startCamera();
    return () => stopCamera();
  }, [isSpectator, finished, battle?.status, startCamera, stopCamera]);

  // Flush the final count exactly once, the moment the effort window closes.
  useEffect(() => {
    if (view.phase !== 'ending' && view.phase !== 'finished') return;
    if (finalizedRef.current || slot === null) return;
    finalizedRef.current = true;
    void finalize().finally(() => stopCamera());
  }, [view.phase, slot, finalize, stopCamera]);

  const opponentSlot: PlayerSlot = slot === 1 ? 2 : 1;
  const opponentConnected = useMemo(() => {
    if (!battle?.player2) return false;
    return !isStale(battle, opponentSlot, serverNow());
  }, [battle, opponentSlot]);

  if (!isFirebaseConfigured) return <SetupNotice />;
  if (authLoading || loading) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <Spinner label="Chargement du battle…" />
      </main>
    );
  }

  if (error || !battle) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
        <Logo className="text-2xl" />
        <h1 className="text-3xl font-black uppercase tracking-tighter">
          Battle introuvable
        </h1>
        <p className="text-ink-400">Ce battle n’existe pas ou a été supprimé.</p>
        <Link href="/">
          <Button>Retour à l’accueil</Button>
        </Link>
      </main>
    );
  }

  const p1 = profiles[battle.player1];
  const p2 = battle.player2 ? profiles[battle.player2] : undefined;
  const p1Name = p1?.username || 'Joueur 1';
  const p2Name = battle.player2 ? p2?.username || 'Joueur 2' : 'En attente…';

  const meName = slot === 2 ? p2Name : p1Name;
  const oppName = slot === 2 ? p1Name : p2Name;
  const oppAvatar = (slot === 2 ? p1?.avatar : p2?.avatar) ?? null;

  const myReady = slot ? readyOf(battle, slot) : false;

  // ---------- finished ----------
  if (finished) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col p-6">
        <header className="py-2">
          <Link href="/">
            <Logo className="text-xl" />
          </Link>
        </header>
        <ResultScreen battle={battle} uid={uid} p1Name={p1Name} p2Name={p2Name} />
      </main>
    );
  }

  if (battle.status === 'cancelled') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
        <Logo className="text-2xl" />
        <h1 className="text-3xl font-black uppercase tracking-tighter">
          Battle annulé
        </h1>
        <Link href="/matchmaking">
          <Button>Chercher un autre adversaire</Button>
        </Link>
      </main>
    );
  }

  // ---------- live: countdown or effort ----------
  const inPlay =
    view.phase === 'countdown' || view.phase === 'active' || view.phase === 'ending';

  if (inPlay) {
    const myStored = slot === 1 ? battle.player1Score : battle.player2Score;
    const myScore = slot ? Math.max(session.count, myStored) : 0;
    const oppScore =
      slot === 2 ? battle.player1Score : battle.player2Score;
    const repNote = session.result?.repNotes?.[0];

    if (isSpectator) {
      return (
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
          {view.phase === 'countdown' && <Countdown digit={view.countdownDigit} />}
          <div className="flex items-stretch gap-3">
            <PlayerCard
              name={p1Name}
              score={battle.player1Score}
              isSelf={false}
              slot={1}
              compact
              connected={!isStale(battle, 1, serverNow())}
            />
            <PlayerCard
              name={p2Name}
              score={battle.player2Score}
              isSelf={false}
              slot={2}
              compact
              connected={!isStale(battle, 2, serverNow())}
            />
          </div>
          <BattleTimer
            secondsLeft={view.secondsLeft}
            progress={view.progress}
            approximate={view.clockDegraded}
          />
          <Card className="text-center text-sm text-ink-400">
            Tu regardes ce battle en spectateur.
          </Card>
        </main>
      );
    }

    // Split screen. Stacked in portrait (the natural phone grip), side by side
    // once there is width for it.
    return (
      <main className="relative flex h-dvh flex-col overflow-hidden sm:flex-row">
        {view.phase === 'countdown' && <Countdown digit={view.countdownDigit} />}

        {/* --- your half: the live camera --- */}
        <section className="relative min-h-0 flex-1">
          <CameraStage
            variant="fullbleed"
            videoRef={session.videoRef}
            landmarks={session.landmarks}
            result={session.result}
            status={session.engineStatus}
            error={session.error}
            onRetry={() => void startCamera()}
          />

          {/* Your score, over the video. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-ink-950/90 to-transparent p-4 pt-12">
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-widest text-volt-500">
                Toi · {meName}
              </p>
              <span className="tnum block text-6xl font-black leading-none text-volt-500 sm:text-7xl">
                {myScore}
              </span>
            </div>
            {repNote && (
              <span className="mb-1 rounded-full bg-gold/95 px-2.5 py-1 text-xs font-bold text-ink-950">
                {FORM_MESSAGES[repNote]}
              </span>
            )}
          </div>
        </section>

        {/* --- the timer, on the divider: it belongs to neither side --- */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
          <div className="scale-75 rounded-full bg-ink-950/80 p-1 backdrop-blur sm:scale-90">
            <BattleTimer
              secondsLeft={view.secondsLeft}
              progress={view.progress}
              approximate={view.clockDegraded}
            />
          </div>
        </div>

        {/* --- opponent half --- */}
        <section className="min-h-0 flex-1 border-t border-ink-800 sm:border-l sm:border-t-0">
          <OpponentPanel
            name={oppName}
            avatar={oppAvatar}
            score={oppScore}
            connected={opponentConnected}
            exerciseLabel={exercise.label}
            waiting={!battle.player2}
          />
        </section>

        {view.phase === 'ending' && (
          <div className="absolute inset-x-0 bottom-0 z-40 bg-ink-950/95 p-4 text-center text-sm text-ink-300">
            Temps écoulé — calcul du résultat…
          </div>
        )}
      </main>
    );
  }

  // ---------- lobby: full-bleed camera with the info floating over it ----------
  if (isSpectator) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
        <Logo className="text-2xl" />
        <div className="flex items-stretch gap-3">
          <PlayerCard
            name={p1Name}
            score={0}
            isSelf={false}
            slot={1}
            ready={battle.player1Ready}
            connected={!isStale(battle, 1, serverNow())}
          />
          <PlayerCard
            name={p2Name}
            score={0}
            isSelf={false}
            slot={2}
            ready={battle.player2Ready}
            connected={!isStale(battle, 2, serverNow())}
          />
        </div>
        <Card className="text-center text-sm text-ink-400">
          Tu regardes ce battle en spectateur.
        </Card>
      </main>
    );
  }

  return (
    <main className="relative h-dvh overflow-hidden">
      <CameraStage
        variant="fullbleed"
        videoRef={session.videoRef}
        landmarks={session.landmarks}
        result={session.result}
        status={session.engineStatus}
        error={session.error}
        onRetry={() => void startCamera()}
      />

      {/* Everything below floats over the video. pointer-events-none on the
          scrims so only the actual controls are clickable. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
        {/* top: identity + both players */}
        <div className="bg-gradient-to-b from-ink-950/90 to-transparent p-4 pb-10">
          <div className="pointer-events-auto mb-3 flex items-center justify-between">
            <Link href="/">
              <Logo className="text-lg" />
            </Link>
            <span className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-400">
              {exercise.emoji} {exercise.label} · {battle.durationSecs}s
            </span>
          </div>

          <div className="flex items-stretch gap-2">
            <PlayerCard
              name={p1Name}
              score={0}
              isSelf={slot === 1}
              slot={1}
              compact
              ready={battle.player1Ready}
              connected={!isStale(battle, 1, serverNow())}
            />
            <PlayerCard
              name={p2Name}
              score={0}
              isSelf={slot === 2}
              slot={2}
              compact
              ready={battle.player2Ready}
              connected={
                !!battle.player2 && !isStale(battle, 2, serverNow())
              }
            />
          </div>
        </div>

        {/* bottom: setup hint + the ready control, in the thumb zone */}
        <div className="bg-gradient-to-t from-ink-950/95 to-transparent p-4 pt-12">
          {!battle.player2 ? (
            <div className="pointer-events-auto flex flex-col gap-3">
              <p className="text-center text-sm text-ink-300">
                <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-volt-500 align-middle" />
                Recherche d’un adversaire…
              </p>
              <p className="text-center text-xs text-ink-500">
                {exercise.setupHint}
              </p>
              <Button variant="ghost" onClick={() => void cancelBattle(battle.id)}>
                Annuler
              </Button>
            </div>
          ) : (
            <div className="pointer-events-auto flex flex-col gap-3">
              <p className="text-center text-xs leading-relaxed text-ink-400">
                {exercise.setupHint}
              </p>
              <Button
                size="xl"
                variant={myReady ? 'secondary' : 'primary'}
                onClick={() => slot && void setReady(battle.id, slot, !myReady)}
                className={!myReady ? 'animate-pulse-ring' : undefined}
              >
                {myReady ? 'ANNULER' : 'JE SUIS PRÊT'}
              </Button>
              {myReady && (
                <p className="text-center text-sm text-ink-400">
                  En attente de ton adversaire…
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
