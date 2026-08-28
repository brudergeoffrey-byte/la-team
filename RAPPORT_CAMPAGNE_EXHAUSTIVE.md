# Rapport de campagne exhaustive — La Team Club V1

Date : 28 août 2026

## Verdict

La campagne complète est validée après correction d'un défaut de performance lié à la croissance de l'historique sauvegardé. Aucun défaut fonctionnel du moteur Americano ou King / Montée-Descente n'a été observé.

## Contrôle des doublons nécessaires

La campagne contrôle désormais chaque répétition de partenaires avant de l'accepter :

- en Americano, un appariement maximal exact recherche simultanément toutes les paires encore inédites parmi les joueurs actifs ;
- en King, les trois compositions possibles de chaque terrain de destination sont comparées sans jamais modifier les montées et descentes ;
- le marqueur orange est présent uniquement sur les paires déjà vues qui restent après cette recherche ;
- un oracle indépendant par programmation dynamique valide l'algorithme sur 120 graphes de référence jusqu'à 12 joueurs ;
- une régression ciblée reproduit le cas où un choix glouton crée un doublon alors qu'une solution entièrement inédite existe.

Résultat déterministe de la campagne : **170 412 doublons nécessaires** sur les longues sessions, **0 doublon évitable** produit par le nouveau moteur. Ce total élevé agrège volontairement les 975 simulations, dont les stress King de 250 rondes bien au-delà de l'épuisement des combinaisons possibles.

## Périmètre automatique

- 975 simulations indépendantes.
- 46 950 rondes et 160 170 matchs validés.
- 240 configurations mode/joueurs/terrains : chaque nombre de joueurs de 4 à 32, chaque nombre de terrains valide de 1 à `floor(n / 4)`, en Americano et en King.
- Horizons de 10, 20, 50 et 100 rondes sur toutes les configurations.
- Stress supplémentaire de 250 rondes en King pour 24/6, 28/7 et 32/8, avec cinq profils de scores.
- Profils : victoire systématique A, victoire systématique B, alternance, scores serrés, écarts forts, joueur dominant, circulation des gagnants et scores pseudo-aléatoires.

## Invariants contrôlés à chaque ronde

- exactement quatre joueurs par terrain ;
- aucun joueur dupliqué, oublié ou simultanément actif et au repos ;
- identifiants de joueurs entiers et dans les bornes ;
- score total conforme et absence d'égalité ;
- classement strictement identique à un registre de référence recalculé match par match ;
- en King, destination exacte de chaque joueur actif : gagnants vers le terrain supérieur, perdants vers le terrain inférieur, avec maintien aux deux extrémités ;
- répartition équitable des byes : écart maximal observé de 1 ;
- identité d'équipe indépendante de l'ordre des deux partenaires.

## Diversité observée

- partenaires distincts par joueur : de 1 à 31 selon la taille, le nombre de terrains et la durée ; moyenne globale 13,60 ;
- adversaires distincts par joueur : de 2 à 31 ; moyenne globale 16,43 ;
- intervalle moyen entre deux répétitions de partenaires : 22,91 rondes ;
- les cycles Americano complets testés conservent zéro répétition de partenaire pendant le cycle théorique dynamique `n - 1`.

Les répétitions cumulées sur 160 170 matchs sont attendues dans les simulations de 50 à 250 rondes, une fois les combinaisons disponibles épuisées. Elles ne constituent pas une répétition prématurée.

## Actions organisateur injectées

- correction d'un score déjà validé puis revalidation, sans double comptage ;
- Retour avec restauration exacte de l'état ;
- sauvegarde manuelle et chargement exacts ;
- autosave et reprise dans une nouvelle instance simulant fermeture/réouverture ;
- remplacement d'un joueur, conservation de ses statistiques et possibilité de Retour ;
- redémarrage avec les mêmes joueurs, scores remis à zéro et première ronde valide.

## Anomalie trouvée et correction

Le test fonctionnel 32 joueurs / 8 terrains devenait très lent car chaque autosave recopiait l'intégralité d'un historique lui-même composé de snapshots volumineux. Un passage interrompu après 134 secondes n'avait pas encore achevé la suite.

Correction : l'historique en mémoire et persisté est désormais borné aux 20 derniers états. Cela conserve 20 niveaux de Retour, y compris après chargement, tout en empêchant la croissance disproportionnée des autosaves.

Après correction, la suite fonctionnelle complète termine en 13,19 secondes sur la machine de test.

## Performance du moteur

Sur les stress King de 250 rondes :

| Configuration | Génération moyenne d'une ronde | Pic observé | État final |
|---|---:|---:|---:|
| 24 joueurs / 6 terrains | 0,033 ms | 0,170 ms | environ 88 Ko |
| 28 joueurs / 7 terrains | 0,038 ms | 0,081 ms | environ 103 Ko |
| 32 joueurs / 8 terrains | 0,044 ms | 0,103 ms | environ 119 Ko |

Ces mesures portent sur la génération pure du moteur dans Node.js et servent à détecter les régressions relatives ; elles ne représentent pas le temps d'affichage du navigateur.

## Validation navigateur et mobile

Un tournoi King de 32 joueurs sur 8 terrains a été lancé dans un navigateur réel :

- le tableau organisateur affiche les huit raccourcis T1 à T8 et les huit cartes de terrain ;
- les huit scores ont été validés, l'avancement est passé à `8/8 validés` et le bouton de ronde suivante s'est activé ;
- la ronde 2 a été générée avec huit terrains ;
- aucun message d'erreur JavaScript n'a été relevé ;
- à 375 × 812, la largeur du document reste inférieure à la largeur de la fenêtre (360 px pour 375 px), sans débordement horizontal.

## Commandes de validation

```sh
node tests/tournament-simulation.test.js
node tests/exhaustive-campaign.test.js
```

Résultats attendus :

```text
OK — 17 simulations longues (dont King 32/8) + 4 cycles Americano + correction/persistance/Retour validés
EXHAUSTIVE_CAMPAIGN_OK
```
