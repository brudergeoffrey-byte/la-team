"use strict";

const SUPPORTED_SCORING_VERSION=1;

function validateScoring(config){
  if(!config||config.scoringVersion!==SUPPORTED_SCORING_VERSION)throw new Error("Version de barème non prise en charge");
  if(!Number.isInteger(config.winPoints)||!Number.isInteger(config.lossPoints)||config.winPoints<=config.lossPoints||config.lossPoints<0)throw new Error("Barème victoire/défaite invalide");
  if(!Number.isInteger(config.minimumMatches)||config.minimumMatches<0)throw new Error("Minimum de matchs invalide");
  return config;
}

function emptyStanding(playerId){
  return {playerId,eventIds:new Set(),partnerCounts:{},opponentCounts:{},byes:0,matches:0,wins:0,losses:0,pointsFor:0,pointsAgainst:0,difference:0,championshipPoints:0,averageChampionshipPoints:0,averageDifference:0,eligible:false};
}

function increment(map,id){if(id)map[id]=(map[id]||0)+1;}
function applySide(standing,won,forScore,againstScore,config,eventId,partners,opponents){
  standing.matches+=1;
  if(eventId)standing.eventIds.add(eventId);
  partners.forEach(id=>increment(standing.partnerCounts,id));
  opponents.forEach(id=>increment(standing.opponentCounts,id));
  standing.wins+=won?1:0;
  standing.losses+=won?0:1;
  standing.pointsFor+=forScore;
  standing.pointsAgainst+=againstScore;
  standing.difference+=forScore-againstScore;
  standing.championshipPoints+=won?config.winPoints:config.lossPoints;
}

function computeStandings(matches,rawConfig,roundSummaries=[]){
  const config=validateScoring(rawConfig),table=new Map();
  for(const match of matches){
    if(match?.status!=="validated"||!Number.isInteger(match.scoreA)||!Number.isInteger(match.scoreB)||match.scoreA===match.scoreB)continue;
    const teamA=[...new Set((match.teamAPlayerIds||[]).filter(Boolean))];
    const teamB=[...new Set((match.teamBPlayerIds||[]).filter(Boolean))];
    if(teamA.some(id=>teamB.includes(id)))throw new Error("Joueur présent dans les deux équipes");
    const aWon=match.scoreA>match.scoreB;
    for(const id of teamA){if(!table.has(id))table.set(id,emptyStanding(id));applySide(table.get(id),aWon,match.scoreA,match.scoreB,config,match.eventId,teamA.filter(other=>other!==id),teamB);}
    for(const id of teamB){if(!table.has(id))table.set(id,emptyStanding(id));applySide(table.get(id),!aWon,match.scoreB,match.scoreA,config,match.eventId,teamB.filter(other=>other!==id),teamA);}
  }
  for(const round of roundSummaries){for(const id of [...new Set((round?.byePlayerIds||[]).filter(Boolean))]){if(!table.has(id))table.set(id,emptyStanding(id));table.get(id).byes+=1;if(round.eventId)table.get(id).eventIds.add(round.eventId);}}
  const rows=[...table.values()].map(row=>({...row,eventIds:[...row.eventIds].sort(),events:row.eventIds.size,averageChampionshipPoints:row.matches?row.championshipPoints/row.matches:0,averageDifference:row.matches?row.difference/row.matches:0,eligible:row.matches>=config.minimumMatches,scoringVersion:config.scoringVersion}));
  rows.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.averageChampionshipPoints-a.averageChampionshipPoints||b.championshipPoints-a.championshipPoints||b.averageDifference-a.averageDifference||b.wins-a.wins||a.playerId.localeCompare(b.playerId));
  return rows.map((row,index)=>({...row,rank:row.eligible?1+rows.slice(0,index).filter(candidate=>candidate.eligible).length:null}));
}

module.exports={SUPPORTED_SCORING_VERSION,validateScoring,computeStandings};
