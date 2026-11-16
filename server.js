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

mongoose.connect(MONGO_URI)
  .then(() => console.log("[VERİTABANI] MongoDB bulut sunucusuna başarıyla bağlandı!"))
  .catch(err => console.error("[HATA] Veritabanı bağlantı hatası:", err));

// YETİŞİM AŞAMALARI (DOKUZ ALEMİN MİRASI)
const REALMS = [
  { name: "Kök Topraklar", reqEnergy: 500, powerBonus: 200 },
  { name: "Öz Uyandırma", reqEnergy: 1500, powerBonus: 500 },
  { name: "Temel Mührü", reqEnergy: 4000, powerBonus: 1200 },
  { name: "Çekirdek Yoğunlaşması", reqEnergy: 10000, powerBonus: 3000 },
  { name: "Ruh Filizlenmesi", reqEnergy: 25000, powerBonus: 7500 },
  { name: "Âlem Kıran", reqEnergy: 60000, powerBonus: 20000 },
  { name: "Göksel Hükümdar", reqEnergy: 150000, powerBonus: 50000 }
];

const playerSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  className: { type: String, default: 'Kılıç Ustası' },
  level: { type: Number, default: 1 },
  power: { type: Number, default: 150 },
  cultivationRealm: { type: String, default: 'Kök Topraklar' },
  realmIndex: { type: Number, default: 0 },
  // Yeni Kaynak ve Yönetim Alanları
  essenceCrystals: { type: Number, default: 200 }, // Öz Kristali (Para/Yükseltme birimi)
  spiritEnergy: { type: Number, default: 100 },    // Ruh Enerjisi (Aşama atlama için)
  mineLevel: { type: Number, default: 1 },         // Öz Madeni seviyesi
  furnaceLevel: { type: Number, default: 1 },      // İksir Ocağı seviyesi
  retainers: {
    lin: { type: Number, default: 1 },   // Simyacı Lin (Ruh Enerjisi üretimi)
    kael: { type: Number, default: 1 },  // Kılıç Ustası Kael (Savaş Gücü)
    veyra: { type: Number, default: 1 }  // Gölge Rahibesi Veyra (Kritik & Kristal)
  },
  lastClaimTime: { type: Date, default: Date.now },
  x: { type: Number, default: 100 },
  y: { type: Number, default: 100 },
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
  isAlive: true
};

const activePlayers = {};

// Toplam Güç Hesaplama Yardımcı Fonksiyonu
function recalculatePower(player) {
  const basePower = 150 + (player.level - 1) * 50;
  const realmBonus = REALMS.slice(0, player.realmIndex + 1).reduce((acc, r) => acc + r.powerBonus, 0) - 200;
  const buildingBonus = (player.mineLevel - 1) * 40 + (player.furnaceLevel - 1) * 40;
  const retainerBonus = (player.retainers.lin * 30) + (player.retainers.kael * 75) + (player.retainers.veyra * 50);
  player.power = Math.max(150, basePower + realmBonus + buildingBonus + retainerBonus);
  return player.power;
}

