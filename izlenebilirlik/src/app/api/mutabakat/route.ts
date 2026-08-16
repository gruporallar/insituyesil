import { NextResponse } from "next/server";
import { getDb, logla, trBugun, ensureEkTablolar } from "@/lib/db";
import { korumali, kullaniciHatasi } from "@/lib/api";
import { mutabakatKarari } from "@/lib/kabul";
import { govde, metin, tamsayi, tarih } from "@/lib/dogrula";

/**
 * ETİKET MUTABAKATI — FRM-ÜR-12, Ek-13 kritik kontrol noktası §13.
 *
 * Ambalaj ekranı "FARK = 0 olmalıdır" diyordu ama hiçbir sayı girilmiyordu;
 * cümle bir hatırlatmadan ibaretti (bulgu B-06). Artık kayıt tutuluyor ve
 * FARK ≠ 0 olan serinin hiçbir birimi sevk edilemiyor (bkz. sevkiyat ucu).
 *
 * Durdurma yetkisi Ek-13'e göre KG-KK'da — `mutabakat_yaz` eylemi.
 */
export const POST = korumali({ ekran: "ambalaj", eylem: "mutabakat_yaz" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const seri = metin(b.seri, "Seri", 40);
  const basilan = tamsayi(b.basilan, "Basılan etiket", { min: 0, max: 100000 });
  const kullanilan = tamsayi(b.kullanilan, "Kullanılan etiket", { min: 0, max: 100000 });
  const bozuk = tamsayi(b.bozuk, "Bozuk etiket", { min: 0, max: 100000 });
  const imha_edilen = tamsayi(b.imha_edilen, "İmha edilen etiket", { min: 0, max: 100000 });
  const kontrol_eden = metin(b.kontrol_eden, "Kontrol eden", 120);
  const t = tarih(b.tarih, "Kontrol tarihi");
  // Etiket sayımı yapılmış bir işin tarihi gelecekte olamaz. Bu kontrol
  // yokken örnek veriye SKT'den türetilmiş "2028" tarihli bir mutabakat
  // sızdı ve dış incelemede yakalandı — doğrulama katmanının işi tam bu.
  if (t > trBugun()) kullaniciHatasi("Kontrol tarihi gelecekte olamaz.");

  const karar = mutabakatKarari({ basilan, kullanilan, bozuk, imhaEdilen: imha_edilen });

  const db = await getDb();

  await db.transaction(async (calistir) => {
    const r = await calistir("SELECT statu FROM seriler WHERE seri = ?", seri);
    if (!r.rows?.[0]) kullaniciHatasi("Seri bulunamadı.");

    const p = await calistir("SELECT COUNT(*) AS a FROM paketler WHERE seri = ?", seri);
    const uretilen = Number(p.rows?.[0]?.a ?? 0);
    if (uretilen === 0) kullaniciHatasi("Bu seride henüz ambalaj birimi üretilmemiş.");

    // KULLANILAN, SİSTEMDEKİ BİRİM SAYISIYLA TUTMALI. Elle girilen "kullanılan"
    // ile üretilen karekod sayısı ayrışıyorsa sayım güvenilmez demektir —
    // mutabakatın amacı zaten bu iki gerçeği karşılaştırmak.
    if (kullanilan !== uretilen) {
      kullaniciHatasi(
        `Kullanılan etiket adedi (${kullanilan}), sistemde üretilen birim sayısıyla (${uretilen}) uyuşmuyor.`
      );
    }

    // Yeniden sayım yapılabilir: seri başına tek kayıt, üzerine yazılır.
    await calistir(
      `INSERT INTO etiket_mutabakat
         (seri, basilan, kullanilan, bozuk, imha_edilen, fark, kontrol_eden, tarih, olusturan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(seri) DO UPDATE SET
         basilan = excluded.basilan, kullanilan = excluded.kullanilan,
         bozuk = excluded.bozuk, imha_edilen = excluded.imha_edilen,
         fark = excluded.fark, kontrol_eden = excluded.kontrol_eden,
         tarih = excluded.tarih, olusturan_id = excluded.olusturan_id`,
      seri, basilan, kullanilan, bozuk, imha_edilen, karar.fark, kontrol_eden, t, k.id
    );
  });

  await logla(
    k.id,
    karar.statu === "SERBEST" ? "Etiket mutabakatı — FARK = 0" : `Etiket mutabakatı UYUŞMADI (fark ${karar.fark})`,
    seri,
    `Basılan ${basilan} · kullanılan ${kullanilan} · bozuk ${bozuk} · imha ${imha_edilen}`
  );

  return NextResponse.json({
    tamam: true,
    statu: karar.statu,
    fark: karar.fark,
    engeller: karar.engeller,
  });
});

/** Bugünün tarihini varsayılan olarak veren yardımcı — form için. */
export const GET = korumali({ ekran: "ambalaj" }, async () => {
  await ensureEkTablolar();
  const db = await getDb();
  const kayitlar = await db
    .prepare(
      `SELECT m.*, k.ad_soyad AS olusturan_ad
         FROM etiket_mutabakat m
         LEFT JOIN kullanicilar k ON k.id = m.olusturan_id
        ORDER BY m.seri DESC`
    )
    .all();
  return NextResponse.json({ kayitlar, bugun: trBugun() });
});
