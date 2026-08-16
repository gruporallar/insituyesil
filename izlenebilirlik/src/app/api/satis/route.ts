import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx, trBugun } from "@/lib/db";
import { korumali, kullaniciHatasi, okuma } from "@/lib/api";
import { kodSatis, kodButs, tcMaskele, tcGecerli } from "@/lib/kod";
import { karekodNormalize } from "@/lib/karekod";
import { govde, metin, metinOpsiyonel, tarih } from "@/lib/dogrula";

export const GET = okuma("satis", async () => {
  const db = await getDb();
  const kayitlar = await db
    .prepare(
      `SELECT s.*, a.ad AS eczane_ad, a.il AS eczane_il, p.seri, p.tekil
         FROM satislar s
         LEFT JOIN aliciar a ON a.kod = s.alici_kod
         LEFT JOIN paketler p ON p.uid = s.paket_uid
        ORDER BY s.kod DESC`
    )
    .all();
  return NextResponse.json({ kayitlar });
});

/**
 * Hastaya satış / teslim — zincirin son halkası.
 *
 * KVKK: açık TC KAYDEDİLMİYOR. Girişte algoritma ile doğrulanıyor (yanlış
 * girilen numara maskelendikten sonra düzeltilemez), sonra maskeleniyor ve
 * yalnızca maskeli hali saklanıyor. Eşleştirme anahtarı reçete numarası.
 */
export const POST = korumali({ ekran: "satis", eylem: "satis_yaz" }, async (req, k) => {
  const b = await govde(req);

  const alici_kod = metin(b.alici_kod, "Eczane", 20);
  const uid = karekodNormalize(metin(b.uid, "Karekod", 300));
  const t = tarih(b.tarih, "Satış tarihi");
  const hasta_ad = metin(b.hasta_ad, "Hasta adı", 80);
  const hastaTcHam = metin(b.hasta_tc, "Hasta TC", 20);
  const recete_no = metin(b.recete_no, "Reçete no", 60);
  const hekim = metinOpsiyonel(b.hekim, "Hekim", 120);

  if (!tcGecerli(hastaTcHam)) {
    return NextResponse.json(
      { hata: "TC kimlik numarası geçersiz. Lütfen kontrol edin.", alan: "hasta_tc" },
      { status: 400 }
    );
  }
  // Maskeleme BURADA, yazmadan önce. Açık değeri saklayıp gösterirken
  // maskelemek, KVKK açısından hiç maskelememekle aynı şey.
  const hasta_tc_maskeli = tcMaskele(hastaTcHam);

  if (t > trBugun()) {
    return NextResponse.json({ hata: "Satış tarihi gelecekte olamaz.", alan: "tarih" }, { status: 400 });
  }

  const db = await getDb();
  const eczane = await db.prepare("SELECT ad, gln, tip FROM aliciar WHERE kod = ?").get(alici_kod);
  if (!eczane) {
    return NextResponse.json({ hata: "Seçilen eczane bulunamadı.", alan: "alici_kod" }, { status: 400 });
  }

  const yil = new Date().getFullYear();

  const sonuc = await db.transaction(async (calistir) => {
    const r = await calistir("SELECT statu, skt, seri, sevk_kod FROM paketler WHERE uid = ?", uid);
    const p = r.rows?.[0];

    if (!p) kullaniciHatasi("Bu karekod sistemde kayıtlı değil. Sahte ürün şüphesi — satış yapmayın.");
    if (p.statu === "SATILDI") kullaniciHatasi("Bu ambalaj birimi daha önce satılmış. Mükerrer satış engellendi.");
    if (p.statu === "RET") kullaniciHatasi("Bu birim geri çekilmiş veya reddedilmiş — satılamaz.");
    if (p.statu !== "SEVK") kullaniciHatasi(`Bu birim eczaneye sevk edilmemiş (statü: ${p.statu}).`);
    if (String(p.skt) < t) kullaniciHatasi(`Son kullanma tarihi geçmiş (${p.skt}) — satış engellendi.`);

    // KAPALI ZİNCİRİN ASIL KONTROLÜ: sevk edildiği eczaneden başkası satamaz.
    // Eczaneler arası kayıt dışı ürün transferini yakalayan tek kontrol bu.
    if (p.sevk_kod) {
      const sr = await calistir("SELECT alici_kod FROM sevkiyatlar WHERE kod = ?", p.sevk_kod);
      const sevkAlici = sr.rows?.[0]?.alici_kod;
      if (sevkAlici && sevkAlici !== alici_kod) {
        const ar = await calistir("SELECT ad FROM aliciar WHERE kod = ?", sevkAlici);
        const dogruAd = ar.rows?.[0]?.ad ?? sevkAlici;
        kullaniciHatasi(`Bu birim ${dogruAd} adresine sevk edilmiş. Farklı eczaneden satılamaz.`);
      }
    }

    const n = await sayacArtirTx(calistir, `satis-${yil}`);
    const kod = kodSatis(yil, n);

    await calistir(
      `INSERT INTO satislar (kod, tarih, alici_kod, paket_uid, hasta_ad, hasta_tc_maskeli, recete_no, hekim, olusturan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      kod, t, alici_kod, uid, hasta_ad, hasta_tc_maskeli, recete_no, hekim, k.id
    );

    const ur = await calistir(
      "UPDATE paketler SET statu = 'SATILDI', satis_kod = ?, konum = ? WHERE uid = ? AND statu = 'SEVK'",
      kod, `${eczane.ad} — hastaya teslim`, uid
    );
    if (ur.changes === 0) kullaniciHatasi("Birimin durumu işlem sırasında değişti. Tekrar deneyin.");

    const bn = await sayacArtirTx(calistir, `buts-${yil}`);
    await calistir(
      `INSERT INTO buts_kuyruk (kod, tip, ref, adet, detay) VALUES (?, 'SATIS', ?, 1, ?)`,
      kodButs(yil, bn),
      kod,
      JSON.stringify({ satis_no: kod, eczane: eczane.ad, gln: eczane.gln, kod: uid, recete_no })
    );

    return { kod, seri: p.seri };
  });

  await logla(k.id, "Hastaya satış kaydedildi", sonuc.kod, `Reçete ${recete_no} · ${eczane.ad}`);
  return NextResponse.json({ tamam: true, ...sonuc }, { status: 201 });
});
