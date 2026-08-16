/**
 * ÖN DENETİM — bulgu üretimi.
 *
 * İki yönlü koruma, ikisi de gerekli:
 *
 *   YANLIŞ NEGATİF → gerçek bir eksiklik raporda çıkmazsa, tesis "hazırım"
 *   sanıp denetime girer. Bu, raporun hiç olmamasından beterdir.
 *
 *   YANLIŞ POZİTİF → temiz kayıtta uyarı çıkarsa rapora güven biter ve bir
 *   süre sonra kimse bakmaz.
 *
 * Bu yüzden her kontrol İKİ kez sınanıyor: tetikleyen veriyle ve temiz veriyle.
 */
import assert from "node:assert/strict";
import { onDenetim } from "../../src/lib/denetim.ts";
import { ZORUNLU_PARAMETRELER } from "../../src/lib/analiz.ts";

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

const BUGUN = "2026-08-15";

/** Tüm kontrollerden temiz geçen taban veri. */
function temiz() {
  return {
    ciftciler: [
      { kod: "CF-001", ad: "Ahmet Yılmaz", izin_no: "BRD-2026-014", il: "Burdur", ilce: "Gölhisar", parsel: "112/7" },
    ],
    hammadde: [
      { lot: "HM-2026-0001", ciftci_kod: "CF-001", teslim_tarihi: "2026-08-10", miktar_kg: 500, kalan_kg: 200,
        statu: "SERBEST", thc: 0.18, cbd: 6.2, analiz_rapor_no: "AR-1", ret_nedeni: null },
    ],
    seriGirdileri: [{ seri: "CBD-D-2026-0001", lot: "HM-2026-0001", kg: 300 }],
    seriler: [
      { seri: "CBD-D-2026-0001", urun_tipi: "DISTILAT", uretim_tarihi: "2026-08-05", girdi_kg: 300,
        cikti_kg: 36, mb: 99.4, cbd: 84.2, thc: 0.21, statu: "SERBEST", serbest_kisi: "Salih", ret_nedeni: null },
    ],
    paketler: [
      { uid: "U1", tekil: "T00000001", seri: "CBD-D-2026-0001", miktar_g: 10, skt: "2028-08-01",
        statu: "SERBEST", sevk_kod: null, satis_kod: null },
    ],
    aliciar: [{ kod: "EC-001", tip: "ECZANE", ad: "Şifa", gln: null, il: "Burdur", yetkili: null }],
    sevkiyatlar: [
      // adet: null — kolon eklenmeden önceki eski kayıt gibi; D-18 null'u atlar.
      { kod: "SVK-2026-0001", tarih: "2026-08-12", alici_kod: "EC-001", tasiyici: "X", muhur_no: "M1", buts_ref: "BUTS-1", adet: null },
    ],
    satislar: [],
    sapmalar: [],
    imhalar: [
      { kod: "IMH-2026-0001", tip: "FIRE", kaynak_kod: "CBD-D-2026-0001", tanik_1: "Ali", tanik_2: "Veli",
        tutanak_no: "T-1", bertaraf_firma: "Firma", tarih: "2026-08-06" },
    ],
    mutabakatlar: [
      { seri: "CBD-D-2026-0001", basilan: 32, kullanilan: 30, bozuk: 2, imha_edilen: 2, fark: 0 },
    ],
    // P03…P11'in tamamı (distilat için P10 hariç hepsi zorunlu — kodun kendisi karar veriyor)
    prosesler: ["P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11"].map((a) => ({
      seri: "CBD-D-2026-0001", adim_kod: a, uygun: 1,
    })),
    numuneler: [
      { kod: "NUM-2026-0001", seri: "CBD-D-2026-0001", saklama_sonu: "2029-08-01", durum: "SAKLANIYOR" },
    ],
    iadeler: [],
    sikayetler: [],
    kullanicilar: [
      { id: 1, rol: "mesul_mudur", aktif: 1 },
      { id: 2, rol: "mesul_mudur", aktif: 1 },
    ],
    ekliKayitlar: ["IMHA:IMH-2026-0001"],
    // D-19: serbest lotun 9 zorunlu parametresi tam.
    analizSatirlari: ZORUNLU_PARAMETRELER.map((par) => ({
      lot: "HM-2026-0001", parametre: par, uygun: 1,
    })),
  };
}

