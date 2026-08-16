/**
 * SOYAĞACI ve GERİ ÇEKME — birim testleri.
 *
 * En kritik senaryo: bir ham madde lotu İKİ ayrı seriye bölündüğünde geri
 * çekmenin ikisini de kapsaması. Tek seri varsayan bir arama piyasada sorunlu
 * ürün bırakır — bu dosyanın var oluş sebebi o.
 */
import assert from "node:assert/strict";
import {
  bosVeri,
  geriIzleme,
  ileriIzleme,
  lottanSeriler,
  geriCekmeEtkisi,
  sevkKodlariniDenetle,
  satisDenetle,
} from "../../src/lib/zincir.ts";

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

// ── Örnek veri kümesi ────────────────────────────────────────────────────────
//
// İki çiftçi, iki ham madde lotu, iki seri. HM-1 HER İKİ seriye de giriyor —
// geri çekme testinin çekirdeği bu.

function veri() {
  const v = bosVeri();

  v.ciftciler = [
    { kod: "CF-001", ad: "Ahmet Yılmaz", izin_no: "BRD-2026-014", il: "Burdur", ilce: "Gölhisar", parsel: "112/7" },
    { kod: "CF-002", ad: "Yeşilova Koop.", izin_no: "BRD-2026-027", il: "Burdur", ilce: "Yeşilova", parsel: "308/2" },
  ];

  v.hammadde = [
    { lot: "HM-2026-0001", ciftci_kod: "CF-001", teslim_tarihi: "2026-08-03", miktar_kg: 520, kalan_kg: 483, statu: "SERBEST", thc: 0.184, cbd: 11.6, analiz_rapor_no: "AR-1187", ret_nedeni: null },
    { lot: "HM-2026-0002", ciftci_kod: "CF-002", teslim_tarihi: "2026-08-05", miktar_kg: 780, kalan_kg: 767, statu: "SERBEST", thc: 0.212, cbd: 10.85, analiz_rapor_no: "AR-1203", ret_nedeni: null },
  ];

  // HM-0001 iki seriye bölünmüş.
  v.seriGirdileri = [
    { seri: "CBD-D-2026-0001", lot: "HM-2026-0001", kg: 25 },
    { seri: "CBD-I-2026-0002", lot: "HM-2026-0001", kg: 12 },
    { seri: "CBD-I-2026-0002", lot: "HM-2026-0002", kg: 13 },
  ];

  v.seriler = [
    { seri: "CBD-D-2026-0001", urun_tipi: "DISTILAT", uretim_tarihi: "2026-08-10", girdi_kg: 25, cikti_kg: 3.75, mb: 99.86, cbd: 84.2, thc: 0.245, statu: "SERBEST", serbest_kisi: "Salih ÖZKAN", ret_nedeni: null },
    { seri: "CBD-I-2026-0002", urun_tipi: "IZOLAT", uretim_tarihi: "2026-08-11", girdi_kg: 25, cikti_kg: 3.42, mb: 99.88, cbd: 99.4, thc: 0.021, statu: "SERBEST", serbest_kisi: "Salih ÖZKAN", ret_nedeni: null },
  ];

  // D-0001: 1 depoda, 2 sevkte (EC-001), 1 satılmış
  // I-0002: 1 sevkte (EC-002), 1 satılmış
  v.paketler = [
    { uid: "K-D-1", tekil: "T00000001", seri: "CBD-D-2026-0001", miktar_g: 10, skt: "2028-08-10", statu: "SATILDI", sevk_kod: "SVK-2026-0001", satis_kod: "SAT-2026-00001" },
    { uid: "K-D-2", tekil: "T00000002", seri: "CBD-D-2026-0001", miktar_g: 10, skt: "2028-08-10", statu: "SEVK", sevk_kod: "SVK-2026-0001", satis_kod: null },
    { uid: "K-D-3", tekil: "T00000003", seri: "CBD-D-2026-0001", miktar_g: 10, skt: "2028-08-10", statu: "SEVK", sevk_kod: "SVK-2026-0001", satis_kod: null },
    { uid: "K-D-4", tekil: "T00000004", seri: "CBD-D-2026-0001", miktar_g: 10, skt: "2028-08-10", statu: "SERBEST", sevk_kod: null, satis_kod: null },
    { uid: "K-I-1", tekil: "T00000025", seri: "CBD-I-2026-0002", miktar_g: 5, skt: "2028-08-11", statu: "SATILDI", sevk_kod: "SVK-2026-0002", satis_kod: "SAT-2026-00002" },
    { uid: "K-I-2", tekil: "T00000026", seri: "CBD-I-2026-0002", miktar_g: 5, skt: "2028-08-11", statu: "SEVK", sevk_kod: "SVK-2026-0002", satis_kod: null },
    // Süresi geçmiş birim — sevk denetimi testinde kullanılıyor.
    { uid: "K-ESKI", tekil: "T00000099", seri: "CBD-D-2026-0001", miktar_g: 10, skt: "2026-01-01", statu: "SERBEST", sevk_kod: null, satis_kod: null },
  ];

  v.aliciar = [
    { kod: "EC-001", tip: "ECZANE", ad: "Şifa Eczanesi", gln: "8680000005678", il: "Burdur", yetkili: "Ecz. Ayşe Kaya" },
    { kod: "EC-002", tip: "ECZANE", ad: "Gölhisar Eczanesi", gln: "8680000009012", il: "Burdur", yetkili: "Ecz. Murat Şahin" },
  ];

  v.sevkiyatlar = [
    { kod: "SVK-2026-0001", tarih: "2026-08-12", alici_kod: "EC-001", tasiyici: "Soğuk Zincir A.Ş.", muhur_no: "MHR-40128", buts_ref: "BUTS-2026-00009" },
    { kod: "SVK-2026-0002", tarih: "2026-08-12", alici_kod: "EC-002", tasiyici: "Soğuk Zincir A.Ş.", muhur_no: "MHR-40129", buts_ref: "BUTS-2026-00010" },
  ];

  v.satislar = [
    { kod: "SAT-2026-00001", tarih: "2026-08-13", alici_kod: "EC-001", paket_uid: "K-D-1", hasta_ad: "A.Y.", hasta_tc_maskeli: "123******01", recete_no: "RCT-778101", hekim: "Dr. Selin Öz" },
    { kod: "SAT-2026-00002", tarih: "2026-08-14", alici_kod: "EC-002", paket_uid: "K-I-1", hasta_ad: "C.T.", hasta_tc_maskeli: "345******23", recete_no: "RCT-779002", hekim: "Dr. Emre Tan" },
  ];

  return v;
}

