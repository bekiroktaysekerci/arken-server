const { io } = require('socket.io-client');
const baseUrl = process.env.TEST_SERVER_URL || 'http://127.0.0.1:3000';
const suffix = `${Date.now()}_${Math.floor(Math.random()*10000)}`;
const a = io(baseUrl, { transports:['websocket'], timeout:8000 });
const b = io(baseUrl, { transports:['websocket'], timeout:8000 });
let finished = false, logged = 0, movementSeen = false, challengeSent = false;
const pvpResults = new Set();
function finish(error) {
  if (finished) return; finished = true; clearTimeout(timer); a.close(); b.close();
  if (error) { console.error('Çok oyunculu smoke test başarısız:', error.message); process.exitCode=1; }
  else console.log('Çok oyunculu smoke test başarılı: iki oturum, aynı haritada hareket ve PvP düello akışı doğrulandı.');
}
const timer=setTimeout(()=>finish(new Error('15 saniye içinde hareket/PvP senkronizasyonu tamamlanamadı.')),15000);
a.on('connect_error',e=>finish(e)); b.on('connect_error',e=>finish(e));
function onLogin(){logged++;if(logged===2)b.emit('player_move',{x:321,y:222,mapId:'map_heng_yue'});}
a.on('login_success',onLogin); b.on('login_success',onLogin);
a.on('player_moved',data=>{
  if(data.username===`test_${suffix}_b` && data.x===321 && data.y===222 && !movementSeen){
    movementSeen=true; challengeSent=true; a.emit('send_pvp_challenge',b.id);
  }
});
b.on('pvp_challenge_received',data=>{
  if(challengeSent && data.challengerId===a.id)b.emit('accept_pvp_challenge',{challengerId:data.challengerId});
});
function onPvpResult(){pvpResults.add(this.id);if(movementSeen&&pvpResults.has(a.id)&&pvpResults.has(b.id))finish();}
a.on('pvp_battle_ended',onPvpResult.bind(a)); b.on('pvp_battle_ended',onPvpResult.bind(b));
a.on('connect',()=>a.emit('player_login',{username:`test_${suffix}_a`,className:'Kılıç Ustası'}));
b.on('connect',()=>b.emit('player_login',{username:`test_${suffix}_b`,className:'Ruh Büyücüsü'}));
