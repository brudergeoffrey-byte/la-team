#!/usr/bin/env node
const fs=require("node:fs");
const path=require("node:path");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const {doc,setDoc,getDoc,updateDoc,writeBatch}=require("firebase/firestore");

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

  const secondDevice=dbFor("organizerA");
  const recovered=await assertSucceeds(getDoc(doc(secondDevice,"clubs/clubA/tournaments/tour-1")));
  if(recovered.data().state.players.length!==4)throw new Error("Récupération deuxième appareil invalide");

  const newOwner=dbFor("newOwner","new@example.test"),batch=writeBatch(newOwner),newClub=club("clubNew","newOwner",["newOwner"]);
  batch.set(doc(newOwner,"users/newOwner"),{schemaVersion:1,email:"new@example.test",displayName:"",defaultClubId:"clubNew",createdAt:now,updatedAt:now});
  batch.set(doc(newOwner,"clubs/clubNew"),newClub);batch.set(doc(newOwner,"clubs/clubNew/members/newOwner"),member("newOwner","owner","new@example.test"));
  await assertSucceeds(batch.commit());

  const viewer=dbFor("viewer1",""),session={playerId:0,createdAt:now};
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(),"tournaments/K7F2")));
  await assertSucceeds(setDoc(doc(viewer,"tournaments/K7F2/viewerSessions/viewer1"),session));
  const timer={state:"running",roundNumber:1,courtNumber:1,durationMinutes:10,startedAt:now,endsAt:now+600000,startedBy:0,generation:1,updatedAt:now};
  await assertSucceeds(setDoc(doc(viewer,"tournaments/K7F2/courtTimers/1"),timer));
  await assertFails(setDoc(doc(viewer,"tournaments/K7F2/courtTimers/2"),{...timer,courtNumber:2}));
  await assertFails(updateDoc(doc(viewer,"tournaments/K7F2"),{revision:2,roundNumber:2}));
  await assertFails(updateDoc(doc(viewer,"tournaments/K7F2/viewerSessions/viewer1"),{playerId:2}));

  await env.cleanup();
  console.log("FIRESTORE_EMULATOR_OK — rôles, isolation multi-clubs, récupération et Viewer réellement appliqués");
})().catch(error=>{console.error(error);process.exitCode=1;});
