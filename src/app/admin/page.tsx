'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { Spinner } from '@/components/ui/Spinner';
import { CameraStage } from '@/components/camera/CameraStage';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { useRequireAdmin } from '@/lib/firebase/useRequireAdmin';
import { useExerciseSession } from '@/lib/exercise/runtime/useExerciseSession';
import { PUSHUP_CONFIG } from '@/lib/exercise/detectors/pushup';
import { FORM_MESSAGES } from '@/lib/exercise/types';
import { cn } from '@/lib/utils/cn';

/**
 * Detector tuning bench.
 *
 * This page is a LENS, NOT A LEVER. The route guard is a client-side redirect
 * and is bypassable, because without Cloud Functions `role` cannot reach
 * request.auth.token and no security rule can see it. So everything here is
 * either local to the browser or already permitted to any signed-in user:
 * live camera, live measurements, and threshold sliders that exist only in
 * this tab. There is deliberately no score editing, no winner override and no
 * deletion — those would be lies, since the rules would reject them anyway.
 */

/** The thresholds worth tuning against a real camera. */
const TUNABLES = [
  { key: 'MAX_INCLINATION', label: 'Inclinaison max du corps', min: 20, max: 90, step: 1, unit: '°',
    help: 'Au-delà, la position n’est pas considérée comme une planche. Mesurée dans l’image, pas dans le monde réel.' },
  { key: 'UP_ENTER', label: 'Angle coude — position haute', min: 130, max: 180, step: 1, unit: '°',
    help: 'Bras tendus au-dessus de cette valeur.' },
  { key: 'DOWN_ENTER', label: 'Angle coude — position basse', min: 60, max: 130, step: 1, unit: '°',
    help: 'Profondeur exigée pour valider la descente.' },
  { key: 'MIN_ROM_DEG', label: 'Amplitude minimale', min: 20, max: 100, step: 1, unit: '°',
    help: 'Écart min entre le haut et le bas d’une répétition.' },
  { key: 'MAX_TORSO_DEVIATION', label: 'Écart de bassin toléré', min: 0.02, max: 0.3, step: 0.01, unit: '',
    help: 'Fraction de la longueur du corps. Au-delà : dos creusé ou bassin trop haut.' },
  { key: 'MIN_VISIBILITY', label: 'Visibilité min par point', min: 0.1, max: 0.95, step: 0.05, unit: '',
    help: 'En dessous, le point est considéré comme deviné.' },
  { key: 'MIN_REP_MS', label: 'Durée min d’une répétition', min: 200, max: 2000, step: 50, unit: 'ms',
    help: 'Plus rapide que ça n’est pas une vraie pompe.' },
] as const;

type TunableKey = (typeof TUNABLES)[number]['key'];
type Overrides = Partial<Record<TunableKey, number>>;

function Metric({
  label,
  value,
  unit = '',
  ok,
  hint,
}: {
  label: string;
  value: number | undefined;
  unit?: string;
  ok?: boolean;
  hint?: string;
}) {
  const shown =
    value === undefined || !Number.isFinite(value)
      ? '—'
      : Math.abs(value) < 1
        ? value.toFixed(3)
        : value.toFixed(1);

  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-800 py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-ink-300">{label}</p>
        {hint && <p className="text-3xs text-ink-600">{hint}</p>}
      </div>
      <span
        className={cn(
          'tnum shrink-0 text-lg font-black',
          ok === undefined ? 'text-ink-100' : ok ? 'text-volt-500' : 'text-gold',
        )}
      >
        {shown}
        <span className="ml-0.5 text-xs font-normal text-ink-500">{unit}</span>
      </span>
    </div>
  );
}

