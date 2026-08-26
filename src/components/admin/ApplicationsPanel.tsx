'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Pill } from '@/components/ui/Pill';
import { Spinner } from '@/components/ui/Spinner';
import { apiGet, apiPost } from '@/lib/firebase/api';
import { isValidCode, normaliseCode } from '@/lib/partners/commission';

/**
 * Professional applications awaiting review.
 *
 * Approving is what creates the partner and its code — the application itself
 * grants nothing. That separation is deliberate: the partner list stays
 * curated, which is the cheapest control there is over money going out.
 */

interface Row {
  uid: string;
  kind: 'gym' | 'coach';
  structure: string;
  city: string;
  discipline: string;
  username: string;
}

function ApplicationCard({ row, onDone }: { row: Row; onDone: () => void }) {
  // Pre-filled from the structure name, still editable: it goes on posters.
  const [code, setCode] = useState(() => normaliseCode(row.structure));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    const r = await apiPost('/api/admin/applications', {
      uid: row.uid,
      approve,
      code,
    });
    setBusy(false);
    if (r.ok) return onDone();
    setError(
      r.error === 'code_taken'
        ? 'Ce code est déjà pris.'
        : r.error === 'bad_code'
          ? 'Code trop court (3 caractères minimum).'
          : 'L’opération a échoué.',
    );
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink-100">{row.structure}</p>
          <p className="mt-0.5 text-3xs text-ink-500">
            {row.username}
            {row.city ? ` · ${row.city}` : ''}
          </p>
        </div>
        <Pill tone={row.kind === 'gym' ? 'volt' : 'cyan'}>
          {row.kind === 'gym' ? 'Salle' : 'Coach'}
        </Pill>
      </div>

      {row.discipline && (
        <p className="text-xs leading-relaxed text-ink-400">{row.discipline}</p>
      )}

      <Input
        label="Code à attribuer"
        value={code}
        onChange={(e) => setCode(normaliseCode(e.target.value))}
        error={error}
        hint="Définitif : il sera imprimé et partagé."
      />

      <div className="flex gap-2">
        <Button
          size="md"
          loading={busy}
          disabled={!isValidCode(code)}
          onClick={() => decide(true)}
        >
          Approuver
        </Button>
        <Button variant="ghost" size="md" disabled={busy} onClick={() => decide(false)}>
          Refuser
        </Button>
      </div>
    </Card>
  );
}

export function ApplicationsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);

  const load = useCallback(() => {
    void apiGet<{ applications: Row[] }>('/api/admin/applications').then((r) => {
      setUnconfigured(r.error === 'admin_unconfigured');
      setRows(r.ok && r.data ? r.data.applications : []);
    });
  }, []);

  useEffect(load, [load]);

  if (!rows) return <Spinner label="Chargement des candidatures…" />;

  if (unconfigured) {
    return (
      <Card className="border-cyan-glow/25 bg-cyan-glow/5">
        <p className="text-sm font-bold text-cyan-glow">
          Le serveur n’est pas configuré
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
          Renseigne <code>FIREBASE_SERVICE_ACCOUNT</code> et redémarre le
          serveur.
        </p>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aucune candidature en attente"
        body="Les demandes envoyées depuis l’écran de bienvenue apparaîtront ici."
      />
    );
  }

  return (
    <div className="stagger flex flex-col gap-3">
      {rows.map((r) => (
        <ApplicationCard key={r.uid} row={r} onDone={load} />
      ))}
    </div>
  );
}
