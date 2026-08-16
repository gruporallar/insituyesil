import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx, trBugun, ensureEkTablolar } from "@/lib/db";
import { korumali, kullaniciHatasi, okuma } from "@/lib/api";
import { kodButs } from "@/lib/kod";
import { karekodNormalize } from "@/lib/karekod";
import { govde, metin, metinOpsiyonel, secim, tarih } from "@/lib/dogrula";

/**
 * İADE — SOP-ÜR-16 md. 2, SOP-KG-07.
 *
 * Zincir tek yönlü kuruluydu; eczaneden dönen ürün sisteme girilemiyordu
 * (bulgu B-08). İade edilen birim 'RET'e çekiliyor — her hareketi engeller —
 * ve akıbeti bu tablodan okunuyor.
 */

function kodIade(yil: number, n: number) {
  return `IAD-${yil}-${String(n).padStart(4, "0")}`;
}

export const GET = okuma("iade", async () => {
  await ensureEkTablolar();
  const db = await getDb();

  const [kayitlar, ozet] = await Promise.all([
    db
      .prepare(
        `SELECT i.*, a.ad AS alici_ad, a.tip AS alici_tip,
                p.tekil, p.miktar_g, p.skt,
                u.ad_soyad AS olusturan_ad, kv.ad_soyad AS karar_veren_ad
           FROM iadeler i
           LEFT JOIN paketler p ON p.uid = i.paket_uid
           LEFT JOIN aliciar a ON a.kod = i.alici_kod
           LEFT JOIN kullanicilar u ON u.id = i.olusturan_id
           LEFT JOIN kullanicilar kv ON kv.id = i.karar_veren_id
          ORDER BY i.karar != 'BEKLIYOR', i.kod DESC`
      )
      .all(),
    db
      .prepare(
        `SELECT COUNT(CASE WHEN karar = 'BEKLIYOR' THEN 1 END) AS bekleyen,
                COUNT(CASE WHEN karar = 'STOGA' THEN 1 END) AS stoga,
                COUNT(CASE WHEN karar = 'IMHA' THEN 1 END) AS imha
           FROM iadeler`
      )
      .get(),
  ]);

  return NextResponse.json({ kayitlar, ozet });
});

