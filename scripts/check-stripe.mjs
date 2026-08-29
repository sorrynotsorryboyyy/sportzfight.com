#!/usr/bin/env node
/**
 * Is Stripe actually wired up?
 *
 * Exists because every failure in this chain looks the same from the outside:
 * the shop says "Bientôt" and nothing explains why. The five variables work as
 * a set, a price id is easily confused with a product id, and a webhook missing
 * one event fails silently for weeks — the subscription works, the ledger stays
 * empty, and no partner is ever paid.
 *
 * Read-only. Creates nothing, charges nothing, changes nothing.
 *
 *   node scripts/check-stripe.mjs
 */

import { readFileSync, existsSync } from 'node:fs';

const REQUIRED_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'checkout.session.completed',
  'invoice.paid',
];

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

/** Read .env.local without a dependency — it is a flat key=value file. */
function loadEnv() {
  const env = { ...process.env };
  if (!existsSync('.env.local')) return env;
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim();
    if (value && !env[key]) env[key] = value;
  }
  return env;
}

async function stripeGet(key, path) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const env = loadEnv();
let fatal = false;

// ---------------------------------------------------------------- variables
head('1. Les variables');

const VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_PREMIUM',
  'STRIPE_PRICE_SOUTIEN',
  'FIREBASE_SERVICE_ACCOUNT',
];

const missing = VARS.filter((v) => !env[v]);
for (const v of VARS) {
  if (env[v]) ok(v);
  else bad(`${v} — manquante`);
}

if (missing.length) {
  fatal = true;
  console.log(
    `\n  La boutique reste en « Bientôt » tant qu'il en manque une.\n` +
      `  C'est voulu : un tunnel à moitié configuré débiterait sans livrer.`,
  );
}

const key = env.STRIPE_SECRET_KEY;
const live = key?.startsWith('sk_live_');
if (key) {
  if (live) warn('Clé RÉELLE (sk_live_) — un paiement débitera vraiment.');
  else if (key.startsWith('sk_test_')) ok('Clé de test (sk_test_) — rien ne sera débité.');
  else bad('STRIPE_SECRET_KEY ne ressemble pas à une clé Stripe.');
}

if (!env.NEXT_PUBLIC_SITE_URL) {
  warn(
    'NEXT_PUBLIC_SITE_URL absente. En local c\'est normal ; ' +
      'en production le client est renvoyé vers localhost APRÈS avoir payé.',
  );
}

if (fatal || !key) {
  console.log('\nCorrige ce qui précède, puis relance.\n');
  process.exit(1);
}

// ------------------------------------------------------------------ account
head('2. Le compte');

const acct = await stripeGet(key, 'account');
if (acct.status !== 200) {
  bad(`Stripe refuse la clé (HTTP ${acct.status}). ${acct.body?.error?.message ?? ''}`);
  process.exit(1);
}
ok(`Compte ${acct.body.id}${acct.body.country ? ` (${acct.body.country})` : ''}`);

if (acct.body.charges_enabled) ok('Encaissement activé.');
else warn('Encaissement PAS encore activé — validation Stripe en cours.');

// ------------------------------------------------------------------- prices
head('3. Les deux prix');

for (const [label, id] of [
  ['Premium', env.STRIPE_PRICE_PREMIUM],
  ['Soutien', env.STRIPE_PRICE_SOUTIEN],
]) {
  if (id.startsWith('prod_')) {
    // The classic confusion, and the reason this check exists.
    bad(`${label} : c'est un identifiant de PRODUIT (prod_), il faut celui du PRIX (price_).`);
    fatal = true;
    continue;
  }
  const r = await stripeGet(key, `prices/${id}`);
  if (r.status !== 200) {
    bad(`${label} : introuvable. Vérifie que le prix existe dans le MÊME mode que la clé.`);
    fatal = true;
    continue;
  }
  const euros = (r.body.unit_amount / 100).toFixed(2).replace('.', ',');
  const rec = r.body.recurring?.interval;
  if (!rec) {
    bad(`${label} : prix unique, il faut un abonnement RÉCURRENT mensuel.`);
    fatal = true;
  } else {
    ok(`${label} : ${euros} ${r.body.currency.toUpperCase()} / ${rec}`);
  }
}

// ------------------------------------------------------------------ webhook
head('4. Le webhook');

const hooks = await stripeGet(key, 'webhook_endpoints?limit=100');
const list = hooks.body?.data ?? [];
const mine = list.filter((h) => h.url?.endsWith('/api/webhook'));

if (!mine.length) {
  bad('Aucun endpoint se terminant par /api/webhook.');
  console.log('    Stripe > Développeurs > Webhooks > Ajouter un point de terminaison.');
  fatal = true;
} else {
  for (const h of mine) {
    const events = h.enabled_events ?? [];
    const all = events.includes('*');
    const absent = all ? [] : REQUIRED_EVENTS.filter((e) => !events.includes(e));

    console.log(`  ${h.url}  [${h.status}]`);
    if (!absent.length) {
      ok('Les cinq événements sont là.');
    } else {
      for (const e of absent) bad(`Manque : ${e}`);
      if (absent.includes('invoice.paid')) {
        console.log(
          '    invoice.paid est le seul qui porte le MONTANT. Sans lui les\n' +
            '    abonnements marchent, le registre payments reste vide, et\n' +
            '    aucune commission partenaire n\'est jamais calculée.',
        );
      }
      fatal = true;
    }
  }
}

// ------------------------------------------------------------------ verdict
head('Verdict');

if (fatal) {
  console.log('  Corrige les points ✗ ci-dessus, puis relance.\n');
  process.exit(1);
}

console.log(
  live
    ? '  Prêt en mode RÉEL. Fais un vrai paiement de 5,99 € avec ta carte,\n' +
      '  vérifie toute la chaîne, puis rembourse depuis Stripe.\n'
    : '  Prêt en mode test. Abonne-toi avec la carte 4242 4242 4242 4242,\n' +
      '  n\'importe quelle date future, n\'importe quel CVC.\n' +
      '  Puis vérifie qu\'un document est apparu dans la collection payments.\n',
);
