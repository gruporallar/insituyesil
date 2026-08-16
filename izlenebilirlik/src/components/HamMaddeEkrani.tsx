"use client";

import { 
 useState } from "react";
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
import {
 FotoDugmesi, FotoPaneli } from "./FotoPaneli";
import { ANALIZ_PARAMETRELERI } from "@/lib/analiz";

const KABUL_BOS = {
  ciftci_kod: "", teslim_tarihi: "", miktar_kg: "", hasat_yili: "", nem: "", irsaliye: "",
};
const ANALIZ_BOS = {
  lot: "", analiz_rapor_no: "", lab: "", analiz_tarihi: "",
};

/** Formdaki tek parametre satırının durumu. */
interface SatirDurumu {
  spesifikasyon: string;
  sonuc: string;
  uygun: "" | "E" | "H";
  aciklama: string;
  /** Opsiyonel parametrelerde: bu lotta uygulanmadı, satır gönderilmez. */
  uygulanmadi: boolean;
  yontem: string;
  akredite: "" | "E" | "H";
  akredite_no: string;
  loq: string;
}

function bosSatirlar(): Record<string, SatirDurumu> {
  return Object.fromEntries(
    ANALIZ_PARAMETRELERI.map((p) => [
      p.kod,
      {
        spesifikasyon: p.onSpesifikasyon,
        sonuc: "", uygun: "" as const, aciklama: "",
        // Opsiyoneller kapalı başlar: "uygulanmadı" varsayılan, ölçüm
        // yapıldıysa kullanıcı açar. Zorunlularda kutu yok.
        uygulanmadi: p.opsiyonel,
        yontem: "", akredite: "" as const, akredite_no: "", loq: "",
      },
    ])
  );
}

