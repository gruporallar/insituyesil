"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alan, Bos, Dugme, Girdi, Hucre, Kart, Satir, Secim, Tablo, Uyari,
  bugun, cagir, trTarih, useBildirim,
} from "./Arayuz";
import { DisaAktar } from "./DisaAktar";
import { Filtre } from "./Filtre";
import { KarekodOkuyucu } from "./KarekodOkuyucu";

export function SatisEkrani({
  eczaneler, satislar, yazabilir, disaAktarabilir, sayfalama,
}: {
  eczaneler: any[]; satislar: any[]; yazabilir: boolean; disaAktarabilir: boolean;
  sayfalama: { toplam: number; ilk: number; son: number; sayfa: number; toplamSayfa: number };
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  const [aliciKod, setAliciKod] = useState("");
  const [uid, setUid] = useState("");
  const [tarih, setTarih] = useState(bugun());
  const [hastaAd, setHastaAd] = useState("");
  const [hastaTc, setHastaTc] = useState("");
  const [receteNo, setReceteNo] = useState("");
  const [hekim, setHekim] = useState("");
  const [hata, setHata] = useState("");
  const [bekliyor, setBekliyor] = useState(false);

  const kodOkundu = useCallback((kod: string) => {
    setUid(kod);
    setHata("");
  }, []);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata("");
    setBekliyor(true);
    try {
      const s = await cagir<{ kod: string }>("/api/satis", {
        govde: {
          alici_kod: aliciKod, uid, tarih,
          hasta_ad: hastaAd, hasta_tc: hastaTc, recete_no: receteNo, hekim,
        },
      });
      setUid(""); setHastaAd(""); setHastaTc(""); setReceteNo(""); setHekim("");
      bildirim.basari(`${s.kod} — satış kaydedildi.`);
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
          baslik="Eczane — Hastaya Satış / Teslim"
          aciklama="Zincirin son halkası. Ürünün hangi hastaya, hangi reçeteyle verildiği kayda geçer."
        >
          <Uyari cesit="uyari" baslik="KVKK — kişisel sağlık verisi">
            Hasta kimlik numarası <b>maskelenerek</b> saklanır (örn. 123******01); açık numara
            veritabanına hiç yazılmaz. Eşleştirme anahtarı reçete numarasıdır. Aydınlatma ve açık
            rıza yükümlülüğü eczanededir.
          </Uyari>

          <form onSubmit={gonder}>
            {hata && <Uyari cesit="hata" baslik="SATIŞ ENGELLENDİ">{hata}</Uyari>}

            {eczaneler.length === 0 ? (
              <Uyari cesit="uyari">Önce Sevkiyat ekranından bir eczane tanımlayın.</Uyari>
            ) : (
              <>
                <div className="mb-3">
                  <KarekodOkuyucu onOkundu={kodOkundu} etiket="Ürün Karekodunu Okut" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Alan etiket="Eczane *">
                    <Secim required value={aliciKod} onChange={(e) => setAliciKod(e.target.value)}>
                      <option value="">Seçiniz</option>
                      {eczaneler.map((a) => (
                        <option key={a.kod} value={a.kod}>{a.ad} — {a.il}</option>
                      ))}
                    </Secim>
                  </Alan>
                  <Alan etiket="Satış Tarihi *">
                    <Girdi type="date" required max={bugun()} value={tarih}
                      onChange={(e) => setTarih(e.target.value)} />
                  </Alan>
                  <Alan etiket="Reçete No *">
                    <Girdi required value={receteNo} onChange={(e) => setReceteNo(e.target.value)} />
                  </Alan>
                  <Alan etiket="Hasta Adı (baş harfler) *" ipucu="Örn. A.Y.">
                    <Girdi required value={hastaAd} onChange={(e) => setHastaAd(e.target.value)} />
                  </Alan>
                  <Alan etiket="Hasta TC *" ipucu="Doğrulanır, sonra maskelenerek saklanır">
                    <Girdi required inputMode="numeric" maxLength={11} value={hastaTc}
                      onChange={(e) => setHastaTc(e.target.value)} />
                  </Alan>
                  <Alan etiket="Reçeteyi Yazan Hekim">
                    <Girdi value={hekim} onChange={(e) => setHekim(e.target.value)} />
                  </Alan>
                </div>

                <div className="mt-3">
                  <Alan etiket="Tekil Karekod *" ipucu="Kamerayla okutun veya elle yazın">
                    <Girdi required value={uid} onChange={(e) => setUid(e.target.value)}
                      className="font-mono text-xs" placeholder="01…21…17…10…" />
                  </Alan>
                </div>

                <div className="mt-3 flex justify-end">
                  <Dugme type="submit" bekliyor={bekliyor}>Satışı Kaydet</Dugme>
                </div>
              </>
            )}
          </form>
        </Kart>
      )}

      <Kart baslik={`Satış Kayıtları (${sayfalama.toplam})`} sag={disaAktarabilir ? <DisaAktar tip="satis" /> : null}>
        <Filtre
          aramaIpucu="Satış no, reçete no, hasta, eczane, seri veya tekil no"
          toplam={sayfalama.toplam}
          ilk={sayfalama.ilk}
          son={sayfalama.son}
          sayfa={sayfalama.sayfa}
          toplamSayfa={sayfalama.toplamSayfa}
        />
        <Tablo basliklar={["Satış No", "Tarih", "Eczane", "Seri", "Tekil", "Hasta", "Reçete", "Hekim"]}>
          {satislar.length === 0 ? (
            <Bos sutun={8}>Bu filtreye uyan satış kaydı yok.</Bos>
          ) : (
            satislar.map((s) => (
              <Satir key={s.kod}>
                <Hucre className="font-mono text-xs font-bold">{s.kod}</Hucre>
                <Hucre className="whitespace-nowrap">{trTarih(s.tarih)}</Hucre>
                <Hucre>
                  {s.eczane_ad}
                  <span className="block text-xs text-slate-500">{s.eczane_il}</span>
                </Hucre>
                <Hucre className="font-mono text-xs">{s.seri ?? "—"}</Hucre>
                <Hucre className="font-mono text-xs">{s.tekil ?? "—"}</Hucre>
                <Hucre>
                  {s.hasta_ad}
                  <span className="block font-mono text-xs text-slate-500">{s.hasta_tc_maskeli}</span>
                </Hucre>
                <Hucre className="font-mono text-xs">{s.recete_no}</Hucre>
                <Hucre className="text-xs">{s.hekim ?? "—"}</Hucre>
              </Satir>
            ))
          )}
        </Tablo>
      </Kart>

      {bildirim.kutu}
    </>
  );
}
