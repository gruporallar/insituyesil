import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx, ensureEkTablolar, trBugun } from "@/lib/db";
import { korumali } from "@/lib/api";
import { kodBaski } from "@/lib/kod";
import { govde, metin, metinOpsiyonel, secim } from "@/lib/dogrula";
import { sablonBul } from "@/lib/formSablon";

/**
 * GÖREV YAŞAM DÖNGÜSÜ — açıldı → basıldı → teslim → arşiv.
 *
 * Sistem sahada YAZILAN VERİYİ tutmuyor; yalnızca işin hangi aşamada
 * olduğunu izliyor. Bu sınır bilinçli ve elektronik imza / tam validasyon
 * yükünü kaldıran şey tam olarak bu.
 *
 * AŞAMA ATLANAMAZ. "Arşiv" doğrudan işaretlenemiyor: imzalı bir kâğıdın
 * arşive girebilmesi için önce basılmış olması gerekir. Sıra serbest
 * bırakılsaydı, hiç basılmamış bir form "arşivlendi" görünür ve D-21
 * (dolaşımdaki kayıp form) kontrolü anlamsızlaşırdı.
 */
const SONRAKI: Record<string, string[]> = {
  ACIK: ["BASILDI", "IPTAL"],
  BASILDI: ["TESLIM", "ARSIV", "IPTAL"],
  TESLIM: ["ARSIV", "IPTAL"],
  ARSIV: [],
  IPTAL: [],
};

/**
 * YENİDEN BASIM aşama geçişi DEĞİL, aynı aşamada ikinci nüshadır.
 *
 * Durum makinesine tabi tutulunca (BASILDI → BASILDI geçersiz) gerekçeli
 * yeniden basım imkânsız hâle geliyordu — oysa baskı kütüğünün var oluş
 * sebebi tam olarak ikinci nüshanın hesabını sormak.
 *
 * ARŞİV ve İPTAL DIŞARIDA: imzalı kaydı arşive girmiş bir görev için yeni
 * boş nüsha basmak, doldurulup asıl kayıtla değiştirilebilecek bir belge
 * üretir. Gerekiyorsa yolu sapma kaydıdır, yeniden basım değil.
 */
const YENIDEN_BASILABILIR = ["ACIK", "BASILDI", "TESLIM"];

