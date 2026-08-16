import { getDb, ensureEkTablolar } from "./db";
import type { ZincirVeri } from "./zincir";

/**
 * ZİNCİR VERİSİ — sekiz tablo, TEK gidiş-dönüş.
 *
 * İzleme sorgusu ve geri çekme etki analizi kayıtlar arasında ileri-geri
 * gezindiği için parça parça sorgulanamıyor.
 *
 * Sorgular `Promise.all` ile paralel atılıyordu; yerelde sorun yoktu ama
 * Turso ağ üzerinden konuştuğu için her sorgu KENDİ isteğini ve gecikmesini
 * ödüyordu — üretimde panel gözle görülür şekilde yavaştı. `topluOku` hepsini
 * tek istekte gönderiyor.
 *
 * ÖLÇEK NOTU: tesis kapasitesi 100 kg/gün, 4 batch. Yıllık birkaç bin kayıt
 * ediyor — tamamını belleğe almak bu ölçekte doğru karar. Kayıt sayısı yüz
 * binlere çıkarsa buradan başlanmalı.
 */
const ZINCIR_SQL = [
  "SELECT kod, ad, izin_no, il, ilce, parsel FROM ciftciler",
  `SELECT lot, ciftci_kod, teslim_tarihi, miktar_kg, kalan_kg, statu,
          thc, cbd, analiz_rapor_no, ret_nedeni
     FROM hammadde`,
  "SELECT seri, lot, kg FROM seri_girdileri",
  `SELECT seri, urun_tipi, uretim_tarihi, girdi_kg, cikti_kg, mb, cbd, thc,
          statu, serbest_kisi, ret_nedeni
     FROM seriler`,
  "SELECT uid, tekil, seri, miktar_g, skt, statu, sevk_kod, satis_kod, konum FROM paketler",
  "SELECT kod, tip, ad, gln, il, yetkili FROM aliciar",
  "SELECT kod, tarih, alici_kod, tasiyici, muhur_no, buts_ref, adet FROM sevkiyatlar",
  `SELECT kod, tarih, alici_kod, paket_uid, hasta_ad, hasta_tc_maskeli, recete_no, hekim
     FROM satislar`,
];

export async function zincirVerisi(): Promise<ZincirVeri> {
  const db = await getDb();
  const [ciftciler, hammadde, seriGirdileri, seriler, paketler, aliciar, sevkiyatlar, satislar] =
    await db.topluOku(ZINCIR_SQL);

  return {
    ciftciler: ciftciler as any,
    hammadde: hammadde as any,
    seriGirdileri: seriGirdileri as any,
    seriler: seriler as any,
    paketler: paketler as any,
    aliciar: aliciar as any,
    sevkiyatlar: sevkiyatlar as any,
    satislar: satislar as any,
  };
}

/**
 * Sevkiyat/satış denetimi için DAR veri: yalnızca paket, sevkiyat ve alıcı.
 *
 * Kod doğrulamada çiftçi ve seri bilgisi gerekmiyor; tamamını okumak her
 * barkod okutmada gereksiz yük olurdu.
 */
export async function denetimVerisi(): Promise<ZincirVeri> {
  const db = await getDb();
  const [paketler, sevkiyatlar, aliciar] = await db.topluOku([
    "SELECT uid, tekil, seri, miktar_g, skt, statu, sevk_kod, satis_kod, konum FROM paketler",
    "SELECT kod, tarih, alici_kod, tasiyici, muhur_no, buts_ref, adet FROM sevkiyatlar",
    "SELECT kod, tip, ad, gln, il, yetkili FROM aliciar",
  ]);
  return {
    ciftciler: [],
    hammadde: [],
    seriGirdileri: [],
    seriler: [],
    paketler: paketler as any,
    aliciar: aliciar as any,
    sevkiyatlar: sevkiyatlar as any,
    satislar: [],
  };
}

/**
 * ÖN DENETİM VERİSİ — zincir + kalite kayıtları, TEK gidiş-dönüş.
 *
 * Zincir sorgularıyla BİRLİKTE aynı batch'te gidiyor: ikisini ayrı çağırmak
 * iki ağ turu demekti ve hem pano hem rapor ikisini birden kullanıyor.
 *
 * `ekler` tablosundan yalnızca ANAHTAR okunuyor, BLOB değil: rapor "fotoğraf
 * var mı" sorusunu soruyor, fotoğrafın kendisini değil. Görüntüleri de
 * çekmek, taramayı megabaytlarca veri indiren bir işe çevirirdi.
 */
