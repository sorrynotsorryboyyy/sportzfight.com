/**
 * The operator's identity, in one place.
 *
 * Fourteen [À COMPLÉTER] markers were spread across three legal pages, all of
 * them asking for one of five facts. Filling them in page by page is how a site
 * goes live still claiming to be published by "[Nom]" on one page having been
 * fixed on another.
 *
 * FILL THESE IN BEFORE LAUNCH. tests/legal.test.ts fails while any is empty,
 * so a half-filled form cannot ship.
 */

export interface LegalIdentity {
  /** Legal name or company name. */
  name: string;
  /** Micro-entreprise, SASU, SARL… */
  legalForm: string;
  /** Full registered address, one line. */
  address: string;
  /** SIRET number. */
  siret: string;
  /** Intra-EU VAT number, or the franchise-en-base wording. */
  vat: string;
  /** Contact address, used for GDPR requests and the right of withdrawal. */
  email: string;
  /** Publication director — usually the same person. */
  publisher: string;
  /**
   * Consumer mediator. Legally required from the moment you take payment, and
   * you must be registered with one — expect €50-100 a year.
   */
  mediator: string;
}

export const LEGAL: LegalIdentity = {
  // Ex. 'Léo Chèche' pour une micro-entreprise (ton nom, pas un nom commercial),
  // ou 'SPORTZFIGHT SAS' pour une société.
  name: '',

  // Ex. 'Entrepreneur individuel' (micro-entreprise) — ou 'SASU au capital de
  // 1 000 €'. Le régime micro s'écrit 'Entrepreneur individuel' depuis 2022.
  legalForm: '',

  // Adresse de déclaration, sur une ligne. Ex. '12 rue des Sports, 69003 Lyon'.
  // C'est celle de l'INSEE : à domicile pour une micro-entreprise, ce qui est
  // normal et obligatoire à publier.
  address: '',

  // 14 chiffres, tel que sur ton avis de situation INSEE. Ex. '123 456 789 00012'.
  siret: '',

  // En franchise en base (cas d'une micro sous les seuils), écris exactement :
  // 'TVA non applicable, article 293 B du CGI'
  // Sinon, ton numéro intracommunautaire. Ex. 'FR12345678901'.
  vat: '',

  // Adresse de contact publique. Sert aux demandes RGPD et au droit de
  // rétractation, donc elle doit être relevée. Ex. 'contact@sportzfight.com'.
  email: '',

  // Directeur de la publication — toi, dans la quasi-totalité des cas.
  publisher: '',

  // Ton médiateur de la consommation, une fois l'adhésion faite.
  // Format attendu : nom + adresse postale + site.
  // Ex. 'CNPM - MÉDIATION DE LA CONSOMMATION, 27 avenue de la Libération,
  //      42400 Saint-Chamond — cnpm-mediation-consommation.eu'
  mediator: '',
};

/** Everything filled in? Drives the launch guard. */
export const legalComplete = (): boolean =>
  Object.values(LEGAL).every((v) => v.trim().length > 0);

/** The fields still missing, for the test's failure message. */
export const missingLegalFields = (): string[] =>
  Object.entries(LEGAL)
    .filter(([, v]) => !v.trim())
    .map(([k]) => k);
