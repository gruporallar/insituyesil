/**
 * KABUL KRİTERLERİ — birim testleri.
 *
 * Bu testler sistemin var oluş sebebini koruyor: yasal sınırı aşan bir lotun
 * üretime girmemesi ve kütle denkliği bozuk bir serinin serbest bırakılmaması.
 * Sınır değerler (tam eşitlik) özellikle test ediliyor — "≤" yerine "<"
 * yazılması, %0,300 çıkan bir lotu sessizce reddettirirdi.
 */
import assert from "node:assert/strict";
import {
  LIMIT,
  cbdAsgari,
  kutleDenkligi,
  kutleDenkligiUygun,
  hamMaddeKarari,
  seriKarari,
  bicimSayi,
  mutabakatFarki,
  mutabakatUygun,
  mutabakatKarari,
} from "../../src/lib/kabul.ts";

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

// ── Kütle denkliği ───────────────────────────────────────────────────────────

t("kütle denkliği doğru hesaplanır", () => {
  // 25 kg girdi, 3,75 + 21,15 + 0,065 = 24,965 → %99,86
  const mb = kutleDenkligi(25, 3.75, 21.15, 0.065);
  assert.ok(Math.abs(mb - 99.86) < 0.01, `beklenen ~99,86 alınan ${mb}`);
});

t("girdi sıfır veya negatifse null döner", () => {
  assert.equal(kutleDenkligi(0, 1, 1, 1), null);
  assert.equal(kutleDenkligi(-5, 1, 1, 1), null);
});

t("kütle denkliği sınır değerleri kapsayıcı", () => {
  // Tam %98 ve tam %102 KABUL EDİLİR. Dışlayıcı olsaydı sınırda duran seri
  // gereksiz araştırma açtırırdı.
  assert.equal(kutleDenkligiUygun(98), true);
  assert.equal(kutleDenkligiUygun(102), true);
  assert.equal(kutleDenkligiUygun(97.99), false);
  assert.equal(kutleDenkligiUygun(102.01), false);
});

t("null ve sonsuz kütle denkliği uygun sayılmaz", () => {
  assert.equal(kutleDenkligiUygun(null), false);
  assert.equal(kutleDenkligiUygun(Infinity), false);
  assert.equal(kutleDenkligiUygun(NaN), false);
});

// ── Asgari CBD ───────────────────────────────────────────────────────────────

t("ürün tipine göre asgari CBD", () => {
  assert.equal(cbdAsgari("DISTILAT"), 80);
  assert.equal(cbdAsgari("IZOLAT"), 99);
});

// ── Ham madde kararı ─────────────────────────────────────────────────────────

const HAM_UYGUN = { thc: 0.184, cbd: 11.6, onbirAnalizUygun: true };

t("uygun ham madde serbest bırakılır", () => {
  const k = hamMaddeKarari(HAM_UYGUN);
  assert.equal(k.statu, "SERBEST");
  assert.deepEqual(k.engeller, []);
});

t("THC yasal sınırı aşan lot reddedilir", () => {
  const k = hamMaddeKarari({ ...HAM_UYGUN, thc: 0.412 });
  assert.equal(k.statu, "RET");
  assert.equal(k.engeller.length, 1);
  assert.match(k.engeller[0], /THC/);
});

t("THC tam sınırda (%0,3) KABUL edilir", () => {
  // Kritik: kriter "≤ %0,3". Sınırda reddetmek yasal olarak yanlış olurdu.
  const k = hamMaddeKarari({ ...HAM_UYGUN, thc: LIMIT.hamThcMax });
  assert.equal(k.statu, "SERBEST");
});

t("THC sınırın bir tık üstünde reddedilir", () => {
  const k = hamMaddeKarari({ ...HAM_UYGUN, thc: 0.301 });
  assert.equal(k.statu, "RET");
});

t("11 zorunlu analiz uygunsuzsa reddedilir", () => {
  const k = hamMaddeKarari({ ...HAM_UYGUN, onbirAnalizUygun: false });
  assert.equal(k.statu, "RET");
  assert.match(k.engeller[0], /11 zorunlu/);
});

t("iki uygunsuzluk birden bildirilir", () => {
  const k = hamMaddeKarari({ thc: 0.5, cbd: 10, onbirAnalizUygun: false });
  assert.equal(k.statu, "RET");
  assert.equal(k.engeller.length, 2);
});

