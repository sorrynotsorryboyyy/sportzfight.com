import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BIRTH_YEAR_MAX,
  BIRTH_YEAR_MIN,
  CITY_MAX,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  ageFrom,
  sanitiseApplication,
  sanitisePrivate,
  sanitisePublic,
} from '../src/lib/profile/onboarding';
import { USERNAME_RE } from '../src/lib/utils/username';

/**
 * Everything here is optional, so the interesting cases are the ones that must
 * NOT be stored: nonsense, hostile input, and anything that would quietly
 * escalate a player into a pro.
 */

describe('optional means optional', () => {
  it('accepts an entirely empty submission', () => {
    expect(sanitisePrivate({})).toEqual({});
    expect(sanitisePrivate(undefined)).toEqual({});
    expect(sanitisePrivate(null)).toEqual({});
  });

  it('keeps the fields that are given and omits the rest', () => {
    // Absent, not null: a null would overwrite a value the user set earlier.
    const out = sanitisePrivate({ weightKg: 72 });
    expect(out).toEqual({ weightKg: 72 });
    expect('heightCm' in out).toBe(false);
  });

  it('survives a hostile payload without throwing', () => {
    for (const bad of ['string', 42, [], true, { city: { nested: 1 } }]) {
      expect(() => sanitisePrivate(bad)).not.toThrow();
    }
  });
});

describe('bounds', () => {
  it('rejects a birth year nobody alive has', () => {
    expect(sanitisePrivate({ birthYear: 1850 }).birthYear).toBeUndefined();
    expect(sanitisePrivate({ birthYear: 3000 }).birthYear).toBeUndefined();
  });

  it('rejects a birth year that would make the player a child', () => {
    // The CGU put the service out of reach of under-15s.
    expect(sanitisePrivate({ birthYear: BIRTH_YEAR_MAX + 1 }).birthYear).toBeUndefined();
    expect(sanitisePrivate({ birthYear: BIRTH_YEAR_MAX }).birthYear).toBe(BIRTH_YEAR_MAX);
  });

  it('rejects impossible heights and weights', () => {
    expect(sanitisePrivate({ heightCm: 5 }).heightCm).toBeUndefined();
    expect(sanitisePrivate({ heightCm: 400 }).heightCm).toBeUndefined();
    expect(sanitisePrivate({ weightKg: 2 }).weightKg).toBeUndefined();
    expect(sanitisePrivate({ weightKg: 900 }).weightKg).toBeUndefined();
  });

  it('accepts the boundaries themselves', () => {
    expect(sanitisePrivate({ heightCm: HEIGHT_MIN_CM }).heightCm).toBe(HEIGHT_MIN_CM);
    expect(sanitisePrivate({ heightCm: HEIGHT_MAX_CM }).heightCm).toBe(HEIGHT_MAX_CM);
    expect(sanitisePrivate({ weightKg: WEIGHT_MIN_KG }).weightKg).toBe(WEIGHT_MIN_KG);
    expect(sanitisePrivate({ weightKg: WEIGHT_MAX_KG }).weightKg).toBe(WEIGHT_MAX_KG);
    expect(sanitisePrivate({ birthYear: BIRTH_YEAR_MIN }).birthYear).toBe(BIRTH_YEAR_MIN);
  });

  it('accepts a number typed as a string, since that is what an input gives', () => {
    expect(sanitisePrivate({ weightKg: '72' }).weightKg).toBe(72);
    expect(sanitisePrivate({ heightCm: '180' }).heightCm).toBe(180);
  });

  it('rounds rather than storing a fraction', () => {
    expect(sanitisePrivate({ weightKg: 72.4 }).weightKg).toBe(72);
    expect(sanitisePrivate({ weightKg: 72.6 }).weightKg).toBe(73);
  });

  it('drops NaN and Infinity rather than writing them', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 'abc', '']) {
      expect(sanitisePrivate({ weightKg: bad }).weightKg).toBeUndefined();
    }
  });

  it('drops one bad field without losing the others', () => {
    // A mistyped weight must not cost someone their city.
    const out = sanitisePrivate({ weightKg: 9000, city: 'Lyon' });
    expect(out.weightKg).toBeUndefined();
    expect(out.city).toBe('Lyon');
  });
});

describe('city', () => {
  it('trims and caps', () => {
    expect(sanitisePrivate({ city: '  Lyon  ' }).city).toBe('Lyon');
    expect(sanitisePrivate({ city: 'x'.repeat(200) }).city).toHaveLength(CITY_MAX);
  });

  it('omits an empty city rather than storing a blank', () => {
    expect(sanitisePrivate({ city: '   ' }).city).toBeUndefined();
  });
});

