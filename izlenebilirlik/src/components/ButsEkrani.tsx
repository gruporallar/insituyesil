"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bos, Dugme, Hucre, Kart, Rozet, Satir, Sayac, Tablo, Uyari,
  cagir, trZaman, useBildirim,
} from "./Arayuz";
import { DisaAktar } from "./DisaAktar";

const TIP_ETIKET: Record<string, string> = {
  URETIM_GIRDI: "Ham madde girişi",
  URETIM: "Üretim bildirimi",
  AMBALAJ: "Ambalajlama",
  SEVKIYAT: "Sevkiyat",
  SATIS: "Satış / teslim",
  RET: "Ret kararı",
  FIRE: "Fire",
  IMHA: "İmha",
  GERI_CEKME: "Geri çekme",
};

export function ButsEkrani({
  kayitlar, ozet, isaretleyebilir,
}: {
  kayitlar: any[]; ozet: any; isaretleyebilir: boolean;
}) {
  const router = useRouter();
  const bildirim = useBildirim();
  const [bekliyor, setBekliyor] = useState(false);
  // Satır seçimi: "hepsini işaretle" düğmesi kaldırıldı. Tek tıkla 37 kaydı
  // girilmiş göstermek, yanlışlıkla basıldığında denetimde doğrudan
  // uygunsuzluk üretirdi. Kullanıcı ne işaretlediğini tek tek seçiyor;
  // "tümünü seç" onay kutusu var ama liste sunucuya yine AÇIK gidiyor.
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [kurumRef, setKurumRef] = useState("");
  const [imzaSifre, setImzaSifre] = useState("");

  const bekleyenler = kayitlar.filter((k) => k.durum === "BEKLIYOR");
  const seciliBekleyen = bekleyenler.filter((b) => secili.has(b.kod));

  function sec(kod: string, v: boolean) {
    setSecili((s) => {
      const y = new Set(s);
      if (v) y.add(kod);
      else y.delete(kod);
      return y;
    });
  }

  function tumunuSec(v: boolean) {
    setSecili(v ? new Set(bekleyenler.map((b) => b.kod)) : new Set());
  }

  function disaAktar() {
    const veri = bekleyenler.map((b) => ({
      bildirim_no: b.kod,
      zaman: b.zaman,
      tip: b.tip,
      ilgili_kayit: b.ref,
      adet: b.adet,
      detay: b.detay ? JSON.parse(b.detay) : null,
    }));
    const blob = new Blob([JSON.stringify(veri, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buts-bildirim-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function isaretle() {
    if (
      !confirm(
        `${bekleyenler.length} bildirim "Kurum arayüzüne elle girildi" olarak işaretlenecek.\n\n` +
          "Bunu YALNIZCA bildirimleri BÜTS'e fiilen girdiyseniz onaylayın. Sistem Kuruma " +
          "hiçbir şey göndermez; bu yalnızca sizin yaptığınız işin kaydıdır.\n\nDevam edilsin mi?"
      )
    )
      return;

    setBekliyor(true);
    try {
      const s = await cagir<{ degisen: number }>("/api/buts", { govde: {} });
      bildirim.basari(`${s.degisen} bildirim elle girildi olarak işaretlendi.`);
      router.refresh();
    } catch (e) {
      bildirim.hata((e as Error).message);
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Sayac etiket="Bekleyen" deger={ozet?.bekleyen ?? 0} alt="Kuruma iletilmedi" />
        {/*
          "Gönderildi" DEĞİL "Elle girildi". Sistem Kuruma hiçbir şey
          göndermiyor; bu sayı yalnızca kullanıcının BÜTS arayüzüne elle
          girdiğini beyan ettiği bildirimleri sayıyor. Aylar sonra bu kaydı
          okuyan kişi otomatik bir gönderim olduğunu sanmamalı.
        */}
        <Sayac etiket="Elle girildi" deger={ozet?.gonderilen ?? 0} alt="Kurum arayüzünden" />
      </div>

      <Kart
        baslik="BÜTS Bildirim Kuyruğu"
        aciklama="SOP-ÜR-16. Üretim, sevkiyat, satış, ret ve geri çekme hareketleri için oluşan bildirimler."
      >
        <Uyari cesit="uyari" baslik="Entegrasyon durumu">
          Bu ekran bildirimleri <b>hazırlar ve kuyruklar</b>; Kuruma <b>otomatik gönderim
          YAPMAZ</b>. Gerçek gönderimden önce TİTCK&apos;den YAZILI olarak üç şey alınmalı:
          ürünün resmî sınıflandırması, bildirim yapılacak sistemin kesin adı (ürün sınıfına
          göre İTS, ÜTS veya Bitkisel Ürün Takip Sistemi olabilir — &quot;BÜTS&quot; burada
          çalışma adıdır) ve web servis dokümanı ile test ortamı. Bunlar gelmeden varsayımsal
          bir uç noktaya kalıcı entegrasyon yazılmaz. O zamana kadar bildirimleri dışa aktarıp
          Kurumun kendi arayüzünden girebilirsiniz.
        </Uyari>

        <div className="yazdirma-gizle mb-3 flex flex-wrap gap-2">
          <DisaAktar tip="buts" etiket="Tümünü Excel'e Aktar" />
          <Dugme cesit="ikincil" onClick={disaAktar} disabled={!bekleyenler.length}>
            Bekleyenleri JSON Olarak Dışa Aktar ({bekleyenler.length})
          </Dugme>
          {isaretleyebilir && (
            <span className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={kurumRef}
                onChange={(e) => setKurumRef(e.target.value)}
                placeholder="Kurum referans / takip no *"
                aria-label="Kurum referans numarası"
                className="dokunma-hedefi w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
              <input
                type="password"
                value={imzaSifre}
                onChange={(e) => setImzaSifre(e.target.value)}
                placeholder="Şifreniz (e-imza) *"
                aria-label="Elektronik imza şifresi"
                autoComplete="current-password"
                className="dokunma-hedefi w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
              <Dugme
                cesit="ikincil"
                onClick={isaretle}
                bekliyor={bekliyor}
                disabled={!seciliBekleyen.length || !kurumRef.trim() || !imzaSifre}
                title={
                  !seciliBekleyen.length
                    ? "Önce listeden bildirim seçin"
                    : !kurumRef.trim()
                      ? "Kurum arayüzünün verdiği referans numarası zorunlu"
                      : undefined
                }
              >
                Seçilenleri Elle Girdim Olarak İşaretle ({seciliBekleyen.length})
              </Dugme>
            </span>
          )}
        </div>

        <Tablo
          basliklar={[
            isaretleyebilir ? "Seç" : "",
            "Bildirim No", "Zaman", "Tip", "İlgili Kayıt", "Adet", "Durum",
          ]}
        >
          {kayitlar.length === 0 ? (
            <Bos sutun={7}>Bildirim kuyruğu boş.</Bos>
          ) : (
            <>
              {isaretleyebilir && bekleyenler.length > 0 && (
                <Satir>
                  <Hucre>
                    <input
                      type="checkbox"
                      aria-label="Tüm bekleyenleri seç"
                      checked={secili.size === bekleyenler.length && bekleyenler.length > 0}
                      onChange={(e) => tumunuSec(e.target.checked)}
                      className="h-4 w-4 accent-green-700"
                    />
                  </Hucre>
                  <Hucre className="text-xs text-slate-500">
                    Tüm bekleyenleri seç ({bekleyenler.length})
                  </Hucre>
                </Satir>
              )}
              {kayitlar.map((b) => (
              <Satir key={b.kod}>
                <Hucre>
                  {isaretleyebilir && b.durum === "BEKLIYOR" ? (
                    <input
                      type="checkbox"
                      aria-label={`${b.kod} seç`}
                      checked={secili.has(b.kod)}
                      onChange={(e) => sec(b.kod, e.target.checked)}
                      className="h-4 w-4 accent-green-700"
                    />
                  ) : null}
                </Hucre>
                <Hucre className="font-mono text-xs">{b.kod}</Hucre>
                <Hucre className="whitespace-nowrap text-xs">{trZaman(b.zaman)}</Hucre>
                <Hucre className="font-semibold">{TIP_ETIKET[b.tip] ?? b.tip}</Hucre>
                <Hucre className="font-mono text-xs">{b.ref}</Hucre>
                <Hucre className="text-right font-mono">{b.adet}</Hucre>
                <Hucre>
                  <Rozet>{b.durum}</Rozet>
                  {b.gonderen_ad && (
                    <span className="mt-0.5 block text-[11px] text-slate-500">{b.gonderen_ad}</span>
                  )}
                  {b.kurum_ref && (
                    <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
                      ref: {b.kurum_ref}
                    </span>
                  )}
                </Hucre>
              </Satir>
              ))}
            </>
          )}
        </Tablo>
      </Kart>

      {bildirim.kutu}
    </>
  );
}
