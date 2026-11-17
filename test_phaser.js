const assert=require('node:assert/strict');
const fs=require('node:fs');
const {findRoute,MAPS}=require('./public/phaser_world.js');
const geom=require('./public/assets/map_geometry.json');
const w=1200,h=720;
for(const id of Object.keys(MAPS)){
  assert.ok(geom[id],`Harita geometrisi yok: ${id}`);
  assert.ok(Array.isArray(geom[id].obstacles));
}
const path=findRoute({x:100,y:560},{x:1100,y:560},w,h,geom.map_heng_yue.obstacles);
assert.ok(path.length>0,'Yürünebilir hedefe rota çıkmalı');
assert.deepEqual(path.at(-1),{x:1100,y:560});
const blocked=findRoute({x:100,y:560},{x:120,y:220},w,h,geom.map_heng_yue.obstacles);
assert.deepEqual(blocked,[],'Engelin içine rota çıkmamalı');
const corridor=[{x:.35,y:0,w:.15,h:.65}];
const detour=findRoute({x:100,y:200},{x:950,y:200},w,h,corridor);
assert.ok(detour.length>1,'Engel çevresinden A* benzeri rota bulunmalı');
for(const pt of detour)assert.ok(Number.isFinite(pt.x)&&Number.isFinite(pt.y));
const html=fs.readFileSync('public/index.html','utf8');
for(const id of ['arkenPhaserWorld','arkenPhaserCombat'])assert.ok(html.includes(`id="${id}"`));
for(const script of ['phaser_world.js','phaser_combat.js','/vendor/phaser.min.js'])assert.ok(html.includes(script));
for(const event of ['battle_started','battle_tick_update','battle_ended','player_moved','player_position_corrected'])assert.ok(html.includes(event));
const server=fs.readFileSync('server.js','utf8');
assert.ok(server.includes('battleAiTimer=setInterval'));
assert.ok(server.includes("app.use('/vendor'"));
assert.ok(server.includes('battle.processing=true'));
assert.ok(fs.existsSync('public/assets/temple_courtyard.webp'));
console.log('Phaser entegrasyon, A* rota, engel, 4 bölge, savaş AI ve HUD bağlantı testleri başarılı. Grafik render/canlı DB testi değildir.');
