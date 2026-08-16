import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili } from "@/lib/yetki";
import { getDb } from "@/lib/db";
import { filtreOku, filtreDerle, sayfaOzeti } from "@/lib/filtre";
import { HamMaddeEkrani } from "@/components/HamMaddeEkrani";

export const dynamic = "force-dynamic";

export default async function HamMaddeSayfasi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const k = await getSession();
  const hedef = ekranKoru(k, "hammadde");
  if (hedef) redirect(hedef);

  const sp = await searchParams;
  const filtre = filtreOku(sp);
  const d = filtreDerle(filtre, {
    aramaKolonlari: ["h.lot", "h.irsaliye", "h.analiz_rapor_no", "c.ad"],
    tarihKolonu: "h.teslim_tarihi",
    statuKolonu: "h.statu",
  });

  const db = await getDb();
  const TABLOLAR = "FROM hammadde h LEFT JOIN ciftciler c ON c.kod = h.ciftci_kod";

  const [lotlar, ciftciler, sayim, karantinaHepsi] = await Promise.all([
    db
      .prepare(
        `SELECT h.*, c.ad AS ciftci_ad ${TABLOLAR}
          WHERE ${d.kosul} ORDER BY h.lot DESC LIMIT ? OFFSET ?`
      )
      .all(...d.parametreler, d.limit, d.offset),
    db.prepare("SELECT kod, ad, il FROM ciftciler ORDER BY ad").all(),
    db.prepare(`SELECT COUNT(*) AS a ${TABLOLAR} WHERE ${d.kosul}`).get(...d.parametreler),
    // ANALİZ FORMU FİLTREDEN ETKİLENMEZ. Filtre listeyi daraltmak için;
    // karar bekleyen lotların formda görünmemesi iş akışını kırardı.
    db
      .prepare(
        `SELECT h.lot, h.miktar_kg, c.ad AS ciftci_ad ${TABLOLAR}
          WHERE h.statu = 'KARANTINA' ORDER BY h.lot`
      )
      .all(),
  ]);

  const toplam = Number(sayim?.a ?? 0);
  const { ilk, son, toplamSayfa } = sayfaOzeti(toplam, filtre);

  return (
    <HamMaddeEkrani
      lotlar={lotlar}
      ciftciler={ciftciler}
      kabulYetkisi={eylemYetkili(k, "hammadde_kabul")}
      analizYetkisi={eylemYetkili(k, "analiz_karar")}
      disaAktarabilir={eylemYetkili(k, "disa_aktar")}
      karantinaHepsi={karantinaHepsi}
      sayfalama={{ toplam, ilk, son, sayfa: filtre.sayfa, toplamSayfa }}
    />
  );
}
