import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx, ensureEkTablolar } from "@/lib/db";
import { korumali } from "@/lib/api";
import { kodButs, kodSapma } from "@/lib/kod";
import { hamMaddeKarari } from "@/lib/kabul";
import { analizDegerlendir, parametreBul, type AnalizSatiri } from "@/lib/analiz";
import {
  DogrulamaHatasi, evetHayir, govde, metin, metinOpsiyonel, sayiOpsiyonel, tarih,
} from "@/lib/dogrula";

/**
 * Akredite laboratuvar analizi ve kabul/ret kararı — Ek-13 adım 2, SOP-KK-04/05.
 *
 * KARARI KULLANICI VERMİYOR, SİSTEM VERİYOR. Δ9-THC yasal sınırı aşan bir lotun
 * "yine de kabul" edilebilmesi, sistemin engellemek için var olduğu şeyin ta
 * kendisi olurdu.
 *
 * PARAMETRİK MODEL: eski uç "11 zorunlu analiz uygun mu? E/H" beyanı alıyordu.
 * Artık FRM-KK-09'daki 11 parametrenin sonuçları SATIR SATIR girilir;
 * `onbirAnalizUygun` beyandan değil satırlardan TÜRETİLİR (kural 2 güçlenir).
 * Geriye uyumluluk bilinçli olarak YOK: beyan alanını yaşatmak, kararın
 * dayanaksız verilebildiği bir yolu açık tutmak demekti. Tek iç tüketici
 * (örnek veri aracı) aynı değişiklikte güncellendi.
 */
