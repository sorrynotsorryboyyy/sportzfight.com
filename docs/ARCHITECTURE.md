# Architecture

Comment le produit tient debout, et pourquoi il est construit ainsi.

## La contrainte fondatrice

**Aucun code serveur.** Firebase plan Spark, pas de Cloud Functions, pas d'API
routes. Cette contrainte explique la quasi-totalité des choix ci-dessous : à
chaque fois qu'un serveur aurait été la réponse évidente, il a fallu trouver
autre chose.

```
Next.js 16 (App Router) · React 19 · Tailwind 4
Firebase 12 (Auth + Firestore) · MediaPipe Pose · Vercel
```

---

## Les quatre problèmes difficiles

### 1. Personne ne peut arbitrer le résultat

Sans serveur, aucun tiers de confiance ne déclare le gagnant. La réponse :
**les règles Firestore recalculent** le vainqueur à partir des scores
enregistrés, et refusent toute écriture qui affirme autre chose.

→ [SECURITY.md](SECURITY.md)

### 2. Deux clients, une seule horloge

Les deux joueurs doivent voir « GO » au même instant, sans que leurs horloges
locales soient fiables. Tout découle d'un unique `startedAt` écrit par le
serveur, plus un décalage mesuré :

```
offset      = serverCommitMs − (tAvant + (tAprès − tAvant) / 2)
serverNow() = Date.now() + offset
```

L'estimateur principal est gratuit : quand un client écrit `serverTimestamp()`,
`onSnapshot` se déclenche une fois en attente puis une fois résolu, ce qui
encadre le commit. L'offset est **gelé** au passage en `live` et le tick se
fait sur `performance.now()`, donc une correction NTP en pleine bataille ne
peut pas faire reculer le chrono.

Le décompte est identique des deux côtés **par construction** :
`deriveView(doc, serverNow())` est une fonction pure.

`src/lib/firebase/clock.ts`, `src/lib/battle/machine.ts`

### 3. Trouver un adversaire sans file d'attente serveur

Firestore n'a pas de « trouver et réserver » atomique entre documents — mais la
règle `validJoin` en est un au niveau d'**un** document. L'algorithme :

1. chercher un battle en attente et tenter de le réserver ;
2. sinon en créer un, puis **rechercher à nouveau** — c'est ce qui évite que
   deux personnes cliquant en même temps attendent chacune dans leur coin ;
3. sinon attendre d'être rejoint.

L'étape 2 crée un risque : A et B pourraient se réserver mutuellement. Il est
levé par un **départage sur l'id du document** — on ne réserve qu'un candidat
dont l'id est inférieur au sien. Les ids étant aléatoires, les deux côtés
tombent d'accord sans se parler.

Les battles abandonnés sortent de la file par la fraîcheur du heartbeat (15 s),
et chaque recherche recycle au passage ceux qui traînent depuis plus d'une
heure — le ramasse-miettes qu'on ne peut pas planifier sans Cloud Functions.

`src/lib/firebase/matchmaking.ts`

### 4. Compter des pompes de façon crédible

Un compteur naïf sur l'angle du coude se fait berner en agitant les bras assis.
Quatre garde-fous indépendants, tous nécessaires :

1. **Hystérésis à quatre seuils** (160/150 en haut, 95/110 en bas) — les zones
   mortes absorbent le bruit, principale cause de double comptage.
2. **Amplitude minimale** de 55° sur la répétition.
3. **Alignement du tronc** — l'écart *signé* de la hanche à la ligne
   épaules→chevilles distingue le dos creusé du bassin trop haut. Un angle non
   signé, borné à 180°, en serait incapable.
4. **Horizontalité du corps** — c'est ce test qui rend le faux mouvement assis
   impossible.

`src/lib/exercise/detectors/pushup.ts`

---

## Le flux d'un battle

```
/                 hub : choix du mode
  └─ /matchmaking?exercise=pushups
       └─ findOrCreateBattle()  → rejoint ou crée
            └─ /battle/{id}
                 waiting  → en attente d'un adversaire
                 ready    → les deux présents, caméra active, « prêt »
                 live     → startedAt écrit : 3·2·1·GO puis 60 s
                 finished → gagnant recalculé, XP créditée
```

Le rendu est une **fonction pure** de `(document, temps serveur)`. Les effets
de bord (heartbeat, armement, finalisation, crédit) vivent séparément dans
`useBattleDriver`, ce qui garde l'affichage prévisible et testable.

---

## Le modèle de données

```
users/{uid}
  username, avatar, createdAt
  wins, losses, draws, xp, coins, totalReps, battlesPlayed, bestScore
  role?                      ← console uniquement, invisible aux règles
  pendingBattleId?           ← crédit en deux temps
  private/contact            ← email, propriétaire uniquement
  creditedBattles/{id}       ← reçus : le garde-fou anti-double-crédit
  clock/probe                ← mesure du décalage d'horloge

battles/{id}
  exercise, durationSecs, status
  player1, player2, players[]
  player1Score, player2Score, *Meta, *Final, *HeartbeatAt
  winner, endReason, createdAt, startedAt, endedAt

usernames/{minuscules} → { uid }    ← verrou d'unicité
```

`level` est **absent** : c'est une fonction pure de `xp`. Le stocker créerait
une seconde source de vérité que les règles devraient surveiller.

---

## Points d'extension

**Ajouter un exercice** : écrire un `ExerciseDetector`, l'enregistrer dans
`src/lib/exercise/registry.ts`, passer `available: true`. Le matchmaking, les
files d'attente séparées, l'UI et les règles sont déjà prêts — `battles.exercise`
est simplement une clé de cette table.

**Le contrat dupliqué** : `firestore.rules` ne peut pas importer du TypeScript,
donc une quinzaine de nombres existent en double (durées, plafonds, montants
d'XP). `tests/contract.test.ts` vérifie qu'ils restent alignés — une dérive ne
lève aucune erreur, elle refuse **silencieusement** les écritures concernées.

---

## Où regarder

| Question | Fichier |
|---|---|
| Qui gagne, qui peut écrire quoi | `firestore.rules` |
| Phases et chrono | `src/lib/battle/machine.ts` |
| Effets de bord du battle | `src/lib/battle/useBattleDriver.ts` |
| Trouver un adversaire | `src/lib/firebase/matchmaking.ts` |
| Compter les pompes | `src/lib/exercise/detectors/pushup.ts` |
| Caméra et boucle d'inférence | `src/lib/exercise/runtime/PoseEngine.ts` |
| XP et niveaux | `src/lib/progression/` |
| Crédit et anti-rejeu | `src/lib/firebase/stats.ts` |