/** İade kabulü — karekod okutularak. */
export const POST = korumali({ ekran: "iade", eylem: "iade_yaz" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const uid = karekodNormalize(metin(b.paket_uid, "Karekod", 300));
  const t = tarih(b.tarih, "İade tarihi");
  const gerekce = metin(b.gerekce, "İade gerekçesi", 1000);
  const sikayet_kod = metinOpsiyonel(b.sikayet_kod, "İlgili şikayet", 40);

  if (t > trBugun()) {
    return NextResponse.json({ hata: "İade tarihi gelecekte olamaz.", alan: "tarih" }, { status: 400 });
  }

  const db = await getDb();
  const yil = new Date().getFullYear();

  const sonuc = await db.transaction(async (calistir) => {
    const r = await calistir("SELECT statu, seri, sevk_kod FROM paketler WHERE uid = ?", uid);
    const p = r.rows?.[0];
    if (!p) kullaniciHatasi("Bu karekod sistemde kayıtlı değil. Sahte ürün şüphesi — iade almayın.");

    // YALNIZCA TESİSTEN ÇIKMIŞ BİRİM İADE EDİLEBİLİR. Depodaki bir birim zaten
    // bizde; "iade" demek kaydı anlamsız kılar.
    if (p.statu === "SERBEST") {
      kullaniciHatasi("Bu birim zaten ürün deposunda — iade kaydı gerekmez.");
    }
    if (p.statu === "RET") {
      kullaniciHatasi("Bu birim zaten bloke durumda (geri çekilmiş veya daha önce iade alınmış).");
    }

    // İade edildiği yer, sevk edildiği alıcı.
    let alici_kod: string | null = null;
    if (p.sevk_kod) {
      const sr = await calistir("SELECT alici_kod FROM sevkiyatlar WHERE kod = ?", p.sevk_kod);
      alici_kod = (sr.rows?.[0]?.alici_kod as string) ?? null;
    }

    const n = await sayacArtirTx(calistir, `iade-${yil}`);
    const kod = kodIade(yil, n);

    await calistir(
      `INSERT INTO iadeler (kod, paket_uid, seri, alici_kod, tarih, gerekce, sikayet_kod, olusturan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      kod, uid, p.seri, alici_kod, t, gerekce, sikayet_kod, k.id
    );

    // Birim BLOKE. Karar verilene kadar ne sevk edilebilir ne satılabilir.
    await calistir(
      "UPDATE paketler SET statu = 'RET', konum = ? WHERE uid = ?",
      `İade alındı (${kod}) — karar bekliyor`,
      uid
    );

    const bn = await sayacArtirTx(calistir, `buts-${yil}`);
    await calistir(
      `INSERT INTO buts_kuyruk (kod, tip, ref, adet, detay) VALUES (?, 'IADE', ?, 1, ?)`,
      kodButs(yil, bn),
      kod,
      JSON.stringify({ iade_no: kod, kod: uid, seri: p.seri, alici: alici_kod, gerekce })
    );

    return { kod, seri: p.seri };
  });

  await logla(k.id, "İade alındı — birim bloke edildi", sonuc.kod, `${sonuc.seri} · ${gerekce.slice(0, 100)}`);
  return NextResponse.json({ tamam: true, ...sonuc }, { status: 201 });
});

/** İade kararı: yeniden stoğa ya da imha. */
export const PATCH = korumali({ ekran: "iade", eylem: "iade_karar" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const kod = metin(b.kod, "İade kodu", 40);
  const karar = secim(b.karar, "Karar", ["STOGA", "IMHA"] as const);
  const karar_notu = metin(b.karar_notu, "Karar gerekçesi", 1000);

  let tanik1: string | null = null;
  let tanik2: string | null = null;
  let tutanak: string | null = null;

  if (karar === "IMHA") {
    tanik1 = metin(b.imha_tanik_1, "1. tanık", 120);
    tanik2 = metin(b.imha_tanik_2, "2. tanık", 120);
    tutanak = metin(b.imha_tutanak_no, "İmha tutanak no", 60);
    if (tanik1.trim().toLocaleLowerCase("tr") === tanik2.trim().toLocaleLowerCase("tr")) {
      return NextResponse.json(
        { hata: "İki tanık farklı kişiler olmalı (Ek-13 §4).", alan: "imha_tanik_2" },
        { status: 400 }
      );
    }
  }

  const db = await getDb();
  const yil = new Date().getFullYear();

  const sonuc = await db.transaction(async (calistir) => {
    const r = await calistir("SELECT karar, paket_uid, seri FROM iadeler WHERE kod = ?", kod);
    const i = r.rows?.[0];
    if (!i) kullaniciHatasi("İade kaydı bulunamadı.");
    if (i.karar !== "BEKLIYOR") kullaniciHatasi(`Bu iade için karar zaten verilmiş (${i.karar}).`);

    await calistir(
      `UPDATE iadeler
          SET karar = ?, karar_tarihi = ?, karar_notu = ?,
              imha_tanik_1 = ?, imha_tanik_2 = ?, imha_tutanak_no = ?, karar_veren_id = ?
        WHERE kod = ? AND karar = 'BEKLIYOR'`,
      karar, trBugun(), karar_notu, tanik1, tanik2, tutanak, k.id, kod
    );

    if (karar === "STOGA") {
      /**
       * SKT KONTROLÜ STOĞA DÖNÜŞTE DE YAPILIYOR. İade süreci uzun sürmüş
       * olabilir; süresi geçmiş bir birimi stoğa geri koymak, sevkiyatta
       * yakalanacak ama depoda "kullanılabilir" görünecek bir kayıt üretir.
       */
      const pr = await calistir("SELECT skt FROM paketler WHERE uid = ?", i.paket_uid);
      if (String(pr.rows?.[0]?.skt ?? "") < trBugun()) {
        kullaniciHatasi("Bu birimin son kullanma tarihi geçmiş — stoğa alınamaz, imha edilmeli.");
      }
      // `sevk_kod` KORUNUYOR. Eskiden NULL yapılıyordu ve birimin hangi
      // sevkiyatla çıktığı bilgisi siliniyordu — sevkiyat ekranındaki canlı
      // sayım da bu yüzden BÜTS bildirimiyle çelişiyordu (14 ≠ 15). Geçmiş
      // hareket silinmez; birim yeniden sevk edilirse yeni sevkiyat kodu
      // zaten üzerine yazılır.
      await calistir(
        "UPDATE paketler SET statu = 'SERBEST', konum = ? WHERE uid = ?",
        "Ürün Deposu (D3) — iadeden dönen",
        i.paket_uid
      );
    } else {
      await calistir(
        "UPDATE paketler SET konum = ? WHERE uid = ?",
        `İmha edildi (${kod}) — D4 Ret/İmha alanı`,
        i.paket_uid
      );
      const bn = await sayacArtirTx(calistir, `buts-${yil}`);
      await calistir(
        `INSERT INTO buts_kuyruk (kod, tip, ref, adet, detay) VALUES (?, 'IMHA', ?, 1, ?)`,
        kodButs(yil, bn),
        kod,
        JSON.stringify({ kaynak: "IADE", iade_no: kod, kod: i.paket_uid, tutanak_no: tutanak })
      );
    }

    return { seri: i.seri };
  });

  await logla(
    k.id,
    karar === "STOGA" ? "İade stoğa alındı" : "İade imha edildi",
    kod,
    `${sonuc.seri} · ${karar_notu.slice(0, 100)}`
  );

  return NextResponse.json({ tamam: true, karar });
});
