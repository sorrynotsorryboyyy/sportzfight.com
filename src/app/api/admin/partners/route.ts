import { NextResponse } from 'next/server';
import { adminDb, adminDenial, checkAdmin } from '@/lib/server/firebase-admin';
import { createPartner } from '@/lib/server/partners';
import { isValidCode, normaliseCode } from '@/lib/partners/commission';
import type { PartnerKind } from '@/lib/partners/types';

/**
 * Create, list and edit partners.
 *
 * Partners are added BY HAND, never by self-signup: commissions are real money
 * and a curated list is the cheapest fraud control available.
 */

export const runtime = 'nodejs';

const KINDS: PartnerKind[] = ['gym', 'coach'];

/** Everything the admin dashboard shows about one partner. */
export async function GET(req: Request) {
  const check = await checkAdmin(req);
  if (!check.ok) return adminDenial(check);

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  try {
    const [partners, payments] = await Promise.all([
      db.collection('partners').orderBy('createdAt', 'desc').get(),
      db.collection('payments').get(),
    ]);

    // Earnings per partner, from the ledger rather than a running counter: a
    // counter can drift, and this collection stays small.
    const owed = new Map<string, number>();
    const paid = new Map<string, number>();
    const invoices = new Map<string, number>();

    for (const doc of payments.docs) {
      const pid = doc.get('partnerId') as string | null;
      if (!pid) continue;
      const cents = (doc.get('commissionCents') as number) ?? 0;
      invoices.set(pid, (invoices.get(pid) ?? 0) + 1);
      if (doc.get('commissionPaidAt')) paid.set(pid, (paid.get(pid) ?? 0) + cents);
      else owed.set(pid, (owed.get(pid) ?? 0) + cents);
    }

    // Referral counts, one aggregation query per partner. Fine for a hand-
    // curated list; revisit if it ever runs to hundreds.
    const rows = await Promise.all(
      partners.docs.map(async (d) => {
        const referrals = await db
          .collection('users')
          .where('partnerId', '==', d.id)
          .count()
          .get();
        return {
          id: d.id,
          code: d.get('code'),
          name: d.get('name'),
          kind: d.get('kind'),
          city: d.get('city') ?? null,
          active: d.get('active') === true,
          rateFirstBps: d.get('rateFirstBps'),
          rateRecurringBps: d.get('rateRecurringBps'),
          referrals: referrals.data().count,
          invoices: invoices.get(d.id) ?? 0,
          owedCents: owed.get(d.id) ?? 0,
          paidCents: paid.get(d.id) ?? 0,
        };
      }),
    );

    return NextResponse.json({ partners: rows });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const check = await checkAdmin(req);
  if (!check.ok) return adminDenial(check);

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const code = typeof body.code === 'string' ? normaliseCode(body.code) : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const kind = KINDS.includes(body.kind as PartnerKind)
    ? (body.kind as PartnerKind)
    : 'coach';

  if (!isValidCode(code)) {
    return NextResponse.json({ error: 'bad_code' }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: 'bad_name' }, { status: 400 });

  try {
    // Uniqueness is enforced by a lock document inside a transaction, not by a
    // query — see createPartner. Two partners on one code would send one of
    // them the other's referrals, silently.
    const created = await createPartner(db, {
      code,
      name,
      kind,
      ownerUid: typeof body.ownerUid === 'string' ? body.ownerUid : null,
      city: typeof body.city === 'string' ? body.city.trim() : null,
      blurb: typeof body.blurb === 'string' ? body.blurb.trim() : null,
      rateFirstBps:
        typeof body.rateFirstBps === 'number' ? body.rateFirstBps : undefined,
      rateRecurringBps:
        typeof body.rateRecurringBps === 'number' ? body.rateRecurringBps : undefined,
    });

    if (!created.ok) {
      return NextResponse.json({ error: 'code_taken' }, { status: 409 });
    }

    return NextResponse.json({ id: created.id, code: created.code });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

/** Edit rates, details, or deactivate. The code itself is immutable. */
export async function PATCH(req: Request) {
  const check = await checkAdmin(req);
  if (!check.ok) return adminDenial(check);

  const db = adminDb();
  if (!db) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  // The code is deliberately absent: it is printed on posters and carried in
  // links, so changing it would silently break every existing referral.
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = body.name.trim();
  if (typeof body.city === 'string') patch.city = body.city.trim();
  if (typeof body.blurb === 'string') patch.blurb = body.blurb.trim();
  if (typeof body.active === 'boolean') patch.active = body.active;
  if (typeof body.ownerUid === 'string' || body.ownerUid === null) {
    patch.ownerUid = body.ownerUid;
  }
  if (typeof body.rateFirstBps === 'number' && body.rateFirstBps >= 0) {
    patch.rateFirstBps = Math.round(body.rateFirstBps);
  }
  if (typeof body.rateRecurringBps === 'number' && body.rateRecurringBps >= 0) {
    patch.rateRecurringBps = Math.round(body.rateRecurringBps);
  }

  // A logo the admin pastes, not one a partner uploads. Firebase Storage is
  // not configured in this project, so an upload path would mean a bucket,
  // storage rules, resizing and image moderation — a batch of its own. A gym
  // that wants its logo emails a link.
  if (typeof body.logoUrl === 'string') {
    const url = body.logoUrl.trim();
    if (url && !url.startsWith('https://')) {
      return NextResponse.json({ error: 'bad_logo' }, { status: 400 });
    }
    patch.logoUrl = url || null;
  }

  /*
   * Legal identity goes in a PRIVATE subcollection, never on the partner
   * document.
   *
   * partners/{id} is world-readable — /p/CODE has to render for a signed-out
   * visitor — so a SIRET written there would be public, and for a
   * micro-entrepreneur that is personal data. Same reasoning, and the same
   * shape, as users/{uid}/private/.
   */
  const legal: Record<string, unknown> = {};
  if (typeof body.legalName === 'string') legal.legalName = body.legalName.trim() || null;
  if (typeof body.siret === 'string') {
    legal.siret = body.siret.replace(/\s/g, '') || null;
  }

  if (Object.keys(patch).length === 0 && Object.keys(legal).length === 0) {
    return NextResponse.json({ error: 'nothing_to_do' }, { status: 400 });
  }

  try {
    if (Object.keys(patch).length > 0) {
      await db.doc(`partners/${id}`).set(patch, { merge: true });
    }
    if (Object.keys(legal).length > 0) {
      await db.doc(`partners/${id}/private/legal`).set(legal, { merge: true });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
