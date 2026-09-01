#!/usr/bin/env node
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const sharing=require("../firebase-sharing.js");

function appState(){
  return {mode:"ladder",n:8,courts:2,maxPoints:21,matchIndex:0,tournamentStatus:"live",sharedTournament:null,
    players:Array.from({length:8},(_,id)=>({name:`J${id+1}`,mj:0,v:0,plus:0,minus:0})),
    schedule:[{rest:[],courts:[{teamA:[0,1],teamB:[2,3]},{teamA:[4,5],teamB:[6,7]}]}],
    results:[],validatedCourts:[false,false],courtScores:[]};
}

function harness(url="https://brudergeoffrey-byte.github.io/la-team/"){
  const documents=new Map(),listeners=new Map(),storage=new Map(),events={},statuses=[];
  let authCalls=0;
  const navigator={onLine:true};
  const db={
    enablePersistence:async()=>{},
    collection(name){ assert.equal(name,"tournaments"); return {doc(code){ return {_code:code,
      async set(value){ if(!navigator.onLine) throw new Error("offline"); documents.set(code,JSON.parse(JSON.stringify(value))); listeners.get(code)?.(value,false); },
      onSnapshot(options,next){ listeners.set(code,(value,fromCache)=>next({exists:true,data:()=>value,metadata:{fromCache}})); if(documents.has(code)) listeners.get(code)(documents.get(code),false); return ()=>listeners.delete(code); }
    }; }}; },
    async runTransaction(callback){
      const writes=[];
      await callback({async get(ref){ return {exists:documents.has(ref._code)}; },set(ref,value){ writes.push(value); }});
      for(const value of writes) documents.set(value.code,JSON.parse(JSON.stringify(value)));
    }
  };
  const auth={currentUser:null,async signInAnonymously(){authCalls++;this.currentUser={uid:"owner-1"};return {user:this.currentUser};}};
  const firebase={apps:[{}],firestore:()=>db,auth:()=>auth};
  const document={querySelector(){return null;},createElement(){return {};},head:{appendChild(){}}};
  const context={console,URL,Date,Math,JSON,Promise,Error,Object,Array,String,Number,Boolean,RegExp,
    LaTeamSharing:sharing,firebase,document,navigator,location:{href:url},localStorage:{
      getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)
    },addEventListener:(name,fn)=>{events[name]=fn;},setTimeout:fn=>(fn(),1),clearTimeout(){}};
  context.window=context; context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,"../firebase-client.js"),"utf8"),context);
  return {context,documents,storage,events,statuses,navigator,getAuthCalls:()=>authCalls};
}

(async()=>{
  const h=harness(),state=appState();
  h.context.LaTeamCloud.init({getState:()=>state,onShareStatus:status=>h.statuses.push(status)});
  const share=await h.context.LaTeamCloud.createSharedTournament();
  assert.match(share.code,/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(h.documents.size,1,"création distante unique");
  assert.equal(h.getAuthCalls(),1,"authentification anonyme organisateur");
  const published=h.documents.get(share.code);
  assert.equal(published.ownerUid,"owner-1");
  assert.equal(published.schedule,undefined,"moteur non publié");

  state.results=[[{a:15,b:6},{a:8,b:13}]];
  state.validatedCourts=[true,true];
  await h.context.LaTeamCloud.publishNow();
  assert.equal(h.documents.get(share.code).revision,2,"score synchronisé automatiquement");

  h.navigator.onLine=false;
  state.matchIndex=0; state.players[0].name="Remplaçant";
  assert.equal(await h.context.LaTeamCloud.publishNow(),false,"coupure réseau non bloquante");
  assert.ok(h.storage.get("la-team-publication-pending-v1"),"dernier état conservé en attente");
  h.navigator.onLine=true; await h.events.online(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.documents.get(share.code).players[0].name,"Remplaçant","reprise réseau resynchronisée");

  const viewer=harness(`https://brudergeoffrey-byte.github.io/la-team/?t=${share.code}`);
  viewer.documents.set(share.code,h.documents.get(share.code));
  let received=null;
  viewer.context.LaTeamCloud.init({getState:()=>appState(),onViewerSnapshot:snapshot=>{received=snapshot;},onViewerError:message=>{throw new Error(message);}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(received,"Viewer reçoit le document exact");
  assert.equal(viewer.getAuthCalls(),0,"Viewer ne reçoit aucune identité organisateur");
  assert.equal(viewer.context.LaTeamCloud.viewerUrl(share.code),`https://brudergeoffrey-byte.github.io/la-team/?t=${share.code}`,"QR contient uniquement l’URL Viewer");

  console.log("FIREBASE_CLIENT_OK — création, scores, correction, coupure/reprise et Viewer lecture seule validés");
})().catch(error=>{console.error(error);process.exitCode=1;});
