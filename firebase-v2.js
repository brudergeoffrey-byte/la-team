(function(root){
  "use strict";
  let db=null,auth=null,functions=null,proposalStop=null;
  async function ready(){
    if(!root.firebase?.apps?.length)throw new Error("Firebase n’est pas encore initialisé.");
    db=root.firebase.firestore();auth=root.firebase.auth();functions=root.firebase.functions("europe-west1");
    if(!auth.currentUser)await new Promise(resolve=>{const stop=auth.onAuthStateChanged(()=>{stop();resolve();},()=>resolve());});
    return {db,auth};
  }
  async function account(){await ready();const user=auth.currentUser;if(!user||user.isAnonymous)throw new Error("Un compte La Team est nécessaire.");return user;}
  async function organizer(clubId){
    const user=await account(),member=await db.collection("clubs").doc(clubId).collection("members").doc(user.uid).get();
    if(!member.exists||member.data().status!=="active"||!["owner","admin","organizer"].includes(member.data().role))throw new Error("Accès club refusé.");
    return {user,member:member.data()};
  }
  async function createPlayerProfile(displayName){
    const user=await account(),model=root.LaTeamClubV2.playerProfile({ownerUid:user.uid,displayName}),batch=db.batch();
    batch.set(db.collection("players").doc(model.playerId),model);
    batch.set(db.collection("users").doc(user.uid),{schemaVersion:2,playerId:model.playerId,displayName:model.displayName,updatedAt:Date.now()},{merge:true});
    await batch.commit();return model;
  }
  async function getMyPlayerProfile(){
    const user=await account(),userDoc=await db.collection("users").doc(user.uid).get(),playerId=userDoc.data()?.playerId;
    if(!playerId)return null;const profile=await db.collection("players").doc(playerId).get();return profile.exists?profile.data():null;
  }
  async function getMyMatchHistory(){
    const profile=await getMyPlayerProfile();if(!profile)return[];
    const snapshot=await db.collectionGroup("matches").where("playerIds","array-contains",profile.playerId).where("status","==","validated").get();
    return snapshot.docs.map(doc=>doc.data()).sort((a,b)=>Number(b.validatedAt||0)-Number(a.validatedAt||0));
  }
  async function addPlayerToClub(clubId,player){await organizer(clubId);const row=root.LaTeamClubV2.clubPlayer({player,clubId});await db.collection("clubs").doc(clubId).collection("players").doc(player.playerId).set(row);return row;}
  async function searchClubPlayers(clubId,query){
    await organizer(clubId);const prefix=root.LaTeamClubV2.normalizeName(query);if(!prefix)return[];
    const snapshot=await db.collection("clubs").doc(clubId).collection("players").where("normalizedName",">=",prefix).where("normalizedName","<=",`${prefix}\uf8ff`).limit(20).get();
    return snapshot.docs.map(doc=>doc.data());
  }
  async function createSeason(clubId,input){await organizer(clubId);const row=root.LaTeamClubV2.season({...input,clubId});await db.collection("clubs").doc(clubId).collection("seasons").doc(row.seasonId).set(row);return row;}
  async function listSeasons(clubId){await organizer(clubId);const rows=await db.collection("clubs").doc(clubId).collection("seasons").orderBy("startsAt","desc").limit(50).get();return rows.docs.map(doc=>doc.data());}
  async function createEvent(clubId,input){await organizer(clubId);const row=root.LaTeamClubV2.event({...input,clubId});await db.collection("clubs").doc(clubId).collection("events").doc(row.eventId).set(row);return row;}
  async function listEvents(clubId){await organizer(clubId);const rows=await db.collection("clubs").doc(clubId).collection("events").orderBy("startsAt","desc").limit(100).get();return rows.docs.map(doc=>doc.data());}
  async function registerPlayer(clubId,eventId,input){
    await account();const result=await functions.httpsCallable("registerForEvent")({clubId,eventId,...input});return result.data;
  }
  async function addGuest(clubId,eventId,displayName){const {user}=await organizer(clubId);return registerPlayer(clubId,eventId,{type:"guest",displayName,registeredByUid:user.uid});}
  async function listRegistrations(clubId,eventId){await organizer(clubId);const result=await db.collection("clubs").doc(clubId).collection("events").doc(eventId).collection("registrations").where("status","in",["registered","waiting"]).get();return result.docs.map(doc=>doc.data());}
  async function cancelRegistration(clubId,eventId,registrationId){await account();return (await functions.httpsCallable("cancelEventRegistration")({clubId,eventId,registrationId})).data;}
  async function linkGuestRegistration(clubId,eventId,registrationId,playerId){await organizer(clubId);return (await functions.httpsCallable("linkGuestRegistration")({clubId,eventId,registrationId,playerId})).data;}
  async function createParticipants(clubId,eventId,registrations){await organizer(clubId);const rows=root.LaTeamClubV2.participantsFromRegistrations(registrations),batch=db.batch(),base=db.collection("clubs").doc(clubId).collection("events").doc(eventId).collection("participants");rows.forEach(row=>batch.set(base.doc(row.participantId),row));await batch.commit();return rows;}
  async function submitScoreProposal(publicCode,input){
    await ready();if(!auth.currentUser)await auth.signInAnonymously();const row=root.LaTeamClubV2.scoreProposal({...input,publicCode,proposedByUid:auth.currentUser.uid});
    await db.collection("tournaments").doc(publicCode).collection("scoreProposals").doc(row.proposalId).set(row);return row;
  }
  async function listScoreProposals(publicCode){await account();const snapshot=await db.collection("tournaments").doc(publicCode).collection("scoreProposals").where("status","==","pending").get();return snapshot.docs.map(doc=>doc.data());}
  async function subscribeScoreProposals(publicCode,callback){
    await account();proposalStop?.();proposalStop=db.collection("tournaments").doc(publicCode).collection("scoreProposals").where("status","==","pending").onSnapshot(snapshot=>callback(snapshot.docs.map(doc=>doc.data())),()=>callback([]));return proposalStop;
  }
  async function saveOfficialMatch(clubId,tournamentId,input){
    const {user}=await organizer(clubId),row=root.LaTeamClubV2.officialMatch({...input,clubId,tournamentId,validatedByUid:user.uid});
    await db.collection("clubs").doc(clubId).collection("tournaments").doc(tournamentId).collection("matches").doc(row.matchId).set(row);return row;
  }
  async function reviewScoreProposal(publicCode,proposalId,status){
    if(!["accepted","rejected"].includes(status))throw new Error("Décision invalide.");
    await account();await db.collection("tournaments").doc(publicCode).collection("scoreProposals").doc(proposalId).update({status,updatedAt:Date.now()});
  }
  async function recordHistoricalCorrection(clubId,tournamentId,input){
    const {user}=await organizer(clubId),row=root.LaTeamClubV2.historicalCorrection({...input,clubId,tournamentId,actorUid:user.uid});
    await db.collection("clubs").doc(clubId).collection("tournaments").doc(tournamentId).collection("auditLog").doc(row.auditId).set(row);return row;
  }
  async function saveRoundSummary(clubId,tournamentId,input){
    const {user}=await organizer(clubId),row=root.LaTeamClubV2.roundSummary({...input,clubId,tournamentId,validatedByUid:user.uid});
    await db.collection("clubs").doc(clubId).collection("tournaments").doc(tournamentId).collection("roundSummaries").doc(String(row.roundNumber)).set(row);return row;
  }
  root.LaTeamV2Cloud={createPlayerProfile,getMyPlayerProfile,getMyMatchHistory,addPlayerToClub,searchClubPlayers,createSeason,listSeasons,createEvent,listEvents,registerPlayer,addGuest,listRegistrations,cancelRegistration,linkGuestRegistration,createParticipants,submitScoreProposal,listScoreProposals,subscribeScoreProposals,saveOfficialMatch,reviewScoreProposal,recordHistoricalCorrection,saveRoundSummary};
})(typeof window!=="undefined"?window:globalThis);
