#!/usr/bin/env node
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const sharing=require("../firebase-sharing.js");

function state(n=32,courts=8,mode="ladder"){
  const courtRows=Array.from({length:courts},(_,c)=>({teamA:[c*4,c*4+1],teamB:[c*4+2,c*4+3]}));
  return {mode,n,courts,maxPoints:21,matchIndex:5,tournamentStatus:"live",
    players:Array.from({length:n},(_,id)=>({name:`J${id+1}`,mj:5,v:id%3,plus:60+id,minus:50})),
    schedule:Array.from({length:6},()=>({rest:[],courts:courtRows})),
    results:Array.from({length:6},()=>courtRows.map((_,c)=>c%2?{a:8,b:13}:{a:15,b:6}))};
}

const appState=state();
const snapshot=sharing.buildViewerSnapshot(appState,{code:"K7F4P2AB",revision:4},"owner-1",123456);
assert.equal(sharing.validateViewerSnapshot(snapshot),true,"schéma compact valide");
assert.deepEqual(Object.keys(snapshot).sort(),[
  "code","currentRound","endMode","maxPoints","mode","ownerUid","players","previousResults","ranking","revision","roundDurationMinutes","roundEndsAt","roundNumber","schemaVersion","status","updatedAt"
].sort(),"aucune donnée interne publiée");
for(const forbidden of ["history","ladderOpp","ladderPartner","ladderTeams","partnersSeen","schedule","autosave"]){
  assert.equal(JSON.stringify(snapshot).includes(forbidden),false,`${forbidden} absent`);
}
assert.ok(Buffer.byteLength(JSON.stringify(snapshot))<100000,"document largement sous 1 Mio pour 32 joueurs");
const timedState={...appState,endMode:"time",roundDurationMinutes:10,roundEndsAt:723456};
const timedSnapshot=sharing.buildViewerSnapshot(timedState,{code:"K7F2",revision:5},"owner-1",123456);
assert.equal(timedSnapshot.roundEndsAt,723456,"heure de fin absolue publiée une fois");
assert.equal(timedSnapshot.roundDurationMinutes,10);
assert.equal(sharing.validateViewerSnapshot(timedSnapshot),true);

const mine=sharing.playerMatch(snapshot,0);
assert.deepEqual({round:mine.round,court:mine.court,partner:mine.partner,opponents:mine.opponents},
  {round:6,court:1,partner:1,opponents:[2,3]},"TON MATCH trouvé immédiatement");
assert.deepEqual(mine.destination,{outcome:"win",court:1,stays:true},"vainqueur du terrain 1 reste roi");
assert.deepEqual(sharing.playerMatch(snapshot,31).destination,{outcome:"win",court:7,stays:false},"mouvement King publié depuis le résultat organisateur");

assert.equal(sharing.canWriteTournament(null,snapshot,"owner-1","create"),true,"propriétaire crée");
assert.equal(sharing.canWriteTournament(null,snapshot,null,"create"),false,"Viewer anonyme ne crée pas");
assert.equal(sharing.canWriteTournament(snapshot,{...snapshot,revision:5},"owner-1","update"),true,"propriétaire met à jour");
assert.equal(sharing.canWriteTournament(snapshot,{...snapshot,revision:5},"other-user","update"),false,"autre identité bloquée");
assert.equal(sharing.canWriteTournament(snapshot,{...snapshot,revision:5,ownerUid:"other-user"},"owner-1","update"),false,"transfert propriétaire bloqué");
assert.equal(sharing.canWriteTournament(snapshot,snapshot,null,"get"),true,"Viewer peut lire par ID exact");
assert.equal(sharing.canWriteTournament(snapshot,snapshot,null,"list"),false,"énumération bloquée");

const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
const moduleSource=fs.readFileSync(path.resolve(__dirname,"../firebase-sharing.js"),"utf8");
const rules=fs.readFileSync(path.resolve(__dirname,"../firestore.rules"),"utf8");
for(const secretMarker of ["private_key","client_email","service_account","BEGIN PRIVATE KEY"]){
  assert.equal((html+moduleSource).includes(secretMarker),false,`aucun secret administratif : ${secretMarker}`);
}
assert.match(rules,/allow get: if isValidCode\(code\)/);
assert.match(rules,/allow list: if false/);
assert.match(rules,/resource\.data\.ownerUid == request\.auth\.uid/);
assert.match(rules,/request\.resource\.data\.ownerUid == resource\.data\.ownerUid/);
assert.match(rules,/hasLegacyPublicShape/);
assert.match(rules,/hasTimedPublicShape/);
const viewerMarkup=html.slice(html.indexOf('id="viewer"'),html.indexOf('<!-- SETUP -->'));
for(const forbiddenAction of ["validateCourt","editCourtScore","nextMatch","replacePlayer","finishNow"]){
  assert.equal(viewerMarkup.includes(forbiddenAction),false,`Viewer sans action ${forbiddenAction}`);
}
assert.ok(html.includes('.hidden{ display:none!important; }'),"contrôles organisateur réellement masqués en Viewer");
assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0"'),"viewport mobile configuré");

const codes=new Set();
for(let i=0;i<1000;i++) codes.add(sharing.randomCode());
assert.ok(codes.size>=995,"codes publics courts suffisamment dispersés");
assert.ok([...codes].every(code=>/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(code)),"nouveaux codes courts lisibles sans caractères ambigus");
const legacySnapshot=sharing.buildViewerSnapshot(appState,{code:"K7F4P2AB",revision:1},"owner-1",123456);
assert.equal(sharing.validateViewerSnapshot(legacySnapshot),true,"ancien code 8 caractères toujours accepté");

const qrContext={}; vm.createContext(qrContext);
vm.runInContext(fs.readFileSync(path.resolve(__dirname,"../vendor/qrcode.min.js"),"utf8"),qrContext);
const viewerUrl=`https://brudergeoffrey-byte.github.io/la-team/?t=${snapshot.code}`;
const qr=qrContext.qrcode(0,"M"); qr.addData(viewerUrl); qr.make();
assert.match(qr.createSvgTag(4,2),/^<svg/,"QR généré localement");
assert.equal(viewerUrl.includes(snapshot.ownerUid),false,"QR sans identité ni secret organisateur");

for(const viewers of [4,8,16,32]){
  const choices=Array.from({length:viewers},(_,id)=>sharing.playerMatch(snapshot,id));
  assert.equal(choices.length,viewers,`${viewers} Viewer simultanés`);
  assert.ok(choices.every(Boolean),`${viewers} Viewer trouvent leur match`);
}

console.log("VIEWER_SECURITY_OK — schéma compact, 32 Viewer, mouvements King et autorisations validés");
