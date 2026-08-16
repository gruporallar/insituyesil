/**
 * GİRDİ DOĞRULAMA — istemciden gelen değere güvenilmez.
 *
 * Tarayıcıdaki `required`, `min`, `max` nitelikleri KULLANICIYA yardım eder,
 * sunucuyu korumaz: istek doğrudan da atılabilir. Yazma yapan her API ucu
 * gövdeyi buradan geçirir.
 *
 * Hata mesajları Türkçe ve alan adıyla birlikte dönüyor — kullanıcı hangi
 * alanın neden reddedildiğini görmeli, "Geçersiz istek" demek yetmez.
 */

export class DogrulamaHatasi extends Error {
  constructor(public alan: string, mesaj: string) {
    super(mesaj);
    this.name = "DogrulamaHatasi";
  }
}

function hata(alan: string, mesaj: string): never {
  throw new DogrulamaHatasi(alan, mesaj);
}

/** Zorunlu metin. Baş/son boşluk temizlenir. */
export function metin(v: unknown, alan: string, enFazla = 200): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) hata(alan, `${alan} zorunlu.`);
  if (s.length > enFazla) hata(alan, `${alan} en fazla ${enFazla} karakter olabilir.`);
  return s;
}

/** İsteğe bağlı metin. Boşsa `null`. */
export function metinOpsiyonel(v: unknown, alan: string, enFazla = 200): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (s.length > enFazla) hata(alan, `${alan} en fazla ${enFazla} karakter olabilir.`);
  return s;
}

/**
 * Pozitif sayı.
 *
 * `Number("")` SIFIR DÖNER — boş bir miktar alanı sessizce 0 kg olarak
 * kaydedilirdi. Boş dize burada açıkça reddediliyor.
 */
export function sayi(
  v: unknown,
  alan: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER, sifirOlabilir = true } = {}
): number {
  if (v === null || v === undefined || v === "") hata(alan, `${alan} zorunlu.`);
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) hata(alan, `${alan} sayı olmalı.`);
  if (!sifirOlabilir && n === 0) hata(alan, `${alan} sıfır olamaz.`);
  if (n < min) hata(alan, `${alan} en az ${min} olmalı.`);
  if (n > max) hata(alan, `${alan} en fazla ${max} olabilir.`);
  return n;
}

/** İsteğe bağlı sayı. Boşsa `null` — `0` ile karıştırılmaz. */
export function sayiOpsiyonel(
  v: unknown,
  alan: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {}
): number | null {
  if (v === null || v === undefined || v === "") return null;
  return sayi(v, alan, { min, max });
}

/** Tam sayı. */
export function tamsayi(v: unknown, alan: string, { min = 1, max = 100000 } = {}): number {
  const n = sayi(v, alan, { min, max });
  if (!Number.isInteger(n)) hata(alan, `${alan} tam sayı olmalı.`);
  return n;
}

/**
 * ISO tarih (YYYY-AA-GG).
 *
 * Yalnızca desen değil, GERÇEKLİK de kontrol ediliyor: `2026-02-31` desene
 * uyar ama böyle bir gün yok. `new Date` onu 3 Mart'a çevirir ve kayıt sessizce
 * yanlış tarihe düşer.
 */
export function tarih(v: unknown, alan: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) hata(alan, `${alan} GG.AA.YYYY biçiminde bir tarih olmalı.`);
  const [y, a, g] = s.split("-").map(Number);
  const d = new Date(Date.UTC(y, a - 1, g));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== a - 1 || d.getUTCDate() !== g) {
    hata(alan, `${alan} geçerli bir takvim günü değil.`);
  }
  if (y < 2000 || y > 2100) hata(alan, `${alan} 2000–2100 aralığında olmalı.`);
  return s;
}

export function tarihOpsiyonel(v: unknown, alan: string): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return tarih(v, alan);
}

/** Sabit değer listesinden biri. */
export function secim<T extends string>(v: unknown, alan: string, izinli: readonly T[]): T {
  const s = typeof v === "string" ? v.trim() : "";
  if (!izinli.includes(s as T)) {
    hata(alan, `${alan} şunlardan biri olmalı: ${izinli.join(", ")}.`);
  }
  return s as T;
}

/** Evet/hayır. Form "E"/"H" gönderiyor, JSON true/false gönderebiliyor. */
export function evetHayir(v: unknown, alan: string): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "E" || s === "EVET" || s === "TRUE" || s === "1") return true;
  if (s === "H" || s === "HAYIR" || s === "FALSE" || s === "0") return false;
  hata(alan, `${alan} için evet/hayır bekleniyor.`);
}

/** E-posta — biçim kontrolü. */
export function eposta(v: unknown, alan = "E-posta"): string {
  const s = metin(v, alan, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) hata(alan, `${alan} geçerli görünmüyor.`);
  return s;
}

/** Vergi/TC numarası — yalnızca rakam, 10 veya 11 hane. */
export function tcVkn(v: unknown, alan = "TC / Vergi No"): string {
  const s = String(v ?? "").replace(/\D/g, "");
  if (s.length !== 10 && s.length !== 11) hata(alan, `${alan} 10 veya 11 haneli olmalı.`);
  return s;
}

/**
 * Karekod listesi — çok satırlı metinden.
 *
 * Virgül ve noktalı virgül de ayırıcı sayılıyor: bazı barkod okuyucular
 * okumaları tek satırda birleştiriyor.
 */
export function kodListesi(v: unknown, alan = "Karekod listesi", enFazla = 500): string[] {
  const ham = typeof v === "string" ? v : Array.isArray(v) ? v.join("\n") : "";
  const kodlar = ham
    .split(/[\r\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!kodlar.length) hata(alan, "En az bir karekod okutun.");
  if (kodlar.length > enFazla) hata(alan, `Tek seferde en fazla ${enFazla} kod işlenebilir.`);
  return kodlar;
}

/**
 * İstek gövdesini JSON olarak okur.
 *
 * Bozuk JSON'da `request.json()` ham bir SyntaxError atıyor ve bu 500'e
 * dönüşüyordu. Doğrulama hatası olarak işaretlemek 400 döndürüyor — istemci
 * hatasını sunucu hatası gibi göstermek, gerçek arızaları loglarda gizler.
 */
export async function govde(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    if (!j || typeof j !== "object" || Array.isArray(j)) {
      hata("gövde", "İstek gövdesi bir nesne olmalı.");
    }
    return j as Record<string, unknown>;
  } catch (e) {
    if (e instanceof DogrulamaHatasi) throw e;
    hata("gövde", "İstek gövdesi okunamadı (geçersiz JSON).");
  }
}
