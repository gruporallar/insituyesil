import { NextResponse } from "next/server";
import { korumali, kullaniciHatasi } from "@/lib/api";
import { getDb, ensureEkTablolar, logla } from "@/lib/db";
import { govde } from "@/lib/dogrula";
import { ROL_ETIKETLERI, rolGecerli, type Rol } from "@/lib/types";
import { rolTablosu, sapmaHaritasi } from "@/lib/rolTablosu";
import {
  EKRANLAR, EKRAN_ETIKETLERI, EYLEMLER, EYLEM_ETIKETLERI,
  ROL_EKRANLARI, KILITLI_EYLEMLER,
  eylemVarsayilani, eylemKilitliMi, type Ekran, type Eylem,
} from "@/lib/yetki";

/** Rollerin şu anki yetki tablosu — varsayılan + kaydedilmiş sapmalar. */
export const GET = korumali({ ekran: "roller", eylem: "rol_yonet" }, async () => {
  await ensureEkTablolar();
  const db = await getDb();
  const kayitlar = await db.prepare("SELECT rol, tur, anahtar, izin FROM rol_yetkileri").all();

  return NextResponse.json({
    tablo: rolTablosu(sapmaHaritasi(kayitlar as any[])),
    ekranEtiketleri: EKRAN_ETIKETLERI,
    eylemEtiketleri: EYLEM_ETIKETLERI,
    kilitliEylemler: KILITLI_EYLEMLER,
  });
});

/**
 * Bir rolün yetkilerini kaydeder.
 *
 * Yalnızca VARSAYILANDAN SAPMA yazılıyor: değer varsayılana eşitse satır
 * siliniyor. Böylece koddaki GMP varsayılanı tek doğruluk kaynağı olarak
 * kalıyor ve tablo yalnızca bilinçli istisnaları taşıyor.
 */
export const POST = korumali({ ekran: "roller", eylem: "rol_yonet" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const rol = b.rol;
  if (!rolGecerli(rol)) kullaniciHatasi("Rol geçersiz.");

  // ADMİN DÜZENLENEMEZ. Kilitlenme emniyeti: son admin kendi yetkisini
  // kapatırsa sistemi açacak kimse kalmaz.
  if (rol === "admin") {
    kullaniciHatasi(
      "Admin rolünün yetkileri değiştirilemez. Sistemin kilitlenmemesi için " +
        "admin her zaman tam yetkilidir."
    );
  }

  const ekranlar = b.ekranlar;
  const eylemler = b.eylemler;
  if (typeof ekranlar !== "object" || !ekranlar || typeof eylemler !== "object" || !eylemler) {
    kullaniciHatasi("Yetki listesi eksik gönderildi.");
  }

  const db = await getDb();
  const degisen: string[] = [];

  for (const ekran of EKRANLAR) {
    const istenen = (ekranlar as Record<string, unknown>)[ekran];
    if (typeof istenen !== "boolean") continue;
    const varsayilan = ROL_EKRANLARI[rol].includes(ekran as Ekran);
    await yaz(db, rol, "EKRAN", ekran, istenen, varsayilan, k.id, degisen, EKRAN_ETIKETLERI[ekran]);
  }

  for (const eylem of EYLEMLER) {
    const istenen = (eylemler as Record<string, unknown>)[eylem];
    if (typeof istenen !== "boolean") continue;

    // Mevzuatla sabit eylemler sessizce yok sayılmıyor — kullanıcı neyin
    // neden uygulanmadığını bilmeli.
    if (eylemKilitliMi(eylem as Eylem)) {
      const varsayilan = eylemVarsayilani(rol, eylem as Eylem);
      if (istenen !== varsayilan) {
        kullaniciHatasi(
          `"${EYLEM_ETIKETLERI[eylem as Eylem]}" yetkisi değiştirilemez. ` +
            "Sorumluyu mevzuat belirliyor (Ek-13 / SOP-KG-07); bu karar " +
            "Mesul Müdür'dedir ve sisteme bırakılan bir tercih değildir."
        );
      }
      continue;
    }
    if (rol === "okuyucu" && istenen) {
      kullaniciHatasi(
        "Okuyucu rolü tanımı gereği hiçbir kayıt değiştiremez. " +
          "Yetki vermek için kullanıcıyı başka bir role alın."
      );
    }

    const varsayilan = eylemVarsayilani(rol, eylem as Eylem);
    await yaz(db, rol, "EYLEM", eylem, istenen, varsayilan, k.id, degisen, EYLEM_ETIKETLERI[eylem as Eylem]);
  }

  if (!degisen.length) {
    return NextResponse.json({ tamam: true, degisen: [], mesaj: "Değişiklik yok." });
  }

  // DENETİM İZİ. Yetki değişikliği sessizce olmamalı: denetimde "bu kişi bunu
  // ne zaman yapabilir hâle geldi" sorusunun cevabı burada.
  await logla(
    k.id,
    "Rol yetkileri değiştirildi",
    ROL_ETIKETLERI[rol],
    degisen.join(" · ").slice(0, 900)
  );

  return NextResponse.json({ tamam: true, degisen });
});

async function yaz(
  db: Awaited<ReturnType<typeof getDb>>,
  rol: Rol,
  tur: "EKRAN" | "EYLEM",
  anahtar: string,
  istenen: boolean,
  varsayilan: boolean,
  kullaniciId: number,
  degisen: string[],
  etiket: string
) {
  const mevcut = await db
    .prepare("SELECT izin FROM rol_yetkileri WHERE rol = ? AND tur = ? AND anahtar = ?")
    .get(rol, tur, anahtar);
  const oncekiDeger = mevcut ? Number(mevcut.izin) === 1 : varsayilan;
  if (oncekiDeger === istenen) return;

  if (istenen === varsayilan) {
    // Varsayılana dönüldü — sapma kaydı silinir, satır kalmaz.
    await db
      .prepare("DELETE FROM rol_yetkileri WHERE rol = ? AND tur = ? AND anahtar = ?")
      .run(rol, tur, anahtar);
  } else {
    await db
      .prepare(
        `INSERT INTO rol_yetkileri (rol, tur, anahtar, izin, degistiren_id, degistirme_tarihi)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(rol, tur, anahtar)
         DO UPDATE SET izin = excluded.izin,
                       degistiren_id = excluded.degistiren_id,
                       degistirme_tarihi = excluded.degistirme_tarihi`
      )
      .run(rol, tur, anahtar, istenen ? 1 : 0, kullaniciId);
  }
  degisen.push(`${etiket}: ${istenen ? "açıldı" : "kapatıldı"}`);
}
