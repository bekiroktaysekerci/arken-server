require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { nextBossSpawnDate } = require('./boss_schedule');

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(v => v.trim()).filter(Boolean);
const io = new Server(server, {
  cors: { origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  }, methods: ['GET', 'POST'] }
});

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[YAPILANDIRMA] MONGO_URI tanımlı değil. .env dosyasını .env.example üzerinden oluşturun.');
  process.exit(1);
}

// 10. KAYIT VE OYUNCU VERİSİ YÖNETİMİ (Database Manager)
const databaseReady = mongoose.connect(MONGO_URI)
  .then(() => { console.log("[VERİTABANI] MongoDB bulut sunucusuna başarıyla bağlandı!"); return true; })
  .catch(err => { console.error("[HATA] MongoDB bağlantısı kurulamadı; sunucu HTTP trafiğine açılmadı:", err); process.exitCode = 1; throw err; });

// 3. YETİŞİM VE SEVİYE SİSTEMİ (Cultivation Realms)
const REALMS = [
  { name: "Kök Topraklar", reqEnergy: 500, powerBonus: 200 },
  { name: "Öz Uyandırma", reqEnergy: 1500, powerBonus: 500 },
  { name: "Temel Mührü", reqEnergy: 4000, powerBonus: 1200 },
  { name: "Çekirdek Yoğunlaşması", reqEnergy: 10000, powerBonus: 3000 },
  { name: "Ruh Filizlenmesi", reqEnergy: 25000, powerBonus: 7500 },
  { name: "Âlem Kıran", reqEnergy: 60000, powerBonus: 20000 },
  { name: "Göksel Hükümdar", reqEnergy: 150000, powerBonus: 50000 }
];
// Özgün 9 Yetişim Aşaması ve Denge Tablosu
const CULTIVATION_REALMS = [
  { id: 1, name: "Öz Duyumu", subSteps: 3, reqEnergyPerStep: 200, breakthroughCost: { crystals: 100, spiritStones: 10 }, successRate: 100, bonuses: { attack: 15, hp: 50 } },
  { id: 2, name: "Ruh Damarı Açılımı", subSteps: 4, reqEnergyPerStep: 500, breakthroughCost: { crystals: 250, spiritStones: 25 }, successRate: 90, bonuses: { attack: 30, hp: 100 } },
  { id: 3, name: "Çekirdek Oluşumu", subSteps: 5, reqEnergyPerStep: 1200, breakthroughCost: { crystals: 500, spiritStones: 50 }, successRate: 80, bonuses: { attack: 60, hp: 200, crit: 2 } },
  { id: 4, name: "Ruh Dönüşümü", subSteps: 5, reqEnergyPerStep: 3000, breakthroughCost: { crystals: 1200, spiritStones: 120 }, successRate: 70, bonuses: { attack: 120, hp: 400, crit: 3 } },
  { id: 5, name: "Yükseliş", subSteps: 6, reqEnergyPerStep: 7500, breakthroughCost: { crystals: 2500, spiritStones: 250 }, successRate: 60, bonuses: { attack: 250, hp: 800, crit: 5 } },
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
    name: "İklim / Şifacı Ustası",
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
    { id: "s1", name: "Ji Kılıç Sanatı", manaCost: 24, cooldown: 4, reqRealm: 0, mult: 1.75, desc: "Kılıç özünü tek bir keskin çizgide yoğunlaştırır." },
    { id: "s2", name: "Yıldırım Kılıcı", manaCost: 42, cooldown: 7, reqRealm: 1, mult: 2.45, desc: "Gök gürültüsüyle güçlenen delici kılıç darbesi." },
    { id: "s3", name: "Bin Kılıç Dizisi", manaCost: 72, cooldown: 12, reqRealm: 3, mult: 3.65, desc: "Hedefin üzerine ruh kılıçlarından oluşan bir dizi indirir." },
    { id: "s4", name: "Ji Âlemi: Kesin Hüküm", manaCost: 115, cooldown: 20, reqRealm: 5, mult: 5.8, desc: "Kılıç iradesini kısa süreliğine mutlaklaştırır." }
  ],
  "Ruh Büyücüsü": [
    { id: "m1", name: "Yasak Ruh Büyüsü", manaCost: 32, cooldown: 5, reqRealm: 0, mult: 1.8, desc: "Hedefin ruh özüne doğrudan saldırır." },
    { id: "m2", name: "Cehennem Alevi", manaCost: 55, cooldown: 8, reqRealm: 1, mult: 2.55, desc: "Kızıl alevleri hedefin çevresinde patlatır." },
    { id: "m3", name: "Ruh Mührü", manaCost: 82, cooldown: 13, reqRealm: 3, mult: 3.8, desc: "Ruh damarlarını baskılayan kadim mühür." },
    { id: "m4", name: "Dokuz Gök Yıldırım Çağrısı", manaCost: 135, cooldown: 22, reqRealm: 5, mult: 6.0, desc: "Göksel yıldırımı tek hedefte toplar." }
  ],
  "Gölge Suikastçısı": [
    { id: "a1", name: "Kan İçen Parmak", manaCost: 22, cooldown: 4, reqRealm: 0, mult: 1.85, desc: "Hedefin yaşam özünü emen ölümcül dokunuş." },
    { id: "a2", name: "Ölümcül Gölge Adımı", manaCost: 44, cooldown: 7, reqRealm: 1, mult: 2.5, desc: "Gölgeden çıkarak arkadan saldırır." },
    { id: "a3", name: "Kanlı Ruh Kesiti", manaCost: 76, cooldown: 12, reqRealm: 3, mult: 4.0, desc: "Kritik vuruş ihtimali yüksek kesiş." },
    { id: "a4", name: "Gece Hükmü", manaCost: 125, cooldown: 21, reqRealm: 5, mult: 5.9, desc: "Hedefi karanlık ruh enerjisiyle infaz eder." }
  ],
  "Kadim Savaşçı": [
    { id: "w1", name: "Dağ Mührü Yumruğu", manaCost: 22, cooldown: 4, reqRealm: 0, mult: 1.55, desc: "Toprak özünü yumruğunda birleştirir." },
    { id: "w2", name: "Demir Beden Sanatı", manaCost: 40, cooldown: 9, reqRealm: 1, mult: 1.9, desc: "Savunmayı ve kalkanı güçlendirir." },
    { id: "w3", name: "Kanlı Savaş İradesi", manaCost: 68, cooldown: 13, reqRealm: 3, mult: 3.2, desc: "Hasar aldıkça güçlenen savaş tekniği." },
    { id: "w4", name: "Kadim Dağ Çöküşü", manaCost: 112, cooldown: 20, reqRealm: 5, mult: 5.3, desc: "Yeri sarsan ezici bir darbe indirir." }
  ],
  "İklim / Şifacı Ustası": [
    { id: "p1", name: "Yeşim Yaşam Nefesi", manaCost: 32, cooldown: 5, reqRealm: 0, mult: 1.25, desc: "Can özünü yeniler." },
    { id: "p2", name: "Zehirli Sis Formasyonu", manaCost: 52, cooldown: 9, reqRealm: 1, mult: 2.2, desc: "Zehirli ruh sisiyle hedefi aşındırır." },
    { id: "p3", name: "Altın İksir Aurası", manaCost: 74, cooldown: 14, reqRealm: 3, mult: 2.9, desc: "Kendini ve müttefiklerini güçlendirir." },
    { id: "p4", name: "Ölümsüzlük Pınarı", manaCost: 128, cooldown: 22, reqRealm: 5, mult: 4.9, desc: "Geniş çaplı iyileştirme ve koruma sağlar." }
  ],
  "Gök Ejderha Rahibi": [
    { id: "d1", name: "Ejderha Pençesi Mührü", manaCost: 26, cooldown: 4, reqRealm: 0, mult: 1.75, desc: "Kadim ejderha gücüyle pençe darbesi." },
    { id: "d2", name: "Kızıl Ejder Nefesi", manaCost: 52, cooldown: 8, reqRealm: 1, mult: 2.5, desc: "Alevli ejderha nefesi salar." },
    { id: "d3", name: "Gök Pulu Zırhı", manaCost: 78, cooldown: 13, reqRealm: 3, mult: 3.4, desc: "Ejderha pullarından ruh kalkanı oluşturur." },
    { id: "d4", name: "Dokuz Gök Ejderha Öfkesi", manaCost: 138, cooldown: 22, reqRealm: 5, mult: 6.1, desc: "Ejderha özünü yıkıcı bir saldırıya dönüştürür." }
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
  mat_spirit_herb: { id: "mat_spirit_herb", name: "Ruh Otu", type: "material", rarity: "COMMON", maxStack: 99, desc: "Dış avluda ve sisli vadilerde yetişen simya bitkisi." },
  mat_iron_fragment: { id: "mat_iron_fragment", name: "Demir Parçası", type: "material", rarity: "COMMON", maxStack: 99, desc: "Basit silah ve zırh yapımında kullanılır." },
  mat_healing_pill: { id: "mat_healing_pill", name: "Can Hapı", type: "consumable", rarity: "COMMON", maxStack: 50, effect: { type: "heal", value: 250 }, desc: "250 HP yeniler." },
  mat_ji_fragment: { id: "mat_ji_fragment", name: "Ji Özü Parçası", type: "material", rarity: "EPIC", maxStack: 50, desc: "Ji iradesinin yoğunlaşmış bir parçası." },
  mat_armor_blueprint: { id: "mat_armor_blueprint", name: "Nadir Zırh Taslağı", type: "material", rarity: "RARE", maxStack: 20, desc: "Nadir zırh üretiminde kullanılır." },
  mat_inverse_scale: { id: "mat_inverse_scale", name: "Tersine Dönüş Boncuğu Parçası", type: "material", rarity: "DIVINE", maxStack: 20, desc: "Kadim Gök Ejderhası'nın tersine dönüş mirasından bir parça." },
  mat_dragon_scale: { id: "mat_dragon_scale", name: "Ejderha Pulu", type: "material", rarity: "EPIC", maxStack: 99, desc: "Demircilikte güçlü ekipmanlar dövmek için kullanılır." },
  pills_qi_gathering: { id: "pills_qi_gathering", name: "Öz Toplama Hapı", type: "consumable", rarity: "RARE", maxStack: 50, effect: { type: "energy", value: 500 }, desc: "500 Yetişim Enerjisi kazandırır." },
  eq_iron_sword: { id: "eq_iron_sword", name: "Demir Uçlu Kılıç", type: "equipment", slot: "weapon", rarity: "COMMON", baseStats: { attack: 35 }, desc: "Yeni başlayanlar için standart kılıç." },
  eq_jade_blade: { id: "eq_jade_blade", name: "Yeşim Kılıç", type: "equipment", slot: "weapon", rarity: "EPIC", baseStats: { attack: 140, critRate: 5 }, desc: "Yeşim özüyle bilenmiş nadir kılıç." },
  eq_heaven_armor: { id: "eq_heaven_armor", name: "Göksel Çelik Zırh", type: "equipment", slot: "chest", rarity: "LEGENDARY", baseStats: { defense: 120, hp: 500 }, desc: "Gök gürültüsüne dayanıklı zırh." },
  eq_divine_sword: { id: "eq_divine_sword", name: "İlk Öz İlahi Kılıcı", type: "equipment", slot: "weapon", rarity: "DIVINE", baseStats: { attack: 650, critRate: 12 }, desc: "İlk Öz'ün kudretini taşıyan ilahi silah." }
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
  { id: "q_heng_01", type: "main", chapter: "Heng Yue Tarikatı", title: "Dış Avlunun Yeni Çırağı", desc: "Dış avluda üç yabani yaratığı uzaklaştır.", story: "Bu tarikatın kapısından içeri girmek kolaydı. Burada hayatta kalmak ise bambaşka bir mesele. Gücüm yok; şimdilik sabretmeliyim.", targetEvent: "battle_win", targetCount: 3, reward: { crystals: 250, energy: 350, xp: 300 } },
  { id: "q_heng_02", prerequisite: "q_heng_01", type: "main", chapter: "Heng Yue Tarikatı", title: "Ruh Otu Toplama", desc: "Dış avlunun çevresinden 5 Ruh Otu topla.", story: "Başkalarının önemsiz gördüğü otlar bile benim için bir fırsat. Her şeyi kendi ellerimle kazanacağım.", targetEvent: "collect_herb", targetCount: 5, reward: { crystals: 350, energy: 500, xp: 450 } },
  { id: "q_heng_03", prerequisite: "q_heng_02", type: "main", chapter: "Heng Yue Tarikatı", title: "Dış Tarikat Sınavı", desc: "Deneme Vadisi'ndeki sınav muhafızını yen.", story: "Yetenek doğuştan gelmeyebilir. Fakat irade, insanın kendi elleriyle keskinleştirdiği bir kılıçtır.", targetEvent: "stage_2_win", targetCount: 1, reward: { crystals: 600, energy: 900, xp: 800 } },
  { id: "q_ji_01", prerequisite: "q_heng_03", type: "main", chapter: "Ji Mirası", title: "Merdiven Taşının Sırrı", desc: "Kadim sınav seferini tamamla ve Ji Özü izlerini bul.", story: "Taş basamakların üzerinde belli belirsiz bir irade hissediyorum. Bu güç bana ait değil; onu anlamalıyım.", targetEvent: "stage_3_win", targetCount: 1, reward: { crystals: 1200, energy: 1800, xp: 1600, item: "mat_ji_fragment" } },
  { id: "q_ji_02", prerequisite: "q_ji_01", type: "main", chapter: "Ji Mirası", title: "Ji İradesinin Uyanışı", desc: "Bir kez daha aşama atla.", story: "Kılıç artık yalnızca elimde tuttuğum bir silah değil. Niyetim, iradem ve yolum onun içinde birleşiyor.", targetEvent: "breakthrough", targetCount: 1, reward: { crystals: 1800, energy: 2500, xp: 2200 } },
  { id: "q_suzaku_01", prerequisite: "q_ji_02", type: "main", chapter: "Suzaku Ülkesi", title: "Teng Hanedanı'nın İnfazcılarını Durdur", desc: "Suzaku seferinde üç düşman birliğini yen.", story: "Geçmişin borçları unutulmaz. Fakat intikamın bedelini ödemeye hazır olmadan kılıç çekilmez.", targetEvent: "stage_4_win", targetCount: 3, reward: { crystals: 3500, energy: 5000, xp: 4500 } },
  { id: "q_daily_01", type: "daily", chapter: "Günlük Çalışma", title: "Sabah Meditasyonu", desc: "Ruh Meskeni'nden AFK özlerini hasat et.", story: "Bir gün bile boşa geçirilmemeli. En küçük ilerleme bile uzun yolda birikir.", targetEvent: "claim_afk", targetCount: 1, reward: { crystals: 150, energy: 250, xp: 150 } },
  { id: "q_daily_02", type: "daily", chapter: "Günlük Çalışma", title: "Vadide Av", desc: "İki sefer tamamla.", story: "Dışarıdaki tehlike, yetişimimin gerçek sınavıdır.", targetEvent: "battle_win", targetCount: 2, reward: { crystals: 200, energy: 300, xp: 200 } },
  { id: "q_cult_01", type: "cultivation", chapter: "Yetişim Yolu", title: "İlk Gök Gürültüsü Yargısı", desc: "Öz Duyumu'nun ilk büyük sınırını aş.", story: "Gökyüzü üzerime çökecek olsa bile geri adım atmayacağım.", targetEvent: "breakthrough", targetCount: 1, reward: { crystals: 500, energy: 700, xp: 900 } },
  { id: "q_boss_01", prerequisite: "q_suzaku_01", type: "cultivation", chapter: "Kadim Miras", title: "Ejderhanın Tersine Dönüşü", desc: "Kadim Gök Ejderhası'nı yen ve miras parçası elde et.", story: "Bu ejderhanın pullarında akışa karşı duran bir güç var. Belki de aradığım miras budur.", targetEvent: "world_boss_kill", targetCount: 1, reward: { crystals: 5000, energy: 8000, xp: 10000, item: "mat_inverse_scale" } }
];
function getQuestCount(player, questId) { return Number((player.activeQuestProgress || {})[questId] || 0); }
function advanceQuest(player, questId, amount = 1) {
  if (!player.activeQuestProgress) player.activeQuestProgress = {};
  const quest = QUEST_DATABASE.find(q => q.id === questId);
  if (!quest || (player.completedQuests || []).includes(questId)) return;
  player.activeQuestProgress[questId] = Math.min(quest.targetCount, getQuestCount(player, questId) + amount);
}
function advanceQuestEvent(player, eventName, amount = 1) {
  for (const quest of QUEST_DATABASE) {
    if (quest.targetEvent !== eventName) continue;
    if ((player.completedQuests || []).includes(quest.id)) continue;
    if (quest.prerequisite && !(player.completedQuests || []).includes(quest.prerequisite)) continue;
    advanceQuest(player, quest.id, amount);
  }
}
function questPayload(player) {
  const claimed = new Set([...(player.completedQuests || []), ...(player.questProgress?.completedQuests || [])]);
  return QUEST_DATABASE.map(q => ({ id:q.id, type:q.type, chapter:q.chapter, title:q.title, desc:q.desc, story:q.story, targetCount:q.targetCount, progress:getQuestCount(player,q.id), completed:getQuestCount(player,q.id)>=q.targetCount, claimed:claimed.has(q.id), locked:!!(q.prerequisite && !claimed.has(q.prerequisite)), reward:q.reward }));
}
function addInventoryItem(player, itemId, count = 1) {
  const cfg = ITEM_DATABASE[itemId]; if (!cfg) return false;
  if (!Array.isArray(player.inventory)) player.inventory = [];
  const existing = player.inventory.find(i => i.itemId === itemId && (i.count || 1) < (cfg.maxStack || 99));
  if (existing) existing.count = Math.min(cfg.maxStack || 99, (existing.count || 1) + count);
  else if (player.inventory.length < (player.inventoryCapacity || 40)) player.inventory.push({ itemUUID:`loot_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, itemId, count, rarity:cfg.rarity || "COMMON", enhancementLevel:0 });
  else return false;
  return true;
}
function rollDropTable(player, drops = []) {
  const gained=[];
  for (const drop of drops) if (Math.random()*100 < drop.chance && addInventoryItem(player, drop.itemId, drop.min ? drop.min + Math.floor(Math.random()*(drop.max-drop.min+1)) : 1)) gained.push({itemId:drop.itemId,name:ITEM_DATABASE[drop.itemId]?.name || drop.itemId});
  return gained;
}
function cultivationTitle(index, subStep) {
  const names = ["Dış Avlu Çırağı","Ruh Damarı Açan","Çekirdek Ustası","Ruh Dönüşüm Üstadı","Yükseliş Yetişimcisi","Göksel Varlık","Âlem Kıran","Kadim Hükümdar","İlk Öz Hâkimi"];
  return index === 0 ? `${names[0]} · Katman ${subStep || 1}` : names[Math.min(index,names.length-1)];
}



const playerSchema = new mongoose.Schema({
  version: { type: String, default: "1.0.0" },
  x: { type: Number, default: 100 },
  y: { type: Number, default: 100 },
  currentMapId: { type: String, default: 'map_heng_yue' },
  username: { type: String, unique: true, required: true },
  className: { type: String, default: 'Kılıç Ustası' },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  nextLevelXp: { type: Number, default: 1000 },
  power: { type: Number, default: 150 },
  cultivationRealm: { type: String, default: 'Öz Duyumu' },
  cultivationTitle: { type: String, default: 'Dış Avlu Çırağı' },
  realmIndex: { type: Number, default: 0 },
  cultivationEnergy: { type: Number, default: 200 },
  cultivationRealmIndex: { type: Number, default: 0 },
  cultivationSubStep: { type: Number, default: 1 },
  guildName: { type: String, default: '' },
  hp: { type: Number, default: 500 },
  maxHp: { type: Number, default: 500 },
  mana: { type: Number, default: 200 },
  maxMana: { type: Number, default: 200 },
  attackPower: { type: Number, default: 120 },
  defense: { type: Number, default: 50 },
  critRate: { type: Number, default: 10 },
  critDamage: { type: Number, default: 150 },
  essenceCrystals: { type: Number, default: 200 },
  spiritEnergy: { type: Number, default: 100 },
  currencies: {
    essenceCrystals: { type: Number, default: 200 },
    spiritStones: { type: Number, default: 50 },
    sectTokens: { type: Number, default: 0 }
  },
    inventory: [{
    itemUUID: { type: String },
    itemId: { type: String },
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

  unlockedSkills: { type: [String], default: ["Temel Kılıç Darbesi"] },
  questProgress: {
    mainQuestId: { type: String, default: "q_1" },
    completedQuests: { type: [String], default: [] }
  },
  abodeUpgrades: {
    mineLevel: { type: Number, default: 1 },
    furnaceLevel: { type: Number, default: 1 }
  },
  abodeBuildings: {
    spiritRoom: { level: { type: Number, default: 1 }, upgradeFinishTime: { type: Date, default: null } },
    essencePool: { level: { type: Number, default: 1 }, upgradeFinishTime: { type: Date, default: null } },
    alchemyRoom: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null } },
    forge: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null } },
    spiritGarden: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null } },
    ancientLibrary: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null } },
    treasury: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null } },
    trainingGround: { level: { type: Number, default: 0 }, upgradeFinishTime: { type: Date, default: null } }
  },

  mineLevel: { type: Number, default: 1 },
  furnaceLevel: { type: Number, default: 1 },
  retainers: {
    lin: { type: Number, default: 1 },
    kael: { type: Number, default: 1 },
    veyra: { type: Number, default: 1 }
  },
    unlockedRegions: { type: [String], default: ["reg_1"] },
  completedQuests: { type: [String], default: [] },
  activeQuestProgress: { type: Object, default: {} },
  dungeonProgress: {
    currentDungeonId: { type: String, default: null },
    roomIndex: { type: Number, default: 0 },
    isCleared: { type: Boolean, default: false }
  },

  claimedMilestones: { type: [String], default: [] },
  lastClaimTime: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});


const PlayerModel = mongoose.model('Player', playerSchema);

const guildSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true },
  leader: { type: String, required: true },
  members: [{ type: String }],
  level: { type: Number, default: 1 },
  treasury: { type: Number, default: 0 }
});

const GuildModel = mongoose.model('Guild', guildSchema);

let worldBoss = {
  name: "Kadim Gök Ejderhası",
  maxHp: 1000000,
  currentHp: 1000000,
  level: 50,
  isAlive: true,
  scheduleTime: '21:00',
  scheduleTimezone: 'Europe/Istanbul',
  nextSpawnAt: null
};

const worldBossStateSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'main_world_boss' },
  currentHp: { type: Number, default: 1000000 },
  isAlive: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
});
const WorldBossStateModel = mongoose.models.WorldBossState || mongoose.model('WorldBossState', worldBossStateSchema);
async function persistWorldBossState() {
  try { await WorldBossStateModel.findOneAndUpdate({key:'main_world_boss'}, {currentHp:worldBoss.currentHp,isAlive:worldBoss.isAlive,updatedAt:new Date()}, {upsert:true,new:true}); }
  catch (err) { console.error('[BOSS] Durum kaydedilemedi:', err.message); }
}
mongoose.connection.once('open', async () => {
  try {
    const saved = await WorldBossStateModel.findOne({key:'main_world_boss'});
    if (saved) { worldBoss.currentHp=saved.currentHp; worldBoss.isAlive=saved.isAlive; }
    else await persistWorldBossState();
    io.emit('boss_schedule_update', worldBoss);
    console.log('[BOSS] Dünya boss durumu MongoDB ile eşitlendi.');
  } catch (err) { console.error('[BOSS] Durum yüklenemedi:', err.message); }
});
function scheduleDailyBossSpawn() {
  const next = nextBossSpawnDate();
  worldBoss.nextSpawnAt = next;
  const delay = Math.max(1000, next.getTime() - Date.now());
  setTimeout(() => {
    if (!worldBoss.isAlive) {
      worldBoss.currentHp = worldBoss.maxHp;
      worldBoss.isAlive = true;
      persistWorldBossState();
      io.emit('world_boss_respawn', worldBoss);
    }
    scheduleDailyBossSpawn();
    io.emit('boss_schedule_update', worldBoss);
  }, delay).unref?.();
}
scheduleDailyBossSpawn();

const MAP_SPEED = 0.18; // İstemci süzülme tween oranıyla eşleşen sunucu hareket sınırı
const activePlayers = {};
const bossAttackCooldowns = {};
const BOSS_COOLDOWN_MS = 1500; // 5. Savaş Sistemi Anti-Spam Koruması

// Merkezi Güç Hesaplama Servisi (Tek Tutarlı Veri Kaynağı)
function recalculatePower(player) {
  const basePower = 150 + (player.level - 1) * 50;
  const realmBonus = REALMS.slice(0, player.realmIndex + 1).reduce((acc, r) => acc + r.powerBonus, 0) - 200;
  const buildingBonus = (player.mineLevel - 1) * 40 + (player.furnaceLevel - 1) * 40;
  const retainerBonus = (player.retainers.lin * 30) + (player.retainers.kael * 75) + (player.retainers.veyra * 50);
  
  // Sınıf bazlı pasif çarpanlar (2. Sınıf Yönetimi)
  let classMultiplier = 1.0;
  if (player.className === 'Kılıç Ustası') classMultiplier = 1.05;
  else if (player.className === 'Ruh Büyücüsü') classMultiplier = 1.03;
  else if (player.className === 'Gölge Suikastçısı') classMultiplier = 1.04;
  else if (player.className === 'Kadim Savaşçı') classMultiplier = 1.02;
  else if (player.className === 'İklim / Şifacı Ustası') classMultiplier = 0.99;
  else if (player.className === 'Gök Ejderha Rahibi') classMultiplier = 1.06;

  player.power = Math.max(150, Math.floor((basePower + realmBonus + buildingBonus + retainerBonus) * classMultiplier));
  return player.power;
}
// Seviye Atlama ve XP Hesaplama Motoru
function addPlayerXp(player, amount) {
  if (amount <= 0) return false;
  player.xp = (player.xp || 0) + amount;
  let leveledUp = false;

  while (player.xp >= (player.nextLevelXp || 1000)) {
    player.xp -= (player.nextLevelXp || 1000);
    player.level += 1;
    player.nextLevelXp = Math.floor((player.nextLevelXp || 1000) * 1.35);
    leveledUp = true;

    const milestoneKey = `level_reward_${player.level}`;
    if (!player.claimedMilestones) player.claimedMilestones = [];
    if (!player.claimedMilestones.includes(milestoneKey)) {
      player.claimedMilestones.push(milestoneKey);
      if (player.currencies) {
        player.currencies.essenceCrystals += player.level * 50;
        player.currencies.spiritStones += 10;
      }
      player.essenceCrystals = (player.essenceCrystals || 0) + player.level * 50;
    }
  }

  recalculatePlayerStats(player);
  return leveledUp;
}

// Ekipman Değiştirildiğinde ve Sınıfa Göre İstatistik Güncelleme
function recalculatePlayerStats(player) {
  let baseHp = 500 + (player.level - 1) * 60;
  let baseAttack = 120 + (player.level - 1) * 20;
  let baseDefense = 50 + (player.level - 1) * 10;

  if (player.className === 'Kılıç Ustası') {
    baseAttack *= 1.15;
  } else if (player.className === 'Ruh Büyücüsü') {
    baseHp *= 0.9;
    baseAttack *= 1.25;
  } else if (player.className === 'Gölge Suikastçısı') {
    player.critRate = 15 + player.level;
    baseAttack *= 1.1;
  } else if (player.className === 'Kadim Savaşçı') {
    baseHp *= 1.25;
    baseDefense *= 1.3;
    baseAttack *= 0.95;
  } else if (player.className === 'İklim / Şifacı Ustası') {
    baseHp *= 1.1;
    baseAttack *= 0.95;
  } else if (player.className === 'Gök Ejderha Rahibi') {
    baseHp *= 1.05;
    baseAttack *= 1.15;
  }

  let eqAttackBonus = 0;
  let eqDefenseBonus = 0;

  if (player.equipment && player.equipment.weapon) {
    eqAttackBonus += player.equipment.weapon.attackPower || 0;
  }
  if (player.equipment && player.equipment.armor) {
    eqDefenseBonus += player.equipment.armor.defense || 0;
  }

  const realmIndex = Math.max(0, Math.min(CULTIVATION_REALMS.length - 1, player.cultivationRealmIndex || 0));
  const subStep = Math.max(1, player.cultivationSubStep || 1);
  let realmAttackBonus = 0, realmHpBonus = 0;
  for (let i=0;i<realmIndex;i++) { realmAttackBonus += CULTIVATION_REALMS[i].bonuses.attack * CULTIVATION_REALMS[i].subSteps; realmHpBonus += CULTIVATION_REALMS[i].bonuses.hp * CULTIVATION_REALMS[i].subSteps; }
  realmAttackBonus += CULTIVATION_REALMS[realmIndex].bonuses.attack * Math.max(0,subStep-1);
  realmHpBonus += CULTIVATION_REALMS[realmIndex].bonuses.hp * Math.max(0,subStep-1);
  player.maxHp = Math.floor(baseHp + realmHpBonus);
  player.hp = Math.min(player.hp || player.maxHp, player.maxHp);
  player.attackPower = Math.floor(baseAttack + eqAttackBonus + realmAttackBonus);
  player.defense = Math.floor(baseDefense + eqDefenseBonus);

  if (typeof recalculatePower === 'function') {
    recalculatePower(player);
  }
}
function sanitizePlayerProfile(playerData) {
  // Sürümlendirme ve eksik alan tamamlama (Migration)
  if (!playerData.version) { playerData.version = "1.0.0"; }
  if (playerData.cultivationEnergy === undefined || playerData.cultivationEnergy === null) playerData.cultivationEnergy = 200;
  if (!playerData.cultivationTitle) playerData.cultivationTitle = cultivationTitle(playerData.cultivationRealmIndex || 0, playerData.cultivationSubStep || 1);
  if (!playerData.currentMapId || playerData.currentMapId === 'map_root_lands') playerData.currentMapId = 'map_heng_yue';
  if (!playerData.cultivationRealm || playerData.cultivationRealm === 'Kök Topraklar') playerData.cultivationRealm = CULTIVATION_REALMS[playerData.cultivationRealmIndex || 0]?.name || 'Öz Duyumu';
  if (!playerData.currencies) {
    playerData.currencies = { essenceCrystals: 200, spiritStones: 50, sectTokens: 0 };
  }
  if (!playerData.equipment) {
    playerData.equipment = { weapon: null, armor: null, accessory: null };
  }
  if (!playerData.claimedMilestones) {
    playerData.claimedMilestones = [];
  }
  if (!playerData.unlockedSkills) {
    playerData.unlockedSkills = ["Temel Kılıç Darbesi"];
  }
  return playerData;
}
function calculateSkillDamage(player, skillMultiplier) {
  const baseAttack = player.attackPower || 120;
  const isCrit = Math.random() * 100 <= (player.critRate || 10);
  const critDmgMultiplier = isCrit ? (player.critDamage || 150) / 100 : 1.0;
  
  const finalDamage = Math.floor(baseAttack * skillMultiplier * critDmgMultiplier);
  return { damage: finalDamage, isCrit };
}

io.on('connection', (socket) => {
  socket.on('request_boss_status', () => socket.emit('boss_status', worldBoss));
  // 1. Oyuncu ve Karakter Yönetimi (Oturum & Çift Giriş Koruması)
  socket.on('player_login', async (data) => {
    try {
      const cleanUsername = (data.username || "").trim();
      if (!cleanUsername) return socket.emit('error_message', "Geçerli bir isim girmelisin.");

      for (const [existingSocketId, activeUser] of Object.entries(activePlayers)) {
        if (activeUser.username.toLowerCase() === cleanUsername.toLowerCase() && existingSocketId !== socket.id) {
          io.to(existingSocketId).emit('force_logout', "Hesabına başka bir cihazdan giriş yapıldı.");
          const oldSocket = io.sockets.sockets.get(existingSocketId);
          if (oldSocket) oldSocket.disconnect(true);
          delete activePlayers[existingSocketId];
        }
      }

      let player = await PlayerModel.findOne({ username: cleanUsername });
      if (!player) {
        player = new PlayerModel({
          username: cleanUsername,
          className: data.className || 'Kılıç Ustası',
          level: 1,
          power: 305
        });
sanitizePlayerProfile(player);
        recalculatePower(player);
        await player.save();
      } else {
        if (player.essenceCrystals === undefined) player.essenceCrystals = 200;
        if (player.spiritEnergy === undefined) player.spiritEnergy = 100;
        if (player.guildName === undefined) player.guildName = '';
        if (!player.retainers) player.retainers = { lin: 1, kael: 1, veyra: 1 };

        if (!player.guildName) {
          const foundGuild = await GuildModel.findOne({ members: player.username });
          if (foundGuild) player.guildName = foundGuild.name;
        }
sanitizePlayerProfile(player);
        recalculatePower(player);
        await player.save();
      }

      activePlayers[socket.id] = {
        id: socket.id,
        username: player.username,
        className: player.className,
        level: player.level,
        power: player.power,
        guildName: player.guildName || '',
        x: player.x || 100,
        y: player.y || 100,
        currentMapId: player.currentMapId || 'map_heng_yue',
        lastMoveAt: Date.now()
      };

      if (player.guildName) socket.join(player.guildName);
      socket.join(activePlayers[socket.id].currentMapId);

      socket.emit('login_success', { player, realms: REALMS, worldBoss, quests: questPayload(player) });
      io.emit('update_players', activePlayers);
    } catch (error) {
      socket.emit('error_message', "Giriş yapılırken bir hata oluştu.");
    }
  });

  // 6. Ruh Meskeni ve AFK Hasat Sistemi
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

      const cappedSeconds = Math.min(diffSeconds, 43200);
      const crystalRate = 2 + (player.mineLevel * 2) + (player.retainers.veyra * 1);
      const energyRate = 3 + (player.furnaceLevel * 3) + (player.retainers.lin * 2);

      const gainedCrystals = Math.max(5, Math.floor((cappedSeconds / 60) * crystalRate));
      const gainedEnergy = Math.max(10, Math.floor((cappedSeconds / 60) * energyRate));

      player.essenceCrystals = (player.essenceCrystals || 0) + gainedCrystals;
      player.currencies.essenceCrystals = (player.currencies.essenceCrystals || 0) + gainedCrystals;
      player.spiritEnergy = (player.spiritEnergy || 0) + gainedEnergy;
      player.cultivationEnergy = (player.cultivationEnergy || 0) + gainedEnergy;
      player.lastClaimTime = now;
      advanceQuestEvent(player, 'claim_afk', 1);
      await player.save();
      socket.emit('quests_updated', questPayload(player));

      socket.emit('player_updated', player);
      socket.emit('action_notification', `⏳ Kadim Kalıntı Hasadı: +${gainedCrystals} Öz Kristali, +${gainedEnergy} Ruh Enerjisi!`);
    } catch (err) {
      socket.emit('error_message', "Hasat sırasında hata oluştu.");
    }
  });

  // 6. Ruh Meskeni Bina Geliştirme
  socket.on('upgrade_building', async (buildingType) => {
    const active = activePlayers[socket.id];
    if (!active) return;
    try {
      const player = await PlayerModel.findOne({ username: active.username });
      const currentLv = buildingType === 'mine' ? player.mineLevel : player.furnaceLevel;
      const cost = currentLv * 120;

      if (player.essenceCrystals < cost) {
        return socket.emit('error_message', `Yetersiz Öz Kristali! Gereken: ${cost}`);
      }

      player.essenceCrystals -= cost;
      if (buildingType === 'mine') player.mineLevel += 1;
      else player.furnaceLevel += 1;

      recalculatePower(player);
      await player.save();
      activePlayers[socket.id].power = player.power;

      socket.emit('player_updated', player);
      io.emit('update_players', activePlayers);
      socket.emit('action_notification', `🏯 ${buildingType === 'mine' ? 'Öz Madeni' : 'İksir Ocağı'} Sv.${currentLv + 1} oldu!`);
    } catch (err) {}
  });

  // 2. Sınıf Özellikleri / Yoldaş Eğitimi
  socket.on('upgrade_retainer', async (retainerKey) => {
    const active = activePlayers[socket.id];
    if (!active || !['lin', 'kael', 'veyra'].includes(retainerKey)) return;
    try {
      const player = await PlayerModel.findOne({ username: active.username });
      const currentLv = player.retainers[retainerKey];
      const cost = currentLv * 150;

      if (player.essenceCrystals < cost) {
        return socket.emit('error_message', `Yetersiz Öz Kristali! Gereken: ${cost}`);
      }

      player.essenceCrystals -= cost;
      player.retainers[retainerKey] += 1;
      recalculatePower(player);
      await player.save();
      activePlayers[socket.id].power = player.power;

      socket.emit('player_updated', player);
      io.emit('update_players', activePlayers);
      socket.emit('action_notification', `🤝 Yoldaş seviyesi yükseltildi! Güç: ${player.power}`);
    } catch (err) {}
  });

  // Eski istemci sürümleriyle uyumluluk: iki buton da aynı yetişim motorunu kullanır.
  socket.on('attempt_breakthrough', async () => performCultivationBreakthrough(socket));

  // 5. Savaş Sistemi (PvP Arena Düellosu)
  socket.on('send_pvp_challenge', async (targetId) => {
    const challenger = activePlayers[socket.id];
    const target = activePlayers[targetId];
    if (challenger && target) {
      io.to(targetId).emit('pvp_challenge_received', {
        challengerId: socket.id,
        challengerName: challenger.username,
        challengerPower: challenger.power
      });
      socket.emit('action_notification', `${target.username} adlı oyuncuya düello teklifi gönderildi.`);
    } else {
      socket.emit('error_message', "Rakip çevrimiçi değil.");
    }
  });

  socket.on('accept_pvp_challenge', async (data) => {
    const player1 = activePlayers[data.challengerId];
    const player2 = activePlayers[socket.id];
    if (player1 && player2) {
      let p1Score = player1.power * (1 + Math.random() * 0.3);
      let p2Score = player2.power * (1 + Math.random() * 0.3);
      let winner = p1Score >= p2Score ? player1 : player2;
      let loser = winner === player1 ? player2 : player1;

      const winnerDoc = await PlayerModel.findOneAndUpdate(
        { username: winner.username },
        { $inc: { essenceCrystals: 75, spiritEnergy: 120, level: 1 } },
        { new: true }
      );
      if (winnerDoc) {
        recalculatePower(winnerDoc);
        await winnerDoc.save();
        if (activePlayers[winner.id]) activePlayers[winner.id].power = winnerDoc.power;
        io.to(winner.id).emit('player_updated', winnerDoc);
      }

      const battleResult = {
        winner: winner.username,
        loser: loser.username,
        winnerPower: Math.floor(winner === player1 ? p1Score : p2Score),
        reward: "75 Öz Kristali, 120 Ruh Enerjisi, +1 Seviye"
      };
      io.to(data.challengerId).emit('pvp_battle_ended', battleResult);
      io.to(socket.id).emit('pvp_battle_ended', battleResult);
      io.emit('update_players', activePlayers);
    }
  });

  // 9. Tarikat ve Sosyal Sistemler
  socket.on('create_guild', async (data) => {
    const active = activePlayers[socket.id];
    if (!active) return;
    const gName = (data.guildName || "").trim();
    if (!gName) return socket.emit('error_message', "Tarikat adı boş olamaz.");

    try {
      const player = await PlayerModel.findOne({ username: active.username });
      if (player.guildName) return socket.emit('error_message', "Zaten bir tarikatın üyesisin!");

      const existingGuild = await GuildModel.findOne({ name: gName });
      if (existingGuild) return socket.emit('error_message', "Bu isimde bir tarikat mevcut!");

      const newGuild = new GuildModel({ name: gName, leader: player.username, members: [player.username] });
      await newGuild.save();

      player.guildName = gName;
      await player.save();
      activePlayers[socket.id].guildName = gName;
      socket.join(gName);

      socket.emit('player_updated', player);
      socket.emit('guild_success', { message: `Tarikat kuruldu: ${gName}`, guildName: gName });
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
      activePlayers[socket.id].guildName = gName;
      socket.join(gName);

      socket.emit('player_updated', player);
      socket.emit('guild_success', { message: `${gName} tarikatına katıldın!`, guildName: gName });
    } catch (err) {}
  });

  socket.on('guild_chat_message', (data) => {
    const active = activePlayers[socket.id];
    if (!active) return;
    const targetRoom = active.guildName || data.guildName;
    if (!targetRoom) return socket.emit('error_message', "Önce bir tarikata katılmalısın.");

    socket.join(targetRoom);
    io.to(targetRoom).emit('receive_guild_chat', {
      sender: active.username,
      message: data.message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('join_chat_room', (guildName) => {
    if (guildName) socket.join(guildName);
  });

  // Küresel Sıralama
  socket.on('get_leaderboard', async () => {
    try {
      const topPlayers = await PlayerModel.find().sort({ power: -1 }).limit(10).select('username className level power cultivationRealm');
      socket.emit('leaderboard_data', topPlayers);
    } catch (err) {}
  });

  // 5. Savaş Sistemi (Dünya Bossu & Rate-Limit / Cooldown)
  socket.on('attack_world_boss', async (damageAmount) => {
    const player = activePlayers[socket.id];
    if (!player || !worldBoss.isAlive) return;

    const now = Date.now();
    const lastAttack = bossAttackCooldowns[player.username] || 0;
    if (now - lastAttack < BOSS_COOLDOWN_MS) {
      return socket.emit('boss_cooldown', { message: "Ruh tekniği bekleme süresinde!" });
    }
    bossAttackCooldowns[player.username] = now;

    let actualDamage = Math.min(Number(damageAmount) || player.power, player.power * 2);
    worldBoss.currentHp -= actualDamage;
    if (worldBoss.currentHp <= 0) { worldBoss.currentHp = 0; worldBoss.isAlive = false; }

    const updatedPlayer = await PlayerModel.findOneAndUpdate(
      { username: player.username },
      { $inc: { spiritEnergy: 15, essenceCrystals: 5, 'currencies.essenceCrystals': 5 } },
      { new: true }
    );
    if (updatedPlayer) socket.emit('player_updated', updatedPlayer);

    if (worldBoss.currentHp <= 0) {
      worldBoss.currentHp = 0;
      worldBoss.isAlive = false;

      const bossPlayer = await PlayerModel.findOne({ username: player.username });
      if (bossPlayer) {
        if (!bossPlayer.currencies) bossPlayer.currencies = { essenceCrystals:0, spiritStones:0, sectTokens:0 };
        bossPlayer.currencies.essenceCrystals = (bossPlayer.currencies.essenceCrystals || 0) + 5000;
        bossPlayer.essenceCrystals = (bossPlayer.essenceCrystals || 0) + 5000;
        bossPlayer.spiritEnergy = (bossPlayer.spiritEnergy || 0) + 1000;
        bossPlayer.cultivationEnergy = (bossPlayer.cultivationEnergy || 0) + 1000;
        const bossLoot = rollDropTable(bossPlayer, [{itemId:'mat_inverse_scale',chance:100,min:1,max:2},{itemId:'eq_divine_sword',chance:3},{itemId:'mat_ji_fragment',chance:75,min:1,max:3}]);
        advanceQuestEvent(bossPlayer,'world_boss_kill',1);
        await bossPlayer.save();
        socket.emit('player_updated',bossPlayer); socket.emit('quests_updated',questPayload(bossPlayer));
        socket.emit('divine_loot_drop',{title:'İLAHİ HAZİNE DÜŞTÜ!',items:bossLoot,boss:worldBoss.name});
      }

      io.emit('world_boss_defeated', {
        killer: player.username,
        bossName: worldBoss.name,
        reward: "500 Öz Kristali, 1000 Ruh Enerjisi"
      });
      persistWorldBossState();
      io.emit('boss_schedule_update', worldBoss);
    }

    io.emit('world_boss_update', {
      currentHp: worldBoss.currentHp,
      maxHp: worldBoss.maxHp,
      lastAttacker: player.username,
      damageDealt: actualDamage
    });
  });
// Yeni 9 Aşamalı Yetişim ve Aşama Atlama Servisi
async function performCultivationBreakthrough(socket) {
  const active = activePlayers[socket.id];
  if (!active) return;
  try {
    let player = await PlayerModel.findOne({ username: active.username });
    const currentIndex = player.cultivationRealmIndex || 0;
    const currentRealmData = CULTIVATION_REALMS[currentIndex];
    if (!currentRealmData) return socket.emit('error_message', "Zaten en yüksek aşamadasın!");

    if ((player.cultivationEnergy || 0) < currentRealmData.reqEnergyPerStep) {
      return socket.emit('error_message', `Yetersiz Yetişim Enerjisi! Gereken: ${currentRealmData.reqEnergyPerStep}`);
    }
    if (!player.currencies || player.currencies.essenceCrystals < currentRealmData.breakthroughCost.crystals ||
        player.currencies.spiritStones < currentRealmData.breakthroughCost.spiritStones) {
      return socket.emit('error_message', "Aşama atlamak için gereken Öz Kristali veya Ruh Taşı yetersiz!");
    }

    player.currencies.essenceCrystals -= currentRealmData.breakthroughCost.crystals;
    player.currencies.spiritStones -= currentRealmData.breakthroughCost.spiritStones;
    player.cultivationEnergy -= currentRealmData.reqEnergyPerStep;

    const roll = Math.random() * 100;
    const isSuccess = roll <= currentRealmData.successRate;

    if (isSuccess) {
      player.cultivationSubStep = (player.cultivationSubStep || 1) + 1;
      if (player.cultivationSubStep > currentRealmData.subSteps) {
        player.cultivationSubStep = 1;
        if (currentIndex + 1 < CULTIVATION_REALMS.length) {
          player.cultivationRealmIndex = currentIndex + 1;
          player.cultivationRealm = CULTIVATION_REALMS[player.cultivationRealmIndex].name;
        }
      }

      player.realmIndex = player.cultivationRealmIndex || 0;
      recalculatePlayerStats(player);
      player.hp = player.maxHp;

      player.cultivationTitle = cultivationTitle(player.cultivationRealmIndex || 0, player.cultivationSubStep || 1);
      advanceQuestEvent(player, "breakthrough", 1);
      await player.save();
      socket.emit('quests_updated', questPayload(player));
      socket.emit('breakthrough_result', { success: true, title:player.cultivationTitle, message: `⚡ GÖK GÜRÜLTÜSÜ YARGISI AŞILDI! ${player.cultivationRealm} · ${player.cultivationSubStep}/${CULTIVATION_REALMS[player.cultivationRealmIndex].subSteps}` });
    } else {
      player.cultivationEnergy += Math.floor(currentRealmData.reqEnergyPerStep * 0.2);
      await player.save();
      socket.emit('breakthrough_result', { success: false, message: `⚡ GÖK GÜRÜLTÜSÜ YARGISI BAŞARISIZ! Enerjinin bir kısmı geri kazanıldı; yeniden hazırlan.` });
    }

    activePlayers[socket.id].power = player.power; activePlayers[socket.id].level = player.level;
    socket.emit('player_updated', player); io.emit('update_players', activePlayers);
  } catch (err) {
    socket.emit('error_message', "Yetişim işleminde bir hata oluştu.");
  }
}
socket.on('attempt_cultivation_breakthrough', async () => performCultivationBreakthrough(socket));
socket.on('travel_to_region', async (mapId) => {
  const active=activePlayers[socket.id]; if(!active) return;
  try {
    const destination=MAP_DESTINATIONS.find(m=>m.id===String(mapId));
    if(!destination) return socket.emit('error_message','Bilinmeyen bölge.');
    const player=await PlayerModel.findOne({username:active.username}); if(!player) return;
    if((player.cultivationRealmIndex||0)<destination.reqRealm) return socket.emit('error_message',`Bu bölgeye gitmek için ${CULTIVATION_REALMS[destination.reqRealm].name} gerekiyor.`);
    const oldMap=active.currentMapId || 'map_heng_yue';
    player.currentMapId=destination.id; await player.save(); active.currentMapId=destination.id;
    socket.leave(oldMap); socket.join(destination.id);
    socket.emit('region_changed',{id:destination.id,mapId:destination.id,name:destination.name,theme:destination.theme});
    socket.emit('player_updated',player);
  } catch(e){socket.emit('error_message','Bölgeye geçiş başarısız.');}
});

socket.on('gather_spirit_herb', async () => {
  const active = activePlayers[socket.id]; if (!active) return;
  try {
    const player = await PlayerModel.findOne({username:active.username}); if (!player) return;
    const now=Date.now(); const last=playerSkillCooldowns[`${player.username}_gather`]||0;
    if(now-last<2500) return socket.emit('error_message','Bitki toplamak için biraz beklemelisin.');
    playerSkillCooldowns[`${player.username}_gather`]=now;
    if(!addInventoryItem(player,'mat_spirit_herb',1)) return socket.emit('error_message','Çanta dolu.');
    advanceQuestEvent(player,'collect_herb',1); await player.save();
    socket.emit('player_updated',player); socket.emit('quests_updated',questPayload(player));
    socket.emit('action_notification','🌿 1 Ruh Otu topladın.');
  } catch(e){ socket.emit('error_message','Ruh Otu toplanamadı.'); }
});

socket.on('upgrade_abode_building', async (buildingId) => {
  const active = activePlayers[socket.id];
  if (!active) return;
  try {
    let player = await PlayerModel.findOne({ username: active.username });
    const buildingCfg = ABODE_BUILDINGS[buildingId];
    if (!buildingCfg) return socket.emit('error_message', "Geçersiz bina.");

    if (!player.abodeBuildings) player.abodeBuildings = {};
    const currentData = player.abodeBuildings[buildingId] || { level: 0, upgradeFinishTime: null };

    // Kilit kontrolü
    if (player.level < buildingCfg.unlockReq.level || (player.cultivationRealmIndex || player.realmIndex || 0) < buildingCfg.unlockReq.realmIndex) {
      return socket.emit('error_message', `Bu binayı açmak için Seviye ${buildingCfg.unlockReq.level} ve gerekli Âlem şartı karşılanmalı!`);
    }

    if (currentData.level >= buildingCfg.maxLevel) {
      return socket.emit('error_message', "Bu bina maksimum seviyeye ulaştı!");
    }

    const nextLvl = currentData.level + 1;
    const cost = buildingCfg.getBaseCost(nextLvl);

    if (!player.currencies || player.currencies.essenceCrystals < cost.crystals || player.currencies.spiritStones < cost.stones) {
      return socket.emit('error_message', `Yetersiz kaynak! Gereken: ${cost.crystals} Öz Kristali, ${cost.stones} Ruh Taşı.`);
    }

    // Kaynakları düş
    player.currencies.essenceCrystals -= cost.crystals;
    player.currencies.spiritStones -= cost.stones;

    // Gerçek Zamanlı Geliştirme Süresi
    const buildSeconds = nextLvl * 30;
    const finishTime = new Date(Date.now() + buildSeconds * 1000);

    player.abodeBuildings[buildingId] = {
      level: nextLvl,
      upgradeFinishTime: finishTime
    };
    player.markModified('abodeBuildings');

    await player.save();
    socket.emit('player_updated', player);
    socket.emit('action_notification', `🏗️ ${buildingCfg.name} geliştirilmeye başlandı (Süre: ${buildSeconds} sn).`);
  } catch (err) {
    socket.emit('error_message', "Bina geliştirilirken bir hata oluştu.");
  }
});
const playerSkillCooldowns = {}; // { username_skillId: timestamp }
function getPassiveMultiplier(player) {
  const libraryLevel = player.abodeBuildings?.ancientLibrary?.level || 0;
  const lin = player.retainers?.lin || 0, kael = player.retainers?.kael || 0, veyra = player.retainers?.veyra || 0;
  return 1 + Math.min(0.18, libraryLevel * 0.012 + kael * 0.004 + veyra * 0.003 + lin * 0.002);
}


socket.on('use_active_skill', async (skillId) => {
  const active = activePlayers[socket.id];
  if (!active) return;
  try {
    let player = await PlayerModel.findOne({ username: active.username });
    const skillsList = CLASS_SKILLS[player.className] || CLASS_SKILLS["Kılıç Ustası"];
    const skill = skillsList.find(s => s.id === skillId);

    if (!skill) return socket.emit('error_message', "Böyle bir yetenek bulunamadı.");
    const currentRealmIdx = player.cultivationRealmIndex || player.realmIndex || 0;
    if (currentRealmIdx < skill.reqRealm) {
      return socket.emit('error_message', `Bu yeteneği kullanmak için daha yüksek bir Âlemde olmalısın!`);
    }

    if ((player.mana || 0) < skill.manaCost) {
      return socket.emit('error_message', `Yetersiz Mana! Gereken: ${skill.manaCost}`);
    }

    // Cooldown Kontrolü
    const cdKey = `${player.username}_${skill.id}`;
    const now = Date.now();
    const lastUsed = playerSkillCooldowns[cdKey] || 0;
    if (now - lastUsed < skill.cooldown * 1000) {
      const remaining = ((skill.cooldown * 1000 - (now - lastUsed)) / 1000).toFixed(1);
      return socket.emit('error_message', `Yetenek bekleme süresinde! (${remaining} sn)`);
    }

    playerSkillCooldowns[cdKey] = now;
    player.mana -= skill.manaCost;

    // Hasar Hesapla ve Dünya Bossuna Uygula
    const passiveMult = getPassiveMultiplier(player);
    const combatRes = calculateSkillDamage(player, skill.mult * passiveMult);
    if (worldBoss && worldBoss.isAlive) {
      worldBoss.currentHp = Math.max(0, worldBoss.currentHp - combatRes.damage);
      io.emit('world_boss_update', {
        currentHp: worldBoss.currentHp,
        maxHp: worldBoss.maxHp,
        lastAttacker: player.username,
        damageDealt: combatRes.damage
      });
      if (worldBoss.currentHp <= 0) {
        worldBoss.currentHp=0; worldBoss.isAlive=false;
        if(!player.currencies) player.currencies={essenceCrystals:0,spiritStones:0,sectTokens:0};
        player.currencies.essenceCrystals=(player.currencies.essenceCrystals||0)+5000;
        player.essenceCrystals=(player.essenceCrystals||0)+5000;
        player.spiritEnergy=(player.spiritEnergy||0)+1000;
        player.cultivationEnergy=(player.cultivationEnergy||0)+1000;
        const loot=rollDropTable(player,[{itemId:'mat_inverse_scale',chance:100,min:1,max:2},{itemId:'eq_divine_sword',chance:3},{itemId:'mat_ji_fragment',chance:75,min:1,max:3}]);
        advanceQuestEvent(player,'world_boss_kill',1);
        socket.emit('quests_updated',questPayload(player));
        socket.emit('divine_loot_drop',{title:'İLAHİ HAZİNE DÜŞTÜ!',items:loot,boss:worldBoss.name});
        io.emit('world_boss_defeated',{killer:player.username,bossName:worldBoss.name,reward:'5000 Öz Kristali, 1000 Yetişim Enerjisi'});
        persistWorldBossState();
        io.emit('boss_schedule_update', worldBoss);
      }
    }

    await player.save();
    socket.emit('player_updated', player);
    socket.emit('action_notification', `✨ [${skill.name}] kullanıldı! ${combatRes.isCrit ? '💥 KRİTİK!' : ''} Hasar: ${combatRes.damage}`);
  } catch (err) {
    socket.emit('error_message', "Yetenek kullanılırken hata oluştu.");
  }
});

// Eşya Kuşanma ve Stat Güncelleme
socket.on('use_consumable', async (itemUUID) => {
  const active=activePlayers[socket.id]; if(!active) return;
  try {
    const player=await PlayerModel.findOne({username:active.username}); if(!player) return;
    const idx=(player.inventory||[]).findIndex(i=>i.itemUUID===itemUUID); if(idx<0) return socket.emit('error_message','Eşya çantada bulunamadı.');
    const item=player.inventory[idx], cfg=ITEM_DATABASE[item.itemId];
    if(!cfg || cfg.type!=='consumable' || !cfg.effect) return socket.emit('error_message','Bu eşya kullanılamaz.');
    if(cfg.effect.type==='heal') { if((player.hp||0)>=player.maxHp) return socket.emit('error_message','Canın zaten dolu.'); player.hp=Math.min(player.maxHp,(player.hp||0)+cfg.effect.value); }
    else if(cfg.effect.type==='energy') player.cultivationEnergy=(player.cultivationEnergy||0)+cfg.effect.value;
    else return socket.emit('error_message','Bilinmeyen eşya etkisi.');
    item.count=(item.count||1)-1; if(item.count<=0) player.inventory.splice(idx,1);
    player.markModified('inventory'); await player.save(); socket.emit('player_updated',player);
    socket.emit('action_notification',`${cfg.name} kullanıldı.`);
  } catch(e){socket.emit('error_message','Eşya kullanılamadı.');}
});

socket.on('equip_item', async (itemUUID) => {
  const active = activePlayers[socket.id];
  if (!active) return;
  try {
    let player = await PlayerModel.findOne({ username: active.username });
    if (!player.inventory) player.inventory = [];
    const itemIndex = player.inventory.findIndex(i => i.itemUUID === itemUUID);
    if (itemIndex === -1) return socket.emit('error_message', "Eşya envanterinizde bulunamadı.");

    const invItem = player.inventory[itemIndex];
    const itemConfig = ITEM_DATABASE[invItem.itemId];
    if (!itemConfig || itemConfig.type !== 'equipment') {
      return socket.emit('error_message', "Bu eşya kuşanılabilir bir ekipman değil.");
    }

    if (!player.equipment) player.equipment = {};
    const slot = itemConfig.slot;
    const currentEquipped = player.equipment[slot];

    // Envanter ile kuşanılan eşyayı yer değiştir
    player.inventory.splice(itemIndex, 1);
    if (currentEquipped) {
      player.inventory.push(currentEquipped);
    }

    player.equipment[slot] = invItem;
    player.markModified('equipment');
    recalculatePlayerStats(player);

    await player.save();
    socket.emit('player_updated', player);
    socket.emit('action_notification', `🛡️ ${itemConfig.name} kuşanıldı!`);
  } catch (err) {
    socket.emit('error_message', "Ekipman kuşanılırken hata oluştu.");
  }
});

// Eşya Geliştirme (+ Basma Sistemi)
socket.on('enhance_equipment', async (data) => {
  const active = activePlayers[socket.id];
  if (!active) return;
  try {
    let player = await PlayerModel.findOne({ username: active.username });
    let targetItem = null;

    if (data.type === 'equipped') {
      targetItem = player.equipment ? player.equipment[data.targetId] : null;
    } else {
      targetItem = player.inventory ? player.inventory.find(i => i.itemUUID === data.targetId) : null;
    }

    if (!targetItem) return socket.emit('error_message', "Geliştirilecek eşya bulunamadı.");
    if ((targetItem.enhancementLevel || 0) >= 20) {
      return socket.emit('error_message', "Bu eşya maksimum geliştirme seviyesine (+20) ulaştı!");
    }

    const nextLvl = (targetItem.enhancementLevel || 0) + 1;
    const costCrystals = nextLvl * 100;

    if (!player.currencies || player.currencies.essenceCrystals < costCrystals) {
      return socket.emit('error_message', `Yetersiz Öz Kristali! Gereken: ${costCrystals}`);
    }

    player.currencies.essenceCrystals -= costCrystals;

    // Başarı İhtimali (Seviye başına %5 düşer, min %20)
    const successRate = Math.max(20, 100 - ((targetItem.enhancementLevel || 0) * 5));
    const roll = Math.random() * 100;

    if (roll <= successRate) {
      targetItem.enhancementLevel = nextLvl;
      player.markModified('equipment');
      player.markModified('inventory');
      recalculatePlayerStats(player);
      await player.save();
      socket.emit('player_updated', player);
      socket.emit('action_notification', `✨ Başarılı! Eşya +${targetItem.enhancementLevel} seviyesine yükseltildi!`);
    } else {
      await player.save();
      socket.emit('player_updated', player);
      socket.emit('action_notification', `⚠️ Geliştirme başarısız oldu! Özler tüketildi ancak eşya zarar görmedi.`);
    }
  } catch (err) {
    socket.emit('error_message', "Geliştirme sırasında hata oluştu.");
  }
});
const CRAFTING_RECIPES = [
  { resultId: "eq_jade_blade", building: "forge", reqLevel: 2, cost: { crystals: 500, stones: 100, mat_dragon_scale: 2 } },
  { resultId: "pills_qi_gathering", building: "alchemyRoom", reqLevel: 1, cost: { crystals: 100, mat_spirit_herb: 5 } }
];

socket.on('craft_item', async (recipeId) => {
  const active = activePlayers[socket.id];
  if (!active) return;
  try {
    let player = await PlayerModel.findOne({ username: active.username });
    const recipe = CRAFTING_RECIPES.find(r => r.resultId === recipeId);
    if (!recipe) return socket.emit('error_message', "Böyle bir üretim reçetesi bulunamadı.");

    if (!player.inventory) player.inventory = [];
    if (player.inventory.length >= (player.inventoryCapacity || 40)) {
      return socket.emit('error_message', "Envanter dolu! Üretim yapılamaz.");
    }

    const buildings = player.abodeBuildings || {};
    const buildingData = buildings[recipe.building] || { level: 0 };
    if (buildingData.level < recipe.reqLevel) {
      return socket.emit('error_message', `Bu eşyayı üretmek için ${recipe.building} binasını Seviye ${recipe.reqLevel} yapmalısın!`);
    }

    if (!player.currencies || player.currencies.essenceCrystals < (recipe.cost.crystals || 0)) {
      return socket.emit('error_message', "Yetersiz Öz Kristali!");
    }

    player.currencies.essenceCrystals -= (recipe.cost.crystals || 0);

    const newItem = {
      itemUUID: 'item_' + Date.now() + Math.random().toString(36).substring(2, 7),
      itemId: recipe.resultId,
      count: 1,
      enhancementLevel: 0,
      rarity: ITEM_DATABASE[recipe.resultId].rarity || 'COMMON'
    };

    player.inventory.push(newItem);
    await player.save();

    socket.emit('player_updated', player);
    socket.emit('action_notification', `🔨 Başarıyla üretildi: ${ITEM_DATABASE[recipe.resultId].name}!`);
  } catch (err) {
    socket.emit('error_message', "Üretim sırasında hata oluştu.");
  }
});
// Gerçek Zamanlı Sefer ve Savaş Motoru
const activeBattles = {};

const MAP_DESTINATIONS = [
  {id:'map_heng_yue',name:'Heng Yue Tarikatı',reqRealm:0,theme:'heng_yue'},
  {id:'map_trial_valley',name:'Deneme Vadisi',reqRealm:0,theme:'trial_valley'},
  {id:'map_ji_ruins',name:'Merdiven Taşı Kalıntısı',reqRealm:1,theme:'ji_ruins'},
  {id:'map_suzaku',name:'Suzaku Ülkesi',reqRealm:2,theme:'suzaku'}
];

const BATTLE_STAGES = [
  { id:1, name:"Heng Yue Dış Avlusu", region:"Heng Yue Tarikatı", enemyName:"Yabani Kurt Muhafızı", hp:1200, attack:45, reqRealm:0, reward:{crystals:50,energy:100,xp:200}, drops:[{itemId:"mat_spirit_herb",chance:45,min:1,max:2},{itemId:"mat_iron_fragment",chance:25},{itemId:"mat_healing_pill",chance:8}] },
  { id:2, name:"Deneme Vadisi", region:"Deneme Vadisi", enemyName:"Sınav Muhafızı", hp:3500, attack:90, reqRealm:0, reward:{crystals:150,energy:300,xp:600}, drops:[{itemId:"mat_spirit_herb",chance:35},{itemId:"mat_iron_fragment",chance:40},{itemId:"mat_healing_pill",chance:18}] },
  { id:3, name:"Merdiven Taşı Kalıntısı", region:"Ji Mirası", enemyName:"Ji Mührü Muhafızı", hp:15000, attack:180, reqRealm:1, isBoss:true, reward:{crystals:1000,energy:2500,xp:5000}, drops:[{itemId:"mat_ji_fragment",chance:35},{itemId:"mat_armor_blueprint",chance:18},{itemId:"eq_jade_blade",chance:4}] },
  { id:4, name:"Suzaku Kızıl Toprakları", region:"Suzaku Ülkesi", enemyName:"Teng Hanedanı İnfazcısı", hp:38000, attack:340, reqRealm:2, isBoss:true, reward:{crystals:2400,energy:4200,xp:8500}, drops:[{itemId:"mat_ji_fragment",chance:45},{itemId:"mat_armor_blueprint",chance:28},{itemId:"eq_heaven_armor",chance:5}] },
  { id:5, name:"Kadim Gök Ejderhası İni", region:"Dokuz Ruh Âlemi", enemyName:"Kadim Gök Ejderhası", hp:120000, attack:750, reqRealm:4, isBoss:true, reward:{crystals:8000,energy:12000,xp:20000}, drops:[{itemId:"mat_inverse_scale",chance:22,min:1,max:2},{itemId:"eq_divine_sword",chance:1},{itemId:"eq_heaven_armor",chance:12},{itemId:"mat_ji_fragment",chance:55,min:1,max:3}] }
];


socket.on('start_battle_stage', async (stageId) => {
  const active = activePlayers[socket.id];
  if (!active) return;
  try {
    const player = await PlayerModel.findOne({ username: active.username });
    const stage = BATTLE_STAGES.find(s => s.id === Number(stageId));
    if (!stage) return socket.emit('error_message', "Böyle bir sefer bölgesi bulunamadı.");
    if ((player.cultivationRealmIndex || 0) < (stage.reqRealm || 0)) return socket.emit('error_message', `Bu sefer için ${CULTIVATION_REALMS[stage.reqRealm].name} gerekiyor.`);

    activeBattles[socket.id] = {
      stageId: stage.id,
      stageName: stage.name,
      enemyName: stage.enemyName,
      enemyHp: stage.hp,
      enemyMaxHp: stage.hp,
      enemyAttack: stage.attack,
      isBoss: stage.isBoss || false,
      bossPhase: 1,
      playerHp: player.hp || player.maxHp || 500,
      playerMaxHp: player.maxHp || 500,
      playerMana: player.mana || player.maxMana || 200,
      playerMaxMana: player.maxMana || 200,
      shield: 0,
      statusEffects: [],
      isActive: true
    };

    socket.emit('battle_started', activeBattles[socket.id]);
  } catch (err) {
    socket.emit('error_message', "Savaşa girilirken hata oluştu.");
  }
});

socket.on('battle_use_skill', async (skillId) => {
  const battle = activeBattles[socket.id];
  const active = activePlayers[socket.id];
  if (!battle || !battle.isActive || !active) return;

  try {
    let player = await PlayerModel.findOne({ username: active.username });
    const skillsList = CLASS_SKILLS[player.className] || CLASS_SKILLS["Kılıç Ustası"];
    const skill = skillsList.find(s => s.id === skillId);

    if (!skill) return socket.emit('error_message', "Yetenek bulunamadı.");
    if ((player.cultivationRealmIndex || 0) < skill.reqRealm) return socket.emit('error_message', 'Bu teknik için yeterli yetişim aşamasında değilsin.');
    if (battle.playerMana < skill.manaCost) return socket.emit('error_message', "Yetersiz Mana!");
    const cdKey = `${player.username}_${skill.id}`; const now = Date.now();
    const lastUsed = playerSkillCooldowns[cdKey] || 0;
    if (now - lastUsed < skill.cooldown * 1000) return socket.emit('error_message', `Teknik beklemede: ${((skill.cooldown*1000-(now-lastUsed))/1000).toFixed(1)} sn`);
    playerSkillCooldowns[cdKey] = now;
    battle.playerMana -= skill.manaCost;
    let dealtDamage = Math.floor((player.attackPower || 120) * skill.mult * getPassiveMultiplier(player));

    let battleLogMsg = `⚡ ${skill.name} kullanıldı! ${dealtDamage} hasar verildi.`;
    if (skill.name.includes('Yaşam') || skill.name.includes('Ölümsüzlük') || skill.name.includes('Şifa')) {
      const healAmt = Math.floor(battle.playerMaxHp * 0.25);
      battle.playerHp = Math.min(battle.playerMaxHp, battle.playerHp + healAmt);
      battleLogMsg = `✨ ${skill.name} ile ${healAmt} Can İyileştirildi!`;
    } else if (skill.name.includes('Kalkan') || skill.name.includes('Pul') || skill.name.includes('Zırh') || skill.name.includes('Beden')) {
      battle.shield += 150;
      battleLogMsg = `🛡️ ${skill.name} ile 150 Kalkan Kazanıldı!`;
    }

    battle.lastLog = battleLogMsg;
    battle.enemyHp -= dealtDamage;

    if (battle.isBoss && battle.enemyHp <= battle.enemyMaxHp * 0.5 && battle.bossPhase === 1) {
      battle.bossPhase = 2;
      battle.enemyAttack = Math.floor(battle.enemyAttack * 1.4);
      io.to(socket.id).emit('boss_phase_shift', { phase: 2, message: "⚠️ DİKKAT! Kadim Gök Ejderhası Öfke Fazına Girdi! Saldırı Gücü Arttı!" });
    }

    if (battle.enemyHp <= 0) {
      battle.enemyHp = 0;
      battle.isActive = false;

      const stage = BATTLE_STAGES.find(s => s.id === battle.stageId);
      if (!player.currencies) player.currencies = { essenceCrystals: 200, spiritStones: 50, sectTokens: 0 };
      player.mana = battle.playerMana;
      player.hp = Math.max(1, battle.playerHp);
      player.currencies.essenceCrystals += stage.reward.crystals;
      player.essenceCrystals = (player.essenceCrystals || 0) + stage.reward.crystals;
      player.spiritEnergy = (player.spiritEnergy || 0) + stage.reward.energy;
      player.cultivationEnergy = (player.cultivationEnergy || 0) + stage.reward.energy;
      addPlayerXp(player, stage.reward.xp);
      advanceQuestEvent(player, 'battle_win', 1);
      advanceQuestEvent(player, `stage_${stage.id}_win`, 1);
      const loot = rollDropTable(player, stage.drops || []);
      await player.save();
      socket.emit('quests_updated', questPayload(player));
      socket.emit('player_updated', player);
      if (loot.length) socket.emit('divine_loot_drop', { title:'Hazine Düştü!', items:loot, boss:stage.enemyName });
      socket.emit('battle_ended', { success: true, reward: stage.reward, loot, message: `Zafer! ${stage.enemyName} alt edildi.` });
      delete activeBattles[socket.id];
      return;
    }

    const rawIncoming = Math.max(1, battle.enemyAttack - (player.defense || 0));
    const absorbed = Math.min(battle.shield || 0, rawIncoming);
    battle.shield = Math.max(0, (battle.shield || 0) - absorbed);
    const incoming = rawIncoming - absorbed;
    battle.playerHp = Math.max(0, battle.playerHp - incoming);
    battle.lastLog += ` · Düşman ${incoming} hasar verdi.`;
    if (battle.playerHp <= 0) {
      battle.isActive = false;
      player.hp = 1; player.mana = battle.playerMana;
      await player.save(); socket.emit('player_updated',player);
      socket.emit('battle_ended',{success:false,message:'Yetişimci yere düştü. Ruh Meskeninde toparlanıp yeniden dene.'});
      delete activeBattles[socket.id]; return;
    }
    player.mana = battle.playerMana;
    socket.emit('battle_tick_update', battle);
  } catch (err) { console.error('[BATTLE_SKILL]',err); }
});
// Görev Ödülü Alma Servisi — tamamlanma ve tekrar talep sunucuda doğrulanır.
socket.on('claim_quest_reward', async (questId) => {
  const active = activePlayers[socket.id];
  if (!active) return;
  try {
    const player = await PlayerModel.findOne({ username: active.username });
    if (!player) return;
    const quest = QUEST_DATABASE.find(q => q.id === questId);
    if (!quest) return socket.emit('error_message', "Görev bulunamadı.");
    if (!player.completedQuests) player.completedQuests = [];
    if (!player.activeQuestProgress) player.activeQuestProgress = {};
    const alreadyClaimed = player.completedQuests.includes(questId) || (player.questProgress?.completedQuests || []).includes(questId);
    if (alreadyClaimed) return socket.emit('error_message', "Bu görevin ödülü daha önce alındı!");
    if (quest.prerequisite && !player.completedQuests.includes(quest.prerequisite)) return socket.emit('error_message','Önce hikâyedeki önceki görevi tamamlamalısın.');
    if (getQuestCount(player, questId) < quest.targetCount) return socket.emit('error_message', "Görev henüz tamamlanmadı.");

    player.completedQuests.push(questId);
    if (!player.currencies) player.currencies = { essenceCrystals: 200, spiritStones: 50, sectTokens: 0 };
    player.currencies.essenceCrystals = (player.currencies.essenceCrystals || 0) + quest.reward.crystals;
    player.essenceCrystals = (player.essenceCrystals || 0) + quest.reward.crystals;
    player.spiritEnergy = (player.spiritEnergy || 0) + quest.reward.energy;
    player.cultivationEnergy = (player.cultivationEnergy || 0) + quest.reward.energy;
    if (quest.reward.item) addInventoryItem(player, quest.reward.item, 1);
    addPlayerXp(player, quest.reward.xp);
    await player.save();
    socket.emit('player_updated', player);
    socket.emit('quests_updated', questPayload(player));
    socket.emit('action_notification', `Görev tamamlandı: ${quest.title}. Ödüller alındı.`);
  } catch (err) {
    console.error('claim_quest_reward:', err);
    socket.emit('error_message', "Görev ödülü alınırken hata oluştu.");
  }
});


  
  // Oyuncu Harita Hareketi ve Konum Senkronizasyonu
  socket.on('player_move', async (data) => {
    const active = activePlayers[socket.id];
    if (!active) return;
    try {
      const newX = Math.max(0, Math.min(5000, Number(data?.x) || 0));
      const newY = Math.max(0, Math.min(3000, Number(data?.y) || 0));
      const now = Date.now();
      const previous = active.lastMoveAt || now - 250;
      if (!Number.isFinite(newX) || !Number.isFinite(newY)) return socket.emit('error_message','Geçersiz hareket hedefi.');
      if (now - previous < 80) return;
      active.x = newX; active.y = newY; active.lastMoveAt = now;
      await PlayerModel.updateOne({ username: active.username }, { x: newX, y: newY });
      socket.to(active.currentMapId || 'map_heng_yue').emit('player_moved', { id:socket.id, username:active.username, x:newX, y:newY, isFlying:true, speed:MAP_SPEED, mapId:active.currentMapId || 'map_heng_yue' });
    } catch (err) {}
  });

  socket.on('disconnect', () => {
    if (activePlayers[socket.id]) {
      delete activePlayers[socket.id];
      io.emit('update_players', activePlayers);
    }
  });
});

const PORT = process.env.PORT || 3000;
databaseReady.then(() => {
  server.listen(PORT, () => console.log(`[SUNUCU AKTİF] Arken Dünyası ${PORT} portunda çalışıyor.`));
}).catch(() => { /* Bağlantı hatası yukarıda raporlandı; veritabanı olmadan oyun başlatılmaz. */ });