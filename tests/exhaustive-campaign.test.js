#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {performance} = require("node:perf_hooks");

function classList(){ const s=new Set(); return {add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x),toggle:(x,v)=>v===undefined?(s.has(x)?(s.delete(x),false):(s.add(x),true)):(v?(s.add(x),true):(s.delete(x),false))}; }
function element(id=""){ return {id,value:"",innerHTML:"",textContent:"",disabled:false,style:{display:""},dataset:{},classList:classList(),addEventListener(){},appendChild(){},scrollIntoView(){},setAttribute(){},click(){}}; }

function loadEngine(){
  const html=fs.readFileSync(path.resolve(__dirname,"..","index.html"),"utf8");
  const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const els=new Map(), storage=new Map();
  let seed=1;
  const seededMath=Object.create(Math);
  seededMath.random=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  const document={getElementById(id){if(!els.has(id))els.set(id,element(id));return els.get(id);},createElement(){return element();},querySelectorAll(){return[];}};
  const context={console,document,window:{scrollTo(){}},location:{reload(){}},alert(){},confirm(){return false},prompt(){return""},setTimeout(fn){fn()},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    Math:seededMath,Date,JSON,Set,Array,Object,Number,String,Boolean,parseInt,isNaN,Blob:function(){},URL:{createObjectURL(){return""},revokeObjectURL(){}}};
  vm.createContext(context);
  vm.runInContext(source+`;globalThis.__engine={
    buildFirstRoundLadder,buildNextRoundLadder,buildScheduleAmericano,generateNextAmericanoRound,
    applyResult,incLadderPartnerAndTeam,addPartnerPair,teamKey,normalizeTeam,stateSnapshot,
    maximumUnseenPartnerMatching,getState:()=>state,setState:s=>{state=s},setSeed:s=>{seed=s>>>0}
  }`,context);
  return context.__engine;
}

function initialState(n,courts,mode){
  return {mode,eventName:"Campagne exhaustive",clubName:"QA",n,courts,maxPoints:21,totalRounds:null,
    players:Array.from({length:n},(_,i)=>({name:`J${i+1}`,mj:0,v:0,plus:0,minus:0})),schedule:[],matchIndex:0,
    validatedCourts:[],courtScores:[],results:[],history:[],savedAt:null,
    ladderOpp:mode==="ladder"?Array.from({length:n},()=>Array(n).fill(0)):null,
    ladderPartner:mode==="ladder"?Array.from({length:n},()=>Array(n).fill(0)):null,
    ladderTeams:mode==="ladder"?{}:null,ladderByeCounts:mode==="ladder"?Array(n).fill(0):null,ladderLastRest:[],
    partnersSeen:{},partnersFullCycleNotified:false,activeSaveId:null};
}

let scoreSeed=987654321;
function nextScoreRandom(){scoreSeed=(scoreSeed*1664525+1013904223)>>>0;return scoreSeed/4294967296;}
function score(pattern,r,c,court){
  if(pattern==="a") return [15,6];
  if(pattern==="b") return [6,15];
  if(pattern==="alternate") return (r+c)%2?[6,15]:[15,6];
  if(pattern==="close") return (r+c)%2?[10,11]:[11,10];
  if(pattern==="blowout") return (r+c)%2?[1,20]:[20,1];
  if(pattern==="dominant"){
    const inA=court.teamA.includes(0), inB=court.teamB.includes(0);
    return inA?[17,4]:inB?[4,17]:((r+c)%2?[8,13]:[13,8]);
  }
  if(pattern==="circulate") return (r%2===0 ? c%2===0 : c%2!==0)?[16,5]:[5,16];
  const a=11+Math.floor(nextScoreRandom()*10); return [a,21-a];
}

