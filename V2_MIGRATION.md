# La Team V2 — fondation Championnat / Club

## Portée de cette étape

La V2 est ajoutée sans remplacer les documents existants. Les tournois V1, leur projection Viewer, l’autosave local et le moteur King/Americano restent inchangés.

Les nouveaux espaces sont :

- `players/{playerId}` : identité sportive permanente privée, possédée par un `uid` ;
- `clubs/{clubId}/players/{playerId}` : présence du joueur dans un club ;
- `clubs/{clubId}/seasons/{seasonId}` : saison et barème figé/versionné ;
- `clubs/{clubId}/seasons/{seasonId}/standings/{playerId}` : statistiques officielles écrites uniquement par la fonction serveur ;
- `clubs/{clubId}/events/{eventId}` : soirée ou événement ;
- `clubs/{clubId}/events/{eventId}/registrations/{registrationId}` : inscriptions de joueurs ou invités ;
- `clubs/{clubId}/events/{eventId}/participants/{participantId}` : instantané utilisé par le tournoi avec `engineIndex` ;
- `clubs/{clubId}/tournaments/{tournamentId}/matches/{matchId}` : résultats officiels ;
- `clubs/{clubId}/tournaments/{tournamentId}/auditLog/{auditId}` : corrections historiques immuables ;
- `tournaments/{publicCode}/scoreProposals/{proposalId}` : propositions Viewer séparées des résultats officiels.

Les inscriptions passent par des fonctions appelables transactionnelles : `registerForEvent`, `cancelEventRegistration` et `linkGuestRegistration`. Elles attribuent atomiquement une place ou la liste d’attente, empêchent les doublons et interdisent toute écriture cliente directe sur les inscriptions. Le rattachement ultérieur d’un invité conserve son type et son historique ; il ajoute seulement `linkedPlayerId`, `linkedByUid` et `linkedAt` après décision explicite d’un Organisateur.

## Identités

`uid`, `playerId`, `publicId`, `participantId` et `engineIndex` ont des rôles distincts. Un invité possède un `participantId` et un `engineIndex`, mais jamais de `playerId` permanent. Le moteur ne reçoit que les participants triés par `engineIndex` ; sa logique n’est pas modifiée.

## Classement versionné

Chaque saison porte `scoringVersion` et une copie complète de son barème. La version 1 applique 3 points pour une victoire et 1 pour une défaite, avec un minimum de matchs configurable. La fonction serveur lit exclusivement le barème de la saison et recalcule le classement depuis les matchs officiels validés.

## Migration progressive

1. Déployer d’abord les règles et index testés, sans déplacer les anciens tournois.
2. Créer les profils permanents à la demande ; aucun compte n’est déduit d’un nom existant.
3. Traiter les participants historiques comme invités tant qu’un organisateur ne les associe pas explicitement à un profil.
4. Activer les écritures V2 événement par événement, tout en conservant la projection publique actuelle.
5. Ne retirer aucune structure V1 avant validation complète et sauvegarde exportable.

Une correction d’un ancien round ne régénère jamais silencieusement les déplacements déjà joués. Elle modifie uniquement les statistiques officielles et crée une entrée dans `auditLog`.

Les propositions de score utilisent chacune un identifiant immuable. En cas de coupure, le SDK les garde en attente ; au retour du réseau elles ne remplacent jamais un résultat officiel. Si plusieurs propositions existent pour un terrain, l’Organisateur choisit celle à accepter ou saisit son propre score. Une acceptation ne devient officielle qu’après écriture séparée du résultat validé et de sa révision.

La projection Viewer V2 utilise `schemaVersion: 5` et une liste `participantIds` alignée sur les indices moteur. Ces identifiants ne révèlent aucun `playerId` permanent. Les règles vérifient ensemble l’UID anonyme de la session Viewer, son `engineIndex`, le `participantId`, le round courant et l’appartenance au terrain avant d’autoriser une proposition. Les schémas publics 1 à 4 restent lisibles pour préserver les anciens QR codes.

Les documents de club préparent uniquement les champs commerciaux `plan`, `subscriptionStatus`, `trialEndsAt` et `billingCustomerId`. Les clients ne peuvent pas les modifier et aucune facturation n’est activée.

## État de production

Ces règles et fonctions doivent rester hors production jusqu’à validation des tests émulateur et accord explicite de publication.
