"use client";

import { 
 useMemo, useState } from "react";
import { 
 useRouter } from "next/navigation";
import Link from "next/link";
import {
  AcilirKart, 
  Alan, Bos, Dugme, Girdi, Hucre, Kart, Rozet, Satir, Secim, Tablo, Uyari,
  TabloBaglanti, bugun, cagir, sayiTr, trTarih, useBildirim,
} from "./Arayuz";
import { 
 DisaAktar } from "./DisaAktar";
import { 
 Filtre } from "./Filtre";

/** Ek-13 / SOP-ÜR-16 md. 5.2 — bilgi amaçlı; asıl karar SUNUCUDA veriliyor. */
const MB_ALT = 98;
const MB_UST = 102;

export function UretimEkrani({
  seriler, uygunLotlar, acmaYetkisi, serbestYetkisi, disaAktarabilir, kullaniciAdi, acikSeriler, sayfalama,
}: {
  seriler: any[]; uygunLotlar: any[];
  acmaYetkisi: boolean; serbestYetkisi: boolean; disaAktarabilir: boolean; kullaniciAdi: string;
  acikSeriler: any[];
  sayfalama: { toplam: number; ilk: number; son: number; sayfa: number; toplamSayfa: number };
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  // ── Seri açma ──────────────────────────────────────────────────────────────
  const [urunTipi, setUrunTipi] = useState("");
  const [uretimTarihi, setUretimTarihi] = useState(bugun());
  const [sorumlu, setSorumlu] = useState(kullaniciAdi);
  const [miktarlar, setMiktarlar] = useState<Record<string, string>>({});
  const [acHata, setAcHata] = useState("");
  const [acBekle, setAcBekle] = useState(false);

  const secilenToplam = useMemo(
    () => Object.values(miktarlar).reduce((t, v) => t + (parseFloat(v) || 0), 0),
    [miktarlar]
  );

  async function seriAc(e: React.FormEvent) {
    e.preventDefault();
    setAcHata("");
    const girdiler = Object.entries(miktarlar)
      .map(([lot, v]) => ({ lot, kg: parseFloat(v) }))
      .filter((g) => g.kg > 0);

    if (!girdiler.length) {
      setAcHata("En az bir ham madde lotundan miktar girin.");
      return;
    }

    setAcBekle(true);
    try {
      const s = await cagir<{ seri: string; girdiToplam: number }>("/api/seri", {
        govde: { urun_tipi: urunTipi, uretim_tarihi: uretimTarihi, sorumlu, girdiler },
      });
      setMiktarlar({});
      setUrunTipi("");
      bildirim.basari(`${s.seri} açıldı — ${sayiTr(s.girdiToplam, 1)} kg girdi.`);
      router.refresh();
    } catch (e) {
      setAcHata((e as Error).message);
    } finally {
      setAcBekle(false);
    }
  }

  // ── Serbest bırakma ────────────────────────────────────────────────────────
  // Karar bekleyen seriler FİLTREDEN BAĞIMSIZ olarak sunucudan geliyor.
  const [dSeri, setDSeri] = useState("");
  const [cikti, setCikti] = useState("");
  const [fire, setFire] = useState("");
  const [numune, setNumune] = useState("0.065");
  const [cbd, setCbd] = useState("");
  const [thc, setThc] = useState("");
  const [cozucu, setCozucu] = useState("");
  const [serbestKisi, setSerbestKisi] = useState(kullaniciAdi);
  const [imzaSifre, setImzaSifre] = useState("");
  const [dHata, setDHata] = useState("");
  const [dBekle, setDBekle] = useState(false);
  const [karar, setKarar] = useState<{
    statu: string; mb: number | null; engeller: string[];
    acikSapmalar?: { kod: string; konu: string }[];
  } | null>(null);

  const seciliSeri = seriler.find((s) => s.seri === dSeri);

  /** Canlı önizleme — kullanıcı kaydetmeden önce rakamı görsün. */
  const onizlemeMb = useMemo(() => {
    if (!seciliSeri) return null;
    const g = Number(seciliSeri.girdi_kg);
    const c = parseFloat(cikti), f = parseFloat(fire), n = parseFloat(numune) || 0;
    if (!(g > 0) || !Number.isFinite(c) || !Number.isFinite(f)) return null;
    return ((c + f + n) / g) * 100;
  }, [seciliSeri, cikti, fire, numune]);

  async function serbestBirak(e: React.FormEvent) {
    e.preventDefault();
    setDHata("");
    setKarar(null);
    setDBekle(true);
    try {
      const s = await cagir<{
        statu: string; mb: number | null; engeller: string[];
        acikSapmalar?: { kod: string; konu: string }[];
      }>(
        "/api/seri/serbest",
        {
          govde: {
            seri: dSeri, cikti_kg: cikti, fire_kg: fire, numune_kg: numune,
            cbd, thc, cozucu, serbest_kisi: serbestKisi, sifre: imzaSifre,
          },
        }
      );
      setKarar(s);
      if (s.statu === "SERBEST") {
        setDSeri(""); setCikti(""); setFire(""); setCbd(""); setThc(""); setCozucu("");
      }
      bildirim.basari(s.statu === "RET" ? "Seri REDDEDİLDİ." : "Seri serbest bırakıldı.");
      router.refresh();
    } catch (e) {
      setDHata((e as Error).message);
    } finally {
      setDBekle(false);
    }
  }

  return (
    <>
      {acmaYetkisi && (
        <AcilirKart
          baslik="Üretim Serisi Aç"
          aciklama="Ek-13 adım 3–10. Yalnızca SERBEST statüsündeki ham madde lotları girdi olabilir. Birden fazla lot seçilirse soyağacı hepsini birden izler."
        >
          <form onSubmit={seriAc}>
            {acHata && <Uyari cesit="hata">{acHata}</Uyari>}

            {uygunLotlar.length === 0 ? (
              <Uyari cesit="uyari">
                Üretime uygun (SERBEST) ham madde lotu yok. Önce{" "}
                <Link href="/panel/hammadde" className="underline">analiz kaydı</Link> girin.
              </Uyari>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Alan etiket="Ürün Tipi *">
                    <Secim required value={urunTipi} onChange={(e) => setUrunTipi(e.target.value)}>
                      <option value="">Seçiniz</option>
                      <option value="DISTILAT">CBD Distilat (≥ %80)</option>
                      <option value="IZOLAT">CBD İzolat (≥ %99)</option>
                    </Secim>
                  </Alan>
                  <Alan etiket="Üretim Tarihi *">
                    <Girdi type="date" required value={uretimTarihi}
                      onChange={(e) => setUretimTarihi(e.target.value)} />
                  </Alan>
                  <Alan etiket="Üretim Sorumlusu *">
                    <Girdi required value={sorumlu} onChange={(e) => setSorumlu(e.target.value)} />
                  </Alan>
                </div>

                <p className="mt-4 mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  GİRDİ HAM MADDE LOTLARI — kullanılacak kg miktarını girin
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {uygunLotlar.map((l) => (
                    <Alan
                      key={l.lot}
                      etiket={`${l.lot} — ${l.ciftci_ad ?? ""}`}
                      ipucu={`kalan ${sayiTr(l.kalan_kg, 1)} kg · THC %${sayiTr(l.thc, 3)}`}
                    >
                      <Girdi
                        type="number" step="0.1" min="0" max={l.kalan_kg} inputMode="decimal"
                        placeholder="kullanılacak kg"
                        value={miktarlar[l.lot] ?? ""}
                        onChange={(e) => setMiktarlar({ ...miktarlar, [l.lot]: e.target.value })}
                      />
                    </Alan>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    Toplam girdi: <b className="font-mono">{sayiTr(secilenToplam, 1)} kg</b>
                  </span>
                  <Dugme type="submit" bekliyor={acBekle}>Seriyi Aç ve Ham Maddeyi Tüket</Dugme>
                </div>
              </>
            )}
          </form>
        </AcilirKart>
      )}

      {serbestYetkisi && (
        <Kart
          baslik="Proses Sonucu ve Serbest Bırakma"
          aciklama="Ek-13 adım 14–15. Kütle denkliği %98–102 dışındaysa (SOP-ÜR-16 md. 5.2) sistem serbest bırakmayı ENGELLER. Açık sapma kontrolü artık sorulmuyor — Sapma/CAPA kayıtlarından otomatik yapılıyor."
        >
          <form onSubmit={serbestBirak}>
            {dHata && <Uyari cesit="hata">{dHata}</Uyari>}
            {karar && (
              <Uyari
                cesit={karar.statu === "RET" ? "hata" : "basari"}
                baslik={karar.statu === "RET" ? "SERİ REDDEDİLDİ — serbest bırakma engellendi" : "SERİ SERBEST BIRAKILDI"}
              >
                {karar.engeller.length ? (
                  <>
                    <ul className="ml-4 list-disc">
                      {karar.engeller.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                    {karar.acikSapmalar && karar.acikSapmalar.length > 0 && (
                      <p className="mt-2">
                        <b>Kapatılması gereken sapmalar:</b>{" "}
                        {karar.acikSapmalar.map((x) => `${x.kod} (${x.konu})`).join(" · ")}{" "}
                        <Link href="/panel/sapma" className="dokunma-hedefi underline">Sapma ekranına git</Link>
                      </p>
                    )}
                  </>
                ) : (
                  <>Tüm kabul kriterleri sağlandı. Kütle denkliği %{sayiTr(karar.mb, 2)}. Ambalajlamaya geçebilirsiniz.</>
                )}
              </Uyari>
            )}

            {acikSeriler.length === 0 ? (
              <p className="text-sm text-slate-500">Değerlendirme bekleyen seri yok.</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Alan etiket="Seri *">
                    <Secim required value={dSeri} onChange={(e) => setDSeri(e.target.value)}>
                      <option value="">Seçiniz</option>
                      {acikSeriler.map((s) => (
                        <option key={s.seri} value={s.seri}>
                          {s.seri} — girdi {sayiTr(s.girdi_kg, 1)} kg
                        </option>
                      ))}
                    </Secim>
                  </Alan>
                  <Alan etiket="Çıktı — Ana Ürün (kg) *">
                    <Girdi type="number" step="0.001" min="0" required inputMode="decimal"
                      value={cikti} onChange={(e) => setCikti(e.target.value)} />
                  </Alan>
                  <Alan etiket="Fire — Posa/Kek/Dip (kg) *">
                    <Girdi type="number" step="0.001" min="0" required inputMode="decimal"
                      value={fire} onChange={(e) => setFire(e.target.value)} />
                  </Alan>
                  <Alan etiket="Numune (kg)" ipucu="Proses içi + şahit">
                    <Girdi type="number" step="0.001" min="0" inputMode="decimal"
                      value={numune} onChange={(e) => setNumune(e.target.value)} />
                  </Alan>
                  <Alan etiket="Bitmiş Ürün CBD (%) *"
                    ipucu={seciliSeri?.urun_tipi === "IZOLAT" ? "İzolat: ≥ %99" : "Distilat: ≥ %80"}>
                    <Girdi type="number" step="0.01" min="0" required inputMode="decimal"
                      value={cbd} onChange={(e) => setCbd(e.target.value)} />
                  </Alan>
                  <Alan etiket="Bitmiş Ürün Δ9-THC (%) *" ipucu="≤ %0,3">
                    <Girdi type="number" step="0.001" min="0" required inputMode="decimal"
                      value={thc} onChange={(e) => setThc(e.target.value)} />
                  </Alan>
                  <Alan etiket="Kalıntı Çözücü (ppm)" ipucu="≤ 5.000 · ölçülmediyse boş bırakın">
                    <Girdi type="number" step="1" min="0" inputMode="numeric"
                      value={cozucu} onChange={(e) => setCozucu(e.target.value)} />
                  </Alan>
                  <Alan etiket="Serbest Bırakan (Mesul Müdür) *">
                    <Girdi required value={serbestKisi} onChange={(e) => setSerbestKisi(e.target.value)} />
                  </Alan>
                  <Alan
                    etiket="Şifreniz (elektronik imza) *"
                    ipucu="Geri alınamaz karar — kimliğinizi şifrenizle yeniden doğrulayın."
                  >
                    <Girdi type="password" required autoComplete="current-password"
                      value={imzaSifre} onChange={(e) => setImzaSifre(e.target.value)} />
                  </Alan>
                </div>

                {onizlemeMb !== null && (
                  <div className="mt-3">
                    <Uyari
                      cesit={onizlemeMb >= MB_ALT && onizlemeMb <= MB_UST ? "basari" : "hata"}
                      baslik={`Kütle Denkliği (önizleme): %${sayiTr(onizlemeMb, 2)}`}
                    >
                      {onizlemeMb >= MB_ALT && onizlemeMb <= MB_UST
                        ? `Kabul aralığında (%${MB_ALT}–${MB_UST}). Serbest bırakmaya engel yok.`
                        : `Kabul aralığı DIŞINDA (%${MB_ALT}–${MB_UST}). Bu seri serbest bırakılamaz; araştırma açılmalıdır (SOP-ÜR-16 md. 5.2).`}
                    </Uyari>
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <Dugme type="submit" bekliyor={dBekle}>Değerlendir ve Karar Ver</Dugme>
                </div>
              </>
            )}
          </form>
        </Kart>
      )}

      <Kart
        baslik={`Üretim Serileri (${sayfalama.toplam})`}
        aciklama="Fire ve numune sütunları kütle denkliğinin bileşenleri — denetimde bir oranın nereden çıktığı bu üç sayıdan okunur."
        sag={disaAktarabilir ? <DisaAktar tip="seri" /> : null}
      >
        <Filtre
          aramaIpucu="Seri no, üretim sorumlusu veya serbest bırakan"
          statuler={[["KARANTINA", "Karantina"], ["SERBEST", "Serbest"], ["RET", "Ret"]]}
          toplam={sayfalama.toplam}
          ilk={sayfalama.ilk}
          son={sayfalama.son}
          sayfa={sayfalama.sayfa}
          toplamSayfa={sayfalama.toplamSayfa}
        />
        <Tablo
          basliklar={[
            "Seri", "Ürün", "Tarih", "Girdi kg", "Çıktı kg", "Fire kg", "Numune kg",
            "Kütle Denk.", "CBD%", "THC%", "Statü", "",
          ]}
        >
          {seriler.length === 0 ? (
            <Bos sutun={12}>Bu filtreye uyan üretim serisi yok.</Bos>
          ) : (
            seriler.map((s) => {
              const mbUygun = s.mb !== null && s.mb >= MB_ALT && s.mb <= MB_UST;
              return (
                <Satir key={s.seri}>
                  <Hucre className="font-mono text-xs font-bold">{s.seri}</Hucre>
                  <Hucre>{s.urun_tipi === "IZOLAT" ? "CBD İzolat" : "CBD Distilat"}</Hucre>
                  <Hucre className="whitespace-nowrap">{trTarih(s.uretim_tarihi)}</Hucre>
                  <Hucre className="text-right font-mono tabular-nums">{sayiTr(s.girdi_kg, 1)}</Hucre>
                  <Hucre className="text-right font-mono tabular-nums">{sayiTr(s.cikti_kg, 3)}</Hucre>
                  <Hucre className="text-right font-mono tabular-nums">{sayiTr(s.fire_kg, 3)}</Hucre>
                  <Hucre className="text-right font-mono tabular-nums">{sayiTr(s.numune_kg, 3)}</Hucre>
                  {/* İKİ ONDALIK: %99,86 · %99,88 · %99,91 tek basamakla üçü de
                      "%99,9" görünüyordu ve ayırt edilemiyordu. */}
                  <Hucre className={`text-right font-mono tabular-nums ${s.mb !== null && !mbUygun ? "font-bold text-red-600" : ""}`}>
                    {s.mb === null ? "—" : `%${sayiTr(s.mb, 2)}`}
                  </Hucre>
                  <Hucre className="text-right font-mono tabular-nums">{sayiTr(s.cbd, 2)}</Hucre>
                  <Hucre className="text-right font-mono tabular-nums">{sayiTr(s.thc, 3)}</Hucre>
                  <Hucre>
                    <Rozet>{s.statu}</Rozet>
                    {s.ret_nedeni && <span className="mt-1 block text-xs text-red-600">{s.ret_nedeni}</span>}
                  </Hucre>
                  <Hucre>
                    <div className="flex flex-col">
                      <TabloBaglanti href={`/panel/uretim/${encodeURIComponent(s.seri)}`}>
                        Seri Dosyası
                      </TabloBaglanti>
                      <TabloBaglanti href={`/panel/izleme?q=${encodeURIComponent(s.seri)}`} ikincil>
                        İzle
                      </TabloBaglanti>
                    </div>
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
