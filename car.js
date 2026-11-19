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
const VERSION = 'v1';
car.log('app.js ' + VERSION);

// ================= AYARLAR =================
const CFG = {
  maxAngle: 360,      // direksiyon sınırı (derece). 360 = 1 tur
  steerK: 0.6,        // direksiyonun sol/sağ fark etkisi
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
  let l = s.throttle + s.steer * CFG.steerK;     // sağa dönüşte sol taraf hızlı
  let r = s.throttle - s.steer * CFG.steerK;
  const m = Math.max(1, Math.abs(l), Math.abs(r));
  return { l: l / m * s.speed, r: r / m * s.speed };
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
const origStop = car.stop;
car.stop = () => { setWheels([0, 0, 0, 0]); origStop(); };

// ================= ARAYÜZ =================
const css = `
#a{display:flex;flex-direction:column;height:100%;gap:8px;padding:8px;box-sizing:border-box}
#a .tabs{display:flex;gap:6px}
#a .tabs button{flex:1;padding:8px}
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
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

root.innerHTML = `
<div id="a">
  <div class="tabs"><button data-t="drive" class="on">Sürüş</button><button data-t="wheels">Tekerlekler</button></div>

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
function abortAll() { runId++; setWheels([0, 0, 0, 0]); syncBars(); }
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
  thr.draw(); bars.forEach(b => b.draw());
}
root.querySelectorAll('.tabs button').forEach(b => b.onclick = () => show(b.dataset.t));
car.onStop = () => { abortAll(); thr.set(0); angle = 0; };

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
$('a-speed').value = Math.round(speed * 100); $('a-spdv').textContent = Math.round(speed * 100) + '%';
$('a-speed').addEventListener('input', e => { speed = e.target.value / 100; $('a-spdv').textContent = e.target.value + '%'; store.set('speed', e.target.value); });

// ---- ana döngü ----
let prev = performance.now();
setInterval(() => {
  const now = performance.now(), dt = (now - prev) / 1000; prev = now;
  if (tab === 'drive') {
    if (!wheelActive && CFG.autoCenter && angle !== 0) {
      const step = 900 * dt;
      angle = Math.abs(angle) <= step ? 0 : angle - Math.sign(angle) * step;
    }
    let o = {};
    try { o = control({ angle, steer: angle / CFG.maxAngle, throttle: thr.value, speed }) || {}; }
    catch (e) { car.log('control hatası: ' + e.message); }
    const w = o.fl !== undefined ? [o.fl, o.fr, o.rl, o.rr] : [o.l, o.r, o.l, o.r];
    setWheels(w);
    $('a-rot').setAttribute('transform', 'rotate(' + angle + ')');
    $('a-angv').textContent = Math.round(angle);
    $('a-turns').textContent = (angle / 360).toFixed(2) + ' tur';
    $('a-lr').textContent = 'ÖS ' + Math.round(wheels[0] * 255) + ' · ÖĞ ' + Math.round(wheels[1] * 255) +
                            ' · AS ' + Math.round(wheels[2] * 255) + ' · AĞ ' + Math.round(wheels[3] * 255);
    thr.draw();
  } else {
    bars.forEach(b => b.draw());
  }
}, 33);
})();
