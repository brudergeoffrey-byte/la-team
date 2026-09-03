#!/usr/bin/env node
const fs=require("node:fs");
const path=require("node:path");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const {doc,setDoc,getDoc,getDocs,updateDoc,writeBatch,serverTimestamp,collectionGroup,query,where}=require("firebase/firestore");

const projectId="demo-la-team";
const rules=fs.readFileSync(path.resolve(__dirname,"../firestore.rules"),"utf8");
const now=1700000000000;
const member=(uid,role,email=`${uid}@example.test`)=>({schemaVersion:1,uid,role,email,status:"active",createdAt:now,updatedAt:now});
const club=(id,ownerUid,members)=>({schemaVersion:1,clubId:id,name:id,ownerUid,memberUids:members,status:"active",createdAt:now,updatedAt:now});
const state={matchIndex:0,tournamentStatus:"live",players:[{name:"A"},{name:"B"},{name:"C"},{name:"D"}],schedule:[{courts:[{teamA:[0,1],teamB:[2,3]}],rest:[]}],sharedTournament:{code:"K7F2"}};
const privateTournament=(clubId,ownerUid,creator="ownerA")=>({schemaVersion:1,tournamentId:"tour-1",clubId,ownerUid,createdByUid:creator,publicCode:"K7F2",status:"live",roundNumber:1,updatedAt:now,state});
const publicTournament={schemaVersion:4,code:"K7F2",clubId:"clubA",ownerUid:"ownerA",revision:1,updatedAt:now,status:"live",mode:"americano",roundNumber:1,maxPoints:21,endMode:"time",roundDurationMinutes:10,players:[{id:0,name:"A"},{id:1,name:"B"},{id:2,name:"C"},{id:3,name:"D"}],currentRound:{rest:[],courts:[{number:1,teamA:[0,1],teamB:[2,3],necessaryDuplicate:false,validated:false,score:null,destinations:{}}]},ranking:[0,1,2,3].map((id,index)=>({position:index+1,diff:0,id,name:["A","B","C","D"][id],matches:0,wins:0,plus:0,minus:0})),previousResults:[]};

