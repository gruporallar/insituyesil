import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx, trBugun, ensureEkTablolar } from "@/lib/db";
import { korumali, okuma, kullaniciHatasi } from "@/lib/api";
import { elektronikImza } from "@/lib/eimza";
import { kodSapma } from "@/lib/kod";
import { govde, metin, metinOpsiyonel, secim, tarih, tarihOpsiyonel } from "@/lib/dogrula";

const KAYNAK_TIPLERI = ["HAMMADDE", "SERI", "DIGER"] as const;

/**
 * SAPMA ve CAPA — SOP-KG-03.
 *
 * Bu modül olmadan seri serbest bırakmadaki "açık sapma var mı?" sorusu
 * kullanıcının beyanıydı ve doğruluğu hiçbir yere bağlı değildi (bulgu B-03).
 * Artık kayıt tutuluyor ve serbest bırakma o kayda bakıyor.
 */

export const GET = okuma("sapma", async (req) => {
  await ensureEkTablolar();
  const { searchParams } = new URL(req.url);
  const durum = searchParams.get("durum");
  const db = await getDb();

  const kayitlar = await db
    .prepare(
      `SELECT s.*, a.ad_soyad AS acan_ad, k.ad_soyad AS kapatan_ad
         FROM sapmalar s
         LEFT JOIN kullanicilar a ON a.id = s.acan_id
         LEFT JOIN kullanicilar k ON k.id = s.kapatan_id
        ${durum === "ACIK" || durum === "KAPALI" ? "WHERE s.durum = ?" : ""}
        ORDER BY s.durum = 'KAPALI', s.kod DESC`
    )
    .all(...(durum === "ACIK" || durum === "KAPALI" ? [durum] : []));

  const ozet = await db
    .prepare(
      `SELECT COUNT(CASE WHEN durum = 'ACIK' THEN 1 END) AS acik,
              COUNT(CASE WHEN durum = 'KAPALI' THEN 1 END) AS kapali,
              COUNT(CASE WHEN durum = 'ACIK' AND termin IS NOT NULL AND termin < date('now','+3 hours') THEN 1 END) AS gecikmis
         FROM sapmalar`
    )
    .get();

  return NextResponse.json({ kayitlar, ozet });
});

