'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { apiDelete, apiGet, apiPost } from '@/lib/firebase/api';
import {
  OFFERS_MAX,
  OFFER_DETAILS_MAX,
  OFFER_LABEL_MAX,
} from '@/lib/partners/types';

/**
 * Where a partner writes what they give a subscriber in person.
 *
 * Every offer is reviewed before it appears on the public page, because that
 * page is published by SportzFight and an unreviewed claim on it is made in
 * our name.
 */

interface Offer {
  id: string;
  label: string;
  details: string | null;
  status: string;
  reviewNote: string | null;
}

const STATUS: Record<string, { text: string; className: string }> = {
  approved: { text: 'En ligne', className: 'text-volt-500' },
  pending: { text: 'En attente de validation', className: 'text-gold' },
  rejected: { text: 'Refusée', className: 'text-flare-400' },
};

export function OffersEditor() {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [details, setDetails] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void apiGet<{ offers: Offer[] }>('/api/partner/offers').then((r) => {
      setOffers(r.ok && r.data ? r.data.offers : []);
    });
  }, []);

  useEffect(load, [load]);

  const reset = () => {
    setEditing(null);
    setLabel('');
    setDetails('');
    setOpen(false);
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await apiPost('/api/partner/offers', {
      id: editing ?? undefined,
      label,
      details,
    });
    setBusy(false);
    if (!r.ok) {
      setError(
        r.error === 'too_many'
          ? `Tu as déjà ${OFFERS_MAX} offres. Retires-en une pour en ajouter une autre.`
          : 'Enregistrement impossible. Réessaie.',
      );
      return;
    }
    reset();
    load();
  };

  const remove = async (id: string) => {
    setBusy(true);
    await apiDelete(`/api/partner/offers?id=${id}`);
    setBusy(false);
    load();
  };

  const edit = (o: Offer) => {
    setEditing(o.id);
    setLabel(o.label);
    setDetails(o.details ?? '');
    setOpen(true);
  };

  if (!offers) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-3xs font-bold uppercase tracking-widest text-ink-500">
          Tes offres
        </h2>
        {!open && offers.length < OFFERS_MAX && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="focus-ring text-3xs font-bold uppercase tracking-widest text-volt-500"
          >
            + Ajouter
          </button>
        )}
      </div>

      {offers.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {offers.map((o) => {
            const s = STATUS[o.status] ?? STATUS.pending;
            return (
              <li key={o.id}>
                <Card padding="md" radius="md">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-ink-100">{o.label}</p>
                    <span
                      className={`shrink-0 text-3xs font-bold uppercase tracking-widest ${s.className}`}
                    >
                      {s.text}
                    </span>
                  </div>
                  {o.details && (
                    <p className="mt-1 text-xs leading-relaxed text-ink-400">
                      {o.details}
                    </p>
                  )}
                  {o.reviewNote && (
                    <p className="mt-1.5 text-xs italic leading-relaxed text-flare-400">
                      « {o.reviewNote} »
                    </p>
                  )}
                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => edit(o)}
                      className="focus-ring text-3xs uppercase tracking-widest text-ink-400 hover:text-ink-200"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(o.id)}
                      className="focus-ring text-3xs uppercase tracking-widest text-ink-500 hover:text-flare-400"
                    >
                      Retirer
                    </button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <Card className="mt-2">
          <Input
            label="L’offre"
            value={label}
            maxLength={OFFER_LABEL_MAX}
            placeholder="1 séance d’essai offerte"
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="mt-3">
            <Input
              label="Conditions (facultatif)"
              value={details}
              maxLength={OFFER_DETAILS_MAX}
              placeholder="Sur présentation de ton compte, hors samedi."
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
          {error && <p className="mt-2 text-xs text-flare-400">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button size="md" disabled={busy || !label.trim()} onClick={() => void save()}>
              {busy ? '…' : 'Envoyer pour validation'}
            </Button>
            <Button size="md" variant="ghost" onClick={reset}>
              Annuler
            </Button>
          </div>
        </Card>
      )}

      {/* The last sentence is essential: re-review on edit is surprising, and a
          partner who edits a live offer and finds it gone will report it as a
          bug rather than as the safeguard it is. */}
      <p className="mt-2 text-3xs leading-relaxed text-ink-600">
        Ce que tu proposes à tes adhérents inscrits sur SportzFight, à récupérer
        chez toi. Chaque offre est relue avant d’apparaître sur ta page — compte
        quelques jours. Modifier une offre déjà en ligne la remet en attente.
      </p>
    </section>
  );
}
