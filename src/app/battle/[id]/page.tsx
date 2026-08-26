'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { Spinner } from '@/components/ui/Spinner';
import { BattleTimer } from '@/components/battle/BattleTimer';
import { Countdown } from '@/components/battle/Countdown';
import { OpponentBar } from '@/components/battle/OpponentBar';
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

/**
 * The two ways a battle ends before it starts: cancelled, or never found.
 *
 * Both used to be dead ends — cancelled offered only "find another opponent",
 * which left anyone who just wanted out with no way back. Both now return home
 * on their own and still offer the buttons, so neither the delay nor a click is
 * the single escape route.
 */
function DeadEndScreen({
  title,
  detail,
  offerRematch = false,
}: {
  title: string;
  detail: string;
  offerRematch?: boolean;
}) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(5);

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    const go = setTimeout(() => router.replace('/'), 5000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <Logo className="text-2xl" />
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tighter">
          {title}
        </h1>
        <p className="mt-2 text-ink-400">{detail}</p>
        <p className="mt-1 text-sm text-ink-500">
          Retour à l’accueil dans {seconds}s…
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {offerRematch && (
          <Link href="/matchmaking">
            <Button>Chercher un autre adversaire</Button>
          </Link>
        )}
        <Link href="/">
          <Button variant={offerRematch ? 'ghost' : 'primary'}>
            Retour à l’accueil
          </Button>
        </Link>
      </div>
    </main>
  );
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

  const {
    start: startCamera,
    stop: stopCamera,
    finalize,
    engineStatus,
    error: engineError,
  } = session;

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

  // A player who armed and then lost the camera must be un-armed, or the
  // battle starts anyway and they score zero. Only while still in the lobby:
  // once live, the camera dropping is a problem to survive, not to rewind.
  useEffect(() => {
    if (!battle || !slot) return;
    if (battle.status !== 'waiting' && battle.status !== 'ready') return;
    if (!readyOf(battle, slot)) return;
    if (engineStatus === 'running' && !engineError) return;

    void setReady(battle.id, slot, false).catch(() => {});
  }, [battle, slot, engineStatus, engineError]);

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
      <DeadEndScreen
        title="Battle introuvable"
        detail="Ce battle n’existe pas ou a été supprimé."
      />
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

  // The camera is mandatory: declaring yourself ready without one guarantees a
  // score of zero, which is exactly what happened when testing on a laptop with
  // no webcam. Spectators are exempt — they never arm anything.
  const cameraReady =
    isSpectator || (engineStatus === 'running' && !engineError);

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
      <DeadEndScreen
        title="Battle annulé"
        detail="Ton adversaire a quitté ou le battle a expiré."
        offerRematch
      />
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

    // The camera fills the screen: during the effort it is the only thing the
    // athlete looks at. Everything else floats over it — you on top, the
    // opponent reduced to a bar at the bottom.
    return (
      <main className="relative h-dvh overflow-hidden">
        {view.phase === 'countdown' && <Countdown digit={view.countdownDigit} />}

        <CameraStage
          variant="fullbleed"
          videoRef={session.videoRef}
          landmarks={session.landmarks}
          result={session.result}
          status={session.engineStatus}
          error={session.error}
          onRetry={() => void startCamera()}
        />

        {/* pointer-events-none throughout: nothing here is interactive, and
            the pose skeleton underneath must stay visible. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {/* --- top: you, and the clock --- */}
          <div className="flex items-start justify-between gap-3 bg-gradient-to-b from-ink-950/85 to-transparent p-4 pb-12">
            <div className="min-w-0">
              <p className="truncate text-3xs font-bold uppercase tracking-widest text-volt-500">
                {meName}
              </p>
              <span className="tnum block text-7xl font-black leading-none text-volt-500 sm:text-8xl">
                {myScore}
              </span>
              <p className="mt-0.5 text-3xs font-bold uppercase tracking-widest text-ink-500">
                pompes
              </p>
            </div>

            {/* The clock sits up here rather than centred: dead centre is
                exactly where the athlete's torso is in frame. */}
            <div className="shrink-0 scale-75 origin-top-right sm:scale-90">
              <BattleTimer
                secondsLeft={view.secondsLeft}
                progress={view.progress}
                approximate={view.clockDegraded}
              />
            </div>
          </div>

          {/* --- bottom: form feedback, then the opponent --- */}
          <div className="flex flex-col gap-2 bg-gradient-to-t from-ink-950/85 to-transparent p-4 pt-12">
            {repNote && (
              <span className="self-center rounded-full bg-gold/95 px-3 py-1 text-xs font-bold text-ink-950">
                {FORM_MESSAGES[repNote]}
              </span>
            )}

            <OpponentBar
              name={oppName}
              avatar={oppAvatar}
              score={oppScore}
              connected={opponentConnected}
              waiting={!battle.player2}
            />
          </div>
        </div>

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
        {/* Linked, unlike before: this was the only element on a page with no
            other navigation, so a spectator had literally no way out. */}
        <Link href="/" aria-label="SportzFight, accueil" className="focus-ring self-start">
          <Logo className="text-2xl" />
        </Link>
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
        {/* top: you only. Same hierarchy as the in-play screen, so the two
            phases read as one continuous experience. */}
        <div className="bg-gradient-to-b from-ink-950/90 to-transparent p-4 pb-12">
          {/* Just the logo: the player picked the mode a moment ago, so
              repeating it here only competes with the camera. */}
          <div className="pointer-events-auto mb-4">
            <Link href="/">
              <Logo className="text-lg" />
            </Link>
          </div>

          <p className="truncate text-3xs font-bold uppercase tracking-widest text-volt-500">
            {meName}
          </p>
          <p className="mt-1 text-2xl font-black uppercase leading-none tracking-tight text-ink-100">
            {myReady ? 'Prêt' : 'En position'}
          </p>
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
              {/* No score yet, so the bar shows readiness instead. Without it
                  the wait is opaque: you cannot tell whether the opponent is
                  still there or has walked away. */}
              <OpponentBar
                name={oppName}
                avatar={oppAvatar}
                connected={opponentConnected}
                ready={slot === 1 ? battle.player2Ready : battle.player1Ready}
              />
              <p className="text-center text-xs leading-relaxed text-ink-400">
                {cameraReady ? exercise.setupHint : 'La caméra doit être active pour lancer un battle.'}
              </p>
              <Button
                size="xl"
                variant={myReady ? 'secondary' : 'primary'}
                disabled={!cameraReady && !myReady}
                onClick={() => slot && void setReady(battle.id, slot, !myReady)}
                className={!myReady && cameraReady ? 'animate-pulse-ring' : undefined}
              >
                {myReady
                  ? 'ANNULER'
                  : cameraReady
                    ? 'JE SUIS PRÊT'
                    : 'CAMÉRA REQUISE'}
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
