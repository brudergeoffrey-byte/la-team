(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports) module.exports=api;
  if(root) root.LaTeamTimer=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const PRESETS=[5,8,10,12,15];
  function normalizeDuration(value){return Math.max(1,Math.min(180,Math.round(Number(value)||10)));}
  function roundEndsAt(mode,minutes,now=Date.now()){return mode==="time"?now+normalizeDuration(minutes)*60000:null;}
  function remainingMs(endsAt,now=Date.now()){return endsAt?Math.max(0,Number(endsAt)-now):null;}
  function formatRemaining(ms){
    const seconds=Math.max(0,Math.ceil(Number(ms||0)/1000));
    return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
  }
  function phase(endsAt,now=Date.now()){
    const remaining=remainingMs(endsAt,now);
    if(remaining===null)return "inactive";
    if(remaining<=0)return "ended";
    if(remaining<=30000)return "warning";
    return "running";
  }
  function shouldAlert(roundNumber,endsAt,lastAlertedRound,now=Date.now()){
    return phase(endsAt,now)==="ended"&&String(lastAlertedRound)!==String(roundNumber);
  }
  return {PRESETS,normalizeDuration,roundEndsAt,remainingMs,formatRemaining,phase,shouldAlert};
});
