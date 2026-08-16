"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * Karekod görseli — SVG.
 *
 * SVG, PNG/GIF yerine: etiketler yazıcıdan çıkıyor ve raster bir kod düşük
 * DPI'da okunamaz hale geliyor. SVG her boyutta keskin.
 *
 * HATA DÜZELTME SEVİYESİ "M" (%15). Üretim ortamında etiketin üstüne toz,
 * yağ veya çizik gelebiliyor; "L" (%7) sahada okunamayan kod üretiyordu.
 * Daha yükseği (Q/H) kodu büyütüyor ve küçük ambalaja sığmıyor.
 */
export function Karekod({
  veri,
  boyut = 3,
  className = "",
}: {
  veri: string;
  /** Modül (kare) başına piksel. Etikette 3, ekranda 4–5. */
  boyut?: number;
  className?: string;
}) {
  const svg = useMemo(() => {
    try {
      // Tip numarası 0 = otomatik: veri uzunluğuna göre en küçük sürüm seçilir.
      const qr = qrcode(0, "M");
      qr.addData(veri);
      qr.make();
      return qr.createSvgTag({ cellSize: boyut, margin: 2, scalable: true });
    } catch {
      return null;
    }
  }, [veri, boyut]);

  if (!svg) {
    return (
      <div className={`flex items-center justify-center bg-red-50 p-3 text-xs text-red-700 ${className}`}>
        Karekod üretilemedi
      </div>
    );
  }

  return (
    <div
      className={`[&>svg]:h-auto [&>svg]:w-full ${className}`}
      // Girdi kendi ürettiğimiz kod; qrcode-generator yalnızca <svg> ve <path>
      // üretiyor, kullanıcı metni buraya geçmiyor.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