function playersOnRound(round){return round.courts.flatMap(c=>[...c.teamA,...c.teamB]);}
function validateRound(round,n,courts){
  assert.equal(round.courts.length,courts);
  const active=playersOnRound(round), rest=round.rest||[];
  round.courts.forEach(c=>assert.equal([...c.teamA,...c.teamB].length,4));
  assert.equal(active.length,courts*4); assert.equal(rest.length,n-courts*4);
  assert.equal(new Set(active).size,active.length); assert.equal(new Set(rest).size,rest.length);
  assert.equal(active.filter(p=>rest.includes(p)).length,0);
  assert.deepEqual([...active,...rest].sort((a,b)=>a-b),[...Array(n).keys()]);
  for(const p of [...active,...rest]) assert.ok(Number.isInteger(p)&&p>=0&&p<n,"identifiant joueur valide");
}

function expectedDestinations(round,results,courts){
  const map=new Map();
  round.courts.forEach((court,i)=>{
    const res=results[i], win=res.a>res.b?court.teamA:court.teamB, lose=res.a>res.b?court.teamB:court.teamA;
    win.forEach(p=>map.set(p,Math.max(0,i-1))); lose.forEach(p=>map.set(p,Math.min(courts-1,i+1)));
  });
  return map;
}

function freshLedger(n){return Array.from({length:n},()=>({mj:0,v:0,plus:0,minus:0}));}
function applyLedger(ledger,A,B,a,b){
  A.forEach(p=>{ledger[p].mj++;ledger[p].plus+=a;ledger[p].minus+=b;if(a>b)ledger[p].v++;});
  B.forEach(p=>{ledger[p].mj++;ledger[p].plus+=b;ledger[p].minus+=a;if(b>a)ledger[p].v++;});
}
function assertRanking(state,ledger){state.players.forEach((p,i)=>assert.deepEqual({mj:p.mj,v:p.v,plus:p.plus,minus:p.minus},ledger[i],`classement J${i+1}`));}

function createMetrics(n){return {partner:Array.from({length:n},()=>new Map()),partnerMatrix:Array.from({length:n},()=>Array(n).fill(0)),opponent:Array.from({length:n},()=>new Map()),lastPartner:Array.from({length:n},()=>new Map()),gaps:[],byes:Array(n).fill(0)};}
function recordMatch(metrics,A,B,round){
  for(const [x,y] of [A,B]){
    metrics.partner[x].set(y,(metrics.partner[x].get(y)||0)+1); metrics.partner[y].set(x,(metrics.partner[y].get(x)||0)+1);
    metrics.partnerMatrix[x][y]++;metrics.partnerMatrix[y][x]++;
    for(const [p,q] of [[x,y],[y,x]]){const last=metrics.lastPartner[p].get(q);if(last!==undefined)metrics.gaps.push(round-last);metrics.lastPartner[p].set(q,round);}
  }
  for(const a of A)for(const b of B){metrics.opponent[a].set(b,(metrics.opponent[a].get(b)||0)+1);metrics.opponent[b].set(a,(metrics.opponent[b].get(a)||0)+1);}
}

const engine=loadEngine();
const profiles=["random","a","b","alternate","close","blowout","dominant","circulate"];
const aggregate={simulations:0,rounds:0,matches:0,configs:new Set(),partnerDistinct:[],opponentDistinct:[],partnerRepeats:0,opponentRepeats:0,necessaryDuplicates:0,avoidableDuplicates:0,gaps:[],maxByeSpread:0,perf:[]};

function bruteMaximumUnseen(players,matrix){
  const memo=new Map();
  function solve(mask){
    if(mask===0) return 0;
    if(memo.has(mask)) return memo.get(mask);
    let first=0;while(((mask>>first)&1)===0)first++;
    let best=solve(mask&~(1<<first));
    for(let j=first+1;j<players.length;j++) if((mask>>j)&1){
      if(matrix[players[first]][players[j]]===0) best=Math.max(best,1+solve(mask&~(1<<first)&~(1<<j)));
    }
    memo.set(mask,best);return best;
  }
  return solve((1<<players.length)-1);
}

// Régression : un choix glouton 0-1 laisserait 2-3 en doublon, alors que
// l'appariement inédit 0-2 + 1-3 existe.
{
  const matrix=Array.from({length:4},()=>Array(4).fill(1));
  for(const [a,b] of [[0,1],[0,2],[1,3]]) matrix[a][b]=matrix[b][a]=0;
  assert.equal(engine.maximumUnseenPartnerMatching([0,1,2,3],matrix).pairs.length,2);
}