const kodlar = (r) => r.bulgular.map((b) => b.kod);
const bul = (r, kod) => r.bulgular.find((b) => b.kod === kod);

// ── Temiz taban ─────────────────────────────────────────────────────────────

t("temiz kayıtlarda hiçbir bulgu çıkmıyor", () => {
  const r = onDenetim(temiz(), BUGUN);
  assert.deepEqual(kodlar(r), [], `beklenmedik bulgular: ${kodlar(r).join(", ")}`);
  assert.equal(r.hazir, true);
  assert.equal(r.sayim.KRITIK, 0);
});

// ── Kritik kontroller ───────────────────────────────────────────────────────

t("D-01: açık sapması olan serbest seri yakalanıyor", () => {
  const v = temiz();
  v.sapmalar = [{ kod: "SAP-1", kaynak_tip: "SERI", kaynak_kod: "CBD-D-2026-0001", konu: "x",
    kok_neden: null, capa: null, termin: null, durum: "ACIK" }];
  const r = onDenetim(v, BUGUN);
  assert.ok(kodlar(r).includes("D-01"));
  assert.equal(bul(r, "D-01").seviye, "KRITIK");
  assert.equal(r.hazir, false, "kritik bulguyla hazır sayıldı");
});

t("D-01: KAPALI sapma bulgu üretmiyor", () => {
  const v = temiz();
  v.sapmalar = [{ kod: "SAP-1", kaynak_tip: "SERI", kaynak_kod: "CBD-D-2026-0001", konu: "x",
    kok_neden: "sebep", capa: "önlem", termin: null, durum: "KAPALI" }];
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-01"));
});

t("D-01: karantinadaki serideki açık sapma bulgu DEĞİL", () => {
  // Henüz serbest bırakılmamış seride açık sapma normaldir.
  const v = temiz();
  v.seriler[0].statu = "KARANTINA";
  v.sapmalar = [{ kod: "SAP-1", kaynak_tip: "SERI", kaynak_kod: "CBD-D-2026-0001", konu: "x",
    kok_neden: null, capa: null, termin: null, durum: "ACIK" }];
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-01"));
});

t("D-02: şahit numunesi olmayan serbest seri yakalanıyor", () => {
  const v = temiz();
  v.numuneler = [];
  const r = onDenetim(v, BUGUN);
  assert.ok(kodlar(r).includes("D-02"));
  assert.equal(bul(r, "D-02").seviye, "KRITIK");
});

t("D-03: eksik proses kaydı yakalanıyor ve HANGİ adım söyleniyor", () => {
  const v = temiz();
  v.prosesler = v.prosesler.filter((p) => p.adim_kod !== "P05");
  const r = onDenetim(v, BUGUN);
  const b = bul(r, "D-03");
  assert.ok(b, "eksik proses yakalanmadı");
  assert.match(b.kayitlar[0], /P05/, "eksik adımın kodu yazılmamış");
});

t("D-04: mutabakat farkı yakalanıyor", () => {
  const v = temiz();
  // 32 basılmış, 30 kullanılmış, 1 imha → 1 etiketin hesabı yok
  v.mutabakatlar = [{ seri: "CBD-D-2026-0001", basilan: 32, kullanilan: 30, bozuk: 2, imha_edilen: 1, fark: 1 }];
  const r = onDenetim(v, BUGUN);
  assert.ok(kodlar(r).includes("D-04"));
  assert.equal(bul(r, "D-04").seviye, "KRITIK");
});

t("D-04: fark sıfırsa bulgu yok — bozuk ama imha edilmiş etiket sorun değil", () => {
  const v = temiz();
  v.mutabakatlar = [{ seri: "CBD-D-2026-0001", basilan: 32, kullanilan: 30, bozuk: 2, imha_edilen: 2, fark: 0 }];
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-04"));
});

t("D-05: ambalajlı ama mutabakatsız seri yakalanıyor", () => {
  const v = temiz();
  v.mutabakatlar = [];
  const r = onDenetim(v, BUGUN);
  assert.ok(kodlar(r).includes("D-05"));
});

t("D-06: analiz raporsuz serbest lot yakalanıyor", () => {
  const v = temiz();
  v.hammadde[0].analiz_rapor_no = null;
  const r = onDenetim(v, BUGUN);
  assert.ok(kodlar(r).includes("D-06"));
});

