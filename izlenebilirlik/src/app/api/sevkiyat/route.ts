import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx, trBugun, ensureEkTablolar } from "@/lib/db";
import { korumali, kullaniciHatasi, okuma } from "@/lib/api";
import { kodSevkiyat, kodButs } from "@/lib/kod";
import { karekodNormalize } from "@/lib/karekod";
import { govde, kodListesi, metin, metinOpsiyonel, tarih } from "@/lib/dogrula";

export const GET = okuma("sevkiyat", async () => {
  const db = await getDb();
  const kayitlar = await db
    .prepare(
      `SELECT s.*, a.ad AS alici_ad, a.tip AS alici_tip, a.il AS alici_il,
              (SELECT COUNT(*) FROM paketler p WHERE p.sevk_kod = s.kod) AS adet
         FROM sevkiyatlar s
         LEFT JOIN aliciar a ON a.kod = s.alici_kod
        ORDER BY s.kod DESC`
    )
    .all();
  return NextResponse.json({ kayitlar });
});

/**
 * Sevkiyat — Ek-13 adım 16, SOP-ÜR-14 kapalı zincir.
 *
 * TÜMÜ YA DA HİÇBİRİ: bir kod bile uygun değilse sevkiyat HİÇ kaydedilmez.
 * "Uygun olanları gönder, hatalıları atla" davranışı kapalı zinciri bozar —
 * irsaliyedeki adet ile fiilen sevk edilen adet ayrışır ve fark ancak
 * alıcıda fark edilir.
 */
