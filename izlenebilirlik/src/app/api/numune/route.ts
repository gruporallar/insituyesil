import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx, trBugun, ensureEkTablolar } from "@/lib/db";
import { korumali, kullaniciHatasi, okuma } from "@/lib/api";
import { kodNumune } from "@/lib/kod";
import { govde, metin, metinOpsiyonel, sayi, tarih } from "@/lib/dogrula";

/**
 * ŞAHİT NUMUNELER — SOP-KK-10.
 *
 * Şikayet veya geri çekmede ilk başvurulan şey şahit numunedir; nerede olduğu
 * ve ne kadar süre saklanacağı bilinmiyorsa araştırma yapılamaz (bulgu B-07).
 */

export const GET = okuma("uretim", async (req) => {
  await ensureEkTablolar();
  const { searchParams } = new URL(req.url);
  const seri = searchParams.get("seri");
  const db = await getDb();

  const kayitlar = await db
    .prepare(
      `SELECT n.*, k.ad_soyad AS olusturan_ad,
              CASE WHEN n.durum = 'SAKLANIYOR' AND n.saklama_sonu < date('now','+3 hours')
                   THEN 1 ELSE 0 END AS suresi_doldu
         FROM sahit_numuneler n
         LEFT JOIN kullanicilar k ON k.id = n.olusturan_id
        ${seri ? "WHERE n.seri = ?" : ""}
        ORDER BY n.kod DESC`
    )
    .all(...(seri ? [seri] : []));

  return NextResponse.json({ kayitlar });
});

export const POST = korumali({ ekran: "uretim", eylem: "numune_yaz" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const seri = metin(b.seri, "Seri", 40);
  const miktar_g = sayi(b.miktar_g, "Miktar", { min: 0.01, max: 100000, sifirOlabilir: false });
  const alma_tarihi = tarih(b.alma_tarihi, "Alma tarihi");
  const saklama_yeri = metin(b.saklama_yeri, "Saklama yeri", 200);
  const saklama_sonu = tarih(b.saklama_sonu, "Saklama süresi sonu");
  const notlar = metinOpsiyonel(b.notlar, "Notlar", 1000);

  // SAKLAMA SONU ALMA TARİHİNDEN SONRA OLMALI. Ters girilmiş bir tarih,
  // numuneyi daha alındığı gün "süresi dolmuş" kuyruğuna düşürürdü.
  if (saklama_sonu <= alma_tarihi) {
    return NextResponse.json(
      { hata: "Saklama süresi sonu, alma tarihinden sonra olmalı.", alan: "saklama_sonu" },
      { status: 400 }
    );
  }
  if (alma_tarihi > trBugun()) {
    return NextResponse.json({ hata: "Alma tarihi gelecekte olamaz.", alan: "alma_tarihi" }, { status: 400 });
  }

  const db = await getDb();
  const yil = new Date().getFullYear();

  const kod = await db.transaction(async (calistir) => {
    const r = await calistir("SELECT seri FROM seriler WHERE seri = ?", seri);
    if (!r.rows?.[0]) kullaniciHatasi("Seri bulunamadı.");

    const n = await sayacArtirTx(calistir, `numune-${yil}`);
    const kod = kodNumune(yil, n);
    await calistir(
      `INSERT INTO sahit_numuneler
         (kod, seri, miktar_g, alma_tarihi, saklama_yeri, saklama_sonu, notlar, olusturan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      kod, seri, miktar_g, alma_tarihi, saklama_yeri, saklama_sonu, notlar, k.id
    );
    return kod;
  });

  await logla(k.id, "Şahit numune kaydedildi", kod, `${seri} · ${miktar_g} g · ${saklama_yeri}`);
  return NextResponse.json({ tamam: true, kod }, { status: 201 });
});

/** Saklama süresi dolmuş numunenin imhası. */
export const PATCH = korumali({ ekran: "uretim", eylem: "numune_yaz" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const kod = metin(b.kod, "Numune kodu", 40);
  const imha_tutanak_no = metin(b.imha_tutanak_no, "İmha tutanak no", 60);
  const imha_tarihi = tarih(b.imha_tarihi, "İmha tarihi");

  const db = await getDb();
  const mevcut = await db
    .prepare("SELECT durum, saklama_sonu, seri FROM sahit_numuneler WHERE kod = ?")
    .get(kod);

  if (!mevcut) return NextResponse.json({ hata: "Numune bulunamadı." }, { status: 404 });
  if (mevcut.durum === "IMHA") {
    return NextResponse.json({ hata: "Bu numune zaten imha edilmiş." }, { status: 409 });
  }

  // SAKLAMA SÜRESİ DOLMADAN İMHA EDİLEMEZ. Şahit numunenin varlık sebebi
  // sonradan yapılacak araştırma; erken imha o imkânı yok eder.
  if (String(mevcut.saklama_sonu) > trBugun()) {
    return NextResponse.json(
      {
        hata:
          `Saklama süresi ${mevcut.saklama_sonu} tarihinde doluyor; ` +
          `süresi dolmadan imha edilemez (SOP-KK-10).`,
      },
      { status: 409 }
    );
  }

  await db
    .prepare(
      `UPDATE sahit_numuneler SET durum = 'IMHA', imha_tarihi = ?, imha_tutanak_no = ?
        WHERE kod = ? AND durum = 'SAKLANIYOR'`
    )
    .run(imha_tarihi, imha_tutanak_no, kod);

  await logla(k.id, "Şahit numune imha edildi", kod, `${mevcut.seri} · tutanak ${imha_tutanak_no}`);
  return NextResponse.json({ tamam: true });
});
