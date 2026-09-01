(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.LaTeamRoundTimer=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  function timestampMs(value){
    if(value==null)return null;
    if(typeof value==="number")return Number(value);
    if(typeof value.toMillis==="function")return Number(value.toMillis());
    if(typeof value.seconds==="number")return value.seconds*1000+Math.floor(Number(value.nanoseconds||0)/1000000);
    if(value instanceof Date)return value.getTime();
    return null;
  }
  function idle(roundNumber,durationMinutes,generation=0,viewerStartConsumed=false){
    return {state:"idle",roundNumber:Number(roundNumber),durationMinutes:Number(durationMinutes),roundStartedAt:null,startedBy:null,viewerStartConsumed:Boolean(viewerStartConsumed),generation:Number(generation)||0,updatedAt:null};
  }
  function normalize(timer,roundNumber,durationMinutes){
    if(!timer||Number(timer.roundNumber)!==Number(roundNumber))return idle(roundNumber,durationMinutes,Number(timer?.generation)||0,false);
    return {...idle(roundNumber,durationMinutes),...timer};
  }
  function endsAt(timer){
    const start=timestampMs(timer?.roundStartedAt);
    return start==null?null:start+Number(timer.durationMinutes)*60000;
  }
  function remainingMs(timer,now=Date.now()){
    const end=endsAt(timer);
    return timer?.state==="running"&&end!=null?Math.max(0,end-Number(now)):null;
  }
  function phase(timer,now=Date.now()){
    if(!timer||timer.state!=="running"||timestampMs(timer.roundStartedAt)==null)return "idle";
    const remaining=remainingMs(timer,now);
    if(remaining<=0)return "ended";
    if(remaining<=30000)return "warning";
    return "running";
  }
  function label(timer,now=Date.now()){
    const current=phase(timer,now);
    if(current==="idle")return "Pas démarré";
    if(current==="ended")return "00:00";
    const seconds=Math.ceil(remainingMs(timer,now)/1000);
    return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
  }
  function alertKey(code,timer){return `${code}:${timer.roundNumber}:${timer.generation}`;}
  return {timestampMs,idle,normalize,endsAt,remainingMs,phase,label,alertKey};
});
