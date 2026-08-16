import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx } from "@/lib/db";
import { korumali, kullaniciHatasi, okuma } from "@/lib/api";
import { kodSeri } from "@/lib/kod";
import { bicimSayi } from "@/lib/kabul";
import { govde, metin, sayi, secim, tarih } from "@/lib/dogrula";
import type { UrunTipi } from "@/lib/types";

export const GET = okuma("uretim", async () => {
  const db = await getDb();
  const [seriler, girdiler] = await Promise.all([
    db.prepare("SELECT * FROM seriler ORDER BY seri DESC").all(),
    db
      .prepare(
        `SELECT sg.seri, sg.lot, sg.kg, h.thc, c.ad AS ciftci_ad
           FROM seri_girdileri sg
           LEFT JOIN hammadde h ON h.lot = sg.lot
           LEFT JOIN ciftciler c ON c.kod = h.ciftci_kod`
      )
      .all(),
  ]);
  return NextResponse.json({ seriler, girdiler });
});

/**
 * Üretim serisi açma — Ek-13 adım 3–10.
 *
 * Ham madde TÜKETİLİYOR: seçilen lotların `kalan_kg` değeri düşülüyor. Bu
 * işlem ile seri kaydının aynı transaction'da olması şart — yarım kalırsa ya
 * hammadde düşülüp seri açılmamış (malzeme kaybolmuş görünür) ya da seri
 * açılıp hammadde düşülmemiş (aynı kilo iki kez kullanılabilir) olurdu.
 */
export const POST = korumali({ ekran: "uretim", eylem: "seri_ac" }, async (req, k) => {
  const b = await govde(req);

  const urun_tipi = secim<UrunTipi>(b.urun_tipi, "Ürün tipi", ["DISTILAT", "IZOLAT"]);
  const uretim_tarihi = tarih(b.uretim_tarihi, "Üretim tarihi");
  const sorumlu = metin(b.sorumlu, "Üretim sorumlusu", 120);

  const hamGirdiler = Array.isArray(b.girdiler) ? b.girdiler : [];
  if (!hamGirdiler.length) {
    return NextResponse.json(
      { hata: "En az bir ham madde lotundan miktar girin.", alan: "girdiler" },
      { status: 400 }
    );
  }

  const girdiler = hamGirdiler.map((g: any, i: number) => ({
    lot: metin(g?.lot, `Girdi ${i + 1} lot`, 40),
    kg: sayi(g?.kg, `Girdi ${i + 1} miktarı`, { min: 0.001, max: 100000, sifirOlabilir: false }),
  }));

  // AYNI LOT İKİ KEZ SEÇİLEMEZ. `seri_girdileri` UNIQUE(seri, lot) kısıtı bunu
  // zaten reddeder ama oradan gelen hata kullanıcıya bir şey anlatmaz.
  const lotlar = girdiler.map((g) => g.lot);
  if (new Set(lotlar).size !== lotlar.length) {
    return NextResponse.json(
      { hata: "Aynı ham madde lotu birden fazla kez seçilmiş.", alan: "girdiler" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const yil = new Date().getFullYear();

  const sonuc = await db.transaction(async (calistir) => {
    // Lotları transaction İÇİNDE okuyoruz. Dışarıda okuyup burada yazmak,
    // iki eşzamanlı serinin aynı kiloyu iki kez kullanmasına izin verirdi.
    for (const g of girdiler) {
      const r = await calistir("SELECT statu, kalan_kg FROM hammadde WHERE lot = ?", g.lot);
      const h = r.rows?.[0];
      if (!h) kullaniciHatasi(`${g.lot} lotu bulunamadı.`);
      if (h.statu !== "SERBEST") {
        kullaniciHatasi(
          `${g.lot} lotu ${h.statu} statüsünde — yalnızca SERBEST lot üretime girebilir.`
        );
      }
      // Kayan nokta toleransı: 25 kg'lık bir lottan 25 kg almak
      // 24,999999999 karşılaştırmasına takılmasın.
      if (g.kg > Number(h.kalan_kg) + 1e-9) {
        kullaniciHatasi(
          `${g.lot} lotunda ${bicimSayi(Number(h.kalan_kg), 3)} kg kaldı, ` +
            `${bicimSayi(g.kg, 3)} kg istendi.`
        );
      }
    }

    const n = await sayacArtirTx(calistir, `seri-${yil}`);
    const seri = kodSeri(urun_tipi, yil, n);
    const girdiToplam = girdiler.reduce((t, g) => t + g.kg, 0);

    await calistir(
      `INSERT INTO seriler (seri, urun_tipi, uretim_tarihi, sorumlu, girdi_kg, statu, olusturan_id)
       VALUES (?, ?, ?, ?, ?, 'KARANTINA', ?)`,
      seri, urun_tipi, uretim_tarihi, sorumlu, girdiToplam, k.id
    );

    for (const g of girdiler) {
      await calistir("INSERT INTO seri_girdileri (seri, lot, kg) VALUES (?, ?, ?)", seri, g.lot, g.kg);
      await calistir(
        "UPDATE hammadde SET kalan_kg = ROUND(kalan_kg - ?, 4) WHERE lot = ?",
        g.kg,
        g.lot
      );
    }

    return { seri, girdiToplam };
  });

  await logla(k.id, "Üretim serisi açıldı", sonuc.seri, `${sonuc.girdiToplam} kg girdi`);
  return NextResponse.json({ tamam: true, ...sonuc }, { status: 201 });
});
