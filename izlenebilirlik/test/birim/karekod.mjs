/**
 * Karekod üretimi ve çözümlemesi — birim testleri.
 *
 * Bu testler dış bağımlılık kullanmıyor; `node --experimental-strip-types` ile
 * TypeScript kaynağı doğrudan çalıştırılıyor (bkz. package.json test:saf).
 */
import assert from "node:assert/strict";
import {
  GS,
  GTIN,
  gtinKontrolHanesi,
  gtinGecerli,
  sktKisalt,
  sktAc,
  karekodUret,
  karekodCozumle,
  karekodNormalize,
} from "../../src/lib/karekod.ts";

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

// ── GTIN kontrol hanesi ──────────────────────────────────────────────────────

t("GTIN kontrol hanesi bilinen değeri üretir", () => {
  assert.equal(gtinKontrolHanesi("0868000000001"), 3);
  assert.equal(gtinKontrolHanesi("0868000000002"), 0);
});

t("algoritma bilinen bir EAN-13 barkoduyla uyuşuyor", () => {
  // 4006381333931 yaygın olarak kullanılan bir EAN-13 örneği; kontrol hanesi 1.
  // GTIN-14'e başa sıfır eklenerek taşınır ve kontrol hanesi DEĞİŞMEZ —
  // bu, ağırlıklandırmanın (sağdan 3-1) doğru yönde olduğunun dış doğrulaması.
  // Yön ters olsaydı kendi ürettiğimiz kodlar kendi içinde tutarlı çıkar ama
  // hiçbir standart okuyucu onları doğrulayamazdı.
  assert.equal(gtinKontrolHanesi("0400638133393"), 1);
  assert.ok(gtinGecerli("04006381333931"));
});

t("GTIN gövdesi 13 hane değilse hata atar", () => {
  assert.throws(() => gtinKontrolHanesi("12345"));
  assert.throws(() => gtinKontrolHanesi("086800000000A"));
});

t("tanımlı GTIN'lerin kontrol hanesi doğru", () => {
  assert.ok(gtinGecerli(GTIN.DISTILAT), `${GTIN.DISTILAT} geçersiz`);
  assert.ok(gtinGecerli(GTIN.IZOLAT), `${GTIN.IZOLAT} geçersiz`);
});

t("tek hane hatası yakalanır", () => {
  // Son hane bozulursa kontrol başarısız olmalı.
  const bozuk = GTIN.DISTILAT.slice(0, 13) + "9";
  assert.equal(gtinGecerli(bozuk), false);
});

t("komşu hane yer değişimi yakalanır", () => {
  // Gövde 0868000000001 → 0868000000010 (son iki hane yer değişti). Kontrol
  // hanesi eski haliyle (3) kalırsa kod geçersiz olmalı.
  assert.equal(gtinGecerli("08680000000103"), false);
  // Doğru kontrol hanesiyle (5) geçerli — testin kendisi doğru şeyi ölçüyor.
  assert.equal(gtinGecerli("08680000000105"), true);
});

t("hane sayısı yanlışsa geçersiz", () => {
  assert.equal(gtinGecerli("123"), false);
  assert.equal(gtinGecerli("086800000000130"), false);
  assert.equal(gtinGecerli("0868000000001A"), false);
  assert.equal(gtinGecerli(""), false);
});

// ── SKT ──────────────────────────────────────────────────────────────────────

t("SKT kısaltma", () => {
  assert.equal(sktKisalt("2028-08-10"), "280810");
  assert.equal(sktKisalt("2026-01-05"), "260105");
});

t("SKT geçersiz tarihte hata atar", () => {
  assert.throws(() => sktKisalt("10.08.2028"));
  assert.throws(() => sktKisalt(""));
});

t("SKT açma gidiş-dönüş tutarlı", () => {
  for (const iso of ["2026-01-05", "2028-08-10", "2030-12-31"]) {
    assert.equal(sktAc(sktKisalt(iso), 2026), iso);
  }
});

