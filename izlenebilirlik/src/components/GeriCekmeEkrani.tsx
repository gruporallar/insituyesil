"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Girdi,
  Alan, Bos, Dugme, Hucre, Kart, Metinlik, Satir, Sayac, Secim, Tablo, Uyari,
  cagir, sayiTr, trTarih, useBildirim,
} from "./Arayuz";

export function GeriCekmeEkrani({
  lotlar, seriler, baslatabilir,
}: {
  lotlar: any[]; seriler: any[]; baslatabilir: boolean;
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  const [secim, setSecim] = useState("");
  const [kapsam, setKapsam] = useState<any>(null);
  const [gerekce, setGerekce] = useState("");
  const [hata, setHata] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const [uygulaBekle, setUygulaBekle] = useState(false);
  const [onay, setOnay] = useState(false);
  const [imzaSifre, setImzaSifre] = useState("");

  async function analizEt() {
    if (!secim) return;
    const [tip, kod] = secim.split("|");
    setHata("");
    setBekliyor(true);
    setOnay(false);
    try {
      const s = await cagir<{ kapsam: any }>(
        `/api/gericekme?tip=${tip}&kod=${encodeURIComponent(kod)}`
      );
      setKapsam(s.kapsam);
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekliyor(false);
    }
  }

  async function uygula() {
    const [tip, kod] = secim.split("|");
    setHata("");
    setUygulaBekle(true);
    try {
      const s = await cagir<{ bloke: number; seri: number; hasta: number }>("/api/gericekme", {
        govde: { tip, kod, gerekce, sifre: imzaSifre },
      });
      bildirim.basari(`Geri çekme başlatıldı — ${s.bloke} birim bloke edildi.`);
      setOnay(false);
      setGerekce("");
      await analizEt();
      router.refresh();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setUygulaBekle(false);
    }
  }

  return (
    <>
      <Kart
        baslik="Geri Çekme Etki Analizi"
        aciklama="SOP-KG-07. Bir ham madde lotunda veya üretim serisinde sorun tespit edildiğinde, etkilenen tüm ambalaj birimleri, eczaneler ve hastalar listelenir. Bu adım hiçbir şey değiştirmez."
      >
        {hata && <Uyari cesit="hata">{hata}</Uyari>}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Alan etiket="Geri çekilecek kayıt">
              <Secim value={secim} onChange={(e) => { setSecim(e.target.value); setKapsam(null); }}>
                <option value="">Seçiniz</option>
                {lotlar.length > 0 && (
                  <optgroup label="Ham madde lotları">
                    {lotlar.map((l) => (
                      <option key={l.lot} value={`HAMMADDE|${l.lot}`}>Ham madde — {l.lot}</option>
                    ))}
                  </optgroup>
                )}
                {seriler.length > 0 && (
                  <optgroup label="Üretim serileri">
                    {seriler.map((s) => (
                      <option key={s.seri} value={`SERI|${s.seri}`}>
                        Seri — {s.seri} ({s.urun_tipi === "IZOLAT" ? "İzolat" : "Distilat"})
                      </option>
                    ))}
                  </optgroup>
                )}
              </Secim>
            </Alan>
          </div>
          <Dugme onClick={analizEt} bekliyor={bekliyor} disabled={!secim}>Etki Analizi Yap</Dugme>
        </div>
      </Kart>

      {kapsam && (
        <>
          <Kart baslik={`Etki Analizi — ${kapsam.kaynak.kod}`}>
            <Uyari cesit={kapsam.sayim.hastada > 0 ? "hata" : "uyari"} baslik="Etkilenen kapsam">
              {kapsam.sayim.seri} üretim serisi ·{" "}
              {kapsam.sayim.bloke + kapsam.sayim.toplanacak + kapsam.sayim.hastada} ambalaj birimi ·{" "}
              {kapsam.noktalar.length} alıcı nokta · <b>{kapsam.sayim.hastada} hasta</b>
            </Uyari>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Sayac etiket="Depoda" deger={kapsam.sayim.bloke} alt="bloke edilecek" />
              <Sayac etiket="Piyasada" deger={kapsam.sayim.toplanacak} alt="toplanacak" />
              <Sayac etiket="Hastada" deger={kapsam.sayim.hastada} alt="bildirilecek" />
              <Sayac etiket="Etkilenen Seri" deger={kapsam.sayim.seri} />
            </div>
          </Kart>

          <Kart baslik="1 · Toplanacak Noktalar"
            aciklama="Bu adreslerdeki stok derhal bloke edilip iade alınmalıdır.">
            <Tablo basliklar={["Alıcı", "Tip", "İl", "Yetkili", "Toplanacak Adet"]}>
              {kapsam.noktalar.length === 0 ? (
                <Bos sutun={5}>Piyasada bekleyen ürün yok.</Bos>
              ) : (
                kapsam.noktalar.map((n: any) => (
                  <Satir key={n.alici_kod}>
                    <Hucre className="font-semibold">{n.alici?.ad ?? n.alici_kod}</Hucre>
                    <Hucre>{n.alici?.tip ?? "—"}</Hucre>
                    <Hucre>{n.alici?.il ?? "—"}</Hucre>
                    <Hucre>{n.alici?.yetkili ?? "—"}</Hucre>
                    <Hucre className="text-right font-mono font-bold">{n.adet}</Hucre>
                  </Satir>
                ))
              )}
            </Tablo>
          </Kart>

          <Kart baslik="2 · Bilgilendirilecek Hastalar"
            aciklama="Reçete numarası üzerinden ilgili eczane ve hekime bildirim yapılır. KVKK gereği kimlik maskelidir.">
            <Tablo basliklar={["Hasta", "Reçete", "Hekim", "Satış Tarihi", "Tekil Kod"]}>
              {kapsam.satislar.length === 0 ? (
                <Bos sutun={5}>Hastaya ulaşmış ürün yok.</Bos>
              ) : (
                kapsam.satislar.map((s: any) => (
                  <Satir key={s.kod}>
                    <Hucre>
                      <b>{s.hasta_ad}</b>
                      <span className="block font-mono text-xs text-slate-500">{s.hasta_tc_maskeli}</span>
                    </Hucre>
                    <Hucre className="font-mono text-xs">{s.recete_no}</Hucre>
                    <Hucre className="text-xs">{s.hekim ?? "—"}</Hucre>
                    <Hucre className="whitespace-nowrap">{trTarih(s.tarih)}</Hucre>
                    <Hucre className="font-mono text-[10px] break-all">{s.paket_uid}</Hucre>
                  </Satir>
                ))
              )}
            </Tablo>
          </Kart>

          <Kart baslik="3 · Kaynağa Kadar Geri İzleme">
            <Tablo basliklar={["Seri", "Ham Madde Lotu", "Çiftçi", "Ekim İzni", "Parsel", "THC%"]}>
              {kapsam.kaynaklar.length === 0 ? (
                <Bos sutun={6}>Kayıt yok.</Bos>
              ) : (
                kapsam.kaynaklar.map((x: any, i: number) => (
                  <Satir key={i}>
                    <Hucre className="font-mono text-xs">{x.seri}</Hucre>
                    <Hucre className="font-mono text-xs">{x.lot}</Hucre>
                    <Hucre>{x.ciftci?.ad ?? "—"}</Hucre>
                    <Hucre className="font-mono text-xs">{x.ciftci?.izin_no ?? "—"}</Hucre>
                    <Hucre>{x.ciftci?.parsel ?? "—"}</Hucre>
                    <Hucre className="text-right font-mono">{sayiTr(x.thc, 3)}</Hucre>
                  </Satir>
                ))
              )}
            </Tablo>
          </Kart>

          {baslatabilir && kapsam.sayim.seri > 0 && (
            <Kart baslik="Geri Çekmeyi Başlat">
              <Uyari cesit="uyari" baslik="Bu işlem geri alınamaz">
                Depodaki ve piyasadaki tüm birimler <b>RET</b> statüsüne çekilir ve BÜTS bildirimi
                oluşturulur. Hastaya ulaşmış birimlerin kaydı <b>değiştirilmez</b> — onlar bildirim
                listesindedir.
              </Uyari>

              <Alan etiket="Geri çekme gerekçesi *"
                ipucu="Denetim izine ve BÜTS bildirimine bu metin yazılır.">
                <Metinlik rows={3} value={gerekce} onChange={(e) => setGerekce(e.target.value)}
                  placeholder="Örn. Şahit numune tekrar analizinde THC sınır aşımı tespit edildi (Sapma SP-2026-014)." />
              </Alan>

              <div className="mt-3 max-w-sm">
                <Alan
                  etiket="Şifreniz (elektronik imza) *"
                  ipucu="Geri alınamaz karar — kimliğinizi şifrenizle yeniden doğrulayın."
                >
                  <Girdi type="password" required autoComplete="current-password"
                    value={imzaSifre} onChange={(e) => setImzaSifre(e.target.value)} />
                </Alan>
              </div>

              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={onay} onChange={(e) => setOnay(e.target.checked)}
                  className="mt-0.5 h-4 w-4" />
                <span>
                  {kapsam.sayim.bloke + kapsam.sayim.toplanacak} birimin bloke edileceğini ve{" "}
                  {kapsam.sayim.hastada} hastanın bilgilendirilmesi gerektiğini anlıyorum.
                </span>
              </label>

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Dugme cesit="ikincil" onClick={() => window.print()} className="yazdirma-gizle">
                  Raporu Yazdır
                </Dugme>
                <Dugme cesit="tehlike" onClick={uygula} bekliyor={uygulaBekle}
                  disabled={!onay || gerekce.trim().length < 10 || !imzaSifre}>
                  Geri Çekmeyi Başlat ve BÜTS&apos;e Bildir
                </Dugme>
              </div>
            </Kart>
          )}
        </>
      )}

      {bildirim.kutu}
    </>
  );
}
