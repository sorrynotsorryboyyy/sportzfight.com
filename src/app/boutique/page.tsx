'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { BottomNav } from '@/components/ui/BottomNav';
import { Footer } from '@/components/ui/Footer';
import { Tabs } from '@/components/ui/Tabs';
import { ProductCard } from '@/components/shop/ProductCard';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/firebase/auth-context';
import { startCheckout } from '@/lib/firebase/billing';
import { activePlan } from '@/lib/subscription';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import {
  categoryFrom,
  DEFAULT_CATEGORY,
  MAX_DISCOUNT_RATIO,
  productsFor,
  TABS,
  type Category,
  type Product,
} from '@/lib/shop/catalog';
import { cn } from '@/lib/utils/cn';

/**
 * Subscription showcase.
 *
 * Nothing is purchasable yet, and that is stated plainly: taking money needs a
 * server (a Stripe webhook writing the subscription status with rights the
 * client does not have), which is a batch of its own. Showing the plans now
 * gives the $SC balance a destination and lets the pricing be judged before it
 * is wired up.
 *
 * The line that must never move: nothing sold here touches scoring, XP or
 * matchmaking. Selling a competitive advantage would turn a public leaderboard
 * into pay-to-win and wreck the credibility of the ranking.
 *
 * Support does unlock extra exercises, which is a real functional limit rather
 * than a cosmetic one. That is a deliberate choice and it is stated plainly on
 * the page: the core — pushups and squats, the leaderboard, every battle — is
 * free, and an unlocked mode gives no edge in the modes everyone else plays.
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
      'Cadre d’avatar exclusif',
      'Statistiques détaillées de tes battles',
      'Historique complet (au lieu des 20 derniers)',
      'Badge Premium sur le classement',
    ],
  },
  {
    id: 'soutien',
    name: 'Soutien',
    price: '9,99 €',
    tagline: 'Tous les modes débloqués, et tu fais vivre le projet.',
    accent: 'gold',
    perks: [
      'Tous les modes débloqués dès leur sortie : abdos, burpees, tractions…',
      'Ton abonnement finance leur développement',
      'Tout ce que contient Premium',
      'Pseudo coloré et cadres animés',
      'Badge Soutien sur ton profil et au classement',
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
  const mine = current === plan.id;

  const subscribe = async () => {
    // Signing in first, so the checkout is opened for a verified account.
    if (!user) {
      router.push('/login?next=/boutique');
      return;
    }
    setBusy(true);
    const url = await startCheckout(plan.id);
    if (url) {
      window.location.href = url;
      return;
    }
    setBusy(false);
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
        <span className="absolute -top-2.5 left-5 rounded-full bg-volt-500 px-2.5 py-0.5 text-[0.6rem] font-black uppercase tracking-widest text-ink-950">
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
        <Button size="md" className="mt-6" loading={busy} onClick={subscribe}>
          S’abonner
        </Button>
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

/** The grid of physical goods, or an honest empty state. */
function ProductGrid({ products }: { products: readonly Product[] }) {
  if (products.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-sm text-ink-300">Aucun article pour le moment.</p>
        <p className="mt-1 text-xs text-ink-500">
          Les promotions apparaîtront ici dès qu’il y en aura.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

function Shop() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

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

  // The open tab lives in the URL, following the matchmaking convention: it
  // survives a reload, it is shareable, and the back button works. An unknown
  // value degrades to the default rather than erroring — a URL is user input.
  const active = categoryFrom(params.get('cat'));

  const select = (id: Category) => {
    // replace, not push: flipping through four tabs should not bury the page
    // the visitor arrived from under four history entries.
    router.replace(id === DEFAULT_CATEGORY ? '/boutique' : `/boutique?cat=${id}`, {
      scroll: false,
    });
  };

  return (
    <>
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 p-5 pb-32">
        <header className="flex items-center justify-between py-1">
          <Link href="/">
            <Logo className="text-xl" />
          </Link>
          {user && profile && (
            <span className="tnum rounded-full bg-gold/10 px-3 py-1 text-sm font-black text-gold">
              {profile.coins ?? 0} $SC
            </span>
          )}
        </header>

        <div>
          <h1 className="text-4xl font-black uppercase leading-none tracking-tighter">
            Boutique
          </h1>
          <p className="mt-2 text-sm text-ink-400">
            Les pompes et les squats sont gratuits, pour toujours. Le reste,
            c’est toi qui le rends possible.
          </p>
        </div>

        <Tabs
          items={TABS}
          active={active}
          onChange={select}
          label="Catégories de la boutique"
        />

        <Card className="border-cyan-glow/25 bg-cyan-glow/5">
          <p className="text-sm font-bold text-cyan-glow">
            {payments ? 'Bon à savoir' : 'Bientôt ouvert'}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-300">
            {payments
              ? 'Les abonnements sont mensuels, sans engagement, résiliables à tout moment depuis ton compte. Le merch et les objets ne sont pas encore expédiables.'
              : 'Rien n’est encore achetable — la boutique est là pour te donner un aperçu.'}{' '}
            Les modes au-delà des pompes et des squats sont encore en
            développement : le Soutien te les ouvrira le jour de leur sortie.
          </p>
        </Card>

        {active === 'abonnements' ? (
          <div className="flex flex-col gap-5">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                payments={payments}
                current={current}
              />
            ))}
          </div>
        ) : (
          <ProductGrid products={productsFor(active)} />
        )}

        <Card className="mt-1">
          <p className="text-xs leading-relaxed text-ink-500">
            Aucun avantage payant n’influence les scores, l’XP ou le
            classement : à exercice égal, un abonné et un joueur gratuit sont
            exactement à armes égales. Le Soutien débloque des modes
            supplémentaires, jamais un avantage dans un battle.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            Les $SC se gagnent en jouant et ne sont pas convertibles en argent.
            Ils ouvrent droit à une remise plafonnée à{' '}
            {Math.round(MAX_DISCOUNT_RATIO * 100)} % du prix d’un article.
          </p>
        </Card>
        <Footer className="mt-2" />
      </main>

      <BottomNav />
    </>
  );
}

/**
 * useSearchParams needs a Suspense boundary in the app router, so the page
 * itself is a thin shell around the real component.
 */
export default function ShopPage() {
  if (!isFirebaseConfigured) return <SetupNotice />;

  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center p-6">
          <span className="size-8 animate-spin rounded-full border-2 border-ink-700 border-t-volt-500" />
        </main>
      }
    >
      <Shop />
    </Suspense>
  );
}
