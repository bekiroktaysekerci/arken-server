const fs=require('fs'),assert=require('assert');
const server=fs.readFileSync('server.js','utf8'),html=fs.readFileSync('public/index.html','utf8');
for(const id of ['arkenJourney','arkenJourneyText','arkenJourneyAction','arkenGuideDialog'])assert(html.includes(`id="${id}"`),id);
for(const fn of ['openArkenGuide','arkenJourneyNext','renderArkenJourney'])assert(html.includes(`function ${fn}(`),fn);
for(const ev of ['start_battle_stage','claim_quest_reward','gather_spirit_herb','travel_to_region','attempt_cultivation_breakthrough'])assert(server.includes(ev),ev);
assert(server.includes('stageRegion[stage.id]'),'Sefer bölge doğrulaması');
assert(server.includes("stage.id === 1 && loot.length === 0"),'İlk av ganimet garantisi');
assert(html.includes("onNpc:(tab,name)=>tab==='questsTab'?openArkenGuide()"),'Phaser rehber etkileşimi');
console.log('Başlangıç döngüsü sözleşme testleri başarılı.');
