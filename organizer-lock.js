(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports) module.exports=api;
  if(root) root.LaTeamOrganizerLock=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const VERSION=1;
  const ITERATIONS=600000;
  const STORAGE_KEY="la-team-organizer-pin-v1";
  const FAILURE_KEY="la-team-organizer-pin-failures-v1";

  function isValidPin(pin){ return /^\d{4}$/.test(String(pin||"")); }
  function bytesToBase64(bytes){
    if(typeof Buffer!=="undefined") return Buffer.from(bytes).toString("base64");
    let binary=""; bytes.forEach(byte=>{binary+=String.fromCharCode(byte);}); return btoa(binary);
  }
  function base64ToBytes(value){
    if(typeof Buffer!=="undefined") return new Uint8Array(Buffer.from(value,"base64"));
    return Uint8Array.from(atob(value),char=>char.charCodeAt(0));
  }
  async function derive(pin,salt,iterations,cryptoApi){
    const subtle=cryptoApi.subtle;
    const key=await subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);
    const bits=await subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256);
    return new Uint8Array(bits);
  }
  async function createRecord(pin,cryptoApi=(typeof crypto!=="undefined"?crypto:null),iterations=ITERATIONS){
    if(!isValidPin(pin)) throw new Error("PIN_INVALID");
    if(!cryptoApi?.subtle || !cryptoApi?.getRandomValues) throw new Error("CRYPTO_UNAVAILABLE");
    const salt=cryptoApi.getRandomValues(new Uint8Array(16));
    const hash=await derive(pin,salt,iterations,cryptoApi);
    return {version:VERSION,algorithm:"PBKDF2-SHA-256",iterations,salt:bytesToBase64(salt),hash:bytesToBase64(hash)};
  }
  async function verifyPin(pin,record,cryptoApi=(typeof crypto!=="undefined"?crypto:null)){
    if(!isValidPin(pin)||!record||record.version!==VERSION||!cryptoApi?.subtle) return false;
    const actual=await derive(pin,base64ToBytes(record.salt),Number(record.iterations),cryptoApi);
    const expected=base64ToBytes(record.hash);
    if(actual.length!==expected.length) return false;
    let difference=0; for(let i=0;i<actual.length;i++) difference|=actual[i]^expected[i];
    return difference===0;
  }
  function failureState(previous,now=Date.now()){
    const count=(Number(previous?.count)||0)+1;
    const delay=count>=5?Math.min(300000,30000*Math.pow(2,Math.floor((count-5)/2))):0;
    return {count,lockedUntil:now+delay};
  }
  function remainingLockMs(record,now=Date.now()){ return Math.max(0,(Number(record?.lockedUntil)||0)-now); }

  return {VERSION,ITERATIONS,STORAGE_KEY,FAILURE_KEY,isValidPin,createRecord,verifyPin,failureState,remainingLockMs};
});
