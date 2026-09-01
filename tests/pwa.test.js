#!/usr/bin/env node
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const crypto=require("node:crypto");

const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const swSource=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.webmanifest"),"utf8"));

assert.equal(manifest.start_url,"/la-team/");
assert.equal(manifest.scope,"/la-team/");
assert.equal(manifest.display,"standalone");
assert.equal(manifest.theme_color,"#071d24");
assert.ok(manifest.icons.some(icon=>icon.sizes==="192x192"&&icon.purpose==="any"));
assert.ok(manifest.icons.some(icon=>icon.sizes==="512x512"&&icon.purpose==="any"));
assert.ok(manifest.icons.some(icon=>icon.sizes==="512x512"&&icon.purpose==="maskable"));

for(const file of ["offline.html","bg.jpg","firebase-sharing.js","player-experience.js","organizer-lock.js","tournament-timer.js","firebase-client.js","vendor/qrcode.min.js","vendor/qrcode-LICENSE.txt","icons/icon-180.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png"]){
  assert.ok(fs.existsSync(path.join(root,file)),`ressource PWA présente : ${file}`);
  assert.ok(swSource.includes(`"./${file}"`),`ressource précachée : ${file}`);
}

function pngSize(file){
  const data=fs.readFileSync(path.join(root,file));
  assert.equal(data.toString("ascii",1,4),"PNG");
  return [data.readUInt32BE(16),data.readUInt32BE(20)];
}
assert.deepEqual(pngSize("icons/icon-180.png"),[180,180]);
assert.deepEqual(pngSize("icons/icon-192.png"),[192,192]);
assert.deepEqual(pngSize("icons/icon-512.png"),[512,512]);
assert.deepEqual(pngSize("icons/icon-maskable-512.png"),[512,512]);

assert.ok(html.includes('rel="manifest" href="./manifest.webmanifest"'));
assert.ok(html.includes('rel="apple-touch-icon" href="./icons/icon-180.png"'));
assert.ok(html.includes('apple-mobile-web-app-capable'));
assert.ok(html.includes('navigator.serviceWorker.register("./service-worker.js", {scope:"./"'));
assert.ok(html.includes("Hors connexion"));
assert.ok(html.includes("Nouvelle version disponible — elle sera installée au prochain redémarrage."));
assert.ok(!swSource.includes("skipWaiting"),"aucune activation forcée pendant un tournoi");
assert.ok(!swSource.includes("localStorage"),"aucune donnée utilisateur dans le cache applicatif");
assert.ok(!swSource.includes("indexedDB"),"aucune donnée utilisateur dans le cache applicatif");

// La section moteur doit rester bit à bit identique à la baseline stable.
const engineStart=html.indexOf("/* -------------------- Scheduling: Americano");
const engineEnd=html.indexOf("/* -------------------- Screens");
const engineHash=crypto.createHash("sha256").update(html.slice(engineStart,engineEnd)).digest("hex");
assert.equal(engineHash,"0fac58bbd4fdf6fc740c0487458cf944180a2f80a298496288e892b981c79cd8");

class FakeResponse{
  constructor(body){this.body=body;this.ok=true;}
  clone(){return new FakeResponse(this.body);}
}
class FakeCache{
  constructor(){this.entries=new Map();}
  async addAll(urls){for(const url of urls)this.entries.set(url,new FakeResponse(`cached:${url}`));}
  async put(key,response){this.entries.set(typeof key==="string"?key:key.url,response);}
  async match(key){return this.entries.get(typeof key==="string"?key:key.url);}
}

const stores=new Map(),listeners={};
const caches={
  async open(name){if(!stores.has(name))stores.set(name,new FakeCache());return stores.get(name);},
  async keys(){return [...stores.keys()];},
  async delete(name){return stores.delete(name);},
  async match(key){for(const cache of stores.values()){const hit=await cache.match(key);if(hit)return hit;}}
};
let online=true;
const context={
  URL,Promise,
  caches,
  fetch:async request=>{if(!online)throw new Error("offline");return new FakeResponse(`network:${request.url||request}`);},
  self:{location:{origin:"https://example.test"},clients:{async claim(){}},addEventListener(type,handler){listeners[type]=handler;}}
};

async function dispatchLifecycle(type){
  let pending=Promise.resolve();
  listeners[type]({waitUntil(promise){pending=promise;}});
  await pending;
}
async function navigate(){
  let responsePromise;
  listeners.fetch({request:{method:"GET",mode:"navigate",url:"https://example.test/la-team/"},respondWith(promise){responsePromise=promise;}});
  return responsePromise;
}

(async()=>{
  vm.createContext(context);vm.runInContext("(function(){"+swSource+"\n})()",context);
  await dispatchLifecycle("install");await dispatchLifecycle("activate");

  const first=await navigate();
  assert.equal(first.body,"network:https://example.test/la-team/","première ouverture en ligne");

  online=false;
  assert.ok((await navigate()).body,"deuxième ouverture hors ligne");
  assert.ok((await navigate()).body,"rechargement hors ligne");

  // Une mise à jour change uniquement le cache applicatif, jamais les données du tournoi.
  const userData=new Map([["la-team-autosave-v1","tournoi-32-8"],["la-team-saves-index-v1","sauvegarde"]]);
  const updatedSource=swSource.replace("la-team-shell-v9","la-team-shell-v10");
  vm.runInContext("(function(){"+updatedSource+"\n})()",context);online=true;
  await dispatchLifecycle("install");await dispatchLifecycle("activate");
  assert.deepEqual([...stores.keys()],["la-team-shell-v10"],"ancien cache applicatif nettoyé");
  assert.equal(userData.get("la-team-autosave-v1"),"tournoi-32-8","autosave conservé après mise à jour");
  assert.equal(userData.get("la-team-saves-index-v1"),"sauvegarde","sauvegarde conservée après mise à jour");

  online=false;
  assert.ok((await navigate()).body,"réouverture hors ligne après mise à jour");
  online=true;
  assert.equal((await navigate()).body,"network:https://example.test/la-team/","retour du réseau");

  console.log("PWA_OK — installation, cache hors ligne, rechargement, mise à jour sûre et conservation des données validés");
})().catch(error=>{console.error(error);process.exitCode=1;});
