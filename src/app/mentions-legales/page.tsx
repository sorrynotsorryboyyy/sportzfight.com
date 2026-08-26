import type { Metadata } from 'next';
import { Fill, LegalPage, Section } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description:
    'Éditeur, hébergeur et contact du site SportzFight.',
  robots: { index: true, follow: true },
};

export default function MentionsLegales() {
  return (
    <LegalPage title="Mentions légales" updated="2026-08-26">
      <Section title="1. Éditeur du site">
        <p>
          Le site SportzFight est édité par <Fill>nom ou raison sociale</Fill>,{' '}
          <Fill>forme juridique — ex. micro-entreprise, SASU</Fill>, dont le
          siège est situé <Fill>adresse complète</Fill>.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            SIRET : <Fill>numéro SIRET</Fill>
          </li>
          <li>
            Numéro de TVA intracommunautaire : <Fill>n° TVA, ou « non
            applicable, article 293 B du CGI » en franchise en base</Fill>
          </li>
          <li>
            Contact : <Fill>adresse e-mail de contact</Fill>
          </li>
          <li>
            Directeur de la publication : <Fill>nom du directeur de
            publication</Fill>
          </li>
        </ul>
      </Section>

      <Section title="2. Hébergement">
        <p>
          Le site est hébergé par <strong>Vercel Inc.</strong>, 340 S Lemon Ave
          #4133, Walnut, CA 91789, États-Unis — <em>vercel.com</em>.
        </p>
        <p>
          Les données de l’application (comptes, scores, classement) sont
          hébergées par <strong>Google Ireland Limited</strong> via les services
          Firebase, Gordon House, Barrow Street, Dublin 4, Irlande.
        </p>
      </Section>

      <Section title="3. Propriété intellectuelle">
        <p>
          La structure du site, son identité visuelle, ses textes et ses
          éléments graphiques sont la propriété de l’éditeur, sauf mention
          contraire. Toute reproduction ou représentation, totale ou partielle,
          sans autorisation écrite est interdite.
        </p>
        <p>
          La détection de mouvement s’appuie sur MediaPipe, publié par Google
          sous licence Apache 2.0.
        </p>
      </Section>

      <Section title="4. Données personnelles">
        <p>
          Le traitement des données personnelles est décrit dans la{' '}
          <a
            href="/confidentialite"
            className="font-semibold text-volt-500 hover:underline"
          >
            politique de confidentialité
          </a>
          , qui précise notamment que{' '}
          <strong>
            les images captées par la caméra ne quittent jamais votre appareil
          </strong>
          .
        </p>
      </Section>

      <Section title="5. Signaler un contenu">
        <p>
          Pour signaler un pseudonyme inapproprié, un comportement abusif ou tout
          contenu contraire aux{' '}
          <a href="/cgu" className="font-semibold text-volt-500 hover:underline">
            conditions générales d’utilisation
          </a>
          , écrivez à <Fill>adresse e-mail de contact</Fill>. Les signalements
          sont traités dans les meilleurs délais.
        </p>
      </Section>

      <Section title="6. Médiation de la consommation">
        <p>
          Conformément à l’article L. 612-1 du Code de la consommation, tout
          consommateur peut recourir gratuitement à un médiateur de la
          consommation en vue de la résolution amiable d’un litige. Médiateur
          compétent : <Fill>nom et coordonnées du médiateur — obligatoire dès
          que la boutique encaisse des paiements</Fill>.
        </p>
        <p>
          La plateforme européenne de règlement en ligne des litiges est
          accessible à l’adresse{' '}
          <em>ec.europa.eu/consumers/odr</em>.
        </p>
      </Section>
    </LegalPage>
  );
}
