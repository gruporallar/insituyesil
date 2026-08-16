import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx } from "@/lib/db";
import { korumali, okuma } from "@/lib/api";
import { kodCiftci } from "@/lib/kod";
import { govde, metin, metinOpsiyonel, sayiOpsiyonel, tcVkn } from "@/lib/dogrula";

export const GET = okuma("ciftci", async () => {
  const db = await getDb();
  const kayitlar = await db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM hammadde h WHERE h.ciftci_kod = c.kod) AS teslimat_sayisi,
              (SELECT COALESCE(SUM(h.miktar_kg), 0) FROM hammadde h WHERE h.ciftci_kod = c.kod) AS toplam_kg
         FROM ciftciler c
        ORDER BY c.kod`
    )
    .all();
  return NextResponse.json({ kayitlar });
});

export const POST = korumali({ ekran: "ciftci", eylem: "ciftci_yaz" }, async (req, k) => {
  const b = await govde(req);

  const veri = {
    ad: metin(b.ad, "Ad / Ünvan", 160),
    tc_vkn: tcVkn(b.tc_vkn),
    cks_no: metinOpsiyonel(b.cks_no, "ÇKS No", 40),
    izin_no: metin(b.izin_no, "Kenevir ekim izin no", 60),
    il: metin(b.il, "İl", 40),
    ilce: metinOpsiyonel(b.ilce, "İlçe", 40),
    parsel: metinOpsiyonel(b.parsel, "Parsel", 60),
    alan_dekar: sayiOpsiyonel(b.alan_dekar, "Ekim alanı", { min: 0, max: 100000 }),
    tel: metinOpsiyonel(b.tel, "Telefon", 30),
  };

  const db = await getDb();
  // Sayaç ve kayıt AYNI transaction'da: işlem başarısız olursa numara da geri
  // alınır, kod dizisinde boşluk kalmaz.
  const kod = await db.transaction(async (calistir) => {
    const n = await sayacArtirTx(calistir, "ciftci");
    const kod = kodCiftci(n);
    await calistir(
      `INSERT INTO ciftciler (kod, ad, tc_vkn, cks_no, izin_no, il, ilce, parsel, alan_dekar, tel, olusturan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      kod,
      veri.ad,
      veri.tc_vkn,
      veri.cks_no,
      veri.izin_no,
      veri.il,
      veri.ilce,
      veri.parsel,
      veri.alan_dekar,
      veri.tel,
      k.id
    );
    return kod;
  });

  await logla(k.id, "Çiftçi kaydı açıldı", kod, veri.ad);
  return NextResponse.json({ tamam: true, kod }, { status: 201 });
});
