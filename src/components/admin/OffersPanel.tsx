'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { apiGet, apiPatch } from '@/lib/firebase/api';

/**
 * Reviewing what partners want to display on their own landing page.
 *
 * A peer of PartnersPanel rather than a section inside it: the queue is
 * cross-partner — you review everything pending, not gym by gym — and its
 * common case is empty, which is a different shape of screen entirely.
 *
 * The thing being guarded: /p/CODE is published by SportzFight, so an
 * unreviewed promise on it is made in our name.
 */

interface Row {
  id: string;
  partnerId: string;
  partnerName: string;
  label: string;
  details: string | null;
}

export function OffersPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    void apiGet<{ offers: Row[] }>('/api/admin/offers').then((r) => {
      setUnconfigured(r.error === 'admin_unconfigured');
      setRows(r.ok && r.data ? r.data.offers : []);
    });
  }, []);

  useEffect(load, [load]);

  const decide = async (row: Row, approve: boolean) => {
    setBusyId(row.id);
    await apiPatch('/api/admin/offers', {
      partnerId: row.partnerId,
      id: row.id,
      approve,
      note: approve ? undefined : note,
    });
    setBusyId(null);
    setRefusing(null);
    setNote('');
    load();
  };

  if (unconfigured) {
    return (
      <Card className="border-gold/40">
        <p className="text-sm text-ink-300">
          Le compte de service Firebase n’est pas configuré : la file d’attente
          ne peut pas être lue.
        </p>
      </Card>
    );
  }

  if (!rows) return <Spinner label="Chargement des offres…" />;

  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-ink-400">
          Aucune offre en attente. Les partenaires proposent leurs avantages
          depuis leur espace, et rien n’apparaît sur leur page avant ta
          validation.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <Card key={row.id}>
          <p className="text-3xs font-bold uppercase tracking-widest text-ink-500">
            {row.partnerName}
          </p>
          <p className="mt-1 text-base font-bold text-ink-100">{row.label}</p>
          {row.details && (
            <p className="mt-1 text-sm leading-relaxed text-ink-400">
              {row.details}
            </p>
          )}

          {refusing === row.id ? (
            <div className="mt-3">
              <Input
                label="Pourquoi ? (le partenaire le lira)"
                value={note}
                maxLength={200}
                placeholder="Précise la condition d’obtention."
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="md"
                  variant="secondary"
                  disabled={busyId === row.id}
                  onClick={() => void decide(row, false)}
                >
                  Refuser
                </Button>
                <Button size="md" variant="ghost" onClick={() => setRefusing(null)}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button
                size="md"
                disabled={busyId === row.id}
                onClick={() => void decide(row, true)}
              >
                Approuver
              </Button>
              <Button
                size="md"
                variant="ghost"
                onClick={() => {
                  setRefusing(row.id);
                  setNote('');
                }}
              >
                Refuser
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
