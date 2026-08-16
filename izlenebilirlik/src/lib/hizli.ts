/**
 * HIZLI İŞLEM — bir karekod/kod okutulduğunda "bu ne ve şimdi ne yapabilirim".
 *
 * Sistemdeki en sık tekrarlanan iş şu: elinde fiziksel bir nesne var (kutu,
 * numune kabı, irsaliye), sistemde karşılığını bulman ve bir sonraki adımı
 * atman gerekiyor. Eski akışta bu, DOĞRU EKRANI BİLMEYİ gerektiriyordu:
 * kutudaki kod satılmış mı, sevkte mi, depoda mı — operatör önce tahmin edip
 * bir ekran açıyor, yanlışsa geri dönüyordu.
 *
 * Burası o tahmini ortadan kaldırıyor: kodu okut, sistem nesneyi tanısın,
 * DURUMUNA ve KULLANICININ YETKİSİNE göre yalnızca gerçekten yapılabilir
 * eylemleri göstersin.
 *
 * Dosya saf: veritabanı ve HTTP bilmiyor. Sebebi `test/birim/hizli.mjs` —
 * "satılmış bir kutuyu tekrar sevk et" gibi bir eylemin listeye sızması,
 * kapalı zincirin sessizce delinmesi demek.
 */

import type { ZincirVeri } from "./zincir";
import type { PaketStatu } from "./types.ts";
import { karekodCozumle, karekodNormalize } from "./karekod.ts";
import { kayitTipiTani } from "./kod.ts";

export type HizliTip =
  | "PAKET"
  | "SERI"
  | "HAMMADDE"
  | "CIFTCI"
  | "SEVKIYAT"
  | "SATIS"
  | "BILINMEYEN";

export interface HizliEylem {
  /** Düğme yazısı. */
  etiket: string;
  /** Gidilecek yol; hedef ekran kodu ön dolu açsın diye sorgu taşır. */
  yol: string;
  /** Birincil eylem tek olmalı — operatör düşünmeden ona bassın. */
  birincil?: boolean;
}

export interface HizliSonuc {
  tip: HizliTip;
  /** Nesnenin sistemdeki anahtarı (paket uid, seri kodu, lot…). */
  anahtar: string;
  baslik: string;
  /** Rozet metni — nesnenin şu anki durumu. */
  durum: string;
  /** Rozet rengi için kaba sınıflandırma. */
  durumCesit: "iyi" | "bekle" | "kotu" | "notr";
  /** Ekranda gösterilecek etiket/değer satırları. */
  alanlar: [string, string][];
  eylemler: HizliEylem[];
  /** Tanınamadıysa neden. */
  neden?: string;
}

/** Eylem yetkisi sorgusu — saf tutmak için dışarıdan geçiliyor. */
export type YetkiSorgu = (eylem: string) => boolean;

const IZLE = (q: string): HizliEylem => ({
  etiket: "İzleme Kaydını Aç",
  // Parametre adı `q` — izleme sayfasının okuduğu ad. Burada bir süre
  // `sorgu` yazdı ve bağlantı sessizce boş ekrana götürdü: iki ekran aynı
  // kavram için farklı ad kullanınca kimse hata görmüyor, kullanıcı görüyor.
  yol: `/panel/izleme?q=${encodeURIComponent(q)}`,
});

/**
 * Okutulan/yazılan bir kodu tanır ve yapılabilir eylemleri döndürür.
 *
 * Girdi üç biçimden biri olabilir:
 *   1. GS1 karekod içeriği (kameradan gelen ham metin)
 *   2. Paket tekil numarası (T00000123)
 *   3. Herhangi bir sistem kodu (CF-001, HM-2026-0001, CBD-D-2026-0001, SVK-…)
 */
