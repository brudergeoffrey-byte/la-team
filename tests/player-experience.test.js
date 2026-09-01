#!/usr/bin/env node
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const player=require("../player-experience.js");
const sharing=require("../firebase-sharing.js");

assert.equal(player.normalizeTournamentCode(" k7 f4 p2 ab "),"K7F4P2AB");
assert.equal(player.isValidTournamentCode(" k7 f4 p2 ab "),true);
assert.equal(player.isValidTournamentCode("K7F4P2"),false);
assert.equal(player.tournamentUrl("https://app.exemple.com/base/index.html"," abcd 2345 "),"https://app.exemple.com/base/?t=ABCD2345");
assert.deepEqual(player.roundProgress({currentRound:{courts:Array.from({length:8},(_,index)=>({validated:index<6}))}}),{completed:6,total:8});

const appState={mode:"ladder",n:8,courts:2,maxPoints:21,matchIndex:0,tournamentStatus:"live",
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
for(const expected of ["Organiser un tournoi →","Rejoindre un tournoi →","Code du tournoi","Changer de joueur","Round en direct","Ton match","⌂ Accueil","▦ QR","Reprendre le tournoi →","SUIVRE LE TOURNOI"]){
  assert.ok(html.includes(expected),`parcours visible : ${expected}`);
}
assert.match(html,/function returnOrganizerHome\(\)[\s\S]*writeAutoSave\(\)[\s\S]*showHomeMode\(\)/,"Accueil conserve l’autosave");
assert.match(html,/async function openSharePanel\(\)[\s\S]*state\.sharedTournament\?\.code[\s\S]*enableTournamentSharing\(\)/,"QR active directement le partage si nécessaire");
assert.ok(html.includes("active.sharedTournament?.code"),"accueil indique le partage actif");
assert.ok(html.indexOf('id="home"')<html.indexOf('id="setup"'));
assert.match(html,/if\(viewerCode\)[\s\S]*showViewerMode\(\)/);
assert.ok(html.includes("localStorage.setItem(viewerIdentityKey(),viewerPlayerSelectEl.value)"));
assert.ok(html.includes("localStorage.removeItem(viewerIdentityKey())"));
const viewerMarkup=html.slice(html.indexOf('id="viewer"'),html.indexOf('<!-- SETUP -->'));
for(const forbidden of ["Valider le score","ROUND SUIVANT","Remplacer un joueur","Terminer le tournoi"]){
  assert.equal(viewerMarkup.includes(forbidden),false,`Joueur sans action organisateur : ${forbidden}`);
}
console.log("PLAYER_EXPERIENCE_OK — accueil, codes, identité, round en direct et lecture seule validés");
