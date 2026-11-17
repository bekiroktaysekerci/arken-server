'use strict';
// ARKEN DÜNYASI — Mistik Düello, sunucuya ait emanet (escrow) ve sonuçlandırma.
// Yalnızca nakde çevrilemeyen, oyun içinde kazanılan kaynaklarla kullanım için.
const crypto = require('crypto');

const TZ = 'Europe/Istanbul';
const CONFIG = Object.freeze({
  minLevel: 15,
  maxRealmGap: 1,
  maxLevelGap: 10,
  commissionPercent: 5,
  weekday: 0,         // Pazar
  startHour: 19,
  endHour: 23,
  currencies: { crystals: { path: 'currencies.essenceCrystals', min: 50, max: 5000 }, stones: { path: 'currencies.spiritStones', min: 10, max: 500 } }
});

function localClock(date = new Date()) {
  const pieces = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const part = kind => pieces.find(p => p.type === kind)?.value;
  const days = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  return {day:days[part('weekday')], hour:Number(part('hour')), minute:Number(part('minute')), second:Number(part('second'))};
}
function arenaWindow(date = new Date()) {
  const t = localClock(date);
  const current = t.hour * 3600 + t.minute * 60 + t.second;
  const first = CONFIG.startHour * 3600;
  const last = CONFIG.endHour * 3600;
  const open = t.day === CONFIG.weekday && current >= first && current < last;
  const opensIn = open ? 0 : ((((CONFIG.weekday - t.day + 7) % 7) * 86400 + first - current) + 604800) % 604800;
  const remaining = open ? last - current : 0;
  return {
    open,
    timezone: TZ,
    weeklyDay: 'Pazar',
    localHours: '19:00–23:00',
    opensInSeconds: opensIn,
    remainingSeconds: remaining,
    minLevel: CONFIG.minLevel,
    maxRealmGap: CONFIG.maxRealmGap,
    maxLevelGap: CONFIG.maxLevelGap,
    commissionPercent: CONFIG.commissionPercent,
    currencyLimits: {crystals:{min:50,max:5000},stones:{min:10,max:500}}
  };
}
function checkStake(currency, stake) {
  const cfg = CONFIG.currencies[currency];
  if (!cfg || !Number.isSafeInteger(stake) || stake < cfg.min || stake > cfg.max) {
    throw httpError(400, 'Geçersiz kaynak veya bahis miktarı.');
  }
  return cfg;
}
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
function realmIndex(p) { return Math.max(0, Number(p.cultivationRealmIndex ?? p.realmIndex ?? 0)); }
function playerSummary(p) {
  return {
    username:p.username, level:Number(p.level || 1), realm:realmIndex(p),
    crystals:Number(p.currencies?.essenceCrystals || 0),
    stones:Number(p.currencies?.spiritStones || 0)
  };
}
function offerSummary(o) {
  return { id:String(o._id), maker:o.maker, level:o.makerLevel, realm:o.makerRealm,
    currency:o.currency, stake:o.stake, createdAt:o.createdAt, expiresAt:o.expiresAt };
}
function duelSummary(o) {
  return { id:String(o._id), maker:o.maker, opponent:o.opponent,
    winner:o.winner, currency:o.currency, stake:o.stake, fee:o.fee,
    payout:o.payout, resolvedAt:o.resolvedAt, rounds:o.rounds || [],
    makerMaxHp:o.makerMaxHp || 500, opponentMaxHp:o.opponentMaxHp || 500,
    makerClass:o.makerClass || 'Kılıç Ustası', opponentClass:o.opponentClass || 'Kılıç Ustası' };
}