export function hizliTani(
  ham: string,
  veri: ZincirVeri,
  yetki: YetkiSorgu
): HizliSonuc {
  const girdi = karekodNormalize((ham ?? "").trim());
  if (!girdi) {
    return bos("Kod okunamadı.");
  }

  // ── 1. GS1 karekod mu? ────────────────────────────────────────────────────
  const gs1 = karekodCozumle(girdi);
  if (gs1) {
    const paket = veri.paketler.find((p) => p.tekil === gs1.tekil);
    if (!paket) {
      return bos(
        `Karekod çözüldü (tekil ${gs1.tekil}) ama bu birim sistemde kayıtlı değil. ` +
          `Etiket bu tesiste basılmamış olabilir.`
      );
    }
    return paketSonucu(paket, veri, yetki);
  }

  // ── 2. Paket tekil numarası mı? ───────────────────────────────────────────
  const dogrudanPaket = veri.paketler.find(
    (p) => p.tekil === girdi || p.uid === girdi
  );
  if (dogrudanPaket) return paketSonucu(dogrudanPaket, veri, yetki);

  // ── 3. Sistem kodu mu? ────────────────────────────────────────────────────
  // Kodlar büyük harf üretiliyor; elle yazan operatör küçük yazmış olabilir.
  const kod = girdi.toUpperCase();
  const tip = kayitTipiTani(kod);

  if (tip === "SERI") {
    const seri = veri.seriler.find((s) => s.seri === kod);
    if (seri) return seriSonucu(seri, veri, yetki);
  }
  if (tip === "HAMMADDE") {
    const hm = veri.hammadde.find((h) => h.lot === kod);
    if (hm) return hammaddeSonucu(hm, veri, yetki);
  }
  if (tip === "CIFTCI") {
    const c = veri.ciftciler.find((x) => x.kod === kod);
    if (c) {
      return {
        tip: "CIFTCI",
        anahtar: c.kod,
        baslik: c.ad,
        durum: "ÇİFTÇİ",
        durumCesit: "notr",
        alanlar: [
          ["İzin No", c.izin_no],
          ["Konum", [c.il, c.ilce].filter(Boolean).join(" / ")],
          ["Parsel", c.parsel ?? "—"],
          [
            "Teslimat",
            `${veri.hammadde.filter((h) => h.ciftci_kod === c.kod).length} lot`,
          ],
        ],
        eylemler: [
          ...(yetki("hammadde_kabul")
            ? [
                {
                  etiket: "Bu Çiftçiden Teslimat Al",
                  yol: `/panel/hammadde?ciftci=${encodeURIComponent(c.kod)}`,
                  birincil: true,
                },
              ]
            : []),
          IZLE(c.kod),
        ],
      };
    }
  }
  if (tip === "SEVKIYAT") {
    const s = veri.sevkiyatlar.find((x) => x.kod === kod);
    if (s) {
      const alici = veri.aliciar.find((a) => a.kod === s.alici_kod);
      const adet = veri.paketler.filter((p) => p.sevk_kod === s.kod).length;
      return {
        tip: "SEVKIYAT",
        anahtar: s.kod,
        baslik: `Sevkiyat ${s.kod}`,
        durum: s.buts_ref ? "BÜTS BİLDİRİLDİ" : "BÜTS BEKLİYOR",
        durumCesit: s.buts_ref ? "iyi" : "bekle",
        alanlar: [
          ["Tarih", s.tarih],
          ["Alıcı", alici ? `${alici.ad} (${alici.il})` : s.alici_kod],
          ["Birim", String(adet)],
          ["Taşıyıcı", s.tasiyici ?? "—"],
          ["Mühür", s.muhur_no ?? "—"],
        ],
        eylemler: [IZLE(s.kod)],
      };
    }
  }
  if (tip === "SATIS") {
    const s = veri.satislar.find((x) => x.kod === kod);
    if (s) {
      const alici = veri.aliciar.find((a) => a.kod === s.alici_kod);
      return {
        tip: "SATIS",
        anahtar: s.kod,
        baslik: `Satış ${s.kod}`,
        durum: "HASTAYA VERİLDİ",
        durumCesit: "iyi",
        alanlar: [
          ["Tarih", s.tarih],
          ["Eczane", alici?.ad ?? s.alici_kod],
          ["Hasta", `${s.hasta_ad} · ${s.hasta_tc_maskeli}`],
          ["Reçete", s.recete_no],
          ["Hekim", s.hekim ?? "—"],
        ],
        eylemler: [
          ...(yetki("iade_yaz")
            ? [
                {
                  etiket: "İade Al",
                  yol: `/panel/iade?kod=${encodeURIComponent(s.paket_uid)}`,
                  birincil: true,
                },
              ]
            : []),
          IZLE(s.recete_no),
        ],
      };
    }
  }

  return bos(
    `"${kisalt(girdi)}" sistemde bulunamadı. Karekodun tamamının okunduğundan ` +
      `emin olun; elle giriyorsanız kodu tam yazın (örn. CBD-D-2026-0001).`
  );
}

// ── Nesne başına sonuç üreticiler ───────────────────────────────────────────

