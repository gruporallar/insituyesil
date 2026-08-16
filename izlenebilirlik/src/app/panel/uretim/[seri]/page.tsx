import { redirect, notFound } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili } from "@/lib/yetki";
import { getDb, ensureEkTablolar } from "@/lib/db";
import { adimlar } from "@/lib/proses";
import type { UrunTipi } from "@/lib/types";
import { SeriDosyasi } from "@/components/SeriDosyasi";

export const dynamic = "force-dynamic";

/**
 * SERİ DOSYASI — SOP-ÜR-16 md. 5.1.
 *
 * Bir serinin TÜM kaydı tek sayfada: girdi lotları ve çiftçileri, analizler,
 * proses içi kontroller, kütle denkliği, etiket mutabakatı, şahit numune,
 * sapmalar, imha tutanakları ve serbest bırakma kararı.
 *
 * Denetim gününde "şu serinin dosyasını görelim" talebi standarttır; ekran
 * ekran gezinmek hem yavaş hem eksik bırakma riski taşıyordu (bulgu B-05).
 * Sayfa yazdırılabilir — tarayıcıdan PDF olarak da kaydedilebilir.
 */
export default async function SeriDosyasiSayfasi({
  params,
}: {
  params: Promise<{ seri: string }>;
}) {
  const k = await getSession();
  const hedef = ekranKoru(k, "uretim");
  if (hedef) redirect(hedef);

  const { seri: seriHam } = await params;
  const seri = decodeURIComponent(seriHam);

  await ensureEkTablolar();
  const db = await getDb();

  const kayit = await db.prepare("SELECT * FROM seriler WHERE seri = ?").get(seri);
  if (!kayit) notFound();

  const [girdiler, prosesKayitlari, numuneler, mutabakat, sapmalar, imhalar, paketOzet] =
    await Promise.all([
      db
        .prepare(
          `SELECT sg.lot, sg.kg, h.teslim_tarihi, h.thc, h.cbd, h.analiz_rapor_no, h.analiz_tarihi,
                  h.lab, h.nem, c.kod AS ciftci_kod, c.ad AS ciftci_ad, c.izin_no, c.il, c.ilce, c.parsel
             FROM seri_girdileri sg
             LEFT JOIN hammadde h ON h.lot = sg.lot
             LEFT JOIN ciftciler c ON c.kod = h.ciftci_kod
            WHERE sg.seri = ? ORDER BY sg.lot`
        )
        .all(seri),
      db
        .prepare(
          `SELECT p.*, u.ad_soyad AS olusturan_ad
             FROM proses_kayitlari p
             LEFT JOIN kullanicilar u ON u.id = p.olusturan_id
            WHERE p.seri = ? ORDER BY p.adim_kod, p.id`
        )
        .all(seri),
      db
        .prepare(
          `SELECT *, CASE WHEN durum = 'SAKLANIYOR' AND saklama_sonu < date('now','+3 hours')
                          THEN 1 ELSE 0 END AS suresi_doldu
             FROM sahit_numuneler WHERE seri = ? ORDER BY kod`
        )
        .all(seri),
      db.prepare("SELECT * FROM etiket_mutabakat WHERE seri = ?").get(seri),
      db
        .prepare(
          `SELECT * FROM sapmalar
            WHERE (kaynak_tip = 'SERI' AND kaynak_kod = ?)
               OR (kaynak_tip = 'HAMMADDE' AND kaynak_kod IN
                     (SELECT lot FROM seri_girdileri WHERE seri = ?))
            ORDER BY durum = 'KAPALI', kod`
        )
        .all(seri, seri),
      db
        .prepare(
          `SELECT * FROM imha_kayitlari
            WHERE (tip IN ('URUN','FIRE') AND kaynak_kod = ?)
               OR (tip = 'HAMMADDE' AND kaynak_kod IN
                     (SELECT lot FROM seri_girdileri WHERE seri = ?))
            ORDER BY kod`
        )
        .all(seri, seri),
      db
        .prepare(
          `SELECT COUNT(*) AS toplam,
                  COUNT(CASE WHEN statu = 'SERBEST' THEN 1 END) AS depoda,
                  COUNT(CASE WHEN statu = 'SEVK' THEN 1 END) AS sevkte,
                  COUNT(CASE WHEN statu = 'SATILDI' THEN 1 END) AS satildi,
                  COUNT(CASE WHEN statu = 'RET' THEN 1 END) AS ret
             FROM paketler WHERE seri = ?`
        )
        .get(seri),
    ]);

  return (
    <SeriDosyasi
      seri={kayit}
      girdiler={girdiler}
      prosesKayitlari={prosesKayitlari}
      numuneler={numuneler}
      mutabakat={mutabakat}
      sapmalar={sapmalar}
      imhalar={imhalar}
      paketOzet={paketOzet}
      tanimliAdimlar={adimlar(kayit.urun_tipi as UrunTipi)}
      prosesYetkisi={eylemYetkili(k, "proses_yaz")}
      numuneYetkisi={eylemYetkili(k, "numune_yaz")}
      kullaniciAdi={k!.ad_soyad}
    />
  );
}
