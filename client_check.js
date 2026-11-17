
  const socket = io();
  socket.on('connect', () => { const b=document.getElementById('networkBanner'); if(b)b.classList.add('hidden'); const s=document.getElementById('authConnectionStatus'); if(s)s.textContent='Sunucu bağlantısı hazır.'; });
  socket.on('disconnect', () => { const b=document.getElementById('networkBanner'); if(b)b.classList.remove('hidden'); const s=document.getElementById('authConnectionStatus'); if(s)s.textContent='Bağlantı kesildi; yeniden bağlanılıyor…'; });
  socket.on('connect_error', () => { const s=document.getElementById('authConnectionStatus'); if(s)s.textContent='Sunucuya ulaşılamıyor. İnternet bağlantını kontrol et; bağlantı gelince yeniden denenecek.'; });
  let myData = null;
  let realmList = [];
  let currentGuild = "";
  let bossCooldownTimer = null;
  // 4x4 karelik sprite atlas oynatıcı. Atlas yoksa ekipmana duyarlı SVG karakteri animasyonla kullanır.
  const ArkenSprite = (() => {
    let state='idle', timer=null;
    function setState(next,duration=900){
      state=next; const host=document.getElementById('playerAvatarIcon'); if(!host)return;
      host.classList.remove('sprite-idle','sprite-flight','sprite-attack','sprite-cast');
      host.classList.add('sprite-'+next);
      if(timer)clearTimeout(timer);
      if(next!=='idle')timer=setTimeout(()=>setState('idle',0),duration);
    }
    return {setState};
  })();
  let questData = [];
  let questFilter = 'all';
  let companionNodes = {};

  // Yumuşak Hareket (Tween) Değişkenleri
  let currentPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let targetPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const moveSpeed = 0.15; // Yumuşatma faktörü

  // Hareket Döngüsü (RequestAnimationFrame)
  function gameLoop() {
    currentPos.x += (targetPos.x - currentPos.x) * moveSpeed;
    currentPos.y += (targetPos.y - currentPos.y) * moveSpeed;

    const sprite = document.getElementById('localPlayerSprite');
    if (sprite) {
      sprite.style.left = currentPos.x + 'px';
      sprite.style.top = currentPos.y + 'px';
    }
    positionCompanions();
    requestAnimationFrame(gameLoop);
  }
  requestAnimationFrame(gameLoop);

  // ÖZEL MOBİL MODAL SİSTEMİ
  function showModal(title, message, onConfirm = null, onCancel = null) {
    const modal = document.getElementById('customModal');
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalBody').innerText = message;
    const actions = document.getElementById('modalActions');
    actions.innerHTML = "";

    if (onConfirm) {
      const btnYes = document.createElement('button');
      btnYes.innerText = "Kabul Et";
      btnYes.className = "btn-jade";
      btnYes.onclick = () => { modal.classList.add('hidden'); onConfirm(); };

      const btnNo = document.createElement('button');
      btnNo.innerText = "Reddet";
      btnNo.className = "btn-red";
      btnNo.onclick = () => { modal.classList.add('hidden'); if (onCancel) onCancel(); };

      actions.appendChild(btnYes);
      actions.appendChild(btnNo);
    } else {
      const btnOk = document.createElement('button');
      btnOk.innerText = "Tamam";
      btnOk.onclick = () => { modal.classList.add('hidden'); if (onCancel) onCancel(); };
      actions.appendChild(btnOk);
    }

    modal.classList.remove('hidden');
  }

  function showToast(msg, isError = false) {
    const toast = document.getElementById('toastBox');
    toast.innerText = msg;
    toast.classList.toggle('error', isError);
    toast.classList.remove('hidden');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => toast.classList.add('hidden'), 4000);
  }

  function showAuthMode(mode) {
    const isRegister = mode === 'register';
    document.getElementById('loginForm').classList.toggle('hidden', isRegister);
    document.getElementById('registerForm').classList.toggle('hidden', !isRegister);
    document.getElementById('authTitle').textContent = isRegister ? 'Yeni Hesap Oluştur' : 'Yetişimci Girişi';
  }

  function loginGame() {
    const identifier = document.getElementById('loginIdentifier').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!identifier || !password) return showToast('Oyuncu ID/e-posta ve şifreni gir.', true);
    if (!socket.connected) return showToast('Sunucuya bağlı değilsin. İnternet bağlantını kontrol et.', true);
    socket.emit('player_login', { identifier, password });
  }

  function registerGame() {
    const email = document.getElementById('registerEmail').value.trim();
    const accountId = document.getElementById('registerAccountId').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerPasswordConfirm').value;
    const className = document.getElementById('classSelect').value;
    if (!email || !accountId || !password || !confirm) return showToast('Tüm kayıt alanlarını doldur.', true);
    if (password !== confirm) return showToast('Şifreler birbiriyle eşleşmiyor.', true);
    if (!socket.connected) return showToast('Sunucuya bağlı değilsin. İnternet bağlantını kontrol et.', true);
    socket.emit('player_register', { email, accountId, password, className });
  }

  function deleteMyAccount() {
    const password = document.getElementById('deleteAccountPassword').value;
    const confirmed = document.getElementById('deleteAccountConfirm').checked;
    if (!password || !confirmed) return showToast('Silme işlemi için şifreni girip onay kutusunu işaretle.', true);
    showModal('Hesabı Kalıcı Olarak Sil', 'Karakterin ve oyun ilerlemen kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam etmek istiyor musun?', () => {
      socket.emit('delete_account', { password, confirmation: 'SİL' });
    });
  }

  function updateGuildUI(guildName) {
    currentGuild = guildName || "";
    if (currentGuild) {
      document.getElementById('noGuildBox').classList.add('hidden');
      document.getElementById('activeGuildBanner').classList.remove('hidden');
      document.getElementById('myGuildTitle').innerText = currentGuild;
      socket.emit('join_chat_room', currentGuild);
    } else {
      document.getElementById('noGuildBox').classList.remove('hidden');
      document.getElementById('activeGuildBanner').classList.add('hidden');
    }
  }

  function renderPlayerUI(player) {
    myData = player;
    document.getElementById('hudName').innerText = player.username;
    const accountIdLabel = document.getElementById('accountIdLabel'); if (accountIdLabel) accountIdLabel.textContent = player.accountId || player.username || '—';
    document.getElementById('localPlayerNameTag').innerText = player.username;
    document.getElementById('hudRealm').innerText = player.cultivationRealm;
    document.getElementById('hudCrystals').innerText = player.currencies?.essenceCrystals ?? player.essenceCrystals ?? 0;
    document.getElementById('hudEnergy').innerText = player.spiritEnergy ?? 0;
    // Yeni ana HUD, mevcut oyuncu nesnesinden beslenir; sunucu protokolü değişmez.
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const hp = Math.max(0, Number(player.hp ?? player.maxHp ?? 500));
    const maxHp = Math.max(1, Number(player.maxHp ?? 500));
    const mp = Math.max(0, Number(player.mana ?? player.spiritEnergy ?? 0));
    const maxMp = Math.max(1, Number(player.maxMana ?? player.maxSpiritEnergy ?? Math.max(100, mp))); 
    setText('arkenName', player.username || 'Yetişimci');
    setText('arkenTitle', player.cultivationTitle || player.cultivationRealm || 'Dış Avlu Çırağı');
    setText('arkenLevel', player.level ?? 1);
    setText('arkenPower', player.power ?? player.attackPower ?? 0);
    setText('arkenClass', player.className || 'YETİŞİMCİ');
    setText('arkenCrystalValue', player.currencies?.essenceCrystals ?? player.essenceCrystals ?? 0);
    setText('arkenEnergyValue', player.cultivationEnergy ?? player.spiritEnergy ?? 0);
    setText('arkenStoneValue', player.currencies?.spiritStones ?? 0);
    setText('arkenHpText', `${hp} / ${maxHp}`);
    setText('arkenMpText', `${mp} / ${maxMp}`);
    const hpFill = document.getElementById('arkenHpFill');
    const mpFill = document.getElementById('arkenMpFill');
    if (hpFill) hpFill.style.width = `${Math.min(100, hp / maxHp * 100)}%`;
    if (mpFill) mpFill.style.width = `${Math.min(100, mp / maxMp * 100)}%`;
    const portrait = document.getElementById('arkenPortrait');
    if (portrait) portrait.textContent = ({'Kılıç Ustası':'🗡️','Ruh Büyücüsü':'🔮','Gölge Suikastçısı':'🌑'}[player.className] || '🗡️');


    if (player.x !== undefined && player.y !== undefined) {
      currentPos.x = player.x;
      currentPos.y = player.y;
      targetPos.x = player.x;
      targetPos.y = player.y;
    }

    // Sınıf Avatar İkonu
    const icons = { 'Kılıç Ustası': '🗡️', 'Ruh Büyücüsü': '🔮', 'Gölge Suikastçısı': '🌑' };
    document.getElementById('playerAvatarIcon').innerText = icons[player.className] || '🗡️';

    document.getElementById('curRealmText').innerText = player.cultivationRealm;

    updateGuildUI(player.guildName);

    const mLv = player.mineLevel || 1;
    const fLv = player.furnaceLevel || 1;
    document.getElementById('mineLv').innerText = mLv;
    document.getElementById('furnaceLv').innerText = fLv;
    document.getElementById('btnUpMine').innerText = `Yükselt (${mLv * 120} 💎)`;
    document.getElementById('btnUpFurnace').innerText = `Yükselt (${fLv * 120} 💎)`;

    if (player.retainers) {
      document.getElementById('linLv').innerText = player.retainers.lin;
      document.getElementById('kaelLv').innerText = player.retainers.kael;
      document.getElementById('veyraLv').innerText = player.retainers.veyra;
      document.getElementById('btnUpLin').innerText = `Eğit (${player.retainers.lin * 150} 💎)`;
      document.getElementById('btnUpKael').innerText = `Eğit (${player.retainers.kael * 150} 💎)`;
      document.getElementById('btnUpVeyra').innerText = `Eğit (${player.retainers.veyra * 150} 💎)`;
    }

    const nextIdx = (player.realmIndex || 0) + 1;
    if (realmList[nextIdx]) {
      document.getElementById('nextRealmInfo').innerText = `Sonraki Alem: ${realmList[nextIdx].name} (${realmList[nextIdx].reqEnergy} Ruh Enerjisi)`;
    } else {
      document.getElementById('nextRealmInfo').innerText = "Dokuz Alemin Zirvesine Ulaşıldı!";
    }
  }

  socket.on('login_success', (data) => {
    realmList = data.realms || [];
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    renderPlayerUI(data.player);
    renderCultivationUI(data.player);
    renderAbodeGrid(data.player);
    renderSkillsUI(data.player);
    renderInventoryUI(data.player);
    questData = data.quests || [];
    setTimeout(renderArkenJourney,0);
    renderQuestUI();
    renderCompanions(data.player);
    renderCharacterSprite(data.player);
    arkenStartPhaser(data.player);
    const initialMap=data.player.currentMapId||'map_heng_yue'; const initialRegion=({'map_heng_yue':'GÖKSEL DAMAR TARİKATI · DIŞ AVLU','map_trial_valley':'DENEME VADİSİ','map_ji_ruins':'MERDİVEN TAŞI KALINTISI','map_suzaku':'SUZAKU ÜLKESİ'}[initialMap]||'GÖKSEL DAMAR TARİKATI · DIŞ AVLU');
    const ribbon=document.querySelector('.map-region-ribbon'); if(ribbon) ribbon.textContent=initialRegion;
    if (data.worldBoss) {
      document.getElementById('bossHp').innerText = data.worldBoss.currentHp;
      document.getElementById('bossHpBar').style.width = ((data.worldBoss.currentHp / data.worldBoss.maxHp) * 100) + "%";
      const bossHud = document.getElementById('arkenBossHpFill'); if (bossHud) bossHud.style.width = ((data.worldBoss.currentHp / data.worldBoss.maxHp) * 100) + '%';
    }
  });

  socket.on('force_logout', (reason) => { window.arkenWorld?.stop();
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    showModal("Oturum Sonlandırıldı", reason);
  });

  socket.on('player_updated', (player) => {
    renderPlayerUI(player);
    renderCultivationUI(player);
    renderAbodeGrid(player);
    renderSkillsUI(player);
    renderInventoryUI(player);
    renderCompanions(player);
    renderCharacterSprite(player);
    renderQuestUI();
    showToast("Karakter verileri güncellendi.", false);
  });


  // Görev günlüğü: görev verisi sunucudan gelir, filtre ve ödül işlemi burada görüntülenir.
  // Tek ekranlık oynanabilir başlangıç döngüsü: rehber → av → ganimet → görev ödülü → yetişim.
  let arkenGuideSeen=false;
  function arkenMainQuest(){return questData.find(q=>q.type==='main'&&!q.claimed&&!q.locked) || questData.find(q=>q.type==='main'&&!q.claimed);}
  function openArkenGuide(){
    const q=arkenMainQuest();arkenGuideSeen=true;
    const text=q?`${q.title}: ${q.story||q.desc}\n\nHedef: ${q.desc}`:'Tarikatın ilk sınavlarını tamamladın. Yeni bölgelerde daha güçlü düşmanlar seni bekliyor.';
    document.getElementById('arkenGuideText').textContent=text;
    document.getElementById('arkenGuideDialog').classList.remove('hidden');
    renderArkenJourney();
  }
  function closeArkenGuide(){document.getElementById('arkenGuideDialog').classList.add('hidden');}
  function renderArkenJourney(){
    const title=document.getElementById('arkenJourneyText'),progress=document.getElementById('arkenJourneyProgress'),btn=document.getElementById('arkenJourneyAction');
    if(!title||!progress||!btn)return;
    const q=arkenMainQuest();
    if(!q){title.textContent='İlk hikâye zincirini tamamladın!';progress.textContent='Yeni bölgeler açılıyor.';btn.textContent='Haritayı Aç';return;}
    title.textContent=q.title+' — '+q.desc;
    progress.textContent=`İlerleme: ${q.progress}/${q.targetCount}`;
    if(q.completed){btn.textContent='🎁 Görev Ödülünü Al';return;}
    if(!arkenGuideSeen){btn.textContent='📜 Tarikat Rehberi ile Konuş';return;}
    if(q.id==='q_heng_01'){btn.textContent='⚔️ Avlu Yaratığına Saldır';return;}
    if(q.id==='q_heng_02'){btn.textContent='🌿 Ruh Otu Topla';return;}
    if(q.id==='q_heng_03'){btn.textContent='🗺️ Deneme Vadisine Git';return;}
    btn.textContent='🗺️ Hikâye Bölgesini Aç';
  }
  function arkenJourneyNext(){
    const q=arkenMainQuest();
    if(!q){openPopup('mapTab','🗺️ Haritalar');return;}
    if(q.completed){socket.emit('claim_quest_reward',q.id);return;}
    if(!arkenGuideSeen){openArkenGuide();return;}
    if(q.id==='q_heng_01'){
      if((myData?.currentMapId||'map_heng_yue')!=='map_heng_yue'){socket.emit('travel_to_region','map_heng_yue');showToast('Avluya dönülüyor...');return;}
      socket.emit('start_battle_stage',1);return;
    }
    if(q.id==='q_heng_02'){socket.emit('gather_spirit_herb');return;}
    if(q.id==='q_heng_03'){
      if(myData?.currentMapId!=='map_trial_valley'){socket.emit('travel_to_region','map_trial_valley');return;}
      socket.emit('start_battle_stage',2);return;
    }
    openPopup('mapTab','🗺️ Haritalar');
  }
  socket.on('quests_updated',()=>setTimeout(renderArkenJourney,0));
  function setQuestFilter(filter) { questFilter = filter; renderQuestUI(); }
  function renderQuestUI() {
    renderArkenJourney();
    const host = document.getElementById('questList');
    const list = questData.filter(q => questFilter === 'all' || q.type === questFilter);
    if (host) {
      if (!list.length) host.innerHTML = '<div class="sub-text">Bu kategoride görev bulunmuyor.</div>';
      else host.innerHTML = list.map(q => {
        const pct = Math.min(100, Math.round((q.progress / q.targetCount) * 100));
        const type = q.type === 'main' ? 'Ana Görev' : q.type === 'daily' ? 'Günlük Görev' : 'Yetişim Görevi';
        const reward = `💎 ${q.reward.crystals} · 🌀 ${q.reward.energy} · XP ${q.reward.xp}`;
        const action = q.claimed ? '<button class="btn-sm" disabled>Ödül Alındı</button>' : q.locked ? '<button class="btn-sm" disabled>Kilitli</button>' : q.completed ? `<button class="btn-sm btn-jade" onclick="claimQuest('${q.id}')">Ödülü Al</button>` : '<button class="btn-sm" disabled>Devam Ediyor</button>';
        return `<div class="quest-card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${escapeHtml(q.title)}</b><span class="badge">${type}</span></div><div class="sub-text">${escapeHtml(q.chapter || type)} · ${escapeHtml(q.desc)}</div><div class="quest-story">“${escapeHtml(q.story || '')}”</div><div class="quest-progress"><div style="width:${pct}%"></div></div><div style="display:flex;justify-content:space-between;align-items:center;font-size:11px"><span>${q.progress} / ${q.targetCount}</span>${action}</div><div class="sub-text">Ödül: ${reward}</div></div>`;
      }).join('');
    }
    const mini = document.getElementById('arkenMiniQuestList');
    if (mini) {
      const active = questData.filter(q => !q.claimed && !q.locked).slice(0, 2);
      mini.innerHTML = active.length ? active.map(q => {
        const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.targetCount)) * 100));
        return `<div class="quest-mini"><strong>${escapeHtml(q.title)}</strong><small>${escapeHtml(q.desc)} · ${q.progress}/${q.targetCount}</small><div class="quest-progress"><div style="width:${pct}%"></div></div></div>`;
      }).join('') : '<div class="quest-mini"><strong>Yeni görev bulunmuyor</strong><small>Görevler sunucudan geldiğinde burada görünecek.</small></div>';
    }
  }
  function claimQuest(id) { socket.emit('claim_quest_reward', id); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  socket.on('quests_updated', data => { questData = Array.isArray(data) ? data : []; renderQuestUI(); });
  socket.on('region_changed', region => {
    if(myData) myData.currentMapId=region.mapId||region.id;
    const viewport=document.getElementById('gameMapViewport'); if(viewport) viewport.dataset.map=region.theme;
    const ribbon=document.querySelector('.map-region-ribbon'); if(ribbon) ribbon.textContent=(region.name||'Arken Dünyası').toLocaleUpperCase('tr-TR');
    window.arkenWorld?.setMap(region.mapId||region.id);updateCurrentRegionLabel(); showToast(`✦ ${region.name} bölgesine geçtin.`,false);
  });

  // Basit ama gerçek, katmanlı özgün SVG sprite: sınıf, zırh, miğfer ve silah görünüşe yansır.
  function renderCharacterSprite(player) {
    const host = document.getElementById('playerAvatarIcon'); if (!host || !player) return;
    const classAtlas = ({'Kılıç Ustası':'swordmaster','Ruh Büyücüsü':'spirit-mage','Gölge Suikastçısı':'assassin','Kadim Savaşçı':'ancient-warrior','İklim / Şifacı Ustası':'healer','Gök Ejderha Rahibi':'dragon-priest'}[player.className] || 'swordmaster');
    const atlasUrl = window.ARKEN_SPRITE_ATLAS_URL || `/assets/sprites/${classAtlas}.svg`;
    host.classList.add('sprite-atlas','sprite-idle'); host.style.backgroundImage = `url(${JSON.stringify(atlasUrl)})`; host.innerHTML=''; const equipped=player.equipment||{}; host.dataset.equipment=[equipped.weapon?'⚔':'',equipped.helmet?'◈':'',equipped.chest?'◆':''].filter(Boolean).join(' '); return;
    host.classList.remove('sprite-atlas'); host.style.backgroundImage=''; host.classList.add('sprite-idle');
    const eq = player.equipment || {};
    const classColor = player.className === 'Ruh Büyücüsü' ? '#536fc5' : player.className === 'Gölge Suikastçısı' ? '#62477f' : '#a64e36';
    const armorColor = eq.chest ? (eq.chest.rarity === 'LEGENDARY' ? '#d5a83c' : '#668d9a') : classColor;
    const helmet = eq.helmet ? '<path d="M17 17Q28 -1 40 17L38 23H19Z" fill="#c4a76c" stroke="#f1d79a" stroke-width="2"/><path d="M18 20h21" stroke="#392f27" stroke-width="3"/>' : '';
    const weapon = eq.weapon ? '<path d="M48 26 55 4 58 6 52 29 49 42 46 40Z" fill="#dce8ec" stroke="#6f8790" stroke-width="1.5"/><path d="M44 40 53 43" stroke="#b78a42" stroke-width="4"/>' : '<path d="M49 27 54 12 57 14 53 31" stroke="#b78a42" stroke-width="3"/>';
    const gloves = eq.gloves ? '<path d="M13 38h8v8h-8zM39 38h8v8h-8z" fill="#d4b46d"/>' : '';
    const necklace = eq.necklace ? '<path d="M25 30Q32 38 39 30" fill="none" stroke="#e4c56e" stroke-width="2"/><path d="M32 35l-3 4 3 4 3-4z" fill="#55d4d0" stroke="#f2d88d"/>' : '';
    const ring = eq.ring ? '<circle cx="49" cy="45" r="3" fill="none" stroke="#f3d16f" stroke-width="2"/>' : '';
    const accessory = eq.accessory ? '<path d="M12 25Q3 18 8 12Q16 14 18 22M52 25Q61 18 56 12Q48 14 46 22" fill="#7fd6d0" stroke="#d6f5e8" stroke-width="1.5"/>' : '';
    const boots = eq.boots ? '#c7a66a' : '#382c31';
    host.innerHTML = `<svg viewBox="0 0 64 70" aria-label="${escapeHtml(player.className)} karakter sprite"><ellipse cx="32" cy="66" rx="18" ry="3" fill="#0008"/><path d="M20 34 9 53 18 57 27 42M39 35 51 53 43 57 35 42" fill="${boots}" stroke="#211b22" stroke-width="2"/><path d="M21 27Q32 20 43 27L46 48Q32 56 18 48Z" fill="${armorColor}" stroke="#d9c08a" stroke-width="2"/><path d="M25 28 32 38 39 28" fill="none" stroke="#f0d9a1" stroke-width="2"/><path d="M18 30 12 43 18 46 25 35M44 30 50 43 44 46 39 35" fill="${armorColor}" stroke="#d9c08a" stroke-width="2"/>${gloves}<path d="M22 16Q32 5 42 16L40 29Q32 35 24 29Z" fill="#d9a77d" stroke="#563d36" stroke-width="2"/><path d="M21 17Q19 5 33 5Q44 5 43 18L39 14 26 14Z" fill="#332b35"/>${helmet}<path d="M25 24h3M36 24h3" stroke="#29212a" stroke-width="2"/>${weapon}</svg>`;
  }

  // Yoldaşlar haritada ayrı SVG karakterlerdir; oyuncu hareket ettikçe yumuşak biçimde peşinden gelir.
  function renderCompanions(player) {
    const layer = document.getElementById('companionLayer'); if (!layer || !player) return;
    const defs = [
      {id:'lin',name:'Lin',robe:'#4b9d8c',hair:'#d7b46b',dx:-34,dy:12},
      {id:'kael',name:'Kael',robe:'#9b6542',hair:'#49352b',dx:34,dy:16},
      {id:'veyra',name:'Veyra',robe:'#69528e',hair:'#27243b',dx:0,dy:48}
    ];
    const levels = player.retainers || {};
    layer.innerHTML = defs.filter(d => Number(levels[d.id] || 0) > 0).map(d => `<div class="companion-follow" id="follower_${d.id}"><div class="companion-name">${d.name} · Sv.${levels[d.id] || 1}</div><svg viewBox="0 0 40 48"><path d="M10 46 14 23 26 23 30 46Z" fill="${d.robe}" stroke="#d7c18a" stroke-width="1.5"/><circle cx="20" cy="14" r="8" fill="#d9a982"/><path d="M11 15Q9 2 21 4Q31 4 29 17L25 11 14 11Z" fill="${d.hair}"/><path d="M15 23 20 30 25 23" fill="none" stroke="#f0d6aa" stroke-width="2"/></svg></div>`).join('');
    companionNodes = Object.fromEntries(defs.map(d => [d.id, d]));
    positionCompanions();
  }
  function positionCompanions() {
    const layer = document.getElementById('companionLayer'); if (!layer) return;
    const offsets = {lin:{x:-35,y:10},kael:{x:35,y:15},veyra:{x:0,y:48}};
    Object.entries(offsets).forEach(([id,o]) => { const el=document.getElementById('follower_'+id); if(el){el.style.left=(currentPos.x+o.x)+'px';el.style.top=(currentPos.y+o.y)+'px';} });
  }

  // LEGEND ONLINE TARZI 2D HARİTA HAREKET SİSTEMİ (CLICK-TO-MOVE / TWEEN)
  let arkenMapGeometry = {};
  fetch('/assets/map_geometry.json').then(r=>r.json()).then(data=>arkenMapGeometry=data).catch(()=>{});
  function arkenFindRoute(start,goal,rect){
    const map=arkenMapGeometry[myData?.currentMapId||'map_heng_yue'];
    if(!map?.obstacles?.length)return [goal];
    const cols=32,rows=18;
    const node=(x,y)=>`${x},${y}`;
    const gridX=x=>Math.max(0,Math.min(cols-1,Math.floor(x/rect.width*cols)));
    const gridY=y=>Math.max(0,Math.min(rows-1,Math.floor(y/rect.height*rows)));
    const blocked=(x,y)=>map.obstacles.some(o=>(x+.5)/cols>=o.x&&(x+.5)/cols<=o.x+o.w&&(y+.5)/rows>=o.y&&(y+.5)/rows<=o.y+o.h);
    const sx=gridX(start.x),sy=gridY(start.y),gx=gridX(goal.x),gy=gridY(goal.y);
    if(blocked(gx,gy))return [];
    const queue=[[sx,sy]],seen=new Set([node(sx,sy)]),parent=new Map();
    for(let index=0;index<queue.length;index++){
      const [x,y]=queue[index];if(x===gx&&y===gy)break;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,ny=y+dy,k=node(nx,ny);
        if(nx<0||ny<0||nx>=cols||ny>=rows||blocked(nx,ny)||seen.has(k))continue;
        seen.add(k);parent.set(k,node(x,y));queue.push([nx,ny]);
      }
    }
    if(!seen.has(node(gx,gy)))return [];
    const path=[];let key=node(gx,gy);while(key!==node(sx,sy)){const [x,y]=key.split(',').map(Number);path.push({x:(x+.5)/cols*rect.width,y:(y+.5)/rows*rect.height});key=parent.get(key);if(!key)break;}
    path.reverse();path.push(goal);return path;
  }
  let arkenRoute=[];
  let arkenRouteInterval=null;
  function arkenSendRoutePoint(rect){
    if(!arkenRoute.length){clearInterval(arkenRouteInterval);arkenRouteInterval=null;return;}
    const next=arkenRoute.shift();targetPos.x=next.x;targetPos.y=next.y;
    socket.emit('player_move',{x:next.x,y:next.y,mapId:myData?.currentMapId||'map_heng_yue',viewportWidth:rect.width,viewportHeight:rect.height});
  }
  function handleMapClick(event) {
    if(window.arkenWorld) return; // Phaser controls clicks when loaded.
    ArkenSprite.setState('flight',1100);
    const rect = document.getElementById('gameMapViewport').getBoundingClientRect();
    const goal={x:event.clientX-rect.left,y:event.clientY-rect.top};
    arkenRoute=arkenFindRoute(currentPos,goal,rect);
    if(!arkenRoute.length){showToast('Bu noktaya yürüyüş yolu bulunamadı.',false);return;}
    clearInterval(arkenRouteInterval);
    arkenSendRoutePoint(rect);
    arkenRouteInterval=setInterval(()=>arkenSendRoutePoint(rect),220);
    const trail = document.createElement('i'); trail.className='flight-swoosh'; trail.style.left=currentPos.x+'px'; trail.style.top=currentPos.y+'px'; trail.style.transform=`rotate(${Math.atan2(targetPos.y-currentPos.y,targetPos.x-currentPos.x)}rad)`; document.getElementById('flightTrailLayer')?.appendChild(trail); setTimeout(()=>trail.remove(),550);
  }

  socket.on('player_position_corrected', (pos) => { window.arkenWorld?.correct(pos); if(!pos)return; targetPos.x=pos.x;targetPos.y=pos.y; });
  socket.on('player_moved', (data) => {
    window.arkenWorld?.remote(data.id,data.username,Number(data.x),Number(data.y));
    if(window.arkenWorld)return;
    let remoteEl = document.getElementById(`remote_${data.id}`);
    if (!remoteEl) {
      const container = document.getElementById('remotePlayersContainer');
      remoteEl = document.createElement('div');
      remoteEl.id = `remote_${data.id}`;
      remoteEl.style.position = 'absolute';
      remoteEl.style.transform = 'translate(-50%, -100%)';
      remoteEl.style.transition = 'left 0.1s linear, top 0.1s linear';
      remoteEl.innerHTML = `<div style="font-size:9px;color:#ffe6a5;text-align:center;font-weight:bold;text-shadow:0 2px 4px #000">${escapeHtml(data.username)}</div><div class="remote-flying-avatar" style="font-size:32px;filter:drop-shadow(0 0 8px #8bcfff)">🧙🏻‍♂️</div><div style="width:34px;height:4px;background:linear-gradient(90deg,transparent,#a8dcff,transparent);margin:auto"></div>`;
      container.appendChild(remoteEl);
    }
    remoteEl.style.left = data.x + 'px';
    remoteEl.style.top = data.y + 'px';
  });

  // Ayrı sistem ekranları: kaynak DOM taşınır; ID'ler ve Socket güncellemeleri tek kalır.
  let activeSystemTab = null;
  let activeSystemPlaceholder = null;
  function openPopup(tabId, titleText) {
    const modal = document.getElementById('popupModalWindow');
    const content = document.getElementById('popupModalContent');
    const sourceEl = document.getElementById(tabId);
    if (!sourceEl || !content) return;
    if (activeSystemTab) closePopupModal();
    activeSystemPlaceholder = document.createComment('system-tab-placeholder');
    sourceEl.parentNode.insertBefore(activeSystemPlaceholder, sourceEl);
    content.innerHTML = '';
    const head = document.createElement('div'); head.className = 'system-screen-head';
    const back = document.createElement('button'); back.className = 'system-back'; back.textContent = '← Geri'; back.onclick = closePopupModal;
    const title = document.createElement('div'); title.innerHTML = `<div class="system-screen-title">${escapeHtml(titleText || 'Sistem')}</div><div class="system-screen-subtitle">Arken Dünyası · Sistem Merkezi</div>`;
    head.append(back,title); content.append(head,sourceEl); activeSystemTab = sourceEl;
    sourceEl.classList.remove('hidden'); modal.classList.remove('hidden');
    if (tabId === 'bossTab') socket.emit('request_boss_status');
    if (tabId === 'socialTab') socket.emit('get_leaderboard');
    if (tabId === 'mapTab') updateCurrentRegionLabel();
  }
  function closePopupModal() {
    const modal = document.getElementById('popupModalWindow');
    if (activeSystemTab && activeSystemPlaceholder?.parentNode) {
      activeSystemPlaceholder.parentNode.insertBefore(activeSystemTab, activeSystemPlaceholder);
      activeSystemPlaceholder.remove();
    }
    activeSystemTab = null; activeSystemPlaceholder = null;
    document.getElementById('popupModalContent').innerHTML = '';
    modal.classList.add('hidden');
  }
  function updateCurrentRegionLabel(){const el=document.getElementById('currentRegionLabel');if(el&&myData)el.textContent=({map_heng_yue:'Göksel Damar Tarikatı',map_trial_valley:'Deneme Vadisi',map_ji_ruins:'Merdiven Taşı Kalıntısı',map_suzaku:'Kızıl Kanat Ülkesi'}[myData.currentMapId]||'Göksel Damar Tarikatı');}
  let inventoryFilter = 'all';
  function setInventoryFilter(filter, button){inventoryFilter=filter;document.querySelectorAll('.inventory-category').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(myData)renderInventoryUI(myData);}

  const CULTIVATION_REALMS = [
    { id: 1, name: "Öz Duyumu", subSteps: 3, reqEnergyPerStep: 200, breakthroughCost: { crystals: 100, spiritStones: 10 }, successRate: 100 },
    { id: 2, name: "Ruh Damarı Açılımı", subSteps: 4, reqEnergyPerStep: 500, breakthroughCost: { crystals: 250, spiritStones: 25 }, successRate: 90 },
    { id: 3, name: "Çekirdek Oluşumu", subSteps: 5, reqEnergyPerStep: 1200, breakthroughCost: { crystals: 500, spiritStones: 50 }, successRate: 80 },
    { id: 4, name: "Ruh Dönüşümü", subSteps: 5, reqEnergyPerStep: 3000, breakthroughCost: { crystals: 1200, spiritStones: 120 }, successRate: 70 },
    { id: 5, name: "Yükseliş", subSteps: 6, reqEnergyPerStep: 7500, breakthroughCost: { crystals: 2500, spiritStones: 250 }, successRate: 60 },
    { id: 6, name: "Göksel Dönüşüm", subSteps: 6, reqEnergyPerStep: 18000, breakthroughCost: { crystals: 5000, spiritStones: 500 }, successRate: 50 },
    { id: 7, name: "Âlem Kırılması", subSteps: 7, reqEnergyPerStep: 40000, breakthroughCost: { crystals: 10000, spiritStones: 1000 }, successRate: 40 },
    { id: 8, name: "Kadim Varlık", subSteps: 7, reqEnergyPerStep: 90000, breakthroughCost: { crystals: 22000, spiritStones: 2200 }, successRate: 30 },
    { id: 9, name: "İlk Öz Hâkimiyeti", subSteps: 9, reqEnergyPerStep: 200000, breakthroughCost: { crystals: 50000, spiritStones: 5000 }, successRate: 20 }
  ];

  function renderCultivationUI(player) {
    const realmIdx = player.cultivationRealmIndex || 0;
    const realmData = CULTIVATION_REALMS[realmIdx] || CULTIVATION_REALMS[0];

    const rNameEl = document.getElementById('cultRealmName');
    if (rNameEl) {
      rNameEl.innerText = realmData.name;
      document.getElementById('cultStepText').innerText = `Basamak: ${player.cultivationSubStep || 1} / ${realmData.subSteps}`;
      document.getElementById('curCultEnergy').innerText = player.cultivationEnergy || 0;
      document.getElementById('maxCultEnergy').innerText = realmData.reqEnergyPerStep;
      const pct = Math.min(100, ((player.cultivationEnergy || 0) / realmData.reqEnergyPerStep) * 100);
      document.getElementById('cultEnergyBar').style.width = pct + "%";
      document.getElementById('reqCrystals').innerText = realmData.breakthroughCost.crystals;
      document.getElementById('reqStones').innerText = realmData.breakthroughCost.spiritStones;
      document.getElementById('successRate').innerText = realmData.successRate;
    }
  }

  const ABODE_CONFIG_CLIENT = {
    spiritRoom: { name: "Ruh Odası", icon: "🧘‍♂️", reqLvl: 1, reqRealm: 0 },
    essencePool: { name: "Öz Havuzu", icon: "🌊", reqLvl: 1, reqRealm: 0 },
    alchemyRoom: { name: "Simya Odası", icon: "⚗️", reqLvl: 5, reqRealm: 1 },
    forge: { name: "Demirci", icon: "⚒️", reqLvl: 10, reqRealm: 1 }
  };

  function renderAbodeGrid(player) {
    const grid = document.getElementById('abodeGrid');
    if (!grid) return;
    grid.innerHTML = "";

    const playerLvl = player.level || 1;
    const playerRealm = player.cultivationRealmIndex || player.realmIndex || 0;
    const buildings = player.abodeBuildings || {};

    Object.entries(ABODE_CONFIG_CLIENT).forEach(([id, cfg]) => {
      const bData = buildings.get ? buildings.get(id) : buildings[id] || { level: 0 };
      const isUnlocked = playerLvl >= cfg.reqLvl && playerRealm >= cfg.reqRealm;
      const currentLvl = bData.level || (isUnlocked ? 1 : 0);

      if (!isUnlocked) {
        grid.innerHTML += `<div style="background:#13131d88; border:1px dashed #444; border-radius:8px; padding:10px; text-align:center; opacity:0.6;"><div style="font-size:22px;">🔒</div><b style="font-size:11px; color:#888;">${cfg.name}</b><span class="sub-text" style="color:#e74c3c;">Sv. ${cfg.reqLvl} Gerekir</span></div>`;
      } else {
        grid.innerHTML += `<div style="background:#161622; border:1px solid #383850; border-radius:8px; padding:10px; text-align:center;"><div style="font-size:24px;">${cfg.icon}</div><b style="font-size:12px; color:#f5b942;">${cfg.name}</b><span class="sub-text" style="color:#5ce1e6;">Seviye: ${currentLvl}</span><button class="btn-sm" style="margin-top:6px; width:100%;" onclick="socket.emit('upgrade_abode_building', '${id}')">Yükselt</button></div>`;
      }
    });
  }

  const CLIENT_CLASS_SKILLS = {
    "Kılıç Ustası": [
      {id:"s1",name:"Ji Kılıç Sanatı",manaCost:24,cooldown:4,desc:"Kılıç özünü tek çizgide yoğunlaştırır."},
      {id:"s2",name:"Yıldırım Kılıcı",manaCost:42,cooldown:7,desc:"Gök gürültüsüyle güçlenen delici darbe."},
      {id:"s3",name:"Bin Kılıç Dizisi",manaCost:72,cooldown:12,desc:"Ruh kılıçlarından oluşan saldırı dizisi."},
      {id:"s4",name:"Ji Âlemi: Kesin Hüküm",manaCost:115,cooldown:20,desc:"Kılıç iradesini mutlaklaştırır."}
    ],
    "Ruh Büyücüsü": [
      {id:"m1",name:"Yasak Ruh Büyüsü",manaCost:32,cooldown:5,desc:"Hedefin ruh özüne saldırır."},
      {id:"m2",name:"Cehennem Alevi",manaCost:55,cooldown:8,desc:"Kızıl alevleri patlatır."},
      {id:"m3",name:"Ruh Mührü",manaCost:82,cooldown:13,desc:"Ruh damarlarını baskılar."},
      {id:"m4",name:"Dokuz Gök Yıldırım Çağrısı",manaCost:135,cooldown:22,desc:"Göksel yıldırımı çağırır."}
    ],
    "Gölge Suikastçısı": [
      {id:"a1",name:"Kan İçen Parmak",manaCost:22,cooldown:4,desc:"Yaşam özünü emen dokunuş."},
      {id:"a2",name:"Ölümcül Gölge Adımı",manaCost:44,cooldown:7,desc:"Gölgeden arkadan saldırır."},
      {id:"a3",name:"Kanlı Ruh Kesiti",manaCost:76,cooldown:12,desc:"Yüksek kritik ihtimalli kesiş."},
      {id:"a4",name:"Gece Hükmü",manaCost:125,cooldown:21,desc:"Karanlık özle infaz eder."}
    ],
    "Kadim Savaşçı": [
      {id:"w1",name:"Dağ Mührü Yumruğu",manaCost:22,cooldown:4,desc:"Toprak özünü yumruğa toplar."},
      {id:"w2",name:"Demir Beden Sanatı",manaCost:40,cooldown:9,desc:"Savunma ve kalkan sağlar."},
      {id:"w3",name:"Kanlı Savaş İradesi",manaCost:68,cooldown:13,desc:"Savaş gücünü artırır."},
      {id:"w4",name:"Kadim Dağ Çöküşü",manaCost:112,cooldown:20,desc:"Ezici bir darbe indirir."}
    ],
    "İklim / Şifacı Ustası": [
      {id:"p1",name:"Yeşim Yaşam Nefesi",manaCost:32,cooldown:5,desc:"Can özünü yeniler."},
      {id:"p2",name:"Zehirli Sis Formasyonu",manaCost:52,cooldown:9,desc:"Zehirli ruh sisi yayar."},
      {id:"p3",name:"Altın İksir Aurası",manaCost:74,cooldown:14,desc:"Müttefikleri güçlendirir."},
      {id:"p4",name:"Ölümsüzlük Pınarı",manaCost:128,cooldown:22,desc:"İyileştirme ve koruma sağlar."}
    ],
    "Gök Ejderha Rahibi": [
      {id:"d1",name:"Ejderha Pençesi Mührü",manaCost:26,cooldown:4,desc:"Kadim ejderha pençesi."},
      {id:"d2",name:"Kızıl Ejder Nefesi",manaCost:52,cooldown:8,desc:"Alevli ejderha nefesi."},
      {id:"d3",name:"Gök Pulu Zırhı",manaCost:78,cooldown:13,desc:"Ruh kalkanı oluşturur."},
      {id:"d4",name:"Dokuz Gök Ejderha Öfkesi",manaCost:138,cooldown:22,desc:"Ejderha özünü serbest bırakır."}
    ]
  };

  function renderSkillsUI(player) {
    const charClassEl = document.getElementById('charClassName');
    if (!charClassEl) return;
    charClassEl.innerText = player.className;
    document.getElementById('pMana').innerText = player.mana ?? 200;
    document.getElementById('pMaxMana').innerText = player.maxMana ?? 200;

    const slotList = document.getElementById('skillSlotList');
    slotList.innerHTML = "";
    const skills = CLIENT_CLASS_SKILLS[player.className] || CLIENT_CLASS_SKILLS["Kılıç Ustası"];
    skills.forEach(skill => {
      slotList.innerHTML += `<div class="row" style="background:#13131d;padding:8px;border-radius:6px;margin-bottom:6px;"><div><b>⚡ ${skill.name}</b><span class="sub-text">${skill.desc} · Mana ${skill.manaCost} · Bekleme ${skill.cooldown} sn</span></div><button class="btn-sm" onclick="ArkenSprite.setState('cast',850);socket.emit('use_active_skill','${skill.id}')">Kullan</button></div>`;
    });
    const aura=document.getElementById('passiveAuraInfo');
    if(aura){const lib=player.abodeBuildings?.ancientLibrary?.level||0, lin=player.retainers?.lin||0, kael=player.retainers?.kael||0, veyra=player.retainers?.veyra||0; const pct=Math.min(18,lib*1.2+kael*.4+veyra*.3+lin*.2); aura.innerHTML=`📜 Kadim Kütüphane Lv.${lib}: +${(lib*1.2).toFixed(1)}% teknik gücü<br>🧪 Lin Lv.${lin}: +${(lin*.2).toFixed(1)}% öz verimi<br>⚔️ Kael Lv.${kael}: +${(kael*.4).toFixed(1)}% savaş gücü<br>🌙 Veyra Lv.${veyra}: +${(veyra*.3).toFixed(1)}% kritik/aura desteği<br><b style="color:#e6c477">Toplam pasif teknik çarpanı: +${pct.toFixed(1)}%</b>`;}

  }

  const CLIENT_ITEM_NAMES = {
    eq_iron_sword: "🗡️ Demir Uçlu Kılıç",
    eq_jade_blade: "⚔️ Yeşim Ejderha Kılıcı",
    eq_heaven_armor: "🛡️ Göksel Çelik Zırh",
    eq_divine_sword: "✨ İlk Öz İlahi Kılıcı",
    mat_spirit_herb: "🌿 Ruh Otu", mat_iron_fragment: "⚒️ Demir Parçası", mat_healing_pill: "❤️ Can Hapı", mat_ji_fragment: "🔮 Kadim Ruh Özü Parçası", mat_armor_blueprint: "📜 Nadir Zırh Taslağı", mat_inverse_scale: "🐉 Tersine Dönüş Boncuğu Parçası"
  };

  const SLOT_LABELS = { weapon: "Silah", helmet: "Miğfer", chest: "Zırh", gloves: "Eldiven", boots: "Çizme", necklace: "Kolye", ring: "Yüzük", accessory: "Aksesuar" };

  function renderInventoryUI(player) {
    const eqGrid = document.getElementById('equippedSlotsGrid');
    const invGrid = document.getElementById('inventoryGrid');
    if (!eqGrid || !invGrid) return;

    eqGrid.innerHTML = "";
    const eq = player.equipment || {};
    Object.entries(SLOT_LABELS).forEach(([slot, label]) => {
      const item = eq[slot];
      if (item) {
        const name = CLIENT_ITEM_NAMES[item.itemId] || item.itemId;
        eqGrid.innerHTML += `<div style="background:#161622; border:1px solid #f5b942; border-radius:6px; padding:6px;"><div style="color:#aaa; font-size:10px;">${label}</div><b style="color:#5ce1e6; font-size:11px;">${name}</b><button class="btn-sm" style="margin-top:4px; width:100%;" onclick="socket.emit('enhance_equipment', { type: 'equipped', targetId: '${slot}' })">+ Bas</button></div>`;
      } else {
        eqGrid.innerHTML += `<div style="background:#13131d; border:1px dashed #333; border-radius:6px; padding:6px; color:#666;"><div style="font-size:10px;">${label}</div><div>Boş</div></div>`;
      }
    });

    const inv = player.inventory || [];
    document.getElementById('invCount').innerText = inv.length;
    document.getElementById('invMax').innerText = player.inventoryCapacity || 40;
    invGrid.innerHTML = "";

    inv.forEach(item => {
      const name = CLIENT_ITEM_NAMES[item.itemId] || item.itemId;
      const isEq = item.itemId && item.itemId.startsWith('eq_');
      const isConsumable = ['mat_healing_pill','pills_qi_gathering'].includes(item.itemId);
      const category = isEq ? 'equipment' : (isConsumable ? 'consumable' : 'material');
      if (inventoryFilter !== 'all' && inventoryFilter !== category) return;
      invGrid.innerHTML += `<div style="background:#161622; border:1px solid #383850; border-radius:6px; padding:6px; text-align:center; font-size:11px;"><b style="color:#f5b942;">${name}</b>${isEq ? `<button class="btn-sm btn-jade" style="margin-top:4px;width:100%" onclick="socket.emit('equip_item','${item.itemUUID}')">Kuşan</button>` : (['mat_healing_pill','pills_qi_gathering'].includes(item.itemId) ? `<button class="btn-sm btn-jade" style="margin-top:4px;width:100%" onclick="socket.emit('use_consumable','${item.itemUUID}')">Kullan · ${item.count||1}</button>` : `<small style="display:block;color:#aaa;margin-top:4px">Adet: ${item.count||1}</small>`)}</div>`;
    });
  }

  // Sefer Savaş Dinleyicileri
  let arkenCombatAuto = false;
  let arkenCombatTimer = null;
  let arkenCombatSkills = [];
  let arkenCombatActive = false;
  function closeCombatScene(){ window.arkenBattle?.end(); arkenCombatAuto=false; clearInterval(arkenCombatTimer); arkenCombatTimer=null; document.getElementById('arkenCombatScene').classList.add('hidden'); }
  function toggleCombatAuto(){arkenCombatAuto=!arkenCombatAuto;const btn=document.getElementById('combatAutoBtn');btn.textContent=arkenCombatAuto?'■ Otomatik Savaşı Durdur':'▶ Otomatik Savaş';clearInterval(arkenCombatTimer);if(arkenCombatAuto){arkenCombatTimer=setInterval(()=>{if(!arkenCombatActive||!arkenCombatSkills.length)return;socket.emit('battle_use_skill',arkenCombatSkills[0].id);},2100);}}
  function arkenCombatAnimate(battle){
    window.arkenBattle?.update(battle);
    const hp=(id,value,max)=>{const el=document.getElementById(id);if(el)el.style.width=Math.max(0,Math.min(100,100*value/Math.max(1,max)))+'%';};
    hp('combatHeroHealth',battle.playerHp,battle.playerMaxHp);hp('combatEnemyHealth',battle.enemyHp,battle.enemyMaxHp);
    if(battle.lastLog){document.getElementById('combatMessage').textContent=battle.lastLog;const hero=document.getElementById('combatHero'),foe=document.getElementById('combatEnemy');hero.classList.remove('strike');foe.classList.remove('hurt');void hero.offsetWidth;hero.classList.add('strike');foe.classList.add('hurt');const fx=document.getElementById('combatEffects');fx.textContent='⚡';setTimeout(()=>{fx.textContent='';hero.classList.remove('strike');foe.classList.remove('hurt');},690);}
  }
  socket.on('battle_started', (battle) => {
    arkenCombatActive=true;
    document.getElementById('arkenCombatScene').classList.remove('hidden');
    arkenStartBattlePhaser(battle);
    document.getElementById('combatSceneTitle').textContent=battle.stageName;
    document.getElementById('combatHeroName').textContent=myData?.username||'Yetişimci';
    document.getElementById('combatEnemyName').textContent=battle.enemyName;
    document.getElementById('combatEnemyFigure').textContent=battle.isBoss?'🐉':battle.stageId===2?'🌳':'🐺';
    arkenCombatSkills=CLIENT_CLASS_SKILLS[myData?.className]||CLIENT_CLASS_SKILLS['Kılıç Ustası'];
    document.getElementById('combatAbilityButtons').replaceChildren(...arkenCombatSkills.map((skill,index)=>{const b=document.createElement('button');b.textContent=`${index+1} · ${skill.name}`;b.onclick=()=>socket.emit('battle_use_skill',skill.id);return b;}));
    arkenCombatAnimate(battle);

    document.getElementById('stageSelectContainer').classList.add('hidden');
    document.getElementById('activeBattleArena').classList.remove('hidden');
    document.getElementById('bossWarningBanner').classList.add('hidden');
    document.getElementById('battleStageTitle').innerText = "⚔️ " + battle.stageName;
    document.getElementById('arenaPlayerName').innerText = myData ? myData.username : "Kahraman";
    document.getElementById('arenaEnemyName').innerText = battle.enemyName;
    document.getElementById('battleLogBox').innerHTML = `<div>🔥 <b>${battle.enemyName}</b> karşına çıktı!</div>`;
    updateBattleBars(battle);

    const skillBar = document.getElementById('battleSkillBar');
    skillBar.innerHTML = "";
    const className = myData ? myData.className : "Kılıç Ustası";
    const skills = CLIENT_CLASS_SKILLS[className] || CLIENT_CLASS_SKILLS["Kılıç Ustası"];
    skills.forEach(s => {
      skillBar.innerHTML += `<button class="btn-sm btn-blue" onclick="ArkenSprite.setState('attack',650);socket.emit('battle_use_skill', '${s.id}')">⚡ ${s.name} (${s.manaCost} MP)</button>`;
    });
  });

  socket.on('battle_tick_update', (battle) => {
    arkenCombatAnimate(battle);
    updateBattleBars(battle);
    if (battle.lastLog) {
      const log = document.getElementById('battleLogBox');
      log.innerHTML = `<div>${battle.lastLog}</div>` + log.innerHTML;
    }
  });

  socket.on('boss_phase_shift', (data) => {
    const banner = document.getElementById('bossWarningBanner');
    banner.classList.remove('hidden');
    banner.innerText = data.message;
  });

  socket.on('battle_ended', (res) => {
    arkenCombatActive=false;closeCombatScene();
    showToast(res.message, false);
    quitBattle();
    if(res.success){setTimeout(()=>{renderArkenJourney();showToast("Zafer! Ganimetin çantana eklendi. Görev ilerlemeni kontrol et.",false);},200);}
  });

  function updateBattleBars(battle) {
    const pPct = Math.max(0, Math.min(100, (battle.playerHp / battle.playerMaxHp) * 100));
    const ePct = Math.max(0, Math.min(100, (battle.enemyHp / battle.enemyMaxHp) * 100));
    document.getElementById('arenaPlayerHpFill').style.width = pPct + "%";
    document.getElementById('arenaPlayerHpText').innerText = `${battle.playerHp} / ${battle.playerMaxHp}`;
    document.getElementById('arenaEnemyHpFill').style.width = ePct + "%";
    document.getElementById('arenaEnemyHpText').innerText = `${battle.enemyHp} / ${battle.enemyMaxHp}`;
  }

  function quitBattle() {
    document.getElementById('activeBattleArena').classList.add('hidden');
    document.getElementById('stageSelectContainer').classList.remove('hidden');
    document.getElementById('battleStageTitle').innerText = "⚔️ Sefer Arenası";
  }

  socket.on('action_notification', (msg) => showToast(msg, false));
  socket.on('divine_loot_drop', data => {
    const old=document.querySelector('.divine-loot-toast'); if(old) old.remove();
    const el=document.createElement('div'); el.className='divine-loot-toast';
    const names=(data.items||[]).map(i=>escapeHtml(i.name)).join(' · ') || 'Kadim ganimet';
    el.innerHTML=`<strong>✦ ${escapeHtml(data.title || 'İLAHİ HAZİNE DÜŞTÜ!')} ✦</strong><small>${escapeHtml(data.boss || 'Kadim düşman')}<br>${names}</small>`;
    document.body.appendChild(el); setTimeout(()=>el.remove(),4200);
  });

  function quickStartBattle() {
    // Mevcut sunucu sefer sistemiyle uyumlu ilk aşamayı başlatır.
    socket.emit('start_battle_stage', 1);
    showToast('⚔️ İlk sefer başlatılıyor...', false);
  }

  function attackBoss() {
    if (!myData) return;
    ArkenSprite.setState('attack',700);
    socket.emit('attack_world_boss');
  }


  socket.on('world_boss_update', (data) => {
    document.getElementById('bossHp').innerText = data.currentHp;
    const pct = Math.max(0, (data.currentHp / data.maxHp) * 100);
    document.getElementById('bossHpBar').style.width = pct + "%";
    const bossHud = document.getElementById('arkenBossHpFill'); if (bossHud) bossHud.style.width = pct + '%';
    const log = document.getElementById('bossLog');
    log.innerHTML = `<div>⚔️ <b>${data.lastAttacker}</b>, ${data.damageDealt} hasar vurdu!</div>` + log.innerHTML;
  });

  socket.on('boss_status', (boss) => { updateBossStatus(boss); });
  socket.on('boss_schedule_update', (boss) => { updateBossStatus(boss); });
  function updateBossStatus(boss){
    const hp=document.getElementById('bossHp'); if(hp)hp.innerText=boss.currentHp;
    const bar=document.getElementById('bossHpBar'); if(bar)bar.style.width=(boss.isAlive?((boss.currentHp/boss.maxHp)*100):0)+'%';
    const schedule=document.getElementById('bossScheduleInfo'); if(schedule){const when=boss.nextSpawnAt?new Date(boss.nextSpawnAt).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}):'Her gün 21:00';schedule.textContent=boss.isAlive?'Boss şu anda dünyada. Günlük yenileme: '+when+' (Türkiye saati)':'Boss yenildi. Sonraki ortaya çıkış: '+when+' (Türkiye saati)';}
  }
  socket.on('world_boss_respawn', (boss) => {
    updateBossStatus(boss);
    document.getElementById('bossHp').innerText = boss.currentHp;
    document.getElementById('bossHpBar').style.width = "100%";
    const bossHud = document.getElementById('arkenBossHpFill'); if (bossHud) bossHud.style.width = '100%';
    showToast(`🐉 ${boss.name} yeniden doğdu!`, false);
  });

  socket.on('world_boss_defeated', (data) => {
    showModal("🎉 Dünya Bossu Yenildi!", `${data.bossName}, ${data.killer} tarafından alt edildi!\nÖdül: ${data.reward}`);
  });

  socket.on('update_players', (players) => {
    const list = document.getElementById('playerList');
    if(window.arkenWorld){const ids=new Set(Object.keys(players));for(const id of (window.arkenKnownRemoteIds||[]))if(!ids.has(id))window.arkenWorld.removeRemote(id);window.arkenKnownRemoteIds=ids;}
    if (!list) return;
    list.innerHTML = "";
    let count = 0;
    Object.values(players).forEach(p => {
      if (p.id !== socket.id) {
        count++;
        list.innerHTML += `<div class="row"><span><b>${p.username}</b><span class="sub-text">${p.className} • Güç: ${p.power}</span></span><button class="btn-sm" onclick="socket.emit('send_pvp_challenge','${p.id}')">Düello</button></div>`;
      }
    });
    if (count === 0) list.innerHTML = `<p style="text-align:center; font-size:12px; color:#777;">Şu an başka çevrimiçi rakip yok.</p>`;
  });

  socket.on('pvp_challenge_received', (data) => {
    showModal("⚔️ Düello Teklifi", `${data.challengerName} (Güç: ${data.challengerPower}) sana düello teklif etti!`, () => socket.emit('accept_pvp_challenge', { challengerId: data.challengerId }));
  });

  socket.on('pvp_battle_ended', (res) => {
    showModal("⚔️ Düello Sonucu", `Kazanan: ${res.winner}\nKaybeden: ${res.loser}\nÖdül: ${res.reward}\nTur sayısı: ${(res.rounds||[]).length}`);
  });

  function createGuild() {
    const gName = document.getElementById('guildNameInput').value.trim();
    if (!gName) return showModal("Eksik Bilgi", "Lütfen kurmak istediğin tarikat adını yaz.");
    socket.emit('create_guild', { guildName: gName });
  }

  function joinGuild() {
    const gName = document.getElementById('guildNameInput').value.trim();
    if (!gName) return showModal("Eksik Bilgi", "Lütfen katılmak istediğin tarikat adını yaz.");
    socket.emit('join_guild', gName);
  }

  function sendChat() {
    const msg = document.getElementById('chatMsgInput').value.trim();
    if (!currentGuild) return showToast("Önce bir tarikata katılmalı veya kurmalısın!", true);
    if (msg) {
      socket.emit('guild_chat_message', { guildName: currentGuild, message: msg });
      document.getElementById('chatMsgInput').value = "";
    }
  }

  socket.on('guild_success', (data) => {
    updateGuildUI(data.guildName);
    showModal("🏯 Tarikat Bildirimi", data.message);
  });

  socket.on('receive_guild_chat', (data) => {
    const chatBox = document.getElementById('chatLog');
    if (chatBox) {
      chatBox.innerHTML += `<div>[${data.time}] <b>${data.sender}:</b> ${data.message}</div>`;
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  });

  socket.on('leaderboard_data', (list) => {
    const div = document.getElementById('rankList');
    if (!div) return;
    div.innerHTML = "";
    list.forEach((p, i) => {
      div.innerHTML += `<div class="row"><span>#${i+1} <b>${p.username}</b><span class="sub-text">${p.cultivationRealm} • ${p.className}</span></span><span style="color:#f5b942; font-weight:bold;">⚡ ${p.power}</span></div>`;
    });
  });

  socket.on('account_deleted', (data) => {
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    showAuthMode('login');
    document.getElementById('loginPassword').value='';
    showToast(data?.message || 'Hesap silindi.');
  });
  socket.on('error_message', (msg) => showToast("⚠️ " + msg, true));

  // Phaser engine is optional at runtime: if assets are unavailable, legacy DOM controls remain usable.
  function arkenStartPhaser(player){
    if(window.arkenWorld){window.arkenWorld.setMap(player.currentMapId||'map_heng_yue');window.arkenWorld.setPlayer(player);return;}
    if(!window.Phaser||!window.ArkenWorldEngine){
      const notice=document.getElementById('arkenEngineStatus');
      if(notice){notice.textContent='Phaser yüklenemedi; klasik harita etkin. npm install komutunu kontrol et.';notice.classList.remove('hidden');}
      return;
    }
    const viewport=document.getElementById('gameMapViewport');
    window.arkenWorld=window.ArkenWorldEngine.create({
      parent:document.getElementById('arkenPhaserWorld'),
      isActive:()=>!!myData&&!document.getElementById('gameScreen').classList.contains('hidden'),
      onMove:pos=>socket.emit('player_move',pos),
      onNpc:(tab,name)=>tab==='questsTab'?openArkenGuide():openPopup(tab,name),
      onBlocked:()=>showToast('Bu noktaya ulaşan bir yol bulunamadı.')
    });
    if(window.arkenWorld){
      viewport.classList.add('phaser-ready');document.getElementById('gameScreen').classList.add('phaser-ready');
      window.arkenWorld.setMap(player.currentMapId||'map_heng_yue');
      fetch('/assets/map_geometry.json').then(r=>r.json()).then(data=>window.arkenWorld?.setGeometry(data)).catch(()=>{});
      // Phaser scene create is async; wait for its scene lifecycle before placing the hero.
      const game=window.arkenWorld;
      let tries=0;const place=()=>{if(game!==window.arkenWorld)return;if(game.isReady)game.setPlayer(player);else if(tries++<60)setTimeout(place,80);};place();
    }
  }
  function arkenStartBattlePhaser(battle){
    if(!window.Phaser||!window.ArkenCombatEngine)return;
    const host=document.getElementById('arkenPhaserCombat');
    if(!window.arkenBattle)window.arkenBattle=window.ArkenCombatEngine.create(host);
    if(window.arkenBattle){
      document.getElementById('arkenCombatScene').classList.add('phaser-ready');
      // Allow Phaser's create() to complete before the first render.
      let tries=0;const start=()=>{if(!window.arkenBattle)return;if(window.arkenBattle.isReady)window.arkenBattle.start(battle,myData?.username||'Yetişimci',myData?.className);else if(tries++<40)setTimeout(start,80);};start();
    }
  }
