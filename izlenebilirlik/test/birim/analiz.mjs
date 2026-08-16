/**
 * ANALİZ PARAMETRELERİ — birim testleri.
 *
 * Koruduğu şeyler: 11 parametrelik listenin bütünlüğü, sayısal ön
 * spesifikasyonların kabul.ts LIMIT'inden kopmaması (kural 1) ve
 * "opsiyonel satır gönderilmeyebilir ama gönderildiyse uygun olmalı"
 * ayrımı. THC sınır değeri kapsayıcı: %0,300 uygun, %0,301 engel.
 */
import assert from "node:assert/strict";
import {
  ANALIZ_PARAMETRELERI,
  ZORUNLU_PARAMETRELER,
  parametreBul,
  satirDogrula,
  analizDegerlendir,
} from "../../src/lib/analiz.ts";
import { LIMIT, hamMaddeKarari } from "../../src/lib/kabul.ts";

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

/** Geçerli bir satır üretir; alanlar override edilebilir. */
function satir(parametre, degisiklik = {}) {
  const p = parametreBul(parametre);
  return {
    parametre,
    spesifikasyon: p?.onSpesifikasyon ?? "Spesifikasyon içinde",
    sonuc: "Spesifikasyon içinde",
    sayisal_deger: null,
    birim: p?.birim ?? null,
    yontem: null,
    akredite: true,
    akredite_no: null,
    loq: null,
    uygun: true,
    aciklama: null,
    ...degisiklik,
  };
}

/** 9 zorunlu satırın tamamı — uygun, THC/CBD sayısal. */
function tamSet(thc = 0.184, cbd = 12.5) {
  return ZORUNLU_PARAMETRELER.map((kod) => {
    if (kod === "THC") return satir("THC", { sonuc: String(thc), sayisal_deger: thc });
    if (kod === "CBD") return satir("CBD", { sonuc: String(cbd), sayisal_deger: cbd });
    return satir(kod);
  });
}

// ── Parametre listesi bütünlüğü ──────────────────────────────────────────────

t("11 parametre var: 9 zorunlu + 2 opsiyonel", () => {
  assert.equal(ANALIZ_PARAMETRELERI.length, 11);
  assert.equal(ZORUNLU_PARAMETRELER.length, 9);
  const ops = ANALIZ_PARAMETRELERI.filter((p) => p.opsiyonel).map((p) => p.kod);
  assert.deepEqual(ops.sort(), ["COZUCU", "TERPEN"]);
});

t("parametre kodları tekil", () => {
  const kodlar = ANALIZ_PARAMETRELERI.map((p) => p.kod);
  assert.equal(new Set(kodlar).size, kodlar.length);
});

t("sayısal zorunlular yalnızca THC ve CBD", () => {
  const sz = ANALIZ_PARAMETRELERI.filter((p) => p.sayisalZorunlu).map((p) => p.kod);
  assert.deepEqual(sz.sort(), ["CBD", "THC"]);
});

t("ön spesifikasyonlar LIMIT'ten geliyor (kural 1)", () => {
  assert.ok(parametreBul("THC").onSpesifikasyon.includes("0,3"), "THC spec LIMIT.hamThcMax içermeli");
  assert.ok(parametreBul("COZUCU").onSpesifikasyon.includes("5.000"), "çözücü spec LIMIT.cozucuMax içermeli");
  assert.ok(parametreBul("NEM").onSpesifikasyon.includes("10"), "nem spec LIMIT.nemMax içermeli");
  // sayı LIMIT'te değişirse bu testler de spec metnini takip etmeli
  assert.equal(LIMIT.hamThcMax, 0.3);
  assert.equal(LIMIT.cozucuMax, 5000);
  assert.equal(LIMIT.nemMax, 10);
});

// ── satirDogrula ─────────────────────────────────────────────────────────────

t("bilinmeyen parametre reddedilir", () => {
  const h = satirDogrula(satir("THC", { parametre: "OLMAYAN" }));
  assert.ok(h.some((x) => x.includes("Bilinmeyen")));
});

t("boş sonuç reddedilir", () => {
  const h = satirDogrula(satir("NEM", { sonuc: "  " }));
  assert.ok(h.some((x) => x.includes("sonuç boş")));
});

