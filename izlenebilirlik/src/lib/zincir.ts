/**
 * SOYAĞACI (LOT GENEALOGY) — geri ve ileri izleme, geri çekme etki analizi.
 *
 * Bu dosya saf: veritabanı bilmiyor, sade dizilerle çalışıyor. Sebebi
 * `test/birim/zincir.mjs` — geri çekmede "kaç hasta etkilendi" sorusunun yanlış
 * cevaplanması, sistemin yapabileceği en pahalı hata. O hesap SQL içinde
 * gömülü olsaydı ancak canlı veriyle sınanabilirdi.
 *
 * Çağıran taraf ilgili tabloları okuyup `ZincirVeri` olarak veriyor.
 */

import type { PaketStatu, Statu, UrunTipi, AliciTip } from "./types";

// ── Girdi satırları (veritabanı şemasının okuma yüzü) ────────────────────────

export interface CiftciSatir {
  kod: string;
  ad: string;
  izin_no: string;
  il: string;
  ilce: string | null;
  parsel: string | null;
}

export interface HamMaddeSatir {
  lot: string;
  ciftci_kod: string;
  teslim_tarihi: string;
  miktar_kg: number;
  kalan_kg: number;
  statu: Statu;
  thc: number | null;
  cbd: number | null;
  analiz_rapor_no: string | null;
  ret_nedeni: string | null;
}

export interface SeriGirdiSatir {
  seri: string;
  lot: string;
  kg: number;
}

export interface SeriSatir {
  seri: string;
  urun_tipi: UrunTipi;
  uretim_tarihi: string;
  girdi_kg: number;
  cikti_kg: number | null;
  mb: number | null;
  cbd: number | null;
  thc: number | null;
  statu: Statu;
  serbest_kisi: string | null;
  ret_nedeni: string | null;
}

export interface PaketSatir {
  uid: string;
  tekil: string;
  seri: string;
  miktar_g: number;
  skt: string;
  statu: PaketStatu;
  sevk_kod: string | null;
  satis_kod: string | null;
  /** Fiziksel yer / açıklama. `RET` statüsünün hangi sebeple olduğunu bu taşıyor. */
  konum?: string | null;
}

export interface AliciSatir {
  kod: string;
  tip: AliciTip;
  ad: string;
  gln: string | null;
  il: string;
  yetkili: string | null;
}

export interface SevkiyatSatir {
  kod: string;
  tarih: string;
  /** Sevk anında yazılan adet — değişmez. Eski kayıtlarda null olabilir. */
  adet?: number | null;
  alici_kod: string;
  tasiyici: string;
  muhur_no: string;
  buts_ref: string | null;
}

export interface SatisSatir {
  kod: string;
  tarih: string;
  alici_kod: string;
  paket_uid: string;
  hasta_ad: string;
  hasta_tc_maskeli: string;
  recete_no: string;
  hekim: string | null;
}

export interface ZincirVeri {
  ciftciler: CiftciSatir[];
  hammadde: HamMaddeSatir[];
  seriGirdileri: SeriGirdiSatir[];
  seriler: SeriSatir[];
  paketler: PaketSatir[];
  aliciar: AliciSatir[];
  sevkiyatlar: SevkiyatSatir[];
  satislar: SatisSatir[];
}

/** Boş veri — çağıran taraf yalnızca ihtiyaç duyduğu tabloları doldurabilir. */
export function bosVeri(): ZincirVeri {
  return {
    ciftciler: [],
    hammadde: [],
    seriGirdileri: [],
    seriler: [],
    paketler: [],
    aliciar: [],
    sevkiyatlar: [],
    satislar: [],
  };
}

// ── Geri izleme: bu ambalaj birimi nereden geldi? ────────────────────────────

export interface ZincirGirdi {
  kg: number;
  hammadde: HamMaddeSatir | null;
  ciftci: CiftciSatir | null;
}

export interface GeriZincir {
  paket: PaketSatir;
  seri: SeriSatir | null;
  girdiler: ZincirGirdi[];
  sevkiyat: SevkiyatSatir | null;
  alici: AliciSatir | null;
  satis: SatisSatir | null;
  eczane: AliciSatir | null;
}

/**
 * Tekil karekoddan tarlaya kadar tam zincir. Paket bulunamazsa `null`.
 *
 * Eksik halkalar `null` bırakılıyor, atlanmıyor: bir ham madde lotunun çiftçi
 * kaydı silinmişse zincir "çiftçi bilinmiyor" göstermeli — halkayı hiç
 * göstermemek, ürünün kaynağı yokmuş gibi okunur.
 */
