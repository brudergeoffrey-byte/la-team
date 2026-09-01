(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.LaTeamCourtTimers=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function timerId(roundNumber,courtNumber){return `${Number(roundNumber)}-${Number(courtNumber)}`;}
  function idle(roundNumber,courtNumber,durationMinutes,generation=0){
    return {state:"idle",roundNumber:Number(roundNumber),courtNumber:Number(courtNumber),durationMinutes:Number(durationMinutes),startedAt:null,endsAt:null,startedBy:null,generation:Number(generation)||0,updatedAt:Date.now()};
  }
  function normalize(timer,roundNumber,courtNumber,durationMinutes){
    if(!timer||Number(timer.roundNumber)!==Number(roundNumber)||Number(timer.courtNumber)!==Number(courtNumber))return idle(roundNumber,courtNumber,durationMinutes);
    return {...idle(roundNumber,courtNumber,durationMinutes),...timer};
  }
  function remainingMs(timer,now=Date.now()){return timer?.state==="running"&&timer.endsAt?Math.max(0,Number(timer.endsAt)-now):null;}
  function phase(timer,now=Date.now()){
    if(!timer||timer.state!=="running")return "idle";
    const remaining=remainingMs(timer,now);
    if(remaining<=0)return "ended";
    if(remaining<=30000)return "warning";
    return "running";
  }
  function label(timer,now=Date.now()){
    const current=phase(timer,now);
    if(current==="idle")return "Pas démarré";
    if(current==="ended")return "Terminé";
    const seconds=Math.ceil(remainingMs(timer,now)/1000);
    return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
  }
  function courtForPlayer(snapshot,playerId){
    return snapshot?.currentRound?.courts?.find(court=>court.teamA.includes(Number(playerId))||court.teamB.includes(Number(playerId)))||null;
  }
  function canPlayerControl(snapshot,playerId,courtNumber){return courtForPlayer(snapshot,playerId)?.number===Number(courtNumber);}
  function start(existing,{roundNumber,courtNumber,durationMinutes,startedBy,now=Date.now()}){
    const current=normalize(existing,roundNumber,courtNumber,durationMinutes);
    if(current.state==="running")return {timer:current,started:false};
    const startedAt=Number(now),duration=Number(durationMinutes);
    return {started:true,timer:{state:"running",roundNumber:Number(roundNumber),courtNumber:Number(courtNumber),durationMinutes:duration,startedAt,endsAt:startedAt+duration*60000,startedBy, generation:current.generation+1,updatedAt:startedAt}};
  }
  function reset(existing,{now=Date.now()}){
    if(!existing)return null;
    return {...idle(existing.roundNumber,existing.courtNumber,existing.durationMinutes,Number(existing.generation)+1),updatedAt:Number(now)};
  }
  function alertKey(code,timer){return `${code}:${timer.roundNumber}:${timer.courtNumber}:${timer.generation}`;}
  function canWriteTimer({snapshot,sessionPlayerId,authUid,ownerUid,existing,incoming}){
    if(!authUid||!incoming||snapshot?.endMode!=="time"||incoming.roundNumber!==snapshot.roundNumber||incoming.durationMinutes!==snapshot.roundDurationMinutes)return false;
    const authorized=authUid===ownerUid||canPlayerControl(snapshot,sessionPlayerId,incoming.courtNumber);
    if(!authorized)return false;
    if(!existing)return incoming.state==="running"&&incoming.generation===1;
    return incoming.generation===existing.generation+1&&((existing.state==="idle"&&incoming.state==="running")||(existing.state==="running"&&incoming.state==="idle"));
  }
  return {timerId,idle,normalize,remainingMs,phase,label,courtForPlayer,canPlayerControl,start,reset,alertKey,canWriteTimer};
});
