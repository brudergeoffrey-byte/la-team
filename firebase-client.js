(function(root){
  "use strict";
  const SDK_VERSION="10.14.1";
  const SDK_URLS=[
    `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-compat.js`,
    `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth-compat.js`,
    `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore-compat.js`
  ];
  const PENDING_KEY="la-team-publication-pending-v1";
  let api=null, sdkPromise=null, db=null, auth=null, publishTimer=null, viewerUnsubscribe=null,timerUnsubscribe=null;

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
      try{ await db.enablePersistence({synchronizeTabs:true}); }catch(error){
        if(!["failed-precondition","unimplemented"].includes(error?.code)) throw error;
      }
    })();
    return sdkPromise;
  }

  async function organizerUser(){
    await ensureSdk();
    if(auth.currentUser) return auth.currentUser;
    const credential=await auth.signInAnonymously();
    return credential.user;
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
    if(snapshot.ownerUid!==user.uid) throw new Error("Cette identité ne possède pas ce tournoi partagé.");
    await db.collection("tournaments").doc(snapshot.code).set(snapshot);
    clearPending();
    api?.onShareStatus?.({state:"synced",snapshot});
  }

  async function createSharedTournament(){
    if(root.navigator?.onLine===false) throw new Error("Une connexion est nécessaire uniquement pour activer le partage la première fois.");
    const state=api.getState();
    if(state.sharedTournament?.code){ await publishNow(); subscribeCourtTimers(state.sharedTournament.code); return state.sharedTournament; }
    const user=await organizerUser();
    for(let attempt=0;attempt<8;attempt++){
      const code=root.LaTeamSharing.randomCode();
      const sharing={code,revision:1,enabled:true,ownerUid:user.uid};
      const snapshot=root.LaTeamSharing.buildViewerSnapshot(state,sharing,user.uid,Date.now());
      const ref=db.collection("tournaments").doc(code);
      try{
        await db.runTransaction(async transaction=>{
          const current=await transaction.get(ref);
          if(current.exists) throw Object.assign(new Error("collision"),{code:"code-collision"});
          transaction.set(ref,snapshot);
        });
        state.sharedTournament=sharing;
        subscribeCourtTimers(code);
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
    const sharing=api?.getState?.()?.sharedTournament;
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
    subscribeCourtTimers(code);
  }

  function tournamentRef(code){return db.collection("tournaments").doc(code);}
  function timerRef(code,roundNumber,courtNumber){return tournamentRef(code).collection("courtTimers").doc(String(courtNumber));}
  function sessionRef(code,uid){return tournamentRef(code).collection("viewerSessions").doc(uid);}

  async function bindViewerPlayer(code,playerId){
    const user=await organizerUser(),ref=sessionRef(code,user.uid),numericPlayer=Number(playerId);
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

  async function startCourtTimer({code,roundNumber,courtNumber,durationMinutes,playerId=null}){
    const user=playerId===null?await organizerUser():await bindViewerPlayer(code,playerId);
    const parent=tournamentRef(code),ref=timerRef(code,roundNumber,courtNumber);
    return db.runTransaction(async transaction=>{
      const [tournamentDoc,currentDoc]=await Promise.all([transaction.get(parent),transaction.get(ref)]);
      if(!tournamentDoc.exists)throw new Error("Tournoi introuvable.");
      const snapshot=tournamentDoc.data();
      if(playerId!==null&&!root.LaTeamCourtTimers.canPlayerControl(snapshot,playerId,courtNumber))throw new Error("Ce chrono n’appartient pas à votre terrain.");
      const current=currentDoc.exists?currentDoc.data():null;
      const transition=root.LaTeamCourtTimers.start(current,{roundNumber,courtNumber,durationMinutes,startedBy:playerId===null?"organizer":Number(playerId),now:Date.now()});
      if(transition.started)transaction.set(ref,transition.timer);
      return transition.timer;
    });
  }

  async function resetCourtTimer({code,roundNumber,courtNumber,playerId=null}){
    const user=playerId===null?await organizerUser():await bindViewerPlayer(code,playerId);
    const parent=tournamentRef(code),ref=timerRef(code,roundNumber,courtNumber);
    return db.runTransaction(async transaction=>{
      const [tournamentDoc,currentDoc]=await Promise.all([transaction.get(parent),transaction.get(ref)]);
      if(!tournamentDoc.exists||!currentDoc.exists)return null;
      const snapshot=tournamentDoc.data();
      if(playerId!==null&&!root.LaTeamCourtTimers.canPlayerControl(snapshot,playerId,courtNumber))throw new Error("Ce chrono n’appartient pas à votre terrain.");
      if(currentDoc.data().state!=="running")return currentDoc.data();
      const reset=root.LaTeamCourtTimers.reset(currentDoc.data(),{now:Date.now()});
      transaction.set(ref,reset);return reset;
    });
  }

  function subscribeCourtTimers(code){
    if(!db||!code)return;
    timerUnsubscribe?.();
    timerUnsubscribe=tournamentRef(code).collection("courtTimers").onSnapshot({includeMetadataChanges:true},query=>{
      const timers={};query.docs.forEach(doc=>{const timer=doc.data();timers[root.LaTeamCourtTimers.timerId(timer.roundNumber,timer.courtNumber)]=timer;});
      api?.onCourtTimers?.(timers,{fromCache:query.metadata?.fromCache===true,online:root.navigator?.onLine!==false});
    },()=>api?.onCourtTimerError?.("Impossible de synchroniser les chronos."));
  }

  function viewerCodeFromLocation(){
    try{ return new URL(root.location.href).searchParams.get("t")?.toUpperCase() || ""; }catch(error){ return ""; }
  }

  function init(options){
    api=options;
    root.addEventListener?.("online",()=>{ api.onConnectionChange?.(true); flushPending(); });
    root.addEventListener?.("offline",()=>api.onConnectionChange?.(false));
    const code=viewerCodeFromLocation();
    if(code) subscribeViewer(code).catch(error=>api.onViewerError?.(error.message));
    else if(api.getState?.()?.sharedTournament?.enabled){ flushPending(); ensureSdk().then(()=>subscribeCourtTimers(api.getState().sharedTournament.code)).catch(()=>{}); }
    return code;
  }

  root.LaTeamCloud={init,viewerUrl,createSharedTournament,schedulePublish,publishNow,flushPending,subscribeViewer,subscribeCourtTimers,bindViewerPlayer,startCourtTimer,resetCourtTimer,viewerCodeFromLocation};
})(typeof window!=="undefined"?window:globalThis);
