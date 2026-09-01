# la-team
Application Padel Americano / King – La Team.

## Architecture Firebase

- `users/{uid}` : profil privé de l’organisateur.
- `clubs/{clubId}` et `clubs/{clubId}/members/{uid}` : club et rôles `owner`, `admin`, `organizer`.
- `clubs/{clubId}/tournaments/{tournamentId}` : sauvegarde privée récupérable sur plusieurs appareils.
- `tournaments/{publicCode}` : projection publique compacte utilisée par le Viewer et le QR code.

Les joueurs utilisent une identité Firebase anonyme invisible. Ils n’ont pas de compte classique et leurs seules écritures possibles concernent le chrono de leur terrain courant.

La création d’un compte depuis une ancienne identité organisateur anonyme utilise `linkWithCredential` afin de conserver son UID et ses `ownerUid` existants.

## Tests

```sh
npm install
npm test
npm run test:rules
```

Le dernier script démarre l’émulateur Firestore et vérifie réellement l’isolation multi-clubs et les permissions serveur.
