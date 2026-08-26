import type { Metadata } from 'next';
import { Fill, LegalPage, Section } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Quelles données SportzFight traite, pourquoi, combien de temps, et vos droits. La caméra est traitée localement : aucune image ne quitte votre appareil.',
  robots: { index: true, follow: true },
};

/** A row of the processing table. */
function Row({
  what,
  why,
  basis,
  keep,
}: {
  what: string;
  why: string;
  basis: string;
  keep: string;
}) {
  return (
    <tr className="border-t border-ink-800 align-top">
      <td className="py-2.5 pr-3 font-semibold text-ink-100">{what}</td>
      <td className="py-2.5 pr-3">{why}</td>
      <td className="py-2.5 pr-3">{basis}</td>
      <td className="py-2.5">{keep}</td>
    </tr>
  );
}

export default function Confidentialite() {
  return (
    <LegalPage title="Politique de confidentialité" updated="2026-08-26">
      <Section title="L’essentiel">
        <div className="rounded-2xl border border-cyan-glow/25 bg-cyan-glow/5 p-4">
          <p className="font-bold text-cyan-glow">
            Votre caméra ne nous envoie rien.
          </p>
          <p className="mt-1.5">
            La reconnaissance des mouvements s’exécute entièrement dans votre
            navigateur. Aucune image, aucune vidéo, aucun enregistrement n’est
            transmis, ni à nous ni à personne. Seul le <em>nombre</em> de
            répétitions est enregistré, comme un score.
          </p>
        </div>
        <p>
          Nous ne faisons ni publicité, ni profilage, ni revente de données. Le
          site n’utilise aucun outil de mesure d’audience ni aucun traceur
          publicitaire.
        </p>
      </Section>

      <Section title="1. Responsable du traitement">
        <p>
          Le responsable du traitement est <Fill>nom ou raison sociale</Fill>,
          joignable à <Fill>adresse e-mail de contact</Fill>. Les informations
          d’identification complètes figurent dans les{' '}
          <a
            href="/mentions-legales"
            className="font-semibold text-volt-500 hover:underline"
          >
            mentions légales
          </a>
          .
        </p>
      </Section>

      <Section title="2. Données traitées">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead>
              <tr className="text-3xs uppercase tracking-widest text-ink-500">
                <th className="pb-2 pr-3 font-bold">Donnée</th>
                <th className="pb-2 pr-3 font-bold">Finalité</th>
                <th className="pb-2 pr-3 font-bold">Base légale</th>
                <th className="pb-2 font-bold">Conservation</th>
              </tr>
            </thead>
            <tbody>
              <Row
                what="Identifiant de compte, adresse e-mail, nom et photo Google"
                why="Créer et sécuriser votre compte via la connexion Google"
                basis="Exécution du contrat (les CGU)"
                keep="Jusqu’à la suppression du compte"
              />
              <Row
                what="Pseudonyme et avatar"
                why="Vous identifier auprès de votre adversaire et au classement"
                basis="Exécution du contrat"
                keep="Jusqu’à la suppression du compte"
              />
              <Row
                what="Statistiques : victoires, défaites, répétitions, XP, $SC, série"
                why="Progression, classement mondial, bonus de fidélité"
                basis="Exécution du contrat"
                keep="Jusqu’à la suppression du compte"
              />
              <Row
                what="Historique des battles : scores, horodatages, adversaire"
                why="Afficher vos résultats et arbitrer le vainqueur"
                basis="Exécution du contrat"
                keep="Jusqu’à la suppression du compte"
              />
              <Row
                what="Journaux techniques (adresse IP, horodatage)"
                why="Sécurité, prévention des abus, fonctionnement du service"
                basis="Intérêt légitime"
                keep="Selon la politique de l’hébergeur Vercel"
              />
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-500">
          Nous ne traitons aucune donnée de santé. Le nombre de répétitions est
          un score de jeu, pas une mesure médicale.
        </p>
      </Section>

      <Section title="3. La caméra">
        <p>
          L’accès à la caméra est demandé pour compter vos répétitions. Le flux
          est analysé <strong>localement</strong> par un modèle de détection de
          posture téléchargé dans votre navigateur.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Aucune image n’est enregistrée, même temporairement, sur un serveur.</li>
          <li>Aucune image n’est transmise à votre adversaire.</li>
          <li>
            Les points de posture détectés servent uniquement à incrémenter un
            compteur, et sont oubliés image après image.
          </li>
          <li>
            Vous pouvez refuser ou révoquer l’accès à la caméra à tout moment
            dans votre navigateur ; le battle devient alors impossible, mais le
            reste du site fonctionne.
          </li>
        </ul>
      </Section>

      <Section title="4. Ce qui est visible par les autres">
        <p>
          Pour qu’un classement existe, certaines informations sont publiques
          auprès des personnes connectées :{' '}
          <strong>
            votre pseudonyme, votre avatar, vos statistiques et votre position
          </strong>
          .
        </p>
        <p>
          Votre adresse e-mail n’est <strong>jamais</strong> visible par les
          autres personnes : elle est stockée séparément, accessible à vous seul.
          Choisissez un pseudonyme qui ne vous identifie pas si vous préférez
          rester anonyme — il est modifiable depuis votre compte.
        </p>
      </Section>

      <Section title="5. Destinataires et sous-traitants">
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Google Ireland Limited</strong> (Firebase) — authentification
            et base de données. La connexion via Google implique un échange de
            données avec Google, régi par sa propre politique de confidentialité.
          </li>
          <li>
            <strong>Vercel Inc.</strong> — hébergement du site. Transfert hors
            UE encadré par les clauses contractuelles types de la Commission
            européenne.
          </li>
        </ul>
        <p>
          Votre photo de profil Google est chargée depuis les serveurs de Google
          par votre navigateur lorsqu’elle s’affiche.
        </p>
        <p>
          Nous ne vendons ni ne louons vos données. Nous ne les transmettons à
          aucun annonceur.
        </p>
      </Section>

      <Section title="6. Cookies et stockage local">
        <p>
          Le site <strong>ne dépose aucun cookie publicitaire ni de mesure
          d’audience</strong>. Aucune bannière de consentement n’est donc
          nécessaire.
        </p>
        <p>
          Firebase conserve votre session de connexion dans le stockage local de
          votre navigateur (IndexedDB). Ce stockage est strictement nécessaire au
          fonctionnement du service : sans lui, vous seriez déconnecté à chaque
          rechargement. Vous pouvez l’effacer en vous déconnectant ou en vidant
          les données du site.
        </p>
        <p>
          La police de caractères est hébergée par nos soins : aucune requête
          n’est adressée à Google Fonts.
        </p>
      </Section>

      <Section title="7. Vos droits">
        <p>
          Vous disposez des droits d’accès, de rectification, d’effacement, de
          limitation, d’opposition et de portabilité prévus par le RGPD.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Rectification</strong> — votre pseudonyme se modifie
            directement depuis la page « Mon compte ».
          </li>
          <li>
            <strong>Effacement</strong> — écrivez à{' '}
            <Fill>adresse e-mail de contact</Fill> ; votre compte et vos données
            seront supprimés sous 30 jours. Les battles auxquels vous avez
            participé sont conservés de façon anonymisée, car ils concernent
            aussi votre adversaire.
          </li>
          <li>
            <strong>Accès et portabilité</strong> — sur simple demande à la même
            adresse.
          </li>
        </ul>
        <p>
          Vous pouvez introduire une réclamation auprès de la CNIL —{' '}
          <em>cnil.fr</em>, 3 place de Fontenoy, 75007 Paris.
        </p>
      </Section>

      <Section title="8. Mineurs">
        <p>
          Le service n’est pas destiné aux personnes de moins de 15 ans. En cas
          d’inscription d’un mineur de moins de 15 ans sans le consentement du
          titulaire de l’autorité parentale, le compte sera supprimé sur
          signalement.
        </p>
      </Section>

      <Section title="9. Modification">
        <p>
          Cette politique peut évoluer. La date de dernière mise à jour figure en
          haut de page ; en cas de changement substantiel, vous en serez informé
          dans l’application.
        </p>
      </Section>
    </LegalPage>
  );
}
