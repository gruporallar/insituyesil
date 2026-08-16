"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ProsesAdimi } from "@/lib/proses";
import {
  Alan, Bos, Dugme, Girdi, Hucre, Kart, Metinlik, Rozet, Satir, Sayac, Secim, Tablo, Uyari,
  bugun, cagir, sayiTr, trTarih, useBildirim,
} from "./Arayuz";

const URUN_ADI: Record<string, string> = { DISTILAT: "CBD Distilat", IZOLAT: "CBD İzolat" };

export function SeriDosyasi({
  seri, girdiler, prosesKayitlari, numuneler, mutabakat, sapmalar, imhalar, paketOzet,
  tanimliAdimlar, prosesYetkisi, numuneYetkisi, kullaniciAdi,
}: {
  seri: any; girdiler: any[]; prosesKayitlari: any[]; numuneler: any[];
  mutabakat: any; sapmalar: any[]; imhalar: any[]; paketOzet: any;
  tanimliAdimlar: ProsesAdimi[];
  prosesYetkisi: boolean; numuneYetkisi: boolean; kullaniciAdi: string;
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  const acikSapmalar = sapmalar.filter((s) => s.durum === "ACIK");
  const kaydedilenAdimlar = new Set(prosesKayitlari.map((p) => p.adim_kod));
  const eksikAdimlar = tanimliAdimlar.filter((a) => !kaydedilenAdimlar.has(a.kod));

  // ── Proses kaydı formu ─────────────────────────────────────────────────────
  const [adimKod, setAdimKod] = useState("");
  const [olcumler, setOlcumler] = useState<Record<string, string>>({});
  const [operator, setOperator] = useState(kullaniciAdi);
  const [pTarih, setPTarih] = useState(bugun());
  const [pHata, setPHata] = useState("");
  const [pBekle, setPBekle] = useState(false);

  const secilenAdim = tanimliAdimlar.find((a) => a.kod === adimKod);

  async function prosesGonder(e: React.FormEvent) {
    e.preventDefault();
    setPHata("");
    setPBekle(true);
    try {
      const r = await cagir<{ uygun: boolean; engeller: string[]; sapma: string | null }>(
        "/api/proses",
        { govde: { seri: seri.seri, adim_kod: adimKod, operator, tarih: pTarih, olcumler } }
      );
      bildirim.basari(
        r.uygun
          ? "Proses kaydı eklendi — tüm kriterler uygun."
          : `Kayıt eklendi ama ${r.engeller.length} uygunsuzluk var; ${r.sapma} sapması açıldı.`
      );
      setAdimKod("");
      setOlcumler({});
      router.refresh();
    } catch (e) {
      setPHata((e as Error).message);
    } finally {
      setPBekle(false);
    }
  }

  // ── Şahit numune formu ─────────────────────────────────────────────────────
  const [nMiktar, setNMiktar] = useState("");
  const [nYer, setNYer] = useState("");
  const [nAlma, setNAlma] = useState(bugun());
  const [nSon, setNSon] = useState("");
  const [nNot, setNNot] = useState("");
  const [nHata, setNHata] = useState("");
  const [nBekle, setNBekle] = useState(false);

  async function numuneGonder(e: React.FormEvent) {
    e.preventDefault();
    setNHata("");
    setNBekle(true);
    try {
      const r = await cagir<{ kod: string }>("/api/numune", {
        govde: {
          seri: seri.seri, miktar_g: nMiktar, alma_tarihi: nAlma,
          saklama_yeri: nYer, saklama_sonu: nSon, notlar: nNot,
        },
      });
      bildirim.basari(`${r.kod} kaydedildi.`);
      setNMiktar(""); setNYer(""); setNSon(""); setNNot("");
      router.refresh();
    } catch (e) {
      setNHata((e as Error).message);
    } finally {
      setNBekle(false);
    }
  }

  return (
    <>
      <div className="yazdirma-gizle mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/panel/uretim"
          className="dokunma-hedefi inline-flex text-sm font-semibold text-green-700 underline dark:text-green-400">
          ← Üretim serilerine dön
        </Link>
        <div className="flex gap-2">
          <Dugme cesit="ikincil" onClick={() => window.print()}>Seri Dosyasını Yazdır</Dugme>
          <Link href={`/panel/izleme?q=${encodeURIComponent(seri.seri)}`}>
            <Dugme cesit="ikincil">İzleme Sorgusu</Dugme>
          </Link>
        </div>
      </div>

      {/* ── Künye ── */}
      <Kart
        baslik={`Seri Dosyası — ${seri.seri}`}
        aciklama="SOP-ÜR-16 md. 5.1. Bu sayfa serinin tüm kaydını tek yerde toplar; yazdırılabilir."
        sag={<Rozet>{seri.statu}</Rozet>}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Sayac etiket="Ürün" deger={<span className="text-base">{URUN_ADI[seri.urun_tipi]}</span>} />
          <Sayac etiket="Üretim" deger={<span className="text-base">{trTarih(seri.uretim_tarihi)}</span>} />
          <Sayac etiket="Girdi" deger={sayiTr(seri.girdi_kg, 1)} alt="kg" />
          <Sayac etiket="Çıktı" deger={sayiTr(seri.cikti_kg, 3)} alt="kg" />
        </div>

        {seri.ret_nedeni && (
          <div className="mt-3">
            <Uyari cesit="hata" baslik="Ret nedeni">{seri.ret_nedeni}</Uyari>
          </div>
        )}
      </Kart>

      {/* ── Eksik kayıt uyarısı ── */}
      {seri.statu === "KARANTINA" && (eksikAdimlar.length > 0 || acikSapmalar.length > 0) && (
        <Kart baslik="Serbest Bırakma Öncesi Eksikler">
          {eksikAdimlar.length > 0 && (
            <Uyari cesit="uyari" baslik={`${eksikAdimlar.length} proses adımı kaydedilmedi`}>
              {eksikAdimlar.map((a) => `${a.sira}. ${a.ad} (${a.form})`).join(" · ")}
            </Uyari>
          )}
          {acikSapmalar.length > 0 && (
            <Uyari cesit="hata" baslik={`${acikSapmalar.length} açık sapma serbest bırakmayı engelliyor`}>
              {acikSapmalar.map((s) => `${s.kod} — ${s.konu}`).join(" · ")}{" "}
              <Link href="/panel/sapma" className="dokunma-hedefi inline-flex underline">Sapma ekranı</Link>
            </Uyari>
          )}
        </Kart>
      )}

      {/* ── 1. Girdi ham maddeler ── */}
      <Kart baslik="1 · Girdi Ham Maddeler ve Analizleri" aciklama="Ek-13 adım 1–2 · SOP-KK-02, SOP-KK-05">
        <Tablo basliklar={["Lot", "Çiftçi", "Ekim İzni", "Parsel", "Kullanılan", "Nem%", "THC%", "CBD%", "Analiz Rapor", "Lab"]}>
          {girdiler.length === 0 ? (
            <Bos sutun={10}>Girdi kaydı yok.</Bos>
          ) : (
            girdiler.map((g) => (
              <Satir key={g.lot}>
                <Hucre className="font-mono text-xs font-bold">{g.lot}</Hucre>
                <Hucre>
                  {g.ciftci_ad ?? "—"}
                  <span className="block text-xs text-slate-500">{g.il}{g.ilce ? `/${g.ilce}` : ""}</span>
                </Hucre>
                <Hucre className="font-mono text-xs">{g.izin_no ?? "—"}</Hucre>
                <Hucre className="text-xs">{g.parsel ?? "—"}</Hucre>
                <Hucre className="text-right font-mono tabular-nums">{sayiTr(g.kg, 1)} kg</Hucre>
                <Hucre className="text-right font-mono tabular-nums">{sayiTr(g.nem, 1)}</Hucre>
                <Hucre className="text-right font-mono tabular-nums">{sayiTr(g.thc, 3)}</Hucre>
                <Hucre className="text-right font-mono tabular-nums">{sayiTr(g.cbd, 2)}</Hucre>
                <Hucre className="font-mono text-xs">{g.analiz_rapor_no ?? "—"}</Hucre>
                <Hucre className="text-xs">{g.lab ?? "—"}</Hucre>
              </Satir>
            ))
          )}
        </Tablo>
      </Kart>

      {/* ── 2. Proses içi kontroller ── */}
      <Kart
        baslik="2 · Proses İçi Kontroller"
        aciklama="Ek-13 kritik kontrol noktaları · FRM-ÜR-02 … FRM-ÜR-11"
      >
        <Tablo basliklar={["Adım", "Form", "Ölçümler", "Operatör", "Tarih", "Sonuç"]}>
          {prosesKayitlari.length === 0 ? (
            <Bos sutun={6}>Henüz proses kaydı yok.</Bos>
          ) : (
            prosesKayitlari.map((p) => {
              const tanim = tanimliAdimlar.find((a) => a.kod === p.adim_kod);
              const o = JSON.parse(p.olcumler || "{}");
              const engeller = p.engeller ? JSON.parse(p.engeller) : [];
              return (
                <Satir key={p.id}>
                  <Hucre className="whitespace-nowrap font-semibold">
                    {tanim ? `${tanim.sira}. ${tanim.ad}` : p.adim_kod}
                  </Hucre>
                  <Hucre className="font-mono text-xs">{tanim?.form ?? "—"}</Hucre>
                  <Hucre className="text-xs">
                    {tanim
                      ? tanim.olcumler
                          .map((t) => {
                            const v = o[t.anahtar];
                            const g = v === "E" ? "evet" : v === "H" ? "hayır" : v;
                            return `${t.etiket}: ${g ?? "—"}${t.birim && v !== undefined && v !== "E" && v !== "H" ? " " + t.birim : ""}`;
                          })
                          .join(" · ")
                      : JSON.stringify(o)}
                  </Hucre>
                  <Hucre className="text-xs">{p.operator}</Hucre>
                  <Hucre className="whitespace-nowrap text-xs">{trTarih(p.tarih)}</Hucre>
                  <Hucre>
                    {Number(p.uygun) === 1 ? (
                      <span className="text-xs font-bold text-green-700 dark:text-green-400">UYGUN</span>
                    ) : (
                      <>
                        <span className="text-xs font-bold text-red-600">UYGUNSUZ</span>
                        <span className="mt-0.5 block text-xs text-red-600">{engeller.join(" · ")}</span>
                        {p.sapma_kod && (
                          <span className="mt-0.5 block font-mono text-[11px] text-slate-500">{p.sapma_kod}</span>
                        )}
                      </>
                    )}
                  </Hucre>
                </Satir>
              );
            })
          )}
        </Tablo>

        {prosesYetkisi && seri.statu === "KARANTINA" && (
          <form onSubmit={prosesGonder} className="yazdirma-gizle mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
            {pHata && <Uyari cesit="hata">{pHata}</Uyari>}
            <Uyari cesit="bilgi">
              Spesifikasyon dışı bir ölçüm kaydı <b>engellemez</b> — değer olduğu gibi kaydedilir,
              uygunsuz işaretlenir ve otomatik sapma açılır. Gerçek değeri gizlemek yerine kaydetmek
              esastır.
            </Uyari>

            <div className="grid gap-3 sm:grid-cols-3">
              <Alan etiket="Proses Adımı *">
                <Secim required value={adimKod}
                  onChange={(e) => { setAdimKod(e.target.value); setOlcumler({}); }}>
                  <option value="">Seçiniz</option>
                  {tanimliAdimlar.map((a) => (
                    <option key={a.kod} value={a.kod}>
                      {a.sira}. {a.ad} — {a.form}
                      {kaydedilenAdimlar.has(a.kod) ? " (kayıtlı)" : ""}
                    </option>
                  ))}
                </Secim>
              </Alan>
              <Alan etiket="Operatör *">
                <Girdi required value={operator} onChange={(e) => setOperator(e.target.value)} />
              </Alan>
              <Alan etiket="Kayıt Tarihi *">
                <Girdi type="date" required max={bugun()} value={pTarih}
                  onChange={(e) => setPTarih(e.target.value)} />
              </Alan>
            </div>

            {secilenAdim && (
              <>
                <p className="mt-3 mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {secilenAdim.sop} · {secilenAdim.form}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {secilenAdim.olcumler.map((o) => (
                    <Alan
                      key={o.anahtar}
                      etiket={`${o.etiket}${o.birim ? ` (${o.birim})` : ""}${o.opsiyonel ? "" : " *"}`}
                      ipucu={
                        o.ipucu ??
                        (o.tip === "sayi" && (o.min !== undefined || o.max !== undefined)
                          ? `Kabul: ${o.min ?? "—"} … ${o.max ?? "—"}${o.birim ? " " + o.birim : ""}`
                          : undefined)
                      }
                    >
                      {o.tip === "evet_hayir" ? (
                        <Secim required={!o.opsiyonel} value={olcumler[o.anahtar] ?? ""}
                          onChange={(e) => setOlcumler({ ...olcumler, [o.anahtar]: e.target.value })}>
                          <option value="">Seçiniz</option>
                          <option value="E">Evet</option>
                          <option value="H">Hayır</option>
                        </Secim>
                      ) : (
                        <Girdi
                          type={o.tip === "sayi" ? "number" : "text"}
                          step={o.tip === "sayi" ? "any" : undefined}
                          inputMode={o.tip === "sayi" ? "decimal" : undefined}
                          required={!o.opsiyonel}
                          value={olcumler[o.anahtar] ?? ""}
                          onChange={(e) => setOlcumler({ ...olcumler, [o.anahtar]: e.target.value })}
                        />
                      )}
                    </Alan>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <Dugme type="submit" bekliyor={pBekle}>Proses Kaydını Ekle</Dugme>
                </div>
              </>
            )}
          </form>
        )}
      </Kart>

      {/* ── 3. Kütle denkliği ── */}
      <Kart baslik="3 · Kütle Denkliği" aciklama="SOP-ÜR-16 md. 5.2 · FRM-ÜR-20 · kabul aralığı %98–102">
        <Tablo basliklar={["Kalem", "Miktar (kg)"]}>
          <Satir><Hucre>Girdi — ham madde</Hucre><Hucre className="text-right font-mono tabular-nums">{sayiTr(seri.girdi_kg, 3)}</Hucre></Satir>
          <Satir><Hucre>Çıktı — ana ürün</Hucre><Hucre className="text-right font-mono tabular-nums">{sayiTr(seri.cikti_kg, 3)}</Hucre></Satir>
          <Satir><Hucre>Fire — posa / kek / dip</Hucre><Hucre className="text-right font-mono tabular-nums">{sayiTr(seri.fire_kg, 3)}</Hucre></Satir>
          <Satir><Hucre>Numune</Hucre><Hucre className="text-right font-mono tabular-nums">{sayiTr(seri.numune_kg, 3)}</Hucre></Satir>
          <Satir>
            <Hucre className="font-bold">Kütle denkliği</Hucre>
            <Hucre className={`text-right font-mono tabular-nums font-bold ${
              seri.mb !== null && (seri.mb < 98 || seri.mb > 102) ? "text-red-600" : "text-green-700 dark:text-green-400"
            }`}>
              {seri.mb === null ? "—" : `%${sayiTr(seri.mb, 2)}`}
            </Hucre>
          </Satir>
        </Tablo>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Sayac etiket="Bitmiş Ürün CBD" deger={sayiTr(seri.cbd, 2)} alt="%" />
          <Sayac etiket="Δ9-THC" deger={sayiTr(seri.thc, 3)} alt="%" />
          <Sayac etiket="Kalıntı Çözücü" deger={seri.cozucu === null ? "—" : sayiTr(seri.cozucu, 0)} alt="ppm" />
        </div>
      </Kart>

      {/* ── 4. Ambalaj ve mutabakat ── */}
      <Kart baslik="4 · Ambalajlama ve Etiket Mutabakatı" aciklama="Ek-13 adım 12 · FRM-ÜR-12">
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Sayac etiket="Toplam Birim" deger={paketOzet?.toplam ?? 0} />
          <Sayac etiket="Depoda" deger={paketOzet?.depoda ?? 0} />
          <Sayac etiket="Sevk" deger={paketOzet?.sevkte ?? 0} />
          <Sayac etiket="Satıldı" deger={paketOzet?.satildi ?? 0} />
          <Sayac etiket="Bloke/Ret" deger={paketOzet?.ret ?? 0} />
        </div>
        {mutabakat ? (
          <Uyari cesit={Number(mutabakat.fark) === 0 ? "basari" : "hata"}
            baslik={`Etiket mutabakatı — FARK = ${mutabakat.fark}`}>
            Basılan {mutabakat.basilan} · kullanılan {mutabakat.kullanilan} · bozuk {mutabakat.bozuk} ·
            imha edilen {mutabakat.imha_edilen} · kontrol eden {mutabakat.kontrol_eden} ·{" "}
            {trTarih(mutabakat.tarih)}
          </Uyari>
        ) : (
          <Uyari cesit="uyari">
            Etiket mutabakatı yapılmamış. Mutabakat olmadan bu serinin hiçbir birimi sevk edilemez
            (Ek-13 KKN §13).
          </Uyari>
        )}
      </Kart>

      {/* ── 5. Şahit numune ── */}
      <Kart baslik="5 · Şahit Numuneler" aciklama="SOP-KK-10. Şikayet veya geri çekmede ilk başvurulan kayıt.">
        <Tablo basliklar={["Kod", "Miktar", "Alma", "Saklama Yeri", "Süre Sonu", "Durum"]}>
          {numuneler.length === 0 ? (
            <Bos sutun={6}>Şahit numune kaydı yok.</Bos>
          ) : (
            numuneler.map((n) => (
              <Satir key={n.kod}>
                <Hucre className="font-mono text-xs font-bold">{n.kod}</Hucre>
                <Hucre className="text-right font-mono tabular-nums">{sayiTr(n.miktar_g, 2)} g</Hucre>
                <Hucre className="whitespace-nowrap">{trTarih(n.alma_tarihi)}</Hucre>
                <Hucre className="text-xs">{n.saklama_yeri}</Hucre>
                <Hucre className={`whitespace-nowrap ${Number(n.suresi_doldu) === 1 ? "font-bold text-amber-600" : ""}`}>
                  {trTarih(n.saklama_sonu)}
                </Hucre>
                <Hucre>
                  <span className={`text-xs font-bold ${n.durum === "IMHA" ? "text-slate-500" : "text-green-700 dark:text-green-400"}`}>
                    {n.durum === "IMHA" ? "İMHA EDİLDİ" : "SAKLANIYOR"}
                  </span>
                  {Number(n.suresi_doldu) === 1 && (
                    <span className="mt-0.5 block text-[11px] text-amber-600">saklama süresi doldu</span>
                  )}
                </Hucre>
              </Satir>
            ))
          )}
        </Tablo>

        {numuneYetkisi && (
          <form onSubmit={numuneGonder} className="yazdirma-gizle mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
            {nHata && <Uyari cesit="hata">{nHata}</Uyari>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Alan etiket="Miktar (g) *">
                <Girdi type="number" step="0.01" min="0.01" required inputMode="decimal"
                  value={nMiktar} onChange={(e) => setNMiktar(e.target.value)} />
              </Alan>
              <Alan etiket="Alma Tarihi *">
                <Girdi type="date" required max={bugun()} value={nAlma}
                  onChange={(e) => setNAlma(e.target.value)} />
              </Alan>
              <Alan etiket="Saklama Süresi Sonu *" ipucu="Genellikle SKT + 1 yıl">
                <Girdi type="date" required value={nSon} onChange={(e) => setNSon(e.target.value)} />
              </Alan>
              <Alan etiket="Saklama Yeri *">
                <Girdi required value={nYer} onChange={(e) => setNYer(e.target.value)}
                  placeholder="Örn. KK Lab — şahit numune dolabı, raf 2" />
              </Alan>
            </div>
            <div className="mt-3">
              <Alan etiket="Notlar">
                <Metinlik rows={2} value={nNot} onChange={(e) => setNNot(e.target.value)} />
              </Alan>
            </div>
            <div className="mt-3 flex justify-end">
              <Dugme type="submit" bekliyor={nBekle}>Şahit Numune Kaydet</Dugme>
            </div>
          </form>
        )}
      </Kart>

      {/* ── 6. Sapmalar ── */}
      <Kart baslik="6 · Sapma ve CAPA Kayıtları" aciklama="SOP-KG-03. Seriyi ve besleyen lotları kapsar.">
        <Tablo basliklar={["Kod", "Kaynak", "Konu", "Kök Neden / CAPA", "Durum"]}>
          {sapmalar.length === 0 ? (
            <Bos sutun={5}>Sapma kaydı yok.</Bos>
          ) : (
            sapmalar.map((s) => (
              <Satir key={s.kod}>
                <Hucre className="font-mono text-xs font-bold">{s.kod}</Hucre>
                <Hucre className="font-mono text-xs">{s.kaynak_kod ?? s.kaynak_tip}</Hucre>
                <Hucre className="text-xs">{s.konu}</Hucre>
                <Hucre className="text-xs">
                  {s.durum === "KAPALI" ? (
                    <>
                      <b>Kök neden:</b> {s.kok_neden}
                      <span className="mt-0.5 block"><b>CAPA:</b> {s.capa}</span>
                    </>
                  ) : (
                    <span className="text-slate-500">Araştırma sürüyor</span>
                  )}
                </Hucre>
                <Hucre>
                  <span className={`text-xs font-bold ${s.durum === "ACIK" ? "text-amber-600" : "text-green-700 dark:text-green-400"}`}>
                    {s.durum === "ACIK" ? "AÇIK" : "KAPALI"}
                  </span>
                </Hucre>
              </Satir>
            ))
          )}
        </Tablo>
      </Kart>

      {/* ── 7. İmha ── */}
      <Kart baslik="7 · İmha Tutanakları" aciklama="SOP-ÜR-15 · FRM-ÜR-16">
        <Tablo basliklar={["Tutanak", "Tarih", "Tip", "Kaynak", "Miktar", "Tanıklar", "Bertaraf"]}>
          {imhalar.length === 0 ? (
            <Bos sutun={7}>İmha kaydı yok.</Bos>
          ) : (
            imhalar.map((x) => (
              <Satir key={x.kod}>
                <Hucre className="font-mono text-xs font-bold">{x.kod}</Hucre>
                <Hucre className="whitespace-nowrap">{trTarih(x.tarih)}</Hucre>
                <Hucre className="text-xs">{x.tip}</Hucre>
                <Hucre className="font-mono text-xs">{x.kaynak_kod}</Hucre>
                <Hucre className="text-right font-mono tabular-nums">{sayiTr(x.miktar_kg, 3)} kg</Hucre>
                <Hucre className="text-xs">{x.tanik_1}<br />{x.tanik_2}</Hucre>
                <Hucre className="text-xs">{x.bertaraf_firma ?? "—"}</Hucre>
              </Satir>
            ))
          )}
        </Tablo>
      </Kart>

      {/* ── 8. Serbest bırakma ve imza ── */}
      <Kart baslik="8 · Serbest Bırakma Kararı" aciklama="Ek-13 adım 15 · FRM-ÜR-13">
        {seri.statu === "SERBEST" ? (
          <Uyari cesit="basari" baslik="SERBEST BIRAKILDI">
            {seri.serbest_kisi} tarafından {trTarih(seri.serbest_tarih)} tarihinde serbest
            bırakıldı. Kütle denkliği %{sayiTr(seri.mb, 2)}.
          </Uyari>
        ) : seri.statu === "RET" ? (
          <Uyari cesit="hata" baslik="REDDEDİLDİ">{seri.ret_nedeni}</Uyari>
        ) : (
          <Uyari cesit="uyari" baslik="KARAR BEKLİYOR">
            Bu seri için henüz serbest bırakma kararı verilmedi.
          </Uyari>
        )}

        {/* Yazdırılan dosyada ıslak imza satırları */}
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {[
            ["Hazırlayan", "KG-KK Sorumlusu"],
            ["Kontrol Eden", "Üretim Sorumlusu"],
            ["Onaylayan", "Mesul Müdür"],
          ].map(([rol, unvan]) => (
            <div key={rol} className="text-xs">
              <div className="font-semibold">{rol}</div>
              <div className="text-slate-500">{unvan}</div>
              <div className="mt-8 border-t border-slate-400 pt-1 text-slate-500">Tarih / İmza</div>
            </div>
          ))}
        </div>
      </Kart>

      {bildirim.kutu}
    </>
  );
}
