"use client";

import { 
 useCallback, useEffect, useMemo, useRef, useState } from "react";
import { 
 useRouter } from "next/navigation";
import {
  AcilirKart, 
  Alan, Bos, Dugme, Girdi, Hucre, Kart, Metinlik, Rozet, Satir, Secim, Tablo, Uyari,
  bugun, cagir, useBildirim, trTarih,
} from "./Arayuz";
import { 
 DisaAktar } from "./DisaAktar";
import { 
 Filtre } from "./Filtre";
import { 
 KarekodOkuyucu } from "./KarekodOkuyucu";
import { 
 karekodNormalize } from "@/lib/karekod";

type Denetim = {
  gecerli: { uid: string; tekil: string; seri: string; skt: string }[];
  hatali: { kod: string; neden: string }[];
};

/** Listedeki tek bir okutma ve o okutmanın anlık sonucu. */
type Okunan = {
  /** Normalize edilmiş kod — `paketler.uid` ile birebir aynı. */
  kod: string;
  durum: "bekliyor" | "gecerli" | "hatali";
  tekil?: string;
  seri?: string;
  skt?: string;
  neden?: string;
};

export function SevkiyatEkrani({
  aliciar, sevkiyatlar, aliciYetkisi, sevkYetkisi, ilkKod = "", sayfalama,
}: {
  aliciar: any[]; sevkiyatlar: any[];
  aliciYetkisi: boolean; sevkYetkisi: boolean;
  ilkKod?: string;
  sayfalama: { toplam: number; ilk: number; son: number; sayfa: number; toplamSayfa: number };
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  // ── Alıcı tanımlama ────────────────────────────────────────────────────────
  const [aTip, setATip] = useState("ECZANE");
  const [aAd, setAAd] = useState("");
  const [aGln, setAGln] = useState("");
  const [aIl, setAIl] = useState("");
  const [aAdres, setAAdres] = useState("");
  const [aYetkili, setAYetkili] = useState("");
  const [aHata, setAHata] = useState("");
  const [aBekle, setABekle] = useState(false);

  async function aliciKaydet(e: React.FormEvent) {
    e.preventDefault();
    setAHata("");
    setABekle(true);
    try {
      await cagir("/api/alici", {
        govde: { tip: aTip, ad: aAd, gln: aGln, il: aIl, adres: aAdres, yetkili: aYetkili },
      });
      setAAd(""); setAGln(""); setAIl(""); setAAdres(""); setAYetkili("");
      bildirim.basari("Alıcı kaydedildi.");
      router.refresh();
    } catch (e) {
      setAHata((e as Error).message);
    } finally {
      setABekle(false);
    }
  }

  // ── Sevkiyat ───────────────────────────────────────────────────────────────
  const [aliciKod, setAliciKod] = useState("");
  const [tarih, setTarih] = useState(bugun());
  const [tasiyici, setTasiyici] = useState("");
  const [muhur, setMuhur] = useState("");
  const [irsaliye, setIrsaliye] = useState("");
  const [teslimAlan, setTeslimAlan] = useState("");
  const [okunanlar, setOkunanlar] = useState<Okunan[]>([]);
  const [yapistir, setYapistir] = useState("");
  const [sonMesaj, setSonMesaj] = useState("");
  const [sHata, setSHata] = useState("");
  const [sBekle, setSBekle] = useState(false);

  const sayim = useMemo(() => {
    const g = okunanlar.filter((o) => o.durum === "gecerli").length;
    const h = okunanlar.filter((o) => o.durum === "hatali").length;
    const b = okunanlar.filter((o) => o.durum === "bekliyor").length;
    return { gecerli: g, hatali: h, bekleyen: b, toplam: okunanlar.length };
  }, [okunanlar]);

  /**
   * Bir grup kodu doğrulayıp sonuçlarını listeye işler.
   *
   * Eşleştirme `uid` üzerinden birebir: `paketler.uid` zaten karekodun
   * normalize edilmiş tam metni, dolayısıyla okutulan kod ile dönen kayıt
   * arasında ayrı bir anahtar aramaya gerek yok.
   */
  const dogrula = useCallback(async (kodlar: string[]) => {
    if (!kodlar.length) return;
    try {
      const d = await cagir<Denetim>("/api/sevkiyat/dogrula", {
        govde: { kodlar: kodlar.join("\n") },
      });
      const iyi = new Map(d.gecerli.map((p) => [p.uid, p]));
      const kotu = new Map(d.hatali.map((h) => [karekodNormalize(h.kod), h.neden]));
      setOkunanlar((liste) =>
        liste.map((o) => {
          if (!kodlar.includes(o.kod)) return o;
          const p = iyi.get(o.kod);
          if (p) return { ...o, durum: "gecerli", tekil: p.tekil, seri: p.seri, skt: p.skt };
          const neden = kotu.get(o.kod);
          return { ...o, durum: "hatali", neden: neden ?? "Doğrulanamadı" };
        })
      );
    } catch (e) {
      // Ağ hatası kodu HATALI saymaz — yalnızca beklemede bırakıp sebebi
      // söyler. Geçerli bir kutuyu bağlantı koptu diye kenara ayırtmak,
      // operatörü sisteme güvensizleştiren türden bir yanlış.
      setSHata((e as Error).message);
      setOkunanlar((liste) =>
        liste.map((o) =>
          kodlar.includes(o.kod) && o.durum === "bekliyor"
            ? { ...o, durum: "bekliyor", neden: "Doğrulanamadı — tekrar deneyin" }
            : o
        )
      );
    }
  }, []);

  /**
   * Listedeki kodların SENKRON aynası.
   *
   * Mükerrer okutmayı `setOkunanlar` güncelleyicisinin içinde yakalamak
   * güvenli değil: React güncelleyiciyi çağrı anında çalıştırmayı garanti
   * etmiyor (StrictMode'da iki kez de çalıştırabiliyor). Kamera saniyede
   * birkaç kod bildirebildiği için karar ANINDA verilmeli.
   */
  const kodlarRef = useRef<Set<string>>(new Set());

  /** Kamerayla okunan kodu listeye ekler ve ANINDA doğrular. */
  const kodEkle = useCallback(
    (ham: string) => {
      const kod = karekodNormalize(ham.trim());
      if (!kod) return;
      if (kodlarRef.current.has(kod)) {
        setSonMesaj("Bu birim zaten listede.");
        return;
      }
      kodlarRef.current.add(kod);
      setSonMesaj("");
      setOkunanlar((liste) => [...liste, { kod, durum: "bekliyor" }]);
      void dogrula([kod]);
    },
    [dogrula]
  );

  // Hızlı İşlem ekranından kod ile gelindiyse listeye bir kez ekle.
  const ilkEklendiRef = useRef(false);
  useEffect(() => {
    if (ilkKod && !ilkEklendiRef.current) {
      ilkEklendiRef.current = true;
      kodEkle(ilkKod);
    }
  }, [ilkKod, kodEkle]);

  /** Yapıştırılan / USB okuyucudan gelen çok satırlı metni topluca ekler. */
  function topluEkle() {
    const gelen = yapistir
      .split(/[\r\n,;]+/)
      .map((x) => karekodNormalize(x.trim()))
      .filter(Boolean);
    if (!gelen.length) return;
    const eklenecek: string[] = [];
    for (const k of gelen) {
      if (!kodlarRef.current.has(k)) {
        kodlarRef.current.add(k);
        eklenecek.push(k);
      }
    }
    setYapistir("");
    if (!eklenecek.length) {
      setSonMesaj("Yapıştırılan kodların hepsi zaten listede.");
      return;
    }
    setSonMesaj("");
    setOkunanlar((liste) => [
      ...liste,
      ...eklenecek.map((kod) => ({ kod, durum: "bekliyor" as const })),
    ]);
    void dogrula(eklenecek);
  }

  function cikar(kod: string) {
    kodlarRef.current.delete(kod);
    setOkunanlar((l) => l.filter((o) => o.kod !== kod));
  }

  function hatalilariCikar() {
    // Tıklama yolunda `okunanlar` güncel; yan etkiyi state güncelleyicisinin
    // içine koymaya gerek yok.
    for (const o of okunanlar) if (o.durum === "hatali") kodlarRef.current.delete(o.kod);
    setOkunanlar((l) => l.filter((o) => o.durum !== "hatali"));
  }

  async function sevkGonder(e: React.FormEvent) {
    e.preventDefault();
    setSHata("");
    setSBekle(true);
    try {
      const s = await cagir<{ kod: string; adet: number; butsRef: string }>("/api/sevkiyat", {
        govde: {
          alici_kod: aliciKod, tarih, tasiyici, muhur_no: muhur,
          irsaliye, teslim_alan: teslimAlan,
          kodlar: okunanlar.map((o) => o.kod).join("\n"),
        },
      });
      kodlarRef.current.clear();
      setOkunanlar([]); setMuhur(""); setIrsaliye(""); setSonMesaj("");
      bildirim.basari(`${s.kod} — ${s.adet} birim sevk edildi.`);
      router.refresh();
    } catch (e) {
      setSHata((e as Error).message);
    } finally {
      setSBekle(false);
    }
  }

  return (
    <>
      {aliciYetkisi && (
        <AcilirKart
          baslik="Alıcı Tanımla (Ecza Deposu / Eczane)"
          aciklama="Kapalı zincirin sonraki halkaları. Eczaneler GLN numarasıyla tanımlanır."
        >
          <form onSubmit={aliciKaydet}>
            {aHata && <Uyari cesit="hata">{aHata}</Uyari>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Alan etiket="Tip *">
                <Secim required value={aTip} onChange={(e) => setATip(e.target.value)}>
                  <option value="ECZANE">Eczane</option>
                  <option value="DEPO">Ecza Deposu</option>
                </Secim>
              </Alan>
              <Alan etiket="Ad / Ünvan *">
                <Girdi required value={aAd} onChange={(e) => setAAd(e.target.value)} />
              </Alan>
              <Alan etiket="GLN No">
                <Girdi inputMode="numeric" value={aGln} onChange={(e) => setAGln(e.target.value)} />
              </Alan>
              <Alan etiket="İl *">
                <Girdi required value={aIl} onChange={(e) => setAIl(e.target.value)} />
              </Alan>
              <Alan etiket="Yetkili">
                <Girdi value={aYetkili} onChange={(e) => setAYetkili(e.target.value)} />
              </Alan>
              <Alan etiket="Adres">
                <Girdi value={aAdres} onChange={(e) => setAAdres(e.target.value)} />
              </Alan>
            </div>
            <div className="mt-3 flex justify-end">
              <Dugme type="submit" bekliyor={aBekle}>Alıcı Kaydet</Dugme>
            </div>
          </form>
        </AcilirKart>
      )}

      {sevkYetkisi && (
        <Kart
          baslik="Sevkiyat — Kapalı Zincir"
          aciklama="Ek-13 adım 16 — SOP-ÜR-14. Karekodları kamerayla okutun veya elle yapıştırın. Bir kod bile uygun değilse sevkiyat HİÇ kaydedilmez."
        >
          <form onSubmit={sevkGonder}>
            {sHata && <Uyari cesit="hata">{sHata}</Uyari>}

            {aliciar.length === 0 ? (
              <Uyari cesit="uyari">Önce bir alıcı tanımlayın.</Uyari>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Alan etiket="Alıcı *">
                    <Secim required value={aliciKod} onChange={(e) => setAliciKod(e.target.value)}>
                      <option value="">Seçiniz</option>
                      {aliciar.map((a) => (
                        <option key={a.kod} value={a.kod}>{a.ad} — {a.tip} · {a.il}</option>
                      ))}
                    </Secim>
                  </Alan>
                  <Alan etiket="Sevk Tarihi *">
                    <Girdi type="date" required max={bugun()} value={tarih}
                      onChange={(e) => setTarih(e.target.value)} />
                  </Alan>
                  <Alan etiket="Onaylı Taşıyıcı *">
                    <Girdi required value={tasiyici} onChange={(e) => setTasiyici(e.target.value)} />
                  </Alan>
                  <Alan etiket="Mühür No *">
                    <Girdi required value={muhur} onChange={(e) => setMuhur(e.target.value)} />
                  </Alan>
                  <Alan etiket="İrsaliye No">
                    <Girdi value={irsaliye} onChange={(e) => setIrsaliye(e.target.value)} />
                  </Alan>
                  <Alan etiket="Teslim Alan Yetkili">
                    <Girdi value={teslimAlan} onChange={(e) => setTeslimAlan(e.target.value)} />
                  </Alan>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <KarekodOkuyucu onOkundu={kodEkle} etiket="Kamerayla Okut" />
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      Sepet: <b className="font-mono">{sayim.toplam}</b> birim
                    </span>
                    {sayim.gecerli > 0 && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800 dark:bg-green-900/50 dark:text-green-200">
                        {sayim.gecerli} uygun
                      </span>
                    )}
                    {sayim.hatali > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800 dark:bg-red-900/50 dark:text-red-200">
                        {sayim.hatali} sorunlu
                      </span>
                    )}
                    {sayim.bekleyen > 0 && (
                      <span className="text-xs text-slate-500">{sayim.bekleyen} denetleniyor…</span>
                    )}
                  </div>

                  {sonMesaj && (
                    <p className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                      {sonMesaj}
                    </p>
                  )}

                  {/*
                    SEPET. Her okutma ANINDA doğrulanıp buraya düşüyor. Eski
                    akışta kodlar bir metin kutusuna birikiyor, doğrulama en
                    sonda toplu yapılıyordu: 40 kutu okutulup "3'ü sevk
                    edilemez" denince hangi kutuların kenara ayrılacağını
                    bulmak için baştan bakmak gerekiyordu. Artık sorunlu kutu
                    okutulduğu ANDA kırmızıya dönüyor — operatör elindeyken
                    ayırıyor.
                  */}
                  {okunanlar.length > 0 && (
                    <ul className="mb-3 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                      {okunanlar.map((o) => (
                        <li
                          key={o.kod}
                          className={`flex items-center gap-3 px-3 py-2 ${
                            o.durum === "hatali" ? "bg-red-50 dark:bg-red-950/30" : ""
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                              o.durum === "gecerli"
                                ? "bg-green-600 text-white"
                                : o.durum === "hatali"
                                  ? "bg-red-600 text-white"
                                  : "bg-slate-300 text-slate-600 dark:bg-slate-600 dark:text-slate-200"
                            }`}
                          >
                            {o.durum === "gecerli" ? "✓" : o.durum === "hatali" ? "✕" : "…"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-xs font-bold">
                              {o.tekil ?? `…${o.kod.slice(-24)}`}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {o.durum === "gecerli"
                                ? `${o.seri} · SKT ${trTarih(o.skt!)}`
                                : (o.neden ?? "denetleniyor…")}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => cikar(o.kod)}
                            className="dokunma-hedefi shrink-0 px-2 text-xs font-semibold text-slate-500 underline"
                            aria-label="Listeden çıkar"
                          >
                            Çıkar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <Alan
                    etiket="Toplu ekleme"
                    ipucu="USB barkod okuyucu veya kopyalanmış liste. Her satıra bir kod; eklenince hepsi doğrulanır."
                  >
                    <Metinlik
                      rows={3}
                      value={yapistir}
                      onChange={(e) => setYapistir(e.target.value)}
                      placeholder="Kodları buraya yapıştırın…"
                    />
                  </Alan>
                  <div className="mt-2">
                    <Dugme type="button" cesit="ikincil" onClick={topluEkle} disabled={!yapistir.trim()}>
                      Listeye Ekle ve Doğrula
                    </Dugme>
                  </div>
                </div>

                {sayim.hatali > 0 && (
                  <div className="mt-3">
                    <Uyari cesit="hata" baslik={`${sayim.hatali} birim sevk edilemez`}>
                      Sevkiyat, sorunlu birim listede olduğu sürece kaydedilmez. Kutuları
                      fiziksel olarak ayırdıktan sonra listeden de çıkarın.
                      <div className="mt-2">
                        <Dugme type="button" cesit="ikincil" onClick={hatalilariCikar}>
                          Sorunlu {sayim.hatali} Birimi Listeden Çıkar
                        </Dugme>
                      </div>
                    </Uyari>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {/*
                    Sorunlu birimler SESSİZCE ELENMİYOR. Kaydet düğmesi kapalı
                    kalıyor ve operatör onları bilerek çıkarıyor: kayıt dışı
                    bırakılan bir kutunun farkında olunmaması, GMP'de kaydın
                    hiç tutulmamasından beter.
                  */}
                  <Dugme
                    type="submit"
                    bekliyor={sBekle}
                    disabled={!sayim.gecerli || sayim.hatali > 0 || sayim.bekleyen > 0}
                  >
                    {sayim.gecerli ? `${sayim.gecerli} Birimi Sevk Et` : "Sevkiyatı Kaydet"} ve
                    BÜTS&apos;e Bildir
                  </Dugme>
                </div>
              </>
            )}
          </form>
        </Kart>
      )}

      <Kart baslik={`Sevkiyatlar (${sayfalama.toplam})`} sag={<DisaAktar tip="sevkiyat" />}>
        <Filtre
          aramaIpucu="Sevk no, mühür, irsaliye, taşıyıcı veya alıcı"
          toplam={sayfalama.toplam}
          ilk={sayfalama.ilk}
          son={sayfalama.son}
          sayfa={sayfalama.sayfa}
          toplamSayfa={sayfalama.toplamSayfa}
        />
        <Tablo basliklar={["Sevk No", "Tarih", "Alıcı", "Adet", "Taşıyıcı", "Mühür", "BÜTS Ref"]}>
          {sevkiyatlar.length === 0 ? (
            <Bos sutun={7}>Bu filtreye uyan sevkiyat yok.</Bos>
          ) : (
            sevkiyatlar.map((s) => (
              <Satir key={s.kod}>
                <Hucre className="font-mono text-xs font-bold">{s.kod}</Hucre>
                <Hucre className="whitespace-nowrap">{trTarih(s.tarih)}</Hucre>
                <Hucre>
                  {s.alici_ad}{" "}
                  {s.alici_tip && <Rozet>{s.alici_tip}</Rozet>}
                  <span className="block text-xs text-slate-500">{s.alici_il}</span>
                </Hucre>
                <Hucre className="text-right font-mono">{s.adet}</Hucre>
                <Hucre className="text-xs">{s.tasiyici}</Hucre>
                <Hucre className="font-mono text-xs">{s.muhur_no}</Hucre>
                <Hucre className="font-mono text-xs">{s.buts_ref ?? "—"}</Hucre>
              </Satir>
            ))
          )}
        </Tablo>
      </Kart>

      {bildirim.kutu}
    </>
  );
}
