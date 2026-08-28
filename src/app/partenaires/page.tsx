import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Footer } from '@/components/ui/Footer';
import { PageHeader } from '@/components/ui/PageHeader';
import { bpsToPercent } from '@/lib/partners/commission';
import { RATE_RECURRING_BPS } from '@/lib/partners/types';

/**
 * The recruitment page.
 *
 * A server component, like the legal pages: the pitch belongs in the HTML so a
 * gym owner finds it in a search and reads it without running the app.
 */

export const metadata: Metadata = {
  title: 'Programme partenaire',
  description:
    'Salles de sport et coachs : recommandez SportzFight à vos adhérents et touchez une commission sur chaque abonnement.',
  robots: { index: true, follow: true },
};

const STEPS = [
  {
    n: '1',
    title: 'On vous crée un code',
    body: 'Un code à votre nom, et une page à votre image que vous partagez à vos adhérents.',
  },
  {
    n: '2',
    title: 'Ils s’inscrivent',
    body: 'Toute personne passant par votre lien vous est rattachée pendant 90 jours, même si elle s’abonne plus tard.',
  },
  {
    n: '3',
    title: 'Vous êtes payé',
    body: 'Commission sur chaque abonnement, visible en direct depuis votre espace. Relevé le 1er de chaque mois, versé par virement.',
  },
] as const;

const ARGUMENTS = [
  {
    title: 'Rien à installer',
    body: 'Vos adhérents utilisent leur téléphone. Pas de matériel, pas de logiciel, pas de formation.',
  },
  {
    title: 'Un complément, pas un concurrent',
    body: 'Des défis d’une minute à faire chez soi entre deux séances. Cela entretient l’habitude, cela ne remplace pas votre salle.',
  },
  {
    title: 'Aucune donnée personnelle échangée',
    body: 'Vous voyez des chiffres : inscrits, abonnés, gains. Jamais l’identité de qui que ce soit.',
  },
  {
    title: 'Sans engagement',
    body: 'Pas de contrat d’exclusivité, pas de minimum. Vous arrêtez quand vous voulez.',
  },
] as const;

export default function PartnersProgramme() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 p-5 pb-16 sm:p-8">
      <PageHeader />

      <section>
        <p className="text-3xs font-bold uppercase tracking-widest text-volt-500">
          Salles de sport &amp; coachs
        </p>
        <h1 className="mt-3 text-4xl font-black uppercase leading-[0.9] tracking-tighter sm:text-5xl">
          Recommandez.
          <br />
          <span className="text-volt-500">Touchez une commission.</span>
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-300">
          Vos adhérents s’entraînent déjà chez eux. SportzFight leur donne une
          raison de s’y tenir — et vous rémunère quand ils s’abonnent.
        </p>
      </section>

      {/* ONE card, not two.
          The old layout was "Premier mois 12% / Puis chaque mois 7%", which
          existed because the rate was a tier. With a flat rate, two cards
          showing the same number read as a mistake and bury the single fact
          this page exists to land. */}
      <section>
        <Card className="border-volt-500/40">
          <p className="text-3xs font-bold uppercase tracking-widest text-ink-500">
            Sur chaque abonnement, à vie
          </p>
          <p className="tnum mt-1 text-6xl font-black leading-none text-volt-500">
            {bpsToPercent(RATE_RECURRING_BPS)} %
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-300">
            Le même taux le premier mois et à chaque renouvellement, aussi
            longtemps que la personne reste abonnée. Pas de palier, pas de
            dégressivité, pas de plafond.
          </p>
          {/* The worked example is deliberate: 25% of nothing is nothing, and a
              gym owner converts a percentage into euros or does not act. */}
          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            Un adhérent abonné à 5,99 €/mois vous rapporte 1,50 € par mois, soit
            18 € sur l’année. Dix adhérents, 180 €.
          </p>
        </Card>
      </section>

      <section>
        <h2 className="text-xl font-black uppercase tracking-tight">
          Comment ça marche
        </h2>
        <ol className="stagger mt-4 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n}>
              <Card className="h-full">
                <span className="grid size-8 place-items-center rounded-full bg-volt-500/15 text-sm font-black text-volt-500">
                  {s.n}
                </span>
                <h3 className="mt-3 text-sm font-bold text-ink-100">{s.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
                  {s.body}
                </p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-xl font-black uppercase tracking-tight">
          Pourquoi le proposer
        </h2>
        <div className="stagger mt-4 grid gap-3 sm:grid-cols-2">
          {ARGUMENTS.map((a) => (
            <Card key={a.title}>
              <h3 className="text-sm font-bold text-ink-100">{a.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
                {a.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <Card className="border-cyan-glow/25 bg-cyan-glow/5">
          <h2 className="text-lg font-black uppercase tracking-tight text-cyan-glow">
            Devenir partenaire
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-300">
            Les partenaires sont ajoutés à la main, un par un. Écrivez-nous en
            précisant le nom de votre structure et votre ville — nous créons
            votre code et votre page.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            Les commissions sont versées par virement, sur facture. Vous devez
            donc disposer d’une structure déclarée (micro-entreprise, société,
            association).
          </p>
          <Link href="/mentions-legales" className="mt-4 inline-block">
            <Button size="md" variant="secondary">
              Nous contacter
            </Button>
          </Link>
        </Card>

        {/* A returning partner used to land here and bounce: the page's only
            action was "contact us", and their own space was reachable solely
            by typing the URL. That stopped being tolerable when offers became
            something they author there. */}
        <p className="mt-3 text-center text-xs text-ink-500">
          Déjà partenaire ?{' '}
          <Link href="/partenaire" className="focus-ring text-volt-500 underline underline-offset-2">
            Accéder à ton espace
          </Link>
        </p>
      </section>

      <Footer className="mt-auto border-t border-ink-800/60 pt-6" />
    </main>
  );
}
