#!/usr/bin/env node
const assert=require("node:assert/strict");
const timer=require("../tournament-timer.js");

for(const minutes of [5,8,10,12,15,37,180]) assert.equal(timer.roundEndsAt("time",minutes,1000),1000+minutes*60000);
assert.equal(timer.roundEndsAt("points",10,1000),null);
assert.equal(timer.formatRemaining(452000),"07:32");
assert.equal(timer.formatRemaining(-20),"00:00");
assert.equal(timer.phase(32000,1000),"running");
assert.equal(timer.phase(30000,1000),"warning");
assert.equal(timer.phase(1000,1000),"ended");
assert.equal(timer.shouldAlert(4,1000,null,1000),true);
assert.equal(timer.shouldAlert(4,1000,4,1000),false,"aucun double son pour le même round");
assert.equal(timer.remainingMs(601000,301000),300000,"Viewer rejoignant au milieu du round");
assert.equal(timer.remainingMs(601000,700000),0,"réouverture après la fin reste à zéro");
console.log("TOURNAMENT_TIMER_OK — durées, synchronisation absolue, alerte unique et reprise validées");