export const POST = korumali({ ekran: "gorev", eylem: "gorev_islem" }, async (req, k) => {
  const b = await govde(req);
  const kod = metin(b.kod, "Görev kodu", 30);
  const islem = secim(b.islem, "İşlem", ["BAS", "TESLIM", "ARSIV", "IPTAL"] as const);

  await ensureEkTablolar();
  const db = await getDb();

  const g = (await db
    .prepare(
      `SELECT g.kod, g.durum, g.vade, g.donem, k.form_kod, k.faaliyet
         FROM gorevler g JOIN gorev_kurallari k ON k.kod = g.kural_kod
        WHERE g.kod = ?`
    )
    .get(kod)) as any;
  if (!g) return NextResponse.json({ hata: "Görev bulunamadı.", alan: "kod" }, { status: 404 });

  if (islem === "BAS") {
    if (!YENIDEN_BASILABILIR.includes(String(g.durum))) {
      return NextResponse.json(
        {
          hata:
            `Bu görev "${g.durum}" aşamasında; form basılamaz. İmzalı kaydı arşive girmiş ` +
            `bir görev için yeni boş nüsha basmak, asıl kayıtla değiştirilebilecek bir belge üretir.`,
        },
        { status: 409 }
      );
    }
  } else if (!SONRAKI[String(g.durum)]?.includes(islem)) {
    return NextResponse.json(
      {
        hata:
          `Bu görev "${g.durum}" aşamasında; "${islem}" işlemi yapılamaz. ` +
          `GMP'de aşama atlanmaz — form basılmadan arşive giremez.`,
      },
      { status: 409 }
    );
  }

  const bugun = trBugun();
  const zaman = new Date().toISOString().slice(0, 19).replace("T", " ");

  // ── Baskı ────────────────────────────────────────────────────────────────
  if (islem === "BAS") {
    const sablon = sablonBul(g.form_kod);
    // YENİDEN BASIM GEREKÇE İSTER. Bir görev için ikinci nüsha, ilkinin
    // akıbetinin sorulmasını gerektirir: kayboldu mu, zarar mı gördü, yanlış
    // mı dolduruldu? Gerekçesiz ikinci nüsha, kaç kâğıdın dolaştığını
    // bilinmez kılar.
    const oncekiler = Number(
      (await db.prepare("SELECT COUNT(*) AS a FROM form_baskilari WHERE gorev_kod = ?").get(kod))?.a ?? 0
    );
    const yeniden = oncekiler > 0;
    const gerekce = yeniden
      ? metin(b.gerekce, "Yeniden basım gerekçesi", 300)
      : metinOpsiyonel(b.gerekce, "Gerekçe", 300);

    const yil = Number(bugun.slice(0, 4));
    let seriNo = "";
    await db.transaction(async (calistir) => {
      const n = await sayacArtirTx(calistir, `baski-${yil}`);
      seriNo = kodBaski(yil, n);
      await calistir(
        `INSERT INTO form_baskilari
           (seri_no, gorev_kod, form_kod, form_versiyon, yeniden_basim, gerekce, basan_id, basan_ad)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        seriNo, kod, sablon.kod, sablon.versiyon, yeniden ? 1 : 0, gerekce, k.id, k.ad_soyad
      );
      // İlk baskı görevi ilerletir; yeniden basım aşamayı geri almaz.
      if (!yeniden) {
        await calistir(
          `UPDATE gorevler SET durum = 'BASILDI', basim_tarihi = ?, islem_yapan_id = ?
            WHERE kod = ? AND durum = 'ACIK'`,
          zaman, k.id, kod
        );
      }
    });

    await logla(
      k.id,
      yeniden ? "Form YENİDEN basıldı" : "Görev formu basıldı",
      kod,
      `${sablon.kod} v${sablon.versiyon} · seri ${seriNo}${gerekce ? ` · gerekçe: ${gerekce}` : ""}`
    );
    return NextResponse.json({ tamam: true, seriNo, yeniden, formKod: sablon.kod });
  }

  // ── Teslim / arşiv / iptal ───────────────────────────────────────────────
  if (islem === "TESLIM") {
    const alan = metin(b.teslim_alan, "Teslim alan", 120);
    await db
      .prepare("UPDATE gorevler SET durum = 'TESLIM', teslim_tarihi = ?, teslim_alan = ?, islem_yapan_id = ? WHERE kod = ?")
      .run(zaman, alan, k.id, kod);
    await logla(k.id, "Görev formu sahaya teslim edildi", kod, `Teslim alan: ${alan}`);
    return NextResponse.json({ tamam: true });
  }

  if (islem === "ARSIV") {
    // ARŞİV YERİ ZORUNLU. "Arşivlendi" demek yetmez; denetimde soru
    // "nerede" olur ve cevabı kayıtta olmalı.
    const yer = metin(b.arsiv_yeri, "Arşiv yeri", 120);
    await db
      .prepare("UPDATE gorevler SET durum = 'ARSIV', arsiv_tarih = ?, arsiv_yeri = ?, islem_yapan_id = ? WHERE kod = ?")
      .run(bugun, yer, k.id, kod);
    await logla(k.id, "İmzalı görev kaydı arşivlendi", kod, `${g.faaliyet} · yer: ${yer}`);
    return NextResponse.json({ tamam: true });
  }

  // IPTAL — gerekçe zorunlu; görev silinmiyor, iz kalıyor.
  const gerekce = metin(b.gerekce, "İptal gerekçesi", 300);
  await db
    .prepare("UPDATE gorevler SET durum = 'IPTAL', iptal_gerekce = ?, islem_yapan_id = ? WHERE kod = ?")
    .run(gerekce, k.id, kod);
  await logla(k.id, "Görev iptal edildi", kod, gerekce);
  return NextResponse.json({ tamam: true });
});