t("SKT iki haneli yıl penceresi yüzyıl sınırında çalışır", () => {
  // 2098'de "05" → 2105 (geriye 1905 değil)
  assert.equal(sktAc("050310", 2098), "2105-03-10");
  // 2026'da "99" → 1999 mu 2099 mu? +50'yi aştığı için 1999.
  assert.equal(sktAc("990310", 2026), "1999-03-10");
});

// ── Üretim ───────────────────────────────────────────────────────────────────

const ORNEK = {
  gtin: GTIN.DISTILAT,
  tekil: "T00000001",
  skt: "2028-08-10",
  seri: "CBD-D-2026-0001",
};

t("karekod GS ayırıcısı içerir", () => {
  const kod = karekodUret(ORNEK);
  assert.ok(kod.includes(GS), "GS ayırıcısı yok");
  assert.equal(kod, `01${GTIN.DISTILAT}21T00000001${GS}1728081010CBD-D-2026-0001`);
});

t("geçersiz GTIN ile üretim reddedilir", () => {
  assert.throws(() => karekodUret({ ...ORNEK, gtin: "08680000000019" }));
});

t("ayırıcı karakter içeren seri reddedilir", () => {
  assert.throws(() => karekodUret({ ...ORNEK, tekil: `T1${GS}2` }));
  assert.throws(() => karekodUret({ ...ORNEK, seri: `CBD${GS}X` }));
});

t("boş alanlar reddedilir", () => {
  assert.throws(() => karekodUret({ ...ORNEK, tekil: "" }));
  assert.throws(() => karekodUret({ ...ORNEK, seri: "" }));
});

// ── Çözümleme ────────────────────────────────────────────────────────────────

t("ayırıcılı kod doğru çözümlenir", () => {
  const c = karekodCozumle(karekodUret(ORNEK));
  assert.ok(c);
  assert.equal(c.gtin, ORNEK.gtin);
  assert.equal(c.tekil, ORNEK.tekil);
  assert.equal(c.skt, ORNEK.skt);
  assert.equal(c.seri, ORNEK.seri);
  assert.equal(c.gtinGecerli, true);
  assert.equal(c.ayiriciVardi, true);
});

t("ayırıcısı kırpılmış kod da çözümlenir", () => {
  const kirpik = karekodUret(ORNEK).replace(GS, "");
  const c = karekodCozumle(kirpik);
  assert.ok(c, "ayırıcısız kod çözümlenemedi");
  assert.equal(c.tekil, ORNEK.tekil);
  assert.equal(c.seri, ORNEK.seri);
  assert.equal(c.skt, ORNEK.skt);
  assert.equal(c.ayiriciVardi, false);
});

t("parti numarası '17' ile başlasa da doğru bölünür", () => {
  // Açgözlü regex burada yanlış yerden bölerdi.
  const zor = { ...ORNEK, seri: "17-CBD-D-2026-0001" };
  const c = karekodCozumle(karekodUret(zor));
  assert.ok(c);
  assert.equal(c.seri, "17-CBD-D-2026-0001");
  assert.equal(c.tekil, "T00000001");
});

t("tekil seri rakamla başlasa da ayırıcısız biçim doğru çözülür", () => {
  const zor = { ...ORNEK, tekil: "1712341012" };
  const c = karekodCozumle(karekodUret(zor).replace(GS, ""));
  assert.ok(c, "çözümlenemedi");
  assert.equal(c.tekil, "1712341012");
  assert.equal(c.skt, ORNEK.skt);
  assert.equal(c.seri, ORNEK.seri);
});

t("biçime uymayan girdi null döner", () => {
  assert.equal(karekodCozumle(""), null);
  assert.equal(karekodCozumle("merhaba"), null);
  assert.equal(karekodCozumle("CBD-D-2026-0001"), null);
  assert.equal(karekodCozumle(null), null);
  assert.equal(karekodCozumle(undefined), null);
});

t("geçersiz SKT içeren kod null döner", () => {
  // Ay 99 → sktAc geçer (biçim doğru) ama gün/ay mantıksız; biçim kontrolü
  // sadece 6 hane arıyor. Hane sayısı bozuksa null dönmeli.
  assert.equal(karekodCozumle(`01${GTIN.DISTILAT}21T1${GS}1728081` + "10X"), null);
});

