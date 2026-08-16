import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { izlemeSorgula } from "@/lib/izlemeSorgu";
import { IzlemeEkrani } from "@/components/IzlemeEkrani";

export const dynamic = "force-dynamic";

export default async function IzlemeSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sorgu?: string }>;
}) {
  const k = await getSession();
  const hedef = ekranKoru(k, "izleme");
  if (hedef) redirect(hedef);

  // `sorgu` da kabul ediliyor: Hızlı İşlem bir süre bu adla bağlantı üretti
  // ve o bağlantılar yer imlerinde/geçmişte yaşamaya devam ediyor.
  const sp = await searchParams;
  const q = sp.q ?? sp.sorgu;
  // İLK SONUÇ SUNUCUDA ÜRETİLİYOR. Tablolardaki "İzle" bağlantısı `?q=` ile
  // geliyor; sonucu istemcide `useEffect` ile çekmek hem fazladan bir
  // gidiş-dönüş hem de boş bir ara ekran demekti.
  const ilkSonuc = q ? await izlemeSorgula(q) : null;

  return <IzlemeEkrani ilkSorgu={q ?? ""} ilkSonuc={ilkSonuc} />;
}
