#!/usr/bin/env node
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const player=require("../player-experience.js");
const sharing=require("../firebase-sharing.js");

assert.equal(player.normalizeTournamentCode(" k7 f2 "),"K7F2");
assert.equal(player.isValidTournamentCode(" k7 f2 "),true);
assert.equal(player.isValidTournamentCode(" k7 f4 p2 ab "),true,"ancien code 8 caractères compatible");
assert.equal(player.isValidTournamentCode("K7F4P2"),false);
for(const invalid of ["K7F","K7F22","K0F2","KOF2","KI12"]){assert.equal(player.isValidTournamentCode(invalid),false,`code invalide : ${invalid}`);}
assert.equal(player.tournamentUrl("https://app.exemple.com/base/index.html"," k7 f2 "),"https://app.exemple.com/base/?t=K7F2");
assert.deepEqual(player.roundProgress({currentRound:{courts:Array.from({length:8},(_,index)=>({validated:index<6}))}}),{completed:6,total:8});

const appState={mode:"ladder",n:8,courts:2,maxPoints:21,matchIndex:0,tournamentStatus:"live",clubId:"club-a",
  players:Array.from({length:8},(_,id)=>({name:`J${id+1}`,mj:0,v:0,plus:0,minus:0})),
  schedule:[{rest:[],courts:[
    {teamA:[0,1],teamB:[2,3],necessaryDuplicates:["0-1"]},
    {teamA:[4,5],teamB:[6,7],necessaryDuplicates:[]}
  ]}],results:[[{a:11,b:7},null]]};
const snapshot=sharing.buildViewerSnapshot(appState,{code:"K7F4P2AB",revision:1},"owner",1);
assert.deepEqual(player.roundProgress(snapshot),{completed:1,total:2});
assert.deepEqual(player.teamDestination(snapshot.currentRound.courts[0],[0,1]),{outcome:"win",court:1,stays:true});
assert.equal(snapshot.currentRound.courts[0].necessaryDuplicate,true);

