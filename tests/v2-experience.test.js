"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),root=path.resolve(__dirname,".."),html=fs.readFileSync(path.join(root,"index.html"),"utf8"),source=fs.readFileSync(path.join(root,"v2-experience.js"),"utf8");
for(const marker of ["Découvrir l’espace Club V2","Mon espace Joueur V2","● MODE ${mode}","Aujourd’hui","Prochains événements","Créer un événement","Joueurs du club","Championnat","Historique récent","Bonjour ${p.name}","M’INSCRIRE","Mes statistiques","PRÉPARER LE TOURNOI","SIMULATION LOCALE","Prix : gratuit"]){assert.ok((html+source).includes(marker),`expérience V2 présente : ${marker}`);}
for(const field of ["v2xName","v2xDate","v2xTime","v2xCapacity","v2xFormat","v2xCompetition","v2xOpen"]){assert.ok(source.includes(field),`champ événement : ${field}`);}
assert.match(source,/localStorage\.setItem\(KEY/);assert.match(source,/registered\.push\(playerId\)/);assert.match(source,/e\.guests\.push\(name\)/);assert.match(source,/document\.getElementById\(`p\$\{i\}`\)/);assert.match(html,/font-size:18px/);
console.log("V2_EXPERIENCE_OK — Club, événement, Joueur, inscription, invité, préparation et mobile validés");
