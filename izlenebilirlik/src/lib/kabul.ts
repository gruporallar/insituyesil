/**
 * KABUL KRİTERLERİ — TEK YER.
 *
 * Bu dosyadaki sayılar Ek-13 "Kritik Kontrol Noktaları Özeti" tablosundan ve
 * SOP-ÜR-16 md. 5.2'den geliyor. Uygulamanın hiçbir yerinde bu eşikler yeniden
 * yazılmaz — bir eşiği değiştirmek gerekiyorsa burada değişir.
 *
 * NEDEN AYRI VE SAF DOSYA: bu kurallar sistemin var oluş sebebi. Yasal sınırı
 * aşan bir lotun üretime girmesini engelleyen kod, veritabanına ya da HTTP
 * isteğine bağlı olmamalı ki birim testiyle doğrulanabilsin. `test/birim/kabul.mjs`
 * bu dosyayı doğrudan çağırıyor.
 *
 * BU DOSYA `import` ETMEZ. Node `--experimental-strip-types` ile doğrudan
 * çalıştırılıyor; bir bağımlılık eklemek test yolunu kırar.
 */

import type { UrunTipi } from "./types";

export const LIMIT = {
  /** Ham maddede Δ9-THC üst sınırı (%). Yasal sınır — aşan lot üretime giremez. */
  hamThcMax: 0.3,
  /** Bitmiş üründe Δ9-THC üst sınırı (%). */
  urunThcMax: 0.3,
  /** CBD distilat asgari saflık (%). Ek-13 adım 9. */
  cbdDistilatMin: 80,
  /** CBD izolat asgari saflık (%). Ek-13 adım 10. */
  cbdIzolatMin: 99,
  /** Kalıntı çözücü üst sınırı (ppm). Ek-13 adım 7 ve 10. */
  cozucuMax: 5000,
  /** Ham maddede nem üst sınırı (%). Ek-13 adım 3. */
  nemMax: 10,
  /** Kütle denkliği kabul aralığı (%). SOP-ÜR-16 md. 5.2. */
  mbAlt: 98,
  mbUst: 102,
  /** Ekstraksiyon asgari verim (%). Ek-13 adım 5. */
  verimMin: 12,
} as const;

/** Ürün tipine göre asgari CBD saflığı. */
export function cbdAsgari(urunTipi: UrunTipi): number {
  return urunTipi === "IZOLAT" ? LIMIT.cbdIzolatMin : LIMIT.cbdDistilatMin;
}

// ── Kütle denkliği ───────────────────────────────────────────────────────────

/**
 * Kütle denkliği yüzdesi: (çıktı + fire + numune) / girdi × 100.
 *
 * Girdi sıfır veya negatifse `null` döner — "hesaplanamadı" ile "%0" farklı
 * şeyler. %0 sanki ölçüm yapılmış ve her şey kaybolmuş gibi okunur; bu da
 * araştırma açtırır. Girdisi olmayan bir seri zaten olamaz.
 */
export function kutleDenkligi(
  girdiKg: number,
  ciktiKg: number,
  fireKg: number,
  numuneKg: number
): number | null {
  if (!(girdiKg > 0)) return null;
  return ((ciktiKg + fireKg + numuneKg) / girdiKg) * 100;
}

export function kutleDenkligiUygun(mb: number | null): boolean {
  if (mb === null || !Number.isFinite(mb)) return false;
  return mb >= LIMIT.mbAlt && mb <= LIMIT.mbUst;
}

// ── Ham madde kabul kararı ───────────────────────────────────────────────────

export interface HamMaddeAnaliz {
  thc: number;
  cbd: number;
  /** 11 zorunlu analizin tamamı uygun mu? (Ek-13 adım 2) */
  onbirAnalizUygun: boolean;
}

export interface KararSonucu {
  statu: "SERBEST" | "RET";
  /** Ret sebepleri. SERBEST'te boş dizi. */
  engeller: string[];
}

/**
 * Ham madde lotu için kabul/ret kararı — Ek-13 adım 2, SOP-KK-05.
 *
 * THC sınırı YASAL; bu karar operatör takdirine bırakılamaz, o yüzden
 * fonksiyon "öneri" değil karar döndürüyor.
 */
