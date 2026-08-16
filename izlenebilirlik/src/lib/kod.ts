/**
 * KAYIT KODLARI — biçim ve ayrıştırma.
 *
 * Kod biçimleri GMP doküman kodlamasıyla tutarlı: okunduğunda ne olduğu ve
 * hangi yıla ait olduğu anlaşılır. Bir denetçi kaydı elle takip edebilmeli.
 *
 *   CF-001                 çiftçi / ham madde tedarikçisi
 *   HM-2026-0001           ham madde lotu
 *   CBD-D-2026-0001        üretim serisi — distilat
 *   CBD-I-2026-0001        üretim serisi — izolat
 *   T00000001              ambalaj biriminin tekil seri numarası
 *   SVK-2026-0001          sevkiyat
 *   SAT-2026-00001         hastaya satış
 *   BUTS-2026-00001        BÜTS bildirimi
 *   DP-001 / EC-001        ecza deposu / eczane
 *
 * Sayaçlar veritabanında; bu dosya yalnızca biçimlendirir ve tanır. Saf tutuldu
 * ki `test/birim/kod.mjs` doğrudan çağırabilsin.
 */

import type { UrunTipi } from "./types";

function pad(n: number, uzunluk: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Geçersiz sıra numarası: ${n}`);
  const s = String(n);
  // Sayaç tanımlı uzunluğu aşarsa KIRPMA YOK. Kırpmak iki farklı kaydı aynı
  // koda düşürür; izlenebilirlik sisteminde bu sessiz bir veri kaybıdır.
  return s.length >= uzunluk ? s : s.padStart(uzunluk, "0");
}

export const kodCiftci = (n: number) => `CF-${pad(n, 3)}`;
export const kodHamMadde = (yil: number, n: number) => `HM-${yil}-${pad(n, 4)}`;
export const kodTekil = (n: number) => `T${pad(n, 8)}`;
export const kodSevkiyat = (yil: number, n: number) => `SVK-${yil}-${pad(n, 4)}`;
export const kodSatis = (yil: number, n: number) => `SAT-${yil}-${pad(n, 5)}`;
export const kodButs = (yil: number, n: number) => `BUTS-${yil}-${pad(n, 5)}`;
/** Sapma / CAPA kaydı — SOP-KG-03. */
export const kodSapma = (yil: number, n: number) => `SAP-${yil}-${pad(n, 4)}`;
/** İmha tutanağı — SOP-ÜR-15, FRM-ÜR-16. */
export const kodImha = (yil: number, n: number) => `IMH-${yil}-${pad(n, 4)}`;
/** Şahit numune — SOP-KK-10. */
export const kodNumune = (yil: number, n: number) => `NUM-${yil}-${pad(n, 4)}`;
/** Periyodik görev kuralı — SOP maddesinin makine okunur karşılığı. */
export const kodKural = (n: number) => `GK-${pad(n, 3)}`;
/** Takvime düşmüş görev örneği. */
export const kodGorev = (yil: number, n: number) => `GRV-${yil}-${pad(n, 5)}`;
/**
 * Form baskı seri numarası — her fiziksel nüshanın tekil kimliği.
 *
 * Beş hane: günlük formlarda yılda birkaç bin baskı oluyor; dört hane
 * ikinci yılda dolardı ve sayaç taşması, iki farklı kâğıda aynı seri
 * numarasının basılması demekti.
 */
export const kodBaski = (yil: number, n: number) => `BSK-${yil}-${pad(n, 5)}`;
/** Geri sayımlı kayıt (atık bekleme, sözleşme/lisans yenileme). */
export const kodSureli = (yil: number, n: number) => `SUR-${yil}-${pad(n, 4)}`;

export const kodAlici = (tip: "DEPO" | "ECZANE", n: number) =>
  `${tip === "ECZANE" ? "EC" : "DP"}-${pad(n, 3)}`;

export const kodSeri = (urunTipi: UrunTipi, yil: number, n: number) =>
  `CBD-${urunTipi === "IZOLAT" ? "I" : "D"}-${yil}-${pad(n, 4)}`;

// ── Tanıma ───────────────────────────────────────────────────────────────────

export type KayitTipi = "PAKET" | "SERI" | "HAMMADDE" | "CIFTCI" | "SEVKIYAT" | "SATIS" | "BILINMEYEN";

/**
 * Bir arama metninin hangi kayıt tipine ait olduğunu biçimden anlar.
 *
 * İzleme sorgusunda kullanıcı tek bir kutuya her şeyi yazıyor. Sırayla dört
 * tabloya sormak yerine biçimden ayırt etmek, gereksiz veritabanı turunu
 * ortadan kaldırıyor.
 *
 * `BILINMEYEN` dönmesi "kayıt yok" demek değil — arama serbest metin de
 * olabilir (çiftçi adı). Çağıran taraf o durumda ada göre arıyor.
 */
export function kayitTipiTani(girdi: string): KayitTipi {
  const s = String(girdi ?? "").trim();
  if (!s) return "BILINMEYEN";
  // Karekod, AI 01 ile başlar ve en az 30 karakterdir.
  if (/^01\d{14}21/.test(s)) return "PAKET";
  if (/^CBD-[DI]-\d{4}-\d{4,}$/i.test(s)) return "SERI";
  if (/^HM-\d{4}-\d{4,}$/i.test(s)) return "HAMMADDE";
  if (/^CF-\d{3,}$/i.test(s)) return "CIFTCI";
  if (/^SVK-\d{4}-\d{4,}$/i.test(s)) return "SEVKIYAT";
  if (/^SAT-\d{4}-\d{5,}$/i.test(s)) return "SATIS";
  return "BILINMEYEN";
}

/** Seri kodundan ürün tipini çıkarır. Tanınmazsa null. */
export function seridenUrunTipi(seri: string): UrunTipi | null {
  const m = /^CBD-([DI])-/i.exec(String(seri ?? "").trim());
  if (!m) return null;
  return m[1].toUpperCase() === "I" ? "IZOLAT" : "DISTILAT";
}

// ── Kişisel veri maskeleme ───────────────────────────────────────────────────

/**
 * TC kimlik numarasını maskeler: 12345678901 → 123******01
 *
 * KVKK: sağlık verisi özel nitelikli kişisel veri. Hangi hastaya hangi ürünün
 * verildiği geri çekmede gerekli, ama açık kimlik gerekli DEĞİL — reçete
 * numarası eşleştirme için yeterli anahtar. Bu yüzden açık TC hiç saklanmıyor;
 * maskelenmiş hali saklanıyor.
 *
 * ÇAĞIRAN TARAFA NOT: bu fonksiyon veriyi YAZMADAN ÖNCE uygulanır. Açık değeri
 * saklayıp gösterirken maskelemek, KVKK açısından maskelememekle aynı şeydir.
 */
export function tcMaskele(tc: string): string {
  const t = String(tc ?? "").replace(/\D/g, "");
  if (t.length === 0) return "";
  if (t.length <= 5) return "*".repeat(t.length);
  return t.slice(0, 3) + "*".repeat(t.length - 5) + t.slice(-2);
}

/**
 * TC kimlik numarası algoritma doğrulaması.
 *
 * Maskelemeden ÖNCE çalışır: yanlış girilen bir TC maskelendikten sonra
 * düzeltilemez, çünkü açık hali hiç saklanmıyor. Girişte yakalamak tek şans.
 */
export function tcGecerli(tc: string): boolean {
  const t = String(tc ?? "").replace(/\D/g, "");
  if (!/^[1-9]\d{10}$/.test(t)) return false;
  const h = t.split("").map(Number);
  const tekToplam = h[0] + h[2] + h[4] + h[6] + h[8];
  const ciftToplam = h[1] + h[3] + h[5] + h[7];

  // MOD 10 NEGATİF OLABİLİR. `(tek*7 - cift)` çift haneler ağır bastığında
  // negatife düşüyor ve JavaScript'te `-1 % 10` sonucu `9` DEĞİL `-1`.
  // Düzeltme olmadan 19191919190 gibi geçerli numaralar reddediliyordu:
  // (5×7 − 36) = −1, beklenen 10. hane 9. Hasta kaydı girişini bloke eden,
  // sebebi ekranda görünmeyen bir hataydı.
  const onuncu = (((tekToplam * 7 - ciftToplam) % 10) + 10) % 10;
  if (onuncu !== h[9]) return false;

  const ilkOnToplam = h.slice(0, 10).reduce((a, b) => a + b, 0);
  return ilkOnToplam % 10 === h[10];
}
