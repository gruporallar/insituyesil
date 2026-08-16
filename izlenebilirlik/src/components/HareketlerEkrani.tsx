"use client";

import { useState } from "react";
import { Bos, Dugme, Hucre, Kart, Satir, Tablo, Uyari, cagir, trZaman } from "./Arayuz";
import { Filtre } from "./Filtre";

/**
 * Denetim izi görünümü — salt okunur.
 *
 * "Zinciri Doğrula" düğmesi hash zincirini sunucuda baştan sona yürütür:
 * her satır bir öncekinin özetini taşır; tek bir satır sonradan değişmiş
 * ya da silinmişse zincir o noktada kopar ve rapor kopma yerini söyler.
 */
export function HareketlerEkrani({
  kayitlar,
  sayfalama,
}: {
  kayitlar: any[];
  sayfalama: { toplam: number; ilk: number; son: number; sayfa: number; toplamSayfa: number };
}) {
  const [sonuc, setSonuc] = useState<{ tamam: boolean; mesaj: string } | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function dogrula() {
    setBekliyor(true);
    setSonuc(null);
    try {
      const r = await cagir<{ tamam: boolean; mesaj: string }>("/api/hareketler/dogrula", {
        yontem: "POST",
      });
      setSonuc(r);
    } catch (e) {
      setSonuc({ tamam: false, mesaj: (e as Error).message });
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <Kart
      baslik={`Denetim İzi (${sayfalama.toplam})`}
      aciklama="Kim, ne zaman, ne yaptı. Kayıtlar silinmez ve değiştirilmez (ALCOA+); her satır bir öncekinin kriptografik özetini taşır."
      sag={
        <Dugme cesit="ikincil" onClick={dogrula} bekliyor={bekliyor}>
          Zinciri Doğrula
        </Dugme>
      }
    >
      {sonuc && (
        <Uyari
          cesit={sonuc.tamam ? "basari" : "hata"}
          baslik={sonuc.tamam ? "Zincir sağlam" : "Zincir doğrulanamadı"}
        >
          {sonuc.mesaj}
        </Uyari>
      )}

      <Filtre
        aramaIpucu="İşlem, kayıt, detay veya kullanıcı adı"
        toplam={sayfalama.toplam}
        ilk={sayfalama.ilk}
        son={sayfalama.son}
        sayfa={sayfalama.sayfa}
        toplamSayfa={sayfalama.toplamSayfa}
      />

      <Tablo basliklar={["Zaman", "Kullanıcı", "İşlem", "Kayıt", "Detay", "Özet"]}>
        {kayitlar.length === 0 ? (
          <Bos sutun={6}>Bu filtreye uyan hareket yok.</Bos>
        ) : (
          kayitlar.map((l) => (
            <Satir key={l.id}>
              <Hucre className="whitespace-nowrap font-mono text-xs tabular-nums">
                {trZaman(l.tarih)}
              </Hucre>
              <Hucre className="text-xs">{l.ad_soyad ?? "—"}</Hucre>
              <Hucre className="text-sm">{l.eylem}</Hucre>
              <Hucre className="font-mono text-xs">{l.kayit ?? "—"}</Hucre>
              <Hucre className="max-w-64 truncate text-xs text-slate-500" >
                {l.detay ?? "—"}
              </Hucre>
              <Hucre
                className="font-mono text-[10px] text-slate-400"
                // Özetin tamamı title'da — sütunu şişirmeden denetçiye açık.
              >
                <span title={l.ozet ?? undefined}>{l.ozet ? l.ozet.slice(0, 8) : "—"}</span>
              </Hucre>
            </Satir>
          ))
        )}
      </Tablo>
    </Kart>
  );
}
