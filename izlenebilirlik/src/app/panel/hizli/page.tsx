import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { HizliEkrani } from "@/components/HizliEkrani";

export const dynamic = "force-dynamic";

export default async function HizliSayfasi() {
  const k = await getSession();
  // Ekran yalnızca TANIMA yapıyor; gösterdiği her eylem zaten hedef ekranın
  // kendi yetkisiyle korunuyor. Yine de kendi ekran kaydı var — menüde
  // görünebilmesi ve kişi bazında kapatılabilmesi için.
  const hedef = ekranKoru(k, "hizli");
  if (hedef) redirect(hedef);

  return <HizliEkrani />;
}
