#!/usr/bin/env node
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const root=path.resolve(__dirname,".."),configSource=fs.readFileSync(path.join(root,"preproduction-config.js"),"utf8"),html=fs.readFileSync(path.join(root,"index.html"),"utf8"),manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.webmanifest"),"utf8")),firebase=JSON.parse(fs.readFileSync(path.join(root,"firebase.json"),"utf8")),rc=JSON.parse(fs.readFileSync(path.join(root,".firebaserc"),"utf8"));
const context={};vm.createContext(context);vm.runInContext(configSource,context);
assert.equal(context.LA_TEAM_ENV.name,"preproduction");assert.equal(context.LA_TEAM_ENV.firebaseConfigured,true);assert.equal(context.LA_TEAM_ENV.demoEnabled,true);
assert.equal(context.LA_TEAM_ENV.firebaseConfig.projectId,"la-team-v2-test");assert.equal(context.LA_TEAM_ENV.firebaseConfig.appId,"1:935053612201:web:e963c7fcce2bbf222305b8");
for(const source of [configSource,html,JSON.stringify(manifest),JSON.stringify(firebase),JSON.stringify(rc)])assert.equal(source.includes("la-team-df6ad"),false,"aucune référence vers Firebase production");
assert.match(html,/La Team V2 — environnement TEST · aucune donnée de production/);assert.match(html,/Créer des données de démonstration/);assert.match(html,/function createDemoData\(\)/);
assert.equal(manifest.name,"La Team V2 — TEST");assert.equal(rc.projects.preproduction,"la-team-v2-test");assert.ok(firebase.hosting.ignore.includes("functions/**"));assert.ok(firebase.hosting.ignore.includes("tests/**"));
assert.ok(firebase.hosting.ignore.includes(".git/**"),"métadonnées Git explicitement exclues du Hosting");
assert.ok(firebase.hosting.ignore.includes("scripts/**"));assert.ok(firebase.hosting.predeploy.includes("node scripts/verify-hosting.cjs"),"contrôle de liste blanche obligatoire avant Hosting");
console.log("PREPRODUCTION_ENV_OK — identité TEST, démonstration locale et isolation Firebase production validées");
