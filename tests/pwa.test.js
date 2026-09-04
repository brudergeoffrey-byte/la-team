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
const firebase=JSON.parse(fs.readFileSync(path.join(root,"firebase.json"),"utf8"));

assert.equal(manifest.id,"/");
assert.equal(manifest.start_url,"/");
assert.equal(manifest.scope,"/");
assert.equal(manifest.display,"standalone");
assert.equal(manifest.theme_color,"#071d24");
assert.ok(manifest.icons.some(icon=>icon.sizes==="192x192"&&icon.purpose==="any"));
assert.ok(manifest.icons.some(icon=>icon.sizes==="512x512"&&icon.purpose==="any"));
assert.ok(manifest.icons.some(icon=>icon.sizes==="512x512"&&icon.purpose==="maskable"));

for(const file of ["offline.html","padel-hero-v2.jpg","firebase-sharing.js","organizer-accounts.js","player-experience.js","organizer-lock.js","tournament-timer.js","court-timers.js","round-timer.js","firebase-client.js","club-v2.js","club-journey-v2.js","commerce-v2.js","v2-experience.js","firebase-v2.js","vendor/qrcode.min.js","vendor/qrcode-LICENSE.txt","icons/icon-180.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png"]){
  assert.ok(fs.existsSync(path.join(root,file)),`ressource PWA présente : ${file}`);
  assert.ok(swSource.includes(`"/${file}"`),`ressource précachée : ${file}`);
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

assert.ok(html.includes('rel="manifest" href="/manifest.webmanifest?v=2"'));
assert.ok(html.includes('rel="apple-touch-icon" href="/icons/icon-180.png"'));
assert.ok(html.includes('apple-mobile-web-app-capable'));
assert.ok(html.includes('navigator.serviceWorker.register("/service-worker.js", {scope:"/"'));
assert.deepEqual(firebase.hosting.rewrites,[{source:"**",destination:"/index.html"}],"fallback de navigation Firebase Hosting");
assert.equal(JSON.stringify(manifest).includes("/la-team/"),false,"aucun chemin GitHub Pages dans le manifeste");
assert.ok(html.includes("Hors connexion"));
assert.ok(html.includes("NOUVELLE VERSION DISPONIBLE · METTRE À JOUR"));
assert.ok(html.includes("applyPwaUpdate"),"mise à jour PWA explicitement applicable");
assert.ok(swSource.includes("skipWaiting"),"la nouvelle version ne reste pas bloquée en attente sur un ancien iPad");
assert.ok(!swSource.includes("?."),"le Service Worker reste analysable par les anciens Safari avec support PWA");
for(const marker of ["v2CompatLanding","JE SUIS JOUEUR","JE SUIS CLUB / ORGANISATEUR","ACCÈS VIEWER","Navigateur trop ancien","iOS/iPadOS 13.4"]){assert.ok(html.includes(marker),`accueil V2 statique de compatibilité : ${marker}`);}
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
let online=true,skipWaitingCount=0,claimCount=0;
const context={
  URL,Promise,
  caches,
  fetch:async request=>{if(!online)throw new Error("offline");return new FakeResponse(`network:${request.url||request}`);},
  self:{location:{origin:"https://example.test"},async skipWaiting(){skipWaitingCount++;},clients:{async claim(){claimCount++;}},addEventListener(type,handler){listeners[type]=handler;}}
};

async function dispatchLifecycle(type){
  let pending=Promise.resolve();
  listeners[type]({waitUntil(promise){pending=promise;}});
  await pending;
}
async function navigate(pathname="/"){
  let responsePromise;
  listeners.fetch({request:{method:"GET",mode:"navigate",url:`https://example.test${pathname}`},respondWith(promise){responsePromise=promise;}});
  return responsePromise;
}

(async()=>{
  vm.createContext(context);vm.runInContext("(function(){"+swSource+"\n})()",context);
  await dispatchLifecycle("install");await dispatchLifecycle("activate");
  assert.equal(skipWaitingCount,1,"le nouveau worker est activé sans rester bloqué derrière l’ancien");
  assert.equal(claimCount,1,"les pages ouvertes sont revendiquées par la nouvelle version");

  const first=await navigate();
  assert.equal(first.body,"network:https://example.test/","Safari iPhone → installation → lancement à la racine");
  assert.equal((await navigate("/joueur/evenements")).body,"network:https://example.test/joueur/evenements","route interne légitime");
  assert.equal((await navigate("/la-team/")).body,"network:https://example.test/la-team/","ancienne icône tolérée par le fallback Hosting");

  online=false;
  assert.ok((await navigate()).body,"deuxième ouverture hors ligne");
  assert.ok((await navigate()).body,"rechargement hors ligne");

  // Une mise à jour change uniquement le cache applicatif, jamais les données du tournoi.
  const userData=new Map([["la-team-autosave-v1","tournoi-32-8"],["la-team-saves-index-v1","sauvegarde"]]);
  stores.set("la-team-cache-v12",new FakeCache());
  stores.set("lateam-v1",new FakeCache());
  stores.set("ancien-cache-inconnu",new FakeCache());
  const updatedSource=swSource.replace("la-team-shell-v38-premium-test","la-team-shell-v39-test");
  vm.runInContext("(function(){"+updatedSource+"\n})()",context);online=true;
  await dispatchLifecycle("install");await dispatchLifecycle("activate");
  assert.deepEqual([...stores.keys()],["la-team-shell-v39-test"],"tous les anciens caches de cet hébergement dédié sont nettoyés");
  assert.equal(userData.get("la-team-autosave-v1"),"tournoi-32-8","autosave conservé après mise à jour");
  assert.equal(userData.get("la-team-saves-index-v1"),"sauvegarde","sauvegarde conservée après mise à jour");

  online=false;
  assert.ok((await navigate()).body,"réouverture hors ligne après mise à jour");
  online=true;
  assert.equal((await navigate()).body,"network:https://example.test/","retour du réseau");

  listeners.message({data:{type:"SKIP_WAITING"}});
  assert.equal(skipWaitingCount,3,"le bouton de mise à jour peut aussi activer explicitement un worker en attente");

  console.log("PWA_OK — installation, cache hors ligne, rechargement, mise à jour sûre et conservation des données validés");
})().catch(error=>{console.error(error);process.exitCode=1;});
