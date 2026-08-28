#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function makeClassList(){
  const values = new Set();
  return {
    add: (...xs)=>xs.forEach(x=>values.add(x)),
    remove: (...xs)=>xs.forEach(x=>values.delete(x)),
    contains: x=>values.has(x),
    toggle: x=>values.has(x) ? (values.delete(x), false) : (values.add(x), true)
  };
}

function makeElement(id=""){
  return {
    id, value:"", innerHTML:"", textContent:"", disabled:false,
    style:{display:""}, dataset:{}, classList:makeClassList(),
    addEventListener(){}, appendChild(){}, scrollIntoView(){}, setAttribute(){}
  };
}

function loadApp(sharedStorage){
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  const storage = sharedStorage || new Map();
  const alerts = [];
  const prompts = [];
  const document = {
    getElementById(id){
      if(!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement(){ return makeElement(); }, querySelectorAll(){ return []; }
  };
  const context = {
    console, document, alerts,
    window:{scrollTo(){}}, location:{reload(){}},
    alert(message){ alerts.push(String(message)); },
    confirm(){ return false; }, prompt(){ return prompts.shift() || ""; },
    setTimeout(fn){ fn(); },
    localStorage:{
      getItem:k=>storage.has(k) ? storage.get(k) : null,
      setItem:(k,v)=>storage.set(k, String(v)),
      removeItem:k=>storage.delete(k)
    },
    Math, Date, JSON, Set, Array, Object, Number, String, Boolean, parseInt, isNaN
  };
  vm.createContext(context);
  vm.runInContext(source + `\n;globalThis.__app = {
    buildFirstRoundLadder, buildNextRoundLadder, buildScheduleAmericano,
    generateNextAmericanoRound, renderMatch, validateCourt, nextMatch, undoLast,
    editCourtScore, replacePlayer, restartSamePlayers,
    renderRecap, explainNecessaryDuplicate,
    saveToSlot, loadFromSlot, writeAutoSave, tryLoadAutoSave, stateSnapshot,
    getState:()=>state, setState:s=>{state=s;}, uniquePartnerRounds, teamKey
  };`, context);
  return {app:context.__app, context, elements, storage, alerts, prompts};
}

function initialState(n, courts, mode){
  return {
    mode, eventName:"Tournoi Test", clubName:"Club Test", n, courts, maxPoints:21, totalRounds:null,
    players:Array.from({length:n},(_,i)=>({name:`J${i+1}`,mj:0,v:0,plus:0,minus:0})),
    schedule:[], matchIndex:0, validatedCourts:[], courtScores:[], results:[],
    history:[], savedAt:null,
    ladderOpp:mode==="ladder"?Array.from({length:n},()=>Array(n).fill(0)):null,
    ladderPartner:mode==="ladder"?Array.from({length:n},()=>Array(n).fill(0)):null,
    ladderTeams:mode==="ladder"?{}:null,
    ladderByeCounts:mode==="ladder"?Array(n).fill(0):null,
    ladderLastRest:[], partnersSeen:{}, partnersFullCycleNotified:false,
    activeSaveId:null
  };
}

function roundPlayers(round){
  return round.courts.flatMap(c=>[...c.teamA,...c.teamB]);
}

function assertRound(round, n, courts){
  assert.equal(round.courts.length, courts, "nombre de terrains");
  for(const court of round.courts){
    assert.equal([...court.teamA,...court.teamB].length, 4, "4 joueurs par terrain");
  }
  const active = roundPlayers(round);
  assert.equal(new Set(active).size, active.length, "aucun joueur dupliqué");
  assert.equal(new Set(round.rest).size, round.rest.length, "aucun bye dupliqué");
  assert.equal(active.filter(p=>round.rest.includes(p)).length, 0, "actif et au repos incompatibles");
  assert.equal(active.length + round.rest.length, n, "tous les joueurs sont comptés");
  assert.deepEqual([...active,...round.rest].sort((a,b)=>a-b), [...Array(n).keys()]);
}

function scoreFor(pattern, round, court){
  if(pattern === "same-side") return [15,6];
  if(pattern === "trend") return court % 2 ? [8,13] : [13,8];
  if(pattern === "varied") return [(round*7+court*3)%10+11, 21-((round*7+court*3)%10+11)];
  const a = 11 + Math.floor(Math.random()*10);
  return [a,21-a];
}

function expectedKingDestinations(round, results, courts){
  const expected = new Map();
  round.courts.forEach((court,i)=>{
    const result = results[i];
    const winner = result.a > result.b ? court.teamA : court.teamB;
    const loser = result.a > result.b ? court.teamB : court.teamA;
    winner.forEach(p=>expected.set(p, Math.max(0,i-1)));
    loser.forEach(p=>expected.set(p, Math.min(courts-1,i+1)));
  });
  return expected;
}

function runScenario({mode,n,courts,rounds,pattern,corrections=false}){
  const {app,elements} = loadApp();
  const s = initialState(n,courts,mode);
  app.setState(s);
  s.schedule = mode === "ladder"
    ? [app.buildFirstRoundLadder(n,courts)]
    : app.buildScheduleAmericano(n,courts);

  const partnerCounts = new Map();
  let previous = null;
  for(let r=0;r<rounds;r++){
    app.renderMatch();
    const current = app.getState();
    const round = current.schedule[current.matchIndex];
    assertRound(round,n,courts);

    if(previous && mode === "ladder"){
      const expected = expectedKingDestinations(previous.round, previous.results, courts);
      const actual = new Map();
      round.courts.forEach((court,i)=>[...court.teamA,...court.teamB].forEach(p=>actual.set(p,i)));
      for(const [player,destination] of expected){
        if(!round.rest.includes(player)) assert.equal(actual.get(player),destination,`mouvement King J${player+1}`);
      }
    }

    for(const court of round.courts){
      for(const team of [court.teamA,court.teamB]){
        const key = [...team].sort((a,b)=>a-b).join("-");
        partnerCounts.set(key,(partnerCounts.get(key)||0)+1);
      }
    }

    for(let c=0;c<courts;c++){
      const [a,b] = scoreFor(pattern,r,c);
      elements.get(`scoreA_${c}`).value = String(a);
      elements.get(`scoreB_${c}`).value = String(b);
      app.validateCourt(c);
    }
    if(corrections && r === 2){
      const matchesBefore = app.getState().players.reduce((sum,p)=>sum+p.mj,0);
      app.editCourtScore(0);
      assert.equal(app.getState().validatedCourts[0],false,"terrain rouvert pour correction");
      assert.equal(app.getState().players.reduce((sum,p)=>sum+p.mj,0),matchesBefore-4,"ancien score annulé");
      elements.get("scoreA_0").value = "6";
      elements.get("scoreB_0").value = "15";
      app.validateCourt(0);
      assert.equal(app.getState().validatedCourts[0],true,"score corrigé revalidé");
      assert.equal(app.getState().players.reduce((sum,p)=>sum+p.mj,0),matchesBefore,"statistiques restaurées une seule fois");
    }
    const results = JSON.parse(JSON.stringify(app.getState().results[r]));
    previous = {round:JSON.parse(JSON.stringify(round)),results};

    if(r < rounds-1){
      const beforeNext = app.stateSnapshot();
      app.nextMatch();
      assert.ok(app.getState().history.length<=20,"historique borné pour garder l'application fluide");
      if(r === Math.min(2,rounds-2)){
        app.undoLast();
        assert.deepEqual(app.stateSnapshot(),beforeNext,"Retour restaure exactement l'état précédent");
        app.nextMatch();
      }
    }
  }

  if(n > courts*4 && mode === "ladder"){
    const counts = app.getState().ladderByeCounts;
    assert.ok(Math.max(...counts)-Math.min(...counts)<=1,"byes King équilibrés");
  }
  return {app,partnerCounts};
}

const scenarios = [
  [4,1,20],[8,2,50],[12,3,100],[16,4,20],
  [8,1,50],[12,2,50],[16,3,50]
];

// L'écran de création ne contient plus les anciens champs événement/club.
{
  const html=fs.readFileSync(path.resolve(__dirname,"..","index.html"),"utf8");
  assert.ok(!html.includes('id="eventName"'));
  assert.ok(!html.includes('id="clubName"'));
  assert.ok(!html.includes("Votre événement"));
}
const patterns = ["varied","trend","same-side","random"];
for(const mode of ["americano","ladder"]){
  for(let i=0;i<scenarios.length;i++){
    const [n,courts,rounds] = scenarios[i];
    runScenario({mode,n,courts,rounds,pattern:patterns[(i+(mode==="ladder"?1:0))%patterns.length]});
    if(process.env.VERBOSE_TESTS) console.error(`fait ${mode} ${n}/${courts} ${rounds}`);
  }
}

for(const [rounds,pattern,corrections] of [[20,"same-side",true],[50,"trend",false],[100,"random",false]]){
  runScenario({mode:"ladder",n:32,courts:8,rounds,pattern,corrections});
  if(process.env.VERBOSE_TESTS) console.error(`fait ladder 32/8 ${rounds}`);
}

// Badge explicatif et compteur du récapitulatif après épuisement des paires.
{
  const {app,context}=loadApp();
  const s=initialState(4,1,"americano");app.setState(s);s.schedule=app.buildScheduleAmericano(4,1);
  for(let r=0;r<4;r++){
    if(!s.schedule[r]) s.schedule.push(context.__app.generateNextAmericanoRound(4,1,s.schedule));
    s.results[r]=[{a:15,b:6}];s.matchIndex=r;
  }
  const target=makeElement();app.renderRecap(target,true);
  assert.ok(target.innerHTML.includes("doublons nécessaires"),"compteur final des doublons");
  app.explainNecessaryDuplicate();
  assert.ok(context.alerts.at(-1).includes("répétition est donc inévitable"),"explication simple du badge");
}

// Americano complet : zéro partenaire répété pendant le cycle théorique n-1.
for(const n of [4,8,12,16]){
  const {partnerCounts} = runScenario({mode:"americano",n,courts:n/4,rounds:n-1,pattern:"varied"});
  assert.equal(partnerCounts.size,n*(n-1)/2);
  assert.ok([...partnerCounts.values()].every(count=>count===1));
}

// Sauvegarde et autosave conservent exactement l'état métier.
{
  const {app} = loadApp();
  const s = initialState(8,2,"ladder");
  app.setState(s); s.schedule=[app.buildFirstRoundLadder(8,2)];
  assert.equal(app.saveToSlot("slot-test","Simulation"),true);
  const saved = app.stateSnapshot();
  app.getState().players[0].plus=999;
  assert.equal(app.loadFromSlot("slot-test"),true);
  assert.deepEqual(app.stateSnapshot(),saved);
  app.writeAutoSave();
  const autosaved = app.stateSnapshot();
  app.getState().players[0].plus=777;
  assert.equal(app.tryLoadAutoSave(),true);
  assert.deepEqual(app.stateSnapshot(),autosaved);
}

// Actions organisateur : remplacement, fermeture/reprise et nouveau tournoi.
{
  const sharedStorage = new Map();
  const first = loadApp(sharedStorage);
  const s = initialState(12,3,"ladder");
  first.app.setState(s); s.schedule=[first.app.buildFirstRoundLadder(12,3)];

  first.prompts.push("J1","Remplaçant 1");
  first.app.replacePlayer();
  assert.equal(first.app.getState().players[0].name,"Remplaçant 1","joueur renommé");
  assert.equal(first.app.getState().history.length,1,"remplacement annulable");
  const renamed = first.app.stateSnapshot();

  // Nouvelle instance = fermeture puis réouverture de l'application.
  const reopened = loadApp(sharedStorage);
  assert.equal(reopened.app.tryLoadAutoSave(),true,"autosave retrouvé après réouverture");
  reopened.app.renderMatch();
  assert.deepEqual(reopened.app.stateSnapshot(),renamed,"reprise exacte après fermeture");

  reopened.app.restartSamePlayers();
  const restarted = reopened.app.getState();
  assert.equal(restarted.players[0].name,"Remplaçant 1","noms conservés au redémarrage");
  assert.ok(restarted.players.every(p=>p.mj===0&&p.v===0&&p.plus===0&&p.minus===0),"statistiques remises à zéro");
  assert.equal(restarted.matchIndex,0);
  assert.equal(restarted.history.length,0);
  assertRound(restarted.schedule[0],12,3);
}

console.log("OK — 17 simulations longues (dont King 32/8) + 4 cycles Americano + correction/persistance/Retour validés");
