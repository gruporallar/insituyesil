"use client";

import Link from "next/link";
import { useState } from "react";
import { Kart, Uyari, trTarih } from "./Arayuz";
import type { Bulgu, DenetimSonucu, Seviye } from "@/lib/denetim";

const SEVIYE_ETIKET: Record<Seviye, string> = {
  KRITIK: "Kritik",
  YUKSEK: "Yüksek",
  ORTA: "Orta",
  BILGI: "Bilgi",
};

const SEVIYE_RENK: Record<Seviye, string> = {
  KRITIK: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  YUKSEK: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  ORTA: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  BILGI: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
};

const SEVIYE_KENAR: Record<Seviye, string> = {
  KRITIK: "border-l-4 border-red-500",
  YUKSEK: "border-l-4 border-amber-500",
  ORTA: "border-l-4 border-sky-500",
  BILGI: "border-l-4 border-slate-300 dark:border-slate-600",
};

const SIRA: Seviye[] = ["KRITIK", "YUKSEK", "ORTA", "BILGI"];

/**
 * ÖN DENETİM RAPORU.
 *
 * Ekranın işi bir liste göstermek değil, ÖNCELİK vermek: müfettiş yarın gelse
 * hangi üç şeyi bugün bitirmek gerekir. Bu yüzden en üstte tek cümlelik hüküm,
 * sonra seviyeye göre sıralı bulgular var — ve her bulgunun yanında doğrudan
 * ilgili ekrana giden bağlantı.
 */
export function DenetimEkrani({
  sonuc,
  tarama,
}: {
  sonuc: DenetimSonucu;
  tarama: string;
}) {
  const [suzgec, setSuzgec] = useState<Seviye | "HEPSI">("HEPSI");

  const gorunen =
    suzgec === "HEPSI" ? sonuc.bulgular : sonuc.bulgular.filter((b) => b.seviye === suzgec);

  return (
    <>
      <Kart
        baslik="Ön Denetim Raporu"
        aciklama={`Bakanlık/GMP denetimi öncesi kendi kendini tarama. ${trTarih(tarama)} tarihli kayıtlar üzerinde çalıştırıldı.`}
        sag={
          <button
            type="button"
            onClick={() => window.print()}
            className="yazdirma-gizle dokunma-hedefi inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Yazdır / PDF
          </button>
        }
      >
        <Uyari cesit={sonuc.hazir ? (sonuc.sayim.YUKSEK ? "uyari" : "basari") : "hata"}
          baslik={sonuc.hazir ? "Kritik bulgu yok" : "Denetime hazır değil"}>
          {sonuc.hukum}
        </Uyari>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SIRA.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSuzgec(suzgec === s ? "HEPSI" : s)}
              className={`dokunma-hedefi inline-flex flex-col items-start rounded-lg border p-3 text-left transition ${
                suzgec === s
                  ? "border-slate-900 dark:border-slate-100"
                  : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              }`}
            >
              <span className="block font-mono text-2xl font-bold tabular-nums">
                {sonuc.sayim[s]}
              </span>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${SEVIYE_RENK[s]}`}>
                {SEVIYE_ETIKET[s]}
              </span>
            </button>
          ))}
        </div>
        {suzgec !== "HEPSI" && (
          <p className="mt-2 text-xs text-slate-500">
            Yalnızca {SEVIYE_ETIKET[suzgec].toLowerCase()} bulgular gösteriliyor —
            <button type="button" onClick={() => setSuzgec("HEPSI")} className="ml-1 underline">
              tümünü göster
            </button>
          </p>
        )}
      </Kart>

      {gorunen.length === 0 ? (
        <Kart baslik="Bulgu yok">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {sonuc.bulgular.length === 0
              ? "Tarama hiçbir eksiklik bulmadı. Aşağıdaki kapsam dışı başlıkları elle kontrol etmeyi unutmayın."
              : "Bu seviyede bulgu yok."}
          </p>
        </Kart>
      ) : (
        gorunen.map((b) => <BulguKarti key={b.kod} b={b} />)
      )}

      <Kart
        baslik="Bu Tarama NEYE BAKMIYOR"
        aciklama="Sistem yalnızca kendi tuttuğu kayıtları denetleyebilir. Aşağıdakiler sistemin dışında duruyor ve denetimden önce elle kontrol edilmeli."
      >
        {/*
          Bu bölüm bilerek raporun İÇİNDE. Ayrı bir yere konsaydı ya da hiç
          yazılmasaydı, "sistem yeşil yaktı, hazırız" yanılgısı doğardı —
          denetimde en pahalı yanılgı budur.
        */}
        <ul className="ml-4 list-disc space-y-1 text-sm text-slate-700 dark:text-slate-300">
          {sonuc.kapsamDisi.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </Kart>
    </>
  );
}

function BulguKarti({ b }: { b: Bulgu }) {
  const [acik, setAcik] = useState(false);
  const cok = b.kayitlar.length > 6;
  const liste = acik ? b.kayitlar : b.kayitlar.slice(0, 6);

  return (
    <div className={`mb-3 rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800 ${SEVIYE_KENAR[b.seviye]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${SEVIYE_RENK[b.seviye]}`}>
              {SEVIYE_ETIKET[b.seviye]}
            </span>
            <span className="font-mono text-xs text-slate-500">{b.kod}</span>
          </div>
          <h3 className="mt-1 text-sm font-bold">{b.baslik}</h3>
        </div>
        {b.yol && (
          <Link
            href={b.yol}
            className="yazdirma-gizle dokunma-hedefi inline-flex shrink-0 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            İlgili ekrana git →
          </Link>
        )}
      </div>

      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{b.detay}</p>

      {b.kayitlar.length > 0 && (
        <div className="mt-2">
          <ul className="flex flex-wrap gap-1">
            {liste.map((k) => (
              <li
                key={k}
                className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs dark:bg-slate-700"
              >
                {k}
              </li>
            ))}
          </ul>
          {cok && (
            <button
              type="button"
              onClick={() => setAcik((a) => !a)}
              className="yazdirma-gizle mt-1 text-xs font-semibold underline"
            >
              {acik ? "Daralt" : `Tümünü göster (${b.kayitlar.length})`}
            </button>
          )}
        </div>
      )}

      <dl className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs dark:border-slate-700">
        <div className="flex gap-2">
          <dt className="shrink-0 font-semibold text-slate-500">Dayanak</dt>
          <dd className="text-slate-700 dark:text-slate-300">{b.dayanak}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-semibold text-slate-500">Yapılacak</dt>
          <dd className="text-slate-700 dark:text-slate-300">{b.oneri}</dd>
        </div>
      </dl>
    </div>
  );
}
