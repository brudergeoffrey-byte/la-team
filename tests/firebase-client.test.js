#!/usr/bin/env node
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const sharing=require("../firebase-sharing.js");
const courtTimers=require("../court-timers.js");

function appState(){
  return {mode:"ladder",n:8,courts:2,maxPoints:21,endMode:"time",roundDurationMinutes:10,roundEndsAt:Date.now()+600000,matchIndex:0,tournamentStatus:"live",sharedTournament:null,clubId:"club-a",
    players:Array.from({length:8},(_,id)=>({name:`J${id+1}`,mj:0,v:0,plus:0,minus:0})),
    schedule:[{rest:[],courts:[{teamA:[0,1],teamB:[2,3]},{teamA:[4,5],teamB:[6,7]}]}],
    results:[],validatedCourts:[false,false],courtScores:[]};
}

function harness(url="https://brudergeoffrey-byte.github.io/la-team/",authUid="owner-1"){
  const documents=new Map(),subdocuments=new Map(),listeners=new Map(),collectionListeners=new Map(),storage=new Map(),events={},statuses=[];
  let authCalls=0;
  const navigator={onLine:true};
  const valueAt=ref=>ref._root?documents.get(ref._code):subdocuments.get(ref._path);
  const storeAt=(ref,value)=>{const copy=JSON.parse(JSON.stringify(value));if(ref._root)documents.set(ref._code,copy);else subdocuments.set(ref._path,copy);listeners.get(ref._path)?.(copy,false);const parent=ref._path.slice(0,ref._path.lastIndexOf("/"));collectionListeners.get(parent)?.();};
  const makeCollection=path=>({
    doc(id){return makeDoc(`${path}/${id}`,!path.includes("/"));},
    onSnapshot(options,next){const emit=()=>{const prefix=`${path}/`;const docs=[...subdocuments.entries()].filter(([key])=>key.startsWith(prefix)&&!key.slice(prefix.length).includes("/")).map(([key,value])=>({id:key.slice(prefix.length),data:()=>value}));next({docs,metadata:{fromCache:false}});};collectionListeners.set(path,emit);emit();return()=>collectionListeners.delete(path);}
  });
  const makeDoc=(path,rootDoc=false)=>{const code=path.split("/")[1];return {_path:path,_code:code,_root:rootDoc,
    async set(value){if(!navigator.onLine)throw new Error("offline");storeAt(this,value);},async get(){const value=valueAt(this);return {exists:value!==undefined,data:()=>value};},
    onSnapshot(options,next){listeners.set(path,(value,fromCache)=>next({exists:true,data:()=>value,metadata:{fromCache}}));const value=valueAt(this);if(value)listeners.get(path)(value,false);return()=>listeners.delete(path);},
    collection(name){return makeCollection(`${path}/${name}`);}
  };};
  const db={
    enablePersistence:async()=>{},
    collection(name){return makeCollection(name);},
    async runTransaction(callback){
      const writes=[];
      const result=await callback({async get(ref){const value=valueAt(ref);return {exists:value!==undefined,data:()=>value};},set(ref,value){writes.push([ref,value]);}});
      for(const [ref,value] of writes)storeAt(ref,value);
      return result;
    }
  };
  const auth={currentUser:url.includes("?t=")?null:{uid:authUid,email:"owner@example.test",isAnonymous:false},onAuthStateChanged(callback){callback(this.currentUser);return()=>{};},async signInAnonymously(){authCalls++;this.currentUser={uid:authUid,isAnonymous:true};return {user:this.currentUser};}};
  const firebase={apps:[{}],firestore:()=>db,auth:()=>auth};
  const document={querySelector(){return null;},createElement(){return {};},head:{appendChild(){}}};
  const context={console,URL,Date,Math,JSON,Promise,Error,Object,Array,String,Number,Boolean,RegExp,
    LaTeamSharing:sharing,LaTeamCourtTimers:courtTimers,firebase,document,navigator,location:{href:url},localStorage:{
      getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)
    },addEventListener:(name,fn)=>{events[name]=fn;},setTimeout:fn=>(fn(),1),clearTimeout(){}};
  context.window=context; context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,"../firebase-client.js"),"utf8"),context);
  return {context,documents,subdocuments,storage,events,statuses,navigator,getAuthCalls:()=>authCalls};
}

