# La Team — Audit PWA et hors connexion

Date : 28 août 2026

## Architecture

- `manifest.webmanifest` déclare l'application sous `/la-team/`, avec `start_url` et `scope` limités à `/la-team/`.
- `service-worker.js` précache uniquement l'enveloppe applicative : HTML, fond, manifest, page de secours et icônes.
- Les tournois, autosaves et sauvegardes restent exclusivement dans `localStorage`. Le service worker n'y accède jamais.
- Les navigations utilisent le réseau lorsqu'il est disponible, puis reviennent automatiquement sur la version locale en cas de coupure.
- Les ressources statiques indispensables sont servies depuis le cache après la première installation complète.

## Mise à jour sûre

Le service worker n'appelle pas `skipWaiting` et l'application ne force jamais de rechargement. Une nouvelle version téléchargée reste en attente pendant que la version actuelle est ouverte. Un message discret prévient l'organisateur ; l'activation se fait après fermeture des anciennes fenêtres, donc au prochain lancement.

Lors de l'activation, seuls les anciens caches dont le nom commence par `la-team-shell-` sont supprimés. Aucune clé de sauvegarde n'est effacée.

## Validation automatisée

- manifest, métadonnées Apple et tailles d'icônes contrôlés ;
- toutes les ressources critiques contrôlées dans le précache ;
- première navigation en ligne puis navigations et rechargements hors ligne simulés ;
- retour du réseau simulé ;
- mise à jour `v1` vers `v2` simulée avec nettoyage de l'ancien cache ;
- autosave et sauvegarde locale conservés après cette mise à jour ;
- absence d'activation et de rechargement forcés ;
- empreinte SHA-256 de toute la section moteur vérifiée contre la baseline `c127baa6f63792c8f994c4bcdf12e700c258d5bf`.

## Validation dans un navigateur réel

Le serveur a été arrêté après une première ouverture complète, simulant l'indisponibilité totale de l'origine. Sans serveur :

- La Team a été rechargée depuis le service worker ;
- un King 32 joueurs / 8 terrains a été créé ;
- trois rounds complets et 24 scores ont été validés ;
- le classement et le récapitulatif ont été consultés ;
- l'autosave a été écrit ;
- l'onglet a été fermé puis une nouvelle instance a repris le round 3 ;
- le tournoi a été terminé et l'export CSV déclenché sans erreur JavaScript ;
- le serveur a ensuite été rétabli et la navigation réseau a repris normalement.

## Installation

### iPhone et iPad

1. Ouvrir `https://brudergeoffrey-byte.github.io/la-team/` dans Safari avec Internet.
2. Attendre l'affichage complet de La Team.
3. Toucher **Partager**.
4. Choisir **Sur l'écran d'accueil**.
5. Toucher **Ajouter**.

### Android

1. Ouvrir l'adresse dans Chrome avec Internet.
2. Utiliser **Installer La Team** lorsqu'il est proposé, ou le menu Chrome puis **Installer l'application** / **Ajouter à l'écran d'accueil**.
3. Confirmer l'installation.