function paketSonucu(
  p: ZincirVeri["paketler"][number],
  veri: ZincirVeri,
  yetki: YetkiSorgu
): HizliSonuc {
  const seri = veri.seriler.find((s) => s.seri === p.seri);
  const sevk = p.sevk_kod ? veri.sevkiyatlar.find((s) => s.kod === p.sevk_kod) : null;
  const alici = sevk ? veri.aliciar.find((a) => a.kod === sevk.alici_kod) : null;
  const satis = p.satis_kod ? veri.satislar.find((s) => s.kod === p.satis_kod) : null;

  const alanlar: [string, string][] = [
    ["Tekil No", p.tekil],
    ["Seri", `${p.seri}${seri ? ` · ${seri.urun_tipi}` : ""}`],
    ["Miktar", `${p.miktar_g} g`],
    ["SKT", p.skt],
  ];
  if (sevk) {
    alanlar.push([
      "Sevkiyat",
      `${sevk.kod} · ${sevk.tarih}${alici ? ` → ${alici.ad}` : ""}`,
    ]);
  }
  if (satis) {
    alanlar.push(["Satış", `${satis.kod} · ${satis.tarih} · ${satis.hasta_ad}`]);
  }

  // `RET` üç ayrı fiziksel durumu kapsıyor (geri çekildi / iade alındı /
  // imha edildi) ve operatörün hangisi olduğunu bilmesi gerekiyor — ayrımı
  // yalnızca `konum` taşıyor.
  if (p.konum) alanlar.push(["Konum", p.konum]);

  const eylemler: HizliEylem[] = [];

  // Eylem listesi PAKETİN DURUMUNA göre daralıyor. Bu, ekranda "sevk et"
  // düğmesini görüp basınca sunucudan hata yemekten iyi: operatör en baştan
  // yalnızca geçerli olanı görüyor.
  if (p.statu === "SERBEST") {
    if (yetki("sevk_yaz")) {
      eylemler.push({
        etiket: "Sevkiyata Ekle",
        yol: `/panel/sevkiyat?kod=${encodeURIComponent(p.uid)}`,
        birincil: true,
      });
    }
    if (yetki("imha_yaz")) {
      eylemler.push({
        etiket: "İmha Tutanağı",
        yol: `/panel/imha?tip=URUN&kaynak=${encodeURIComponent(p.seri)}`,
      });
    }
  } else if (p.statu === "SEVK") {
    if (yetki("satis_yaz")) {
      eylemler.push({
        etiket: "Hastaya Sat",
        yol: `/panel/satis?kod=${encodeURIComponent(p.uid)}`,
        birincil: true,
      });
    }
    if (yetki("iade_yaz")) {
      eylemler.push({
        etiket: "İade Al",
        yol: `/panel/iade?kod=${encodeURIComponent(p.uid)}`,
      });
    }
  } else if (p.statu === "SATILDI") {
    if (yetki("iade_yaz")) {
      eylemler.push({
        etiket: "İade Al",
        yol: `/panel/iade?kod=${encodeURIComponent(p.uid)}`,
        birincil: true,
      });
    }
    if (yetki("sikayet_yaz")) {
      eylemler.push({
        etiket: "Şikayet Kaydet",
        yol: `/panel/iade?sikayet=${encodeURIComponent(p.seri)}`,
      });
    }
  }
  // RET: ileri eylem YOK. Geri çekilmiş ya da imha edilmiş bir birim zincire
  // geri sokulamaz; iadeden stoğa alma kararı İade ekranında veriliyor.

  eylemler.push(IZLE(p.tekil));

  return {
    tip: "PAKET",
    anahtar: p.uid,
    baslik: `${seri?.urun_tipi === "IZOLAT" ? "CBD İzolat" : "CBD Distilat"} · ${p.miktar_g} g`,
    durum: PAKET_DURUM[p.statu] ?? p.statu,
    durumCesit: p.statu === "RET" ? "kotu" : p.statu === "SERBEST" ? "bekle" : "iyi",
    alanlar,
    eylemler,
  };
}

/** Statü → operatörün gördüğü metin. Her statü için karşılık ZORUNLU. */
export const PAKET_DURUM: Record<PaketStatu, string> = {
  SERBEST: "DEPODA — SEVKE HAZIR",
  SEVK: "SEVK EDİLDİ",
  SATILDI: "HASTAYA VERİLDİ",
  RET: "RET / İADE / İMHA",
};

