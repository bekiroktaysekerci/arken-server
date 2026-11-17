// Pure, deterministic battle AI policy. Damage is always calculated on the server.
'use strict';
const PATTERNS={1:{windup:950,multiplier:1.6,name:'Yırtıcı Hamle'},2:{windup:1100,multiplier:1.9,name:'Ruh Çarpması'},3:{windup:1250,multiplier:2.2,name:'Mühür Patlaması'},4:{windup:1050,multiplier:2.4,name:'Kızıl İnfaz'},5:{windup:1450,multiplier:2.8,name:'Ejderha Nefesi'}};
function selectAction(battle,now){
 if(battle.telegraph){if(now < battle.telegraph.resolveAt)return {type:'waiting'};return {type:'special',...battle.telegraph};}
 const interval=battle.bossPhase===2?1650:2500;
 if(now-(battle.lastEnemyTurn||now)<interval)return {type:'waiting'};
 const cycle=(battle.enemyTurns||0)+1;
 if(battle.isBoss && cycle%3===0){const p=PATTERNS[battle.stageId]||PATTERNS[3];return {type:'telegraph',...p,resolveAt:now+p.windup};}
 return {type:'attack',multiplier:1};
}
function calculateHit(attack,defense,multiplier=1,shield=0){
 const raw=Math.max(1,Math.floor(attack*multiplier-Math.max(0,defense)*.6));
 const absorbed=Math.min(Math.max(0,shield),raw);
 return {damage:raw-absorbed,absorbed};
}
module.exports={selectAction,calculateHit,PATTERNS};
