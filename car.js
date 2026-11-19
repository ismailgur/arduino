// ===== Araba arayüzü: tamamı burada (GitHub'da tut, ESP'ye yükleme gerekmez) =====
// Sayfa (ESP) bu dosyayı indirip çalıştırır. `car` nesnesi sayfadan gelir:
//   car.root      arayüzün çizileceği kutu
//   car.log(msg)  üst çubukta mesaj göster
//   car.store     get/set (tarayıcı hafızası)
//   car.stop()    motorları durdur
// Tekerlekler 4 değerle sürülür: [ön sol, ön sağ, arka sol, arka sağ], her biri -1..1.
// (Uno kodu 4 değeri okur. Tek TB6612 varken arka motorlar ön motorları izler;
//  ikinci TB6612 bağlanınca 4 tekerlek bağımsız çalışır.)

(function () {
'use strict';
const root = car.root, clamp = car.clamp, store = car.store;

// Her değişiklikte bunu artır: sayfada üst çubukta görünür, güncellemenin geldiğini buradan anlarsın
const VERSION = 'v7';
car.log('app.js ' + VERSION);

// ================= AYARLAR =================
const CFG = {
  maxAngle: 360,      // direksiyon sınırı (derece). 360 = 1 tur
  turnK: 0.8,         // tam direksiyonda iç tarafın ne kadar yavaşlayacağı (0..1). 1 = iç taraf durur
  turnTol: 0.6,       // dönüş toleransı: iç tekerlek dış tekerlekten en fazla %kaç yavaş olabilir (Ayarlar sekmesinden değişir)
  limitAngle: true,   // direksiyonu hesaplanan en rahat dönüş açısıyla sınırla
  turnBoost: 0.5,    // dönüşte dış tarafın ne kadar hızlanacağı (0 = hızlanma yok). Hız 100% iken tavan 1.0'dır
  accelRate: 3,       // hızlanma: saniyede tam gazın kaçta kaçı (3 = ~0.3 sn'de tam hız)
  decelRate: 1.2,     // yavaşlama: gazı bırakınca durma süresi ≈ 1/decelRate sn (1.2 = ~0.8 sn)
  steerDir: -1,      // direksiyon yönü: 1 normal, -1 ters (sağa çevirince sola gidiyorsa çevir)
  pivot: false,      // true: gaz 0 iken direksiyon aracı yerinde döndürür (tekerlekler ters yönde)
  autoCenter: true,   // direksiyon bırakılınca ortala
  autoZero: true,     // gaz / tekerlek çubukları bırakılınca sıfırla
  sendMs: 80          // komut aralığı (ms)
};
car.sendMs = CFG.sendMs;

// ================= SÜRÜŞ MANTIĞI =================
// s.angle (derece), s.steer (-1..1), s.throttle (-1..1), s.speed (0..1)
// Dönüş: { l, r }  sol ve sağ taraf (iki tekerlek aynı), -1..1
//   veya { fl, fr, rl, rr }  her tekerlek ayrı
function control(s) {
  // Dış taraf gaz hızında gider, iç taraf direksiyon kadar yavaşlar. Tekerlek geri dönmez (sürüklenme yok).
  // Gaz 0 ise araba olduğu yerde kalır (yerinde dönmek için CFG.pivot = true).
  const st = s.steer * CFG.steerDir;                          // yön ters çıkarsa CFG.steerDir'i çevir
  const base = s.throttle * s.speed, a = Math.abs(st) * CFG.turnK;   // a: 0..turnK
  const inner = base * (1 - a);                                      // iç taraf yavaşlar
  const outer = clamp(base * (1 + a * CFG.turnBoost), -1, 1);        // dış taraf hızlanır (hız kaybını telafi)
  let l = base, r = base;
  if (st > 0) { l = outer; r = inner; }      // sağa dönüş: sol taraf hızlı, sağ taraf yavaş
  else if (st < 0) { r = outer; l = inner; } // sola dönüş
  if (CFG.pivot && Math.abs(s.throttle) < 0.05) { l = st * s.speed; r = -st * s.speed; }
  return { l, r };
}

// En rahat (zorlanmayan) dönüş açısı: iç/dış tekerlek hız oranı (1 - turnTol)'dan düşmeyecek en büyük direksiyon açısı.
// Tam gaz referans alınır (en zor durum). Hız kaydırıcısı düştükçe dış tekerlek tavana takılmadığı için açı da büyür.
function maxTurnAngle(speed) {
  const sp = Math.max(speed, 0.01), need = 1 - clamp(CFG.turnTol, 0, 1);
  const ratio = x => {
    const a = x * CFG.turnK;
    return (sp * (1 - a)) / Math.min(1, sp * (1 + a * CFG.turnBoost));
  };
  if (ratio(1) >= need) return CFG.maxAngle;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (ratio(mid) >= need) lo = mid; else hi = mid; }
  return lo * CFG.maxAngle;
}

// ================= TEKERLEK FONKSİYONLARI =================
// Buraya yazdığın her fonksiyon "Tekerlekler" sekmesinde buton olur.
// Hız değerleri: [ön sol, ön sağ, arka sol, arka sağ] veya sadece (sol, sağ)
//   W.move(fl, fr, rl, rr, ms)  veya  W.move(sol, sağ, ms)   → ms kadar sür, sonra dur
//   W.hold(...)                                              → aynı, ama durmaz
//   W.wheel(i, v)  i: 0..3 veya 'fl','fr','rl','rr'            → tek tekerleği sür
//   W.set(fl, fr, rl, rr) / W.set(sol, sağ)
//   W.left(v) W.right(v) W.front(v) W.rear(v) W.stop() W.wait(ms)
const FUNCTIONS = {
  'İleri 1 sn':                async (W) => { await W.move(0.6, 0.6, 1000); },
  'Geri 1 sn':                 async (W) => { await W.move(-0.6, -0.6, 1000); },
  'Yerinde sağa dön':          async (W) => { await W.move(0.6, -0.6, 800); },
  'Yerinde sola dön':          async (W) => { await W.move(-0.6, 0.6, 800); },
  'Tekerlek testi (sırayla)':  async (W) => {
    for (const name of ['fl', 'fr', 'rl', 'rr']) {
      W.wheel(name, 0.6); await W.wait(700); W.stop(); await W.wait(300);
    }
  },
  'Ön / arka':                 async (W) => { await W.move(0.6, 0.6, 0, 0, 800); await W.move(0, 0, 0.6, 0.6, 800); },
  'Çapraz':                    async (W) => { await W.move(0.6, 0, 0, 0.6, 800); await W.move(0, 0.6, 0.6, 0, 800); },
  'Zigzag':                    async (W) => { for (let i = 0; i < 3; i++) { await W.move(0.7, 0.3, 600); await W.move(0.3, 0.7, 600); } }
};

// ================= 4 TEKERLEK ALTYAPISI =================
// Sayfadaki yükleyici ESP'ye 2 değer gönderir; burada o isteği 4 değerli hale getiriyoruz
// (ESP'yi güncellemeye gerek kalmasın diye).
const wheels = [0, 0, 0, 0];     // ön sol, ön sağ, arka sol, arka sağ
function setWheels(a) {
  for (let i = 0; i < 4; i++) wheels[i] = clamp(+a[i] || 0, -1, 1);
  car.set(wheels[0], wheels[1]);                // yükleyiciyi canlı tutar
}
const origFetch = window.fetch.bind(window);
window.fetch = (u, o) => {
  if (typeof u === 'string' && u.indexOf('/m?v=') === 0) {
    const v = document.hidden ? [0, 0, 0, 0] : wheels;       // sekme arka plandaysa dur
    u = '/m?v=' + v.map(x => Math.round(x * 255)).join(',');
  }
  return origFetch(u, o);
};
// Sürüş sekmesinde tekerlek hızı hedefe yumuşakça yaklaşır (ani kalkış/duruş yok)
const cur = [0, 0, 0, 0];
function smooth(target, dt) {
  for (let i = 0; i < 4; i++) {
    const tg = clamp(+target[i] || 0, -1, 1), c = cur[i];
    const toward0 = Math.abs(tg) < Math.abs(c) || tg * c < 0;     // yavaşlıyor veya yön değiştiriyor
    const lim = (toward0 ? CFG.decelRate : CFG.accelRate) * dt;
    cur[i] = c + clamp(tg - c, -lim, lim);
  }
  return cur;
}
const origStop = car.stop;
car.stop = () => { cur.fill(0); setWheels([0, 0, 0, 0]); origStop(); };   // DUR butonu: anında durur

// ================= ARAYÜZ =================
const css = `
#a{display:flex;flex-direction:column;height:100%;gap:8px;padding:8px;box-sizing:border-box}
#a .tabs{display:flex;gap:6px}
#a .tabs button{flex:1;padding:8px}
#a .tabs .ver{align-self:center;color:#8b98a8;font-size:12px;padding:0 4px}
#a .tabs button.on{background:#3ea6ff;color:#06121f;border-color:#3ea6ff;font-weight:700}
#a section{flex:1;min-height:0;display:grid;gap:8px}
#a section[hidden]{display:none}
#a-drive{grid-template-columns:1fr 150px 90px}
#a-wheels{grid-template-columns:repeat(4,72px) 1fr}
@media (orientation:portrait){
  #a-drive{grid-template-columns:1fr 90px;grid-template-rows:1fr auto}#a-drive .mid{grid-column:1/3;grid-row:2}
  #a-wheels{grid-template-columns:repeat(4,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)}#a-wheels .side{grid-column:1/5}
}
#a .panel{background:#1a212b;border:1px solid #2c3644;border-radius:12px;position:relative;min-height:0}
#a .wheelBox{display:flex;align-items:center;justify-content:center;overflow:hidden}
#a-wheel{height:min(100%,100vw - 130px);aspect-ratio:1;max-width:100%;touch-action:none;cursor:grab}
#a .angle{position:absolute;top:8px;left:12px;color:#8b98a8;font-variant-numeric:tabular-nums}
#a .angle b{color:#e6edf3;font-size:20px}
#a .mid{display:flex;flex-direction:column;justify-content:center;gap:10px;padding:12px;text-align:center;color:#8b98a8}
#a .mid input{width:100%;touch-action:auto}
#a .big{font-size:26px;font-weight:700;color:#e6edf3}
#a .bar{touch-action:none}
#a .bar .fill{position:absolute;left:0;right:0;background:#3ea6ff;opacity:.85}
#a .bar .midl{position:absolute;left:0;right:0;top:50%;height:2px;background:#e6edf3;opacity:.5}
#a .bar .val{position:absolute;left:0;right:0;top:6px;text-align:center;font-size:12px;line-height:1.3;font-variant-numeric:tabular-nums;z-index:2}
#a .bar .lbl{position:absolute;left:0;right:0;text-align:center;color:#8b98a8;font-size:11px;z-index:2}
#a .bar .lbl.t{top:38px}#a .bar .lbl.b{bottom:6px}
#a .side{overflow:auto;padding:10px;display:flex;flex-direction:column;gap:8px;touch-action:pan-y}
#a .fns{display:flex;flex-wrap:wrap;gap:6px}
#a .side textarea{width:100%;box-sizing:border-box;background:#0d1117;color:#e6edf3;border:1px solid #2c3644;border-radius:8px;padding:8px;font:12px ui-monospace,Consolas,monospace;touch-action:auto;user-select:text;-webkit-user-select:text;white-space:pre}
#a .hint{color:#8b98a8;font-size:12px}
#a-settings{grid-template-columns:1fr}
#a-joy{grid-template-columns:1fr 150px}
@media (orientation:portrait){#a-joy{grid-template-columns:1fr;grid-template-rows:1fr auto}}
#a-joyp{position:relative;height:min(100%,100vw - 130px);aspect-ratio:1;max-width:100%;border-radius:50%;background:#10161d;border:2px solid #3a4657;touch-action:none}
#a-joyp .cx,#a-joyp .cy{position:absolute;background:#2c3644}
#a-joyp .cx{left:8%;right:8%;top:50%;height:1px}
#a-joyp .cy{top:8%;bottom:8%;left:50%;width:1px}
#a-knob{position:absolute;width:30%;height:30%;border-radius:50%;background:#3ea6ff;opacity:.9;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none}
#a .row{display:flex;align-items:center;gap:8px;color:#e6edf3}
#a input[type=number]{width:80px;background:#0d1117;color:#e6edf3;border:1px solid #2c3644;border-radius:8px;padding:6px;font:inherit;touch-action:auto;user-select:text;-webkit-user-select:text}
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

root.innerHTML = `
<div id="a">
  <div class="tabs"><button data-t="drive" class="on">Sürüş</button><button data-t="wheels">Tekerlekler</button><button data-t="joy">Joystick</button><button data-t="settings">Ayarlar</button><span class="ver">${VERSION}</span></div>

  <section id="a-drive">
    <div class="panel wheelBox">
      <div class="angle"><b id="a-angv">0</b>° &nbsp;<span id="a-turns">0.00 tur</span></div>
      <svg id="a-wheel" viewBox="-100 -100 200 200">
        <g id="a-rot">
          <circle r="90" fill="none" stroke="#3a4657" stroke-width="14"/>
          <circle r="90" fill="none" stroke="#5a6b82" stroke-width="2"/>
          <circle r="22" fill="#2c3644" stroke="#5a6b82" stroke-width="2"/>
          <rect x="-84" y="-6" width="62" height="12" rx="6" fill="#3a4657"/>
          <rect x="22" y="-6" width="62" height="12" rx="6" fill="#3a4657"/>
          <rect x="-6" y="22" width="12" height="62" rx="6" fill="#3a4657"/>
          <polygon points="0,-102 -7,-88 7,-88" fill="#3ea6ff"/>
        </g>
      </svg>
    </div>
    <div class="panel mid">
      <div>Maks. hız</div><div class="big" id="a-spdv">50%</div>
      <input type="range" id="a-speed" min="0" max="100" value="50">
      <div id="a-lr" style="font-size:13px;font-variant-numeric:tabular-nums">Sol 0 · Sağ 0</div>
    </div>
    <div id="a-thr"></div>
  </section>

  <section id="a-wheels" hidden>
    <div id="a-b0"></div><div id="a-b1"></div><div id="a-b2"></div><div id="a-b3"></div>
    <div class="panel side">
      <div class="hint">Çubuklar her tekerleği ayrı sürer (ön sol, ön sağ, arka sol, arka sağ). Fonksiyonlar app.js içindeki FUNCTIONS'tan gelir.</div>
      <div class="fns" id="a-fns"></div>
      <div class="hint">Kendi fonksiyonun (W.move, W.hold, W.wheel, W.set, W.left/right/front/rear, W.stop, W.wait):</div>
      <textarea id="a-code" rows="6" spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>
      <div class="fns"><button id="a-run">Çalıştır</button><button id="a-cancel">İptal / Dur</button></div>
      <div class="hint" id="a-wst">hazır</div>
    </div>
  </section>

  <section id="a-joy" hidden>
    <div class="panel wheelBox">
      <div id="a-joyp"><div class="cx"></div><div class="cy"></div><div id="a-knob"></div></div>
    </div>
    <div class="panel mid">
      <div>Maks. hız</div><div class="big" id="a-spdv2">50%</div>
      <input type="range" id="a-speed2" min="0" max="100" value="50">
      <div id="a-jlr" style="font-size:13px;font-variant-numeric:tabular-nums">X 0 · Y 0</div>
      <div class="hint">Yukarı ileri, aşağı geri, yana direksiyon. Bırakınca yavaşça durur.</div>
    </div>
  </section>

  <section id="a-settings" hidden>
    <div class="panel side">
      <label class="row">Dönüş toleransı (%) <input type="number" id="a-tol" min="0" max="100" step="5" inputmode="numeric"></label>
      <div class="hint">İç tekerleğin dış tekerlekten en fazla yüzde kaç yavaş olmasına izin verilir. Düşük değer = daha yumuşak, motorları daha az zorlayan dönüş.</div>
      <label class="row"><input type="checkbox" id="a-limit"> Direksiyonu bu açıyla sınırla</label>
      <div class="big" id="a-limv">—</div>
      <div class="hint" id="a-limh"></div>
    </div>
  </section>
</div>`;
const $ = id => document.getElementById(id);

// ---- çubuk (gaz ve tekerlek çubukları) ----
function makeBar(host, name, onChange) {
  host.classList.add('panel', 'bar');
  host.innerHTML = '<div class="val"></div><div class="lbl t">İLERİ</div><div class="lbl b">GERİ</div><div class="fill"></div><div class="midl"></div>';
  const fill = host.querySelector('.fill'), val = host.querySelector('.val');
  const b = { value: 0, active: false };
  b.draw = () => {
    const h = host.clientHeight / 2, t = b.value;
    fill.style.top = (t >= 0 ? h - t * h : h) + 'px';
    fill.style.height = Math.abs(t) * h + 'px';
    val.innerHTML = (name ? name + '<br>' : '') + Math.round(t * 100);
  };
  b.set = v => { b.value = clamp(v, -1, 1); b.draw(); };
  const from = e => {
    const r = host.getBoundingClientRect();
    b.value = clamp(((r.top + r.height / 2) - e.clientY) / (r.height / 2), -1, 1);
    b.draw(); onChange(b.value);
  };
  host.addEventListener('pointerdown', e => { host.setPointerCapture(e.pointerId); b.active = true; from(e); });
  host.addEventListener('pointermove', e => { if (b.active) from(e); });
  ['pointerup', 'pointercancel'].forEach(t => host.addEventListener(t, () => {
    b.active = false;
    if (CFG.autoZero) { b.value = 0; b.draw(); onChange(0); }
  }));
  return b;
}

// ---- durum ----
let tab = 'drive', angle = 0, wheelActive = false, speed = 0.5;
const thr = makeBar($('a-thr'), '', () => {});
const NAMES = ['ÖN SOL', 'ÖN SAĞ', 'ARKA SOL', 'ARKA SAĞ'];
const bars = NAMES.map((n, i) => makeBar($('a-b' + i), n, v => { wheels[i] = v; setWheels(wheels); }));
const syncBars = () => bars.forEach((b, i) => b.set(wheels[i]));

// ---- tekerlek API'si ----
let runId = 0;
const ABORT = new Error('iptal');
const IDX = { fl: 0, fr: 1, rl: 2, rr: 3 };
function abortAll() { runId++; cur.fill(0); setWheels([0, 0, 0, 0]); syncBars(); }
// (l, r) veya (fl, fr, rl, rr) → [fl, fr, rl, rr]
const four = a => a.length >= 4 ? [a[0], a[1], a[2], a[3]] : [a[0], a[1], a[0], a[1]];
const W = {
  set(...a)  { setWheels(four(a)); syncBars(); },
  wheel(i, v){ const k = typeof i === 'string' ? IDX[i] : i; const w = wheels.slice(); w[k] = v; setWheels(w); syncBars(); },
  left(v)    { const w = wheels.slice(); w[0] = w[2] = v; setWheels(w); syncBars(); },
  right(v)   { const w = wheels.slice(); w[1] = w[3] = v; setWheels(w); syncBars(); },
  front(v)   { const w = wheels.slice(); w[0] = w[1] = v; setWheels(w); syncBars(); },
  rear(v)    { const w = wheels.slice(); w[2] = w[3] = v; setWheels(w); syncBars(); },
  stop()     { W.set(0, 0, 0, 0); },
  wait(ms)   { const id = runId; return new Promise((res, rej) => setTimeout(() => id === runId ? res() : rej(ABORT), ms)); },
  async hold(...a) { const ms = a.pop(); W.set(...a); await W.wait(ms); },
  async move(...a) { await W.hold(...a); W.stop(); }
};
async function runFn(fn) {
  abortAll();
  const id = runId;                 // eski (iptal edilmiş) çalıştırma yenisini bozmasın
  $('a-wst').textContent = 'çalışıyor…';
  try { await fn(W); if (id === runId) $('a-wst').textContent = 'bitti'; }
  catch (e) {
    if (id !== runId) return;
    W.stop();
    $('a-wst').textContent = e === ABORT ? 'iptal edildi' : 'hata: ' + e.message;
  }
}
Object.entries(FUNCTIONS).forEach(([name, fn]) => {
  const btn = document.createElement('button');
  btn.textContent = name;
  btn.onclick = () => runFn(fn);
  $('a-fns').appendChild(btn);
});
$('a-code').value = store.get('wcode', "await W.wheel('fl', 0.6); await W.wait(800);\nW.stop();");
$('a-run').onclick = () => {
  const code = $('a-code').value;
  store.set('wcode', code);
  runFn(() => new Function('W', 'return (async () => {' + code + '\n})()')(W));
};
$('a-cancel').onclick = () => { abortAll(); $('a-wst').textContent = 'durduruldu'; };

// ---- sekmeler ----
function show(t) {
  abortAll(); tab = t;
  thr.set(0); angle = 0;
  root.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $('a-drive').hidden = t !== 'drive';
  $('a-wheels').hidden = t !== 'wheels';
  $('a-settings').hidden = t !== 'settings';
  $('a-joy').hidden = t !== 'joy';
  jx = jy = 0; joyActive = false;
  thr.draw(); bars.forEach(b => b.draw());
}
root.querySelectorAll('.tabs button').forEach(b => b.onclick = () => show(b.dataset.t));
car.onStop = () => { abortAll(); thr.set(0); angle = 0; jx = jy = 0; };

// ---- joystick ----
let jx = 0, jy = 0, joyActive = false;
const pad = $('a-joyp'), knob = $('a-knob');
function joyFrom(e) {
  const b = pad.getBoundingClientRect(), R = b.width / 2;
  let dx = (e.clientX - (b.left + R)) / R, dy = (e.clientY - (b.top + R)) / R;
  const m = Math.hypot(dx, dy);
  if (m > 1) { dx /= m; dy /= m; }
  const f = v => { v = clamp(v / 0.8, -1, 1); return Math.abs(v) < 0.05 ? 0 : v; };   // %80 yarıçapta tam değer
  jx = f(dx); jy = f(-dy);
  knob.style.left = (50 + dx * 35) + '%'; knob.style.top = (50 + dy * 35) + '%';
}
function joyRelease() { joyActive = false; jx = jy = 0; knob.style.left = '50%'; knob.style.top = '50%'; }
pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); joyActive = true; joyFrom(e); });
pad.addEventListener('pointermove', e => { if (joyActive) joyFrom(e); });
['pointerup', 'pointercancel'].forEach(t => pad.addEventListener(t, joyRelease));

// ---- direksiyon ----
const wheel = $('a-wheel');
let lastA = 0;
const pAngle = e => { const b = wheel.getBoundingClientRect();
  return Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * 180 / Math.PI; };
wheel.addEventListener('pointerdown', e => { wheel.setPointerCapture(e.pointerId); wheelActive = true; lastA = pAngle(e); });
wheel.addEventListener('pointermove', e => {
  if (!wheelActive) return;
  const a = pAngle(e); let d = a - lastA;
  if (d > 180) d -= 360; if (d < -180) d += 360;
  angle = clamp(angle + d, -CFG.maxAngle, CFG.maxAngle); lastA = a;
});
['pointerup', 'pointercancel'].forEach(t => wheel.addEventListener(t, () => { wheelActive = false; }));

// ---- hız ----
speed = clamp((+store.get('speed', '50') || 50) / 100, 0, 1);
function setSpeed(pct) {                       // Sürüş ve Joystick sekmelerindeki kaydırıcılar birlikte çalışır
  pct = clamp(Math.round(+pct || 0), 0, 100);
  speed = pct / 100;
  ['a-speed', 'a-speed2'].forEach(id => { $(id).value = pct; });
  ['a-spdv', 'a-spdv2'].forEach(id => { $(id).textContent = pct + '%'; });
  store.set('speed', pct);
}
setSpeed(speed * 100);
['a-speed', 'a-speed2'].forEach(id => $(id).addEventListener('input', e => setSpeed(e.target.value)));

// ---- ayarlar sekmesi ----
CFG.turnTol = clamp((+store.get('turnTol', Math.round(CFG.turnTol * 100))) / 100, 0, 1);
CFG.limitAngle = store.get('limitOn', CFG.limitAngle ? '1' : '0') === '1';
$('a-tol').value = Math.round(CFG.turnTol * 100);
$('a-limit').checked = CFG.limitAngle;
$('a-tol').addEventListener('input', e => {
  const v = clamp(+e.target.value || 0, 0, 100);
  CFG.turnTol = v / 100; store.set('turnTol', v);
});
$('a-limit').addEventListener('change', e => { CFG.limitAngle = e.target.checked; store.set('limitOn', e.target.checked ? '1' : '0'); });
const turnLimit = () => CFG.limitAngle ? maxTurnAngle(speed) : CFG.maxAngle;

// control() → yumuşatma → tekerlekler (Sürüş ve Joystick sekmeleri ortak kullanır)
function driveWith(ang, throttle, dt) {
  let o = {};
  try { o = control({ angle: ang, steer: ang / CFG.maxAngle, throttle, speed }) || {}; }
  catch (e) { car.log('control hatası: ' + e.message); }
  const w = o.fl !== undefined ? [o.fl, o.fr, o.rl, o.rr] : [o.l, o.r, o.l, o.r];
  setWheels(smooth(w, dt));
}

// ---- ana döngü ----
let prev = performance.now();
setInterval(() => {
  const now = performance.now(), dt = (now - prev) / 1000; prev = now;
  if (tab === 'drive') {
    if (!wheelActive && CFG.autoCenter && angle !== 0) {
      const step = 900 * dt;
      angle = Math.abs(angle) <= step ? 0 : angle - Math.sign(angle) * step;
    }
    const lim = turnLimit();
    angle = clamp(angle, -lim, lim);                 // direksiyon en rahat dönüş açısını geçemez
    driveWith(angle, thr.value, dt);
    $('a-rot').setAttribute('transform', 'rotate(' + angle + ')');
    $('a-angv').textContent = Math.round(angle);
    $('a-turns').textContent = (angle / 360).toFixed(2) + ' tur · sınır ±' + Math.round(lim) + '°';
    $('a-lr').textContent = 'ÖS ' + Math.round(wheels[0] * 255) + ' · ÖĞ ' + Math.round(wheels[1] * 255) +
                            ' · AS ' + Math.round(wheels[2] * 255) + ' · AĞ ' + Math.round(wheels[3] * 255);
    thr.draw();
  } else if (tab === 'joy') {
    const lim = turnLimit();
    driveWith(jx * lim, jy, dt);                     // yatay eksen = direksiyon (sınır dahil), dikey eksen = gaz
    $('a-jlr').textContent = 'X ' + Math.round(jx * 100) + ' · Y ' + Math.round(jy * 100) + ' · ÖS ' +
      Math.round(wheels[0] * 255) + ' ÖĞ ' + Math.round(wheels[1] * 255);
  } else if (tab === 'settings') {
    const lim = maxTurnAngle(speed), a = (lim / CFG.maxAngle) * CFG.turnK;
    $('a-limv').textContent = 'En rahat dönüş açısı: ±' + Math.round(lim) + '°';
    $('a-limh').textContent = 'Hız %' + Math.round(speed * 100) + ' ve tolerans %' + Math.round(CFG.turnTol * 100) +
      ' için. Bu açıda iç taraf %' + Math.round(speed * (1 - a) * 100) + ', dış taraf %' +
      Math.round(Math.min(1, speed * (1 + a * CFG.turnBoost)) * 100) + ' hızda (tam gazda).';
  } else {
    bars.forEach(b => b.draw());
  }
}, 33);
})();
