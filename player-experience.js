(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports) module.exports=api;
  if(root) root.LaTeamPlayer=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const CODE_PATTERN=/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
  function normalizeTournamentCode(value){ return String(value||"").replace(/\s+/g,"").toUpperCase(); }
  function isValidTournamentCode(value){ return CODE_PATTERN.test(normalizeTournamentCode(value)); }
  function tournamentUrl(currentUrl,code){
    const url=new URL("./",currentUrl);
    url.search=""; url.hash=""; url.searchParams.set("t",normalizeTournamentCode(code));
    return url.toString();
  }
  function roundProgress(snapshot){
    const courts=snapshot?.currentRound?.courts||[];
    return {completed:courts.filter(court=>court.validated).length,total:courts.length};
  }
  function teamDestination(court,team){
    if(!court?.validated||!Array.isArray(team)||!team.length) return null;
    return court.destinations?.[team[0]]||null;
  }
  return {CODE_PATTERN,normalizeTournamentCode,isValidTournamentCode,tournamentUrl,roundProgress,teamDestination};
});
