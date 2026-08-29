# Activer les paiements

Le code est écrit et testé. Ce qui suit est de la configuration.

**Commence par l'étape 0 : Stripe met 1 à 3 jours ouvrés à valider un compte.**
Si tu attends la veille du lancement, c'est elle qui te bloquera.

---

## 0. Le compte Stripe

1. Créer un compte sur `dashboard.stripe.com`.
2. Renseigner l'activité, l'IBAN et les justificatifs d'identité.
3. Attendre la validation. Tu peux travailler en **mode test** pendant ce temps.

---

## 1. Les deux produits

Dans **Produits → Ajouter un produit**, deux fois :

| | Premium | Soutien |
|---|---|---|
| Nom | Premium | Soutien |
| Prix | 5,99 € | 9,99 € |
| Type | Récurrent, mensuel | Récurrent, mensuel |
| Devise | EUR | EUR |

Récupère les deux **identifiants de prix** (`price_…`), pas les identifiants de
produit (`prod_…`). C'est une confusion classique et l'erreur est silencieuse.

---

## 2. Le webhook

**Développeurs → Webhooks → Ajouter un point de terminaison.**

- URL : `https://TON-DOMAINE/api/webhook`
- Événements — **les cinq** :

```
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
checkout.session.completed
invoice.paid
```

> **`invoice.paid` n'est pas optionnel.** C'est le seul événement qui porte le
> montant payé. Sans lui, les abonnements fonctionnent, le registre `payments`
> reste vide, et **aucune commission partenaire n'est jamais calculée**. Sans
> aucun message d'erreur. `tests/webhook.test.ts` vérifie que cette liste
> correspond au code.

Copie le **secret de signature** (`whsec_…`).

---

## 3. Les variables

Sur **Vercel → Settings → Environment Variables**, en Production :

```
STRIPE_SECRET_KEY=sk_live_…
STRIPE_PRICE_PREMIUM=price_…
STRIPE_PRICE_SOUTIEN=price_…
STRIPE_WEBHOOK_SECRET=whsec_…
FIREBASE_SERVICE_ACCOUNT={"project_id":…}
NEXT_PUBLIC_SITE_URL=https://ton-domaine.com
```

> **Pas de clé publiable.** Beaucoup de tutoriels demandent une
> `pk_…` ; ce projet n'en a pas besoin et le code ne la lit nulle part. Le
> paiement passe par Stripe Checkout, une page hébergée par Stripe : la carte
> n'est jamais saisie sur sportzfight.com, donc le navigateur n'a aucune clé à
> connaître. La chercher te ferait perdre du temps.

**Les cinq premières fonctionnent ensemble ou pas du tout.** S'il en manque une,
la boutique reste en « Bientôt » et les routes répondent 503 — c'est voulu : un
tunnel à moitié configuré débiterait sans livrer.

> **`NEXT_PUBLIC_SITE_URL` est critique.** Sans elle, Stripe redirige le client
> vers `localhost:3000` **après** qu'il a donné sa carte.

Puis **redéployer** : les variables ne s'appliquent pas à chaud.

---

## 4. Tester en mode test

> **« Je peux faire un achat à 0 € pour vérifier ? »** Non, et c'est important :
> Stripe traite un montant nul comme un cas particulier et **n'émet pas
> `invoice.paid`**. Or c'est précisément l'événement qui écrit le registre
> `payments` et calcule la commission partenaire. Un test à 0 € te donnerait un
> « ça marche » qui ne prouve rien du chemin réel.
>
> Le **mode test** fait mieux : un vrai paiement de 5,99 €, toute la chaîne
> exercée, et pas un centime qui bouge. C'est ce qui suit.

Avec la clé `sk_test_` (Stripe > Développeurs > Clés API, interrupteur
**Mode test** activé en haut à droite) :

1. S'abonner avec **`4242 4242 4242 4242`**, n'importe quelle date future,
   n'importe quel CVC.
2. Vérifier dans Firestore qu'un document est apparu dans **`payments`**, avec
   `amountCents: 599` et `commissionCents` renseigné si le compte a un
   `partnerId`.
3. Vérifier sur `/compte` : badge, cadre d'avatar, statistiques détaillées.
4. Vérifier `/admin` → Aperçu : le revenu du mois a bougé.
5. Résilier depuis « Gérer mon abonnement » et vérifier que l'accès court
   jusqu'à la fin de la période.

**Cartes utiles** : `4000 0000 0000 9995` (refus), `4000 0025 0000 3155`
(3D Secure).

### Vérifier sans deviner

```
npm run check:stripe
```

Répond en clair : les cinq variables sont-elles là, le compte répond-il, les
deux prix existent-ils, le webhook est-il branché sur les cinq événements.
C'est la commande à lancer avant de chercher ailleurs.

---

## 5. Passer en réel

1. Basculer le tableau de bord en mode **Live**.
2. Recréer les deux produits — **les identifiants de prix diffèrent entre test
   et réel**.
3. Recréer le webhook sur la même URL, avec les mêmes cinq événements.
4. Remplacer les sept variables sur Vercel par les valeurs `live`.
5. Redéployer.
6. **Faire un vrai paiement de 5,99 € avec ta propre carte**, vérifier toute la
   chaîne, puis rembourser depuis Stripe.

Cette dernière étape n'est pas facultative : c'est la seule qui teste le chemin
réel de bout en bout.

---

## Si ça ne marche pas

| Symptôme | Cause probable |
|---|---|
| La boutique affiche « Bientôt » | Une des cinq variables manque. Vérifier `/api/config`. |
| Retour sur `localhost` après paiement | `NEXT_PUBLIC_SITE_URL` absente. |
| Abonnement payé mais non accordé | Regarder les tentatives du webhook dans Stripe. Le code renvoie 500 en cas de problème, donc Stripe réessaie pendant 3 jours. |
| Aucune commission partenaire | `invoice.paid` absent de la liste d'événements. |
| 503 sur `/api/checkout` | `FIREBASE_SERVICE_ACCOUNT` mal formée. |

Stripe conserve chaque tentative de webhook avec la réponse reçue :
**Développeurs → Webhooks → ton point de terminaison**. C'est le premier endroit
où regarder.
