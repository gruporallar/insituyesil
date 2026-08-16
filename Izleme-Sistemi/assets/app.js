/* ===================================================================
   İnsitu Yeşil Teknolojiler A.Ş. — İzlenebilirlik Sistemi
   Çiftçi → Ham madde → Üretim serisi → Ambalaj → Sevkiyat → Eczane → Hasta
   Referans: Ek-13 Üretim Akış Şeması, SOP-ÜR-12/13/14/15/16, SOP-KG-07
   =================================================================== */

'use strict';

/* ---------- Sabitler ---------- */
const DEPO_ANAHTAR = 'insitu_izlenebilirlik_v1';

const GTIN = {
  DISTILAT: '08680000000017',
  IZOLAT:   '08680000000024'
};

const URUN_ADI = {
  DISTILAT: 'CBD Distilat',
  IZOLAT:   'CBD İzolat'
};

/* Ek-13 kritik kontrol noktalarından gelen kabul kriterleri */
const LIMIT = {
  hamThcMax:      0.3,    // Δ9-THC ≤ %0,3
  urunThcMax:     0.3,
  cbdDistilatMin: 80,     // CBD ≥ %80
  cbdIzolatMin:   99,     // Saflık ≥ %99
  cozucuMax:      5000,   // ppm
  mbAlt:          98,     // kütle denkliği %98–102
  mbUst:          102
};

/* ---------- Veri deposu ---------- */
let DB = bosDB();

function bosDB() {
  return {
    ciftciler: [], hammadde: [], seriler: [], paketler: [],
    aliciar: [], sevkiyatlar: [], satislar: [], butsKuyruk: [], log: [],
    sayac: { ciftci: 0, hm: 0, seri: 0, paket: 0, alici: 0, sevk: 0, satis: 0, buts: 0 },
    kullanici: 'İrem ERÇELİK'
  };
}

function yukle() {
  try {
    const ham = localStorage.getItem(DEPO_ANAHTAR);
    if (ham) DB = Object.assign(bosDB(), JSON.parse(ham));
  } catch (e) {
    console.error('Veri okunamadı:', e);
    toast('Kayıtlı veri okunamadı — boş başlatıldı');
  }
}

function kaydet() {
  try {
    localStorage.setItem(DEPO_ANAHTAR, JSON.stringify(DB));
  } catch (e) {
    console.error(e);
    toast('KAYIT BAŞARISIZ — depolama dolu olabilir');
  }
}

/* ---------- Yardımcılar ---------- */
const $  = (s, k = document) => k.querySelector(s);
const $$ = (s, k = document) => Array.from(k.querySelectorAll(s));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(mesaj) {
  const t = $('#toast');
  t.textContent = mesaj;
  t.classList.add('show');
  clearTimeout(toast._z);
  toast._z = setTimeout(() => t.classList.remove('show'), 3200);
}

function pad(n, u) { return String(n).padStart(u, '0'); }

function bugun() { return new Date().toISOString().slice(0, 10); }

function zaman() {
  return new Date().toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function trTarih(iso) {
  if (!iso) return '—';
  const [y, a, g] = iso.split('-');
  return `${g}.${a}.${y}`;
}

function sayi(n, basamak = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('tr-TR', {
    minimumFractionDigits: basamak, maximumFractionDigits: basamak
  });
}

function yil() { return new Date().getFullYear(); }

/* Denetim izi — ALCOA+ atfedilebilirlik. Kayıtlar silinmez. */
function logla(islem, kayit) {
  DB.log.unshift({ zaman: zaman(), kullanici: DB.kullanici, islem, kayit });
  if (DB.log.length > 500) DB.log.length = 500;
}

function rozet(durum) {
  return `<span class="badge ${esc(durum)}">${esc(durum)}</span>`;
}

/* ---------- Karekod (GS1 AI yapısı) ---------- */
function sktKisa(iso) {
  const [y, a, g] = iso.split('-');
  return y.slice(2) + a + g;   // YYAAGG
}

function tekilKodUret(urunTipi, tekilNo, skt, seri) {
  // (01)GTIN (21)tekil seri (17)SKT (10)parti
  return '01' + GTIN[urunTipi] + '21' + tekilNo + '17' + sktKisa(skt) + '10' + seri;
}

function kodCozumle(kod) {
  // Sabit uzunluklu AI'lar önce; 21 ve 10 değişken uzunlukta olduğu için sırayı takip ederiz.
  const m = /^01(\d{14})21([A-Z0-9]+)17(\d{6})10(.+)$/.exec(String(kod).trim());
  if (!m) return null;
  return { gtin: m[1], tekil: m[2], skt: m[3], seri: m[4] };
}

function qrCiz(veri, hucre = 3) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(veri);
    qr.make();
    return qr.createSvgTag({ cellSize: hucre, margin: 2, scalable: true });
  } catch (e) {
    console.error('QR üretilemedi:', e);
    return '<div class="empty">QR üretilemedi</div>';
  }
}

/* ---------- Kayıt bulucular ---------- */
const ciftciBul = id  => DB.ciftciler.find(c => c.id === id);
const hmBul     = lot => DB.hammadde.find(h => h.lot === lot);
const seriBul   = s   => DB.seriler.find(x => x.seri === s);
const paketBul  = uid => DB.paketler.find(p => p.uid === uid);
const aliciBul  = id  => DB.aliciar.find(a => a.id === id);

/* ===================================================================
   SEKME YÖNETİMİ
   =================================================================== */
