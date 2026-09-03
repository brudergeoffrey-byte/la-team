"use strict";

const {initializeApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {onDocumentWritten}=require("firebase-functions/v2/firestore");
const {computeStandings}=require("./src/scoring");

initializeApp();

async function rebuild(event){
    const changed=event.data.after.exists?event.data.after.data():event.data.before.data();
    const {clubId}=event.params,seasonId=changed?.seasonId;
    if(!seasonId)return;
    const db=getFirestore(),seasonRef=db.doc(`clubs/${clubId}/seasons/${seasonId}`),seasonDoc=await seasonRef.get();
    if(!seasonDoc.exists)throw new Error("Saison introuvable");
    const season=seasonDoc.data();
    if(season.clubId!==clubId)throw new Error("Saison hors club");
    const [matchSnapshot,roundSnapshot]=await Promise.all([
      db.collectionGroup("matches").where("clubId","==",clubId).where("seasonId","==",seasonId).where("status","==","validated").get(),
      db.collectionGroup("roundSummaries").where("clubId","==",clubId).where("seasonId","==",seasonId).get()
    ]);
    const matches=matchSnapshot.docs.map(doc=>doc.data()),rounds=roundSnapshot.docs.map(doc=>doc.data()),standings=computeStandings(matches,season.scoring,rounds),batch=db.batch(),standingCollection=seasonRef.collection("standings");
    const recalculatedAt=FieldValue.serverTimestamp();
    for(const row of standings){
      batch.set(standingCollection.doc(row.playerId),{...row,clubId,seasonId,recalculatedAt});
    }
    const current=await standingCollection.get(),activeIds=new Set(standings.map(row=>row.playerId));
    current.docs.filter(doc=>!activeIds.has(doc.id)).forEach(doc=>batch.delete(doc.ref));
    await batch.commit();
}

exports.rebuildSeasonStandings=onDocumentWritten({document:"clubs/{clubId}/tournaments/{tournamentId}/matches/{matchId}",region:"europe-west1"},rebuild);
exports.rebuildSeasonStandingsForByes=onDocumentWritten({document:"clubs/{clubId}/tournaments/{tournamentId}/roundSummaries/{roundNumber}",region:"europe-west1"},rebuild);
