"use strict";

const {initializeApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {onDocumentWritten}=require("firebase-functions/v2/firestore");
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {computeStandings}=require("./src/scoring");

initializeApp();

const REGION="europe-west1";
const FUNCTION_OPTIONS=Object.freeze({region:REGION,maxInstances:3});
const ORGANIZER_ROLES=new Set(["owner","admin","organizer"]);

function text(value,max=120){return String(value||"").trim().replace(/\s+/g," ").slice(0,max);}
function normalized(value){return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function requireAuth(request){if(!request.auth?.uid)throw new HttpsError("unauthenticated","Connexion requise.");return request.auth.uid;}
async function memberRole(db,clubId,uid){
  const member=await db.doc(`clubs/${clubId}/members/${uid}`).get();
  return member.exists&&member.data().status==="active"?member.data().role:null;
}
function registrationId(db,clubId,eventId){return db.collection(`clubs/${clubId}/events/${eventId}/registrations`).doc();}

exports.registerForEvent=onCall(FUNCTION_OPTIONS,async request=>{
  const uid=requireAuth(request),db=getFirestore(),clubId=text(request.data?.clubId,80),eventId=text(request.data?.eventId,80),type=request.data?.type;
  if(!clubId||!eventId||!["registered","guest"].includes(type))throw new HttpsError("invalid-argument","Inscription invalide.");
  const eventRef=db.doc(`clubs/${clubId}/events/${eventId}`),registrations=db.collection(`clubs/${clubId}/events/${eventId}/registrations`),ref=registrationId(db,clubId,eventId);
  const role=await memberRole(db,clubId,uid),organizer=ORGANIZER_ROLES.has(role);
  let playerId=null,displayName="";
  if(type==="guest"){
    if(!organizer)throw new HttpsError("permission-denied","Seul un organisateur peut ajouter un invité.");
    displayName=text(request.data?.displayName,80);if(!displayName)throw new HttpsError("invalid-argument","Nom invité requis.");
  }else{
    playerId=text(request.data?.playerId,100);
    const [userDoc,playerDoc,clubPlayerDoc]=await Promise.all([db.doc(`users/${uid}`).get(),db.doc(`players/${playerId}`).get(),db.doc(`clubs/${clubId}/players/${playerId}`).get()]);
    const ownsPlayer=userDoc.exists&&userDoc.data().playerId===playerId&&playerDoc.exists&&playerDoc.data().ownerUid===uid;
    if(!organizer&&!ownsPlayer)throw new HttpsError("permission-denied","Ce profil joueur ne vous appartient pas.");
    if(!playerDoc.exists||!clubPlayerDoc.exists||clubPlayerDoc.data().membershipStatus!=="active"||clubPlayerDoc.data().ownerUid!==playerDoc.data().ownerUid)throw new HttpsError("failed-precondition","Joueur non rattaché à ce club.");
    displayName=text(clubPlayerDoc.data().displayName,80);
  }
  return db.runTransaction(async transaction=>{
    const eventDoc=await transaction.get(eventRef);
    if(!eventDoc.exists)throw new HttpsError("not-found","Événement introuvable.");
    const event=eventDoc.data();
    if(event.clubId!==clubId||event.registrationStatus!=="open"||!["draft","registration"].includes(event.status))throw new HttpsError("failed-precondition","Les inscriptions sont fermées.");
    const activeQuery=registrations.where("status","==","registered"),active=await transaction.get(activeQuery);
    const duplicateQuery=type==="registered"?registrations.where("playerId","==",playerId):null;
    if(duplicateQuery){const duplicates=await transaction.get(duplicateQuery);if(duplicates.docs.some(doc=>doc.data().status!=="cancelled"))throw new HttpsError("already-exists","Ce joueur est déjà inscrit.");}
    const status=active.size<Number(event.capacity)?"registered":"waiting",now=FieldValue.serverTimestamp();
    transaction.create(ref,{schemaVersion:2,registrationId:ref.id,eventId,clubId,type,playerId,displayName,normalizedName:normalized(displayName),status,linkedPlayerId:null,linkedByUid:null,linkedAt:null,registeredByUid:uid,createdAt:now,updatedAt:now});
    return {registrationId:ref.id,status};
  });
});

exports.cancelEventRegistration=onCall(FUNCTION_OPTIONS,async request=>{
  const uid=requireAuth(request),db=getFirestore(),clubId=text(request.data?.clubId,80),eventId=text(request.data?.eventId,80),id=text(request.data?.registrationId,100),registrations=db.collection(`clubs/${clubId}/events/${eventId}/registrations`),ref=registrations.doc(id);
  const role=await memberRole(db,clubId,uid),organizer=ORGANIZER_ROLES.has(role);
  let promotedRegistrationId=null;
  await db.runTransaction(async transaction=>{const doc=await transaction.get(ref);if(!doc.exists)throw new HttpsError("not-found","Inscription introuvable.");const row=doc.data();if(!organizer&&row.registeredByUid!==uid)throw new HttpsError("permission-denied","Désinscription refusée.");let promoted=null;if(row.status==="registered"){const waiting=await transaction.get(registrations.where("status","==","waiting"));promoted=waiting.docs.sort((a,b)=>(a.data().createdAt?.toMillis?.()||0)-(b.data().createdAt?.toMillis?.()||0))[0]||null;}const updatedAt=FieldValue.serverTimestamp();transaction.update(ref,{status:"cancelled",updatedAt});if(promoted){promotedRegistrationId=promoted.id;transaction.update(promoted.ref,{status:"registered",updatedAt});}});
  return {status:"cancelled",promotedRegistrationId};
});

exports.linkGuestRegistration=onCall(FUNCTION_OPTIONS,async request=>{
  const uid=requireAuth(request),db=getFirestore(),clubId=text(request.data?.clubId,80),eventId=text(request.data?.eventId,80),id=text(request.data?.registrationId,100),playerId=text(request.data?.playerId,100);
  if(!ORGANIZER_ROLES.has(await memberRole(db,clubId,uid)))throw new HttpsError("permission-denied","Accès organisateur requis.");
  const ref=db.doc(`clubs/${clubId}/events/${eventId}/registrations/${id}`),playerRef=db.doc(`clubs/${clubId}/players/${playerId}`);
  await db.runTransaction(async transaction=>{const [registration,player]=await Promise.all([transaction.get(ref),transaction.get(playerRef)]);if(!registration.exists||registration.data().type!=="guest")throw new HttpsError("failed-precondition","Participation invitée invalide.");if(!player.exists||player.data().membershipStatus!=="active")throw new HttpsError("failed-precondition","Profil joueur invalide.");transaction.update(ref,{linkedPlayerId:playerId,linkedByUid:uid,linkedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});});
  return {linkedPlayerId:playerId};
});

async function rebuild(event){
    const changed=event.data.after.exists?event.data.after.data():event.data.before.data();
    const {clubId}=event.params,seasonId=changed?.seasonId;
    if(!seasonId)return;
    const db=getFirestore(),seasonRef=db.doc(`clubs/${clubId}/seasons/${seasonId}`),seasonDoc=await seasonRef.get();
    if(!seasonDoc.exists)throw new Error("Saison introuvable");
    const season=seasonDoc.data();
    if(season.clubId!==clubId)throw new Error("Saison hors club");
    const [matchSnapshot,roundSnapshot]=await Promise.all([
      db.collectionGroup("matches").where("clubId","==",clubId).where("seasonId","==",seasonId).where("status","==","validated").get(),
      db.collectionGroup("roundSummaries").where("clubId","==",clubId).where("seasonId","==",seasonId).get()
    ]);
    const matches=matchSnapshot.docs.map(doc=>doc.data()),rounds=roundSnapshot.docs.map(doc=>doc.data()),standings=computeStandings(matches,season.scoring,rounds),batch=db.batch(),standingCollection=seasonRef.collection("standings");
    const recalculatedAt=FieldValue.serverTimestamp();
    for(const row of standings){
      batch.set(standingCollection.doc(row.playerId),{...row,clubId,seasonId,recalculatedAt});
    }
    const current=await standingCollection.get(),activeIds=new Set(standings.map(row=>row.playerId));
    current.docs.filter(doc=>!activeIds.has(doc.id)).forEach(doc=>batch.delete(doc.ref));
    await batch.commit();
}

exports.rebuildSeasonStandings=onDocumentWritten({...FUNCTION_OPTIONS,document:"clubs/{clubId}/tournaments/{tournamentId}/matches/{matchId}"},rebuild);
exports.rebuildSeasonStandingsForByes=onDocumentWritten({...FUNCTION_OPTIONS,document:"clubs/{clubId}/tournaments/{tournamentId}/roundSummaries/{roundNumber}"},rebuild);
