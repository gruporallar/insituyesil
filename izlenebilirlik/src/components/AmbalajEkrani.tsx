"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alan, Bos, Dugme, Girdi, Hucre, Kart, Rozet, Satir, Secim, Tablo, Uyari,
  bugun, cagir, sayiTr, trTarih, useBildirim,
} from "./Arayuz";
import { Karekod } from "./Karekod";

export function AmbalajEkrani({
  serbestSeriler, ambalajliSeriler, etiketler, mutabakatlar,
  seciliSeri, yazabilir, mutabakatYetkisi, kullaniciAdi,
}: {
  serbestSeriler: any[]; ambalajliSeriler: any[]; etiketler: any[]; mutabakatlar: any[];
  seciliSeri: string; yazabilir: boolean; mutabakatYetkisi: boolean; kullaniciAdi: string;
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  // ── Etiket mutabakatı ─────────────────────────────────────────────────────
  const [mSeri, setMSeri] = useState("");
  const [basilan, setBasilan] = useState("");
  const [bozuk, setBozuk] = useState("0");
  const [imhaEdilen, setImhaEdilen] = useState("0");
  const [kontrolEden, setKontrolEden] = useState(kullaniciAdi);
  const [mTarih, setMTarih] = useState(bugun());
  const [mHata, setMHata] = useState("");
  const [mBekle, setMBekle] = useState(false);
  const [mSonuc, setMSonuc] = useState<{ statu: string; fark: number; engeller: string[] } | null>(null);

  // KULLANILAN ELLE GİRİLMİYOR: sistemdeki birim sayısı zaten gerçek. Elle
  // girilmesi, mutabakatın karşılaştırdığı iki gerçekten birini de operatörün
  // beyanına çevirirdi.
  const mSeciliAdet = Number(ambalajliSeriler.find((x) => x.seri === mSeri)?.adet ?? 0);
  const onizlemeFark =
    basilan === "" ? null : (parseInt(basilan, 10) || 0) - (mSeciliAdet + (parseInt(imhaEdilen, 10) || 0));

  async function mutabakatGonder(e: React.FormEvent) {
    e.preventDefault();
    setMHata("");
    setMSonuc(null);
    setMBekle(true);
    try {
      const r = await cagir<{ statu: string; fark: number; engeller: string[] }>("/api/mutabakat", {
        govde: {
          seri: mSeri, basilan, kullanilan: String(mSeciliAdet),
          bozuk, imha_edilen: imhaEdilen, kontrol_eden: kontrolEden, tarih: mTarih,
        },
      });
      setMSonuc(r);
      bildirim.basari(
        r.statu === "SERBEST" ? "Mutabakat sağlandı — FARK = 0." : `Mutabakat uyuşmadı (fark ${r.fark}).`
      );
      router.refresh();
    } catch (e) {
      setMHata((e as Error).message);
    } finally {
      setMBekle(false);
    }
  }

  const [seri, setSeri] = useState("");
  const [adet, setAdet] = useState("");
  const [miktarG, setMiktarG] = useState("");
  const [skt, setSkt] = useState("");
  const [hata, setHata] = useState("");
  const [bekliyor, setBekliyor] = useState(false);

  const secili = serbestSeriler.find((s) => s.seri === seri);
  const kalanKg = secili ? Number(secili.cikti_kg) - Number(secili.ambalajlanan_g) / 1000 : null;
  const gerekenKg = (parseFloat(adet) || 0) * (parseFloat(miktarG) || 0) / 1000;

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata("");
    setBekliyor(true);
    try {
      const s = await cagir<{ adet: number }>("/api/ambalaj", {
        govde: { seri, adet, miktar_g: miktarG, skt },
      });
      bildirim.basari(`${s.adet} tekil karekod üretildi.`);
      setAdet(""); setMiktarG("");
      // Üretilen etiketleri hemen göster — operatör yazdırmaya geçecek.
      router.push(`/panel/ambalaj?seri=${encodeURIComponent(seri)}`);
      router.refresh();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <>
      {yazabilir && (
        <Kart
          baslik="Ambalajlama ve Tekil Karekod Üretimi"
          aciklama="Ek-13 adım 12 — SOP-ÜR-12. Her ambalaj birimine tekil karekod basılır (GS1 yapısı). Yalnızca SERBEST seriler ambalajlanabilir."
        >
          <form onSubmit={gonder}>
            {hata && <Uyari cesit="hata">{hata}</Uyari>}

            {serbestSeriler.length === 0 ? (
              <Uyari cesit="uyari">Ambalajlanacak SERBEST seri yok.</Uyari>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Alan etiket="Seri *">
                    <Secim required value={seri} onChange={(e) => setSeri(e.target.value)}>
                      <option value="">Seçiniz</option>
                      {serbestSeriler.map((s) => {
                        const kalan = Number(s.cikti_kg) - Number(s.ambalajlanan_g) / 1000;
                        return (
                          <option key={s.seri} value={s.seri}>
                            {s.seri} — kalan {sayiTr(kalan, 3)} kg
                          </option>
                        );
                      })}
                    </Secim>
                  </Alan>
                  <Alan etiket="Ambalaj Adedi *">
                    <Girdi type="number" min="1" max="500" required inputMode="numeric"
                      value={adet} onChange={(e) => setAdet(e.target.value)} />
                  </Alan>
                  <Alan etiket="Birim Dolum (g) *">
                    <Girdi type="number" step="0.01" min="0.01" required inputMode="decimal"
                      value={miktarG} onChange={(e) => setMiktarG(e.target.value)} />
                  </Alan>
                  <Alan etiket="Son Kullanma Tarihi *">
                    <Girdi type="date" required value={skt} onChange={(e) => setSkt(e.target.value)} />
                  </Alan>
                </div>

                {kalanKg !== null && (
                  <div className="mt-3">
                    <Uyari cesit={gerekenKg > kalanKg + 1e-9 ? "hata" : "bilgi"}>
                      Seride kalan: <b>{sayiTr(kalanKg, 3)} kg</b> · Bu ambalajlama:{" "}
                      <b>{sayiTr(gerekenKg, 3)} kg</b>
                      {gerekenKg > kalanKg + 1e-9 && " — YETERSİZ ÜRÜN"}
                    </Uyari>
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <Dugme type="submit" bekliyor={bekliyor}>Ambalajla ve Karekod Üret</Dugme>
                </div>
              </>
            )}
          </form>
        </Kart>
      )}

      {mutabakatYetkisi && (
        <Kart
          baslik="Etiket Mutabakatı"
          aciklama="FRM-ÜR-12 · Ek-13 kritik kontrol noktası §13. FARK = 0 olmayan serinin hiçbir birimi SEVK EDİLEMEZ — kontrol sevkiyat ucunda uygulanıyor."
        >
          <form onSubmit={mutabakatGonder}>
            {mHata && <Uyari cesit="hata">{mHata}</Uyari>}
            {mSonuc && (
              <Uyari
                cesit={mSonuc.statu === "SERBEST" ? "basari" : "hata"}
                baslik={
                  mSonuc.statu === "SERBEST"
                    ? "FARK = 0 — seri sevkiyata uygun"
                    : `MUTABAKAT UYUŞMADI — fark ${mSonuc.fark}`
                }
              >
                {mSonuc.engeller.length ? (
                  <ul className="ml-4 list-disc">
                    {mSonuc.engeller.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  "Basılan, kullanılan ve imha edilen etiket adetleri tutuyor."
                )}
              </Uyari>
            )}

            {ambalajliSeriler.length === 0 ? (
              <p className="text-sm text-slate-500">Önce bir seriyi ambalajlayın.</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Alan etiket="Seri *">
                    <Secim
                      required
                      value={mSeri}
                      onChange={(e) => {
                        setMSeri(e.target.value);
                        setMSonuc(null);
                      }}
                    >
                      <option value="">Seçiniz</option>
                      {ambalajliSeriler.map((x) => (
                        <option key={x.seri} value={x.seri}>
                          {x.seri} — {x.adet} birim
                        </option>
                      ))}
                    </Secim>
                  </Alan>
                  <Alan etiket="Basılan Etiket *" ipucu="Yazıcıdan çıkan toplam adet">
                    <Girdi type="number" min="0" required inputMode="numeric"
                      value={basilan} onChange={(e) => setBasilan(e.target.value)} />
                  </Alan>
                  <Alan etiket="Kullanılan" ipucu="Sistemdeki birim sayısı — elle girilmez">
                    <Girdi value={mSeri ? String(mSeciliAdet) : ""} readOnly disabled />
                  </Alan>
                  <Alan etiket="Bozuk *" ipucu="Baskı veya yapıştırma sırasında bozulan">
                    <Girdi type="number" min="0" required inputMode="numeric"
                      value={bozuk} onChange={(e) => setBozuk(e.target.value)} />
                  </Alan>
                  <Alan etiket="İmha Edilen *" ipucu="Bozuklardan imha edilen — hesaptan yalnızca bu düşer">
                    <Girdi type="number" min="0" required inputMode="numeric"
                      value={imhaEdilen} onChange={(e) => setImhaEdilen(e.target.value)} />
                  </Alan>
                  <Alan etiket="Kontrol Eden *">
                    <Girdi required value={kontrolEden} onChange={(e) => setKontrolEden(e.target.value)} />
                  </Alan>
                  <Alan etiket="Kontrol Tarihi *">
                    <Girdi type="date" required value={mTarih} onChange={(e) => setMTarih(e.target.value)} />
                  </Alan>
                </div>

                {onizlemeFark !== null && mSeri && (
                  <div className="mt-3">
                    <Uyari cesit={onizlemeFark === 0 ? "basari" : "hata"}>
                      Önizleme: {basilan || 0} basılan − ({mSeciliAdet} kullanılan +{" "}
                      {imhaEdilen || 0} imha) = <b>FARK = {onizlemeFark}</b>
                      {onizlemeFark !== 0 && " — bu seri sevk edilemez"}
                    </Uyari>
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <Dugme type="submit" bekliyor={mBekle} disabled={!mSeri}>
                    Mutabakatı Kaydet
                  </Dugme>
                </div>
              </>
            )}
          </form>

          {mutabakatlar.length > 0 && (
            <div className="mt-4">
              <Tablo basliklar={["Seri", "Basılan", "Kullanılan", "Bozuk", "İmha", "Fark", "Kontrol", "Tarih"]}>
                {mutabakatlar.map((m) => (
                  <Satir key={m.seri}>
                    <Hucre className="font-mono text-xs font-bold">{m.seri}</Hucre>
                    <Hucre className="text-right font-mono tabular-nums">{m.basilan}</Hucre>
                    <Hucre className="text-right font-mono tabular-nums">{m.kullanilan}</Hucre>
                    <Hucre className="text-right font-mono tabular-nums">{m.bozuk}</Hucre>
                    <Hucre className="text-right font-mono tabular-nums">{m.imha_edilen}</Hucre>
                    <Hucre
                      className={`text-right font-mono tabular-nums font-bold ${
                        Number(m.fark) === 0 ? "text-green-700 dark:text-green-400" : "text-red-600"
                      }`}
                    >
                      {m.fark}
                    </Hucre>
                    <Hucre className="text-xs">{m.kontrol_eden}</Hucre>
                    <Hucre className="whitespace-nowrap text-xs">{trTarih(m.tarih)}</Hucre>
                  </Satir>
                ))}
              </Tablo>
            </div>
          )}
        </Kart>
      )}

      <Kart
        baslik="Karekod Etiketleri"
        aciklama="Etiketleri yazdırıp ambalaj birimlerine yapıştırın. Etiket mutabakatında FARK = 0 olmalıdır (FRM-ÜR-12)."
        sag={
          etiketler.length > 0 ? (
            <Dugme cesit="ikincil" onClick={() => window.print()} className="yazdirma-gizle">
              Yazdır ({etiketler.length})
            </Dugme>
          ) : undefined
        }
      >
        <div className="yazdirma-gizle mb-3 max-w-sm">
          <Alan etiket="Seri seç">
            <Secim
              value={seciliSeri}
              onChange={(e) => router.push(e.target.value ? `/panel/ambalaj?seri=${encodeURIComponent(e.target.value)}` : "/panel/ambalaj")}
            >
              <option value="">Seçiniz</option>
              {ambalajliSeriler.map((s) => (
                <option key={s.seri} value={s.seri}>{s.seri} — {s.adet} birim</option>
              ))}
            </Secim>
          </Alan>
        </div>

        {etiketler.length === 0 ? (
          <p className="text-sm text-slate-500">
            Etiketleri görmek için yukarıdan bir seri seçin.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {etiketler.map((p) => (
              <div key={p.uid}
                className="etiket rounded-lg border border-slate-300 bg-white p-2 text-center">
                <Karekod veri={p.uid} boyut={3} />
                <div className="mt-1 font-mono text-[10px] leading-tight text-slate-900">
                  <div className="font-bold">{p.tekil}</div>
                  <div>{p.seri}</div>
                  <div>{sayiTr(p.miktar_g, 2)} g · SKT {trTarih(p.skt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Kart>

      <Kart baslik="Seri Bazında Ambalaj Birimleri" >
        <Tablo basliklar={["Seri", "Adet", "Birim Dolum", "SKT"]}>
          {ambalajliSeriler.length === 0 ? (
            <Bos sutun={4}>Henüz ambalaj birimi üretilmemiş.</Bos>
          ) : (
            ambalajliSeriler.map((s) => (
              <Satir key={s.seri}>
                <Hucre className="font-mono text-xs font-bold">{s.seri}</Hucre>
                <Hucre className="text-right font-mono">{s.adet}</Hucre>
                <Hucre className="text-right font-mono">{sayiTr(s.miktar_g, 2)} g</Hucre>
                <Hucre>{trTarih(s.skt)}</Hucre>
              </Satir>
            ))
          )}
        </Tablo>
      </Kart>

      {seciliSeri && etiketler.length > 0 && (
        <Kart baslik={`${seciliSeri} — Birim Listesi`}>
          <Tablo basliklar={["Tekil No", "Dolum", "SKT", "Statü"]}>
            {etiketler.map((p) => (
              <Satir key={p.uid}>
                <Hucre className="font-mono text-xs">{p.tekil}</Hucre>
                <Hucre className="text-right font-mono">{sayiTr(p.miktar_g, 2)} g</Hucre>
                <Hucre>{trTarih(p.skt)}</Hucre>
                <Hucre><Rozet>{p.statu}</Rozet></Hucre>
              </Satir>
            ))}
          </Tablo>
        </Kart>
      )}

      {bildirim.kutu}
    </>
  );
}
