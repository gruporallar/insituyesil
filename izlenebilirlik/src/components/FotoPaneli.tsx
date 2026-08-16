"use client";

import { Dugme, Kart } from "./Arayuz";
import { FotoEk } from "./FotoEk";
import type { EkKaynak } from "@/lib/ek";

/**
 * Bir tablo satırından açılan fotoğraf paneli.
 *
 * Tablonun İÇİNE açılan bir satır denendi ve bırakıldı: telefonda tablo zaten
 * yatay kayıyor, açılan satır da onunla birlikte kayınca fotoğraflar ekran
 * dışında kalıyordu. Panel tablonun ÜSTÜNDE, sabit genişlikte açılıyor —
 * ekranın geri kalanıyla aynı hizada.
 */
export function FotoPaneli({
  kaynakTip,
  kod,
  baslik,
  yazabilir,
  ipucu,
  kapat,
}: {
  kaynakTip: EkKaynak;
  kod: string | null;
  baslik?: string;
  yazabilir: boolean;
  ipucu?: string;
  kapat: () => void;
}) {
  if (!kod) return null;
  return (
    <Kart
      baslik={`${kod} — Fotoğraflar`}
      aciklama={baslik}
      sag={
        <Dugme type="button" cesit="ikincil" onClick={kapat}>
          Kapat
        </Dugme>
      }
    >
      <FotoEk
        kaynakTip={kaynakTip}
        kaynakKod={kod}
        yazabilir={yazabilir}
        baslik="Kayıt Fotoğrafları"
        ipucu={ipucu}
      />
    </Kart>
  );
}

/** Tablo satırındaki tetikleyici. */
export function FotoDugmesi({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dokunma-hedefi inline-flex whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
    >
      📷 Foto
    </button>
  );
}