(async()=>{
  const originalRandomCode=sharing.randomCode;
  const generatedCodes=["ABCD","K7F2"];
  sharing.randomCode=()=>generatedCodes.shift();
  const h=harness(),state=appState();
  h.documents.set("ABCD",{collision:true});h.documents.set("club-a",{ownerUid:"owner-1",name:"Club A"});
  h.context.LaTeamCloud.init({getState:()=>state,onShareStatus:status=>h.statuses.push(status)});
  const share=await h.context.LaTeamCloud.createSharedTournament();
  sharing.randomCode=originalRandomCode;
  assert.equal(share.code,"K7F2","collision régénérée automatiquement");
  assert.match(share.code,/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  assert.equal(h.documents.size,3,"document existant conservé et nouveau code créé");
  assert.equal(h.getAuthCalls(),0,"compte Organisateur réel réutilisé");
  const reopenedShare=await h.context.LaTeamCloud.createSharedTournament();
  assert.equal(reopenedShare.code,share.code,"réouverture du QR : même code");
  assert.equal(h.documents.size,3,"réouverture du QR : aucun nouveau tournoi");
  const revisionAfterReopen=h.documents.get(share.code).revision;
  const published=h.documents.get(share.code);
  assert.equal(published.ownerUid,"owner-1");
  assert.equal(published.schedule,undefined,"moteur non publié");

  state.results=[[{a:15,b:6},{a:8,b:13}]];
  state.validatedCourts=[true,true];
  await h.context.LaTeamCloud.publishNow();
  assert.equal(h.documents.get(share.code).revision,revisionAfterReopen+1,"score synchronisé automatiquement");

  h.navigator.onLine=false;
  state.matchIndex=0; state.players[0].name="Remplaçant";
  assert.equal(await h.context.LaTeamCloud.publishNow(),false,"coupure réseau non bloquante");
  assert.ok(h.storage.get("la-team-publication-pending-v1"),"dernier état conservé en attente");
  h.navigator.onLine=true; await h.events.online(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.documents.get(share.code).players[0].name,"Remplaçant","reprise réseau resynchronisée");
  const organizerTimer=await h.context.LaTeamCloud.startCourtTimer({code:share.code,roundNumber:1,courtNumber:2,durationMinutes:10,playerId:null});
  assert.equal(organizerTimer.startedBy,"organizer","organisateur démarre un terrain en secours");

  const viewer=harness(`https://brudergeoffrey-byte.github.io/la-team/?t=${share.code}`,"viewer-1");
  viewer.documents.set(share.code,h.documents.get(share.code));
  let received=null,receivedTimers={};
  viewer.context.LaTeamCloud.init({getState:()=>appState(),onViewerSnapshot:snapshot=>{received=snapshot;},onCourtTimers:timers=>{receivedTimers=timers;},onViewerError:message=>{throw new Error(message);}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(received,"Viewer reçoit le document exact");
  assert.equal(viewer.getAuthCalls(),0,"Viewer ne reçoit aucune identité organisateur");
  assert.equal(viewer.context.LaTeamCloud.viewerUrl(share.code),`https://brudergeoffrey-byte.github.io/la-team/?t=${share.code}`,"QR contient uniquement l’URL Viewer");

  const started=await viewer.context.LaTeamCloud.startCourtTimer({code:share.code,roundNumber:1,courtNumber:1,durationMinutes:10,playerId:0});
  assert.equal(started.startedBy,0,"joueur démarre sans exposer son UID anonyme");
  assert.equal(started.endsAt-started.startedAt,600000,"heure de fin absolue, sans écriture par seconde");
  assert.equal(receivedTimers["1-1"].startedAt,started.startedAt,"abonnement temps réel reçoit le même chrono");
  const duplicate=await viewer.context.LaTeamCloud.startCourtTimer({code:share.code,roundNumber:1,courtNumber:1,durationMinutes:10,playerId:0});
  assert.equal(duplicate.startedAt,started.startedAt,"double appui ne redémarre pas le chrono");
  await assert.rejects(()=>viewer.context.LaTeamCloud.startCourtTimer({code:share.code,roundNumber:1,courtNumber:2,durationMinutes:10,playerId:0}),/n’appartient pas/,"autre terrain refusé");
  const reset=await viewer.context.LaTeamCloud.resetCourtTimer({code:share.code,roundNumber:1,courtNumber:1,playerId:0});
  assert.equal(reset.state,"idle","réinitialisation sans toucher au tournoi");

  console.log("FIREBASE_CLIENT_OK — QR, scores, réseau et chronos terrain synchronisés validés");
})().catch(error=>{console.error(error);process.exitCode=1;});
