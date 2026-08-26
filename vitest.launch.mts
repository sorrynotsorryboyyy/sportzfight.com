import { defineConfig } from 'vitest/config';

/**
 * The launch gate.
 *
 * Separate config rather than an inline env var, which does not survive the
 * jump between bash, PowerShell and CI. `npm run check:launch` sets
 * LAUNCH_CHECK, which un-skips the "legal identity is filled in" test — the one
 * that is meant to fail until src/lib/legal.ts is complete.
 */
export default defineConfig({
  test: {
    include: ['tests/legal.test.ts'],
    env: { LAUNCH_CHECK: '1' },
  },
});
