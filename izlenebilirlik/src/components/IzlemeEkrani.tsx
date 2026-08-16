"use client";

import { useCallback, useState } from "react";
import {
  Alan, Dugme, Girdi, Hucre, Kart, Rozet, Satir, Sayac, Tablo, Uyari,
  cagir, sayiTr, trTarih,
} from "./Arayuz";
import { KarekodOkuyucu } from "./KarekodOkuyucu";
import { Karekod } from "./Karekod";

/** Zincir halkası — soyağacındaki tek bir adım. */
function Halka({
  no, baslik, statu, satirlar,
}: {
  no: number; baslik: string; statu?: string | null; satirlar: (string | null | false)[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 border-l-4 border-l-green-700 bg-slate-50 p-3 dark:border-slate-700 dark:border-l-green-500 dark:bg-slate-900/50">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">{no} · {baslik}</span>
        {statu && <Rozet>{statu}</Rozet>}
      </div>
      <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        {satirlar.filter(Boolean).join("  ·  ")}
      </div>
    </div>
  );
}

const Ok = () => <div className="py-1 pl-4 text-slate-400">↓</div>;

export function IzlemeEkrani({
  ilkSorgu,
  ilkSonuc,
}: {
  ilkSorgu: string;
  /** Sunucuda üretilmiş ilk sonuç — `?q=` ile gelindiğinde dolu. */
  ilkSonuc: any;
}) {
  const [sorgu, setSorgu] = useState(ilkSorgu);
  const [sonuc, setSonuc] = useState<any>(ilkSonuc);
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState("");
  // İlk sorgu sunucuda çalıştıysa "arandı" durumu baştan doğru — aksi halde
  // sonuçsuz bir sorgudan sonra "kayıt bulunamadı" kutusu hiç görünmezdi.
  const [arandi, setArandi] = useState(Boolean(ilkSorgu));

  const ara = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setBekliyor(true);
    setHata("");
    try {
      const s = await cagir<{ sonuc: any }>(`/api/izleme?q=${encodeURIComponent(q)}`);
      setSonuc(s.sonuc);
      setArandi(true);
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekliyor(false);
    }
  }, []);

  const kodOkundu = useCallback((kod: string) => {
    setSorgu(kod);
    ara(kod);
  }, [ara]);

  return (
    <>
      <Kart
        baslik="İzleme Sorgusu — Tarladan Hastaya"
        aciklama="Tekil karekod, seri no (CBD-D-…), ham madde lotu (HM-…), çiftçi kodu (CF-…) veya çiftçi adı girin. Sistem hem geriye hem ileriye doğru zinciri çıkarır."
      >
        <form onSubmit={(e) => { e.preventDefault(); ara(sorgu); }}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Alan etiket="Arama">
                <Girdi value={sorgu} onChange={(e) => setSorgu(e.target.value)}
                  placeholder="Karekod, seri, lot veya çiftçi" autoFocus />
              </Alan>
            </div>
            <div className="flex items-end gap-2">
              <Dugme type="submit" bekliyor={bekliyor}>Sorgula</Dugme>
              <Dugme type="button" cesit="ikincil" onClick={() => window.print()}
                className="yazdirma-gizle">Yazdır</Dugme>
            </div>
          </div>
        </form>
        <div className="mt-2">
          <KarekodOkuyucu onOkundu={kodOkundu} etiket="Kamerayla Okut" />
        </div>
        {hata && <div className="mt-3"><Uyari cesit="hata">{hata}</Uyari></div>}
      </Kart>

      {arandi && !sonuc && !bekliyor && (
        <Kart>
          <Uyari cesit="hata" baslik="Kayıt bulunamadı">
            <code className="text-xs">{sorgu}</code> ile eşleşen kayıt yok. Karekod, seri no, lot no
            veya çiftçi adı girdiğinizden emin olun.
          </Uyari>
        </Kart>
      )}

      {sonuc?.tip === "SAHTE_SUPHESI" && (
        <Kart baslik="⚠ SAHTE ÜRÜN ŞÜPHESİ">
          <Uyari cesit="hata" baslik="Bu karekod sistemde KAYITLI DEĞİL">
            {sonuc.mesaj}
          </Uyari>
          {sonuc.alanlar && (
            <Tablo basliklar={["Alan", "Değer"]}>
              <Satir><Hucre>GTIN</Hucre><Hucre className="font-mono">{sonuc.alanlar.gtin} {sonuc.alanlar.gtinGecerli ? "(kontrol hanesi geçerli)" : "(KONTROL HANESİ GEÇERSİZ)"}</Hucre></Satir>
              <Satir><Hucre>Tekil seri</Hucre><Hucre className="font-mono">{sonuc.alanlar.tekil}</Hucre></Satir>
              <Satir><Hucre>Parti / seri</Hucre><Hucre className="font-mono">{sonuc.alanlar.seri}</Hucre></Satir>
              <Satir><Hucre>SKT</Hucre><Hucre className="font-mono">{trTarih(sonuc.alanlar.skt)}</Hucre></Satir>
            </Tablo>
          )}
        </Kart>
      )}

      {sonuc?.tip === "PAKET" && <PaketZinciri z={sonuc.zincir} />}
      {sonuc?.tip === "SERI" && <SeriSonuc s={sonuc} />}
      {sonuc?.tip === "HAMMADDE" && <LotSonuc s={sonuc} />}
      {sonuc?.tip === "CIFTCI" && <CiftciSonuc s={sonuc} />}
    </>
  );
}

