"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Kart, Dugme, Uyari, trTarih, cagir, useBildirim } from "./Arayuz";
import { PERIYOTLAR, GOREV_DURUM_ETIKET, type GorevDurumu, type Periyot, type UyumOzeti, type VadeDurumu } from "@/lib/gorev";
import { ROL_ETIKETLERI } from "@/lib/types";
import type { Rol } from "@/lib/types";

const YUZEY =
  "rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/60";

export interface GorevSatiri {
  kod: string; donem: string; vade: string; durum: GorevDurumu;
  arsivYeri: string | null; faaliyet: string; dayanak: string;
  periyot: Periyot; sorumluRol: string; formKod: string | null;
  formHazir: boolean; alanKod: string | null;
  vadeDurumu: VadeDurumu; seriler: string[];
}

export interface GeriSayimSatiri {
  kod: string; tip: string; konu: string; kaynakKod: string | null;
  dayanak: string | null; sureGun: number; bitis: string;
  kalanGun: number; durum: "NORMAL" | "YAKLASIYOR" | "DOLDU";
}

const VADE_RENK: Record<VadeDurumu, string> = {
  GECIKMIS: "border-l-4 border-red-500",
  BUGUN: "border-l-4 border-amber-500",
  BEKLIYOR: "border-l-4 border-slate-200 dark:border-slate-600",
  TAMAM: "border-l-4 border-green-600",
  IPTAL: "border-l-4 border-slate-200 dark:border-slate-600",
};

const SUZGECLER = [
  { kod: "BUGUN", ad: "Bugün ve gecikmiş" },
  { kod: "ACIK", ad: "Açık işler" },
  { kod: "BEKLEYEN_ARSIV", ad: "Arşiv bekleyen" },
  { kod: "HEPSI", ad: "Tümü" },
] as const;
type Suzgec = (typeof SUZGECLER)[number]["kod"];

/**
 * GÖREV TAKVİMİ EKRANI.
 *
 * ÜÇ SORUYU SIRAYLA CEVAPLIYOR: bugün ne yapmam gerekiyor, neyin süresi
 * doluyor, hangi kâğıt geri gelmedi. Sıralama rastgele değil — periyodik
 * görevlerin kaçırılma sebebi, yapılacak işin listede kaybolması.
 *
 * SAHADA YAZILAN DEĞER BURADA İSTENMİYOR. Ekranda ölçüm alanı YOK; sistem
 * yalnızca formu basıyor ve kâğıdın arşive dönüşünü izliyor. Bu sınır
 * elektronik imza ve tam validasyon yükünü kaldıran şeyin ta kendisi —
 * buraya bir "ölçüm gir" alanı eklemek, o kararı sessizce geri alırdı.
 */
