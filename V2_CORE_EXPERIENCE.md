# La Team V2 — cœur Club, Joueur et Viewer

## Trois interfaces, un seul modèle de données

- **La Team Club (Web/PWA)** répond à cinq questions : que se passe-t-il aujourd'hui, quels événements arrivent, qui est inscrit, comment préparer la soirée et où en est le tournoi ?
- **La Team Joueur (Web responsive puis Capacitor)** affiche le prochain événement, l'inscription, le match courant, le classement, quelques statistiques et l'historique récent.
- **Viewer invité (Web/QR)** reste immédiat, sans compte et limité à la projection publique minimale.

Le paiement reste désactivé dans le parcours principal. Les inscriptions gratuites utilisent les mêmes profils, événements et participants que la future réservation payante.

## Parcours prioritaire

Le club crée un événement léger : nom, date, heure, capacité, King/Americano, amical/championnat et inscriptions ouvertes/fermées. Les terrains, Points/Temps et la durée sont choisis seulement avec **PRÉPARER LE TOURNOI**. Les inscriptions confirmées et invités deviennent alors des participants indexés sans recopier les noms.

L'écran Club privilégie : `AUJOURD'HUI`, `PROCHAINS ÉVÉNEMENTS`, `JOUEURS`, `CHAMPIONNATS`, `HISTORIQUE`, puis `CRÉER UN ÉVÉNEMENT`. L'écran Joueur privilégie : prochain événement, état d'inscription, prochain match, classement, statistiques et historique. Les noms de match doivent rester multilignes et lisibles à 320, 375 et 390 px.

## Niveau futur sans score arbitraire

Le futur `playerLevel` doit être un résultat serveur versionné, explicable et daté, jamais une valeur modifiable par le joueur. La V2 conserve déjà les entrées nécessaires : matchs officiels, adversaires, partenaires, scores, différence, victoires, type d'événement, saison et ancienneté. Une future structure pourra contenir `levelVersion`, `value`, `confidence`, `sampleSize`, `calculatedAt` et `inputsThrough`, sans choisir aujourd'hui de formule.

Les suggestions de groupes utiliseront cette information uniquement pour proposer une organisation. L'organisateur restera décisionnaire.

## Contraintes maintenues

Le moteur King/Americano reste inchangé. Le téléphone joueur n'est jamais requis. Un organisateur peut encoder seul huit terrains et avancer vers le prochain score manquant. `Cycle complet atteint` reste distinct de `Tournoi terminé`. Les statistiques officielles et le championnat restent calculés côté serveur après validation des scores.