// ── Tam zincir ───────────────────────────────────────────────────────────────

function PaketZinciri({ z }: { z: any }) {
  const p = z.paket;
  return (
    <Kart baslik="Tam Zincir — Tekil Ambalaj Birimi"
      aciklama={<code className="break-all text-xs">{p.uid}</code>}>
      <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
        <div className="mx-auto w-40 rounded-lg border border-slate-300 bg-white p-2 text-center lg:mx-0">
          <Karekod veri={p.uid} boyut={3} />
          <div className="mt-1 font-mono text-[10px] text-slate-900">{p.tekil}</div>
        </div>

        <div>
          {z.girdiler.map((g: any, i: number) => (
            <div key={i}>
              <Halka no={1} baslik="TARLA — Çiftçi" satirlar={[
                g.ciftci ? g.ciftci.ad : "Çiftçi kaydı bulunamadı",
                g.ciftci && `Kod: ${g.ciftci.kod}`,
                g.ciftci && `Ekim izni: ${g.ciftci.izin_no}`,
                g.ciftci && `${g.ciftci.il}${g.ciftci.ilce ? "/" + g.ciftci.ilce : ""}`,
                g.ciftci?.parsel && `Parsel: ${g.ciftci.parsel}`,
              ]} />
              <Ok />
              <Halka no={2} baslik="HAM MADDE KABULÜ + ANALİZ" statu={g.hammadde?.statu} satirlar={[
                g.hammadde && `Lot: ${g.hammadde.lot}`,
                g.hammadde && `Teslim: ${trTarih(g.hammadde.teslim_tarihi)}`,
                `Bu seriye giren: ${sayiTr(g.kg, 1)} kg`,
                g.hammadde?.thc != null && `Δ9-THC: %${sayiTr(g.hammadde.thc, 3)}`,
                g.hammadde?.cbd != null && `CBD: %${sayiTr(g.hammadde.cbd, 2)}`,
                g.hammadde?.analiz_rapor_no && `Rapor: ${g.hammadde.analiz_rapor_no}`,
              ]} />
              <Ok />
            </div>
          ))}

          <Halka no={3} baslik="ÜRETİM SERİSİ" statu={z.seri?.statu} satirlar={[
            z.seri ? `Seri: ${z.seri.seri}` : "Seri bulunamadı",
            z.seri && `Ürün: ${z.seri.urun_tipi === "IZOLAT" ? "CBD İzolat" : "CBD Distilat"}`,
            z.seri && `Üretim: ${trTarih(z.seri.uretim_tarihi)}`,
            z.seri && `Girdi ${sayiTr(z.seri.girdi_kg, 1)} kg → Çıktı ${sayiTr(z.seri.cikti_kg, 3)} kg`,
            z.seri?.mb != null && `Kütle denkliği: %${sayiTr(z.seri.mb, 1)}`,
            z.seri?.cbd != null && `CBD: %${sayiTr(z.seri.cbd, 2)}`,
            z.seri?.thc != null && `THC: %${sayiTr(z.seri.thc, 3)}`,
            z.seri?.serbest_kisi && `Serbest bırakan: ${z.seri.serbest_kisi}`,
          ]} />
          <Ok />

          <Halka no={4} baslik="AMBALAJ BİRİMİ" statu={p.statu} satirlar={[
            `Tekil no: ${p.tekil}`,
            `Dolum: ${sayiTr(p.miktar_g, 2)} g`,
            `SKT: ${trTarih(p.skt)}`,
          ]} />
          <Ok />

          {z.sevkiyat ? (
            <Halka no={5} baslik="SEVKİYAT — Kapalı Zincir" statu="SEVK" satirlar={[
              `Sevk no: ${z.sevkiyat.kod}`,
              `Tarih: ${trTarih(z.sevkiyat.tarih)}`,
              z.alici && `Alıcı: ${z.alici.ad} (${z.alici.tip})`,
              z.alici?.gln && `GLN: ${z.alici.gln}`,
              `Taşıyıcı: ${z.sevkiyat.tasiyici}`,
              `Mühür: ${z.sevkiyat.muhur_no}`,
              z.sevkiyat.buts_ref && `BÜTS: ${z.sevkiyat.buts_ref}`,
            ]} />
          ) : (
            <Halka no={5} baslik="SEVKİYAT" satirlar={["Henüz sevk edilmedi — ürün deposunda."]} />
          )}

          {z.satis && (
            <>
              <Ok />
              <Halka no={6} baslik="ECZANE → HASTA" statu="SATILDI" satirlar={[
                z.eczane && `Eczane: ${z.eczane.ad}`,
                z.eczane && z.eczane.il,
                `Satış: ${trTarih(z.satis.tarih)}`,
                `Hasta: ${z.satis.hasta_ad} (${z.satis.hasta_tc_maskeli})`,
                `Reçete: ${z.satis.recete_no}`,
                z.satis.hekim && `Hekim: ${z.satis.hekim}`,
              ]} />
            </>
          )}
          {/*
            SON DURUM PAKETİN STATÜSÜNDEN türetiliyor, "satış yok" çıkarımından
            değil. Eski hâli satış kaydı olmayan HER birime "eczane stoğunda"
            diyordu — iade alınıp İMHA edilmiş bir birim bile öyle görünüyordu.
            Dış incelemenin yakaladığı bu hata, iade artık sevkiyat bağını
            silmediği için (tarihsel bağ korunuyor) görünür hâle gelmişti:
            "sevk edilmiş + satılmamış = eczanede" çıkarımı artık geçersiz.
            Statü ve `konum` alanı gerçeği söylüyor; ekran da onları okuyor.
          */}
          {!z.satis && z.paket.statu === "SEVK" && z.sevkiyat && (
            <>
              <Ok />
              <Halka no={6} baslik="ECZANE → HASTA" satirlar={["Henüz hastaya verilmedi — eczane stoğunda."]} />
            </>
          )}
          {!z.satis && z.paket.statu === "RET" && (
            <>
              <Ok />
              <Halka no={6} baslik="SON DURUM" statu="RET" satirlar={[
                "Bu birim dolaşımdan ÇIKARILDI.",
                z.paket.konum && `Kayıt: ${z.paket.konum}`,
              ]} />
            </>
          )}
          {!z.satis && z.paket.statu === "SERBEST" && z.sevkiyat && (
            <>
              <Ok />
              <Halka no={6} baslik="SON DURUM" satirlar={[
                "İade alındı ve KG-KK kararıyla stoğa döndü — yeniden sevk edilebilir.",
                z.paket.konum && `Konum: ${z.paket.konum}`,
              ]} />
            </>
          )}
        </div>
      </div>
    </Kart>
  );
}

