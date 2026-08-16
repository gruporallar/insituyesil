import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ilkGorunurEkran } from "@/lib/yetki";
import { GirisFormu } from "@/components/GirisFormu";

export default async function GirisSayfasi() {
  const k = await getSession();
  if (k) redirect(ilkGorunurEkran(k));

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-700 text-2xl font-bold text-white">
            İY
          </div>
          <h1 className="text-lg font-bold tracking-tight">İzlenebilirlik Sistemi</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            İnsitu Yeşil Teknolojiler A.Ş.
          </p>
        </div>
        <GirisFormu />
        <p className="mt-6 text-center text-xs text-slate-400">
          Tarladan hastaya kapalı zincir ürün takip sistemi
        </p>
      </div>
    </main>
  );
}
