"use client";

import Link from "next/link";
import { useState } from "react";
import { trZaman } from "./Arayuz";

const YUZEY =
  "rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/60";

export type IsSatiri = {
  kod: string;
  baslik: string;
  alt?: string | null;
  uyari?: string | null;
  yol: string;
};

export type IsKuyrugu = {
  anahtar: string;
  is: string;
  kim: string;
  n: number;
  yol: string;
  acil?: boolean;
  not?: string | null;
  ornekler: IsSatiri[];
};

/** İki-üç segmentli mini çubuk (kompozisyon barı) — segment yoksa çubuk hiç çizilmez. */
export type BarSegment = { renk: string; yuzde: number };

export type ZincirOzeti = {
  ciftci: number;
  hamKg: string;
  hamKarantina: number;
  /** Serbest/karantina kg oranı — boşsa (hiç kayıt yoksa) çubuk çizilmez. */
  hamBar: BarSegment[];
  seriSerbest: number;
  seriKarantina: number;
  /** Serbest/karantina seri oranı. */
  seriBar: BarSegment[];
  /** Ambalaj birimlerinin bulunduğu yer — sıralı aşamalar. */
  birimler: { etiket: string; kisa: string; adet: number; yol: string }[];
};

export type BulguOzeti = { kod: string; seviye: string; baslik: string; adet: number };

