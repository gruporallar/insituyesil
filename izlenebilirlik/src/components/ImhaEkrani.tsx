"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alan, Bos, Dugme, Girdi, Hucre, Kart, Metinlik, Satir, Sayac, Tablo, Uyari,
  bugun, cagir, sayiTr, trTarih, useBildirim,
} from "./Arayuz";
import { DisaAktar } from "./DisaAktar";
import { FotoDugmesi, FotoPaneli } from "./FotoPaneli";

const TIP_ETIKET: Record<string, string> = {
  HAMMADDE: "Ham madde",
  URUN: "Reddedilen ürün",
  FIRE: "Proses firesi",
};

export function ImhaEkrani({
  bekleyen, kayitlar, yazabilir, disaAktarabilir, kullaniciAdi,
}: {
  bekleyen: any[]; kayitlar: any[]; yazabilir: boolean; disaAktarabilir: boolean; kullaniciAdi: string;
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  const [fotoKod, setFotoKod] = useState<{ kod: string; konu: string } | null>(null);
  const [secili, setSecili] = useState<any>(null);
  const [miktar, setMiktar] = useState("");
  const [gerekce, setGerekce] = useState("");
  const [tanik1, setTanik1] = useState(kullaniciAdi);
  const [tanik2, setTanik2] = useState("");
  const [firma, setFirma] = useState("");
  const [tutanak, setTutanak] = useState("");
  const [tarih, setTarih] = useState(bugun());
  const [imzaSifre, setImzaSifre] = useState("");
  const [hata, setHata] = useState("");
  const [bekliyor, setBekliyor] = useState(false);

  const bekleyenKg = bekleyen.reduce((t, x) => t + Number(x.miktar_kg || 0), 0);
  const imhaEdilenKg = kayitlar.reduce((t, x) => t + Number(x.miktar_kg || 0), 0);

  function sec(x: any) {
    setSecili(x);
    setMiktar(String(x.miktar_kg));
    setGerekce(x.gerekce ?? "");
    setHata("");
    setTutanak("");
  }

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata("");
    setBekliyor(true);
    try {
      const r = await cagir<{ kod: string }>("/api/imha", {
        govde: {
          tip: secili.tip, kaynak_kod: secili.kaynak_kod, miktar_kg: miktar,
          gerekce, tanik_1: tanik1, tanik_2: tanik2,
          bertaraf_firma: firma, tutanak_no: tutanak, tarih, sifre: imzaSifre,
        },
      });
      bildirim.basari(`${r.kod} — imha tutanağı kaydedildi.`);
      setSecili(null); setTanik2(""); setTutanak("");
      router.refresh();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Sayac etiket="İmha Bekleyen" deger={bekleyen.length} alt="kayıt" />
        <Sayac etiket="Bekleyen Miktar" deger={`${sayiTr(bekleyenKg, 1)}`} alt="kg" />
        <Sayac etiket="İmha Edilen" deger={`${sayiTr(imhaEdilenKg, 1)}`} alt="kg · tutanaklı" />
      </div>

      <Kart
        baslik="İmha Bekleyenler"
        aciklama="SOP-ÜR-15 · Ek-13 §4. Reddedilen materyal ve proses firesi D4 kilitli ret/imha alanında tutulur; tartılır, en az iki tanık huzurunda tutanağa bağlanır ve lisanslı firmaya teslim edilir."
      >
        {bekleyen.length === 0 ? (
          <Uyari cesit="basari">İmha bekleyen materyal yok.</Uyari>
        ) : (
          <>
            <Uyari cesit="uyari">
              <b>{sayiTr(bekleyenKg, 1)} kg</b> kannabinoid içeren materyalin akıbeti kayıtsız.
              Genel atıkla bertaraf edilemez.
            </Uyari>
            <Tablo basliklar={["Tip", "Kaynak", "Miktar", "Gerekçe", ""]}>
              {bekleyen.map((x) => (
                <Satir key={`${x.tip}-${x.kaynak_kod}`}>
                  <Hucre className="whitespace-nowrap font-semibold">{TIP_ETIKET[x.tip] ?? x.tip}</Hucre>
                  <Hucre className="font-mono text-xs">
                    {x.kaynak_kod}
                    {x.ilgili && <span className="block text-slate-500">{x.ilgili}</span>}
                  </Hucre>
                  <Hucre className="text-right font-mono tabular-nums">{sayiTr(x.miktar_kg, 3)} kg</Hucre>
                  <Hucre className="text-xs">{x.gerekce}</Hucre>
                  <Hucre>
                    {yazabilir && (
                      <button type="button" onClick={() => sec(x)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700">
                        Tutanak Düzenle
                      </button>
                    )}
                  </Hucre>
                </Satir>
              ))}
            </Tablo>
          </>
        )}
      </Kart>

      {secili && (
        <Kart
          baslik={`İmha Tutanağı — ${secili.kaynak_kod}`}
          aciklama={`${TIP_ETIKET[secili.tip]} · kayıtlı miktar ${sayiTr(secili.miktar_kg, 3)} kg`}
        >
          <form onSubmit={gonder}>
            {hata && <Uyari cesit="hata">{hata}</Uyari>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Alan etiket="İmha Edilen Miktar (kg) *">
                <Girdi type="number" step="0.001" min="0.001" required inputMode="decimal"
                  value={miktar} onChange={(e) => setMiktar(e.target.value)} />
              </Alan>
              <Alan etiket="Tutanak No *">
                <Girdi required value={tutanak} onChange={(e) => setTutanak(e.target.value)}
                  placeholder="FRM-ÜR-16 sıra no" />
              </Alan>
              <Alan etiket="İmha Tarihi *">
                <Girdi type="date" required max={bugun()} value={tarih}
                  onChange={(e) => setTarih(e.target.value)} />
              </Alan>
              <Alan etiket="1. Tanık *">
                <Girdi required value={tanik1} onChange={(e) => setTanik1(e.target.value)} />
              </Alan>
              <Alan etiket="2. Tanık *" ipucu="Birinci tanıktan farklı bir kişi olmalı">
                <Girdi required value={tanik2} onChange={(e) => setTanik2(e.target.value)} />
              </Alan>
              <Alan etiket="Lisanslı Bertaraf Firması" ipucu="SÖZ-04 kapsamındaki firma">
                <Girdi value={firma} onChange={(e) => setFirma(e.target.value)} />
              </Alan>
              <Alan
                etiket="Şifreniz (elektronik imza) *"
                ipucu="Geri alınamaz karar — kimliğinizi şifrenizle yeniden doğrulayın."
              >
                <Girdi type="password" required autoComplete="current-password"
                  value={imzaSifre} onChange={(e) => setImzaSifre(e.target.value)} />
              </Alan>
            </div>
            <div className="mt-3">
              <Alan etiket="Gerekçe *">
                <Metinlik rows={2} required value={gerekce} onChange={(e) => setGerekce(e.target.value)} />
              </Alan>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Dugme type="button" cesit="ikincil" onClick={() => setSecili(null)}>Vazgeç</Dugme>
              <Dugme type="submit" bekliyor={bekliyor}>Tutanağı Kaydet ve BÜTS&apos;e Bildir</Dugme>
            </div>
          </form>
        </Kart>
      )}

      <FotoPaneli
        kaynakTip="IMHA"
        kod={fotoKod?.kod ?? null}
        baslik={fotoKod?.konu}
        yazabilir={yazabilir}
        ipucu="İmha edilen malzemenin ve bertaraf işleminin fotoğrafı — tutanağın iki tanık imzasını destekleyen görsel kayıt."
        kapat={() => setFotoKod(null)}
      />

      <Kart baslik={`İmha Tutanakları (${kayitlar.length})`} sag={disaAktarabilir ? <DisaAktar tip="imha" /> : null}>
        <Tablo basliklar={["Tutanak", "Tarih", "Tip", "Kaynak", "Miktar", "Tanıklar", "Bertaraf", "No", ""]}>
          {kayitlar.length === 0 ? (
            <Bos sutun={9}>Henüz imha tutanağı yok.</Bos>
          ) : (
            kayitlar.map((x) => (
              <Satir key={x.kod}>
                <Hucre className="font-mono text-xs font-bold">{x.kod}</Hucre>
                <Hucre className="whitespace-nowrap">{trTarih(x.tarih)}</Hucre>
                <Hucre>{TIP_ETIKET[x.tip] ?? x.tip}</Hucre>
                <Hucre className="font-mono text-xs">{x.kaynak_kod}</Hucre>
                <Hucre className="text-right font-mono tabular-nums">{sayiTr(x.miktar_kg, 3)} kg</Hucre>
                <Hucre className="text-xs">{x.tanik_1}<br />{x.tanik_2}</Hucre>
                <Hucre className="text-xs">{x.bertaraf_firma ?? "—"}</Hucre>
                <Hucre className="font-mono text-xs">{x.tutanak_no}</Hucre>
                <Hucre>
                  <FotoDugmesi
                    onClick={() => setFotoKod({ kod: x.kod, konu: `${x.kaynak_kod} · ${x.gerekce}` })}
                  />
                </Hucre>
              </Satir>
            ))
          )}
        </Tablo>
      </Kart>

      {bildirim.kutu}
    </>
  );
}
