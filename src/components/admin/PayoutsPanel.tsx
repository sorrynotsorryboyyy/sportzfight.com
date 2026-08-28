'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Table, euros, type Column } from '@/components/ui/Table';
import { apiGet, apiPost } from '@/lib/firebase/api';
import {
  nextPeriod,
  periodLabel,
  periodOf,
  previousPeriod,
  type PeriodId,
} from '@/lib/partners/period';
import { PAYOUT_MINIMUM_CENTS } from '@/lib/partners/types';

/**
 * Monthly statements: what to transfer, to whom, and what has been settled.
 *
 * A separate tab rather than another section of PartnersPanel, because
 * settling a month is a different job from curating the partner list, and that
 * component is already doing four things.
 *
 * The statement is computed fresh on every view — there is no scheduled job,
 * so opening June after skipping April still produces a correct April. A PAID
 * statement is never recomputed: its numbers have already left a bank account.
 */

interface Row {
  id: string;
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  period: PeriodId;
  periodCents: number;
  carriedCents: number;
  totalCents: number;
  invoiceCount: number;
  belowMinimum: boolean;
  status: 'draft' | 'paid';
  overflow?: boolean;
  frozen?: boolean;
}

export function PayoutsPanel() {
  // Defaults to last month: you settle March in early April, not mid-March.
  const [period, setPeriod] = useState<PeriodId>(() =>
    previousPeriod(periodOf(new Date())),
  );
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    // Deliberately does NOT clear rows first: setting state synchronously
    // inside the effect that calls this is what react-hooks flags, and the
    // previous month's figures staying visible for a beat is better than a
    // flash of empty table anyway.
    void apiGet<{ period: PeriodId; rows: Row[] }>(
      `/api/admin/payouts?period=${period}`,
    ).then((r) => {
      // Without the Admin SDK an empty table would read as "nothing owed",
      // which is a very different and much more misleading statement.
      setUnconfigured(r.error === 'admin_unconfigured');
      setRows(r.ok && r.data ? r.data.rows : []);
    });
  }, [period]);

  useEffect(load, [load]);

  const pay = async (row: Row) => {
    setBusyId(row.id);
    setNote(null);
    const r = await apiPost<{ marked: number; totalCents: number }>(
      '/api/admin/payouts',
      { partnerId: row.partnerId, period },
    );
    setBusyId(null);
    if (!r.ok) {
      setNote(
        r.error === 'too_many'
          ? `${row.partnerName} a plus de 450 factures en attente. Contacte-moi : un relevé partiel serait pire que pas de relevé.`
          : 'Enregistrement impossible. Réessaie.',
      );
    }
    load();
  };

  if (unconfigured) {
    return (
      <Card className="border-gold/40">
        <p className="text-sm text-ink-300">
          Le compte de service Firebase n’est pas configuré : les relevés ne
          peuvent pas être calculés.
        </p>
      </Card>
    );
  }

  if (!rows) return <Spinner label="Calcul des relevés…" />;

  const drafts = rows.filter((r) => r.status !== 'paid');
  const payable = drafts.filter((r) => !r.belowMinimum && !r.overflow);
  const dueCents = payable.reduce((sum, r) => sum + r.totalCents, 0);

  const columns: Column<Row>[] = [
    {
      key: 'partner',
      header: 'Partenaire',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-200">{r.partnerName}</p>
          <p className="font-mono text-3xs text-ink-500">{r.partnerCode}</p>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Période',
      numeric: true,
      render: (r) => <span className="tnum">{euros(r.periodCents)}</span>,
    },
    {
      key: 'carried',
      header: 'Report',
      numeric: true,
      // Money owed from before this month, held back by the minimum. Shown as
      // its own column so a partner asking "why is March bigger than March"
      // has an answer on the same row.
      render: (r) => (
        <span className={r.carriedCents > 0 ? 'tnum text-gold' : 'tnum text-ink-600'}>
          {euros(r.carriedCents)}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      render: (r) => (
        <span className="tnum font-bold text-ink-100">{euros(r.totalCents)}</span>
      ),
    },
    {
      key: 'invoices',
      header: 'Factures',
      numeric: true,
      render: (r) => r.invoiceCount,
    },
    {
      key: 'action',
      header: '',
      render: (r) => {
        if (r.status === 'paid') {
          return <span className="text-3xs text-volt-500">versé</span>;
        }
        if (r.overflow) {
          return <span className="text-3xs text-gold">trop de factures</span>;
        }
        if (r.belowMinimum) {
          // Reported, not disabled: closing a partnership must let you settle
          // 4,30 € and be done. It is de-emphasised, not forbidden.
          return (
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => void pay(r)}
              className="text-3xs text-ink-500 underline underline-offset-2 hover:text-ink-300"
            >
              reporté — verser quand même
            </button>
          );
        }
        return (
          <Button
            size="md"
            variant="secondary"
            disabled={busyId === r.id}
            onClick={() => void pay(r)}
          >
            {busyId === r.id ? '…' : 'Marquer versé'}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Mois précédent"
            onClick={() => setPeriod(previousPeriod(period))}
            className="focus-ring rounded-lg border border-ink-800 px-2.5 py-1 text-sm text-ink-400 hover:border-ink-700"
          >
            ‹
          </button>
          <span className="min-w-32 text-center text-sm font-bold uppercase tracking-wide text-ink-200">
            {periodLabel(period)}
          </span>
          <button
            type="button"
            aria-label="Mois suivant"
            onClick={() => setPeriod(nextPeriod(period))}
            className="focus-ring rounded-lg border border-ink-800 px-2.5 py-1 text-sm text-ink-400 hover:border-ink-700"
          >
            ›
          </button>
        </div>

        {dueCents > 0 && (
          <p className="tnum text-sm text-ink-400">
            à verser : <span className="font-bold text-ink-100">{euros(dueCents)}</span>
          </p>
        )}
      </div>

      {note && <p className="text-xs leading-relaxed text-gold">{note}</p>}

      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty="Rien à verser pour ce mois."
      />

      <p className="text-3xs leading-relaxed text-ink-600">
        « Marquer versé » n’envoie pas d’argent : vire la somme depuis ta banque,
        puis enregistre-le ici. Le relevé sert de base à la facture du
        partenaire. En dessous de {euros(PAYOUT_MINIMUM_CENTS)} le solde est
        reporté au mois suivant — jamais perdu.
      </p>
    </div>
  );
}
