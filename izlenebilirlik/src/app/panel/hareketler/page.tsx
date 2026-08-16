import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { filtreOku, filtreDerle, sayfaOzeti } from "@/lib/filtre";
import { HareketlerEkrani } from "@/components/HareketlerEkrani";

export const dynamic = "force-dynamic";

/**
 * DENETİM İZİ — loglar tablosunun tam görünümü.
 *
 * Panodaki "Son hareketler" bir özet; burası müfettişin oturduğu ekran:
 * arama, tarih aralığı ve sunucu taraflı sayfalama. Kayıtlar SİLİNMEZ ve
 * DEĞİŞTİRİLMEZ — ekran da buna uygun olarak salt okunur.
 */
export default async function HareketlerSayfasi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const k = await getSession();
  const hedef = ekranKoru(k, "hareketler");
  if (hedef) redirect(hedef);

  const sp = await searchParams;
  const filtre = filtreOku(sp);
  const d = filtreDerle(filtre, {
    aramaKolonlari: ["l.eylem", "l.kayit", "l.detay", "k.ad_soyad"],
    tarihKolonu: "l.tarih",
  });

  const db = await getDb();
  const TABLOLAR = "FROM loglar l LEFT JOIN kullanicilar k ON k.id = l.kullanici_id";

  const [kayitlar, sayim] = await Promise.all([
    db
      .prepare(
        `SELECT l.id, l.tarih, l.eylem, l.kayit, l.detay, l.ozet, k.ad_soyad
           ${TABLOLAR}
          WHERE ${d.kosul}
          ORDER BY l.id DESC
          LIMIT ? OFFSET ?`
      )
      .all(...d.parametreler, d.limit, d.offset),
    db.prepare(`SELECT COUNT(*) AS a ${TABLOLAR} WHERE ${d.kosul}`).get(...d.parametreler),
  ]);

  const toplam = Number(sayim?.a ?? 0);
  const { ilk, son, toplamSayfa } = sayfaOzeti(toplam, filtre);

  return (
    <HareketlerEkrani
      kayitlar={kayitlar}
      sayfalama={{ toplam, ilk, son, sayfa: filtre.sayfa, toplamSayfa }}
    />
  );
}
