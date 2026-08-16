import { NextResponse } from "next/server";
import { korumali, okuma, kullaniciHatasi } from "@/lib/api";
import { getDb, ensureEkTablolar, logla } from "@/lib/db";
import { govde } from "@/lib/dogrula";
import { metinOpsiyonel, metin } from "@/lib/dogrula";
import { ekCozumle, ekKaynagiGecerli, EK_AZAMI_ADET, EK_KAYNAKLARI } from "@/lib/ek";

/** Bir kayda iliştirilmiş eklerin ÜSTVERİSİ. Görüntünün kendisi `/api/ek/[id]`. */
export const GET = okuma("izleme", async (req) => {
  await ensureEkTablolar();
  const sp = new URL(req.url).searchParams;
  const tip = sp.get("kaynak_tip");
  const kod = sp.get("kaynak_kod");
  if (!ekKaynagiGecerli(tip) || !kod) {
    return NextResponse.json({ ekler: [] });
  }

  const db = await getDb();
  const ekler = await db
    .prepare(
      `SELECT e.id, e.aciklama, e.mime, e.boyut, e.olusturma_tarihi, k.ad_soyad AS ekleyen
         FROM ekler e
         LEFT JOIN kullanicilar k ON k.id = e.olusturan_id
        WHERE e.kaynak_tip = ? AND e.kaynak_kod = ?
        ORDER BY e.id`
    )
    .all(tip, kod);

  return NextResponse.json({ ekler });
});

/**
 * Fotoğraf iliştirir.
 *
 * Görüntü BLOB olarak veritabanında; ayrı bir nesne deposu (S3 vb.) bu ölçekte
 * (tesis 100 kg/gün, yılda birkaç yüz fotoğraf) fazladan bir bağımlılık ve
 * fazladan bir yedekleme sorumluluğu olurdu. İzlenebilirlik kaydı ile delili
 * aynı yedekte tutmak GMP açısından da daha savunulabilir.
 *
 * Eylem yetkisi KAYNAĞA GÖRE değişiyor: sapmaya fotoğraf ekleyebilen ile
 * imha tutanağına ekleyebilen aynı kişi olmak zorunda değil.
 */
export const POST = korumali({ ekran: "izleme" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const tip = b.kaynak_tip;
  if (!ekKaynagiGecerli(tip)) {
    kullaniciHatasi(`Ek tipi geçersiz. Beklenen: ${EK_KAYNAKLARI.join(", ")}.`);
  }
  const kod = metin(b.kaynak_kod, "Kayıt kodu", 60);
  const aciklama = metinOpsiyonel(b.aciklama, "Açıklama", 300);

  const cozum = ekCozumle(b.veri);
  if (!cozum.tamam) kullaniciHatasi(cozum.hata);

  const db = await getDb();

  // Sayı sınırı: bir kayda sınırsız fotoğraf eklenmesi hem veritabanını
  // şişirir hem de denetimde hangisinin anlamlı olduğunu gizler.
  const sayim = await db
    .prepare("SELECT COUNT(*) AS a FROM ekler WHERE kaynak_tip = ? AND kaynak_kod = ?")
    .get(tip, kod);
  if (Number(sayim?.a ?? 0) >= EK_AZAMI_ADET) {
    kullaniciHatasi(
      `Bu kayıtta zaten ${EK_AZAMI_ADET} fotoğraf var. Yenisini eklemek için önce birini kaldırın.`
    );
  }

  const r = await db
    .prepare(
      `INSERT INTO ekler (kaynak_tip, kaynak_kod, aciklama, mime, boyut, veri, olusturan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(tip, kod, aciklama, cozum.ek.mime, cozum.ek.boyut, cozum.ek.bayt, k.id);

  await logla(k.id, "EK_YUKLE", `${tip}:${kod}`, `${cozum.ek.mime} · ${cozum.ek.boyut} bayt`);

  return NextResponse.json({ id: Number(r.lastInsertRowid), boyut: cozum.ek.boyut });
});
