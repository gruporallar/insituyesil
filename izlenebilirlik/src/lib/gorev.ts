/**
 * PERİYODİK GÖREV TAKVİMİ ve GERİ SAYIMLAR.
 *
 * SOP'lardaki "günlük / haftalık / aylık / 6 aylık / yıllık" hükümleri bir
 * kural tablosuna alınıyor; bu dosya o kuralları TAKVİME çeviriyor.
 *
 * SİSTEMİN GxP SINIRI, AÇIKÇA: sahada ölçülen değer bu sistemde TUTULMUYOR.
 * Asıl kayıt, ıslak imzalı kâğıt formdur. Sistem yalnızca (a) hangi işin ne
 * zaman yapılması gerektiğini, (b) formun basılıp basılmadığını, (c) imzalı
 * kâğıdın arşive dönüp dönmediğini izler. Bu sınır, elektronik imza ve tam
 * bilgisayarlı sistem validasyonu yükünü kaldırıyor — ama iki yerde GxP
 * riski BIRAKIYOR ve o riskler kodda karşılanmalı:
 *
 *   1. TAKVİM EKSİKSE — sistem "bugün iş yok" der, oysa aylık kalibrasyonun
 *      vadesi gelmiştir. Kaçırılmış GMP faaliyetinin sebebi sistem olur.
 *      Karşılığı: kural tablosu ONAYSIZ görev üretmez ve her kural kendi
 *      SOP+madde referansını taşır — denetçi tek tek doğrulayabilir.
 *
 *   2. DÖNEM ATLANIRSA — üretim tekrarlanabilir olmalı; aynı dönem için
 *      ikinci görev de, hiç görev olmaması da hatadır. Karşılığı:
 *      `donemAnahtari` deterministik ve veritabanında UNIQUE(kural, dönem).
 *
 * Dosya saf: veritabanı bilmiyor, `test/birim/gorev.mjs` ile sınanıyor.
 */

export const PERIYOTLAR = {
  GUNLUK: { ad: "Günlük", olcek: "gun" },
  HAFTALIK: { ad: "Haftalık", olcek: "hafta" },
  AYLIK: { ad: "Aylık", olcek: "ay" },
  UC_AYLIK: { ad: "Üç aylık", olcek: "ceyrek" },
  ALTI_AYLIK: { ad: "Altı aylık", olcek: "yariyil" },
  YILLIK: { ad: "Yıllık", olcek: "yil" },
  IKI_YILLIK: { ad: "İki yıllık", olcek: "ikiyil" },
} as const;

export type Periyot = keyof typeof PERIYOTLAR;
export const PERIYOT_KODLARI = Object.keys(PERIYOTLAR) as Periyot[];

export function periyotMu(v: unknown): v is Periyot {
  return typeof v === "string" && v in PERIYOTLAR;
}

const GUN = 86_400_000;

/** ISO tarihten UTC Date — saat dilimi kayması olmadan. */
function tarihe(iso: string): Date {
  const [y, a, g] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, a - 1, g));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** İki ISO tarih arasındaki tam gün farkı (a − b). */
export function gunFarki(a: string, b: string): number {
  return Math.round((tarihe(a).getTime() - tarihe(b).getTime()) / GUN);
}

/**
 * ISO 8601 hafta numarası.
 *
 * "Yılın kaçıncı haftası" sorusunun cevabı ülkeye göre değişiyor; ISO 8601
 * kuralı kullanılıyor (haftanın yılı, o haftanın PERŞEMBESİNİN yılıdır).
 * Yıl sınırındaki haftalarda naif hesap 1 Ocak'ı bazen 53. hafta bazen 1.
 * hafta sayıyor — dönem anahtarı kayarsa aynı iş için ikinci görev açılır.
 */
function isoHafta(d: Date): { yil: number; hafta: number } {
  const t = new Date(d.getTime());
  const gun = t.getUTCDay() || 7; // Pazar = 7
  t.setUTCDate(t.getUTCDate() + 4 - gun);
  const yilBasi = Date.UTC(t.getUTCFullYear(), 0, 1);
  const hafta = Math.ceil(((t.getTime() - yilBasi) / GUN + 1) / 7);
  return { yil: t.getUTCFullYear(), hafta };
}

/**
 * Bir tarihin hangi DÖNEME düştüğü — görev tekilliğinin anahtarı.
 *
 * Veritabanında UNIQUE(kural_kod, donem) var; üretim her istekte yeniden
 * çalışsa bile aynı dönem için ikinci görev açılmıyor. Bu yüzden anahtar
 * deterministik olmalı ve bugünün saatinden etkilenmemeli.
 */
