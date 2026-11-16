'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { promisify } = require('util');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const scryptAsync = promisify(crypto.scrypt);
const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(v => v.trim()).filter(Boolean);
const io = new Server(server, {
  cors: { origin: allowedOrigins.length ? allowedOrigins : false, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e5,
  pingTimeout: 20000,
  pingInterval: 25000
});
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(express.static('public'));

const MONGO_URI = process.env.MONGO_URI;
const PORT = Number(process.env.PORT || 3000);
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 800;
const MAP_SPEED = 0.20; // normalize edilmiş harita genişliği / saniye
const BOSS_COOLDOWN_MS = 1500;
const MAX_OFFLINE_SECONDS = 43200;

const CULTIVATION_REALMS = [
  { id: 1, name: "Öz Duyumu", subSteps: 3, reqEnergyPerStep: 200, breakthroughCost: { crystals: 100, spiritStones: 10 }, successRate: 100, bonuses: { attack: 15, hp: 50 } },
  { id: 2, name: "Ruh Damarı Açılımı", subSteps: 4, reqEnergyPerStep: 500, breakthroughCost: { crystals: 250, spiritStones: 25 }, successRate: 90, bonuses: { attack: 30, hp: 100 } },
  { id: 3, name: "Öz Biriktirme", subSteps: 5, reqEnergyPerStep: 1200, breakthroughCost: { crystals: 500, spiritStones: 50 }, successRate: 80, bonuses: { attack: 60, hp: 200, crit: 2 } },
  { id: 4, name: "Ruh Çekirdeği", subSteps: 5, reqEnergyPerStep: 3000, breakthroughCost: { crystals: 1200, spiritStones: 120 }, successRate: 70, bonuses: { attack: 120, hp: 400, crit: 3 } },
  { id: 5, name: "İlahi Ruh", subSteps: 6, reqEnergyPerStep: 7500, breakthroughCost: { crystals: 2500, spiritStones: 250 }, successRate: 60, bonuses: { attack: 250, hp: 800, crit: 5 } },
  { id: 6, name: "Göksel Dönüşüm", subSteps: 6, reqEnergyPerStep: 18000, breakthroughCost: { crystals: 5000, spiritStones: 500 }, successRate: 50, bonuses: { attack: 500, hp: 1500, crit: 7 } },
  { id: 7, name: "Âlem Kırılması", subSteps: 7, reqEnergyPerStep: 40000, breakthroughCost: { crystals: 10000, spiritStones: 1000 }, successRate: 40, bonuses: { attack: 1000, hp: 3000, crit: 10 } },
  { id: 8, name: "Kadim Varlık", subSteps: 7, reqEnergyPerStep: 90000, breakthroughCost: { crystals: 22000, spiritStones: 2200 }, successRate: 30, bonuses: { attack: 2000, hp: 6000, crit: 12 } },
  { id: 9, name: "İlk Öz Hâkimiyeti", subSteps: 9, reqEnergyPerStep: 200000, breakthroughCost: { crystals: 50000, spiritStones: 5000 }, successRate: 20, bonuses: { attack: 5000, hp: 15000, crit: 15 } }
];

const ABODE_BUILDINGS = {
  spiritRoom: {
    id: "spiritRoom",
    name: "Ruh Odası",
    icon: "🧘‍♂️",
    desc: "Yetişim enerjisi biriktirme hızını ve verimliliğini artırır.",
    maxLevel: 10,
    unlockReq: { level: 1, realmIndex: 0 },
    getBaseCost: (lvl) => ({ crystals: lvl * 150, stones: lvl * 20 }),
    getBenefit: (lvl) => `+${lvl * 15}% Yetişim Verimi`
  },
  essencePool: {
    id: "essencePool",
    name: "Öz Havuzu",
    icon: "🌊",
    desc: "Zamanla otomatik olarak Öz Kristali ve Ruh Enerjisi üretir.",
    maxLevel: 10,
    unlockReq: { level: 1, realmIndex: 0 },
    getBaseCost: (lvl) => ({ crystals: lvl * 120, stones: lvl * 15 }),
    getBenefit: (lvl) => `+${lvl * 25} Kristal / Saat`
  },
  alchemyRoom: {
    id: "alchemyRoom",
    name: "Simya Odası",
    icon: "⚗️",
    desc: "Geçici güçlendirme hapları ve iksirler üretmenizi sağlar.",
    maxLevel: 10,
    unlockReq: { level: 5, realmIndex: 1 },
    getBaseCost: (lvl) => ({ crystals: lvl * 300, stones: lvl * 50 }),
    getBenefit: (lvl) => `Seviye ${lvl} İksir Üretimi`
  },
  forge: {
    id: "forge",
    name: "Demirci",
    icon: "⚒️",
    desc: "Silah, zırh ve aksesuarlarınızı geliştirmenize ve güçlendirmenize yarar.",
    maxLevel: 10,
    unlockReq: { level: 10, realmIndex: 1 },
    getBaseCost: (lvl) => ({ crystals: lvl * 400, stones: lvl * 80 }),
    getBenefit: (lvl) => `Ekipman Güçlendirme +${lvl}`
  },
  spiritGarden: {
    id: "spiritGarden",
    name: "Ruh Bahçesi",
    icon: "🌿",
    desc: "Nadide yetişim ve simya bitkileri yetiştirmenizi sağlar.",
    maxLevel: 10,
    unlockReq: { level: 15, realmIndex: 2 },
    getBaseCost: (lvl) => ({ crystals: lvl * 250, stones: lvl * 40 }),
    getBenefit: (lvl) => `${lvl * 2} Adet Bitki Slotu`
  },
  ancientLibrary: {
    id: "ancientLibrary",
    name: "Kadim Kütüphane",
    icon: "📜",
    desc: "Yeni pasif teknikler ve gizli dövüş yetenekleri açar.",
    maxLevel: 10,
    unlockReq: { level: 20, realmIndex: 3 },
    getBaseCost: (lvl) => ({ crystals: lvl * 600, stones: lvl * 150 }),
    getBenefit: (lvl) => `+${lvl * 10} Pasif Saldırı Gücü`
  },
  treasury: {
    id: "treasury",
    name: "Hazine Odası",
    icon: "🏆",
    desc: "Değerli eşyalarınızı, sandıklarınızı ve kaynak kapasitenizi yönetir.",
    maxLevel: 10,
    unlockReq: { level: 25, realmIndex: 4 },
    getBaseCost: (lvl) => ({ crystals: lvl * 800, stones: lvl * 200 }),
    getBenefit: (lvl) => `Depo Kapasitesi +${lvl * 500}`
  },
  trainingGround: {
    id: "trainingGround",
    name: "Eğitim Alanı",
    icon: "⚔️",
    desc: "Çevrimdışı olduğunuzda dahi karakterinizin savaş tecrübesi (XP) kazanmasını sağlar.",
    maxLevel: 10,
    unlockReq: { level: 30, realmIndex: 5 },
    getBaseCost: (lvl) => ({ crystals: lvl * 1000, stones: lvl * 300 }),
    getBenefit: (lvl) => `+${lvl * 50} Saatlik XP Kazanımı`
  }
};
const CHARACTER_CLASSES = {
  swordmaster: {
    id: "swordmaster",
    name: "Kılıç Ustası",
    role: "Yüksek Fiziksel Hasar / Çeviklik",
    baseStats: { attack: 140, defense: 60, hp: 600, critRate: 12, critDmg: 160 },
    cultivationBonus: { attackMultiplier: 1.15 },
    specialties: [
      { id: "sm_path1", name: "İlahi Kılıç Tanrısı", desc: "Saf keskinlik ve tek hedef yıkıcı hasar", paths: ["Kılıç Hükümdarı", "Yıldırım Kılıcı"] },
      { id: "sm_path2", name: "Ruh Kılıççısı", desc: "Uçan kılıçlarla alan kontrolü", paths: ["Bin Kılıç Dizisi", "Hayalet Kılıç"] },
      { id: "sm_path3", name: "Kanlı Kılıç Muhafızı", desc: "Can emme ve yakın dövüş dayanıklılığı", paths: ["Kan İçen", "Ölümsüz Muhafız"] }
    ]
  },
  spiritMage: {
    id: "spiritMage",
    name: "Ruh Büyücüsü",
    role: "Alan Hasarı / Enerji Akışı",
    baseStats: { attack: 160, defense: 40, hp: 450, critRate: 10, critDmg: 150 },
    cultivationBonus: { spiritEnergyGain: 1.25 },
    specialties: [
      { id: "em_path1", name: "Yıldırım Elementi", desc: "Yüksek burst elektrik hasarı", paths: ["Gök Gürültüsü Efendisi", "Fırtına Rahibi"] },
      { id: "em_path2", name: "Alev Elementi", desc: "Zamanla gelen yanma ve alan hasarı", paths: ["Cehennem Ateşi", "Anka Külü"] },
      { id: "em_path3", name: "Buz Elementi", desc: "Dondurma ve yavaşlatma", paths: ["Buzul Hükümdarı", "Ebedi Ayaz"] }
    ]
  },
  shadowAssassin: {
    id: "shadowAssassin",
    name: "Gölge Suikastçısı",
    role: "Kritik Darbe / Hızlı İnfaz",
    baseStats: { attack: 150, defense: 45, hp: 500, critRate: 22, critDmg: 200 },
    cultivationBonus: { critDamageBonus: 1.20 },
    specialties: [
      { id: "sa_path1", name: "Gece Gölgesi", desc: "Görünmezlik ve ani baskın", paths: ["Karanlık Suikastçı", "Ölüm Meleği"] },
      { id: "sa_path2", name: "Zehir Ustası", desc: "Zamanla zehirleyen ölümcül vuruşlar", paths: ["Karakule Zehircisi", "Kara Engerek"] },
      { id: "sa_path3", name: "Bıçak Dansı", desc: "Çift bıçakla seri kombolar", paths: ["Fırtına Bıçağı", "Ruh Kesici"] }
    ]
  },
  ancientWarrior: {
    id: "ancientWarrior",
    name: "Kadim Savaşçı",
    role: "Tank / Yüksek Dayanıklılık",
    baseStats: { attack: 110, defense: 95, hp: 850, critRate: 8, critDmg: 140 },
    cultivationBonus: { defenseMultiplier: 1.25 },
    specialties: [
      { id: "aw_path1", name: "Dağ Muhafızı", desc: "Aşılmaz savunma kalkanı", paths: ["Kaya Hükümdarı", "Demir Surlar"] },
      { id: "aw_path2", name: "Öfke Savaşçısı", desc: "Alınan hasarla artan güç", paths: ["Kan Öfkesi", "Savaş Berserkeri"] },
      { id: "aw_path3", name: "Titan Beden", desc: "Saf HP ve yenilenme", paths: ["Kadim Titan", "Ölümsüz Beden"] }
    ]
  },
  alchemyMaster: {
    id: "alchemyMaster",
    name: "İksir Simyacısı",
    role: "Destek / Kontrol & İyileştirme",
    baseStats: { attack: 100, defense: 70, hp: 650, critRate: 10, critDmg: 150 },
    cultivationBonus: { crystalYieldBonus: 1.25 },
    specialties: [
      { id: "am_path1", name: "Hayat Pınarı", desc: "Güçlü grup iyileştirmesi", paths: ["İlahi Şifacı", "Büyük Tabip"] },
      { id: "am_path2", name: "Zehirli Simya", desc: "Debuff ve alan kontrolü", paths: ["Karantina Üstadı", "Sihirli Zehirci"] },
      { id: "am_path3", name: "İksir Güçlendirmesi", desc: "Takım istatistik artırıcılar", paths: ["Aura Efendisi", "Savaş Simyacısı"] }
    ]
  },
  dragonPriest: {
    id: "dragonPriest",
    name: "Gök Ejderha Rahibi",
    role: "Hibrit / Kadim Ejderha Gücü",
    baseStats: { attack: 145, defense: 65, hp: 700, critRate: 15, critDmg: 175 },
    cultivationBonus: { realmBreakthroughChance: 1.10 },
    specialties: [
      { id: "dp_path1", name: "Ejderha Nefesi", desc: "Yıkıcı ejderha ateşi alanı", paths: ["Ateş Ejderhası", "Kızıl Afet"] },
      { id: "dp_path2", name: "Pul Zırh", desc: "Ejderha derisi ile savunma ve hasar", paths: ["Gümüş Pul", "Ejderha Muhafızı"] },
      { id: "dp_path3", name: "Ruh Kükremesi", desc: "Rakip sersemletme ve zayıflatma", paths: ["Kükreyen Fırtına", "Göklerin Efendisi"] }
    ]
  }
};
const CLASS_SKILLS = {
  "Kılıç Ustası": [
    { id: "s1", name: "Yıldırım Kılıcı", manaCost: 25, cooldown: 3, reqRealm: 0, mult: 1.5, desc: "Rakibe hızlı bir yıldırım darbesi indirir." },
    { id: "s2", name: "Bin Kılıç Çemberi", manaCost: 45, cooldown: 6, reqRealm: 1, mult: 2.2, desc: "Etraftakilere alan kesme hasarı verir." },
    { id: "s3", name: "Ruh Kesen Darbe", manaCost: 70, cooldown: 10, reqRealm: 3, mult: 3.5, desc: "Kritik şansını ikiye katlayan ölümcül vuruş." },
    { id: "s4", name: "Göksel Kılıç Hükmü", manaCost: 120, cooldown: 18, reqRealm: 5, mult: 5.5, desc: "Gökyüzünden devasa manevi kılıç yağdırır." }
  ],
  "Ruh Büyücüsü": [
    { id: "m1", name: "Yıldırım Topu", manaCost: 30, cooldown: 3, reqRealm: 0, mult: 1.6, desc: "Konsantre elektrik topu fırlatır." },
    { id: "m2", name: "Alev Fırtınası", manaCost: 55, cooldown: 7, reqRealm: 1, mult: 2.4, desc: "Bölgeyi ateş çemberine alır." },
    { id: "m3", name: "Mutlak Ayaz", manaCost: 80, cooldown: 12, reqRealm: 3, mult: 3.8, desc: "Rakipleri dondurarak hasar verir." },
    { id: "m4", name: "Yıldız Yağmuru", manaCost: 140, cooldown: 20, reqRealm: 5, mult: 6.0, desc: "Gök cisimlerini hedefe yönlendirir." }
  ],
  "Gölge Suikastçısı": [
    { id: "a1", name: "Gölge Adımı", manaCost: 20, cooldown: 3, reqRealm: 0, mult: 1.4, desc: "Gölgeden ani sızma darbesi." },
    { id: "a2", name: "Zehirli Hançer", manaCost: 40, cooldown: 6, reqRealm: 1, mult: 2.0, desc: "Zamanla hasar veren zehirli bıçak." },
    { id: "a3", name: "Kritik İnfaz", manaCost: 75, cooldown: 11, reqRealm: 3, mult: 4.0, desc: "Yüksek kritik çarpanlı suikast." },
    { id: "a4", name: "Karanlık Sis", manaCost: 130, cooldown: 19, reqRealm: 5, mult: 5.8, desc: "Ortamı karanlığa boğarak kör edici darbe." }
  ],
  "Kadim Savaşçı": [
    { id: "w1", name: "Kaya Yumruğu", manaCost: 20, cooldown: 3, reqRealm: 0, mult: 1.3, desc: "Toprak özüyle güçlendirilmiş yumruk." },
    { id: "w2", name: "Demir Kalkan", manaCost: 40, cooldown: 8, reqRealm: 1, mult: 1.8, desc: "Geçici olarak savunmayı artırır." },
    { id: "w3", name: "Öfke Çığlığı", manaCost: 65, cooldown: 12, reqRealm: 3, mult: 3.0, desc: "Çevredeki düşmanları sarsar." },
    { id: "w4", name: "Titan Çöküşü", manaCost: 110, cooldown: 18, reqRealm: 5, mult: 5.0, desc: "Yeri sarsan devasa darbe." }
  ],
  "İksir Simyacısı": [
    { id: "p1", name: "Şifa Işığı", manaCost: 35, cooldown: 4, reqRealm: 0, mult: 1.2, desc: "Hayati enerjiyi yeniler." },
    { id: "p2", name: "Zehir Bulutu", manaCost: 50, cooldown: 8, reqRealm: 1, mult: 2.1, desc: "Alana zehir gazı yayar." },
    { id: "p3", name: "İksir Güçlendirmesi", manaCost: 70, cooldown: 14, reqRealm: 3, mult: 2.8, desc: "Saldırı gücünü artırır." },
    { id: "p4", name: "Kutsal Diriliş Aurası", manaCost: 130, cooldown: 22, reqRealm: 5, mult: 4.8, desc: "Yüksek düzey koruma ve iyileştirme sağlar." }
  ],
  "Gök Ejderha Rahibi": [
    { id: "d1", name: "Ejderha Pençesi", manaCost: 25, cooldown: 3, reqRealm: 0, mult: 1.5, desc: "Ejderha enerjisiyle keskin pençe darbesi." },
    { id: "d2", name: "Alevli Nefes", manaCost: 50, cooldown: 7, reqRealm: 1, mult: 2.3, desc: "Ağızdan püskürtülen ejderha ateşi." },
    { id: "d3", name: "Pul Kalkan", manaCost: 75, cooldown: 12, reqRealm: 3, mult: 3.2, desc: "Ejderha pullarıyla zırhlanma." },
    { id: "d4", name: "Kızıl Ejder Öfkesi", manaCost: 135, cooldown: 20, reqRealm: 5, mult: 5.8, desc: "Ejderha formuna girerek yıkıcı güç salınımı." }
  ]
};
const ITEM_RARITIES = {
  COMMON: { name: "Sıradan", color: "#b2bec3", multiplier: 1.0 },
  RARE: { name: "Nadir", color: "#0984e3", multiplier: 1.35 },
  EPIC: { name: "Epik", color: "#6c5ce7", multiplier: 1.8 },
  LEGENDARY: { name: "Efsanevi", color: "#fdcb6e", multiplier: 2.5 },
  ANCIENT: { name: "Kadim", color: "#e17055", multiplier: 3.5 },
  DIVINE: { name: "İlahi", color: "#d63031", multiplier: 5.0 }
};

const EQUIPMENT_SLOTS = ["weapon", "helmet", "chest", "gloves", "boots", "necklace", "ring", "accessory"];

const ITEM_DATABASE = {
  mat_spirit_herb: { id: "mat_spirit_herb", name: "Ruh Otu", type: "material", rarity: "COMMON", maxStack: 99, desc: "Simya üretiminde kullanılan temel bitki." },
  mat_dragon_scale: { id: "mat_dragon_scale", name: "Ejderha Pulu", type: "material", rarity: "EPIC", maxStack: 99, desc: "Demircilikte güçlü ekipmanlar dövmek için şarttır." },
  pills_qi_gathering: { id: "pills_qi_gathering", name: "Toplanma Hapı", type: "consumable", rarity: "RARE", maxStack: 50, effect: { type: "energy", value: 500 }, desc: "Anında 500 Ruh Enerjisi kazandırır." },
  eq_iron_sword: { id: "eq_iron_sword", name: "Demir Uçlu Kılıç", type: "equipment", slot: "weapon", rarity: "COMMON", baseStats: { attack: 35 }, desc: "Yeni başlayanlar için standart kılıç." },
  eq_jade_blade: { id: "eq_jade_blade", name: "Yeşim Ejderha Kılıcı", type: "equipment", slot: "weapon", rarity: "EPIC", baseStats: { attack: 140, critRate: 5 }, desc: "Yeşim özüyle bilenmiş keskin kılıç." },
  eq_heaven_armor: { id: "eq_heaven_armor", name: "Göksel Çelik Zırh", type: "equipment", slot: "chest", rarity: "LEGENDARY", baseStats: { defense: 120, hp: 500 }, desc: "Gök gürültüsüne dayanıklı zırh." }
};
const WORLD_REGIONS = [
  {
    id: "reg_1",
    name: "Ruh Toprakları (Başlangıç)",
    reqRealm: 0,
    description: "Yetişim yoluna ilk adımın atıldığı, hafif manevi sisle kaplı huzurlu topraklar.",
    enemies: ["Yabani Kurt Muhafızı", "Sissoylu Yılan"],
    resources: ["Öz Kristali", "Ruh Otu"],
    miniBoss: "Karakaya Muhafızı",
    mainBoss: { name: "Kadim Gök Ejderhası İntikamcısı", hp: 10000, attack: 150 },
    storySnippet: "İlk Çağ Kalıntılarından yayılan ilk zayıf enerji dalgası burada hissedildi..."
  },
  {
    id: "reg_2",
    name: "Yeşim Sis Vadisi",
    reqRealm: 2,
    description: "Yoğun öz enerjisinin zehirli bitkilerle harmanlandığı tehlikeli vadi.",
    enemies: ["Zehirli Sarmaşık İblisi", "Gölge Avcısı"],
    resources: ["Yeşim Özü", "Ejderha Pulu"],
    miniBoss: "Zehirli Kral Akrep",
    mainBoss: { name: "Dokuz Katlı Vadi Efendisi", hp: 35000, attack: 320 },
    storySnippet: "Miras Hanedanlıklarından birinin yüzyıllar önce mühürlendiği kayıp tapınak burada yer alıyor."
  },
  {
    id: "reg_3",
    name: "Göksel Saray Kalıntıları",
    reqRealm: 5,
    description: "İlahi Yükseliş Yolu'nun bulutların üzerindeki kırık dökük ihtişamlı kalıntıları.",
    enemies: ["İlahi Muhafız Hayaleti", "Gök Gürültüsü Kuşu"],
    resources: ["Göksel Öz Taşı", "İlahi Ruh Parçası"],
    miniBoss: "Yıldırım Süvarisi",
    mainBoss: { name: "İlk Çağ İlahi Hükümdarı Sureti", hp: 120000, attack: 750 },
    storySnippet: "Dokuz âlemin geçmişindeki büyük felaketin izleri ve İlk Öz Enerjisi'nin kaynağı çözülüyor..."
  }
];
// Görev Veritabanı Tanımları
const QUEST_DATABASE = [
  { id: "q_main_1", type: "main", title: "İlk Adım: Öz Duyumu", desc: "Ruh Toprakları'nda 3 düşman alt et.", targetCount: 3, reward: { crystals: 300, energy: 500, xp: 400 } },
  { id: "q_daily_1", type: "daily", title: "Günlük Meditasyon", desc: "Ruh Meskeni'nde Kadim Kalıntı'dan hasat yap.", targetCount: 1, reward: { crystals: 150, energy: 200, xp: 150 } },
  { id: "q_realm_1", type: "cultivation", title: "Gök Gürültüsü Sınavı", desc: "Öz Uyandırma âlemine başarıyla geçiş yap.", targetCount: 1, reward: { crystals: 1000, energy: 1500, xp: 2000 } }
];



const CRAFTING_RECIPES = [
  { resultId: 'eq_jade_blade', building: 'forge', reqLevel: 2, cost: { crystals: 500, stones: 100, mat_dragon_scale: 2 } },
  { resultId: 'pills_qi_gathering', building: 'alchemyRoom', reqLevel: 1, cost: { crystals: 100, mat_spirit_herb: 5 } }
];

const BATTLE_STAGES = [
  { id: 1, name: 'Kül Vadisi Girişi', enemyName: 'Yabani Kurt Muhafızı', hp: 1200, attack: 45, spawn: { x: 0.75, y: 0.35 }, reqRealm: 0, reward: { crystals: 50, energy: 100, xp: 200 } },
  { id: 2, name: 'Yeşim Orman Kalbi', enemyName: 'Ruh Emen Ağaç İblisi', hp: 3500, attack: 90, spawn: { x: 0.25, y: 0.65 }, reqRealm: 1, reward: { crystals: 150, energy: 300, xp: 600 } },
  { id: 3, name: 'Kadim Gök Ejderhası İni', enemyName: 'Kadim Gök Ejderhası', hp: 15000, attack: 180, spawn: { x: 0.50, y: 0.20 }, reqRealm: 3, isBoss: true, reward: { crystals: 1000, energy: 2500, xp: 5000, item: 'eq_jade_blade' } }
];

const playerSchema = new mongoose.Schema({
  version: { type: String, default: '2.0.0' },
  username: { type: String, unique: true, required: true, trim: true, maxlength: 20, index: true },
  passwordSalt: { type: String, default: null, select: false },
  passwordHash: { type: String, default: null, select: false },
  legacyClaimTokenHash: { type: String, default: null, select: false },
  className: { type: String, default: 'Kılıç Ustası' },
  level: { type: Number, default: 1, min: 1 },
  xp: { type: Number, default: 0, min: 0 },
  nextLevelXp: { type: Number, default: 1000, min: 1 },
  power: { type: Number, default: 150, min: 0 },
  x: { type: Number, default: 0.5, min: 0, max: 1 },
  y: { type: Number, default: 0.6, min: 0, max: 1 },
  currentMapId: { type: String, default: 'reg_1' },
  cultivationRealm: { type: String, default: CULTIVATION_REALMS[0].name },
  cultivationRealmIndex: { type: Number, default: 0, min: 0, max: 8 },
  cultivationSubStep: { type: Number, default: 1, min: 1 },
  cultivationEnergy: { type: Number, default: 0, min: 0 },
  cultivationAttackBonus: { type: Number, default: 0 },
  cultivationHpBonus: { type: Number, default: 0 },
  cultivationCritBonus: { type: Number, default: 0 },
  cultivationComplete: { type: Boolean, default: false },
  // realmIndex/eski currency alanları migration uyumluluğu için tutulur.
  realmIndex: { type: Number, default: 0 },
  hp: { type: Number, default: 500, min: 0 },
  maxHp: { type: Number, default: 500, min: 1 },
  mana: { type: Number, default: 200, min: 0 },
  maxMana: { type: Number, default: 200, min: 1 },
  attackPower: { type: Number, default: 120, min: 0 },
  defense: { type: Number, default: 50, min: 0 },
  critRate: { type: Number, default: 10, min: 0, max: 100 },
  critDamage: { type: Number, default: 150, min: 100 },
  currencies: {
    essenceCrystals: { type: Number, default: 200, min: 0 },
    spiritStones: { type: Number, default: 50, min: 0 },
    sectTokens: { type: Number, default: 0, min: 0 },
    gold: { type: Number, default: 0, min: 0 }
  },
  // Eski sürümle uyum için tutulur; her kayıt öncesi currencies ile eşitlenir.
  essenceCrystals: { type: Number, default: 200, min: 0 },
  spiritEnergy: { type: Number, default: 100, min: 0 },
  inventory: [{
    itemUUID: String,
    itemId: String,
    count: { type: Number, default: 1, min: 1 },
    enhancementLevel: { type: Number, default: 0, min: 0, max: 20 },
    rarity: { type: String, default: 'COMMON' }
  }],
  equipment: {
    weapon: { type: mongoose.Schema.Types.Mixed, default: null },
    helmet: { type: mongoose.Schema.Types.Mixed, default: null },
    chest: { type: mongoose.Schema.Types.Mixed, default: null },
    // Eski sürümün armor alanını okuyabilmek için geçici takma ad.
    armor: { type: mongoose.Schema.Types.Mixed, default: null },
    gloves: { type: mongoose.Schema.Types.Mixed, default: null },
    boots: { type: mongoose.Schema.Types.Mixed, default: null },
    necklace: { type: mongoose.Schema.Types.Mixed, default: null },
    ring: { type: mongoose.Schema.Types.Mixed, default: null },
    accessory: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  inventoryCapacity: { type: Number, default: 40, min: 1, max: 200 },
  unlockedSkills: { type: [String], default: [] },
  retainers: {
    lin: { type: Number, default: 1 },
    kael: { type: Number, default: 1 },
    veyra: { type: Number, default: 1 }
  },
  guildName: { type: String, default: '' },
  abodeBuildings: {
    spiritRoom: { level: { type: Number, default: 1 }, upgradeFinishTime: { type: Date, default: null }, pendingLevel: { type: Number, default: null } },
    essencePool: { level: { type: Number, default: 1 }, upgradeFinishTime: { type: Date, default: null }, pendingLevel: { type: Number, default: null } },
    alchemyRoom: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null }, pendingLevel: { type: Number, default: null } },
    forge: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null }, pendingLevel: { type: Number, default: null } },
    spiritGarden: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null }, pendingLevel: { type: Number, default: null } },
    ancientLibrary: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null }, pendingLevel: { type: Number, default: null } },
    treasury: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null }, pendingLevel: { type: Number, default: null } },
    trainingGround: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null }, pendingLevel: { type: Number, default: null } }
  },
  // Eski bina seviyeleri migration amaçlı tutulur.
  mineLevel: { type: Number, default: 1 },
  furnaceLevel: { type: Number, default: 1 },
  completedQuests: { type: [String], default: [] },
  activeQuestProgress: { type: mongoose.Schema.Types.Mixed, default: {} },
  unlockedRegions: { type: [String], default: ['reg_1'] },
  claimedMilestones: { type: [String], default: [] },
  lastClaimTime: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: false, minimize: false });

