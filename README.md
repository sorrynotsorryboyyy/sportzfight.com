# SportzFight

Défis sportifs en **1vs1**. V1 : **un max de pompes en 60 secondes**, comptées
automatiquement par la caméra, directement dans le navigateur.

> Connexion Google → Rechercher un battle → Matchmaking aléatoire → Caméra →
> 3·2·1·GO → 60 secondes → Comptage → Résultat → Victoire

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Firebase 12
(Auth + Firestore) · MediaPipe Pose Landmarker · déployable sur Vercel.

Il n'y a **aucun code serveur** : pas de Cloud Functions, pas d'API routes. Tout
passe par le client et les Firestore Security Rules, ce qui permet de rester sur
le plan gratuit (Spark).

---

## Démarrage rapide

```bash
npm install          # installe + prépare le runtime MediaPipe dans public/
cp .env.local.example .env.local
# renseigne les NEXT_PUBLIC_FIREBASE_* de ton projet
npm run dev
```

La connexion se fait **uniquement via Google**. Côté Firebase il faut :

1. **Authentication → Sign-in method → Google** activé
2. **Authentication → Settings → Authorized domains** doit contenir
   `localhost` (présent par défaut) et ton domaine Vercel
3. Les règles déployées : `npm run deploy:rules`

Sans configuration, l'app affiche un écran d'aide plutôt qu'une erreur opaque.

### Variante — émulateurs Firebase (hors-ligne, sans projet cloud)

```bash
npm run emu    # terminal 1 — Auth + Firestore locaux (nécessite Java)
npm run dev    # terminal 2
```

avec dans `.env.local` :

```
NEXT_PUBLIC_FIREBASE_EMULATORS=true
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-sportzfight
```

L'émulateur Auth propose un faux sélecteur de compte Google. Pratique pour
tester le parcours à deux joueurs sans toucher aux vraies données.

### Assets MediaPipe

Le WASM (~22 Mo) et le modèle de pose (5,8 Mo) ne sont **pas versionnés** : ils
sont générés par `scripts/setup-mediapipe.mjs` au `npm install`, donc toujours
alignés sur la version de `@mediapipe/tasks-vision`. Pour les regénérer à la
main : `npm run setup:mediapipe`.

---

## Tests

```bash
npm run test        # logique pure : machine à états, détecteur, score sync (56)
npm run test:rules  # règles de sécurité contre l'émulateur (68)
npm run test:mm     # courses de matchmaking, 2 et 4 joueurs simultanés (5)
npm run test:e2e    # parcours complet, vraie bataille de 60 s (9)
npm run test:all    # tout (139), émulateurs lancés automatiquement
npm run lint && npm run typecheck
```

---

## Comment ça marche

### Le résultat n'est jamais décidé par le client

Sans serveur, ce sont les **Security Rules** qui arbitrent
([`firestore.rules`](firestore.rules)) :

- **Chacun n'écrit que son propre score** — `player1` ne peut pas toucher
  `player2Score`, et inversement.
- **Les scores sont monotones, plafonnés (200) et limités par écriture** — on ne
  peut ni sauter à 200 ni saboter le score adverse en le baissant.
- **Le gagnant est recalculé par la règle** à partir des scores enregistrés. Un
  client qui annonce un autre gagnant est refusé : on ne peut pas se déclarer
  vainqueur d'un match perdu.
- **La fin est verrouillée par l'horloge serveur** (`request.time`) — impossible
  de terminer en avance pour figer une avance.
- **Un troisième joueur ne peut pas entrer** : la jointure est un
  compare-and-swap évalué au moment du commit, donc deux arrivants simultanés
  sont sérialisés et le second est rejeté.
- **Les heartbeats ne peuvent pas être falsifiés** : le matchmaking classe les
  battles par fraîcheur, donc un client capable d'écrire une date arbitraire
  pourrait maintenir un battle mort en haut de la file. Chaque chemin
  d'écriture impose `== request.time`.

### Deux joueurs, une seule horloge

Tout découle d'un unique `startedAt` écrit par le serveur. Chaque client mesure
son décalage d'horloge :

```
offset      = serverCommitMs − (tAvant + (tAprès − tAvant) / 2)
serverNow() = Date.now() + offset
```

L'estimateur principal est gratuit : quand un client écrit `serverTimestamp()`,
`onSnapshot` se déclenche une fois en attente puis une fois résolu, ce qui
encadre le commit. L'offset est **gelé** au passage en `live` et le tick se fait
sur `performance.now()`, donc une correction NTP en pleine bataille ne peut pas
faire reculer le chrono.

Le décompte est identique des deux côtés **par construction** : `deriveView(doc,
serverNow())` est une fonction pure, sans état local ni échange de messages.

### Compter des vraies pompes

Un compteur naïf sur l'angle du coude se fait berner en agitant les bras assis.
Quatre garde-fous indépendants
([`pushup.ts`](src/lib/exercise/detectors/pushup.ts)) :

