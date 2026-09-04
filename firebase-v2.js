(function(root){
  "use strict";
  let db=null,auth=null,functions=null,proposalStop=null,eventStop=null,registrationStop=null;
  async function ready(){
    if(!root.firebase?.apps?.length&&root.LaTeamCloud?.observeOrganizerAuth)await root.LaTeamCloud.observeOrganizerAuth(()=>{});
    if(!root.firebase?.apps?.length)throw new Error("Firebase n’est pas encore initialisé.");
    db=root.firebase.firestore();auth=root.firebase.auth();functions=root.firebase.app().functions("europe-west1");
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
  function randomJoinCode(){const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",values=new Uint8Array(6);crypto.getRandomValues(values);return Array.from(values,v=>alphabet[v%alphabet.length]).join("");}
  async function ensureClubJoinCode(clubId){await organizer(clubId);const ref=db.collection("clubs").doc(clubId),snapshot=await ref.get();if(snapshot.data()?.playerJoinCode)return snapshot.data().playerJoinCode;const code=randomJoinCode();await ref.update({playerJoinCode:code,updatedAt:Date.now()});return code;}
  async function createPlayerAccount({email,password,displayName,clubId,joinCode}){
    await ready();if(!root.LaTeamAccounts.validEmail(email)||!root.LaTeamAccounts.validPassword(password)||!String(displayName||"").trim())throw new Error("Vérifiez le prénom, l’e-mail et le mot de passe.");
    const normalizedEmail=root.LaTeamAccounts.normalizeEmail(email),credential=root.firebase.auth.EmailAuthProvider.credential(normalizedEmail,password);let user=auth.currentUser;
    if(user?.isAnonymous)user=(await user.linkWithCredential(credential)).user;else if(!user)user=(await auth.createUserWithEmailAndPassword(normalizedEmail,password)).user;else if(user.email!==normalizedEmail)throw new Error("Un autre compte est déjà connecté.");
    await user.getIdToken?.(true);
    return ensurePlayerAccount({user,displayName,clubId,joinCode});
  }
  async function ensurePlayerAccount({user,displayName="",clubId="",joinCode=""}={}){
    await ready();user=user||await account();await user.getIdToken?.(true);const userRef=db.collection("users").doc(user.uid),existingDoc=await userRef.get(),existing=existingDoc.exists?existingDoc.data():{},existingPlayerId=existing.playerId||null;
    if(existingPlayerId){const saved=await db.collection("players").doc(existingPlayerId).get();if(saved.exists&&saved.data().ownerUid===user.uid)return {user,profile:saved.data(),clubId:existing.defaultClubId||"",repaired:false};}
    const fallbackName=String(user.displayName||existing.displayName||user.email?.split("@")[0]||"Joueur").trim(),name=String(displayName||fallbackName).trim(),selectedClub=String(clubId||"").trim(),defaultClubId=selectedClub||String(existing.defaultClubId||""),now=Date.now();
    const profile=root.LaTeamClubV2.playerProfile({playerId:existingPlayerId||undefined,ownerUid:user.uid,displayName:name,now}),batch=db.batch();batch.set(db.collection("players").doc(profile.playerId),profile);batch.set(userRef,{schemaVersion:2,email:root.LaTeamAccounts.normalizeEmail(user.email),displayName:profile.displayName,defaultClubId,playerId:profile.playerId,createdAt:Number(existing.createdAt||now),updatedAt:now});
    if(selectedClub){const clubPlayer=root.LaTeamClubV2.clubPlayer({player:profile,clubId:selectedClub,joinedWithCode:String(joinCode||"").toUpperCase()});batch.set(db.collection("clubs").doc(selectedClub).collection("players").doc(profile.playerId),clubPlayer);}await batch.commit();
    if(!selectedClub&&defaultClubId){try{const member=await db.collection("clubs").doc(defaultClubId).collection("members").doc(user.uid).get();if(member.exists&&member.data().status==="active"&&["owner","admin"].includes(member.data().role)){await db.collection("clubs").doc(defaultClubId).collection("players").doc(profile.playerId).set(root.LaTeamClubV2.clubPlayer({player:profile,clubId:defaultClubId}));}}catch(error){console.warn("Profil Joueur créé sans rattachement Club",error?.code||error?.message);}}
    return {user,profile,clubId:defaultClubId,repaired:existingDoc.exists};
  }
  async function signIn(email,password){await ready();return (await auth.signInWithEmailAndPassword(root.LaTeamAccounts.normalizeEmail(email),password)).user;}
  async function signOut(){await ready();await auth.signOut();}
  async function currentContext(){await ready();const user=auth.currentUser;if(!user||user.isAnonymous)return {user:null};const userDoc=await db.collection("users").doc(user.uid).get(),data=userDoc.exists?userDoc.data():null;let organizerClubs=[];try{const clubs=await db.collection("clubs").where("memberUids","array-contains",user.uid).get();organizerClubs=clubs.docs.map(doc=>({id:doc.id,...doc.data()}));}catch(error){if(!data?.playerId)throw error;}return {user,userData:data,playerId:data?.playerId||null,defaultClubId:data?.defaultClubId||null,organizerClubs};}
  async function listPlayerEvents(clubId){await account();const rows=await db.collection("clubs").doc(clubId).collection("events").orderBy("startsAt","asc").limit(100).get();return rows.docs.map(doc=>doc.data());}
  async function subscribeEvents(clubId,callback){await account();eventStop?.();eventStop=db.collection("clubs").doc(clubId).collection("events").orderBy("startsAt","asc").onSnapshot(snapshot=>callback(snapshot.docs.map(doc=>doc.data())),error=>callback([],error));return eventStop;}
  async function subscribeRegistrations(clubId,eventId,callback){await organizer(clubId);registrationStop?.();const ref=db.collection("clubs").doc(clubId).collection("events").doc(eventId);let eventData={},guests=[];const emit=()=>callback([...embeddedRegistrations(eventData).filter(row=>row.status!=="cancelled"),...guests]);const stopEvent=ref.onSnapshot(snapshot=>{eventData=snapshot.data()||{};emit();},error=>callback([],error)),stopGuests=ref.collection("registrations").where("status","in",["registered","waiting"]).onSnapshot(snapshot=>{guests=snapshot.docs.map(doc=>doc.data());emit();},error=>callback([],error));registrationStop=()=>{stopEvent();stopGuests();};return registrationStop;}
  const playerRegistrationField=uid=>`registration_${uid}`;
  const embeddedRegistrations=event=>Object.entries(event||{}).filter(([key])=>key.startsWith("registration_")).map(([,row])=>row).filter(Boolean);
  async function ensureRegistrationSlot(clubId,eventId,user,profile){const eventRef=db.collection("clubs").doc(clubId).collection("events").doc(eventId),field=playerRegistrationField(user.uid);await db.runTransaction(async transaction=>{const eventDoc=await transaction.get(eventRef);if(!eventDoc.exists)throw new Error("Événement introuvable.");if(eventDoc.data()[field])return;const now=Date.now(),row=root.LaTeamClubV2.registration({registrationId:`player_${profile.playerId}`,eventId,clubId,type:"registered",playerId:profile.playerId,displayName:profile.displayName,registeredByUid:user.uid,status:"cancelled",now});transaction.update(eventRef,{[field]:row,updatedAt:now});});}
  async function getMyRegistration(clubId,eventId){const user=await account(),event=await db.collection("clubs").doc(clubId).collection("events").doc(eventId).get();return event.exists?event.data()[playerRegistrationField(user.uid)]||null:null;}
  async function registerPlayerSpark(clubId,eventId){const user=await account(),profile=await getMyPlayerProfile();if(!profile)throw new Error("Profil joueur introuvable.");await ensureRegistrationSlot(clubId,eventId,user,profile);const eventRef=db.collection("clubs").doc(clubId).collection("events").doc(eventId),field=playerRegistrationField(user.uid);return db.runTransaction(async transaction=>{const eventDoc=await transaction.get(eventRef);if(!eventDoc.exists)throw new Error("Événement introuvable.");const event=eventDoc.data(),current=event[field];if(current&&current.status!=="cancelled")return current;if(event.registrationStatus!=="open")throw new Error("Les inscriptions sont fermées.");const registered=Number(event.registeredCount||0),waiting=Number(event.waitingCount||0),status=registered<event.capacity?"registered":"waiting",now=Math.max(Date.now(),Number(current.updatedAt||0)+1),row=root.LaTeamClubV2.registration({registrationId:`player_${profile.playerId}`,eventId,clubId,type:"registered",playerId:profile.playerId,displayName:profile.displayName,registeredByUid:user.uid,status,now});transaction.update(eventRef,{[field]:row,registeredCount:registered+(status==="registered"?1:0),waitingCount:waiting+(status==="waiting"?1:0),updatedAt:now});return row;});}
  async function cancelRegistrationSpark(clubId,eventId){const user=await account(),eventRef=db.collection("clubs").doc(clubId).collection("events").doc(eventId),field=playerRegistrationField(user.uid);return db.runTransaction(async transaction=>{const eventDoc=await transaction.get(eventRef);if(!eventDoc.exists)return null;const event=eventDoc.data(),old=event[field];if(!old||old.status==="cancelled")return null;const now=Math.max(Date.now(),Number(old.updatedAt||0)+1),row={...old,status:"cancelled",updatedAt:now};transaction.update(eventRef,{[field]:row,registeredCount:Number(event.registeredCount||0)-(old.status==="registered"?1:0),waitingCount:Number(event.waitingCount||0)-(old.status==="waiting"?1:0),updatedAt:now});return row;});}
  async function addGuestSpark(clubId,eventId,displayName){const {user}=await organizer(clubId),eventRef=db.collection("clubs").doc(clubId).collection("events").doc(eventId),registrationId=root.LaTeamClubV2.immutableId("guest"),registrationRef=eventRef.collection("registrations").doc(registrationId);return db.runTransaction(async transaction=>{const eventDoc=await transaction.get(eventRef);if(!eventDoc.exists)throw new Error("Événement introuvable.");const event=eventDoc.data(),registered=Number(event.registeredCount||0),waiting=Number(event.waitingCount||0),status=registered<event.capacity?"registered":"waiting",now=Date.now(),row=root.LaTeamClubV2.registration({registrationId,eventId,clubId,type:"guest",displayName,registeredByUid:user.uid,status,now});transaction.set(registrationRef,row);transaction.update(eventRef,{registeredCount:registered+(status==="registered"?1:0),waitingCount:waiting+(status==="waiting"?1:0),guestCount:Number(event.guestCount||0)+1,updatedAt:now});return row;});}
  async function registerPlayer(clubId,eventId,input){
    await account();const result=await functions.httpsCallable("registerForEvent")({clubId,eventId,...input});return result.data;
  }
  async function addGuest(clubId,eventId,displayName){const {user}=await organizer(clubId);return registerPlayer(clubId,eventId,{type:"guest",displayName,registeredByUid:user.uid});}
  async function listRegistrations(clubId,eventId){await organizer(clubId);const ref=db.collection("clubs").doc(clubId).collection("events").doc(eventId),[event,result]=await Promise.all([ref.get(),ref.collection("registrations").where("status","in",["registered","waiting"]).get()]);return [...embeddedRegistrations(event.data()).filter(row=>row.status!=="cancelled"),...result.docs.map(doc=>doc.data())];}
  async function listClubPlayers(clubId){await organizer(clubId);const rows=await db.collection("clubs").doc(clubId).collection("players").orderBy("normalizedName","asc").limit(300).get();return rows.docs.map(doc=>doc.data());}
  async function linkEventTournament(clubId,eventId,publicCode){await organizer(clubId);await db.collection("clubs").doc(clubId).collection("events").doc(eventId).update({tournamentId:publicCode,status:"live",registrationStatus:"closed",updatedAt:Date.now()});}
  async function getMyEventParticipant(clubId,eventId){const profile=await getMyPlayerProfile();if(!profile)return null;const rows=await db.collection("clubs").doc(clubId).collection("events").doc(eventId).collection("participants").where("playerId","==",profile.playerId).limit(1).get();return rows.empty?null:rows.docs[0].data();}
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
  root.LaTeamV2Cloud={createPlayerProfile,getMyPlayerProfile,getMyMatchHistory,addPlayerToClub,searchClubPlayers,listClubPlayers,createSeason,listSeasons,createEvent,listEvents,ensureClubJoinCode,createPlayerAccount,ensurePlayerAccount,signIn,signOut,currentContext,listPlayerEvents,subscribeEvents,subscribeRegistrations,getMyRegistration,registerPlayerSpark,cancelRegistrationSpark,addGuestSpark,listRegistrations,createParticipants,linkEventTournament,getMyEventParticipant,registerPlayer,addGuest,cancelRegistration,linkGuestRegistration,submitScoreProposal,listScoreProposals,subscribeScoreProposals,saveOfficialMatch,reviewScoreProposal,recordHistoricalCorrection,saveRoundSummary};
})(typeof window!=="undefined"?window:globalThis);