t("okunamayan analiz değeri reddedilir", () => {
  assert.equal(hamMaddeKarari({ thc: NaN, cbd: 10, onbirAnalizUygun: true }).statu, "RET");
  assert.equal(hamMaddeKarari({ thc: 0.1, cbd: NaN, onbirAnalizUygun: true }).statu, "RET");
});

// ── Seri kararı ──────────────────────────────────────────────────────────────

const SERI_UYGUN = {
  urunTipi: "DISTILAT",
  girdiKg: 25,
  ciktiKg: 3.75,
  fireKg: 21.15,
  numuneKg: 0.065,
  cbd: 84.2,
  thc: 0.245,
  cozucu: 3200,
  acikSapma: false,
};

t("uygun seri serbest bırakılır", () => {
  const k = seriKarari(SERI_UYGUN);
  assert.equal(k.statu, "SERBEST");
  assert.deepEqual(k.engeller, []);
  assert.ok(k.mb > 99 && k.mb < 100);
});

t("kütle denkliği bozuk seri serbest bırakılamaz", () => {
  // Fire eksik bildirilmiş: 25 kg girdiden 13 kg hesap veriliyor.
  const k = seriKarari({ ...SERI_UYGUN, fireKg: 10 });
  assert.equal(k.statu, "RET");
  assert.ok(k.engeller.some((e) => /Kütle denkliği/.test(e)), k.engeller.join(" | "));
});

t("bitmiş üründe THC sınırı aşılırsa reddedilir", () => {
  const k = seriKarari({ ...SERI_UYGUN, thc: 0.55 });
  assert.equal(k.statu, "RET");
  assert.ok(k.engeller.some((e) => /THC/.test(e)));
});

t("distilat CBD %80 altındaysa reddedilir", () => {
  const k = seriKarari({ ...SERI_UYGUN, cbd: 79.9 });
  assert.equal(k.statu, "RET");
  assert.ok(k.engeller.some((e) => /CBD/.test(e)));
});

t("distilat CBD tam %80 KABUL edilir", () => {
  const k = seriKarari({ ...SERI_UYGUN, cbd: 80 });
  assert.equal(k.statu, "SERBEST");
});

t("izolat için %80 yetmez, %99 gerekir", () => {
  const izolat = { ...SERI_UYGUN, urunTipi: "IZOLAT" };
  assert.equal(seriKarari({ ...izolat, cbd: 84.2 }).statu, "RET");
  assert.equal(seriKarari({ ...izolat, cbd: 99 }).statu, "SERBEST");
  assert.equal(seriKarari({ ...izolat, cbd: 99.4 }).statu, "SERBEST");
});

t("kalıntı çözücü sınırı", () => {
  assert.equal(seriKarari({ ...SERI_UYGUN, cozucu: LIMIT.cozucuMax }).statu, "SERBEST");
  assert.equal(seriKarari({ ...SERI_UYGUN, cozucu: 5001 }).statu, "RET");
});

t("çözücü ölçülmediyse (null) serbest bırakmayı engellemez", () => {
  // Her proseste çözücü kullanılmıyor. null "uygun" demek değil ama engel de değil.
  const k = seriKarari({ ...SERI_UYGUN, cozucu: null });
  assert.equal(k.statu, "SERBEST");
});

t("açık sapma varsa serbest bırakılamaz", () => {
  const k = seriKarari({ ...SERI_UYGUN, acikSapma: true });
  assert.equal(k.statu, "RET");
  assert.ok(k.engeller.some((e) => /sapma|CAPA/.test(e)));
});

t("birden fazla uygunsuzluk tek seferde listelenir", () => {
  const k = seriKarari({
    ...SERI_UYGUN,
    fireKg: 5,
    thc: 0.9,
    cbd: 40,
    cozucu: 9000,
    acikSapma: true,
  });
  assert.equal(k.statu, "RET");
  // Kütle denkliği + THC + CBD + çözücü + sapma = 5
  assert.equal(k.engeller.length, 5, k.engeller.join(" | "));
});

t("geçersiz girdi miktarı kütle denkliği engeli üretir", () => {
  const k = seriKarari({ ...SERI_UYGUN, girdiKg: 0 });
  assert.equal(k.statu, "RET");
  assert.equal(k.mb, null);
  assert.ok(k.engeller.some((e) => /hesaplanamadı/.test(e)));
});

// ── Biçimleme ────────────────────────────────────────────────────────────────