function seriSonucu(
  s: ZincirVeri["seriler"][number],
  veri: ZincirVeri,
  yetki: YetkiSorgu
): HizliSonuc {
  const paketler = veri.paketler.filter((p) => p.seri === s.seri);
  const eylemler: HizliEylem[] = [
    { etiket: "Seri Dosyasını Aç", yol: `/panel/uretim/${encodeURIComponent(s.seri)}`, birincil: true },
  ];
  if (s.statu === "KARANTINA") {
    if (yetki("proses_yaz")) {
      eylemler.push({ etiket: "Proses Kaydı Gir", yol: `/panel/uretim/${encodeURIComponent(s.seri)}#proses` });
    }
  } else if (s.statu === "SERBEST" && paketler.length === 0 && yetki("ambalajla")) {
    eylemler.push({ etiket: "Ambalajla", yol: `/panel/ambalaj?seri=${encodeURIComponent(s.seri)}` });
  }
  eylemler.push(IZLE(s.seri));

  return {
    tip: "SERI",
    anahtar: s.seri,
    baslik: `${s.seri} · ${s.urun_tipi === "IZOLAT" ? "CBD İzolat" : "CBD Distilat"}`,
    durum: s.statu,
    durumCesit: s.statu === "SERBEST" ? "iyi" : s.statu === "RET" ? "kotu" : "bekle",
    alanlar: [
      ["Üretim", s.uretim_tarihi],
      ["Girdi / Çıktı", `${s.girdi_kg} kg → ${s.cikti_kg ?? "—"} kg`],
      ["Kütle Denkliği", s.mb != null ? `%${s.mb}` : "—"],
      ["CBD / THC", `${s.cbd ?? "—"} / ${s.thc ?? "—"}`],
      ["Ambalaj", `${paketler.length} birim`],
      ...(s.ret_nedeni ? ([["Ret Nedeni", s.ret_nedeni]] as [string, string][]) : []),
    ],
    eylemler,
  };
}

function hammaddeSonucu(
  h: ZincirVeri["hammadde"][number],
  veri: ZincirVeri,
  yetki: YetkiSorgu
): HizliSonuc {
  const ciftci = veri.ciftciler.find((c) => c.kod === h.ciftci_kod);
  const eylemler: HizliEylem[] = [];
  if (h.statu === "KARANTINA" && yetki("analiz_karar")) {
    eylemler.push({
      etiket: "Analiz Sonucu Gir",
      yol: `/panel/hammadde?lot=${encodeURIComponent(h.lot)}`,
      birincil: true,
    });
  }
  if (h.statu === "SERBEST" && h.kalan_kg > 0 && yetki("seri_ac")) {
    eylemler.push({
      etiket: "Üretime Al",
      yol: `/panel/uretim?lot=${encodeURIComponent(h.lot)}`,
      birincil: true,
    });
  }
  if (h.statu === "RET" && yetki("imha_yaz")) {
    eylemler.push({
      etiket: "İmha Tutanağı",
      yol: `/panel/imha?tip=HAMMADDE&kaynak=${encodeURIComponent(h.lot)}`,
      birincil: true,
    });
  }
  eylemler.push(IZLE(h.lot));

  return {
    tip: "HAMMADDE",
    anahtar: h.lot,
    baslik: `Ham Madde ${h.lot}`,
    durum: h.statu,
    durumCesit: h.statu === "SERBEST" ? "iyi" : h.statu === "RET" ? "kotu" : "bekle",
    alanlar: [
      ["Çiftçi", ciftci ? `${ciftci.ad} (${ciftci.il})` : h.ciftci_kod],
      ["Teslim", h.teslim_tarihi],
      ["Miktar / Kalan", `${h.miktar_kg} kg / ${h.kalan_kg} kg`],
      ["THC / CBD", `${h.thc ?? "—"} / ${h.cbd ?? "—"}`],
      ["Analiz Rapor", h.analiz_rapor_no ?? "—"],
      ...(h.ret_nedeni ? ([["Ret Nedeni", h.ret_nedeni]] as [string, string][]) : []),
    ],
    eylemler,
  };
}

function bos(neden: string): HizliSonuc {
  return {
    tip: "BILINMEYEN",
    anahtar: "",
    baslik: "Tanınmadı",
    durum: "BULUNAMADI",
    durumCesit: "kotu",
    alanlar: [],
    eylemler: [],
    neden,
  };
}

function kisalt(s: string): string {
  return s.length > 40 ? `${s.slice(0, 37)}…` : s;
}
