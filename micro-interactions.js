(function(root){
  "use strict";
  const reduced=()=>Boolean(root.matchMedia&&root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let scheduled=false,lastRound="",lastRanking=new Map();
  function toast(message,tone="success"){
    if(typeof document==="undefined")return;
    let rail=document.getElementById("npToastRail");
    if(!rail){rail=document.createElement("div");rail.id="npToastRail";rail.className="np-toast-rail";rail.setAttribute("aria-live","polite");document.body.appendChild(rail);}
    const item=document.createElement("div");item.className=`np-toast ${tone}`;item.textContent=String(message);rail.appendChild(item);
    root.setTimeout(()=>item.classList.add("visible"),10);
    root.setTimeout(()=>{item.classList.remove("visible");root.setTimeout(()=>item.remove(),reduced()?0:220);},2600);
  }
  function flash(target,kind="updated"){
    const element=typeof target==="string"?document.querySelector(target):target;if(!element||reduced())return;
    element.classList.remove(`np-${kind}`);void element.offsetWidth;element.classList.add(`np-${kind}`);
    root.setTimeout(()=>element.classList.remove(`np-${kind}`),900);
  }
  function decorateTimers(){document.querySelectorAll("[data-court-time],.viewer-personal-clock,.cockpit-clock,.timer-clock,.court-timer-value,.tv-shell time").forEach(el=>{const text=el.textContent||"",parts=text.match(/(\d{1,2}):(\d{2})/),seconds=parts?Number(parts[1])*60+Number(parts[2]):9999;el.classList.toggle("np-timer-warning",seconds<=30&&seconds>10);el.classList.toggle("np-timer-critical",seconds<=10&&seconds>0);el.classList.toggle("np-timer-finished",seconds===0||/terminé/i.test(text));});}
  function decorateRound(){const node=document.querySelector("#cockpitRound,.tv-shell header b");const value=node?.textContent||"";if(value&&lastRound&&value!==lastRound)flash(document.querySelector("#game,.tv-shell"),"round");if(value)lastRound=value;}
  function decorateRanking(){const rows=document.querySelectorAll("#ranking tr,#viewerRanking tbody tr,.tv-shell ol li"),next=new Map();rows.forEach((row,index)=>{const cells=row.querySelectorAll("td,span"),name=(cells[1]?.textContent||cells[0]?.textContent||"").trim();if(!name)return;next.set(name,index);const before=lastRanking.get(name);if(before===undefined||before===index)return;row.classList.add(before>index?"np-rank-up":"np-rank-down");row.setAttribute("data-rank-move",before>index?"↑":"↓");});if(next.size)lastRanking=next;}
  function decorate(){scheduled=false;decorateTimers();decorateRound();decorateRanking();}
  function schedule(){if(scheduled)return;scheduled=true;(root.requestAnimationFrame||root.setTimeout)(decorate);}
  function start(){if(typeof document==="undefined")return;new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});schedule();}
  root.NextPadelMotion={toast,flash,reduced,start};
  if(typeof document!=="undefined")document.readyState==="loading"?document.addEventListener("DOMContentLoaded",start):start();
})(typeof window!=="undefined"?window:globalThis);