export const POST = korumali({ ekran: "sapma", eylem: "sapma_ac" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const kaynak_tip = secim(b.kaynak_tip, "Kaynak tipi", KAYNAK_TIPLERI);
  const kaynak_kod = metinOpsiyonel(b.kaynak_kod, "Kaynak kaydı", 60);
  const konu = metin(b.konu, "Konu", 200);
  const aciklama = metinOpsiyonel(b.aciklama, "Açıklama", 2000);
  const sorumlu = metinOpsiyonel(b.sorumlu, "Sorumlu", 120);
  const termin = tarihOpsiyonel(b.termin, "Termin");

  // HAMMADDE/SERI seçildiyse kod ZORUNLU. Kaynağı olmayan bir sapma, serbest
  // bırakma kontrolünde hiçbir seriyi engellemez — sessizce etkisiz kalırdı.
  if (kaynak_tip !== "DIGER" && !kaynak_kod) {
    return NextResponse.json(
      { hata: "Kaynak tipi ham madde veya seri seçildiğinde ilgili kayıt kodu zorunlu.", alan: "kaynak_kod" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const yil = new Date().getFullYear();

  const kod = await db.transaction(async (calistir) => {
    const n = await sayacArtirTx(calistir, `sapma-${yil}`);
    const kod = kodSapma(yil, n);
    await calistir(
      `INSERT INTO sapmalar (kod, kaynak_tip, kaynak_kod, konu, aciklama, sorumlu, termin, otomatik, acan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      kod, kaynak_tip, kaynak_kod, konu, aciklama, sorumlu, termin, k.id
    );
    return kod;
  });

  await logla(k.id, "Sapma kaydı açıldı", kod, `${kaynak_kod ?? kaynak_tip} — ${konu}`);
  return NextResponse.json({ tamam: true, kod }, { status: 201 });
});

/**
 * Sapma; ilk aksiyon, risk, kök neden, CAPA ve etkinlik kanıtı tamamlandıktan
 * sonra elektronik imzayla kapatılır. Yalnızca plan yazmak CAPA'nın
 * uygulandığını ve işe yaradığını göstermez.
 */
export const PATCH = korumali({ ekran: "sapma", eylem: "sapma_kapat" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const kod = metin(b.kod, "Sapma kodu", 40);
  const ilk_aksiyon = metin(b.ilk_aksiyon, "İlk düzeltme / kontrol altına alma", 2000);
  const risk_degerlendirme = metin(b.risk_degerlendirme, "Risk değerlendirmesi", 2000);
  const kok_neden = metin(b.kok_neden, "Kök neden", 2000);
  const capa = metin(b.capa, "Düzeltici / önleyici faaliyet (CAPA)", 2000);
  const capa_sorumlu = metin(b.capa_sorumlu, "CAPA sorumlusu", 120);
  const capa_termin = tarih(b.capa_termin, "CAPA termin tarihi");
  const etkinlik_kriteri = metin(b.etkinlik_kriteri, "Etkinlik kriteri", 1000);
  const etkinlik_tarihi = tarih(b.etkinlik_tarihi, "Etkinlik kontrol tarihi");
  const etkinlik_sonucu = metin(b.etkinlik_sonucu, "Etkinlik kontrol sonucu", 2000);

  if (etkinlik_tarihi > trBugun()) {
    kullaniciHatasi("Etkinlik kontrol tarihi gelecekte olamaz.");
  }

  const db = await getDb();
  const mevcut = await db.prepare("SELECT durum, kaynak_kod FROM sapmalar WHERE kod = ?").get(kod);
  if (!mevcut) return NextResponse.json({ hata: "Sapma kaydı bulunamadı." }, { status: 404 });
  if (mevcut.durum === "KAPALI") {
    return NextResponse.json({ hata: "Bu sapma zaten kapatılmış." }, { status: 409 });
  }

  await elektronikImza({
    k,
    sifre: b.sifre,
    eylem: "sapma_kapat",
    kayit: kod,
    anlam: "Sapma ve CAPA etkinlik değerlendirmesi kapatma onayı",
  });

  const kapanis = new Date().toISOString().slice(0, 19).replace("T", " ");
  const sonuc = await db
    .prepare(
      `UPDATE sapmalar
          SET ilk_aksiyon = ?, risk_degerlendirme = ?, kok_neden = ?, capa = ?,
              capa_sorumlu = ?, capa_termin = ?, etkinlik_kriteri = ?,
              etkinlik_tarihi = ?, etkinlik_sonucu = ?, etkinlik_dogrulayan_id = ?,
              durum = 'KAPALI', kapatan_id = ?, kapanis_tarihi = ?
        WHERE kod = ? AND durum = 'ACIK'`
    )
    .run(
      ilk_aksiyon, risk_degerlendirme, kok_neden, capa,
      capa_sorumlu, capa_termin, etkinlik_kriteri,
      etkinlik_tarihi, etkinlik_sonucu, k.id,
      k.id, kapanis, kod
    );

  if (sonuc.changes === 0) {
    return NextResponse.json(
      { hata: "Sapma başka bir işlemde kapatılmış. Listeyi yenileyip tekrar kontrol edin." },
      { status: 409 }
    );
  }

  await logla(
    k.id,
    "Sapma kapatıldı — CAPA etkinliği doğrulandı",
    kod,
    `${capa_sorumlu} · etkinlik ${etkinlik_tarihi} · ${etkinlik_sonucu.slice(0, 80)}`
  );
  return NextResponse.json({ tamam: true });
});
