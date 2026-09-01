#!/usr/bin/env node
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const accounts=require("../organizer-accounts.js");

assert.equal(accounts.normalizeEmail("  Club@Example.BE "),"club@example.be");
assert.equal(accounts.validEmail("club@example.be"),true);
assert.equal(accounts.validEmail("club"),false);
assert.equal(accounts.validPassword("padel-2026"),true);
assert.equal(accounts.validPassword("court"),false);
assert.deepEqual(accounts.ROLES,["owner","admin","organizer"]);
assert.equal(accounts.canManage("owner"),true);
assert.equal(accounts.canManage("admin"),true);
assert.equal(accounts.canManage("organizer"),true);
assert.equal(accounts.canManage("viewer"),false);
assert.equal(accounts.canAssign("owner","admin"),true);
assert.equal(accounts.canAssign("admin","organizer"),true);
assert.equal(accounts.canAssign("admin","owner"),false,"admin ne peut pas s’attribuer owner");
assert.equal(accounts.canAssign("organizer","admin"),false,"organizer ne peut pas s’attribuer admin");

const uid="uid-owner",now=123456,clubId=accounts.randomId("Padel Bruxelles",new Uint8Array([1,2,3,4,5,6,7,8]));
const club=accounts.clubDocument({clubId,name:"Padel Bruxelles",ownerUid:uid,now});
const member=accounts.memberDocument({uid,role:"owner",email:"OWNER@EXAMPLE.BE",now});
assert.equal(club.ownerUid,uid);assert.deepEqual(club.memberUids,[uid]);assert.equal(member.email,"owner@example.be");
const tournament=accounts.privateTournament({tournamentId:"t-1",clubId,ownerUid:uid,createdByUid:uid,state:{matchIndex:2,tournamentStatus:"live",sharedTournament:{code:"K7F2"}},now});
assert.equal(tournament.clubId,clubId);assert.equal(tournament.publicCode,"K7F2");assert.equal(tournament.roundNumber,3);

const client=fs.readFileSync(path.resolve(__dirname,"../firebase-client.js"),"utf8");
const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
assert.match(client,/linkWithCredential\(credential\)/,"migration anonyme liée sans changement d’UID");
assert.match(client,/signInWithEmailAndPassword/);
assert.match(client,/sendPasswordResetEmail/);
assert.match(client,/setPersistence/);
assert.match(client,/loadClubTournament/);
assert.match(client,/savePrivateTournament/);
assert.match(html,/Se connecter/);assert.match(html,/Créer un compte/);assert.match(html,/Mot de passe oublié/);assert.match(html,/logoutOrganizer/);
assert.ok(!client.includes("signInWithPopup"),"Google Sign-In non activé");
console.log("ORGANIZER_ACCOUNTS_OK — compte, liaison UID, récupération et rôles validés");