t("D-06: karantinadaki raporsuz lot bulgu DEĞİL", () => {
  const v = temiz();
  v.hammadde[0].statu = "KARANTINA";
  v.hammadde[0].analiz_rapor_no = null;
  v.hammadde[0].teslim_tarihi = BUGUN; // D-13'ü tetiklemesin
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-06"));
});

t("D-07: tanığı eksik veya aynı kişi olan imha tutanağı yakalanıyor", () => {
  for (const [t1, t2] of [["Ali", ""], ["", "Veli"], ["Ali", "Ali"], ["Ali", "  Ali  "]]) {
    const v = temiz();
    v.imhalar[0].tanik_1 = t1;
    v.imhalar[0].tanik_2 = t2;
    assert.ok(
      kodlar(onDenetim(v, BUGUN)).includes("D-07"),
      `tanık "${t1}"/"${t2}" yakalanmadı`
    );
  }
});

// ── Yüksek ─────────────────────────────────────────────────────────────────

t("D-08: termini geçmiş açık sapma yakalanıyor, gecikme günü yazılıyor", () => {
  const v = temiz();
  v.sapmalar = [{ kod: "SAP-9", kaynak_tip: "DIGER", kaynak_kod: null, konu: "x",
    kok_neden: null, capa: null, termin: "2026-08-05", durum: "ACIK" }];
  const b = bul(onDenetim(v, BUGUN), "D-08");
  assert.ok(b);
  assert.equal(b.seviye, "YUKSEK");
  assert.match(b.kayitlar[0], /10 gün/);
});

t("D-08: termini gelmemiş sapma bulgu değil", () => {
  const v = temiz();
  v.sapmalar = [{ kod: "SAP-9", kaynak_tip: "DIGER", kaynak_kod: null, konu: "x",
    kok_neden: null, capa: null, termin: "2026-09-01", durum: "ACIK" }];
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-08"));
});

t("D-09: BÜTS bildirilmemiş sevkiyat yakalanıyor", () => {
  const v = temiz();
  v.sevkiyatlar[0].buts_ref = null;
  assert.ok(kodlar(onDenetim(v, BUGUN)).includes("D-09"));
});

t("D-10: SKT'si geçmiş ama dolaşımdaki birim yakalanıyor", () => {
  const v = temiz();
  v.paketler[0].skt = "2026-07-01";
  const r = onDenetim(v, BUGUN);
  assert.ok(kodlar(r).includes("D-10"));
});

t("D-10: SKT geçmiş ama RET olmuş birim bulgu DEĞİL", () => {
  const v = temiz();
  v.paketler[0].skt = "2026-07-01";
  v.paketler[0].statu = "RET";
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-10"));
});

t("D-10: satılmış birim SKT'si geçse de bulgu değil — hasta almış, stokta yok", () => {
  const v = temiz();
  v.paketler[0].skt = "2026-07-01";
  v.paketler[0].statu = "SATILDI";
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-10"));
});

t("D-11 / D-12: 30 günü aşan iade ve şikayet yakalanıyor, aşmayan yakalanmıyor", () => {
  const eski = temiz();
  eski.iadeler = [{ kod: "IAD-1", tarih: "2026-07-01", karar: "BEKLIYOR" }];
  eski.sikayetler = [{ kod: "SIK-1", tarih: "2026-07-01", sonuc: "ACIK" }];
  const r1 = kodlar(onDenetim(eski, BUGUN));
  assert.ok(r1.includes("D-11") && r1.includes("D-12"));

  const yeni = temiz();
  yeni.iadeler = [{ kod: "IAD-1", tarih: "2026-08-10", karar: "BEKLIYOR" }];
  yeni.sikayetler = [{ kod: "SIK-1", tarih: "2026-08-10", sonuc: "ACIK" }];
  const r2 = kodlar(onDenetim(yeni, BUGUN));
  assert.ok(!r2.includes("D-11") && !r2.includes("D-12"));
});

// ── Orta ────────────────────────────────────────────────────────────────────

t("D-13: uzun süre karantinada bekleyen lot yakalanıyor", () => {
  const v = temiz();
  v.hammadde[0].statu = "KARANTINA";
  v.hammadde[0].teslim_tarihi = "2026-06-01";
  assert.ok(kodlar(onDenetim(v, BUGUN)).includes("D-13"));
});

