/**
 * PROSES İÇİ KONTROLLER — birim testleri.
 *
 * Ek-13'ün kritik kontrol noktalarını koruyor. Sınır değerler ayrıca test
 * ediliyor: "325 bar hedef, 300–350 kabul" tanımında 300'ün reddedilmesi
 * proses durdurur, 351'in kabulü spesifikasyon dışı ürün üretir.
 */
import assert from "node:assert/strict";
import {
  PROSES_ADIMLARI,
  adimlar,
  adimBul,
  prosesKarari,
} from "../../src/lib/proses.ts";

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

// ── Tanım bütünlüğü ──────────────────────────────────────────────────────────

t("adım kodları ve sıraları tekil", () => {
  const kodlar = PROSES_ADIMLARI.map((a) => a.kod);
  const siralar = PROSES_ADIMLARI.map((a) => a.sira);
  assert.equal(new Set(kodlar).size, kodlar.length, "tekrarlayan adım kodu var");
  assert.equal(new Set(siralar).size, siralar.length, "tekrarlayan sıra numarası var");
});

t("her adımın SOP ve form referansı var", () => {
  for (const a of PROSES_ADIMLARI) {
    assert.ok(a.sop && a.form, `${a.kod} için SOP/form eksik`);
    assert.ok(a.olcumler.length > 0, `${a.kod} için ölçüm tanımlı değil`);
  }
});

t("ölçüm anahtarları adım içinde tekil", () => {
  for (const a of PROSES_ADIMLARI) {
    const k = a.olcumler.map((o) => o.anahtar);
    assert.equal(new Set(k).size, k.length, `${a.kod} içinde tekrarlayan anahtar`);
  }
});

t("sayısal ölçümlerde min <= max", () => {
  for (const a of PROSES_ADIMLARI) {
    for (const o of a.olcumler) {
      if (o.tip === "sayi" && o.min !== undefined && o.max !== undefined) {
        assert.ok(o.min <= o.max, `${a.kod}.${o.anahtar}: min > max`);
      }
    }
  }
});

t("kristalizasyon yalnızca izolatta uygulanır", () => {
  const d = adimlar("DISTILAT").map((a) => a.kod);
  const i = adimlar("IZOLAT").map((a) => a.kod);
  assert.ok(!d.includes("P10"), "distilatta kristalizasyon adımı çıkmamalı");
  assert.ok(i.includes("P10"), "izolatta kristalizasyon adımı olmalı");
  assert.equal(i.length, d.length + 1);
});

t("adım koda göre bulunur", () => {
  assert.equal(adimBul("P05")?.ad, "Süperkritik CO₂ ekstraksiyon");
  assert.equal(adimBul("YOK"), undefined);
});

// ── Ekstraksiyon (P05) ───────────────────────────────────────────────────────

const P05 = adimBul("P05");
const P05_UYGUN = {
  basinc: 325, sicaklik: 50, sure: 5, verim: 15, kayit_araligi: "E",
};

t("uygun ekstraksiyon kaydı geçer", () => {
  const k = prosesKarari(P05, P05_UYGUN);
  assert.equal(k.uygun, true, k.engeller.join(" | "));
});

t("verim %12 altındaysa uygunsuz", () => {
  const k = prosesKarari(P05, { ...P05_UYGUN, verim: 11.5 });
  assert.equal(k.uygun, false);
  assert.ok(k.engeller.some((e) => /verim/i.test(e)), k.engeller.join(" | "));
});

t("verim tam %12 KABUL edilir", () => {
  // Ek-13 kriteri "≥ %12". Sınırda reddetmek üretimi gereksiz durdurur.
  assert.equal(prosesKarari(P05, { ...P05_UYGUN, verim: 12 }).uygun, true);
});

t("basınç sınırları kapsayıcı", () => {
  assert.equal(prosesKarari(P05, { ...P05_UYGUN, basinc: 300 }).uygun, true);
  assert.equal(prosesKarari(P05, { ...P05_UYGUN, basinc: 350 }).uygun, true);
  assert.equal(prosesKarari(P05, { ...P05_UYGUN, basinc: 299 }).uygun, false);
  assert.equal(prosesKarari(P05, { ...P05_UYGUN, basinc: 351 }).uygun, false);
});

t("30 dakikalık kayıt işaretlenmediyse uygunsuz", () => {
  const k = prosesKarari(P05, { ...P05_UYGUN, kayit_araligi: "H" });
  assert.equal(k.uygun, false);
  assert.ok(k.engeller.some((e) => /30 dakikada/.test(e)));
});

