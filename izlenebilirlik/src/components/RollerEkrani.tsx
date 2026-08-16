"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dugme, Kart, Uyari, cagir, useBildirim } from "./Arayuz";

type Satir = {
  anahtar: string;
  deger: boolean;
  varsayilan: boolean;
  kilitli: boolean;
  sapmaVar: boolean;
};

type RolSatiri = {
  rol: string;
  etiket: string;
  duzenlenebilir: boolean;
  ekranlar: Satir[];
  eylemler: Satir[];
};

/**
 * ROLLER VE YETKİLER — her rolün neyi görebileceği ve neyi yapabileceği.
 *
 * Ekranın taşıdığı asıl bilgi DEĞİŞTİRİLEBİLİRLİK DEĞİL, SAPMA: hangi yetki
 * GMP varsayılanından ayrılmış. Denetimde sorulan soru "kim neyi yapabilir"
 * değil, "belgedeki görev tanımından nerede ayrıldınız ve neden".
 */
export function RollerEkrani({
  tablo,
  ekranEtiketleri,
  eylemEtiketleri,
}: {
  tablo: RolSatiri[];
  ekranEtiketleri: Record<string, string>;
  eylemEtiketleri: Record<string, string>;
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  const ilkDuzenlenebilir = tablo.find((r) => r.duzenlenebilir)?.rol ?? tablo[0]?.rol;
  const [secili, setSecili] = useState(ilkDuzenlenebilir);
  const [taslak, setTaslak] = useState<Record<string, Record<string, boolean>>>({});
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState("");

  const rol = tablo.find((r) => r.rol === secili);
  if (!rol) return null;

  const deger = (tur: "ekranlar" | "eylemler", s: Satir) =>
    taslak[`${secili}:${tur}`]?.[s.anahtar] ?? s.deger;

  function degistir(tur: "ekranlar" | "eylemler", anahtar: string, v: boolean) {
    setTaslak((t) => ({
      ...t,
      [`${secili}:${tur}`]: { ...(t[`${secili}:${tur}`] ?? {}), [anahtar]: v },
    }));
  }

  const kirliMi = Object.keys(taslak[`${secili}:ekranlar`] ?? {}).length > 0 ||
    Object.keys(taslak[`${secili}:eylemler`] ?? {}).length > 0;

  async function kaydet() {
    setHata("");
    setBekle(true);
    try {
      const ekranlar: Record<string, boolean> = {};
      for (const s of rol!.ekranlar) if (!s.kilitli) ekranlar[s.anahtar] = deger("ekranlar", s);
      const eylemler: Record<string, boolean> = {};
      for (const s of rol!.eylemler) if (!s.kilitli) eylemler[s.anahtar] = deger("eylemler", s);

      const r = await cagir<{ degisen: string[] }>("/api/roller", {
        govde: { rol: secili, ekranlar, eylemler },
      });
      setTaslak({});
      bildirim.basari(
        r.degisen.length
          ? `${rol!.etiket}: ${r.degisen.length} yetki güncellendi.`
          : "Değişiklik yok."
      );
      router.refresh();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(false);
    }
  }

  function varsayilanaDon() {
    const e: Record<string, boolean> = {};
    for (const s of rol!.ekranlar) if (!s.kilitli) e[s.anahtar] = s.varsayilan;
    const y: Record<string, boolean> = {};
    for (const s of rol!.eylemler) if (!s.kilitli) y[s.anahtar] = s.varsayilan;
    setTaslak((t) => ({ ...t, [`${secili}:ekranlar`]: e, [`${secili}:eylemler`]: y }));
  }

  const sapmaSayisi =
    rol.ekranlar.filter((s) => s.sapmaVar).length + rol.eylemler.filter((s) => s.sapmaVar).length;

  return (
    <>
      <Kart
        baslik="Roller ve Yetkiler"
        aciklama="Her rolün hangi ekranı görebileceğini ve hangi işlemi yapabileceğini burada belirlersiniz. Varsayılanlar GMP görev tanımlarından (GT-01 … GT-06) ve Ek-13 'Durdurma Yetkisi' tablosundan geliyor."
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {tablo.map((r) => {
            const s = r.ekranlar.filter((x) => x.sapmaVar).length + r.eylemler.filter((x) => x.sapmaVar).length;
            return (
              <button
                key={r.rol}
                type="button"
                onClick={() => setSecili(r.rol)}
                className={`dokunma-hedefi inline-flex rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  r.rol === secili
                    ? "bg-green-700 text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {r.etiket}
                {s > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                      r.rol === secili ? "bg-white/25" : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
                    }`}
                    title={`${s} yetki varsayılandan farklı`}
                  >
                    {s}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {hata && <Uyari cesit="hata">{hata}</Uyari>}

        {!rol.duzenlenebilir ? (
          <Uyari cesit="uyari" baslik="Admin yetkileri değiştirilemez">
            Admin rolü sistemin tamamına sahiptir ve bu kısıtlanamaz. Sebebi bir tercih değil,
            emniyet: yetkileri düzenlenebilir olsaydı son admin kendi yetkisini kapatıp sistemi
            kimsenin açamayacağı hâle getirebilirdi. Kurtarmanın tek yolu veritabanına elle
            müdahale olurdu.
          </Uyari>
        ) : (
          <>
            {sapmaSayisi > 0 && (
              <Uyari cesit="uyari" baslik={`${sapmaSayisi} yetki GMP varsayılanından farklı`}>
                Turuncu işaretli satırlar görev tanımındaki varsayılandan ayrılmış durumda.
                Denetimde bu farkların gerekçesi sorulur — kalite dokümantasyonunda karşılığı
                olduğundan emin olun.
              </Uyari>
            )}

            <Bolum
              baslik="Ekranlar"
              aciklama="Kullanıcı bu sayfaları menüde görür ve açabilir."
              satirlar={rol.ekranlar}
              etiketler={ekranEtiketleri}
              deger={(s) => deger("ekranlar", s)}
              degistir={(a, v) => degistir("ekranlar", a, v)}
            />

            <Bolum
              baslik="İşlemler"
              aciklama="Ekranı görmek yetmez; kritik düğmeye basabilmek ayrı bir yetkidir."
              satirlar={rol.eylemler}
              etiketler={eylemEtiketleri}
              deger={(s) => deger("eylemler", s)}
              degistir={(a, v) => degistir("eylemler", a, v)}
            />

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Dugme type="button" cesit="ikincil" onClick={varsayilanaDon}>
                GMP Varsayılanına Dön
              </Dugme>
              <Dugme type="button" onClick={kaydet} bekliyor={bekle} disabled={!kirliMi}>
                {rol.etiket} Yetkilerini Kaydet
              </Dugme>
            </div>
          </>
        )}
      </Kart>

      {bildirim.kutu}
    </>
  );
}

function Bolum({
  baslik,
  aciklama,
  satirlar,
  etiketler,
  deger,
  degistir,
}: {
  baslik: string;
  aciklama: string;
  satirlar: Satir[];
  etiketler: Record<string, string>;
  deger: (s: Satir) => boolean;
  degistir: (anahtar: string, v: boolean) => void;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold">{baslik}</h3>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{aciklama}</p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {satirlar.map((s) => {
          const v = deger(s);
          const sapti = v !== s.varsayilan;
          return (
            <li key={s.anahtar}>
              <label
                className={`dokunma-hedefi flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${
                  s.kilitli ? "cursor-not-allowed opacity-60" : "hover:bg-slate-100 dark:hover:bg-slate-700"
                } ${sapti ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={v}
                  disabled={s.kilitli}
                  onChange={(e) => degistir(s.anahtar, e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-green-700"
                />
                <span className="min-w-0 flex-1 text-sm">
                  {etiketler[s.anahtar] ?? s.anahtar}
                  {s.kilitli && (
                    <span className="ml-1 text-[11px] font-semibold text-slate-500">· sabit</span>
                  )}
                  {sapti && (
                    <span className="ml-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      · varsayılan {s.varsayilan ? "açık" : "kapalı"}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
