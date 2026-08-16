/**
 * HAM MADDE ANALİZ PARAMETRELERİ — SOP-KK-04, FRM-KK-08/09.
 *
 * Ham madde kabulü "11 zorunlu analiz uygun mu? E/H" beyanıyla değil,
 * PARAMETRE PARAMETRE girilen sonuçlarla yapılır. Beyan modeli kural 2'ye
 * ("kararı sistem verir") aykırı bir koku taşıyordu: operatör 11 analizin
 * hepsine tek kutuda kefil oluyordu ve sistemin hangi parametrenin
 * uygunsuz olduğunu bilme şansı yoktu.
 *
 * SAYISAL LİMİTLER TEK YERDE: THC / çözücü / nem ön spesifikasyonları
 * `kabul.ts` LIMIT'inden okunur (kural 1), burada yeniden yazılmaz.
 * Ağır metal / pestisit / mikotoksin / mikrobiyoloji için doküman setinde
 * sayısal limit YOKTUR ("Spesifikasyon içinde") — uydurup hard-code etmek
 * dokümanla yazılımı çelişkiye düşürürdü; serbest metin spesifikasyon +
 * laboratuvarın E/H hükmü esastır.
 *
 * Dosya saf: veritabanı bilmiyor, `test/birim/analiz.mjs` ile sınanıyor.
 */

import { LIMIT, bicimSayi } from "./kabul.ts";

export interface AnalizParametresi {
  /** Kanonik kod — veritabanındaki `analiz_sonuclari.parametre` değeri. */
  kod: string;
  /** FRM-KK-09 analiz sertifikası satır adı. */
  ad: string;
  /** FRM-KK-08 talep formundaki ad (farklıysa). */
  talepAd?: string;
  /**
   * "Uygulanması hâlinde" parametreleri (SOP-KK-04): terpen profili ve
   * organik çözücü kalıntısı her lotta ölçülmek zorunda değil.
   */
  opsiyonel: boolean;
  /** Karara sayısal değeriyle giren parametreler (THC yasal sınır, CBD). */
  sayisalZorunlu: boolean;
  /** Formda ön dolu gelen spesifikasyon; serbest metinliler düzenlenebilir. */
  onSpesifikasyon: string;
  birim?: string;
}

export const ANALIZ_PARAMETRELERI: readonly AnalizParametresi[] = [
  { kod: "THC", ad: "Δ9-THC", opsiyonel: false, sayisalZorunlu: true,
    onSpesifikasyon: `≤ %${bicimSayi(LIMIT.hamThcMax, 1)}`, birim: "%" },
  { kod: "CBD", ad: "CBD", opsiyonel: false, sayisalZorunlu: true,
    onSpesifikasyon: "Beyan edilen değer", birim: "%" },
  { kod: "PROFIL", ad: "Kannabinoid profili", opsiyonel: false, sayisalZorunlu: false,
    onSpesifikasyon: "Spesifikasyon içinde" },
  { kod: "AGIR_METAL", ad: "Ağır metaller (Pb, Cd, Hg, As)", opsiyonel: false, sayisalZorunlu: false,
    onSpesifikasyon: "Spesifikasyon içinde" },
  { kod: "PESTISIT", ad: "Pestisit kalıntıları", opsiyonel: false, sayisalZorunlu: false,
    onSpesifikasyon: "Spesifikasyon içinde" },
  { kod: "YABANCI_MADDE", ad: "Yabancı madde", opsiyonel: false, sayisalZorunlu: false,
    onSpesifikasyon: "Spesifikasyon içinde" },
  { kod: "NEM", ad: "Nem", opsiyonel: false, sayisalZorunlu: false,
    onSpesifikasyon: `≤ %${bicimSayi(LIMIT.nemMax, 0)}`, birim: "%" },
  { kod: "MIKOTOKSIN", ad: "Mikotoksinler (aflatoksin, okratoksin A)", opsiyonel: false, sayisalZorunlu: false,
    onSpesifikasyon: "Spesifikasyon içinde" },
  { kod: "MIKROBIYOLOJI", ad: "Mikrobiyolojik yük", opsiyonel: false, sayisalZorunlu: false,
    onSpesifikasyon: "Spesifikasyon içinde" },
  { kod: "TERPEN", ad: "Terpen profili", talepAd: "Terpen profili (uygulanması hâlinde)",
    opsiyonel: true, sayisalZorunlu: false, onSpesifikasyon: "Bilgi amaçlı / spesifikasyon içinde" },
  { kod: "COZUCU", ad: "Organik çözücü kalıntısı", talepAd: "Kalıntı çözücü (uygulanması hâlinde)",
    opsiyonel: true, sayisalZorunlu: false,
    onSpesifikasyon: `≤ ${bicimSayi(LIMIT.cozucuMax, 0)} ppm`, birim: "ppm" },
] as const;

/** Zorunlu (opsiyonel olmayan) parametre kodları — D-19 ve API doğrulaması. */
export const ZORUNLU_PARAMETRELER: readonly string[] = ANALIZ_PARAMETRELERI
  .filter((p) => !p.opsiyonel)
  .map((p) => p.kod);

