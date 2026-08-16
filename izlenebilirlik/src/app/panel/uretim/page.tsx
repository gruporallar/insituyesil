import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili } from "@/lib/yetki";
import { getDb } from "@/lib/db";
import { filtreOku, filtreDerle, sayfaOzeti } from "@/lib/filtre";
import { UretimEkrani } from "@/components/UretimEkrani";

export const dynamic = "force-dynamic";

export default async function UretimSayfasi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const k = await getSession();
  const hedef = ekranKoru(k, "uretim");
  if (hedef) redirect(hedef);

  const sp = await searchParams;
  const filtre = filtreOku(sp);
  const d = filtreDerle(filtre, {
    aramaKolonlari: ["seri", "sorumlu", "serbest_kisi"],
    tarihKolonu: "uretim_tarihi",
    statuKolonu: "statu",
  });

  const db = await getDb();
  const [seriler, uygunLotlar, sayim, acikSeriler] = await Promise.all([
    db
      .prepare(`SELECT * FROM seriler WHERE ${d.kosul} ORDER BY seri DESC LIMIT ? OFFSET ?`)
      .all(...d.parametreler, d.limit, d.offset),
    db
      .prepare(
        `SELECT h.lot, h.kalan_kg, h.thc, c.ad AS ciftci_ad
           FROM hammadde h LEFT JOIN ciftciler c ON c.kod = h.ciftci_kod
          WHERE h.statu = 'SERBEST' AND h.kalan_kg > 0.001
          ORDER BY h.lot`
      )
      .all(),
    db.prepare(`SELECT COUNT(*) AS a FROM seriler WHERE ${d.kosul}`).get(...d.parametreler),
    // Serbest bırakma formu FİLTREDEN ETKİLENMEZ — karar bekleyen seriler
    // her zaman görünmeli.
    db
      .prepare("SELECT seri, urun_tipi, girdi_kg FROM seriler WHERE statu = 'KARANTINA' ORDER BY seri")
      .all(),
  ]);

  const toplam = Number(sayim?.a ?? 0);
  const { ilk, son, toplamSayfa } = sayfaOzeti(toplam, filtre);

  return (
    <UretimEkrani
      seriler={seriler}
      uygunLotlar={uygunLotlar}
      acmaYetkisi={eylemYetkili(k, "seri_ac")}
      serbestYetkisi={eylemYetkili(k, "seri_serbest")}
      kullaniciAdi={k!.ad_soyad}
      acikSeriler={acikSeriler}
      sayfalama={{ toplam, ilk, son, sayfa: filtre.sayfa, toplamSayfa }}
    />
  );
}
