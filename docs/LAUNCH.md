# Liste de lancement

Dans l'ordre. Les étapes marquées **⚠** sont celles dont l'oubli casse quelque
chose en silence.

---

## Avant tout — parce que ça prend du temps

- [ ] **Compte Stripe** créé et en validation. Compter 1 à 3 jours ouvrés.
      Voir [STRIPE.md](./STRIPE.md).
- [ ] **Médiateur de la consommation** : adhésion obligatoire dès l'encaissement.
      Compter 50 à 100 €/an, et un délai d'inscription.
- [ ] **Structure déclarée** (micro-entreprise suffit) avec un SIRET.

---

## 1. Identité légale

- [ ] Remplir les huit champs de [`src/lib/legal.ts`](../src/lib/legal.ts).
- [ ] `npm run check:launch` doit passer. **Il échoue tant qu'un champ est
      vide** — c'est sa raison d'être.
- [ ] Relire `/mentions-legales`, `/confidentialite`, `/cgu` : plus aucun
      encadré rouge.

## 2. Configuration

- [ ] **⚠ `NEXT_PUBLIC_SITE_URL`** sur Vercel. Sans elle, un client qui paie est
      renvoyé vers `localhost:3000` **après** avoir donné sa carte.
- [ ] `FIREBASE_SERVICE_ACCOUNT` sur Vercel — voir
      `node scripts/add-service-account.mjs`.
- [ ] Les cinq variables Stripe, en mode réel.
- [ ] `NEXT_PUBLIC_SENTRY_DSN`, pour savoir quand quelque chose casse.
- [ ] **⚠ Le domaine dans Firebase → Authentication → Domaines autorisés.**
      Sinon la connexion Google échoue en production, et seulement là.
- [ ] Redéployer : les variables ne s'appliquent pas à chaud.

## 3. Base de données

- [ ] **⚠ `npm run deploy:rules`.** Vercel ne le fait pas. Sans les index, le
      matchmaking ne trouve personne — et l'erreur est avalée.
- [ ] Vérifier dans la console Firebase que chaque index est **Enabled**, pas
      *Building*.
- [ ] Firebase en plan **Blaze** (le compte de service l'exige).

## 4. Vérifications automatiques

- [ ] `npm run lint && npm run typecheck && npm run build`
- [ ] `npm run test:all` — 469 attendus
- [ ] `npm run check:launch`

## 5. Vérifications humaines

Aucun test ne les remplace.

- [ ] **Un vrai paiement de 5,99 €** avec ta carte, en mode réel. Vérifier :
      document `payments` créé, badge visible, cadre d'avatar, statistiques
      détaillées, résiliation possible. Puis rembourser.
- [ ] **Une vraie inscription Google** avec un compte neuf : l'écran de
      bienvenue s'affiche, « Passer » fonctionne, et il ne revient pas.
- [ ] **La caméra sur ton téléphone**, pas seulement sur l'ordinateur. Faire dix
      pompes et vérifier le comptage.
- [ ] **Un battle à deux appareils**, pour voir le décompte synchronisé.
- [ ] **Relire `/boutique` ligne à ligne** : chaque avantage listé doit exister.
- [ ] **Parcourir le site au clavier seul** : chaque élément doit montrer un
      anneau de focus.
- [ ] Regarder le site à 375 px et en grand écran.

## 6. Partage et référencement

- [ ] Coller l'URL dans WhatsApp ou Discord : l'aperçu doit s'afficher.
- [ ] `/robots.txt` et `/sitemap.xml` répondent et citent le bon domaine.
- [ ] Déclencher une erreur volontaire et la voir arriver dans Sentry.

---

## Après l'ouverture

- [ ] Surveiller Sentry les premiers jours — c'est là que remontent les
      incompatibilités de caméra propres à certains téléphones.
- [ ] Surveiller les tentatives de webhook dans Stripe : aucune ne doit rester
      en échec.
- [ ] Vérifier que les statistiques de `/admin` correspondent au tableau de bord
      Stripe.

## Ce qui n'est pas prêt, et pourquoi

- **Les applications mobiles** — trois blocages Apple/Google structurels. Voir
  [MOBILE.md](./MOBILE.md). La PWA fonctionne dès maintenant en attendant.
- **Abdos, burpees, tractions** — pas de détecteur. Un lot chacun.
- **Le merch** — ni stock, ni fournisseur, ni expédition.
- **Le versement automatique aux partenaires** — Stripe Connect, un lot entier.
  Aujourd'hui tu vires à la main et tu l'enregistres dans `/admin`.