// Oracle indépendant par programmation dynamique sur des graphes variés.
let graphSeed=73;
for(let sample=0;sample<120;sample++){
  const n=4+2*(sample%5),players=[...Array(n).keys()];
  const matrix=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    graphSeed=(graphSeed*1664525+1013904223)>>>0;
    matrix[i][j]=matrix[j][i]=(graphSeed%3===0?0:1);
  }
  assert.equal(engine.maximumUnseenPartnerMatching(players,matrix).pairs.length,bruteMaximumUnseen(players,matrix),`appariement maximal échantillon ${sample}`);
}

function repeatKeys(court,matrix){return [court.teamA,court.teamB].filter(t=>matrix[t[0]][t[1]]>0).map(t=>engine.teamKey(t)).sort();}
function assertDuplicateNecessity(round,mode,matrix,n,courts,r){
  let selectedRepeats=0;
  for(const [c,court] of round.courts.entries()){
    const actual=repeatKeys(court,matrix);
    assert.deepEqual([...(court.necessaryDuplicates||[])].sort(),actual,`marqueur doublon ${mode} ${n}/${courts} R${r+1} T${c+1}`);
    selectedRepeats+=actual.length;
    if(mode==="ladder"){
      const [a,b,cc,d]=[...court.teamA,...court.teamB];
      const options=[[[a,b],[cc,d]],[[a,cc],[b,d]],[[a,d],[b,cc]]];
      const minimum=Math.min(...options.map(teams=>teams.filter(t=>matrix[t[0]][t[1]]>0).length));
      assert.equal(actual.length,minimum,`aucun doublon King évitable ${n}/${courts} R${r+1} T${c+1}`);
    }
  }
  if(mode==="americano"){
    const active=playersOnRound(round);
    const unseen=engine.maximumUnseenPartnerMatching(active,matrix);
    const minimum=(active.length/2)-unseen.pairs.length;
    assert.equal(selectedRepeats,minimum,`aucun doublon Americano évitable ${n}/${courts} R${r+1}`);
  }
  aggregate.necessaryDuplicates+=selectedRepeats;
}