t("D-14: saklama süresi dolmuş numune yakalanıyor", () => {
  const v = temiz();
  v.numuneler[0].saklama_sonu = "2026-08-01";
  assert.ok(kodlar(onDenetim(v, BUGUN)).includes("D-14"));
});

t("D-14: zaten imha edilmiş numune bulgu değil", () => {
  const v = temiz();
  v.numuneler[0].saklama_sonu = "2026-08-01";
  v.numuneler[0].durum = "IMHA";
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-14"));
});

t("D-15: izin numarası eksik çiftçi yakalanıyor", () => {
  for (const izin of ["", "   ", null]) {
    const v = temiz();
    v.ciftciler[0].izin_no = izin;
    assert.ok(kodlar(onDenetim(v, BUGUN)).includes("D-15"), `izin_no=${JSON.stringify(izin)}`);
  }
});

t("D-16: tek veya hiç Mesul Müdür yakalanıyor", () => {
  const tek = temiz();
  tek.kullanicilar = [{ id: 1, rol: "mesul_mudur", aktif: 1 }];
  assert.ok(kodlar(onDenetim(tek, BUGUN)).includes("D-16"));

  const yok = temiz();
  yok.kullanicilar = [{ id: 1, rol: "depo", aktif: 1 }];
  const b = bul(onDenetim(yok, BUGUN), "D-16");
  assert.ok(b);
  assert.match(b.detay, /aktif Mesul Müdür yok/);
});

t("D-16: pasif Mesul Müdür sayılmıyor", () => {
  const v = temiz();
  v.kullanicilar = [
    { id: 1, rol: "mesul_mudur", aktif: 1 },
    { id: 2, rol: "mesul_mudur", aktif: 0 },
  ];
  assert.ok(kodlar(onDenetim(v, BUGUN)).includes("D-16"));
});

t("D-17: fotoğrafsız imha tutanağı BİLGİ seviyesinde, hazırlığı bozmuyor", () => {
  const v = temiz();
  v.ekliKayitlar = [];
  const r = onDenetim(v, BUGUN);
  assert.equal(bul(r, "D-17").seviye, "BILGI");
  assert.equal(r.hazir, true, "bilgi seviyesi bulgu hazırlığı bozdu");
});

// ── Özet ve hüküm ───────────────────────────────────────────────────────────

t("her bulguda dayanak ve öneri dolu", () => {
  const v = temiz();
  v.sapmalar = [{ kod: "S1", kaynak_tip: "SERI", kaynak_kod: "CBD-D-2026-0001", konu: "x",
    kok_neden: null, capa: null, termin: "2026-01-01", durum: "ACIK" }];
  v.numuneler = []; v.mutabakatlar = []; v.ekliKayitlar = [];
  v.hammadde[0].analiz_rapor_no = null;
  v.imhalar[0].tanik_2 = "";
  v.sevkiyatlar[0].buts_ref = null;
  v.ciftciler[0].izin_no = "";
  v.kullanicilar = [{ id: 1, rol: "mesul_mudur", aktif: 1 }];

  const r = onDenetim(v, BUGUN);
  assert.ok(r.bulgular.length >= 8, `yalnızca ${r.bulgular.length} bulgu çıktı`);
  for (const b of r.bulgular) {
    assert.ok(b.dayanak?.trim(), `${b.kod} dayanaksız`);
    assert.ok(b.oneri?.trim(), `${b.kod} önerisiz`);
    assert.ok(b.baslik?.trim(), `${b.kod} başlıksız`);
    assert.ok(["KRITIK", "YUKSEK", "ORTA", "BILGI"].includes(b.seviye), `${b.kod} seviyesi geçersiz`);
  }
});

t("bulgu kodları tekil — aynı kod iki kez üretilmiyor", () => {
  const v = temiz();
  v.numuneler = []; v.mutabakatlar = [];
  const k = kodlar(onDenetim(v, BUGUN));
  assert.equal(new Set(k).size, k.length, "yinelenen bulgu kodu var");
});

