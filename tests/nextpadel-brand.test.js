"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const files=["index.html","v2-experience.js","firebase-v2.js","manifest.webmanifest","offline.html","preproduction-config.js","tv-mode.js"];
const content=files.map(file=>fs.readFileSync(file,"utf8")).join("\n");
for(const legacy of ["La Team V2","LA TEAM V2","La Team — TEST","La Team ·"]){
  assert.equal(content.includes(legacy),false,`ancienne identité visible interdite : ${legacy}`);
}
for(const marker of ["NextPadel","NEXTPADEL"]){
  assert.ok(content.includes(marker),`identité NextPadel absente : ${marker}`);
}
assert.ok(/Le padel\.\s*(?:<br>)?\s*<em>Ensemble\.<\/em>/i.test(content),"slogan NextPadel absent");
const manifest=JSON.parse(fs.readFileSync("manifest.webmanifest","utf8"));
assert.equal(manifest.name,"NextPadel — TEST");
assert.equal(manifest.short_name,"NextPadel");
console.log("NEXTPADEL_BRAND_OK — identité visible, PWA et slogan validés");