// ── Geri izleme ──────────────────────────────────────────────────────────────

t("satılmış birimden tarlaya kadar zincir çıkar", () => {
  const z = geriIzleme("K-D-1", veri());
  assert.ok(z, "zincir çıkarılamadı");
  assert.equal(z.seri.seri, "CBD-D-2026-0001");
  assert.equal(z.girdiler.length, 1);
  assert.equal(z.girdiler[0].ciftci.ad, "Ahmet Yılmaz");
  assert.equal(z.girdiler[0].ciftci.parsel, "112/7");
  assert.equal(z.girdiler[0].hammadde.lot, "HM-2026-0001");
  assert.equal(z.sevkiyat.muhur_no, "MHR-40128");
  assert.equal(z.alici.ad, "Şifa Eczanesi");
  assert.equal(z.satis.recete_no, "RCT-778101");
  assert.equal(z.eczane.ad, "Şifa Eczanesi");
});

t("iki lottan beslenen seride her iki çiftçi görünür", () => {
  const z = geriIzleme("K-I-1", veri());
  assert.equal(z.girdiler.length, 2);
  const adlar = z.girdiler.map((g) => g.ciftci.ad).sort();
  assert.deepEqual(adlar, ["Ahmet Yılmaz", "Yeşilova Koop."]);
  // Kullanılan miktarlar korunmalı.
  assert.equal(z.girdiler.reduce((a, g) => a + g.kg, 0), 25);
});

