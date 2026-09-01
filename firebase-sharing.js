(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.LaTeamSharing = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";

  const SCHEMA_VERSION = 1;
  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const FIREBASE_CONFIG = Object.freeze({
    apiKey: "AIzaSyBxKmQ9lrj-5wWNtzhemqSi7h_rFqfykrY",
    authDomain: "la-team-df6ad.firebaseapp.com",
    projectId: "la-team-df6ad",
    storageBucket: "la-team-df6ad.firebasestorage.app",
    messagingSenderId: "437998380267",
    appId: "1:437998380267:web:112ca4c51b5c2feed8caae"
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
    const published = {
      number:courtIndex+1,
      teamA,
      teamB,
      necessaryDuplicate:Array.isArray(court.necessaryDuplicates) && court.necessaryDuplicates.length>0,
      validated:Boolean(result),
      score:result ? {a:Number(result.a),b:Number(result.b)} : null,
      destinations:{}
    };
    if(result && appState.mode === "ladder"){
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
        if(result) rows.push({round:r+1,court:courtIndex+1,teamA:[...court.teamA],teamB:[...court.teamB],a:Number(result.a),b:Number(result.b)});
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
      ownerUid:String(ownerUid),
      revision:Number(sharing.revision),
      updatedAt:Number(timestamp),
      status:appState.tournamentStatus === "finished" ? "finished" : "live",
      mode:appState.mode,
      roundNumber:appState.matchIndex+1,
      maxPoints:appState.maxPoints,
      players:appState.players.map((player,id)=>({id,name:String(player.name||`J${id+1}`)})),
      currentRound:{
        rest:[...(round.rest||[])],
        courts:(round.courts||[]).map((court,index)=>publicCourt(appState,court,index,results[index]))
      },
      ranking:rankingFromPlayers(appState.players),
      previousResults:previousResults(appState)
    };
  }

  function validateViewerSnapshot(snapshot){
    const keys=["schemaVersion","code","ownerUid","revision","updatedAt","status","mode","roundNumber","maxPoints","players","currentRound","ranking","previousResults"];
    return Boolean(snapshot && Object.keys(snapshot).every(key=>keys.includes(key))
      && snapshot.schemaVersion===1
      && /^(?:[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}|[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8})$/.test(snapshot.code)
      && ["americano","ladder"].includes(snapshot.mode)
      && ["live","finished"].includes(snapshot.status)
      && snapshot.players.length>=4 && snapshot.players.length<=32
      && snapshot.ranking.length===snapshot.players.length
      && Array.isArray(snapshot.currentRound?.courts));
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
