"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

/**
 * PAYLAŞILAN ARAYÜZ PARÇALARI.
 *
 * Tek dosyada toplandı: her ekranda aynı kart, aynı rozet, aynı hata kutusu
 * kullanılıyor. Ayrı dosyalara bölmek bu ölçekte gezinmeyi zorlaştırırdı.
 */

// ── Kart ─────────────────────────────────────────────────────────────────────

/**
 * AÇILIR KART — kayıt oluşturma formları için, varsayılan KAPALI.
 *
 * Formlar listelerin üstünde tam açık dururken ekranın yarısını kaplıyor ve
 * asıl bakılan şeyi (kayıt listesi) ekran dışına itiyordu. Form artık tek
 * satırlık bir başlığa katlanıyor; günde bir kez kayıt açan kullanıcı bir
 * tık öder, günde elli kez listeye bakan kullanıcı hiç ödemez.
 *
 * `acik` ile açık başlatılabilir — başka ekrandan ön dolu parametreyle
 * gelindiğinde form kapalı olursa kullanıcı geldiği işi göremez.
 */
export function AcilirKart({
  baslik,
  aciklama,
  acik,
  children,
}: {
  baslik: string;
  aciklama?: ReactNode;
  acik?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={acik}
      className="group mb-4 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <summary className="dokunma-hedefi flex cursor-pointer select-none items-start justify-between gap-3 px-4 py-3 sm:px-5">
        <span className="min-w-0">
          <span className="block text-base font-semibold tracking-tight">＋ {baslik}</span>
          {aciklama && (
            <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">
              {aciklama}
            </span>
          )}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
        >
          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="border-t border-slate-100 p-4 dark:border-slate-700/60 sm:p-5">{children}</div>
    </details>
  );
}

export function Kart({
  baslik,
  aciklama,
  children,
  sag,
}: {
  baslik?: string;
  aciklama?: ReactNode;
  children: ReactNode;
  sag?: ReactNode;
}) {
  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5">
      {(baslik || sag) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {baslik && <h2 className="text-base font-semibold tracking-tight">{baslik}</h2>}
            {aciklama && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{aciklama}</p>
            )}
          </div>
          {sag}
        </div>
      )}
      {children}
    </section>
  );
}

// ── Rozet ────────────────────────────────────────────────────────────────────

const ROZET_RENK: Record<string, string> = {
  KARANTINA: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  SERBEST: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  RET: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  SEVK: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  SATILDI: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  BEKLIYOR: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  GONDERILDI: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  ECZANE: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  DEPO: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

/**
 * Görünen etiketler. Veritabanındaki değerler ASCII (CHECK kısıtı), ekranda
 * Türkçe karşılıkları gösteriliyor.
 *
 * `GONDERILDI` → "ELLE GİRİLDİ": sistem Kuruma hiçbir şey göndermiyor.
 * "Gönderildi" yazmak, otomatik bir bildirim yapıldığı izlenimi veriyordu;
 * kaydı aylar sonra okuyan kişi bunu yanlış anlar.
 */
const ROZET_ETIKET: Record<string, string> = {
  KARANTINA: "KARANTİNA",
  BEKLIYOR: "BEKLİYOR",
  GONDERILDI: "ELLE GİRİLDİ",
};

export function Rozet({ children }: { children: string }) {
  const renk = ROZET_RENK[children] ?? "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${renk}`}>
      {ROZET_ETIKET[children] ?? children}
    </span>
  );
}

// ── Düğme ────────────────────────────────────────────────────────────────────

export function Dugme({
  cesit = "birincil",
  bekliyor,
  children,
  className = "",
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  cesit?: "birincil" | "ikincil" | "tehlike";
  bekliyor?: boolean;
}) {
  const temel =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const renk = {
    birincil: "bg-green-700 text-white hover:bg-green-800",
    ikincil:
      "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700",
    tehlike: "bg-red-700 text-white hover:bg-red-800",
  }[cesit];

  return (
    <button {...p} disabled={p.disabled || bekliyor} className={`${temel} ${renk} ${className}`}>
      {bekliyor && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

// ── Form alanı ───────────────────────────────────────────────────────────────

const ALAN_SINIF =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

export function Alan({
  etiket,
  ipucu,
  hata,
  children,
}: {
  etiket: string;
  ipucu?: string;
  hata?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
        {etiket}
      </span>
      {children}
      {ipucu && !hata && <span className="mt-1 block text-xs text-slate-500">{ipucu}</span>}
      {hata && <span className="mt-1 block text-xs font-medium text-red-600">{hata}</span>}
    </label>
  );
}

export function Girdi(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`${ALAN_SINIF} ${p.className ?? ""}`} />;
}

export function Secim(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`${ALAN_SINIF} ${p.className ?? ""}`} />;
}

export function Metinlik(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`${ALAN_SINIF} font-mono text-sm ${p.className ?? ""}`} />;
}

// ── Uyarı kutusu ─────────────────────────────────────────────────────────────