t("henüz sevk edilmemiş birimde sevkiyat halkası null", () => {
  const z = geriIzleme("K-D-4", veri());
  assert.equal(z.sevkiyat, null);
  assert.equal(z.alici, null);
  assert.equal(z.satis, null);
  // Ama üretim ve tarla halkaları yerinde olmalı.
  assert.equal(z.seri.seri, "CBD-D-2026-0001");
  assert.equal(z.girdiler[0].ciftci.ad, "Ahmet Yılmaz");
});

t("olmayan karekod null döner", () => {
  assert.equal(geriIzleme("YOK", veri()), null);
});

t("çiftçi kaydı eksikse halka null kalır ama zincir kırılmaz", () => {
  const v = veri();
  v.ciftciler = []; // çiftçi silinmiş
  const z = geriIzleme("K-D-1", v);
  assert.ok(z);
  assert.equal(z.girdiler.length, 1, "girdi halkası atlanmamalı");
  assert.equal(z.girdiler[0].ciftci, null);
  assert.equal(z.girdiler[0].hammadde.lot, "HM-2026-0001");
});

// ── İleri izleme ─────────────────────────────────────────────────────────────

t("seriden ileri izleme doğru sayar", () => {
  const i = ileriIzleme(["CBD-D-2026-0001"], veri());
  // 4 normal + 1 süresi geçmiş = 5 paket
  assert.equal(i.paketler.length, 5);
  assert.equal(i.sayim.satildi, 1);
  assert.equal(i.sayim.sevkte, 2);
  assert.equal(i.sayim.depoda, 2); // K-D-4 + K-ESKI
  assert.equal(i.satislar.length, 1);
});

t("noktalar yalnızca SEVK statüsünü sayar, satılmışı saymaz", () => {
  // K-D-1 satılmış (hastada), K-D-2 ve K-D-3 eczane stoğunda.
  const i = ileriIzleme(["CBD-D-2026-0001"], veri());
  assert.equal(i.noktalar.get("EC-001"), 2, "satılmış birim eczane stoğunda sayılmamalı");
});

t("birden fazla seri birlikte izlenir", () => {
  const i = ileriIzleme(["CBD-D-2026-0001", "CBD-I-2026-0002"], veri());
  assert.equal(i.paketler.length, 7);
  assert.equal(i.satislar.length, 2);
  assert.equal(i.noktalar.size, 2);
});

t("bilinmeyen seri boş sonuç döner", () => {
  const i = ileriIzleme(["YOK"], veri());
  assert.equal(i.paketler.length, 0);
  assert.equal(i.satislar.length, 0);
  assert.equal(i.noktalar.size, 0);
});

// ── Lottan seriler ───────────────────────────────────────────────────────────

t("bir lot birden fazla seriye bölünmüşse hepsi bulunur", () => {
  const s = lottanSeriler("HM-2026-0001", veri()).sort();
  assert.deepEqual(s, ["CBD-D-2026-0001", "CBD-I-2026-0002"]);
});

t("tek seriye giren lot", () => {
  assert.deepEqual(lottanSeriler("HM-2026-0002", veri()), ["CBD-I-2026-0002"]);
});

t("hiç kullanılmamış lot boş dizi döner", () => {
  assert.deepEqual(lottanSeriler("HM-2026-9999", veri()), []);
});

// ── Geri çekme ───────────────────────────────────────────────────────────────

t("ham madde lotu geri çekilince İKİ seri de kapsama girer", () => {
  // ASIL TEST: HM-0001 hem D-0001 hem I-0002'ye girmiş. Tek seri varsayan bir
  // arama I-0002'yi kaçırır ve piyasada sorunlu ürün bırakır.
  const g = geriCekmeEtkisi("HAMMADDE", "HM-2026-0001", veri());
  assert.equal(g.seriler.length, 2, "ikinci seri kapsam dışı kalmış");
  const kodlar = g.seriler.map((s) => s.seri).sort();
  assert.deepEqual(kodlar, ["CBD-D-2026-0001", "CBD-I-2026-0002"]);
});