function installArena({ app, io, mongoose, PlayerModel, verifyAccountPassword, accountLookup, simulateDuel }) {
  const Session = mongoose.models.ArkenArenaSession || mongoose.model('ArkenArenaSession', new mongoose.Schema({
    tokenHash: {type:String, required:true, unique:true},
    playerId: {type:mongoose.Schema.Types.ObjectId, required:true, index:true},
    expiresAt: {type:Date, required:true, index:{expireAfterSeconds:0}}
  }));
  const offerSchema = new mongoose.Schema({
    makerId: {type:mongoose.Schema.Types.ObjectId, required:true, index:true},
    maker: {type:String, required:true}, makerLevel:Number, makerRealm:Number,
    opponentId: {type:mongoose.Schema.Types.ObjectId}, opponent:String,
    currency: {type:String, enum:['crystals','stones'], required:true},
    stake: {type:Number, required:true}, status: {type:String, default:'open', index:true},
    createdAt: {type:Date,default:Date.now}, expiresAt:{type:Date,required:true,index:true},
    resolvedAt:Date, winner:String, fee:Number, payout:Number, rounds:{type:Array,default:[]},
    makerMaxHp:Number, opponentMaxHp:Number, makerClass:String, opponentClass:String
  });
  // Bir oyuncu aynı anda bir teklif açabilir; yarış durumunda benzersiz indeks korur.
  offerSchema.index({makerId:1}, {unique:true, partialFilterExpression:{status:'open'}, name:'one_open_arena_offer_per_maker'});
  const Offer = mongoose.models.ArkenArenaOffer || mongoose.model('ArkenArenaOffer', offerSchema);
  const ledgerSchema = new mongoose.Schema({
    offerId:{type:mongoose.Schema.Types.ObjectId,required:true}, playerId:{type:mongoose.Schema.Types.ObjectId,required:true},
    type:{type:String,required:true}, currency:String, delta:Number, at:{type:Date,default:Date.now}
  });
  ledgerSchema.index({offerId:1, playerId:1, type:1}, {unique:true});
  const Ledger = mongoose.models.ArkenArenaLedger || mongoose.model('ArkenArenaLedger', ledgerSchema);

  const requestTimes = new Map();
  function throttle(req,res,next) {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (requestTimes.get(key) || []).filter(t => now - t < 60000);
    if (recent.length >= 45) return res.status(429).json({ok:false,error:'Çok fazla istek. Biraz sonra tekrar dene.'});
    recent.push(now); requestTimes.set(key,recent);
    next();
  }
  setInterval(() => {
    for (const [key, times] of requestTimes) {
      const recent = times.filter(t => Date.now() - t < 60000);
      if (recent.length) requestTimes.set(key,recent); else requestTimes.delete(key);
    }
  },60000).unref();
  app.use('/api/arena', throttle);
  function catchApi(fn) {
    return (req,res,next) => Promise.resolve(fn(req,res)).catch(err => {
      if ((err.status || 500) >= 500) console.error('[ARENA]',err);
      res.status(err.status || 500).json({ok:false,error:err.status ? err.message : 'Arena sunucusunda beklenmeyen hata.'});
    });
  }
  async function auth(req,res,next) {
    try {
      const bearer = /^Bearer ([A-Fa-f0-9]{64})$/.exec(req.headers.authorization || '');
      if (!bearer) return res.status(401).json({ok:false,error:'Lütfen hesabına giriş yap.'});
      const tokenHash = crypto.createHash('sha256').update(bearer[1]).digest('hex');
      const access = await Session.findOne({tokenHash,expiresAt:{$gt:new Date()}}).lean();
      if (!access) return res.status(401).json({ok:false,error:'Oturum süren doldu; tekrar giriş yap.'});
      const player = await PlayerModel.findById(access.playerId);
      if (!player) return res.status(401).json({ok:false,error:'Hesabın bulunamadı.'});
      req.arenaPlayer = player;
      next();
    } catch (err) { next(err); }
  }
  function assertWindow() {
    const w = arenaWindow();
    if (!w.open) throw httpError(403,'Mistik Düello yalnızca pazar 19.00–23.00 arasında açık.');
    return w;
  }
  function assertEntry(player) {
    if (Number(player.level) < CONFIG.minLevel) throw httpError(403,`Mistik Düello için minimum seviye ${CONFIG.minLevel}.`);
  }
  async function transaction(work) {
    const session = await mongoose.startSession();
    let output;
    try { await session.withTransaction(async () => { output = await work(session); }, {
      readConcern:{level:'snapshot'}, writeConcern:{w:'majority'}
    }); return output; }
    finally { await session.endSession(); }
  }
  async function charge(playerId, currency, amount, session) {
    const key = CONFIG.currencies[currency].path;
    const updated = await PlayerModel.findOneAndUpdate(
      {_id:playerId,[key]:{$gte:amount}},{$inc:{[key]:-amount}}, {new:true,session});
    if (!updated) throw httpError(409,'Yetersiz bakiye veya hesap aynı anda değiştirildi.');
    if (currency === 'crystals') await PlayerModel.updateOne({_id:playerId},{$set:{essenceCrystals:updated.currencies.essenceCrystals}},{session});
    return updated;
  }
  async function credit(playerId, currency, amount, session) {
    const key = CONFIG.currencies[currency].path;
    const updated = await PlayerModel.findByIdAndUpdate(playerId,{$inc:{[key]:amount}},{new:true,session});
    if (!updated) throw httpError(409,'Ödül alıcısı bulunamadı, işlem geri alındı.');
    if (currency === 'crystals') await PlayerModel.updateOne({_id:playerId},{$set:{essenceCrystals:updated.currencies.essenceCrystals}},{session});
  }
  function notify() { io.emit('arena_lobby_update',{at:Date.now()}); }

  app.get('/api/arena/status', catchApi(async (_req,res) => {
    res.json({ok:true,...arenaWindow()});
  }));
  app.get('/api/arena/offers', catchApi(async (req,res) => {
    const requested = Number(req.query?.page || 0);
    const page = Number.isSafeInteger(requested) ? Math.max(0,Math.min(1000,requested)) : 0;
    const pageSize = 40;
    const filter = {status:'open',expiresAt:{$gt:new Date()}};
    const [offers,total] = await Promise.all([
      Offer.find(filter).sort({createdAt:-1,_id:-1}).skip(page*pageSize).limit(pageSize).lean(),
      Offer.countDocuments(filter)
    ]);
    res.json({ok:true,page,pageSize,total,hasMore:(page+1)*pageSize<total,offers:offers.map(offerSummary)});
  }));
  const loginAttempts = new Map();
  function loginThrottle(req,res,next) {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const times = (loginAttempts.get(key) || []).filter(t => now - t < 15*60000);
    if (times.length >= 8) return res.status(429).json({ok:false,error:'Çok fazla giriş denemesi; 15 dakika sonra tekrar dene.'});
    times.push(now); loginAttempts.set(key,times);
    next();
  }
  app.post('/api/arena/login', loginThrottle, catchApi(async (req,res) => {
    const identifier = String(req.body?.identifier || '').trim();
    const password = String(req.body?.password || '');
    if (!identifier || identifier.length > 254 || password.length < 1 || password.length > 128) throw httpError(400,'Geçerli oyuncu ID/e-posta ve şifre gerekli.');
    const player = await PlayerModel.findOne(accountLookup(identifier)).select('+passwordHash');
    if (!player || !(await verifyAccountPassword(password,player.passwordHash))) throw httpError(401,'Oyuncu ID/e-posta veya şifre hatalı.');
    const raw = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    await Session.create({tokenHash,playerId:player._id,expiresAt:new Date(Date.now()+12*3600*1000)});
    res.json({ok:true,token:raw,player:playerSummary(player)});
  }));
  app.get('/api/arena/me',auth,catchApi(async (req,res) => {
    res.json({ok:true,player:playerSummary(req.arenaPlayer)});
  }));
  app.get('/api/arena/history',auth,catchApi(async (req,res) => {
    const history = await Offer.find({status:'resolved',$or:[{makerId:req.arenaPlayer._id},{opponentId:req.arenaPlayer._id}]}).sort({resolvedAt:-1}).limit(30).lean();
    res.json({ok:true,history:history.map(duelSummary)});
  }));
  app.post('/api/arena/offers',auth,catchApi(async (req,res) => {
    const w = assertWindow();
    assertEntry(req.arenaPlayer);
    const currency = req.body?.currency;
    const stake = req.body?.stake;
    checkStake(currency,stake);
    const makerId = req.arenaPlayer._id;
    const output = await transaction(async session => {
      const current = await PlayerModel.findById(makerId).session(session);
      if (!current) throw httpError(404,'Oyuncu bulunamadı.');
      assertEntry(current);
      const existing = await Offer.findOne({makerId,status:'open'}).session(session);
      if (existing) throw httpError(409,'Zaten bir açık teklifin var. Önce iptal et veya eşleşmesini bekle.');
      await charge(makerId,currency,stake,session);
      const end = new Date(Date.now() + Math.max(1,w.remainingSeconds)*1000);
      const docs = await Offer.create([{
        makerId,maker:current.username,makerLevel:current.level,makerRealm:realmIndex(current),
        currency,stake,expiresAt:end,status:'open'
      }],{session});
      const doc = docs[0];
      await Ledger.create([{offerId:doc._id,playerId:makerId,type:'stake_maker',currency,delta:-stake}],{session});
      return offerSummary(doc);
    });
    notify();
    res.json({ok:true,offer:output});
  }));
  app.post('/api/arena/accept',auth,catchApi(async (req,res) => {
    assertWindow();
    assertEntry(req.arenaPlayer);
    const offerId = String(req.body?.offerId || '');
    if (!mongoose.isValidObjectId(offerId)) throw httpError(400,'Geçersiz teklif kimliği.');
    const takerId = req.arenaPlayer._id;
    const outcome = await transaction(async session => {
      const offer = await Offer.findOne({_id:offerId,status:'open',expiresAt:{$gt:new Date()}}).session(session);
      if (!offer) throw httpError(409,'Bu teklif artık açık değil.');
      if (String(offer.makerId) === String(takerId)) throw httpError(403,'Kendi teklifini kabul edemezsin.');
      const maker = await PlayerModel.findById(offer.makerId).session(session);
      const taker = await PlayerModel.findById(takerId).session(session);
      if (!maker || !taker) throw httpError(404,'Karşılaşma oyuncularından biri bulunamadı.');
      assertEntry(maker); assertEntry(taker);
      if (Math.abs(realmIndex(maker)-realmIndex(taker)) > CONFIG.maxRealmGap) throw httpError(403,'Yetişim âlemleri arasındaki fark 1 aşamayı aşamaz.');
      if (Math.abs(Number(maker.level)-Number(taker.level)) > CONFIG.maxLevelGap) throw httpError(403,'Adil düello için seviye farkı en fazla 10 olabilir.');
      await charge(takerId,offer.currency,offer.stake,session);
      // Savaş sonucu yalnızca sunucuda hesaplanır. İstemci kazananı belirleyemez.
      const simulated = simulateDuel(maker,taker);
      const winner = simulated.winnerIndex === 0 ? maker : taker;
      const fee = Math.floor((offer.stake*2)*CONFIG.commissionPercent/100);
      const payout = offer.stake*2-fee;
      const updated = await Offer.findOneAndUpdate({_id:offer._id,status:'open'},{$set:{
        status:'resolved',opponentId:takerId,opponent:taker.username,
        winner:winner.username,fee,payout,rounds:simulated.rounds,resolvedAt:new Date(),
        makerMaxHp:Math.max(100,Number(maker.maxHp)||500), opponentMaxHp:Math.max(100,Number(taker.maxHp)||500),
        makerClass:maker.className,opponentClass:taker.className
      }},{session,new:true});
      if (!updated) throw httpError(409,'Düello başka bir oyuncu tarafından kabul edildi.');
      await credit(winner._id,offer.currency,payout,session);
      await Ledger.create([
        {offerId:offer._id,playerId:takerId,type:'stake_taker',currency:offer.currency,delta:-offer.stake},
        {offerId:offer._id,playerId:winner._id,type:'winner_payout',currency:offer.currency,delta:payout}
      ],{session});
      return duelSummary(updated);
    });
    notify();
    res.json({ok:true,duel:outcome});
  }));
  app.post('/api/arena/cancel',auth,catchApi(async (req,res) => {
    const offerId = String(req.body?.offerId || '');
    if (!mongoose.isValidObjectId(offerId)) throw httpError(400,'Geçersiz teklif kimliği.');
    const playerId = req.arenaPlayer._id;
    const output = await transaction(async session => {
      const offer = await Offer.findOneAndUpdate({_id:offerId,makerId:playerId,status:'open'},{$set:{status:'cancelled'}},{session,new:true});
      if (!offer) throw httpError(409,'Teklif bulunamadı veya çoktan kabul edildi.');
      await credit(playerId,offer.currency,offer.stake,session);
      await Ledger.create([{offerId:offer._id,playerId,type:'refund_cancel',currency:offer.currency,delta:offer.stake}],{session});
      return offerSummary(offer);
    });
    notify();
    res.json({ok:true,offer:output});
  }));
  // Render yeniden başladığında ve etkinlik sona erdiğinde açık bahisler kaybolmaz;
  // süresi dolanların tamamı bir kez ve işlem güvenliğiyle iade edilir.
  async function refundExpired() {
    const expired = await Offer.find({status:'open',expiresAt:{$lte:new Date()}}).limit(75).select('_id').lean();
    for (const entry of expired) {
      try {
        await transaction(async session => {
          const o = await Offer.findOneAndUpdate({_id:entry._id,status:'open'},{$set:{status:'expired'}},{session,new:true});
          if (!o) return;
          await credit(o.makerId,o.currency,o.stake,session);
          await Ledger.create([{offerId:o._id,playerId:o.makerId,type:'refund_expired',currency:o.currency,delta:o.stake}],{session});
        });
      } catch (err) { console.error('[ARENA] Süresi dolan teklif iadesi:',String(entry._id),err); }
    }
    if (expired.length) notify();
  }
  mongoose.connection.once('open', () => refundExpired().catch(e => console.error('[ARENA] Açılış iadesi:',e)));
  const sweep = setInterval(() => refundExpired().catch(e => console.error('[ARENA] Süpürme:',e)),60000);
  sweep.unref?.();
  return { Offer, Ledger, Session, refundExpired };
}
module.exports = { installArena, arenaWindow, localClock, checkStake, CONFIG };