export function HamMaddeEkrani({
  lotlar, ciftciler, kabulYetkisi, analizYetkisi, karantinaHepsi, sayfalama,
}: {
  lotlar: any[]; ciftciler: any[]; kabulYetkisi: boolean; analizYetkisi: boolean;
  karantinaHepsi: any[];
  sayfalama: { toplam: number; ilk: number; son: number; sayfa: number; toplamSayfa: number };
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  const [fotoLot, setFotoLot] = useState<{ kod: string; konu: string } | null>(null);

  const [kabul, setKabul] = useState({ ...KABUL_BOS, teslim_tarihi: bugun() });
  const [kabulHata, setKabulHata] = useState("");
  const [kabulBekle, setKabulBekle] = useState(false);

  const [analiz, setAnaliz] = useState({ ...ANALIZ_BOS, analiz_tarihi: bugun() });
  const [satirlar, setSatirlar] = useState<Record<string, SatirDurumu>>(bosSatirlar);
  const [analizHata, setAnalizHata] = useState("");
  const [analizBekle, setAnalizBekle] = useState(false);
  const [analizSonuc, setAnalizSonuc] = useState<{ statu: string; engeller: string[] } | null>(null);

  function satirGuncelle(kod: string, degisiklik: Partial<SatirDurumu>) {
    setSatirlar((s) => ({ ...s, [kod]: { ...s[kod], ...degisiklik } }));
  }

  // Filtreden BAĞIMSIZ: analiz bekleyen lotlar her zaman tam listeden gelir.
  const karantinadakiler = karantinaHepsi;

  async function kabulGonder(e: React.FormEvent) {
    e.preventDefault();
    setKabulHata("");
    setKabulBekle(true);
    try {
      const s = await cagir<{ lot: string }>("/api/hammadde", { govde: kabul });
      setKabul({ ...KABUL_BOS, teslim_tarihi: bugun() });
      bildirim.basari(`${s.lot} karantinaya alındı — analiz bekliyor.`);
      router.refresh();
    } catch (e) {
      setKabulHata((e as Error).message);
    } finally {
      setKabulBekle(false);
    }
  }

  async function analizGonder(e: React.FormEvent) {
    e.preventDefault();
    setAnalizHata("");
    setAnalizSonuc(null);
    setAnalizBekle(true);
    try {
      const gidenler = ANALIZ_PARAMETRELERI
        .filter((p) => !satirlar[p.kod].uygulanmadi)
        .map((p) => {
          const s = satirlar[p.kod];
          return {
            parametre: p.kod,
            spesifikasyon: s.spesifikasyon,
            sonuc: s.sonuc,
            // THC/CBD karara sayısal değeriyle girer; sonuç alanı zaten sayı.
            sayisal_deger: p.sayisalZorunlu ? s.sonuc.replace(",", ".") : null,
            birim: p.birim ?? null,
            yontem: s.yontem || null,
            akredite: s.akredite || null,
            akredite_no: s.akredite_no || null,
            loq: s.loq || null,
            uygun: s.uygun,
            aciklama: s.aciklama || null,
          };
        });
      const s = await cagir<{ statu: string; engeller: string[] }>("/api/hammadde/analiz", {
        govde: { ...analiz, satirlar: gidenler },
      });
      setAnalizSonuc(s);
      setAnaliz({ ...ANALIZ_BOS, analiz_tarihi: bugun() });
      setSatirlar(bosSatirlar());
      bildirim.basari(s.statu === "RET" ? "Lot REDDEDİLDİ." : "Lot SERBEST bırakıldı.");
      router.refresh();
    } catch (e) {
      setAnalizHata((e as Error).message);
    } finally {
      setAnalizBekle(false);
    }
  }

  return (
    <>
      {kabulYetkisi && (
        <AcilirKart
          baslik="Ham Madde Kabulü ve Karantina"
          aciklama="Ek-13 adım 1 — SOP-KK-02. Kabul edilen her teslimat otomatik KARANTİNA statüsüyle açılır."
        >
          <form onSubmit={kabulGonder}>
            {kabulHata && <Uyari cesit="hata">{kabulHata}</Uyari>}
            {ciftciler.length === 0 ? (
              <Uyari cesit="uyari">
                Önce bir çiftçi kaydı açmalısınız.{" "}
                <Link href="/panel/ciftci" className="underline">Çiftçi ekranına git</Link>
              </Uyari>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Alan etiket="Çiftçi *">
                    <Secim required value={kabul.ciftci_kod}
                      onChange={(e) => setKabul({ ...kabul, ciftci_kod: e.target.value })}>
                      <option value="">Seçiniz</option>
                      {ciftciler.map((c) => (
                        <option key={c.kod} value={c.kod}>{c.kod} — {c.ad} ({c.il})</option>
                      ))}
                    </Secim>
                  </Alan>
                  <Alan etiket="Teslim Tarihi *">
                    <Girdi type="date" required max={bugun()} value={kabul.teslim_tarihi}
                      onChange={(e) => setKabul({ ...kabul, teslim_tarihi: e.target.value })} />
                  </Alan>
                  <Alan etiket="Miktar (kg) *">
                    <Girdi type="number" step="0.1" min="0.1" required inputMode="decimal"
                      value={kabul.miktar_kg}
                      onChange={(e) => setKabul({ ...kabul, miktar_kg: e.target.value })} />
                  </Alan>
                  <Alan etiket="Hasat Yılı">
                    <Girdi type="number" min="2000" max="2100" value={kabul.hasat_yili}
                      onChange={(e) => setKabul({ ...kabul, hasat_yili: e.target.value })} />
                  </Alan>
                  <Alan etiket="Nem (%)" ipucu="Ek-13 adım 3: ≤ %10">
                    <Girdi type="number" step="0.1" min="0" max="100" inputMode="decimal"
                      value={kabul.nem}
                      onChange={(e) => setKabul({ ...kabul, nem: e.target.value })} />
                  </Alan>
                  <Alan etiket="İrsaliye No">
                    <Girdi value={kabul.irsaliye}
                      onChange={(e) => setKabul({ ...kabul, irsaliye: e.target.value })} />
                  </Alan>
                </div>
                <div className="mt-3 flex justify-end">
                  <Dugme type="submit" bekliyor={kabulBekle}>Kabul Et ve Karantinaya Al</Dugme>
                </div>
              </>
            )}
          </form>
        </AcilirKart>
      )}

      {analizYetkisi && (
        <Kart
          baslik="Akredite Laboratuvar Analizi"
          aciklama="Ek-13 adım 2 — SOP-KK-04/05, FRM-KK-09. Sonuçlar parametre parametre girilir; Δ9-THC ≤ %0,3 şartını sağlamayan veya herhangi bir zorunlu parametresi uygunsuz olan lot sistem tarafından otomatik REDDEDİLİR."
        >
          <form onSubmit={analizGonder}>
            {analizHata && <Uyari cesit="hata">{analizHata}</Uyari>}
            {analizSonuc && (
              <Uyari
                cesit={analizSonuc.statu === "RET" ? "hata" : "basari"}
                baslik={analizSonuc.statu === "RET" ? "LOT REDDEDİLDİ" : "LOT SERBEST BIRAKILDI"}
              >
                {analizSonuc.engeller.length ? (
                  <ul className="ml-4 list-disc">
                    {analizSonuc.engeller.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                ) : (
                  "Tüm kabul kriterleri sağlandı. Lot üretime uygun."
                )}
              </Uyari>
            )}

            {karantinadakiler.length === 0 ? (
              <p className="text-sm text-slate-500">Analiz bekleyen lot yok.</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Alan etiket="Karantina Lotu *">
                    <Secim required value={analiz.lot}
                      onChange={(e) => setAnaliz({ ...analiz, lot: e.target.value })}>
                      <option value="">Seçiniz</option>
                      {karantinadakiler.map((l) => (
                        <option key={l.lot} value={l.lot}>
                          {l.lot} — {l.ciftci_ad} · {sayiTr(l.miktar_kg, 1)} kg
                        </option>
                      ))}
                    </Secim>
                  </Alan>
                  <Alan etiket="Analiz Rapor No *">
                    <Girdi required value={analiz.analiz_rapor_no}
                      onChange={(e) => setAnaliz({ ...analiz, analiz_rapor_no: e.target.value })} />
                  </Alan>
                  <Alan etiket="Laboratuvar">
                    <Girdi value={analiz.lab}
                      onChange={(e) => setAnaliz({ ...analiz, lab: e.target.value })} />
                  </Alan>
                  <Alan etiket="Analiz Tarihi *">
                    <Girdi type="date" required value={analiz.analiz_tarihi}
                      onChange={(e) => setAnaliz({ ...analiz, analiz_tarihi: e.target.value })} />
                  </Alan>
                </div>

                {/* FRM-KK-09 satırları. Sonuç PARAMETRE PARAMETRE girilir;
                    "11 analiz uygun mu? E/H" beyanı bilinçli olarak kaldırıldı —
                    kararı sistem satırlardan türetir (kural 2). */}
                <div className="mt-4 space-y-3">
                  {ANALIZ_PARAMETRELERI.map((p) => {
                    const s = satirlar[p.kod];
                    const sayisal = p.sayisalZorunlu;
                    return (
                      <div key={p.kod}
                        className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-bold">
                            {p.ad}
                            {sayisal && <span className="ml-1 font-normal text-slate-500">(%)</span>}
                          </span>
                          {p.opsiyonel && (
                            <label className="dokunma-hedefi inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <input type="checkbox" checked={s.uygulanmadi}
                                onChange={(e) => satirGuncelle(p.kod, { uygulanmadi: e.target.checked })} />
                              Bu lotta uygulanmadı
                            </label>
                          )}
                        </div>

                        {!s.uygulanmadi && (
                          <>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                              <Alan etiket="Spesifikasyon">
                                {/* Sayısal limitli spesifikasyonlar kabul.ts'ten gelir
                                    ve DÜZENLENEMEZ (kural 1); serbest metinliler
                                    laboratuvar sertifikasındaki ifadeyle güncellenebilir. */}
                                {p.birim ? (
                                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    {s.spesifikasyon}
                                  </p>
                                ) : (
                                  <Girdi value={s.spesifikasyon}
                                    onChange={(e) => satirGuncelle(p.kod, { spesifikasyon: e.target.value })} />
                                )}
                              </Alan>
                              <Alan etiket={sayisal ? "Sonuç (%) *" : "Sonuç *"}
                                ipucu={p.kod === "THC" ? "Yasal sınır: ≤ 0,300" : undefined}>
                                <Girdi required
                                  type={sayisal ? "number" : "text"}
                                  step={p.kod === "THC" ? "0.001" : "0.01"}
                                  min={sayisal ? "0" : undefined}
                                  inputMode={sayisal ? "decimal" : undefined}
                                  value={s.sonuc}
                                  onChange={(e) => satirGuncelle(p.kod, { sonuc: e.target.value })} />
                              </Alan>
                              <Alan etiket="Uygun mu? *">
                                <Secim required value={s.uygun}
                                  onChange={(e) => satirGuncelle(p.kod, { uygun: e.target.value as "E" | "H" })}>
                                  <option value="">Seçiniz</option>
                                  <option value="E">Uygun</option>
                                  <option value="H">Uygunsuz</option>
                                </Secim>
                              </Alan>
                              <Alan etiket="Açıklama">
                                <Girdi value={s.aciklama}
                                  onChange={(e) => satirGuncelle(p.kod, { aciklama: e.target.value })} />
                              </Alan>
                            </div>
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs font-semibold text-slate-500">
                                Detay — yöntem / akreditasyon / LOQ
                              </summary>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                <Alan etiket="Yöntem">
                                  <Girdi value={s.yontem} placeholder="HPLC, GC-MS…"
                                    onChange={(e) => satirGuncelle(p.kod, { yontem: e.target.value })} />
                                </Alan>
                                <Alan etiket="Akredite mi?">
                                  <Secim value={s.akredite}
                                    onChange={(e) => satirGuncelle(p.kod, { akredite: e.target.value as "E" | "H" })}>
                                    <option value="">—</option>
                                    <option value="E">Evet</option>
                                    <option value="H">Hayır</option>
                                  </Secim>
                                </Alan>
                                <Alan etiket="Akreditasyon No">
                                  <Girdi value={s.akredite_no}
                                    onChange={(e) => satirGuncelle(p.kod, { akredite_no: e.target.value })} />
                                </Alan>
                                <Alan etiket="LOQ">
                                  <Girdi type="number" step="any" min="0" inputMode="decimal" value={s.loq}
                                    onChange={(e) => satirGuncelle(p.kod, { loq: e.target.value })} />
                                </Alan>
                              </div>
                            </details>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-end">
                  <Dugme type="submit" bekliyor={analizBekle}>Analizi Kaydet ve Karar Ver</Dugme>
                </div>
              </>
            )}
          </form>
        </Kart>
      )}

      <FotoPaneli
        kaynakTip="HAMMADDE"
        kod={fotoLot?.kod ?? null}
        baslik={fotoLot?.konu}
        yazabilir={kabulYetkisi}
        ipucu="Mal kabulünde çekilen fotoğraf — çuval durumu, küf/yabancı madde, sevk irsaliyesi. Sonradan tartışma çıkarsa tek dayanak budur."
        kapat={() => setFotoLot(null)}
      />

      <Kart baslik={`Ham Madde Lotları (${sayfalama.toplam})`} sag={<DisaAktar tip="hammadde" />}>
        <Filtre
          aramaIpucu="Lot, irsaliye, analiz rapor no veya çiftçi"
          statuler={[["KARANTINA", "Karantina"], ["SERBEST", "Serbest"], ["RET", "Ret"]]}
          toplam={sayfalama.toplam}
          ilk={sayfalama.ilk}
          son={sayfalama.son}
          sayfa={sayfalama.sayfa}
          toplamSayfa={sayfalama.toplamSayfa}
        />
        <Tablo basliklar={["Lot", "Çiftçi", "Teslim", "Miktar", "Kalan", "Nem%", "THC%", "CBD%", "Statü", ""]}>
          {lotlar.length === 0 ? (
            <Bos sutun={10}>Bu filtreye uyan ham madde kaydı yok.</Bos>
          ) : (
            lotlar.map((l) => (
              <Satir key={l.lot}>
                <Hucre className="font-mono text-xs font-bold">{l.lot}</Hucre>
                <Hucre>{l.ciftci_ad ?? "—"}</Hucre>
                <Hucre className="whitespace-nowrap">{trTarih(l.teslim_tarihi)}</Hucre>
                <Hucre className="text-right font-mono tabular-nums">{sayiTr(l.miktar_kg, 1)}</Hucre>
                <Hucre className="text-right font-mono tabular-nums">{sayiTr(l.kalan_kg, 1)}</Hucre>
                {/* Nem giriliyordu ama hiçbir yerde görünmüyordu. Ek-13 adım 3
                    öğütme öncesi ≤ %10 şartı koyuyor; sınırı aşan değer
                    vurgulanıyor. */}
                <Hucre
                  className={`text-right font-mono tabular-nums ${
                    l.nem != null && Number(l.nem) > 10 ? "font-bold text-amber-600" : ""
                  }`}
                >
                  {sayiTr(l.nem, 1)}
                </Hucre>
                <Hucre className="text-right font-mono tabular-nums">{sayiTr(l.thc, 3)}</Hucre>
                <Hucre className="text-right font-mono tabular-nums">{sayiTr(l.cbd, 2)}</Hucre>
                <Hucre>
                  <Rozet>{l.statu}</Rozet>
                  {l.ret_nedeni && (
                    <span className="mt-1 block text-xs text-red-600">{l.ret_nedeni}</span>
                  )}
                </Hucre>
                <Hucre>
                  <FotoDugmesi
                    onClick={() =>
                      setFotoLot({ kod: l.lot, konu: `${l.ciftci_ad ?? "—"} · ${sayiTr(l.miktar_kg, 1)} kg` })
                    }
                  />{" "}
                  <TabloBaglanti href={`/panel/izleme?q=${encodeURIComponent(l.lot)}`}>
                    İzle
                  </TabloBaglanti>
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