export function donemAnahtari(periyot: Periyot, isoTarih: string): string {
  const d = tarihe(isoTarih);
  const yil = d.getUTCFullYear();
  const ay = d.getUTCMonth() + 1;

  switch (PERIYOTLAR[periyot].olcek) {
    case "gun":
      return iso(d);
    case "hafta": {
      const h = isoHafta(d);
      return `${h.yil}-W${String(h.hafta).padStart(2, "0")}`;
    }
    case "ay":
      return `${yil}-${String(ay).padStart(2, "0")}`;
    case "ceyrek":
      return `${yil}-Q${Math.ceil(ay / 3)}`;
    case "yariyil":
      return `${yil}-H${ay <= 6 ? 1 : 2}`;
    case "yil":
      return String(yil);
    case "ikiyil": {
      // Çift yıllarda başlayan iki yıllık blok: 2026-2027, 2028-2029…
      const bas = yil - (yil % 2);
      return `${bas}-${bas + 1}`;
    }
  }
}

/**
 * Dönemin SON GÜNÜ — görevin vadesi.
 *
 * Vade dönem sonu; "aylık stok sayımı" ayın herhangi bir günü yapılabilir ama
 * ay bittiğinde yapılmamışsa gecikmiştir. Dönem başını vade saymak, ayın
 * ikisinde yapılan sayımı gecikmiş gösterirdi.
 */
export function donemVadesi(periyot: Periyot, donem: string): string {
  const olcek = PERIYOTLAR[periyot].olcek;

  if (olcek === "gun") return donem;

  if (olcek === "hafta") {
    const [y, h] = donem.split("-W").map(Number);
    // ISO: 4 Ocak her zaman 1. haftadadır; oradan geriye pazartesiyi bul.
    const dorduncu = new Date(Date.UTC(y, 0, 4));
    const pazartesi = new Date(dorduncu.getTime());
    pazartesi.setUTCDate(dorduncu.getUTCDate() - ((dorduncu.getUTCDay() || 7) - 1) + (h - 1) * 7);
    const pazar = new Date(pazartesi.getTime() + 6 * GUN);
    return iso(pazar);
  }

  if (olcek === "ay") {
    const [y, a] = donem.split("-").map(Number);
    return iso(new Date(Date.UTC(y, a, 0))); // sonraki ayın 0'ı = bu ayın son günü
  }

  if (olcek === "ceyrek") {
    const [y, q] = donem.split("-Q").map(Number);
    return iso(new Date(Date.UTC(y, q * 3, 0)));
  }

  if (olcek === "yariyil") {
    const [y, h] = donem.split("-H").map(Number);
    return iso(new Date(Date.UTC(y, h * 6, 0)));
  }

  if (olcek === "yil") return `${donem}-12-31`;

  // ikiyil: "2026-2027" → ikinci yılın sonu
  const bitis = Number(donem.split("-")[1]);
  return `${bitis}-12-31`;
}

/**
 * Bir kural için, verilen pencerede açılması gereken dönemler.
 *
 * PENCERE SINIRLI: `enFazla` ile kapatılıyor. Yıllardır çalıştırılmamış bir
 * kuralın günlük görevleri binlerce satır üretebilirdi; sınır hem veritabanını
 * hem ekranı koruyor. Sınıra dayanıldığında çağıran taraf bunu görüyor
 * (`kirpildi`) ve sessizce eksik takvim göstermiyor.
 */
export function donemler(
  periyot: Periyot,
  baslangic: string,
  bitis: string,
  enFazla = 400
): { donemler: string[]; kirpildi: boolean } {
  if (gunFarki(bitis, baslangic) < 0) return { donemler: [], kirpildi: false };

  const cikti: string[] = [];
  const gorulen = new Set<string>();
  let imlec = tarihe(baslangic);
  const son = tarihe(bitis);

  // Adım GÜN GÜN değil, dönemin kendi ölçeğinde ilerliyor — ama günlük
  // periyotta zaten gün gün. Her adımda anahtar hesaplanıp tekilleştiriliyor;
  // ay uzunlukları eşit olmadığı için "30 gün ekle" yaklaşımı şubatta kayardı.
  while (imlec.getTime() <= son.getTime()) {
    const d = donemAnahtari(periyot, iso(imlec));
    if (!gorulen.has(d)) {
      gorulen.add(d);
      cikti.push(d);
      if (cikti.length >= enFazla) return { donemler: cikti, kirpildi: true };
    }
    imlec = new Date(imlec.getTime() + GUN);
  }

  return { donemler: cikti, kirpildi: false };
}

// ── Görev durumu ────────────────────────────────────────────────────────────

/** Görevin yaşam döngüsü. Sahada yazılan VERİ değil, işin AŞAMASI izleniyor. */
export const GOREV_DURUMLARI = ["ACIK", "BASILDI", "TESLIM", "ARSIV", "IPTAL"] as const;
export type GorevDurumu = (typeof GOREV_DURUMLARI)[number];

export const GOREV_DURUM_ETIKET: Record<GorevDurumu, string> = {
  ACIK: "Açıldı",
  BASILDI: "Form basıldı",
  TESLIM: "Sahaya teslim edildi",
  ARSIV: "İmzalı kayıt arşivde",
  IPTAL: "İptal",
};