export const POST = korumali({ ekran: "hammadde", eylem: "analiz_karar" }, async (req, k) => {
  const b = await govde(req);

  const lot = metin(b.lot, "Lot", 40);
  const analiz_rapor_no = metin(b.analiz_rapor_no, "Analiz rapor no", 60);
  const analiz_tarihi = tarih(b.analiz_tarihi, "Analiz tarihi");
  const lab = metinOpsiyonel(b.lab, "Laboratuvar", 120);

  if (b.thc !== undefined || b.onbir_analiz !== undefined) {
    throw new DogrulamaHatasi(
      "satirlar",
      "Bu uç artık parametrik analiz satırları bekliyor; eski thc/cbd/onbir_analiz gövdesi kabul edilmiyor."
    );
  }
  if (!Array.isArray(b.satirlar) || b.satirlar.length === 0) {
    throw new DogrulamaHatasi("satirlar", "Analiz satırları gönderilmedi.");
  }
  if (b.satirlar.length > 30) {
    throw new DogrulamaHatasi("satirlar", "En fazla 30 analiz satırı gönderilebilir.");
  }

  const satirlar: AnalizSatiri[] = b.satirlar.map((ham: unknown, i: number) => {
    if (!ham || typeof ham !== "object") {
      throw new DogrulamaHatasi("satirlar", `Satır ${i + 1} bir nesne olmalı.`);
    }
    const s = ham as Record<string, unknown>;
    const parametre = metin(s.parametre, `Satır ${i + 1} parametre`, 30);
    const ad = parametreBul(parametre)?.ad ?? parametre;
    return {
      parametre,
      spesifikasyon: metin(s.spesifikasyon, `${ad} spesifikasyon`, 200),
      sonuc: metin(s.sonuc, `${ad} sonuç`, 200),
      sayisal_deger: sayiOpsiyonel(s.sayisal_deger, `${ad} sayısal değer`, { min: 0, max: 10_000_000 }),
      birim: metinOpsiyonel(s.birim, `${ad} birim`, 20),
      yontem: metinOpsiyonel(s.yontem, `${ad} yöntem`, 120),
      akredite: s.akredite === undefined || s.akredite === null || s.akredite === ""
        ? null
        : evetHayir(s.akredite, `${ad} akredite`),
      akredite_no: metinOpsiyonel(s.akredite_no, `${ad} akreditasyon no`, 60),
      loq: sayiOpsiyonel(s.loq, `${ad} LOQ`, { min: 0, max: 10_000_000 }),
      uygun: evetHayir(s.uygun, `${ad} uygunluk`),
      aciklama: metinOpsiyonel(s.aciklama, `${ad} açıklama`, 300),
    };
  });

  const degerlendirme = analizDegerlendir(satirlar);
  // Yapısal hatalar (eksik zorunlu satır, mükerrer parametre, sayısal
  // eksiği) girdi hatasıdır — kayıt AÇILMADAN 400 döner. Uygunsuz sonuçlar
  // ise girdi hatası DEĞİL, laboratuvar bulgusudur: kayıt açılır, karar RET olur.
  if (degerlendirme.engeller.length) {
    return NextResponse.json(
      { hata: degerlendirme.engeller.join(" · "), alan: "satirlar" },
      { status: 400 }
    );
  }

  const db = await getDb();
  await ensureEkTablolar();

  const mevcut = await db.prepare("SELECT statu FROM hammadde WHERE lot = ?").get(lot);
  if (!mevcut) {
    return NextResponse.json({ hata: "Lot bulunamadı.", alan: "lot" }, { status: 404 });
  }
  // KARAR BİR KEZ VERİLİR. Serbest bırakılmış bir lotun analizini yeniden
  // girip statüsünü değiştirmek, o lottan üretilmiş serilerin dayanağını
  // geriye dönük değiştirir — GMP'de kayıt geriye dönük düzeltilmez, sapma
  // açılır (SOP-KG-03).
  if (mevcut.statu !== "KARANTINA") {
    return NextResponse.json(
      {
        hata: `Bu lot için karar zaten verilmiş (${mevcut.statu}). Değişiklik gerekiyorsa sapma kaydı açın (SOP-KG-03).`,
      },
      { status: 409 }
    );
  }

  const { thc, cbd } = degerlendirme;
  const karar = hamMaddeKarari({ thc, cbd, onbirAnalizUygun: degerlendirme.onbirAnalizUygun });
  let acilanSapma: string | null = null;
  const uygunsuzNot = degerlendirme.uygunsuzlar.length
    ? `Uygunsuz parametreler: ${degerlendirme.uygunsuzlar.join(", ")}`
    : null;
  const ret_nedeni = [...karar.engeller, ...(uygunsuzNot ? [uygunsuzNot] : [])].join(" · ") || null;
  const yil = new Date().getFullYear();

  await db.transaction(async (calistir) => {
    await calistir(
      `UPDATE hammadde
          SET thc = ?, cbd = ?, analiz_rapor_no = ?, analiz_tarihi = ?, lab = ?,
              statu = ?, ret_nedeni = ?
        WHERE lot = ? AND statu = 'KARANTINA'`,
      thc, cbd, analiz_rapor_no, analiz_tarihi, lab, karar.statu, ret_nedeni, lot
    );

    for (const s of satirlar) {
      await calistir(
        `INSERT INTO analiz_sonuclari
           (lot, parametre, spesifikasyon, sonuc, sayisal_deger, birim, yontem,
            akredite, akredite_no, loq, uygun, aciklama, olusturan_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        lot, s.parametre, s.spesifikasyon, s.sonuc, s.sayisal_deger, s.birim, s.yontem,
        s.akredite === null ? null : s.akredite ? 1 : 0,
        s.akredite_no, s.loq, s.uygun ? 1 : 0, s.aciklama, k.id
      );
    }

    if (karar.statu === "RET") {
      const bn = await sayacArtirTx(calistir, `buts-${yil}`);
      await calistir(
        `INSERT INTO buts_kuyruk (kod, tip, ref, adet, detay) VALUES (?, 'RET', ?, 1, ?)`,
        kodButs(yil, bn),
        lot,
        JSON.stringify({ lot, thc, nedenler: karar.engeller, uygunsuzlar: degerlendirme.uygunsuzlar })
      );

      /**
       * RET KARARI OTOMATİK SAPMA AÇAR — SOP-KG-03.
       *
       * Reddedilen her lot zaten bir sapmadır; kök neden araştırması ve CAPA
       * gerektirir. Sapmayı kullanıcının açmasını beklemek, en çok unutulan
       * adımı en kritik anda insana bırakmak demekti.
       */
      const sn = await sayacArtirTx(calistir, `sapma-${yil}`);
      const sapmaKod = kodSapma(yil, sn);
      await calistir(
        `INSERT INTO sapmalar (kod, kaynak_tip, kaynak_kod, konu, aciklama, otomatik, acan_id)
         VALUES (?, 'HAMMADDE', ?, ?, ?, 1, ?)`,
        sapmaKod,
        lot,
        `Ham madde reddi — ${lot}`,
        `Analiz raporu ${analiz_rapor_no}. Uygunsuzluklar: ${ret_nedeni}. ` +
          `Reddedilen materyalin imhası SOP-ÜR-15 kapsamında yapılmalıdır.`,
        k.id
      );
      acilanSapma = sapmaKod;
    }
  });

  await logla(
    k.id,
    karar.statu === "RET" ? "Ham madde REDDEDİLDİ" : "Ham madde SERBEST bırakıldı",
    lot,
    ret_nedeni ?? `THC %${thc} · CBD %${cbd} · ${satirlar.length} parametre girildi`
  );

  return NextResponse.json({
    tamam: true,
    statu: karar.statu,
    engeller: [...karar.engeller, ...degerlendirme.uygunsuzlar.map((x) => `${x}: spesifikasyon dışı`)],
    sapma: acilanSapma,
  });
});
