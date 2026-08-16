"use client";

import { 
 useState } from "react";
import { 
 useRouter } from "next/navigation";
import {
  AcilirKart, 
  Alan, Bos, Dugme, Girdi, Hucre, Kart, Metinlik, Satir, Sayac, Secim, Tablo, Uyari,
  bugun, cagir, trTarih, useBildirim,
} from "./Arayuz";
import { 
 DisaAktar } from "./DisaAktar";
import { 
 FotoDugmesi, FotoPaneli } from "./FotoPaneli";

export function SapmaEkrani({
  kayitlar, lotlar, seriler, acabilir, kapatabilir, disaAktarabilir,
}: {
  kayitlar: any[]; lotlar: string[]; seriler: string[];
  acabilir: boolean; kapatabilir: boolean; disaAktarabilir: boolean;
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  const [kaynakTip, setKaynakTip] = useState("SERI");
  const [kaynakKod, setKaynakKod] = useState("");
  const [konu, setKonu] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [sorumlu, setSorumlu] = useState("");
  const [termin, setTermin] = useState("");
  const [hata, setHata] = useState("");
  const [bekliyor, setBekliyor] = useState(false);

  const [fotoKod, setFotoKod] = useState<{ kod: string; konu: string } | null>(null);
  const [kapatilan, setKapatilan] = useState<any>(null);
  const [ilkAksiyon, setIlkAksiyon] = useState("");
  const [riskDegerlendirme, setRiskDegerlendirme] = useState("");
  const [kokNeden, setKokNeden] = useState("");
  const [capa, setCapa] = useState("");
  const [capaSorumlu, setCapaSorumlu] = useState("");
  const [capaTermin, setCapaTermin] = useState("");
  const [etkinlikKriteri, setEtkinlikKriteri] = useState("");
  const [etkinlikTarihi, setEtkinlikTarihi] = useState("");
  const [etkinlikSonucu, setEtkinlikSonucu] = useState("");
  const [sifre, setSifre] = useState("");
  const [kapatBekle, setKapatBekle] = useState(false);

  function kapanisFormunuTemizle() {
    setIlkAksiyon(""); setRiskDegerlendirme(""); setKokNeden(""); setCapa("");
    setCapaSorumlu(""); setCapaTermin(""); setEtkinlikKriteri("");
    setEtkinlikTarihi(""); setEtkinlikSonucu(""); setSifre("");
  }

  const acik = kayitlar.filter((s) => s.durum === "ACIK");
  const gecikmis = acik.filter((s) => s.termin && s.termin < bugun());

  async function ac(e: React.FormEvent) {
    e.preventDefault();
    setHata("");
    setBekliyor(true);
    try {
      const r = await cagir<{ kod: string }>("/api/sapma", {
        govde: {
          kaynak_tip: kaynakTip,
          kaynak_kod: kaynakTip === "DIGER" ? "" : kaynakKod,
          konu, aciklama, sorumlu, termin,
        },
      });
      setKonu(""); setAciklama(""); setSorumlu(""); setTermin(""); setKaynakKod("");
      bildirim.basari(`${r.kod} açıldı.`);
      router.refresh();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekliyor(false);
    }
  }

  async function kapat(e: React.FormEvent) {
    e.preventDefault();
    setKapatBekle(true);
    try {
      await cagir("/api/sapma", {
        yontem: "PATCH",
        govde: {
          kod: kapatilan.kod,
          ilk_aksiyon: ilkAksiyon,
          risk_degerlendirme: riskDegerlendirme,
          kok_neden: kokNeden,
          capa,
          capa_sorumlu: capaSorumlu,
          capa_termin: capaTermin,
          etkinlik_kriteri: etkinlikKriteri,
          etkinlik_tarihi: etkinlikTarihi,
          etkinlik_sonucu: etkinlikSonucu,
          sifre,
        },
      });
      bildirim.basari(`${kapatilan.kod} kapatıldı.`);
      setKapatilan(null); kapanisFormunuTemizle();
      router.refresh();
    } catch (e) {
      bildirim.hata((e as Error).message);
    } finally {
      setKapatBekle(false);
    }
  }

  const kaynakSecenekleri = kaynakTip === "HAMMADDE" ? lotlar : kaynakTip === "SERI" ? seriler : [];

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Sayac etiket="Açık" deger={acik.length} alt="araştırma sürüyor" />
        <Sayac etiket="Gecikmiş" deger={gecikmis.length} alt="termini geçti" />
        <Sayac etiket="Kapalı" deger={kayitlar.length - acik.length} alt="CAPA tamamlandı" />
      </div>

      {acik.length > 0 && (
        <Kart baslik="Açık sapmalar serbest bırakmayı engeller">
          <Uyari cesit="uyari">
            Bir seride veya onu besleyen ham madde lotunda <b>açık sapma varsa</b> o seri serbest
            bırakılamaz. Kontrol artık beyan değil, bu tabloya yapılan sorgudur (SOP-KG-03).
          </Uyari>
        </Kart>
      )}

      {acabilir && (
        <AcilirKart
          baslik="Sapma Kaydı Aç"
          aciklama="SOP-KG-03. Ret kararları sistem tarafından otomatik sapma açar; buradan elle de açabilirsiniz."
        >
          <form onSubmit={ac}>
            {hata && <Uyari cesit="hata">{hata}</Uyari>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Alan etiket="Kaynak Tipi *">
                <Secim required value={kaynakTip}
                  onChange={(e) => { setKaynakTip(e.target.value); setKaynakKod(""); }}>
                  <option value="SERI">Üretim serisi</option>
                  <option value="HAMMADDE">Ham madde lotu</option>
                  <option value="DIGER">Diğer (ekipman, tesis, personel…)</option>
                </Secim>
              </Alan>

              {kaynakTip !== "DIGER" && (
                <Alan etiket="İlgili Kayıt *">
                  <Secim required value={kaynakKod} onChange={(e) => setKaynakKod(e.target.value)}>
                    <option value="">Seçiniz</option>
                    {kaynakSecenekleri.map((x) => <option key={x} value={x}>{x}</option>)}
                  </Secim>
                </Alan>
              )}

              <Alan etiket="Konu *">
                <Girdi required value={konu} onChange={(e) => setKonu(e.target.value)}
                  placeholder="Örn. Ekstraksiyon basıncı spesifikasyon dışı" />
              </Alan>
              <Alan etiket="Sorumlu">
                <Girdi value={sorumlu} onChange={(e) => setSorumlu(e.target.value)} />
              </Alan>
              <Alan etiket="Termin">
                <Girdi type="date" value={termin} onChange={(e) => setTermin(e.target.value)} />
              </Alan>
            </div>
            <div className="mt-3">
              <Alan etiket="Açıklama" ipucu="Ne oldu, nasıl fark edildi, hangi kayıtlar etkilendi?">
                <Metinlik rows={3} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
              </Alan>
            </div>
            <div className="mt-3 flex justify-end">
              <Dugme type="submit" bekliyor={bekliyor}>Sapma Kaydı Aç</Dugme>
            </div>
          </form>
        </AcilirKart>
      )}

      <FotoPaneli
        kaynakTip="SAPMA"
        kod={fotoKod?.kod ?? null}
        baslik={fotoKod?.konu}
        yazabilir={acabilir}
        ipucu="Sapmanın kendisini gösteren fotoğraf — kırık mühür, bozuk etiket, arızalı ekipman. Denetimde tek başına delildir."
        kapat={() => setFotoKod(null)}
      />

      {kapatilan && (
        <Kart baslik={`${kapatilan.kod} — Kapat`} aciklama={kapatilan.konu}>
          <form onSubmit={kapat}>
            <Uyari cesit="uyari">
              Kapatma, yalnız CAPA planı yazılarak yapılamaz. İlk kontrol altına alma,
              risk, uygulanan faaliyet ve <b>etkinlik kanıtı</b> birlikte kaydedilir;
              işlem elektronik imzayla onaylanır.
            </Uyari>
            <div className="grid gap-3 sm:grid-cols-2">
              <Alan etiket="İlk düzeltme / kontrol altına alma *" ipucu="Ürün, proses veya alan ilk anda nasıl güvenceye alındı?">
                <Metinlik rows={3} required value={ilkAksiyon} onChange={(e) => setIlkAksiyon(e.target.value)} />
              </Alan>
              <Alan etiket="Risk değerlendirmesi *" ipucu="Ürün kalitesi, hasta güvenliği ve piyasadaki ürün etkisi.">
                <Metinlik rows={3} required value={riskDegerlendirme} onChange={(e) => setRiskDegerlendirme(e.target.value)} />
              </Alan>
              <Alan etiket="Kök Neden *" ipucu="Neden oldu? Belirti değil, sebep.">
                <Metinlik rows={3} required value={kokNeden} onChange={(e) => setKokNeden(e.target.value)} />
              </Alan>
              <Alan etiket="Düzeltici / Önleyici Faaliyet (CAPA) *" ipucu="Tekrarını ne engelleyecek?">
                <Metinlik rows={3} required value={capa} onChange={(e) => setCapa(e.target.value)} />
              </Alan>
              <Alan etiket="CAPA sorumlusu *">
                <Girdi required value={capaSorumlu} onChange={(e) => setCapaSorumlu(e.target.value)} />
              </Alan>
              <Alan etiket="CAPA termin tarihi *">
                <Girdi type="date" required value={capaTermin} onChange={(e) => setCapaTermin(e.target.value)} />
              </Alan>
              <Alan etiket="Etkinlik kriteri *" ipucu="CAPA'nın işe yaradığını hangi ölçülebilir koşul gösterecek?">
                <Metinlik rows={3} required value={etkinlikKriteri} onChange={(e) => setEtkinlikKriteri(e.target.value)} />
              </Alan>
              <Alan etiket="Etkinlik kontrol sonucu *" ipucu="İncelenen kayıt/ölçüm ve ulaşılan sonuç.">
                <Metinlik rows={3} required value={etkinlikSonucu} onChange={(e) => setEtkinlikSonucu(e.target.value)} />
              </Alan>
              <Alan etiket="Etkinlik kontrol tarihi *">
                <Girdi type="date" max={bugun()} required value={etkinlikTarihi} onChange={(e) => setEtkinlikTarihi(e.target.value)} />
              </Alan>
              <Alan etiket="Elektronik imza — şifreniz *" ipucu="Kapatma ve etkinlik değerlendirmesi kimliğinize bağlanır.">
                <Girdi type="password" autoComplete="current-password" required value={sifre} onChange={(e) => setSifre(e.target.value)} />
              </Alan>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Dugme type="button" cesit="ikincil" onClick={() => { setKapatilan(null); kapanisFormunuTemizle(); }}>Vazgeç</Dugme>
              <Dugme type="submit" bekliyor={kapatBekle}
                disabled={[
                  ilkAksiyon, riskDegerlendirme, kokNeden, capa, capaSorumlu,
                  etkinlikKriteri, etkinlikSonucu,
                ].some((x) => x.trim().length < 3) || !capaTermin || !etkinlikTarihi || !sifre}>
                Elektronik İmzayla Kapat
              </Dugme>
            </div>
          </form>
        </Kart>
      )}

      <Kart baslik={`Sapma Kayıtları (${kayitlar.length})`} sag={disaAktarabilir ? <DisaAktar tip="sapma" /> : null}>
        <Tablo basliklar={["Kod", "Kaynak", "Konu", "Açan", "Termin", "Durum", ""]}>
          {kayitlar.length === 0 ? (
            <Bos sutun={7}>Sapma kaydı yok.</Bos>
          ) : (
            kayitlar.map((s) => {
              const gecikti = s.durum === "ACIK" && s.termin && s.termin < bugun();
              return (
                <Satir key={s.kod}>
                  <Hucre className="font-mono text-xs font-bold">{s.kod}</Hucre>
                  <Hucre className="font-mono text-xs">{s.kaynak_kod ?? s.kaynak_tip}</Hucre>
                  <Hucre>
                    {s.konu}
                    {s.aciklama && (
                      <span className="mt-0.5 block text-xs text-slate-500">{s.aciklama}</span>
                    )}
                    {s.durum === "KAPALI" && s.kok_neden && (
                      <span className="mt-1 block text-xs text-green-700 dark:text-green-400">
                        <b>Kök neden:</b> {s.kok_neden} · <b>CAPA:</b> {s.capa}
                        {s.etkinlik_sonucu && <>
                          {" "}· <b>Etkinlik:</b> {s.etkinlik_sonucu} ({trTarih(s.etkinlik_tarihi)})
                          {s.etkinlik_dogrulayan_ad && <> · <b>Doğrulayan:</b> {s.etkinlik_dogrulayan_ad}</>}
                        </>}
                      </span>
                    )}
                  </Hucre>
                  <Hucre className="text-xs">
                    {s.acan_ad ?? "—"}
                    {Number(s.otomatik) === 1 && (
                      <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                        otomatik
                      </span>
                    )}
                  </Hucre>
                  <Hucre className={`whitespace-nowrap text-xs ${gecikti ? "font-bold text-red-600" : ""}`}>
                    {trTarih(s.termin)}
                  </Hucre>
                  <Hucre>
                    <span className={`text-xs font-bold ${
                      s.durum === "ACIK" ? "text-amber-600" : "text-green-700 dark:text-green-400"
                    }`}>
                      {s.durum === "ACIK" ? "AÇIK" : "KAPALI"}
                    </span>
                  </Hucre>
                  <Hucre>
                    <FotoDugmesi onClick={() => setFotoKod({ kod: s.kod, konu: s.konu })} />{" "}
                    {kapatabilir && s.durum === "ACIK" && (
                      <button type="button" onClick={() => { setKapatilan(s); kapanisFormunuTemizle(); }}
                        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700">
                        Kapat
                      </button>
                    )}
                  </Hucre>
                </Satir>
              );
            })
          )}
        </Tablo>
      </Kart>

      {bildirim.kutu}
    </>
  );
}