describe('enumerations', () => {
  it('accepts only known values', () => {
    expect(sanitisePrivate({ gender: 'f' }).gender).toBe('f');
    expect(sanitisePrivate({ gender: 'unspecified' }).gender).toBe('unspecified');
    expect(sanitisePrivate({ gender: 'whatever' }).gender).toBeUndefined();
  });

  it('accepts only known experience and goal values', () => {
    expect(sanitisePublic({ experience: 'beginner' }).experience).toBe('beginner');
    expect(sanitisePublic({ experience: 'godlike' }).experience).toBeUndefined();
    expect(sanitisePublic({ goal: 'progress' }).goal).toBe('progress');
    expect(sanitisePublic({ goal: 'cheat' }).goal).toBeUndefined();
  });
});

describe('account type cannot be escalated', () => {
  it('defaults to player on anything unrecognised', () => {
    // Defaulting the other way would be a way into the partner programme.
    for (const bad of [undefined, null, '', 'PRO', 'admin', 1, true, {}]) {
      expect(sanitisePublic({ accountType: bad }).accountType).toBe('player');
    }
  });

  it('accepts an explicit pro, which only queues an application', () => {
    // Setting this does NOT create a partner: an admin approves separately.
    expect(sanitisePublic({ accountType: 'pro' }).accountType).toBe('pro');
  });
});

describe('experience does not collide with the XP level', () => {
  it('never emits a field called level', () => {
    // `level` is derived from xp and denied by the rules; reusing the name
    // would be a silent, hard-to-trace collision.
    const out = sanitisePublic({ experience: 'advanced', level: 42 });
    expect('level' in out).toBe(false);
    expect(out.experience).toBe('advanced');
  });
});

describe('pro applications', () => {
  it('requires a structure name', () => {
    // Without one there is nothing for an admin to identify.
    expect(sanitiseApplication({ kind: 'gym', city: 'Lyon' })).toBeNull();
    expect(sanitiseApplication({ structure: '   ' })).toBeNull();
    expect(sanitiseApplication(null)).toBeNull();
  });

  it('accepts a minimal application', () => {
    expect(sanitiseApplication({ structure: 'Salle FitPro' })).toEqual({
      kind: 'coach',
      structure: 'Salle FitPro',
      city: '',
      discipline: '',
    });
  });

  it('defaults an unknown kind to coach', () => {
    expect(sanitiseApplication({ structure: 'X', kind: 'franchise' })?.kind).toBe('coach');
  });

  it('caps every free-text field', () => {
    const out = sanitiseApplication({
      structure: 'a'.repeat(500),
      city: 'b'.repeat(500),
      discipline: 'c'.repeat(500),
    })!;
    expect(out.structure.length).toBeLessThanOrEqual(80);
    expect(out.city.length).toBeLessThanOrEqual(CITY_MAX);
    expect(out.discipline.length).toBeLessThanOrEqual(120);
  });
});

describe('age', () => {
  it('derives an age from a birth year', () => {
    const year = new Date().getFullYear();
    expect(ageFrom(year - 30)).toBe(30);
  });

  it('returns null when unknown', () => {
    expect(ageFrom(undefined)).toBeNull();
  });
});

describe('the contract with firestore.rules', () => {
  // These bounds are written twice — once here, once in the rules. A drift
  // does not throw: it silently denies every onboarding write.
  const RULES = readFileSync('firestore.rules', 'utf8');

  function ruleValue(fn: string): number {
    const m = RULES.match(
      new RegExp(`function\\s+${fn}\\s*\\(\\)\\s*\\{\\s*return\\s+(-?\\d+)\\s*;`),
    );
    if (!m) throw new Error(`rules helper ${fn}() not found in firestore.rules`);
    return Number(m[1]);
  }

  it.each([
    ['birthYearMin', BIRTH_YEAR_MIN],
    ['heightMinCm', HEIGHT_MIN_CM],
    ['heightMaxCm', HEIGHT_MAX_CM],
    ['weightMinKg', WEIGHT_MIN_KG],
    ['weightMaxKg', WEIGHT_MAX_KG],
    ['cityMax', CITY_MAX],
  ])('%s() matches its TS twin', (fn, value) => {
    expect(ruleValue(fn)).toBe(value);
  });

  it('mirrors the username pattern exactly', () => {
    // Duplicated between username.ts and the rules, and previously unguarded.
    const m = RULES.match(/function validUsername\(name\)[\s\S]*?matches\('([^']+)'\)/);
    if (!m) throw new Error('validUsername() not found in firestore.rules');
    expect(m[1]).toBe(USERNAME_RE.source);
  });
});
