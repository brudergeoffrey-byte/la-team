"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),root=path.resolve(__dirname,".."),html=fs.readFileSync(path.join(root,"index.html"),"utf8"),source=fs.readFileSync(path.join(root,"v2-experience.js"),"utf8"),cloud=fs.readFileSync(path.join(root,"firebase-v2.js"),"utf8");
for(const marker of ["Le padel.","Ensemble.","Rejoindre un tournoi","Créer et gérer","Suivre en direct","TOURNOIS À VENIR","Pourquoi La Team ?","Organisation simple","En temps réel","Équitable","Sur tous vos écrans","ESPACE JOUEUR","ESPACE ORGANISATEUR","ACCÈS VIEWER","Accueil","Tournois⌄","Mon club⌄","Profil","Tableau de bord","Joueurs","Matchs & terrains","Paramètres","Créer un événement","Bonjour ${p.displayName}","S’INSCRIRE","✓ INSCRIT","Mes statistiques","PRÉPARER LE TOURNOI","OUVRIR LE MODULE TOURNOI","AUCUN PAIEMENT"]){assert.ok((html+source).includes(marker),`expérience V2 présente : ${marker}`);}
for(const field of ["v2xName","v2xDate","v2xTime","v2xCapacity","v2xCourts","v2xFormat","v2xEndMode","v2xOpen"]){assert.ok(source.includes(field),`champ événement : ${field}`);}
for(const feature of ["createPlayerAccount","ensurePlayerAccount","registerPlayerSpark","cancelRegistrationSpark","subscribeEvents","subscribeRegistrations","addGuestSpark","createParticipants"]){assert.ok(cloud.includes(feature),`parcours Firestore réel : ${feature}`);}
assert.doesNotMatch(source,/laTeam\.v2\.demoExperience/);assert.match(source,/registration_\$\{runtime\.context\.user\.uid\}/);assert.match(source,/prepareV2EventRoster/);assert.match(source,/DOMContentLoaded.*landing/);assert.match(html,/font-size:18px/);
for(const marker of ["Bienvenue 👋","SE CONNECTER","CRÉER MON COMPTE","Gérez votre club avec La Team","CRÉER MON CLUB","facultatif"]){assert.ok(source.includes(marker),`entrée authentification explicite : ${marker}`);}
for(const field of ["v2xFirstName","v2xDisplayName","v2xEmail","v2xPassword","v2xPasswordConfirm"]){assert.ok(source.includes(field),`champ compte Joueur : ${field}`);}
for(const marker of ["Nom ou nom d’affichage","Confirmer le mot de passe","Mot de passe oublié ?","sendPasswordReset","Les deux mots de passe ne correspondent pas."]){assert.ok(source.includes(marker),`parcours Auth complet : ${marker}`);}
assert.match(cloud,/if\(selectedClub\)[\s\S]*clubs[\s\S]*players/,"le rattachement Club du nouveau Joueur reste facultatif");
assert.match(cloud,/linkWithCredential[\s\S]{0,500}getIdToken\?\.\(true\)[\s\S]{0,200}ensurePlayerAccount/,"la migration anonyme renouvelle le jeton avant réparation Firestore");
assert.match(cloud,/async function ensurePlayerAccount[\s\S]{0,250}getIdToken\?\.\(true\)[\s\S]{0,1800}batch\.commit/,"la réparation renouvelle aussi le jeton avant son lot Firestore");
assert.match(cloud,/existingDoc\.exists\)batch\.update\(userRef,mutableUser\)/,"la réparation d’un compte existant ne renvoie aucun champ immuable");
assert.match(cloud,/selectedClub\|\|String\(existing\.defaultClubId/,"la réparation conserve le Club d’un compte existant");
assert.match(source,/signIn\([\s\S]{0,180}ensurePlayerAccount/,"la reconnexion répare automatiquement un profil Joueur absent");
assert.match(source,/Compte connecté[\s\S]*TERMINER MON PROFIL/,"un échec de réparation n’est plus masqué par un retour à l’accueil");
assert.match(source,/async function openPlayer[\s\S]*if\(!runtime\.context\.playerId\)[\s\S]*ensurePlayerAccount/,"un compte connecté incomplet est réparé à l’ouverture Joueur");
for(const marker of ["v2TournamentNav","Accueil","Tournois⌄","Mon club⌄","Joueurs","v2x-persistent-nav","v2x-global-nav","toggleMainMenu","goHome"]){assert.ok((html+source).includes(marker),`navigation principale conservée dans le module tournoi : ${marker}`);}
assert.match(source,/prepare\(id\)[\s\S]*tournamentNav\(true\)[\s\S]*showSetup/,"la navigation Club reste visible pendant la préparation");
assert.match(source,/openLegacyTournament[\s\S]*tournamentNav\(true\)/,"la navigation Club reste visible dans le module Tournoi");
assert.match(source,/returnFromTournament[\s\S]*openClub\(true\)/,"retour du tournoi vers les rubriques Club");
assert.match(source,/v2CompatLanding[\s\S]*classList\.add\("hidden"\)/,"l’accueil statique disparaît seulement après démarrage réussi de la V2 moderne");
assert.match(html,/\.v2x \.v2x-form button\.secondary\{color:#0b5265;background:#e7f4f8;border:2px solid #1687a5\}/,"bouton secondaire contrasté sur carte blanche");
assert.match(source,/function openPlayer[\s\S]*roleWelcome\("JOUEUR"\)/,"Joueur non connecté dirigé vers ses actions d’authentification");
assert.match(source,/function openClub[\s\S]*roleWelcome\("CLUB"\)/,"Club non connecté dirigé vers ses actions d’authentification");
assert.match(source,/function openViewer[\s\S]*history\.pushState/,"entrée Viewer inscrite dans l’historique V2");
assert.match(source,/popstate[\s\S]*landing/,"retour navigateur vers l’accueil V2");
assert.match(source,/v2x-entry-stack[\s\S]*v2x-entries[\s\S]*v2x-entry viewer/,"les trois portes partagent la même grille commerciale");
assert.match(html,/\.v2x-landing \.v2x-entries\{[^}]*grid-template-columns:repeat\(3,1fr\)/,"les trois portes occupent efficacement la largeur desktop");
assert.match(html,/padel-hero-v2\.jpg/,"la nouvelle photographie premium remplace l’ancien fond");
assert.doesNotMatch(source,/openPlayer[\s\S]{0,500}authForm\("JOUEUR",false\)/,"aucun formulaire Joueur implicite");
console.log("V2_EXPERIENCE_OK — comptes réels, événements, inscriptions temps réel, invités et préparation tournoi validés");
