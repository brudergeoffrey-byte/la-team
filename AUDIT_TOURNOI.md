# Audit du moteur de tournoi

## Constats avant correction

- **King multi-terrains incorrect** : l'ancien algorithme concaténait gagnants puis perdants de chaque terrain et redécoupait cette même liste par blocs de quatre. Les joueurs restaient donc sur leur terrain au lieu de suivre la montée/descente annoncée.
- **Seuil partenaire figé** : `HARD_UNIQUE_PARTNERS_ROUNDS = 7` ne convenait qu'au cas de 8 joueurs. Il était trop long à 4 joueurs et trop court à 12 ou 16.
- **Retour incomplet** : passer au round suivant ne créait aucun instantané. Depuis le nouveau round, Retour annulait la dernière validation de terrain au lieu de restaurer le round terminé immédiatement précédent.
- **Persistance non versionnée** : sauvegarde et autosave écrivaient directement l'objet global. L'autosave ajoutait en outre `_autosaveAt` à l'état rechargé, empêchant une restitution structurellement exacte.
- **Chargement asymétrique** : la sauvegarde manuelle et l'autosave ne réparaient pas les mêmes champs manquants des anciennes données.
- **Americano idéal non garanti** : le choix glouton pouvait répéter un partenaire avant que toutes les paires aient été parcourues, même lorsque tous les joueurs jouaient.
- **King et byes** : choisir les repos avant de construire les déplacements exige une règle explicite. La règle sûre retenue est que tout joueur du round précédent qui ne prend pas le nouveau bye suit strictement son mouvement ; un joueur revenant de bye remplit uniquement une place libérée.
- **Égalités** : elles sont interdites par l'interface. Cette règle métier est conservée, car la montée/descente ne définit pas le traitement d'une égalité.

## Corrections et garanties

- Les destinations King sont calculées par terrain : gagnants vers `max(terrain-1, 1)`, perdants vers `min(terrain+1, dernier)`.
- Les équipes sont toujours normalisées avant leur mémorisation et leur comparaison.
- La phase idéale partenaire vaut dynamiquement `n - 1`; en King elle reste subordonnée aux groupes imposés par la montée/descente.
- À effectif complet, l'Americano utilise une factorisation en `n - 1` rounds garantissant chaque paire de partenaires exactement une fois.
- Retour photographie aussi l'action « Round suivant » et restaure l'état métier complet.
- Les données persistées utilisent une enveloppe versionnée, tout en restant compatibles avec l'ancien format.
- Les chargements passent par une normalisation unique.

## Architecture FairPlay préparée

Les coûts partenaires, équipes et adversaires sont séparés (`ladderPartnerScore`, `ladderTeamRepeatScore`, `ladderOppScore`) puis agrégés dans `totalLadderScore`. Cette frontière permet d'ajouter ensuite un score de qualité et une explication par critère sans modifier les règles strictes de déplacement.

## Refonte de l'interface

- Écran de création guidé en cinq étapes, avec cartes explicites Americano et King.
- Cartes de terrain mobiles avec équipes, scores tactiles, couronne du terrain 1 et action de validation claire.
- Après validation King, chaque équipe voit immédiatement sa destination (`monte`, `descend` ou `reste`).
- Action « Round suivant » conservée en bas de l'écran pour rester accessible au bord du terrain.
- Classement simplifié avec position, matchs joués, victoires et différence ; podium mis en évidence discrètement.
- Historique enrichi avec round, terrain, équipes, score et équipe gagnante.
- Jauge basée sur le nombre réel de paires de partenaires rencontrées.
- Avertissement de cycle complet intégré à l'interface au lieu d'une alerte technique.
- Sauvegarde, chargement, autosave et compatibilité des anciennes sauvegardes conservés.

## Validation finale

- 14 simulations longues dans les deux modes, couvrant 4/8/12/16 joueurs, terrains réduits et 20/50/100 rounds.
- 4 cycles Americano complets : toutes les paires apparaissent exactement une fois sur le cycle idéal.
- Sauvegarde, rechargement, autosave et Retour comparés structurellement à l'état attendu.
- Parcours navigateur vérifiés en King 8/2, King 12/3, King 16/4 et Americano 8/2.
- Viewports 390×844 et 1440×1000 sans débordement horizontal ni erreur console.

## La Team Club V1 — 32 joueurs / 8 terrains

- Tableau de bord organisateur avec nom d’événement, club, nombre de joueurs, terrains et avancement du round.
- Résumé compact T1–T8 toujours lisible : chaque terrain indique immédiatement `en attente` ou `validé` et permet de rejoindre sa carte.
- Résumé de fin de round (`8/8 terrains validés · 32 joueurs prêts`) et action Round suivant activée uniquement lorsque tout est complet.
- Correction d’un score validé : l’ancien résultat est d’abord retiré du classement et des mémoires partenaires/adversaires, puis le terrain est rouvert et doit être revalidé.
- Remplacement sûr d’un joueur par changement de nom : sa place, ses matchs et son historique restent attachés au même identifiant interne.
- Export CSV local du classement final, sans backend.
- Performance de Retour corrigée : l'ancien `stateSnapshot` clonait l'historique complet avant de le supprimer. L'historique est désormais exclu avant clonage, ce qui évite une croissance très coûteuse sur les longues soirées.

### Couverture Club

- King 32 joueurs / 8 terrains : sessions de 20, 50 et 100 rounds.
- Profils de scores : même côté gagnant, alternance et aléatoire.
- Destination attendue vérifiée pour chaque joueur à chaque round, de T1 à T8.
- Correction de score vérifiée avec annulation puis réapplication exacte des statistiques.
- Interface vérifiée à 375×812 (iPhone), 390×844, 820×1180 (tablette) et 1440×1000 (desktop).
- Grille des terrains : 1 colonne sur téléphone, 2 sur tablette, 4 sur desktop ; aucun débordement horizontal.

Les statuts « absent » et « arrivée tardive » ne sont pas activés dans cette version : modifier l'effectif actif au milieu d'un round King exige une règle métier sur la conservation des destinations. Le remplacement de nom couvre le cas sûr sans altérer le moteur.

## Limites métier explicites

- Avec des byes en King, un joueur revenant de repos n'a pas de résultat au round précédent : il ne peut donc ni monter ni descendre. Il est placé dans une place libérée, selon le classement courant.
- La contrainte de montée/descente est prioritaire sur l'unicité des partenaires. Dans certains groupes King de quatre, une répétition peut être mathématiquement inévitable avant `n - 1` rounds.
- Aucun niveau initial distinct n'est actuellement saisi. Le futur critère « match compétitif / écart de niveau » devra définir sa source (classement courant, niveau déclaré ou historique).
