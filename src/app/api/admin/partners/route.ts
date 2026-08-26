import { NextResponse } from 'next/server';
import { adminDb, requireAdmin } from '@/lib/server/firebase-admin';
import {
  defaultRates,
  isValidCode,
  normaliseCode,
} from '@/lib/partners/commission';
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
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

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
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

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
    // Codes must be unique: two partners on one code would make every
    // commission ambiguous.
    const clash = await db
      .collection('partners')
      .where('code', '==', code)
      .limit(1)
      .get();
    if (!clash.empty) {
      return NextResponse.json({ error: 'code_taken' }, { status: 409 });
    }

    const rates = defaultRates();
    const ref = await db.collection('partners').add({
      code,
      name,
      kind,
      ownerUid: typeof body.ownerUid === 'string' ? body.ownerUid : null,
      rateFirstBps:
        typeof body.rateFirstBps === 'number' ? body.rateFirstBps : rates.rateFirstBps,
      rateRecurringBps:
        typeof body.rateRecurringBps === 'number'
          ? body.rateRecurringBps
          : rates.rateRecurringBps,
      city: typeof body.city === 'string' ? body.city.trim() : null,
      blurb: typeof body.blurb === 'string' ? body.blurb.trim() : null,
      logoUrl: null,
      active: true,
      createdAt: new Date(),
    });

    return NextResponse.json({ id: ref.id, code });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

/** Edit rates, details, or deactivate. The code itself is immutable. */
export async function PATCH(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

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

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing_to_do' }, { status: 400 });
  }

  try {
    await db.doc(`partners/${id}`).set(patch, { merge: true });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