t("sayım bulgu listesiyle tutarlı", () => {
  const v = temiz();
  v.numuneler = []; v.sevkiyatlar[0].buts_ref = null; v.ekliKayitlar = [];
  const r = onDenetim(v, BUGUN);
  const toplam = r.sayim.KRITIK + r.sayim.YUKSEK + r.sayim.ORTA + r.sayim.BILGI;
  assert.equal(toplam, r.bulgular.length);
});

t("hüküm kritik bulgu varken uyarıyor, yokken izin veriyor", () => {
  const temizR = onDenetim(temiz(), BUGUN);
  assert.match(temizR.hukum, /hazır görünüyor/);

  const v = temiz();
  v.numuneler = [];
  const r = onDenetim(v, BUGUN);
  assert.match(r.hukum, /KRİTİK/);
  assert.match(r.hukum, /girilmemeli/);
});

t("kapsam dışı başlıklar bildiriliyor — tarama olduğundan geniş görünmesin", () => {
  const r = onDenetim(temiz(), BUGUN);
  assert.ok(r.kapsamDisi.length >= 5);
  assert.ok(r.kapsamDisi.some((x) => /SOP/i.test(x)));
  assert.ok(r.kapsamDisi.some((x) => /kalibrasyon|validasyon/i.test(x)));
});

t("boş veritabanında patlamıyor", () => {
  const bos = {
    ciftciler: [], hammadde: [], seriGirdileri: [], seriler: [], paketler: [],
    aliciar: [], sevkiyatlar: [], satislar: [], sapmalar: [], imhalar: [],
    mutabakatlar: [], prosesler: [], numuneler: [], iadeler: [], sikayetler: [],
    kullanicilar: [], ekliKayitlar: [],
  };
  const r = onDenetim(bos, BUGUN);
  // Yalnızca "Mesul Müdür yok" beklenir; gerisi boş veriden bulgu üretmemeli.
  assert.deepEqual(kodlar(r), ["D-16"]);
});

// ── D-01 / D-01B ayrımı ─────────────────────────────────────────────────────

t("D-01: sapma serbest bırakmadan ÖNCE açılmışsa serbest bırakma kararı suçlanıyor", () => {
  const v = temiz();
  v.seriSerbestTarih = { "CBD-D-2026-0001": "2026-08-06" };
  v.sapmalar = [{ kod: "SAP-1", kaynak_tip: "SERI", kaynak_kod: "CBD-D-2026-0001", konu: "x",
    kok_neden: null, capa: null, termin: null, durum: "ACIK", acilis_tarihi: "2026-08-05" }];
  const k = kodlar(onDenetim(v, BUGUN));
  assert.ok(k.includes("D-01"), "önceden açık sapma D-01 vermedi");
  assert.ok(!k.includes("D-01B"));
});

t("D-01B: sapma serbest bırakmadan SONRA açılmışsa karar suçlanmıyor", () => {
  const v = temiz();
  v.seriSerbestTarih = { "CBD-D-2026-0001": "2026-08-06" };
  v.sapmalar = [{ kod: "SAP-7", kaynak_tip: "SERI", kaynak_kod: "CBD-D-2026-0001", konu: "şikayet",
    kok_neden: null, capa: null, termin: null, durum: "ACIK", acilis_tarihi: "2026-08-12" }];
  const r = onDenetim(v, BUGUN);
  const k = kodlar(r);
  assert.ok(k.includes("D-01B"), "sonradan açılan sapma D-01B vermedi");
  assert.ok(!k.includes("D-01"), "serbest bırakma kararı haksız yere suçlandı");
  // İkisi de kritik: piyasadaki üründe açık sapma her hâlükârda denetimi durdurur.
  assert.equal(bul(r, "D-01B").seviye, "KRITIK");
  assert.match(bul(r, "D-01B").detay, /kararı doğruydu/);
});

t("D-01: tarih bilinmiyorsa AĞIR tarafa yazılıyor", () => {
  // Bilinmeyen bir durumu "muhtemelen sorun yok" saymak denetimde savunulamaz.
  for (const ek of [
    {},                                                   // ikisi de yok
    { seriSerbestTarih: { "CBD-D-2026-0001": "2026-08-06" } }, // sapma tarihi yok
  ]) {
    const v = { ...temiz(), ...ek };
    v.sapmalar = [{ kod: "SAP-1", kaynak_tip: "SERI", kaynak_kod: "CBD-D-2026-0001", konu: "x",
      kok_neden: null, capa: null, termin: null, durum: "ACIK" }];
    const k = kodlar(onDenetim(v, BUGUN));
    assert.ok(k.includes("D-01"), `tarih eksikken hafif tarafa yazıldı: ${JSON.stringify(ek)}`);
  }
});

