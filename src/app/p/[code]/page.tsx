import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Footer } from '@/components/ui/Footer';
import { PageHeader } from '@/components/ui/PageHeader';
import { adminDb } from '@/lib/server/firebase-admin';
import { normaliseCode } from '@/lib/partners/commission';
import { OFFERS_MAX, type PartnerPublic } from '@/lib/partners/types';
import { SITE_NAME } from '@/lib/site';
import { RememberCode } from './RememberCode';

/**
 * A partner's landing page: /p/FITPRO.
 *
 * Server-rendered so it can carry its own metadata and be shared as a link —
 * this is the page a gym prints on a poster, so it has to preview properly and
 * work without JavaScript for the reading part.
 *
 * The code is remembered client-side (see RememberCode) and applied after the
 * visitor signs up, because attribution has to be written by the server.
 */

interface LandingOffer {
  id: string;
  label: string;
  details: string | null;
}

type Landing = PartnerPublic & { offers: LandingOffer[] };

async function loadPartner(raw: string): Promise<Landing | null> {
  const code = normaliseCode(raw);
  if (!code) return null;

  const db = adminDb();
  if (!db) return null;

  try {
    const found = await db
      .collection('partners')
      .where('code', '==', code)
      .limit(1)
      .get();
    if (found.empty) return null;

    const d = found.docs[0];

    // Approved only, and capped. A partner cannot flood the page — the rules
    // force every new offer to 'pending' — but the limit is here too so the
    // layout does not depend on the review queue being kept tidy.
    let offers: LandingOffer[] = [];
    try {
      const snap = await d.ref
        .collection('offers')
        .where('status', '==', 'approved')
        .orderBy('createdAt', 'asc')
        .limit(OFFERS_MAX)
        .get();
      offers = snap.docs.map((o) => ({
        id: o.id,
        label: o.get('label') as string,
        details: (o.get('details') as string | null) ?? null,
      }));
    } catch {
      // Caught SEPARATELY on purpose: a missing index or a rules change must
      // take down the offers block, never the page a poster points at.
    }

    // Inactive partners keep their page — a printed poster outlives a contract,
    // and a dead link is worse than a page that simply stops earning.
    return {
      code: d.get('code'),
      name: d.get('name'),
      kind: d.get('kind'),
      city: d.get('city') ?? null,
      blurb: d.get('blurb') ?? null,
      logoUrl: d.get('logoUrl') ?? null,
      offers,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const partner = await loadPartner(code);
  if (!partner) return { title: 'Partenaire introuvable' };

  return {
    title: `${partner.name} × ${SITE_NAME}`,
    description: `${partner.name} te recommande SportzFight : des défis sportifs d’une minute, comptés par ta caméra.`,
    openGraph: {
      title: `${partner.name} × ${SITE_NAME}`,
      description: `${partner.name} te recommande SportzFight.`,
    },
  };
}

export default async function PartnerLanding({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const partner = await loadPartner(code);
  if (!partner) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 p-5 pb-16">
      <RememberCode code={partner.code} />
      <PageHeader />

      <section>
        {/* Pasted by the admin, never uploaded — Firebase Storage is not set
            up here, and a partner-supplied image would need the same review an
            offer gets, which is far harder to do at a glance. */}
        {partner.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={partner.logoUrl}
            alt=""
            className="mb-3 h-12 w-auto max-w-40 object-contain"
          />
        )}
        <p className="text-3xs font-bold uppercase tracking-widest text-volt-500">
          {partner.kind === 'gym' ? 'Salle partenaire' : 'Coach partenaire'}
          {partner.city ? ` · ${partner.city}` : ''}
        </p>
        <h1 className="mt-3 text-3xl font-black uppercase leading-[0.95] tracking-tighter sm:text-4xl">
          {partner.name}
          <br />
          <span className="text-ink-400">te recommande</span>
          <br />
          <span className="text-volt-500">SportzFight</span>
        </h1>
      </section>

      {partner.blurb && (
        <Card>
          <p className="text-sm leading-relaxed text-ink-300">
            « {partner.blurb} »
          </p>
          <p className="mt-2 text-3xs font-bold uppercase tracking-widest text-ink-500">
            {partner.name}
          </p>
        </Card>
      )}

      {/* BEFORE the call to action, deliberately: the offer is the reason to
          sign up HERE rather than anywhere else, so it has to be read before
          the button. Below it, it would be decoration. */}
      {partner.offers.length > 0 && (
        <section>
          <h2 className="text-3xs font-bold uppercase tracking-widest text-volt-500">
            Tes avantages chez {partner.name}
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {partner.offers.map((o) => (
              <li key={o.id}>
                <Card padding="md" radius="md">
                  <p className="text-sm font-bold text-ink-100">{o.label}</p>
                  {o.details && (
                    <p className="mt-1 text-xs leading-relaxed text-ink-400">
                      {o.details}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
          {/* Not optional. This sentence is what separates "the gym promised
              you a bottle" from "SportzFight promised you a bottle", and the
              second is a consumer-law problem. */}
          <p className="mt-2 text-3xs leading-relaxed text-ink-600">
            À récupérer sur place, chez {partner.name}. Ces avantages sont
            proposés par le partenaire, pas par SportzFight.
          </p>
        </section>
      )}

      <Card className="border-volt-500/30">
        <p className="text-sm leading-relaxed text-ink-300">
          Une minute, ton téléphone, aucun matériel. Ta caméra compte les
          répétitions pendant que tu affrontes quelqu’un en direct — et la
          vidéo ne quitte jamais ton appareil.
        </p>
        <Link href="/login" className="mt-4 block">
          <Button>Commencer gratuitement</Button>
        </Link>
        <p className="mt-2 text-center text-3xs text-ink-600">
          Connexion Google · aucun mot de passe · pompes et squats gratuits
        </p>
      </Card>

      <p className="text-3xs leading-relaxed text-ink-600">
        En passant par cette page, ton inscription est rattachée à{' '}
        {partner.name}, qui perçoit une commission si tu prends un abonnement.
        Cela ne change rien à ton prix.
      </p>

      <Footer className="mt-auto" />
    </main>
  );
}
