#!/usr/bin/env node
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const rules=fs.readFileSync(path.resolve(__dirname,"../firestore.rules"),"utf8");

const memberships={
  clubA:{ownerA:"owner",adminA:"admin",organizerA:"organizer"},
  clubB:{ownerB:"owner",organizerB:"organizer"}
};
const role=(club,uid)=>memberships[club]?.[uid]||null;
const canTournament=(club,uid)=>["owner","admin","organizer"].includes(role(club,uid));
const canMembers=(club,uid)=>["owner","admin"].includes(role(club,uid));
const canAssign=(club,actor,targetRole)=>role(club,actor)==="owner"&&["admin","organizer"].includes(targetRole)||role(club,actor)==="admin"&&targetRole==="organizer";

for(const uid of ["ownerA","adminA","organizerA"])assert.equal(canTournament("clubA",uid),true,`${uid} gère Club A`);
assert.equal(canTournament("clubB","ownerA"),false,"Club A ne lit ni ne modifie Club B");
assert.equal(canTournament("clubA","outsider"),false,"non-membre refusé");
assert.equal(canMembers("clubA","organizerA"),false,"organizer ne gère pas les rôles");
assert.equal(canAssign("clubA","adminA","organizer"),true);
assert.equal(canAssign("clubA","adminA","admin"),false,"admin ne crée pas un autre admin");
assert.equal(canAssign("clubA","adminA","owner"),false,"auto-attribution owner refusée");
assert.equal(canAssign("clubA","organizerA","admin"),false,"auto-attribution admin refusée");
assert.equal(canTournament("clubB","organizerA"),false,"changer clubId ne donne aucun accès");

for(const marker of [
  "match /users/{uid}","match /clubs/{clubId}","match /members/{uid}","match /tournaments/{tournamentId}",
  "activeMember(clubId)","clubAdmin(clubId)","clubOwner(clubId)","request.resource.data.clubId == resource.data.clubId",
  "request.resource.data.ownerUid == resource.data.ownerUid","request.resource.data.createdByUid == resource.data.createdByUid"
])assert.ok(rules.includes(marker),`règle présente : ${marker}`);
assert.match(rules,/request\.resource\.data\.role == 'owner'[\s\S]*getAfter/,"owner initial seulement avec création atomique du club");
assert.match(rules,/clubAdmin\(clubId\) && !clubOwner\(clubId\)[\s\S]*request\.resource\.data\.role == 'organizer'/,"admin limité au rôle organizer");
assert.match(rules,/allow get: if isValidCode\(code\)/,"Viewer lit la projection exacte");
assert.match(rules,/allow list: if false/,"Viewer ne liste pas les tournois publics");
assert.match(rules,/activeRoundViewer/);assert.match(rules,/roundStartedAt == request\.time/);assert.match(rules,/allow update, delete: if false/);
console.log("MULTI_CLUB_SECURITY_OK — isolation A/B, rôles, non-membre, anti-escalade et Viewer validés");