export function parametreBul(kod: string): AnalizParametresi | undefined {
  return ANALIZ_PARAMETRELERI.find((p) => p.kod === kod);
}

/** API'den gelen tek analiz satırı. */
export interface AnalizSatiri {
  parametre: string;
  spesifikasyon: string;
  /** Laboratuvar sonucu, metin olarak ("0,184", "Spesifikasyon içinde"...). */
  sonuc: string;
  /** Sayısal karşılık — THC/CBD'de zorunlu, diğerlerinde olabilir. */
  sayisal_deger: number | null;
  birim: string | null;
  yontem: string | null;
  akredite: boolean | null;
  akredite_no: string | null;
  loq: number | null;
  /** Laboratuvarın hükmü: sonuç spesifikasyonu karşılıyor mu. */
  uygun: boolean;
  aciklama: string | null;
}

/**
 * Tek satırın iç tutarlılığı. Hata listesi döner; boş liste = geçerli.
 *
 * Alan tipleri API katmanında `dogrula.ts` ile ayrıca denetlenir; burada
 * yalnızca PARAMETRE KURALLARI var — bilinmeyen kod, sayısal zorunluluk.
 */
export function satirDogrula(s: AnalizSatiri): string[] {
  const hatalar: string[] = [];
  const p = parametreBul(s.parametre);
  if (!p) {
    hatalar.push(`Bilinmeyen analiz parametresi: ${s.parametre}`);
    return hatalar;
  }
  if (!s.sonuc.trim()) {
    hatalar.push(`${p.ad}: sonuç boş olamaz`);
  }
  if (p.sayisalZorunlu && (s.sayisal_deger === null || !Number.isFinite(s.sayisal_deger))) {
    hatalar.push(`${p.ad}: sayısal değer zorunlu`);
  }
  return hatalar;
}

export interface AnalizDegerlendirme {
  /** hamMaddeKarari'na giden türetilmiş alanlar. */
  thc: number;
  cbd: number;
  onbirAnalizUygun: boolean;
  /** Satır setinin yapısal engelleri (eksik/mükerrer/uygunsuz parametreler). */
  engeller: string[];
  /** Uygunsuz işaretlenen parametrelerin adları — sapma açıklaması için. */
  uygunsuzlar: string[];
}

/**
 * Satır setini değerlendirir ve `hamMaddeKarari` girdilerini türetir.
 *
 * `onbirAnalizUygun` artık operatör beyanı DEĞİL: tüm zorunlu satırlar
 * mevcut + uygun ve gönderilen opsiyonel satırlar da uygun ise true.
 * Opsiyonel satırın hiç gönderilmemesi serbesttir ("uygulanmadı") —
 * gönderilip uygunsuz işaretlenmesi ise engeldir: yapılmış bir ölçümün
 * uygunsuz sonucu, ölçümün opsiyonel olmasıyla aklanamaz.
 */
export function analizDegerlendir(satirlar: AnalizSatiri[]): AnalizDegerlendirme {
  const engeller: string[] = [];
  const uygunsuzlar: string[] = [];
  const gorulen = new Set<string>();

  for (const s of satirlar) {
    engeller.push(...satirDogrula(s));
    if (gorulen.has(s.parametre)) {
      engeller.push(`${parametreBul(s.parametre)?.ad ?? s.parametre}: aynı parametre iki kez gönderilemez`);
    }
    gorulen.add(s.parametre);
  }

  for (const kod of ZORUNLU_PARAMETRELER) {
    if (!gorulen.has(kod)) {
      engeller.push(`${parametreBul(kod)!.ad}: zorunlu analiz sonucu eksik`);
    }
  }

  for (const s of satirlar) {
    if (!s.uygun && parametreBul(s.parametre)) {
      uygunsuzlar.push(parametreBul(s.parametre)!.ad);
    }
  }

  const thcSatir = satirlar.find((s) => s.parametre === "THC");
  const cbdSatir = satirlar.find((s) => s.parametre === "CBD");
  const thc = thcSatir?.sayisal_deger ?? NaN;
  const cbd = cbdSatir?.sayisal_deger ?? NaN;

  // SAVUNMA KATMANI: laboratuvar THC satırını "uygun" işaretlemiş ama sayı
  // yasal sınırın üzerindeyse sistem buna kanmaz — nihai hüküm yine
  // hamMaddeKarari'nda ama tutarsızlık burada da adıyla yakalanır.
  if (thcSatir?.uygun && Number.isFinite(thc) && thc > LIMIT.hamThcMax) {
    engeller.push(
      `Δ9-THC satırı "uygun" işaretli ama değer %${bicimSayi(thc, 3)} yasal sınırın (%${bicimSayi(LIMIT.hamThcMax, 1)}) üzerinde`
    );
  }

  const onbirAnalizUygun = engeller.length === 0 && uygunsuzlar.length === 0;
  return { thc, cbd, onbirAnalizUygun, engeller, uygunsuzlar };
}
