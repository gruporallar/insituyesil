import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx, ensureEkTablolar } from "@/lib/db";
import { elektronikImza } from "@/lib/eimza";
import { korumali, kullaniciHatasi } from "@/lib/api";
import { kodButs, kodSapma } from "@/lib/kod";
import { seriKarari, bicimSayi } from "@/lib/kabul";
import { govde, metin, sayi, sayiOpsiyonel } from "@/lib/dogrula";
import { URUN_ADI, type UrunTipi } from "@/lib/types";

/**
 * Seri serbest bırakma — Ek-13 adım 14–15, SOP-ÜR-13.
 *
 * YETKİ: yalnızca Mesul Müdür (`seri_serbest`). Ek-13 "Durdurma Yetkisi"
 * kolonu bunu böyle tanımlıyor; KG-KK seri dosyasını inceler, nihai kararı
 * Mesul Müdür verir.
 *
 * KARARI SİSTEM VERİYOR. Kullanıcı ölçüm sonuçlarını girer; kütle denkliği ve
 * spesifikasyon kontrolleri `seriKarari` içinde (birim testli). Kütle denkliği
 * %98–102 dışındaysa serbest bırakma MÜMKÜN DEĞİL — SOP-ÜR-16 md. 5.2.
 */
/**
 * Seriyi ve ONU BESLEYEN LOTLARI kapsayan açık sapmalar.
 *
 * Yalnızca serinin kendi sapmalarına bakmak yetmezdi: reddedilmiş bir ham
 * madde lotuyla ilgili araştırma sürerken o lottan beslenen seri serbest
 * bırakılabilirdi.
 */
async function acikSapmalariBul(seri: string): Promise<{ kod: string; konu: string }[]> {
  const db = await getDb();
  return (await db
    .prepare(
      `SELECT kod, konu FROM sapmalar
        WHERE durum = 'ACIK'
          AND ( (kaynak_tip = 'SERI' AND kaynak_kod = ?)
             OR (kaynak_tip = 'HAMMADDE' AND kaynak_kod IN
                   (SELECT lot FROM seri_girdileri WHERE seri = ?)) )
        ORDER BY kod`
    )
    .all(seri, seri)) as { kod: string; konu: string }[];
}