const DENETIM_SQL = [
  ...ZINCIR_SQL,
  // Zaman damgaları HAM hâliyle: date() ile güne yuvarlamak, aynı gün
  // içindeki "önce mi sonra mı" sorusunu cevaplanamaz kılıyordu.
  `SELECT kod, kaynak_tip, kaynak_kod, konu, kok_neden, capa, termin, durum, acilis_tarihi
     FROM sapmalar`,
  `SELECT kod, tip, kaynak_kod, tanik_1, tanik_2, tutanak_no, bertaraf_firma, tarih
     FROM imha_kayitlari`,
  "SELECT seri, basilan, kullanilan, bozuk, imha_edilen, fark FROM etiket_mutabakat",
  "SELECT seri, adim_kod, uygun FROM proses_kayitlari",
  "SELECT kod, seri, saklama_sonu, durum FROM sahit_numuneler",
  "SELECT kod, tarih, karar, gerekce, seri FROM iadeler",
  "SELECT kod, tarih, sonuc, konu, kaynak FROM sikayetler",
  "SELECT id, rol, aktif FROM kullanicilar",
  "SELECT DISTINCT kaynak_tip, kaynak_kod FROM ekler",
  "SELECT seri, serbest_tarih FROM seriler WHERE serbest_tarih IS NOT NULL",
  // D-19: serbest lotta zorunlu analiz parametresi eksik mi?
  "SELECT lot, parametre, uygun FROM analiz_sonuclari",
  // D-20/D-21: periyodik görev yapılmadı / basılan form arşive dönmedi.
  // `faaliyet` ve `dokuman_kod` kuraldan JOIN'le geliyor: bulgu metninde
  // "GRV-2026-00042" değil, işin ADI ve dayanağı görünmeli.
  `SELECT g.kod, g.vade, g.durum, g.arsiv_tarih, k.faaliyet, k.dokuman_kod
     FROM gorevler g JOIN gorev_kurallari k ON k.kod = g.kural_kod
    WHERE g.durum != 'ARSIV' AND g.durum != 'IPTAL'`,
  // D-22: azami bekleme süresi dolmuş kayıtlar.
  `SELECT kod, tip, konu, baslangic, sure_gun, durum, dayanak
     FROM sureli_kayitlar WHERE durum = 'ACIK'`,
];

export async function denetimTaramaVerisi() {
  await ensureEkTablolar();
  const db = await getDb();
  const [
    ciftciler, hammadde, seriGirdileri, seriler, paketler, aliciar, sevkiyatlar, satislar,
    sapmalar, imhalar, mutabakatlar, prosesler, numuneler, iadeler, sikayetler, kullanicilar,
    ekler, serbestler, analizSatirlari, gorevler, sureliKayitlar,
  ] = await db.topluOku(DENETIM_SQL);

  return {
    ciftciler: ciftciler as any,
    hammadde: hammadde as any,
    seriGirdileri: seriGirdileri as any,
    seriler: seriler as any,
    paketler: paketler as any,
    aliciar: aliciar as any,
    sevkiyatlar: sevkiyatlar as any,
    satislar: satislar as any,
    sapmalar: sapmalar as any,
    imhalar: imhalar as any,
    mutabakatlar: mutabakatlar as any,
    prosesler: prosesler as any,
    numuneler: numuneler as any,
    iadeler: iadeler as any,
    sikayetler: sikayetler as any,
    kullanicilar: (kullanicilar as any[]).map((k) => ({
      id: Number(k.id),
      rol: String(k.rol),
      aktif: Number(k.aktif),
    })),
    ekliKayitlar: (ekler as any[]).map((e) => `${e.kaynak_tip}:${e.kaynak_kod}`),
    analizSatirlari: (analizSatirlari as any[]).map((s) => ({
      lot: String(s.lot),
      parametre: String(s.parametre),
      uygun: Number(s.uygun),
    })),
    gorevler: gorevler as any,
    sureliKayitlar: sureliKayitlar as any,
    seriSerbestTarih: Object.fromEntries(
      (serbestler as any[]).map((x) => [String(x.seri), x.serbest_tarih ? String(x.serbest_tarih) : null])
    ),
  };
}
