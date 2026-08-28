'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pill } from '@/components/ui/Pill';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { euros } from '@/components/ui/Table';
import { DetectorBench } from '@/components/admin/DetectorBench';
import { PartnersPanel } from '@/components/admin/PartnersPanel';
import { PayoutsPanel } from '@/components/admin/PayoutsPanel';
import { OffersPanel } from '@/components/admin/OffersPanel';
import { ApplicationsPanel } from '@/components/admin/ApplicationsPanel';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { useRequireAdmin } from '@/lib/firebase/useRequireAdmin';
import { apiGet } from '@/lib/firebase/api';

/**
 * The admin dashboard.
 *
 * Everything here that reads real data goes through /api/admin/*, which checks
 * the role SERVER-SIDE with requireAdmin(). The client-side gate below only
 * decides what to render; it is not the boundary.
 */

type TabId =
  | 'apercu'
  | 'partenaires'
  | 'versements'
  | 'offres'
  | 'candidatures'
  | 'detecteur';

const TABS = [
  { id: 'apercu' as const, label: 'Aperçu' },
  { id: 'partenaires' as const, label: 'Partenaires' },
  { id: 'versements' as const, label: 'Versements' },
  { id: 'offres' as const, label: 'Offres' },
  { id: 'candidatures' as const, label: 'Candidatures' },
  { id: 'detecteur' as const, label: 'Détecteur' },
];

interface Stats {
  players: number;
  battles: number;
  battlesFinished: number;
  partners: number;
  customers: number;
  revenueCents: number;
  monthRevenueCents: number;
  commissionOwedCents: number;
  commissionPaidCents: number;
}

function Metric({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: 'volt' | 'gold' | 'cyan';
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
          (tone === 'volt'
            ? 'text-volt-500'
            : tone === 'gold'
              ? 'text-gold'
              : tone === 'cyan'
                ? 'text-cyan-glow'
                : 'text-ink-100')
        }
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-3xs text-ink-600">{hint}</p>}
    </Card>
  );
}

function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void apiGet<Stats>('/api/admin/stats').then((r) => {
      if (r.ok && r.data) setStats(r.data);
      else setError(r.error ?? 'failed');
    });
  }, []);

  useEffect(load, [load]);

  // Not configured is NOT a refusal. Saying "accès refusé" here sent the
  // operator hunting for a role that was perfectly correct.
  if (error === 'admin_unconfigured') {
    return (
      <Card className="border-cyan-glow/25 bg-cyan-glow/5">
        <p className="text-sm font-bold text-cyan-glow">
          Le serveur n’est pas configuré
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
          Ton rôle admin est bon — il n’a simplement pas pu être vérifié. Les
          routes <code>/api/admin</code> ont besoin du SDK Admin Firebase, donc
          de la variable d’environnement{' '}
          <code>FIREBASE_SERVICE_ACCOUNT</code>, qui est absente.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-400">
          Console Firebase → Paramètres du projet → Comptes de service →
          Générer une clé privée. Colle le JSON entier sur une seule ligne dans{' '}
          <code>.env.local</code> (et dans Vercel pour la production), puis
          redémarre le serveur.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-500">
          L’onglet Détecteur fonctionne sans cette configuration.
        </p>
      </Card>
    );
  }

  if (error === 'forbidden') {
    return (
      <Card className="border-flare-500/30 bg-flare-500/5">
        <p className="text-sm font-bold text-flare-400">Accès refusé côté serveur</p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
          Le rôle admin n’est pas reconnu par l’API. Vérifie que le champ{' '}
          <code>role</code> de ton document utilisateur vaut exactement{' '}
          <code>admin</code>.
        </p>
      </Card>
    );
  }

  if (error === 'unauthenticated') {
    return (
      <Card className="border-flare-500/30 bg-flare-500/5">
        <p className="text-sm text-flare-400">
          Session expirée. Recharge la page pour te reconnecter.
        </p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-flare-500/30 bg-flare-500/5">
        <p className="text-sm text-flare-400">
          Les statistiques n’ont pas pu être chargées.
        </p>
      </Card>
    );
  }

  if (!stats) return <Spinner label="Chargement des statistiques…" />;

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="mb-2 text-3xs font-bold uppercase tracking-widest text-ink-400">
          Activité
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Joueurs" value={String(stats.players)} />
          <Metric
            label="Battles"
            value={String(stats.battles)}
            hint={`${stats.battlesFinished} terminés`}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-3xs font-bold uppercase tracking-widest text-ink-400">
          Revenus
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Metric
            label="Ce mois-ci"
            value={euros(stats.monthRevenueCents)}
            tone="volt"
          />
          <Metric label="Total encaissé" value={euros(stats.revenueCents)} />
          <Metric
            label="Clients payants"
            value={String(stats.customers)}
            hint="comptes ayant réglé au moins une facture"
          />
          <Metric label="Partenaires" value={String(stats.partners)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-3xs font-bold uppercase tracking-widest text-ink-400">
          Commissions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Metric
            label="À verser"
            value={euros(stats.commissionOwedCents)}
            tone="gold"
            hint="cumul non encore payé"
          />
          <Metric label="Déjà versé" value={euros(stats.commissionPaidCents)} />
        </div>
      </section>

      {stats.revenueCents === 0 && (
        <Card className="border-cyan-glow/25 bg-cyan-glow/5">
          <p className="text-xs leading-relaxed text-ink-300">
            Aucun paiement enregistré pour l’instant. Le registre se remplit à
            la première facture réglée : Stripe envoie{' '}
            <code>invoice.paid</code> et le webhook fige le montant et la
            commission.
          </p>
        </Card>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { user, isAdmin, loading, denied } = useRequireAdmin();
  const [tab, setTab] = useState<TabId>('apercu');

  if (!isFirebaseConfigured) return <SetupNotice />;

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <Spinner label="Vérification du compte…" />
      </main>
    );
  }

  if (denied) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
        <PageHeader />
        <Card className="border-flare-500/30 bg-flare-500/5">
          <p className="text-sm font-bold text-flare-400">Accès réservé</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
            Le compte <strong>{user?.email}</strong> n’a pas le rôle admin.
            Ajoute <code>role: &quot;admin&quot;</code> sur son document dans la
            console Firebase.
          </p>
        </Card>
      </main>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 p-5 pb-16">
      <PageHeader
        action={
          <Pill tone="cyan" size="md">
            Admin
          </Pill>
        }
      />

      <h1 className="text-3xl font-black uppercase leading-none tracking-tighter">
        Tableau de bord
      </h1>

      <Tabs
        items={TABS}
        active={tab}
        onChange={setTab}
        label="Sections du tableau de bord"
      />

      {tab === 'apercu' && <Overview />}
      {tab === 'partenaires' && <PartnersPanel />}
      {tab === 'versements' && <PayoutsPanel />}
      {tab === 'offres' && <OffersPanel />}
      {tab === 'candidatures' && <ApplicationsPanel />}
      {tab === 'detecteur' && <DetectorBench />}
    </main>
  );
}
