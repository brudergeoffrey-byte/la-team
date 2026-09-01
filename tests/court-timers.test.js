#!/usr/bin/env node
const assert=require("node:assert/strict");
const timers=require("../court-timers.js");

const snapshot={endMode:"time",roundNumber:4,roundDurationMinutes:10,currentRound:{courts:[
  {number:1,teamA:[0,1],teamB:[2,3]},
  {number:2,teamA:[4,5],teamB:[6,7]}
]}};
assert.equal(timers.canPlayerControl(snapshot,0,1),true,"joueur autorisé sur son terrain");
assert.equal(timers.canPlayerControl(snapshot,0,2),false,"autre terrain refusé");

const first=timers.start(null,{roundNumber:4,courtNumber:1,durationMinutes:10,startedBy:0,now:1000});
assert.equal(first.started,true);assert.equal(first.timer.endsAt,601000);assert.equal(first.timer.startedBy,0);
const simultaneous=timers.start(first.timer,{roundNumber:4,courtNumber:1,durationMinutes:10,startedBy:1,now:1100});
assert.equal(simultaneous.started,false,"deuxième appui ne relance pas le chrono");
assert.equal(simultaneous.timer.startedAt,1000,"heure du premier joueur conservée");
assert.equal(timers.label(first.timer,301000),"05:00","tous les Viewer calculent la même durée absolue");
assert.equal(timers.remainingMs(first.timer,401000),200000,"coupure réseau sans effet sur le chrono local");
assert.equal(timers.label(first.timer,401000),timers.label(first.timer,401000),"plusieurs Viewer affichent le même chrono");
assert.equal(timers.phase(first.timer,571000),"warning");
assert.equal(timers.phase(first.timer,601000),"ended");
assert.equal(timers.label(first.timer,700000),"Terminé");

const reset=timers.reset(first.timer,{now:2000});
assert.equal(reset.state,"idle");assert.equal(reset.startedAt,null);assert.equal(reset.endsAt,null);
assert.equal(reset.generation,2,"réinitialisation protégée contre les écritures concurrentes");
const restarted=timers.start(reset,{roundNumber:4,courtNumber:1,durationMinutes:10,startedBy:"organizer",now:5000});
assert.equal(restarted.timer.startedBy,"organizer","organisateur peut démarrer en secours");
assert.equal(restarted.timer.generation,3);
assert.equal(timers.alertKey("K7F2",restarted.timer),"K7F2:4:1:3","alerte unique par terrain et génération");
assert.equal(timers.alertKey("K7F2",restarted.timer),timers.alertKey("K7F2",restarted.timer),"aucune double alerte pour un même terrain");
assert.equal(timers.canWriteTimer({snapshot,sessionPlayerId:0,authUid:"viewer-a",ownerUid:"owner",existing:null,incoming:first.timer}),true,"serveur autorise le chrono du terrain courant");
assert.equal(timers.canWriteTimer({snapshot,sessionPlayerId:0,authUid:"viewer-a",ownerUid:"owner",existing:null,incoming:{...first.timer,courtNumber:2}}),false,"serveur refuse un autre terrain");
assert.equal(timers.canWriteTimer({snapshot,sessionPlayerId:0,authUid:"owner",ownerUid:"owner",existing:null,incoming:{...first.timer,startedBy:"organizer"}}),true,"organisateur autorisé en secours");

console.log("COURT_TIMERS_OK — démarrage joueur, concurrence, autorisation, reset, reprise et fin validés");
