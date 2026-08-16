/**
 * GÖREV TAKVİMİ — birim testleri.
 *
 * Koruduğu şey: dönem anahtarının DETERMİNİSTİK olması. Anahtar kayarsa aynı
 * iş için ikinci görev açılır (mükerrer kayıt) ya da hiç açılmaz (kaçırılmış
 * GMP faaliyeti). Yıl sınırındaki ISO hafta hesabı ve ay uzunlukları özellikle
 * sınanıyor — naif hesabın bozulduğu yerler oralar.
 */
import assert from "node:assert/strict";
import {
  PERIYOT_KODLARI,
  periyotMu,
  gunFarki,
  donemAnahtari,
  donemVadesi,
  donemler,
  vadeDurumu,
  uyumOzeti,
  geriSayim,
  varsayilanUyariGun,
} from "../../src/lib/gorev.ts";

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

// ── Periyot listesi ─────────────────────────────────────────────────────────

t("yedi periyot tanımlı ve tekil", () => {
  assert.equal(PERIYOT_KODLARI.length, 7);
  assert.equal(new Set(PERIYOT_KODLARI).size, 7);
  assert.ok(periyotMu("AYLIK"));
  assert.ok(!periyotMu("BELKI"));
});

// ── Dönem anahtarı ──────────────────────────────────────────────────────────

t("günlük dönem anahtarı tarihin kendisi", () => {
  assert.equal(donemAnahtari("GUNLUK", "2026-08-16"), "2026-08-16");
});

t("aylık / çeyrek / yarıyıl / yıl anahtarları", () => {
  assert.equal(donemAnahtari("AYLIK", "2026-08-16"), "2026-08");
  assert.equal(donemAnahtari("UC_AYLIK", "2026-08-16"), "2026-Q3");
  assert.equal(donemAnahtari("UC_AYLIK", "2026-01-01"), "2026-Q1");
  assert.equal(donemAnahtari("ALTI_AYLIK", "2026-06-30"), "2026-H1");
  assert.equal(donemAnahtari("ALTI_AYLIK", "2026-07-01"), "2026-H2");
  assert.equal(donemAnahtari("YILLIK", "2026-12-31"), "2026");
});

t("iki yıllık blok çift yılda başlar", () => {
  assert.equal(donemAnahtari("IKI_YILLIK", "2026-03-01"), "2026-2027");
  assert.equal(donemAnahtari("IKI_YILLIK", "2027-11-30"), "2026-2027");
  assert.equal(donemAnahtari("IKI_YILLIK", "2028-01-01"), "2028-2029");
});

t("ISO hafta: yıl sınırı kaymıyor", () => {
  // 1 Ocak 2026 perşembe → ISO'ya göre 2026-W01
  assert.equal(donemAnahtari("HAFTALIK", "2026-01-01"), "2026-W01");
  // 31 Aralık 2025 çarşamba → aynı ISO haftası, yani yine 2026-W01
  assert.equal(donemAnahtari("HAFTALIK", "2025-12-31"), "2026-W01");
  // 1 Ocak 2027 cuma → önceki yılın son haftası (2026-W53)
  assert.equal(donemAnahtari("HAFTALIK", "2027-01-01"), "2026-W53");
});

t("aynı haftanın her günü aynı anahtarı verir", () => {
  const gunler = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"];
  const anahtarlar = new Set(gunler.map((g) => donemAnahtari("HAFTALIK", g)));
  assert.equal(anahtarlar.size, 1, `beklenen tek anahtar, alınan ${[...anahtarlar].join(",")}`);
});

// ── Dönem vadesi ────────────────────────────────────────────────────────────

t("vade dönemin SON günü", () => {
  assert.equal(donemVadesi("GUNLUK", "2026-08-16"), "2026-08-16");
  assert.equal(donemVadesi("AYLIK", "2026-08"), "2026-08-31");
  assert.equal(donemVadesi("UC_AYLIK", "2026-Q3"), "2026-09-30");
  assert.equal(donemVadesi("ALTI_AYLIK", "2026-H1"), "2026-06-30");
  assert.equal(donemVadesi("YILLIK", "2026"), "2026-12-31");
  assert.equal(donemVadesi("IKI_YILLIK", "2026-2027"), "2027-12-31");
});

t("şubat ve artık yıl doğru", () => {
  assert.equal(donemVadesi("AYLIK", "2026-02"), "2026-02-28");
  assert.equal(donemVadesi("AYLIK", "2028-02"), "2028-02-29");
});

t("haftalık vade o haftanın pazarı", () => {
  // 2026-W33: 10 Ağustos pazartesi → 16 Ağustos pazar
  assert.equal(donemVadesi("HAFTALIK", "2026-W33"), "2026-08-16");
});

t("vade, anahtarı ürettiği dönemin içinde kalır (gidiş-dönüş)", () => {
  for (const p of PERIYOT_KODLARI) {
    for (const g of ["2026-01-01", "2026-02-28", "2026-08-16", "2026-12-31"]) {
      const d = donemAnahtari(p, g);
      const v = donemVadesi(p, d);
      assert.equal(donemAnahtari(p, v), d, `${p} ${g}: vade ${v} farklı döneme düştü`);
    }
  }
});

// ── Dönem üretimi ───────────────────────────────────────────────────────────

t("günlük pencere gün sayısı kadar dönem üretir", () => {
  const r = donemler("GUNLUK", "2026-08-01", "2026-08-10");
  assert.equal(r.donemler.length, 10);
  assert.equal(r.kirpildi, false);
  assert.equal(r.donemler[0], "2026-08-01");
  assert.equal(r.donemler[9], "2026-08-10");
});

