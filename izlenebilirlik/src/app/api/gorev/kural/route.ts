import { NextResponse } from "next/server";
import { getDb, logla, sayacBlokTx, ensureEkTablolar } from "@/lib/db";
import { korumali } from "@/lib/api";
import { kodKural } from "@/lib/kod";
import { govde, metin, metinOpsiyonel, secim, tarih, evetHayir } from "@/lib/dogrula";
import { PERIYOT_KODLARI } from "@/lib/gorev";
import { ROLLER } from "@/lib/types";

/**
 * GÖREV KURAL TABLOSU — toplu yükleme ve onay.
 *
 * Kural tablosu fiilen YILLIK FAALİYET PLANI: hangi işin hangi sıklıkta,
 * kimin sorumluluğunda ve hangi SOP maddesine dayanarak yapılacağı. Bu
 * yüzden her satır `dokuman_kod` zorunlu taşıyor — dayanağı olmayan kural
 * takvime giremiyor.
 *
 * ONAY AYRI BİR EYLEM. Dokümanlardan otomatik çıkarılan kurallar TASLAK
 * giriyor; sorumlu rolün doğru türetildiğini ve periyodun doğru okunduğunu
 * insan teyit ediyor. Otomatik çıkarımın sessizce yanlış periyot ataması,
 * kaçırılmış ya da gereksiz açılmış görev demek — onay adımı bunun tek
 * gerçek savunması.
 */
export const POST = korumali(
  { ekran: "gorev", eylem: "gorev_kural_yonet" },
  async (req, k) => {
    const b = await govde(req);
    const baslangic = tarih(b.baslangic, "Takvim başlangıcı");
    const onayla = b.onayla === undefined ? false : evetHayir(b.onayla, "Onay");

    if (!Array.isArray(b.kurallar) || b.kurallar.length === 0) {
      return NextResponse.json({ hata: "Kural listesi boş.", alan: "kurallar" }, { status: 400 });
    }
    if (b.kurallar.length > 500) {
      return NextResponse.json(
        { hata: "Tek seferde en fazla 500 kural yüklenebilir." },
        { status: 400 }
      );
    }

    const girdiler = b.kurallar.map((ham: unknown, i: number) => {
      if (!ham || typeof ham !== "object") {
        throw new Error(`Kural ${i + 1} bir nesne olmalı.`);
      }
      const r = ham as Record<string, unknown>;
      return {
        dokuman_kod: metin(r.dokuman_kod, `Kural ${i + 1} doküman kodu`, 30),
        madde: metinOpsiyonel(r.madde, `Kural ${i + 1} madde`, 20),
        faaliyet: metin(r.faaliyet, `Kural ${i + 1} faaliyet`, 300),
        periyot: secim(r.periyot, `Kural ${i + 1} periyot`, PERIYOT_KODLARI),
        sorumlu_rol: secim(r.sorumlu_rol, `Kural ${i + 1} sorumlu rol`, ROLLER),
        sorumlu_ham: metinOpsiyonel(r.sorumlu_ham, `Kural ${i + 1} sorumlu (ham)`, 120),
        form_kod: metinOpsiyonel(r.form_kod, `Kural ${i + 1} form kodu`, 30),
        saklama: metinOpsiyonel(r.saklama, `Kural ${i + 1} saklama`, 40),
        notlar: metinOpsiyonel(r.notlar, `Kural ${i + 1} not`, 300),
      };
    });

    await ensureEkTablolar();
    const db = await getDb();

    // MÜKERRER KORUMASI: aynı doküman+madde+faaliyet ikinci kez yüklenmemeli.
    // Aracı iki kez çalıştırmak yaygın; ikinci çalıştırma takvimi ikiye
    // katlasaydı her iş iki kez görünürdü.
    const varOlan = new Set(
      ((await db.prepare("SELECT dokuman_kod, madde, faaliyet FROM gorev_kurallari").all()) as any[]).map(
        (r) => `${r.dokuman_kod}|${r.madde ?? ""}|${String(r.faaliyet).slice(0, 70).toLowerCase()}`
      )
    );
    const yeniler = girdiler.filter(
      (g: any) => !varOlan.has(`${g.dokuman_kod}|${g.madde ?? ""}|${g.faaliyet.slice(0, 70).toLowerCase()}`)
    );

    const durum = onayla ? "ONAYLI" : "TASLAK";
    const simdi = new Date().toISOString().slice(0, 19).replace("T", " ");

    if (yeniler.length) {
      const mevcutSayi = Number(
        (await db.prepare("SELECT COUNT(*) AS a FROM gorev_kurallari").get())?.a ?? 0
      );
      await db.transaction(async (calistir) => {
        const ilk = await sayacBlokTx(calistir, "kural", yeniler.length);
        for (let i = 0; i < yeniler.length; i++) {
          const g = yeniler[i] as any;
          await calistir(
            `INSERT INTO gorev_kurallari
               (kod, dokuman_kod, madde, faaliyet, periyot, sorumlu_rol, sorumlu_ham,
                form_kod, saklama, baslangic, durum, onaylayan_id, onay_tarihi, notlar, olusturan_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            kodKural(ilk + i), g.dokuman_kod, g.madde, g.faaliyet, g.periyot,
            g.sorumlu_rol, g.sorumlu_ham, g.form_kod, g.saklama, baslangic, durum,
            onayla ? k.id : null, onayla ? simdi : null, g.notlar, k.id
          );
        }
      });
      void mevcutSayi;
    }

    // Halihazırda taslak duran kuralları da onayla — araç ikinci kez
    // ONAYLA=1 ile çalıştırıldığında beklenen davranış bu.
    let onaylanan = 0;
    if (onayla) {
      const r = await db
        .prepare(
          "UPDATE gorev_kurallari SET durum = 'ONAYLI', onaylayan_id = ?, onay_tarihi = ? WHERE durum = 'TASLAK'"
        )
        .run(k.id, simdi);
      onaylanan = Number((r as any)?.rowsAffected ?? 0);
    }

    await logla(
      k.id,
      onayla ? "Görev kural tablosu ONAYLANDI" : "Görev kuralları yüklendi (taslak)",
      "gorev_kurallari",
      `${yeniler.length} yeni kural · ${girdiler.length - yeniler.length} zaten vardı` +
        (onayla ? ` · ${onaylanan} kural onaylandı · takvim başlangıcı ${baslangic}` : "")
    );

    return NextResponse.json({
      tamam: true,
      eklenen: yeniler.length,
      atlanan: girdiler.length - yeniler.length,
      onaylanan,
    });
  }
);