function simulate({n,courts,mode,rounds,pattern,seed}){
  engine.setSeed(seed); const state=initialState(n,courts,mode); engine.setState(state);
  state.schedule=mode==="ladder"?[engine.buildFirstRoundLadder(n,courts)]:[];
  const ledger=freshLedger(n), metrics=createMetrics(n); let previous=null, generationMs=0, maxGenerationMs=0;
  for(let r=0;r<rounds;r++){
    let round;
    if(mode==="americano"){
      const t=performance.now(); round=engine.generateNextAmericanoRound(n,courts,state.schedule); const dt=performance.now()-t;
      generationMs+=dt;maxGenerationMs=Math.max(maxGenerationMs,dt);state.schedule.push(round);
    }else round=state.schedule[r];
    validateRound(round,n,courts); round.rest.forEach(p=>{metrics.byes[p]++;});
    assertDuplicateNecessity(round,mode,metrics.partnerMatrix,n,courts,r);
    if(previous&&mode==="ladder"){
      const expected=expectedDestinations(previous.round,previous.results,courts),actual=new Map();
      round.courts.forEach((court,i)=>[...court.teamA,...court.teamB].forEach(p=>actual.set(p,i)));
      for(const [p,dest] of expected) if(!round.rest.includes(p)) assert.equal(actual.get(p),dest,`King ${n}/${courts} R${r+1} J${p+1}`);
    }
    const results=[];
    round.courts.forEach((court,c)=>{
      const A=engine.normalizeTeam(court.teamA),B=engine.normalizeTeam(court.teamB),[a,b]=score(pattern,r,c,court);
      assert.equal(a+b,21);assert.notEqual(a,b);engine.applyResult(A,B,a,b);applyLedger(ledger,A,B,a,b);recordMatch(metrics,A,B,r);
      engine.addPartnerPair(A);engine.addPartnerPair(B);results[c]={a,b};
      if(mode==="ladder"){
        for(const x of A)for(const y of B){state.ladderOpp[x][y]++;state.ladderOpp[y][x]++;}
        engine.incLadderPartnerAndTeam(A);engine.incLadderPartnerAndTeam(B);
      }
    });
    state.results[r]=results;assertRanking(state,ledger);
    if(mode==="ladder"&&r<rounds-1){const t=performance.now();state.schedule[r+1]=engine.buildNextRoundLadder(round.courts,results,r+1);const dt=performance.now()-t;generationMs+=dt;maxGenerationMs=Math.max(maxGenerationMs,dt);}
    previous={round:JSON.parse(JSON.stringify(round)),results:JSON.parse(JSON.stringify(results))};
  }
  const spread=Math.max(...metrics.byes)-Math.min(...metrics.byes);assert.ok(spread<=1,`byes équilibrés ${n}/${courts}: ${spread}`);
  const pDistinct=metrics.partner.map(x=>x.size),oDistinct=metrics.opponent.map(x=>x.size);
  aggregate.simulations++;aggregate.rounds+=rounds;aggregate.matches+=rounds*courts;aggregate.configs.add(`${mode}:${n}/${courts}`);
  aggregate.partnerDistinct.push(...pDistinct);aggregate.opponentDistinct.push(...oDistinct);aggregate.maxByeSpread=Math.max(aggregate.maxByeSpread,spread);aggregate.gaps.push(...metrics.gaps);
  aggregate.partnerRepeats+=metrics.partner.reduce((s,m)=>s+[...m.values()].reduce((a,v)=>a+Math.max(0,v-1),0),0)/2;
  aggregate.opponentRepeats+=metrics.opponent.reduce((s,m)=>s+[...m.values()].reduce((a,v)=>a+Math.max(0,v-1),0),0)/2;
  if(rounds>=100&&n>=24&&courts===Math.floor(n/4)) aggregate.perf.push({n,courts,rounds,avgGenerationMs:generationMs/Math.max(1,rounds-1),maxGenerationMs,stateBytes:Buffer.byteLength(JSON.stringify(state)),byeSpread:spread});
}

let simulationSeed=1000;
for(let n=4;n<=32;n++)for(let courts=1;courts<=Math.floor(n/4);courts++)for(const mode of ["americano","ladder"]){
  [10,20,50,100].forEach((rounds,i)=>simulate({n,courts,mode,rounds,pattern:profiles[(n+courts+i+(mode==="ladder"?3:0))%profiles.length],seed:simulationSeed++}));
}
for(const n of [24,28,32])for(const pattern of ["random","a","b","alternate","circulate"])simulate({n,courts:n/4,mode:"ladder",rounds:250,pattern,seed:simulationSeed++});

// L'ordre d'une équipe ne change jamais son identité.
assert.equal(engine.teamKey([1,2]),engine.teamKey([2,1]));

const summary={
  simulations:aggregate.simulations,rounds:aggregate.rounds,matches:aggregate.matches,configurations:aggregate.configs.size,
  partnerDiversity:{min:Math.min(...aggregate.partnerDistinct),max:Math.max(...aggregate.partnerDistinct),average:aggregate.partnerDistinct.reduce((a,b)=>a+b,0)/aggregate.partnerDistinct.length,repeats:aggregate.partnerRepeats,averageRepeatGap:aggregate.gaps.reduce((a,b)=>a+b,0)/Math.max(1,aggregate.gaps.length)},
  opponentDiversity:{min:Math.min(...aggregate.opponentDistinct),max:Math.max(...aggregate.opponentDistinct),average:aggregate.opponentDistinct.reduce((a,b)=>a+b,0)/aggregate.opponentDistinct.length,repeats:aggregate.opponentRepeats},
  duplicates:{necessary:aggregate.necessaryDuplicates,avoidable:aggregate.avoidableDuplicates},
  byes:{maximumSpread:aggregate.maxByeSpread},performance:aggregate.perf
};
console.log("EXHAUSTIVE_CAMPAIGN_OK");
console.log(JSON.stringify(summary,null,2));
