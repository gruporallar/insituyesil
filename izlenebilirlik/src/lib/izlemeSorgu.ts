import { zincirVerisi } from "./veri";
import { geriIzleme, ileriIzleme, lottanSeriler } from "./zincir";
import { karekodCozumle, karekodNormalize } from "./karekod";
import { kayitTipiTani } from "./kod";

/**
 * İZLEME SORGUSU — tek kutu, her tip kayıt.
 *
 * Hem `/api/izleme` ucundan hem de sayfanın sunucu bileşeninden çağrılıyor.
 * AYNI MANTIK İKİ YERE YAZILMASIN diye buraya alındı: sayfa ilk yüklemede
 * sonucu sunucuda üretiyor (adres çubuğundan `?q=` ile gelindiğinde ekstra
 * gidiş-dönüş yok), sonraki aramalar API üzerinden gidiyor.
 */
export type IzlemeSonucu =
  | { tip: "PAKET"; zincir: any }
  | { tip: "SAHTE_SUPHESI"; alanlar: any; mesaj: string }
  | { tip: "SERI"; seri: any; girdiler: any[]; ileri: any }
  | { tip: "HAMMADDE"; lot: any; ciftci: any; seriler: string[]; ileri: any }
  | { tip: "CIFTCI"; ciftci: any; lotlar: any[]; ileri: any }
  | null;

/** `Map` JSON'a çevrilemiyor — diziye açılıyor. */
function ileriPaket(i: ReturnType<typeof ileriIzleme>) {
  return {
    sayim: i.sayim,
    toplam: i.paketler.length,
    noktalar: [...i.noktalar.entries()].map(([alici_kod, adet]) => ({ alici_kod, adet })),
    satislar: i.satislar,
  };
}

export async function izlemeSorgula(ham: string): Promise<IzlemeSonucu> {
  const q = karekodNormalize(String(ham ?? "").trim());
  if (!q) return null;

  const veri = await zincirVerisi();

  // ── Tekil numara veya tam karekod: doğrudan paket ─────────────────────────
  //
  // `kayitTipiTani` tekil numarayı (T00000004) tanımıyordu ve sorgu
  // BILINMEYEN'e düşüp "kayıt bulunamadı" diyordu — Hızlı İşlem aynı kodu
  // bulurken. İzleme, statüden bağımsız çalışmalı: iade edilmiş veya imha
  // edilmiş birim de tarihsel zincirini göstermeli, gösteriyor da —
  // `geriIzleme` statü filtrelemez. Sorun yalnızca kodun ÇÖZÜLMEMESİYDİ.
  const dogrudan = veri.paketler.find(
    (p) => p.tekil === q.toUpperCase() || p.uid === q
  );
  if (dogrudan) {
    const zincir = geriIzleme(dogrudan.uid, veri);
    if (zincir) return { tip: "PAKET", zincir };
  }

  const tip = kayitTipiTani(q);

  // ── Tekil ambalaj birimi: tam zincir ──────────────────────────────────────
  if (tip === "PAKET") {
    const zincir = geriIzleme(q, veri);
    if (zincir) return { tip: "PAKET", zincir };

    // Biçim doğru ama kayıt yok — bu, sahte ürün şüphesinin ta kendisi.
    // "Bulunamadı" demekle yetinmek operatöre ne yapacağını söylemez.
    return {
      tip: "SAHTE_SUPHESI",
      alanlar: karekodCozumle(q),
      mesaj:
        "Bu karekod geçerli biçimde ama sistemde KAYITLI DEĞİL. " +
        "Ürünü satmayın/sevk etmeyin ve Mesul Müdür'e bildirin (SOP-KG-07).",
    };
  }

  // ── Üretim serisi ─────────────────────────────────────────────────────────
  if (tip === "SERI") {
    const seri = veri.seriler.find((s) => s.seri.toUpperCase() === q.toUpperCase());
    if (!seri) return null;
    const girdiler = veri.seriGirdileri
      .filter((g) => g.seri === seri.seri)
      .map((g) => {
        const h = veri.hammadde.find((x) => x.lot === g.lot) ?? null;
        return {
          ...g,
          hammadde: h,
          ciftci: h ? veri.ciftciler.find((c) => c.kod === h.ciftci_kod) ?? null : null,
        };
      });
    return { tip: "SERI", seri, girdiler, ileri: ileriPaket(ileriIzleme([seri.seri], veri)) };
  }

  // ── Ham madde lotu ────────────────────────────────────────────────────────
  if (tip === "HAMMADDE") {
    const lot = veri.hammadde.find((h) => h.lot.toUpperCase() === q.toUpperCase());
    if (!lot) return null;
    const seriler = lottanSeriler(lot.lot, veri);
    return {
      tip: "HAMMADDE",
      lot,
      ciftci: veri.ciftciler.find((c) => c.kod === lot.ciftci_kod) ?? null,
      seriler,
      ileri: seriler.length ? ileriPaket(ileriIzleme(seriler, veri)) : null,
    };
  }

  // ── Çiftçi: kod veya ad ───────────────────────────────────────────────────
  const ciftci =
    veri.ciftciler.find((c) => c.kod.toUpperCase() === q.toUpperCase()) ??
    veri.ciftciler.find((c) => c.ad.toLowerCase().includes(q.toLowerCase()));

  if (ciftci) {
    const lotlar = veri.hammadde.filter((h) => h.ciftci_kod === ciftci.kod);
    const seriler = [...new Set(lotlar.flatMap((l) => lottanSeriler(l.lot, veri)))];
    return {
      tip: "CIFTCI",
      ciftci,
      lotlar,
      ileri: seriler.length ? ileriPaket(ileriIzleme(seriler, veri)) : null,
    };
  }

  return null;
}