io.on('connection', (socket) => {
  // 1. GİRİŞ & KAYIT
  socket.on('player_login', async (data) => {
    try {
      let player = await PlayerModel.findOne({ username: data.username });
      if (!player) {
        player = new PlayerModel({
          username: data.username,
          className: data.className || 'Kılıç Ustası',
          level: 1,
          power: 305
        });
        recalculatePower(player);
        await player.save();
      } else {
        // Eski kayıtlarda eksik alan varsa varsayılanları tamamla
        if (player.essenceCrystals === undefined) player.essenceCrystals = 200;
        if (player.spiritEnergy === undefined) player.spiritEnergy = 100;
        if (!player.retainers) player.retainers = { lin: 1, kael: 1, veyra: 1 };
        recalculatePower(player);
        await player.save();
      }

      activePlayers[socket.id] = {
        id: socket.id,
        username: player.username,
        className: player.className,
        level: player.level,
        power: player.power
      };

      socket.emit('login_success', { player, realms: REALMS, worldBoss });
      io.emit('update_players', activePlayers);
    } catch (error) {
      socket.emit('error_message', "Giriş yapılırken bir hata oluştu.");
    }
  });

  // 2. AFK / KADİM ÖZ KALINTISI HASADI (TASKBAR HERO MEKANİĞİ)
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

      // Maksimum 12 saat (43200 sn) AFK birikimi
      const cappedSeconds = Math.min(diffSeconds, 43200);
      const crystalRate = 2 + (player.mineLevel * 2) + (player.retainers.veyra * 1);
      const energyRate = 3 + (player.furnaceLevel * 3) + (player.retainers.lin * 2);

      const gainedCrystals = Math.max(5, Math.floor((cappedSeconds / 60) * crystalRate));
      const gainedEnergy = Math.max(10, Math.floor((cappedSeconds / 60) * energyRate));

      player.essenceCrystals += gainedCrystals;
      player.spiritEnergy += gainedEnergy;
      player.lastClaimTime = now;
      await player.save();

      socket.emit('player_updated', player);
      socket.emit('action_notification', `⏳ Kadim Kalıntı Hasadı (${Math.floor(cappedSeconds/60)} dk): +${gainedCrystals} Öz Kristali, +${gainedEnergy} Ruh Enerjisi!`);
    } catch (err) {
      socket.emit('error_message', "Hasat sırasında hata oluştu.");
    }
  });

  // 3. KİŞİSEL RUH MESKENİ BİNA YÜKSELTME (GAME OF SULTANS MEKANİĞİ)
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
      socket.emit('action_notification', `🏯 ${buildingType === 'mine' ? 'Öz Madeni' : 'İksir Ocağı'} Sv.${currentLv + 1} oldu! Güç: ${player.power}`);
    } catch (err) {}
  });

  // 4. YOLDAŞ / MİRAS MUHAFIZI GELİŞTİRME
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

      const names = { lin: "Simyacı Lin", kael: "Kılıç Ustası Kael", veyra: "Gölge Rahibesi Veyra" };
      socket.emit('player_updated', player);
      io.emit('update_players', activePlayers);
      socket.emit('action_notification', `🤝 ${names[retainerKey]} Sv.${currentLv + 1} seviyesine ulaştı!`);
    } catch (err) {}
  });

  // 5. YETİŞİM AŞAMASI ATLAMA (BREAKTHROUGH / GÖK GÜRÜLTÜSÜ YARGISI)
  socket.on('attempt_breakthrough', async () => {
    const active = activePlayers[socket.id];
    if (!active) return;
    try {
      const player = await PlayerModel.findOne({ username: active.username });
      const nextIndex = player.realmIndex + 1;

      if (nextIndex >= REALMS.length) {
        return socket.emit('error_message', "Zaten Dokuz Alemin zirvesindesin!");
      }

      const targetRealm = REALMS[nextIndex];
      if (player.spiritEnergy < targetRealm.reqEnergy) {
        return socket.emit('error_message', `Yetersiz Ruh Enerjisi! ${targetRealm.name} için ${targetRealm.reqEnergy} Ruh Enerjisi gerekiyor.`);
      }

      player.spiritEnergy -= targetRealm.reqEnergy;
      player.realmIndex = nextIndex;
      player.cultivationRealm = targetRealm.name;
      player.level += 5;
      recalculatePower(player);
      await player.save();
      activePlayers[socket.id].power = player.power;
      activePlayers[socket.id].level = player.level;

      socket.emit('player_updated', player);
      io.emit('update_players', activePlayers);
      socket.emit('action_notification', `⚡ GÖK GÜRÜLTÜSÜ YARGISI AŞILDI! Yeni Alem: ${targetRealm.name} (+${targetRealm.powerBonus} Güç)`);
    } catch (err) {}
  });

  // 6. PVP ARENA
  socket.on('send_pvp_challenge', async (targetId) => {
    const challenger = activePlayers[socket.id];
    const target = activePlayers[targetId];
    if (challenger && target) {
      io.to(targetId).emit('pvp_challenge_received', {
        challengerId: socket.id,
        challengerName: challenger.username,
        challengerPower: challenger.power
      });
      socket.emit('action_notification', `⚔️ ${target.username} adlı oyuncuya düello teklifi gönderildi.`);
    } else {
      socket.emit('error_message', "Rakip çevrimiçi değil veya bulunamadı.");
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
        reward: "75 Öz Kristali, 120 Ruh Enerjisi ve +1 Seviye"
      };
      io.to(data.challengerId).emit('pvp_battle_ended', battleResult);
      io.to(socket.id).emit('pvp_battle_ended', battleResult);
      io.emit('update_players', activePlayers);
    }
  });

  // 7. TARİKAT / LONCA VE SOHBET
  socket.on('create_guild', async (data) => {
    const player = activePlayers[socket.id];
    if (!player) return;
    try {
      const existingGuild = await GuildModel.findOne({ name: data.guildName });
      if (existingGuild) return socket.emit('error_message', "Bu isimde bir tarikat zaten mevcut!");
      const newGuild = new GuildModel({
        name: data.guildName,
        leader: player.username,
        members: [player.username]
      });
      await newGuild.save();
      socket.emit('guild_success', `Tarikat başarıyla kuruldu: ${data.guildName}`);
    } catch (err) {
      socket.emit('error_message', "Tarikat kurulurken bir hata oluştu.");
    }
  });

  socket.on('join_guild', async (guildName) => {
    const player = activePlayers[socket.id];
    if (!player) return;
    try {
      const guild = await GuildModel.findOne({ name: guildName });
      if (!guild) return socket.emit('error_message', "Böyle bir tarikat bulunamadı!");
      if (guild.members.includes(player.username)) return socket.emit('error_message', "Zaten bu tarikatın üyesisin!");
      guild.members.push(player.username);
      await guild.save();
      socket.emit('guild_success', `${guildName} tarikatına katıldın!`);
    } catch (err) {}
  });

  socket.on('guild_chat_message', (data) => {
    const player = activePlayers[socket.id];
    if (!player) return;
    io.to(data.guildName).emit('receive_guild_chat', {
      sender: player.username,
      message: data.message,
      time: new Date().toLocaleTimeString()
    });
  });

  socket.on('join_chat_room', (guildName) => {
    socket.join(guildName);
  });

  // 8. SIRALAMA
  socket.on('get_leaderboard', async () => {
    try {
      const topPlayers = await PlayerModel.find().sort({ power: -1 }).limit(10).select('username className level power cultivationRealm');
      socket.emit('leaderboard_data', topPlayers);
    } catch (err) {}
  });

  // 9. DÜNYA BOSSU
  socket.on('attack_world_boss', async (damageAmount) => {
    const player = activePlayers[socket.id];
    if (!player || !worldBoss.isAlive) return;
    let maxAllowedDamage = player.power * 5;
    let actualDamage = Math.min(damageAmount, maxAllowedDamage);
    worldBoss.currentHp -= actualDamage;

    // Her vuruşta küçük bir ruh enerjisi kazanımı
    const updatedPlayer = await PlayerModel.findOneAndUpdate(
      { username: player.username },
      { $inc: { spiritEnergy: 15, essenceCrystals: 5 } },
      { new: true }
    );
    if (updatedPlayer) socket.emit('player_updated', updatedPlayer);

    if (worldBoss.currentHp <= 0) {
      worldBoss.currentHp = 0;
      worldBoss.isAlive = false;

      const killerDoc = await PlayerModel.findOneAndUpdate(
        { username: player.username },
        { $inc: { essenceCrystals: 500, spiritEnergy: 1000 } },
        { new: true }
      );
      if (killerDoc) socket.emit('player_updated', killerDoc);

      io.emit('world_boss_defeated', {
        killer: player.username,
        bossName: worldBoss.name,
        reward: "500 Öz Kristali ve 1000 Ruh Enerjisi"
      });
      setTimeout(() => {
        worldBoss.currentHp = worldBoss.maxHp;
        worldBoss.isAlive = true;
        io.emit('world_boss_respawn', worldBoss);
      }, 60000);
    }

    io.emit('world_boss_update', {
      currentHp: worldBoss.currentHp,
      maxHp: worldBoss.maxHp,
      lastAttacker: player.username,
      damageDealt: actualDamage
    });
  });

  socket.on('disconnect', () => {
    if (activePlayers[socket.id]) {
      delete activePlayers[socket.id];
      io.emit('update_players', activePlayers);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[SUNUCU AKTİF] Arken Dünyası bulut sunucusu ${PORT} portunda çalışıyor.`);
});
