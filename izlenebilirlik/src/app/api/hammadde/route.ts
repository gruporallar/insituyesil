import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx, trBugun } from "@/lib/db";
import { korumali, okuma } from "@/lib/api";
import { kodHamMadde, kodButs } from "@/lib/kod";
import { govde, metin, metinOpsiyonel, sayi, sayiOpsiyonel, tarih } from "@/lib/dogrula";

export const GET = okuma("hammadde", async () => {
  const db = await getDb();
  const kayitlar = await db
    .prepare(
      `SELECT h.*, c.ad AS ciftci_ad, c.il AS ciftci_il, c.izin_no
         FROM hammadde h
         LEFT JOIN ciftciler c ON c.kod = h.ciftci_kod
        ORDER BY h.lot DESC`
    )
    .all();
  return NextResponse.json({ kayitlar });
});

/** Ham madde kabulü — Ek-13 adım 1. Her teslimat KARANTİNA ile açılır. */
export const POST = korumali({ ekran: "hammadde", eylem: "hammadde_kabul" }, async (req, k) => {
  const b = await govde(req);

  const ciftci_kod = metin(b.ciftci_kod, "Çiftçi", 20);
  const teslim_tarihi = tarih(b.teslim_tarihi, "Teslim tarihi");
  const miktar_kg = sayi(b.miktar_kg, "Miktar", { min: 0.1, max: 100000, sifirOlabilir: false });
  const hasat_yili = sayiOpsiyonel(b.hasat_yili, "Hasat yılı", { min: 2000, max: 2100 });
  const nem = sayiOpsiyonel(b.nem, "Nem", { min: 0, max: 100 });
  const irsaliye = metinOpsiyonel(b.irsaliye, "İrsaliye no", 60);

  // GELECEK TARİHLİ TESLİMAT KABUL EDİLMEZ. Henüz gelmemiş bir malın kaydını
  // açmak, kütle denkliğini ve stok sayımını bozar.
  if (teslim_tarihi > trBugun()) {
    return NextResponse.json({ hata: "Teslim tarihi gelecekte olamaz.", alan: "teslim_tarihi" }, { status: 400 });
  }

  const db = await getDb();
  const ciftci = await db.prepare("SELECT ad FROM ciftciler WHERE kod = ?").get(ciftci_kod);
  if (!ciftci) {
    return NextResponse.json({ hata: "Seçilen çiftçi bulunamadı.", alan: "ciftci_kod" }, { status: 400 });
  }

  const yil = new Date().getFullYear();
  const { lot } = await db.transaction(async (calistir) => {
    const n = await sayacArtirTx(calistir, `hammadde-${yil}`);
    const lot = kodHamMadde(yil, n);
    await calistir(
      `INSERT INTO hammadde (lot, ciftci_kod, teslim_tarihi, miktar_kg, kalan_kg,
                             hasat_yili, nem, irsaliye, statu, olusturan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'KARANTINA', ?)`,
      lot, ciftci_kod, teslim_tarihi, miktar_kg, miktar_kg, hasat_yili, nem, irsaliye, k.id
    );

    // BÜTS ham madde giriş bildirimi — SOP-ÜR-16 md. 2.
    const bn = await sayacArtirTx(calistir, `buts-${yil}`);
    await calistir(
      `INSERT INTO buts_kuyruk (kod, tip, ref, adet, detay) VALUES (?, 'URETIM_GIRDI', ?, 1, ?)`,
      kodButs(yil, bn),
      lot,
      JSON.stringify({ lot, ciftci_kod, miktar_kg, teslim_tarihi })
    );

    return { lot };
  });

  await logla(k.id, "Ham madde kabul edildi — KARANTİNA", lot, `${miktar_kg} kg · ${ciftci.ad}`);
  return NextResponse.json({ tamam: true, lot }, { status: 201 });
});
