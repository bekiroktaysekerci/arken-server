const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(express.static('public'));

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://KULLANICI:SIFRE@cluster0.6dmig6t.mongodb.net/arkendunyasi";

// ==========================================
// 1. OYUN VERİTABANI VE DENGE TABLOLARI
// ==========================================

const CULTIVATION_REALMS = [
  { id: 1, name: "Öz Duyumu", subSteps: 3, reqEnergyPerStep: 200, breakthroughCost: { crystals: 100, spiritStones: 10 }, successRate: 100, bonuses: { attack: 15, hp: 50, defense: 5 } },
  { id: 2, name: "Ruh Damarı Açılımı", subSteps: 4, reqEnergyPerStep: 500, breakthroughCost: { crystals: 250, spiritStones: 25 }, successRate: 90, bonuses: { attack: 30, hp: 100, defense: 10 } },
  { id: 3, name: "Öz Biriktirme", subSteps: 5, reqEnergyPerStep: 1200, breakthroughCost: { crystals: 500, spiritStones: 50 }, successRate: 80, bonuses: { attack: 60, hp: 200, defense: 20, crit: 2 } },
  { id: 4, name: "Ruh Çekirdeği", subSteps: 5, reqEnergyPerStep: 3000, breakthroughCost: { crystals: 1200, spiritStones: 120 }, successRate: 70, bonuses: { attack: 120, hp: 400, defense: 40, crit: 3 } },
  { id: 5, name: "İlahi Ruh", subSteps: 6, reqEnergyPerStep: 7500, breakthroughCost: { crystals: 2500, spiritStones: 250 }, successRate: 60, bonuses: { attack: 250, hp: 800, defense: 80, crit: 5 } },
  { id: 6, name: "Göksel Dönüşüm", subSteps: 6, reqEnergyPerStep: 18000, breakthroughCost: { crystals: 5000, spiritStones: 500 }, successRate: 50, bonuses: { attack: 500, hp: 1500, defense: 150, crit: 7 } },
  { id: 7, name: "Âlem Kırılması", subSteps: 7, reqEnergyPerStep: 40000, breakthroughCost: { crystals: 10000, spiritStones: 1000 }, successRate: 40, bonuses: { attack: 1000, hp: 3000, defense: 300, crit: 10 } },
  { id: 8, name: "Kadim Varlık", subSteps: 7, reqEnergyPerStep: 90000, breakthroughCost: { crystals: 22000, spiritStones: 2200 }, successRate: 30, bonuses: { attack: 2000, hp: 6000, defense: 600, crit: 12 } },
  { id: 9, name: "İlk Öz Hâkimiyeti", subSteps: 9, reqEnergyPerStep: 200000, breakthroughCost: { crystals: 50000, spiritStones: 5000 }, successRate: 20, bonuses: { attack: 5000, hp: 15000, defense: 1500, crit: 15 } }
];

const CHARACTER_CLASSES = {
  "Kılıç Ustası": { attackMult: 1.15, defenseMult: 1.0, hpMult: 1.05, critBonus: 2 },
  "Ruh Büyücüsü": { attackMult: 1.25, defenseMult: 0.85, hpMult: 0.90, critBonus: 0 },
  "Gölge Suikastçısı": { attackMult: 1.12, defenseMult: 0.90, hpMult: 0.95, critBonus: 12 },
  "Kadim Savaşçı": { attackMult: 0.95, defenseMult: 1.30, hpMult: 1.35, critBonus: 0 },
  "İklim / Şifacı Ustası": { attackMult: 0.90, defenseMult: 1.10, hpMult: 1.15, critBonus: 0 },
  "Gök Ejderha Rahibi": { attackMult: 1.10, defenseMult: 1.10, hpMult: 1.15, critBonus: 5 }
};

const CLASS_SKILLS = {
  "Kılıç Ustası": [
    { id: "s1", name: "Yıldırım Kılıcı", manaCost: 25, cooldown: 3, reqRealm: 0, mult: 1.5, desc: "Rakibe hızlı bir yıldırım darbesi indirir." },
    { id: "s2", name: "Bin Kılıç Çemberi", manaCost: 45, cooldown: 6, reqRealm: 1, mult: 2.2, desc: "Etraftakilere alan kesme hasarı verir." },
    { id: "s3", name: "Ruh Kesen Darbe", manaCost: 70, cooldown: 10, reqRealm: 3, mult: 3.5, desc: "Kritik şansı yüksek ölümcül vuruş." },
    { id: "s4", name: "Göksel Kılıç Hükmü", manaCost: 120, cooldown: 18, reqRealm: 5, mult: 5.5, desc: "Gökyüzünden manevi kılıç yağdırır." }
  ],
  "Ruh Büyücüsü": [
    { id: "m1", name: "Yıldırım Topu", manaCost: 30, cooldown: 3, reqRealm: 0, mult: 1.6, desc: "Konsantre elektrik topu fırlatır." },
    { id: "m2", name: "Alev Fırtınası", manaCost: 55, cooldown: 7, reqRealm: 1, mult: 2.4, desc: "Bölgeyi ateş çemberine alır." },
    { id: "m3", name: "Mutlak Ayaz", manaCost: 80, cooldown: 12, reqRealm: 3, mult: 3.8, desc: "Rakipleri dondurarak hasar verir." },
    { id: "m4", name: "Yıldız Yağmuru", manaCost: 140, cooldown: 20, reqRealm: 5, mult: 6.0, desc: "Gök cisimlerini hedefe yönlendirir." }
  ],
  "Gölge Suikastçısı": [
    { id: "a1", name: "Gölge Adımı", manaCost: 20, cooldown: 3, reqRealm: 0, mult: 1.4, desc: "Gölgeden ani sızma darbesi." },
    { id: "a2", name: "Zehirli Hançer", manaCost: 40, cooldown: 6, reqRealm: 1, mult: 2.0, desc: "Zehirli bıçak darbesi." },
    { id: "a3", name: "Kritik İnfaz", manaCost: 75, cooldown: 11, reqRealm: 3, mult: 4.0, desc: "Yüksek kritik çarpanlı suikast." },
    { id: "a4", name: "Karanlık Sis", manaCost: 130, cooldown: 19, reqRealm: 5, mult: 5.8, desc: "Karanlık sis içinden yıkıcı darbe." }
  ],
  "Kadim Savaşçı": [
    { id: "w1", name: "Kaya Yumruğu", manaCost: 20, cooldown: 3, reqRealm: 0, mult: 1.3, desc: "Toprak özüyle güçlendirilmiş yumruk." },
    { id: "w2", name: "Demir Kalkan", manaCost: 40, cooldown: 8, reqRealm: 1, mult: 1.5, type: "shield", desc: "Güçlü savunma kalkanı oluşturur." },
    { id: "w3", name: "Öfke Çığlığı", manaCost: 65, cooldown: 12, reqRealm: 3, mult: 3.0, desc: "Düşmanları sarsan darbe." },
    { id: "w4", name: "Titan Çöküşü", manaCost: 110, cooldown: 18, reqRealm: 5, mult: 5.0, desc: "Yeri sarsan devasa vuruş." }
  ],
  "İklim / Şifacı Ustası": [
    { id: "p1", name: "Şifa Işığı", manaCost: 35, cooldown: 4, reqRealm: 0, mult: 1.1, type: "heal", desc: "Hayati enerjiyi iyileştirir." },
    { id: "p2", name: "Zehir Bulutu", manaCost: 50, cooldown: 8, reqRealm: 1, mult: 2.1, desc: "Alana zehir gazı yayar." },
    { id: "p3", name: "İksir Güçlendirmesi", manaCost: 70, cooldown: 14, reqRealm: 3, mult: 2.8, desc: "Manevi patlama hasarı verir." },
    { id: "p4", name: "Kutsal Diriliş Aurası", manaCost: 130, cooldown: 22, reqRealm: 5, mult: 4.5, type: "heal", desc: "Yüksek iyileştirme ve hasar." }
  ],
  "Gök Ejderha Rahibi": [
    { id: "d1", name: "Ejderha Pençesi", manaCost: 25, cooldown: 3, reqRealm: 0, mult: 1.5, desc: "Keskin ejderha pençesi darbesi." },
    { id: "d2", name: "Alevli Nefes", manaCost: 50, cooldown: 7, reqRealm: 1, mult: 2.3, desc: "Püskürtülen ejderha ateşi." },
    { id: "d3", name: "Pul Kalkan", manaCost: 75, cooldown: 12, reqRealm: 3, mult: 2.5, type: "shield", desc: "Ejderha pullarıyla zırhlanma." },
    { id: "d4", name: "Kızıl Ejder Öfkesi", manaCost: 135, cooldown: 20, reqRealm: 5, mult: 5.8, desc: "Ejderha gücü salınımı." }
  ]
};

