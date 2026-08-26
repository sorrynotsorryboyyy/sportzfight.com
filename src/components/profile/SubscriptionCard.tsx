'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { openPortal } from '@/lib/firebase/billing';
import {
  activePlan,
  planLabel,
  type Subscription,
} from '@/lib/subscription';

/**
 * Subscription state and the way out of it.
 *
 * French law requires cancelling to be as easy as subscribing, so the portal
 * button sits right next to the plan — not buried in a settings page. Stripe's
 * hosted portal handles the cancellation, the card change and the invoices.
 */

function periodEnd(sub: Subscription): string | null {
  const end = sub.currentPeriodEnd;
  if (!end || typeof end !== 'object' || !('seconds' in end)) return null;
  return new Date(end.seconds * 1000).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function SubscriptionCard({
  subscription,
}: {
  subscription: Subscription | null | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const plan = activePlan(subscription);

  const manage = async () => {
    setBusy(true);
    const url = await openPortal();
    if (url) {
      window.location.href = url;
      return;
    }
    setBusy(false);
  };

  // No plan: a single quiet line, not a sales pitch on someone's own profile.
  if (!plan || !subscription) {
    return (
      <Card className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-ink-500">
            Abonnement
          </p>
          <p className="mt-1 text-sm text-ink-300">Compte gratuit</p>
        </div>
        <Link
          href="/boutique"
          className="shrink-0 text-sm font-semibold text-volt-500 hover:underline"
        >
          Voir les offres
        </Link>
      </Card>
    );
  }

  const until = periodEnd(subscription);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-ink-500">
            Abonnement
          </p>
          <p className="mt-1 text-lg font-black uppercase tracking-tight text-volt-500">
            {planLabel(plan)}
          </p>
        </div>

        {subscription.status === 'past_due' && (
          <span className="shrink-0 rounded-full bg-flare-500/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-flare-400">
            Paiement en attente
          </span>
        )}
      </div>

      {until && (
        <p className="mt-2 text-xs text-ink-400">
          {subscription.cancelAtPeriodEnd
            ? `Se termine le ${until}. Tes avantages restent actifs jusque-là.`
            : `Prochain renouvellement le ${until}.`}
        </p>
      )}

      {subscription.status === 'past_due' && (
        <p className="mt-1.5 text-xs text-flare-400">
          Le dernier paiement a échoué. Mets ta carte à jour pour ne pas perdre
          tes avantages.
        </p>
      )}

      <Button variant="secondary" size="md" className="mt-4" loading={busy} onClick={manage}>
        Gérer mon abonnement
      </Button>
      <p className="mt-2 text-center text-[0.65rem] text-ink-500">
        Résiliation, facture et moyen de paiement.
      </p>
    </Card>
  );
}
