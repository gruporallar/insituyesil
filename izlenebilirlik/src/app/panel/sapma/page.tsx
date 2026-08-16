import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili } from "@/lib/yetki";
import { getDb, ensureEkTablolar } from "@/lib/db";
import { SapmaEkrani } from "@/components/SapmaEkrani";

export const dynamic = "force-dynamic";

export default async function SapmaSayfasi() {
  const k = await getSession();
  const hedef = ekranKoru(k, "sapma");
  if (hedef) redirect(hedef);

  await ensureEkTablolar();
  const db = await getDb();

  const [kayitlar, lotlar, seriler] = await Promise.all([
    db
      .prepare(
        `SELECT s.*, a.ad_soyad AS acan_ad, kp.ad_soyad AS kapatan_ad,
                ed.ad_soyad AS etkinlik_dogrulayan_ad
           FROM sapmalar s
           LEFT JOIN kullanicilar a ON a.id = s.acan_id
           LEFT JOIN kullanicilar kp ON kp.id = s.kapatan_id
           LEFT JOIN kullanicilar ed ON ed.id = s.etkinlik_dogrulayan_id
          ORDER BY s.durum = 'KAPALI', s.kod DESC`
      )
      .all(),
    db.prepare("SELECT lot FROM hammadde ORDER BY lot DESC").all(),
    db.prepare("SELECT seri FROM seriler ORDER BY seri DESC").all(),
  ]);

  return (
    <SapmaEkrani
      kayitlar={kayitlar}
      lotlar={lotlar.map((x: any) => x.lot)}
      seriler={seriler.map((x: any) => x.seri)}
      acabilir={eylemYetkili(k, "sapma_ac")}
      kapatabilir={eylemYetkili(k, "sapma_kapat")}
      disaAktarabilir={eylemYetkili(k, "disa_aktar")}
    />
  );
}
