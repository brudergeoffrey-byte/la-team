(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.LaTeamCommerceV2=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const PAYMENT_STATUSES=new Set(["pending","paid","failed","cancelled","refunded"]),ACTIVE=new Set(["held","confirmed"]);
  const clean=(value,max=120)=>String(value||"").trim().replace(/\s+/g," ").slice(0,max);
  const at=value=>{const n=Number(value);if(!Number.isFinite(n)||n<=0)throw new Error("Horodatage invalide");return n;};
  function eventCommerce({priceCents=0,currency="EUR",holdMinutes=15,registrationOpensAt=null,registrationClosesAt=null}){
    if(!Number.isInteger(priceCents)||priceCents<0)throw new Error("Prix invalide");
    if(!Number.isInteger(holdMinutes)||holdMinutes<1||holdMinutes>60)throw new Error("Durée de réservation invalide");
    return {priceCents,currency:clean(currency,3).toUpperCase(),holdMinutes,registrationOpensAt,registrationClosesAt};
  }
  function reserve(state,input,now=Date.now()){
    const time=at(now),event=state.event,rows=[...(state.reservations||[])];
    if(event.registrationStatus!=="open")throw new Error("Inscriptions fermées");
    if(event.registrationOpensAt&&time<event.registrationOpensAt)throw new Error("Inscriptions pas encore ouvertes");
    if(event.registrationClosesAt&&time>=event.registrationClosesAt)throw new Error("Inscriptions fermées");
    const replay=rows.find(row=>row.idempotencyKey===input.idempotencyKey);if(replay)return {state,reservation:replay,replayed:true};
    const occupied=rows.filter(row=>ACTIVE.has(row.status)&&(!row.expiresAt||row.expiresAt>time)).length,paid=event.priceCents>0;
    const status=occupied<event.capacity?(paid?"held":"confirmed"):"waiting",id=clean(input.reservationId,100),uid=clean(input.uid,100),key=clean(input.idempotencyKey,120);
    if(!id||!uid||!key)throw new Error("Réservation incomplète");
    const reservation={reservationId:id,clubId:event.clubId,eventId:event.eventId,uid,playerId:input.playerId?clean(input.playerId,100):null,displayName:clean(input.displayName,80),status,paymentStatus:paid&&status==="held"?"pending":(paid?"cancelled":"paid"),priceCents:event.priceCents,currency:event.currency,idempotencyKey:key,expiresAt:status==="held"?time+event.holdMinutes*60000:null,createdAt:time,updatedAt:time};
    return {state:{...state,reservations:[...rows,reservation]},reservation,replayed:false};
  }
  function applyPaymentEvent(state,event,now=Date.now()){
    const time=at(now),processed=new Set(state.processedWebhookIds||[]);if(processed.has(event.webhookId))return {state,replayed:true};
    if(!PAYMENT_STATUSES.has(event.status))throw new Error("Statut de paiement invalide");let found=false;
    const rows=(state.reservations||[]).map(row=>{if(row.reservationId!==event.reservationId)return row;found=true;
      if(Number(event.amountCents)!==row.priceCents||clean(event.currency,3).toUpperCase()!==row.currency)throw new Error("Montant de paiement invalide");
      if(event.status==="paid"&&row.status!=="held"&&row.paymentStatus!=="paid")throw new Error("Réservation non payable");
      return {...row,status:event.status==="paid"?"confirmed":event.status==="refunded"?"cancelled":row.status,paymentStatus:event.status,expiresAt:null,updatedAt:time};});
    if(!found)throw new Error("Réservation introuvable");processed.add(event.webhookId);
    return {state:{...state,reservations:rows,processedWebhookIds:[...processed]},replayed:false};
  }
  function expireAndPromote(state,now=Date.now()){
    const time=at(now),rows=(state.reservations||[]).map(row=>row.status==="held"&&row.expiresAt<=time?{...row,status:"cancelled",paymentStatus:"cancelled",expiresAt:null,updatedAt:time}:row);let occupied=rows.filter(row=>ACTIVE.has(row.status)).length;
    for(let i=0;i<rows.length&&occupied<state.event.capacity;i++)if(rows[i].status==="waiting"){const paid=state.event.priceCents>0;rows[i]={...rows[i],status:paid?"held":"confirmed",paymentStatus:paid?"pending":"paid",expiresAt:paid?time+state.event.holdMinutes*60000:null,updatedAt:time};occupied++;}
    return {...state,reservations:rows};
  }
  function prepareParticipants(state,idFactory=index=>`participant_${index}`){return (state.reservations||[]).filter(row=>row.status==="confirmed"&&row.paymentStatus==="paid").map((row,engineIndex)=>({schemaVersion:2,participantId:idFactory(engineIndex),registrationId:row.reservationId,playerId:row.playerId||null,displayNameSnapshot:row.displayName,type:row.playerId?"registered":"guest",engineIndex}));}
  return {PAYMENT_STATUSES,eventCommerce,reserve,applyPaymentEvent,expireAndPromote,prepareParticipants};
});