t("geri çekme kapsamı üç kovaya doğru bölünür", () => {
  const g = geriCekmeEtkisi("HAMMADDE", "HM-2026-0001", veri());
  assert.equal(g.blokeEdilecek.length, 2); // K-D-4, K-ESKI
  assert.equal(g.toplanacak.length, 3); // K-D-2, K-D-3, K-I-2
  assert.equal(g.hastada.length, 2); // K-D-1, K-I-1
  // Toplam paket sayısı korunmalı — hiçbir birim iki kovada olmamalı.
  assert.equal(
    g.blokeEdilecek.length + g.toplanacak.length + g.hastada.length,
    7
  );
});

t("bilgilendirilecek hasta listesi tam", () => {
  const g = geriCekmeEtkisi("HAMMADDE", "HM-2026-0001", veri());
  assert.equal(g.satislar.length, 2);
  const receteler = g.satislar.map((s) => s.recete_no).sort();
  assert.deepEqual(receteler, ["RCT-778101", "RCT-779002"]);
});

t("toplama noktaları adede göre azalan sıralı", () => {
  const g = geriCekmeEtkisi("HAMMADDE", "HM-2026-0001", veri());
  assert.equal(g.noktalar.length, 2);
  assert.equal(g.noktalar[0].adet, 2); // EC-001
  assert.equal(g.noktalar[0].alici.ad, "Şifa Eczanesi");
  assert.equal(g.noktalar[1].adet, 1); // EC-002
  assert.ok(g.noktalar[0].adet >= g.noktalar[1].adet, "sıralama bozuk");
});

t("tek seri geri çekilince diğer seri etkilenmez", () => {
  const g = geriCekmeEtkisi("SERI", "CBD-D-2026-0001", veri());
  assert.equal(g.seriler.length, 1);
  assert.equal(g.satislar.length, 1);
  assert.equal(g.satislar[0].recete_no, "RCT-778101");
});

t("kaynağa kadar geri izleme çiftçi ve THC verir", () => {
  const g = geriCekmeEtkisi("SERI", "CBD-I-2026-0002", veri());
  assert.equal(g.kaynaklar.length, 2);
  const adlar = g.kaynaklar.map((k) => k.ciftci.ad).sort();
  assert.deepEqual(adlar, ["Ahmet Yılmaz", "Yeşilova Koop."]);
  assert.ok(g.kaynaklar.every((k) => typeof k.thc === "number"));
});

t("hiç üretime girmemiş lot boş kapsam döner", () => {
  const g = geriCekmeEtkisi("HAMMADDE", "HM-2026-9999", veri());
  assert.equal(g.seriler.length, 0);
  assert.equal(g.toplanacak.length, 0);
  assert.equal(g.satislar.length, 0);
});

// ── Sevk kodu denetimi ───────────────────────────────────────────────────────

const BUGUN = "2026-08-14";

t("uygun kod sevke geçer", () => {
  const d = sevkKodlariniDenetle(["K-D-4"], veri(), BUGUN);
  assert.equal(d.gecerli.length, 1);
  assert.equal(d.hatali.length, 0);
});

t("mükerrer okutma yakalanır", () => {
  const d = sevkKodlariniDenetle(["K-D-4", "K-D-4"], veri(), BUGUN);
  assert.equal(d.gecerli.length, 1);
  assert.equal(d.hatali.length, 1);
  assert.match(d.hatali[0].neden, /birden fazla/);
});

t("kayıtlı olmayan kod sahte şüphesi verir", () => {
  const d = sevkKodlariniDenetle(["UYDURMA"], veri(), BUGUN);
  assert.equal(d.gecerli.length, 0);
  assert.match(d.hatali[0].neden, /sahte/i);
});

