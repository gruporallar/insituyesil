import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili } from "@/lib/yetki";
import { getDb } from "@/lib/db";
import { ButsEkrani } from "@/components/ButsEkrani";

export const dynamic = "force-dynamic";

export default async function ButsSayfasi() {
  const k = await getSession();
  const hedef = ekranKoru(k, "buts");
  if (hedef) redirect(hedef);

  const db = await getDb();
  const [kayitlar, ozet] = await Promise.all([
    db
      .prepare(
        `SELECT b.*, k.ad_soyad AS gonderen_ad
           FROM buts_kuyruk b LEFT JOIN kullanicilar k ON k.id = b.gonderen_id
          ORDER BY b.zaman DESC, b.kod DESC LIMIT 300`
      )
      .all(),
    db
      .prepare(
        `SELECT COUNT(CASE WHEN durum = 'BEKLIYOR' THEN 1 END) AS bekleyen,
                COUNT(CASE WHEN durum = 'GONDERILDI' THEN 1 END) AS gonderilen
           FROM buts_kuyruk`
      )
      .get(),
  ]);

  return (
    <ButsEkrani kayitlar={kayitlar} ozet={ozet} isaretleyebilir={eylemYetkili(k, "buts_isaretle")} />
  );
}
