import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili } from "@/lib/yetki";
import { getDb } from "@/lib/db";
import { filtreOku, filtreDerle, sayfaOzeti } from "@/lib/filtre";
import { SevkiyatEkrani } from "@/components/SevkiyatEkrani";

export const dynamic = "force-dynamic";

export default async function SevkiyatSayfasi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const k = await getSession();
  const hedef = ekranKoru(k, "sevkiyat");
  if (hedef) redirect(hedef);

  const sp = await searchParams;
  const filtre = filtreOku(sp);
  const d = filtreDerle(filtre, {
    aramaKolonlari: ["s.kod", "s.muhur_no", "s.irsaliye", "s.tasiyici", "a.ad"],
    tarihKolonu: "s.tarih",
  });

  const db = await getDb();
  const TABLOLAR = "FROM sevkiyatlar s LEFT JOIN aliciar a ON a.kod = s.alici_kod";

  const [aliciar, sevkiyatlar, sayim] = await Promise.all([
    db.prepare("SELECT * FROM aliciar ORDER BY tip, ad").all(),
    db
      .prepare(
        `SELECT s.*, a.ad AS alici_ad, a.tip AS alici_tip, a.il AS alici_il,
                COALESCE(s.adet, (SELECT COUNT(*) FROM paketler p WHERE p.sevk_kod = s.kod)) AS adet
           ${TABLOLAR}
          WHERE ${d.kosul}
          ORDER BY s.kod DESC
          LIMIT ? OFFSET ?`
      )
      .all(...d.parametreler, d.limit, d.offset),
    db.prepare(`SELECT COUNT(*) AS a ${TABLOLAR} WHERE ${d.kosul}`).get(...d.parametreler),
  ]);

  const toplam = Number(sayim?.a ?? 0);
  const { ilk, son, toplamSayfa } = sayfaOzeti(toplam, filtre);

  return (
    <SevkiyatEkrani
      aliciar={aliciar}
      sevkiyatlar={sevkiyatlar}
      aliciYetkisi={eylemYetkili(k, "alici_yaz")}
      sevkYetkisi={eylemYetkili(k, "sevk_yaz")}
      // Hızlı İşlem ekranından "Sevkiyata Ekle" ile gelinmişse birim listede
      // hazır olsun — operatör aynı kutuyu ikinci kez okutmasın.
      ilkKod={typeof sp.kod === "string" ? sp.kod : ""}
      sayfalama={{ toplam, ilk, son, sayfa: filtre.sayfa, toplamSayfa }}
    />
  );
}