t("Türkçe ondalık ayırıcı kullanılır", () => {
  assert.equal(bicimSayi(0.3, 1), "0,3");
  assert.equal(bicimSayi(99.856, 2), "99,86");
  assert.equal(bicimSayi(25, 1), "25,0");
});

t("binlik ayırıcı nokta", () => {
  assert.equal(bicimSayi(1234, 0), "1.234");
  assert.equal(bicimSayi(1234567, 0), "1.234.567");
  assert.equal(bicimSayi(5000, 0), "5.000");
});

t("negatif sayılar doğru biçimlenir", () => {
  assert.equal(bicimSayi(-1234.5, 1), "-1.234,5");
  assert.equal(bicimSayi(-5, 2), "-5,00");
});

t("tanımsız değerler tire döner", () => {
  assert.equal(bicimSayi(null), "—");
  assert.equal(bicimSayi(undefined), "—");
  assert.equal(bicimSayi(NaN), "—");
  assert.equal(bicimSayi(Infinity), "—");
});

t("sıfır basamak kesir üretmez", () => {
  assert.equal(bicimSayi(42, 0), "42");
});

// ── Etiket mutabakatı ────────────────────────────────────────────────────────

t("mutabakat farkı doğru hesaplanır", () => {
  // 40 basıldı, 38 kullanıldı, 2 bozuldu ve 2'si de imha edildi → fark 0
  assert.equal(mutabakatFarki({ basilan: 40, kullanilan: 38, bozuk: 2, imhaEdilen: 2 }), 0);
});

t("BOZUK etiket hesaptan düşmez, İMHA EDİLEN düşer", () => {
  // KRİTİK AYRIM: bozuk ama imha edilmemiş etiket hâlâ üzerinde tekil karekod
  // taşıyan fiziksel bir nesne. Düşülmesi "bozuldu" demeyi kayıp etiketi
  // kapatmanın kolay yolu haline getirirdi.
  const k = mutabakatKarari({ basilan: 40, kullanilan: 38, bozuk: 2, imhaEdilen: 0 });
  assert.equal(k.fark, 2);
  assert.equal(k.statu, "RET");
  assert.ok(k.engeller.some((e) => /FARK = 2/.test(e)), k.engeller.join(" | "));
});

t("fark sıfırsa mutabakat uygun", () => {
  assert.equal(mutabakatUygun(0), true);
  assert.equal(mutabakatUygun(1), false);
  assert.equal(mutabakatUygun(-1), false);
});

t("tam mutabakat kabul edilir", () => {
  const k = mutabakatKarari({ basilan: 30, kullanilan: 30, bozuk: 0, imhaEdilen: 0 });
  assert.equal(k.statu, "SERBEST");
  assert.equal(k.fark, 0);
  assert.deepEqual(k.engeller, []);
});

t("eksik etiket sahte ürün riski olarak bildirilir", () => {
  const k = mutabakatKarari({ basilan: 40, kullanilan: 35, bozuk: 0, imhaEdilen: 0 });
  assert.equal(k.statu, "RET");
  assert.equal(k.fark, 5);
  assert.ok(k.engeller.some((e) => /sahte/i.test(e)));
});

t("basılandan fazla kullanım sayım hatası olarak bildirilir", () => {
  const k = mutabakatKarari({ basilan: 30, kullanilan: 32, bozuk: 0, imhaEdilen: 0 });
  assert.equal(k.statu, "RET");
  assert.ok(k.engeller.some((e) => /aşamaz|hatalı/.test(e)), k.engeller.join(" | "));
});

t("imha edilen bozuk adedini aşamaz", () => {
  // Sağlam etiket imha edilmez; bu bir sayım tutarsızlığı.
  const k = mutabakatKarari({ basilan: 40, kullanilan: 36, bozuk: 2, imhaEdilen: 4 });
  assert.equal(k.statu, "RET");
  assert.ok(k.engeller.some((e) => /İmha edilen/.test(e)));
});

t("negatif ve kesirli adetler reddedilir", () => {
  assert.equal(mutabakatKarari({ basilan: -1, kullanilan: 0, bozuk: 0, imhaEdilen: 0 }).statu, "RET");
  assert.equal(mutabakatKarari({ basilan: 10.5, kullanilan: 10, bozuk: 0, imhaEdilen: 0 }).statu, "RET");
});

console.log(`✓ kabul — ${gecen} test geçti`);
