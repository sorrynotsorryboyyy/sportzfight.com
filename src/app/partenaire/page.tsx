'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Footer } from '@/components/ui/Footer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pill } from '@/components/ui/Pill';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { Spinner } from '@/components/ui/Spinner';
import { euros } from '@/components/ui/Table';
import { apiGet } from '@/lib/firebase/api';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { useRequireAuth } from '@/lib/firebase/useRequireAuth';
import { bpsToPercent } from '@/lib/partners/commission';
import { SITE_URL } from '@/lib/site';
import type { PartnerStats } from '@/lib/partners/types';

/**
 * A partner's own dashboard.
 *
 * Aggregates only — counts and amounts, never a username or an email. Naming
 * the people who signed up would disclose their identity and paid status to a
 * third party, which needs their consent and is not necessary here.
 *
 * It exists because a partner with no visibility forgets the code within a
 * fortnight. Seeing the number move is the whole incentive.
 */

function Figure({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: 'volt' | 'gold';
  hint?: string;
}) {
  return (
    <Card padding="md" radius="md">
      <p className="text-3xs font-bold uppercase tracking-widest text-ink-500">
        {label}
      </p>
      <p
        className={
          'tnum mt-1 text-2xl font-black leading-none ' +
          (tone === 'volt' ? 'text-volt-500' : tone === 'gold' ? 'text-gold' : 'text-ink-100')
        }
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-3xs text-ink-600">{hint}</p>}
    </Card>
  );
}

export default function PartnerPage() {
  const { loading: authLoading } = useRequireAuth();
  const [stats, setStats] = useState<PartnerStats | null | 'none'>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    void apiGet<{ partner: PartnerStats | null }>('/api/partner/stats').then((r) => {
      if (!r.ok || !r.data) return setStats('none');
      setStats(r.data.partner ?? 'none');
    });
  }, []);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  if (!isFirebaseConfigured) return <SetupNotice />;

  if (authLoading || stats === null) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <Spinner label="Chargement…" />
      </main>
    );
  }

  // Not a partner: explain rather than 404, and point at the programme.
  if (stats === 'none') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 p-5">
        <PageHeader />
        <Card>
          <p className="text-sm font-semibold text-ink-200">
            Ce compte n’est pas partenaire
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
            Le programme est réservé aux salles et aux coachs, ajoutés à la
            main. Si tu veux en faire partie, la page ci-dessous explique
            comment.
          </p>
          <Link href="/partenaires" className="mt-4 block">
            <Button size="md">Découvrir le programme</Button>
          </Link>
        </Card>
        <Footer className="mt-auto" />
      </main>
    );
  }

  const link = `${SITE_URL}/p/${stats.code}`;
  const payable = stats.pendingCents >= stats.payoutMinimumCents;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context; the link is on screen anyway.
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 p-5 pb-16">
      <PageHeader action={<Pill tone="gold" size="md">Partenaire</Pill>} />

      <div>
        <h1 className="text-3xl font-black uppercase leading-none tracking-tighter">
          {stats.name}
        </h1>
        <p className="mt-2 text-sm text-ink-400">
          {bpsToPercent(stats.rateFirstBps)} % le premier mois, puis{' '}
          {bpsToPercent(stats.rateRecurringBps)} % à chaque renouvellement.
        </p>
      </div>

      <Card>
        <p className="text-3xs font-bold uppercase tracking-widest text-ink-500">
          Ton lien de parrainage
        </p>
        <p className="mt-1.5 break-all font-mono text-sm text-volt-500">{link}</p>
        <Button variant="secondary" size="md" className="mt-3" onClick={copy}>
          {copied ? 'Lien copié' : 'Copier le lien'}
        </Button>
        <p className="mt-2 text-3xs leading-relaxed text-ink-600">
          Toute personne qui s’inscrit via ce lien t’est rattachée pendant
          90 jours, même si elle s’abonne plus tard.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Figure label="Inscrits" value={String(stats.referrals)} />
        <Figure
          label="Abonnés"
          value={String(stats.subscribers)}
          hint="ont réglé au moins une facture"
        />
        <Figure label="Ce mois-ci" value={euros(stats.monthCents)} tone="volt" />
        <Figure
          label="À recevoir"
          value={euros(stats.pendingCents)}
          tone="gold"
          hint={
            payable
              ? 'versement au prochain paiement'
              : `versé à partir de ${euros(stats.payoutMinimumCents)}`
          }
        />
      </div>

      {stats.paidCents > 0 && (
        <Card padding="md" radius="md">
          <p className="text-xs text-ink-400">
            Déjà reçu :{' '}
            <span className="tnum font-bold text-ink-200">
              {euros(stats.paidCents)}
            </span>
          </p>
        </Card>
      )}

      {!stats.active && (
        <Card className="border-flare-500/30 bg-flare-500/5">
          <p className="text-xs text-flare-400">
            Ton code est désactivé : les nouvelles inscriptions ne sont plus
            comptabilisées. Contacte-nous si c’est une erreur.
          </p>
        </Card>
      )}

      <Card>
        <p className="text-3xs leading-relaxed text-ink-500">
          Les chiffres sont agrégés : nous ne te communiquons jamais l’identité
          des personnes inscrites avec ton code. Les commissions sont versées
          par virement, sur facture de ta part.
        </p>
      </Card>

      <Footer className="mt-auto" />
    </main>
  );
}