export function geriIzleme(uid: string, v: ZincirVeri): GeriZincir | null {
  const paket = v.paketler.find((p) => p.uid === uid);
  if (!paket) return null;

  const seri = v.seriler.find((s) => s.seri === paket.seri) ?? null;

  const girdiler: ZincirGirdi[] = v.seriGirdileri
    .filter((g) => g.seri === paket.seri)
    .map((g) => {
      const hammadde = v.hammadde.find((h) => h.lot === g.lot) ?? null;
      const ciftci = hammadde
        ? v.ciftciler.find((c) => c.kod === hammadde.ciftci_kod) ?? null
        : null;
      return { kg: g.kg, hammadde, ciftci };
    });

  const sevkiyat = paket.sevk_kod
    ? v.sevkiyatlar.find((s) => s.kod === paket.sevk_kod) ?? null
    : null;
  const alici = sevkiyat ? v.aliciar.find((a) => a.kod === sevkiyat.alici_kod) ?? null : null;

  const satis = paket.satis_kod ? v.satislar.find((s) => s.kod === paket.satis_kod) ?? null : null;
  const eczane = satis ? v.aliciar.find((a) => a.kod === satis.alici_kod) ?? null : null;

  return { paket, seri, girdiler, sevkiyat, alici, satis, eczane };
}

// ── İleri izleme: bu seri/lot nereye gitti? ─────────────────────────────────

export interface IleriIzleme {
  paketler: PaketSatir[];
  sayim: { depoda: number; sevkte: number; satildi: number; ret: number };
  /** Alıcı kodu → o alıcıdaki (henüz satılmamış) birim sayısı. */
  noktalar: Map<string, number>;
  satislar: SatisSatir[];
}

/**
 * Verilen seri kodlarından üretilmiş her şeyin nerede olduğunu çıkarır.
 *
 * `noktalar` YALNIZCA SEVK statüsündeki birimleri sayıyor — satılmış birim o
 * eczanenin stoğunda değil, hastada. Geri çekmede toplanacak adet ile
 * bilgilendirilecek hasta sayısı ayrı listelerdir; ikisini karıştırmak
 * eczaneden olmayan malı istemek demek olurdu.
 */
export function ileriIzleme(seriKodlari: string[], v: ZincirVeri): IleriIzleme {
  const kume = new Set(seriKodlari);
  const paketler = v.paketler.filter((p) => kume.has(p.seri));
  const uidler = new Set(paketler.map((p) => p.uid));

  const noktalar = new Map<string, number>();
  for (const p of paketler) {
    if (p.statu !== "SEVK" || !p.sevk_kod) continue;
    const sv = v.sevkiyatlar.find((s) => s.kod === p.sevk_kod);
    if (!sv) continue;
    noktalar.set(sv.alici_kod, (noktalar.get(sv.alici_kod) ?? 0) + 1);
  }

  return {
    paketler,
    sayim: {
      depoda: paketler.filter((p) => p.statu === "SERBEST").length,
      sevkte: paketler.filter((p) => p.statu === "SEVK").length,
      satildi: paketler.filter((p) => p.statu === "SATILDI").length,
      ret: paketler.filter((p) => p.statu === "RET").length,
    },
    noktalar,
    satislar: v.satislar.filter((s) => uidler.has(s.paket_uid)),
  };
}

// ── Bir ham madde lotundan etkilenen seriler ─────────────────────────────────

/**
 * Bir ham madde lotunun girdiği TÜM serileri bulur.
 *
 * Bir lot birden fazla seriye bölünebiliyor (25 kg'lık batch'ler). Tek seri
 * varsayan bir arama, aynı lottan üretilmiş diğer serileri geri çekme
 * kapsamının dışında bırakır — piyasada sorunlu ürün kalır.
 */
export function lottanSeriler(lot: string, v: ZincirVeri): string[] {
  return [...new Set(v.seriGirdileri.filter((g) => g.lot === lot).map((g) => g.seri))];
}

// ── Geri çekme etki analizi ─────────────────────────────────────────────────

export interface GeriCekmeKapsam {
  /** Geri çekmeye konu kayıt. */
  kaynak: { tip: "HAMMADDE" | "SERI"; kod: string };
  seriler: SeriSatir[];
  /** Bloke edilecek (depoda bekleyen) birimler. */
  blokeEdilecek: PaketSatir[];
  /** Piyasadan toplanacak birimler. */
  toplanacak: PaketSatir[];
  /** Hastaya ulaşmış birimler — geri alınamaz, bildirilir. */
  hastada: PaketSatir[];
  /** Toplama noktaları: alıcı + adet. */
  noktalar: { alici: AliciSatir | null; alici_kod: string; adet: number }[];
  /** Bilgilendirilecek hasta kayıtları. */
  satislar: SatisSatir[];
  /** Kaynağa kadar geri izleme satırları. */
  kaynaklar: { seri: string; lot: string; ciftci: CiftciSatir | null; thc: number | null }[];
}

/**
 * Geri çekme etki analizi — SOP-KG-07.
 *
 * Ham madde lotu verilirse o lottan üretilmiş TÜM seriler kapsama girer.
 */
