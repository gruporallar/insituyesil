import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { ROL_ETIKETLERI } from "@/lib/types";
import { SifreEkrani } from "@/components/SifreEkrani";

export const dynamic = "force-dynamic";

export default async function SifreSayfasi() {
  const k = await getSession();
  const hedef = ekranKoru(k, "sifre");
  if (hedef) redirect(hedef);

  return (
    <SifreEkrani
      kullanici={{ ad: k!.ad_soyad, email: k!.email, rol: ROL_ETIKETLERI[k!.rol] }}
    />
  );
}
