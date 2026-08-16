"use client";

import { trTarih } from "./Arayuz";
import type { FormAlani, FormSablonu } from "@/lib/formSablon";

/**
 * KÂĞIT FORM BASKISI.
 *
 * Ekranda değil KÂĞITTA doğru görünmesi için tasarlandı: siyah beyaz, ince
 * çerçeveli, dolduranın kalemi için yeterli yükseklikte satırlar. Renkli
 * rozet ve gölge YOK — hepsi baskıda griye dönüp okunaksızlaşır.
 *
 * SİSTEM ALANI ile SAHA ALANI görsel olarak AYRIK: sistemin doldurduğu değer
 * düz metin, sahada doldurulacak alan alt çizgili boşluk. Sahadaki kişi neyi
 * yazacağını kâğıda bakar bakmaz görmeli; talimat okumak zorunda kalmamalı.
 */
export function FormBaskisi({
  sablon, deger, satirlar, gorevKod, donem, vade, periyotAd, dayanak,
  seriNo, basanAd, basimTarihi, yenidenBasim, bugun,
}: {
  sablon: FormSablonu;
  deger: Record<string, string>;
  satirlar: Record<string, string>[];
  gorevKod: string;
  donem: string;
  vade: string;
  periyotAd: string;
  dayanak: string;
  seriNo: string | null;
  basanAd: string | null;
  basimTarihi: string | null;
  yenidenBasim: boolean;
  bugun: string;
}) {
  const toplamSatir = Math.max(satirlar.length, sablon.satirSayisi);

  return (
    <>
      <div className="yazdirma-gizle mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/60">
        <div className="min-w-0 text-sm">
          <p className="font-semibold">{sablon.ad}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {gorevKod} · {dayanak}
            {seriNo && <> · baskı seri <span className="font-mono">{seriNo}</span></>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="dokunma-hedefi inline-flex items-center justify-center rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800"
        >
          Yazdır
        </button>
      </div>

      {/* Baskı gövdesi — beyaz zemin, siyah metin, her temada aynı. */}
      <div className="baski mx-auto max-w-[210mm] bg-white p-6 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {/* ── Antet ─────────────────────────────────────────────────────── */}
        <div className="text-center">
          <p className="text-sm font-bold">İnsitu Yeşil Teknolojiler Sanayi ve Ticaret Anonim Şirketi</p>
          <p className="text-[10px]">
            Pazar Mah. Mehmet Akif Ersoy Bulvarı No:125, Gölhisar / Burdur | insitu@hs01.kep.tr
          </p>
          <p className="mt-2 text-xs font-semibold tracking-wide">KAYIT FORMU</p>
          <p className="text-base font-bold">{sablon.ad}</p>
        </div>

        {/* ── Kimlik bloğu ──────────────────────────────────────────────── */}
        <table className="mt-3 w-full border-collapse text-[11px]">
          <tbody>
            <tr>
              <Th>Kod</Th><Td>{sablon.kod}</Td>
              <Th>Versiyon</Th><Td>{sablon.versiyon}</Td>
              <Th>İlgili Prosedür</Th><Td>{sablon.ilgiliProsedur}</Td>
            </tr>
            <tr>
              <Th>Görev No</Th><Td>{gorevKod}</Td>
              <Th>Dönem</Th><Td>{donem} ({periyotAd})</Td>
              <Th>Kayıt Saklama</Th><Td>{sablon.saklama}</Td>
            </tr>
            <tr>
              <Th>Dayanak</Th><Td>{dayanak}</Td>
              <Th>Son Tarih</Th><Td>{trTarih(vade)}</Td>
              {/* SERİ NUMARASI KÂĞIDIN ÜSTÜNDE. Nüsha sayısının izlenebilmesi
                  bu numaraya bağlı; ayrı bir yere yazılsaydı kesilip
                  atılabilirdi. */}
              <Th>Baskı Seri No</Th>
              <Td>
                <span className="font-mono font-bold">{seriNo ?? "—"}</span>
                {yenidenBasim && <span className="ml-1 font-bold"> (YENİDEN BASIM)</span>}
              </Td>
            </tr>
          </tbody>
        </table>

        {/* ── Üst alanlar ───────────────────────────────────────────────── */}
        {sablon.ustAlanlar.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            {sablon.ustAlanlar.map((a, i) => (
              <AlanSatiri key={i} alan={a} deger={deger} />
            ))}
          </div>
        )}

        {/* ── Gövde tablosu ─────────────────────────────────────────────── */}
        {sablon.sutunlar.length > 0 && (
          <table className="mt-3 w-full border-collapse text-[10px]">
            <thead>
              <tr>
                {sablon.sutunlar.map((s) => (
                  <th
                    key={s.baslik}
                    style={{ width: `${s.genislik}%` }}
                    className="border border-black bg-neutral-100 px-1 py-1 text-left font-bold"
                  >
                    {s.baslik}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: toplamSatir }, (_, r) => (
                <tr key={r}>
                  {sablon.sutunlar.map((s) => (
                    <td key={s.baslik} className="h-[22px] border border-black px-1 py-0.5 align-middle">
                      {s.kaynak === "SISTEM" && s.anahtar ? (satirlar[r]?.[s.anahtar] ?? "") : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── Alt alanlar ───────────────────────────────────────────────── */}
        {sablon.altAlanlar && sablon.altAlanlar.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            {sablon.altAlanlar.map((a, i) => (
              <AlanSatiri key={i} alan={a} deger={deger} />
            ))}
          </div>
        )}

        {/* ── Notlar ────────────────────────────────────────────────────── */}
        {sablon.notlar && sablon.notlar.length > 0 && (
          <ul className="mt-3 space-y-0.5 border border-black p-2 text-[10px]">
            {sablon.notlar.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
        )}

        {/* ── İmza bloğu ────────────────────────────────────────────────── */}
        <table className="mt-4 w-full border-collapse text-[10px]">
          <tbody>
            <tr>
              {sablon.imzalar.map((im) => (
                <th key={im.unvan} className="border border-black bg-neutral-100 px-1 py-1 text-left font-bold">
                  {im.unvan}
                </th>
              ))}
            </tr>
            <tr>
              {sablon.imzalar.map((im) => (
                <td key={im.unvan} className="h-[52px] border border-black px-1 py-1 align-top">
                  {im.ad && <span className="text-[10px]">{im.ad}</span>}
                </td>
              ))}
            </tr>
            <tr>
              {sablon.imzalar.map((im) => (
                <td key={im.unvan} className="border border-black px-1 py-0.5 text-[9px]">
                  Ad-Soyad / İmza / Tarih
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {/* ── Baskı künyesi ─────────────────────────────────────────────── */}
        <p className="mt-2 border-t border-black pt-1 text-[9px]">
          Bu form {basanAd ? `${basanAd} tarafından ` : ""}
          {basimTarihi ? `${basimTarihi} tarihinde ` : `${trTarih(bugun)} tarihinde `}
          izlenebilirlik sisteminden basılmıştır · Baskı seri no {seriNo ?? "—"} ·
          Sistem yalnızca formu üretir ve arşive dönüşünü izler; ASIL KAYIT bu ıslak imzalı kâğıttır.
        </p>
      </div>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="w-[13%] border border-black bg-neutral-100 px-1 py-0.5 text-left font-bold">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="w-[20%] border border-black px-1 py-0.5">{children}</td>;
}

/**
 * Tek alan satırı.
 *
 * SAHA alanı alt çizgili boşluk olarak basılıyor — kalem için hem yer
 * bırakıyor hem "burayı sen dolduracaksın" diyor. SİSTEM alanı düz metin.
 */
function AlanSatiri({ alan, deger }: { alan: FormAlani; deger: Record<string, string> }) {
  const v = alan.kaynak === "SISTEM" ? (alan.sabit ?? deger[alan.anahtar ?? ""] ?? "") : "";
  return (
    <div className={`flex items-baseline gap-2 ${alan.genis ? "col-span-2" : ""}`}>
      <span className="shrink-0 font-bold">{alan.etiket}</span>
      {alan.kaynak === "SISTEM" ? (
        <span className="min-w-0 flex-1 border-b border-black">{v || "—"}</span>
      ) : (
        <span className="min-w-0 flex-1 border-b border-dotted border-black">&nbsp;</span>
      )}
    </div>
  );
}
