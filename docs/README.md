# Documentation SportzFight

## Par où commencer

| Tu veux… | Lis |
|---|---|
| **Vérifier avant d'ouvrir aux joueurs** | [TESTING.md](TESTING.md) |
| Comprendre comment le produit tient debout | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Savoir ce qui est protégé — et ce qui ne l'est pas | [SECURITY.md](SECURITY.md) |
| Déployer, régler le détecteur, dépanner | [OPERATIONS.md](OPERATIONS.md) |
| Installer le projet | [../README.md](../README.md) |

## L'essentiel en une page

SportzFight est une app de défis sportifs en **1 vs 1** : un maximum de pompes
en 60 secondes, comptées par la caméra, directement dans le navigateur.

**La contrainte qui explique tout le reste : il n'y a aucun code serveur.**
Firebase plan Spark, pas de Cloud Functions. `firestore.rules` est la seule
frontière de confiance, et chaque décision d'architecture en découle — le
gagnant recalculé par les règles, le chrono synchronisé sur un seul timestamp
serveur, le matchmaking en compare-and-swap, le reçu anti-double-crédit.

**La vidéo ne quitte jamais l'appareil.** Ce n'est pas une politique : il
n'existe aucun code capable de la transmettre.

## État actuel

- 469 tests automatisés (176 règles, contrat, matchmaking, bout-en-bout,
  le reste en logique pure)
- Un seul exercice jouable : les pompes. Quatre autres sont déclarés dans le
  registre et attendent leur détecteur.
- Les $SC s'accumulent mais n'ont encore rien à acheter.

## Trois choses à savoir avant de toucher au code

1. **Les règles se déploient à part.** `npm run deploy:rules` — un push Vercel
   ne les emporte pas, et un client en avance sur les règles se fait refuser
   ses écritures en silence.
2. **Certains nombres existent en double** entre TypeScript et
   `firestore.rules`, qui ne peut pas importer de TS. `tests/contract.test.ts`
   vérifie qu'ils restent alignés : une dérive ne lève aucune erreur, elle
   bloque muettement.
3. **Lire la section « Ce qui n'est PAS garanti »** de
   [SECURITY.md](SECURITY.md) avant de faire reposer quoi que ce soit de
   sensible sur les protections existantes.
