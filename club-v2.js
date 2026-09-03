(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.LaTeamClubV2=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const SCHEMA_VERSION=2;
  const SCORING_VERSION=1;
  const DEFAULT_SCORING=Object.freeze({
    scoringVersion:SCORING_VERSION,
    winPoints:3,
    lossPoints:1,
    minimumMatches:4,
    primary:"averageChampionshipPoints",
    tieBreakers:["championshipPoints","averageDifference","wins"]
  });

  function clean(value,max=120){return String(value||"").trim().replace(/\s+/g," ").slice(0,max);}
  function normalizeName(value){return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase();}
  function bytes(length,values){
    if(values)return Array.from(values).slice(0,length);
    if(typeof crypto!=="undefined"&&crypto.getRandomValues)return Array.from(crypto.getRandomValues(new Uint8Array(length)));
    return Array.from({length},()=>Math.floor(Math.random()*256));
  }
  function immutableId(prefix,values){return `${prefix}_${bytes(12,values).map(v=>v.toString(36).padStart(2,"0")).join("").slice(0,20)}`;}
  function publicPlayerId(values){
    const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return `LT-${bytes(4,values).map(value=>alphabet[value%alphabet.length]).join("")}`;
  }
  function timestamp(value=Date.now()){const number=Number(value);if(!Number.isFinite(number)||number<=0)throw new Error("Horodatage invalide");return number;}
  function scoringConfig(overrides={}){
    const config={...DEFAULT_SCORING,...overrides};
    for(const key of ["scoringVersion","winPoints","lossPoints","minimumMatches"]){
      if(!Number.isInteger(config[key])||config[key]<0)throw new Error(`Barème invalide : ${key}`);
    }
    if(config.winPoints<=config.lossPoints)throw new Error("La victoire doit rapporter plus que la défaite");
    config.tieBreakers=[...DEFAULT_SCORING.tieBreakers];
    return config;
  }
  function playerProfile({playerId=immutableId("player"),publicId=publicPlayerId(),ownerUid,displayName,now=Date.now()}){
    if(!clean(ownerUid)||!clean(displayName))throw new Error("Profil joueur incomplet");
    return {schemaVersion:SCHEMA_VERSION,playerId,publicId,ownerUid:clean(ownerUid),displayName:clean(displayName,80),normalizedName:normalizeName(displayName),status:"active",createdAt:timestamp(now),updatedAt:timestamp(now)};
  }
  function clubPlayer({player,clubId,now=Date.now()}){
    return {schemaVersion:SCHEMA_VERSION,clubId:clean(clubId),playerId:player.playerId,ownerUid:player.ownerUid,displayName:player.displayName,normalizedName:player.normalizedName,membershipStatus:"active",joinedAt:timestamp(now),updatedAt:timestamp(now)};
  }
  function season({seasonId=immutableId("season"),clubId,name,label,startsAt,endsAt,scoring={},now=Date.now()}){
    if(timestamp(endsAt)<=timestamp(startsAt))throw new Error("La saison doit se terminer après son début");
    return {schemaVersion:SCHEMA_VERSION,seasonId,clubId:clean(clubId),name:clean(name,80),label:clean(label,80),startsAt:timestamp(startsAt),endsAt:timestamp(endsAt),timezone:"Europe/Brussels",status:"draft",scoring:scoringConfig(scoring),scoringVersion:Number(scoring.scoringVersion||SCORING_VERSION),createdAt:timestamp(now),updatedAt:timestamp(now)};
  }
  function event({eventId=immutableId("event"),clubId,seasonId=null,tournamentId=null,name,startsAt,plannedEndsAt=null,capacity=32,now=Date.now()}){
    if(!Number.isInteger(capacity)||capacity<4||capacity>256)throw new Error("Capacité invalide");
    const start=timestamp(startsAt),end=plannedEndsAt===null?null:timestamp(plannedEndsAt);
    if(end!==null&&end<=start)throw new Error("La fin prévue doit suivre le début");
    return {schemaVersion:SCHEMA_VERSION,eventId,clubId:clean(clubId),seasonId:seasonId?clean(seasonId):null,tournamentId:tournamentId?clean(tournamentId):null,name:clean(name,100),startsAt:start,plannedEndsAt:end,actualEndedAt:null,timezone:"Europe/Brussels",capacity,registrationStatus:"open",status:"draft",createdAt:timestamp(now),updatedAt:timestamp(now)};
  }
  function registration({registrationId=immutableId("registration"),eventId,clubId,type="registered",playerId=null,displayName,registeredByUid,now=Date.now()}){
    if(!["registered","guest"].includes(type))throw new Error("Type d’inscription invalide");
    if(type==="registered"&&!playerId)throw new Error("Un joueur enregistré exige un playerId");
    if(type==="guest"&&playerId)throw new Error("Un invité ne reçoit pas de playerId permanent");
    return {schemaVersion:SCHEMA_VERSION,registrationId,eventId:clean(eventId),clubId:clean(clubId),type,playerId:playerId?clean(playerId):null,displayName:clean(displayName,80),normalizedName:normalizeName(displayName),status:"registered",registeredByUid:clean(registeredByUid),createdAt:timestamp(now),updatedAt:timestamp(now)};
  }
  function participantsFromRegistrations(registrations,options={}){
    const seenPlayers=new Set(),seenRegistrations=new Set();
    return registrations.filter(row=>row.status==="registered").map((row,engineIndex)=>{
      if(seenRegistrations.has(row.registrationId))throw new Error("Inscription dupliquée");
      seenRegistrations.add(row.registrationId);
      if(row.playerId){if(seenPlayers.has(row.playerId))throw new Error("Joueur permanent dupliqué");seenPlayers.add(row.playerId);}
      return {schemaVersion:SCHEMA_VERSION,participantId:immutableId("participant",options.randomValues?.[engineIndex]),registrationId:row.registrationId,playerId:row.playerId||null,displayNameSnapshot:row.displayName,type:row.type,engineIndex};
    });
  }
  function enginePlayers(participants){
    return [...participants].sort((a,b)=>a.engineIndex-b.engineIndex).map(row=>({name:row.displayNameSnapshot,mj:0,v:0,plus:0,minus:0}));
  }
  function participantByEngineIndex(participants,index){return participants.find(row=>row.engineIndex===Number(index))||null;}
  function officialMatch({matchId=immutableId("match"),clubId,tournamentId,eventId,seasonId=null,roundNumber,courtNumber,teamA,teamB,teamAPlayerIds=[],teamBPlayerIds=[],scoreA,scoreB,validatedByUid,revision=1,now=Date.now()}){
    const all=[...teamA,...teamB];if(all.length!==4||new Set(all).size!==4)throw new Error("Un match exige quatre participants distincts");
    if(!Number.isInteger(scoreA)||!Number.isInteger(scoreB)||scoreA<0||scoreB<0||scoreA===scoreB)throw new Error("Score officiel invalide");
    const registeredA=[...new Set(teamAPlayerIds.filter(Boolean))],registeredB=[...new Set(teamBPlayerIds.filter(Boolean))];
    if(registeredA.some(id=>registeredB.includes(id)))throw new Error("Un joueur ne peut pas appartenir aux deux équipes");
    return {schemaVersion:SCHEMA_VERSION,matchId,clubId:clean(clubId),tournamentId:clean(tournamentId),eventId:clean(eventId),seasonId:seasonId?clean(seasonId):null,roundNumber:Number(roundNumber),courtNumber:Number(courtNumber),teamA:[...teamA],teamB:[...teamB],teamAPlayerIds:registeredA,teamBPlayerIds:registeredB,playerIds:[...registeredA,...registeredB],scoreA,scoreB,status:"validated",validatedByUid:clean(validatedByUid),validatedAt:timestamp(now),revision:Number(revision)};
  }
  function scoreProposal({proposalId=immutableId("proposal"),publicCode,clubId,tournamentId,roundNumber,courtNumber,proposedByUid,proposedByParticipantId,engineIndex,scoreA,scoreB,now=Date.now()}){
    if(!Number.isInteger(scoreA)||!Number.isInteger(scoreB)||scoreA<0||scoreB<0||scoreA>99||scoreB>99||scoreA===scoreB)throw new Error("Proposition de score invalide");
    return {schemaVersion:SCHEMA_VERSION,proposalId,publicCode:clean(publicCode),clubId:clean(clubId),tournamentId:clean(tournamentId),roundNumber:Number(roundNumber),courtNumber:Number(courtNumber),proposedByUid:clean(proposedByUid),proposedByParticipantId:clean(proposedByParticipantId),engineIndex:Number(engineIndex),scoreA,scoreB,status:"pending",createdAt:timestamp(now),updatedAt:timestamp(now)};
  }
  function historicalCorrection({clubId,tournamentId,matchId,actorUid,before,after,reason,now=Date.now()}){
    return {schemaVersion:SCHEMA_VERSION,auditId:immutableId("audit"),clubId:clean(clubId),tournamentId:clean(tournamentId),matchId:clean(matchId),type:"historical-statistics-correction",movementPolicy:"preserve-played-rounds",actorUid:clean(actorUid),before:{...before},after:{...after},reason:clean(reason,240),createdAt:timestamp(now)};
  }
  function roundSummary({clubId,tournamentId,eventId,seasonId=null,roundNumber,byePlayerIds=[],validatedByUid,now=Date.now()}){
    return {schemaVersion:SCHEMA_VERSION,clubId:clean(clubId),tournamentId:clean(tournamentId),eventId:clean(eventId),seasonId:seasonId?clean(seasonId):null,roundNumber:Number(roundNumber),byePlayerIds:[...new Set(byePlayerIds.filter(Boolean))],validatedByUid:clean(validatedByUid),validatedAt:timestamp(now)};
  }
  return {SCHEMA_VERSION,SCORING_VERSION,DEFAULT_SCORING,normalizeName,immutableId,publicPlayerId,scoringConfig,playerProfile,clubPlayer,season,event,registration,participantsFromRegistrations,enginePlayers,participantByEngineIndex,officialMatch,scoreProposal,historicalCorrection,roundSummary};
});