// ── İleri izleme özeti ───────────────────────────────────────────────────────

function Ileri({ ileri, baslik }: { ileri: any; baslik: string }) {
  if (!ileri) return null;
  return (
    <Kart baslik={`İleri İzleme — ${baslik} nereye gitti?`}>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Sayac etiket="Ambalaj Birimi" deger={ileri.toplam} />
        <Sayac etiket="Depoda" deger={ileri.sayim.depoda} />
        <Sayac etiket="Sevk Edilmiş" deger={ileri.sayim.sevkte} />
        <Sayac etiket="Hastada" deger={ileri.sayim.satildi} />
      </div>
      {ileri.satislar.length > 0 ? (
        <Tablo basliklar={["Satış", "Tarih", "Hasta", "Reçete", "Hekim"]}>
          {ileri.satislar.map((s: any) => (
            <Satir key={s.kod}>
              <Hucre className="font-mono text-xs">{s.kod}</Hucre>
              <Hucre className="whitespace-nowrap">{trTarih(s.tarih)}</Hucre>
              <Hucre>
                {s.hasta_ad}
                <span className="block font-mono text-xs text-slate-500">{s.hasta_tc_maskeli}</span>
              </Hucre>
              <Hucre className="font-mono text-xs">{s.recete_no}</Hucre>
              <Hucre className="text-xs">{s.hekim ?? "—"}</Hucre>
            </Satir>
          ))}
        </Tablo>
      ) : (
        <p className="text-sm text-slate-500">Bu üründen henüz hastaya satış yapılmamış.</p>
      )}
    </Kart>
  );
}

