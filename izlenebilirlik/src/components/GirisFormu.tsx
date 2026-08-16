"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alan, Dugme, Girdi, Kart, Uyari, cagir } from "./Arayuz";

export function GirisFormu() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState("");
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata("");
    setBekliyor(true);
    try {
      await cagir("/api/auth/login", { govde: { email, sifre } });
      // `refresh()` de gerekiyor: sunucu bileşenleri oturumu yeniden okumalı,
      // yoksa yönlendirme sonrası hâlâ giriş sayfası render edilebiliyor.
      router.replace("/");
      router.refresh();
    } catch (e) {
      setHata((e as Error).message);
      setBekliyor(false);
    }
  }

  return (
    <Kart>
      <form onSubmit={gonder} className="space-y-3">
        {hata && <Uyari cesit="hata">{hata}</Uyari>}

        <Alan etiket="E-posta">
          <Girdi
            type="email"
            name="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Alan>

        <Alan etiket="Şifre">
          <Girdi
            type="password"
            name="sifre"
            autoComplete="current-password"
            required
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
          />
        </Alan>

        <Dugme type="submit" bekliyor={bekliyor} className="w-full">
          Giriş Yap
        </Dugme>
      </form>
    </Kart>
  );
}
