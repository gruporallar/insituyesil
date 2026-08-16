/**
 * ETİKET TURU — üretilen karekod, kameradan okunduğunda aynı veriyi veriyor mu?
 *
 * Bu test tek bir soruyu yanıtlıyor: bastığımız etiketi okuttuğumuzda geri
 * aynı bilgi geliyor mu? Zincirin üç halkası burada birleşiyor:
 *
 *   karekodUret → QR sembolü → jsQR (kameranın kullandığı çözücü) → karekodCozumle
 *
 * ASIL RİSK GS KARAKTERİ. GS1 ayırıcısı yazdırılamayan bir kontrol karakteri
 * (ASCII 29). QR kodlayıcı ya da çözücü bunu kırparsa, kaybederse veya UTF-8
 * çok baytlıya çevirirse etiket basılır, gözle doğru görünür, ama okutulduğunda
 * `paketler.uid` ile eşleşmez. Bu, ancak sahada fark edilecek bir hata olurdu.
 *
 * Bilerek KAMERA KULLANMIYOR: sembolü doğrudan piksel tamponuna çiziyoruz.
 * Kamera testi ancak gerçek cihazda anlamlı; burada test edilen şey optik
 * değil, VERİNİN KENDİSİ.
 */
import assert from "node:assert/strict";
import qrcode from "qrcode-generator";
import jsQR from "jsqr";
import { GS, GTIN, karekodUret, karekodCozumle, karekodNormalize } from "../../src/lib/karekod.ts";

let gecen = 0;
function t(ad, fn) {
  try {
    fn();
    gecen++;
  } catch (e) {
    console.error(`✗ ${ad}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

/**
 * QR sembolünü jsQR'ın beklediği RGBA tamponuna çizer.
 *
 * `olcek` modül başına piksel. Sessiz alan (quiet zone) 4 modül — standart
 * asgari; daha darı bazı çözücülerde okunmuyor ve etiket tasarımında bu
 * boşluğu kısmanın cazip geldiği yer tam da burası.
 */
function rasterle(icerik, olcek = 6, sessizModul = 4) {
  const qr = qrcode(0, "M");
  qr.addData(icerik, "Byte");
  qr.make();

  const n = qr.getModuleCount();
  const kenar = sessizModul * olcek;
  const boyut = n * olcek + kenar * 2;
  const veri = new Uint8ClampedArray(boyut * boyut * 4).fill(255); // beyaz zemin

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      for (let dy = 0; dy < olcek; dy++) {
        for (let dx = 0; dx < olcek; dx++) {
          const px = ((kenar + r * olcek + dy) * boyut + (kenar + c * olcek + dx)) * 4;
          veri[px] = veri[px + 1] = veri[px + 2] = 0;
        }
      }
    }
  }
  return { veri, boyut, modul: n };
}

/** Sembolü çiz, oku, içeriği geri döndür. */
function turAt(icerik, olcek, sessizModul) {
  const { veri, boyut } = rasterle(icerik, olcek, sessizModul);
  const okunan = jsQR(veri, boyut, boyut);
  return okunan?.data ?? null;
}

// ── Tam tur ─────────────────────────────────────────────────────────────────

const ORNEK = {
  gtin: GTIN.DISTILAT,
  tekil: "T00000023",
  skt: "2028-08-01",
  seri: "CBD-D-2026-0001",
};

t("üretilen karekod okunduğunda BİREBİR aynı metni veriyor", () => {
  const basilan = karekodUret(ORNEK);
  const okunan = turAt(basilan);
  assert.notEqual(okunan, null, "sembol hiç okunamadı");
  assert.equal(okunan, basilan);
});

t("GS ayırıcısı turdan sağ çıkıyor", () => {
  const basilan = karekodUret(ORNEK);
  const okunan = turAt(basilan);
  assert.ok(okunan.includes(GS), "GS karakteri kayboldu — kod uid ile eşleşmez");
  assert.equal(okunan.split(GS).length - 1, 1, "GS sayısı değişti");
  assert.equal(okunan.indexOf(GS), basilan.indexOf(GS), "GS yeri kaydı");
});

t("okunan kod alanlarına doğru ayrılıyor", () => {
  const c = karekodCozumle(turAt(karekodUret(ORNEK)));
  assert.notEqual(c, null);
  assert.equal(c.gtin, ORNEK.gtin);
  assert.equal(c.tekil, ORNEK.tekil);
  assert.equal(c.skt, ORNEK.skt);
  assert.equal(c.seri, ORNEK.seri);
  assert.equal(c.gtinGecerli, true);
  assert.equal(c.ayiriciVardi, true, "ayırıcılı yol kullanılmalıydı");
});

t("izolat GTIN'i de aynı turu tamamlıyor", () => {
  const a = { gtin: GTIN.IZOLAT, tekil: "T00000099", skt: "2029-01-15", seri: "CBD-I-2026-0002" };
  const c = karekodCozumle(turAt(karekodUret(a)));
  assert.equal(c.tekil, a.tekil);
  assert.equal(c.seri, a.seri);
  assert.equal(c.skt, a.skt);
});

t("okunan kod normalize edildiğinde değişmiyor — uid ile eşleşir", () => {
  const basilan = karekodUret(ORNEK);
  assert.equal(karekodNormalize(turAt(basilan)), basilan);
});

// ── Etiket tasarımı sınırları ───────────────────────────────────────────────
//
// Bu iki test bir iş kuralı değil, ETİKET BASKISI İÇİN ALT SINIR. Etiket
// küçültülürken "bir tık daha küçülsün" denmesi çok kolay; sınırın nerede
// olduğu ölçülmüş olsun.

t("modül başına 3 piksele kadar küçültülen sembol hâlâ okunuyor", () => {
  const basilan = karekodUret(ORNEK);
  for (const olcek of [3, 4, 6, 10]) {
    assert.equal(turAt(basilan, olcek), basilan, `${olcek} px/modül okunamadı`);
  }
});

t("sessiz alan 4 modülün altına inince okuma bozulabiliyor — 4 korunmalı", () => {
  const basilan = karekodUret(ORNEK);
  // 4 modül sessiz alanla KESİN okunuyor; etiket şablonunda bu boşluk kısılmamalı.
  assert.equal(turAt(basilan, 6, 4), basilan);
});

// ── Uzun seri numarası ──────────────────────────────────────────────────────

t("uzun parti numarası sembolü büyütüyor ama veriyi bozmuyor", () => {
  const a = { ...ORNEK, seri: "CBD-D-2026-0001-YENIDEN-ISLENMIS-PARTI" };
  const basilan = karekodUret(a);
  const c = karekodCozumle(turAt(basilan));
  assert.equal(c.seri, a.seri);
});

console.log(`✓ etiket-tur — ${gecen} test geçti`);