export type VadeDurumu = "TAMAM" | "GECIKMIS" | "BUGUN" | "BEKLIYOR" | "IPTAL";

/**
 * Görevin vade durumu.
 *
 * TAMAMLANMA ÖLÇÜTÜ "ARŞİV", "BASILDI" DEĞİL. Form basılmış olması işin
 * yapıldığını göstermez; bir GMP kaydı ancak imzalı kâğıt arşive girdiğinde
 * vardır. Basılıp kaybolan form, hiç basılmamış formdan daha tehlikelidir:
 * seri numarası dağıtılmış ama karşılığı olmayan bir belge ortada dolaşır.
 */
export function vadeDurumu(vade: string, durum: GorevDurumu, bugun: string): VadeDurumu {
  if (durum === "IPTAL") return "IPTAL";
  if (durum === "ARSIV") return "TAMAM";
  const fark = gunFarki(vade, bugun);
  if (fark < 0) return "GECIKMIS";
  if (fark === 0) return "BUGUN";
  return "BEKLIYOR";
}

export interface GorevKaydi {
  kod: string;
  vade: string;
  durum: GorevDurumu;
  /** İmzalı kaydın arşive girdiği tarih — uyum hesabının ölçütü. */
  arsiv_tarih?: string | null;
}

export interface UyumOzeti {
  /** Vadesi geçmiş (yani hükmü verilebilir) görev sayısı. */
  degerlendirilen: number;
  zamaninda: number;
  gecikmis: number;
  /** Yüzde — değerlendirilecek görev yoksa null ("veri yok" ile "%0" farklı). */
  oran: number | null;
}

/**
 * Periyodik görev uyumu.
 *
 * YALNIZCA VADESİ GEÇMİŞ görevler değerlendiriliyor: gelecek haftanın görevi
 * "yapılmamış" değildir. Bu ayrım olmasaydı takvim ileriye doğru uzadıkça
 * uyum oranı kendiliğinden düşer, sayı anlamsızlaşırdı.
 *
 * "Zamanında" ölçütü: imzalı kayıt VADEDE VEYA ÖNCE arşive girmiş. Geç
 * arşivlenen görev tamamlanmıştır ama zamanında değildir — GMP'de en sık
 * bulgu tam olarak budur ("kayıt var ama tarihinde değil").
 */
export function uyumOzeti(gorevler: GorevKaydi[], bugun: string): UyumOzeti {
  let degerlendirilen = 0;
  let zamaninda = 0;

  for (const g of gorevler) {
    if (g.durum === "IPTAL") continue;
    if (gunFarki(g.vade, bugun) >= 0) continue; // vadesi gelmemiş
    degerlendirilen++;
    if (g.durum === "ARSIV" && g.arsiv_tarih && gunFarki(g.arsiv_tarih, g.vade) <= 0) {
      zamaninda++;
    }
  }

  return {
    degerlendirilen,
    zamaninda,
    gecikmis: degerlendirilen - zamaninda,
    oran: degerlendirilen === 0 ? null : Math.round((zamaninda / degerlendirilen) * 100),
  };
}

// ── Geri sayımlar ───────────────────────────────────────────────────────────

export type GeriSayimDurumu = "NORMAL" | "YAKLASIYOR" | "DOLDU";

export interface GeriSayimSonucu {
  bitis: string;
  kalanGun: number;
  durum: GeriSayimDurumu;
}

/**
 * Bir olaydan başlayan azami süre — SOP-DE-06 md. 5.4 tipi hükümler.
 *
 * Örnek: kannabinoid içeren imha bekleyen atık 15 gün, ret malzeme 30 gün,
 * posa 7 gün. Bu süreler İŞLETME TERCİHİ DEĞİL, prosedür hükmü; dolduğunda
 * ön denetim kritik bulgu üretiyor çünkü kayıt dışı kalan kannabinoid,
 * TİTCK ve İl Tarım açısından "kayıp" anlamına geliyor.
 *
 * `uyariGun` süreyi KISALTMAZ, yalnızca erken uyarır: 15 günlük sürede 3 gün
 * kala uyarmak, 12 güne indirmek değildir.
 */
export function geriSayim(
  baslangic: string,
  sureGun: number,
  bugun: string,
  uyariGun = 3
): GeriSayimSonucu {
  const bitis = iso(new Date(tarihe(baslangic).getTime() + sureGun * GUN));
  const kalanGun = gunFarki(bitis, bugun);
  return {
    bitis,
    kalanGun,
    durum: kalanGun < 0 ? "DOLDU" : kalanGun <= uyariGun ? "YAKLASIYOR" : "NORMAL",
  };
}

/** Uyarı eşiği: uzun sürelerde 3 gün çok geç, kısa sürelerde 30 gün çok erken. */
export function varsayilanUyariGun(sureGun: number): number {
  if (sureGun <= 10) return 2;
  if (sureGun <= 40) return 5;
  if (sureGun <= 120) return 15;
  return 30;
}