export function hamMaddeKarari(a: HamMaddeAnaliz): KararSonucu {
  const engeller: string[] = [];

  if (!Number.isFinite(a.thc)) {
    engeller.push("Δ9-THC değeri okunamadı");
  } else if (a.thc > LIMIT.hamThcMax) {
    engeller.push(
      `Δ9-THC %${bicimSayi(a.thc, 3)} — yasal sınır %${bicimSayi(LIMIT.hamThcMax, 1)} aşıldı`
    );
  }

  if (!Number.isFinite(a.cbd) || a.cbd < 0) {
    engeller.push("CBD değeri okunamadı");
  }

  if (!a.onbirAnalizUygun) {
    engeller.push("11 zorunlu analizden en az biri uygunsuz");
  }

  return { statu: engeller.length ? "RET" : "SERBEST", engeller };
}

// ── Seri serbest bırakma kararı ──────────────────────────────────────────────

export interface SeriDegerlendirme {
  urunTipi: UrunTipi;
  girdiKg: number;
  ciktiKg: number;
  fireKg: number;
  numuneKg: number;
  cbd: number;
  thc: number;
  /** Kalıntı çözücü (ppm). Ölçülmediyse null. */
  cozucu: number | null;
  /** Açık sapma veya kapanmamış CAPA kaydı var mı? (SOP-KG-03) */
  acikSapma: boolean;
}

export interface SeriKarari extends KararSonucu {
  mb: number | null;
}

/**
 * Seri serbest bırakma kararı — Ek-13 adım 14–15, SOP-ÜR-13 ve SOP-ÜR-16.
 *
 * TÜM engeller birden toplanıyor, ilkinde durulmuyor: KG-KK'nın bir seriyi
 * neden reddettiğini tek bakışta görmesi gerekiyor. Sırayla düzeltilen
 * uygunsuzluklar her seferinde yeni bir ret kaydı üretirdi.
 */
export function seriKarari(d: SeriDegerlendirme): SeriKarari {
  const engeller: string[] = [];
  const mb = kutleDenkligi(d.girdiKg, d.ciktiKg, d.fireKg, d.numuneKg);

  if (!kutleDenkligiUygun(mb)) {
    engeller.push(
      mb === null
        ? "Kütle denkliği hesaplanamadı — girdi miktarı geçersiz"
        : `Kütle denkliği %${bicimSayi(mb, 1)} — kabul aralığı %${LIMIT.mbAlt}–${LIMIT.mbUst} dışında`
    );
  }

  if (!Number.isFinite(d.thc)) {
    engeller.push("Δ9-THC değeri okunamadı");
  } else if (d.thc > LIMIT.urunThcMax) {
    engeller.push(
      `Δ9-THC %${bicimSayi(d.thc, 3)} — sınır %${bicimSayi(LIMIT.urunThcMax, 1)} aşıldı`
    );
  }

  const cbdMin = cbdAsgari(d.urunTipi);
  if (!Number.isFinite(d.cbd)) {
    engeller.push("CBD değeri okunamadı");
  } else if (d.cbd < cbdMin) {
    engeller.push(`CBD %${bicimSayi(d.cbd, 2)} — asgari %${cbdMin} altında`);
  }

  // NULL "ölçülmedi" demek, "uygun" demek DEĞİL — ama serbest bırakmayı da
  // engellemiyor: her proseste çözücü kullanılmıyor. Kullanıldıysa ölçüm
  // zorunluluğu SOP-KK-08'de, formda.
  if (d.cozucu !== null && Number.isFinite(d.cozucu) && d.cozucu > LIMIT.cozucuMax) {
    engeller.push(
      `Kalıntı çözücü ${bicimSayi(d.cozucu, 0)} ppm — sınır ${LIMIT.cozucuMax} ppm aşıldı`
    );
  }

  if (d.acikSapma) {
    engeller.push("Açık sapma veya kapanmamış CAPA kaydı var");
  }

  return { statu: engeller.length ? "RET" : "SERBEST", engeller, mb };
}

// ── Etiket mutabakatı ────────────────────────────────────────────────────────

