import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili } from "@/lib/yetki";
import { getDb } from "@/lib/db";
import { filtreOku, filtreDerle, sayfaOzeti } from "@/lib/filtre";
import { SatisEkrani } from "@/components/SatisEkrani";

export const dynamic = "force-dynamic";

/**
 * Satış kayıtları — sistemin EN HIZLI BÜYÜYEN listesi.
 *
 * Yıllık ~25.000 satır bekleniyor (100 kg/gün kapasite, 4 batch). Tamamını tek
 * seferde yüklemek ekranı kullanılamaz hale getirirdi; filtre ve sayfalama
 * burada zorunlu (bulgu B-11).
 */
export default async function SatisSayfasi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const k = await getSession();
  const hedef = ekranKoru(k, "satis");
  if (hedef) redirect(hedef);

  const sp = await searchParams;
  const filtre = filtreOku(sp);
  const d = filtreDerle(filtre, {
    aramaKolonlari: ["s.kod", "s.recete_no", "s.hasta_ad", "a.ad", "p.tekil", "p.seri"],
    tarihKolonu: "s.tarih",
  });

  const db = await getDb();
  const TABLOLAR = `FROM satislar s
       LEFT JOIN aliciar a ON a.kod = s.alici_kod
       LEFT JOIN paketler p ON p.uid = s.paket_uid`;

  const [eczaneler, satislar, sayim] = await Promise.all([
    db.prepare("SELECT kod, ad, il FROM aliciar WHERE tip = 'ECZANE' ORDER BY ad").all(),
    db
      .prepare(
        `SELECT s.*, a.ad AS eczane_ad, a.il AS eczane_il, p.seri, p.tekil
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
    <SatisEkrani
      eczaneler={eczaneler}
      satislar={satislar}
      yazabilir={eylemYetkili(k, "satis_yaz")}
      sayfalama={{ toplam, ilk, son, sayfa: filtre.sayfa, toplamSayfa }}
    />
  );
}
