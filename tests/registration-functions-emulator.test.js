#!/usr/bin/env node
const {initializeApp}=require("firebase/app");
const {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signOut}=require("firebase/auth");
const {getFunctions,connectFunctionsEmulator,httpsCallable}=require("firebase/functions");
const {initializeTestEnvironment}=require("@firebase/rules-unit-testing");
const {doc,setDoc,getDoc}=require("firebase/firestore");

const projectId="demo-la-team",now=1700000000000;
const app=initializeApp({projectId,apiKey:"demo",authDomain:"demo-la-team.firebaseapp.com"},`registration-${Date.now()}`),auth=getAuth(app),functions=getFunctions(app,"europe-west1");
connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});connectFunctionsEmulator(functions,"127.0.0.1",5001);
const call=(name,data)=>httpsCallable(functions,name)(data).then(result=>result.data);

(async()=>{
  const owner=(await createUserWithEmailAndPassword(auth,"owner@registration.test","Testing-1234")).user,env=await initializeTestEnvironment({projectId,firestore:{host:"127.0.0.1",port:8088}});
  await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();
    await setDoc(doc(db,"clubs/clubA"),{schemaVersion:1,clubId:"clubA",name:"Club A",ownerUid:owner.uid,memberUids:[owner.uid],status:"active",plan:"free",subscriptionStatus:"inactive",trialEndsAt:null,billingCustomerId:null,createdAt:now,updatedAt:now});
    await setDoc(doc(db,`clubs/clubA/members/${owner.uid}`),{schemaVersion:1,uid:owner.uid,role:"owner",email:owner.email,status:"active",createdAt:now,updatedAt:now});
    await setDoc(doc(db,"clubs/clubA/events/eventA"),{schemaVersion:2,eventId:"eventA",clubId:"clubA",seasonId:null,tournamentId:null,competitionType:"friendly",name:"King test",startsAt:now,plannedEndsAt:now+21600000,actualEndedAt:null,timezone:"Europe/Brussels",capacity:4,registrationStatus:"open",status:"registration",createdAt:now,updatedAt:now});
  });
  const registrations=[];for(const name of ["Invité A","Invité B","Invité C","Invité D","Invité E"])registrations.push(await call("registerForEvent",{clubId:"clubA",eventId:"eventA",type:"guest",displayName:name}));
  if(registrations.slice(0,4).some(row=>row.status!=="registered")||registrations[4].status!=="waiting")throw new Error("Capacité/liste d’attente non atomique");
  await call("cancelEventRegistration",{clubId:"clubA",eventId:"eventA",registrationId:registrations[0].registrationId});
  let promoted;await env.withSecurityRulesDisabled(async context=>{promoted=(await getDoc(doc(context.firestore(),`clubs/clubA/events/eventA/registrations/${registrations[4].registrationId}`))).data();});if(promoted.status!=="registered")throw new Error("La liste d’attente n’a pas été promue");
  await call("cancelEventRegistration",{clubId:"clubA",eventId:"eventA",registrationId:registrations[1].registrationId});
  await signOut(auth);const player=(await createUserWithEmailAndPassword(auth,"player@registration.test","Testing-1234")).user;
  await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();
    const profile={schemaVersion:2,playerId:"playerA",publicId:"LT-K7F2",ownerUid:player.uid,displayName:"Élise Martin",normalizedName:"elise martin",status:"active",createdAt:now,updatedAt:now};
    await setDoc(doc(db,`users/${player.uid}`),{schemaVersion:2,email:player.email,displayName:"Élise Martin",defaultClubId:"clubA",playerId:"playerA",createdAt:now,updatedAt:now});await setDoc(doc(db,"players/playerA"),profile);await setDoc(doc(db,"clubs/clubA/players/playerA"),{schemaVersion:2,clubId:"clubA",playerId:"playerA",ownerUid:player.uid,displayName:"Élise Martin",normalizedName:"elise martin",membershipStatus:"active",joinedAt:now,updatedAt:now});
  });
  const playerRegistration=await call("registerForEvent",{clubId:"clubA",eventId:"eventA",type:"registered",playerId:"playerA"});if(playerRegistration.status!=="registered")throw new Error("Place libérée non attribuée");
  let duplicateDenied=false;try{await call("registerForEvent",{clubId:"clubA",eventId:"eventA",type:"registered",playerId:"playerA"});}catch(error){duplicateDenied=error.code.includes("already-exists");}if(!duplicateDenied)throw new Error("Double inscription acceptée");
  let guestDenied=false;try{await call("registerForEvent",{clubId:"clubA",eventId:"eventA",type:"guest",displayName:"Intrus"});}catch(error){guestDenied=error.code.includes("permission-denied");}if(!guestDenied)throw new Error("Un joueur a ajouté un invité");
  await signOut(auth);const {signInWithEmailAndPassword}=require("firebase/auth");await signInWithEmailAndPassword(auth,"owner@registration.test","Testing-1234");
  await call("linkGuestRegistration",{clubId:"clubA",eventId:"eventA",registrationId:registrations[2].registrationId,playerId:"playerA"});
  let linked;await env.withSecurityRulesDisabled(async context=>{linked=(await getDoc(doc(context.firestore(),`clubs/clubA/events/eventA/registrations/${registrations[2].registrationId}`))).data();});
  if(linked.type!=="guest"||linked.playerId!==null||linked.linkedPlayerId!=="playerA"||!linked.linkedByUid)throw new Error("Rattachement explicite invalide");
  await env.cleanup();console.log("REGISTRATION_FUNCTIONS_OK — capacité, attente, désinscription, anti-doublon, invité et rattachement explicite validés");
})().catch(error=>{console.error(error);process.exitCode=1;});