t("THC'de sayısal değer zorunlu", () => {
  const h = satirDogrula(satir("THC", { sonuc: "0,2", sayisal_deger: null }));
  assert.ok(h.some((x) => x.includes("sayısal değer zorunlu")));
});

t("sayısal olmayan parametrede sayısal değer istenmez", () => {
  assert.deepEqual(satirDogrula(satir("AGIR_METAL")), []);
});

// ── analizDegerlendir ────────────────────────────────────────────────────────

t("tam zorunlu set, hepsi uygun → onbirAnalizUygun", () => {
  const d = analizDegerlendir(tamSet());
  assert.deepEqual(d.engeller, []);
  assert.equal(d.onbirAnalizUygun, true);
  assert.equal(d.thc, 0.184);
  assert.equal(d.cbd, 12.5);
});

t("zorunlu satır eksik → engel", () => {
  const eksik = tamSet().filter((s) => s.parametre !== "AGIR_METAL");
  const d = analizDegerlendir(eksik);
  assert.ok(d.engeller.some((x) => x.includes("Ağır metaller")));
  assert.equal(d.onbirAnalizUygun, false);
});

t("opsiyonel satırın yokluğu engel DEĞİL", () => {
  // tamSet TERPEN ve COZUCU içermiyor — yine de temiz
  const d = analizDegerlendir(tamSet());
  assert.deepEqual(d.engeller, []);
});

t("gönderilen opsiyonel satır uygunsuzsa karar SERBEST olamaz", () => {
  const d = analizDegerlendir([
    ...tamSet(),
    satir("COZUCU", { sonuc: "7200", sayisal_deger: 7200, uygun: false }),
  ]);
  assert.ok(d.uygunsuzlar.includes("Organik çözücü kalıntısı"));
  assert.equal(d.onbirAnalizUygun, false);
});

t("gönderilen opsiyonel satır uygunsa temiz", () => {
  const d = analizDegerlendir([
    ...tamSet(),
    satir("TERPEN"),
    satir("COZUCU", { sonuc: "120", sayisal_deger: 120 }),
  ]);
  assert.deepEqual(d.engeller, []);
  assert.equal(d.onbirAnalizUygun, true);
});

t("mükerrer parametre engel", () => {
  const d = analizDegerlendir([...tamSet(), satir("NEM")]);
  assert.ok(d.engeller.some((x) => x.includes("iki kez")));
});

t("THC sınır kapsayıcı: 0,300 uygun / 0,301 tutarsızlık engeli", () => {
  const tam = analizDegerlendir(tamSet(0.3));
  assert.deepEqual(tam.engeller, []);

  const asan = analizDegerlendir(tamSet(0.301));
  assert.ok(asan.engeller.some((x) => x.includes("yasal sınırın")));
});

t("uygunsuz parametre adları sapma için toplanır", () => {
  const set = tamSet();
  set.find((s) => s.parametre === "PESTISIT").uygun = false;
  set.find((s) => s.parametre === "MIKOTOKSIN").uygun = false;
  const d = analizDegerlendir(set);
  assert.deepEqual(d.uygunsuzlar.sort(), ["Mikotoksinler (aflatoksin, okratoksin A)", "Pestisit kalıntıları"].sort());
});

// ── hamMaddeKarari ile uçtan uca ─────────────────────────────────────────────

t("değerlendirme → hamMaddeKarari: temiz set SERBEST", () => {
  const d = analizDegerlendir(tamSet());
  const k = hamMaddeKarari({ thc: d.thc, cbd: d.cbd, onbirAnalizUygun: d.onbirAnalizUygun });
  assert.equal(k.statu, "SERBEST");
});

t("değerlendirme → hamMaddeKarari: THC 0,4 RET", () => {
  const set = tamSet(0.4);
  set.find((s) => s.parametre === "THC").uygun = false; // lab dürüst işaretledi
  const d = analizDegerlendir(set);
  const k = hamMaddeKarari({ thc: d.thc, cbd: d.cbd, onbirAnalizUygun: d.onbirAnalizUygun });
  assert.equal(k.statu, "RET");
  assert.ok(k.engeller.some((x) => x.includes("yasal sınır")));
});

console.log(`✓ analiz — ${gecen} test geçti`);