export default function AdminPage() {
  const { user, isAdmin, loading, denied } = useRequireAdmin();
  const [overrides, setOverrides] = useState<Overrides>({});

  // Sliders mutate the shared config object directly. That is acceptable
  // precisely because this page is a scratchpad: the change lives in this tab
  // only, and the panel prints a block to paste into the source.
  const applied = useMemo(() => ({ ...PUSHUP_CONFIG, ...overrides }), [overrides]);

  useEffect(() => {
    const cfg = PUSHUP_CONFIG as unknown as Record<string, number>;
    for (const [k, v] of Object.entries(overrides)) cfg[k] = v;
  }, [overrides]);

  const noopWrite = useCallback(async () => {}, []);

  const session = useExerciseSession({
    exerciseId: 'pushups',
    mode: 'camera',
    slot: null, // never writes to Firestore
    active: false,
    write: noopWrite,
  });

  const { start, stop } = session;
  useEffect(() => {
    if (!isAdmin) return;
    void start();
    return () => stop();
  }, [isAdmin, start, stop]);

  if (!isFirebaseConfigured) return <SetupNotice />;

  // Say WHY, and for which account. A silent redirect here is indistinguishable
  // from a broken page, and the account signed in is very often not the one the
  // role was set on.
  if (denied) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
        <Logo className="text-2xl" />
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter">
            Accès réservé
          </h1>
          <p className="mt-3 text-ink-300">
            Ce compte n’a pas le rôle admin.
          </p>
        </div>

        <Card className="text-sm">
          <p className="text-ink-400">Connecté en tant que</p>
          <p className="mt-1 font-semibold text-ink-100">
            {user?.email ?? user?.uid}
          </p>
          <p className="mt-4 text-ink-400">Pour activer l’accès :</p>
          <ol className="mt-2 space-y-1.5 text-ink-300">
            <li>
              1. Console Firestore →{' '}
              <code className="rounded bg-ink-800 px-1 text-volt-400">users</code>{' '}
              →{' '}
              <code className="break-all rounded bg-ink-800 px-1 text-volt-400">
                {user?.uid}
              </code>
            </li>
            <li>
              2. Champ{' '}
              <code className="rounded bg-ink-800 px-1 text-volt-400">role</code>{' '}
              (string) ={' '}
              <code className="rounded bg-ink-800 px-1 text-volt-400">admin</code>{' '}
              — sans espace ni retour à la ligne
            </li>
            <li>3. La page se débloque sans rechargement</li>
          </ol>
        </Card>

        <Link href="/">
          <Button variant="ghost">Retour à l’accueil</Button>
        </Link>
      </main>
    );
  }

  if (loading || !isAdmin) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <Spinner label="Vérification…" />
      </main>
    );
  }

  const d = session.result?.debug;
  const posture = session.result?.postureIssues ?? [];

  const configBlock = Object.entries(overrides)
    .map(([k, v]) => `  ${k}: ${v},`)
    .join('\n');

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 p-5">
      <header className="flex items-center justify-between">
        <Link href="/">
          <Logo className="text-xl" />
        </Link>
        <span className="rounded-full bg-cyan-glow/15 px-2.5 py-1 text-3xs font-bold uppercase tracking-widest text-cyan-glow">
          Admin · banc de test
        </span>
      </header>

      <p className="text-sm leading-relaxed text-ink-400">
        Fais des pompes devant la caméra et regarde ce que le détecteur mesure
        réellement. Les curseurs ne modifient que cet onglet — copie le bloc en
        bas dans{' '}
        <code className="rounded bg-ink-800 px-1 text-volt-400">
          detectors/pushup.ts
        </code>{' '}
        pour rendre un réglage permanent.
      </p>

      <div className="overflow-hidden rounded-2xl">
        <CameraStage
          videoRef={session.videoRef}
          landmarks={session.landmarks}
          result={session.result}
          status={session.engineStatus}
          error={session.error}
          onRetry={() => void start()}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-400">
            Mesures en direct
          </h2>
          <Metric
            label="Répétitions comptées"
            value={session.count}
            ok={undefined}
          />
          <Metric label="Phase" value={undefined} hint={session.result?.phase ?? 'idle'} />
          <Metric
            label="Angle du coude"
            value={d?.elbowAngle}
            unit="°"
            hint={`haut ≥ ${applied.UP_ENTER} · bas ≤ ${applied.DOWN_ENTER}`}
          />
          <Metric
            label="Inclinaison du corps"
            value={d?.inclination}
            unit="°"
            ok={d ? d.inclination <= applied.MAX_INCLINATION : undefined}
            hint={`doit rester ≤ ${applied.MAX_INCLINATION}° — la cause du faux orange`}
          />
          <Metric
            label="Écart du bassin"
            value={d?.hipDeviation}
            ok={
              d && Number.isFinite(d.hipDeviation)
                ? Math.abs(d.hipDeviation) <= applied.MAX_TORSO_DEVIATION
                : undefined
            }
            hint={`|écart| ≤ ${applied.MAX_TORSO_DEVIATION} · vide si chevilles hors champ`}
          />
          <Metric
            label="Visibilité moyenne"
            value={d?.meanVisibility}
            ok={d ? d.meanVisibility >= applied.MIN_MEAN_VISIBILITY : undefined}
            hint={`≥ ${applied.MIN_MEAN_VISIBILITY}`}
          />
          <Metric
            label="Amplitude en cours"
            value={d?.rangeOfMotion}
            unit="°"
            ok={d ? d.rangeOfMotion >= applied.MIN_ROM_DEG : undefined}
            hint={`≥ ${applied.MIN_ROM_DEG}° pour valider`}
          />

          <div className="mt-3 rounded-xl bg-ink-850 p-3">
            <p className="text-3xs font-bold uppercase tracking-widest text-ink-500">
              Posture
            </p>
            <p
              className={cn(
                'mt-1 text-sm font-semibold',
                posture.length ? 'text-gold' : 'text-volt-500',
              )}
            >
              {posture.length ? FORM_MESSAGES[posture[0]] : 'Position valide ✓'}
            </p>
          </div>

          <Button
            variant="secondary"
            size="md"
            className="mt-3"
            onClick={() => session.adjust(-session.count)}
          >
            Remettre le compteur à zéro
          </Button>
        </Card>

        <Card>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-400">
            Seuils
          </h2>
          <div className="flex flex-col gap-4">
            {TUNABLES.map((t) => {
              const value =
                overrides[t.key] ??
                (PUSHUP_CONFIG as unknown as Record<string, number>)[t.key];
              return (
                <label key={t.key} className="block">
                  <span className="flex items-baseline justify-between">
                    <span className="text-sm text-ink-200">{t.label}</span>
                    <span className="tnum text-sm font-bold text-volt-400">
                      {value}
                      {t.unit}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={t.min}
                    max={t.max}
                    step={t.step}
                    value={value}
                    onChange={(e) =>
                      setOverrides((o) => ({
                        ...o,
                        [t.key]: Number(e.target.value),
                      }))
                    }
                    className="mt-1.5 w-full accent-volt-500"
                  />
                  <span className="text-3xs leading-tight text-ink-600">
                    {t.help}
                  </span>
                </label>
              );
            })}
          </div>

          {configBlock && (
            <div className="mt-4">
              <p className="mb-1.5 text-3xs font-bold uppercase tracking-widest text-ink-500">
                À coller dans PUSHUP_CONFIG
              </p>
              <pre className="overflow-x-auto rounded-xl bg-ink-950 p-3 text-xs text-volt-400">
                {configBlock}
              </pre>
              <Button
                variant="ghost"
                size="md"
                className="mt-2"
                onClick={() => setOverrides({})}
              >
                Réinitialiser
              </Button>
            </div>
          )}
        </Card>
      </div>

      <p className="pb-4 text-center text-xs leading-relaxed text-ink-600">
        Cette page ne peut rien faire qu’un utilisateur connecté ne puisse déjà
        faire : les règles Firestore ignorent le rôle admin. Pas de modification
        de score, pas de suppression.
      </p>
    </main>
  );
}
