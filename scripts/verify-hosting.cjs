"use strict";
const fs=require("node:fs"),path=require("node:path"),root=path.resolve(__dirname,"..");
const allowed=new Set([
  "index.html","offline.html","manifest.webmanifest","service-worker.js","preproduction-config.js","bg.jpg",
  "firebase-sharing.js","organizer-accounts.js","player-experience.js","organizer-lock.js","tournament-timer.js","court-timers.js","round-timer.js","firebase-client.js","club-v2.js","club-journey-v2.js","commerce-v2.js","v2-experience.js","firebase-v2.js",
  "vendor/qrcode.min.js","vendor/qrcode-LICENSE.txt","icons/app-icon.svg","icons/icon-180.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png"
]);
const requiredIgnores=[".git/**","**/node_modules/**","functions/**","tests/**","scripts/**","*.md","package*.json","firestore.rules","firestore.indexes.json","*-debug.log","firebase.json",".firebaserc"];
const config=JSON.parse(fs.readFileSync(path.join(root,"firebase.json"),"utf8")),ignores=new Set(config.hosting.ignore||[]);
for(const pattern of requiredIgnores)if(!ignores.has(pattern))throw new Error(`Déploiement bloqué : exclusion manquante ${pattern}`);
for(const file of allowed)if(!fs.existsSync(path.join(root,file)))throw new Error(`Déploiement bloqué : ressource absente ${file}`);
const sources=[...allowed].filter(file=>/\.(?:html|js|json|webmanifest)$/.test(file)).map(file=>fs.readFileSync(path.join(root,file),"utf8")).join("\n");
if(sources.includes("la-team-df6ad"))throw new Error("Déploiement bloqué : référence Firebase Production détectée");
if(!sources.includes("la-team-v2-test"))throw new Error("Déploiement bloqué : configuration V2 absente");
console.log(`HOSTING_ALLOWLIST_OK — ${allowed.size} fichiers applicatifs autorisés, production et fichiers internes exclus`);