export interface MutabakatSayimi {
  /** Basılan toplam etiket adedi. */
  basilan: number;
  /** Ambalaj birimine yapıştırılan adet. */
  kullanilan: number;
  /** Baskı/yapıştırma sırasında bozulan adet. */
  bozuk: number;
  /** Bozuk etiketlerden imha edilen adet. */
  imhaEdilen: number;
}

/**
 * Etiket mutabakat farkı — FRM-ÜR-12, Ek-13 kritik kontrol noktası §13.
 *
 * Fark = basılan − (kullanılan + imha edilen).
 *
 * `bozuk` ÇIKARILMIYOR, `imhaEdilen` çıkarılıyor. Sebebi: bozuk bir etiket
 * hâlâ ortada duran, üzerinde tekil karekod olan fiziksel bir nesnedir.
 * Hesaptan düşülmesi ancak imha edildiğinde doğru olur. Aksi halde "bozuldu"
 * demek, kayıp bir etiketi kapatmanın kolay yolu haline gelirdi — ki
 * mutabakatın var oluş sebebi tam olarak bunu engellemek.
 */
export function mutabakatFarki(s: MutabakatSayimi): number {
  return s.basilan - (s.kullanilan + s.imhaEdilen);
}

/** Ek-13 §13: FARK = 0. Sıfır dışındaki her değer sevkiyatı durdurur. */
export function mutabakatUygun(fark: number): boolean {
  return fark === 0;
}

/**
 * Mutabakat kaydı için engel listesi.
 *
 * Tutarsız sayımları da yakalıyor: imha edilen adet bozuk adedini aşamaz
 * (sağlam etiket imha edilmez), kullanılan + bozuk basılanı aşamaz.
 */
export function mutabakatKarari(s: MutabakatSayimi): KararSonucu & { fark: number } {
  const engeller: string[] = [];
  const alanlar: [keyof MutabakatSayimi, string][] = [
    ["basilan", "Basılan"],
    ["kullanilan", "Kullanılan"],
    ["bozuk", "Bozuk"],
    ["imhaEdilen", "İmha edilen"],
  ];

  for (const [k, ad] of alanlar) {
    if (!Number.isInteger(s[k]) || s[k] < 0) engeller.push(`${ad} adedi tam sayı ve sıfırdan büyük olmalı`);
  }

  if (engeller.length) return { statu: "RET", engeller, fark: NaN };

  if (s.imhaEdilen > s.bozuk) {
    engeller.push(`İmha edilen (${s.imhaEdilen}) bozuk adedini (${s.bozuk}) aşamaz`);
  }
  if (s.kullanilan + s.bozuk > s.basilan) {
    engeller.push(
      `Kullanılan + bozuk (${s.kullanilan + s.bozuk}) basılan adedi (${s.basilan}) aşamaz`
    );
  }

  const fark = mutabakatFarki(s);
  if (engeller.length === 0 && !mutabakatUygun(fark)) {
    engeller.push(
      fark > 0
        ? `FARK = ${fark}. ${fark} etiketin akıbeti belirsiz — hesaba geçmeyen etiket sahte ürün riski taşır.`
        : `FARK = ${fark}. Basılandan fazla etiket kullanılmış görünüyor; sayım hatalı.`
    );
  }

  return { statu: engeller.length ? "RET" : "SERBEST", engeller, fark };
}

// ── Biçimleme ────────────────────────────────────────────────────────────────

/**
 * Türkçe ondalık ayırıcıyla sayı biçimleme.
 *
 * `toLocaleString("tr-TR")` KULLANILMIYOR: Node'un ICU'su eksik derlenmişse
 * sessizce İngilizce biçime düşüyor ve GMP kaydında "0.3" ile "0,3" arasındaki
 * fark denetimde soru işareti oluyor. Elle değiştirmek deterministik.
 */
export function bicimSayi(n: number | null | undefined, basamak = 2): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  const s = Number(n).toFixed(basamak);
  const [tam, kesir] = s.split(".");
  // Binlik ayırıcı: 1234567 → 1.234.567
  const tamAyrilmis = tam.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return kesir ? `${tamAyrilmis},${kesir}` : tamAyrilmis;
}