export function GorevEkrani({
  rol, islemYetkisi, gorevler, uyum, geriSayimlar, kuralSayim,
}: {
  rol: Rol;
  islemYetkisi: boolean;
  gorevler: GorevSatiri[];
  uyum: UyumOzeti;
  geriSayimlar: GeriSayimSatiri[];
  kuralSayim: { onayli: number; taslak: number; pasif: number };
}) {
  const router = useRouter();
  const bildirim = useBildirim();
  const [suzgec, setSuzgec] = useState<Suzgec>("BUGUN");
  const [sadeceBenim, setSadeceBenim] = useState(true);
  const [bekleyen, setBekleyen] = useState<string | null>(null);

  const rolluk = sadeceBenim ? gorevler.filter((g) => g.sorumluRol === rol) : gorevler;
  const gorunen = rolluk.filter((g) => {
    if (suzgec === "HEPSI") return true;
    if (suzgec === "BUGUN") return g.vadeDurumu === "GECIKMIS" || g.vadeDurumu === "BUGUN";
    if (suzgec === "ACIK") return g.durum !== "ARSIV";
    return g.durum === "BASILDI" || g.durum === "TESLIM";
  });

  const gecikmis = rolluk.filter((g) => g.vadeDurumu === "GECIKMIS").length;
  const buGun = rolluk.filter((g) => g.vadeDurumu === "BUGUN").length;
  const donmeyen = rolluk.filter((g) => g.durum === "BASILDI" || g.durum === "TESLIM").length;
  const dolan = geriSayimlar.filter((s) => s.durum === "DOLDU").length;

  async function islem(kod: string, tip: string, ek: Record<string, string> = {}) {
    setBekleyen(kod + tip);
    try {
      const s = await cagir<{ seriNo?: string }>("/api/gorev", { govde: { kod, islem: tip, ...ek } });
      if (tip === "BAS" && s.seriNo) {
        bildirim.basari(`Baskı seri no: ${s.seriNo} — yazdırma sayfası açılıyor.`);
        window.open(`/panel/gorev/${encodeURIComponent(kod)}/yazdir?seri=${encodeURIComponent(s.seriNo)}`, "_blank");
      } else {
        bildirim.basari("Kaydedildi.");
      }
      router.refresh();
    } catch (e) {
      bildirim.hata((e as Error).message);
    } finally {
      setBekleyen(null);
    }
  }

  return (
    <>
      {kuralSayim.onayli === 0 && (
        <Uyari cesit="uyari" baslik="Görev kural tablosu henüz onaylanmamış">
          Sistemde {kuralSayim.taslak} taslak kural var ve onaylanmadıkları için görev üretilmiyor.
          Kural tablosu, SOP’lardaki periyodik hükümlerin makine okunur hâli — yani yıllık faaliyet
          planınız. Onaylanmadan takvim çalışmaz; bu bilinçli, çünkü kimin neye dayanarak kurduğu
          belli olmayan bir takvim denetimde savunulamaz.
        </Uyari>
      )}

      {/* ── Özet: dört sayı, tıklanabilir süzgeç ─────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OzetKutu ad="Gecikmiş" deger={gecikmis} vurgu={gecikmis > 0 ? "kotu" : "iyi"}
          alt="vadesi geçti, yapılmadı" onClick={() => setSuzgec("BUGUN")} />
        <OzetKutu ad="Bugün" deger={buGun} vurgu={buGun > 0 ? "orta" : "iyi"}
          alt="bugün son gün" onClick={() => setSuzgec("BUGUN")} />
        <OzetKutu ad="Arşiv bekleyen" deger={donmeyen} vurgu={donmeyen > 0 ? "orta" : "iyi"}
          alt="basıldı, kâğıt dönmedi" onClick={() => setSuzgec("BEKLEYEN_ARSIV")} />
        <OzetKutu
          ad="Uyum" deger={uyum.oran === null ? "—" : `%${uyum.oran}`}
          vurgu={uyum.oran === null ? "iyi" : uyum.oran >= 95 ? "iyi" : uyum.oran >= 80 ? "orta" : "kotu"}
          alt={uyum.oran === null ? "değerlendirilecek görev yok" : `${uyum.zamaninda}/${uyum.degerlendirilen} zamanında`}
        />
      </div>

      {/* ── Geri sayımlar ────────────────────────────────────────────────── */}
      {geriSayimlar.length > 0 && (
        <section className={`${YUZEY} mt-4`}>
          <header className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-700/60">
            <h2 className="text-sm font-semibold">Geri sayımlar</h2>
            <span className="text-xs text-slate-400">
              {dolan > 0 ? `${dolan} süre doldu` : `${geriSayimlar.length} açık kayıt`}
            </span>
          </header>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {geriSayimlar.map((s) => {
              const gecen = Math.min(100, Math.max(0, ((s.sureGun - s.kalanGun) / s.sureGun) * 100));
              return (
                <li key={s.kod} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="min-w-0 text-sm">
                      <span className="font-mono text-xs text-slate-400">{s.kod}</span>{" "}
                      <span className="font-medium">{s.konu}</span>
                      {s.kaynakKod && <span className="text-slate-400"> · {s.kaynakKod}</span>}
                    </span>
                    <span
                      className={`shrink-0 text-xs font-bold tabular-nums ${
                        s.durum === "DOLDU" ? "text-red-600 dark:text-red-400"
                          : s.durum === "YAKLASIYOR" ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-500"
                      }`}
                    >
                      {s.durum === "DOLDU"
                        ? `${Math.abs(s.kalanGun)} gün AŞIM`
                        : `${s.kalanGun} gün kaldı`}
                    </span>
                  </div>
                  {/* Dolan süre çubuğu — sayı tek başına aciliyeti taşımıyor. */}
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className={`h-full rounded-full ${
                        s.durum === "DOLDU" ? "bg-red-500" : s.durum === "YAKLASIYOR" ? "bg-amber-500" : "bg-green-600"
                      }`}
                      style={{ width: `${gecen}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {s.sureGun} günlük süre · son gün {trTarih(s.bitis)}
                    {s.dayanak && ` · ${s.dayanak}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Görev listesi ────────────────────────────────────────────────── */}
      <Kart
        baslik="Görevler"
        aciklama="Sistem sahada ölçülen değeri TUTMAZ; formu hazır basar ve imzalı kâğıdın arşive dönüşünü izler."
        sag={
          <label className="dokunma-hedefi inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={sadeceBenim} onChange={(e) => setSadeceBenim(e.target.checked)} />
            Yalnız kendi rolüm ({ROL_ETIKETLERI[rol]})
          </label>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {SUZGECLER.map((s) => (
            <button
              key={s.kod}
              type="button"
              onClick={() => setSuzgec(s.kod)}
              className={`dokunma-hedefi inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                suzgec === s.kod
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
              }`}
            >
              {s.ad}
            </button>
          ))}
        </div>

        {gorunen.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Bu süzgeçte görev yok.
            {sadeceBenim && " Diğer rollerin görevlerini görmek için üstteki kutunun işaretini kaldırın."}
          </p>
        ) : (
          <ul className="space-y-2">
            {gorunen.slice(0, 100).map((g) => (
              <li key={g.kod} className={`rounded-lg bg-white p-3 shadow-sm dark:bg-slate-800 ${VADE_RENK[g.vadeDurumu]}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{g.faaliyet}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono">{g.kod}</span> · {g.dayanak} · {PERIYOTLAR[g.periyot].ad} ·{" "}
                      {g.donem} · son tarih {trTarih(g.vade)}
                      {g.alanKod && ` · ${g.alanKod}`}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold dark:bg-slate-700">
                        {GOREV_DURUM_ETIKET[g.durum]}
                      </span>
                      {g.vadeDurumu === "GECIKMIS" && (
                        <span className="rounded bg-red-50 px-1.5 py-0.5 font-bold text-red-600 dark:bg-red-900/40 dark:text-red-300">
                          gecikmiş
                        </span>
                      )}
                      {g.formKod && (
                        <span className={`rounded px-1.5 py-0.5 font-mono ${
                          g.formHazir
                            ? "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-700"
                        }`}>
                          {g.formKod}{g.formHazir ? " · ön dolu" : " · görev fişi"}
                        </span>
                      )}
                      {g.seriler.map((s) => (
                        <span key={s} className="rounded bg-sky-50 px-1.5 py-0.5 font-mono text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                          {s}
                        </span>
                      ))}
                      {g.arsivYeri && <span className="text-slate-400">arşiv: {g.arsivYeri}</span>}
                    </p>
                  </div>

                  {islemYetkisi && g.durum !== "ARSIV" && (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {g.durum === "ACIK" && (
                        <Dugme className="px-3 py-1.5 text-xs" bekliyor={bekleyen === g.kod + "BAS"} onClick={() => islem(g.kod, "BAS")}>
                          Formu bas
                        </Dugme>
                      )}
                      {(g.durum === "BASILDI" || g.durum === "TESLIM") && (
                        <>
                          <Dugme
                            cesit="ikincil" className="px-3 py-1.5 text-xs"
                            bekliyor={bekleyen === g.kod + "BAS"}
                            onClick={() => {
                              const gerekce = prompt("Yeniden basım gerekçesi (zorunlu):");
                              if (gerekce?.trim()) islem(g.kod, "BAS", { gerekce });
                            }}
                          >
                            Yeniden bas
                          </Dugme>
                          <Dugme
                            className="px-3 py-1.5 text-xs"
                            bekliyor={bekleyen === g.kod + "ARSIV"}
                            onClick={() => {
                              const yer = prompt("İmzalı kayıt nereye arşivlendi? (dolap / klasör)");
                              if (yer?.trim()) islem(g.kod, "ARSIV", { arsiv_yeri: yer });
                            }}
                          >
                            Arşivlendi
                          </Dugme>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {gorunen.length > 100 && (
          <p className="mt-2 text-xs text-slate-500">İlk 100 görev gösteriliyor ({gorunen.length} kayıt).</p>
        )}
      </Kart>

      {bildirim.kutu}
    </>
  );
}

function OzetKutu({
  ad, deger, alt, vurgu, onClick,
}: {
  ad: string; deger: number | string; alt: string;
  vurgu: "iyi" | "orta" | "kotu"; onClick?: () => void;
}) {
  const renk = {
    iyi: "text-slate-700 dark:text-slate-200",
    orta: "text-amber-600 dark:text-amber-400",
    kotu: "text-red-600 dark:text-red-400",
  }[vurgu];
  const Etiket = onClick ? "button" : "div";
  return (
    <Etiket
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`${YUZEY} block w-full p-3.5 text-left transition ${onClick ? "hover:shadow-md" : ""}`}
    >
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{ad}</p>
      <p className={`mt-1 text-2xl font-bold leading-none tabular-nums ${renk}`}>{deger}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{alt}</p>
    </Etiket>
  );
}
