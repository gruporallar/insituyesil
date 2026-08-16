"use client";

import { 
 useState } from "react";
import { 
 useRouter } from "next/navigation";
import {
  AcilirKart, 
  Alan, Bos, Dugme, Girdi, Hucre, Kart, Satir, Tablo, Uyari,
  cagir, sayiTr, useBildirim,
} from "./Arayuz";
import { 
 DisaAktar } from "./DisaAktar";

const BOS = {
  ad: "", tc_vkn: "", cks_no: "", izin_no: "",
  il: "", ilce: "", parsel: "", alan_dekar: "", tel: "",
};

export function CiftciEkrani({ kayitlar, yazabilir }: { kayitlar: any[]; yazabilir: boolean }) {
  const router = useRouter();
  const bildirim = useBildirim();
  const [form, setForm] = useState(BOS);
  const [hata, setHata] = useState("");
  const [bekliyor, setBekliyor] = useState(false);

  const degis = (ad: keyof typeof BOS) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [ad]: e.target.value }));

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata("");
    setBekliyor(true);
    try {
      const s = await cagir<{ kod: string }>("/api/ciftci", { govde: form });
      setForm(BOS);
      bildirim.basari(`${s.kod} kaydedildi.`);
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
        <AcilirKart
          baslik="Çiftçi / Ham Madde Tedarikçisi Kaydı"
          aciklama="Zincirin başlangıç halkası. SOP-KG-08 tedarikçi değerlendirme kapsamında kayıt açılır."
        >
          <form onSubmit={gonder}>
            {hata && <Uyari cesit="hata">{hata}</Uyari>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Alan etiket="Ad Soyad / Ünvan *">
                <Girdi required value={form.ad} onChange={degis("ad")} placeholder="Ahmet Yılmaz" />
              </Alan>
              <Alan etiket="TC / Vergi No *" ipucu="10 veya 11 hane">
                <Girdi required inputMode="numeric" value={form.tc_vkn} onChange={degis("tc_vkn")} />
              </Alan>
              <Alan etiket="Kenevir Ekim İzin No *" ipucu="İl Tarım Müdürlüğü izni">
                <Girdi required value={form.izin_no} onChange={degis("izin_no")} />
              </Alan>
              <Alan etiket="ÇKS Kayıt No">
                <Girdi value={form.cks_no} onChange={degis("cks_no")} />
              </Alan>
              <Alan etiket="İl *">
                <Girdi required value={form.il} onChange={degis("il")} placeholder="Burdur" />
              </Alan>
              <Alan etiket="İlçe">
                <Girdi value={form.ilce} onChange={degis("ilce")} placeholder="Gölhisar" />
              </Alan>
              <Alan etiket="Parsel / Ada No">
                <Girdi value={form.parsel} onChange={degis("parsel")} placeholder="112/7" />
              </Alan>
              <Alan etiket="Ekim Alanı (dekar)">
                <Girdi type="number" step="0.1" min="0" value={form.alan_dekar} onChange={degis("alan_dekar")} />
              </Alan>
              <Alan etiket="Telefon">
                <Girdi type="tel" value={form.tel} onChange={degis("tel")} />
              </Alan>
            </div>
            <div className="mt-3 flex justify-end">
              <Dugme type="submit" bekliyor={bekliyor}>Çiftçi Kaydet</Dugme>
            </div>
          </form>
        </AcilirKart>
      )}

      <Kart baslik={`Kayıtlı Çiftçiler (${kayitlar.length})`} sag={<DisaAktar tip="ciftci" />}>
        <Tablo basliklar={["Kod", "Ad / Ünvan", "Ekim İzni", "Konum", "Parsel", "Teslimat", "Toplam kg"]}>
          {kayitlar.length === 0 ? (
            <Bos sutun={7}>Henüz çiftçi kaydı yok.</Bos>
          ) : (
            kayitlar.map((c) => (
              <Satir key={c.kod}>
                <Hucre className="font-mono text-xs">{c.kod}</Hucre>
                <Hucre className="font-semibold">{c.ad}</Hucre>
                <Hucre className="font-mono text-xs">{c.izin_no}</Hucre>
                <Hucre>{c.il}{c.ilce ? ` / ${c.ilce}` : ""}</Hucre>
                <Hucre>{c.parsel ?? "—"}</Hucre>
                <Hucre className="text-right font-mono">{c.teslimat_sayisi}</Hucre>
                <Hucre className="text-right font-mono">{sayiTr(c.toplam_kg, 1)}</Hucre>
              </Satir>
            ))
          )}
        </Tablo>
      </Kart>

      {bildirim.kutu}
    </>
  );
}