t("aylık pencere ay başına tek dönem üretir", () => {
  const r = donemler("AYLIK", "2026-01-15", "2026-04-02");
  assert.deepEqual(r.donemler, ["2026-01", "2026-02", "2026-03", "2026-04"]);
});

t("bitiş başlangıçtan önceyse hiç dönem yok", () => {
  assert.deepEqual(donemler("GUNLUK", "2026-08-10", "2026-08-01").donemler, []);
});

t("üst sınır aşılınca kırpıldı bildiriliyor — sessiz kesme yok", () => {
  const r = donemler("GUNLUK", "2020-01-01", "2026-08-16", 50);
  assert.equal(r.donemler.length, 50);
  assert.equal(r.kirpildi, true);
});

// ── Vade durumu ─────────────────────────────────────────────────────────────

t("vade durumu: arşiv TAMAM, geçmiş GECIKMIS, bugün BUGUN", () => {
  assert.equal(vadeDurumu("2026-08-01", "ARSIV", "2026-08-16"), "TAMAM");
  assert.equal(vadeDurumu("2026-08-01", "ACIK", "2026-08-16"), "GECIKMIS");
  assert.equal(vadeDurumu("2026-08-16", "ACIK", "2026-08-16"), "BUGUN");
  assert.equal(vadeDurumu("2026-08-20", "ACIK", "2026-08-16"), "BEKLIYOR");
  assert.equal(vadeDurumu("2026-08-01", "IPTAL", "2026-08-16"), "IPTAL");
});

t("BASILDI tamamlanma sayılmaz — kâğıt arşive dönmeden iş bitmez", () => {
  assert.equal(vadeDurumu("2026-08-01", "BASILDI", "2026-08-16"), "GECIKMIS");
  assert.equal(vadeDurumu("2026-08-01", "TESLIM", "2026-08-16"), "GECIKMIS");
});

// ── Uyum oranı ──────────────────────────────────────────────────────────────

const g = (kod, vade, durum, arsiv = null) => ({ kod, vade, durum, arsiv_tarih: arsiv });

t("uyum: yalnızca vadesi geçmiş görevler değerlendirilir", () => {
  const o = uyumOzeti(
    [
      g("A", "2026-08-01", "ARSIV", "2026-08-01"),
      g("B", "2026-09-01", "ACIK"), // gelecek — hesaba girmez
    ],
    "2026-08-16"
  );
  assert.equal(o.degerlendirilen, 1);
  assert.equal(o.oran, 100);
});

t("uyum: geç arşivlenen görev zamanında sayılmaz", () => {
  const o = uyumOzeti(
    [
      g("A", "2026-08-01", "ARSIV", "2026-08-01"), // tam vadesinde → zamanında
      g("B", "2026-08-02", "ARSIV", "2026-08-05"), // 3 gün geç
      g("C", "2026-08-03", "ACIK"), // hiç yapılmamış
    ],
    "2026-08-16"
  );
  assert.equal(o.degerlendirilen, 3);
  assert.equal(o.zamaninda, 1);
  assert.equal(o.gecikmis, 2);
  assert.equal(o.oran, 33);
});

t("uyum: iptal görev hesaba girmez", () => {
  const o = uyumOzeti([g("A", "2026-08-01", "IPTAL")], "2026-08-16");
  assert.equal(o.degerlendirilen, 0);
  assert.equal(o.oran, null, "değerlendirilecek görev yoksa oran null olmalı, %0 değil");
});

// ── Geri sayım ──────────────────────────────────────────────────────────────

t("geri sayım bitiş tarihi ve kalan gün", () => {
  // SOP-DE-06: kannabinoid içeren imha bekleyen atık 15 gün
  const r = geriSayim("2026-08-01", 15, "2026-08-10");
  assert.equal(r.bitis, "2026-08-16");
  assert.equal(r.kalanGun, 6);
  assert.equal(r.durum, "NORMAL");
});

t("geri sayım: uyarı eşiği ve dolma sınırı kapsayıcı", () => {
  assert.equal(geriSayim("2026-08-01", 15, "2026-08-13", 3).durum, "YAKLASIYOR"); // 3 gün kaldı
  assert.equal(geriSayim("2026-08-01", 15, "2026-08-16", 3).durum, "YAKLASIYOR"); // son gün
  assert.equal(geriSayim("2026-08-01", 15, "2026-08-17", 3).durum, "DOLDU"); // bir gün geçti
});

t("ret malzeme 30 / posa 7 gün — doküman süreleri", () => {
  assert.equal(geriSayim("2026-08-01", 30, "2026-08-31").kalanGun, 0);
  assert.equal(geriSayim("2026-08-01", 7, "2026-08-09").durum, "DOLDU");
});

t("uyarı eşiği süre uzunluğuna göre ölçekleniyor", () => {
  assert.equal(varsayilanUyariGun(7), 2);
  assert.equal(varsayilanUyariGun(30), 5);
  assert.equal(varsayilanUyariGun(60), 15);
  assert.equal(varsayilanUyariGun(365), 30);
});

t("gün farkı işaretli", () => {
  assert.equal(gunFarki("2026-08-16", "2026-08-01"), 15);
  assert.equal(gunFarki("2026-08-01", "2026-08-16"), -15);
  assert.equal(gunFarki("2026-08-16", "2026-08-16"), 0);
});

console.log(`✓ görev — ${gecen} test geçti`);
