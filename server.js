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

// 1. MongoDB Atlas Bulut Veritabanı Bağlantısı
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://bekiroktaysekerci_db_user:JmHPAEINyDzKCzR4@cluster0.6dmig6t.mongodb.net/arkendunyasi";

mongoose.connect(MONGO_URI)
  .then(() => console.log("[VERİTABANI] MongoDB bulut sunucusuna başarıyla bağlandı!"))
  .catch(err => console.error("[HATA] Veritabanı bağlantı hatası:", err));

// 2. Oyuncu Veri Şeması
const playerSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  className: { type: String, default: 'Kılıç Ustası' },
  level: { type: Number, default: 1 },
  power: { type: Number, default: 100 },
  cultivationRealm: { type: String, default: 'Kök Topraklar' },
  x: { type: Number, default: 100 },
  y: { type: Number, default: 100 },
  updatedAt: { type: Date, default: Date.now }
});

const PlayerModel = mongoose.model('Player', playerSchema);

// 3. Lonca / Tarikat Veri Şeması
const guildSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true },
  leader: { type: String, required: true },
  members: [{ type: String }], // Oyuncu kullanıcı adları
  level: { type: Number, default: 1 },
  treasury: { type: Number, default: 0 } // Tarikat hazinesi (Öz Kristali)
});

const GuildModel = mongoose.model('Guild', guildSchema);

// 4. Dünya Bossu Durum Belleği
let worldBoss = {
  name: "Kadim Gök Ejderhası",
  maxHp: 1000000,
  currentHp: 1000000,
  level: 50,
  isAlive: true
};

// Aktif çevrimiçi oyuncular belleği
const activePlayers = {};

