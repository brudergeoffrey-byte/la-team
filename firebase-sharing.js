(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.LaTeamSharing = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";

  const SCHEMA_VERSION = 6;
  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const FIREBASE_CONFIG = Object.freeze((typeof globalThis!=="undefined"&&globalThis.LA_TEAM_ENV?.firebaseConfig)||{
    apiKey:"PREPRODUCTION_NOT_CONFIGURED",authDomain:"la-team-v2-test-unconfigured.firebaseapp.com",projectId:"la-team-v2-test-unconfigured",storageBucket:"la-team-v2-test-unconfigured.firebasestorage.app",messagingSenderId:"000000000000",appId:"1:000000000000:web:preproduction"
  });

  function randomCode(randomValues){
    const bytes = randomValues || (typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(8))
      : Array.from({length:8}, ()=>Math.floor(Math.random()*256)));
    return Array.from(bytes).slice(0,4).map(value=>CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
  }

  function rankingFromPlayers(players){
    return players.map((player,id)=>({
      id, name:String(player.name || `J${id+1}`), matches:Number(player.mj)||0,
      wins:Number(player.v)||0, plus:Number(player.plus)||0, minus:Number(player.minus)||0
    })).sort((a,b)=>b.wins-a.wins || (b.plus-b.minus)-(a.plus-a.minus) || b.plus-a.plus || a.id-b.id)
      .map((player,index)=>Object.assign({position:index+1,diff:player.plus-player.minus},player));
  }

  function publicCourt(appState, court, courtIndex, result){
    const teamA = [...court.teamA];
    const teamB = [...court.teamB];
    const validResult = result && !result.interrupted && Number.isFinite(Number(result.a)) && Number.isFinite(Number(result.b));
    const published = {
      number:courtIndex+1,
      teamA,
      teamB,
      necessaryDuplicate:Array.isArray(court.necessaryDuplicates) && court.necessaryDuplicates.length>0,
      validated:Boolean(validResult),
      score:validResult ? {a:Number(result.a),b:Number(result.b)} : null,
      destinations:{}
    };
    if(validResult && appState.mode === "ladder"){
      const winner = result.a > result.b ? teamA : teamB;
      const loser = result.a > result.b ? teamB : teamA;
      const winCourt = Math.max(1,courtIndex);
      const loseCourt = Math.min(appState.courts,courtIndex+2);
      winner.forEach(id=>{ published.destinations[id] = {outcome:"win",court:winCourt,stays:courtIndex===0}; });
      loser.forEach(id=>{ published.destinations[id] = {outcome:"loss",court:loseCourt,stays:courtIndex===appState.courts-1}; });
    }
    return published;
  }

  function previousResults(appState){
    const rows=[];
    const lastRound=Math.min(appState.matchIndex, (appState.results||[]).length-1);
    for(let r=0;r<=lastRound;r++){
      const round=appState.schedule?.[r];
      if(!round) continue;
      (round.courts||[]).forEach((court,courtIndex)=>{
        const result=appState.results?.[r]?.[courtIndex];
        if(result && !result.interrupted && Number.isFinite(Number(result.a)) && Number.isFinite(Number(result.b))) rows.push({round:r+1,court:courtIndex+1,teamA:[...court.teamA],teamB:[...court.teamB],a:Number(result.a),b:Number(result.b)});
      });
    }
    return rows.slice(-256);
  }

  function buildViewerSnapshot(appState, sharing, ownerUid, timestamp){
    if(!appState?.players?.length || !appState.schedule?.[appState.matchIndex]) throw new Error("Tournoi public incomplet");
    const round=appState.schedule[appState.matchIndex];
    const results=appState.results?.[appState.matchIndex] || [];
    return {
      schemaVersion:SCHEMA_VERSION,
      code:String(sharing.code),
      clubId:String(appState.clubId||sharing.clubId||""),
      ownerUid:String(ownerUid),
      revision:Number(sharing.revision),
      updatedAt:Number(timestamp),
      status:appState.tournamentStatus === "finished" ? "finished" : "live",
      tournamentName:String(appState.tournamentName||"Tournoi NextPadel"),
      mode:appState.mode,
      roundNumber:appState.matchIndex+1,
      maxPoints:appState.maxPoints,
      endMode:appState.endMode==="time"?"time":"points",
      roundDurationMinutes:appState.endMode==="time"?Number(appState.roundDurationMinutes)||10:null,
      players:appState.players.map((player,id)=>({id,name:String(player.name||`J${id+1}`)})),
      participantIds:appState.players.map((_,id)=>String(appState.participants?.[id]?.participantId||`engine_${id}`)),
      currentRound:{
        rest:[...(round.rest||[])],
        courts:(round.courts||[]).map((court,index)=>publicCourt(appState,court,index,results[index]))
      },
      ranking:rankingFromPlayers(appState.players),
      previousResults:previousResults(appState)
      ,cycleMilestone:appState.kingCycleReachedAt?{round:Number(appState.kingCycleReachedAt),pendingDecision:Boolean(appState.kingCycleDecisionPending),ranking:(appState.cycleMilestones?.[appState.cycleMilestones.length-1]?.ranking||[]).slice(0,32)}:null
    };
  }

  function validateViewerSnapshot(snapshot){
    const baseKeys=["schemaVersion","code","ownerUid","revision","updatedAt","status","mode","roundNumber","maxPoints","players","currentRound","ranking","previousResults"];
    const keys=snapshot?.schemaVersion===2?[...baseKeys,"endMode","roundDurationMinutes","roundEndsAt"]:snapshot?.schemaVersion===3?[...baseKeys,"endMode","roundDurationMinutes"]:snapshot?.schemaVersion===4?[...baseKeys,"clubId","endMode","roundDurationMinutes"]:snapshot?.schemaVersion===5?[...baseKeys,"clubId","endMode","roundDurationMinutes","participantIds"]:snapshot?.schemaVersion===6?[...baseKeys,"clubId","endMode","roundDurationMinutes","participantIds","tournamentName","cycleMilestone"]:baseKeys;
    return Boolean(snapshot && Object.keys(snapshot).length===keys.length && Object.keys(snapshot).every(key=>keys.includes(key))
      && [1,2,3,4,5,6].includes(snapshot.schemaVersion)
      && (![4,5,6].includes(snapshot.schemaVersion) || (typeof snapshot.clubId==="string"&&snapshot.clubId.length>=4))
      && (![5,6].includes(snapshot.schemaVersion) || (Array.isArray(snapshot.participantIds)&&snapshot.participantIds.length===snapshot.players.length&&snapshot.participantIds.every(id=>typeof id==="string"&&id.length>0)))
      && /^(?:[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}|[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8})$/.test(snapshot.code)
      && ["americano","ladder"].includes(snapshot.mode)
      && ["live","finished"].includes(snapshot.status)
      && snapshot.players.length>=4 && snapshot.players.length<=64
      && snapshot.ranking.length===snapshot.players.length
      && Array.isArray(snapshot.currentRound?.courts)
      && (snapshot.schemaVersion===1 || (["points","time"].includes(snapshot.endMode)
        && (snapshot.endMode!=="time" || (snapshot.roundDurationMinutes>=1
          && ([3,4,5,6].includes(snapshot.schemaVersion) || snapshot.roundEndsAt>0))))));
  }

  function playerMatch(snapshot,playerId){
    const id=Number(playerId);
    if(snapshot.currentRound.rest.includes(id)) return {rest:true,round:snapshot.roundNumber};
    for(const court of snapshot.currentRound.courts){
      const sideA=court.teamA.includes(id), sideB=court.teamB.includes(id);
      if(!sideA && !sideB) continue;
      const own=sideA ? court.teamA : court.teamB;
      const opponents=sideA ? court.teamB : court.teamA;
      return {rest:false,round:snapshot.roundNumber,court:court.number,player:id,
        partner:own.find(x=>x!==id),opponents:[...opponents],score:court.score,
        destination:court.destinations?.[id] || null};
    }
    return null;
  }

  function canWriteTournament(existing,incoming,authUid,operation){
    if(operation==="get") return true;
    if(operation==="list") return false;
    if(!authUid || !validateViewerSnapshot(incoming || existing)) return false;
    if(operation==="create") return !existing && incoming.ownerUid===authUid;
    if(operation==="update") return Boolean(existing && existing.ownerUid===authUid
      && incoming.ownerUid===existing.ownerUid && incoming.code===existing.code
      && incoming.revision>existing.revision);
    if(operation==="delete") return Boolean(existing && existing.ownerUid===authUid);
    return false;
  }

  return {SCHEMA_VERSION,CODE_ALPHABET,FIREBASE_CONFIG,randomCode,rankingFromPlayers,
    buildViewerSnapshot,validateViewerSnapshot,playerMatch,canWriteTournament};
});