const PlayerModel = mongoose.model('Player', playerSchema);
const guildSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true, trim: true, maxlength: 24 },
  leader: { type: String, required: true },
  members: [{ type: String }],
  level: { type: Number, default: 1 },
  treasury: { type: Number, default: 0 }
});
const GuildModel = mongoose.model('Guild', guildSchema);
const bossSchema = new mongoose.Schema({
  bossId: { type: String, unique: true, default: 'world_boss' },
  name: { type: String, default: 'Kadim Gök Ejderhası' },
  maxHp: { type: Number, default: 1000000 },
  currentHp: { type: Number, default: 1000000 },
  level: { type: Number, default: 50 },
  isAlive: { type: Boolean, default: true },
  respawnAt: { type: Date, default: null }
});
const WorldBossModel = mongoose.model('WorldBoss', bossSchema);

const activePlayers = new Map();
const activeBattles = new Map();
const pendingChallenges = new Map();
const activeDuels = new Map();
const cooldowns = new Map();
const eventRate = new Map();
let worldBoss = null;

const CLASS_NAME_TO_ID = Object.values(CHARACTER_CLASSES).reduce((acc, item) => {
  acc[item.name] = item.id;
  return acc;
}, {});
const CLASS_ALIASES = { 'İklim / Şifacı Ustası': 'İksir Simyacısı' };
const VALID_CLASSES = new Set(Object.values(CHARACTER_CLASSES).map(c => c.name));

