import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili } from "@/lib/yetki";
import { getDb } from "@/lib/db";
import { GeriCekmeEkrani } from "@/components/GeriCekmeEkrani";

export const dynamic = "force-dynamic";

export default async function GeriCekmeSayfasi() {
  const k = await getSession();
  const hedef = ekranKoru(k, "gericekme");
  if (hedef) redirect(hedef);

  const db = await getDb();
  const [lotlar, seriler] = await Promise.all([
    db.prepare("SELECT lot FROM hammadde ORDER BY lot DESC").all(),
    db.prepare("SELECT seri, urun_tipi FROM seriler ORDER BY seri DESC").all(),
  ]);

  return (
    <GeriCekmeEkrani
      lotlar={lotlar}
      seriler={seriler}
      baslatabilir={eylemYetkili(k, "gericekme_baslat")}
    />
  );
}