const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
assert.match(html,/id="organizerAuth"/);
assert.match(html,/Connectez-vous pour créer, reprendre et synchroniser les tournois de votre club/);
assert.match(html,/id="viewer"[\s\S]*Qui êtes-vous \?/m,"Viewer sans formulaire de compte classique");
for(const expected of ["Organiser un tournoi →","Rejoindre un tournoi →","Code du tournoi","Changer de joueur","Round en direct","Ton match","Accueil","▦ QR","Reprendre le tournoi →","SUIVRE LE TOURNOI"]){
  assert.ok(html.includes(expected),`parcours visible : ${expected}`);
}
for(const expected of ["Mis à jour à","Retour au tournoi","Mode de fin de match","Durée du round","Activer les alertes"]){assert.ok(html.includes(expected),`expérience temps réel : ${expected}`);}
for(const expected of ["En attente de l’Organisateur","Réinitialiser le chrono","CHRONO DU ROUND","organizerCourtTimers"]){assert.ok(html.includes(expected),`chrono global : ${expected}`);}
for(const expected of ["roundCockpit","cockpitClock","Score attendu : Terrain","MOUVEMENTS DU PROCHAIN ROUND","viewerPersonalClock","Prochain round en préparation","NOUVEAU MATCH"]){assert.ok(html.includes(expected),`cockpit et assistant Joueur : ${expected}`);}
for(const expected of ["Proposer le score","Score proposé :","✓ VALIDER","✎ MODIFIER","PROCHAIN SCORE : T","Club · joueurs, saisons et événements","Tournoi amical"]){assert.ok(html.includes(expected),`fondation Club V2 visible : ${expected}`);}
assert.match(html,/@media \(max-width:390px\)[\s\S]*\.matchup,\.viewer-matchup\{grid-template-columns:1fr[\s\S]*font-size:19px/,"noms mobiles prioritaires et multilignes à 320/375/390 px");
for(const expected of ["data-court-time","court-time-left","⏱ TEMPS TERMINÉ"]){assert.ok(html.includes(expected),`temps restant par match : ${expected}`);}
assert.ok(html.includes("REPOS CE ROUND"),"repos Viewer sans ambiguïté");
assert.match(html,/round-cockpit\{position:sticky/,'cockpit Organisateur visible pendant le défilement');
assert.match(html,/courtStatusGrid[\s\S]*scrollToCourt/,'accès direct depuis le cockpit vers chaque terrain');
const viewerTimerMarkup=html.slice(html.indexOf('id="viewerTimer"'),html.indexOf('id="viewerProgress"'));
assert.equal(viewerTimerMarkup.includes("Réinitialiser le chrono"),false,"aucune réinitialisation dans le Viewer");
assert.match(html,/topbar-context[\s\S]*Mode Organisateur/,"mode Organisateur visible en haut");
assert.match(html,/id="viewerContent"[\s\S]*mode-label">Mode Joueur/,"mode Joueur visible en haut");
assert.match(html,/id="topHomeBtn"[\s\S]*home-icon[\s\S]*⌂/,"icône Accueil dédiée");
assert.match(html,/\.topbar #topHomeBtn \.home-icon\{[^}]*font-size:25px/,"icône maison agrandie et contrastée");
assert.match(html,/select\{[\s\S]*-webkit-appearance:none!important;appearance:none!important[\s\S]*stroke='%23d9ff79'[\s\S]*stroke-width='3\.2'[\s\S]*background-position:right 16px center!important/,"chevron iOS personnalisé, clair et aligné sur les sélecteurs");
assert.match(html,/function cancelViewerIdentityChange\(\)/,"retour depuis Changer de joueur");
assert.match(html,/organizerUnlocked=true; openOrganizerMode\(\)/,"PIN ouvre directement le tournoi");
assert.ok(html.includes('placeholder="K7F2"'),"exemple de code court");
assert.match(html,/function returnOrganizerHome\(\)[\s\S]*writeAutoSave\(\)[\s\S]*showHomeMode\(\)/,"Accueil conserve l’autosave");
assert.match(html,/async function openSharePanel\(\)[\s\S]*state\.sharedTournament\?\.code[\s\S]*enableTournamentSharing\(\)/,"QR active directement le partage si nécessaire");
assert.ok(html.includes("active.sharedTournament?.code"),"accueil indique le partage actif");
assert.ok(html.includes(".topbar .actions #topQrBtn{width:auto;min-width:68px"),"libellé QR toujours visible sur mobile");
assert.ok(html.indexOf('id="home"')<html.indexOf('id="setup"'));
assert.match(html,/if\(viewerCode\)[\s\S]*showViewerMode\(\)/);
assert.ok(html.includes("localStorage.setItem(viewerIdentityKey(),viewerPlayerSelectEl.value)"));
assert.doesNotMatch(html,/function changeViewerIdentity\(\)[\s\S]{0,400}localStorage\.removeItem\(viewerIdentityKey\(\)\)/,"Changer de joueur reste annulable et conserve l'identité choisie");
assert.match(html,/id="viewer"[\s\S]{0,180}id="viewerIdentityHome"[\s\S]{0,120}← Accueil/,"Accueil immédiatement visible en haut du Viewer");
assert.match(html,/function leavePlayerMode\(\)[\s\S]{0,300}location\.assign/,'Accueil quitte le Viewer par une navigation propre');
assert.doesNotMatch(html,/function leavePlayerMode\(\)[\s\S]{0,300}localStorage\.(?:removeItem|clear)/,"Accueil conserve le joueur mémorisé");
const viewerMarkup=html.slice(html.indexOf('id="viewer"'),html.indexOf('<!-- SETUP -->'));
for(const forbidden of ["Valider le score","ROUND SUIVANT","Remplacer un joueur","Terminer le tournoi"]){
  assert.equal(viewerMarkup.includes(forbidden),false,`Joueur sans action organisateur : ${forbidden}`);
}
for(const expected of ["✅ Cycle complet atteint","Tous les joueurs ont parcouru le cycle idéal. Vous pouvez terminer le tournoi ou continuer à jouer.","TERMINER LE TOURNOI","CONTINUER"]){assert.ok(html.includes(expected),`décision de fin King : ${expected}`);}
assert.match(html,/function continueKingAfterCycle\(\)[\s\S]*kingCycleDecisionPending=false[\s\S]*kingCycleContinued=true[\s\S]*writeAutoSave/,"Continuer conserve et sauvegarde le tournoi");
console.log("PLAYER_EXPERIENCE_OK — accueil, codes, identité, round en direct et lecture seule validés");
