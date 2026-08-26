/**
 * The profile a player fills in after their first sign-in.
 *
 * Split deliberately across two documents. `users/{uid}` is listable by any
 * signed-in client — that is what makes the leaderboard work — so anything
 * personal on it would be harvestable in one query. Age, weight, height, gender
 * and city therefore live in `users/{uid}/private/profile`, readable by their
 * owner alone.
 *
 * Everything except the username is optional, and the UI says so. Extracting
 * data people did not want to give produces empty fields and resentment in
 * equal measure.
 */

export type AccountType = 'player' | 'pro';

export type Experience = 'beginner' | 'intermediate' | 'advanced';

/**
 * Not `level`: that name is already taken by the XP-derived level, which the
 * rules forbid writing. Reusing it would be a silent collision.
 */
export type Goal = 'restart' | 'progress' | 'compete' | 'fun';

export type Gender = 'f' | 'm' | 'other' | 'unspecified';

/** Public — safe on a document anyone can list. */
export interface PublicOnboarding {
  accountType: AccountType;
  experience?: Experience;
  goal?: Goal;
}

/** Private — owner-only subdocument. */
export interface PrivateProfile {
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
  gender?: Gender;
  city?: string;
}

// ---------------------------------------------------------------------------
// Bounds
//
// Wide enough not to reject a real person, narrow enough that a typo or a
// hostile client cannot store nonsense. These are mirrored in firestore.rules;
// tests/onboarding.test.ts asserts the two agree.
// ---------------------------------------------------------------------------

export const BIRTH_YEAR_MIN = 1920;
/** Under-15s are out of scope: the CGU say so, and the RGPD makes it costly. */
export const BIRTH_YEAR_MAX = new Date().getFullYear() - 13;

export const HEIGHT_MIN_CM = 100;
export const HEIGHT_MAX_CM = 250;

export const WEIGHT_MIN_KG = 25;
export const WEIGHT_MAX_KG = 300;

export const CITY_MAX = 60;

export const EXPERIENCES: readonly { id: Experience; label: string }[] = [
  { id: 'beginner', label: 'Débutant' },
  { id: 'intermediate', label: 'Intermédiaire' },
  { id: 'advanced', label: 'Avancé' },
] as const;

export const GOALS: readonly { id: Goal; label: string }[] = [
  { id: 'restart', label: 'Reprendre le sport' },
  { id: 'progress', label: 'Progresser' },
  { id: 'compete', label: 'Me mesurer aux autres' },
  { id: 'fun', label: 'Me défouler' },
] as const;

export const GENDERS: readonly { id: Gender; label: string }[] = [
  { id: 'f', label: 'Femme' },
  { id: 'm', label: 'Homme' },
  { id: 'other', label: 'Autre' },
  { id: 'unspecified', label: 'Je préfère ne pas dire' },
] as const;

const ids = <T extends string>(list: readonly { id: T }[]) =>
  list.map((x) => x.id);

/** An integer inside its range, or undefined. Never throws, never coerces. */
function int(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  return rounded >= min && rounded <= max ? rounded : undefined;
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * Clean whatever the client sent into something storable.
 *
 * Drops anything out of range rather than rejecting the whole submission: a
 * mistyped weight should not cost someone their city. The server validates
 * again — this is shared by both sides so they cannot disagree.
 */
export function sanitisePrivate(raw: unknown): PrivateProfile {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;

  const out: PrivateProfile = {};

  const birthYear = int(r.birthYear, BIRTH_YEAR_MIN, BIRTH_YEAR_MAX);
  if (birthYear !== undefined) out.birthYear = birthYear;

  const heightCm = int(r.heightCm, HEIGHT_MIN_CM, HEIGHT_MAX_CM);
  if (heightCm !== undefined) out.heightCm = heightCm;

  const weightKg = int(r.weightKg, WEIGHT_MIN_KG, WEIGHT_MAX_KG);
  if (weightKg !== undefined) out.weightKg = weightKg;

  const gender = pick(r.gender, ids(GENDERS));
  if (gender !== undefined) out.gender = gender;

  if (typeof r.city === 'string') {
    const city = r.city.trim().slice(0, CITY_MAX);
    if (city) out.city = city;
  }

  return out;
}

export function sanitisePublic(raw: unknown): PublicOnboarding {
  const r = (raw ?? {}) as Record<string, unknown>;

  const out: PublicOnboarding = {
    // Anything unrecognised is a player. Becoming a pro goes through an
    // application an admin approves, so defaulting the other way would be a
    // way in.
    accountType: r.accountType === 'pro' ? 'pro' : 'player',
  };

  const experience = pick(r.experience, ids(EXPERIENCES));
  if (experience !== undefined) out.experience = experience;

  const goal = pick(r.goal, ids(GOALS));
  if (goal !== undefined) out.goal = goal;

  return out;
}

/** Age from a birth year, for display. Approximate by design — no birth date. */
export function ageFrom(birthYear: number | undefined): number | null {
  if (!birthYear) return null;
  const age = new Date().getFullYear() - birthYear;
  return age >= 0 && age <= 130 ? age : null;
}

// ---------------------------------------------------------------------------
// Pro applications
// ---------------------------------------------------------------------------

export type ProKind = 'gym' | 'coach';

export interface ProApplication {
  uid: string;
  kind: ProKind;
  /** Name of the gym, or the coach's professional name. */
  structure: string;
  city: string;
  /** What they do — free text, shown to the admin reviewing. */
  discipline: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: unknown;
}

export const STRUCTURE_MAX = 80;
export const DISCIPLINE_MAX = 120;

export interface ProApplicationInput {
  kind: ProKind;
  structure: string;
  city: string;
  discipline: string;
}

/** Null when the application is not worth storing. */
export function sanitiseApplication(raw: unknown): ProApplicationInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const structure =
    typeof r.structure === 'string' ? r.structure.trim().slice(0, STRUCTURE_MAX) : '';
  // Without a name there is nothing for an admin to identify, so this one is
  // the single required field.
  if (!structure) return null;

  return {
    kind: r.kind === 'gym' ? 'gym' : 'coach',
    structure,
    city: typeof r.city === 'string' ? r.city.trim().slice(0, CITY_MAX) : '',
    discipline:
      typeof r.discipline === 'string'
        ? r.discipline.trim().slice(0, DISCIPLINE_MAX)
        : '',
  };
}
