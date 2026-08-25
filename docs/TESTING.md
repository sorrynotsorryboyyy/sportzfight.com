# Recette avant lancement

Checklist à dérouler **avant d'ouvrir l'app à de vrais joueurs**, et après tout
changement touchant le battle, la progression ou les règles.

Les 217 tests automatisés couvrent la logique. Ce document couvre ce qu'ils ne
peuvent pas voir : deux vrais appareils, une vraie caméra, un vrai corps, un
vrai réseau.

## Ce dont tu as besoin

- **Deux comptes Google** et **deux appareils** (ou un appareil + une fenêtre
  privée). Le matchmaking est aléatoire : sans deux joueurs simultanés, la
  moitié de ce document est intestable.
- Un endroit pour faire des pompes, téléphone posé au sol de côté.
- La console Firestore ouverte pour vérifier les écritures.

> **HTTPS obligatoire pour la caméra.** `localhost` est considéré comme sûr,
> donc le dev local marche. Sur un téléphone, il faut passer par l'URL Vercel —
> une IP locale en `http://` refusera la caméra sans message clair.

---

## 1. Automatisé — le préalable

```bash
npm run test:all      # 217 tests, émulateurs lancés automatiquement
npm run lint
npm run typecheck
npm run build
```

- [ ] Les 217 passent
- [ ] Lint et typecheck sans erreur
- [ ] Le build produit toutes les routes

Si `test:all` échoue sur un port occupé, un émulateur traîne d'une exécution
précédente. Voir [OPERATIONS.md](OPERATIONS.md).

---

## 2. Authentification

- [ ] Déconnecté, `/` affiche la **landing** (titre, 3 étapes, podium)
- [ ] « Commencer » mène à `/login`
- [ ] La connexion Google fonctionne et renvoie vers la page demandée
- [ ] Connecté, `/` affiche le **hub** (carte joueur, modes, Top Mondial) —
      aucun flash de landing au chargement
- [ ] Déconnexion : retour à la landing
- [ ] `/compte` déconnecté redirige vers `/login`

**Nouveau compte** (compte Google jamais utilisé) :

- [ ] Le pseudo est généré sans espace ni accent
- [ ] Un verrou apparaît dans `usernames/` (console Firestore)
- [ ] Le profil `users/{uid}` **ne contient pas** de champ `email`

---

## 3. Pseudo

- [ ] Modifier le pseudo fonctionne, le nouveau s'affiche partout
- [ ] Un pseudo déjà pris est refusé avec un message clair
- [ ] Espaces, accents, `<3` : refusés avec la raison affichée
- [ ] Moins de 3 ou plus de 16 caractères : refusé
- [ ] Une insulte évidente est refusée
- [ ] Après renommage : l'ancien verrou a disparu, le nouveau existe

---

## 4. La caméra — le point le plus fragile

C'est ici que les deux derniers bugs se cachaient.

- [ ] **On voit la vidéo**, pas seulement le squelette. Sur téléphone ET sur
      ordinateur.
- [ ] Le squelette se superpose au corps et suit les mouvements
- [ ] L'indicateur passe au vert (« Détecté ») en position de planche
- [ ] Il reste vert pendant une série complète — pas d'orange clignotant

**Sur un appareil sans caméra** (ex. PC fixe sans webcam) :

- [ ] Le bouton affiche « CAMÉRA REQUISE » et est **désactivé**
- [ ] Impossible de lancer un battle
- [ ] Le message explique pourquoi

**Caméra refusée** (refuser la permission dans le navigateur) :

- [ ] Un message d'erreur explicite s'affiche, pas un écran noir
- [ ] « Réessayer » redemande la permission
- [ ] Impossible de se déclarer prêt

**Caméra perdue en cours de lobby** (couper la permission une fois prêt) :

- [ ] Le joueur repasse automatiquement en « pas prêt »
- [ ] Le battle ne se lance pas

---

## 5. Matchmaking

**À deux, simultanément** — cliquer « Rechercher » en même temps, 5 fois :

- [ ] À chaque fois, les deux atterrissent dans **le même** battle
- [ ] Jamais deux battles à moitié remplis
- [ ] Jamais un troisième joueur dans un battle plein

**Seul** :

- [ ] Le premier joueur attend ; le second le rejoint bien
- [ ] Annuler pendant l'attente fonctionne

**Les modes** :

