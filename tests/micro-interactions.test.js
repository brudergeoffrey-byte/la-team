"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const html=fs.readFileSync("index.html","utf8"),source=fs.readFileSync("micro-interactions.js","utf8"),sw=fs.readFileSync("service-worker.js","utf8"),experience=fs.readFileSync("v2-experience.js","utf8");
for(const marker of ["@media(hover:hover)","button:active","np-menu-in","np-content-in","np-timer-critical","np-rank-up","np-tv-score","np-toast-rail"]){assert.ok(html.includes(marker),`micro-interaction absente : ${marker}`);}
assert.ok(html.includes("@media(prefers-reduced-motion:reduce)"));assert.match(html,/prefers-reduced-motion:reduce[\s\S]*animation:none!important[\s\S]*transition:none!important/);
assert.ok(source.includes('matchMedia("(prefers-reduced-motion: reduce)")'));assert.ok(sw.includes('"/micro-interactions.js"'));
for(const marker of ["✓ Inscription confirmée","✓ Score validé","✓ Joueur ajouté au prochain round"]){assert.ok((html+experience).includes(marker),`confirmation discrète absente : ${marker}`);}
function run(reduce){const element=()=>({className:"",textContent:"",setAttribute(){},appendChild(){},classList:{add(){},remove(){}},remove(){}}),document={readyState:"complete",body:{appendChild(){},querySelectorAll(){return[];}},getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return[];},createElement:element,addEventListener(){}};const context={document,globalThis:null,MutationObserver:class{observe(){}},matchMedia(){return{matches:reduce}},setTimeout(fn){fn();},requestAnimationFrame(fn){fn();}};context.window=context;context.globalThis=context;vm.createContext(context);vm.runInContext(source,context);assert.equal(context.NextPadelMotion.reduced(),reduce);context.NextPadelMotion.toast("✓ Test");}
run(false);run(true);
console.log("MICRO_INTERACTIONS_OK — souris, toucher, live, TV et mode sans animation validés");
