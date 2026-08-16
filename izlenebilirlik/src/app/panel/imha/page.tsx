import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili } from "@/lib/yetki";
import { getDb, ensureEkTablolar } from "@/lib/db";
import { ImhaEkrani } from "@/components/ImhaEkrani";

export const dynamic = "force-dynamic";

/** İmha bekleyenler kuyruğu — API ucundaki sorgunun aynısı (bkz. /api/imha). */
const BEKLEYEN_SORGU = `
  SELECT 'HAMMADDE' AS tip, h.lot AS kaynak_kod, h.kalan_kg AS miktar_kg,
         COALESCE(h.ret_nedeni, 'Reddedilmiş lot') AS gerekce, c.ad AS ilgili
    FROM hammadde h
    LEFT JOIN ciftciler c ON c.kod = h.ciftci_kod
    LEFT JOIN imha_kayitlari i ON i.tip = 'HAMMADDE' AND i.kaynak_kod = h.lot
   WHERE h.statu = 'RET' AND h.kalan_kg > 0.0001 AND i.kod IS NULL
  UNION ALL
  SELECT 'URUN', s.seri, s.cikti_kg, COALESCE(s.ret_nedeni, 'Reddedilmiş seri'), s.urun_tipi
    FROM seriler s
    LEFT JOIN imha_kayitlari i ON i.tip = 'URUN' AND i.kaynak_kod = s.seri
   WHERE s.statu = 'RET' AND s.cikti_kg > 0.0001 AND i.kod IS NULL
  UNION ALL
  SELECT 'FIRE', s.seri, s.fire_kg,
         'Proses firesi (posa / filtre keki / baş-kuyruk-dip)', s.urun_tipi
    FROM seriler s
    LEFT JOIN imha_kayitlari i ON i.tip = 'FIRE' AND i.kaynak_kod = s.seri
   WHERE s.fire_kg > 0.0001 AND i.kod IS NULL
  ORDER BY tip, kaynak_kod`;

export default async function ImhaSayfasi() {
  const k = await getSession();
  const hedef = ekranKoru(k, "imha");
  if (hedef) redirect(hedef);

  await ensureEkTablolar();
  const db = await getDb();

  const [bekleyen, kayitlar] = await Promise.all([
    db.prepare(BEKLEYEN_SORGU).all(),
    db
      .prepare(
        `SELECT i.*, u.ad_soyad AS olusturan_ad
           FROM imha_kayitlari i
           LEFT JOIN kullanicilar u ON u.id = i.olusturan_id
          ORDER BY i.kod DESC`
      )
      .all(),
  ]);

  return (
    <ImhaEkrani
      bekleyen={bekleyen}
      kayitlar={kayitlar}
      yazabilir={eylemYetkili(k, "imha_yaz")}
      kullaniciAdi={k!.ad_soyad}
    />
  );
}
