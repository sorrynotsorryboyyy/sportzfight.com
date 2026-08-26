import type { Metadata } from 'next';
import { Fill, LegalPage, Section } from '@/components/legal/LegalPage';
import { MAX_DISCOUNT_RATIO } from '@/lib/shop/catalog';

export const metadata: Metadata = {
  title: 'Conditions générales',
  description:
    'Règles d’utilisation de SportzFight : compte, déroulement des battles, avertissement santé, abonnements et résiliation.',
  robots: { index: true, follow: true },
};

export default function CGU() {
  return (
    <LegalPage
      title="Conditions générales d’utilisation et de vente"
      updated="2026-08-26"
    >
      <Section title="1. Objet">
        <p>
          SportzFight est un service en ligne de défis sportifs en 1 contre 1.
          Deux personnes réalisent le même exercice pendant une durée limitée ;
          la caméra de chaque appareil compte les répétitions localement et le
          plus haut score l’emporte.
        </p>
        <p>
          Créer un compte ou utiliser le service vaut acceptation des présentes
          conditions.
        </p>
      </Section>

      <Section title="2. Avertissement santé — à lire">
        <div className="rounded-2xl border border-flare-500/30 bg-flare-500/5 p-4">
          <p className="font-bold text-flare-400">
            SportzFight n’est ni un coach, ni un professionnel de santé.
          </p>
          <ul className="mt-2 ml-4 list-disc space-y-1">
            <li>
              Consultez un médecin avant de reprendre une activité physique, en
              particulier en cas de problème cardiaque, articulaire ou
              respiratoire, de grossesse, ou après une blessure.
            </li>
            <li>Échauffez-vous. Le format en 60 secondes pousse à l’intensité.</li>
            <li>
              <strong>Arrêtez immédiatement</strong> en cas de douleur, de
              vertige, de gêne respiratoire ou de malaise. Un score n’a aucune
              importance en comparaison.
            </li>
            <li>
              Dégagez un espace suffisant autour de vous et vérifiez la stabilité
              de votre appareil avant de commencer.
            </li>
          </ul>
          <p className="mt-2">
            Vous pratiquez sous votre seule responsabilité. L’éditeur ne saurait
            être tenu responsable d’une blessure survenue lors de l’usage du
            service.
          </p>
        </div>
      </Section>

      <Section title="3. Compte">
        <p>
          L’inscription se fait via un compte Google. Vous êtes responsable de
          l’usage qui en est fait. Un seul compte par personne.
        </p>
        <p>
          Le pseudonyme doit rester correct : sont interdits les termes injurieux,
          haineux, discriminatoires, à caractère sexuel, ainsi que l’usurpation
          d’identité. Tout pseudonyme contraire pourra être modifié ou le compte
          suspendu.
        </p>
      </Section>

      <Section title="4. Loyauté du jeu">
        <p>
          Le classement n’a de valeur que s’il est honnête. Sont interdits :
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            tromper la détection (vidéo préenregistrée, mannequin, mouvement
            simulé, tierce personne devant la caméra) ;
          </li>
          <li>
            modifier l’application ou intercepter ses échanges pour altérer un
            score ;
          </li>
          <li>
            créer plusieurs comptes pour gonfler ses statistiques ou ses gains ;
          </li>
          <li>abandonner volontairement et de façon répétée un battle en cours.</li>
        </ul>
        <p>
          Les scores et les gains sont vérifiés côté serveur. En cas de fraude
          avérée, les statistiques peuvent être réinitialisées et le compte
          suspendu sans préavis ni remboursement.
        </p>
      </Section>

      <Section title="5. SportzCoins ($SC)">
        <p>
          Les $SC sont une unité de fidélité interne, obtenue en jouant. Ils{' '}
          <strong>
            n’ont aucune valeur monétaire, ne peuvent être ni achetés, ni
            revendus, ni convertis en argent
          </strong>
          , et ne sont pas transférables entre comptes.
        </p>
        <p>
          Ils ouvrent droit à une remise plafonnée à{' '}
          {Math.round(MAX_DISCOUNT_RATIO * 100)} % du prix d’un article de la
          boutique. Ils sont perdus à la suppression du compte et peuvent être
          annulés en cas de fraude.
        </p>
      </Section>

      <Section title="6. Disponibilité">
        <p>
          Le service est fourni « en l’état ». Le fonctionnement dépend de votre
          matériel, de votre caméra, de votre navigateur et de votre connexion —
          la détection peut être imparfaite selon l’éclairage, le cadrage ou la
          tenue.
        </p>
        <p>
          Une interruption peut survenir pour maintenance ou pour une cause
          extérieure (hébergeur, réseau). L’éditeur ne garantit pas une
          disponibilité continue.
        </p>
      </Section>

      <Section title="7. Abonnements">
        <p>
          Des abonnements payants sont proposés dans la boutique. Les prix sont
          affichés en euros toutes taxes comprises. L’abonnement est mensuel et
          se renouvelle automatiquement jusqu’à résiliation.
        </p>
        <p>
          <strong>Aucun avantage payant n’influence les scores, l’XP ou le
          classement.</strong> À exercice égal, une personne abonnée et une
          personne non abonnée sont exactement à armes égales.
        </p>
        <p>
          Le paiement est traité par <strong>Stripe Payments Europe, Ltd.</strong>{' '}
          Nous ne recevons ni ne conservons vos coordonnées bancaires.
        </p>
      </Section>

      <Section title="8. Droit de rétractation">
        <p>
          Vous disposez d’un délai de quatorze jours pour vous rétracter d’un
          abonnement, sans motif, en écrivant à{' '}
          <Fill field="email">adresse e-mail de contact</Fill>.
        </p>
        <p>
          En souscrivant, vous demandez expressément que le service commence
          immédiatement et reconnaissez que{' '}
          <strong>
            votre droit de rétractation sera perdu une fois le service
            pleinement exécuté
          </strong>
          . Si vous vous rétractez avant la fin du mois entamé, la somme due sera
          calculée au prorata de la période utilisée.
        </p>
      </Section>

      <Section title="9. Résiliation">
        <p>
          Vous pouvez résilier à tout moment depuis votre page « Mon compte »,
          via le portail de gestion. La résiliation prend effet à la fin de la
          période en cours ; aucun prélèvement supplémentaire n’intervient, et
          les avantages restent actifs jusqu’à cette date.
        </p>
        <p>
          Supprimer votre compte met fin à l’abonnement pour l’avenir mais ne
          donne pas lieu au remboursement de la période entamée.
        </p>
      </Section>

      <Section title="10. Modification des conditions">
        <p>
          Les présentes conditions peuvent évoluer. En cas de modification
          substantielle affectant un abonnement en cours, vous en serez informé
          et pourrez résilier sans frais.
        </p>
      </Section>

      <Section title="11. Droit applicable">
        <p>
          Les présentes conditions sont soumises au droit français. En cas de
          litige, une solution amiable sera recherchée avant toute action
          judiciaire ; le recours à un médiateur de la consommation est possible
          dans les conditions indiquées dans les mentions légales.
        </p>
      </Section>
    </LegalPage>
  );
}
