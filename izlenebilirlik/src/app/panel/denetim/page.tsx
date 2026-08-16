import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { denetimTaramaVerisi } from "@/lib/veri";
import { onDenetim } from "@/lib/denetim";
import { trBugun } from "@/lib/db";
import { DenetimEkrani } from "@/components/DenetimEkrani";

export const dynamic = "force-dynamic";

export default async function DenetimSayfasi() {
  const k = await getSession();
  const hedef = ekranKoru(k, "denetim");
  if (hedef) redirect(hedef);

  const bugun = trBugun();
  const veri = await denetimTaramaVerisi();
  const sonuc = onDenetim(veri, bugun);

  return <DenetimEkrani sonuc={sonuc} tarama={bugun} />;
}
