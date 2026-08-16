import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili, EKRAN_ETIKETLERI, EYLEM_ETIKETLERI } from "@/lib/yetki";
import { getDb, ensureEkTablolar } from "@/lib/db";
import { rolTablosu, sapmaHaritasi } from "@/lib/rolTablosu";
import { RollerEkrani } from "@/components/RollerEkrani";

export const dynamic = "force-dynamic";

export default async function RollerSayfasi() {
  const k = await getSession();
  const hedef = ekranKoru(k, "roller");
  if (hedef) redirect(hedef);
  // Ekran yetkisi tek başına yetmez — düzenleme EYLEM yetkisi ayrı.
  if (!eylemYetkili(k, "rol_yonet")) redirect("/panel");

  await ensureEkTablolar();
  const db = await getDb();
  const kayitlar = await db.prepare("SELECT rol, tur, anahtar, izin FROM rol_yetkileri").all();

  return (
    <RollerEkrani
      tablo={rolTablosu(sapmaHaritasi(kayitlar as any[]))}
      ekranEtiketleri={EKRAN_ETIKETLERI}
      eylemEtiketleri={EYLEM_ETIKETLERI}
    />
  );
}
