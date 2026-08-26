'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pill } from '@/components/ui/Pill';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { BottomNav } from '@/components/ui/BottomNav';
import { Footer } from '@/components/ui/Footer';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/firebase/auth-context';
import { startCheckout } from '@/lib/firebase/billing';
import { activePlan } from '@/lib/subscription';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { MAX_DISCOUNT_RATIO } from '@/lib/shop/catalog';
import { cn } from '@/lib/utils/cn';

/**
 * The shop: two subscriptions, nothing else.
 *
 * It used to carry four tabs and nine physical products behind "Bientôt"
 * buttons. None of it could ship — there is no stock, no supplier and no
 * shipping — so a visitor met a catalogue where nothing was buyable. The
 * catalogue survives in lib/shop/catalog.ts for the day that changes; what is
 * on screen is what can actually be sold.
 *
 * The line that must never move: nothing sold here touches scoring, XP or
 * matchmaking. Selling a competitive advantage would turn a public leaderboard
 * into pay-to-win and wreck the credibility of the ranking.
 *
 * Every perk listed is cosmetic or convenience, and every one is implemented —
 * checked by tests/perks.test.ts. The page previously advertised unlocked
 * exercise modes, an avatar frame, detailed stats and a coloured name while
 * only two of nine bullets existed. Selling that is a misrepresentation, so the
 * list now describes exactly what ships.
 */

interface Plan {
  id: string;
  name: string;
  price: string;
  tagline: string;
  perks: string[];
  accent: 'volt' | 'gold';
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'premium',
    name: 'Premium',
    price: '5,99 €',
    tagline: 'Pour ceux qui s’entraînent régulièrement.',
    accent: 'volt',
    highlight: true,
    perks: [
      'Cadre d’avatar au classement et sur ton profil',
      'Statistiques détaillées : moyenne, série, bonus',
      'Historique complet (au lieu des 20 derniers)',
      'Badge Premium sur le classement',
    ],
  },
  {
    id: 'soutien',
    name: 'Soutien',
    price: '9,99 €',
    tagline: 'Tu fais vivre le projet, et ça se voit.',
    accent: 'gold',
    perks: [
      'Tout ce que contient Premium',
      'Pseudo et cadre dorés au classement',
      'Badge Soutien sur ton profil et au classement',
      'Tu finances le développement des prochains modes',
    ],
  },
];

function Check({ accent }: { accent: 'volt' | 'gold' }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        'mt-0.5 size-4 shrink-0',
        accent === 'volt' ? 'text-volt-500' : 'text-gold',
      )}
      aria-hidden
    >
      <path d="m4 10.5 4 4 8-9" />
    </svg>
  );
}

function PlanCard({
  plan,
  payments,
  current,
}: {
  plan: Plan;
  /** Whether the server is configured to take a payment at all. */
  payments: boolean;
  /** The plan this account already has, if any. */
  current: string | null;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mine = current === plan.id;

  const subscribe = async () => {
    // Signing in first, so the checkout is opened for a verified account.
    if (!user) {
      router.push('/login?next=/boutique');
      return;
    }
    setBusy(true);
    setFailed(false);
    const url = await startCheckout(plan.id);
    if (url) {
      window.location.href = url;
      return;
    }
    // Previously this just stopped spinning and said nothing, on a payment
    // button — the user could not tell a failure from a slow network.
    setBusy(false);
    setFailed(true);
  };

  return (
    <Card
      className={cn(
        'relative flex flex-col',
        mine
          ? 'border-volt-500'
          : plan.highlight
            ? 'border-volt-500/50'
            : 'border-ink-800',
      )}
    >
      {plan.highlight && (
        <span className="absolute -top-2.5 left-5 rounded-full bg-volt-500 px-2.5 py-0.5 text-3xs font-black uppercase tracking-widest text-ink-950">
          Le plus populaire
        </span>
      )}

      <h2
        className={cn(
          'text-xl font-black uppercase tracking-tight',
          plan.accent === 'volt' ? 'text-volt-500' : 'text-gold',
        )}
      >
        {plan.name}
      </h2>

      <p className="mt-1 text-sm text-ink-400">{plan.tagline}</p>

      <p className="mt-4 flex items-baseline gap-1">
        <span className="tnum text-4xl font-black leading-none text-ink-100">
          {plan.price}
        </span>
        <span className="text-sm text-ink-500">/ mois</span>
      </p>

      <ul className="mt-5 flex flex-1 flex-col gap-2.5">
        {plan.perks.map((perk) => (
          <li key={perk} className="flex gap-2.5 text-sm leading-snug text-ink-300">
            <Check accent={plan.accent} />
            <span>{perk}</span>
          </li>
        ))}
      </ul>

      {mine ? (
        <p className="mt-6 grid h-12 w-full place-items-center rounded-xl border border-volt-500/40 bg-volt-500/10 text-sm font-bold uppercase tracking-widest text-volt-500">
          Ton abonnement
        </p>
      ) : payments ? (
        <>
          <Button size="md" className="mt-6" loading={busy} onClick={subscribe}>
            S’abonner
          </Button>
          {failed && (
            <p role="alert" className="mt-2 text-center text-2xs text-flare-400">
              Le paiement n’a pas pu démarrer. Réessaie dans un instant.
            </p>
          )}
        </>
      ) : (
        // Worded so nobody can mistake this for a completed purchase.
        <button
          type="button"
          disabled
          className="mt-6 h-12 w-full cursor-not-allowed rounded-xl border border-ink-700 bg-ink-850 text-sm font-bold uppercase tracking-widest text-ink-500"
        >
          Bientôt disponible
        </button>
      )}
    </Card>
  );
}

function Shop() {
  const { user, profile } = useAuth();

  // Whether a payment can be taken depends on server-side secrets, so only the
  // server can answer. Until it does, the cards stay in their "Bientôt" state —
  // the honest default if the request never lands.
  const [payments, setPayments] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetch('/api/config')
      .then((r) => r.json())
      .then((d: { payments?: boolean }) => {
        if (alive) setPayments(Boolean(d.payments));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const current = activePlan(profile?.subscription);

  return (
    <>
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 p-5 pb-32">
        <PageHeader
          action={
            user && profile ? (
              <Pill tone="gold" size="md" className="tnum">
                {profile.coins ?? 0} $SC
              </Pill>
            ) : undefined
          }
        />

        <div>
          <h1 className="text-4xl font-black uppercase leading-none tracking-tighter">
            Boutique
          </h1>
          <p className="mt-2 text-sm text-ink-400">
            Les pompes et les squats sont gratuits, pour toujours. Le reste,
            c’est toi qui le rends possible.
          </p>
        </div>

        <div className="stagger flex flex-col gap-5">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              payments={payments}
              current={current}
            />
          ))}
        </div>

        <Card className="mt-1">
          <p className="text-xs leading-relaxed text-ink-500">
            Aucun avantage payant n’influence les scores, l’XP ou le
            classement : à exercice égal, un abonné et un joueur gratuit sont
            exactement à armes égales.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            Les $SC se gagnent en jouant et ne sont pas convertibles en argent.
            Ils ouvriront droit à une remise plafonnée à{' '}
            {Math.round(MAX_DISCOUNT_RATIO * 100)} % sur le merch, à venir.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            Abonnements mensuels, sans engagement, résiliables à tout moment
            depuis ton compte.
          </p>
        </Card>
        <Footer className="mt-2" />
      </main>

      <BottomNav />
    </>
  );
}

export default function ShopPage() {
  if (!isFirebaseConfigured) return <SetupNotice />;
  return <Shop />;
}
