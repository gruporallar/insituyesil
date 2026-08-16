/**
 * KAYIT KODLARI ve KİŞİSEL VERİ MASKELEME — birim testleri.
 */
import assert from "node:assert/strict";
import {
  kodCiftci,
  kodHamMadde,
  kodSeri,
  kodTekil,
  kodSevkiyat,
  kodSatis,
  kodButs,
  kodAlici,
  kayitTipiTani,
  seridenUrunTipi,
  tcMaskele,
  tcGecerli,
} from "../../src/lib/kod.ts";
import { GTIN, karekodUret } from "../../src/lib/karekod.ts";

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

// ── Kod biçimleri ────────────────────────────────────────────────────────────

t("kod biçimleri beklendiği gibi", () => {
  assert.equal(kodCiftci(1), "CF-001");
  assert.equal(kodHamMadde(2026, 1), "HM-2026-0001");
  assert.equal(kodSeri("DISTILAT", 2026, 1), "CBD-D-2026-0001");
  assert.equal(kodSeri("IZOLAT", 2026, 12), "CBD-I-2026-0012");
  assert.equal(kodTekil(1), "T00000001");
  assert.equal(kodSevkiyat(2026, 3), "SVK-2026-0003");
  assert.equal(kodSatis(2026, 7), "SAT-2026-00007");
  assert.equal(kodButs(2026, 9), "BUTS-2026-00009");
  assert.equal(kodAlici("ECZANE", 2), "EC-002");
  assert.equal(kodAlici("DEPO", 2), "DP-002");
});

t("sayaç tanımlı uzunluğu aşarsa kod KIRPILMAZ", () => {
  // Kırpmak iki farklı kaydı aynı koda düşürür — izlenebilirlikte sessiz veri
  // kaybı. Kod uzar, çakışmaz.
  assert.equal(kodCiftci(1234), "CF-1234");
  assert.equal(kodHamMadde(2026, 99999), "HM-2026-99999");
  assert.equal(kodTekil(1234567890), "T1234567890");
});

t("negatif veya kesirli sıra numarası reddedilir", () => {
  assert.throws(() => kodCiftci(-1));
  assert.throws(() => kodCiftci(1.5));
  assert.throws(() => kodHamMadde(2026, -3));
});

// ── Kayıt tipi tanıma ────────────────────────────────────────────────────────

t("karekod PAKET olarak tanınır", () => {
  const kod = karekodUret({
    gtin: GTIN.DISTILAT,
    tekil: "T00000001",
    skt: "2028-08-10",
    seri: "CBD-D-2026-0001",
  });
  assert.equal(kayitTipiTani(kod), "PAKET");
});

t("diğer kod tipleri tanınır", () => {
  assert.equal(kayitTipiTani("CBD-D-2026-0001"), "SERI");
  assert.equal(kayitTipiTani("CBD-I-2026-0042"), "SERI");
  assert.equal(kayitTipiTani("HM-2026-0001"), "HAMMADDE");
  assert.equal(kayitTipiTani("CF-001"), "CIFTCI");
  assert.equal(kayitTipiTani("SVK-2026-0001"), "SEVKIYAT");
  assert.equal(kayitTipiTani("SAT-2026-00001"), "SATIS");
});

t("kod tanıma büyük/küçük harfe duyarsız", () => {
  assert.equal(kayitTipiTani("cbd-d-2026-0001"), "SERI");
  assert.equal(kayitTipiTani("hm-2026-0001"), "HAMMADDE");
});

t("serbest metin BILINMEYEN döner", () => {
  // Çiftçi adıyla arama yapılabiliyor; bu bir hata değil.
  assert.equal(kayitTipiTani("Ahmet Yılmaz"), "BILINMEYEN");
  assert.equal(kayitTipiTani(""), "BILINMEYEN");
  assert.equal(kayitTipiTani(null), "BILINMEYEN");
  assert.equal(kayitTipiTani("HM-26-1"), "BILINMEYEN");
});

t("uzamış kodlar da tanınır", () => {
  // kodCiftci(1234) → CF-1234; tanıma bunu kaybetmemeli.
  assert.equal(kayitTipiTani("CF-1234"), "CIFTCI");
  assert.equal(kayitTipiTani("HM-2026-99999"), "HAMMADDE");
});

t("seriden ürün tipi çıkarılır", () => {
  assert.equal(seridenUrunTipi("CBD-D-2026-0001"), "DISTILAT");
  assert.equal(seridenUrunTipi("CBD-I-2026-0001"), "IZOLAT");
  assert.equal(seridenUrunTipi("cbd-i-2026-0001"), "IZOLAT");
  assert.equal(seridenUrunTipi("HM-2026-0001"), null);
  assert.equal(seridenUrunTipi(""), null);
});

// ── TC maskeleme ─────────────────────────────────────────────────────────────

t("TC maskeleme ilk 3 ve son 2 haneyi bırakır", () => {
  assert.equal(tcMaskele("12345678901"), "123******01");
  assert.equal(tcMaskele("12345678901").length, 11);
});

t("maskelenmiş değerden açık TC geri elde edilemez", () => {
  const m = tcMaskele("12345678901");
  // Ortadaki 6 hane tamamen kayıp — 10^6 olasılık kalıyor.
  assert.equal((m.match(/\*/g) || []).length, 6);
  assert.ok(!/\d{4}/.test(m), "dört ardışık rakam kalmamalı");
});

t("TC maskeleme rakam dışı karakterleri temizler", () => {
  assert.equal(tcMaskele("123 456 789 01"), "123******01");
  assert.equal(tcMaskele("123-456-78901"), "123******01");
});

t("kısa girdi tamamen maskelenir", () => {
  assert.equal(tcMaskele("123"), "***");
  assert.equal(tcMaskele("12345"), "*****");
  assert.equal(tcMaskele(""), "");
  assert.equal(tcMaskele(null), "");
});

// ── TC doğrulama ─────────────────────────────────────────────────────────────

t("geçerli TC kabul edilir", () => {
  // Algoritmaya uygun üretilmiş test numaraları (gerçek kişilere ait değil).
  assert.equal(tcGecerli("10000000146"), true);
  assert.equal(tcGecerli("12345678950"), true);
  assert.equal(tcGecerli("98765432150"), true);
});

t("çift haneler ağır bastığında da doğru çalışır", () => {
  // GERİLEME TESTİ: (tek×7 − çift) negatife düştüğünde JavaScript'in `%`
  // operatörü negatif sonuç veriyor ve düzeltilmezse geçerli numara
  // reddediliyor. 19191919190 → (5×7 − 36) = −1, beklenen 10. hane 9.
  assert.equal(tcGecerli("19191919190"), true);
});

t("sıfırla başlayan TC reddedilir", () => {
  assert.equal(tcGecerli("01234567890"), false);
});

t("hane sayısı yanlış TC reddedilir", () => {
  assert.equal(tcGecerli("1234567890"), false);
  assert.equal(tcGecerli("123456789012"), false);
  assert.equal(tcGecerli(""), false);
  assert.equal(tcGecerli(null), false);
});

t("kontrol hanesi bozuk TC reddedilir", () => {
  // Geçerli bir numaranın son hanesini bozmak yakalanmalı.
  assert.equal(tcGecerli("10000000147"), false);
  // 10. haneyi bozmak da yakalanmalı.
  assert.equal(tcGecerli("10000000156"), false);
});

t("hepsi aynı rakam olan TC reddedilir", () => {
  assert.equal(tcGecerli("11111111111"), false);
  assert.equal(tcGecerli("99999999999"), false);
});

console.log(`✓ kod — ${gecen} test geçti`);
