import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili } from "@/lib/yetki";
import { getDb, ensureEkTablolar } from "@/lib/db";
import { AmbalajEkrani } from "@/components/AmbalajEkrani";

export const dynamic = "force-dynamic";

export default async function AmbalajSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ seri?: string }>;
}) {
  const k = await getSession();
  const hedef = ekranKoru(k, "ambalaj");
  if (hedef) redirect(hedef);

  const { seri } = await searchParams;
  await ensureEkTablolar();
  const db = await getDb();

  const [serbestSeriler, ambalajliSeriler, etiketler, mutabakatlar] = await Promise.all([
    db
      .prepare(
        `SELECT seri, urun_tipi, cikti_kg, ambalajlanan_g
           FROM seriler WHERE statu = 'SERBEST' ORDER BY seri DESC`
      )
      .all(),
    db
      .prepare(
        `SELECT p.seri, COUNT(*) AS adet, MAX(p.skt) AS skt, MAX(p.miktar_g) AS miktar_g
           FROM paketler p GROUP BY p.seri ORDER BY p.seri DESC`
      )
      .all(),
    seri
      ? db.prepare("SELECT uid, tekil, seri, miktar_g, skt, statu FROM paketler WHERE seri = ? ORDER BY tekil").all(seri)
      : Promise.resolve([]),
    db
      .prepare(
        `SELECT m.*, u.ad_soyad AS olusturan_ad
           FROM etiket_mutabakat m
           LEFT JOIN kullanicilar u ON u.id = m.olusturan_id
          ORDER BY m.seri DESC`
      )
      .all(),
  ]);

  return (
    <AmbalajEkrani
      serbestSeriler={serbestSeriler}
      ambalajliSeriler={ambalajliSeriler}
      etiketler={etiketler}
      mutabakatlar={mutabakatlar}
      seciliSeri={seri ?? ""}
      yazabilir={eylemYetkili(k, "ambalajla")}
      mutabakatYetkisi={eylemYetkili(k, "mutabakat_yaz")}
      kullaniciAdi={k!.ad_soyad}
    />
  );
}
