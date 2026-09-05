(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.NextPadelDynamicParticipants=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function activeIndexes(state){return (state.players||[]).map((player,index)=>player?.active===false?null:index).filter(index=>index!==null);}
  function pending(state){return Array.isArray(state.pendingParticipantChanges)?state.pendingParticipantChanges:[];}
  function queueAdd(state,input){
    const name=String(input?.name||"").trim();if(!name)throw new Error("Indiquez le nom du joueur.");
    if((state.players||[]).some(player=>player.active!==false&&player.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error("Ce joueur participe déjà au tournoi.");
    const change={id:`add-${Date.now()}-${pending(state).length}`,type:"add",effectiveRound:Number(state.matchIndex||0)+2,name,playerId:input.playerId||null,participantId:input.participantId||null,source:input.playerId?"registered":"guest",queuedAt:Date.now()};
    state.pendingParticipantChanges=[...pending(state),change];return change;
  }
  function queueRemove(state,playerIndex,when="next"){
    const index=Number(playerIndex),player=state.players?.[index];if(!player||player.active===false)throw new Error("Joueur actif introuvable.");
    if(!["next","immediate"].includes(when))throw new Error("Type de retrait invalide.");
    const change={id:`remove-${Date.now()}-${pending(state).length}`,type:"remove",playerIndex:index,name:player.name,when,effectiveRound:when==="immediate"?Number(state.matchIndex||0)+1:Number(state.matchIndex||0)+2,queuedAt:Date.now()};
    state.pendingParticipantChanges=[...pending(state),change];return change;
  }
  function pairCounts(state){const counts=new Map();for(const round of state.schedule||[])for(const court of round?.courts||[])for(const team of [court.teamA,court.teamB]){const key=[...team].sort((a,b)=>a-b).join("-");counts.set(key,(counts.get(key)||0)+1);}return counts;}
  function byeCounts(state){const counts=new Map(activeIndexes(state).map(index=>[index,0]));for(const round of state.schedule||[])for(const index of round?.rest||[])counts.set(index,(counts.get(index)||0)+1);return counts;}
  function destinationOrder(state,active){
    const round=state.schedule?.[state.matchIndex],results=state.results?.[state.matchIndex];if(!round||!results)return [...active];
    const buckets=Array.from({length:Math.max(1,state.courts||1)},()=>[]),activeSet=new Set(active),placed=new Set();
    (round.courts||[]).forEach((court,courtIndex)=>{const result=results[courtIndex];if(!result||result.interrupted)return;const winner=result.a>result.b?court.teamA:court.teamB,loser=result.a>result.b?court.teamB:court.teamA;winner.filter(i=>activeSet.has(i)).forEach(i=>{buckets[Math.max(0,courtIndex-1)].push(i);placed.add(i);});loser.filter(i=>activeSet.has(i)).forEach(i=>{buckets[Math.min(buckets.length-1,courtIndex+1)].push(i);placed.add(i);});});
    const standing=[...active].sort((a,b)=>{const pa=state.players[a],pb=state.players[b];return (pb.v-pa.v)||((pb.plus-pb.minus)-(pa.plus-pa.minus))||a-b;});
    return [...buckets.flat(),...standing.filter(i=>!placed.has(i))];
  }
  function bestTeams(block,counts){const [a,b,c,d]=block,options=[[[a,b],[c,d]],[[a,c],[b,d]],[[a,d],[b,c]]];return options.sort((x,y)=>{const score=pair=>counts.get([...pair].sort((m,n)=>m-n).join("-"))||0;return score(x[0])+score(x[1])-score(y[0])-score(y[1]);})[0];}
  function buildNextRound(state){
    const active=activeIndexes(state);if(active.length<4)throw new Error("Il faut au moins quatre joueurs actifs.");
    const courts=Math.max(1,Math.min(Number(state.configuredCourts||state.courts)||1,Math.floor(active.length/4))),byes=byeCounts(state),ordered=destinationOrder(state,active);
    const restCount=active.length-courts*4,rest=[...active].sort((a,b)=>(byes.get(a)||0)-(byes.get(b)||0)||ordered.indexOf(b)-ordered.indexOf(a)||a-b).slice(0,restCount),restSet=new Set(rest),playing=ordered.filter(i=>!restSet.has(i)).slice(0,courts*4),pairs=pairCounts(state),roundCourts=[];
    for(let court=0;court<courts;court++){const [teamA,teamB]=bestTeams(playing.slice(court*4,court*4+4),pairs);roundCourts.push({teamA:[...teamA].sort((a,b)=>a-b),teamB:[...teamB].sort((a,b)=>a-b)});}
    return {rest,courts:roundCourts,dynamicRoster:true};
  }
  function applyForNextRound(state){
    const nextRound=Number(state.matchIndex||0)+2,changes=pending(state).filter(change=>change.effectiveRound<=nextRound),remaining=pending(state).filter(change=>change.effectiveRound>nextRound),applied=[];
    for(const change of changes){if(change.type==="remove"){const player=state.players[change.playerIndex];if(player){player.active=false;player.leftAtRound=nextRound;applied.push(change);}}else{const index=state.players.length;state.players.push({name:change.name,mj:0,v:0,plus:0,minus:0,active:true,joinedAtRound:nextRound});state.participants=state.participants||[];state.participants.push({schemaVersion:2,participantId:change.participantId||`participant_dynamic_${Date.now()}_${index}`,registrationId:`dynamic_${index}`,playerId:change.playerId,displayNameSnapshot:change.name,type:change.source,engineIndex:index});applied.push({...change,playerIndex:index});}}
    state.pendingParticipantChanges=remaining;state.n=state.players.length;state.activePlayerCount=activeIndexes(state).length;
    if(applied.length){state.rosterHistory=state.rosterHistory||[];state.rosterHistory.push({round:nextRound,changes:copy(applied)});state.schedule[nextRound-1]=buildNextRound(state);state.courts=state.schedule[nextRound-1].courts.length;}
    return applied;
  }
  function interruptCurrentMatch(state,playerIndex){const round=state.schedule?.[state.matchIndex],courtIndex=round?.courts?.findIndex(court=>[...court.teamA,...court.teamB].includes(Number(playerIndex)))??-1;if(courtIndex<0)return null;state.results[state.matchIndex]=state.results[state.matchIndex]||[];state.results[state.matchIndex][courtIndex]={interrupted:true,reason:"participant-withdrawal"};state.validatedCourts[courtIndex]=true;return {courtIndex,roundNumber:state.matchIndex+1};}
  return {activeIndexes,queueAdd,queueRemove,buildNextRound,applyForNextRound,interruptCurrentMatch};
});
