'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Pill } from '@/components/ui/Pill';
import { Spinner } from '@/components/ui/Spinner';
import { Table, euros, type Column } from '@/components/ui/Table';
import { apiGet, apiPatch, apiPost } from '@/lib/firebase/api';
import { bpsToPercent, normaliseCode } from '@/lib/partners/commission';
import {
  PAYOUT_MINIMUM_CENTS,
  RATE_FIRST_BPS,
  RATE_RECURRING_BPS,
} from '@/lib/partners/types';
import { SITE_URL } from '@/lib/site';

/**
 * Create partners, watch what they earn, record payouts.
 *
 * There is no self-signup on purpose: a hand-curated list is the cheapest
 * control there is over money going out.
 */

interface Row {
  id: string;
  code: string;
  name: string;
  kind: 'gym' | 'coach';
  city: string | null;
  active: boolean;
  rateFirstBps: number;
  rateRecurringBps: number;
  referrals: number;
  invoices: number;
  owedCents: number;
  paidCents: number;
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [kind, setKind] = useState<'gym' | 'coach'>('gym');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await apiPost<{ id: string }>('/api/admin/partners', {
      name,
      code,
      city,
      kind,
    });
    setBusy(false);

    if (r.ok) {
      setName('');
      setCode('');
      setCity('');
      setOpen(false);
      onCreated();
      return;
    }
    setError(
      r.error === 'code_taken'
        ? 'Ce code est déjà pris.'
        : r.error === 'bad_code'
          ? 'Code trop court (3 caractères minimum).'
          : 'La création a échoué.',
    );
  };

  if (!open) {
    return (
      <Button size="md" onClick={() => setOpen(true)}>
        Ajouter un partenaire
      </Button>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-3xs font-bold uppercase tracking-widest text-ink-500">
        Nouveau partenaire
      </p>

      <Input
        label="Nom"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Salle FitPro"
      />
      <Input
        label="Code"
        value={code}
        // Normalised as it is typed, so what you see is what gets stored.
        onChange={(e) => setCode(normaliseCode(e.target.value))}
        placeholder="FITPRO"
        hint="Imprimé sur les affiches — il ne pourra plus être modifié."
      />
      <Input
        label="Ville"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder="Lyon"
      />

      <div>
        <p className="text-3xs font-bold uppercase tracking-widest text-ink-500">
          Type
        </p>
        <div className="mt-1 flex gap-2">
          {(['gym', 'coach'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={
                'focus-ring flex-1 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ' +
                (kind === k
                  ? 'border-volt-500 bg-volt-500/10 text-volt-500'
                  : 'border-ink-700 text-ink-400 hover:text-ink-200')
              }
            >
              {k === 'gym' ? 'Salle' : 'Coach'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-2xs text-flare-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button size="md" loading={busy} onClick={submit}>
          Créer
        </Button>
        <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </Card>
  );
}

export function PartnersPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrated, setMigrated] = useState<string | null>(null);

  const load = useCallback(() => {
    void apiGet<{ partners: Row[] }>('/api/admin/partners').then((r) => {
      // Without the Admin SDK an empty table would read as "no partners yet",
      // which is a different and much more misleading statement.
      setUnconfigured(r.error === 'admin_unconfigured');
      setRows(r.ok && r.data ? r.data.partners : []);
    });
  }, []);

  useEffect(load, [load]);

  const pay = async (id: string) => {
    // Goes through the statement route, which stamps the ledger AND writes the
    // statement in one commit. A payment with no statement is exactly the hole
    // the Versements tab exists to close, so this button must not be a second,
    // silent way to make one. No period is sent: the route defaults to last
    // month, the same default the tab shows.
    setBusyId(id);
    await apiPost('/api/admin/payouts', { partnerId: id });
    setBusyId(null);
    load();
  };

  /**
   * Partners still on the previous default rate.
   *
   * The rate lives on each partner document, so raising the constant leaves
   * everyone already created untouched: /partenaires would advertise a rate no
   * live partner is actually on. This surfaces that instead of letting a
   * partner discover it on their own dashboard.
   */
  const stale = (rows ?? []).filter(
    (r) =>
      r.rateFirstBps !== RATE_FIRST_BPS || r.rateRecurringBps !== RATE_RECURRING_BPS,
  );

  const migrateRates = async () => {
    setMigrating(true);
    setMigrated(null);
    const r = await apiPost<{ moved: number; negotiated: string[] }>(
      '/api/admin/partners/rates',
      {},
    );
    setMigrating(false);
    if (r.ok && r.data) {
      const { moved, negotiated } = r.data;
      setMigrated(
        negotiated.length > 0
          ? `${moved} partenaire(s) passé(s) à ${bpsToPercent(RATE_RECURRING_BPS)} %. ` +
              `Taux négocié laissé tel quel : ${negotiated.join(', ')}.`
          : `${moved} partenaire(s) passé(s) à ${bpsToPercent(RATE_RECURRING_BPS)} %.`,
      );
    } else {
      setMigrated('La migration a échoué. Réessaie.');
    }
    load();
  };

  const toggle = async (row: Row) => {
    setBusyId(row.id);
    await apiPatch('/api/admin/partners', { id: row.id, active: !row.active });
    setBusyId(null);
    load();
  };

  const copyLink = async (code: string) => {
    try {
      await navigator.clipboard.writeText(`${SITE_URL}/p/${code}`);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard needs a secure context; the code is on screen regardless.
    }
  };

  if (!rows) return <Spinner label="Chargement des partenaires…" />;

  if (unconfigured) {
    return (
      <Card className="border-cyan-glow/25 bg-cyan-glow/5">
        <p className="text-sm font-bold text-cyan-glow">
          Le serveur n’est pas configuré
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
          Les partenaires ont besoin du SDK Admin Firebase. Renseigne{' '}
          <code>FIREBASE_SERVICE_ACCOUNT</code> et redémarre le serveur.
        </p>
      </Card>
    );
  }

  const columns: readonly Column<Row>[] = [
    {
      key: 'name',
      header: 'Partenaire',
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-semibold text-ink-100">{r.name}</span>
          {!r.active && <Pill tone="muted">Inactif</Pill>}
        </span>
      ),
    },
    {
      key: 'code',
      header: 'Code',
      render: (r) => (
        <button
          type="button"
          onClick={() => copyLink(r.code)}
          className="focus-ring rounded px-1 font-mono text-volt-500 hover:underline"
          title="Copier le lien de parrainage"
        >
          {copied === r.code ? 'copié !' : r.code}
        </button>
      ),
    },
    {
      key: 'rates',
      header: 'Taux',
      // One number when the rates agree, which is now everyone on the default.
      // "25 % / 25 %" in every row makes the one negotiated partner invisible,
      // which is the only row where this column carries information.
      render: (r) => (
        <span className="tnum text-ink-400">
          {r.rateFirstBps === r.rateRecurringBps
            ? `${bpsToPercent(r.rateFirstBps)} %`
            : `${bpsToPercent(r.rateFirstBps)} % / ${bpsToPercent(r.rateRecurringBps)} %`}
        </span>
      ),
    },
    { key: 'referrals', header: 'Filleuls', numeric: true, render: (r) => r.referrals },
    {
      key: 'owed',
      header: 'À verser',
      numeric: true,
      render: (r) => (
        <span className={r.owedCents >= PAYOUT_MINIMUM_CENTS ? 'text-gold' : ''}>
          {euros(r.owedCents)}
        </span>
      ),
    },
    {
      key: 'paid',
      header: 'Versé',
      numeric: true,
      render: (r) => <span className="text-ink-500">{euros(r.paidCents)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <span className="flex justify-end gap-1.5">
          {r.owedCents > 0 && (
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => pay(r.id)}
              className="focus-ring rounded-lg border border-ink-700 px-2 py-1 text-3xs font-bold uppercase tracking-widest text-ink-300 transition-colors hover:border-volt-500 hover:text-volt-400 disabled:opacity-50"
            >
              Marquer payé
            </button>
          )}
          <button
            type="button"
            disabled={busyId === r.id}
            onClick={() => toggle(r)}
            className="focus-ring rounded-lg border border-ink-800 px-2 py-1 text-3xs font-bold uppercase tracking-widest text-ink-500 transition-colors hover:text-ink-300 disabled:opacity-50"
          >
            {r.active ? 'Désactiver' : 'Activer'}
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <CreateForm onCreated={load} />

      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty="Aucun partenaire. Ajoute une salle ou un coach pour commencer."
      />

      {stale.length > 0 && (
        <Card className="border-gold/40">
          <p className="text-sm text-ink-300">
            {stale.length} partenaire(s) sont encore à l’ancien taux.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Préviens-les avant : leur tableau de bord changera sous leurs yeux.
            Un taux négocié ne sera pas touché.
          </p>
          <Button
            size="md"
            variant="secondary"
            className="mt-3"
            disabled={migrating}
            onClick={() => void migrateRates()}
          >
            {migrating
              ? 'Migration…'
              : `Les passer à ${bpsToPercent(RATE_RECURRING_BPS)} %`}
          </Button>
        </Card>
      )}

      {migrated && <p className="text-xs text-ink-400">{migrated}</p>}

      <p className="text-3xs leading-relaxed text-ink-600">
        « Marquer payé » n’envoie pas d’argent : l’app ne fait aucun virement.
        Vire la somme depuis ta banque, puis enregistre-le ici. Seuil conseillé
        avant virement : {euros(PAYOUT_MINIMUM_CENTS)}.
      </p>
    </div>
  );
}
