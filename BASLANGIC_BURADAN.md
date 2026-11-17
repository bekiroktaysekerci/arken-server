# ARKEN DÜNYASI — BAŞLANGIÇ OYNANABİLİR SÜRÜM

## 1 dakikada başlat

1. Bilgisayarda Node.js 20 veya üzeri kurulu olsun.
2. Terminalde bu paketin `arken_complete/demo` klasörüne gir.
3. `node server.js` komutunu çalıştır.
4. Tarayıcıda `http://localhost:3100` adresini aç.
5. Kullanıcı adı, şifre ve karakter adını gir; **Kayıt Ol**, ardından **Giriş Yap**.

**Bu demo için MongoDB, npm install, Phaser CDN, internet bağlantısı veya .env gerekmez.**

## Oynanış

1. Tarikat Rehberi'ne tıklayıp görevi al.
2. Gölge Kurt'a tıklayıp iki kez savaş kazan. Saldır ve Ruh Darbesi düğmelerini kullan.
3. Görev ödülünü al; Deneme Vadisi'ne geç.
4. Vadi Muhafızı'nı yen, görevi teslim et.
5. Yetişim basamağını yükselt. İlk macera bitti!

Hesap ve ilerleme `demo/players.json` dosyasına kaydedilir. Bu yerel prototip için hazırlanmış dosya tabanlı saklamadır, **üretim kullanımı için güvenli/ölçeklenebilir değildir**. Giriş oturumları sunucu yeniden başlatıldığında sıfırlanır. İnternete açık yayınlamayın.

## Geliştirici testleri

`cd demo && node test_demo.js`

Test: kayıt/giriş, görev, iki kurt savaşı, ganimet, bölge geçişi, muhafız, ödül, yetişim. Node.js testleri çalıştırılmış ve başarılı olmuştur.

**Tarayıcı test sınırlaması:** Chromium otomasyonunda localhost bağlantısı bu çalışma ortamında yönetici politikası nedeniyle `ERR_BLOCKED_BY_ADMINISTRATOR` ile engellendi. Görsel tarayıcı testi başarılı olarak raporlanmıyor. `demo/test_browser.py` kullanıcı ortamında Playwright Python ve Chromium kuruluysa çalıştırılabilir.

## Mevcut büyük oyun

Ana `server.js`, `public/index.html`, Phaser dünya/savaş modülleri, MongoDB ve Socket.IO sistemi **silinmedi**. Büyük MMORPG projesi normal `npm install && npm start` ile çalışır, ancak bu büyük sürümün canlı uçtan uca testi bu pakette yapılmadı. Demo **ayrı, bağımsız, çalıştırılabilir başlangıç döngüsüdür**; henüz Phaser veya MongoDB ile entegre değildir.

## Gelecek geliştirmeler

- Demo başlangıç akışını büyük Phaser/MongoDB sürümüne taşımak
- Gerçek animasyonlu sprite atlasları ve zengin savaş sahnesi
- Kalıcı oturumlar, e-posta doğrulaması, hız sınırlama ve sunucu güvenliği
- Gerçek zamanlı çok oyunculu karşılaşmalar, parti, tarikat, PvP
- Görev zincirleri, yeni bölgeler, ekipman, simya ve yetişim ağaçları
