# La Team V2 — architecture commerciale locale

Cette conception reste sur `codex/v2-championship-foundation`. Aucun projet distant, compte Stripe, secret, déploiement ou changement de production n'est inclus.

## Réservations et paiements

Une réservation payante est créée côté serveur sous forme de **hold** temporaire. La transaction serveur compte les réservations `held` et `confirmed` avant d'attribuer la dernière place. Le prix, la devise, l'événement et la capacité proviennent du serveur : le navigateur ne décide jamais du montant. Une réservation gratuite devient directement `confirmed/paid`.

Le paiement suit `pending | paid | failed | cancelled | refunded`. Seul un webhook Stripe signé pourra rendre un paiement officiel. Son identifiant est mémorisé pour rendre les doublons idempotents. Une page de succès n'accorde aucun droit. Les holds expirés libèrent une place et déclenchent la promotion atomique du premier inscrit en attente.

`PRÉPARER LE TOURNOI` copie uniquement les réservations `confirmed/paid` vers des participants immuables. Un profil conserve son `playerId`; un invité reçoit seulement un `participantId`. Aucun rapprochement par nom. Le moteur reçoit la même liste indexée qu'auparavant et reste inchangé.

Collections prévues sous `clubs/{clubId}/events/{eventId}` : `reservations`, `paymentAttempts` et `webhookEvents`. Elles restent fermées aux écritures clientes. Les secrets Stripe resteront dans Secret Manager. L'abonnement SaaS du club (`plan`, `subscriptionStatus`, `trialEndsAt`, `billingCustomerId`) reste séparé des paiements d'événements.

## Web, PWA et applications mobiles

La stratégie recommandée conserve un cœur Web/PWA modulaire et ajoute ultérieurement Capacitor comme coque iOS/Android. Auth, Firestore, fonctions, identités, Viewer et modèles restent communs. Les capacités natives (notifications, liens universels, stockage sécurisé, Apple Pay/Google Pay) passent par des adaptateurs sans dupliquer le moteur. Le QR Web reste disponible aux invités sans installation.

## Recommandations futures

Les profils pourront fournir au serveur des agrégats de niveau et d'historique. Une future couche pourra proposer un groupe unique ou plusieurs groupes, mais cette fondation ne prend aucune décision automatique.

## RGPD avant pilote réel

Inventorier identité, adhésion, réservations, historique sportif, journaux techniques et références de paiement avec finalité et durée de conservation. Prévoir export, correction, suppression de compte, anonymisation compatible avec l'intégrité du championnat, et conservation distincte des pièces comptables obligatoires. La projection Viewer ne reçoit aucune adresse, référence Stripe ou historique permanent.

## Infrastructure et coûts

Les modèles, règles et scénarios sont testables gratuitement avec les émulateurs. Une préproduction distante exige un projet Firebase distinct. Le déploiement des fonctions et webhooks exige Blaze; Stripe réel exige un compte marchand et des clés côté serveur. Avant cela : alertes budgétaires, plafond lorsqu'il est disponible, `maxInstances`, App Check, quotas et journalisation. Aucun élément payant n'est activé ici.
