# Arken Dünyası — Xianxia MMORPG prototipi

## Bu pakette
- Express + Socket.IO + MongoDB sunucusu (`server.js`)
- 2D ana ekran / Legend Online tarzı dokuz bölmeli alt menü (`public/index.html`)
- Koyu lacivert, gece mavisi, altın ve kızıl tonlarda xianxia arayüzü
- Karakter portresi, HP/Mana, Öz Kristali, Ruh Taşı ve Yetişim Enerjisi HUD'ı
- Kılıçla süzülme hissi veren click-to-move, uçuş izi ve sis/dağ/tapınak dekorları
- Heng Yue, Deneme Vadisi, Merdiven Taşı Kalıntısı ve Suzaku bölge geçişleri
- Hikâye metinli ana/günlük/yetişim görevleri ve ön koşul zinciri
- Dokuz aşamalı yetişim, başarısızlık oranı, Gök Gürültüsü Yargısı ve unvanlar
- Beş sefer/boss aşaması, ganimet tabloları, tüketilebilir eşyalar ve ilahi hazine bildirimi
- Altı sınıfa ait aktif teknikler, mana/cooldown kontrolü ve yoldaş/Kadim Kütüphane pasif çarpanları
- Mevcut tarikat, PvP, yoldaş, mesken, AFK, ekipman ve sohbet sistemlerinin korunması

## Kurulum
1. Node.js 20+ kurun.
2. Bu klasörde `npm install` çalıştırın.
3. `.env.example` dosyasını `.env` olarak kopyalayın.
4. `.env` içindeki `MONGO_URI` alanına MongoDB bağlantınızı yazın.
5. `npm test` çalıştırın.
6. `npm start` ile sunucuyu başlatın ve `http://localhost:3000` adresini açın.

## Kontroller
- `npm run check`: Sunucu ve istemci JavaScript sözdizimi kontrolü.
- `node test_static.js`: Temel HTML, Socket.IO olayları ve yeni özellik sözleşmeleri.

## Önemli sınırlar
Bu teslimde JavaScript sözdizimi, HTML parse ve statik sözleşme kontrolleri yapılmıştır. Bu çalışma ortamında gerçek MongoDB bağlantısı, tarayıcı görsel testi, iki ayrı cihazla çevrimiçi oturum, PvP eşzamanlılık testi veya uzun süreli yük testi yapılamamıştır. Bu nedenle paket geliştirilmiş bir oynanabilir prototiptir; canlıya çıkmaya hazır ticari MMORPG sunucusu olarak değerlendirilmemelidir.

Oyun evreni Arken'e özgü kalacak şekilde tasarlanmıştır. Xian Ni'den yalnızca genel yetişim/xianxia teması ve kullanıcının belirttiği anlatı motifleri uyarlanmıştır; mevcut eserin karakterleri, diyalogları veya görsel varlıkları kopyalanmamıştır.


## Bu sürümdeki yeni sistem ekranları
- Çanta, Tarikat, Boss ve Haritalar artık popup içeriği kopyalamak yerine ayrı tam ekran sistem sayfaları olarak açılır. Sayfa kapatılınca kaynak DOM yerine döner; böylece aynı ID'ler üzerinden çalışan Socket.IO güncellemeleri kopmaz.
- Çanta: Ekipman / Tüketilebilir / Malzeme filtreleri, kuşanma ve eşya kullanma.
- Haritalar: Heng Yue, Deneme Vadisi, Merdiven Taşı Kalıntısı ve Suzaku geçişleri.
- Dünya bossu: Her gün 21:00 Türkiye saati (Europe/Istanbul) takvimi. Yenilirse bir sonraki günlük saatte yeniden doğar; 60 saniyelik otomatik doğma kaldırıldı. Boss HP/yaşam durumu MongoDB'de saklanır.
- Karakter: Altı sınıfın her biri için 4x4 karelik özgün SVG sprite atlası (`public/assets/sprites/`). Satırlar idle, uçuş, saldırı ve yetenek animasyonlarını; sütunlar dört ardışık kareyi içerir. `window.ARKEN_SPRITE_ATLAS_URL` ile özel atlas da verilebilir.

## Canlı çok oyunculu smoke testi
1. MongoDB bağlantısı ve `.env` ayarlarıyla sunucuyu başlatın: `npm start`.
2. Ayrı terminalde `npm install` tamamlandıktan sonra `npm run test:multiplayer` çalıştırın.
3. Test iki deneme hesabıyla bağlanır, aynı haritada konum senkronizasyonunu, PvP teklifini, kabulünü ve iki istemciye savaş sonucu yayınını doğrular. Test hesapları veritabanında kalır; test bittikten sonra isterseniz silebilirsiniz.

`npm test` sözdizimi, 21:00 İstanbul saat dilimi zamanlama birim testi ve statik sözleşme kontrolüdür. `npm run test:multiplayer` gerçek çalışan sunucu + MongoDB gerektirir. Bu teslim ortamında gerçek MongoDB kimlik bilgileri ve ayrı cihazlar bulunmadığından canlı bağlantı testi çalıştırılmış değildir.
