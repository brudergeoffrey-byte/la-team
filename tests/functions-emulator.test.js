#!/usr/bin/env node
const fs=require("node:fs");
const path=require("node:path");
const {initializeTestEnvironment,assertSucceeds}=require("@firebase/rules-unit-testing");
const {doc,setDoc,getDoc,updateDoc}=require("firebase/firestore");

const projectId="demo-la-team",now=1700000000000;
const rules=fs.readFileSync(path.resolve(__dirname,"../firestore.rules"),"utf8");
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

(async()=>{
  const env=await initializeTestEnvironment({projectId,firestore:{rules,host:"127.0.0.1",port:8088}});
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,"clubs/clubA"),{schemaVersion:1,clubId:"clubA",name:"Club A",ownerUid:"ownerA",memberUids:["ownerA"],status:"active",createdAt:now,updatedAt:now});
    await setDoc(doc(db,"clubs/clubA/members/ownerA"),{schemaVersion:1,uid:"ownerA",role:"owner",email:"owner@example.test",status:"active",createdAt:now,updatedAt:now});
    await setDoc(doc(db,"clubs/clubA/seasons/season-a"),{schemaVersion:2,seasonId:"season-a",clubId:"clubA",name:"Saison",label:"2026",startsAt:now,endsAt:now+86400000,timezone:"Europe/Brussels",status:"active",scoring:{scoringVersion:1,winPoints:3,lossPoints:1,minimumMatches:1,primary:"averageChampionshipPoints",tieBreakers:["championshipPoints","averageDifference","wins"]},scoringVersion:1,createdAt:now,updatedAt:now});
    await setDoc(doc(db,"clubs/clubA/tournaments/tour-a"),{schemaVersion:1,tournamentId:"tour-a",clubId:"clubA",ownerUid:"ownerA",createdByUid:"ownerA",publicCode:"K7F2",status:"live",roundNumber:1,updatedAt:now,state:{}});
  });
  const organizer=env.authenticatedContext("ownerA",{email:"owner@example.test"}).firestore();
  await assertSucceeds(setDoc(doc(organizer,"clubs/clubA/tournaments/tour-a/matches/match-a"),{schemaVersion:2,matchId:"match-a",clubId:"clubA",tournamentId:"tour-a",eventId:"event-a",seasonId:"season-a",roundNumber:1,courtNumber:1,teamA:["pa","pb"],teamB:["pc","pd"],teamAPlayerIds:["player-a","player-b"],teamBPlayerIds:["player-c","player-d"],playerIds:["player-a","player-b","player-c","player-d"],scoreA:11,scoreB:7,status:"validated",validatedByUid:"ownerA",validatedAt:now,revision:1}));
  let standing=null;
  for(let attempt=0;attempt<40&&!standing;attempt++){
    await pause(250);
    await env.withSecurityRulesDisabled(async context=>{const snapshot=await getDoc(doc(context.firestore(),"clubs/clubA/seasons/season-a/standings/player-a"));if(snapshot.exists)standing=snapshot.data();});
  }
  if(!standing)throw new Error("La fonction n’a pas produit le classement");
  if(standing.championshipPoints!==3||standing.wins!==1||standing.matches!==1||standing.rank!==1)throw new Error(`Classement serveur invalide: ${JSON.stringify(standing)}`);
  await assertSucceeds(updateDoc(doc(organizer,"clubs/clubA/tournaments/tour-a/matches/match-a"),{scoreA:6,scoreB:11,validatedAt:now+1,revision:2}));
  let corrected=null;
  for(let attempt=0;attempt<40;attempt++){await pause(250);await env.withSecurityRulesDisabled(async context=>{const snapshot=await getDoc(doc(context.firestore(),"clubs/clubA/seasons/season-a/standings/player-a"));if(snapshot.exists&&snapshot.data().revision!==2)corrected=snapshot.data();});if(corrected?.championshipPoints===1)break;}
  if(!corrected||corrected.matches!==1||corrected.wins!==0||corrected.losses!==1||corrected.championshipPoints!==1)throw new Error(`Correction non idempotente: ${JSON.stringify(corrected)}`);
  await assertSucceeds(updateDoc(doc(organizer,"clubs/clubA/tournaments/tour-a/matches/match-a"),{validatedAt:now+2,revision:3}));
  await pause(700);
  let replayed;await env.withSecurityRulesDisabled(async context=>{replayed=(await getDoc(doc(context.firestore(),"clubs/clubA/seasons/season-a/standings/player-a"))).data();});
  if(replayed.matches!==1||replayed.championshipPoints!==1)throw new Error("Le retraitement a doublé les statistiques");
  await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),"clubs/clubA/seasons/season-b"),{schemaVersion:2,seasonId:"season-b",clubId:"clubA",name:"Saison suivante",label:"2027",startsAt:now+90000000,endsAt:now+180000000,timezone:"Europe/Brussels",status:"active",scoring:{scoringVersion:1,winPoints:3,lossPoints:1,minimumMatches:1,primary:"averageChampionshipPoints",tieBreakers:["championshipPoints","averageDifference","wins"]},scoringVersion:1,createdAt:now,updatedAt:now});});
  await assertSucceeds(setDoc(doc(organizer,"clubs/clubA/tournaments/tour-a/matches/match-b"),{schemaVersion:2,matchId:"match-b",clubId:"clubA",tournamentId:"tour-a",eventId:"event-b",seasonId:"season-b",roundNumber:2,courtNumber:1,teamA:["pa","pb"],teamB:["pc","pd"],teamAPlayerIds:["player-a"],teamBPlayerIds:["player-c"],playerIds:["player-a","player-c"],scoreA:11,scoreB:5,status:"validated",validatedByUid:"ownerA",validatedAt:now+3,revision:1}));
  await pause(700);let oldSeason,newSeason;await env.withSecurityRulesDisabled(async context=>{oldSeason=(await getDoc(doc(context.firestore(),"clubs/clubA/seasons/season-a/standings/player-a"))).data();newSeason=(await getDoc(doc(context.firestore(),"clubs/clubA/seasons/season-b/standings/player-a"))).data();});
  if(oldSeason.matches!==1||oldSeason.championshipPoints!==1||newSeason.matches!==1||newSeason.championshipPoints!==3)throw new Error("Isolation entre saisons invalide");
  await env.cleanup();
  console.log("FUNCTIONS_EMULATOR_OK — calcul serveur, correction, idempotence et isolation des saisons validés");
})().catch(error=>{console.error(error);process.exitCode=1;});
