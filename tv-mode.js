(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.NextPadelTv=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  let snapshot=null,timer=null,ticker=null;
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  function codeFromLocation(url){try{return new URL(url).searchParams.get("tv")?.replace(/\s/g,"").toUpperCase()||"";}catch(error){return "";}}
  function timerLabel(){if(!snapshot||snapshot.endMode!=="time")return "MODE POINTS";return globalThis.LaTeamRoundTimer?.label(timer)||"PAS DÉMARRÉ";}
  function render(){
    if(typeof document==="undefined"||!snapshot)return;const rootEl=document.getElementById("tvMode");if(!rootEl)return;
    const courts=snapshot.currentRound.courts||[],rest=snapshot.currentRound.rest||[],cycle=snapshot.cycleMilestone;
    rootEl.innerHTML=`<div class="tv-shell"><header><strong>NEXTPADEL</strong><div><span>${esc(snapshot.tournamentName||"TOURNOI EN DIRECT")}</span><b>ROUND ${snapshot.roundNumber}</b></div><time>${esc(timerLabel())}</time></header>${cycle?.pendingDecision?`<section class="tv-cycle"><h1>CYCLE COMPLET</h1><p>En attente de décision de l’Organisateur</p>${ranking(cycle.ranking||snapshot.ranking)}</section>`:`<main><section class="tv-courts">${courts.map(court=>`<article class="${court.validated?"done":""}"><div><b>T${court.number}</b><span>${court.validated?"TERMINÉ":"EN COURS"}</span></div><p>${court.teamA.map(id=>esc(snapshot.players[id]?.name)).join(" / ")}</p><strong>${court.score?`${court.score.a} — ${court.score.b}`:"VS"}</strong><p>${court.teamB.map(id=>esc(snapshot.players[id]?.name)).join(" / ")}</p></article>`).join("")}</section><aside><h2>CLASSEMENT LIVE</h2>${ranking(snapshot.ranking)}${rest.length?`<h2>AU REPOS</h2><p>${rest.map(id=>esc(snapshot.players[id]?.name)).join(" · ")}</p>`:""}</aside></main>`}</div>`;
  }
  function ranking(rows){return `<ol>${(rows||[]).slice(0,12).map(row=>`<li><b>${row.position}</b><span>${esc(row.name)}</span><strong>${Number(row.diff)>=0?"+":""}${Number(row.diff)||0}</strong></li>`).join("")}</ol>`;}
  function show(data){snapshot=data;document.querySelectorAll("body>*").forEach(element=>{if(element.id!=="tvMode"&&element.tagName!=="SCRIPT")element.classList.add("tv-hidden");});const el=document.getElementById("tvMode");el.classList.remove("hidden");render();if(!ticker)ticker=setInterval(render,500);}
  function updateTimer(value){timer=value;render();}
  return {codeFromLocation,show,updateTimer,render};
});