function SeriSonuc({ s }: { s: any }) {
  return (
    <>
      <Kart baslik={`Geri İzleme — ${s.seri.seri} nereden geldi?`}
        aciklama={`${s.seri.urun_tipi === "IZOLAT" ? "CBD İzolat" : "CBD Distilat"} · ${trTarih(s.seri.uretim_tarihi)}`}>
        {s.seri.ret_nedeni && <Uyari cesit="hata" baslik="Ret nedeni">{s.seri.ret_nedeni}</Uyari>}
        <Tablo basliklar={["Ham Madde Lotu", "Çiftçi", "Ekim İzni", "İl", "Kullanılan kg", "THC%"]}>
          {s.girdiler.map((g: any) => (
            <Satir key={g.lot}>
              <Hucre className="font-mono text-xs">{g.lot}</Hucre>
              <Hucre>{g.ciftci?.ad ?? "—"}</Hucre>
              <Hucre className="font-mono text-xs">{g.ciftci?.izin_no ?? "—"}</Hucre>
              <Hucre>{g.ciftci?.il ?? "—"}</Hucre>
              <Hucre className="text-right font-mono">{sayiTr(g.kg, 1)}</Hucre>
              <Hucre className="text-right font-mono">{sayiTr(g.hammadde?.thc, 3)}</Hucre>
            </Satir>
          ))}
        </Tablo>
      </Kart>
      <Ileri ileri={s.ileri} baslik={s.seri.seri} />
    </>
  );
}

function LotSonuc({ s }: { s: any }) {
  return (
    <>
      <Kart baslik={`Ham Madde Lotu — ${s.lot.lot}`}>
        {s.lot.ret_nedeni && <Uyari cesit="hata" baslik="Ret nedeni">{s.lot.ret_nedeni}</Uyari>}
        <Halka no={1} baslik="TARLA — Çiftçi" satirlar={[
          s.ciftci?.ad ?? "—",
          s.ciftci && `Ekim izni: ${s.ciftci.izin_no}`,
          s.ciftci && `${s.ciftci.il}${s.ciftci.ilce ? "/" + s.ciftci.ilce : ""}`,
          s.ciftci?.parsel && `Parsel: ${s.ciftci.parsel}`,
        ]} />
        <Ok />
        <Halka no={2} baslik="HAM MADDE" statu={s.lot.statu} satirlar={[
          `Teslim: ${trTarih(s.lot.teslim_tarihi)}`,
          `Miktar: ${sayiTr(s.lot.miktar_kg, 1)} kg · Kalan: ${sayiTr(s.lot.kalan_kg, 1)} kg`,
          s.lot.thc != null ? `Δ9-THC: %${sayiTr(s.lot.thc, 3)}` : "Analiz bekliyor",
          s.lot.analiz_rapor_no && `Rapor: ${s.lot.analiz_rapor_no}`,
        ]} />
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          <b>Bu lottan üretilen seriler:</b>{" "}
          {s.seriler.length
            ? s.seriler.map((x: string) => <code key={x} className="mr-2 text-xs">{x}</code>)
            : "Henüz üretime girmedi."}
        </p>
      </Kart>
      <Ileri ileri={s.ileri} baslik={s.lot.lot} />
    </>
  );
}

function CiftciSonuc({ s }: { s: any }) {
  return (
    <>
      <Kart baslik={`Çiftçi — ${s.ciftci.ad}`}
        aciklama={`${s.ciftci.kod} · Ekim izni ${s.ciftci.izin_no} · ${s.ciftci.il}${s.ciftci.ilce ? "/" + s.ciftci.ilce : ""}${s.ciftci.parsel ? " · Parsel " + s.ciftci.parsel : ""}`}>
        <Tablo basliklar={["Lot", "Teslim", "Miktar", "Kalan", "THC%", "Statü"]}>
          {s.lotlar.length === 0 ? (
            <Satir><Hucre>Teslimat yok.</Hucre></Satir>
          ) : (
            s.lotlar.map((l: any) => (
              <Satir key={l.lot}>
                <Hucre className="font-mono text-xs">{l.lot}</Hucre>
                <Hucre className="whitespace-nowrap">{trTarih(l.teslim_tarihi)}</Hucre>
                <Hucre className="text-right font-mono">{sayiTr(l.miktar_kg, 1)}</Hucre>
                <Hucre className="text-right font-mono">{sayiTr(l.kalan_kg, 1)}</Hucre>
                <Hucre className="text-right font-mono">{sayiTr(l.thc, 3)}</Hucre>
                <Hucre><Rozet>{l.statu}</Rozet></Hucre>
              </Satir>
            ))
          )}
        </Tablo>
      </Kart>
      <Ileri ileri={s.ileri} baslik={s.ciftci.ad} />
    </>
  );
}
