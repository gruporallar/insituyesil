/**
 * BİÇİMLEME — sunucu ve istemcinin ORTAK kullandığı saf fonksiyonlar.
 *
 * NEDEN AYRI DOSYA: bunlar önce `Arayuz.tsx` içindeydi ve o dosya
 * `"use client"` ile işaretli. Sunucu bileşenleri bir istemci modülünden
 * fonksiyon ÇAĞIRAMIYOR (yalnızca bileşen olarak render edebiliyor), bu yüzden
 * panel sayfası çalışma anında hata veriyordu. Saf yardımcıların istemci
 * sınırının dışında durması gerekiyor.
 */

export { bicimSayi as sayiTr } from "./kabul";

/** ISO tarih → GG.AA.YYYY */
export function trTarih(iso?: string | null): string {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const [y, a, g] = s.split("-");
  return y && a && g ? `${g}.${a}.${y}` : "—";
}

/**
 * Zaman damgası → GG.AA.YYYY SS:DD (Türkiye saati).
 *
 * Veritabanı `datetime('now')` ile UTC yazıyor. Türkiye 2016'dan beri yaz saati
 * uygulamıyor; ofset yıl boyu sabit +03:00. `toLocaleString` KULLANILMIYOR:
 * sunucu ve tarayıcı farklı saat dilimlerinde olduğunda aynı kayıt iki farklı
 * saatte görünür ve denetimde bu bir tutarsızlık olarak okunur.
 */
export function trZaman(iso?: string | null): string {
  if (!iso) return "—";
  const ham = String(iso);
  // SQLite "YYYY-AA-GG SS:DD:SS" döndürüyor — ISO'ya çevir ve UTC olduğunu belirt.
  const d = new Date(ham.replace(" ", "T") + (/[Zz]|[+-]\d{2}:?\d{2}$/.test(ham) ? "" : "Z"));
  if (isNaN(d.getTime())) return ham;
  const yerel = new Date(d.getTime() + 3 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${p(yerel.getUTCDate())}.${p(yerel.getUTCMonth() + 1)}.${yerel.getUTCFullYear()} ` +
    `${p(yerel.getUTCHours())}:${p(yerel.getUTCMinutes())}`
  );
}

/** Türkiye takvim günü (YYYY-AA-GG) — form varsayılanları için. */
export const bugun = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
