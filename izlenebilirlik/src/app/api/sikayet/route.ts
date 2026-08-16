import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx, trBugun, ensureEkTablolar } from "@/lib/db";
import { korumali, kullaniciHatasi, okuma } from "@/lib/api";
import { kodSapma } from "@/lib/kod";
import { karekodNormalize } from "@/lib/karekod";
import { govde, metin, metinOpsiyonel, secim, tarih } from "@/lib/dogrula";

const KAYNAKLAR = ["HASTA", "ECZANE", "HEKIM", "KURUM", "DIGER"] as const;

/**
 * ŞİKAYETLER — SOP-KG-07.
 *
 * Geri çekme modülü vardı ama onu tetikleyen şikayet kaydı yoktu (bulgu B-08).
 * Şikayet bir seriye bağlandığında otomatik sapma açılıyor; sapma açık kaldığı
 * sürece o seri serbest bırakılamıyor ve araştırma takip edilebiliyor.
 */

function kodSikayet(yil: number, n: number) {
  return `SIK-${yil}-${String(n).padStart(4, "0")}`;
}

export const GET = okuma("iade", async () => {
  await ensureEkTablolar();
  const db = await getDb();

  const [kayitlar, ozet] = await Promise.all([
    db
      .prepare(
        `SELECT s.*, p.tekil, u.ad_soyad AS olusturan_ad, kp.ad_soyad AS kapatan_ad
           FROM sikayetler s
           LEFT JOIN paketler p ON p.uid = s.paket_uid
           LEFT JOIN kullanicilar u ON u.id = s.olusturan_id
           LEFT JOIN kullanicilar kp ON kp.id = s.kapatan_id
          ORDER BY s.sonuc != 'ACIK', s.kod DESC`
      )
      .all(),
    db
      .prepare(
        `SELECT COUNT(CASE WHEN sonuc = 'ACIK' THEN 1 END) AS acik,
                COUNT(CASE WHEN sonuc = 'HAKLI' THEN 1 END) AS hakli,
                COUNT(CASE WHEN sonuc = 'HAKSIZ' THEN 1 END) AS haksiz
           FROM sikayetler`
      )
      .get(),
  ]);

  return NextResponse.json({ kayitlar, ozet });
});

