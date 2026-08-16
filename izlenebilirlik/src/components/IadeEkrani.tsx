"use client";

import { 
 useCallback, useState } from "react";
import { 
 useRouter } from "next/navigation";
import {
  AcilirKart, 
  Alan, Bos, Dugme, Girdi, Hucre, Kart, Metinlik, Satir, Sayac, Secim, Tablo, Uyari,
  TabloBaglanti, bugun, cagir, sayiTr, trTarih, useBildirim,
} from "./Arayuz";
import { 
 KarekodOkuyucu } from "./KarekodOkuyucu";
import { 
 FotoDugmesi, FotoPaneli } from "./FotoPaneli";

const KAYNAK_ETIKET: Record<string, string> = {
  HASTA: "Hasta", ECZANE: "Eczane", HEKIM: "Hekim", KURUM: "Kurum", DIGER: "Diğer",
};

export function IadeEkrani({
  iadeler, sikayetler, iadeYetkisi, kararYetkisi, sikayetYetkisi, kapatmaYetkisi, kullaniciAdi,
}: {
  iadeler: any[]; sikayetler: any[];
  iadeYetkisi: boolean; kararYetkisi: boolean;
  sikayetYetkisi: boolean; kapatmaYetkisi: boolean; kullaniciAdi: string;
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  // Fotoğraf paneli iki tabloda ortak: aynı anda yalnızca biri açık olsun
  // diye tek state, kaynak tipiyle birlikte tutuluyor.
  const [foto, setFoto] = useState<{ tip: "IADE" | "SIKAYET"; kod: string; konu: string } | null>(null);

  // ── İade kabulü ────────────────────────────────────────────────────────────
  const [uid, setUid] = useState("");
  const [iTarih, setITarih] = useState(bugun());
  const [iGerekce, setIGerekce] = useState("");
  const [iHata, setIHata] = useState("");
  const [iBekle, setIBekle] = useState(false);

  const kodOkundu = useCallback((kod: string) => { setUid(kod); setIHata(""); }, []);

  async function iadeAl(e: React.FormEvent) {
    e.preventDefault();
    setIHata("");
    setIBekle(true);
    try {
      const r = await cagir<{ kod: string }>("/api/iade", {
        govde: { paket_uid: uid, tarih: iTarih, gerekce: iGerekce },
      });
      bildirim.basari(`${r.kod} — birim bloke edildi, karar bekliyor.`);
      setUid(""); setIGerekce("");
      router.refresh();
    } catch (e) {
      setIHata((e as Error).message);
    } finally {
      setIBekle(false);
    }
  }

  // ── İade kararı ────────────────────────────────────────────────────────────
  const [kararVerilen, setKararVerilen] = useState<any>(null);
  const [karar, setKarar] = useState("STOGA");
  const [kararNotu, setKararNotu] = useState("");
  const [t1, setT1] = useState(kullaniciAdi);
  const [t2, setT2] = useState("");
  const [tutanak, setTutanak] = useState("");
  const [kBekle, setKBekle] = useState(false);

  async function kararVer(e: React.FormEvent) {
    e.preventDefault();
    setKBekle(true);
    try {
      await cagir("/api/iade", {
        yontem: "PATCH",
        govde: {
          kod: kararVerilen.kod, karar, karar_notu: kararNotu,
          imha_tanik_1: t1, imha_tanik_2: t2, imha_tutanak_no: tutanak,
        },
      });
      bildirim.basari(karar === "STOGA" ? "Birim stoğa alındı." : "Birim imha edildi.");
      setKararVerilen(null); setKararNotu(""); setT2(""); setTutanak("");
      router.refresh();
    } catch (e) {
      bildirim.hata((e as Error).message);
    } finally {
      setKBekle(false);
    }
  }

  // ── Şikayet ────────────────────────────────────────────────────────────────
  const [sTarih, setSTarih] = useState(bugun());
  const [kaynak, setKaynak] = useState("HASTA");
  const [ileten, setIleten] = useState("");
  const [iletisim, setIletisim] = useState("");
  const [sUid, setSUid] = useState("");
  const [sKonu, setSKonu] = useState("");
  const [sAciklama, setSAciklama] = useState("");
  const [sHata, setSHata] = useState("");
  const [sBekle, setSBekle] = useState(false);

  async function sikayetAc(e: React.FormEvent) {
    e.preventDefault();
    setSHata("");
    setSBekle(true);
    try {
      const r = await cagir<{ kod: string; sapmaKod: string | null }>("/api/sikayet", {
        govde: {
          tarih: sTarih, kaynak, ileten, iletisim,
          paket_uid: sUid, konu: sKonu, aciklama: sAciklama,
        },
      });
      bildirim.basari(
        r.sapmaKod ? `${r.kod} açıldı — ${r.sapmaKod} sapması otomatik açıldı.` : `${r.kod} açıldı.`
      );
      setSUid(""); setSKonu(""); setSAciklama(""); setIleten(""); setIletisim("");
      router.refresh();
    } catch (e) {
      setSHata((e as Error).message);
    } finally {
      setSBekle(false);
    }
  }

  // ── Şikayet kapatma ────────────────────────────────────────────────────────
  const [kapatilan, setKapatilan] = useState<any>(null);
  const [sonuc, setSonuc] = useState("HAKLI");
  const [degerlendirme, setDegerlendirme] = useState("");
  const [skBekle, setSkBekle] = useState(false);

  async function sikayetKapat(e: React.FormEvent) {
    e.preventDefault();
    setSkBekle(true);
    try {
      const r = await cagir<{ not: string | null }>("/api/sikayet", {
        yontem: "PATCH",
        govde: { kod: kapatilan.kod, sonuc, degerlendirme },
      });
      bildirim.basari(r.not ?? "Şikayet kapatıldı.");
      setKapatilan(null); setDegerlendirme("");
      router.refresh();
    } catch (e) {
      bildirim.hata((e as Error).message);
    } finally {
      setSkBekle(false);
    }
  }

  const bekleyenIade = iadeler.filter((i) => i.karar === "BEKLIYOR");
  const acikSikayet = sikayetler.filter((s) => s.sonuc === "ACIK");

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Sayac etiket="Karar Bekleyen İade" deger={bekleyenIade.length} />
        <Sayac etiket="Toplam İade" deger={iadeler.length} />
        <Sayac etiket="Açık Şikayet" deger={acikSikayet.length} />
        <Sayac etiket="Toplam Şikayet" deger={sikayetler.length} />
      </div>

      {/* ── Şikayet kaydı ── */}
      {sikayetYetkisi && (
        <AcilirKart
          baslik="Şikayet Kaydı Aç"
          aciklama="SOP-KG-07. Seriye bağlanan şikayet otomatik sapma açar; sapma açık kaldığı sürece o seri serbest bırakılamaz."
        >
          <form onSubmit={sikayetAc}>
            {sHata && <Uyari cesit="hata">{sHata}</Uyari>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Alan etiket="Şikayet Tarihi *">
                <Girdi type="date" required max={bugun()} value={sTarih}
                  onChange={(e) => setSTarih(e.target.value)} />
              </Alan>
              <Alan etiket="Kaynak *">
                <Secim required value={kaynak} onChange={(e) => setKaynak(e.target.value)}>
                  {Object.entries(KAYNAK_ETIKET).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Secim>
              </Alan>
              <Alan etiket="İleten" ipucu="Eczane adı, hekim adı vb.">
                <Girdi value={ileten} onChange={(e) => setIleten(e.target.value)} />
              </Alan>
              <Alan etiket="İletişim">
                <Girdi value={iletisim} onChange={(e) => setIletisim(e.target.value)} />
              </Alan>
              <Alan etiket="Konu *">
                <Girdi required value={sKonu} onChange={(e) => setSKonu(e.target.value)}
                  placeholder="Örn. Ambalajda sızıntı" />
              </Alan>
              <Alan etiket="Ürün Karekodu" ipucu="Varsa okutun — seri otomatik bulunur">
                <Girdi value={sUid} onChange={(e) => setSUid(e.target.value)}
                  className="font-mono text-xs" />
              </Alan>
            </div>
            <div className="mt-3">
              <Alan etiket="Açıklama">
                <Metinlik rows={2} value={sAciklama} onChange={(e) => setSAciklama(e.target.value)} />
              </Alan>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <KarekodOkuyucu onOkundu={setSUid} etiket="Karekodu Okut" />
              <Dugme type="submit" bekliyor={sBekle}>Şikayet Kaydı Aç</Dugme>
            </div>
          </form>
        </AcilirKart>
      )}

      {/* ── Şikayet kapatma ── */}
      {kapatilan && (
        <Kart baslik={`${kapatilan.kod} — Değerlendir ve Kapat`} aciklama={kapatilan.konu}>
          <form onSubmit={sikayetKapat}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Alan etiket="Sonuç *">
                <Secim required value={sonuc} onChange={(e) => setSonuc(e.target.value)}>
                  <option value="HAKLI">Haklı — uygunsuzluk doğrulandı</option>
                  <option value="HAKSIZ">Haksız — uygunsuzluk bulunamadı</option>
                </Secim>
              </Alan>
            </div>
            <div className="mt-3">
              <Alan etiket="Değerlendirme *" ipucu="Ne incelendi, şahit numune sonucu, karar gerekçesi">
                <Metinlik rows={3} required value={degerlendirme}
                  onChange={(e) => setDegerlendirme(e.target.value)} />
              </Alan>
            </div>
            <Uyari cesit="uyari">
              Şikayetin açtığı sapma <b>otomatik kapanmaz</b>. Haksız bulunması, kök neden
              araştırmasının tamamlandığı anlamına gelmez — sapma kendi ekranından kapatılmalıdır.
            </Uyari>
            <div className="flex justify-end gap-2">
              <Dugme type="button" cesit="ikincil" onClick={() => setKapatilan(null)}>Vazgeç</Dugme>
              <Dugme type="submit" bekliyor={skBekle} disabled={degerlendirme.trim().length < 10}>
                Şikayeti Kapat
              </Dugme>
            </div>
          </form>
        </Kart>
      )}

      <FotoPaneli
        kaynakTip={foto?.tip ?? "IADE"}
        kod={foto?.kod ?? null}
        baslik={foto?.konu}
        yazabilir={foto?.tip === "SIKAYET" ? sikayetYetkisi : iadeYetkisi}
        ipucu="Ürünün geldiği hâli gösteren fotoğraf — ambalaj hasarı, bozulma, etiket sorunu. Karar bu görüntüye dayanarak verilir."
        kapat={() => setFoto(null)}
      />

      <Kart baslik={`Şikayetler (${sikayetler.length})`}>
        <Tablo basliklar={["Kod", "Tarih", "Kaynak", "Konu", "Ürün / Seri", "Sonuç", ""]}>
          {sikayetler.length === 0 ? (
            <Bos sutun={7}>Şikayet kaydı yok.</Bos>
          ) : (
            sikayetler.map((s) => (
              <Satir key={s.kod}>
                <Hucre className="font-mono text-xs font-bold">{s.kod}</Hucre>
                <Hucre className="whitespace-nowrap">{trTarih(s.tarih)}</Hucre>
                <Hucre>
                  {KAYNAK_ETIKET[s.kaynak] ?? s.kaynak}
                  {s.ileten && <span className="block text-xs text-slate-500">{s.ileten}</span>}
                </Hucre>
                <Hucre>
                  {s.konu}
                  {s.aciklama && <span className="mt-0.5 block text-xs text-slate-500">{s.aciklama}</span>}
                  {s.degerlendirme && (
                    <span className="mt-1 block text-xs text-green-700 dark:text-green-400">
                      <b>Değerlendirme:</b> {s.degerlendirme}
                    </span>
                  )}
                </Hucre>
                <Hucre className="font-mono text-xs">
                  {s.tekil ?? "—"}
                  {s.seri && <span className="block">{s.seri}</span>}
                  {s.sapma_kod && <span className="block text-slate-500">{s.sapma_kod}</span>}
                </Hucre>
                <Hucre>
                  <span className={`text-xs font-bold ${
                    s.sonuc === "ACIK" ? "text-amber-600"
                      : s.sonuc === "HAKLI" ? "text-red-600" : "text-slate-500"
                  }`}>
                    {s.sonuc === "ACIK" ? "AÇIK" : s.sonuc}
                  </span>
                </Hucre>
                <Hucre>
                  <FotoDugmesi
                    onClick={() => setFoto({ tip: "SIKAYET", kod: s.kod, konu: s.konu })}
                  />{" "}
                  {kapatmaYetkisi && s.sonuc === "ACIK" && (
                    <button type="button"
                      onClick={() => { setKapatilan(s); setDegerlendirme(""); setSonuc("HAKLI"); }}
                      className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700">
                      Kapat
                    </button>
                  )}
                </Hucre>
              </Satir>
            ))
          )}
        </Tablo>
      </Kart>

      {/* ── İade kabulü ── */}
      {iadeYetkisi && (
        <AcilirKart
          baslik="İade Kabulü"
          aciklama="Karekodu okutun. İade alınan birim anında bloke edilir; sevk ve satış yapılamaz. Stoğa mı dönecek imha mı edilecek, KG-KK karar verir."
        >
          <form onSubmit={iadeAl}>
            {iHata && <Uyari cesit="hata">{iHata}</Uyari>}
            <div className="mb-3">
              <KarekodOkuyucu onOkundu={kodOkundu} etiket="İade Edilen Ürünü Okut" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Alan etiket="Tekil Karekod *">
                <Girdi required value={uid} onChange={(e) => setUid(e.target.value)}
                  className="font-mono text-xs" placeholder="01…21…17…10…" />
              </Alan>
              <Alan etiket="İade Tarihi *">
                <Girdi type="date" required max={bugun()} value={iTarih}
                  onChange={(e) => setITarih(e.target.value)} />
              </Alan>
            </div>
            <div className="mt-3">
              <Alan etiket="İade Gerekçesi *">
                <Metinlik rows={2} required value={iGerekce}
                  onChange={(e) => setIGerekce(e.target.value)}
                  placeholder="Örn. Eczane stok fazlası — ambalaj açılmamış, soğuk zincir kaydı ekli." />
              </Alan>
            </div>
            <div className="mt-3 flex justify-end">
              <Dugme type="submit" bekliyor={iBekle}>İadeyi Kabul Et ve Bloke Et</Dugme>
            </div>
          </form>
        </AcilirKart>
      )}

      {/* ── İade kararı ── */}
      {kararVerilen && (
        <Kart baslik={`${kararVerilen.kod} — Karar`}
          aciklama={`${kararVerilen.seri} · ${kararVerilen.tekil} · ${sayiTr(kararVerilen.miktar_g, 2)} g · SKT ${trTarih(kararVerilen.skt)}`}>
          <form onSubmit={kararVer}>
            <Uyari cesit="uyari">
              <b>İade gerekçesi:</b> {kararVerilen.gerekce}
            </Uyari>
            <div className="grid gap-3 sm:grid-cols-2">
              <Alan etiket="Karar *">
                <Secim required value={karar} onChange={(e) => setKarar(e.target.value)}>
                  <option value="STOGA">Yeniden stoğa al</option>
                  <option value="IMHA">İmha et</option>
                </Secim>
              </Alan>
            </div>
            <div className="mt-3">
              <Alan etiket="Karar Gerekçesi *"
                ipucu="Ambalaj bütünlüğü, soğuk zincir, SKT ve görsel muayene sonucu">
                <Metinlik rows={2} required value={kararNotu}
                  onChange={(e) => setKararNotu(e.target.value)} />
              </Alan>
            </div>

            {karar === "IMHA" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Alan etiket="1. Tanık *">
                  <Girdi required value={t1} onChange={(e) => setT1(e.target.value)} />
                </Alan>
                <Alan etiket="2. Tanık *" ipucu="Birinciden farklı kişi (Ek-13 §4)">
                  <Girdi required value={t2} onChange={(e) => setT2(e.target.value)} />
                </Alan>
                <Alan etiket="İmha Tutanak No *">
                  <Girdi required value={tutanak} onChange={(e) => setTutanak(e.target.value)} />
                </Alan>
              </div>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <Dugme type="button" cesit="ikincil" onClick={() => setKararVerilen(null)}>Vazgeç</Dugme>
              <Dugme type="submit" cesit={karar === "IMHA" ? "tehlike" : "birincil"} bekliyor={kBekle}
                disabled={kararNotu.trim().length < 10}>
                {karar === "STOGA" ? "Stoğa Al" : "İmha Et ve BÜTS'e Bildir"}
              </Dugme>
            </div>
          </form>
        </Kart>
      )}

      <Kart baslik={`İadeler (${iadeler.length})`}>
        <Tablo basliklar={["Kod", "Tarih", "Ürün", "Geldiği Yer", "Gerekçe", "Karar", ""]}>
          {iadeler.length === 0 ? (
            <Bos sutun={7}>İade kaydı yok.</Bos>
          ) : (
            iadeler.map((i) => (
              <Satir key={i.kod}>
                <Hucre className="font-mono text-xs font-bold">{i.kod}</Hucre>
                <Hucre className="whitespace-nowrap">{trTarih(i.tarih)}</Hucre>
                <Hucre className="font-mono text-xs">
                  {i.tekil ?? "—"}
                  <span className="block">{i.seri}</span>
                </Hucre>
                <Hucre className="text-xs">{i.alici_ad ?? "—"}</Hucre>
                <Hucre className="text-xs">
                  {i.gerekce}
                  {i.karar_notu && (
                    <span className="mt-1 block text-slate-500"><b>Karar:</b> {i.karar_notu}</span>
                  )}
                  {i.imha_tutanak_no && (
                    <span className="mt-0.5 block text-slate-500">
                      Tutanak {i.imha_tutanak_no} · tanıklar: {i.imha_tanik_1}, {i.imha_tanik_2}
                    </span>
                  )}
                </Hucre>
                <Hucre>
                  <span className={`text-xs font-bold ${
                    i.karar === "BEKLIYOR" ? "text-amber-600"
                      : i.karar === "STOGA" ? "text-green-700 dark:text-green-400" : "text-red-600"
                  }`}>
                    {i.karar === "BEKLIYOR" ? "KARAR BEKLİYOR" : i.karar === "STOGA" ? "STOĞA ALINDI" : "İMHA EDİLDİ"}
                  </span>
                  {i.karar_tarihi && (
                    <span className="mt-0.5 block text-[11px] text-slate-500">{trTarih(i.karar_tarihi)}</span>
                  )}
                </Hucre>
                <Hucre>
                  <FotoDugmesi
                    onClick={() => setFoto({ tip: "IADE", kod: i.kod, konu: i.gerekce })}
                  />{" "}
                  {kararYetkisi && i.karar === "BEKLIYOR" && (
                    <button type="button"
                      onClick={() => { setKararVerilen(i); setKararNotu(""); setKarar("STOGA"); }}
                      className="whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700">
                      Karar Ver
                    </button>
                  )}
                  <TabloBaglanti href={`/panel/izleme?q=${encodeURIComponent(i.paket_uid)}`} ikincil>
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
