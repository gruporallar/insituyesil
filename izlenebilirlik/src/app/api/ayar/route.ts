import { NextResponse } from "next/server";
import { korumali, kullaniciHatasi } from "@/lib/api";
import { getDb, ensureEkTablolar, logla } from "@/lib/db";
import { govde } from "@/lib/dogrula";

/**
 * Uygulama ayarı — şimdilik TEK anahtar: `ornek_veri`.
 *
 * Bayrak açıkken her sayfanın üstünde "TEST VERİSİ" şeridi çıkıyor. Dış
 * denetim bunu haklı olarak istedi: DEN-01 açılış senaryosu "henüz üretim
 * yapılmadı" derken ekranlarda dolu kayıtlar görünüyorsa, ya kayıtlar test
 * olarak İŞARETLİ olmalı ya da senaryo yanlış demektir. Anahtar beyaz
 * listeli — bu uç genel bir ayar deposu değil.
 */
const IZINLI = new Set(["ornek_veri"]);

export const POST = korumali({ ekran: "kullanicilar", eylem: "kullanici_yonet" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);
  const anahtar = String(b.anahtar ?? "");
  const deger = b.deger === "1" || b.deger === 1 || b.deger === true ? "1" : "0";
  if (!IZINLI.has(anahtar)) kullaniciHatasi("Bilinmeyen ayar.");

  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO ayarlar (anahtar, deger, guncelleme) VALUES (?, ?, datetime('now'))
       ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger, guncelleme = excluded.guncelleme`
    )
    .run(anahtar, deger);

  await logla(k.id, "Ayar değiştirildi", anahtar, deger);
  return NextResponse.json({ tamam: true, anahtar, deger });
});
