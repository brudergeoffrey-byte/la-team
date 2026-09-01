#!/usr/bin/env node
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {webcrypto}=require("node:crypto");
const lock=require("../organizer-lock.js");

(async()=>{
  assert.equal(lock.isValidPin("2584"),true);
  for(const invalid of ["258","25844","25a4","",null]) assert.equal(lock.isValidPin(invalid),false);
  const record=await lock.createRecord("2584",webcrypto,1000);
  assert.equal(record.hash.includes("2584"),false,"PIN absent du vérificateur");
  assert.equal(JSON.stringify(record).includes("2584"),false,"PIN jamais stocké en clair");
  assert.equal(await lock.verifyPin("2584",record,webcrypto),true);
  assert.equal(await lock.verifyPin("0000",record,webcrypto),false);
  let failures=null; for(let i=0;i<5;i++) failures=lock.failureState(failures,1000);
  assert.ok(lock.remainingLockMs(failures,1000)>=30000,"temporisation après cinq erreurs");

  const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
  for(const text of ["Accès Organisateur","Créer votre code Organisateur","Confirmer le code","Code incorrect"]){
    assert.ok(html.includes(text),`interface PIN : ${text}`);
  }
  assert.match(html,/function returnOrganizerHome\(\)[\s\S]*organizerUnlocked=false/,"Accueil reverrouille l’espace");
  assert.ok(!fs.readFileSync(path.resolve(__dirname,"../firebase-sharing.js"),"utf8").includes("organizer-pin"),"PIN absent de la projection publique");
  assert.ok(!fs.readFileSync(path.resolve(__dirname,"../firestore.rules"),"utf8").includes("organizer-pin"),"règles Firebase inchangées");
  console.log("ORGANIZER_LOCK_OK — création, confirmation, refus, temporisation et verrouillage local validés");
})().catch(error=>{console.error(error);process.exitCode=1;});
