import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx, trBugun } from "@/lib/db";
import { korumali, kullaniciHatasi, okuma } from "@/lib/api";
import { kodTekil, kodButs } from "@/lib/kod";
import { GTIN, karekodUret } from "@/lib/karekod";
import { govde, metin, sayi, tamsayi, tarih } from "@/lib/dogrula";
import { bicimSayi } from "@/lib/kabul";
import type { UrunTipi } from "@/lib/types";

export const GET = okuma("ambalaj", async (req) => {
  const { searchParams } = new URL(req.url);
  const seri = searchParams.get("seri");
  const db = await getDb();

  const kayitlar = await db
    .prepare(
      seri
        ? `SELECT p.*, s.urun_tipi FROM paketler p JOIN seriler s ON s.seri = p.seri
            WHERE p.seri = ? ORDER BY p.tekil`
        : `SELECT p.*, s.urun_tipi FROM paketler p JOIN seriler s ON s.seri = p.seri
            ORDER BY p.olusturma_tarihi DESC, p.tekil LIMIT 500`
    )
    .all(...(seri ? [seri] : []));

  return NextResponse.json({ kayitlar });
});

/**
 * Ambalajlama ve tekil karekod üretimi — Ek-13 adım 12, SOP-ÜR-12.
 *
 * TEK TRANSACTION: N paket satırı + serinin `ambalajlanan_g` güncellemesi. Yarım
 * kalırsa etiket mutabakatı (FRM-ÜR-12, FARK = 0 şartı) tutmaz.
 */
export const POST = korumali({ ekran: "ambalaj", eylem: "ambalajla" }, async (req, k) => {
  const b = await govde(req);

  const seri = metin(b.seri, "Seri", 40);
  const adet = tamsayi(b.adet, "Ambalaj adedi", { min: 1, max: 500 });
  const miktar_g = sayi(b.miktar_g, "Birim dolum", { min: 0.01, max: 100000, sifirOlabilir: false });
  const skt = tarih(b.skt, "Son kullanma tarihi");

  // GEÇMİŞ TARİHLİ SKT İLE ÜRETİM YAPILMAZ. Basıldığı anda süresi dolmuş bir
  // etiket, sevkiyatta topluca reddedilecek stok üretir.
  if (skt <= trBugun()) {
    return NextResponse.json(
      { hata: "Son kullanma tarihi bugünden ileri olmalı.", alan: "skt" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const yil = new Date().getFullYear();

  const sonuc = await db.transaction(async (calistir) => {
    const r = await calistir(
      "SELECT urun_tipi, statu, cikti_kg, ambalajlanan_g FROM seriler WHERE seri = ?",
      seri
    );
    const s = r.rows?.[0];
    if (!s) kullaniciHatasi("Seri bulunamadı.");
    if (s.statu !== "SERBEST") {
      kullaniciHatasi(
        `Seri ${s.statu} statüsünde — yalnızca SERBEST seri ambalajlanabilir (Ek-13 adım 12).`
      );
    }

    const gerekenG = adet * miktar_g;
    const kalanG = Number(s.cikti_kg) * 1000 - Number(s.ambalajlanan_g);
    if (gerekenG > kalanG + 1e-6) {
      kullaniciHatasi(
        `Yetersiz ürün. Seride ${bicimSayi(kalanG / 1000, 3)} kg kaldı, ` +
          `${bicimSayi(gerekenG / 1000, 3)} kg talep edildi.`
      );
    }

    const urun_tipi = s.urun_tipi as UrunTipi;
    const uretilen: { uid: string; tekil: string }[] = [];

    for (let i = 0; i < adet; i++) {
      const n = await sayacArtirTx(calistir, "paket");
      const tekil = kodTekil(n);
      // karekodUret geçersiz GTIN veya ayırıcı içeren değerde HATA ATAR;
      // transaction geri alınır ve bozuk etiket hiç basılmaz.
      const uid = karekodUret({ gtin: GTIN[urun_tipi], tekil, skt, seri });

      await calistir(
        `INSERT INTO paketler (uid, tekil, seri, urun_tipi, miktar_g, skt, statu, konum, olusturan_id)
         VALUES (?, ?, ?, ?, ?, ?, 'SERBEST', 'Ürün Deposu (D3)', ?)`,
        uid, tekil, seri, urun_tipi, miktar_g, skt, k.id
      );
      uretilen.push({ uid, tekil });
    }

    await calistir(
      "UPDATE seriler SET ambalajlanan_g = ambalajlanan_g + ? WHERE seri = ?",
      gerekenG,
      seri
    );

    const bn = await sayacArtirTx(calistir, `buts-${yil}`);
    await calistir(
      `INSERT INTO buts_kuyruk (kod, tip, ref, adet, detay) VALUES (?, 'AMBALAJ', ?, ?, ?)`,
      kodButs(yil, bn),
      seri,
      adet,
      JSON.stringify({ seri, adet, birim_g: miktar_g, skt })
    );

    return { uretilen, adet };
  });

  await logla(k.id, `${adet} ambalaj birimi üretildi`, seri, `${miktar_g} g/birim · SKT ${skt}`);
  return NextResponse.json({ tamam: true, ...sonuc }, { status: 201 });
});
