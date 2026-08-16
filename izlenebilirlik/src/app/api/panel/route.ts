import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { okuma } from "@/lib/api";

/**
 * Panel özeti.
 *
 * Sayımlar TEK sorguda toplanıyor. Her kart için ayrı sorgu atmak Turso'da
 * sekiz roundtrip demekti; panel her girişte açılan sayfa.
 */
export const GET = okuma("panel", async () => {
  const db = await getDb();

  const [sayimlar, sonHareketler] = await Promise.all([
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM ciftciler) AS ciftci,
           (SELECT COUNT(*) FROM hammadde) AS hammadde,
           (SELECT COUNT(*) FROM hammadde WHERE statu = 'KARANTINA') AS hammadde_karantina,
           (SELECT COUNT(*) FROM hammadde WHERE statu = 'SERBEST') AS hammadde_serbest,
           (SELECT COUNT(*) FROM seriler) AS seri,
           (SELECT COUNT(*) FROM seriler WHERE statu = 'KARANTINA') AS seri_karantina,
           (SELECT COUNT(*) FROM seriler WHERE statu = 'SERBEST') AS seri_serbest,
           (SELECT COUNT(*) FROM paketler) AS paket,
           (SELECT COUNT(*) FROM paketler WHERE statu = 'SERBEST') AS paket_depoda,
           (SELECT COUNT(*) FROM paketler WHERE statu = 'SEVK') AS paket_sevkte,
           (SELECT COUNT(*) FROM paketler WHERE statu = 'SATILDI') AS paket_satildi,
           (SELECT COUNT(*) FROM sevkiyatlar) AS sevkiyat,
           (SELECT COUNT(*) FROM satislar) AS satis,
           (SELECT COUNT(*) FROM aliciar) AS alici,
           (SELECT COUNT(*) FROM buts_kuyruk WHERE durum = 'BEKLIYOR') AS buts_bekleyen`
      )
      .get(),
    db
      .prepare(
        `SELECT l.tarih, l.eylem, l.kayit, l.detay, k.ad_soyad
           FROM loglar l
           LEFT JOIN kullanicilar k ON k.id = l.kullanici_id
          ORDER BY l.id DESC
          LIMIT 25`
      )
      .all(),
  ]);

  return NextResponse.json({ sayimlar, sonHareketler });
});