const ABODE_BUILDINGS = {
  spiritRoom: { id: "spiritRoom", name: "Ruh Odası", icon: "🧘‍♂️", maxLevel: 10, unlockReq: { level: 1, realmIndex: 0 }, getBaseCost: (lvl) => ({ crystals: lvl * 150, stones: lvl * 15 }) },
  essencePool: { id: "essencePool", name: "Öz Havuzu", icon: "🌊", maxLevel: 10, unlockReq: { level: 1, realmIndex: 0 }, getBaseCost: (lvl) => ({ crystals: lvl * 120, stones: lvl * 10 }) },
  alchemyRoom: { id: "alchemyRoom", name: "Simya Odası", icon: "⚗️", maxLevel: 10, unlockReq: { level: 3, realmIndex: 0 }, getBaseCost: (lvl) => ({ crystals: lvl * 250, stones: lvl * 30 }) },
  forge: { id: "forge", name: "Demirci", icon: "⚒️", maxLevel: 10, unlockReq: { level: 5, realmIndex: 1 }, getBaseCost: (lvl) => ({ crystals: lvl * 350, stones: lvl * 50 }) },
  spiritGarden: { id: "spiritGarden", name: "Ruh Bahçesi", icon: "🌿", maxLevel: 10, unlockReq: { level: 10, realmIndex: 1 }, getBaseCost: (lvl) => ({ crystals: lvl * 250, stones: lvl * 40 }) },
  ancientLibrary: { id: "ancientLibrary", name: "Kadim Kütüphane", icon: "📜", maxLevel: 10, unlockReq: { level: 15, realmIndex: 2 }, getBaseCost: (lvl) => ({ crystals: lvl * 600, stones: lvl * 100 }) },
  treasury: { id: "treasury", name: "Hazine Odası", icon: "🏆", maxLevel: 10, unlockReq: { level: 20, realmIndex: 3 }, getBaseCost: (lvl) => ({ crystals: lvl * 800, stones: lvl * 150 }) },
  trainingGround: { id: "trainingGround", name: "Eğitim Alanı", icon: "⚔️", maxLevel: 10, unlockReq: { level: 25, realmIndex: 4 }, getBaseCost: (lvl) => ({ crystals: lvl * 1000, stones: lvl * 200 }) }
};

const ITEM_RARITIES = {
  COMMON: { name: "Sıradan", multiplier: 1.0 },
  RARE: { name: "Nadir", multiplier: 1.35 },
  EPIC: { name: "Epik", multiplier: 1.8 },
  LEGENDARY: { name: "Efsanevi", multiplier: 2.5 },
  ANCIENT: { name: "Kadim", multiplier: 3.5 },
  DIVINE: { name: "İlahi", multiplier: 5.0 }
};

const ITEM_DATABASE = {
  mat_spirit_herb: { id: "mat_spirit_herb", name: "Ruh Otu", type: "material", rarity: "COMMON", maxStack: 99 },
  mat_dragon_scale: { id: "mat_dragon_scale", name: "Ejderha Pulu", type: "material", rarity: "EPIC", maxStack: 99 },
  pills_qi_gathering: { id: "pills_qi_gathering", name: "Toplanma Hapı", type: "consumable", rarity: "RARE", effect: { type: "energy", value: 500 } },
  eq_iron_sword: { id: "eq_iron_sword", name: "Demir Uçlu Kılıç", type: "equipment", slot: "weapon", rarity: "COMMON", baseStats: { attack: 35 } },
  eq_jade_blade: { id: "eq_jade_blade", name: "Yeşim Ejderha Kılıcı", type: "equipment", slot: "weapon", rarity: "EPIC", baseStats: { attack: 140, critRate: 5 } },
  eq_heaven_armor: { id: "eq_heaven_armor", name: "Göksel Çelik Zırh", type: "equipment", slot: "chest", rarity: "LEGENDARY", baseStats: { defense: 120, hp: 500 } }
};

const CRAFTING_RECIPES = [
  { resultId: "eq_jade_blade", building: "forge", reqLevel: 1, cost: { crystals: 500, stones: 50, materials: { mat_dragon_scale: 1 } } },
  { resultId: "pills_qi_gathering", building: "alchemyRoom", reqLevel: 1, cost: { crystals: 100, stones: 10, materials: { mat_spirit_herb: 2 } } }
];

