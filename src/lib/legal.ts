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
  name: '',
  legalForm: '',
  address: '',
  siret: '',
  vat: '',
  email: '',
  publisher: '',
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
