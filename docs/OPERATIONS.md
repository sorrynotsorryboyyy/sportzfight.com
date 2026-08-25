# Exploitation

Déployer, régler, dépanner.

## Commandes

```bash
npm run dev              # serveur local (localhost compte comme sécurisé → caméra OK)
npm run build            # build de production
npm run lint             # eslint
npm run typecheck        # tsc --noEmit

npm run test             # logique pure, sans émulateur
npm run test:rules       # 101 tests de règles
npm run test:mm          # courses de matchmaking
npm run test:e2e         # parcours complet, vraie bataille de 60 s
npm run test:all         # tout (217), émulateurs lancés automatiquement

npm run emu              # émulateurs Firestore + Auth
npm run deploy:rules     # règles + index vers la production
npm run setup:mediapipe  # régénère le WASM et le modèle dans public/
```

---

## Déployer

Vercel redéploie automatiquement à chaque push sur `main`.

**Les règles et index ne partent PAS avec.** Après toute modification de
`firestore.rules` ou `firestore.indexes.json` :

```bash
npm run deploy:rules
```

> **Déployer les règles avant le client.** Un client qui utilise une règle pas
> encore en ligne se fait refuser silencieusement ses écritures — c'est
> exactement ce qui rendrait le crédit d'XP muet.

Les index composites se construisent en arrière-plan. Une requête qui en
dépend échoue avec `failed-precondition` tant qu'il n'est pas prêt.

---

## Variables d'environnement

Dans Vercel, les six `NEXT_PUBLIC_FIREBASE_*` (voir `.env.local.example`).
**Ne jamais ajouter `NEXT_PUBLIC_FIREBASE_EMULATORS` en production** — l'app
chercherait des émulateurs inexistants.

Ces clés sont publiques par nature : elles identifient le projet, elles
n'ouvrent rien. Voir [SECURITY.md](SECURITY.md).

---

## Régler le détecteur de pompes

`/admin`, accessible aux comptes portant `role: "admin"`.

**Activer un admin** : Firestore → `users/{uid}` → ajouter un champ `role`
(string) = `admin`. Le champ est lu en direct, la page se débloque sans
rechargement.

> Le lecteur tolère les espaces et la casse (`"admin\n"` fonctionne) — un
> retour à la ligne collé par erreur a déjà coûté une session de débogage.

La page affiche en direct l'angle du coude, l'inclinaison du corps, l'écart du
bassin et la visibilité, plus des curseurs sur les seuils. Les curseurs ne
modifient **que l'onglet courant** ; la page imprime un bloc à recopier dans
`src/lib/exercise/detectors/pushup.ts` pour rendre un réglage permanent.

---

## Dépannage

### « Port 8080 déjà utilisé »

Un émulateur d'une exécution précédente traîne.

```bash
netstat -ano | grep ":8080" | grep LISTENING     # récupérer le PID
taskkill //PID <pid> //F
```

### La caméra ne démarre pas

1. **HTTPS ?** La caméra exige un contexte sécurisé. `localhost` passe, une IP
   locale en `http://` non — et le message du navigateur est peu clair.
2. Permission refusée dans les réglages du site ?
3. Une autre application utilise-t-elle la caméra ?
4. L'appareil a-t-il seulement une caméra ? Le bouton doit afficher
   « CAMÉRA REQUISE ».

### On voit le squelette mais pas la vidéo

Déjà rencontré : le `<video>` n'avait pas `autoPlay`, et `play()` n'était appelé
qu'une fois. La détection lit le `MediaStream` directement, donc le squelette
s'affiche même quand la vidéo ne joue pas — d'où un symptôme trompeur.
Corrigé ; si ça revient, regarder `PoseEngine.start()` et les écouteurs
`loadedmetadata` / `canplay`.

### L'XP n'est pas créditée

1. Le battle est-il bien `finished` avec deux joueurs et un `winner` ?
2. Un reçu existe-t-il déjà dans `users/{uid}/creditedBattles/{battleId}` ?
   Si oui, c'est normal : le crédit a déjà eu lieu.
3. **Ouvrir `/compte`** : la réconciliation y rattrape tout battle non crédité.
4. Les règles déployées sont-elles à jour ? Un décalage entre les montants d'XP
   du code et des règles refuse **silencieusement** chaque crédit —
   `npm run test` le détecte via `tests/contract.test.ts`.

### Le matchmaking ne trouve personne

- L'index `status + exercise + durationSecs + createdAt` est-il en ligne ?
- Les battles en attente sont filtrés si leur heartbeat dépasse 15 s : un
  battle abandonné disparaît de la file, c'est voulu.
- Les files sont **séparées par exercice**. Deux joueurs sur des modes
  différents ne se rencontreront jamais.

### Un battle bloqué en `waiting`

Normal et sans gravité : il est filtré de la file dès que son heartbeat
dépasse 15 s, et recyclé par n'importe quelle recherche passé une heure. Aucune
intervention nécessaire.

---

## Inspecter la production

La CLI Firebase est authentifiée. Pour lire la base sans passer par la console,
un script Node avec le refresh token de `~/.config/configstore/firebase-tools.json`
et l'API REST Firestore fait l'affaire — pratique pour vérifier des compteurs
ou des reçus.

**Écrire directement en production contourne les règles.** À réserver aux
migrations ponctuelles, et à vérifier après coup.
