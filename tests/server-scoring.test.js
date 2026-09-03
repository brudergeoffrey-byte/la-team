#!/usr/bin/env node
const assert=require("node:assert/strict");
const {computeStandings,validateScoring}=require("../functions/src/scoring.js");

const config={scoringVersion:1,winPoints:3,lossPoints:1,minimumMatches:2,primary:"averageChampionshipPoints",tieBreakers:["championshipPoints","averageDifference","wins"]};
validateScoring(config);
const matches=[
  {status:"validated",eventId:"e1",teamAPlayerIds:["a","b"],teamBPlayerIds:["c","d"],scoreA:10,scoreB:5},
  {status:"validated",eventId:"e1",teamAPlayerIds:["a","c"],teamBPlayerIds:["b","d"],scoreA:8,scoreB:10},
  {status:"validated",eventId:"e2",teamAPlayerIds:["a"],teamBPlayerIds:["b"],scoreA:9,scoreB:7},
  {status:"draft",teamAPlayerIds:["a"],teamBPlayerIds:["d"],scoreA:99,scoreB:0},
  {status:"validated",teamAPlayerIds:[],teamBPlayerIds:[],scoreA:12,scoreB:4}
];
const standings=computeStandings(matches,config,[{eventId:"e2",byePlayerIds:["c","guestless"]}]),byId=Object.fromEntries(standings.map(row=>[row.playerId,row]));
assert.equal(byId.a.matches,3);assert.equal(byId.a.wins,2);assert.equal(byId.a.championshipPoints,7);assert.equal(byId.a.eligible,true);
assert.equal(byId.b.matches,3);assert.equal(byId.b.championshipPoints,7);
assert.equal(byId.c.matches,2);assert.equal(byId.d.matches,2);
assert.equal(byId.c.byes,1);assert.equal(byId.guestless.matches,0);assert.equal(byId.guestless.byes,1);
assert.equal(byId.a.events,2);assert.equal(byId.a.partnerCounts.b,1);assert.equal(byId.a.opponentCounts.b,2);
assert.equal(standings[0].playerId,"a","moyenne championnat puis départages");
assert.ok(standings.every(row=>row.scoringVersion===1));
assert.throws(()=>computeStandings(matches,{...config,scoringVersion:99}),/Version/);
assert.throws(()=>computeStandings([{status:"validated",teamAPlayerIds:["x"],teamBPlayerIds:["x"],scoreA:2,scoreB:1}],config),/deux équipes/i);

console.log("SERVER_SCORING_OK — barème versionné, invités exclus et classement déterministe validés");