t("eksik ölçüm uygunsuzluk sayılır", () => {
  const k = prosesKarari(P05, { basinc: 325 });
  assert.equal(k.uygun, false);
  assert.ok(k.engeller.length >= 3, k.engeller.join(" | "));
});

t("sayı olmayan değer yakalanır", () => {
  const k = prosesKarari(P05, { ...P05_UYGUN, basinc: "abc" });
  assert.equal(k.uygun, false);
  assert.ok(k.engeller.some((e) => /sayı olmalı/.test(e)));
});

t("virgüllü ondalık kabul edilir", () => {
  // Operatör Türkçe klavyeyle "4,5" yazabilir.
  assert.equal(prosesKarari(P05, { ...P05_UYGUN, sure: "4,5" }).uygun, true);
});

// ── Vinterizasyon (P06) — negatif sıcaklık ───────────────────────────────────

const P06 = adimBul("P06");
t("negatif sıcaklık aralığı doğru çalışır", () => {
  const temel = { sicaklik: -20, sure: 14, filtrasyon_sicaklik: -15, filtre_kademe: "E" };
  assert.equal(prosesKarari(P06, temel).uygun, true);
  // −17 °C, −22…−18 aralığının DIŞINDA (yeterince soğutulmamış)
  assert.equal(prosesKarari(P06, { ...temel, sicaklik: -17 }).uygun, false);
  assert.equal(prosesKarari(P06, { ...temel, sicaklik: -23 }).uygun, false);
});

t("bekleme süresi 12 saat altındaysa uygunsuz", () => {
  const k = prosesKarari(P06, {
    sicaklik: -20, sure: 11, filtrasyon_sicaklik: -15, filtre_kademe: "E",
  });
  assert.equal(k.uygun, false);
});

// ── Distilasyon (P09) — çok küçük aralık ─────────────────────────────────────

const P09 = adimBul("P09");
t("vakum gibi küçük aralıklar doğru değerlendirilir", () => {
  const temel = { vakum: 0.005, sicaklik: 170, cbd: 84, thc: 0.2 };
  assert.equal(prosesKarari(P09, temel).uygun, true);
  assert.equal(prosesKarari(P09, { ...temel, vakum: 0.02 }).uygun, false);
  assert.equal(prosesKarari(P09, { ...temel, vakum: 0.0005 }).uygun, false);
});

t("THC sınırı distilasyon adımında da uygulanır", () => {
  const k = prosesKarari(P09, { vakum: 0.005, sicaklik: 170, cbd: 84, thc: 0.45 });
  assert.equal(k.uygun, false);
  assert.ok(k.engeller.some((e) => /THC/.test(e)));
});

// ── Çift kontrol / çift imza ─────────────────────────────────────────────────

const P04 = adimBul("P04");
t("tartımda aynı kişi iki kez paraf atamaz", () => {
  const k = prosesKarari(P04, {
    terazi_kalibre: "E", tartilan_kg: 25,
    kontrol_1: "Yücel EKER", kontrol_2: "yücel eker",
    kap_etiketlendi: "E",
  });
  assert.equal(k.uygun, false);
  assert.ok(k.engeller.some((e) => /iki farklı kişi/.test(e)), k.engeller.join(" | "));
});

t("farklı kişiler paraf atınca geçer", () => {
  const k = prosesKarari(P04, {
    terazi_kalibre: "E", tartilan_kg: 25,
    kontrol_1: "Yücel EKER", kontrol_2: "İrem ERÇELİK",
    kap_etiketlendi: "E",
  });
  assert.equal(k.uygun, true, k.engeller.join(" | "));
});

const P11 = adimBul("P11");
t("hat temizliğinde çift imza aynı kişi olamaz", () => {
  const k = prosesKarari(P11, {
    hat_bos: "E", ekipman_etiket: "E",
    imza_uretim: "Salih ÖZKAN", imza_kgkk: "  SALİH ÖZKAN  ",
  });
  assert.equal(k.uygun, false);
  assert.ok(k.engeller.some((e) => /çift imza/i.test(e)));
});

t("boş paraf çift kontrol uyarısı üretmez, eksik alan uyarısı üretir", () => {
  // İkisi de boşsa "aynı kişi" demek yanlış olur; eksik alan denmeli.
  const k = prosesKarari(P04, {
    terazi_kalibre: "E", tartilan_kg: 25, kap_etiketlendi: "E",
  });
  assert.equal(k.uygun, false);
  assert.ok(!k.engeller.some((e) => /iki farklı kişi/.test(e)), k.engeller.join(" | "));
  assert.ok(k.engeller.some((e) => /girilmedi/.test(e)));
});

console.log(`✓ proses — ${gecen} test geçti`);