t("zaten sevk edilmiş ve satılmış kodlar reddedilir", () => {
  const d = sevkKodlariniDenetle(["K-D-2", "K-D-1"], veri(), BUGUN);
  assert.equal(d.gecerli.length, 0);
  assert.equal(d.hatali.length, 2);
  assert.ok(d.hatali.some((h) => /sevk edilmiş/.test(h.neden)));
  assert.ok(d.hatali.some((h) => /hastaya verilmiş/.test(h.neden)));
});

t("süresi geçmiş birim sevk edilemez", () => {
  const d = sevkKodlariniDenetle(["K-ESKI"], veri(), BUGUN);
  assert.equal(d.gecerli.length, 0);
  assert.match(d.hatali[0].neden, /Son kullanma/);
});

t("boş satırlar yok sayılır, hata üretmez", () => {
  const d = sevkKodlariniDenetle(["", "  ", "K-D-4", ""], veri(), BUGUN);
  assert.equal(d.gecerli.length, 1);
  assert.equal(d.hatali.length, 0);
});

t("geri çekilmiş (RET) birim sevk edilemez", () => {
  const v = veri();
  v.paketler.find((p) => p.uid === "K-D-4").statu = "RET";
  const d = sevkKodlariniDenetle(["K-D-4"], v, BUGUN);
  assert.equal(d.gecerli.length, 0);
  assert.match(d.hatali[0].neden, /RET/);
});

// ── Satış denetimi ───────────────────────────────────────────────────────────

t("doğru eczaneden satış uygun", () => {
  const r = satisDenetle("K-D-2", "EC-001", veri(), BUGUN);
  assert.equal(r.uygun, true);
  assert.equal(r.paket.uid, "K-D-2");
});

t("yanlış eczaneden satış engellenir ve doğru adres bildirilir", () => {
  const r = satisDenetle("K-D-2", "EC-002", veri(), BUGUN);
  assert.equal(r.uygun, false);
  assert.match(r.neden, /Şifa Eczanesi/);
});

t("mükerrer satış engellenir", () => {
  const r = satisDenetle("K-D-1", "EC-001", veri(), BUGUN);
  assert.equal(r.uygun, false);
  assert.match(r.neden, /Mükerrer/);
});

t("sahte karekodla satış engellenir", () => {
  const r = satisDenetle("UYDURMA", "EC-001", veri(), BUGUN);
  assert.equal(r.uygun, false);
  assert.match(r.neden, /Sahte/i);
});

t("eczaneye sevk edilmemiş birim satılamaz", () => {
  const r = satisDenetle("K-D-4", "EC-001", veri(), BUGUN);
  assert.equal(r.uygun, false);
  assert.match(r.neden, /sevk edilmemiş/);
});

t("geri çekilmiş birim satılamaz", () => {
  const v = veri();
  v.paketler.find((p) => p.uid === "K-D-2").statu = "RET";
  const r = satisDenetle("K-D-2", "EC-001", v, BUGUN);
  assert.equal(r.uygun, false);
  assert.match(r.neden, /geri çekilmiş|reddedilmiş/);
});

t("süresi geçmiş birim satılamaz", () => {
  const v = veri();
  const p = v.paketler.find((x) => x.uid === "K-D-2");
  p.skt = "2026-01-01";
  const r = satisDenetle("K-D-2", "EC-001", v, BUGUN);
  assert.equal(r.uygun, false);
  assert.match(r.neden, /Son kullanma/);
});

t("SKT tam bugün ise satış YAPILABİLİR", () => {
  // Kriter "SKT geçmiş" — son gün dahil kullanılabilir.
  const v = veri();
  v.paketler.find((x) => x.uid === "K-D-2").skt = BUGUN;
  const r = satisDenetle("K-D-2", "EC-001", v, BUGUN);
  assert.equal(r.uygun, true);
});

console.log(`✓ zincir — ${gecen} test geçti`);