export function geriCekmeEtkisi(
  tip: "HAMMADDE" | "SERI",
  kod: string,
  v: ZincirVeri
): GeriCekmeKapsam {
  const seriKodlari = tip === "HAMMADDE" ? lottanSeriler(kod, v) : [kod];
  const seriler = v.seriler.filter((s) => seriKodlari.includes(s.seri));
  const ileri = ileriIzleme(seriKodlari, v);

  const noktalar = [...ileri.noktalar.entries()]
    .map(([alici_kod, adet]) => ({
      alici_kod,
      alici: v.aliciar.find((a) => a.kod === alici_kod) ?? null,
      adet,
    }))
    // Çok birim bekleyen nokta önce — sahada önceliklendirme için.
    .sort((a, b) => b.adet - a.adet);

  const kaynaklar = seriKodlari.flatMap((seri) =>
    v.seriGirdileri
      .filter((g) => g.seri === seri)
      .map((g) => {
        const h = v.hammadde.find((x) => x.lot === g.lot) ?? null;
        return {
          seri,
          lot: g.lot,
          ciftci: h ? v.ciftciler.find((c) => c.kod === h.ciftci_kod) ?? null : null,
          thc: h?.thc ?? null,
        };
      })
  );

  return {
    kaynak: { tip, kod },
    seriler,
    blokeEdilecek: ileri.paketler.filter((p) => p.statu === "SERBEST"),
    toplanacak: ileri.paketler.filter((p) => p.statu === "SEVK"),
    hastada: ileri.paketler.filter((p) => p.statu === "SATILDI"),
    noktalar,
    satislar: ileri.satislar,
    kaynaklar,
  };
}

// ── Sevkiyat öncesi kod doğrulama ───────────────────────────────────────────

export interface KodDenetimi {
  gecerli: PaketSatir[];
  hatali: { kod: string; neden: string }[];
}

/**
 * Sevk edilecek karekodları denetler — SOP-ÜR-14 md. 5.1.
 *
 * `bugun` PARAMETRE, `new Date()` DEĞİL: SKT kontrolü test edilebilir olmalı.
 * Fonksiyonun içinde saat okumak, "yarın kırılan test" üretir.
 */
export function sevkKodlariniDenetle(
  kodlar: string[],
  v: ZincirVeri,
  bugun: string
): KodDenetimi {
  const gecerli: PaketSatir[] = [];
  const hatali: { kod: string; neden: string }[] = [];
  const gorulen = new Set<string>();

  for (const ham of kodlar) {
    const kod = ham.trim();
    if (!kod) continue;

    if (gorulen.has(kod)) {
      hatali.push({ kod, neden: "Aynı kod birden fazla okutuldu" });
      continue;
    }
    gorulen.add(kod);

    const p = v.paketler.find((x) => x.uid === kod);
    if (!p) {
      hatali.push({ kod, neden: "Sistemde kayıtlı değil — sahte ürün şüphesi" });
      continue;
    }
    if (p.statu === "SEVK") {
      hatali.push({ kod, neden: "Zaten sevk edilmiş" });
      continue;
    }
    if (p.statu === "SATILDI") {
      hatali.push({ kod, neden: "Zaten hastaya verilmiş" });
      continue;
    }
    if (p.statu !== "SERBEST") {
      hatali.push({ kod, neden: `Statü ${p.statu} — sevk edilemez` });
      continue;
    }
    if (p.skt < bugun) {
      hatali.push({ kod, neden: `Son kullanma tarihi geçmiş (${p.skt})` });
      continue;
    }
    gecerli.push(p);
  }

  return { gecerli, hatali };
}

// ── Satış öncesi denetim ────────────────────────────────────────────────────

export type SatisDenetimi =
  | { uygun: true; paket: PaketSatir }
  | { uygun: false; neden: string };

/**
 * Hastaya satış denetimi.
 *
 * "Sevk edildiği eczaneden başkası satamaz" kuralı kapalı zincirin
 * kendisi: eczaneler arası kayıt dışı ürün transferini yakalayan tek kontrol.
 */
export function satisDenetle(
  uid: string,
  eczaneKod: string,
  v: ZincirVeri,
  bugun: string
): SatisDenetimi {
  const paket = v.paketler.find((p) => p.uid === uid.trim());
  if (!paket) {
    return { uygun: false, neden: "Bu karekod sistemde kayıtlı değil. Sahte ürün şüphesi — satış yapmayın." };
  }
  if (paket.statu === "SATILDI") {
    return { uygun: false, neden: "Bu ambalaj birimi daha önce satılmış. Mükerrer satış engellendi." };
  }
  if (paket.statu === "RET") {
    return { uygun: false, neden: "Bu birim geri çekilmiş veya reddedilmiş — satılamaz." };
  }
  if (paket.statu !== "SEVK") {
    return { uygun: false, neden: `Bu birim eczaneye sevk edilmemiş (statü: ${paket.statu}).` };
  }

  const sevk = paket.sevk_kod ? v.sevkiyatlar.find((s) => s.kod === paket.sevk_kod) : undefined;
  if (sevk && sevk.alici_kod !== eczaneKod) {
    const dogru = v.aliciar.find((a) => a.kod === sevk.alici_kod);
    return {
      uygun: false,
      neden: `Bu birim ${dogru ? dogru.ad : sevk.alici_kod} adresine sevk edilmiş. Farklı eczaneden satılamaz.`,
    };
  }
  if (paket.skt < bugun) {
    return { uygun: false, neden: `Son kullanma tarihi geçmiş (${paket.skt}) — satış engellendi.` };
  }

  return { uygun: true, paket };
}