export const POST = korumali({ ekran: "uretim", eylem: "seri_serbest" }, async (req, k) => {
  const b = await govde(req);

  const seri = metin(b.seri, "Seri", 40);

  // GERİ ALINAMAZ KARAR — elektronik imza (şifreyle yeniden doğrulama).
  await elektronikImza({
    k, sifre: b.sifre, eylem: "seri_serbest", kayit: seri,
    anlam: "Seri serbest bırakma / ret kararı onayı",
  });
  const cikti_kg = sayi(b.cikti_kg, "Çıktı miktarı", { min: 0, max: 100000 });
  const fire_kg = sayi(b.fire_kg, "Fire miktarı", { min: 0, max: 100000 });
  const numune_kg = sayiOpsiyonel(b.numune_kg, "Numune miktarı", { min: 0, max: 1000 }) ?? 0;
  const cbd = sayi(b.cbd, "CBD", { min: 0, max: 100 });
  const thc = sayi(b.thc, "Δ9-THC", { min: 0, max: 100 });
  const cozucu = sayiOpsiyonel(b.cozucu, "Kalıntı çözücü", { min: 0, max: 1000000 });
  const serbest_kisi = metin(b.serbest_kisi, "Serbest bırakan", 120);

  await ensureEkTablolar();

  /**
   * AÇIK SAPMA ARTIK SORULMUYOR, SORGULANIYOR.
   *
   * Eskiden formda "Açık sapma / CAPA var mı?" diye soruluyor ve cevap
   * kullanıcının beyanıydı; "hayır" demenin doğruluğu hiçbir yere bağlı
   * değildi (bulgu B-03). İstemciden gelen değere güvenilmez kuralının
   * ihlaliydi. Artık `sapmalar` tablosuna bakılıyor.
   *
   * Girdi lotlarının sapmaları da kapsama dâhil: reddedilmiş bir lotla ilgili
   * araştırma sürerken o lottan beslenen seri serbest bırakılamamalı.
   */
  const acikSapmalar = await acikSapmalariBul(seri);
  const acikSapma = acikSapmalar.length > 0;

  const db = await getDb();
  const mevcut = await db
    .prepare("SELECT urun_tipi, girdi_kg, statu FROM seriler WHERE seri = ?")
    .get(seri);

  if (!mevcut) {
    return NextResponse.json({ hata: "Seri bulunamadı.", alan: "seri" }, { status: 404 });
  }
  if (mevcut.statu !== "KARANTINA") {
    return NextResponse.json(
      {
        hata: `Bu seri için karar zaten verilmiş (${mevcut.statu}). Değişiklik gerekiyorsa sapma kaydı açın (SOP-KG-03).`,
      },
      { status: 409 }
    );
  }

  const karar = seriKarari({
    urunTipi: mevcut.urun_tipi as UrunTipi,
    girdiKg: Number(mevcut.girdi_kg),
    ciktiKg: cikti_kg,
    fireKg: fire_kg,
    numuneKg: numune_kg,
    cbd,
    thc,
    cozucu,
    acikSapma,
  });

  const yil = new Date().getFullYear();
  const ret_nedeni = karar.engeller.join(" · ") || null;

  await db.transaction(async (calistir) => {
    const r = await calistir(
      `UPDATE seriler
          SET cikti_kg = ?, fire_kg = ?, numune_kg = ?, mb = ?, cbd = ?, thc = ?, cozucu = ?,
              statu = ?, serbest_kisi = ?, serbest_tarih = ?, ret_nedeni = ?
        WHERE seri = ? AND statu = 'KARANTINA'`,
      cikti_kg, fire_kg, numune_kg, karar.mb, cbd, thc, cozucu,
      karar.statu,
      karar.statu === "SERBEST" ? serbest_kisi : null,
            // TAM zaman damgası, UTC — sapmaların `datetime('now')` saatiyle aynı
      // saat dilimi. Yalnız gün yazılınca, aynı gün açılan bir sapmanın
      // serbest bırakmadan önce mi sonra mı olduğu sonsuza dek belirsiz
      // kalıyordu ve ön denetim ağır tarafa yazmak zorunda kalıyordu.
      karar.statu === "SERBEST" ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
      ret_nedeni,
      seri
    );

    // Satır güncellenmediyse araya başka bir karar girmiş demektir.
    if (r.changes === 0) {
      kullaniciHatasi("Bu seri için bu sırada başka bir karar kaydedilmiş. Sayfayı yenileyin.");
    }

    // Ret kararı otomatik sapma açar (SOP-KG-03) — ham madde reddiyle aynı
    // gerekçe: reddedilen seri kök neden araştırması gerektirir.
    if (karar.statu === "RET") {
      const sn = await sayacArtirTx(calistir, `sapma-${yil}`);
      await calistir(
        `INSERT INTO sapmalar (kod, kaynak_tip, kaynak_kod, konu, aciklama, otomatik, acan_id)
         VALUES (?, 'SERI', ?, ?, ?, 1, ?)`,
        kodSapma(yil, sn),
        seri,
        `Seri reddi — ${seri}`,
        `Uygunsuzluklar: ${karar.engeller.join(" · ")}. Ürün ve fire imhası SOP-ÜR-15 kapsamında yapılmalıdır.`,
        k.id
      );
    }

    const bn = await sayacArtirTx(calistir, `buts-${yil}`);
    await calistir(
      `INSERT INTO buts_kuyruk (kod, tip, ref, adet, detay) VALUES (?, ?, ?, 1, ?)`,
      kodButs(yil, bn),
      karar.statu === "SERBEST" ? "URETIM" : "RET",
      seri,
      JSON.stringify({
        seri,
        urun: URUN_ADI[mevcut.urun_tipi as UrunTipi],
        miktar_kg: cikti_kg,
        cbd,
        thc,
        mb: karar.mb,
        nedenler: karar.engeller,
      })
    );
  });

  await logla(
    k.id,
    karar.statu === "SERBEST" ? "Seri SERBEST bırakıldı" : "Seri REDDEDİLDİ",
    seri,
    ret_nedeni ?? `${bicimSayi(cikti_kg, 3)} kg · kütle denkliği %${bicimSayi(karar.mb, 2)}`
  );

  return NextResponse.json({
    tamam: true,
    statu: karar.statu,
    mb: karar.mb,
    engeller: karar.engeller,
    // Engelleyen sapmalar açıkça dönüyor: kullanıcı hangi kaydı kapatması
    // gerektiğini bilmeli, "sapma var" demek yetmez.
    acikSapmalar: acikSapmalar,
  });
});
