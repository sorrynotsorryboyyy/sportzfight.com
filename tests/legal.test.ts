import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEGAL, legalComplete, missingLegalFields } from '../src/lib/legal';

/**
 * The guard that stops the site going live claiming to be published by "[Nom]".
 *
 * The identity test is expected to FAIL until the operator fills LEGAL in. That
 * is the point: it is a launch checklist item that cannot be forgotten, not a
 * regression test.
 */

describe('operator identity', () => {
  /**
   * Run by `npm run check:launch`, not by the ordinary suite.
   *
   * It is EXPECTED to fail until src/lib/legal.ts is filled in, so making it
   * part of `npm test` would mean living with a permanently red suite — which
   * teaches everyone to ignore red. It is a launch gate, deliberately separate.
   */
  const gate = process.env.LAUNCH_CHECK === '1' ? it : it.skip;

  gate('is filled in before launch', () => {
    // French law requires mentions légales naming the publisher; the GDPR
    // requires a named controller with a working address.
    expect(
      legalComplete(),
      `Champs légaux manquants dans src/lib/legal.ts : ${missingLegalFields().join(', ')}`,
    ).toBe(true);
  });

  it('reports precisely which fields are missing', () => {
    // The gate above is skipped day to day, so this keeps the reporting itself
    // honest: a helper that always returned [] would hide everything.
    const missing = missingLegalFields();
    const empty = Object.entries(LEGAL).filter(([, v]) => !v.trim()).length;
    expect(missing).toHaveLength(empty);
    expect(legalComplete()).toBe(empty === 0);
  });

  it('uses a plausible contact address', () => {
    if (!LEGAL.email.trim()) return; // Covered by the test above.
    expect(LEGAL.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });

  it('uses a SIRET of the right length', () => {
    if (!LEGAL.siret.trim()) return;
    // 14 digits, spaces tolerated.
    expect(LEGAL.siret.replace(/\s/g, '')).toMatch(/^\d{14}$/);
  });
});

describe('the legal pages', () => {
  const PAGES = [
    'src/app/mentions-legales/page.tsx',
    'src/app/confidentialite/page.tsx',
    'src/app/cgu/page.tsx',
  ];

  it('never hardcode an identity next to the constant', () => {
    // Two sources of truth is how one page gets updated and another does not.
    for (const page of PAGES) {
      const src = readFileSync(page, 'utf8');
      expect(src, `${page} still hardcodes a SIRET`).not.toMatch(/\d{14}/);
    }
  });

  it('draw every placeholder from the shared constant', () => {
    for (const page of PAGES) {
      const src = readFileSync(page, 'utf8');
      // A <Fill> with no field would render the marker forever, whatever
      // LEGAL contains.
      const bare = src.match(/<Fill>(?!\s*field)/g);
      expect(bare, `${page} has a <Fill> with no field`).toBeNull();
    }
  });

  it('all exist and are reachable from the footer', () => {
    const footer = readFileSync('src/components/ui/Footer.tsx', 'utf8');
    for (const route of ['/mentions-legales', '/confidentialite', '/cgu']) {
      expect(footer, `${route} is not linked from the footer`).toContain(route);
    }
  });
});

describe('the launch checklist itself', () => {
  it('lists every test file in the fast suite', () => {
    // `npm test` enumerated six files by hand and silently skipped nine —
    // including subscriptions, commissions and the squat detector, which is
    // exactly where the launch risk sits.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const script = pkg.scripts.test ?? '';

    const emulatorBacked = ['rules.test.ts', 'matchmaking.test.ts', 'e2e-flow.test.ts'];
    const pure = readdirSync('tests')
      .filter((f) => f.endsWith('.test.ts'))
      .filter((f) => !emulatorBacked.includes(f));

    for (const file of pure) {
      expect(
        script.includes(file) || script.includes('tests/'),
        `${file} is not covered by "npm test"`,
      ).toBe(true);
    }
  });
});
