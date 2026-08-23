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
import { PlayerCard } from '@/components/battle/PlayerCard';
import { ResultScreen } from '@/components/battle/ResultScreen';
import { ShareCode } from '@/components/battle/ShareCode';
import { CameraStage } from '@/components/camera/CameraStage';
import { ManualPad } from '@/components/camera/ManualPad';

import { db, isFirebaseConfigured } from '@/lib/firebase/client';
import { useRequireAuth } from '@/lib/firebase/useRequireAuth';
import { cancelBattle, flushScore, setReady } from '@/lib/firebase/battles';
import { serverNow } from '@/lib/firebase/clock';
import { useBattle } from '@/lib/battle/useBattle';
import { useBattleClock } from '@/lib/battle/useBattleClock';
import { useBattleDriver } from '@/lib/battle/useBattleDriver';
import { isStale, readyOf, slotOf } from '@/lib/battle/machine';
import { getExercise } from '@/lib/exercise/registry';
import {
  useExerciseSession,
  type CountingMode,
} from '@/lib/exercise/runtime/useExerciseSession';
import type { PlayerSlot, ScoreMeta, UserDoc } from '@/lib/battle/types';

/** Resolve display names for both players, falling back to a slot label. */
function usePlayerNames(p1: string | null, p2: string | null) {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = [p1, p2].filter((x): x is string => !!x);
    let alive = true;

    void Promise.all(
      ids.map(async (id) => {
        try {
          const snap = await getDoc(doc(db(), 'users', id));
          return [id, (snap.data() as UserDoc | undefined)?.username ?? ''] as const;
        } catch {
          return [id, ''] as const;
        }
      }),
    ).then((pairs) => {
      if (!alive) return;
      setNames(Object.fromEntries(pairs.filter(([, n]) => n)));
    });

    return () => {
      alive = false;
    };
  }, [p1, p2]);

  return names;
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
  const names = usePlayerNames(battle?.player1 ?? null, battle?.player2 ?? null);

  const [mode, setMode] = useState<CountingMode>('camera');
  const [armed, setArmed] = useState(false);
  const finalizedRef = useRef(false);

  const exercise = getExercise(battle?.exercise ?? 'pushups');

  const write = useCallback(
    (s: PlayerSlot, score: number, meta: ScoreMeta, final: boolean) =>
      flushScore(id, s, score, meta, final),
    [id],
  );

  const session = useExerciseSession({
    exerciseId: battle?.exercise ?? 'pushups',
    mode,
    slot,
    active: view.phase === 'active',
    write,
  });

  const { start: startCamera, stop: stopCamera, finalize } = session;

  // Start the camera once the athlete opts in, and tear it down when the
  // battle is over so the indicator light does not stay on.
  useEffect(() => {
    if (!armed || mode !== 'camera') return;
    void startCamera();
    return () => stopCamera();
  }, [armed, mode, startCamera, stopCamera]);

  // Flush the final count exactly once, the moment the effort window closes.
  useEffect(() => {
    if (view.phase !== 'ending' && view.phase !== 'finished') return;
    if (finalizedRef.current || slot === null) return;
    finalizedRef.current = true;
    void finalize().finally(() => stopCamera());
  }, [view.phase, slot, finalize, stopCamera]);

  const opponentConnected = useMemo(() => {
    if (!battle) return true;
    const other: PlayerSlot = slot === 1 ? 2 : 1;
    if (!battle.player2) return false;
    return !isStale(battle, other, serverNow());
  }, [battle, slot]);

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
        <p className="text-ink-400">
          Ce battle n’existe pas ou a été supprimé.
        </p>
        <Link href="/">
          <Button>Retour à l’accueil</Button>
        </Link>
      </main>
    );
  }

  const p1Name = names[battle.player1] || 'Joueur 1';
  const p2Name = battle.player2
    ? names[battle.player2] || 'Joueur 2'
    : 'En attente…';

  const myReady = slot ? readyOf(battle, slot) : false;
  const isSpectator = slot === null;

  // ---------- finished ----------
  if (view.phase === 'finished' || battle.status === 'finished') {
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
        <Link href="/battle/create">
          <Button>Créer un nouveau battle</Button>
        </Link>
      </main>
    );
  }

  // ---------- live: countdown or effort ----------
  const inPlay = view.phase === 'countdown' || view.phase === 'active' || view.phase === 'ending';

  if (inPlay) {
    const myScore = slot === 1 ? battle.player1Score : battle.player2Score;
    const localScore = slot ? Math.max(session.count, myScore) : 0;

    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
        {view.phase === 'countdown' && <Countdown digit={view.countdownDigit} />}

        <div className="flex items-stretch gap-3">
          <PlayerCard
            name={p1Name}
            score={slot === 1 ? localScore : battle.player1Score}
            isSelf={slot === 1}
            slot={1}
            compact
            connected={slot === 1 ? true : !isStale(battle, 1, serverNow())}
          />
          <div className="flex items-center">
            <BattleTimer
              secondsLeft={view.secondsLeft}
              progress={view.progress}
              approximate={view.clockDegraded}
            />
          </div>
          <PlayerCard
            name={p2Name}
            score={slot === 2 ? localScore : battle.player2Score}
            isSelf={slot === 2}
            slot={2}
            compact
            connected={slot === 2 ? true : opponentConnected}
          />
        </div>

        {isSpectator ? (
          <Card className="text-center text-sm text-ink-400">
            Tu regardes ce battle en spectateur.
          </Card>
        ) : mode === 'camera' ? (
          <>
            <CameraStage
              videoRef={session.videoRef}
              landmarks={session.landmarks}
              result={session.result}
              status={session.engineStatus}
              error={session.error}
              onRetry={() => void startCamera()}
              onUseManual={() => setMode('manual')}
            />
            <ManualPad
              variant="correction"
              onAdjust={session.adjust}
              disabled={view.phase !== 'active'}
            />
          </>
        ) : (
          <ManualPad
            variant="primary"
            count={localScore}
            onAdjust={session.adjust}
            disabled={view.phase !== 'active'}
          />
        )}

        {view.phase === 'ending' && (
          <Card className="text-center text-sm text-ink-300">
            Temps écoulé — calcul du résultat…
          </Card>
        )}
      </main>
    );
  }

  // ---------- lobby ----------
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between py-1">
        <Link href="/">
          <Logo className="text-xl" />
        </Link>
        <span className="text-xs font-bold uppercase tracking-widest text-ink-500">
          {exercise.emoji} {exercise.label} · {battle.durationSecs}s
        </span>
      </header>

      {!battle.player2 ? (
        <>
          <div className="text-center">
            <h1 className="text-3xl font-black uppercase tracking-tighter text-volt-500">
              Battle créé !
            </h1>
            <p className="mt-2 text-ink-400">
              Envoie ce code à ton adversaire pour qu’il te rejoigne.
            </p>
          </div>
          <ShareCode code={battle.code} />
          <div className="flex items-center justify-center gap-2 text-sm text-ink-500">
            <span className="size-1.5 animate-pulse rounded-full bg-volt-500" />
            En attente d’un adversaire…
          </div>
          {slot === 1 && (
            <Button
              variant="ghost"
              onClick={() => void cancelBattle(battle.id)}
              className="mt-auto"
            >
              Annuler le battle
            </Button>
          )}
        </>
      ) : (
        <>
          <div className="text-center">
            <h1 className="text-3xl font-black uppercase tracking-tighter">
              Prêts ?
            </h1>
            <p className="mt-2 text-ink-400">{exercise.tagline}</p>
          </div>

          <div className="flex items-stretch gap-3">
            <PlayerCard
              name={p1Name}
              score={0}
              isSelf={slot === 1}
              slot={1}
              ready={battle.player1Ready}
              connected={!isStale(battle, 1, serverNow())}
            />
            <PlayerCard
              name={p2Name}
              score={0}
              isSelf={slot === 2}
              slot={2}
              ready={battle.player2Ready}
              connected={!isStale(battle, 2, serverNow())}
            />
          </div>

          {isSpectator ? (
            <Card className="text-center text-sm text-ink-400">
              Tu regardes ce battle en spectateur.
            </Card>
          ) : (
            <>
              <Card>
                <p className="text-sm font-semibold text-ink-200">
                  Mode de comptage
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setMode('camera')}
                    className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      mode === 'camera'
                        ? 'border-volt-500 bg-volt-500/10 text-volt-400'
                        : 'border-ink-700 text-ink-400'
                    }`}
                  >
                    📷 Caméra
                  </button>
                  <button
                    onClick={() => setMode('manual')}
                    className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      mode === 'manual'
                        ? 'border-volt-500 bg-volt-500/10 text-volt-400'
                        : 'border-ink-700 text-ink-400'
                    }`}
                  >
                    👆 Manuel
                  </button>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-500">
                  {mode === 'camera'
                    ? exercise.setupHint
                    : 'Appuie sur le bouton à chaque répétition.'}
                </p>
              </Card>

              {mode === 'camera' && (
                <>
                  {!armed ? (
                    <Button variant="secondary" onClick={() => setArmed(true)}>
                      Activer la caméra
                    </Button>
                  ) : (
                    <CameraStage
                      videoRef={session.videoRef}
                      landmarks={session.landmarks}
                      result={session.result}
                      status={session.engineStatus}
                      error={session.error}
                      onRetry={() => void startCamera()}
                      onUseManual={() => setMode('manual')}
                    />
                  )}
                </>
              )}

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
            </>
          )}
        </>
      )}
    </main>
  );
}
