const assert=require("assert");
const fs=require("fs");
const html=fs.readFileSync("index.html","utf8");
const sw=fs.readFileSync("service-worker.js","utf8");

for(const marker of [
  "V2 unified premium glass identity",
  "--premium-light:rgba(249,252,252,.86)",
  "--premium-dark:rgba(5,27,34,.84)",
  "url('./padel-hero-v2.jpg?v=1')",
  "-webkit-backdrop-filter:blur(12px)",
  ".viewer-shell>.card",
  ".round-cockpit",
  "#courts .court-card",
  "@media(max-width:700px)",
  "background-attachment:scroll"
]) assert.ok(html.includes(marker),`identité premium manquante : ${marker}`);

for(const marker of ["The photographic canvas never changes", "background:transparent!important", ".v2x-public-nav", "position:sticky", "v2x-main-back"]){
  assert.ok(html.includes(marker),`fond fixe ou navigation persistante manquante : ${marker}`);
}
for(const marker of ["One navigation system", "v2x-menu-dropdown", "v2x-menu-toggle", "v2x-global-nav.menu-open", ".v2x-nav,.v2x-header .v2x-top{display:none"]){
  assert.ok(html.includes(marker),`navigation globale unifiée manquante : ${marker}`);
}
assert.ok(sw.includes('la-team-shell-v41-unified-global-navigation-test'),"cache PWA visuel non versionné");
assert.ok(sw.includes('"/padel-hero-v2.jpg"'),"asset premium absent du shell hors connexion");
assert.strictEqual((sw.match(/\/padel-hero-v2\.jpg/g)||[]).length,1,"asset premium dupliqué dans le cache PWA");
assert.ok(fs.statSync("padel-hero-v2.jpg").size<300*1024,"photographie premium trop lourde pour le mobile");
console.log("PREMIUM_VISUAL_OK — fond commun, cartes verre, live sombre, mobile, fallback et cache PWA validés");
