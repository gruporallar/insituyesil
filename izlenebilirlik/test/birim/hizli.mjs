import test from "node:test";
import assert from "node:assert/strict";
import { hizliTani, PAKET_DURUM } from "../../src/lib/hizli.ts";
import { karekodUret, GTIN } from "../../src/lib/karekod.ts";
import { PAKET_STATULERI } from "../../src/lib/types.ts";

/** Her eylemi yapabilen kullanıcı. */
const HEPSI = () => true;
/** Hiçbir eylemi yapamayan (okuyucu / denetçi). */
const HICBIRI = () => false;
/** Yalnızca sayılan eylemler açık. */
const sadece = (...izin) => (e) => izin.includes(e);

const VERI = {
  ciftciler: [
    { kod: "CF-001", ad: "Ahmet YILMAZ", izin_no: "IZN-2026-01", il: "Burdur", ilce: "Gölhisar", parsel: "112/4" },
  ],
  hammadde: [
    { lot: "HM-2026-0001", ciftci_kod: "CF-001", teslim_tarihi: "2026-08-01", miktar_kg: 500, kalan_kg: 200, statu: "SERBEST", thc: 0.18, cbd: 6.2, analiz_rapor_no: "AR-1", ret_nedeni: null },
    { lot: "HM-2026-0002", ciftci_kod: "CF-001", teslim_tarihi: "2026-08-02", miktar_kg: 300, kalan_kg: 300, statu: "KARANTINA", thc: null, cbd: null, analiz_rapor_no: null, ret_nedeni: null },
    { lot: "HM-2026-0003", ciftci_kod: "CF-001", teslim_tarihi: "2026-08-03", miktar_kg: 310, kalan_kg: 0, statu: "RET", thc: 0.44, cbd: 5.1, analiz_rapor_no: "AR-3", ret_nedeni: "Δ9-THC sınır üstü" },
  ],
  seriGirdileri: [{ seri: "CBD-D-2026-0001", lot: "HM-2026-0001", kg: 300 }],
  seriler: [
    { seri: "CBD-D-2026-0001", urun_tipi: "DISTILAT", uretim_tarihi: "2026-08-05", girdi_kg: 300, cikti_kg: 36, mb: 99.4, cbd: 84.2, thc: 0.21, statu: "SERBEST", serbest_kisi: "Salih ÖZKAN", ret_nedeni: null },
    { seri: "CBD-I-2026-0006", urun_tipi: "IZOLAT", uretim_tarihi: "2026-08-12", girdi_kg: 40, cikti_kg: null, mb: null, cbd: null, thc: null, statu: "KARANTINA", serbest_kisi: null, ret_nedeni: null },
  ],
  paketler: [
    { uid: "U1", tekil: "T00000001", seri: "CBD-D-2026-0001", miktar_g: 10, skt: "2028-08-01", statu: "SERBEST", sevk_kod: null, satis_kod: null },
    { uid: "U2", tekil: "T00000002", seri: "CBD-D-2026-0001", miktar_g: 10, skt: "2028-08-01", statu: "SEVK", sevk_kod: "SVK-2026-0001", satis_kod: null },
    { uid: "U3", tekil: "T00000003", seri: "CBD-D-2026-0001", miktar_g: 10, skt: "2028-08-01", statu: "SATILDI", sevk_kod: "SVK-2026-0001", satis_kod: "SAT-2026-00001" },
    { uid: "U4", tekil: "T00000004", seri: "CBD-D-2026-0001", miktar_g: 10, skt: "2028-08-01", statu: "RET", sevk_kod: null, satis_kod: null, konum: "İmha edildi (IMH-2026-0005) — D4 Ret/İmha alanı" },
  ],
  aliciar: [{ kod: "EC-001", tip: "ECZANE", ad: "Şifa Eczanesi", gln: "868000000001", il: "Burdur", yetkili: "Ecz. Ayşe" }],
  sevkiyatlar: [
    { kod: "SVK-2026-0001", tarih: "2026-08-10", alici_kod: "EC-001", tasiyici: "Soğuk Zincir A.Ş.", muhur_no: "MH-001", buts_ref: null },
  ],
  satislar: [
    { kod: "SAT-2026-00001", tarih: "2026-08-12", alici_kod: "EC-001", paket_uid: "U3", hasta_ad: "A.Y.", hasta_tc_maskeli: "123*****90", recete_no: "RCT-2026-778101", hekim: "Dr. Mehmet" },
  ],
};

const eylemler = (r) => r.eylemler.map((e) => e.etiket);

// ── Paket durumuna göre eylem daralması ─────────────────────────────────────