t("D-01: aynı gün açılan sapma ÖNCE sayılıyor — sıra belirsizse ağır taraf", () => {
  const v = temiz();
  v.seriSerbestTarih = { "CBD-D-2026-0001": "2026-08-06" };
  v.sapmalar = [{ kod: "SAP-1", kaynak_tip: "SERI", kaynak_kod: "CBD-D-2026-0001", konu: "x",
    kok_neden: null, capa: null, termin: null, durum: "ACIK", acilis_tarihi: "2026-08-06" }];
  assert.ok(kodlar(onDenetim(v, BUGUN)).includes("D-01"));
});

// ── D-18: sevkiyat adet mutabakatı ──────────────────────────────────────────

t("D-18: sevk anındaki adet ile bağlı birim sayısı uyuşmazsa KRİTİK", () => {
  const v = temiz();
  // Sevkiyat 2 birimle çıkmış ama bağlı yalnız 1 birim var — birinin bağı
  // silinmiş (eski iade davranışı) ya da kayda dokunulmuş.
  v.sevkiyatlar[0].adet = 2;
  v.paketler[0].sevk_kod = "SVK-2026-0001";
  v.paketler[0].statu = "SEVK";
  const r = onDenetim(v, BUGUN);
  const x = bul(r, "D-18");
  assert.ok(x, "uyuşmazlık yakalanmadı");
  assert.equal(x.seviye, "KRITIK");
  assert.match(x.kayitlar[0], /kayıt 2, bağlı 1/);
});

t("D-18: adet bağlı sayıya eşitse bulgu yok — iade bağı artık silmiyor", () => {
  const v = temiz();
  v.sevkiyatlar[0].adet = 1;
  v.paketler[0].sevk_kod = "SVK-2026-0001";
  v.paketler[0].statu = "SEVK";
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-18"));
});

t("D-18: adet hiç yazılmamış eski kayıt (null) bulgu üretmiyor", () => {
  const v = temiz();
  v.sevkiyatlar[0].adet = null;
  v.paketler[0].sevk_kod = "SVK-2026-0001";
  v.paketler[0].statu = "SEVK";
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-18"));
});

t("D-01/D-01B: tam zaman damgasıyla aynı GÜN içindeki sıra artık ayırt ediliyor", () => {
  // Serbest bırakma artık saat içeriyor; aynı gün SONRA açılan sapma D-01B.
  const v = temiz();
  v.seriSerbestTarih = { "CBD-D-2026-0001": "2026-08-15 09:00:00" };
  v.sapmalar = [{ kod: "SAP-7", kaynak_tip: "SERI", kaynak_kod: "CBD-D-2026-0001", konu: "şikayet",
    kok_neden: null, capa: null, termin: null, durum: "ACIK", acilis_tarihi: "2026-08-15 13:28:16" }];
  const k = kodlar(onDenetim(v, BUGUN));
  assert.ok(k.includes("D-01B"), "aynı gün sonrası D-01B olmalıydı");
  assert.ok(!k.includes("D-01"));
});

// ── D-19: serbest lotta zorunlu analiz parametresi eksik ─────────────────────

t("D-19: hiç analiz satırı olmayan serbest lot KRİTİK", () => {
  const v = temiz();
  v.analizSatirlari = [];
  const r = onDenetim(v, BUGUN);
  const x = bul(r, "D-19");
  assert.equal(x.seviye, "KRITIK");
  assert.ok(x.kayitlar[0].includes("hiç parametre satırı yok"));
});

t("D-19: tek zorunlu parametre eksikse de KRİTİK", () => {
  const v = temiz();
  v.analizSatirlari = v.analizSatirlari.filter((s) => s.parametre !== "AGIR_METAL");
  const x = bul(onDenetim(v, BUGUN), "D-19");
  assert.equal(x.seviye, "KRITIK");
  assert.ok(x.kayitlar[0].includes("1 parametre eksik"));
});