t("bozuk GTIN'li kod çözümlenir ama geçersiz işaretlenir", () => {
  // Kod okunabiliyor olabilir; sistem onu tanır ama kontrol hanesi uyarısı verir.
  const bozuk = `0108680000000019` + `21T00000001` + GS + `17280810` + `10CBD-D-2026-0001`;
  const c = karekodCozumle(bozuk);
  assert.ok(c, "bozuk GTIN'li kod hiç çözümlenemedi");
  assert.equal(c.gtinGecerli, false);
  // Alanlar yine de doğru okunmalı — hangi seri olduğu bilinsin.
  assert.equal(c.seri, "CBD-D-2026-0001");
});

t("baş/son boşluk temizlenir", () => {
  const c = karekodCozumle("  " + karekodUret(ORNEK) + "  ");
  assert.ok(c);
  assert.equal(c.seri, ORNEK.seri);
});

// ── Normalize ────────────────────────────────────────────────────────────────

t("vekil ayırıcı karakterler gerçek GS'e çevrilir", () => {
  const vekil = `01${GTIN.DISTILAT}21T00000001<GS>1728081010CBD-D-2026-0001`;
  const c = karekodCozumle(karekodNormalize(vekil));
  assert.ok(c);
  assert.equal(c.ayiriciVardi, true);
  assert.equal(c.seri, "CBD-D-2026-0001");
});

t("normalize null/undefined ile patlamaz", () => {
  assert.equal(karekodNormalize(null), "");
  assert.equal(karekodNormalize(undefined), "");
});

// ── GS'i kırpan okuyucular ──────────────────────────────────────────────────
//
// Gerçek bir USB barkod okuyucu FNC1/GS karakterini göndermeyebiliyor. Eskiden
// bu, `paketler.uid` ile eşleşmeyen bir metin üretiyordu: GERÇEK bir kutu
// "Sistemde kayıtlı değil — sahte ürün şüphesi" gerekçesiyle reddediliyordu.
// `karekodNormalize` artık çözülebilen kodu kanonik biçime geri yazıyor.

const KANONIK = karekodUret({
  gtin: GTIN.DISTILAT, tekil: "T00000023", skt: "2028-08-01", seri: "CBD-D-2026-0001",
});

t("GS'i kırpılmış kod kanonik biçime geri yazılıyor", () => {
  assert.equal(karekodNormalize(KANONIK.split(GS).join("")), KANONIK);
});

t("kanonik kod olduğu gibi kalıyor", () => {
  assert.equal(karekodNormalize(KANONIK), KANONIK);
});

t("<GS> vekil metni gerçek ayırıcıya çevriliyor", () => {
  assert.equal(karekodNormalize(KANONIK.split(GS).join("<GS>")), KANONIK);
});

t("boşluklu ve ayırıcısız kod normalize ediliyor", () => {
  assert.equal(karekodNormalize("  " + KANONIK.split(GS).join("") + "  "), KANONIK);
});

t("karekod olmayan metin değiştirilmiyor", () => {
  assert.equal(karekodNormalize("BUNLAR KAREKOD DEGIL"), "BUNLAR KAREKOD DEGIL");
  assert.equal(karekodNormalize("HM-2026-0001"), "HM-2026-0001");
});

t("seri '17' ile başlasa bile ayırıcısız kod doğru geri yazılıyor", () => {
  const zor = karekodUret({
    gtin: GTIN.IZOLAT, tekil: "T00000099", skt: "2029-01-15", seri: "17CBD-I-2026-0002",
  });
  assert.equal(karekodNormalize(zor.split(GS).join("")), zor);
});

t("normalize edilen kod tekrar çözüldüğünde alanlar korunuyor", () => {
  const c = karekodCozumle(karekodNormalize(KANONIK.split(GS).join("")));
  assert.equal(c.tekil, "T00000023");
  assert.equal(c.seri, "CBD-D-2026-0001");
  assert.equal(c.skt, "2028-08-01");
  assert.equal(c.ayiriciVardi, true, "geri yazılan kodda ayırıcı bulunmalı");
});

console.log(`✓ karekod — ${gecen} test geçti`);
