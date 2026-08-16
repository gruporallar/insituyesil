import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx, trBugun, ensureEkTablolar } from "@/lib/db";
import { korumali, kullaniciHatasi, okuma } from "@/lib/api";
import { kodSapma } from "@/lib/kod";
import { adimBul, prosesKarari } from "@/lib/proses";
import { govde, metin, tarih } from "@/lib/dogrula";

/**
 * PROSES İÇİ KONTROL KAYITLARI — Ek-13 kritik kontrol noktaları.
 *
 * Sistem yalnızca serinin nihai sonucunu tutuyordu; ekstraksiyon basıncı,
 * vinterizasyon sıcaklığı gibi kritik kontrol noktaları hiçbir yerde yoktu
 * (bulgu B-04). Kâğıtta tutuluyorlarsa sistemdeki kayıtla aralarında bağ yoktu.
 */

export const GET = okuma("uretim", async (req) => {
  await ensureEkTablolar();
  const { searchParams } = new URL(req.url);
  const seri = searchParams.get("seri");
  const db = await getDb();

  const kayitlar = await db
    .prepare(
      `SELECT p.*, k.ad_soyad AS olusturan_ad
         FROM proses_kayitlari p
         LEFT JOIN kullanicilar k ON k.id = p.olusturan_id
        ${seri ? "WHERE p.seri = ?" : ""}
        ORDER BY p.seri DESC, p.adim_kod, p.id`
    )
    .all(...(seri ? [seri] : []));

  return NextResponse.json({ kayitlar });
});

export const POST = korumali({ ekran: "uretim", eylem: "proses_yaz" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const seri = metin(b.seri, "Seri", 40);
  const adim_kod = metin(b.adim_kod, "Proses adımı", 20);
  const operator = metin(b.operator, "Operatör", 120);
  const t = tarih(b.tarih, "Kayıt tarihi");
  const olcumler = (b.olcumler ?? {}) as Record<string, unknown>;

  const adim = adimBul(adim_kod);
  if (!adim) {
    return NextResponse.json({ hata: "Tanımsız proses adımı.", alan: "adim_kod" }, { status: 400 });
  }
  if (t > trBugun()) {
    return NextResponse.json({ hata: "Kayıt tarihi gelecekte olamaz.", alan: "tarih" }, { status: 400 });
  }

  const karar = prosesKarari(adim, olcumler);
  const yil = new Date().getFullYear();
  const db = await getDb();

  const sonuc = await db.transaction(async (calistir) => {
    const r = await calistir("SELECT statu, urun_tipi FROM seriler WHERE seri = ?", seri);
    const s = r.rows?.[0];
    if (!s) kullaniciHatasi("Seri bulunamadı.");

    // KARAR VERİLMİŞ SERİYE PROSES KAYDI EKLENEMEZ. Serbest bırakma kararı
    // o anki kayıtlara dayanıyor; sonradan kayıt eklemek kararın dayanağını
    // geriye dönük değiştirir (SOP-KG-03: kayıt geriye dönük düzeltilmez).
    if (s.statu !== "KARANTINA") {
      kullaniciHatasi(
        `Bu seri için karar zaten verilmiş (${s.statu}). Proses kaydı eklenemez; ` +
          `düzeltme gerekiyorsa sapma kaydı açın (SOP-KG-03).`
      );
    }
    if (adim.urunTipi && adim.urunTipi !== s.urun_tipi) {
      kullaniciHatasi(`${adim.ad} adımı yalnızca ${adim.urunTipi === "IZOLAT" ? "izolat" : "distilat"} üretiminde uygulanır.`);
    }

    let sapmaKod: string | null = null;

    /**
     * SPESİFİKASYON DIŞI ÖLÇÜM KAYDI ENGELLEMEZ, SAPMA AÇAR.
     *
     * Kayıt reddedilseydi operatör gerçek değeri gizlemeye ya da hiç
     * kaydetmemeye itilirdi — GMP'de en tehlikeli sonuç budur. Değer olduğu
     * gibi kaydediliyor, `uygun = 0` işaretleniyor ve açılan sapma serbest
     * bırakmayı kendiliğinden engelliyor.
     */
    if (!karar.uygun) {
      const sn = await sayacArtirTx(calistir, `sapma-${yil}`);
      sapmaKod = kodSapma(yil, sn);
      await calistir(
        `INSERT INTO sapmalar (kod, kaynak_tip, kaynak_kod, konu, aciklama, otomatik, acan_id)
         VALUES (?, 'SERI', ?, ?, ?, 1, ?)`,
        sapmaKod,
        seri,
        `Proses içi kontrol uygunsuzluğu — ${adim.ad}`,
        `${adim.sop} / ${adim.form}. Uygunsuzluklar: ${karar.engeller.join(" · ")}`,
        k.id
      );
    }

    const ins = await calistir(
      `INSERT INTO proses_kayitlari
         (seri, adim_kod, olcumler, uygun, engeller, operator, tarih, sapma_kod, olusturan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      seri, adim_kod, JSON.stringify(olcumler), karar.uygun ? 1 : 0,
      karar.engeller.length ? JSON.stringify(karar.engeller) : null,
      operator, t, sapmaKod, k.id
    );

    return { id: ins.lastInsertRowid, sapmaKod };
  });

  await logla(
    k.id,
    karar.uygun
      ? `Proses kaydı — ${adim.ad}`
      : `Proses kaydı UYGUNSUZ — ${adim.ad} (${karar.engeller.length} uygunsuzluk)`,
    seri,
    karar.engeller.join(" · ") || `${adim.sop} · operatör ${operator}`
  );

  return NextResponse.json(
    { tamam: true, uygun: karar.uygun, engeller: karar.engeller, sapma: sonuc.sapmaKod },
    { status: 201 }
  );
});
