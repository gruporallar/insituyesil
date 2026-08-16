import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili } from "@/lib/yetki";
import { getDb, ensureEkTablolar } from "@/lib/db";
import { IadeEkrani } from "@/components/IadeEkrani";

export const dynamic = "force-dynamic";

export default async function IadeSayfasi() {
  const k = await getSession();
  const hedef = ekranKoru(k, "iade");
  if (hedef) redirect(hedef);

  await ensureEkTablolar();
  const db = await getDb();

  const [iadeler, sikayetler] = await Promise.all([
    db
      .prepare(
        `SELECT i.*, a.ad AS alici_ad, p.tekil, p.miktar_g, p.skt,
                u.ad_soyad AS olusturan_ad, kv.ad_soyad AS karar_veren_ad
           FROM iadeler i
           LEFT JOIN paketler p ON p.uid = i.paket_uid
           LEFT JOIN aliciar a ON a.kod = i.alici_kod
           LEFT JOIN kullanicilar u ON u.id = i.olusturan_id
           LEFT JOIN kullanicilar kv ON kv.id = i.karar_veren_id
          ORDER BY i.karar != 'BEKLIYOR', i.kod DESC`
      )
      .all(),
    db
      .prepare(
        `SELECT s.*, p.tekil, u.ad_soyad AS olusturan_ad, kp.ad_soyad AS kapatan_ad
           FROM sikayetler s
           LEFT JOIN paketler p ON p.uid = s.paket_uid
           LEFT JOIN kullanicilar u ON u.id = s.olusturan_id
           LEFT JOIN kullanicilar kp ON kp.id = s.kapatan_id
          ORDER BY s.sonuc != 'ACIK', s.kod DESC`
      )
      .all(),
  ]);

  return (
    <IadeEkrani
      iadeler={iadeler}
      sikayetler={sikayetler}
      iadeYetkisi={eylemYetkili(k, "iade_yaz")}
      kararYetkisi={eylemYetkili(k, "iade_karar")}
      sikayetYetkisi={eylemYetkili(k, "sikayet_yaz")}
      kapatmaYetkisi={eylemYetkili(k, "sikayet_kapat")}
      kullaniciAdi={k!.ad_soyad}
    />
  );
}
