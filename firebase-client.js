(function(root){
  "use strict";
  const SDK_VERSION="10.14.1";
  const SDK_URLS=[
    `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-compat.js`,
    `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth-compat.js`,
    `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore-compat.js`
  ];
  const PENDING_KEY="la-team-publication-pending-v1";
  let api=null, sdkPromise=null, db=null, auth=null, publishTimer=null, privateTimer=null, viewerUnsubscribe=null,timerUnsubscribe=null,authUnsubscribe=null;

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector?.(`script[data-firebase-src="${src}"]`);
      if(existing){ existing.addEventListener("load",resolve,{once:true}); existing.addEventListener("error",reject,{once:true}); return; }
      const script=document.createElement("script");
      script.src=src; script.dataset.firebaseSrc=src; script.async=false;
      script.onload=resolve; script.onerror=()=>reject(new Error("Firebase indisponible"));
      document.head.appendChild(script);
    });
  }

  async function ensureSdk(){
    if(root.firebase?.apps?.length){
      db=root.firebase.firestore(); auth=root.firebase.auth(); return;
    }
    if(!sdkPromise) sdkPromise=(async()=>{
      for(const src of SDK_URLS) await loadScript(src);
      root.firebase.initializeApp(root.LaTeamSharing.FIREBASE_CONFIG);
      db=root.firebase.firestore(); auth=root.firebase.auth();
      await auth.setPersistence?.(root.firebase.auth.Auth.Persistence.LOCAL);
      try{ await db.enablePersistence({synchronizeTabs:true}); }catch(error){
        if(!["failed-precondition","unimplemented"].includes(error?.code)) throw error;
      }
    })();
    return sdkPromise;
  }

  async function organizerUser(){
    await ensureSdk();
    await waitForAuthReady();
    const user=auth.currentUser;
    if(!user||user.isAnonymous)throw Object.assign(new Error("Connectez-vous avec un compte Organisateur."),{code:"organizer-auth-required"});
    return user;
  }

  async function viewerUser(){
    await ensureSdk();
    await waitForAuthReady();
    if(auth.currentUser)return auth.currentUser;
    return (await auth.signInAnonymously()).user;
  }

  async function waitForAuthReady(){
    if(auth.currentUser)return auth.currentUser;
    if(typeof auth.authStateReady==="function"){await auth.authStateReady();return auth.currentUser;}
    return new Promise(resolve=>{let stop=null;stop=auth.onAuthStateChanged(user=>{stop?.();resolve(user);},()=>resolve(null));});
  }

  function viewerUrl(code){
    const base=new URL("./",root.location.href);
    base.search=""; base.hash="";
    base.searchParams.set("t",code);
    return base.toString();
  }

  function pendingSnapshot(snapshot){
    try{ root.localStorage.setItem(PENDING_KEY,JSON.stringify(snapshot)); }catch(error){}
  }
  function clearPending(){ try{ root.localStorage.removeItem(PENDING_KEY); }catch(error){} }
  function readPending(){
    try{ return JSON.parse(root.localStorage.getItem(PENDING_KEY)||"null"); }catch(error){ return null; }
  }

  async function writeSnapshot(snapshot){
    const user=await organizerUser();
    if(snapshot.schemaVersion<4&&snapshot.ownerUid!==user.uid) throw new Error("Cette identité ne possède pas ce tournoi partagé.");
    await db.collection("tournaments").doc(snapshot.code).set(snapshot);
    clearPending();
    api?.onShareStatus?.({state:"synced",snapshot});
  }

  async function createSharedTournament(){
    if(root.navigator?.onLine===false) throw new Error("Une connexion est nécessaire uniquement pour activer le partage la première fois.");
    const state=api.getState();
    if(state.sharedTournament?.code){ await publishNow(); await ensureRoundTimer(state.sharedTournament.code); subscribeRoundTimer(state.sharedTournament.code); return state.sharedTournament; }
    const user=await organizerUser();
    if(!state.clubId)throw new Error("Sélectionnez d’abord votre club.");
    const clubDoc=await db.collection("clubs").doc(state.clubId).get();
    if(!clubDoc.exists)throw new Error("Club introuvable.");
    for(let attempt=0;attempt<8;attempt++){
      const code=root.LaTeamSharing.randomCode();
      const sharing={code,revision:1,enabled:true,ownerUid:clubDoc.data().ownerUid,clubId:state.clubId};
      const snapshot=root.LaTeamSharing.buildViewerSnapshot(state,sharing,sharing.ownerUid,Date.now());
      const ref=db.collection("tournaments").doc(code);
      try{
        await db.runTransaction(async transaction=>{
          const current=await transaction.get(ref);
          if(current.exists) throw Object.assign(new Error("collision"),{code:"code-collision"});
          transaction.set(ref,snapshot);
        });
        state.sharedTournament=sharing;
        await ensureRoundTimer(code);
        subscribeRoundTimer(code);
        clearPending();
        api.onShareStatus?.({state:"created",snapshot,url:viewerUrl(code)});
        return sharing;
      }catch(error){ if(error?.code!=="code-collision") throw error; }
    }
    throw new Error("Impossible de réserver un code public. Réessayez.");
  }

  async function publishNow(){
    const state=api?.getState?.();
    const sharing=state?.sharedTournament;
    if(!sharing?.enabled || !sharing.code) return false;
    const user=await organizerUser();
    sharing.ownerUid=sharing.ownerUid || user.uid;
    sharing.revision=(Number(sharing.revision)||0)+1;
    const snapshot=root.LaTeamSharing.buildViewerSnapshot(state,sharing,sharing.ownerUid,Date.now());
    pendingSnapshot(snapshot);
    api?.onShareStatus?.({state:"syncing",snapshot});
    try{ await writeSnapshot(snapshot); return true; }
    catch(error){ api?.onShareStatus?.({state:"pending",snapshot,error}); return false; }
  }

  function schedulePublish(){
    const currentState=api?.getState?.();
    if(currentState?.players?.length)schedulePrivateSave(currentState);
    const sharing=currentState?.sharedTournament;
    if(!sharing?.enabled) return;
    clearTimeout(publishTimer);
    publishTimer=setTimeout(()=>publishNow(),120);
  }

  async function flushPending(){
    const snapshot=readPending();
    if(!snapshot || root.navigator?.onLine===false) return;
    try{ await writeSnapshot(snapshot); }catch(error){ api?.onShareStatus?.({state:"pending",snapshot,error}); }
  }

  async function subscribeViewer(code){
    if(!/^(?:[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}|[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8})$/.test(code)) throw new Error("Code tournoi invalide.");
    await ensureSdk();
    viewerUnsubscribe?.();
    viewerUnsubscribe=db.collection("tournaments").doc(code).onSnapshot({includeMetadataChanges:true},doc=>{
      if(!doc.exists){ api.onViewerError?.("Tournoi introuvable."); return; }
      const snapshot=doc.data();
      if(!root.LaTeamSharing.validateViewerSnapshot(snapshot)){ api.onViewerError?.("Données tournoi incompatibles."); return; }
      api.onViewerSnapshot?.(snapshot,{fromCache:doc.metadata.fromCache,online:root.navigator?.onLine!==false});
    },()=>api.onViewerError?.("Impossible de suivre ce tournoi pour le moment."));
    subscribeRoundTimer(code);
  }

  function tournamentRef(code){return db.collection("tournaments").doc(code);}
  function roundTimerRef(code){return tournamentRef(code).collection("roundTimer").doc("current");}
  function sessionRef(code,uid){return tournamentRef(code).collection("viewerSessions").doc(uid);}

  async function bindViewerPlayer(code,playerId){
    const user=await viewerUser(),ref=sessionRef(code,user.uid),numericPlayer=Number(playerId);
    await db.runTransaction(async transaction=>{
      const current=await transaction.get(ref);
      if(current.exists){
        if(Number(current.data().playerId)!==numericPlayer)throw new Error("Cet appareil est déjà lié à un autre joueur pour ce tournoi.");
        return;
      }
      transaction.set(ref,{playerId:numericPlayer,createdAt:Date.now()});
    });
    return user;
  }

  async function ensureRoundTimer(code){
    await organizerUser();const parent=tournamentRef(code),ref=roundTimerRef(code);
    await db.runTransaction(async transaction=>{const [tournamentDoc,currentDoc]=await Promise.all([transaction.get(parent),transaction.get(ref)]);if(!tournamentDoc.exists||currentDoc.exists)return;const snapshot=tournamentDoc.data();if(snapshot.endMode!=="time")return;transaction.set(ref,{state:"idle",roundNumber:Number(snapshot.roundNumber),durationMinutes:Number(snapshot.roundDurationMinutes),roundStartedAt:null,startedBy:null,viewerStartConsumed:false,generation:0,updatedAt:root.firebase.firestore.FieldValue.serverTimestamp()});});
  }

  async function startRoundTimer({code,playerId=null}){
    const user=playerId===null?await organizerUser():await bindViewerPlayer(code,playerId);
    const parent=tournamentRef(code),ref=roundTimerRef(code);
    await db.runTransaction(async transaction=>{
      const [tournamentDoc,currentDoc]=await Promise.all([transaction.get(parent),transaction.get(ref)]);
      if(!tournamentDoc.exists)throw new Error("Tournoi introuvable.");
      const snapshot=tournamentDoc.data();
      const current=currentDoc.exists?currentDoc.data():null;
      if(current?.state==="running"&&Number(current.roundNumber)===Number(snapshot.roundNumber))return;
      if(playerId!==null&&!root.LaTeamCourtTimers.courtForPlayer(snapshot,playerId))throw new Error("Vous ne jouez pas sur ce round.");
      if(playerId!==null&&Number(current?.roundNumber)===Number(snapshot.roundNumber)&&current?.viewerStartConsumed)throw new Error("Ce chrono a déjà été lancé pour ce round.");
      transaction.set(ref,{state:"running",roundNumber:Number(snapshot.roundNumber),durationMinutes:Number(snapshot.roundDurationMinutes),roundStartedAt:root.firebase.firestore.FieldValue.serverTimestamp(),startedBy:playerId===null?"organizer":Number(playerId),viewerStartConsumed:true,generation:Number(current?.generation||0)+1,updatedAt:root.firebase.firestore.FieldValue.serverTimestamp()});
    });
    const latest=await ref.get();return latest.exists?latest.data():null;
  }

  async function resetRoundTimer({code}){
    await organizerUser();
    const parent=tournamentRef(code),ref=roundTimerRef(code);
    await db.runTransaction(async transaction=>{
      const [tournamentDoc,currentDoc]=await Promise.all([transaction.get(parent),transaction.get(ref)]);
      if(!tournamentDoc.exists||!currentDoc.exists)return null;
      const snapshot=tournamentDoc.data();
      const current=currentDoc.data();if(current.state!=="running"||Number(current.roundNumber)!==Number(snapshot.roundNumber))return;
      transaction.set(ref,{state:"idle",roundNumber:Number(snapshot.roundNumber),durationMinutes:Number(snapshot.roundDurationMinutes),roundStartedAt:null,startedBy:null,viewerStartConsumed:Boolean(current.viewerStartConsumed),generation:Number(current.generation||0)+1,updatedAt:root.firebase.firestore.FieldValue.serverTimestamp()});
    });
    const latest=await ref.get();return latest.exists?latest.data():null;
  }

  function subscribeRoundTimer(code){
    if(!db||!code)return;
    timerUnsubscribe?.();
    timerUnsubscribe=roundTimerRef(code).onSnapshot({includeMetadataChanges:true},doc=>{
      api?.onRoundTimer?.(doc.exists?doc.data():null,{fromCache:doc.metadata?.fromCache===true,online:root.navigator?.onLine!==false});
    },()=>api?.onRoundTimerError?.("Impossible de synchroniser le chrono."));
  }

  function viewerCodeFromLocation(){
    try{ return new URL(root.location.href).searchParams.get("t")?.toUpperCase() || ""; }catch(error){ return ""; }
  }

  function authError(error){
    const messages={
      "auth/email-already-in-use":"Cette adresse e-mail est déjà utilisée. Essayez de vous connecter.",
      "auth/credential-already-in-use":"Cette adresse est déjà liée à un compte. Essayez de vous connecter.",
      "auth/invalid-credential":"E-mail ou mot de passe incorrect.",
      "auth/invalid-email":"Adresse e-mail invalide.",
      "auth/weak-password":"Choisissez un mot de passe d’au moins 8 caractères.",
      "auth/password-does-not-meet-requirements":"Ce mot de passe ne respecte pas les règles de sécurité. Utilisez au moins 8 caractères.",
      "auth/operation-not-allowed":"La création de compte est momentanément indisponible. Réessayez plus tard.",
      "auth/requires-recent-login":"Votre session a expiré. Reconnectez-vous puis réessayez.",
      "auth/user-token-expired":"Votre session a expiré. Reconnectez-vous puis réessayez.",
      "auth/too-many-requests":"Trop de tentatives. Réessayez plus tard.",
      "auth/network-request-failed":"Connexion indisponible. Réessayez lorsque le réseau revient.",
      "permission-denied":"Le compte est créé, mais Firebase a refusé la création du club. Reconnectez-vous puis réessayez.",
      "unauthenticated":"Votre session a expiré. Reconnectez-vous puis réessayez.",
      "unavailable":"Firebase est temporairement indisponible. Réessayez dans un instant."
    };
    return Object.assign(new Error(messages[error?.code]||"Impossible de terminer cette opération."),{code:error?.code||"auth/error"});
  }

  async function observeOrganizerAuth(callback){
    await ensureSdk();authUnsubscribe?.();authUnsubscribe=auth.onAuthStateChanged(user=>callback?.(user&&!user.isAnonymous?user:null));
    return authUnsubscribe;
  }

  async function createOrganizerAccount({email,password,clubName}){
    await ensureSdk();
    await waitForAuthReady();
    if(!root.LaTeamAccounts.validEmail(email)||!root.LaTeamAccounts.validPassword(password))throw new Error("Vérifiez l’e-mail et utilisez au moins 8 caractères pour le mot de passe.");
    if(!String(clubName||"").trim())throw new Error("Indiquez le nom du club.");
    try{
      const credential=root.firebase.auth.EmailAuthProvider.credential(root.LaTeamAccounts.normalizeEmail(email),password);
      let user=auth.currentUser,wasAnonymous=Boolean(user?.isAnonymous);
      if(wasAnonymous)user=(await user.linkWithCredential(credential)).user;
      else if(!user)user=(await auth.createUserWithEmailAndPassword(root.LaTeamAccounts.normalizeEmail(email),password)).user;
      else if(root.LaTeamAccounts.normalizeEmail(user.email)!==root.LaTeamAccounts.normalizeEmail(email))throw new Error("Un autre compte Organisateur est déjà connecté.");
      await user.getIdToken?.(true);
      const existingQuery=await db.collection("clubs").where("memberUids","array-contains",user.uid).limit(1).get();
      if(!existingQuery.empty){
        const existingDoc=existingQuery.docs[0],existingClub={id:existingDoc.id,...existingDoc.data()};
        const migration=await migrateLegacyTournament(existingClub.id,user.uid).catch(error=>({migrated:false,reason:error?.code||"migration-failed"}));
        return {user,club:existingClub,member:null,migratedFromAnonymous:wasAnonymous,migration};
      }
      const clubId=root.LaTeamAccounts.randomId(clubName),timestamp=Date.now();
      const club=root.LaTeamAccounts.clubDocument({clubId,name:clubName,ownerUid:user.uid,now:timestamp});
      const member=root.LaTeamAccounts.memberDocument({uid:user.uid,role:"owner",email:user.email,now:timestamp});
      const profile=root.LaTeamAccounts.userProfile(user,clubId,timestamp);
      const batch=db.batch();
      batch.set(db.collection("users").doc(user.uid),profile);
      batch.set(db.collection("clubs").doc(clubId),club);
      batch.set(db.collection("clubs").doc(clubId).collection("members").doc(user.uid),member);
      await batch.commit();
      const migration=await migrateLegacyTournament(clubId,user.uid).catch(error=>({migrated:false,reason:error?.code||"migration-failed"}));
      return {user,club,member,migratedFromAnonymous:wasAnonymous,migration};
    }catch(error){throw authError(error);}
  }

  async function signInOrganizer(email,password){
    await ensureSdk();
    try{return (await auth.signInWithEmailAndPassword(root.LaTeamAccounts.normalizeEmail(email),password)).user;}
    catch(error){throw authError(error);}
  }
  async function signOutOrganizer(){await ensureSdk();await auth.signOut();}
  async function sendPasswordReset(email){
    await ensureSdk();if(!root.LaTeamAccounts.validEmail(email))throw new Error("Adresse e-mail invalide.");
    try{await auth.sendPasswordResetEmail(root.LaTeamAccounts.normalizeEmail(email));return true;}catch(error){throw authError(error);}
  }

  async function listOrganizerClubs(){
    const user=await organizerUser();
    const query=await db.collection("clubs").where("memberUids","array-contains",user.uid).get();
    return query.docs.map(doc=>({id:doc.id,...doc.data()}));
  }
  async function listClubTournaments(clubId){
    await organizerUser();
    const query=await db.collection("clubs").doc(clubId).collection("tournaments").orderBy("updatedAt","desc").limit(50).get();
    return query.docs.map(doc=>({id:doc.id,...doc.data()}));
  }
  async function loadClubTournament(clubId,tournamentId){
    await organizerUser();const doc=await db.collection("clubs").doc(clubId).collection("tournaments").doc(tournamentId).get();
    if(!doc.exists)throw new Error("Tournoi introuvable.");return doc.data().state;
  }
  function privateTournamentId(state){return String(state?.cloudTournamentId||state?.activeSaveId||state?.timerTournamentId||`t-${Date.now()}`);}
  async function savePrivateTournament(state,clubId){
    const user=await organizerUser(),clubs=clubId?[{id:clubId}]:await listOrganizerClubs();
    if(!clubs.length)throw new Error("Aucun club accessible.");
    const selected=clubs[0].id,clubDoc=await db.collection("clubs").doc(selected).get();
    if(!clubDoc.exists)throw new Error("Club introuvable.");
    const tournamentId=privateTournamentId(state);state.cloudTournamentId=tournamentId;state.clubId=selected;
    const payload=root.LaTeamAccounts.privateTournament({tournamentId,clubId:selected,ownerUid:clubDoc.data().ownerUid,createdByUid:user.uid,state:JSON.parse(JSON.stringify(state)),now:Date.now()});
    await db.collection("clubs").doc(selected).collection("tournaments").doc(tournamentId).set(payload,{merge:true});
    api?.onPrivateSync?.({state:"synced",clubId:selected,tournamentId});return payload;
  }
  function schedulePrivateSave(state){
    clearTimeout(privateTimer);privateTimer=setTimeout(()=>savePrivateTournament(state,state?.clubId).catch(error=>api?.onPrivateSync?.({state:"pending",error})),180);
  }
  async function migrateLegacyTournament(clubId,uid){
    const state=api?.getState?.();if(!state?.players?.length)return false;
    if(state.sharedTournament?.ownerUid&&state.sharedTournament.ownerUid!==uid)return {migrated:false,reason:"legacy-owner-mismatch"};
    await savePrivateTournament(state,clubId);return true;
  }

  function init(options){
    api=options;
    root.addEventListener?.("online",()=>{ api.onConnectionChange?.(true); flushPending(); });
    root.addEventListener?.("offline",()=>api.onConnectionChange?.(false));
    const code=viewerCodeFromLocation();
    if(code) subscribeViewer(code).catch(error=>api.onViewerError?.(error.message));
    else if(api.getState?.()?.sharedTournament?.enabled){ flushPending(); ensureSdk().then(async()=>{await ensureRoundTimer(api.getState().sharedTournament.code);subscribeRoundTimer(api.getState().sharedTournament.code);}).catch(()=>{}); }
    return code;
  }

  root.LaTeamCloud={init,viewerUrl,createSharedTournament,schedulePublish,publishNow,flushPending,subscribeViewer,subscribeRoundTimer,bindViewerPlayer,ensureRoundTimer,startRoundTimer,resetRoundTimer,viewerCodeFromLocation,
    observeOrganizerAuth,createOrganizerAccount,signInOrganizer,signOutOrganizer,sendPasswordReset,listOrganizerClubs,listClubTournaments,loadClubTournament,savePrivateTournament,schedulePrivateSave,migrateLegacyTournament,friendlyError:authError};
})(typeof window!=="undefined"?window:globalThis);