t("D-19: zorunlular tam, yalnız opsiyoneller (terpen/çözücü) yoksa bulgu yok", () => {
  // temiz() yalnız 9 zorunluyu içeriyor — opsiyonel eksikliği bulgu değil.
  assert.ok(!kodlar(onDenetim(temiz(), BUGUN)).includes("D-19"));
});

t("D-19: karantina/ret lotunda satır yokluğu bulgu üretmiyor", () => {
  const v = temiz();
  v.analizSatirlari = [];
  v.hammadde[0].statu = "KARANTINA";
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-19"));
});

// ── D-20/21/22: periyodik görev ve geri sayım ────────────────────────

const gv = (kod, vade, durum) => ({
  kod, vade, durum, arsiv_tarih: null,
  faaliyet: "Günlük sıcaklık-nem okuması", dokuman_kod: "SOP-TE-09",
});

t("D-20: vadesi geçmiş açık görev YÜKSEK", () => {
  const v = temiz();
  v.gorevler = [gv("GRV-1", "2026-08-10", "ACIK")];
  const x = bul(onDenetim(v, BUGUN), "D-20");
  assert.equal(x.seviye, "YUKSEK");
  assert.ok(x.kayitlar[0].includes("5 gün"));
});

t("D-20: bir ayı aşan gecikme KRİTİK", () => {
  const v = temiz();
  v.gorevler = [gv("GRV-1", "2026-07-01", "ACIK")];
  const x = bul(onDenetim(v, BUGUN), "D-20");
  assert.equal(x.seviye, "KRITIK");
  assert.ok(x.detay.includes("geriye dönük oluşturulamaz"));
});

t("D-20: vadesi gelmemiş görev bulgu üretmez", () => {
  const v = temiz();
  v.gorevler = [gv("GRV-1", "2026-09-01", "ACIK")];
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-20"));
});

t("D-21: basılmış ama arşive dönmemiş form ayrı bulgu", () => {
  const v = temiz();
  v.gorevler = [gv("GRV-1", "2026-08-10", "BASILDI"), gv("GRV-2", "2026-08-10", "TESLIM")];
  const k = kodlar(onDenetim(v, BUGUN));
  assert.ok(k.includes("D-21"), "D-21 çıkmalıydı");
  assert.ok(!k.includes("D-20"), "basılmış görev D-20'ye DÜŞMEMELİ — iş yapılmamış değil, kayıt dönmemiş");
  assert.equal(bul(onDenetim(v, BUGUN), "D-21").kayitlar.length, 2);
});

t("D-22: süresi dolan atık KRİTİK, sözleşme YÜKSEK", () => {
  const atik = temiz();
  atik.sureliKayitlar = [{
    kod: "SUR-1", tip: "ATIK", konu: "AL-ATK kannabinoid atık",
    baslangic: "2026-07-20", sure_gun: 15, durum: "ACIK", dayanak: "SOP-DE-06 md. 5.4",
  }];
  const a = bul(onDenetim(atik, BUGUN), "D-22");
  assert.equal(a.seviye, "KRITIK");
  assert.ok(a.detay.includes("kaçak"));

  const soz = temiz();
  soz.sureliKayitlar = [{
    kod: "SUR-2", tip: "SOZLESME", konu: "Akredite lab sözleşmesi",
    baslangic: "2026-06-01", sure_gun: 60, durum: "ACIK", dayanak: null,
  }];
  assert.equal(bul(onDenetim(soz, BUGUN), "D-22").seviye, "YUKSEK");
});

t("D-22: süresi dolmamış geri sayım bulgu üretmez", () => {
  const v = temiz();
  v.sureliKayitlar = [{
    kod: "SUR-1", tip: "ATIK", konu: "posa", baslangic: "2026-08-14",
    sure_gun: 7, durum: "ACIK", dayanak: null,
  }];
  assert.ok(!kodlar(onDenetim(v, BUGUN)).includes("D-22"));
});

t("görev/geri sayım verisi hiç yoksa yeni bulgular sessiz", () => {
  const k = kodlar(onDenetim(temiz(), BUGUN));
  for (const kod of ["D-20", "D-21", "D-22"]) {
    assert.ok(!k.includes(kod), `${kod} temiz veride çıkmamalı`);
  }
});

console.log(`✓ denetim — ${gecen} test geçti`);