test("depodaki birim yalnızca sevke ve imhaya açık — satış eylemi çıkmaz", () => {
  const r = hizliTani("T00000001", VERI, HEPSI);
  assert.equal(r.tip, "PAKET");
  assert.equal(r.durum, "DEPODA — SEVKE HAZIR");
  assert.ok(eylemler(r).includes("Sevkiyata Ekle"));
  assert.ok(!eylemler(r).includes("Hastaya Sat"));
  assert.ok(!eylemler(r).includes("İade Al"));
});

test("sevkteki birim satılabilir, TEKRAR SEVK EDİLEMEZ", () => {
  const r = hizliTani("T00000002", VERI, HEPSI);
  assert.equal(r.durum, "SEVK EDİLDİ");
  assert.ok(eylemler(r).includes("Hastaya Sat"));
  assert.ok(!eylemler(r).includes("Sevkiyata Ekle"), "sevkteki birim yeniden sevke eklenemez");
});

test("satılmış birim ne sevk ne satış — yalnızca iade ve şikayet", () => {
  const r = hizliTani("T00000003", VERI, HEPSI);
  assert.equal(r.durum, "HASTAYA VERİLDİ");
  assert.ok(!eylemler(r).includes("Sevkiyata Ekle"));
  assert.ok(!eylemler(r).includes("Hastaya Sat"));
  assert.ok(eylemler(r).includes("İade Al"));
  assert.ok(eylemler(r).includes("Şikayet Kaydet"));
});

test("RET birimde hiçbir ileri eylem kalmaz", () => {
  const r = hizliTani("T00000004", VERI, HEPSI);
  assert.equal(r.durum, "RET / İADE / İMHA");
  assert.deepEqual(eylemler(r), ["İzleme Kaydını Aç"]);
});

// ── Yetki daralması ─────────────────────────────────────────────────────────

test("okuyucu hiçbir yazma eylemi görmez, izleme kalır", () => {
  for (const t of ["T00000001", "T00000002", "T00000003", "CBD-D-2026-0001", "HM-2026-0002", "CF-001"]) {
    const r = hizliTani(t, VERI, HICBIRI);
    const yazan = r.eylemler.filter((e) => e.etiket !== "İzleme Kaydını Aç" && e.etiket !== "Seri Dosyasını Aç");
    assert.deepEqual(yazan, [], `${t} için okuyucuya yazma eylemi sızdı`);
  }
});

test("yalnızca satış yetkisi olan depo görevlisi sevk düğmesi görmez", () => {
  const r = hizliTani("T00000001", VERI, sadece("satis_yaz"));
  assert.ok(!eylemler(r).includes("Sevkiyata Ekle"));
});

test("birincil eylem en fazla bir tane", () => {
  for (const t of ["T00000001", "T00000002", "T00000003", "CBD-D-2026-0001", "CBD-I-2026-0006", "HM-2026-0001", "HM-2026-0002", "HM-2026-0003", "CF-001", "SAT-2026-00001"]) {
    const r = hizliTani(t, VERI, HEPSI);
    const n = r.eylemler.filter((e) => e.birincil).length;
    assert.ok(n <= 1, `${t} için ${n} birincil eylem var`);
  }
});

// ── GS1 karekod girdisi ─────────────────────────────────────────────────────

test("kameradan gelen GS1 karekod aynı birime çözülür", () => {
  const ham = karekodUret({
    gtin: GTIN.DISTILAT, tekil: "T00000002", skt: "2028-08-01", seri: "CBD-D-2026-0001",
  });
  const r = hizliTani(ham, VERI, HEPSI);
  assert.equal(r.tip, "PAKET");
  assert.equal(r.anahtar, "U2");
});

test("sistemde olmayan bir karekod tanınmaz ama NEDEN söylenir", () => {
  const ham = karekodUret({
    gtin: GTIN.DISTILAT, tekil: "T00099999", skt: "2028-08-01", seri: "CBD-D-2026-0001",
  });
  const r = hizliTani(ham, VERI, HEPSI);
  assert.equal(r.tip, "BILINMEYEN");
  assert.match(r.neden, /kayıtlı değil/);
  assert.deepEqual(r.eylemler, []);
});

// ── Diğer kayıt tipleri ─────────────────────────────────────────────────────

test("karantinadaki lot analize, serbest lot üretime, ret lotu imhaya yönlendirir", () => {
  assert.ok(eylemler(hizliTani("HM-2026-0002", VERI, HEPSI)).includes("Analiz Sonucu Gir"));
  assert.ok(eylemler(hizliTani("HM-2026-0001", VERI, HEPSI)).includes("Üretime Al"));
  assert.ok(eylemler(hizliTani("HM-2026-0003", VERI, HEPSI)).includes("İmha Tutanağı"));
});