io.on('connection', (socket) => {
  console.log(`[BAĞLANTI] Yeni bir oyuncu bağlandı: ${socket.id}`);

  // Oyuncu veritabanından yüklenir veya kayıt olur
  socket.on('player_login', async (data) => {
    try {
      let player = await PlayerModel.findOne({ username: data.username });
      
      if (!player) {
        player = new PlayerModel({
          username: data.username,
          className: data.className || 'Kılıç Ustası',
          level: 1,
          power: 150
        });
        await player.save();
        console.log(`[KAYIT] Yeni karakter oluşturuldu ve buluta kaydedildi: ${player.username}`);
      } else {
        console.log(`[GİRİŞ] Oyuncu buluttan yüklendi: ${player.username}`);
      }

      activePlayers[socket.id] = {
        id: socket.id,
        username: player.username,
        className: player.className,
        level: player.level,
        power: player.power,
        x: player.x,
        y: player.y
      };

      socket.emit('login_success', player);
      io.emit('update_players', activePlayers);

    } catch (error) {
      console.error("Giriş hatası:", error);
      socket.emit('error_message', "Giriş yapılırken bir hata oluştu.");
    }
  });

  // Oyuncu hareket ettikçe konumunu güncelle
  socket.on('player_move', async (pos) => {
    if (activePlayers[socket.id]) {
      activePlayers[socket.id].x = pos.x;
      activePlayers[socket.id].y = pos.y;
      
      socket.broadcast.emit('player_moved', { id: socket.id, x: pos.x, y: pos.y });
      await PlayerModel.updateOne({ username: activePlayers[socket.id].username }, { x: pos.x, y: pos.y });
    }
  });

  // --- PVE / PVP ARENA VE SAVAŞ DOĞRULAMA SİSTEMİ ---

  // Oyuncu başka bir oyuncuya meydan okuduğunda
  socket.on('send_pvp_challenge', async (targetId) => {
    const challenger = activePlayers[socket.id];
    const target = activePlayers[targetId];

    if (challenger && target) {
      console.log(`[PVP] ${challenger.username}, ${target.username} oyuncusuna düello teklif etti.`);
      
      io.to(targetId).emit('pvp_challenge_received', {
        challengerId: socket.id,
        challengerName: challenger.username,
        challengerPower: challenger.power
      });
    } else {
      socket.emit('error_message', "Rakip çevrimiçi değil veya bulunamadı.");
    }
  });

  // Hedef oyuncu düelloyu kabul ettiğinde savaş sunucuda hesaplanır
  socket.on('accept_pvp_challenge', async (data) => {
    const player1 = activePlayers[data.challengerId];
    const player2 = activePlayers[socket.id];

    if (player1 && player2) {
      console.log(`[PVP] Savaş Başlıyor: ${player1.username} vs ${player2.username}`);

      let p1Score = player1.power * (1 + Math.random() * 0.3);
      let p2Score = player2.power * (1 + Math.random() * 0.3);

      let winner = p1Score >= p2Score ? player1 : player2;
      let loser = winner === player1 ? player2 : player1;

      await PlayerModel.updateOne({ username: winner.username }, { $inc: { power: 10 } });

      const battleResult = {
        winner: winner.username,
        loser: loser.username,
        winnerPower: Math.floor(winner === player1 ? p1Score : p2Score),
        reward: "50 Öz Kristali, 100 Ruh Enerjisi"
      };

      io.to(data.challengerId).emit('pvp_battle_ended', battleResult);
      io.to(socket.id).emit('pvp_battle_ended', battleResult);

      console.log(`[PVP SONUCU] Kazanan: ${winner.username}`);
    }
  });

  // --- LONCA (TARİKAT) VE ANLIK SOHBET SİSTEMİ ---

  // Tarikat / Lonca Oluşturma
  socket.on('create_guild', async (data) => {
    const player = activePlayers[socket.id];
    if (!player) return;

    try {
      const existingGuild = await GuildModel.findOne({ name: data.guildName });
      if (existingGuild) {
        socket.emit('error_message', "Bu isimde bir tarikat zaten mevcut!");
        return;
      }

      const newGuild = new GuildModel({
        name: data.guildName,
        leader: player.username,
        members: [player.username]
      });

      await newGuild.save();
      socket.emit('guild_success', `Tarikat başarıyla kuruldu: ${data.guildName}`);
      console.log(`[LONCA] Yeni Tarikat Kuruldu: ${data.guildName} (Kurucu: ${player.username})`);

    } catch (err) {
      console.error("Lonca oluşturma hatası:", err);
      socket.emit('error_message', "Tarikat kurulurken bir hata oluştu.");
    }
  });

  // Tarikata Katılma
  socket.on('join_guild', async (guildName) => {
    const player = activePlayers[socket.id];
    if (!player) return;

    try {
      const guild = await GuildModel.findOne({ name: guildName });
      if (!guild) {
        socket.emit('error_message', "Böyle bir tarikat bulunamadı!");
        return;
      }

      if (guild.members.includes(player.username)) {
        socket.emit('error_message', "Zaten bu tarikatın üyesisin!");
        return;
      }

      guild.members.push(player.username);
      await guild.save();

      socket.emit('guild_success', `${guildName} tarikatına katıldın!`);
      console.log(`[LONCA] ${player.username}, ${guildName} tarikatına katıldı.`);

    } catch (err) {
      console.error("Tarikat katılım hatası:", err);
    }
  });

  // Gerçek Zamanlı Lonca Sohbeti (Chat)
  socket.on('guild_chat_message', (data) => {
    const player = activePlayers[socket.id];
    if (!player) return;

    io.to(data.guildName).emit('receive_guild_chat', {
      sender: player.username,
      message: data.message,
      time: new Date().toLocaleTimeString()
    });
    
    console.log(`[SOHBET - ${data.guildName}] ${player.username}: ${data.message}`);
  });

  // Oyuncu bir tarikat sohbet odasına dahil olduğunda
  socket.on('join_chat_room', (guildName) => {
    socket.join(guildName);
    console.log(`[SOHBET] ${socket.id} ID'li oyuncu ${guildName} sohbet kanalına katıldı.`);
  });

  // --- KÜRESEL SIRALAMA VE DÜNYA BOSSU SİSTEMİ ---

  // Küresel Sıralama Tablosunu Getir (En güçlü ilk 10 oyuncu)
  socket.on('get_leaderboard', async () => {
    try {
      const topPlayers = await PlayerModel.find()
        .sort({ power: -1 })
        .limit(10)
        .select('username className level power cultivationRealm');
      
      socket.emit('leaderboard_data', topPlayers);
    } catch (err) {
      console.error("Sıralama yükleme hatası:", err);
    }
  });

  // Dünya Bossuna Saldırı Yap (Ortak Baskın)
  socket.on('attack_world_boss', async (damageAmount) => {
    const player = activePlayers[socket.id];
    if (!player || !worldBoss.isAlive) return;

    // Hile koruması: Oyuncunun gücüne göre verebileceği maksimum hasarı sınırla
    let maxAllowedDamage = player.power * 5;
    let actualDamage = Math.min(damageAmount, maxAllowedDamage);

    worldBoss.currentHp -= actualDamage;

    if (worldBoss.currentHp <= 0) {
      worldBoss.currentHp = 0;
      worldBoss.isAlive = false;

      console.log(`[DÜNYA BOSSU] ${worldBoss.name}, ${player.username} tarafından katledildi!`);
      
      // Son vuruşu yapan veya katkı sağlayanlara ödül dağıt
      io.emit('world_boss_defeated', {
        killer: player.username,
        bossName: worldBoss.name,
        reward: "Özel Kadim Sandığı ve 500 Öz Kristali"
      });

      // 1 dakika sonra bossu yeniden canlandır
      setTimeout(() => {
        worldBoss.currentHp = worldBoss.maxHp;
        worldBoss.isAlive = true;
        io.emit('world_boss_respawn', worldBoss);
        console.log(`[DÜNYA BOSSU] ${worldBoss.name} yeniden uyandı!`);
      }, 60000);
    }

    // Güncel Boss Canını bütün oyunculara yayınla
    io.emit('world_boss_update', {
      currentHp: worldBoss.currentHp,
      maxHp: worldBoss.maxHp,
      lastAttacker: player.username,
      damageDealt: actualDamage
    });
  });

  // Bağlantı koptuğunda
  socket.on('disconnect', () => {
    if (activePlayers[socket.id]) {
      console.log(`[AYRILDI] Oyuncu oyundan çıktı: ${activePlayers[socket.id].username}`);
      delete activePlayers[socket.id];
      io.emit('update_players', activePlayers);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[SUNUCU AKTİF] Arken Dünyası bulut sunucusu ${PORT} portunda çalışıyor.`);
});

