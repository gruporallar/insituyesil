"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alan, Dugme, Girdi, Secim } from "./Arayuz";

/**
 * Liste filtresi ve sayfalama denetimi.
 *
 * Durum ADRES ÇUBUĞUNDA tutuluyor, bileşen içinde değil. Sebebi: filtrelenmiş
 * bir liste paylaşılabilir ve yer imine eklenebilir olmalı — denetimde
 * "şu tarih aralığındaki sevkiyatlar" bağlantısı doğrudan verilebiliyor.
 * Ayrıca sayfa yenilenince filtre kaybolmuyor.
 */
export function Filtre({
  aramaIpucu,
  statuler,
  toplam,
  ilk,
  son,
  sayfa,
  toplamSayfa,
}: {
  aramaIpucu?: string;
  /** Statü seçenekleri: [değer, etiket]. Boşsa statü filtresi gösterilmez. */
  statuler?: [string, string][];
  toplam: number;
  ilk: number;
  son: number;
  sayfa: number;
  toplamSayfa: number;
}) {
  const router = useRouter();
  const yol = usePathname();
  const sp = useSearchParams();

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [baslangic, setBaslangic] = useState(sp.get("baslangic") ?? "");
  const [bitis, setBitis] = useState(sp.get("bitis") ?? "");
  const [statu, setStatu] = useState(sp.get("statu") ?? "");

  function git(degisiklikler: Record<string, string>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(degisiklikler)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(`${yol}?${p.toString()}`);
  }

  function uygula(e: React.FormEvent) {
    e.preventDefault();
    // Filtre değişince İLK SAYFAYA dönülüyor: 5. sayfadayken daraltma yapmak
    // çoğu zaman boş sonuç gösterirdi ve kullanıcı "kayıt yok" sanırdı.
    git({ q, baslangic, bitis, statu, sayfa: "" });
  }

  function temizle() {
    setQ(""); setBaslangic(""); setBitis(""); setStatu("");
    router.push(yol);
  }

  const filtreVar = Boolean(q || baslangic || bitis || statu);

  return (
    <div className="yazdirma-gizle mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
      <form onSubmit={uygula}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Alan etiket="Ara" ipucu={aramaIpucu}>
            <Girdi value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kod, ad, numara…" />
          </Alan>
          <Alan etiket="Başlangıç">
            <Girdi type="date" value={baslangic} onChange={(e) => setBaslangic(e.target.value)} />
          </Alan>
          <Alan etiket="Bitiş">
            <Girdi type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} />
          </Alan>
          {statuler && statuler.length > 0 && (
            <Alan etiket="Statü">
              <Secim value={statu} onChange={(e) => setStatu(e.target.value)}>
                <option value="">Tümü</option>
                {statuler.map(([d, e]) => (
                  <option key={d} value={d}>{e}</option>
                ))}
              </Secim>
            </Alan>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {toplam === 0
              ? filtreVar
                ? "Filtreye uyan kayıt yok."
                : "Kayıt yok."
              : `${toplam.toLocaleString("tr-TR")} kayıttan ${ilk}–${son} arası`}
          </span>
          <div className="flex gap-2">
            {filtreVar && (
              <Dugme type="button" cesit="ikincil" onClick={temizle}>Temizle</Dugme>
            )}
            <Dugme type="submit">Filtrele</Dugme>
          </div>
        </div>
      </form>

      {toplamSayfa > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <Dugme cesit="ikincil" disabled={sayfa <= 1}
            onClick={() => git({ sayfa: String(sayfa - 1) })}>
            ← Önceki
          </Dugme>
          <span className="px-2 font-mono text-xs tabular-nums">
            {sayfa} / {toplamSayfa}
          </span>
          <Dugme cesit="ikincil" disabled={sayfa >= toplamSayfa}
            onClick={() => git({ sayfa: String(sayfa + 1) })}>
            Sonraki →
          </Dugme>
        </div>
      )}
    </div>
  );
}