function sekmeGoster(ad) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + ad));
  $$('#tabs button').forEach(b => {
    if (b.dataset.view === ad) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

/* ===================================================================
   ÇİFTÇİ
   =================================================================== */
function ciftciEkle(veri) {
  DB.sayac.ciftci++;
  const kayit = {
    id: 'CF-' + pad(DB.sayac.ciftci, 3),
    ad: veri.ad.trim(),
    tcVkn: veri.tcVkn.trim(),
    cksNo: veri.cksNo.trim(),
    izinNo: veri.izinNo.trim(),
    il: veri.il.trim(),
    ilce: veri.ilce.trim(),
    parsel: veri.parsel.trim(),
    alan: veri.alan,
    tel: veri.tel.trim(),
    kayitTarihi: bugun()
  };
  DB.ciftciler.push(kayit);
  logla('Çiftçi kaydı açıldı', kayit.id);
  kaydet();
  return kayit;
}

function ciftciTabloCiz() {
  const g = $('#t-ciftci');
  if (!DB.ciftciler.length) {
    g.innerHTML = '<tr><td colspan="7" class="empty">Henüz çiftçi kaydı yok.</td></tr>';
    return;
  }
  g.innerHTML = DB.ciftciler.map(c => {
    const lotlar = DB.hammadde.filter(h => h.ciftciId === c.id);
    const toplam = lotlar.reduce((t, h) => t + h.miktarKg, 0);
    return `<tr>
      <td class="mono">${esc(c.id)}</td>
      <td><b>${esc(c.ad)}</b></td>
      <td class="mono">${esc(c.izinNo)}</td>
      <td>${esc(c.il)}${c.ilce ? ' / ' + esc(c.ilce) : ''}</td>
      <td>${esc(c.parsel) || '—'}</td>
      <td class="num">${lotlar.length}</td>
      <td class="num">${sayi(toplam, 1)}</td>
    </tr>`;
  }).join('');
}

/* ===================================================================
   HAM MADDE
   =================================================================== */
function hamMaddeEkle(veri) {
  DB.sayac.hm++;
  const kayit = {
    lot: 'HM-' + yil() + '-' + pad(DB.sayac.hm, 4),
    ciftciId: veri.ciftciId,
    teslimTarihi: veri.teslimTarihi,
    miktarKg: parseFloat(veri.miktarKg),
    kalanKg: parseFloat(veri.miktarKg),
    hasatYili: veri.hasatYili,
    nem: veri.nem ? parseFloat(veri.nem) : null,
    irsaliye: veri.irsaliye.trim(),
    durum: 'KARANTINA',
    thc: null, cbd: null,
    analizRaporNo: null, analizTarihi: null, lab: null,
    kayitZamani: zaman()
  };
  DB.hammadde.push(kayit);
  logla('Ham madde kabul edildi — KARANTİNA', kayit.lot);
  butsEkle('URETIM_GIRDI', kayit.lot, 1, {
    lot: kayit.lot, ciftci: kayit.ciftciId, miktarKg: kayit.miktarKg
  });
  kaydet();
  return kayit;
}

function analizKaydet(veri) {
  const h = hmBul(veri.lot);
  if (!h) return { ok: false, mesaj: 'Lot bulunamadı.' };

  h.thc = parseFloat(veri.thc);
  h.cbd = parseFloat(veri.cbd);
  h.analizRaporNo = veri.analizRaporNo.trim();
  h.analizTarihi = veri.analizTarihi;
  h.lab = veri.lab.trim();

  const thcAsim = h.thc > LIMIT.hamThcMax;
  const analizRed = veri.onbirAnaliz === 'H';

  if (thcAsim || analizRed) {
    h.durum = 'RET';
    h.retNedeni = thcAsim
      ? `Δ9-THC %${sayi(h.thc, 3)} — yasal sınır %${sayi(LIMIT.hamThcMax, 1)} aşıldı`
      : '11 zorunlu analizden en az biri uygunsuz';
    logla('Ham madde REDDEDİLDİ — ' + h.retNedeni, h.lot);
    butsEkle('RET', h.lot, 1, { lot: h.lot, neden: h.retNedeni });
    kaydet();
    return { ok: true, durum: 'RET', mesaj: h.retNedeni };
  }

  h.durum = 'SERBEST';
  logla('Ham madde SERBEST bırakıldı — THC %' + sayi(h.thc, 3), h.lot);
  kaydet();
  return { ok: true, durum: 'SERBEST', mesaj: 'Lot üretime uygun.' };
}

function hmTabloCiz() {
  const g = $('#t-hm');
  if (!DB.hammadde.length) {
    g.innerHTML = '<tr><td colspan="9" class="empty">Henüz ham madde kaydı yok.</td></tr>';
    return;
  }
  g.innerHTML = DB.hammadde.map(h => {
    const c = ciftciBul(h.ciftciId);
    return `<tr>
      <td class="mono"><b>${esc(h.lot)}</b></td>
      <td>${esc(c ? c.ad : h.ciftciId)}</td>
      <td>${trTarih(h.teslimTarihi)}</td>
      <td class="num">${sayi(h.miktarKg, 1)}</td>
      <td class="num">${sayi(h.kalanKg, 1)}</td>
      <td class="num">${h.thc == null ? '—' : sayi(h.thc, 3)}</td>
      <td class="num">${h.cbd == null ? '—' : sayi(h.cbd, 2)}</td>
      <td>${rozet(h.durum)}</td>
      <td class="no-print"><button class="btn ghost sm" data-izle="${esc(h.lot)}">İzle</button></td>
    </tr>`;
  }).join('');
}

/* ===================================================================
   ÜRETİM SERİSİ
   =================================================================== */
function seriAc(urunTipi, tarih, sorumlu, girdiler) {
  DB.sayac.seri++;
  const on = urunTipi === 'DISTILAT' ? 'CBD-D-' : 'CBD-I-';
  const seri = on + yil() + '-' + pad(DB.sayac.seri, 4);

  girdiler.forEach(g => {
    const h = hmBul(g.lot);
    h.kalanKg = Math.round((h.kalanKg - g.kg) * 1000) / 1000;
  });

  const kayit = {
    seri, urunTipi, tarih, sorumlu,
    girdiler,
    girdiToplam: girdiler.reduce((t, g) => t + g.kg, 0),
    durum: 'KARANTINA',
    ciktiKg: null, fireKg: null, numuneKg: null,
    mb: null, cbdSon: null, thcSon: null, cozucu: null,
    serbestKisi: null, serbestTarih: null, retNedeni: null,
    ambalajlananG: 0,
    kayitZamani: zaman()
  };
  DB.seriler.push(kayit);
  logla('Üretim serisi açıldı — ' + sayi(kayit.girdiToplam, 1) + ' kg girdi', seri);
  kaydet();
  return kayit;
}

/* Kütle denkliği: (Çıktı + Fire + Numune) / Girdi — kabul %98–102 */
function mbHesapla(girdi, cikti, fire, numune) {
  if (!girdi) return null;
  return ((cikti + fire + numune) / girdi) * 100;
}

function seriDegerlendir(veri) {
  const s = seriBul(veri.seri);
  if (!s) return { ok: false, mesaj: 'Seri bulunamadı.' };

  const cikti  = parseFloat(veri.ciktiKg);
  const fire   = parseFloat(veri.fireKg);
  const numune = parseFloat(veri.numuneKg) || 0;
  const cbd    = parseFloat(veri.cbdSon);
  const thc    = parseFloat(veri.thcSon);
  const coz    = veri.cozucu === '' ? null : parseFloat(veri.cozucu);

  s.ciktiKg = cikti; s.fireKg = fire; s.numuneKg = numune;
  s.cbdSon = cbd; s.thcSon = thc; s.cozucu = coz;
  s.mb = mbHesapla(s.girdiToplam, cikti, fire, numune);

  /* Serbest bırakmayı engelleyen sebepler — SOP-ÜR-13 / Ek-13 KKN tablosu */
  const engeller = [];
  if (s.mb < LIMIT.mbAlt || s.mb > LIMIT.mbUst)
    engeller.push(`Kütle denkliği %${sayi(s.mb, 1)} — kabul aralığı %${LIMIT.mbAlt}–${LIMIT.mbUst} dışında`);
  if (thc > LIMIT.urunThcMax)
    engeller.push(`Δ9-THC %${sayi(thc, 3)} — sınır %${sayi(LIMIT.urunThcMax, 1)} aşıldı`);
  const cbdMin = s.urunTipi === 'IZOLAT' ? LIMIT.cbdIzolatMin : LIMIT.cbdDistilatMin;
  if (cbd < cbdMin)
    engeller.push(`CBD %${sayi(cbd, 2)} — asgari %${sayi(cbdMin, 0)} altında`);
  if (coz != null && coz > LIMIT.cozucuMax)
    engeller.push(`Kalıntı çözücü ${sayi(coz, 0)} ppm — sınır ${sayi(LIMIT.cozucuMax, 0)} ppm aşıldı`);
  if (veri.sapma === 'E')
    engeller.push('Açık sapma veya kapanmamış CAPA kaydı var');

  if (engeller.length) {
    s.durum = 'RET';
    s.retNedeni = engeller.join(' · ');
    logla('Seri REDDEDİLDİ — ' + engeller.length + ' uygunsuzluk', s.seri);
    butsEkle('RET', s.seri, 1, { seri: s.seri, nedenler: engeller });
    kaydet();
    return { ok: true, durum: 'RET', engeller };
  }

  s.durum = 'SERBEST';
  s.serbestKisi = veri.serbestKisi.trim();
  s.serbestTarih = bugun();
  logla('Seri SERBEST bırakıldı — ' + sayi(cikti, 3) + ' kg', s.seri);
  butsEkle('URETIM', s.seri, 1, {
    seri: s.seri, urun: URUN_ADI[s.urunTipi], miktarKg: cikti, cbd, thc
  });
  kaydet();
  return { ok: true, durum: 'SERBEST', engeller: [] };
}

function mbKutusu(mb) {
  if (mb == null) return '';
  const uygun = mb >= LIMIT.mbAlt && mb <= LIMIT.mbUst;
  return `<div class="alert ${uygun ? 'ok' : 'err'}">
    <b>Kütle Denkliği: %${sayi(mb, 2)}</b> — ${uygun
      ? `kabul aralığında (%${LIMIT.mbAlt}–${LIMIT.mbUst}). Serbest bırakmaya engel yok.`
      : `kabul aralığı DIŞINDA (%${LIMIT.mbAlt}–${LIMIT.mbUst}). SOP-ÜR-16 md. 5.2 gereği bu seri serbest bırakılamaz; araştırma açılmalıdır.`}
  </div>`;
}

function seriTabloCiz() {
  const g = $('#t-seri');
  if (!DB.seriler.length) {
    g.innerHTML = '<tr><td colspan="10" class="empty">Henüz üretim serisi yok.</td></tr>';
    return;
  }
  g.innerHTML = DB.seriler.map(s => `<tr>
    <td class="mono"><b>${esc(s.seri)}</b></td>
    <td>${esc(URUN_ADI[s.urunTipi])}</td>
    <td>${trTarih(s.tarih)}</td>
    <td class="num">${sayi(s.girdiToplam, 1)}</td>
    <td class="num">${s.ciktiKg == null ? '—' : sayi(s.ciktiKg, 3)}</td>
    <td class="num">${s.mb == null ? '—' : '%' + sayi(s.mb, 1)}</td>
    <td class="num">${s.cbdSon == null ? '—' : sayi(s.cbdSon, 2)}</td>
    <td class="num">${s.thcSon == null ? '—' : sayi(s.thcSon, 3)}</td>
    <td>${rozet(s.durum)}</td>
    <td class="no-print"><button class="btn ghost sm" data-izle="${esc(s.seri)}">İzle</button></td>
  </tr>`).join('');
}

/* ===================================================================
   AMBALAJ + KAREKOD
   =================================================================== */
function ambalajla(seriNo, adet, miktarG, skt) {
  const s = seriBul(seriNo);
  if (!s) return { ok: false, mesaj: 'Seri bulunamadı.' };
  if (s.durum !== 'SERBEST')
    return { ok: false, mesaj: 'Yalnızca SERBEST statüsündeki seri ambalajlanabilir.' };

  const gerekenKg = (adet * miktarG) / 1000;
  const kalanKg = s.ciktiKg - (s.ambalajlananG / 1000);
  if (gerekenKg > kalanKg + 1e-9) {
    return { ok: false, mesaj:
      `Yetersiz ürün. Seride kalan ${sayi(kalanKg, 3)} kg, talep edilen ${sayi(gerekenKg, 3)} kg.` };
  }

  const yeni = [];
  for (let i = 0; i < adet; i++) {
    DB.sayac.paket++;
    const tekil = 'T' + pad(DB.sayac.paket, 8);
    const p = {
      uid: tekilKodUret(s.urunTipi, tekil, skt, seriNo),
      tekil, seri: seriNo, urunTipi: s.urunTipi,
      miktarG: parseFloat(miktarG), skt,
      durum: 'SERBEST', konum: 'Ürün Deposu (D3)',
      sevkId: null, satisId: null,
      uretimZamani: zaman()
    };
    DB.paketler.push(p);
    yeni.push(p);
  }

  s.ambalajlananG += adet * miktarG;
  logla(`${adet} ambalaj birimi üretildi — ${sayi(gerekenKg, 3)} kg`, seriNo);
  butsEkle('AMBALAJ', seriNo, adet, { seri: seriNo, adet, birimG: miktarG, skt });
  kaydet();
  return { ok: true, paketler: yeni };
}

function paketTabloCiz(filtre = '') {
  const g = $('#t-paket');
  const f = filtre.trim().toUpperCase();
  const liste = (f ? DB.paketler.filter(p =>
    p.uid.toUpperCase().includes(f) || p.seri.toUpperCase().includes(f)
  ) : DB.paketler).slice(0, 300);

  if (!liste.length) {
    g.innerHTML = `<tr><td colspan="6" class="empty">${
      DB.paketler.length ? 'Eşleşen kayıt yok.' : 'Henüz ambalaj birimi yok.'}</td></tr>`;
    return;
  }
  g.innerHTML = liste.map(p => `<tr>
    <td class="mono" style="font-size:11px">${esc(p.uid)}</td>
    <td class="mono">${esc(p.seri)}</td>
    <td class="num">${sayi(p.miktarG, 2)} g</td>
    <td>${trTarih(p.skt)}</td>
    <td>${esc(p.konum)}</td>
    <td>${rozet(p.durum)}</td>
  </tr>`).join('');
}

function etiketleriGoster(seriNo) {
  const alan = $('#etiket-alan');
  const liste = DB.paketler.filter(p => p.seri === seriNo);
  if (!liste.length) {
    alan.innerHTML = '<div class="card"><div class="empty">Bu seride ambalaj birimi yok.</div></div>';
    return;
  }
  const s = seriBul(seriNo);
  alan.innerHTML = `<div class="card">
    <h2>${esc(seriNo)} — ${liste.length} Etiket</h2>
    <p class="hint">${esc(URUN_ADI[s.urunTipi])} · ${sayi(liste[0].miktarG, 2)} g · SKT ${trTarih(liste[0].skt)}</p>
    <div class="grid c4">
      ${liste.map(p => `<div class="qr-box">
        ${qrCiz(p.uid, 3)}
        <div class="qr-cap"><b>${esc(p.tekil)}</b><br>${esc(p.seri)}<br>SKT ${trTarih(p.skt)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

/* ===================================================================
   ALICI + SEVKİYAT
   =================================================================== */
function aliciEkle(veri) {
  DB.sayac.alici++;
  const kayit = {
    id: (veri.tip === 'ECZANE' ? 'EC-' : 'DP-') + pad(DB.sayac.alici, 3),
    tip: veri.tip, ad: veri.ad.trim(), gln: veri.gln.trim(),
    il: veri.il.trim(), adres: veri.adres.trim(), yetkili: veri.yetkili.trim()
  };
  DB.aliciar.push(kayit);
  logla((veri.tip === 'ECZANE' ? 'Eczane' : 'Ecza deposu') + ' tanımlandı', kayit.id);
  kaydet();
  return kayit;
}

/* Okutulan kodları doğrular — sevke uygun mu? */
function kodlariDogrula(metin) {
  const satirlar = metin.split(/[\r\n,;]+/).map(x => x.trim()).filter(Boolean);
  const gecerli = [], hatali = [];
  const gorulen = new Set();

  satirlar.forEach(kod => {
    if (gorulen.has(kod)) { hatali.push({ kod, neden: 'Aynı kod birden fazla okutuldu' }); return; }
    gorulen.add(kod);

    const p = paketBul(kod);
    if (!p) { hatali.push({ kod, neden: 'Sistemde kayıtlı değil — sahte veya hatalı okuma' }); return; }
    if (p.durum === 'SEVK')    { hatali.push({ kod, neden: 'Zaten sevk edilmiş' }); return; }
    if (p.durum === 'SATILDI') { hatali.push({ kod, neden: 'Zaten hastaya satılmış' }); return; }
    if (p.durum !== 'SERBEST') { hatali.push({ kod, neden: `Statü ${p.durum} — sevk edilemez` }); return; }

    const skt = new Date(p.skt);
    if (skt < new Date(bugun())) { hatali.push({ kod, neden: 'Son kullanma tarihi geçmiş' }); return; }

    gecerli.push(p);
  });

  return { gecerli, hatali };
}

function sevkKaydet(veri, paketler) {
  DB.sayac.sevk++;
  const kayit = {
    id: 'SVK-' + yil() + '-' + pad(DB.sayac.sevk, 4),
    tarih: veri.tarih, aliciId: veri.aliciId,
    tasiyici: veri.tasiyici.trim(), muhurNo: veri.muhurNo.trim(),
    irsaliye: veri.irsaliye.trim(), teslimAlan: veri.teslimAlan.trim(),
    paketler: paketler.map(p => p.uid),
    butsRef: 'BUTS-' + yil() + '-' + pad(DB.sayac.buts + 1, 5),
    kayitZamani: zaman()
  };

  const a = aliciBul(veri.aliciId);
  paketler.forEach(p => {
    p.durum = 'SEVK';
    p.sevkId = kayit.id;
    p.konum = (a ? a.ad : veri.aliciId);
  });

  DB.sevkiyatlar.push(kayit);
  logla(`Sevkiyat — ${paketler.length} birim → ${a ? a.ad : veri.aliciId}`, kayit.id);
  butsEkle('SEVKIYAT', kayit.id, paketler.length, {
    sevkNo: kayit.id, alici: a ? a.ad : veri.aliciId, gln: a ? a.gln : '',
    muhurNo: kayit.muhurNo, kodlar: kayit.paketler
  });
  kaydet();
  return kayit;
}

function sevkTabloCiz() {
  const g = $('#t-sevk');
  if (!DB.sevkiyatlar.length) {
    g.innerHTML = '<tr><td colspan="7" class="empty">Henüz sevkiyat yok.</td></tr>';
    return;
  }
  g.innerHTML = DB.sevkiyatlar.map(s => {
    const a = aliciBul(s.aliciId);
    return `<tr>
      <td class="mono"><b>${esc(s.id)}</b></td>
      <td>${trTarih(s.tarih)}</td>
      <td>${esc(a ? a.ad : s.aliciId)}${a ? ` <span class="badge ${a.tip === 'ECZANE' ? 'SATILDI' : 'SEVK'}">${a.tip}</span>` : ''}</td>
      <td class="num">${s.paketler.length}</td>
      <td>${esc(s.tasiyici)}</td>
      <td class="mono">${esc(s.muhurNo)}</td>
      <td class="mono">${esc(s.butsRef)}</td>
    </tr>`;
  }).join('');
}

/* ===================================================================
   ECZANE SATIŞI
   =================================================================== */
function tcMaskele(tc) {
  const t = String(tc).trim();
  if (t.length < 5) return '*'.repeat(t.length);
  return t.slice(0, 3) + '*'.repeat(t.length - 5) + t.slice(-2);
}

function satisKaydet(veri) {
  const p = paketBul(veri.uid.trim());
  if (!p) return { ok: false, mesaj: 'Bu karekod sistemde kayıtlı değil. Sahte ürün şüphesi — satış yapmayın.' };
  if (p.durum === 'SATILDI') return { ok: false, mesaj: 'Bu ambalaj birimi daha önce satılmış. Mükerrer satış engellendi.' };
  if (p.durum !== 'SEVK')    return { ok: false, mesaj: `Bu birim eczaneye sevk edilmemiş (statü: ${p.durum}).` };

  const sevk = DB.sevkiyatlar.find(s => s.id === p.sevkId);
  if (sevk && sevk.aliciId !== veri.aliciId) {
    const dogru = aliciBul(sevk.aliciId);
    return { ok: false, mesaj: `Bu birim ${dogru ? dogru.ad : sevk.aliciId} adresine sevk edilmiş. Farklı eczaneden satılamaz.` };
  }
  if (new Date(p.skt) < new Date(veri.tarih))
    return { ok: false, mesaj: 'Son kullanma tarihi geçmiş — satış engellendi.' };

  DB.sayac.satis++;
  const kayit = {
    id: 'SAT-' + yil() + '-' + pad(DB.sayac.satis, 5),
    tarih: veri.tarih, aliciId: veri.aliciId, uid: p.uid, seri: p.seri,
    musteriAd: veri.musteriAd.trim(),
    musteriTc: tcMaskele(veri.musteriTc),
    receteNo: veri.receteNo.trim(),
    hekim: veri.hekim.trim(),
    kayitZamani: zaman()
  };

  p.durum = 'SATILDI';
  p.satisId = kayit.id;
  const ecz = aliciBul(veri.aliciId);
  p.konum = (ecz ? ecz.ad : veri.aliciId) + ' — hastaya teslim';

  DB.satislar.push(kayit);
  logla(`Hastaya satış — reçete ${kayit.receteNo}`, kayit.id);
  butsEkle('SATIS', kayit.id, 1, {
    satisNo: kayit.id, eczane: ecz ? ecz.ad : veri.aliciId, gln: ecz ? ecz.gln : '',
    kod: p.uid, receteNo: kayit.receteNo
  });
  kaydet();
  return { ok: true, kayit };
}

function satisTabloCiz() {
  const g = $('#t-satis');
  if (!DB.satislar.length) {
    g.innerHTML = '<tr><td colspan="7" class="empty">Henüz satış kaydı yok.</td></tr>';
    return;
  }
  g.innerHTML = DB.satislar.map(s => {
    const a = aliciBul(s.aliciId);
    return `<tr>
      <td class="mono"><b>${esc(s.id)}</b></td>
      <td>${trTarih(s.tarih)}</td>
      <td>${esc(a ? a.ad : s.aliciId)}</td>
      <td class="mono" style="font-size:11px">${esc(s.uid)}</td>
      <td class="mono">${esc(s.seri)}</td>
      <td>${esc(s.musteriAd)} <span class="mono" style="color:var(--text-dim)">${esc(s.musteriTc)}</span></td>
      <td class="mono">${esc(s.receteNo)}</td>
    </tr>`;
  }).join('');
}

/* ===================================================================
   BÜTS KUYRUĞU
   =================================================================== */
function butsEkle(tip, ref, adet, detay) {
  DB.sayac.buts++;
  DB.butsKuyruk.unshift({
    id: 'BUTS-' + yil() + '-' + pad(DB.sayac.buts, 5),
    zaman: zaman(), tip, ref, adet, durum: 'BEKLIYOR', detay
  });
}

function butsTabloCiz() {
  const g = $('#t-buts');
  if (!DB.butsKuyruk.length) {
    g.innerHTML = '<tr><td colspan="6" class="empty">Bildirim kuyruğu boş.</td></tr>';
    return;
  }
  g.innerHTML = DB.butsKuyruk.slice(0, 200).map(b => `<tr>
    <td class="mono">${esc(b.id)}</td>
    <td>${esc(b.zaman)}</td>
    <td><b>${esc(b.tip)}</b></td>
    <td class="mono">${esc(b.ref)}</td>
    <td class="num">${b.adet}</td>
    <td>${b.durum === 'BEKLIYOR'
      ? '<span class="badge KARANTINA">BEKLİYOR</span>'
      : '<span class="badge SERBEST">GÖNDERİLDİ</span>'}</td>
  </tr>`).join('');
}

/* ===================================================================
   İZLEME — GERİYE VE İLERİYE
   =================================================================== */

/* Bir ambalaj biriminden tarlaya kadar tam zincir */
function zincirCikar(uid) {
  const p = paketBul(uid);
  if (!p) return null;
  const s = seriBul(p.seri);
  const girdiler = s ? s.girdiler.map(g => {
    const h = hmBul(g.lot);
    return { kg: g.kg, hm: h, ciftci: h ? ciftciBul(h.ciftciId) : null };
  }) : [];
  const sevk = DB.sevkiyatlar.find(x => x.id === p.sevkId) || null;
  const satis = DB.satislar.find(x => x.id === p.satisId) || null;
  return {
    paket: p, seri: s, girdiler, sevk,
    alici: sevk ? aliciBul(sevk.aliciId) : null,
    satis, eczane: satis ? aliciBul(satis.aliciId) : null
  };
}

function dugum(baslik, durum, satirlar) {
  return `<div class="node">
    <div class="n-head"><span class="n-title">${baslik}</span>${durum ? rozet(durum) : ''}</div>
    <div class="n-meta">${satirlar.filter(Boolean).join(' &nbsp;·&nbsp; ')}</div>
  </div>`;
}

const ok = () => '<div class="arrow">↓</div>';

function zincirHTML(z) {
  const parcalar = [];

  /* 1 — Tarla */
  z.girdiler.forEach(g => {
    const c = g.ciftci, h = g.hm;
    parcalar.push(dugum('1 · TARLA — Çiftçi', null, [
      c ? `<b>${esc(c.ad)}</b>` : 'Çiftçi kaydı yok',
      c ? `Kod: ${esc(c.id)}` : null,
      c ? `Ekim izni: ${esc(c.izinNo)}` : null,
      c ? `${esc(c.il)}${c.ilce ? '/' + esc(c.ilce) : ''}` : null,
      c && c.parsel ? `Parsel: ${esc(c.parsel)}` : null
    ]));
    parcalar.push(ok());
    parcalar.push(dugum('2 · HAM MADDE KABULÜ + ANALİZ', h ? h.durum : null, [
      h ? `Lot: <b>${esc(h.lot)}</b>` : null,
      h ? `Teslim: ${trTarih(h.teslimTarihi)}` : null,
      `Bu seriye giren: <b>${sayi(g.kg, 1)} kg</b>`,
      h && h.thc != null ? `Δ9-THC: <b>%${sayi(h.thc, 3)}</b>` : null,
      h && h.cbd != null ? `CBD: %${sayi(h.cbd, 2)}` : null,
      h && h.analizRaporNo ? `Rapor: ${esc(h.analizRaporNo)}` : null
    ]));
    parcalar.push(ok());
  });

  /* 2 — Üretim */
  const s = z.seri;
  parcalar.push(dugum('3 · ÜRETİM SERİSİ', s ? s.durum : null, [
    s ? `Seri: <b>${esc(s.seri)}</b>` : 'Seri bulunamadı',
    s ? `Ürün: ${esc(URUN_ADI[s.urunTipi])}` : null,
    s ? `Üretim: ${trTarih(s.tarih)}` : null,
    s ? `Girdi: ${sayi(s.girdiToplam, 1)} kg → Çıktı: ${sayi(s.ciktiKg, 3)} kg` : null,
    s && s.mb != null ? `Kütle denkliği: <b>%${sayi(s.mb, 1)}</b>` : null,
    s && s.cbdSon != null ? `CBD: <b>%${sayi(s.cbdSon, 2)}</b>` : null,
    s && s.thcSon != null ? `THC: <b>%${sayi(s.thcSon, 3)}</b>` : null,
    s && s.serbestKisi ? `Serbest bırakan: ${esc(s.serbestKisi)}` : null
  ]));
  parcalar.push(ok());

  /* 3 — Ambalaj */
  const p = z.paket;
  parcalar.push(dugum('4 · AMBALAJ BİRİMİ', p.durum, [
    `Tekil no: <b>${esc(p.tekil)}</b>`,
    `Dolum: ${sayi(p.miktarG, 2)} g`,
    `SKT: ${trTarih(p.skt)}`,
    `Üretildiği an: ${esc(p.uretimZamani)}`
  ]));
  parcalar.push(ok());

  /* 4 — Sevkiyat */
  if (z.sevk) {
    parcalar.push(dugum('5 · SEVKİYAT — Kapalı Zincir', 'SEVK', [
      `Sevk no: <b>${esc(z.sevk.id)}</b>`,
      `Tarih: ${trTarih(z.sevk.tarih)}`,
      z.alici ? `Alıcı: <b>${esc(z.alici.ad)}</b> (${esc(z.alici.tip)})` : null,
      z.alici && z.alici.gln ? `GLN: ${esc(z.alici.gln)}` : null,
      `Taşıyıcı: ${esc(z.sevk.tasiyici)}`,
      `Mühür: ${esc(z.sevk.muhurNo)}`,
      `BÜTS: ${esc(z.sevk.butsRef)}`
    ]));
    parcalar.push(ok());
  } else {
    parcalar.push(dugum('5 · SEVKİYAT', null, ['<i>Henüz sevk edilmedi — ürün deposunda.</i>']));
  }

  /* 5 — Hasta */
  if (z.satis) {
    parcalar.push(dugum('6 · ECZANE → HASTA', 'SATILDI', [
      z.eczane ? `Eczane: <b>${esc(z.eczane.ad)}</b>` : null,
      z.eczane ? `${esc(z.eczane.il)}` : null,
      `Satış: ${trTarih(z.satis.tarih)}`,
      `Hasta: <b>${esc(z.satis.musteriAd)}</b> (${esc(z.satis.musteriTc)})`,
      `Reçete: <b>${esc(z.satis.receteNo)}</b>`,
      z.satis.hekim ? `Hekim: ${esc(z.satis.hekim)}` : null
    ]));
  } else if (z.sevk) {
    parcalar.push(dugum('6 · ECZANE → HASTA', null, ['<i>Henüz hastaya verilmedi — eczane stoğunda.</i>']));
  }

  return `<div class="chain">${parcalar.join('')}</div>`;
}

/* İleri izleme: seri veya lottan → nereye gitti */
function ileriIzleme(kodlar, baslik) {
  const paketler = DB.paketler.filter(p => kodlar.includes(p.seri));
  const sevkler = new Set(paketler.map(p => p.sevkId).filter(Boolean));
  const satislar = DB.satislar.filter(s => paketler.some(p => p.uid === s.uid));
  const eczaneler = new Set();
  paketler.forEach(p => {
    const sv = DB.sevkiyatlar.find(x => x.id === p.sevkId);
    if (sv) eczaneler.add(sv.aliciId);
  });

  const sayimlar = {
    SERBEST: paketler.filter(p => p.durum === 'SERBEST').length,
    SEVK:    paketler.filter(p => p.durum === 'SEVK').length,
    SATILDI: paketler.filter(p => p.durum === 'SATILDI').length
  };

  return `<div class="card">
    <h2>İleri İzleme — ${esc(baslik)} Nereye Gitti?</h2>
    <div class="grid c4" style="margin-bottom:16px">
      <div class="kpi"><div class="v">${paketler.length}</div><div class="l">Ambalaj Birimi</div></div>
      <div class="kpi"><div class="v">${sayimlar.SERBEST}</div><div class="l">Depoda</div></div>
      <div class="kpi"><div class="v">${sayimlar.SEVK}</div><div class="l">Sevk Edilmiş</div></div>
      <div class="kpi"><div class="v">${sayimlar.SATILDI}</div><div class="l">Hastaya Verilmiş</div></div>
    </div>
    <p class="hint"><b>${sevkler.size}</b> sevkiyat · <b>${eczaneler.size}</b> alıcı noktası · <b>${satislar.length}</b> hasta kaydı</p>
    ${satislar.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Tekil Kod</th><th>Eczane</th><th>İl</th><th>Satış</th><th>Hasta</th><th>Reçete</th></tr></thead>
      <tbody>${satislar.map(s => {
        const a = aliciBul(s.aliciId);
        return `<tr>
          <td class="mono" style="font-size:11px">${esc(s.uid)}</td>
          <td>${esc(a ? a.ad : s.aliciId)}</td>
          <td>${esc(a ? a.il : '—')}</td>
          <td>${trTarih(s.tarih)}</td>
          <td>${esc(s.musteriAd)} <span class="mono" style="color:var(--text-dim)">${esc(s.musteriTc)}</span></td>
          <td class="mono">${esc(s.receteNo)}</td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">Bu üründen henüz hastaya satış yapılmamış.</div>'}
  </div>`;
}

function izlemeSorgula(sorgu) {
  const q = sorgu.trim();
  const hedef = $('#izle-sonuc');
  if (!q) { hedef.innerHTML = ''; return; }

  /* 1) Tekil karekod */
  const p = paketBul(q);
  if (p) {
    const z = zincirCikar(q);
    hedef.innerHTML = `<div class="card">
      <h2>Tam Zincir — Tekil Ambalaj Birimi</h2>
      <p class="hint">Karekod: <code>${esc(q)}</code></p>
      <div class="grid c2" style="margin-bottom:18px">
        <div class="qr-box">${qrCiz(q, 4)}<div class="qr-cap">${esc(p.tekil)}</div></div>
        <div>${zincirHTML(z)}</div>
      </div>
    </div>`;
    return;
  }

  /* 2) Üretim serisi */
  const s = seriBul(q);
  if (s) {
    const girdiHTML = s.girdiler.map(g => {
      const h = hmBul(g.lot), c = h ? ciftciBul(h.ciftciId) : null;
      return `<tr>
        <td class="mono">${esc(g.lot)}</td>
        <td>${esc(c ? c.ad : '—')}</td>
        <td>${esc(c ? c.izinNo : '—')}</td>
        <td>${esc(c ? c.il : '—')}</td>
        <td class="num">${sayi(g.kg, 1)}</td>
        <td class="num">${h && h.thc != null ? sayi(h.thc, 3) : '—'}</td>
      </tr>`;
    }).join('');

    hedef.innerHTML = `<div class="card">
      <h2>Geri İzleme — ${esc(s.seri)} Nereden Geldi?</h2>
      <p class="hint">${esc(URUN_ADI[s.urunTipi])} · ${trTarih(s.tarih)} · ${rozet(s.durum)}</p>
      ${s.retNedeni ? `<div class="alert err"><b>Ret nedeni:</b> ${esc(s.retNedeni)}</div>` : ''}
      ${mbKutusu(s.mb)}
      <div class="table-wrap"><table>
        <thead><tr><th>Ham Madde Lotu</th><th>Çiftçi</th><th>Ekim İzni</th><th>İl</th><th>Kullanılan kg</th><th>THC%</th></tr></thead>
        <tbody>${girdiHTML}</tbody>
      </table></div>
    </div>
    ${ileriIzleme([s.seri], s.seri)}`;
    return;
  }

  /* 3) Ham madde lotu */
  const h = hmBul(q);
  if (h) {
    const c = ciftciBul(h.ciftciId);
    const seriler = DB.seriler.filter(x => x.girdiler.some(g => g.lot === h.lot));
    hedef.innerHTML = `<div class="card">
      <h2>Ham Madde Lotu — ${esc(h.lot)}</h2>
      <p class="hint">${rozet(h.durum)}</p>
      ${h.retNedeni ? `<div class="alert err"><b>Ret nedeni:</b> ${esc(h.retNedeni)}</div>` : ''}
      <div class="chain">
        ${dugum('TARLA — Çiftçi', null, [
          c ? `<b>${esc(c.ad)}</b>` : '—',
          c ? `Ekim izni: ${esc(c.izinNo)}` : null,
          c ? `${esc(c.il)}${c.ilce ? '/' + esc(c.ilce) : ''}` : null,
          c && c.parsel ? `Parsel: ${esc(c.parsel)}` : null
        ])}
        ${ok()}
        ${dugum('HAM MADDE', h.durum, [
          `Teslim: ${trTarih(h.teslimTarihi)}`,
          `Miktar: <b>${sayi(h.miktarKg, 1)} kg</b> · Kalan: ${sayi(h.kalanKg, 1)} kg`,
          h.thc != null ? `Δ9-THC: <b>%${sayi(h.thc, 3)}</b>` : 'Analiz bekliyor',
          h.analizRaporNo ? `Rapor: ${esc(h.analizRaporNo)}` : null
        ])}
      </div>
      <p class="hint mt"><b>Bu lottan üretilen seriler:</b> ${
        seriler.length ? seriler.map(x => `<code>${esc(x.seri)}</code>`).join(', ') : 'Henüz üretime girmedi.'}</p>
    </div>
    ${seriler.length ? ileriIzleme(seriler.map(x => x.seri), h.lot) : ''}`;
    return;
  }

  /* 4) Çiftçi */
  const c = DB.ciftciler.find(x => x.id === q || x.ad.toLowerCase() === q.toLowerCase());
  if (c) {
    const lotlar = DB.hammadde.filter(x => x.ciftciId === c.id);
    const seriler = DB.seriler.filter(s2 => s2.girdiler.some(g => lotlar.some(l => l.lot === g.lot)));
    hedef.innerHTML = `<div class="card">
      <h2>Çiftçi — ${esc(c.ad)}</h2>
      <p class="hint">${esc(c.id)} · Ekim izni ${esc(c.izinNo)} · ${esc(c.il)}${c.ilce ? '/' + esc(c.ilce) : ''}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Lot</th><th>Teslim</th><th>Miktar</th><th>THC%</th><th>Statü</th></tr></thead>
        <tbody>${lotlar.length ? lotlar.map(l => `<tr>
          <td class="mono">${esc(l.lot)}</td><td>${trTarih(l.teslimTarihi)}</td>
          <td class="num">${sayi(l.miktarKg, 1)}</td>
          <td class="num">${l.thc == null ? '—' : sayi(l.thc, 3)}</td>
          <td>${rozet(l.durum)}</td></tr>`).join('')
          : '<tr><td colspan="5" class="empty">Teslimat yok.</td></tr>'}</tbody>
      </table></div>
    </div>
    ${seriler.length ? ileriIzleme(seriler.map(x => x.seri), c.ad) : ''}`;
    return;
  }

  hedef.innerHTML = `<div class="card"><div class="alert err">
    <b>Kayıt bulunamadı:</b> <code>${esc(q)}</code><br>
    Tekil karekod, seri no (CBD-D-…), ham madde lotu (HM-…) veya çiftçi kodu (CF-…) girin.
    Karekod sistemde yoksa <b>sahte ürün şüphesi</b> olarak değerlendirin.
  </div></div>`;
}

/* ===================================================================
   GERİ ÇEKME (RECALL)
   =================================================================== */
function recallSecenekDoldur() {
  const s = $('#sel-recall');
  const secenekler = [
    ...DB.hammadde.map(h => `<option value="HM|${esc(h.lot)}">Ham madde lotu — ${esc(h.lot)}</option>`),
    ...DB.seriler.map(x => `<option value="SR|${esc(x.seri)}">Üretim serisi — ${esc(x.seri)} (${esc(URUN_ADI[x.urunTipi])})</option>`)
  ];
  s.innerHTML = secenekler.length ? secenekler.join('') : '<option value="">Kayıt yok</option>';
}

function recallCalistir(secim) {
  const hedef = $('#recall-sonuc');
  if (!secim) { hedef.innerHTML = ''; return; }
  const [tip, kod] = secim.split('|');

  let seriler;
  if (tip === 'HM') seriler = DB.seriler.filter(s => s.girdiler.some(g => g.lot === kod));
  else seriler = DB.seriler.filter(s => s.seri === kod);

  const seriKodlari = seriler.map(s => s.seri);
  const paketler = DB.paketler.filter(p => seriKodlari.includes(p.seri));
  const satislar = DB.satislar.filter(s => paketler.some(p => p.uid === s.uid));

  /* Toplanacak noktalar */
  const noktalar = {};
  paketler.filter(p => p.durum === 'SEVK').forEach(p => {
    const sv = DB.sevkiyatlar.find(x => x.id === p.sevkId);
    if (!sv) return;
    noktalar[sv.aliciId] = (noktalar[sv.aliciId] || 0) + 1;
  });

  const depoda = paketler.filter(p => p.durum === 'SERBEST').length;

  hedef.innerHTML = `<div class="card">
    <h2>Geri Çekme Etki Analizi — ${esc(kod)}</h2>
    <div class="alert err">
      <b>Etkilenen kapsam:</b> ${seriler.length} üretim serisi · ${paketler.length} ambalaj birimi ·
      ${Object.keys(noktalar).length} alıcı nokta · <b>${satislar.length} hasta</b>
    </div>
    <div class="grid c4" style="margin-bottom:16px">
      <div class="kpi"><div class="v">${depoda}</div><div class="l">Depoda — Bloke Et</div></div>
      <div class="kpi"><div class="v">${paketler.filter(p => p.durum === 'SEVK').length}</div><div class="l">Piyasada — Topla</div></div>
      <div class="kpi"><div class="v">${satislar.length}</div><div class="l">Hastada — Bildir</div></div>
      <div class="kpi"><div class="v">${seriler.length}</div><div class="l">Etkilenen Seri</div></div>
    </div>

    <h2 style="margin-top:20px">1 · Toplanacak Noktalar</h2>
    <p class="hint">Bu adreslerdeki stok derhal bloke edilip iade alınmalıdır.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Alıcı</th><th>Tip</th><th>İl</th><th>Yetkili</th><th>Toplanacak Adet</th></tr></thead>
      <tbody>${Object.keys(noktalar).length ? Object.entries(noktalar).map(([id, adet]) => {
        const a = aliciBul(id);
        return `<tr>
          <td><b>${esc(a ? a.ad : id)}</b></td>
          <td>${esc(a ? a.tip : '—')}</td>
          <td>${esc(a ? a.il : '—')}</td>
          <td>${esc(a && a.yetkili ? a.yetkili : '—')}</td>
          <td class="num"><b>${adet}</b></td>
        </tr>`;
      }).join('') : '<tr><td colspan="5" class="empty">Piyasada bekleyen ürün yok.</td></tr>'}</tbody>
    </table></div>

    <h2 style="margin-top:20px">2 · Bilgilendirilecek Hastalar</h2>
    <p class="hint">Reçete numarası üzerinden ilgili eczane ve hekime bildirim yapılır. KVKK gereği kimlik maskelidir.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Hasta</th><th>Reçete</th><th>Hekim</th><th>Eczane</th><th>Satış Tarihi</th><th>Tekil Kod</th></tr></thead>
      <tbody>${satislar.length ? satislar.map(s => {
        const a = aliciBul(s.aliciId);
        return `<tr>
          <td><b>${esc(s.musteriAd)}</b> <span class="mono" style="color:var(--text-dim)">${esc(s.musteriTc)}</span></td>
          <td class="mono">${esc(s.receteNo)}</td>
          <td>${esc(s.hekim) || '—'}</td>
          <td>${esc(a ? a.ad : s.aliciId)}</td>
          <td>${trTarih(s.tarih)}</td>
          <td class="mono" style="font-size:11px">${esc(s.uid)}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="6" class="empty">Hastaya ulaşmış ürün yok.</td></tr>'}</tbody>
    </table></div>

    <h2 style="margin-top:20px">3 · Kaynağa Kadar Geri İzleme</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Seri</th><th>Ham Madde Lotu</th><th>Çiftçi</th><th>Ekim İzni</th><th>Parsel</th><th>THC%</th></tr></thead>
      <tbody>${seriler.flatMap(s => s.girdiler.map(g => {
        const h = hmBul(g.lot), c2 = h ? ciftciBul(h.ciftciId) : null;
        return `<tr>
          <td class="mono">${esc(s.seri)}</td>
          <td class="mono">${esc(g.lot)}</td>
          <td>${esc(c2 ? c2.ad : '—')}</td>
          <td class="mono">${esc(c2 ? c2.izinNo : '—')}</td>
          <td>${esc(c2 && c2.parsel ? c2.parsel : '—')}</td>
          <td class="num">${h && h.thc != null ? sayi(h.thc, 3) : '—'}</td>
        </tr>`;
      })).join('') || '<tr><td colspan="6" class="empty">Kayıt yok.</td></tr>'}</tbody>
    </table></div>

    <div class="row end mt no-print">
      <button class="btn ghost" onclick="window.print()">Raporu Yazdır</button>
      <button class="btn danger" id="btn-recall-uygula" data-kod="${esc(kod)}" data-tip="${esc(tip)}">
        Geri Çekmeyi Başlat ve BÜTS'e Bildir
      </button>
    </div>
  </div>`;

  const btn = $('#btn-recall-uygula');
  if (btn) btn.addEventListener('click', () => {
    if (!confirm(`${kod} için geri çekme başlatılacak.\n\n${paketler.length} ambalaj birimi bloke edilecek ve BÜTS bildirimi oluşturulacak.\n\nOnaylıyor musunuz?`)) return;
    paketler.forEach(p => { if (p.durum !== 'SATILDI') p.durum = 'RET'; });
    seriler.forEach(s => { s.durum = 'RET'; s.retNedeni = 'Geri çekme kararı — ' + kod; });
    logla(`GERİ ÇEKME başlatıldı — ${paketler.length} birim bloke`, kod);
    butsEkle('GERI_CEKME', kod, paketler.length, {
      kapsam: kod, seriler: seriKodlari, birimSayisi: paketler.length, hastaSayisi: satislar.length
    });
    kaydet();
    hepsiniCiz();
    toast('Geri çekme kaydedildi ve BÜTS kuyruğuna eklendi');
    recallCalistir(secim);
  });
}

/* ===================================================================
   PANEL
   =================================================================== */
function panelCiz() {
  $('#k-ciftci').textContent = DB.ciftciler.length;
  $('#k-hm').textContent = DB.hammadde.length;
  $('#k-seri').textContent = DB.seriler.length;
  $('#k-paket').textContent = DB.paketler.length;
  $('#k-sevk').textContent = DB.paketler.filter(p => p.durum === 'SEVK' || p.durum === 'SATILDI').length;
  $('#k-satis').textContent = DB.satislar.length;
  $('#k-karantina').textContent =
    DB.hammadde.filter(h => h.durum === 'KARANTINA').length +
    DB.seriler.filter(s => s.durum === 'KARANTINA').length;
  $('#k-buts').textContent = DB.butsKuyruk.filter(b => b.durum === 'BEKLIYOR').length;

  const halkalar = [
    ['Çiftçi / Tarla', DB.ciftciler.length, 'kayıtlı tedarikçi'],
    ['Ham Madde', DB.hammadde.filter(h => h.durum === 'SERBEST').length + ' / ' + DB.hammadde.length, 'serbest / toplam lot'],
    ['Üretim', DB.seriler.filter(s => s.durum === 'SERBEST').length + ' / ' + DB.seriler.length, 'serbest / toplam seri'],
    ['Ambalaj', DB.paketler.filter(p => p.durum === 'SERBEST').length, 'depoda bekleyen birim'],
    ['Sevkiyat', DB.sevkiyatlar.length, 'kapalı zincir sevkiyatı'],
    ['Eczane / Hasta', DB.satislar.length, 'hastaya teslim']
  ];
  $('#zincir-ozet').innerHTML = `<div class="grid c3">${halkalar.map(([ad, deger, alt]) =>
    `<div class="kpi"><div class="l">${ad}</div><div class="v" style="font-size:20px">${deger}</div>
     <div class="l" style="text-transform:none;letter-spacing:0">${alt}</div></div>`).join('')}</div>`;

  const g = $('#t-log');
  g.innerHTML = DB.log.length
    ? DB.log.slice(0, 40).map(l => `<tr>
        <td class="mono" style="white-space:nowrap">${esc(l.zaman)}</td>
        <td>${esc(l.kullanici)}</td>
        <td>${esc(l.islem)}</td>
        <td class="mono">${esc(l.kayit)}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="empty">Henüz işlem yok.</td></tr>';
}

/* ===================================================================
   SEÇENEK DOLDURUCULAR
   =================================================================== */
function seceneklerDoldur() {
  $('#sel-ciftci').innerHTML = '<option value="">Seçiniz</option>' +
    DB.ciftciler.map(c => `<option value="${esc(c.id)}">${esc(c.id)} — ${esc(c.ad)} (${esc(c.il)})</option>`).join('');

  const kar = DB.hammadde.filter(h => h.durum === 'KARANTINA');
  $('#sel-hm-karantina').innerHTML = kar.length
    ? '<option value="">Seçiniz</option>' + kar.map(h => {
        const c = ciftciBul(h.ciftciId);
        return `<option value="${esc(h.lot)}">${esc(h.lot)} — ${esc(c ? c.ad : '')} · ${sayi(h.miktarKg, 1)} kg</option>`;
      }).join('')
    : '<option value="">Analiz bekleyen lot yok</option>';

  /* Üretime uygun ham madde seçim kutuları */
  const uygun = DB.hammadde.filter(h => h.durum === 'SERBEST' && h.kalanKg > 0.001);
  $('#hm-secim').innerHTML = uygun.length
    ? uygun.map(h => {
        const c = ciftciBul(h.ciftciId);
        return `<label class="field">
          <span>${esc(h.lot)} — ${esc(c ? c.ad : '')} · kalan ${sayi(h.kalanKg, 1)} kg · THC %${sayi(h.thc, 3)}</span>
          <input type="number" step="0.1" min="0" max="${h.kalanKg}" data-lot="${esc(h.lot)}" placeholder="kullanılacak kg">
        </label>`;
      }).join('')
    : '<div class="empty">Üretime uygun (SERBEST) ham madde lotu yok. Önce analiz kaydı girin.</div>';

  const acik = DB.seriler.filter(s => s.durum === 'KARANTINA');
  $('#sel-seri-acik').innerHTML = acik.length
    ? '<option value="">Seçiniz</option>' + acik.map(s =>
        `<option value="${esc(s.seri)}">${esc(s.seri)} — ${esc(URUN_ADI[s.urunTipi])} · girdi ${sayi(s.girdiToplam, 1)} kg</option>`).join('')
    : '<option value="">Değerlendirme bekleyen seri yok</option>';

  const serbest = DB.seriler.filter(s => s.durum === 'SERBEST');
  const serbestOpt = serbest.length
    ? '<option value="">Seçiniz</option>' + serbest.map(s => {
        const kalan = s.ciktiKg - (s.ambalajlananG / 1000);
        return `<option value="${esc(s.seri)}">${esc(s.seri)} — ${esc(URUN_ADI[s.urunTipi])} · kalan ${sayi(kalan, 3)} kg</option>`;
      }).join('')
    : '<option value="">Ambalajlanacak serbest seri yok</option>';
  $('#sel-seri-serbest').innerHTML = serbestOpt;

  const ambalajli = [...new Set(DB.paketler.map(p => p.seri))];
  $('#sel-etiket-seri').innerHTML = ambalajli.length
    ? ambalajli.map(s => `<option value="${esc(s)}">${esc(s)} — ${DB.paketler.filter(p => p.seri === s).length} birim</option>`).join('')
    : '<option value="">Etiket üretilmiş seri yok</option>';

  $('#sel-alici').innerHTML = DB.aliciar.length
    ? '<option value="">Seçiniz</option>' + DB.aliciar.map(a =>
        `<option value="${esc(a.id)}">${esc(a.ad)} — ${esc(a.tip)} · ${esc(a.il)}</option>`).join('')
    : '<option value="">Önce alıcı tanımlayın</option>';

  const eczaneler = DB.aliciar.filter(a => a.tip === 'ECZANE');
  $('#sel-eczane').innerHTML = eczaneler.length
    ? '<option value="">Seçiniz</option>' + eczaneler.map(a =>
        `<option value="${esc(a.id)}">${esc(a.ad)} — ${esc(a.il)}</option>`).join('')
    : '<option value="">Önce eczane tanımlayın</option>';

  recallSecenekDoldur();
}

/* ===================================================================
   TOPLU ÇİZİM
   =================================================================== */
function hepsiniCiz() {
  panelCiz();
  ciftciTabloCiz();
  hmTabloCiz();
  seriTabloCiz();
  paketTabloCiz($('#q-paket').value);
  sevkTabloCiz();
  satisTabloCiz();
  butsTabloCiz();
  seceneklerDoldur();
  $('#in-kullanici').value = DB.kullanici;
}

/* ===================================================================
   FORM YARDIMCISI
   =================================================================== */
function formVerisi(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = v; });
  return o;
}

/* ===================================================================
   ÖRNEK VERİ
   =================================================================== */
function demoYukle() {
  DB = bosDB();

  const c1 = ciftciEkle({ ad: 'Ahmet Yılmaz', tcVkn: '12345678901', cksNo: 'CKS-15-0042',
    izinNo: 'BRD-2026-014', il: 'Burdur', ilce: 'Gölhisar', parsel: '112/7', alan: '45', tel: '05321234567' });
  const c2 = ciftciEkle({ ad: 'Yeşilova Tarım Koop.', tcVkn: '9876543210', cksNo: 'CKS-15-0119',
    izinNo: 'BRD-2026-027', il: 'Burdur', ilce: 'Yeşilova', parsel: '308/2', alan: '120', tel: '05339876543' });
  const c3 = ciftciEkle({ ad: 'Mehmet Demir', tcVkn: '10987654321', cksNo: 'CKS-32-0088',
    izinNo: 'ISP-2026-006', il: 'Isparta', ilce: 'Şarkikaraağaç', parsel: '45/13', alan: '30', tel: '05445556677' });

  const h1 = hamMaddeEkle({ ciftciId: c1.id, teslimTarihi: '2026-08-03', miktarKg: '520',
    hasatYili: '2026', nem: '8.4', irsaliye: 'IRS-9912' });
  const h2 = hamMaddeEkle({ ciftciId: c2.id, teslimTarihi: '2026-08-05', miktarKg: '780',
    hasatYili: '2026', nem: '9.1', irsaliye: 'IRS-9930' });
  const h3 = hamMaddeEkle({ ciftciId: c3.id, teslimTarihi: '2026-08-07', miktarKg: '310',
    hasatYili: '2026', nem: '7.8', irsaliye: 'IRS-9944' });

  analizKaydet({ lot: h1.lot, analizRaporNo: 'AR-2026-1187', thc: '0.184', cbd: '11.60',
    lab: 'TÜRKAK Akredite Lab A.Ş.', analizTarihi: '2026-08-06', onbirAnaliz: 'E' });
  analizKaydet({ lot: h2.lot, analizRaporNo: 'AR-2026-1203', thc: '0.212', cbd: '10.85',
    lab: 'TÜRKAK Akredite Lab A.Ş.', analizTarihi: '2026-08-08', onbirAnaliz: 'E' });
  /* Bu lot yasal sınırı aşıyor — sistem otomatik RET vermeli */
  analizKaydet({ lot: h3.lot, analizRaporNo: 'AR-2026-1210', thc: '0.412', cbd: '9.20',
    lab: 'TÜRKAK Akredite Lab A.Ş.', analizTarihi: '2026-08-09', onbirAnaliz: 'E' });

  const s1 = seriAc('DISTILAT', '2026-08-10', 'Yücel EKER', [{ lot: h1.lot, kg: 25 }]);
  seriDegerlendir({ seri: s1.seri, ciktiKg: '3.750', fireKg: '21.150', numuneKg: '0.065',
    cbdSon: '84.20', thcSon: '0.245', cozucu: '3200', sapma: 'H', serbestKisi: 'Salih ÖZKAN' });

  const s2 = seriAc('IZOLAT', '2026-08-11', 'Yücel EKER', [{ lot: h1.lot, kg: 12 }, { lot: h2.lot, kg: 13 }]);
  seriDegerlendir({ seri: s2.seri, ciktiKg: '3.420', fireKg: '21.480', numuneKg: '0.070',
    cbdSon: '99.40', thcSon: '0.021', cozucu: '1850', sapma: 'H', serbestKisi: 'Salih ÖZKAN' });

  ambalajla(s1.seri, 24, 10, '2028-08-10');
  ambalajla(s2.seri, 18, 5, '2028-08-11');

  const d1 = aliciEkle({ tip: 'DEPO', ad: 'Anadolu Ecza Deposu', gln: '8680000001234',
    il: 'Antalya', adres: 'Kepez OSB', yetkili: 'Ecz. Kemal Aras' });
  const e1 = aliciEkle({ tip: 'ECZANE', ad: 'Şifa Eczanesi', gln: '8680000005678',
    il: 'Burdur', adres: 'Cumhuriyet Cad. 12', yetkili: 'Ecz. Ayşe Kaya' });
  const e2 = aliciEkle({ tip: 'ECZANE', ad: 'Gölhisar Eczanesi', gln: '8680000009012',
    il: 'Burdur', adres: 'Pazar Mah. 45', yetkili: 'Ecz. Murat Şahin' });

  const p1 = DB.paketler.filter(p => p.seri === s1.seri);
  const p2 = DB.paketler.filter(p => p.seri === s2.seri);

  sevkKaydet({ tarih: '2026-08-12', aliciId: e1.id, tasiyici: 'Soğuk Zincir Lojistik A.Ş.',
    muhurNo: 'MHR-40128', irsaliye: 'SVK-IRS-3301', teslimAlan: 'Ecz. Ayşe Kaya' }, p1.slice(0, 10));
  sevkKaydet({ tarih: '2026-08-12', aliciId: e2.id, tasiyici: 'Soğuk Zincir Lojistik A.Ş.',
    muhurNo: 'MHR-40129', irsaliye: 'SVK-IRS-3302', teslimAlan: 'Ecz. Murat Şahin' }, p2.slice(0, 8));
  sevkKaydet({ tarih: '2026-08-13', aliciId: d1.id, tasiyici: 'Soğuk Zincir Lojistik A.Ş.',
    muhurNo: 'MHR-40133', irsaliye: 'SVK-IRS-3310', teslimAlan: 'Ecz. Kemal Aras' }, p1.slice(10, 18));

  satisKaydet({ aliciId: e1.id, uid: p1[0].uid, tarih: '2026-08-13', musteriAd: 'A.Y.',
    musteriTc: '12345678901', receteNo: 'RCT-2026-778101', hekim: 'Dr. Selin Öz' });
  satisKaydet({ aliciId: e1.id, uid: p1[1].uid, tarih: '2026-08-13', musteriAd: 'B.K.',
    musteriTc: '23456789012', receteNo: 'RCT-2026-778145', hekim: 'Dr. Selin Öz' });
  satisKaydet({ aliciId: e2.id, uid: p2[0].uid, tarih: '2026-08-14', musteriAd: 'C.T.',
    musteriTc: '34567890123', receteNo: 'RCT-2026-779002', hekim: 'Dr. Emre Tan' });

  DB.kullanici = 'İrem ERÇELİK';
  kaydet();
  hepsiniCiz();
  toast('Örnek veri yüklendi — İzleme Sorgusu sekmesini deneyin');
}

/* ===================================================================
   OLAY BAĞLAMA
   =================================================================== */
function olaylariBagla() {

  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-view]');
    if (b) sekmeGoster(b.dataset.view);
  });

  /* --- Çiftçi --- */
  $('#f-ciftci').addEventListener('submit', e => {
    e.preventDefault();
    const k = ciftciEkle(formVerisi(e.target));
    e.target.reset();
    hepsiniCiz();
    toast(`${k.id} — ${k.ad} kaydedildi`);
  });

  /* --- Ham madde --- */
  $('#f-hm').addEventListener('submit', e => {
    e.preventDefault();
    const v = formVerisi(e.target);
    if (!v.ciftciId) { toast('Önce çiftçi seçin'); return; }
    const k = hamMaddeEkle(v);
    e.target.reset();
    hepsiniCiz();
    toast(`${k.lot} karantinaya alındı — analiz bekliyor`);
  });

  $('#f-analiz').addEventListener('submit', e => {
    e.preventDefault();
    const v = formVerisi(e.target);
    if (!v.lot) { toast('Önce lot seçin'); return; }
    const s = analizKaydet(v);
    e.target.reset();
    hepsiniCiz();
    toast(s.durum === 'RET' ? 'RET — ' + s.mesaj : 'SERBEST — lot üretime uygun');
  });

  /* --- Üretim --- */
  $('#f-seri').addEventListener('submit', e => {
    e.preventDefault();
    const v = formVerisi(e.target);
    const girdiler = [];
    let hata = null;

    $$('#hm-secim input[data-lot]').forEach(inp => {
      const kg = parseFloat(inp.value);
      if (!kg || kg <= 0) return;
      const h = hmBul(inp.dataset.lot);
      if (kg > h.kalanKg + 1e-9) {
        hata = `${h.lot} lotunda yalnızca ${sayi(h.kalanKg, 1)} kg kaldı.`;
        return;
      }
      girdiler.push({ lot: inp.dataset.lot, kg });
    });

    if (hata) { toast(hata); return; }
    if (!girdiler.length) { toast('En az bir ham madde lotundan miktar girin'); return; }

    const k = seriAc(v.urunTipi, v.tarih, v.sorumlu, girdiler);
    e.target.reset();
    hepsiniCiz();
    toast(`${k.seri} açıldı — ${sayi(k.girdiToplam, 1)} kg girdi`);
    sekmeGoster('uretim');
  });

  $('#btn-mb').addEventListener('click', () => {
    const f = $('#f-serbest');
    const v = formVerisi(f);
    const s = seriBul(v.seri);
    if (!s) { toast('Önce seri seçin'); return; }
    const mb = mbHesapla(s.girdiToplam,
      parseFloat(v.ciktiKg) || 0, parseFloat(v.fireKg) || 0, parseFloat(v.numuneKg) || 0);
    $('#mb-onizleme').innerHTML = mbKutusu(mb);
  });

  $('#f-serbest').addEventListener('submit', e => {
    e.preventDefault();
    const v = formVerisi(e.target);
    if (!v.seri) { toast('Önce seri seçin'); return; }
    const s = seriDegerlendir(v);
    if (!s.ok) { toast(s.mesaj); return; }

    if (s.durum === 'RET') {
      $('#mb-onizleme').innerHTML = `<div class="alert err">
        <b>SERİ REDDEDİLDİ.</b> Serbest bırakma engellendi:
        <ul style="margin:6px 0 0 18px">${s.engeller.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>`;
      toast('Seri REDDEDİLDİ — ' + s.engeller.length + ' uygunsuzluk');
    } else {
      $('#mb-onizleme').innerHTML = `<div class="alert ok">
        <b>SERİ SERBEST BIRAKILDI.</b> Tüm kabul kriterleri sağlandı. Ambalajlamaya geçebilirsiniz.
      </div>`;
      toast('Seri serbest bırakıldı');
      e.target.reset();
    }
    hepsiniCiz();
  });

  /* --- Ambalaj --- */
  $('#f-ambalaj').addEventListener('submit', e => {
    e.preventDefault();
    const v = formVerisi(e.target);
    if (!v.seri) { toast('Önce seri seçin'); return; }
    const s = ambalajla(v.seri, parseInt(v.adet, 10), parseFloat(v.miktarG), v.skt);
    if (!s.ok) { toast(s.mesaj); return; }
    hepsiniCiz();
    $('#sel-etiket-seri').value = v.seri;
    etiketleriGoster(v.seri);
    toast(`${s.paketler.length} tekil karekod üretildi`);
  });

  $('#btn-etiket').addEventListener('click', () => {
    const s = $('#sel-etiket-seri').value;
    if (s) etiketleriGoster(s);
  });

  $('#btn-yazdir').addEventListener('click', () => window.print());

  $('#q-paket').addEventListener('input', e => paketTabloCiz(e.target.value));

  /* --- Alıcı / Sevkiyat --- */
  $('#f-alici').addEventListener('submit', e => {
    e.preventDefault();
    const k = aliciEkle(formVerisi(e.target));
    e.target.reset();
    hepsiniCiz();
    toast(`${k.ad} kaydedildi`);
  });

  $('#btn-sevk-kontrol').addEventListener('click', () => {
    const r = kodlariDogrula($('#sevk-kodlar').value);
    sevkOnizlemeCiz(r);
  });

  function sevkOnizlemeCiz(r) {
    $('#sevk-onizleme').innerHTML = `
      ${r.gecerli.length ? `<div class="alert ok"><b>${r.gecerli.length} birim sevke uygun.</b></div>` : ''}
      ${r.hatali.length ? `<div class="alert err"><b>${r.hatali.length} kod sevk edilemez:</b>
        <ul style="margin:6px 0 0 18px">${r.hatali.map(h =>
          `<li><code>${esc(h.kod.slice(0, 40))}${h.kod.length > 40 ? '…' : ''}</code> — ${esc(h.neden)}</li>`).join('')}</ul>
      </div>` : ''}
      ${!r.gecerli.length && !r.hatali.length ? '<div class="alert warn">Henüz kod okutulmadı.</div>' : ''}`;
  }

  $('#f-sevk').addEventListener('submit', e => {
    e.preventDefault();
    const v = formVerisi(e.target);
    if (!v.aliciId) { toast('Önce alıcı seçin'); return; }
    const r = kodlariDogrula(v.kodlar);
    sevkOnizlemeCiz(r);
    if (r.hatali.length) { toast('Hatalı kodları düzeltin — sevkiyat kaydedilmedi'); return; }
    if (!r.gecerli.length) { toast('En az bir geçerli karekod okutun'); return; }

    const k = sevkKaydet(v, r.gecerli);
    e.target.reset();
    $('#sevk-onizleme').innerHTML = `<div class="alert ok">
      <b>${k.id}</b> kaydedildi — ${k.paketler.length} birim sevk edildi. BÜTS referansı: <code>${esc(k.butsRef)}</code>
    </div>`;
    hepsiniCiz();
    toast(`${k.id} — ${k.paketler.length} birim sevk edildi`);
  });

  /* --- Satış --- */
  $('#f-satis').addEventListener('submit', e => {
    e.preventDefault();
    const v = formVerisi(e.target);
    if (!v.aliciId) { toast('Önce eczane seçin'); return; }
    const r = satisKaydet(v);
    if (!r.ok) { alert('SATIŞ ENGELLENDİ\n\n' + r.mesaj); toast('Satış engellendi'); return; }
    e.target.reset();
    hepsiniCiz();
    toast(`${r.kayit.id} — satış kaydedildi`);
  });

  /* --- İzleme --- */
  $('#btn-izle').addEventListener('click', () => izlemeSorgula($('#q-izle').value));
  $('#q-izle').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); izlemeSorgula(e.target.value); }
  });
  $('#btn-izle-yazdir').addEventListener('click', () => window.print());

  /* Tablolardaki "İzle" düğmeleri */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-izle]');
    if (!b) return;
    sekmeGoster('izle');
    $('#q-izle').value = b.dataset.izle;
    izlemeSorgula(b.dataset.izle);
  });

  /* --- Geri çekme --- */
  $('#btn-recall').addEventListener('click', () => recallCalistir($('#sel-recall').value));

  /* --- BÜTS --- */
  $('#btn-buts-json').addEventListener('click', () => {
    const bekleyen = DB.butsKuyruk.filter(b => b.durum === 'BEKLIYOR');
    if (!bekleyen.length) { toast('Bekleyen bildirim yok'); return; }
    indir('buts-bildirim-' + bugun() + '.json', JSON.stringify(bekleyen, null, 2));
    toast(bekleyen.length + ' bildirim dışa aktarıldı');
  });

  $('#btn-buts-onay').addEventListener('click', () => {
    const n = DB.butsKuyruk.filter(b => b.durum === 'BEKLIYOR').length;
    if (!n) { toast('Bekleyen bildirim yok'); return; }
    if (!confirm(`${n} bildirim "gönderildi" olarak işaretlenecek.\n\nBu işlem, bildirimlerin Kuruma fiilen ulaştığını doğrulamaz — yalnızca kaydı günceller.\n\nDevam edilsin mi?`)) return;
    DB.butsKuyruk.forEach(b => { if (b.durum === 'BEKLIYOR') b.durum = 'GONDERILDI'; });
    logla(n + ' BÜTS bildirimi gönderildi işaretlendi', '—');
    kaydet();
    hepsiniCiz();
    toast(n + ' bildirim işaretlendi');
  });

  /* --- Veri yönetimi --- */
  $('#btn-export').addEventListener('click', () => {
    indir('insitu-izlenebilirlik-yedek-' + bugun() + '.json', JSON.stringify(DB, null, 2));
    toast('Yedek indirildi');
  });

  $('#btn-import').addEventListener('click', () => $('#file-import').click());

  $('#file-import').addEventListener('change', e => {
    const dosya = e.target.files[0];
    if (!dosya) return;
    const okuyucu = new FileReader();
    okuyucu.onload = () => {
      try {
        const veri = JSON.parse(okuyucu.result);
        if (!veri || !Array.isArray(veri.ciftciler)) throw new Error('Geçersiz yedek dosyası');
        if (!confirm('Mevcut tüm veri, yedekteki veriyle DEĞİŞTİRİLECEK.\n\nDevam edilsin mi?')) return;
        DB = Object.assign(bosDB(), veri);
        kaydet();
        hepsiniCiz();
        toast('Yedek geri yüklendi');
      } catch (hata) {
        alert('Yedek okunamadı: ' + hata.message);
      }
    };
    okuyucu.readAsText(dosya);
    e.target.value = '';
  });

  $('#btn-demo').addEventListener('click', () => {
    if (DB.ciftciler.length && !confirm('Mevcut veri silinip örnek veriyle değiştirilecek.\n\nDevam edilsin mi?')) return;
    demoYukle();
  });

  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('TÜM KAYITLAR KALICI OLARAK SİLİNECEK.\n\nÖnce yedek aldığınızdan emin olun.\n\nDevam edilsin mi?')) return;
    if (!confirm('Son onay: bu işlem geri alınamaz. Silinsin mi?')) return;
    DB = bosDB();
    kaydet();
    hepsiniCiz();
    $('#izle-sonuc').innerHTML = '';
    $('#recall-sonuc').innerHTML = '';
    $('#etiket-alan').innerHTML = '';
    toast('Tüm veri silindi');
  });

  $('#in-kullanici').addEventListener('change', e => {
    DB.kullanici = e.target.value.trim() || 'Tanımsız';
    kaydet();
    toast('Aktif kullanıcı: ' + DB.kullanici);
  });
}

function indir(adi, icerik) {
  const blob = new Blob([icerik], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = adi;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ===================================================================
   BAŞLAT
   =================================================================== */
yukle();
olaylariBagla();
hepsiniCiz();

/* Tarih alanlarına bugünü ön-doldur */
$$('input[type="date"]').forEach(i => { if (!i.value) i.value = bugun(); });
