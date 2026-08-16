import { NextResponse } from "next/server";
import { elektronikImza } from "@/lib/eimza";
import { getDb, logla, sayacArtirTx, trBugun, ensureEkTablolar } from "@/lib/db";
import { korumali, kullaniciHatasi, okuma } from "@/lib/api";
import { kodImha, kodButs } from "@/lib/kod";
import { bicimSayi } from "@/lib/kabul";
import { govde, metin, metinOpsiyonel, sayi, secim, tarih } from "@/lib/dogrula";

const TIPLER = ["HAMMADDE", "URUN", "FIRE"] as const;

/**
 * FİRE, KAYIP ve İMHA — SOP-ÜR-15, FRM-ÜR-15/16.
 *
 * Reddedilen materyalin sistemden çıkış yolu. Bu modül olmadan reddedilen
 * lotlar stokta "kalan" olarak görünüyor, kannabinoid içeren materyalin
 * akıbeti kayıtsız kalıyor ve BÜTS'e imha bildirimi yapılamıyordu (bulgu B-01).
 */

/**
 * İMHA BEKLEYENLER KUYRUĞU.
 *
 * Ayrı bir "imha edildi" bayrağı TUTULMUYOR; kuyruk `imha_kayitlari`na LEFT
 * JOIN ile hesaplanıyor. İki ayrı gerçek (bayrak ve tutanak) tutmak, birinin
 * diğerinden ayrışması demekti.
 */
export const GET = okuma("imha", async () => {
  await ensureEkTablolar();
  const db = await getDb();

  const [bekleyen, kayitlar] = await Promise.all([
    db
      .prepare(
        `-- Reddedilmiş ham madde: stokta duran kannabinoid materyal
         SELECT 'HAMMADDE' AS tip, h.lot AS kaynak_kod, h.kalan_kg AS miktar_kg,
                COALESCE(h.ret_nedeni, 'Reddedilmiş lot') AS gerekce,
                c.ad AS ilgili
           FROM hammadde h
           LEFT JOIN ciftciler c ON c.kod = h.ciftci_kod
           LEFT JOIN imha_kayitlari i ON i.tip = 'HAMMADDE' AND i.kaynak_kod = h.lot
          WHERE h.statu = 'RET' AND h.kalan_kg > 0.0001 AND i.kod IS NULL

         UNION ALL

         -- Reddedilmiş serinin ürünü
         SELECT 'URUN', s.seri, s.cikti_kg,
                COALESCE(s.ret_nedeni, 'Reddedilmiş seri'),
                s.urun_tipi
           FROM seriler s
           LEFT JOIN imha_kayitlari i ON i.tip = 'URUN' AND i.kaynak_kod = s.seri
          WHERE s.statu = 'RET' AND s.cikti_kg > 0.0001 AND i.kod IS NULL

         UNION ALL

         -- Her serinin firesi (posa, kek, dip) — Ek-13 §4, statüden bağımsız
         SELECT 'FIRE', s.seri, s.fire_kg,
                'Proses firesi (posa / filtre keki / baş-kuyruk-dip)',
                s.urun_tipi
           FROM seriler s
           LEFT JOIN imha_kayitlari i ON i.tip = 'FIRE' AND i.kaynak_kod = s.seri
          WHERE s.fire_kg > 0.0001 AND i.kod IS NULL

         ORDER BY tip, kaynak_kod`
      )
      .all(),
    db
      .prepare(
        `SELECT i.*, k.ad_soyad AS olusturan_ad
           FROM imha_kayitlari i
           LEFT JOIN kullanicilar k ON k.id = i.olusturan_id
          ORDER BY i.kod DESC`
      )
      .all(),
  ]);

  const bekleyenKg = bekleyen.reduce((t: number, x: any) => t + Number(x.miktar_kg || 0), 0);
  return NextResponse.json({ bekleyen, kayitlar, bekleyenKg });
});

