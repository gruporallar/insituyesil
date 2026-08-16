"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alan, Dugme, Girdi, Kart, Uyari, cagir, useBildirim } from "./Arayuz";

/** `src/lib/db.ts` içindeki MIN_SIFRE_UZUNLUK ile aynı olmalı. */
const MIN_SIFRE = 12;

export function SifreEkrani({
  kullanici,
}: {
  kullanici: { ad: string; email: string; rol: string };
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  const [mevcut, setMevcut] = useState("");
  const [yeni, setYeni] = useState("");
  const [tekrar, setTekrar] = useState("");
  const [hata, setHata] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const [basarili, setBasarili] = useState(false);

  // Eşleşme kontrolü İSTEMCİDE: sunucuya iki kez aynı değeri göndermenin
  // anlamı yok, bu bir yazım hatası koruması.
  const eslesmiyor = tekrar.length > 0 && yeni !== tekrar;
  const kisa = yeni.length > 0 && yeni.length < MIN_SIFRE;

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata("");
    if (yeni !== tekrar) {
      setHata("Yeni şifre ile tekrarı aynı değil.");
      return;
    }
    setBekliyor(true);
    try {
      await cagir("/api/auth/sifre-degistir", {
        govde: { mevcut_sifre: mevcut, yeni_sifre: yeni },
      });
      setMevcut("");
      setYeni("");
      setTekrar("");
      setBasarili(true);
      bildirim.basari("Şifreniz değiştirildi.");
      router.refresh();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <>
      <Kart
        baslik="Şifremi Değiştir"
        aciklama={`${kullanici.ad} · ${kullanici.rol} · ${kullanici.email}`}
      >
        {basarili && (
          <Uyari cesit="basari" baslik="Şifreniz değiştirildi">
            Bu cihazdaki oturumunuz açık kaldı. Başka bir cihaz veya tarayıcıda açık
            oturumunuz varsa kapatıldı; oralarda yeni şifreyle tekrar giriş yapmanız
            gerekir.
          </Uyari>
        )}

        {hata && <Uyari cesit="hata">{hata}</Uyari>}

        <form onSubmit={gonder} className="max-w-md space-y-3">
          <Alan etiket="Mevcut Şifre *">
            <Girdi
              type="password"
              required
              autoComplete="current-password"
              value={mevcut}
              onChange={(e) => setMevcut(e.target.value)}
            />
          </Alan>

          <Alan
            etiket="Yeni Şifre *"
            ipucu={`En az ${MIN_SIFRE} karakter. Karmaşıklık değil uzunluk önemli — bir cümle kullanabilirsiniz.`}
            hata={kisa ? `Şifre en az ${MIN_SIFRE} karakter olmalı (şu an ${yeni.length}).` : undefined}
          >
            <Girdi
              type="password"
              required
              minLength={MIN_SIFRE}
              autoComplete="new-password"
              value={yeni}
              onChange={(e) => setYeni(e.target.value)}
            />
          </Alan>

          <Alan
            etiket="Yeni Şifre (tekrar) *"
            hata={eslesmiyor ? "İki şifre aynı değil." : undefined}
          >
            <Girdi
              type="password"
              required
              autoComplete="new-password"
              value={tekrar}
              onChange={(e) => setTekrar(e.target.value)}
            />
          </Alan>

          <div className="flex justify-end pt-1">
            <Dugme
              type="submit"
              bekliyor={bekliyor}
              disabled={!mevcut || !yeni || !tekrar || eslesmiyor || kisa}
            >
              Şifremi Değiştir
            </Dugme>
          </div>
        </form>
      </Kart>

      <Kart baslik="Neden önemli">
        <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          Sistem her işlemi kimin yaptığını kaydediyor ve bu kayıt denetimde delil
          niteliğinde. Şifrenizi sizden başkası biliyorsa, o kayıtların size ait olduğu
          söylenemez. Hesabınız ilk açıldığında şifreyi Mesul Müdür belirledi —{" "}
          <strong>ilk girişinizde buradan değiştirin</strong>.
        </p>
      </Kart>

      {bildirim.kutu}
    </>
  );
}
