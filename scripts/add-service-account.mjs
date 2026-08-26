#!/usr/bin/env node
/**
 * Turn a downloaded Firebase service-account JSON into the single .env.local
 * line the Admin SDK needs.
 *
 *   node scripts/add-service-account.mjs ~/Downloads/sportzfight-xxxx.json
 *
 * Doing this by hand is where it goes wrong: the file is ~15 lines and the
 * private_key contains real newlines, but a .env value must be one line. This
 * re-serialises the JSON compactly, which escapes those newlines as \n.
 *
 * The key file itself is never copied into the repo — only the env line, and
 * .env.local is gitignored.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV = resolve(process.cwd(), '.env.local');
const VAR = 'FIREBASE_SERVICE_ACCOUNT';

function die(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

const input = process.argv[2];
if (!input) {
  die(
    'Indique le chemin du fichier JSON :\n' +
      '    node scripts/add-service-account.mjs "C:/Users/toi/Downloads/xxx.json"',
  );
}

const path = resolve(input.replace(/^["']|["']$/g, ''));
if (!existsSync(path)) die(`Fichier introuvable : ${path}`);

let sa;
try {
  sa = JSON.parse(readFileSync(path, 'utf8'));
} catch {
  die('Ce fichier n’est pas du JSON valide. Retélécharge la clé.');
}

// Validate before writing: a silently wrong value produces an opaque 503 later.
if (sa.type !== 'service_account') {
  die(
    'Ce JSON n’est pas un compte de service.\n' +
      '    Console Firebase → Paramètres du projet → Comptes de service\n' +
      '    → Générer une nouvelle clé privée.',
  );
}
for (const field of ['project_id', 'client_email', 'private_key']) {
  if (typeof sa[field] !== 'string' || !sa[field]) {
    die(`Le champ "${field}" est absent du JSON.`);
  }
}
if (!sa.private_key.includes('BEGIN PRIVATE KEY')) {
  die('La clé privée est malformée (pas de en-tête PEM).');
}

// Warn rather than block: a mismatch is usually the wrong project, but it can
// legitimately differ if you renamed things.
const publicId = existsSync(ENV)
  ? (readFileSync(ENV, 'utf8').match(/^NEXT_PUBLIC_FIREBASE_PROJECT_ID=(.+)$/m)?.[1] ?? '')
      .trim()
  : '';
if (publicId && publicId !== sa.project_id) {
  console.warn(
    `\n  ! Attention : le JSON est pour le projet "${sa.project_id}"\n` +
      `    alors que .env.local pointe sur "${publicId}".\n` +
      '    Vérifie que c’est bien voulu.',
  );
}

// One line. JSON.stringify escapes the newlines inside private_key for us.
const line = `${VAR}=${JSON.stringify(sa)}`;

let env = existsSync(ENV) ? readFileSync(ENV, 'utf8') : '';
if (existsSync(ENV)) copyFileSync(ENV, `${ENV}.bak`);

if (new RegExp(`^${VAR}=`, 'm').test(env)) {
  env = env.replace(new RegExp(`^${VAR}=.*$`, 'm'), line);
  console.log(`\n  ✓ ${VAR} remplacée dans .env.local`);
} else {
  if (env && !env.endsWith('\n')) env += '\n';
  env += `\n# Clé privée du compte de service. NE JAMAIS committer ce fichier.\n${line}\n`;
  console.log(`\n  ✓ ${VAR} ajoutée à .env.local`);
}

writeFileSync(ENV, env, 'utf8');

console.log(`    projet : ${sa.project_id}`);
console.log(`    compte : ${sa.client_email}`);
console.log('\n  Redémarre le serveur (Ctrl+C puis npm run dev), puis /admin.');
console.log('  Pense à supprimer le fichier JSON téléchargé.\n');