function safeText(value, maxLength = 100) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}
function allowEvent(socket, eventName, max = 10, windowMs = 1000) {
  const key = `${socket.id}:${eventName}`;
  const now = Date.now();
  const record = eventRate.get(key) || { start: now, count: 0 };
  if (now - record.start > windowMs) { record.start = now; record.count = 0; }
  record.count += 1;
  eventRate.set(key, record);
  if (record.count > max) {
    socket.emit('error_message', 'Çok hızlı işlem yapıyorsun. Biraz bekle.');
    return false;
  }
  return true;
}
function roomForMap(mapId) { return `map:${safeText(mapId, 40) || 'map_root_lands'}`; }
function guildRoom(name) { return `guild:${safeText(name, 24).toLowerCase()}`; }
function currency(player, key) { return Number(player.currencies?.[key] || 0); }
function addCurrency(player, key, amount) {
  if (!player.currencies) player.currencies = {};
  player.currencies[key] = Math.max(0, currency(player, key) + Math.floor(Number(amount) || 0));
  if (key === 'essenceCrystals') player.essenceCrystals = player.currencies.essenceCrystals;
}
function spendCurrency(player, key, amount) {
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  if (currency(player, key) < cost) return false;
  addCurrency(player, key, -cost);
  return true;
}
function syncLegacyFields(player) {
  if (!player.currencies) player.currencies = {};
  const oldValue = Number(player.essenceCrystals || 0);
  const nestedValue = Number(player.currencies.essenceCrystals || 0);
  // Eski kayıtlarda alanlardan biri güncel kalmış olabilir; hiçbir bakiyeyi sessizce kaybetmemek için büyük olanı temel al.
  player.currencies.essenceCrystals = Math.max(oldValue, nestedValue, 0);
  player.essenceCrystals = player.currencies.essenceCrystals;
  player.currencies.spiritStones = Math.max(0, Number(player.currencies.spiritStones ?? 50));
  player.currencies.sectTokens = Math.max(0, Number(player.currencies.sectTokens ?? 0));
  player.currencies.gold = Math.max(0, Number(player.currencies.gold ?? 0));
  player.realmIndex = player.cultivationRealmIndex || 0;
}
function completeFinishedUpgrades(player) {
  let changed = false;
  const buildings = player.abodeBuildings || {};
  for (const [id, data] of Object.entries(buildings)) {
    if (data?.upgradeFinishTime && new Date(data.upgradeFinishTime).getTime() <= Date.now()) {
      data.level = Math.max(Number(data.level || 0), Number(data.pendingLevel || data.level || 0));
      data.pendingLevel = null;
      data.upgradeFinishTime = null;
      changed = true;
    }
  }
  if (changed) player.markModified('abodeBuildings');
  return changed;
}
function normalizePlayer(player) {
  if (CLASS_ALIASES[player.className]) player.className = CLASS_ALIASES[player.className];
  const wasLegacy = player.version !== '2.0.0';
  if (!player.currencies) player.currencies = { essenceCrystals: 200, spiritStones: 50, sectTokens: 0, gold: 0 };
  syncLegacyFields(player);
  if (!player.retainers) player.retainers = { lin: 1, kael: 1, veyra: 1 };
  if (!player.abodeBuildings) player.abodeBuildings = {};
  if (!player.activeQuestProgress) player.activeQuestProgress = {};
  if (!player.completedQuests) player.completedQuests = [];
  if (!player.unlockedRegions) player.unlockedRegions = ['reg_1'];
  if (typeof player.cultivationRealmIndex !== 'number') player.cultivationRealmIndex = Number(player.realmIndex || 0);
  player.cultivationRealmIndex = Math.max(0, Math.min(CULTIVATION_REALMS.length - 1, player.cultivationRealmIndex));
  player.realmIndex = player.cultivationRealmIndex;
  player.cultivationSubStep = Math.max(1, Number(player.cultivationSubStep || 1));
  player.cultivationRealm = CULTIVATION_REALMS[player.cultivationRealmIndex].name;
  if (!player.currentMapId || player.currentMapId === 'map_root_lands') player.currentMapId = 'reg_1';
  // Eski yedi aşamalı sürümdeki Ruh Enerjisini yeni yetişim kaynağına bir defa aktar.
  if (wasLegacy && Number(player.cultivationEnergy || 0) === 0) {
    player.cultivationEnergy = Number(player.spiritEnergy || 0);
  }
  // Eski maden/fırın değerlerini Mongoose varsayılanları ezmeden yeni binalara taşı.
  if (wasLegacy) {
    const poolLevel = Math.max(1, Number(player.mineLevel || 1), Number(player.abodeBuildings?.essencePool?.level || 0));
    const roomLevel = Math.max(1, Number(player.furnaceLevel || 1), Number(player.abodeBuildings?.spiritRoom?.level || 0));
    player.abodeBuildings.essencePool = { ...(player.abodeBuildings.essencePool?.toObject?.() || player.abodeBuildings.essencePool || {}), level: poolLevel };
    player.abodeBuildings.spiritRoom = { ...(player.abodeBuildings.spiritRoom?.toObject?.() || player.abodeBuildings.spiritRoom || {}), level: roomLevel };
    // Önceki ekipman verisinde zırh "armor" yuvasında tutuluyordu.
    if (player.equipment?.armor) {
      if (!player.equipment.chest) player.equipment.chest = player.equipment.armor;
      player.equipment.armor = null;
    }
  }
  player.version = '2.0.0';
  // Eski piksel koordinatlarını normalize koordinata çevir.
  if (Number(player.x) > 1 || Number(player.y) > 1) {
    player.x = Math.max(0, Math.min(1, Number(player.x || MAP_WIDTH / 2) / MAP_WIDTH));
    player.y = Math.max(0, Math.min(1, Number(player.y || MAP_HEIGHT * 0.6) / MAP_HEIGHT));
  }
  if (!Number.isFinite(player.x)) player.x = 0.5;
  if (!Number.isFinite(player.y)) player.y = 0.6;
  if (!player.lastClaimTime) player.lastClaimTime = new Date();
  // Eski maden/fırın seviyeleri yeni binalara tek seferlik aktarılır.
  player.abodeBuildings.essencePool ||= { level: Math.max(1, Number(player.mineLevel || 1)), upgradeFinishTime: null, pendingLevel: null };
  player.abodeBuildings.spiritRoom ||= { level: Math.max(1, Number(player.furnaceLevel || 1)), upgradeFinishTime: null, pendingLevel: null };
  for (const [id, config] of Object.entries(ABODE_BUILDINGS)) {
    if (!player.abodeBuildings[id]) player.abodeBuildings[id] = { level: ['spiritRoom', 'essencePool'].includes(id) ? 1 : 0, upgradeFinishTime: null, pendingLevel: null };
    if (player.abodeBuildings[id].pendingLevel === undefined) player.abodeBuildings[id].pendingLevel = null;
  }
  completeFinishedUpgrades(player);
  player.inventoryCapacity = Math.min(200, 40 + Number(player.abodeBuildings.treasury?.level || 0) * 5);
  return player;
}
function recalculatePlayerStats(player) {
  const classId = CLASS_NAME_TO_ID[player.className] || 'swordmaster';
  const cls = CHARACTER_CLASSES[classId] || CHARACTER_CLASSES.swordmaster;
  const base = cls.baseStats;
  let attack = base.attack + (Number(player.level || 1) - 1) * 20 + Number(player.cultivationAttackBonus || 0);
  let defense = base.defense + (Number(player.level || 1) - 1) * 8;
  let maxHp = base.hp + (Number(player.level || 1) - 1) * 60 + Number(player.cultivationHpBonus || 0);
  let critRate = base.critRate + Number(player.cultivationCritBonus || 0);
  let critDamage = base.critDmg;

  const equipment = player.equipment || {};
  for (const item of Object.values(equipment)) {
    if (!item) continue;
    const config = ITEM_DATABASE[item.itemId];
    if (!config || !config.baseStats) continue;
    const rarityMultiplier = ITEM_RARITIES[item.rarity || config.rarity || 'COMMON']?.multiplier || 1;
    const enhancementMultiplier = 1 + Math.max(0, Number(item.enhancementLevel || 0)) * 0.08;
    const multiplier = rarityMultiplier * enhancementMultiplier;
    attack += Number(config.baseStats.attack || 0) * multiplier;
    defense += Number(config.baseStats.defense || 0) * multiplier;
    maxHp += Number(config.baseStats.hp || 0) * multiplier;
    critRate += Number(config.baseStats.critRate || 0) * multiplier;
  }
  const buildings = player.abodeBuildings || {};
  attack += Number(buildings.ancientLibrary?.level || 0) * 10;
  attack += Number(player.retainers?.kael || 1) * 18;
  defense += Number(player.retainers?.lin || 1) * 5;
  critRate += Math.max(0, Number(player.retainers?.veyra || 1) - 1) * 0.5;
  // HP=0 geçerli bir durumdur; sıfır canı istatistik güncellemesinde doldurma.
  const keepHp = Number(player.hp ?? maxHp);
  player.maxHp = Math.max(1, Math.floor(maxHp));
  player.maxMana = 200 + (Number(player.level || 1) - 1) * 10;
  player.hp = Math.min(player.maxHp, Math.max(0, Number.isFinite(keepHp) ? keepHp : player.maxHp));
  player.mana = Math.min(player.maxMana, Math.max(0, Number(player.mana ?? player.maxMana)));
  player.attackPower = Math.max(1, Math.floor(attack));
  player.defense = Math.max(0, Math.floor(defense));
  player.critRate = Math.max(0, Math.min(75, critRate));
  player.critDamage = critDamage;
  player.power = Math.floor(player.attackPower + player.defense * 1.5 + player.maxHp * 0.15 + player.critRate * 3);
  return player;
}
function addPlayerXp(player, amount) {
  let gained = Math.max(0, Math.floor(Number(amount) || 0));
  player.xp = Number(player.xp || 0) + gained;
  let leveled = false;
  while (player.xp >= Number(player.nextLevelXp || 1000)) {
    player.xp -= Number(player.nextLevelXp || 1000);
    player.level += 1;
    player.nextLevelXp = Math.floor(Number(player.nextLevelXp || 1000) * 1.35);
    addCurrency(player, 'essenceCrystals', player.level * 50);
    addCurrency(player, 'spiritStones', 10);
    leveled = true;
  }
  recalculatePlayerStats(player);
  return leveled;
}
function sanitizePlayerProfile(player) {
  normalizePlayer(player);
  recalculatePlayerStats(player);
  return player;
}
function publicPlayer(player) {
  const data = player.toObject ? player.toObject() : { ...player };
  delete data.passwordHash;
  delete data.passwordSalt;
  delete data.legacyClaimTokenHash;
  data.essenceCrystals = data.currencies?.essenceCrystals ?? 0;
  return data;
}
function calculateSkillDamage(player, multiplier) {
  const isCrit = Math.random() * 100 < Number(player.critRate || 0);
  const critMultiplier = isCrit ? Number(player.critDamage || 150) / 100 : 1;
  return { damage: Math.max(1, Math.floor(Number(player.attackPower || 100) * multiplier * critMultiplier)), isCrit };
}
async function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return { salt: salt.toString('hex'), hash: derived.toString('hex') };
}
async function verifyPassword(password, saltHex, hashHex) {
  const result = await hashPassword(password, saltHex);
  const a = Buffer.from(result.hash, 'hex');
  const b = Buffer.from(hashHex || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function buildPlayerList(mapId) {
  return [...activePlayers.values()].filter(p => p.currentMapId === mapId).map(({ id, username, className, level, power, x, y }) => ({ id, username, className, level, power, x, y }));
}
function emitPlayersList() {
  const byMap = new Map();
  for (const player of activePlayers.values()) {
    if (!byMap.has(player.currentMapId)) byMap.set(player.currentMapId, {});
    byMap.get(player.currentMapId)[player.id] = {
      id: player.id, username: player.username, className: player.className,
      level: player.level, power: player.power, guildName: player.guildName || ''
    };
  }
  for (const [mapId, players] of byMap) io.to(roomForMap(mapId)).emit('update_players', players);
}
function emitUpdatedPlayer(socket, player) {
  sanitizePlayerProfile(player);
  player.updatedAt = new Date();
  return player.save().then(() => {
    const active = activePlayers.get(socket.id);
    if (active) Object.assign(active, { className: player.className, level: player.level, power: player.power, guildName: player.guildName || '' });
    socket.emit('player_updated', publicPlayer(player));
    socket.emit('quests_updated', buildQuestStatus(player));
    emitPlayersList();
  });
}
function getQuestProgress(player, quest) {
  if (quest.type === 'cultivation') return player.cultivationRealmIndex >= 1 ? 1 : 0;
  return Number(player.activeQuestProgress?.[quest.id] || 0);
}
function buildQuestStatus(player) {
  return QUEST_DATABASE.map(quest => {
    const progress = Math.min(quest.targetCount, getQuestProgress(player, quest));
    const claimed = (player.completedQuests || []).includes(quest.id);
    return { ...quest, progress, completed: progress >= quest.targetCount, claimed };
  });
}
function incrementQuestProgress(player, questId, amount = 1) {
  if (!player.activeQuestProgress) player.activeQuestProgress = {};
  player.activeQuestProgress[questId] = Math.min(999999, Number(player.activeQuestProgress[questId] || 0) + amount);
  player.markModified('activeQuestProgress');
}

async function getPlayerForSocket(socket) {
  const active = activePlayers.get(socket.id);
  if (!active) return null;
  const player = await PlayerModel.findById(active.playerId).select('+passwordHash +passwordSalt');
  if (!player) return null;
  normalizePlayer(player);
  return player;
}

async function loadWorldBoss() {
  worldBoss = await WorldBossModel.findOneAndUpdate(
    { bossId: 'world_boss' },
    { $setOnInsert: { bossId: 'world_boss', name: 'Kadim Gök Ejderhası', maxHp: 1000000, currentHp: 1000000, level: 50, isAlive: true } },
    { upsert: true, new: true }
  );
  if (!worldBoss.isAlive && worldBoss.respawnAt && worldBoss.respawnAt <= new Date()) {
    worldBoss.currentHp = worldBoss.maxHp;
    worldBoss.isAlive = true;
    worldBoss.respawnAt = null;
    await worldBoss.save();
  }
  return worldBoss;
}
function bossPublic() {
  if (!worldBoss) return null;
  return {
    name: worldBoss.name,
    maxHp: worldBoss.maxHp,
    currentHp: worldBoss.currentHp,
    level: worldBoss.level,
    isAlive: worldBoss.isAlive,
    respawnAt: worldBoss.respawnAt
  };
}

function closeBattle(socketId) {
  const battle = activeBattles.get(socketId);
  if (battle?.timer) clearInterval(battle.timer);
  activeBattles.delete(socketId);
}
function battleSnapshot(battle) {
  return {
    stageId: battle.stageId,
    stageName: battle.stageName,
    enemyName: battle.enemyName,
    enemyHp: battle.enemyHp,
    enemyMaxHp: battle.enemyMaxHp,
    enemyAttack: battle.enemyAttack,
    isBoss: battle.isBoss,
    bossPhase: battle.bossPhase,
    playerHp: battle.playerHp,
    playerMaxHp: battle.playerMaxHp,
    playerMana: battle.playerMana,
    playerMaxMana: battle.playerMaxMana,
    shield: battle.shield,
    isActive: battle.isActive,
    lastLog: battle.lastLog || ''
  };
}
async function finishBattle(socketId, success, reason = '') {
  const battle = activeBattles.get(socketId);
  const active = activePlayers.get(socketId);
  if (!battle || !active || !battle.isActive) return;
  battle.isActive = false;
  if (battle.timer) clearInterval(battle.timer);
  const socket = io.sockets.sockets.get(socketId);
  try {
    const player = await PlayerModel.findById(active.playerId);
    if (player) {
      player.hp = success ? Math.max(1, battle.playerHp) : 1;
      player.mana = battle.playerMana;
      if (success) {
        const stage = BATTLE_STAGES.find(s => s.id === battle.stageId);
        addCurrency(player, 'essenceCrystals', stage.reward.crystals);
        player.spiritEnergy = Number(player.spiritEnergy || 0) + stage.reward.energy;
        player.cultivationEnergy = Number(player.cultivationEnergy || 0) + stage.reward.energy;
        addPlayerXp(player, stage.reward.xp);
        incrementQuestProgress(player, 'q_main_1', 1);
        if (stage.reward.item && (player.inventory || []).length < player.inventoryCapacity) {
          player.inventory.push({
            itemUUID: crypto.randomUUID(), itemId: stage.reward.item, count: 1,
            enhancementLevel: 0, rarity: ITEM_DATABASE[stage.reward.item]?.rarity || 'COMMON'
          });
        }
      }
      await player.save();
      const live = activePlayers.get(socketId);
      if (live) Object.assign(live, { level: player.level, power: player.power, className: player.className });
      if (socket) { socket.emit('player_updated', publicPlayer(player)); socket.emit('quests_updated', buildQuestStatus(player)); }
      emitPlayersList();
      if (socket) socket.emit('battle_ended', {
        success,
        reward: success ? BATTLE_STAGES.find(s => s.id === battle.stageId).reward : null,
        message: success ? `Zafer! ${battle.enemyName} alt edildi.` : (reason || 'Savaşta yenildin. Dinlenip yeniden dene.')
      });
    }
  } catch (error) {
    console.error('[BATTLE_FINISH]', error);
    if (socket) socket.emit('error_message', 'Savaş sonucu kaydedilemedi.');
  } finally {
    activeBattles.delete(socketId);
  }
}
async function tickBattle(socketId) {
  const battle = activeBattles.get(socketId);
  const active = activePlayers.get(socketId);
  const socket = io.sockets.sockets.get(socketId);
  if (!battle || !battle.isActive || !active || !socket) return closeBattle(socketId);
  if (battle.processing) return;
  battle.processing = true;
  try {
    const player = await PlayerModel.findById(active.playerId);
    if (!player) return closeBattle(socketId);
    const attack = calculateSkillDamage(player, Number(battle.attackBuffMultiplier || 1));
    battle.enemyHp = Math.max(0, battle.enemyHp - attack.damage);
    battle.lastLog = `Otomatik saldırı: ${attack.damage}${attack.isCrit ? ' kritik hasar!' : ' hasar.'}`;

    if (battle.enemyHp <= 0) {
      battle.enemyHp = 0;
      socket.emit('battle_tick_update', battleSnapshot(battle));
      return finishBattle(socketId, true);
    }

    let incoming = Math.max(1, Math.floor(battle.enemyAttack - (player.defense || 0) * 0.35));
    if (battle.shield > 0) {
      const absorbed = Math.min(battle.shield, incoming);
      battle.shield -= absorbed;
      incoming -= absorbed;
    }
    battle.playerHp = Math.max(0, battle.playerHp - incoming);
    battle.lastLog += ` Düşman ${incoming} hasar verdi.`;
    battle.playerMana = Math.min(battle.playerMaxMana, battle.playerMana + 5);

    if (battle.isBoss && battle.enemyHp <= battle.enemyMaxHp * 0.5 && battle.bossPhase === 1) {
      battle.bossPhase = 2;
      battle.enemyAttack = Math.floor(battle.enemyAttack * 1.4);
      socket.emit('boss_phase_shift', { phase: 2, message: 'Kadim Gök Ejderhası öfke fazına girdi! Saldırı gücü arttı.' });
    }
    socket.emit('battle_tick_update', battleSnapshot(battle));
    if (battle.playerHp <= 0) return finishBattle(socketId, false, 'Karakterin savaşta yenildi.');
  } catch (error) {
    console.error('[BATTLE_TICK]', error);
    socket.emit('error_message', 'Savaş turu işlenirken hata oluştu.');
    closeBattle(socketId);
  } finally {
    battle.processing = false;
  }
}
function getSkill(player, skillId) {
  const list = CLASS_SKILLS[player.className] || CLASS_SKILLS['Kılıç Ustası'];
  return list.find(skill => skill.id === skillId);
}

io.on('connection', (socket) => {
  socket.on('player_login', async (data = {}) => {
    if (!allowEvent(socket, 'player_login', 5, 60000)) return;
    try {
      const username = safeText(data.username, 20);
      const password = String(data.password || '');
      const className = VALID_CLASSES.has(data.className) ? data.className : 'Kılıç Ustası';
      if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(username)) {
        return socket.emit('error_message', 'Oyuncu adı 3-20 karakter olmalı; harf, sayı, _ ve - kullanılabilir.');
      }
      if (password.length < 8 || password.length > 72) {
        return socket.emit('error_message', 'Şifre en az 8, en fazla 72 karakter olmalı.');
      }

      let player = await PlayerModel.findOne({ username }).select('+passwordHash +passwordSalt +legacyClaimTokenHash');
      if (!player) {
        const credentials = await hashPassword(password);
        player = new PlayerModel({ username, className, passwordSalt: credentials.salt, passwordHash: credentials.hash });
      } else if (!player.passwordHash || !player.passwordSalt) {
        const suppliedToken = String(data.migrationSecret || '');
        const expectedHash = String(player.legacyClaimTokenHash || '');
        const suppliedHash = crypto.createHash('sha256').update(suppliedToken).digest('hex');
        const a = Buffer.from(suppliedHash, 'hex');
        const b = Buffer.from(expectedHash, 'hex');
        if (!suppliedToken || !expectedHash || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          return socket.emit('error_message', 'Bu eski hesap için tek kullanımlık kişisel taşıma kodu gerekli. Yönetici bu hesaba özel kod oluşturmalı.');
        }
        const credentials = await hashPassword(password);
        player.passwordSalt = credentials.salt;
        player.passwordHash = credentials.hash;
        player.legacyClaimTokenHash = null;
      } else {
        const valid = await verifyPassword(password, player.passwordSalt, player.passwordHash);
        if (!valid) return socket.emit('error_message', 'Oyuncu adı veya şifre hatalı.');
      }

      // Kimlik doğrulaması tamamlanmadan eski oturumu düşürme: hesap ele geçirme/DoS engeli.
      for (const [oldId, oldPlayer] of activePlayers.entries()) {
        if (oldPlayer.username.toLowerCase() === username.toLowerCase() && oldId !== socket.id) {
          io.to(oldId).emit('force_logout', 'Hesabına başka bir cihazdan giriş yapıldı.');
          closeBattle(oldId);
          io.sockets.sockets.get(oldId)?.disconnect(true);
          activePlayers.delete(oldId);
        }
      }

      normalizePlayer(player);
      recalculatePlayerStats(player);
      await player.save();
      if (!player.currentMapId || player.currentMapId === 'map_root_lands') player.currentMapId = 'reg_1';
      const mapId = safeText(player.currentMapId || 'reg_1', 40);
      const active = {
        id: socket.id, playerId: String(player._id), username: player.username,
        className: player.className, level: player.level, power: player.power,
        guildName: player.guildName || '', x: player.x, y: player.y,
        targetX: player.x, targetY: player.y, currentMapId: mapId,
        lastMoveAt: Date.now(), lastPersistAt: Date.now(), moving: false
      };
      activePlayers.set(socket.id, active);
      socket.join(roomForMap(mapId));
      if (player.guildName) socket.join(guildRoom(player.guildName));
      const existing = buildPlayerList(mapId).filter(p => p.id !== socket.id);
      socket.emit('login_success', { player: publicPlayer(player), realms: CULTIVATION_REALMS, regions: WORLD_REGIONS.map(r => ({ id: r.id, name: r.name, reqRealm: r.reqRealm, description: r.description })), classSkills: CLASS_SKILLS, classes: Object.values(CHARACTER_CLASSES).map(c => ({ id: c.id, name: c.name, role: c.role, baseStats: c.baseStats })), battleStages: BATTLE_STAGES.map(s => ({ id: s.id, name: s.name, enemyName: s.enemyName, spawn: s.spawn, reqRealm: s.reqRealm })), quests: buildQuestStatus(player), worldBoss: bossPublic(), mapPlayers: existing });
      socket.to(roomForMap(mapId)).emit('player_entered_map', { id: socket.id, username: player.username, className: player.className, level: player.level, x: active.x, y: active.y });
      emitPlayersList();
    } catch (error) {
      console.error('[LOGIN]', error);
      socket.emit('error_message', 'Giriş sırasında sunucu hatası oluştu.');
    }
  });

  socket.on('claim_afk_rewards', async () => {
    if (!allowEvent(socket, 'claim_afk_rewards', 2, 5000)) return;
    try {
      const player = await getPlayerForSocket(socket);
      if (!player) return;
      const previousClaim = player.lastClaimTime || new Date();
      const elapsed = Math.floor((Date.now() - new Date(previousClaim).getTime()) / 1000);
      if (elapsed < 10) return socket.emit('error_message', 'Kadim Kalıntı en az 10 saniye biriktirmeli.');
      const seconds = Math.min(MAX_OFFLINE_SECONDS, elapsed);
      const poolLevel = Number(player.abodeBuildings.essencePool?.level || 1);
      const roomLevel = Number(player.abodeBuildings.spiritRoom?.level || 1);
      const crystalRatePerHour = 25 * poolLevel + 3 * (player.retainers?.veyra || 1);
      const energyRatePerHour = 30 * roomLevel + 2 * (player.retainers?.lin || 1);
      const crystals = Math.max(1, Math.floor(seconds / 3600 * crystalRatePerHour));
      const energy = Math.max(1, Math.floor(seconds / 3600 * energyRatePerHour));
      const offlineXp = Math.floor(seconds / 3600 * 50 * Number(player.abodeBuildings.trainingGround?.level || 0));
      const gardenHerbs = Math.floor(seconds / 3600 * 2 * Number(player.abodeBuildings.spiritGarden?.level || 0));
      // Aynı lastClaimTime ile gelen iki isteğin ikisinin de ödül vermesini atomik koşul önler.
      const result = await PlayerModel.updateOne(
        { _id: player._id, lastClaimTime: previousClaim },
        { $inc: { 'currencies.essenceCrystals': crystals, spiritEnergy: energy, cultivationEnergy: energy }, $set: { lastClaimTime: new Date(), essenceCrystals: currency(player, 'essenceCrystals') + crystals } }
      );
      if (!result.modifiedCount) return socket.emit('error_message', 'Hasat zaten alınmış. Veriler yenilendi.');
      const fresh = await PlayerModel.findById(player._id);
      if (fresh) {
        normalizePlayer(fresh);
        if (offlineXp > 0) addPlayerXp(fresh, offlineXp);
        if (gardenHerbs > 0) {
          const herb = fresh.inventory.find(item => item.itemId === 'mat_spirit_herb');
          if (herb) herb.count += gardenHerbs;
          else if (fresh.inventory.length < fresh.inventoryCapacity) fresh.inventory.push({ itemUUID: crypto.randomUUID(), itemId: 'mat_spirit_herb', count: gardenHerbs, enhancementLevel: 0, rarity: 'COMMON' });
          fresh.markModified('inventory');
        }
        await fresh.save();
        socket.emit('player_updated', publicPlayer(fresh));
      }
      await PlayerModel.updateOne({ _id: player._id }, { $inc: { 'activeQuestProgress.q_daily_1': 1 } });
      socket.emit('action_notification', `Hasat: +${crystals} Öz Kristali, +${energy} Ruh Enerjisi/Yetişim Enerjisi, +${offlineXp} XP, +${gardenHerbs} Ruh Otu.`);
    } catch (error) {
      console.error('[AFK]', error); socket.emit('error_message', 'Hasat sırasında hata oluştu.');
    }
  });

  socket.on('upgrade_abode_building', async (buildingId) => {
    if (!allowEvent(socket, 'upgrade_abode_building', 3, 5000)) return;
    try {
      const player = await getPlayerForSocket(socket);
      if (!player) return;
      const config = ABODE_BUILDINGS[safeText(buildingId, 40)];
      if (!config) return socket.emit('error_message', 'Geçersiz bina.');
      completeFinishedUpgrades(player);
      const current = player.abodeBuildings[buildingId] || { level: 0, upgradeFinishTime: null, pendingLevel: null };
      if (current.upgradeFinishTime && new Date(current.upgradeFinishTime) > new Date()) return socket.emit('error_message', 'Bu binada geliştirme zaten sürüyor.');
      if (player.level < config.unlockReq.level || player.cultivationRealmIndex < config.unlockReq.realmIndex) {
        return socket.emit('error_message', `Bu bina için Seviye ${config.unlockReq.level} ve yetişim aşaması ${config.unlockReq.realmIndex + 1} gerekiyor.`);
      }
      if (current.level >= config.maxLevel) return socket.emit('error_message', 'Bina maksimum seviyede.');
      const nextLevel = current.level + 1;
      const cost = config.getBaseCost(nextLevel);
      if (currency(player, 'essenceCrystals') < cost.crystals || currency(player, 'spiritStones') < cost.stones) {
        return socket.emit('error_message', `Gereken kaynak: ${cost.crystals} Öz Kristali, ${cost.stones} Ruh Taşı.`);
      }
      spendCurrency(player, 'essenceCrystals', cost.crystals);
      spendCurrency(player, 'spiritStones', cost.stones);
      const seconds = nextLevel * 30;
      player.abodeBuildings[buildingId] = { level: current.level, pendingLevel: nextLevel, upgradeFinishTime: new Date(Date.now() + seconds * 1000) };
      player.markModified('abodeBuildings');
      await emitUpdatedPlayer(socket, player);
      socket.emit('action_notification', `${config.name} geliştirmesi başladı. ${seconds} saniye sonra tamamlanacak.`);
    } catch (error) {
      console.error('[BUILDING_UPGRADE]', error); socket.emit('error_message', 'Bina geliştirilirken hata oluştu.');
    }
  });

  socket.on('upgrade_retainer', async (retainerKey) => {
    if (!allowEvent(socket, 'upgrade_retainer', 4, 5000)) return;
    if (!['lin', 'kael', 'veyra'].includes(retainerKey)) return socket.emit('error_message', 'Geçersiz yoldaş.');
    try {
      const player = await getPlayerForSocket(socket); if (!player) return;
      const level = Number(player.retainers[retainerKey] || 1);
      const cost = level * 150;
      if (!spendCurrency(player, 'essenceCrystals', cost)) return socket.emit('error_message', `Yetersiz Öz Kristali. Gereken: ${cost}`);
      player.retainers[retainerKey] = level + 1;
      recalculatePlayerStats(player);
      await emitUpdatedPlayer(socket, player);
      socket.emit('action_notification', `${retainerKey} yoldaşının seviyesi ${level + 1} oldu.`);
    } catch (error) { console.error('[RETAINER]', error); socket.emit('error_message', 'Yoldaş geliştirme başarısız.'); }
  });

  async function performBreakthrough() {
    const player = await getPlayerForSocket(socket); if (!player) return;
    const index = player.cultivationRealmIndex;
    const realm = CULTIVATION_REALMS[index];
    if (player.cultivationComplete) return socket.emit('error_message', 'İlk Öz Hâkimiyeti tamamlandı; yetişimin zirvesindesin.');
    if (!realm) return socket.emit('error_message', 'En yüksek yetişim aşamasındasın.');
    if (player.cultivationSubStep > realm.subSteps) player.cultivationSubStep = realm.subSteps;
    if (Number(player.cultivationEnergy || 0) < realm.reqEnergyPerStep) {
      return socket.emit('error_message', `Yetersiz Yetişim Enerjisi. Gereken: ${realm.reqEnergyPerStep}`);
    }
    if (currency(player, 'essenceCrystals') < realm.breakthroughCost.crystals || currency(player, 'spiritStones') < realm.breakthroughCost.spiritStones) {
      return socket.emit('error_message', 'Yetersiz Öz Kristali veya Ruh Taşı.');
    }
    spendCurrency(player, 'essenceCrystals', realm.breakthroughCost.crystals);
    spendCurrency(player, 'spiritStones', realm.breakthroughCost.spiritStones);
    player.cultivationEnergy -= realm.reqEnergyPerStep;
    const success = Math.random() * 100 < realm.successRate;
    if (success) {
      player.cultivationAttackBonus = Number(player.cultivationAttackBonus || 0) + Number(realm.bonuses.attack || 0);
      player.cultivationHpBonus = Number(player.cultivationHpBonus || 0) + Number(realm.bonuses.hp || 0);
      player.cultivationCritBonus = Number(player.cultivationCritBonus || 0) + Number(realm.bonuses.crit || 0);
      player.cultivationSubStep += 1;
      if (player.cultivationSubStep > realm.subSteps && index < CULTIVATION_REALMS.length - 1) {
        player.cultivationRealmIndex += 1;
        player.cultivationSubStep = 1;
        player.cultivationRealm = CULTIVATION_REALMS[player.cultivationRealmIndex].name;
        player.realmIndex = player.cultivationRealmIndex;
      } else if (player.cultivationSubStep > realm.subSteps && index === CULTIVATION_REALMS.length - 1) {
        player.cultivationSubStep = realm.subSteps;
        player.cultivationComplete = true;
      }
      recalculatePlayerStats(player);
      player.hp = player.maxHp;
      incrementQuestProgress(player, 'q_realm_1', 1);
    } else {
      player.cultivationEnergy += Math.floor(realm.reqEnergyPerStep * 0.2);
    }
    await emitUpdatedPlayer(socket, player);
    socket.emit('breakthrough_result', {
      success,
      message: success ? `Yetişim ilerledi: ${player.cultivationRealm} (${player.cultivationSubStep}/${CULTIVATION_REALMS[player.cultivationRealmIndex].subSteps}).` : 'Aşama atlama başarısız oldu; enerjinin %20’si geri verildi.'
    });
  }
  socket.on('attempt_cultivation_breakthrough', async () => {
    if (!allowEvent(socket, 'breakthrough', 2, 5000)) return;
    try { await performBreakthrough(); } catch (error) { console.error('[BREAKTHROUGH]', error); socket.emit('error_message', 'Yetişim denemesi başarısız.'); }
  });
  // Eski buton/istemci sürümüyle uyumluluk: iki olay da aynı tek yetişim sistemine gider.
  socket.on('attempt_breakthrough', async () => {
    if (!allowEvent(socket, 'breakthrough', 2, 5000)) return;
    try { await performBreakthrough(); } catch (error) { console.error('[BREAKTHROUGH_ALIAS]', error); socket.emit('error_message', 'Yetişim denemesi başarısız.'); }
  });

  socket.on('start_battle_stage', async (payload) => {
    if (!allowEvent(socket, 'start_battle_stage', 3, 5000)) return;
    if (activeBattles.has(socket.id)) return socket.emit('error_message', 'Zaten savaş içindesin.');
    try {
      const player = await getPlayerForSocket(socket); if (!player) return;
      const stageId = Number(typeof payload === 'object' ? payload.stageId : payload);
      const stage = BATTLE_STAGES.find(s => s.id === stageId);
      if (!stage) return socket.emit('error_message', 'Bölge bulunamadı.');
      if (player.cultivationRealmIndex < stage.reqRealm) return socket.emit('error_message', `Bu bölge için ${CULTIVATION_REALMS[stage.reqRealm].name} aşaması gerekiyor.`);
      const livePosition = activePlayers.get(socket.id);
      if (!livePosition || Math.hypot(livePosition.x - stage.spawn.x, livePosition.y - stage.spawn.y) > 0.085) return socket.emit('error_message', 'Savaşa başlamak için yaratığın yanına gitmelisin.');
      if (player.hp <= 0) player.hp = Math.max(1, Math.floor(player.maxHp * 0.5));
      const battle = {
        stageId: stage.id, stageName: stage.name, enemyName: stage.enemyName,
        enemyHp: stage.hp, enemyMaxHp: stage.hp, enemyAttack: stage.attack,
        isBoss: Boolean(stage.isBoss), bossPhase: 1,
        playerHp: player.hp, playerMaxHp: player.maxHp,
        playerMana: player.mana, playerMaxMana: player.maxMana,
        shield: 0, isActive: true, lastLog: 'Savaş başladı. Normal saldırılar otomatik yapılacak.'
      };
      activeBattles.set(socket.id, battle);
      battle.timer = setInterval(() => tickBattle(socket.id), 1000);
      socket.emit('battle_started', battleSnapshot(battle));
    } catch (error) { console.error('[BATTLE_START]', error); socket.emit('error_message', 'Savaş başlatılamadı.'); }
  });

  socket.on('battle_use_skill', async (skillId) => {
    if (!allowEvent(socket, 'battle_use_skill', 5, 1000)) return;
    const battle = activeBattles.get(socket.id);
    if (!battle || !battle.isActive) return socket.emit('error_message', 'Aktif savaş bulunamadı.');
    try {
      const player = await getPlayerForSocket(socket); if (!player) return;
      const skill = getSkill(player, safeText(skillId, 20));
      if (!skill) return socket.emit('error_message', 'Bu sınıfa ait yetenek bulunamadı.');
      if (player.cultivationRealmIndex < skill.reqRealm) return socket.emit('error_message', 'Bu yetenek için daha yüksek yetişim aşaması gerekiyor.');
      if (battle.playerMana < skill.manaCost) return socket.emit('error_message', 'Yetersiz mana.');
      const key = `${player._id}:${skill.id}`;
      const now = Date.now();
      const last = cooldowns.get(key) || 0;
      if (now - last < skill.cooldown * 1000) return socket.emit('error_message', `Yetenek beklemede: ${((skill.cooldown * 1000 - (now - last)) / 1000).toFixed(1)} sn.`);
      cooldowns.set(key, now);
      battle.playerMana -= skill.manaCost;
      if (/şifa|diriliş|iyileştir/i.test(skill.name)) {
        const healed = Math.floor(battle.playerMaxHp * 0.25);
        battle.playerHp = Math.min(battle.playerMaxHp, battle.playerHp + healed);
        battle.lastLog = `${skill.name}: ${healed} can iyileştirildi.`;
      } else if (/kalkan|pul/i.test(skill.name)) {
        battle.shield += 150;
        battle.lastLog = `${skill.name}: 150 kalkan kazanıldı.`;
      } else if (/iksir güçlendirmesi/i.test(skill.name)) {
        battle.attackBuffMultiplier = Math.min(1.6, Number(battle.attackBuffMultiplier || 1) + 0.2);
        battle.lastLog = `${skill.name}: otomatik saldırı gücü arttı.`;
      } else {
        const result = calculateSkillDamage(player, skill.mult);
        battle.enemyHp = Math.max(0, battle.enemyHp - result.damage);
        battle.lastLog = `${skill.name}: ${result.damage} hasar${result.isCrit ? ' (KRİTİK)' : ''}.`;
      }
      if (battle.enemyHp <= 0) {
        battle.enemyHp = 0;
        socket.emit('battle_tick_update', battleSnapshot(battle));
        return finishBattle(socket.id, true);
      }
      socket.emit('battle_tick_update', battleSnapshot(battle));
      // Mana ve canın kalıcı kaydı savaş sonunda yapılır.
    } catch (error) { console.error('[BATTLE_SKILL]', error); socket.emit('error_message', 'Yetenek kullanılamadı.'); }
  });
  socket.on('leave_battle', async () => {
    const battle = activeBattles.get(socket.id);
    const active = activePlayers.get(socket.id);
    if (!battle || !active) return;
    try {
      if (battle.timer) clearInterval(battle.timer);
      battle.isActive = false;
      const player = await PlayerModel.findById(active.playerId);
      if (player) {
        player.hp = Math.max(1, Math.min(player.maxHp, battle.playerHp));
        player.mana = Math.max(0, Math.min(player.maxMana, battle.playerMana));
        await player.save();
        socket.emit('player_updated', publicPlayer(player));
      }
      activeBattles.delete(socket.id);
      socket.emit('battle_ended', { success: false, message: 'Savaştan çekildin. Mevcut can ve mana durumun korundu.' });
    } catch (error) {
      console.error('[BATTLE_LEAVE]', error);
      activeBattles.delete(socket.id);
      socket.emit('battle_ended', { success: false, message: 'Savaştan ayrıldın; savaş durumu kaydedilemedi.' });
    }
  });

  socket.on('use_active_skill', async (skillId) => {
    const battle = activeBattles.get(socket.id);
    if (!battle) return socket.emit('error_message', 'Yetenek kullanmak için önce bir savaşa gir.');
    socket.emit('error_message', 'Savaş yetenekleri savaş penceresinden kullanılmalı.');
  });

  socket.on('equip_item', async (itemUUID) => {
    try {
      const player = await getPlayerForSocket(socket); if (!player) return;
      const index = player.inventory.findIndex(item => item.itemUUID === safeText(itemUUID, 80));
      if (index < 0) return socket.emit('error_message', 'Eşya envanterde bulunamadı.');
      const item = player.inventory[index];
      const config = ITEM_DATABASE[item.itemId];
      if (!config || config.type !== 'equipment' || !EQUIPMENT_SLOTS.includes(config.slot)) return socket.emit('error_message', 'Bu eşya kuşanılamaz.');
      const old = player.equipment[config.slot];
      if (old && player.inventory.length >= player.inventoryCapacity) return socket.emit('error_message', 'Envanterde boş yer yok.');
      player.inventory.splice(index, 1);
      if (old) player.inventory.push(old);
      player.equipment[config.slot] = item;
      player.markModified('equipment'); player.markModified('inventory');
      recalculatePlayerStats(player);
      await emitUpdatedPlayer(socket, player);
      socket.emit('action_notification', `${config.name} kuşanıldı.`);
    } catch (error) { console.error('[EQUIP]', error); socket.emit('error_message', 'Eşya kuşanılırken hata oluştu.'); }
  });

  socket.on('enhance_equipment', async (data = {}) => {
    if (!allowEvent(socket, 'enhance_equipment', 3, 3000)) return;
    try {
      const player = await getPlayerForSocket(socket); if (!player) return;
      const targetId = safeText(data.targetId, 80);
      const item = data.type === 'equipped' ? player.equipment?.[targetId] : player.inventory.find(i => i.itemUUID === targetId);
      if (!item) return socket.emit('error_message', 'Geliştirilecek eşya bulunamadı.');
      const current = Number(item.enhancementLevel || 0);
      if (current >= 20) return socket.emit('error_message', 'Eşya +20 seviyesinde.');
      const cost = (current + 1) * 100;
      if (!spendCurrency(player, 'essenceCrystals', cost)) return socket.emit('error_message', `Gereken Öz Kristali: ${cost}`);
      const successRate = Math.max(20, 100 - current * 5);
      if (Math.random() * 100 < successRate) item.enhancementLevel = current + 1;
      player.markModified('equipment'); player.markModified('inventory');
      recalculatePlayerStats(player);
      await emitUpdatedPlayer(socket, player);
      socket.emit('action_notification', item.enhancementLevel > current ? `Eşya +${item.enhancementLevel} oldu.` : 'Geliştirme başarısız; kaynak tüketildi, eşya seviyesi değişmedi.');
    } catch (error) { console.error('[ENHANCE]', error); socket.emit('error_message', 'Eşya geliştirilemedi.'); }
  });

  socket.on('craft_item', async (recipeId) => {
    if (!allowEvent(socket, 'craft_item', 3, 3000)) return;
    try {
      const player = await getPlayerForSocket(socket); if (!player) return;
      const recipe = CRAFTING_RECIPES.find(r => r.resultId === safeText(recipeId, 60));
      if (!recipe) return socket.emit('error_message', 'Üretim tarifi bulunamadı.');
      if (player.inventory.length >= player.inventoryCapacity) return socket.emit('error_message', 'Envanter dolu.');
      const building = player.abodeBuildings[recipe.building];
      if (!building || building.level < recipe.reqLevel || building.upgradeFinishTime) return socket.emit('error_message', `${recipe.building} binası gerekli seviyede ve tamamlanmış olmalı.`);
      const crystalCost = Number(recipe.cost.crystals || 0);
      const stoneCost = Number(recipe.cost.stones || 0);
      if (currency(player, 'essenceCrystals') < crystalCost || currency(player, 'spiritStones') < stoneCost) return socket.emit('error_message', 'Yetersiz Öz Kristali veya Ruh Taşı.');
      for (const [key, count] of Object.entries(recipe.cost)) {
        if (['crystals', 'stones'].includes(key)) continue;
        const available = player.inventory.filter(item => item.itemId === key).reduce((sum, item) => sum + Number(item.count || 1), 0);
        if (available < count) return socket.emit('error_message', `${ITEM_DATABASE[key]?.name || key} malzemesi eksik. Gereken: ${count}`);
      }
      spendCurrency(player, 'essenceCrystals', crystalCost);
      spendCurrency(player, 'spiritStones', stoneCost);
      for (const [key, count] of Object.entries(recipe.cost)) {
        if (['crystals', 'stones'].includes(key)) continue;
        let remaining = count;
        for (let i = player.inventory.length - 1; i >= 0 && remaining > 0; i--) {
          if (player.inventory[i].itemId !== key) continue;
          const take = Math.min(remaining, Number(player.inventory[i].count || 1));
          player.inventory[i].count -= take;
          remaining -= take;
          if (player.inventory[i].count <= 0) player.inventory.splice(i, 1);
        }
      }
      const itemConfig = ITEM_DATABASE[recipe.resultId];
      player.inventory.push({ itemUUID: crypto.randomUUID(), itemId: recipe.resultId, count: 1, enhancementLevel: 0, rarity: itemConfig.rarity || 'COMMON' });
      player.markModified('inventory');
      await emitUpdatedPlayer(socket, player);
      socket.emit('action_notification', `${itemConfig.name} üretildi.`);
    } catch (error) { console.error('[CRAFT]', error); socket.emit('error_message', 'Üretim sırasında hata oluştu.'); }
  });

  socket.on('use_item', async (itemUUID) => {
    try {
      const player = await getPlayerForSocket(socket); if (!player) return;
      const index = player.inventory.findIndex(item => item.itemUUID === safeText(itemUUID, 80));
      if (index < 0) return socket.emit('error_message', 'Eşya bulunamadı.');
      const item = player.inventory[index];
      const config = ITEM_DATABASE[item.itemId];
      if (!config || config.type !== 'consumable') return socket.emit('error_message', 'Bu eşya kullanılamaz.');
      if (config.effect?.type === 'energy') {
        player.spiritEnergy += Number(config.effect.value || 0);
        player.cultivationEnergy += Number(config.effect.value || 0);
      } else if (config.effect?.type === 'heal') {
        player.hp = Math.min(player.maxHp, player.hp + Number(config.effect.value || 0));
      } else return socket.emit('error_message', 'Bu tüketilebilir eşyanın etkisi tanımlanmamış.');
      item.count -= 1;
      if (item.count <= 0) player.inventory.splice(index, 1);
      player.markModified('inventory');
      await emitUpdatedPlayer(socket, player);
      socket.emit('action_notification', `${config.name} kullanıldı.`);
    } catch (error) { console.error('[USE_ITEM]', error); socket.emit('error_message', 'Eşya kullanılamadı.'); }
  });

  socket.on('claim_quest_reward', async (questId) => {
    if (!allowEvent(socket, 'claim_quest_reward', 3, 5000)) return;
    try {
      const player = await getPlayerForSocket(socket); if (!player) return;
      const quest = QUEST_DATABASE.find(q => q.id === safeText(questId, 60));
      if (!quest) return socket.emit('error_message', 'Görev bulunamadı.');
      if (player.completedQuests.includes(quest.id)) return socket.emit('error_message', 'Bu görev ödülü daha önce alındı.');
      const progress = getQuestProgress(player, quest);
      if (progress < quest.targetCount) return socket.emit('error_message', `Görev henüz tamamlanmadı: ${progress}/${quest.targetCount}`);
      player.completedQuests.push(quest.id);
      addCurrency(player, 'essenceCrystals', quest.reward.crystals);
      player.spiritEnergy += quest.reward.energy;
      player.cultivationEnergy += quest.reward.energy;
      addPlayerXp(player, quest.reward.xp);
      await emitUpdatedPlayer(socket, player);
      socket.emit('action_notification', `${quest.title} görevi tamamlandı; ödüller verildi.`);
    } catch (error) { console.error('[QUEST_REWARD]', error); socket.emit('error_message', 'Görev ödülü alınamadı.'); }
  });

  socket.on('get_leaderboard', async () => {
    try {
      const list = await PlayerModel.find().sort({ power: -1 }).limit(10).select('username className level power cultivationRealm');
      socket.emit('leaderboard_data', list.map(p => ({ username: p.username, className: p.className, level: p.level, power: p.power, cultivationRealm: p.cultivationRealm })));
    } catch (error) { console.error('[LEADERBOARD]', error); socket.emit('error_message', 'Sıralama yüklenemedi.'); }
  });

  socket.on('create_guild', async (data = {}) => {
    if (!allowEvent(socket, 'create_guild', 2, 10000)) return;
    try {
      const player = await getPlayerForSocket(socket); if (!player) return;
      const name = safeText(data.guildName, 24);
      if (!/^[\p{L}\p{N} _-]{3,24}$/u.test(name)) return socket.emit('error_message', 'Tarikat adı 3-24 karakter olmalı.');
      if (player.guildName) return socket.emit('error_message', 'Zaten bir tarikata üyesin.');
      const guild = new GuildModel({ name, leader: player.username, members: [player.username] });
      await guild.save();
      player.guildName = name;
      socket.join(guildRoom(name));
      await emitUpdatedPlayer(socket, player);
      socket.emit('guild_success', { message: `Tarikat kuruldu: ${name}`, guildName: name });
    } catch (error) {
      if (error.code === 11000) return socket.emit('error_message', 'Bu isimde tarikat zaten var.');
      console.error('[GUILD_CREATE]', error); socket.emit('error_message', 'Tarikat kurulamadı.');
    }
  });

  socket.on('join_guild', async (guildName) => {
    if (!allowEvent(socket, 'join_guild', 3, 10000)) return;
    try {
      const player = await getPlayerForSocket(socket); if (!player) return;
      const name = safeText(guildName, 24);
      if (!name) return socket.emit('error_message', 'Tarikat adı gerekli.');
      if (player.guildName) return socket.emit('error_message', 'Zaten bir tarikata üyesin.');
      const guild = await GuildModel.findOne({ name });
      if (!guild) return socket.emit('error_message', 'Tarikat bulunamadı.');
      if (!guild.members.includes(player.username)) guild.members.push(player.username);
      await guild.save();
      player.guildName = guild.name;
      socket.join(guildRoom(guild.name));
      await emitUpdatedPlayer(socket, player);
      socket.emit('guild_success', { message: `${guild.name} tarikatına katıldın.`, guildName: guild.name });
    } catch (error) { console.error('[GUILD_JOIN]', error); socket.emit('error_message', 'Tarikata katılınamadı.'); }
  });

  socket.on('join_chat_room', async () => {
    const active = activePlayers.get(socket.id);
    if (!active?.guildName) return socket.emit('error_message', 'Tarikat üyeliği bulunamadı.');
    const membership = await GuildModel.exists({ name: active.guildName, members: active.username });
    if (!membership) return socket.emit('error_message', 'Bu tarikatın sohbetine erişim yetkin yok.');
    socket.join(guildRoom(active.guildName));
  });

  socket.on('guild_chat_message', async (data = {}) => {
    if (!allowEvent(socket, 'guild_chat_message', 5, 5000)) return;
    const active = activePlayers.get(socket.id);
    if (!active?.guildName) return socket.emit('error_message', 'Önce bir tarikata katılmalısın.');
    const message = safeText(data.message, 250);
    if (!message) return;
    try {
      const member = await GuildModel.exists({ name: active.guildName, members: active.username });
      if (!member) return socket.emit('error_message', 'Sohbet yetkin doğrulanamadı.');
      io.to(guildRoom(active.guildName)).emit('receive_guild_chat', {
        sender: active.username, message,
        time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      });
    } catch (error) { console.error('[GUILD_CHAT]', error); socket.emit('error_message', 'Mesaj gönderilemedi.'); }
  });

  socket.on('attack_world_boss', async () => {
    if (!allowEvent(socket, 'attack_world_boss', 1, BOSS_COOLDOWN_MS)) return;
    try {
      const player = await getPlayerForSocket(socket); if (!player) return;
      if (!worldBoss) await loadWorldBoss();
      if (!worldBoss.isAlive) return socket.emit('error_message', 'Dünya bossu şu anda yeniden doğmayı bekliyor.');
      const damage = calculateSkillDamage(player, 1.4).damage;
      worldBoss.currentHp = Math.max(0, worldBoss.currentHp - damage);
      let rewardText = '';
      if (worldBoss.currentHp <= 0) {
        worldBoss.isAlive = false;
        worldBoss.respawnAt = new Date(Date.now() + 60000);
        addCurrency(player, 'essenceCrystals', 500);
        player.spiritEnergy += 1000;
        player.cultivationEnergy += 1000;
        rewardText = ' Boss ödülü: 500 Öz Kristali, 1000 Ruh Enerjisi.';
      } else {
        addCurrency(player, 'essenceCrystals', 1);
      }
      await worldBoss.save();
      await emitUpdatedPlayer(socket, player);
      io.emit('world_boss_update', { currentHp: worldBoss.currentHp, maxHp: worldBoss.maxHp, lastAttacker: player.username, damageDealt: damage });
      if (!worldBoss.isAlive) io.emit('world_boss_defeated', { killer: player.username, bossName: worldBoss.name, reward: '500 Öz Kristali, 1000 Ruh Enerjisi' });
      socket.emit('action_notification', `Boss'a ${damage} hasar verdin.${rewardText}`);
    } catch (error) { console.error('[WORLD_BOSS]', error); socket.emit('error_message', 'Boss saldırısı başarısız.'); }
  });

  socket.on('send_pvp_challenge', async (targetId) => {
    if (!allowEvent(socket, 'send_pvp_challenge', 3, 10000)) return;
    const challenger = activePlayers.get(socket.id);
    const target = activePlayers.get(String(targetId));
    if (!challenger || !target || target.id === socket.id) return socket.emit('error_message', 'Rakip çevrimiçi değil.');
    if (challenger.duelId || target.duelId || activeDuels.size > 50) return socket.emit('error_message', 'Oyunculardan biri düelloda veya arena dolu.');
    if (challenger.currentMapId !== target.currentMapId) return socket.emit('error_message', 'Aynı haritada değilsiniz.');
    pendingChallenges.set(target.id, { challengerId: socket.id, expiresAt: Date.now() + 30000 });
    io.to(target.id).emit('pvp_challenge_received', { challengerId: socket.id, challengerName: challenger.username, challengerPower: challenger.power });
    socket.emit('action_notification', `${target.username} oyuncusuna düello daveti gönderildi.`);
  });

  socket.on('accept_pvp_challenge', async (data = {}) => {
    if (!allowEvent(socket, 'accept_pvp_challenge', 3, 10000)) return;
    const challenge = pendingChallenges.get(socket.id);
    if (!challenge || challenge.expiresAt < Date.now() || challenge.challengerId !== data.challengerId) return socket.emit('error_message', 'Düello daveti geçersiz veya süresi dolmuş.');
    const challenger = activePlayers.get(challenge.challengerId);
    const defender = activePlayers.get(socket.id);
    if (!challenger || !defender) return socket.emit('error_message', 'Oyunculardan biri çevrimdışı.');
    if (challenger.currentMapId !== defender.currentMapId) {
      pendingChallenges.delete(socket.id);
      return socket.emit('error_message', 'Düello davetinden sonra farklı haritaya geçilmiş.');
    }
    try {
      const p1 = await PlayerModel.findById(challenger.playerId);
      const p2 = await PlayerModel.findById(defender.playerId);
      if (!p1 || !p2) return socket.emit('error_message', 'Oyuncu verisi bulunamadı.');
      pendingChallenges.delete(socket.id);
      const duelId = crypto.randomUUID();
      const duel = { duelId, player1Id: challenger.id, player2Id: defender.id, hp1: p1.maxHp, hp2: p2.maxHp, maxHp1: p1.maxHp, maxHp2: p2.maxHp, turn: challenger.id };
      activeDuels.set(duelId, duel);
      challenger.duelId = duelId; defender.duelId = duelId;
      const snapshot = { duelId, player1: challenger.username, player2: defender.username, hp1: duel.hp1, hp2: duel.hp2, maxHp1: duel.maxHp1, maxHp2: duel.maxHp2, turn: duel.turn };
      io.to(challenger.id).emit('pvp_battle_started', { ...snapshot, myId: challenger.id });
      io.to(defender.id).emit('pvp_battle_started', { ...snapshot, myId: defender.id });
    } catch (error) { console.error('[PVP_ACCEPT]', error); socket.emit('error_message', 'Düello başlatılamadı.'); }
  });

  socket.on('pvp_attack', async () => {
    if (!allowEvent(socket, 'pvp_attack', 2, 1000)) return;
    const active = activePlayers.get(socket.id);
    const duelId = active?.duelId;
    const duel = duelId && activeDuels.get(duelId);
    if (!duel) return socket.emit('error_message', 'Aktif düello yok.');
    if (duel.turn !== socket.id) return socket.emit('error_message', 'Sıra rakibinde.');
    try {
      const isP1 = duel.player1Id === socket.id;
      const defenderId = isP1 ? duel.player2Id : duel.player1Id;
      const attacker = await PlayerModel.findById(active.playerId);
      const defenderActive = activePlayers.get(defenderId);
      const defender = defenderActive && await PlayerModel.findById(defenderActive.playerId);
      if (!attacker || !defender) return socket.emit('error_message', 'Düello oyuncu verisi bulunamadı.');
      const rawDamage = calculateSkillDamage(attacker, 1).damage;
      const damage = Math.max(1, rawDamage - Math.floor(defender.defense * 0.25));
      if (isP1) duel.hp2 = Math.max(0, duel.hp2 - damage); else duel.hp1 = Math.max(0, duel.hp1 - damage);
      const defeated = isP1 ? duel.hp2 <= 0 : duel.hp1 <= 0;
      const snapshot = { duelId, player1: activePlayers.get(duel.player1Id).username, player2: activePlayers.get(duel.player2Id).username, hp1: duel.hp1, hp2: duel.hp2, maxHp1: duel.maxHp1, maxHp2: duel.maxHp2, turn: duel.turn, lastDamage: damage, attacker: active.username };
      if (defeated) {
        const winnerSocketId = socket.id;
        addCurrency(attacker, 'essenceCrystals', 75);
        attacker.spiritEnergy += 120;
        addPlayerXp(attacker, 100);
        await attacker.save();
        Object.assign(active, { level: attacker.level, power: attacker.power });
        io.to(duel.player1Id).emit('pvp_battle_ended', { winner: active.username, loser: defender.username, reward: '75 Öz Kristali, 120 Ruh Enerjisi, 100 XP' });
        io.to(duel.player2Id).emit('pvp_battle_ended', { winner: active.username, loser: defender.username, reward: '75 Öz Kristali, 120 Ruh Enerjisi, 100 XP' });
        io.to(winnerSocketId).emit('player_updated', publicPlayer(attacker));
        activeDuels.delete(duelId);
        if (activePlayers.get(duel.player1Id)) delete activePlayers.get(duel.player1Id).duelId;
        if (activePlayers.get(duel.player2Id)) delete activePlayers.get(duel.player2Id).duelId;
        emitPlayersList();
      } else {
        duel.turn = defenderId;
        snapshot.turn = defenderId;
        io.to(duel.player1Id).emit('pvp_battle_update', snapshot);
        io.to(duel.player2Id).emit('pvp_battle_update', snapshot);
      }
    } catch (error) { console.error('[PVP_ATTACK]', error); socket.emit('error_message', 'Düello saldırısı başarısız.'); }
  });

  socket.on('travel_to_region', async (regionId) => {
    if (!allowEvent(socket, 'travel_to_region', 3, 5000)) return;
    const active = activePlayers.get(socket.id);
    if (!active || activeBattles.has(socket.id) || active.duelId) return socket.emit('error_message', 'Şu anda bölge değiştiremezsin.');
    try {
      const region = WORLD_REGIONS.find(item => item.id === safeText(regionId, 30));
      if (!region) return socket.emit('error_message', 'Bölge bulunamadı.');
      const player = await PlayerModel.findById(active.playerId);
      if (!player) return;
      if (player.cultivationRealmIndex < region.reqRealm) return socket.emit('error_message', `Bu bölge için ${CULTIVATION_REALMS[region.reqRealm]?.name || 'daha yüksek yetişim'} gerekiyor.`);
      if (!player.unlockedRegions.includes(region.id)) player.unlockedRegions.push(region.id);
      const oldRoom = roomForMap(active.currentMapId);
      socket.leave(oldRoom);
      active.currentMapId = region.id;
      active.x = 0.5; active.y = 0.58; active.targetX = 0.5; active.targetY = 0.58; active.moving = false;
      player.currentMapId = region.id; player.x = active.x; player.y = active.y;
      await player.save();
      socket.join(roomForMap(region.id));
      socket.to(oldRoom).emit('player_left_map', { id: socket.id });
      socket.emit('region_changed', { id: region.id, name: region.name, description: region.description });
      socket.emit('map_players', buildPlayerList(region.id).filter(p => p.id !== socket.id));
      socket.to(roomForMap(region.id)).emit('player_entered_map', { id: socket.id, username: active.username, className: active.className, level: active.level, x: active.x, y: active.y });
      socket.emit('player_updated', publicPlayer(player));
      emitPlayersList();
    } catch (error) { console.error('[REGION_TRAVEL]', error); socket.emit('error_message', 'Bölgeye geçiş yapılamadı.'); }
  });

  socket.on('player_move', (data = {}) => {
    if (!allowEvent(socket, 'player_move', 15, 1000)) return;
    const active = activePlayers.get(socket.id);
    if (!active || activeBattles.has(socket.id) || active.duelId) return;
    const x = Number(data.x); const y = Number(data.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return;
    const distance = Math.hypot(active.x - x, active.y - y);
    if (distance <= 0.025) {
      active.x = x; active.y = y; active.targetX = x; active.targetY = y; active.moving = false;
      io.to(roomForMap(active.currentMapId)).emit('player_moved', {
        id: active.id, username: active.username, className: active.className,
        x: active.x, y: active.y, moving: false
      });
      PlayerModel.updateOne({ _id: active.playerId }, { $set: { x, y, updatedAt: new Date() } }).catch(err => console.error('[MOVE_SAVE]', err));
      return;
    }
    active.targetX = x; active.targetY = y; active.moving = true;
  });

  socket.on('disconnect', () => {
    const active = activePlayers.get(socket.id);
    pendingChallenges.delete(socket.id);
    for (const [targetId, challenge] of pendingChallenges.entries()) {
      if (challenge.challengerId === socket.id) pendingChallenges.delete(targetId);
    }
    closeBattle(socket.id);
    if (active) {
      if (active.duelId) {
        const duel = activeDuels.get(active.duelId);
        if (duel) {
          const winnerId = duel.player1Id === socket.id ? duel.player2Id : duel.player1Id;
          const winner = activePlayers.get(winnerId);
          if (winner) {
            io.to(winnerId).emit('pvp_battle_ended', { winner: winner.username, loser: active.username, reward: 'Rakip bağlantısı kesildi.' });
            delete winner.duelId;
          }
          activeDuels.delete(active.duelId);
        }
      }
      activePlayers.delete(socket.id);
      socket.to(roomForMap(active.currentMapId)).emit('player_left_map', { id: socket.id });
      emitPlayersList();
    }
    for (const key of [...eventRate.keys()]) if (key.startsWith(`${socket.id}:`)) eventRate.delete(key);
  });
});

// Sunucu otoriter hareket döngüsü: istemci yalnızca hedef koordinatını gönderir.
let movementTickAt = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.2, (now - movementTickAt) / 1000);
  movementTickAt = now;
  for (const active of activePlayers.values()) {
    if (!active.moving) continue;
    const dx = active.targetX - active.x;
    const dy = active.targetY - active.y;
    const distance = Math.hypot(dx, dy);
    const step = MAP_SPEED * dt;
    const reachedTarget = distance <= step || distance < 0.002;
    if (reachedTarget) {
      active.x = active.targetX; active.y = active.targetY; active.moving = false;
    } else {
      active.x += dx / distance * step;
      active.y += dy / distance * step;
    }
    io.to(roomForMap(active.currentMapId)).emit('player_moved', {
      id: active.id, username: active.username, className: active.className,
      x: active.x, y: active.y, moving: active.moving
    });
    // Hareket bittiğinde son koordinatı mutlaka kaydet; kısa yürüyüşler de kalıcı olsun.
    if (reachedTarget || now - active.lastPersistAt > 3000) {
      active.lastPersistAt = now;
      PlayerModel.updateOne({ _id: active.playerId }, { $set: { x: active.x, y: active.y, updatedAt: new Date() } }).catch(err => console.error('[MOVE_SAVE]', err));
    }
  }
}, 100);

