/**
 * Username rules: unique, plain characters, no profanity.
 *
 * The charset below is ALSO enforced in firestore.rules via matches(), so it is
 * a real server-side guarantee. Uniqueness is enforced by the usernames/{key}
 * lock collection.
 *
 * The profanity list is NOT. Security rules cannot practically hold a wordlist,
 * so filtering here is a UX guard that a modified client can bypass. Treat it
 * as "keeps honest people from picking something stupid", not as moderation.
 */

/** Must start with a letter; letters, digits and underscore after. 3-16 total. */
export const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,15}$/;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;

/**
 * Base list, matched against the name with separators stripped so `f_u_c_k`
 * does not slip through. Kept short and obvious on purpose — an arms race
 * belongs on a server, not in a bundle every client can read.
 */
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'rape',
  'nazi', 'hitler', 'putain', 'connard', 'salope', 'enculé', 'encule',
  'pute', 'merde', 'batard', 'bâtard', 'pd', 'nique', 'admin', 'sportzfight',
  'moderator', 'modo', 'support', 'staff',
];

/** The document id used for the uniqueness lock. Case-insensitive by design. */
export const usernameKey = (name: string) => name.trim().toLowerCase();

/**
 * Turn an arbitrary display name into something the charset accepts.
 *
 * Google gives us names like "Léo Chevalier" — accents and a space, both
 * illegal. Stripping diacritics rather than dropping the letters keeps the
 * result recognisable: "Léo Chevalier" becomes "LeoChevalier", not "Lo".
 */
export function sanitizeToUsername(raw: string): string {
  const base = (raw ?? '')
    .normalize('NFD')                 // split "é" into "e" + combining accent
    .replace(/[̀-ͯ]/g, '') // drop the combining accents
    .replace(/[^a-zA-Z0-9_]/g, '')    // drop spaces, punctuation, emoji
    .replace(/^[^a-zA-Z]+/, '')       // must start with a letter
    .slice(0, USERNAME_MAX);

  return base.length >= USERNAME_MIN ? base : 'Athlete';
}

export type UsernameProblem =
  | 'too-short'
  | 'too-long'
  | 'bad-start'
  | 'bad-chars'
  | 'profanity';

export const USERNAME_MESSAGES: Record<UsernameProblem, string> = {
  'too-short': `Au moins ${USERNAME_MIN} caractères.`,
  'too-long': `${USERNAME_MAX} caractères maximum.`,
  'bad-start': 'Doit commencer par une lettre.',
  'bad-chars': 'Lettres, chiffres et _ uniquement (pas d’espace ni d’accent).',
  profanity: 'Ce pseudo n’est pas autorisé.',
};

function containsProfanity(name: string): boolean {
  // Strip separators so f_u_c_k and f0ck-style spacing still match.
  const flat = name.toLowerCase().replace(/[_\d]/g, '');
  return BLOCKED.some((w) => flat.includes(w.toLowerCase()));
}

/** null when the name is acceptable, otherwise the first problem found. */
export function validateUsername(name: string): UsernameProblem | null {
  const n = (name ?? '').trim();

  if (n.length < USERNAME_MIN) return 'too-short';
  if (n.length > USERNAME_MAX) return 'too-long';
  if (!/^[a-zA-Z]/.test(n)) return 'bad-start';
  if (!USERNAME_RE.test(n)) return 'bad-chars';
  if (containsProfanity(n)) return 'profanity';

  return null;
}

/**
 * True when a stored username predates the charset rule and must be replaced.
 * Drives the forced-rename flow for accounts seeded from a Google display name.
 */
export const needsUsernameFix = (stored: string | null | undefined): boolean =>
  !!stored && !USERNAME_RE.test(stored);
