# La Team V2 — plan de préproduction isolée

## Isolation préparée

- Branche exclusive : `codex/v2-championship-foundation`.
- Configuration Firebase locale : `preproduction-config.js` avec un identifiant volontairement inexistant.
- Aucun fichier déployable de cette branche ne contient `la-team-df6ad` ni sa clé Web.
- Alias CLI unique : `preproduction`; aucun alias `default` ou `production` n'est configuré.
- Titre, manifeste PWA et bandeau permanent : **La Team V2 — TEST**.
- Le déploiement Hosting ignore règles, tests, sources Functions, rapports et dépendances.
- Le bouton de démonstration prépare localement 12 joueurs, dont deux Alex, trois terrains, King et mode Temps. Il ne crée aucune donnée Firebase.

Le futur projet devra utiliser Firestore en `europe-west1`, Authentication anonyme + E-mail/Mot de passe, une application Web dédiée et Firebase Hosting. Son adresse sera de la forme `https://IDENTIFIANT-PREPROD.web.app/`.

## Pourquoi Blaze est nécessaire

Les trois fonctions transactionnelles `registerForEvent`, `cancelEventRegistration` et `linkGuestRegistration`, ainsi que les deux déclencheurs `rebuildSeasonStandings` et `rebuildSeasonStandingsForByes`, utilisent Cloud Functions 2e génération. Firebase exige le plan Blaze pour les déployer.

Sans Blaze, il reste possible de tester sur la préproduction distante : Hosting/PWA, comptes, Firestore, règles, isolation des clubs, tournoi local, Viewer/QR et timer. Les inscriptions transactionnelles, la promotion de liste d'attente et le classement serveur resteront indisponibles à distance, mais continuent à être entièrement testables dans les émulateurs locaux.

## Coûts et hypothèses

Blaze n'est pas un abonnement mensuel fixe : les services sont facturés à l'usage après leurs quotas gratuits. Les principaux compteurs sont les appels et le calcul Functions, les lectures/écritures/stockage Firestore, Cloud Build et le stockage des images de fonctions dans Artifact Registry.

Pour un essai de quelques utilisateurs et quelques soirées, avec `minInstances = 0` et `maxInstances = 3`, l'usage devrait rester dans les quotas gratuits hors éventuels très petits frais de stockage d'artefacts. Il faut néanmoins prévoir un budget d'alerte car Blaze autorise la consommation au-delà des quotas.

Projection indicative, pas un devis, sur l'hypothèse de quatre événements de 32 joueurs par club et par mois, douze rounds et huit terrains :

| Taille | Matchs officiels/mois | Appels de recalcul approximatifs | Risque attendu |
|---|---:|---:|---|
| Test privé | moins de 500 | moins de 600 | généralement quotas gratuits |
| 10 clubs | environ 3 840 | environ 4 320 | faible, à surveiller |
| 50 clubs | environ 19 200 | environ 21 600 | lectures/écritures Firestore mesurables |
| 100 clubs | environ 38 400 | environ 43 200 | optimisation du recalcul nécessaire avant généralisation |

Le recalcul actuel relit les résultats de la saison pour garantir l'idempotence. C'est robuste pour la préproduction, mais le coût de lecture augmente avec la longueur de la saison. Avant 50–100 clubs, il faudra mesurer puis envisager des agrégats incrémentaux idempotents ou une file de recalcul par événement.

## Garde-fous proposés avant Blaze

1. Budget mensuel très bas avec alertes à 25 %, 50 %, 75 %, 90 % et 100 %.
2. Si le compte y est éligible, un **spend cap** Cloud Run/Cloud Run functions ; contrairement à une simple alerte, il peut suspendre les nouvelles requêtes, mais son application n'est pas instantanée.
3. `maxInstances: 3` déjà préparé sur toutes les fonctions et aucune instance minimale payante.
4. App Check en mode observation, puis enforcement sur les fonctions appelables avant un test public.
5. Quotas API conservateurs, suivi quotidien pendant les premiers essais et suppression des artefacts obsolètes.
6. Projet et compte de facturation dédiés à la préproduction si possible, sans accès croisé à la production.

## Étapes distantes non exécutées

1. Autoriser Firebase CLI avec le compte propriétaire.
2. Créer un nouveau projet Firebase avec un identifiant disponible.
3. Créer Firestore en `europe-west1` — le choix de région est important et doit être confirmé.
4. Activer Authentication anonyme et E-mail/Mot de passe uniquement dans ce projet.
5. Créer l'application Web et remplacer les valeurs `PREPRODUCTION_NOT_CONFIGURED`.
6. Déployer Hosting, index et règles vers l'alias explicite `preproduction`.
7. Décider séparément de Blaze, des garde-fous et du déploiement Functions.

Aucune de ces étapes distantes n'a encore été exécutée.