test("kalanı bitmiş serbest lot üretime alınamaz", () => {
  const veri = { ...VERI, hammadde: VERI.hammadde.map((h) => (h.lot === "HM-2026-0001" ? { ...h, kalan_kg: 0 } : h)) };
  assert.ok(!eylemler(hizliTani("HM-2026-0001", veri, HEPSI)).includes("Üretime Al"));
});

test("ambalajlanmış seri tekrar ambalajlama önermez", () => {
  const r = hizliTani("CBD-D-2026-0001", VERI, HEPSI);
  assert.equal(r.tip, "SERI");
  assert.ok(!eylemler(r).includes("Ambalajla"), "zaten 4 birimi var");
});

test("serbest ama hiç ambalajlanmamış seri ambalajlamaya yönlendirir", () => {
  const veri = { ...VERI, paketler: [] };
  assert.ok(eylemler(hizliTani("CBD-D-2026-0001", veri, HEPSI)).includes("Ambalajla"));
});

test("karantinadaki seri proses kaydına yönlendirir, ambalaja değil", () => {
  const r = hizliTani("CBD-I-2026-0006", VERI, HEPSI);
  assert.ok(eylemler(r).includes("Proses Kaydı Gir"));
  assert.ok(!eylemler(r).includes("Ambalajla"));
});

test("çiftçi kodu teslimat almaya yönlendirir ve lot sayısını gösterir", () => {
  const r = hizliTani("CF-001", VERI, HEPSI);
  assert.equal(r.tip, "CIFTCI");
  assert.ok(r.alanlar.some(([e, d]) => e === "Teslimat" && d === "3 lot"));
});

test("sevkiyat kodu BÜTS durumunu gösterir", () => {
  const r = hizliTani("SVK-2026-0001", VERI, HEPSI);
  assert.equal(r.tip, "SEVKIYAT");
  assert.equal(r.durum, "BÜTS BEKLİYOR");
  assert.ok(r.alanlar.some(([e, d]) => e === "Birim" && d === "2"));
});

test("satış kaydı açık TC göstermez", () => {
  const r = hizliTani("SAT-2026-00001", VERI, HEPSI);
  const hasta = r.alanlar.find(([e]) => e === "Hasta")[1];
  assert.match(hasta, /\*/, "TC maskesiz görünüyor");
});

// ── Girdi toleransı ─────────────────────────────────────────────────────────

test("küçük harfle yazılan sistem kodu tanınır", () => {
  assert.equal(hizliTani("cbd-d-2026-0001", VERI, HEPSI).tip, "SERI");
  assert.equal(hizliTani("hm-2026-0002", VERI, HEPSI).tip, "HAMMADDE");
});

test("baş/son boşluk tanımayı bozmaz", () => {
  assert.equal(hizliTani("  T00000001  ", VERI, HEPSI).anahtar, "U1");
});

test("boş girdi güvenli sonuç döndürür", () => {
  for (const g of ["", "   ", null, undefined]) {
    const r = hizliTani(g, VERI, HEPSI);
    assert.equal(r.tip, "BILINMEYEN");
    assert.deepEqual(r.eylemler, []);
  }
});

test("tanınmayan kod ekranda kısaltılır — uzun metin arayüzü taşırmaz", () => {
  const r = hizliTani("X".repeat(200), VERI, HEPSI);
  assert.equal(r.tip, "BILINMEYEN");
  assert.ok(r.neden.length < 200);
});

// ── Şema ile hizalanma ──────────────────────────────────────────────────────

test("her gerçek paket statüsünün operatör metni var — uydurma statü kalmaz", () => {
  for (const st of PAKET_STATULERI) {
    assert.ok(PAKET_DURUM[st], `${st} için ekran metni tanımsız`);
  }
  assert.equal(
    Object.keys(PAKET_DURUM).length,
    PAKET_STATULERI.length,
    "PAKET_DURUM şemada olmayan bir statü içeriyor"
  );
});

test("her gerçek statüde tanıma çalışır ve eylem listesi tutarlı", () => {
  for (const st of PAKET_STATULERI) {
    const veri = { ...VERI, paketler: [{ ...VERI.paketler[0], statu: st }] };
    const r = hizliTani("T00000001", veri, HEPSI);
    assert.equal(r.tip, "PAKET", `${st} tanınmadı`);
    assert.ok(r.eylemler.length >= 1, `${st} için hiç eylem yok`);
    // İleri eylemler yalnızca ileri gidebilen statülerde olmalı.
    const ileri = r.eylemler.filter((e) => e.etiket !== "İzleme Kaydını Aç");
    if (st === "RET") assert.equal(ileri.length, 0, "RET birimde ileri eylem var");
  }
});
