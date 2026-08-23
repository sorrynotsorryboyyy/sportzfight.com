# SportzFight

Défis sportifs en **1vs1**. V1 : **un max de pompes en 60 secondes**, comptées
automatiquement par la caméra, directement dans le navigateur.

> Inscription → Créer un battle → Partager le code → L'adversaire rejoint →
> Caméra → 3·2·1·GO → 60 secondes → Comptage → Résultat → Victoire

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
npm run test        # logique pure : machine à états, détecteur, score sync (53)
npm run test:rules  # règles de sécurité contre l'émulateur (40)
npm run test:e2e    # parcours complet, vraie bataille de 60 s (9)
npm run test:all    # tout (102), émulateurs lancés automatiquement
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

### Repli manuel

Caméra refusée, indisponible, ou simple préférence : le mode manuel implémente
la **même interface** `ExerciseDetector`, donc tout le reste fonctionne à
l'identique. Un correctif `+1/−1` est disponible en mode caméra.

Comme les scores doivent être monotones côté serveur, un `−1` n'ajuste que le
compteur **local** ; la synchro n'envoie jamais qu'un maximum courant.

---

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
