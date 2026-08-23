import { describe, expect, it } from 'vitest';

/**
 * The admin role is typed BY HAND into the Firestore console, so the reader
 * must tolerate what a human actually pastes. A trailing newline once cost a
 * real debugging session: the field looked correct in the console but the
 * strict === 'admin' check failed and the page silently redirected.
 *
 * Mirrors isAdminRole() in src/lib/firebase/auth-context.tsx.
 */
const isAdminRole = (role: unknown): boolean =>
  typeof role === 'string' && role.trim().toLowerCase() === 'admin';

describe('admin role parsing', () => {
  it('accepts the exact value', () => {
    expect(isAdminRole('admin')).toBe(true);
  });

  it('accepts what a console paste actually produces', () => {
    for (const v of ['admin\n', ' admin', 'admin ', '\tadmin\r\n', 'Admin', 'ADMIN']) {
      expect(isAdminRole(v), JSON.stringify(v)).toBe(true);
    }
  });

  it('rejects anything that is not the admin role', () => {
    for (const v of ['', ' ', 'user', 'administrator', 'admin2', 'notadmin']) {
      expect(isAdminRole(v), JSON.stringify(v)).toBe(false);
    }
  });

  it('rejects non-strings, including truthy ones', () => {
    for (const v of [undefined, null, true, 1, {}, ['admin']]) {
      expect(isAdminRole(v), String(v)).toBe(false);
    }
  });
});
