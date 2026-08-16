import { NextResponse } from "next/server";
import { elektronikImza } from "@/lib/eimza";
import { getDb, logla, sayacArtirTx } from "@/lib/db";
import { korumali, okuma } from "@/lib/api";
import { kodButs } from "@/lib/kod";
import { zincirVerisi } from "@/lib/veri";
import { geriCekmeEtkisi } from "@/lib/zincir";
import { govde, metin, secim } from "@/lib/dogrula";

/**
 * Geri çekme etki analizi (GET) ve uygulaması (POST) — SOP-KG-07.
 *
 * GET hiçbir şey YAZMAZ: Mesul Müdür kararı vermeden önce kapsamı görmeli.
 * Kaç hastanın etkilendiğini bilmeden başlatılan bir geri çekme, Kuruma
 * eksik bildirim demek.
 */

export const GET = okuma("gericekme", async (req) => {
  const { searchParams } = new URL(req.url);
  const tip = searchParams.get("tip");
  const kod = searchParams.get("kod");
  if (!kod || (tip !== "HAMMADDE" && tip !== "SERI")) {
    return NextResponse.json({ kapsam: null });
  }

  const veri = await zincirVerisi();
  const k = geriCekmeEtkisi(tip, kod, veri);

  return NextResponse.json({
    kapsam: {
      kaynak: k.kaynak,
      seriler: k.seriler,
      sayim: {
        bloke: k.blokeEdilecek.length,
        toplanacak: k.toplanacak.length,
        hastada: k.hastada.length,
        seri: k.seriler.length,
      },
      noktalar: k.noktalar,
      satislar: k.satislar,
      kaynaklar: k.kaynaklar,
    },
  });
});

/**
 * Geri çekmeyi başlatır.
 *
 * SATILMIŞ BİRİMLER RET'E ÇEKİLMEZ. Hastadaki ürünün statüsünü değiştirmek,
 * satış kaydının anlamını geriye dönük bozar; o ürün gerçekten satıldı ve
 * kaydı öyle kalmalı. Hastalar BİLDİRİM listesinde — geri alınacak değil,
 * ulaşılacak kayıtlar.
 */
export const POST = korumali({ ekran: "gericekme", eylem: "gericekme_baslat" }, async (req, k) => {
  const b = await govde(req);
  const tip = secim(b.tip, "Kayıt tipi", ["HAMMADDE", "SERI"] as const);
  const kod = metin(b.kod, "Kayıt kodu", 60);

  // GERİ ALINAMAZ KARAR — elektronik imza (şifreyle yeniden doğrulama).
  await elektronikImza({
    k, sifre: b.sifre, eylem: "gericekme_baslat", kayit: kod,
    anlam: "Geri çekme başlatma onayı",
  });
  const gerekce = metin(b.gerekce, "Geri çekme gerekçesi", 500);

  const veri = await zincirVerisi();
  const kapsam = geriCekmeEtkisi(tip, kod, veri);

  if (!kapsam.seriler.length) {
    return NextResponse.json(
      { hata: "Bu kayıttan üretilmiş seri bulunamadı — geri çekilecek bir şey yok." },
      { status: 400 }
    );
  }

  const seriKodlari = kapsam.seriler.map((s) => s.seri);
  const blokeUidler = [...kapsam.blokeEdilecek, ...kapsam.toplanacak].map((p) => p.uid);
  const yil = new Date().getFullYear();

  await getDb().then((db) =>
    db.transaction(async (calistir) => {
      for (const uid of blokeUidler) {
        // `statu != 'SATILDI'` koruması: analiz ile uygulama arasında satılmış
        // bir birim varsa onun kaydı bozulmasın.
        await calistir(
          "UPDATE paketler SET statu = 'RET', konum = ? WHERE uid = ? AND statu != 'SATILDI'",
          "GERİ ÇEKİLDİ — D4 Ret/İmha alanı",
          uid
        );
      }
      for (const seri of seriKodlari) {
        await calistir(
          "UPDATE seriler SET statu = 'RET', ret_nedeni = ? WHERE seri = ?",
          `Geri çekme (${kod}): ${gerekce}`,
          seri
        );
      }

      const bn = await sayacArtirTx(calistir, `buts-${yil}`);
      await calistir(
        `INSERT INTO buts_kuyruk (kod, tip, ref, adet, detay) VALUES (?, 'GERI_CEKME', ?, ?, ?)`,
        kodButs(yil, bn),
        kod,
        blokeUidler.length,
        JSON.stringify({
          kapsam: kod,
          tip,
          gerekce,
          seriler: seriKodlari,
          bloke_birim: blokeUidler.length,
          hasta_sayisi: kapsam.satislar.length,
          noktalar: kapsam.noktalar.map((n) => ({ alici: n.alici?.ad ?? n.alici_kod, adet: n.adet })),
        })
      );
    })
  );

  await logla(
    k.id,
    `GERİ ÇEKME başlatıldı — ${blokeUidler.length} birim bloke, ${kapsam.satislar.length} hasta bildirilecek`,
    kod,
    gerekce
  );

  return NextResponse.json({
    tamam: true,
    bloke: blokeUidler.length,
    seri: seriKodlari.length,
    hasta: kapsam.satislar.length,
  });
});
