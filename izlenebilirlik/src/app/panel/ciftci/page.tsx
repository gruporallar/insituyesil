import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili } from "@/lib/yetki";
import { getDb } from "@/lib/db";
import { CiftciEkrani } from "@/components/CiftciEkrani";

export const dynamic = "force-dynamic";

export default async function CiftciSayfasi() {
  const k = await getSession();
  const hedef = ekranKoru(k, "ciftci");
  if (hedef) redirect(hedef);

  const db = await getDb();
  const kayitlar = await db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM hammadde h WHERE h.ciftci_kod = c.kod) AS teslimat_sayisi,
              (SELECT COALESCE(SUM(h.miktar_kg),0) FROM hammadde h WHERE h.ciftci_kod = c.kod) AS toplam_kg
         FROM ciftciler c ORDER BY c.kod`
    )
    .all();

  return <CiftciEkrani kayitlar={kayitlar} yazabilir={eylemYetkili(k, "ciftci_yaz")} disaAktarabilir={eylemYetkili(k, "disa_aktar")} />;
}
