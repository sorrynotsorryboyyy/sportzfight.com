# Les applications mobiles

Ce document existe pour que la décision se prenne en connaissance de cause.

**Résumé : une WebView qui affiche le site sera refusée par Apple, et la
connexion Google n'y fonctionnera pas.** Ce n'est pas une question de finition —
ce sont trois blocages structurels.

Rien de tout cela ne vit dans ce dépôt : il n'y a ni Capacitor, ni dossier
`ios/`, ni `android/`. C'est un chantier séparé.

---

## Les trois blocages

### 1. Google refuse OAuth dans une WebView embarquée

Google renvoie `disallowed_useragent` et affiche sa propre page d'erreur. Cela
vise le vol d'identifiants par des applications hôtes, et **il n'y a pas de
contournement** : c'est une politique, pas un bug.

Le code a bien un repli `signInWithRedirect`
([`auth-context.tsx`](../src/lib/firebase/auth-context.tsx)), mais il se
déclenche sur `auth/popup-blocked` — or Google bloque **avant** que ce code
d'erreur soit émis. Le repli ne se déclenchera pas.

**Ce qu'il faut** : ouvrir l'authentification hors de la WebView, dans
`ASWebAuthenticationSession` (iOS) ou un Chrome Custom Tab (Android), ou passer
aux SDK natifs Google Sign-In. Du travail natif, pas une correction web.

### 2. Apple exige l'achat in-app pour les abonnements numériques

Règle 3.1.1. Les deux abonnements donnent des avantages consommés dans l'app
(badge, cadre, statistiques, historique) : ils **doivent** passer par StoreKit.
Une WebView qui ouvre Stripe Checkout est précisément le motif de rejet.

Google Play applique la même règle avec Play Billing.

**Deux issues** : implémenter les achats in-app — Apple prélève 15 à 30 % — ou
retirer la boutique du build mobile.

### 3. Apple exige « Sign in with Apple »

Règle 4.8 : dès qu'une app propose une connexion sociale tierce, elle doit
offrir une alternative respectueuse de la vie privée. Aujourd'hui Google est le
seul moyen de connexion.

---

## Les pièges caméra, qui cassent le produit

Le cœur de l'app est la caméra. En WebView, elle échoue **avant** que le code
web puisse réagir.

### iOS

- **`NSCameraUsageDescription` dans `Info.plist` est obligatoire.** Absent,
  l'app ne renvoie pas d'erreur : **elle plante**.
- `allowsInlineMediaPlayback = true` et
  `mediaTypesRequiringUserActionForPlayback = []`, sinon la vidéo passe en plein
  écran natif et masque le compteur.
- `getUserMedia` en `WKWebView` demande iOS 14.3 minimum.

### Android

- Il faut implémenter `WebChromeClient.onPermissionRequest()` et appeler
  `grant()`. **Sans ça, la caméra est refusée en silence** : le joueur voit
  « permission refusée », et changer les réglages système **n'y change rien**.
  Impasse totale, impossible à corriger depuis le web.
- La permission système `android.permission.CAMERA` doit aussi être demandée.

### Les deux

- Charger le site en **HTTPS**. `PoseEngine` vérifie `isSecureContext` : en
  `file://` ou `http://`, il refuse de démarrer.
- Le modèle MediaPipe pèse ~22 Mo et est chargé depuis `/models/…`. Vérifier
  qu'il se télécharge dans le contexte de la WebView, et prévoir le premier
  lancement sur un réseau lent.

---

## Ce que demandent les stores

- Politique de confidentialité en ligne — **faite**, `/confidentialite`.
- Déclaration d'usage de la caméra, et la fiche « Confidentialité des données »
  d'Apple.
- Captures d'écran par taille d'appareil, icône 1024×1024, description.
- Compte développeur : Apple 99 $/an, Google 25 $ une fois.
- Classification d'âge, coordonnées de support.

**Un avertissement** : Apple refuse régulièrement les applications qui ne sont
qu'un site web emballé, au titre de la règle 4.2 (« minimum functionality »). Il
faut apporter quelque chose de natif — notifications, mode hors ligne,
raccourcis — pour que le dossier tienne.

---

## Une fois publiées

Deux lignes dans
[`StoreBadges.tsx`](../src/components/landing/StoreBadges.tsx) :

```ts
const APP_STORE_URL: string | null = 'https://apps.apple.com/app/id…';
const PLAY_STORE_URL: string | null = 'https://play.google.com/store/apps/details?id=…';
```

Les badges deviennent cliquables automatiquement. Tant que les valeurs sont
`null`, ils affichent « Bientôt » et ne mènent nulle part — personne n'atterrit
sur une erreur.

---

## Une alternative honnête

La **PWA existe déjà** : [`manifest.ts`](../src/app/manifest.ts) est complet,
avec icônes et mode `standalone`. Sur Android, « Ajouter à l'écran d'accueil »
donne une icône, un lancement plein écran et la caméra qui fonctionne — sans
store, sans commission, sans validation.

Sur iOS c'est plus limité, mais l'installation depuis Safari fonctionne aussi.

Ça ne remplace pas une présence sur les stores, mais ça permet de lancer et de
mesurer l'intérêt avant d'investir des semaines dans le natif.
