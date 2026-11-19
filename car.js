// ===== Araba sürüş betiği =====
// Bu dosyayı kendi sunucuna / GitHub'a koy, adresini arabanın web sayfasındaki
// (⚙ ayarlar) kutuya yaz. Dosyayı değiştirince sayfada "JS'i yükle / yenile"
// demen yeter (veya sayfayı yenile). Arduino'ya yeniden yazılım atmak gerekmez.
//
// car.control(s) her ~80 ms'de bir çağrılır.
//   s.angle    direksiyon açısı, derece: -360 (1 tur sol) ... +360 (1 tur sağ)
//   s.steer    angle / 360   → -1 ... +1
//   s.throttle gaz çubuğu    → -1 (tam geri) ... +1 (tam ileri)
//   s.speed    maks. hız ayarı → 0 ... 1
// Dönüş değeri: { l: sol_tekerlekler, r: sağ_tekerlekler }, her biri -1 ... +1
//   (+ ileri, - geri). Sol 2 tekerlek aynı, sağ 2 tekerlek aynı değeri alır.
//
// car.log("mesaj") → üst çubukta mesaj gösterir.
//
// Sayfayı da bu dosyadan ayarlayabilirsin (ESP'ye yükleme gerekmez):
//   car.config.maxAngle = 360;   // direksiyon sınırı (derece), 360 = 1 tur
//   car.config.sendMs   = 80;    // komut gönderme aralığı (ms, en az 30)
//   car.css(".panel{background:#222}");   // sayfaya CSS ekle
//   car.state.speed = 0.8;       // durumu oku/yaz (angle, throttle, speed)
//   car.send(l, r);              // doğrudan motor komutu (-1..1)
//   document / window            // sayfanın tamamına erişimin var (DOM değiştirebilirsin)

if (car.config) car.config.maxAngle = 360;   // eski sayfada car.config yoktur

car.control = function (s) {
  const K = 0.6;                        // direksiyonun sol/sağ fark etkisi (0..1+)

  // Direksiyon sağa (+) → sol taraf hızlanır, sağ taraf yavaşlar.
  let l = s.throttle + s.steer * K;
  let r = s.throttle - s.steer * K;

  // Taşmayı engelle (oranı koruyarak)
  const m = Math.max(1, Math.abs(l), Math.abs(r));
  l /= m; r /= m;

  return { l: l * s.speed, r: r * s.speed };
};
