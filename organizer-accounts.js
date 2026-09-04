(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.LaTeamAccounts=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const ACCOUNT_SCHEMA_VERSION=1;
  const ROLES=Object.freeze(["owner","admin","organizer"]);

  function normalizeEmail(value){return String(value||"").trim().toLowerCase();}
  function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));}
  function validPassword(value){return typeof value==="string"&&value.length>=8&&value.length<=128;}
  function slug(value){
    return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"club";
  }
  function randomId(prefix="club",randomValues){
    const bytes=randomValues||(typeof crypto!=="undefined"&&crypto.getRandomValues?crypto.getRandomValues(new Uint8Array(8)):Array.from({length:8},()=>Math.floor(Math.random()*256)));
    return `${slug(prefix)}-${Array.from(bytes).slice(0,8).map(v=>(v%36).toString(36)).join("")}`;
  }
  function userProfile(user,defaultClubId,now=Date.now()){
    return {schemaVersion:ACCOUNT_SCHEMA_VERSION,email:normalizeEmail(user.email),displayName:String(user.displayName||"").trim().slice(0,80),defaultClubId:String(defaultClubId),createdAt:now,updatedAt:now};
  }
  function clubDocument({clubId,name,ownerUid,now=Date.now()}){
    return {schemaVersion:ACCOUNT_SCHEMA_VERSION,clubId:String(clubId),name:String(name||"").trim().slice(0,80),ownerUid:String(ownerUid),memberUids:[String(ownerUid)],status:"active",plan:"free",subscriptionStatus:"inactive",trialEndsAt:null,billingCustomerId:null,createdAt:now,updatedAt:now};
  }
  function memberDocument({uid,role="owner",email="",now=Date.now()}){
    if(!ROLES.includes(role))throw new Error("Rôle invalide");
    return {schemaVersion:ACCOUNT_SCHEMA_VERSION,uid:String(uid),role,email:normalizeEmail(email),status:"active",createdAt:now,updatedAt:now};
  }
  function privateTournament({tournamentId,clubId,ownerUid,createdByUid,state,now=Date.now()}){
    const competitionType=state?.seasonId?"championship":"friendly";
    return {schemaVersion:2,tournamentId:String(tournamentId),clubId:String(clubId),ownerUid:String(ownerUid),createdByUid:String(createdByUid),publicCode:state?.sharedTournament?.code||null,eventId:state?.eventId||null,seasonId:state?.seasonId||null,competitionType,status:state?.tournamentStatus==="finished"?"finished":"live",roundNumber:Number(state?.matchIndex||0)+1,updatedAt:now,state};
  }
  function canManage(role){return ROLES.includes(role);}
  function canManageMembers(role){return role==="owner"||role==="admin";}
  function canAssign(actorRole,targetRole){return actorRole==="owner"&&ROLES.includes(targetRole)||actorRole==="admin"&&targetRole==="organizer";}
  return {ACCOUNT_SCHEMA_VERSION,ROLES,normalizeEmail,validEmail,validPassword,slug,randomId,userProfile,clubDocument,memberDocument,privateTournament,canManage,canManageMembers,canAssign};
});