- [ ] Cliquer « Pompes » mène à `/matchmaking?exercise=pushups`
- [ ] Le battle créé porte `exercise: 'pushups'` (console Firestore)
- [ ] Les 4 modes grisés ne sont pas cliquables
- [ ] `?exercise=nimportequoi` retombe sur les pompes sans planter

---

## 6. Le battle

**Pré-match** :

- [ ] Caméra en plein écran, infos en overlay
- [ ] Ton pseudo et ton état en haut
- [ ] Pseudo adverse et son état « prêt » en bas
- [ ] Le bouton « JE SUIS PRÊT » est atteignable au pouce

**Décompte** :

- [ ] 3 · 2 · 1 · GO couvre tout l'écran
- [ ] **Les deux appareils affichent GO au même instant** (à ~200 ms près).
      C'est la propriété la plus difficile du produit : la vérifier en filmant
      les deux écrans côte à côte si besoin.

**Effort** :

- [ ] Caméra plein écran, ton score domine en haut
- [ ] Le chrono descend de 60 à 0
- [ ] Le score adverse progresse en bas (~1,5 s de retard, normal)
- [ ] Les répétitions sont comptées correctement — compte à voix haute et
      compare
- [ ] Un mouvement bidon (agiter les bras assis) compte **0**

**Fin** :

- [ ] Le décompte s'arrête à 0
- [ ] L'écran de résultat affiche les deux scores et le bon gagnant
- [ ] **Les deux appareils affichent le même gagnant**

---

## 7. Progression

Après un battle, sur `/compte` :

- [ ] Victoires / défaites / nuls incrémentés du bon côté
- [ ] XP crédité : victoire 100, nul 60, défaite 40, **+2 par pompe**
- [ ] $SC crédité : 25 / 15 / 10
- [ ] Le niveau progresse (niveau 2 à 100 XP, 5 à 1000)
- [ ] Le battle apparaît dans l'historique
- [ ] Un reçu existe dans `users/{uid}/creditedBattles/{battleId}`

**Anti-double-crédit** :

- [ ] Recharger `/compte` plusieurs fois : les compteurs **ne bougent plus**

**Récupération** (le cas qui a déjà causé un bug) :

- [ ] Fermer l'onglet juste après la fin d'un battle, puis ouvrir `/compte` :
      l'XP est bien créditée rétroactivement

---

## 8. Classement

- [ ] `/classement` affiche le podium or / argent / bronze
- [ ] Le tri suit les victoires, puis le nombre de pompes
- [ ] Ta ligne est mise en évidence
- [ ] Un compte sans battle n'apparaît pas
- [ ] Le podium de l'accueil correspond à celui de `/classement`

---

## 9. Cas de panne

- [ ] **Adversaire qui ferme son onglet en plein battle** : ton chrono va au
      bout, le résultat se calcule
- [ ] **Réseau coupé pendant l'effort** (mode avion 10 s puis retour) : le
      score se resynchronise
- [ ] **Recharger la page en plein battle** : on revient dans le bon état
- [ ] **Ouvrir un battle terminé** : l'écran de résultat s'affiche, rien n'est
      recrédité

---

## 10. Sécurité — les tentatives qui doivent échouer

Les 101 tests de règles couvrent ça, mais une vérification manuelle vaut le
coup avant lancement. Dans la console du navigateur, connecté :

- [ ] Écrire le score de l'adversaire → refusé
- [ ] Se déclarer gagnant d'un battle perdu → refusé
- [ ] Modifier son propre `xp` ou `coins` → refusé
- [ ] Se donner `role: "admin"` → refusé
- [ ] `/admin` avec un compte non-admin → écran « Accès réservé »

> Rappel : `/admin` est protégé **côté client uniquement** et reste
> contournable. Voir [SECURITY.md](SECURITY.md).

---

## 11. Responsive

| Largeur | À vérifier |
|---|---|
| 375 px | Tout lisible, boutons atteignables au pouce, rien de coupé |
| 768 px | Mise en page cohérente |
| 1440 px | Contenu centré, pas étiré |

- [ ] **Paysage sur téléphone** — cadrage naturel pour filmer des pompes au sol
- [ ] Le bouton flottant ne recouvre jamais le dernier élément

---

## Avant de lancer

- [ ] Toutes les sections ci-dessus cochées
- [ ] Règles et index déployés (`npm run deploy:rules`)
- [ ] Le domaine Vercel est dans Firebase → Authentication → Authorized domains
- [ ] Un battle complet joué de bout en bout sur le domaine de production
