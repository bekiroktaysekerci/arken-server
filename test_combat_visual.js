const fs=require('node:fs');const assert=require('node:assert/strict');const source=fs.readFileSync('public/phaser_combat.js','utf8');
for(const feature of ['drawFighter','PALETTES','telegraph','burst(','tweens.add','lastAction.seq','f.boss'])assert.ok(source.includes(feature),`Eksik görsel bileşen: ${feature}`);
const server=fs.readFileSync('server.js','utf8');for(const feature of ['selectAction(battle,now)','calculateHit(battle.enemyAttack','battle.telegraph','battle.lastAction','enemyTurns'])assert.ok(server.includes(feature),`Eksik sunucu AI bağlantısı: ${feature}`);
console.log('Animasyon/AI olay sözleşmesi kontrolleri başarılı (gerçek render testi değildir).');