export function Uyari({
  cesit,
  baslik,
  children,
}: {
  cesit: "bilgi" | "basari" | "uyari" | "hata";
  baslik?: string;
  children?: ReactNode;
}) {
  const renk = {
    bilgi: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
    basari: "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/50 dark:text-green-200",
    uyari: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
    hata: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200",
  }[cesit];

  return (
    <div className={`mb-3 rounded-lg border p-3 text-sm ${renk}`} role={cesit === "hata" ? "alert" : undefined}>
      {baslik && <div className="mb-1 font-bold">{baslik}</div>}
      {children}
    </div>
  );
}

// ── Sayaç kartı ──────────────────────────────────────────────────────────────

export function Sayac({ etiket, deger, alt }: { etiket: string; deger: ReactNode; alt?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {etiket}
      </div>
      <div className="mt-1 font-mono text-2xl font-bold tabular-nums">{deger}</div>
      {alt && <div className="text-xs text-slate-500">{alt}</div>}
    </div>
  );
}

// ── Tablo ────────────────────────────────────────────────────────────────────

export function Tablo({ basliklar, children }: { basliklar: string[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {basliklar.map((b) => (
              <th
                key={b}
                className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                {b}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Bos({ sutun, children }: { sutun: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={sutun} className="px-3 py-8 text-center text-sm text-slate-500">
        {children}
      </td>
    </tr>
  );
}

export const Satir = ({ children }: { children: ReactNode }) => (
  <tr className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-700/40">
    {children}
  </tr>
);

export const Hucre = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <td className={`px-3 py-2 align-top ${className}`}>{children}</td>
);

/**
 * Tablo satırındaki eylem bağlantısı.
 *
 * Düz bir `<a>` mobilde 16–20 px yükseklikte kalıyordu; iki bağlantı alt alta
 * olduğunda (Seri Dosyası / İzle) eldivenli parmakla yanlış olana basmak
 * neredeyse kaçınılmazdı. `.dokunma-hedefi` sınıfı yalnızca dokunmatik
 * cihazlarda 44 px'e çıkarıyor — masaüstünde satırlar gereksiz yere
 * uzamıyor (bkz. globals.css).
 */
export function TabloBaglanti({
  href,
  children,
  ikincil,
}: {
  href: string;
  children: ReactNode;
  /** İkincil bağlantılar daha sönük — bir satırda iki eylem varsa. */
  ikincil?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`dokunma-hedefi inline-flex whitespace-nowrap text-xs underline ${
        ikincil
          ? "text-slate-500 dark:text-slate-400"
          : "font-semibold text-green-700 dark:text-green-400"
      }`}
    >
      {children}
    </Link>
  );
}

// ── Bildirim ─────────────────────────────────────────────────────────────────

export function useBildirim() {
  const [mesaj, setMesaj] = useState<{ metin: string; cesit: "basari" | "hata" } | null>(null);

  useEffect(() => {
    if (!mesaj) return;
    const z = setTimeout(() => setMesaj(null), 5000);
    return () => clearTimeout(z);
  }, [mesaj]);

  const kutu = mesaj ? (
    <div
      role="status"
      className={`fixed inset-x-3 bottom-4 z-50 mx-auto max-w-md rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${
        mesaj.cesit === "basari" ? "bg-green-700" : "bg-red-700"
      }`}
    >
      {mesaj.metin}
    </div>
  ) : null;

  return {
    kutu,
    basari: (m: string) => setMesaj({ metin: m, cesit: "basari" }),
    hata: (m: string) => setMesaj({ metin: m, cesit: "hata" }),
  };
}

// ── Sunucu çağrısı ───────────────────────────────────────────────────────────

/**
 * API çağrısı — hata mesajını SUNUCUDAN alır.
 *
 * `fetch` başarısız yanıtta reddetmiyor; kontrol edilmezse hata sessizce
 * "başarılı" sayılıyordu. Sunucunun döndürdüğü Türkçe mesaj kullanıcıya
 * aynen gösteriliyor — "bir hata oluştu" demek operatöre ne yapacağını
 * söylemez, "HM-2026-0001 lotu karantinada" söyler.
 */
export async function cagir<T = any>(
  yol: string,
  secenek?: { yontem?: string; govde?: unknown }
): Promise<T> {
  const y = await fetch(yol, {
    method: secenek?.yontem ?? (secenek?.govde ? "POST" : "GET"),
    headers: secenek?.govde ? { "Content-Type": "application/json" } : undefined,
    body: secenek?.govde ? JSON.stringify(secenek.govde) : undefined,
  });

  let veri: any = null;
  try {
    veri = await y.json();
  } catch {
    /* gövdesiz yanıt */
  }

  if (!y.ok) {
    throw new Error(veri?.hata ?? `Sunucu hatası (${y.status}). Kayıt yapılmadı.`);
  }
  return veri as T;
}

// ── Biçimleme ────────────────────────────────────────────────────────────────
//
// Gerçek tanımlar `@/lib/bicim` içinde — SUNUCU BİLEŞENLERİ DE ÇAĞIRIYOR ve
// bir `"use client"` modülünden fonksiyon çağrılamıyor. Buradan yeniden
// dışa aktarılıyor ki istemci bileşenleri tek yerden içe aktarabilsin.
export { trTarih, trZaman, sayiTr, bugun } from "@/lib/bicim";
