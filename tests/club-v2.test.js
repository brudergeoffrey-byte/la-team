#!/usr/bin/env node
const assert=require("node:assert/strict");
const model=require("../club-v2.js");

const now=1700000000000;
const profile=model.playerProfile({ownerUid:"uid-a",displayName:"  Élise   Martin ",now,playerId:"player_a",publicId:"LT-K7F2"});
assert.equal(profile.normalizedName,"elise martin");
assert.equal(profile.ownerUid,"uid-a");
assert.equal(JSON.stringify(profile).includes("email"),false,"profil sportif indépendant de l’e-mail");

const permanent=model.registration({registrationId:"reg-a",eventId:"event-a",clubId:"club-a",type:"registered",playerId:"player_a",displayName:"Élise",registeredByUid:"uid-a",now});
const guest=model.registration({registrationId:"reg-b",eventId:"event-a",clubId:"club-a",type:"guest",displayName:"Invité",registeredByUid:"organizer-a",now});
assert.equal(model.registrationStatus(31,32),"registered");
assert.equal(model.registrationStatus(32,32),"waiting");
assert.equal(guest.linkedPlayerId,null,"aucun rattachement automatique d’un invité");
const participants=model.participantsFromRegistrations([permanent,guest],{randomValues:[[1,2,3,4],[5,6,7,8]]});
assert.equal(participants[0].playerId,"player_a");
assert.equal(participants[1].playerId,null,"invité sans identité permanente");
assert.deepEqual(participants.map(row=>row.engineIndex),[0,1]);
assert.equal(model.participantByEngineIndex(participants,1).displayNameSnapshot,"Invité");
assert.deepEqual(model.enginePlayers(participants).map(player=>player.name),["Élise","Invité"]);

const season=model.season({seasonId:"season-a",clubId:"club-a",name:"Championnat 2026",label:"Saison 1",startsAt:now,endsAt:now+86400000,now});
assert.equal(season.scoring.scoringVersion,1);
assert.deepEqual(season.scoring.tieBreakers,["championshipPoints","averageDifference","wins"]);
assert.throws(()=>model.scoringConfig({winPoints:1,lossPoints:3}),/victoire/i);

const event=model.event({eventId:"event-a",clubId:"club-a",seasonId:"season-a",name:"Soirée 1",startsAt:now,now});
assert.equal(event.seasonId,"season-a");
assert.equal(event.competitionType,"championship");
const friendly=model.event({eventId:"event-friendly",clubId:"club-a",name:"Amical",startsAt:now,plannedEndsAt:now+6*3600000,now});
assert.equal(friendly.competitionType,"friendly");
assert.equal(friendly.seasonId,null);
const match=model.officialMatch({matchId:"match-a",clubId:"club-a",tournamentId:"tour-a",eventId:"event-a",seasonId:"season-a",roundNumber:1,courtNumber:1,teamA:["pa","pb"],teamB:["pc","pd"],teamAPlayerIds:["player_a"],teamBPlayerIds:["player_c","player_d"],scoreA:12,scoreB:8,validatedByUid:"organizer-a",now});
assert.deepEqual(match.playerIds,["player_a","player_c","player_d"]);
assert.equal(match.revision,1);
assert.throws(()=>model.officialMatch({...match,teamAPlayerIds:["same"],teamBPlayerIds:["same"]}),/deux équipes/i);

const proposal=model.scoreProposal({proposalId:"proposal-a",publicCode:"K7F2",clubId:"club-a",tournamentId:"tour-a",roundNumber:1,courtNumber:1,proposedByUid:"viewer-a",proposedByParticipantId:"pa",engineIndex:0,scoreA:12,scoreB:8,now});
assert.equal(proposal.status,"pending");
assert.equal(JSON.stringify(proposal).includes("ranking"),false);
const correction=model.historicalCorrection({clubId:"club-a",tournamentId:"tour-a",matchId:"match-a",actorUid:"owner-a",before:{scoreA:12,scoreB:8},after:{scoreA:11,scoreB:9},reason:"Feuille corrigée",now});
assert.equal(correction.movementPolicy,"preserve-played-rounds");
const round=model.roundSummary({clubId:"club-a",tournamentId:"tour-a",eventId:"event-a",seasonId:"season-a",roundNumber:2,byePlayerIds:["player_a","player_a"],validatedByUid:"organizer-a",now});
assert.deepEqual(round.byePlayerIds,["player_a"]);

console.log("CLUB_V2_OK — profils, invités, saisons versionnées, participants, propositions et audit validés");