// Tamamlanma zamanı gelen mesken binalarını periyodik olarak uygula.
setInterval(async () => {
  for (const active of activePlayers.values()) {
    try {
      const player = await PlayerModel.findById(active.playerId);
      if (!player) continue;
      normalizePlayer(player);
      const changed = completeFinishedUpgrades(player);
      if (changed) {
        recalculatePlayerStats(player);
        await player.save();
        const ownerSocket = io.sockets.sockets.get(active.id);
        if (ownerSocket) ownerSocket.emit('player_updated', publicPlayer(player));
      }
    } catch (error) { console.error('[BUILDING_TIMER]', error); }
  }
}, 5000);

setInterval(async () => {
  try {
    if (worldBoss && !worldBoss.isAlive && worldBoss.respawnAt && worldBoss.respawnAt <= new Date()) {
      worldBoss.currentHp = worldBoss.maxHp;
      worldBoss.isAlive = true;
      worldBoss.respawnAt = null;
      await worldBoss.save();
      io.emit('world_boss_respawn', bossPublic());
    }
  } catch (error) { console.error('[BOSS_RESPAWN]', error); }
}, 5000);

async function startServer() {
  if (!MONGO_URI || MONGO_URI.includes('KULLANICI') || MONGO_URI.includes('SIFRE')) {
    throw new Error('MONGO_URI ortam değişkeni gerçek MongoDB bağlantı adresiyle tanımlanmalı.');
  }
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  await loadWorldBoss();
  server.listen(PORT, () => console.log(`[SUNUCU AKTİF] Arken Dünyası ${PORT} portunda çalışıyor.`));
}
startServer().catch(error => {
  console.error('[BAŞLATMA HATASI]', error.message);
  process.exit(1);
});

