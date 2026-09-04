# La Team V2 Championnat / Club — rapport avant production

## Statut

La V2 reste exclusivement sur `codex/v2-championship-foundation`. La branche `main`, les règles Firestore et les fonctions Firebase de production n'ont pas été modifiées. La sauvegarde stable pointe sur `bcd60935bceddb3eb9b954bbb82d2636a47675e9`.

## Fonctionnalités ajoutées

- Identités distinctes : `uid`, `playerId`, `publicId`, `participantId` et `engineIndex`.
- Profils sportifs permanents et rattachements multi-clubs sans utiliser le nom comme identité.
- Choix explicite Organisateur entre joueur enregistré et invité ; les anciens noms restent invités.
- Saisons non destructives avec barème centralisé, configurable et figé par `scoringVersion`.
- Événements amicaux ou championnat, fuseau `Europe/Brussels`, capacité, fin après minuit, inscriptions, désinscriptions et liste d'attente.
- Attribution atomique des places et promotion automatique depuis la liste d'attente par fonctions serveur.
- Rattachement ultérieur explicite d'un invité à un profil ; aucune association automatique par nom.
- Résultats officiels privés, propositions Viewer séparées, validation/modification par l'Organisateur et audit des corrections historiques.
- Recalcul serveur complet et idempotent des matchs, victoires/défaites, points pour/contre, différence, partenaires, adversaires, événements, byes et classement saison.
- Projection Viewer minimale `schemaVersion: 5` contenant un `participantId` éphémère, jamais le `playerId` permanent.
- Cockpit T1–T8 avec score proposé/validé et indication `PROCHAIN SCORE : Tn` ; déplacement automatique limité au desktop.
- Timer global réservé à l'Organisateur ; calcul local depuis l'heure absolue, sans écriture chaque seconde.
- King prolongé après le cycle complet, sans remise à zéro et sans fin automatique.
- Lisibilité mobile renforcée : noms à 18–19 px, retours à la ligne et cartes verticales jusqu'à 390 px.
- Champs commerciaux préparés (`plan`, `subscriptionStatus`, `trialEndsAt`, `billingCustomerId`) mais verrouillés et sans facturation.

## Sécurité Firestore

- Isolation privée par adhésion active au club et rôles `owner`, `admin`, `organizer`.
- Aucun listing public global des tournois ou profils.
- Statistiques et classements officiels interdits en écriture aux clients.
- Résultats officiels réservés aux organisateurs du club ; révision obligatoire lors d'une correction.
- Inscriptions interdites en écriture directe et gérées par fonctions transactionnelles.
- Un Viewer peut uniquement créer une proposition pour le round et le terrain où sa session anonyme est liée.
- L'UID, l'`engineIndex` et le `participantId` public doivent tous correspondre ; autre terrain, autre joueur, faux `clubId` et faux `playerId` sont refusés.
- Une proposition ne modifie jamais le tournoi public, le score officiel, le classement ou le timer.
- Le timer global et les timers individuels réservés sont fermés aux Viewers.

## Tests effectués

- Campagne historique : 975 simulations, 240 configurations, 46 950 rounds et 160 170 matchs.
- King/Americano, byes, 0 doublon évitable, Retour, correction, sauvegarde/autosave, PWA et hors connexion.
- Cycle King complet puis +5, +10 et +20 rounds, jusqu'à 32 joueurs / 8 terrains.
- Profils, homonymes par identifiants distincts, invités, saisons, amical/championnat et événements après minuit.
- Capacité/liste d'attente, promotion après désinscription, anti-doublon et rattachement explicite.
- Règles multi-clubs, anti-escalade de rôles, faux `clubId`, faux `playerId`, statistiques et résultats officiels fermés.
- Proposition du bon match acceptée ; faux participant, autre terrain et modification ultérieure refusés.
- Fonction serveur : première validation, correction inverse, retraitement idempotent et changement de saison.
- Timer global, 0 Viewer, 32 Viewer, reprise réseau, arrivée tardive et alerte unique.
- Audit navigateur local à 320, 375, 390, 768 et 1280 px : aucun débordement horizontal observé sur l'accueil ; aucune erreur JavaScript, seulement l'avertissement de dépréciation Firebase concernant l'ancienne API de persistance IndexedDB.

## Migration de production proposée

1. Conserver la branche/tag de sauvegarde stable et exporter les règles actuelles.
2. Vérifier le plan Firebase et les quotas avant le déploiement des fonctions de région `europe-west1`.
3. Déployer les index, puis les fonctions appelables et de recalcul.
4. Publier les règles V2 testées.
5. Déployer l'application V2 sur une branche de préproduction et exécuter un test réel avec deux clubs et plusieurs Viewers.
6. Ne fusionner sur `main` qu'après validation de la préproduction.
7. Ne convertir aucun ancien nom en profil ; les rattachements historiques restent manuels, explicites et auditables.

## Infrastructure et coûts potentiels

- Cloud Functions 2e génération en `europe-west1` pour inscriptions et recalculs.
- Firestore pour profils, clubs, saisons, événements, propositions, matchs et classements.
- Firebase Authentication e-mail/mot de passe pour les comptes permanents et anonyme pour les Viewers.
- Le déploiement des fonctions peut nécessiter un projet avec facturation activée. Les appels, lectures/écritures Firestore et stockage des artefacts consomment les quotas Firebase/Google Cloud. Aucun de ces services supplémentaires n'a été activé ou facturé par les tests locaux.

## Limites restantes avant commercialisation

- App Check n'est pas encore activé ; il est recommandé avant une ouverture commerciale pour réduire l'abus automatisé des fonctions.
- La vérification obligatoire de l'adresse e-mail et la récupération avancée de compte ne sont pas encore imposées par les règles.
- L'inscription autonome d'un joueur existe côté API, mais l'interface dédiée au joueur régulier reste volontairement secondaire ; le parcours QR sans compte demeure prioritaire.
- La gestion visuelle des invitations d'organisateurs et des rôles existe dans le modèle/règles, mais nécessite encore un écran d'administration complet.
- Les inscriptions par fonction exigent une connexion ; le tournoi local de personnes présentes reste utilisable hors connexion avec zéro téléphone joueur.
- Les timers individuels sont réservés dans le schéma mais restent fermés jusqu'à une définition fonctionnelle explicite.
- Aucun paiement, abonnement effectif, e-mail transactionnel personnalisé ni domaine commercial n'est inclus.
