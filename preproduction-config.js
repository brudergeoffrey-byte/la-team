(function(root){
  "use strict";
  // Cette branche ne contient volontairement aucune référence au projet Firebase
  // de production. Remplacer uniquement ces valeurs après création du projet TEST.
  root.LA_TEAM_ENV=Object.freeze({
    name:"preproduction",
    label:"La Team V2 — TEST",
    demoEnabled:true,
    firebaseConfigured:false,
    firebaseConfig:Object.freeze({
      apiKey:"PREPRODUCTION_NOT_CONFIGURED",
      authDomain:"la-team-v2-test-unconfigured.firebaseapp.com",
      projectId:"la-team-v2-test-unconfigured",
      storageBucket:"la-team-v2-test-unconfigured.firebasestorage.app",
      messagingSenderId:"000000000000",
      appId:"1:000000000000:web:preproduction"
    })
  });
})(typeof window!=="undefined"?window:globalThis);
