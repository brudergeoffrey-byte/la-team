(function(root){
  "use strict";
  // Configuration publique dédiée au projet Firebase de préproduction.
  // Aucune référence au projet Firebase de production n'est autorisée ici.
  root.LA_TEAM_ENV=Object.freeze({
    name:"preproduction",
    label:"NextPadel — TEST",
    demoEnabled:true,
    firebaseConfigured:true,
    firebaseConfig:Object.freeze({
      apiKey:"AIzaSyAZLFFj8duKPck7bp0B-MSb3ti64o0L4ao",
      authDomain:"la-team-v2-test.firebaseapp.com",
      projectId:"la-team-v2-test",
      storageBucket:"la-team-v2-test.firebasestorage.app",
      messagingSenderId:"935053612201",
      appId:"1:935053612201:web:e963c7fcce2bbf222305b8"
    })
  });
})(typeof window!=="undefined"?window:globalThis);
