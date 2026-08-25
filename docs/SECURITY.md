# Modèle de sécurité

**Il n'y a aucun code serveur.** Pas de Cloud Functions, pas d'API routes.
`firestore.rules` est la seule frontière de confiance entre un client modifié
et les données.

Ce document dit ce qui est garanti, et surtout **ce qui ne l'est pas**.

---

## Le principe

> Un client peut déclarer **son propre effort**, jamais **un résultat**.

Tout ce qu'un joueur affirme est soit vérifié contre un document que les règles
relisent, soit recalculé par les règles elles-mêmes.

---

## Ce qui est réellement garanti

Ces propriétés tiennent même face à un client entièrement réécrit, parce
qu'elles sont appliquées côté serveur par Firestore. Chacune est couverte par
les 101 tests de `tests/rules.test.ts`.

### Le résultat d'un battle

- **Chacun n'écrit que son propre score.** `player1` ne peut pas toucher
  `player2Score`.
- **Les scores sont monotones** : impossible de faire baisser le score adverse.
- **Plafonnés** à 200, et limités à +40 par écriture.
- **Le gagnant est recalculé par la règle** à partir des scores enregistrés. Se
  déclarer vainqueur d'un match perdu est refusé.
- **La fin est verrouillée sur l'horloge serveur** (`request.time`) : impossible
  de terminer en avance pour figer une avance.
- **Un troisième joueur ne peut pas entrer** : la jointure est un
  compare-and-swap évalué au moment du commit.
- **Les heartbeats ne peuvent pas être falsifiés** : chaque chemin d'écriture
  impose `== request.time`.

### La progression

- Chaque delta de compteur est vérifié contre le battle terminé dont il
  prétend venir. Réclamer une victoire perdue, gonfler ses pompes : refusé.
- **Un battle ne peut être crédité qu'une fois.** Les règles n'ont aucune
  mémoire d'une écriture à l'autre, donc la mémoire est un document : un reçu
  dans `users/{uid}/creditedBattles/{battleId}`, créé dans le même batch que
  le paiement.
- `level` n'est **jamais stocké** — c'est une fonction pure de `xp`. Toute
  écriture de ce champ est refusée.

### Les données personnelles

- `users/{uid}` **ne contient pas d'email**. C'est délibéré : ce document est
  listable par tout client connecté pour le classement, donc n'importe quelle
  donnée personnelle y serait moissonnable en une requête. L'email vit dans
  `users/{uid}/private/contact`, lisible par son seul propriétaire.
- Les résultats sont **immuables** : `allow delete: if false` sur les battles
  comme sur les profils.

### La vidéo

**Aucune image ne quitte l'appareil.** La détection tourne entièrement dans le
navigateur via MediaPipe ; seul le compteur de répétitions est écrit dans
Firestore. Il n'y a pas de WebRTC, pas de serveur TURN, aucun flux entre
joueurs. Ce n'est pas une politique déclarative : il n'existe aucun code pour
transmettre de la vidéo.

---

## Ce qui n'est PAS garanti

Cette section compte autant que la précédente. Ne pas la lire mènerait à
surestimer la protection.

### `/admin` est contournable

Sans Cloud Functions, il n'y a pas de custom claims : `role` n'atteint jamais
`request.auth.token` et **aucune règle Firestore ne peut le voir**. La
protection de `/admin` est une redirection côté client, contournable par
quiconque édite le bundle JavaScript.

`/admin` est donc **une lentille, pas un levier** : il n'affiche que des
mesures locales et des curseurs de réglage. Il ne contient volontairement
aucune modification de score, aucune suppression, rien qu'un utilisateur
connecté ne puisse déjà faire.

> Le jour où une vraie capacité d'administration est nécessaire, c'est le
> signal pour passer au plan Blaze et aux custom claims — pas pour élargir une
> règle.

### Le filtre d'insultes est cosmétique

Les règles ne peuvent pas contenir de liste de mots. Le filtre est **côté
client uniquement** et contournable par un client modifié. Le jeu de caractères
(`^[a-zA-Z][a-zA-Z0-9_]{2,15}$`), lui, **est** imposé côté serveur.

### Les compteurs sont écrits par le client

Les règles vérifient que chaque delta correspond à un battle réel et non déjà
crédité — mais c'est le client qui envoie l'écriture. C'est nettement plus fort
qu'un compteur libre, et nettement plus faible qu'un serveur qui calculerait
lui-même. Acceptable pour de l'XP cosmétique ; **à revoir si les $SC prennent
une valeur réelle**.

### La détection peut être trompée

Le détecteur rejette les cas évidents (mouvement assis, amplitude
insuffisante, rythme irréaliste). Il n'est pas un juge. Quelqu'un de déterminé
peut probablement le berner ; la parade serait un enregistrement vidéo arbitré,
ce que la promesse « la vidéo ne quitte jamais l'appareil » exclut.

### L'unicité des pseudos a une fenêtre de course

Le verrou est un document créé en transaction. Deux personnes réservant le même
pseudo au même instant : une seule gagne. Mais un pseudo **libéré** puis
immédiatement repris par un tiers reste possible.

---

## Les clés Firebase sont publiques, et c'est normal

Les variables `NEXT_PUBLIC_FIREBASE_*` partent dans le bundle navigateur. C'est
le fonctionnement attendu : elles **identifient** le projet, elles n'**ouvrent**
rien. Ce sont les règles qui protègent les données. Les cacher n'apporterait
aucune sécurité.

---

## En cas de doute

Toute modification de `firestore.rules` doit :

1. passer `npm run test:rules` (101 tests) ;
2. être accompagnée d'un test pour la nouvelle propriété ;
3. respecter `tests/contract.test.ts`, qui vérifie que les constantes
   dupliquées entre TypeScript et les règles restent alignées — une dérive ne
   lève aucune erreur, elle refuse **silencieusement** les écritures.