const QUEST_DATABASE = [
  { id: "q_main_1", type: "kill", title: "İlk Adım: Kurt Avı", desc: "Sefer veya haritada 3 yaratık alt et.", targetCount: 3, reward: { crystals: 300, stones: 30, energy: 400, xp: 400 } },
{ id: "q_daily_1", type: "harvest", title: "Günlük Meditasyon", desc: "Kadim Kalıntı'dan 1 kez AFK hasadı yap.", targetCount: 1, reward: { crystals: 150, stones: 15, energy: 250, xp: 200 } },
{ id: "q_realm_1", type: "breakthrough", title: "Gök Gürültüsü Sınavı", desc: "En az 1 kez Yetişim basamağı atla.", targetCount: 1, reward: { crystals: 800, stones: 80, energy: 1000, xp: 1200 } }
];
const BATTLE_STAGES = [
{ id: 1, name: "Kül Vadisi Girişi", enemyName: "Yabani Kurt Muhafızı", hp: 900, attack: 35, reward: { crystals: 80, stones: 10, energy: 150, xp: 250, dropItem: "mat_spirit_herb" } },
{ id: 2, name: "Yeşim Orman Kalbi", enemyName: "Ruh Emen Ağaç İblisi", hp: 2800, attack: 80, reward: { crystals: 200, stones: 25, energy: 400, xp: 700, dropItem: "mat_dragon_scale" } },
{ id: 3, name: "Kadim Gök Ejderhası İni", enemyName: "Kadim Gök Ejderhası", hp: 10000, attack: 160, isBoss: true, reward: { crystals: 1000, stones: 100, energy: 2000, xp: 4000, dropItem: "eq_jade_blade" } }
];
// ==========================================
// 2. MONGODB VERİTABANI ŞEMALARI
// ==========================================
const playerSchema = new mongoose.Schema({
version: { type: String, default: "2.0.0" },
username: { type: String, unique: true, required: true, trim: true },
className: { type: String, default: 'Kılıç Ustası' },
level: { type: Number, default: 1 },
xp: { type: Number, default: 0 },
nextLevelXp: { type: Number, default: 1000 },
power: { type: Number, default: 250 },
cultivationRealm: { type: String, default: 'Öz Duyumu' },
cultivationRealmIndex: { type: Number, default: 0 },
cultivationSubStep: { type: Number, default: 1 },
cultivationEnergy: { type: Number, default: 200 },
hp: { type: Number, default: 500 },
maxHp: { type: Number, default: 500 },
mana: { type: Number, default: 200 },
maxMana: { type: Number, default: 200 },
attackPower: { type: Number, default: 120 },
defense: { type: Number, default: 50 },
critRate: { type: Number, default: 10 },
critDamage: { type: Number, default: 150 },
currencies: {
essenceCrystals: { type: Number, default: 300 },
spiritStones: { type: Number, default: 50 },
sectTokens: { type: Number, default: 0 }
},
inventory: [{
itemUUID: String,
itemId: String,
count: { type: Number, default: 1 },
enhancementLevel: { type: Number, default: 0 },
rarity: { type: String, default: 'COMMON' }
}],
equipment: {
weapon: { type: Object, default: null },
helmet: { type: Object, default: null },
chest: { type: Object, default: null },
gloves: { type: Object, default: null },
boots: { type: Object, default: null },
necklace: { type: Object, default: null },
ring: { type: Object, default: null },
accessory: { type: Object, default: null }
},
inventoryCapacity: { type: Number, default: 40 },
abodeBuildings: {
spiritRoom: { level: { type: Number, default: 1 }, upgradeFinishTime: { type: Date, default: null } },
essencePool: { level: { type: Number, default: 1 }, upgradeFinishTime: { type: Date, default: null } },
alchemyRoom: { level: { type: Number, default: 1 }, upgradeFinishTime: { type: Date, default: null } },
forge: { level: { type: Number, default: 1 }, upgradeFinishTime: { type: Date, default: null } },
spiritGarden: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null } },
ancientLibrary: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null } },
treasury: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null } },
trainingGround: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null } }
},
retainers: {
lin: { type: Number, default: 1 },
kael: { type: Number, default: 1 },
veyra: { type: Number, default: 1 }
},
completedQuests: { type: [String], default: [] },
questCounters: {
kill: { type: Number, default: 0 },
harvest: { type: Number, default: 0 },
breakthrough: { type: Number, default: 0 }
},
claimedMilestones: { type: [String], default: [] },
x: { type: Number, default: 180 },
y: { type: Number, default: 280 },
currentMapId: { type: String, default: 'map_root_lands' },
guildName: { type: String, default: '' },
lastClaimTime: { type: Date, default: Date.now },
updatedAt: { type: Date, default: Date.now }
});
const PlayerModel = mongoose.model('Player', playerSchema);
const guildSchema = new mongoose.Schema({
name: { type: String, unique: true, required: true },
leader: { type: String, required: true },
members: [{ type: String }],
level: { type: Number, default: 1 }
});
const GuildModel = mongoose.model('Guild', guildSchema);
// Bahisli PvP Arena Modeli
const pvpBetSchema = new mongoose.Schema({
creatorUsername: { type: String, required: true },
mode: { type: String, enum: ['1v1', '2v2', '3v3', '4v4', '5v5'], default: '1v1' },
creatorLevel: { type: Number, required: true },
creatorPower: { type: Number, required: true },
wagerAmount: { type: Number, required: true, min: 50 },
status: { type: String, enum: ['open', 'matched', 'completed', 'cancelled'], default: 'open' },
createdAt: { type: Date, default: Date.now }
});
const PvpBetModel = mongoose.model('PvpBet', pvpBetSchema);
// ==========================================
// 3. YARDIMCI HESAPLAMA VE GÜVENLİK SERVİSLERİ
// ==========================================
function escapeHtml(text) {
return String(text || "").replace(/[&<>"']/g, (m) => ({
'&': '&', '<': '<', '>': '>', '"': '"', "'": '''
}[m]));
}
function isPvpWagerTime() {
const now = new Date();
// Türkiye saatine göre Pazar (0) 19:00 - 21:00 arası kontrolü
const trTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
const day = trTime.getDay();
const hour = trTime.getHours();
return day === 0 && hour >= 19 && hour < 21;
}
function findSocketIdByUsername(username) {
for (const [sid, u] of Object.entries(activePlayers)) {
if (u.username.toLowerCase() === username.toLowerCase()) return sid;
}
return null;
}
function addItemToInventory(player, itemId, count = 1) {
const dbItem = ITEM_DATABASE[itemId];
if (!dbItem) return;
if (!player.inventory) player.inventory = [];
if (dbItem.type !== 'equipment') {
const existing = player.inventory.find(i => i.itemId === itemId);
if (existing) {
existing.count = (existing.count || 1) + count;
return;
}
}
if (player.inventory.length < (player.inventoryCapacity || 40)) {
player.inventory.push({
itemUUID: 'item_' + Date.now() + Math.random().toString(36).substring(2, 6),
itemId,
count,
enhancementLevel: 0,
rarity: dbItem.rarity || 'COMMON'
});
}
}
function sanitizeAndMigratePlayer(player) {
if (!player.currencies) player.currencies = { essenceCrystals: 300, spiritStones: 50, sectTokens: 0 };
if (player.essenceCrystals && player.essenceCrystals > player.currencies.essenceCrystals) {
player.currencies.essenceCrystals = player.essenceCrystals;
}
if (player.spiritEnergy && player.spiritEnergy > player.cultivationEnergy) {
player.cultivationEnergy = player.spiritEnergy;
}
if (!player.equipment) {
player.equipment = { weapon: null, helmet: null, chest: null, gloves: null, boots: null, necklace: null, ring: null, accessory: null };
}
if (!player.abodeBuildings) {
player.abodeBuildings = {
spiritRoom: { level: 1 }, essencePool: { level: 1 }, alchemyRoom: { level: 1 }, forge: { level: 1 },
spiritGarden: { level: 0 }, ancientLibrary: { level: 0 }, treasury: { level: 0 }, trainingGround: { level: 0 }
};
}
if (!player.retainers) player.retainers = { lin: 1, kael: 1, veyra: 1 };
if (!player.questCounters) player.questCounters = { kill: 0, harvest: 0, breakthrough: 0 };
if (!player.completedQuests) player.completedQuests = [];
if (!player.claimedMilestones) player.claimedMilestones = [];
if (player.version !== "2.0.0" && (!player.inventory || player.inventory.length === 0) && !player.equipment.weapon) {
addItemToInventory(player, "eq_iron_sword", 1);
addItemToInventory(player, "pills_qi_gathering", 2);
player.version = "2.0.0";
}
}
function recalculatePlayerStats(player) {
const cls = CHARACTER_CLASSES[player.className] || CHARACTER_CLASSES["Kılıç Ustası"];
const realmIdx = player.cultivationRealmIndex || 0;
let realmAttack = 0, realmHp = 0, realmDef = 0, realmCrit = 0;
for (let i = 0; i <= realmIdx && i < CULTIVATION_REALMS.length; i++) {
realmAttack += CULTIVATION_REALMS[i].bonuses.attack || 0;
realmHp += CULTIVATION_REALMS[i].bonuses.hp || 0;
realmDef += CULTIVATION_REALMS[i].bonuses.defense || 0;
realmCrit += CULTIVATION_REALMS[i].bonuses.crit || 0;
}
let eqAttack = 0, eqDef = 0, eqHp = 0, eqCrit = 0;
const eq = player.equipment || {};
Object.values(eq).forEach(item => {
if (!item || !item.itemId) return;
const dbItem = ITEM_DATABASE[item.itemId];
if (!dbItem || !dbItem.baseStats) return;
const rarityMult = (ITEM_RARITIES[item.rarity || dbItem.rarity] || ITEM_RARITIES.COMMON).multiplier;
const enhanceMult = 1 + ((item.enhancementLevel || 0) * 0.12);
const totalMult = rarityMult * enhanceMult;
eqAttack += (dbItem.baseStats.attack || 0) * totalMult;
eqDef += (dbItem.baseStats.defense || 0) * totalMult;
eqHp += (dbItem.baseStats.hp || 0) * totalMult;
eqCrit += (dbItem.baseStats.critRate || 0);
});
const libLvl = player.abodeBuildings?.ancientLibrary?.level || 0;
const retainerAtk = (player.retainers?.kael || 1) * 15;
const retainerHp = (player.retainers?.lin || 1) * 40;
const retainerDef = (player.retainers?.veyra || 1) * 10;
const rawHp = (500 + (player.level - 1) * 60 + realmHp + eqHp + retainerHp) * cls.hpMult;
const rawAtk = (120 + (player.level - 1) * 20 + realmAttack + eqAttack + retainerAtk + libLvl * 15) * cls.attackMult;
const rawDef = (50 + (player.level - 1) * 10 + realmDef + eqDef + retainerDef) * cls.defenseMult;
player.maxHp = Math.floor(rawHp);
player.hp = player.maxHp;
player.maxMana = 200 + (player.level - 1) * 15;
player.mana = Math.min(player.mana || player.maxMana, player.maxMana);
player.attackPower = Math.floor(rawAtk);
player.defense = Math.floor(rawDef);
player.critRate = Math.min(80, 10 + cls.critBonus + realmCrit + eqCrit);
player.power = Math.floor(player.attackPower * 1.5 + player.defense * 1.2 + player.maxHp * 0.25);
return player.power;
}
function addPlayerXp(player, amount) {
if (amount <= 0) return false;
player.xp = (player.xp || 0) + amount;
let leveledUp = false;
while (player.xp >= (player.nextLevelXp || 1000)) {
player.xp -= (player.nextLevelXp || 1000);
player.level += 1;
player.nextLevelXp = Math.floor((player.nextLevelXp || 1000) * 1.35);
leveledUp = true;
const milestoneKey = level_reward_${player.level};
if (!player.claimedMilestones.includes(milestoneKey)) {
player.claimedMilestones.push(milestoneKey);
player.currencies.essenceCrystals += player.level * 50;
player.currencies.spiritStones += 10;
}
}
recalculatePlayerStats(player);
return leveledUp;
}
// ==========================================
// 4. AKTİF DÜNYA DURUMU VE OTOMATİK SAVAŞ DÖNGÜSÜ
// ==========================================
let worldBoss = { name: "Kadim Gök Ejderhası", maxHp: 1000000, currentHp: 1000000, level: 50, isAlive: true };
const activePlayers = {};
const activeBattles = {};
const skillCooldowns = {};
function syncActivePlayer(socketId, player) {
if (!activePlayers[socketId]) return;
activePlayers[socketId].level = player.level;
activePlayers[socketId].power = player.power;
activePlayers[socketId].className = player.className;
activePlayers[socketId].guildName = player.guildName || '';
activePlayers[socketId].weaponId = player.equipment?.weapon?.itemId || null;
}
setInterval(async () => {
for (const [socketId, battle] of Object.entries(activeBattles)) {
if (!battle || !battle.isActive) continue;
const socket = io.sockets.sockets.get(socketId);
if (!socket) {
delete activeBattles[socketId];
continue;
}
const isCrit = Math.random() * 100 <= (battle.playerCrit || 10);
const playerDmg = Math.floor(battle.playerAttack * (isCrit ? 1.6 : 1.0));
battle.enemyHp = Math.max(0, battle.enemyHp - playerDmg);
let tickLog = ⚔️ Otomatik Saldırı: ${playerDmg} hasar${isCrit ? ' (💥 KRİTİK!)' : ''};
if (battle.enemyHp <= 0) {
battle.isActive = false;
delete activeBattles[socketId];
try {
const player = await PlayerModel.findOne({ username: battle.username });
if (player) {
const stage = BATTLE_STAGES.find(s => s.id === battle.stageId) || BATTLE_STAGES;
player.currencies.essenceCrystals += stage.reward.crystals;
player.currencies.spiritStones += stage.reward.stones;
player.cultivationEnergy += stage.reward.energy;
player.questCounters.kill = (player.questCounters.kill || 0) + 1;
if (stage.reward.dropItem) addItemToInventory(player, stage.reward.dropItem, 1);
addPlayerXp(player, stage.reward.xp);
await player.save();
syncActivePlayer(socketId, player);
socket.emit('player_updated', player);
socket.emit('battle_ended', {
success: true,
message: 🎉 Zafer! ${stage.enemyName} yenildi! (+${stage.reward.crystals} Kristal, +${stage.reward.energy} Enerji, +${stage.reward.xp} XP)
});
}
} catch (err) {
console.error("[SAVAŞ ÖDÜL HATASI]:", err);
}
continue;
}
const rawEnemyDmg = Math.max(8, battle.enemyAttack - Math.floor(battle.playerDefense * 0.35));
if (battle.shield > 0) {
const absorbed = Math.min(battle.shield, rawEnemyDmg);
battle.shield -= absorbed;
battle.playerHp = Math.max(0, battle.playerHp - (rawEnemyDmg - absorbed));
} else {
battle.playerHp = Math.max(0, battle.playerHp - rawEnemyDmg);
}
tickLog +=  | 🐺 ${battle.enemyName}: -${rawEnemyDmg} Can;
if (battle.playerHp <= 0) {
battle.isActive = false;
delete activeBattles[socketId];
socket.emit('battle_ended', {
success: false,
message: 💀 Yenildin! Gücünü ve ekipmanlarını geliştirip tekrar dene.
});
continue;
}
battle.lastLog = tickLog;
socket.emit('battle_tick_update', battle);
}
}, 1500);
// ==========================================
// 5. SOCKET.IO OLAY YÖNETİMİ
// ==========================================
io.on('connection', (socket) => {
socket.on('player_login', async (data) => {
try {
const cleanUsername = (data.username || "").trim().slice(0, 20);
if (cleanUsername.length < 2) {
return socket.emit('error_message', "Kullanıcı adı en az 2 karakter olmalıdır.");
}
for (const [sid, u] of Object.entries(activePlayers)) {
if (u.username.toLowerCase() === cleanUsername.toLowerCase() && sid !== socket.id) {
io.to(sid).emit('force_logout', "Hesabına başka bir cihazdan giriş yapıldı.");
const oldSock = io.sockets.sockets.get(sid);
if (oldSock) oldSock.disconnect(true);
delete activePlayers[sid];
}
}
let player = await PlayerModel.findOne({ username: cleanUsername });
if (!player) {
const chosenClass = CHARACTER_CLASSES[data.className] ? data.className : "Kılıç Ustası";
player = new PlayerModel({
username: cleanUsername,
className: chosenClass
});
}
sanitizeAndMigratePlayer(player);
recalculatePlayerStats(player);
await player.save();
activePlayers[socket.id] = {
id: socket.id,
username: player.username,
className: player.className,
level: player.level,
power: player.power,
guildName: player.guildName || '',
x: player.x || 180,
y: player.y || 280,
currentMapId: player.currentMapId || 'map_root_lands',
weaponId: player.equipment?.weapon?.itemId || null
};
if (player.guildName) socket.join(player.guildName);
const openBets = await PvpBetModel.find({ status: 'open' }).sort({ createdAt: -1 }).limit(30);
socket.emit('login_success', {
player,
realms: CULTIVATION_REALMS,
worldBoss,
activePlayers,
pvpBets: openBets
});
io.emit('update_players', activePlayers);
} catch (err) {
console.error("[GİRİŞ HATASI]:", err);
socket.emit('error_message', "Sunucu giriş sırasında bir hata yaşadı.");
}
});
socket.on('player_move', async (data) => {
const active = activePlayers[socket.id];
if (!active || !data) return;
const newX = Math.max(20, Math.min(2000, Number(data.x) || 180));
const newY = Math.max(20, Math.min(2000, Number(data.y) || 280));
active.x = newX;
active.y = newY;
socket.broadcast.emit('player_moved', {
id: socket.id,
username: active.username,
className: active.className,
level: active.level,
x: newX,
y: newY,
weaponId: active.weaponId
});
try {
await PlayerModel.updateOne({ username: active.username }, { x: newX, y: newY });
} catch (err) {}
});
socket.on('claim_afk_rewards', async () => {
const active = activePlayers[socket.id];
if (!active) return;
try {
const player = await PlayerModel.findOne({ username: active.username });
const now = new Date();
const diffSeconds = Math.floor((now - new Date(player.lastClaimTime)) / 1000);
if (diffSeconds < 10) {
return socket.emit('error_message', "Kadim Kalıntı henüz yeterli öz biriktirmedi! (En az 10 sn bekle)");
}
const poolLvl = player.abodeBuildings?.essencePool?.level || 1;
const roomLvl = player.abodeBuildings?.spiritRoom?.level || 1;
const cappedSeconds = Math.min(diffSeconds, 43200);
const gainedCrystals = Math.max(15, Math.floor((cappedSeconds / 60) * (4 + poolLvl * 3 + (player.retainers?.veyra || 1) * 2)));
const gainedEnergy = Math.max(25, Math.floor((cappedSeconds / 60) * (6 + roomLvl * 5 + (player.retainers?.lin || 1) * 3)));
const gainedStones = Math.max(2, Math.floor(cappedSeconds / 300) + poolLvl);
player.currencies.essenceCrystals += gainedCrystals;
player.currencies.spiritStones += gainedStones;
player.cultivationEnergy += gainedEnergy;
player.questCounters.harvest = (player.questCounters.harvest || 0) + 1;
player.lastClaimTime = now;
await player.save();
socket.emit('player_updated', player);
socket.emit('action_notification', ⏳ Hasat Tamamlandı: +${gainedCrystals} Kristal, +${gainedStones} Ruh Taşı, +${gainedEnergy} Yetişim Enerjisi!);
} catch (err) {
console.error("[AFK HASAT HATASI]:", err);
socket.emit('error_message', "Hasat sırasında hata oluştu.");
}
});
socket.on('upgrade_abode_building', async (buildingId) => {
const active = activePlayers[socket.id];
if (!active) return;
try {
const player = await PlayerModel.findOne({ username: active.username });
const cfg = ABODE_BUILDINGS[buildingId];
if (!cfg) return socket.emit('error_message', "Geçersiz bina.");
const bData = player.abodeBuildings[buildingId] || { level: 0 };
if (player.level < cfg.unlockReq.level || player.cultivationRealmIndex < cfg.unlockReq.realmIndex) {
return socket.emit('error_message', Bu bina için Seviye ${cfg.unlockReq.level} gerekiyor!);
}
if (bData.level >= cfg.maxLevel) {
return socket.emit('error_message', "Bina maksimum seviyeye ulaştı!");
}
const nextLvl = bData.level + 1;
const cost = cfg.getBaseCost(nextLvl);
if (player.currencies.essenceCrystals < cost.crystals || player.currencies.spiritStones < cost.stones) {
return socket.emit('error_message', Yetersiz kaynak! Gereken: ${cost.crystals} Kristal, ${cost.stones} Ruh Taşı.);
}
player.currencies.essenceCrystals -= cost.crystals;
player.currencies.spiritStones -= cost.stones;
player.abodeBuildings[buildingId] = { level: nextLvl, upgradeFinishTime: null };
player.markModified('abodeBuildings');
recalculatePlayerStats(player);
await player.save();
syncActivePlayer(socket.id, player);
socket.emit('player_updated', player);
io.emit('update_players', activePlayers);
socket.emit('action_notification', 🏯 ${cfg.name} Seviye ${nextLvl} oldu!);
} catch (err) {
console.error("[BİNA GELİŞTİRME HATASI]:", err);
}
});
socket.on('upgrade_retainer', async (retainerKey) => {
const active = activePlayers[socket.id];
if (!active || !['lin', 'kael', 'veyra'].includes(retainerKey)) return;
try {
const player = await PlayerModel.findOne({ username: active.username });
const currentLv = player.retainers[retainerKey] || 1;
const cost = currentLv * 150;
if (player.currencies.essenceCrystals < cost) {
return socket.emit('error_message', Yetersiz Öz Kristali! Gereken: ${cost});
}
player.currencies.essenceCrystals -= cost;
player.retainers[retainerKey] = currentLv + 1;
recalculatePlayerStats(player);
await player.save();
syncActivePlayer(socket.id, player);
socket.emit('player_updated', player);
io.emit('update_players', activePlayers);
socket.emit('action_notification', 🤝 Yoldaş seviyesi yükseltildi! Yeni Güç: ${player.power});
} catch (err) {
console.error("[YOLDAŞ HATASI]:", err);
}
});
socket.on('attempt_cultivation_breakthrough', async () => {
const active = activePlayers[socket.id];
if (!active) return;
try {
const player = await PlayerModel.findOne({ username: active.username });
const rIdx = player.cultivationRealmIndex || 0;
const realmData = CULTIVATION_REALMS[rIdx];
if (!realmData) return socket.emit('error_message', "Zaten Dokuz Alemin zirvesindesin!");
if (player.cultivationEnergy < realmData.reqEnergyPerStep) {
return socket.emit('error_message', Yetersiz Yetişim Enerjisi! Gereken: ${realmData.reqEnergyPerStep});
}
if (player.currencies.essenceCrystals < realmData.breakthroughCost.crystals ||
player.currencies.spiritStones < realmData.breakthroughCost.spiritStones) {
return socket.emit('error_message', Gereken: ${realmData.breakthroughCost.crystals} Kristal ve ${realmData.breakthroughCost.spiritStones} Ruh Taşı!);
}
player.currencies.essenceCrystals -= realmData.breakthroughCost.crystals;
player.currencies.spiritStones -= realmData.breakthroughCost.spiritStones;
player.cultivationEnergy -= realmData.reqEnergyPerStep;
const roll = Math.random() * 100;
if (roll <= realmData.successRate) {
player.cultivationSubStep = (player.cultivationSubStep || 1) + 1;
if (player.cultivationSubStep > realmData.subSteps) {
player.cultivationSubStep = 1;
if (rIdx + 1 < CULTIVATION_REALMS.length) {
player.cultivationRealmIndex = rIdx + 1;
player.cultivationRealm = CULTIVATION_REALMS[player.cultivationRealmIndex].name;
player.level += 2;
}
}
player.questCounters.breakthrough = (player.questCounters.breakthrough || 0) + 1;
recalculatePlayerStats(player);
await player.save();
syncActivePlayer(socket.id, player);
socket.emit('player_updated', player);
io.emit('update_players', activePlayers);
socket.emit('action_notification', ⚡ AŞAMA ATLAMA BAŞARILI! ${player.cultivationRealm} (${player.cultivationSubStep}. Basamak));
} else {
player.cultivationEnergy += Math.floor(realmData.reqEnergyPerStep * 0.25);
await player.save();
socket.emit('player_updated', player);
socket.emit('action_notification', ⚠️ Gök Gürültüsü Direndi! Enerjinin %25'i geri kazanıldı.);
}
} catch (err) {
console.error("[YETİŞİM HATASI]:", err);
}
});
socket.on('equip_item', async (itemUUID) => {
const active = activePlayers[socket.id];
if (!active) return;
try {
const player = await PlayerModel.findOne({ username: active.username });
const idx = player.inventory.findIndex(i => i.itemUUID === itemUUID);
if (idx === -1) return socket.emit('error_message', "Eşya çantada bulunamadı.");
const invItem = player.inventory[idx];
const dbItem = ITEM_DATABASE[invItem.itemId];
if (!dbItem) return;
if (dbItem.type === 'consumable') {
if (dbItem.effect?.type === 'energy') {
player.cultivationEnergy += dbItem.effect.value;
}
if (invItem.count > 1) invItem.count -= 1;
else player.inventory.splice(idx, 1);
await player.save();
socket.emit('player_updated', player);
return socket.emit('action_notification', 💊 ${dbItem.name} kullanıldı! +${dbItem.effect.value} Yetişim Enerjisi.);
}
if (dbItem.type !== 'equipment') {
return socket.emit('error_message', "Bu bir üretim materyalidir, doğrudan kuşanılamaz.");
}
const slot = dbItem.slot;
const oldEquipped = player.equipment[slot];
player.inventory.splice(idx, 1);
if (oldEquipped) player.inventory.push(oldEquipped);
player.equipment[slot] = invItem;
player.markModified('equipment');
recalculatePlayerStats(player);
await player.save();
syncActivePlayer(socket.id, player);
socket.emit('player_updated', player);
io.emit('update_players', activePlayers);
socket.emit('action_notification', 🛡️ ${dbItem.name} kuşanıldı!);
} catch (err) {
console.error("[EKİPMAN HATASI]:", err);
}
});
socket.on('enhance_equipment', async (data) => {
const active = activePlayers[socket.id];
if (!active) return;
try {
const player = await PlayerModel.findOne({ username: active.username });
const targetItem = data.type === 'equipped' ? player.equipment[data.targetId] : null;
if (!targetItem) return socket.emit('error_message', "Geliştirilecek kuşanılmış eşya bulunamadı.");
if ((targetItem.enhancementLevel || 0) >= 20) return socket.emit('error_message', "Maksimum +20 seviyesine ulaşıldı!");
const nextLvl = (targetItem.enhancementLevel || 0) + 1;
const cost = nextLvl * 100;
if (player.currencies.essenceCrystals < cost) {
return socket.emit('error_message', Yetersiz Öz Kristali! Gereken: ${cost});
}
player.currencies.essenceCrystals -= cost;
const successRate = Math.max(25, 100 - (targetItem.enhancementLevel || 0) * 4);
if (Math.random() * 100 <= successRate) {
targetItem.enhancementLevel = nextLvl;
player.markModified('equipment');
recalculatePlayerStats(player);
await player.save();
syncActivePlayer(socket.id, player);
socket.emit('player_updated', player);
socket.emit('action_notification', ✨ Başarılı! Eşya +${nextLvl} oldu!);
} else {
await player.save();
socket.emit('player_updated', player);
socket.emit('action_notification', ⚠️ Geliştirme başarısız oldu, eşya zarar görmedi.);
}
} catch (err) {
console.error("[+BASMA HATASI]:", err);
}
});
socket.on('craft_item', async (recipeId) => {
const active = activePlayers[socket.id];
if (!active) return;
try {
const player = await PlayerModel.findOne({ username: active.username });
const recipe = CRAFTING_RECIPES.find(r => r.resultId === recipeId);
if (!recipe) return socket.emit('error_message', "Üretim tarifi bulunamadı.");
const bLvl = player.abodeBuildings?.[recipe.building]?.level || 0;
if (bLvl < recipe.reqLevel) {
return socket.emit('error_message', Bina seviyesi yetersiz! Gereken Seviye: ${recipe.reqLevel});
}
if (player.currencies.essenceCrystals < (recipe.cost.crystals || 0) ||
player.currencies.spiritStones < (recipe.cost.stones || 0)) {
return socket.emit('error_message', "Yetersiz Öz Kristali veya Ruh Taşı!");
}
const reqMats = recipe.cost.materials || {};
for (const [matId, reqCount] of Object.entries(reqMats)) {
const invMat = player.inventory.find(i => i.itemId === matId);
if (!invMat || (invMat.count || 1) < reqCount) {
const matName = ITEM_DATABASE[matId]?.name || matId;
return socket.emit('error_message', Eksik Malzeme: ${reqCount} adet ${matName} gerekli! (Seferden düşürebilirsin));
}
}
player.currencies.essenceCrystals -= (recipe.cost.crystals || 0);
player.currencies.spiritStones -= (recipe.cost.stones || 0);
for (const [matId, reqCount] of Object.entries(reqMats)) {
const idx = player.inventory.findIndex(i => i.itemId === matId);
if (player.inventory[idx].count > reqCount) player.inventory[idx].count -= reqCount;
else player.inventory.splice(idx, 1);
}
addItemToInventory(player, recipe.resultId, 1);
await player.save();
socket.emit('player_updated', player);
socket.emit('action_notification', 🔨 Üretildi: ${ITEM_DATABASE[recipe.resultId].name}!);
} catch (err) {
console.error("[ÜRETİM HATASI]:", err);
}
});
socket.on('start_battle_stage', async (stageId) => {
const active = activePlayers[socket.id];
if (!active) return;
try {
const player = await PlayerModel.findOne({ username: active.username });
const stage = BATTLE_STAGES.find(s => s.id === Number(stageId));
if (!stage) return socket.emit('error_message', "Bölge bulunamadı.");
activeBattles[socket.id] = {
username: player.username,
stageId: stage.id,
stageName: stage.name,
enemyName: stage.enemyName,
enemyHp: stage.hp,
enemyMaxHp: stage.hp,
enemyAttack: stage.attack,
playerHp: player.maxHp,
playerMaxHp: player.maxHp,
playerMana: player.maxMana,
playerMaxMana: player.maxMana,
playerAttack: player.attackPower,
playerDefense: player.defense,
playerCrit: player.critRate,
shield: 0,
isActive: true,
lastLog: ⚔️ ${stage.enemyName} ile savaş başladı! Normal saldırılar otomatik yapılıyor.
};
socket.emit('battle_started', activeBattles[socket.id]);
} catch (err) {
console.error("[SAVAŞ BAŞLATMA HATASI]:", err);
}
});
socket.on('battle_use_skill', async (skillId) => {
const active = activePlayers[socket.id];
const battle = activeBattles[socket.id];
if (!active || !battle || !battle.isActive) return;
try {
const player = await PlayerModel.findOne({ username: active.username });
const skills = CLASS_SKILLS[player.className] || CLASS_SKILLS["Kılıç Ustası"];
const skill = skills.find(s => s.id === skillId);
if (!skill) return;
if (player.cultivationRealmIndex < skill.reqRealm) {
return socket.emit('error_message', Bu yetenek için daha yüksek Yetişim Aşaması gerekiyor!);
}
if (battle.playerMana < skill.manaCost) {
return socket.emit('error_message', Yetersiz Mana! Gereken: ${skill.manaCost});
}
const cdKey = ${player.username}_${skill.id};
const now = Date.now();
if (now - (skillCooldowns[cdKey] || 0) < skill.cooldown * 1000) {
return socket.emit('error_message', "Yetenek henüz bekleme süresinde!");
}
skillCooldowns[cdKey] = now;
battle.playerMana -= skill.manaCost;
const dmg = Math.floor(battle.playerAttack * skill.mult);
battle.enemyHp = Math.max(0, battle.enemyHp - dmg);
if (skill.type === 'heal') {
const heal = Math.floor(battle.playerMaxHp * 0.3);
battle.playerHp = Math.min(battle.playerMaxHp, battle.playerHp + heal);
battle.lastLog = ✨ [${skill.name}] +${heal} Can yenilendi ve ${dmg} hasar verildi!;
} else if (skill.type === 'shield') {
battle.shield += 200;
battle.lastLog = 🛡️ [${skill.name}] +200 Kalkan ve ${dmg} hasar verildi!;
} else {
battle.lastLog = ⚡ [${skill.name}] kullanıldı! ${dmg} yıkıcı hasar!;
}
socket.emit('battle_tick_update', battle);
} catch (err) {}
});
socket.on('quit_battle', () => {
if (activeBattles[socket.id]) {
delete activeBattles[socket.id];
}
});
socket.on('claim_quest_reward', async (questId) => {
const active = activePlayers[socket.id];
if (!active) return;
try {
const player = await PlayerModel.findOne({ username: active.username });
if (player.completedQuests.includes(questId)) {
return socket.emit('error_message', "Bu görevin ödülü zaten alındı!");
}
const quest = QUEST_DATABASE.find(q => q.id === questId);
if (!quest) return socket.emit('error_message', "Görev bulunamadı.");
const currentProgress = player.questCounters?.[quest.type] || 0;
if (currentProgress < quest.targetCount) {
return socket.emit('error_message', Görev henüz tamamlanmadı! İlerleme: ${currentProgress} / ${quest.targetCount});
}
player.completedQuests.push(questId);
player.currencies.essenceCrystals += quest.reward.crystals;
player.currencies.spiritStones += quest.reward.stones;
player.cultivationEnergy += quest.reward.energy;
addPlayerXp(player, quest.reward.xp);
await player.save();
syncActivePlayer(socket.id, player);
socket.emit('player_updated', player);
socket.emit('action_notification', 🎁 Görev Ödülü Alındı: ${quest.title}!);
} catch (err) {
console.error("[GÖREV HATASI]:", err);
}
});
socket.on('attack_world_boss', async () => {
const active = activePlayers[socket.id];
if (!active || !worldBoss.isAlive) return;
const cdKey = ${active.username}_worldboss;
const now = Date.now();
if (now - (skillCooldowns[cdKey] || 0) < 1500) {
return socket.emit('error_message', "Ruh tekniği bekleme süresinde!");
}
skillCooldowns[cdKey] = now;
try {
const player = await PlayerModel.findOne({ username: active.username });
const dmg = Math.max(50, player.attackPower || player.power);
worldBoss.currentHp = Math.max(0, worldBoss.currentHp - dmg);
player.cultivationEnergy += 25;
player.currencies.essenceCrystals += 10;
await player.save();
socket.emit('player_updated', player);
if (worldBoss.currentHp <= 0) {
worldBoss.isAlive = false;
player.currencies.essenceCrystals += 500;
player.currencies.spiritStones += 50;
await player.save();
socket.emit('player_updated', player);
io.emit('action_notification', 🐉 ${player.username}, Kadim Gök Ejderhası'na son darbeyi vurdu! (+500 Kristal));
setTimeout(() => {
worldBoss.currentHp = worldBoss.maxHp;
worldBoss.isAlive = true;
io.emit('world_boss_update', worldBoss);
}, 60000);
}
io.emit('world_boss_update', {
currentHp: worldBoss.currentHp,
maxHp: worldBoss.maxHp,
lastAttacker: player.username,
damageDealt: dmg
});
} catch (err) {}
});
// ==========================================
// BAHİSLİ PVP ARENA SİSTEMİ (PAZAR 19:00-21:00)
// ==========================================
socket.on('get_pvp_bets', async () => {
try {
const openBets = await PvpBetModel.find({ status: 'open' }).sort({ createdAt: -1 }).limit(30);
socket.emit('update_pvp_bets', openBets);
} catch (err) {}
});
socket.on('create_pvp_bet', async (data) => {
const active = activePlayers[socket.id];
if (!active) return;
try {
const player = await PlayerModel.findOne({ username: active.username });
if (player.level < 10) {
return socket.emit('error_message', "Bahisli PvP arenası için en az Seviye 10 olmalısın!");
}
const activeBetsCount = await PvpBetModel.countDocuments({ creatorUsername: player.username, status: 'open' });
if (activeBetsCount >= 3) {
return socket.emit('error_message', "En fazla 3 aktif bahis ilanı açabilirsin!");
}
const amount = Math.floor(Number(data?.wagerAmount) || 100);
if (amount < 50 || amount > 50000) {
return socket.emit('error_message', "Bahis tutarı 50 ile 50.000 Öz Kristali arasında olmalıdır.");
}
if (player.currencies.essenceCrystals < amount) {
return socket.emit('error_message', Yetersiz Öz Kristali! Gereken: ${amount});
}
player.currencies.essenceCrystals -= amount;
await player.save();
const validModes = ['1v1', '2v2', '3v3', '4v4', '5v5'];
const chosenMode = validModes.includes(data?.mode) ? data.mode : '1v1';
await PvpBetModel.create({
creatorUsername: player.username,
mode: chosenMode,
creatorLevel: player.level,
creatorPower: player.power,
wagerAmount: amount,
status: 'open'
});
socket.emit('player_updated', player);
socket.emit('action_notification', ⚔️ [${chosenMode}] ${amount} Kristal bahisli arena ilanı açıldı!);
const openBets = await PvpBetModel.find({ status: 'open' }).sort({ createdAt: -1 }).limit(30);
io.emit('update_pvp_bets', openBets);
} catch (err) {
console.error("[BAHİS AÇMA HATASI]:", err);
socket.emit('error_message', "Bahis ilanı oluşturulurken hata oluştu.");
}
});
socket.on('cancel_pvp_bet', async (betId) => {
const active = activePlayers[socket.id];
if (!active) return;
try {
const bet = await PvpBetModel.findOneAndUpdate(
{ _id: betId, creatorUsername: active.username, status: 'open' },
{ status: 'cancelled' },
{ new: true }
);
if (!bet) return socket.emit('error_message', "İptal edilecek açık ilan bulunamadı.");
const player = await PlayerModel.findOne({ username: active.username });
player.currencies.essenceCrystals += bet.wagerAmount;
await player.save();
socket.emit('player_updated', player);
socket.emit('action_notification', ↩️ Bahis ilanı iptal edildi. ${bet.wagerAmount} Öz Kristali iade edildi.);
const openBets = await PvpBetModel.find({ status: 'open' }).sort({ createdAt: -1 }).limit(30);
io.emit('update_pvp_bets', openBets);
} catch (err) {
console.error("[BAHİS İPTAL HATASI]:", err);
}
});
socket.on('join_pvp_bet', async (betId) => {
const active = activePlayers[socket.id];
if (!active) return;
try {
if (!isPvpWagerTime()) {
return socket.emit('error_message', "⏳ Bahisli Arena Savaşları yalnızca Pazar günleri 19:00 - 21:00 saatleri arasında oynanabilir!");
}
const challenger = await PlayerModel.findOne({ username: active.username });
if (challenger.level < 10) {
return socket.emit('error_message', "Bahisli arenaya katılmak için en az Seviye 10 olmalısın!");
}
// Atomik kilit ile aynı anda iki kişinin girmesini engelle
const bet = await PvpBetModel.findOneAndUpdate(
{ _id: betId, status: 'open', creatorUsername: { $ne: challenger.username } },
{ status: 'matched' },
{ new: true }
);
if (!bet) {
return socket.emit('error_message', "Bu bahis ilanı artık müsait değil veya kendi ilanın.");
}
// ±1 Seviye ve Bakiye Kontrolü (Başarısızsa ilanı tekrar 'open' yap)
const levelDiff = Math.abs(challenger.level - bet.creatorLevel);
if (levelDiff > 1) {
bet.status = 'open';
await bet.save();
return socket.emit('error_message', Adil Eşleşme Kuralı: Rakip (Sv.${bet.creatorLevel}) ile arandaki fark en fazla 1 seviye olabilir!);
}
if (challenger.currencies.essenceCrystals < bet.wagerAmount) {
bet.status = 'open';
await bet.save();
return socket.emit('error_message', Yetersiz Öz Kristali! Gereken: ${bet.wagerAmount});
}
// Katılımcıdan bahsi düş
challenger.currencies.essenceCrystals -= bet.wagerAmount;
const creator = await PlayerModel.findOne({ username: bet.creatorUsername });
if (!creator) {
challenger.currencies.essenceCrystals += bet.wagerAmount;
await challenger.save();
bet.status = 'cancelled';
await bet.save();
return socket.emit('error_message', "İlan sahibi bulunamadı, bahis iade edildi.");
}
// Güç + Kritik Şans + %15 Zar Faktörü ile Savaş Hesabı
const creatorScore = creator.power * (1 + (creator.critRate || 10) * 0.004 + Math.random() * 0.15);
const challengerScore = challenger.power * (1 + (challenger.critRate || 10) * 0.004 + Math.random() * 0.15);
const isCreatorWinner = creatorScore >= challengerScore;
const winner = isCreatorWinner ? creator : challenger;
const loser = isCreatorWinner ? challenger : creator;
const totalPrize = bet.wagerAmount * 2;
winner.currencies.essenceCrystals += totalPrize;
addPlayerXp(winner, 250);
bet.status = 'completed';
await bet.save();
await creator.save();
await challenger.save();
// Çevrimiçi oyuncuların ekranlarını anında güncelle
socket.emit('player_updated', challenger);
const creatorSocketId = findSocketIdByUsername(creator.username);
if (creatorSocketId) {
syncActivePlayer(creatorSocketId, creator);
io.to(creatorSocketId).emit('player_updated', creator);
}
syncActivePlayer(socket.id, challenger);
io.emit('action_notification', 🏆 [Bahisli Arena - ${bet.mode}] ${winner.username}, ${loser.username} karşısında kazandı! Ödül: +${totalPrize} Öz Kristali!);
const openBets = await PvpBetModel.find({ status: 'open' }).sort({ createdAt: -1 }).limit(30);
io.emit('update_pvp_bets', openBets);
} catch (err) {
console.error("[BAHİS SAVAŞ HATASI]:", err);
socket.emit('error_message', "Bahisli savaş sırasında hata oluştu.");
}
});
// ==========================================
// DOĞRUDAN DÜELLO, TARİKAT VE SIRALAMA
// ==========================================
socket.on('send_pvp_challenge', (targetId) => {
const challenger = activePlayers[socket.id];
const target = activePlayers[targetId];
if (!challenger || !target) return socket.emit('error_message', "Rakip çevrimiçi değil.");
io.to(targetId).emit('pvp_challenge_received', {
challengerId: socket.id,
challengerName: challenger.username,
challengerPower: challenger.power
});
socket.emit('action_notification', ${target.username} adlı oyuncuya düello daveti gönderildi.);
});
socket.on('accept_pvp_challenge', async (data) => {
const p1 = activePlayers[data.challengerId];
const p2 = activePlayers[socket.id];
if (!p1 || !p2) return;
const p1Score = p1.power * (0.9 + Math.random() * 0.25);
const p2Score = p2.power * (0.9 + Math.random() * 0.25);
const winner = p1Score >= p2Score ? p1 : p2;
const loser = winner === p1 ? p2 : p1;
try {
const winnerDoc = await PlayerModel.findOne({ username: winner.username });
if (winnerDoc) {
winnerDoc.currencies.essenceCrystals += 100;
winnerDoc.cultivationEnergy += 150;
addPlayerXp(winnerDoc, 300);
await winnerDoc.save();
syncActivePlayer(winner.id, winnerDoc);
io.to(winner.id).emit('player_updated', winnerDoc);
}
io.emit('action_notification', ⚔️ [Dostluk Arenası] ${winner.username}, ${loser.username} karşısında zafer kazandı! (+100 Kristal));
} catch (err) {}
});
socket.on('create_guild', async (data) => {
const active = activePlayers[socket.id];
if (!active) return;
const gName = (data.guildName || "").trim().slice(0, 24);
if (!gName) return socket.emit('error_message', "Tarikat adı boş olamaz.");
try {
const player = await PlayerModel.findOne({ username: active.username });
if (player.guildName) return socket.emit('error_message', "Zaten bir tarikatın üyesisin!");
const exists = await GuildModel.findOne({ name: gName });
if (exists) return socket.emit('error_message', "Bu tarikat adı zaten alınmış!");
await GuildModel.create({ name: gName, leader: player.username, members: [player.username] });
player.guildName = gName;
await player.save();
syncActivePlayer(socket.id, player);
socket.join(gName);
socket.emit('player_updated', player);
socket.emit('action_notification', 🏆 Tarikat kuruldu: ${gName});
} catch (err) {
socket.emit('error_message', "Tarikat kurulurken hata oluştu.");
}
});
socket.on('join_guild', async (guildName) => {
const active = activePlayers[socket.id];
if (!active) return;
const gName = (guildName || "").trim();
try {
const player = await PlayerModel.findOne({ username: active.username });
if (player.guildName) return socket.emit('error_message', "Zaten bir tarikatın üyesisin!");
const guild = await GuildModel.findOne({ name: gName });
if (!guild) return socket.emit('error_message', "Tarikat bulunamadı!");
if (!guild.members.includes(player.username)) {
guild.members.push(player.username);
await guild.save();
}
player.guildName = gName;
await player.save();
syncActivePlayer(socket.id, player);
socket.join(gName);
socket.emit('player_updated', player);
socket.emit('action_notification', 🏆 ${gName} tarikatına katıldın!);
} catch (err) {}
});
socket.on('guild_chat_message', (data) => {
const active = activePlayers[socket.id];
if (!active || !active.guildName) {
return socket.emit('error_message', "Önce bir tarikata katılmalısın.");
}
const cleanMsg = escapeHtml((data.message || "").trim().slice(0, 180));
if (!cleanMsg) return;
io.to(active.guildName).emit('receive_guild_chat', {
sender: escapeHtml(active.username),
message: cleanMsg,
time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
});
});
socket.on('get_leaderboard', async () => {
try {
const topPlayers = await PlayerModel.find().sort({ power: -1 }).limit(10).select('username className level power cultivationRealm');
socket.emit('leaderboard_data', topPlayers);
} catch (err) {}
});
socket.on('disconnect', () => {
delete activeBattles[socket.id];
if (activePlayers[socket.id]) {
delete activePlayers[socket.id];
io.emit('update_players', activePlayers);
}
});
});
// ==========================================
// 6. VERİTABANI BAĞLANTISI VE SUNUCU BAŞLATMA
// ==========================================
const PORT = process.env.PORT || 3000;
mongoose.connect(MONGO_URI)
.then(() => {
console.log("[VERİTABANI] MongoDB bulut sunucusuna başarıyla bağlandı!");
server.listen(PORT, () => {
console.log([SUNUCU AKTİF] Arken Dünyası 2D MMORPG sunucusu ${PORT} portunda çalışıyor.);
});
})
.catch(err => {
console.error("[KRİTİK HATA] MongoDB bağlantı hatası:", err);
});