export const POST = korumali({ ekran: "iade", eylem: "sikayet_yaz" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const t = tarih(b.tarih, "Şikayet tarihi");
  const kaynak = secim(b.kaynak, "Şikayet kaynağı", KAYNAKLAR);
  const ileten = metinOpsiyonel(b.ileten, "İleten", 160);
  const iletisim = metinOpsiyonel(b.iletisim, "İletişim", 160);
  const konu = metin(b.konu, "Konu", 200);
  const aciklama = metinOpsiyonel(b.aciklama, "Açıklama", 2000);
  const paketHam = metinOpsiyonel(b.paket_uid, "Karekod", 300);
  const paket_uid = paketHam ? karekodNormalize(paketHam) : null;

  if (t > trBugun()) {
    return NextResponse.json({ hata: "Şikayet tarihi gelecekte olamaz.", alan: "tarih" }, { status: 400 });
  }

  const db = await getDb();
  const yil = new Date().getFullYear();

  const sonuc = await db.transaction(async (calistir) => {
    let seri: string | null = metinOpsiyonel(b.seri, "Seri", 40);

    // Karekod verildiyse seri ONDAN türetiliyor — kullanıcının ayrıca seri
    // yazması hem gereksiz hem de iki değerin ayrışma riski.
    if (paket_uid) {
      const r = await calistir("SELECT seri FROM paketler WHERE uid = ?", paket_uid);
      const p = r.rows?.[0];
      if (!p) kullaniciHatasi("Şikayete konu karekod sistemde kayıtlı değil. Sahte ürün şüphesi olabilir.");
      seri = p.seri as string;
    } else if (seri) {
      const r = await calistir("SELECT seri FROM seriler WHERE seri = ?", seri);
      if (!r.rows?.[0]) kullaniciHatasi("Belirtilen seri bulunamadı.");
    }

    const n = await sayacArtirTx(calistir, `sikayet-${yil}`);
    const kod = kodSikayet(yil, n);

    /**
     * SERİYE BAĞLI ŞİKAYET OTOMATİK SAPMA AÇAR.
     *
     * SOP-KG-07 şikayetin değerlendirilmesini, SOP-KG-03 sapma yönetimini
     * tanımlıyor. Bir ürün şikayeti araştırma gerektirir; sapmayı elle açmayı
     * beklemek, en kolay atlanan adımı insana bırakmak olurdu. Sapma açık
     * kaldığı sürece o seri serbest bırakılamaz.
     */
    let sapmaKod: string | null = null;
    if (seri) {
      const sn = await sayacArtirTx(calistir, `sapma-${yil}`);
      sapmaKod = kodSapma(yil, sn);
      await calistir(
        `INSERT INTO sapmalar (kod, kaynak_tip, kaynak_kod, konu, aciklama, otomatik, acan_id)
         VALUES (?, 'SERI', ?, ?, ?, 1, ?)`,
        sapmaKod,
        seri,
        `Ürün şikayeti — ${kod}`,
        `Kaynak: ${kaynak}. ${konu}${aciklama ? " — " + aciklama : ""}`,
        k.id
      );
    }

    await calistir(
      `INSERT INTO sikayetler
         (kod, tarih, kaynak, ileten, iletisim, paket_uid, seri, konu, aciklama, sapma_kod, olusturan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      kod, t, kaynak, ileten, iletisim, paket_uid, seri, konu, aciklama, sapmaKod, k.id
    );

    return { kod, seri, sapmaKod };
  });

  await logla(k.id, "Şikayet kaydı açıldı", sonuc.kod, `${kaynak} · ${konu}`);
  return NextResponse.json({ tamam: true, ...sonuc }, { status: 201 });
});

/** Şikayet değerlendirmesi ve kapatma. */
export const PATCH = korumali({ ekran: "iade", eylem: "sikayet_kapat" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const kod = metin(b.kod, "Şikayet kodu", 40);
  const sonuc = secim(b.sonuc, "Sonuç", ["HAKLI", "HAKSIZ"] as const);
  const degerlendirme = metin(b.degerlendirme, "Değerlendirme", 2000);

  const db = await getDb();
  const mevcut = await db.prepare("SELECT sonuc, seri FROM sikayetler WHERE kod = ?").get(kod);
  if (!mevcut) return NextResponse.json({ hata: "Şikayet kaydı bulunamadı." }, { status: 404 });
  if (mevcut.sonuc !== "ACIK") {
    return NextResponse.json({ hata: `Bu şikayet zaten kapatılmış (${mevcut.sonuc}).` }, { status: 409 });
  }

  await db
    .prepare(
      `UPDATE sikayetler SET sonuc = ?, degerlendirme = ?, kapanis_tarihi = ?, kapatan_id = ?
        WHERE kod = ? AND sonuc = 'ACIK'`
    )
    .run(sonuc, degerlendirme, trBugun(), k.id, kod);

  await logla(k.id, `Şikayet kapatıldı — ${sonuc}`, kod, degerlendirme.slice(0, 120));

  return NextResponse.json({
    tamam: true,
    // Şikayetin açtığı sapma OTOMATİK KAPANMIYOR: şikayetin haksız bulunması,
    // kök neden araştırmasının tamamlandığı anlamına gelmez. Sapma kendi
    // ekranından, kök neden ve CAPA girilerek kapatılır.
    not: mevcut.seri
      ? "Bu şikayetin açtığı sapma kaydı hâlâ açık. Kök neden ve CAPA girilerek ayrıca kapatılmalıdır."
      : null,
  });
});
