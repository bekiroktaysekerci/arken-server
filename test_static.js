const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const requiredHtml = ['gameScreen','gameMapViewport','localPlayerSprite','arkenPlayerPanel','arkenSkillBar','popupModalWindow','customModal','mapTab','bossScheduleInfo'];
const requiredEvents = ['player_login','player_move','start_battle_stage','battle_use_skill','claim_quest_reward','upgrade_abode_building','equip_item','enhance_equipment','craft_item','attack_world_boss','send_pvp_challenge','create_guild','guild_chat_message','travel_to_region','gather_spirit_herb','use_consumable','attempt_cultivation_breakthrough'];
const missingHtml = requiredHtml.filter(x => !html.includes(`id="${x}"`));
const requiredFeatures = ['q_heng_01','q_ji_01','mat_inverse_scale','rollDropTable','getPassiveMultiplier','MAP_SPEED','GÖK GÜRÜLTÜSÜ YARGISI','Europe/Istanbul','scheduleDailyBossSpawn','WorldBossStateModel','request_boss_status'];
const missingFeatures = requiredFeatures.filter(x => !server.includes(x));
const missingEvents = requiredEvents.filter(x => !server.includes(`'${x}'`));
const requiredUi = ['system-screen-head','setInventoryFilter','inventory-category','sprite-atlas','sprite-flight','openPopup(tabId, titleText)'];
const missingUi = requiredUi.filter(x => !html.includes(x));
const spriteFiles = ['swordmaster','spirit-mage','assassin','ancient-warrior','healer','dragon-priest'].map(n => `public/assets/sprites/${n}.svg`);
const missingSprites = spriteFiles.filter(f => !fs.existsSync(f) || (fs.existsSync(f) && (fs.readFileSync(f,'utf8').match(/<g transform=/g)||[]).length !== 16));
if (missingHtml.length || missingEvents.length || missingFeatures.length || missingUi.length || missingSprites.length) {
  console.error({ missingHtml, missingEvents, missingFeatures, missingUi, missingSprites });
  process.exit(1);
}
console.log('Statik sözleşme kontrolü başarılı: ayrı sistem ekranları, çanta filtreleri, altı sınıf için 4x4 sprite atlasları, sprite oynatıcı ve günlük boss takvimi mevcut. Bu test canlı MongoDB/Socket.IO testi değildir.');
