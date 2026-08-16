import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { trBugun } from "@/lib/db";
import { denetimTaramaVerisi } from "@/lib/veri";
import { onDenetim } from "@/lib/denetim";
import { Kart, Sayac } from "@/components/Arayuz";

export const dynamic = "force-dynamic";

const ONEM: Record<string, number> = { KRITIK: 0, YUKSEK: 1, ORTA: 2, BILGI: 3 };
const RENK: Record<string, string> = {
  KRITIK: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  YUKSEK: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  ORTA: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  BILGI: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

/**
 * Yönetim için tek ekranlık durum özeti. Operasyon panosundan farklı olarak
 * işlem düğmesi veya ayrıntılı hasta/tedarikçi kaydı içermez; karar gerektiren
 * kalite riski, açık iş ve ürün akışı birlikte gösterilir.
 */
export default async function OzetSayfasi() {
  const k = await getSession();
  const hedef = ekranKoru(k, "ozet");
  if (hedef) redirect(hedef);

  const bugun = trBugun();
  const veri = await denetimTaramaVerisi();
  const sonuc = onDenetim(veri, bugun);
  const acikSapmalar = veri.sapmalar.filter((s: any) => s.durum === "ACIK");
  const gecikmisSapmalar = acikSapmalar.filter((s: any) => s.termin && s.termin < bugun);
  const karantinaLot = veri.hammadde.filter((h: any) => h.statu === "KARANTINA").length;
  const karantinaSeri = veri.seriler.filter((s: any) => s.statu === "KARANTINA").length;
  const piyasadakiBirim = veri.paketler.filter((p: any) => p.statu === "SEVK" || p.statu === "SATILDI").length;
  const oncelikli = [...sonuc.bulgular]
    .sort((a, b) => ONEM[a.seviye] - ONEM[b.seviye])
    .slice(0, 8);

  return (
    <>
      <div className={`mb-4 rounded-xl border px-4 py-3 ${
        sonuc.hazir
          ? "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200"
          : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
      }`}>
        <p className="font-semibold">{sonuc.hukum}</p>
        <p className="mt-1 text-xs opacity-80">Kayıt tarama tarihi: {bugun}. Bu ekran fiziksel saha ve doküman arşivi incelemesinin yerine geçmez.</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Sayac etiket="Kritik bulgu" deger={sonuc.sayim.KRITIK} alt="ön denetim" />
        <Sayac etiket="Açık sapma" deger={acikSapmalar.length} alt={gecikmisSapmalar.length ? `${gecikmisSapmalar.length} gecikmiş` : "gecikmiş yok"} />
        <Sayac etiket="Karantina" deger={karantinaLot + karantinaSeri} alt={`${karantinaLot} lot · ${karantinaSeri} seri`} />
        <Sayac etiket="Piyasadaki birim" deger={piyasadakiBirim} alt="sevk edilmiş veya teslim" />
      </div>

      <Kart
        baslik="Yönetimin öncelikli gündemi"
        aciklama="En ağır bulgular önce; ayrıntı ve düzeltici işlem ilgili kayıt ekranındadır."
        sag={<Link href="/panel/denetim" className="text-sm font-semibold text-green-700 underline dark:text-green-400">Raporun tamamı</Link>}
      >
        {oncelikli.length === 0 ? (
          <p className="text-sm text-green-700 dark:text-green-400">Sistem kayıtlarında açık denetim bulgusu yok.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {oncelikli.map((b) => (
              <li key={b.kod} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${RENK[b.seviye]}`}>{b.seviye}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold"><span className="font-mono text-xs text-slate-400">{b.kod}</span> {b.baslik}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{b.detay}</p>
                </div>
                {b.yol && <Link href={b.yol} className="text-xs font-semibold text-green-700 underline dark:text-green-400">Kayda git</Link>}
              </li>
            ))}
          </ul>
        )}
      </Kart>
    </>
  );
}
