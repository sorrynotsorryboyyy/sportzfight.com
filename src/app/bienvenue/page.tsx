'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/ui/Logo';
import { Select } from '@/components/ui/Select';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { Spinner } from '@/components/ui/Spinner';
import { apiPost } from '@/lib/firebase/api';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { isUsernameAvailable } from '@/lib/firebase/profile';
import { useAuth } from '@/lib/firebase/auth-context';
import { useRequireAuth } from '@/lib/firebase/useRequireAuth';
import {
  EXPERIENCES,
  GENDERS,
  GOALS,
  type AccountType,
  type Experience,
  type Gender,
  type Goal,
  type ProKind,
} from '@/lib/profile/onboarding';
import { USERNAME_MESSAGES, validateUsername } from '@/lib/utils/username';
import { cn } from '@/lib/utils/cn';

/**
 * The welcome screen, shown once.
 *
 * The profile already exists by the time anyone gets here — it is created
 * automatically at first sign-in with a username guessed from the Google
 * account. So this is not "creating an account", it is confirming a name and
 * optionally saying more.
 *
 * Everything past step 1 is skippable, and the buttons say so. Fields extracted
 * from someone who did not want to give them are worth less than no fields.
 */

type Step = 1 | 2 | 3;

function Progress({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={cn(
            'h-1 flex-1 rounded-full transition-colors',
            n <= step ? 'bg-volt-500' : 'bg-ink-800',
          )}
        />
      ))}
    </div>
  );
}

