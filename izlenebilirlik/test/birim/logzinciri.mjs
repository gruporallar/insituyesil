/**
 * DENETİM İZİ HASH ZİNCİRİ.
 *
 * Koruduğu iddia tek cümle: geçmiş bir log satırı sonradan değiştirilir ya
 * da silinirse zincir KOPMALI ve kopma yeri söylenmeli. Bu testler sahte bir
 * zincir kurup her kurcalama türünü tek tek dener.
 */
import assert from "node:assert/strict";
import { ozetHesapla, zinciriDogrula } from "../../src/lib/logZinciri.ts";

let gecen = 0;
function t(ad, fn) {
  try { fn(); gecen++; }
  catch (e) { console.error(`✗ ${ad}\n  ${e.message}`); process.exitCode = 1; }
}

/** id 1..n zincirli sahte kayıtlar. */
function zincir(n, baslangicOzet = "") {
  const satirlar = [];
  let onceki = baslangicOzet;
  for (let i = 1; i <= n; i++) {
    const s = {
      id: i, tarih: `2026-08-16 10:00:0${i % 10}`, kullanici_id: 1,
      eylem: `İşlem ${i}`, kayit: i % 2 ? `KAYIT-${i}` : null, detay: null,
    };
    const ozet = ozetHesapla(onceki, s);
    satirlar.push({ ...s, ozet });
    onceki = ozet;
  }
  return satirlar;
}

t("özet deterministik ve alan sırasına duyarlı", () => {
  const s = { id: 1, tarih: "2026-08-16", kullanici_id: 1, eylem: "X", kayit: "K", detay: "D" };
  assert.equal(ozetHesapla("", s), ozetHesapla("", s));
  assert.notEqual(ozetHesapla("", s), ozetHesapla("", { ...s, eylem: "Y" }));
  assert.notEqual(ozetHesapla("", s), ozetHesapla("baska", s));
});

t("alan kaydırma saldırısı tutmaz — uzunluk öneki", () => {
  // ("ab","c") ile ("a","bc") aynı düz birleşimi verir; özetleri FARKLI olmalı.
  const a = ozetHesapla("", { id: 1, tarih: "t", kullanici_id: null, eylem: "ab", kayit: "c", detay: null });
  const b = ozetHesapla("", { id: 1, tarih: "t", kullanici_id: null, eylem: "a", kayit: "bc", detay: null });
  assert.notEqual(a, b);
});

t("sağlam zincir doğrulanıyor", () => {
  const r = zinciriDogrula(zincir(50));
  assert.equal(r.tamam, true);
  assert.equal(r.zincirli, 50);
});

t("ortadaki satırın DETAYI değiştirilirse zincir orada kopuyor", () => {
  const z = zincir(20);
  z[9] = { ...z[9], detay: "sonradan eklendi" };
  const r = zinciriDogrula(z);
  assert.equal(r.tamam, false);
  assert.equal(r.kopanId, 10);
});

t("ortadan satır SİLİNİRSE zincir bir sonrakinde kopuyor", () => {
  const z = zincir(20).filter((s) => s.id !== 10);
  const r = zinciriDogrula(z);
  assert.equal(r.tamam, false);
  assert.equal(r.kopanId, 11);
});

t("özetin kendisi kurcalanırsa yakalanıyor", () => {
  const z = zincir(5);
  z[2] = { ...z[2], ozet: "0".repeat(64) };
  const r = zinciriDogrula(z);
  assert.equal(r.tamam, false);
  assert.equal(r.kopanId, 3);
});

t("göç öncesi özetsiz kayıtlar ZİNCİR ÖNCESİ sayılıyor", () => {
  const eski = [
    { id: 1, tarih: "t1", kullanici_id: 1, eylem: "eski", kayit: null, detay: null, ozet: null },
    { id: 2, tarih: "t2", kullanici_id: 1, eylem: "eski", kayit: null, detay: null, ozet: null },
  ];
  // Zincir 3. satırdan başlıyor; önceki = "" (genesis).
  const yeni = zincir(3).map((s) => ({ ...s, id: s.id + 2 }));
  // id kaydığı için özetler yeniden hesaplanmalı:
  let onceki = "";
  for (const s of yeni) { s.ozet = ozetHesapla(onceki, s); onceki = s.ozet; }
  const r = zinciriDogrula([...eski, ...yeni]);
  assert.equal(r.tamam, true);
  assert.equal(r.zincirli, 3);
  assert.match(r.mesaj, /2 kayıt zincir öncesinden/);
});

t("zincir başladıktan sonra özetsiz satır kopmadır", () => {
  const z = zincir(3);
  z.push({ id: 4, tarih: "t", kullanici_id: 1, eylem: "kaçak", kayit: null, detay: null, ozet: null });
  const r = zinciriDogrula(z);
  assert.equal(r.tamam, false);
  assert.equal(r.kopanId, 4);
});

t("boş ve tamamı-eski listelerde patlamıyor", () => {
  assert.equal(zinciriDogrula([]).tamam, true);
  const hepsiEski = [{ id: 1, tarih: "t", kullanici_id: null, eylem: "e", kayit: null, detay: null, ozet: null }];
  const r = zinciriDogrula(hepsiEski);
  assert.equal(r.tamam, true);
  assert.equal(r.zincirli, 0);
});

console.log(`✓ logzinciri — ${gecen} test geçti`);