export const POST = korumali({ ekran: "imha", eylem: "imha_yaz" }, async (req, k) => {
  await ensureEkTablolar();
  const b = await govde(req);

  const tip = secim(b.tip, "İmha tipi", TIPLER);
  const kaynak_kod = metin(b.kaynak_kod, "Kaynak kaydı", 60);

  // GERİ ALINAMAZ KARAR — elektronik imza (şifreyle yeniden doğrulama).
  await elektronikImza({
    k, sifre: b.sifre, eylem: "imha_yaz", kayit: kaynak_kod,
    anlam: "İmha tutanağı onayı",
  });
  const miktar_kg = sayi(b.miktar_kg, "Miktar", { min: 0.0001, max: 100000, sifirOlabilir: false });
  const gerekce = metin(b.gerekce, "Gerekçe", 1000);
  const tanik_1 = metin(b.tanik_1, "1. tanık", 120);
  const tanik_2 = metin(b.tanik_2, "2. tanık", 120);
  const bertaraf_firma = metinOpsiyonel(b.bertaraf_firma, "Lisanslı bertaraf firması", 200);
  const tutanak_no = metin(b.tutanak_no, "Tutanak no", 60);
  const t = tarih(b.tarih, "İmha tarihi");

  // İKİ FARKLI TANIK ŞART. Ek-13 §4 "en az iki tanık huzurunda" diyor; aynı
  // ismin iki kez yazılması bu şartı karşılamaz.
  if (tanik_1.trim().toLocaleLowerCase("tr") === tanik_2.trim().toLocaleLowerCase("tr")) {
    return NextResponse.json(
      { hata: "İki tanık farklı kişiler olmalı (Ek-13 §4).", alan: "tanik_2" },
      { status: 400 }
    );
  }
  if (t > trBugun()) {
    return NextResponse.json({ hata: "İmha tarihi gelecekte olamaz.", alan: "tarih" }, { status: 400 });
  }

  const db = await getDb();
  const yil = new Date().getFullYear();

  const sonuc = await db.transaction(async (calistir) => {
    // Kaynağın gerçekten imha bekliyor olduğu transaction İÇİNDE doğrulanıyor.
    if (tip === "HAMMADDE") {
      const r = await calistir("SELECT statu, kalan_kg FROM hammadde WHERE lot = ?", kaynak_kod);
      const h = r.rows?.[0];
      if (!h) kullaniciHatasi(`${kaynak_kod} lotu bulunamadı.`);
      if (h.statu !== "RET") {
        kullaniciHatasi(`${kaynak_kod} lotu ${h.statu} statüsünde — yalnızca reddedilmiş lot imha edilir.`);
      }
      if (miktar_kg > Number(h.kalan_kg) + 1e-6) {
        kullaniciHatasi(
          `${kaynak_kod} lotunda ${bicimSayi(Number(h.kalan_kg), 3)} kg var, ` +
            `${bicimSayi(miktar_kg, 3)} kg imha edilmek isteniyor.`
        );
      }
    } else {
      const r = await calistir("SELECT statu, cikti_kg, fire_kg FROM seriler WHERE seri = ?", kaynak_kod);
      const s = r.rows?.[0];
      if (!s) kullaniciHatasi(`${kaynak_kod} serisi bulunamadı.`);
      if (tip === "URUN" && s.statu !== "RET") {
        kullaniciHatasi(`${kaynak_kod} serisi ${s.statu} statüsünde — yalnızca reddedilmiş serinin ürünü imha edilir.`);
      }
      const azami = Number(tip === "URUN" ? s.cikti_kg : s.fire_kg) || 0;
      if (miktar_kg > azami + 1e-6) {
        kullaniciHatasi(
          `${kaynak_kod} için kayıtlı ${tip === "URUN" ? "ürün" : "fire"} miktarı ` +
            `${bicimSayi(azami, 3)} kg; ${bicimSayi(miktar_kg, 3)} kg imha edilemez.`
        );
      }
    }

    const n = await sayacArtirTx(calistir, `imha-${yil}`);
    const kod = kodImha(yil, n);

    await calistir(
      `INSERT INTO imha_kayitlari
         (kod, tip, kaynak_kod, miktar_kg, gerekce, tanik_1, tanik_2, bertaraf_firma, tutanak_no, tarih, olusturan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      kod, tip, kaynak_kod, miktar_kg, gerekce, tanik_1, tanik_2, bertaraf_firma, tutanak_no, t, k.id
    );

    // Ham madde imha edilince STOKTAN DÜŞÜYOR. Bulgu B-01'in özü buydu:
    // reddedilen 760 kg tabloda "kalan" olarak duruyordu.
    if (tip === "HAMMADDE") {
      await calistir("UPDATE hammadde SET kalan_kg = ROUND(kalan_kg - ?, 4) WHERE lot = ?", miktar_kg, kaynak_kod);
    }

    const bn = await sayacArtirTx(calistir, `buts-${yil}`);
    await calistir(
      `INSERT INTO buts_kuyruk (kod, tip, ref, adet, detay) VALUES (?, 'IMHA', ?, 1, ?)`,
      kodButs(yil, bn),
      kod,
      JSON.stringify({ imha_no: kod, tip, kaynak: kaynak_kod, miktar_kg, tutanak_no, bertaraf_firma })
    );

    return { kod };
  });

  await logla(
    k.id,
    `İmha tutanağı düzenlendi — ${bicimSayi(miktar_kg, 3)} kg`,
    sonuc.kod,
    `${tip} · ${kaynak_kod} · tanıklar: ${tanik_1}, ${tanik_2}`
  );

  return NextResponse.json({ tamam: true, ...sonuc }, { status: 201 });
});
