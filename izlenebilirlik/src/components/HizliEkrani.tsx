"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Dugme, Girdi, Kart, Uyari, cagir } from "./Arayuz";
import { KarekodOkuyucu } from "./KarekodOkuyucu";
import type { HizliSonuc } from "@/lib/hizli";

const DURUM_RENK: Record<HizliSonuc["durumCesit"], string> = {
  iyi: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
  bekle: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  kotu: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  notr: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
};

const TIP_ETIKET: Record<HizliSonuc["tip"], string> = {
  PAKET: "Ambalaj Birimi",
  SERI: "Üretim Serisi",
  HAMMADDE: "Ham Madde Lotu",
  CIFTCI: "Çiftçi",
  SEVKIYAT: "Sevkiyat",
  SATIS: "Satış",
  BILINMEYEN: "—",
};

/**
 * HIZLI İŞLEM — tek ekran, tek hareket: okut, sistem tanısın, ilerle.
 *
 * Kamera BİR KEZ açılıyor ve açık kalıyor. Operatör sırayla kutu okutuyor;
 * her okutmada üstteki kart değişiyor. Bir işlem yapmak isterse düğmeye
 * basıyor, ilgili ekran kod ÖN DOLU açılıyor.
 */
export function HizliEkrani() {
  const [sonuc, setSonuc] = useState<HizliSonuc | null>(null);
  const [gecmis, setGecmis] = useState<HizliSonuc[]>([]);
  const [elle, setElle] = useState("");
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState("");

  // Kamera hızlı okutuyor; yavaş bir ağda ikinci isteğin cevabı birincinin
  // ÜSTÜNE gelebilir ve ekranda yanlış kutu görünür. Her istek bir sıra
  // numarası alıyor, yalnızca en güncelinin sonucu ekrana yazılıyor.
  const siraRef = useRef(0);

  const tani = useCallback(async (kod: string) => {
    const kendi = ++siraRef.current;
    setBekle(true);
    setHata("");
    try {
      const r = await cagir<HizliSonuc>(`/api/hizli?kod=${encodeURIComponent(kod)}`, {
        yontem: "GET",
      });
      if (kendi !== siraRef.current) return; // daha yenisi geldi
      setSonuc(r);
      if (r.tip !== "BILINMEYEN") {
        setGecmis((g) => [r, ...g.filter((x) => x.anahtar !== r.anahtar)].slice(0, 8));
        try {
          navigator.vibrate?.(40);
        } catch {
          /* desteklenmiyor */
        }
      }
    } catch (e) {
      if (kendi !== siraRef.current) return;
      setHata((e as Error).message);
    } finally {
      if (kendi === siraRef.current) setBekle(false);
    }
  }, []);

  function elleSorgula(e: React.FormEvent) {
    e.preventDefault();
    if (elle.trim()) void tani(elle.trim());
  }

  return (
    <>
      <Kart
        baslik="Hızlı İşlem"
        aciklama="Kamerayı bir kez açın ve sırayla okutun. Sistem nesneyi tanır, yalnızca o an gerçekten yapılabilecek işlemleri gösterir."
      >
        <div className="flex flex-wrap items-center gap-2">
          <KarekodOkuyucu onOkundu={tani} etiket="Kamerayı Aç ve Okut" />
          {bekle && <span className="text-sm text-slate-500">Aranıyor…</span>}
        </div>

        <form onSubmit={elleSorgula} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <Girdi
              value={elle}
              onChange={(e) => setElle(e.target.value)}
              placeholder="Kodu elle yazın — T00000123, CBD-D-2026-0001, HM-2026-0001…"
              aria-label="Kod"
            />
          </div>
          <Dugme type="submit" cesit="ikincil" disabled={!elle.trim()}>
            Bul
          </Dugme>
        </form>

        {hata && (
          <div className="mt-3">
            <Uyari cesit="hata">{hata}</Uyari>
          </div>
        )}
      </Kart>

      {sonuc && <SonucKarti s={sonuc} />}

      {gecmis.length > 1 && (
        <Kart baslik={`Bu Oturumda Okutulanlar (${gecmis.length})`}>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {gecmis.map((g) => (
              <li key={g.anahtar}>
                <button
                  type="button"
                  onClick={() => setSonuc(g)}
                  className="dokunma-hedefi flex w-full items-center justify-between gap-3 py-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{g.baslik}</span>
                    <span className="block truncate font-mono text-xs text-slate-500">
                      {TIP_ETIKET[g.tip]} · {g.anahtar}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${DURUM_RENK[g.durumCesit]}`}
                  >
                    {g.durum}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Kart>
      )}
    </>
  );
}

function SonucKarti({ s }: { s: HizliSonuc }) {
  if (s.tip === "BILINMEYEN") {
    return (
      <Kart baslik="Tanınmadı">
        <Uyari cesit="uyari">{s.neden}</Uyari>
      </Kart>
    );
  }

  const birincil = s.eylemler.find((e) => e.birincil);
  const digerleri = s.eylemler.filter((e) => !e.birincil);

  return (
    <Kart baslik={s.baslik}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${DURUM_RENK[s.durumCesit]}`}>
          {s.durum}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {TIP_ETIKET[s.tip]}
        </span>
        <span className="font-mono text-xs text-slate-500">{s.anahtar}</span>
      </div>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {s.alanlar.map(([etiket, deger]) => (
          <div key={etiket} className="flex justify-between gap-3 border-b border-slate-100 py-1 dark:border-slate-700/60">
            <dt className="shrink-0 text-xs font-semibold text-slate-500">{etiket}</dt>
            <dd className="text-right text-sm">{deger}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {birincil && (
          <Link
            href={birincil.yol}
            className="dokunma-hedefi inline-flex items-center justify-center rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800"
          >
            {birincil.etiket} →
          </Link>
        )}
        {digerleri.map((e) => (
          <Link
            key={e.yol}
            href={e.yol}
            className="dokunma-hedefi inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {e.etiket}
          </Link>
        ))}
      </div>
    </Kart>
  );
}