const SEVIYELER = ["KRITIK", "YUKSEK", "ORTA", "BILGI"] as const;
const SEVIYE_ETIKET: Record<string, string> = {
  KRITIK: "kritik", YUKSEK: "yüksek", ORTA: "orta", BILGI: "bilgi",
};
const SEVIYE_CUBUK: Record<string, string> = {
  KRITIK: "bg-red-500", YUKSEK: "bg-amber-500", ORTA: "bg-sky-500", BILGI: "bg-slate-300 dark:bg-slate-600",
};
const SEVIYE_ROZET: Record<string, string> = {
  KRITIK: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200",
  YUKSEK: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  ORTA: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200",
  BILGI: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

/**
 * OPERASYON PANOSU.
 *
 * BU SÜRÜM daha az bağırıyor, daha çok ÇUBUK kullanıyor: durum şeridi katı
 * renkli bir afiş değil, ince renkli kenarlı sade bir kart; ölçüm kartları
 * (çiftçi/ham madde/üretim/ambalaj) tek sırada eş biçimli KPI kutucukları ve
 * her birinin altında kompozisyonu gösteren ince bir çubuk var. Kalite
 * durumu artık tek tek kart yığını değil, seviye başına tek bir yığılmış
 * çubuk + en ağır üç bulgu — geri kalanı "tümünü gör" bağlantısında.
 */
export function PanoEkrani({
  seritDurum,
  seritMetin,
  denetimGorunur,
  bulgular,
  sayim,
  toplamBulgu,
  isler,
  zincir,
  hafta,
  hareketler,
  hareketlerGorunur,
}: {
  seritDurum: "iyi" | "orta" | "kotu";
  seritMetin: string;
  denetimGorunur: boolean;
  bulgular: BulguOzeti[];
  sayim: { KRITIK: number; YUKSEK: number; ORTA: number; BILGI: number };
  toplamBulgu: number;
  isler: IsKuyrugu[];
  zincir: ZincirOzeti;
  hafta: { n: number; ad: string }[];
  hareketler: any[];
  hareketlerGorunur: boolean;
}) {
  const [acik, setAcik] = useState<string | null>(null);
  const maxIs = Math.max(1, ...isler.map((x) => x.n));

  const DURUM_STIL = {
    kotu: { kenar: "border-red-500", ikonBg: "bg-red-50 dark:bg-red-900/30", ikonRenk: "text-red-600 dark:text-red-300", ikon: "✕" },
    orta: { kenar: "border-amber-500", ikonBg: "bg-amber-50 dark:bg-amber-900/30", ikonRenk: "text-amber-600 dark:text-amber-300", ikon: "!" },
    iyi: { kenar: "border-green-600", ikonBg: "bg-green-50 dark:bg-green-900/30", ikonRenk: "text-green-700 dark:text-green-300", ikon: "✓" },
  }[seritDurum];

  return (
    <>
      {denetimGorunur && (
        <div
          className={`mb-4 flex items-center gap-3 rounded-xl border-l-4 ${DURUM_STIL.kenar} ${YUZEY} px-4 py-3`}
        >
          <span
            aria-hidden
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${DURUM_STIL.ikonBg} ${DURUM_STIL.ikonRenk}`}
          >
            {DURUM_STIL.ikon}
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{seritMetin}</p>
          <Link
            href="/panel/denetim"
            className="dokunma-hedefi shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Rapor →
          </Link>
        </div>
      )}

      {/* ── KPI sırası — sayı + kompozisyon çubuğu, tek biçim ────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiket="Çiftçi" deger={String(zincir.ciftci)} alt="tedarikçi" yol="/panel/ciftci" />
        <Kpi
          etiket="Ham madde"
          deger={zincir.hamKg}
          alt={`kg serbest stok${zincir.hamKarantina ? ` · ${zincir.hamKarantina} karantinada` : ""}`}
          yol="/panel/hammadde"
          bar={zincir.hamBar}
        />
        <Kpi
          etiket="Üretim"
          deger={String(zincir.seriSerbest)}
          alt={`serbest seri${zincir.seriKarantina ? ` · ${zincir.seriKarantina} karantinada` : ""}`}
          yol="/panel/uretim"
          bar={zincir.seriBar}
        />
        <AmbalajKpi birimler={zincir.birimler} />
      </div>

      <p className="mt-2 px-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold">Son 7 gün</span>{" "}
        {hafta.map((h, i) => (
          <span key={h.ad}>
            {i > 0 && " · "}
            <b className="font-semibold text-slate-700 dark:text-slate-200">{h.n}</b> {h.ad}
          </span>
        ))}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* ── Bekleyen işler — öncelik sırasına göre, çubuklu ────────────── */}
        <section className={`${YUZEY} min-w-0`}>
          <header className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-700/60">
            <h2 className="text-sm font-semibold">Bekleyen işler</h2>
            <span className="text-xs text-slate-400">{isler.reduce((t, x) => t + x.n, 0)} kayıt</span>
          </header>

          {isler.length === 0 ? (
            <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Karar bekleyen kayıt yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {isler.map((x) => {
                const secili = acik === x.anahtar;
                return (
                  <li key={x.anahtar}>
                    <button
                      type="button"
                      onClick={() => setAcik(secili ? null : x.anahtar)}
                      aria-expanded={secili}
                      className={`dokunma-hedefi flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-700/40 ${
                        secili ? "bg-slate-50 dark:bg-slate-700/40" : ""
                      }`}
                    >
                      <span
                        className={`w-7 shrink-0 text-right text-lg font-bold tabular-nums leading-none ${
                          x.acil ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {x.n}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{x.is}</span>
                          {x.not && (
                            <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-900/40 dark:text-red-300">
                              {x.not}
                            </span>
                          )}
                        </span>
                        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                          <span
                            className={`block h-full rounded-full ${x.acil ? "bg-red-500" : "bg-green-600"}`}
                            style={{ width: `${Math.max((x.n / maxIs) * 100, 6)}%` }}
                          />
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{x.kim}</span>
                      </span>
                      <svg
                        aria-hidden viewBox="0 0 16 16"
                        className={`h-4 w-4 shrink-0 text-slate-300 transition-transform dark:text-slate-600 ${secili ? "rotate-90" : ""}`}
                      >
                        <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>

                    {secili && (
                      <div className="border-t border-slate-100 bg-slate-50/60 dark:border-slate-700/60 dark:bg-slate-900/30">
                        <ul>
                          {x.ornekler.map((s) => (
                            <li key={s.kod}>
                              <Link
                                href={s.yol}
                                className="dokunma-hedefi flex items-baseline gap-2.5 py-1.5 pl-14 pr-4 text-xs transition hover:bg-white dark:hover:bg-slate-800"
                              >
                                <span className="shrink-0 font-mono font-semibold">{s.kod}</span>
                                <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
                                  {s.baslik}
                                  {s.alt && <span className="text-slate-400"> · {s.alt}</span>}
                                </span>
                                {s.uyari && (
                                  <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-900/40 dark:text-red-300">
                                    {s.uyari}
                                  </span>
                                )}
                              </Link>
                            </li>
                          ))}
                          <li className="py-1.5 pl-14 pr-4">
                            <Link href={x.yol} className="dokunma-hedefi inline-flex text-xs font-semibold text-green-700 underline dark:text-green-400">
                              {x.ornekler.length < x.n ? `${x.n} kaydın tümünü aç →` : "Ekranı aç →"}
                            </Link>
                          </li>
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Kalite durumu — yığılmış çubuk + en ağır üç bulgu ──────────── */}
        {denetimGorunur && (
          <section className={`${YUZEY} min-w-0`}>
            <header className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-700/60">
              <h2 className="text-sm font-semibold">Kalite durumu</h2>
              <span className="text-xs text-slate-400">{toplamBulgu} bulgu</span>
            </header>

            {toplamBulgu === 0 ? (
              <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Bulgu yok — kayıtlar denetime hazır.</p>
            ) : (
              <>
                <div className="px-4 pt-3">
                  <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    {SEVIYELER.map(
                      (s) =>
                        sayim[s] > 0 && (
                          <div
                            key={s}
                            className={SEVIYE_CUBUK[s]}
                            style={{ width: `${(sayim[s] / toplamBulgu) * 100}%` }}
                          />
                        )
                    )}
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pb-3 text-[11px] text-slate-600 dark:text-slate-300">
                    {SEVIYELER.map(
                      (s) =>
                        sayim[s] > 0 && (
                          <li key={s} className="flex items-center gap-1.5">
                            <span aria-hidden className={`h-2 w-2 rounded-full ${SEVIYE_CUBUK[s]}`} />
                            {sayim[s]} {SEVIYE_ETIKET[s]}
                          </li>
                        )
                    )}
                  </ul>
                </div>

                <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-700/60 dark:border-slate-700/60">
                  {bulgular.slice(0, 3).map((b) => (
                    <li key={b.kod}>
                      <Link
                        href="/panel/denetim"
                        className="dokunma-hedefi flex items-center gap-2.5 px-4 py-2 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/40"
                      >
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${SEVIYE_ROZET[b.seviye]}`}>
                          {b.kod}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{b.baslik}</span>
                      </Link>
                    </li>
                  ))}
                </ul>

                {toplamBulgu > 3 && (
                  <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-700/60">
                    <Link href="/panel/denetim" className="dokunma-hedefi inline-flex text-xs font-semibold text-green-700 underline dark:text-green-400">
                      {toplamBulgu} bulgunun tümünü gör →
                    </Link>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {/* ── Son hareketler — dar, tek satırlık, sınırlı sayıda ──────────── */}
      <section className={`${YUZEY} mt-4 min-w-0`}>
        <header className="border-b border-slate-100 px-4 py-3 dark:border-slate-700/60">
          <h2 className="text-sm font-semibold">Son hareketler</h2>
        </header>
        <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
          {hareketler.length === 0 ? (
            <li className="p-4 text-sm text-slate-500">Giriş dışında işlem yok.</li>
          ) : (
            hareketler.map((l: any, i: number) => (
              <li key={i} className="flex items-baseline gap-3 px-4 py-1.5 text-sm">
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-400">{trZaman(l.tarih)}</span>
                <span className="min-w-0 truncate">
                  <span className="font-medium">{l.ad_soyad ?? "—"}</span>
                  <span className="text-slate-500 dark:text-slate-400"> · {l.eylem}</span>
                  {l.kayit && <span className="font-mono text-xs text-slate-400"> · {l.kayit}</span>}
                </span>
              </li>
            ))
          )}
          {hareketlerGorunur && (
            <li className="px-4 py-2">
              <Link href="/panel/hareketler" className="dokunma-hedefi inline-flex text-xs font-semibold text-green-700 underline dark:text-green-400">
                Tüm denetim izi — arama ve filtreyle →
              </Link>
            </li>
          )}
        </ul>
      </section>
    </>
  );
}

/**
 * KPI kutucuğu — sayı büyük, etiket küçük, altında opsiyonel kompozisyon
 * çubuğu. Dört ölçüm kartı da (çiftçi/ham madde/üretim/ambalaj) AYNI kalıbı
 * kullanıyor — önceki sürümde "Zincir" tek büyük kart, "Bekleyen işler" ayrı
 * bir görsel dildeydi; şimdi tüm sayısal özet tek biçimde okunuyor.
 */
function Kpi({
  etiket, deger, alt, yol, bar,
}: { etiket: string; deger: string; alt: string; yol: string; bar?: BarSegment[] }) {
  return (
    <Link href={yol} className={`${YUZEY} dokunma-hedefi block min-w-0 p-3.5 transition hover:shadow-md`}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{etiket}</p>
      <p className="mt-1 truncate text-2xl font-bold leading-none tabular-nums">{deger}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{alt}</p>
      {bar && bar.length > 0 && (
        <div className="mt-2.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
          {bar.map(
            (b, i) => b.yuzde > 0 && <div key={i} className={b.renk} style={{ width: `${b.yuzde}%` }} />
          )}
        </div>
      )}
    </Link>
  );
}

/**
 * Ambalaj KPI'ı diğerlerinden farklı: kompozisyonu İKİ değil ÜÇ sıralı
 * aşama taşıyor (depo → sevkte → hastada), o yüzden tek hue'nun açıktan
 * koyuya rampası kullanılıyor — kategorik renk burada bir SIRA olmadığını
 * söyleyip yanıltırdı.
 */
function AmbalajKpi({ birimler }: { birimler: { etiket: string; kisa: string; adet: number; yol: string }[] }) {
  const toplam = birimler.reduce((t, b) => t + b.adet, 0);
  const tonlar = ["bg-green-300", "bg-green-500", "bg-green-700"];

  return (
    <Link href="/panel/ambalaj" className={`${YUZEY} dokunma-hedefi block min-w-0 p-3.5 transition hover:shadow-md`}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ambalaj birimi</p>
      <p className="mt-1 truncate text-2xl font-bold leading-none tabular-nums">{toplam}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
        {toplam === 0
          ? "henüz ambalajlanmış birim yok"
          : birimler.map((b) => `${b.kisa} %${Math.round((b.adet / toplam) * 100)}`).join(" · ")}
      </p>
      {toplam > 0 && (
        <div className="mt-2.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
          {birimler.map(
            (b, i) => b.adet > 0 && <div key={b.etiket} className={tonlar[i]} style={{ width: `${(b.adet / toplam) * 100}%` }} />
          )}
        </div>
      )}
    </Link>
  );
}