export default function Welcome() {
  const router = useRouter();
  const { loading: authLoading } = useRequireAuth();
  const { profile, needsOnboarding, user } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);

  // Step 1. `null` means "not edited yet", so the assigned username shows
  // through without an effect syncing two sources of truth.
  const [typed, setTyped] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const seq = useRef(0);

  // Step 2
  const [accountType, setAccountType] = useState<AccountType>('player');
  const [kind, setKind] = useState<ProKind>('gym');
  const [structure, setStructure] = useState('');
  const [proCity, setProCity] = useState('');
  const [discipline, setDiscipline] = useState('');

  // Step 3
  const [birthYear, setBirthYear] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [gender, setGender] = useState<Gender | undefined>();
  const [experience, setExperience] = useState<Experience | undefined>();
  const [goal, setGoal] = useState<Goal | undefined>();
  const [city, setCity] = useState('');

  // Already done: never show this screen twice. profile === null means still
  // loading, so it must not trigger the redirect.
  useEffect(() => {
    if (profile && !needsOnboarding) router.replace('/');
  }, [profile, needsOnboarding, router]);

  const name = typed ?? profile?.username ?? '';
  const problem = validateUsername(name);
  const changed = name !== profile?.username;

  // Same debounce and sequence guard as UsernameEditor: 350ms, and an
  // out-of-order response is discarded rather than overwriting a newer one.
  useEffect(() => {
    if (problem || !changed || !user) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const free = await isUsernameAvailable(name, user.uid);
      if (seq.current === mine) setTaken(!free);
    }, 350);
    return () => clearTimeout(t);
  }, [name, problem, changed, user]);

  if (!isFirebaseConfigured) return <SetupNotice />;
  if (authLoading || !profile) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <Spinner label="Préparation de ton compte…" />
      </main>
    );
  }

  const saveName = async () => {
    if (!changed) return true;
    const r = await apiPost<{ username: string }>('/api/username', {
      username: name,
    });
    if (!r.ok) {
      setTaken(r.error === 'taken');
      return false;
    }
    return true;
  };

  const finish = async (withDetails: boolean) => {
    setBusy(true);

    const payload: Record<string, unknown> = { accountType };
    if (accountType === 'pro') {
      payload.application = { kind, structure, city: proCity, discipline };
    }
    if (withDetails) {
      Object.assign(payload, {
        birthYear,
        heightCm,
        weightKg,
        gender,
        experience,
        goal,
        city,
      });
    }

    // Out-of-range values are dropped server-side rather than rejecting the
    // whole form, so a mistyped weight cannot cost someone their city.
    await apiPost('/api/onboarding', payload);
    setBusy(false);
    router.replace('/');
  };

  const nextFromName = async () => {
    setBusy(true);
    const ok = await saveName();
    setBusy(false);
    if (ok) setStep(2);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 p-5">
      <Logo className="text-xl" />
      <Progress step={step} />

      {step === 1 && (
        <>
          <div>
            <h1 className="text-3xl font-black uppercase leading-none tracking-tighter">
              Bienvenue
            </h1>
            <p className="mt-2 text-sm text-ink-400">
              Choisis le nom sous lequel tu apparaîtras au classement.
            </p>
          </div>

          <Card>
            <Input
              label="Ton pseudo"
              value={name}
              onChange={(e) => {
                setTyped(e.target.value);
                setTaken(false);
              }}
              maxLength={16}
              autoComplete="off"
              error={
                problem
                  ? USERNAME_MESSAGES[problem]
                  : taken
                    ? 'Ce pseudo est déjà pris.'
                    : null
              }
              hint="3 à 16 caractères, lettres et chiffres."
            />
          </Card>

          <Button
            loading={busy}
            disabled={!!problem || taken}
            onClick={nextFromName}
          >
            Continuer
          </Button>
        </>
      )}

      {step === 2 && (
        <>
          <div>
            <h1 className="text-3xl font-black uppercase leading-none tracking-tighter">
              Tu es…
            </h1>
            <p className="mt-2 text-sm text-ink-400">
              Coach ou salle de sport ? Tu peux rejoindre le programme
              partenaire.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['player', 'Un joueur', 'Je viens m’entraîner.'],
                ['pro', 'Un pro', 'Coach ou salle de sport.'],
              ] as const
            ).map(([id, title, sub]) => (
              <button
                key={id}
                type="button"
                aria-pressed={accountType === id}
                onClick={() => setAccountType(id)}
                className={cn(
                  'focus-ring panel-sheen rounded-2xl border p-4 text-left transition-colors',
                  accountType === id
                    ? 'border-volt-500 bg-volt-500/10'
                    : 'border-ink-700 hover:border-ink-600',
                )}
              >
                <p className="text-sm font-black uppercase tracking-tight text-ink-100">
                  {title}
                </p>
                <p className="mt-1 text-3xs leading-snug text-ink-400">{sub}</p>
              </button>
            ))}
          </div>

          {accountType === 'pro' && (
            <Card className="flex flex-col gap-3">
              <Select
                label="Type"
                options={[
                  { id: 'gym' as const, label: 'Salle de sport' },
                  { id: 'coach' as const, label: 'Coach' },
                ]}
                value={kind}
                onChange={(k) => setKind(k ?? 'gym')}
              />
              <Input
                label="Nom de la structure"
                value={structure}
                onChange={(e) => setStructure(e.target.value)}
                maxLength={80}
                placeholder="Salle FitPro"
              />
              <Input
                label="Ville"
                value={proCity}
                onChange={(e) => setProCity(e.target.value)}
                maxLength={60}
                placeholder="Lyon"
              />
              <Input
                label="Discipline"
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                maxLength={120}
                placeholder="Cross-training, remise en forme…"
                hint="Ta demande sera examinée avant validation."
              />
            </Card>
          )}

          <Button
            disabled={accountType === 'pro' && !structure.trim()}
            onClick={() => setStep(3)}
          >
            Continuer
          </Button>
        </>
      )}

      {step === 3 && (
        <>
          <div>
            <h1 className="text-3xl font-black uppercase leading-none tracking-tighter">
              Presque fini
            </h1>
            <p className="mt-2 text-sm text-ink-400">
              Tout est facultatif. Ces informations restent privées et serviront
              aux classements par catégorie.
            </p>
          </div>

          <Card className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <Input
                label="Naissance"
                type="number"
                inputMode="numeric"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                placeholder="1995"
              />
              <Input
                label="Taille"
                type="number"
                inputMode="numeric"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="180"
                hint="cm"
              />
              <Input
                label="Poids"
                type="number"
                inputMode="numeric"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="72"
                hint="kg"
              />
            </div>

            <Select label="Catégorie" options={GENDERS} value={gender} onChange={setGender} />
            <Select label="Niveau" options={EXPERIENCES} value={experience} onChange={setExperience} />
            <Select label="Objectif" options={GOALS} value={goal} onChange={setGoal} />

            <Input
              label="Ville"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={60}
              placeholder="Lyon"
            />
          </Card>

          <div className="flex flex-col gap-2">
            <Button loading={busy} onClick={() => finish(true)}>
              Terminer
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => finish(false)}>
              Passer cette étape
            </Button>
          </div>

          <p className="text-3xs leading-relaxed text-ink-600">
            Ces données ne sont jamais visibles par les autres joueurs ni par
            les partenaires. Tu peux les modifier ou les supprimer depuis ton
            compte.
          </p>
        </>
      )}
    </main>
  );
}