1. **Hystérésis à quatre seuils** (160/150 en haut, 95/110 en bas) — les zones
   mortes absorbent le bruit, principale cause de double comptage.
2. **Amplitude minimale** de 55° sur la répétition.
3. **Alignement du tronc** — l'écart signé de la hanche à la ligne
   épaules→chevilles distingue le dos creusé du bassin trop haut (un angle non
   signé, borné à 180°, en serait incapable).
4. **Horizontalité du corps** — c'est ce test qui rend le faux mouvement assis
   impossible : la ligne épaules→chevilles doit rester à moins de 35° de
   l'horizontale.

S'y ajoutent une durée minimale par répétition, un anti-rebond et un seuil de
visibilité avec quelques images de tolérance.

**La vidéo ne quitte jamais l'appareil** : seul le compteur est écrit dans
Firestore, au maximum une fois toutes les 1,5 s (jamais à la fréquence d'image).

La caméra est **obligatoire** : sans elle il n'y a pas de comptage vérifiable,
donc pas de battle. `ManualDetector` reste dans le code comme point d'extension
de l'interface, mais n'est plus atteignable depuis l'UI.

### `/admin` — banc de réglage

Page protégée par `users/{uid}.role === 'admin'`, à mettre **à la main dans la
console Firestore**. Elle affiche en direct ce que le détecteur mesure (angle
du coude, inclinaison, écart de bassin, visibilité) et des curseurs sur les
seuils, pour les régler face à une vraie caméra.

⚠️ **Ce n'est pas une frontière de sécurité.** Sans Cloud Functions il n'y a pas
de custom claims : `role` n'atteint jamais `request.auth.token` et **aucune
règle ne peut le voir**. La redirection est côté client et contournable. La
page ne contient donc que ce qu'un utilisateur connecté a déjà le droit de
faire — aucune modification de score, aucune suppression.

---

### Matchmaking

Une seule porte d'entrée : **Rechercher un battle**. Pas de code à partager.

Firestore n'a pas de « trouver et réserver » atomique entre documents, mais la
règle `validJoin` en est un au niveau d'un document. L'algorithme
([`matchmaking.ts`](src/lib/firebase/matchmaking.ts)) :

1. chercher un battle en attente et tenter de le réserver ;
2. sinon en créer un, puis **rechercher à nouveau** — c'est ce qui évite que
   deux personnes cliquant en même temps attendent chacune dans leur coin ;
3. sinon attendre d'être rejoint.

L'étape 2 crée un risque : A et B pourraient se réserver mutuellement. Il est
levé par un départage sur l'id du document — on ne réserve qu'un candidat dont
l'id est inférieur au sien. Les ids sont aléatoires, donc les deux côtés
tombent d'accord sans se parler.

Les battles abandonnés sortent de la file par la fraîcheur du heartbeat (15 s),
et chaque recherche recycle au passage ceux qui traînent depuis plus d'une
heure — le ramasse-miettes qu'on ne peut pas planifier sans Cloud Functions.

## Ajouter un exercice

`battles.exercise` est une simple clé dans
[`registry.ts`](src/lib/exercise/registry.ts). Pour ajouter les squats :

1. Écris `detectors/squat.ts` qui implémente `ExerciseDetector`.
2. Renseigne `create` et passe `available: true` dans le registre.

Ni l'UI, ni la synchro, ni le schéma, ni les règles ne changent. Squats, abdos,
burpees et tractions sont déjà déclarés en attente de leur détecteur.

---

## Structure

```
src/
  app/                     routes (accueil, auth, create, join, battle/[id])
  components/
    ui/                    Button, Input, Card, Logo, Spinner
    battle/                PlayerCard, BattleTimer, Countdown, ResultScreen, ShareCode
    camera/                CameraStage, PoseOverlay, ManualPad
  lib/
    battle/                types, constants, machine (pur), hooks
    firebase/              client, clock, auth, battles
    exercise/              types, geometry, registry, detectors/, runtime/
firestore.rules            la frontière de confiance
tests/                     102 tests
public/mediapipe, /models  WASM + modèle auto-hébergés (aucun CDN)
```

## Déploiement

```bash
npm run deploy:rules                  # règles + index Firestore
```

Sur Vercel : importer le dépôt, ajouter les variables `NEXT_PUBLIC_FIREBASE_*`
(**sans** `NEXT_PUBLIC_FIREBASE_EMULATORS`), puis autoriser le domaine
`*.vercel.app` dans Firebase → Authentication → Settings → Authorized domains.
Sans cette étape la connexion Google échoue avec `auth/unauthorized-domain`.

Le `postinstall` prépare les assets MediaPipe pendant le build Vercel — aucune
configuration supplémentaire n'est nécessaire.

La caméra exige HTTPS : Vercel le fournit, et `localhost` est déjà considéré
comme sécurisé.

## Hors périmètre V1

Autres exercices (l'architecture est prête), amis/chat, spectateurs, replay
vidéo, classement global persistant, tournois.