(async()=>{
  const env=await initializeTestEnvironment({projectId,firestore:{rules,host:"127.0.0.1",port:8088}});
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,"clubs/clubA"),club("clubA","ownerA",["ownerA","adminA","organizerA"]));
    await setDoc(doc(db,"clubs/clubA/members/ownerA"),member("ownerA","owner"));
    await setDoc(doc(db,"clubs/clubA/members/adminA"),member("adminA","admin"));
    await setDoc(doc(db,"clubs/clubA/members/organizerA"),member("organizerA","organizer"));
    await setDoc(doc(db,"clubs/clubA/tournaments/tour-1"),privateTournament("clubA","ownerA"));
    await setDoc(doc(db,"clubs/clubB"),club("clubB","ownerB",["ownerB"]));
    await setDoc(doc(db,"clubs/clubB/members/ownerB"),member("ownerB","owner"));
    await setDoc(doc(db,"clubs/clubB/tournaments/tour-1"),privateTournament("clubB","ownerB","ownerB"));
    await setDoc(doc(db,"tournaments/K7F2"),publicTournament);
  });
  const dbFor=(uid,email=`${uid}@example.test`)=>env.authenticatedContext(uid,{email}).firestore();
  for(const uid of ["ownerA","adminA","organizerA"]){
    await assertSucceeds(getDoc(doc(dbFor(uid),"clubs/clubA/tournaments/tour-1")));
    await assertSucceeds(updateDoc(doc(dbFor(uid),"clubs/clubA/tournaments/tour-1"),{updatedAt:now+1,roundNumber:2}));
  }
  await assertFails(getDoc(doc(dbFor("ownerA"),"clubs/clubB/tournaments/tour-1")));
  await assertFails(getDoc(doc(dbFor("outsider"),"clubs/clubA/tournaments/tour-1")));
  await assertFails(updateDoc(doc(dbFor("organizerA"),"clubs/clubA/members/organizerA"),{role:"admin",updatedAt:now+2}));
  await assertFails(updateDoc(doc(dbFor("adminA"),"clubs/clubA/members/adminA"),{role:"owner",updatedAt:now+2}));
  await assertFails(setDoc(doc(dbFor("organizerA"),"clubs/clubB/tournaments/intrusion"),{...privateTournament("clubB","ownerB","organizerA"),tournamentId:"intrusion"}));
  const ownerDb=dbFor("ownerA"),ownerBatch=writeBatch(ownerDb);ownerBatch.update(doc(ownerDb,"clubs/clubA"),{memberUids:["ownerA","adminA","organizerA","adminNew"],updatedAt:now+3});ownerBatch.set(doc(ownerDb,"clubs/clubA/members/adminNew"),member("adminNew","admin"));await assertSucceeds(ownerBatch.commit());
  const adminDb=dbFor("adminA"),adminBatch=writeBatch(adminDb);adminBatch.update(doc(adminDb,"clubs/clubA"),{memberUids:["ownerA","adminA","organizerA","adminNew","organizerNew"],updatedAt:now+4});adminBatch.set(doc(adminDb,"clubs/clubA/members/organizerNew"),member("organizerNew","organizer"));await assertSucceeds(adminBatch.commit());
  await assertFails(setDoc(doc(dbFor("adminA"),"clubs/clubA/members/adminForbidden"),member("adminForbidden","admin")));

  const playerDb=dbFor("playerA","player@example.test"),playerBatch=writeBatch(playerDb);
  const playerProfile={schemaVersion:2,playerId:"player_a",publicId:"LT-K7F2",ownerUid:"playerA",displayName:"Élise",normalizedName:"elise",status:"active",createdAt:now,updatedAt:now};
  playerBatch.set(doc(playerDb,"players/player_a"),playerProfile);
  playerBatch.set(doc(playerDb,"users/playerA"),{schemaVersion:2,email:"player@example.test",displayName:"Élise",defaultClubId:"clubA",playerId:"player_a",createdAt:now,updatedAt:now});
  await assertSucceeds(playerBatch.commit());
  await assertFails(setDoc(doc(dbFor("outsider","outsider@example.test"),"users/outsider"),{schemaVersion:2,email:"outsider@example.test",displayName:"Intrus",defaultClubId:"clubA",playerId:"player_a",createdAt:now,updatedAt:now}));
  const clubPlayer={schemaVersion:2,clubId:"clubA",playerId:"player_a",ownerUid:"playerA",displayName:"Élise",normalizedName:"elise",membershipStatus:"active",joinedAt:now,updatedAt:now};
  await assertSucceeds(setDoc(doc(dbFor("adminA"),"clubs/clubA/players/player_a"),clubPlayer));
  await assertFails(setDoc(doc(dbFor("organizerA"),"clubs/clubA/players/player_x"),{...clubPlayer,playerId:"player_x",ownerUid:"organizerA"}));
  const scoring={scoringVersion:1,winPoints:3,lossPoints:1,minimumMatches:4,primary:"averageChampionshipPoints",tieBreakers:["championshipPoints","averageDifference","wins"]};
  const season={schemaVersion:2,seasonId:"season-a",clubId:"clubA",name:"Championnat",label:"2026",startsAt:now,endsAt:now+86400000,timezone:"Europe/Brussels",status:"draft",scoring,scoringVersion:1,createdAt:now,updatedAt:now};
  await assertSucceeds(setDoc(doc(dbFor("adminA"),"clubs/clubA/seasons/season-a"),season));
  await assertFails(setDoc(doc(dbFor("organizerA"),"clubs/clubA/seasons/season-b"),{...season,seasonId:"season-b"}));
  await assertFails(setDoc(doc(dbFor("adminA"),"clubs/clubA/seasons/season-bad"),{...season,seasonId:"season-bad",scoring:{...scoring,winPoints:1,lossPoints:3}}));
  const event={schemaVersion:2,eventId:"event-a",clubId:"clubA",seasonId:"season-a",tournamentId:"tour-1",name:"Soirée",startsAt:now,plannedEndsAt:null,actualEndedAt:null,timezone:"Europe/Brussels",capacity:16,registrationStatus:"open",status:"draft",createdAt:now,updatedAt:now};
  await assertSucceeds(setDoc(doc(dbFor("organizerA"),"clubs/clubA/events/event-a"),event));
  const registration={schemaVersion:2,registrationId:"reg-a",eventId:"event-a",clubId:"clubA",type:"registered",playerId:"player_a",displayName:"Élise",normalizedName:"elise",status:"registered",registeredByUid:"playerA",createdAt:now,updatedAt:now};
  await assertSucceeds(setDoc(doc(playerDb,"clubs/clubA/events/event-a/registrations/reg-a"),registration));
  await assertFails(setDoc(doc(dbFor("outsider"),"clubs/clubA/events/event-a/registrations/guest-x"),{...registration,registrationId:"guest-x",type:"guest",playerId:null,registeredByUid:"outsider"}));
  const guest={...registration,registrationId:"guest-a",type:"guest",playerId:null,displayName:"Invité",normalizedName:"invite",registeredByUid:"organizerA"};
  await assertSucceeds(setDoc(doc(dbFor("organizerA"),"clubs/clubA/events/event-a/registrations/guest-a"),guest));
  const participant={schemaVersion:2,participantId:"participant-a",registrationId:"reg-a",playerId:"player_a",displayNameSnapshot:"Élise",type:"registered",engineIndex:0};
  await assertSucceeds(setDoc(doc(dbFor("organizerA"),"clubs/clubA/events/event-a/participants/participant-a"),participant));
  await assertFails(setDoc(doc(playerDb,"clubs/clubA/seasons/season-a/standings/player_a"),{playerId:"player_a",matches:1}));
  const officialMatch={schemaVersion:2,matchId:"match-a",clubId:"clubA",tournamentId:"tour-1",eventId:"event-a",seasonId:"season-a",roundNumber:1,courtNumber:1,teamA:["participant-a","guest-a"],teamB:["participant-c","participant-d"],teamAPlayerIds:["player_a"],teamBPlayerIds:[],playerIds:["player_a"],scoreA:12,scoreB:8,status:"validated",validatedByUid:"organizerA",validatedAt:now,revision:1};
  await assertSucceeds(setDoc(doc(dbFor("organizerA"),"clubs/clubA/tournaments/tour-1/matches/match-a"),officialMatch));
  await assertSucceeds(getDoc(doc(playerDb,"clubs/clubA/tournaments/tour-1/matches/match-a")));
  const ownHistory=await assertSucceeds(getDocs(query(collectionGroup(playerDb,"matches"),where("playerIds","array-contains","player_a"),where("status","==","validated"))));
  if(ownHistory.size!==1)throw new Error("Historique joueur incomplet");
  await assertFails(getDoc(doc(dbFor("outsider"),"clubs/clubA/tournaments/tour-1/matches/match-a")));
  await assertFails(setDoc(doc(playerDb,"clubs/clubA/tournaments/tour-1/matches/forged"),{...officialMatch,matchId:"forged",validatedByUid:"playerA"}));

  const secondDevice=dbFor("organizerA");
  const recovered=await assertSucceeds(getDoc(doc(secondDevice,"clubs/clubA/tournaments/tour-1")));
  if(recovered.data().state.players.length!==4)throw new Error("Récupération deuxième appareil invalide");

  const newOwner=dbFor("newOwner","new@example.test"),batch=writeBatch(newOwner),newClub=club("clubNew","newOwner",["newOwner"]);
  batch.set(doc(newOwner,"users/newOwner"),{schemaVersion:1,email:"new@example.test",displayName:"",defaultClubId:"clubNew",createdAt:now,updatedAt:now});
  batch.set(doc(newOwner,"clubs/clubNew"),newClub);batch.set(doc(newOwner,"clubs/clubNew/members/newOwner"),member("newOwner","owner","new@example.test"));
  await assertSucceeds(batch.commit());

  const viewer=dbFor("viewer1",""),session={playerId:0,createdAt:now};
  const viewer2=dbFor("viewer2","");
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(),"tournaments/K7F2")));
  await assertSucceeds(setDoc(doc(viewer,"tournaments/K7F2/viewerSessions/viewer1"),session));
  await assertSucceeds(setDoc(doc(viewer2,"tournaments/K7F2/viewerSessions/viewer2"),{playerId:1,createdAt:now}));
  await assertSucceeds(setDoc(doc(dbFor("ownerA"),"tournaments/K7F2/roundTimer/current"),{state:"idle",roundNumber:1,durationMinutes:10,roundStartedAt:null,startedBy:null,viewerStartConsumed:false,generation:0,updatedAt:serverTimestamp()}));
  const timer={state:"running",roundNumber:1,durationMinutes:10,roundStartedAt:serverTimestamp(),startedBy:"organizer",viewerStartConsumed:true,generation:1,updatedAt:serverTimestamp()};
  await assertFails(setDoc(doc(viewer,"tournaments/K7F2/roundTimer/current"),{...timer,startedBy:0}));
  await assertFails(setDoc(doc(viewer2,"tournaments/K7F2/roundTimer/current"),{...timer,startedBy:1}));
  await assertSucceeds(setDoc(doc(dbFor("organizerA"),"tournaments/K7F2/roundTimer/current"),timer));
  await assertFails(updateDoc(doc(viewer,"tournaments/K7F2/roundTimer/current"),{generation:2,roundStartedAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(viewer,"tournaments/K7F2/roundTimer/current"),{state:"idle",roundStartedAt:null,startedBy:null,generation:2,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(viewer,"tournaments/K7F2/roundTimer/current"),{durationMinutes:20,generation:2,roundStartedAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(viewer,"tournaments/K7F2/courtTimers/1"),{legacy:true}));
  const proposal={schemaVersion:2,proposalId:"proposal-a",publicCode:"K7F2",clubId:"clubA",tournamentId:"tour-1",roundNumber:1,courtNumber:1,proposedByUid:"viewer1",proposedByParticipantId:"participant-a",engineIndex:0,scoreA:12,scoreB:8,status:"pending",createdAt:now,updatedAt:now};
  await assertSucceeds(setDoc(doc(viewer,"tournaments/K7F2/scoreProposals/proposal-a"),proposal));
  await assertFails(setDoc(doc(viewer2,"tournaments/K7F2/scoreProposals/proposal-forged"),{...proposal,proposalId:"proposal-forged",proposedByUid:"viewer2",engineIndex:7}));
  await assertFails(updateDoc(doc(viewer,"tournaments/K7F2/scoreProposals/proposal-a"),{scoreA:20,updatedAt:now+1}));
  await assertSucceeds(updateDoc(doc(dbFor("organizerA"),"tournaments/K7F2/scoreProposals/proposal-a"),{status:"accepted",updatedAt:now+1}));
  const ownerTimer={state:"idle",roundNumber:1,durationMinutes:10,roundStartedAt:null,startedBy:null,viewerStartConsumed:true,generation:2,updatedAt:serverTimestamp()};
  await assertSucceeds(setDoc(doc(dbFor("ownerA"),"tournaments/K7F2/roundTimer/current"),ownerTimer));
  await assertFails(setDoc(doc(viewer,"tournaments/K7F2/roundTimer/current"),{...timer,generation:3}));
  await assertSucceeds(setDoc(doc(dbFor("ownerA"),"tournaments/K7F2/roundTimer/current"),{...timer,generation:3}));
  await assertFails(updateDoc(doc(viewer,"tournaments/K7F2"),{revision:2,roundNumber:2}));
  await assertFails(updateDoc(doc(viewer,"tournaments/K7F2/viewerSessions/viewer1"),{playerId:2}));

  await env.cleanup();
  console.log("FIRESTORE_EMULATOR_OK — V2, rôles, isolation, profils, propositions, statistiques fermées, timer et Viewer validés");
})().catch(error=>{console.error(error);process.exitCode=1;});
