"use client";

import { useEffect, useRef, useState } from "react";
import { Uyari, cagir, trZaman } from "./Arayuz";
import { EK_AZAMI_ADET, mb } from "@/lib/ek";

type Ek = {
  id: number;
  aciklama: string | null;
  mime: string;
  boyut: number;
  olusturma_tarihi: string;
  ekleyen: string | null;
};

/** Küçültme hedefi — uzun kenar. 1600 px, hasarlı bir etiketi okumaya yeter. */
const UZUN_KENAR = 1600;
/** JPEG kalitesi. 0,72 gözle fark edilmiyor ama dosyayı ~5 kat küçültüyor. */
const KALITE = 0.72;

/**
 * FOTOĞRAF EKİ — "gördüğünü kaydet".
 *
 * `capture="environment"` telefonda galeri yerine DOĞRUDAN arka kamerayı
 * açıyor: operatör iki dokunuşta fotoğrafı ekliyor. Masaüstünde aynı alan
 * normal dosya seçici olarak çalışıyor.
 *
 * Küçültme İSTEMCİDE yapılıyor. Modern bir telefon 4–8 MB'lık JPEG üretiyor;
 * bunu şantiye internetinden ham hâliyle göndermek hem uzun sürüyor hem sık
 * sık yarıda kesiliyordu. Tarayıcıda 1600 px'e indirip yeniden kodlamak
 * dosyayı ~200 KB'a düşürüyor ve yükleme saniyeler yerine anında bitiyor.
 */
export function FotoEk({
  kaynakTip,
  kaynakKod,
  yazabilir = true,
  baslik = "Fotoğraf",
  ipucu,
}: {
  kaynakTip: "HAMMADDE" | "SERI" | "SAPMA" | "IMHA" | "IADE" | "SIKAYET";
  kaynakKod: string;
  yazabilir?: boolean;
  baslik?: string;
  ipucu?: string;
}) {
  const [ekler, setEkler] = useState<Ek[]>([]);
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState("");
  /** Yükleme bitince listeyi tazelemek için artırılıyor. */
  const [tazele, setTazele] = useState(0);
  const girdiRef = useRef<HTMLInputElement | null>(null);

  /**
   * Liste okuma — effect gövdesinde SENKRON setState yok.
   *
   * `iptal` bayrağı, panel kapatıldıktan sonra gelen bir cevabın kaldırılmış
   * bileşene yazmasını engelliyor; kaynak hızlıca değiştirilirse eski isteğin
   * sonucunun yenisinin üstüne binmesini de.
   */
  useEffect(() => {
    if (!kaynakKod) return;
    let iptal = false;
    void (async () => {
      try {
        const r = await cagir<{ ekler: Ek[] }>(
          `/api/ek?kaynak_tip=${kaynakTip}&kaynak_kod=${encodeURIComponent(kaynakKod)}`
        );
        if (!iptal) setEkler(r.ekler ?? []);
      } catch {
        /* liste okunamadıysa sessiz kal — asıl kayıt bundan bağımsız */
      }
    })();
    return () => {
      iptal = true;
    };
  }, [kaynakTip, kaynakKod, tazele]);

  async function secildi(e: React.ChangeEvent<HTMLInputElement>) {
    const dosya = e.target.files?.[0];
    // Girdi HEMEN sıfırlanıyor: aynı fotoğrafı ikinci kez seçmek `change`
    // olayını tetiklemezdi.
    e.target.value = "";
    if (!dosya) return;

    setHata("");
    setBekle(true);
    try {
      const dataUrl = await kucult(dosya);
      await cagir("/api/ek", {
        govde: { kaynak_tip: kaynakTip, kaynak_kod: kaynakKod, veri: dataUrl },
      });
      setTazele((n) => n + 1);
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setBekle(false);
    }
  }

  const dolu = ekler.length >= EK_AZAMI_ADET;

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          {baslik}
          {ekler.length > 0 && (
            <span className="ml-1 text-xs font-normal text-slate-500">
              ({ekler.length}/{EK_AZAMI_ADET})
            </span>
          )}
        </span>
        {yazabilir && (
          <>
            <input
              ref={girdiRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              // Telefonda galeri yerine kamerayı açar.
              capture="environment"
              onChange={secildi}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => girdiRef.current?.click()}
              disabled={bekle || dolu}
              className="dokunma-hedefi inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {bekle ? (
                <>
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                  />
                  Yükleniyor…
                </>
              ) : dolu ? (
                "Sınıra ulaşıldı"
              ) : (
                "📷 Fotoğraf Çek / Seç"
              )}
            </button>
          </>
        )}
      </div>

      {ipucu && !ekler.length && (
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{ipucu}</p>
      )}

      {hata && <Uyari cesit="hata">{hata}</Uyari>}

      {ekler.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {ekler.map((ek) => (
            <li key={ek.id}>
              <a
                href={`/api/ek/${ek.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
                title={`${ek.ekleyen ?? "—"} · ${trZaman(ek.olusturma_tarihi)} · ${mb(ek.boyut)} MB`}
              >
                {/*
                  next/image kullanılmıyor: kaynak kimlik doğrulaması olan bir
                  API ucu ve optimizasyon katmanının oturum çerezi yok.
                */}
                {/*
                  `loading="lazy"` YOK. Panel zaten kullanıcı açtığında
                  render ediliyor ve en fazla 8 küçük görsel içeriyor; tembel
                  yükleme burada bir şey kazandırmıyor, buna karşılık ölçümde
                  görselin isteğinin hiç yapılmamasına yol açtı.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/ek/${ek.id}`}
                  alt={ek.aciklama ?? "Kayıt fotoğrafı"}
                  className="aspect-square w-full object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {yazabilir ? "Henüz fotoğraf eklenmedi." : "Fotoğraf yok."}
        </p>
      )}
    </div>
  );
}

/**
 * Fotoğrafı yeniden boyutlandırıp JPEG'e çevirir.
 *
 * `createImageBitmap` tercih ediliyor: `<img>` + `onload` yolunun aksine ana
 * iş parçacığını kilitlemiyor ve EXIF yönlendirmesini kendisi uyguluyor —
 * aksi hâlde telefonla dikey çekilen fotoğraflar yan yatmış kaydediliyordu.
 */
async function kucult(dosya: File): Promise<string> {
  if (!dosya.type.startsWith("image/")) {
    throw new Error("Yalnızca fotoğraf yükleyebilirsiniz.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(dosya, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Fotoğraf açılamadı. Başka bir görsel deneyin.");
  }

  const olcek = Math.min(1, UZUN_KENAR / Math.max(bitmap.width, bitmap.height));
  const g = Math.max(1, Math.round(bitmap.width * olcek));
  const y = Math.max(1, Math.round(bitmap.height * olcek));

  const tuval = document.createElement("canvas");
  tuval.width = g;
  tuval.height = y;
  const ctx = tuval.getContext("2d");
  if (!ctx) throw new Error("Tarayıcı fotoğrafı işleyemedi.");
  ctx.drawImage(bitmap, 0, 0, g, y);
  bitmap.close();

  const url = tuval.toDataURL("image/jpeg", KALITE);
  if (!url.startsWith("data:image/jpeg")) {
    throw new Error("Fotoğraf dönüştürülemedi.");
  }
  return url;
}