export const POST = korumali({ ekran: "sevkiyat", eylem: "sevk_yaz" }, async (req, k) => {
  const b = await govde(req);

  const alici_kod = metin(b.alici_kod, "Alıcı", 20);
  const t = tarih(b.tarih, "Sevk tarihi");
  const tasiyici = metin(b.tasiyici, "Onaylı taşıyıcı", 160);
  const muhur_no = metin(b.muhur_no, "Mühür no", 60);
  const irsaliye = metinOpsiyonel(b.irsaliye, "İrsaliye no", 60);
  const teslim_alan = metinOpsiyonel(b.teslim_alan, "Teslim alan yetkili", 120);
  const kodlar = kodListesi(b.kodlar).map(karekodNormalize);

  if (t > trBugun()) {
    return NextResponse.json({ hata: "Sevk tarihi gelecekte olamaz.", alan: "tarih" }, { status: 400 });
  }

  const db = await getDb();
  const alici = await db.prepare("SELECT ad, gln FROM aliciar WHERE kod = ?").get(alici_kod);
  if (!alici) {
    return NextResponse.json({ hata: "Seçilen alıcı bulunamadı.", alan: "alici_kod" }, { status: 400 });
  }

  await ensureEkTablolar();

  const yil = new Date().getFullYear();
  const bugun = trBugun();

  const sonuc = await db.transaction(async (calistir) => {
    const gorulen = new Set<string>();
    const kontrolEdilenSeriler = new Set<string>();
    const uidler: string[] = [];

    // Denetim transaction İÇİNDE tekrarlanıyor. /dogrula ucundaki ön kontrol
    // KULLANICI İÇİN; araya başka bir sevkiyat girmiş olabilir ve son sözü
    // burası söylemeli.
    for (const kod of kodlar) {
      if (gorulen.has(kod)) kullaniciHatasi("Aynı karekod birden fazla okutulmuş.");
      gorulen.add(kod);

      const r = await calistir("SELECT statu, skt, seri FROM paketler WHERE uid = ?", kod);
      const p = r.rows?.[0];
      if (!p) kullaniciHatasi(`Karekod sistemde kayıtlı değil — sahte ürün şüphesi: ${kod.slice(0, 30)}…`);
      if (p.statu === "SEVK") kullaniciHatasi("Listedeki bir birim zaten sevk edilmiş.");
      if (p.statu === "SATILDI") kullaniciHatasi("Listedeki bir birim zaten hastaya verilmiş.");
      if (p.statu !== "SERBEST") kullaniciHatasi(`Listedeki bir birim ${p.statu} statüsünde — sevk edilemez.`);
      if (String(p.skt) < bugun) kullaniciHatasi("Listedeki bir birimin son kullanma tarihi geçmiş.");

      /**
       * ETİKET MUTABAKATI KONTROLÜ — Ek-13 KKN §13, FRM-ÜR-12.
       *
       * Ambalaj ekranı "FARK = 0 olmalıdır" diyordu ama kimse bir sayı
       * girmiyordu; kontrol dekoratifti (bulgu B-06). Artık gerçekten
       * durduruyor: mutabakatı yapılmamış ya da farkı sıfır olmayan serinin
       * hiçbir birimi sevk edilemez.
       *
       * Seri bazında BİR KEZ kontrol ediliyor — 40 birimlik bir sevkiyatta
       * aynı sorguyu 40 kez atmanın anlamı yok.
       */
      if (!kontrolEdilenSeriler.has(String(p.seri))) {
        kontrolEdilenSeriler.add(String(p.seri));
        const m = await calistir("SELECT fark FROM etiket_mutabakat WHERE seri = ?", p.seri);
        const mut = m.rows?.[0];
        if (!mut) {
          kullaniciHatasi(
            `${p.seri} serisinin etiket mutabakatı yapılmamış. Ambalaj ekranından mutabakatı ` +
              `kaydedin (FRM-ÜR-12); mutabakatsız seri sevk edilemez.`
          );
        }
        if (Number(mut.fark) !== 0) {
          kullaniciHatasi(
            `${p.seri} serisinde etiket mutabakatı UYUŞMUYOR (fark ${mut.fark}). ` +
              `Fark sıfırlanmadan sevkiyat yapılamaz — Ek-13 kritik kontrol noktası.`
          );
        }
      }

      uidler.push(kod);
    }

    const n = await sayacArtirTx(calistir, `sevkiyat-${yil}`);
    const kod = kodSevkiyat(yil, n);
    const bn = await sayacArtirTx(calistir, `buts-${yil}`);
    const butsKod = kodButs(yil, bn);

    await calistir(
      // `adet` SEVK ANINDA yazılıyor ve bir daha değişmiyor. Canlı sayım
      // (bağlı paket sayısı) iade sonrası düşer; tarihsel hareket kaydı düşmez.
      `INSERT INTO sevkiyatlar (kod, tarih, alici_kod, tasiyici, muhur_no, irsaliye, teslim_alan, buts_ref, adet, olusturan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      kod, t, alici_kod, tasiyici, muhur_no, irsaliye, teslim_alan, butsKod, uidler.length, k.id
    );

    for (const uid of uidler) {
      // `AND statu = 'SERBEST'` koşulu ikinci bir savunma: yukarıdaki kontrol
      // ile bu güncelleme arasında bir şey değişirse satır güncellenmez.
      const r = await calistir(
        "UPDATE paketler SET statu = 'SEVK', sevk_kod = ?, konum = ? WHERE uid = ? AND statu = 'SERBEST'",
        kod, String(alici.ad), uid
      );
      if (r.changes === 0) kullaniciHatasi("Bir birimin durumu işlem sırasında değişti. Tekrar deneyin.");
    }

    await calistir(
      `INSERT INTO buts_kuyruk (kod, tip, ref, adet, detay) VALUES (?, 'SEVKIYAT', ?, ?, ?)`,
      butsKod,
      kod,
      uidler.length,
      JSON.stringify({ sevk_no: kod, alici: alici.ad, gln: alici.gln, muhur_no, kodlar: uidler })
    );

    return { kod, adet: uidler.length, butsRef: butsKod };
  });

  await logla(k.id, `Sevkiyat — ${sonuc.adet} birim → ${alici.ad}`, sonuc.kod, `Mühür ${muhur_no}`);
  return NextResponse.json({ tamam: true, ...sonuc }, { status: 201 });
});
