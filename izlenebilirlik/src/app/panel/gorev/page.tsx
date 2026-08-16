import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { getDb, trBugun } from "@/lib/db";
import { eylemYetkili } from "@/lib/yetki";
import { gorevleriUret } from "@/lib/gorevUret";
import { geriSayim, uyumOzeti, vadeDurumu, varsayilanUyariGun, type GorevDurumu, type Periyot } from "@/lib/gorev";
import { sablonTanimliMi } from "@/lib/formSablon";
import { GorevEkrani } from "@/components/GorevEkrani";

export const dynamic = "force-dynamic";

/**
 * GÖREV TAKVİMİ.
 *
 * Görev üretimi SAYFA AÇILIŞINDA çalışıyor (Vercel'de zamanlanmış iş yok).
 * Üretim tekrarlanabilir: UNIQUE(kural_kod, donem) + INSERT OR IGNORE.
 *
 * KENDİ İŞİ ÖNCE. Liste varsayılan olarak kullanıcının ROLÜNE ait görevleri
 * gösteriyor: sahadaki operatör 120 kuralın tamamını değil, kendi bugününü
 * görmeli. "Tümü" seçeneği duruyor ama varsayılan değil — periyodik görevin
 * en büyük düşmanı, içinde kaybolunan uzun liste.
 */
export default async function GorevSayfasi() {
  const k = await getSession();
  const hedef = ekranKoru(k, "gorev");
  if (hedef) redirect(hedef);

  const bugun = trBugun();
  await gorevleriUret(bugun);

  const db = await getDb();
  const [gorevler, sureliler, kurallar, baskilar] = await db.topluOku([
    `SELECT g.kod, g.donem, g.vade, g.durum, g.arsiv_tarih, g.arsiv_yeri,
            k.kod AS kural_kod, k.faaliyet, k.dokuman_kod, k.madde, k.periyot,
            k.sorumlu_rol, k.form_kod, k.alan_kod
       FROM gorevler g JOIN gorev_kurallari k ON k.kod = g.kural_kod
      WHERE g.durum != 'IPTAL'
      ORDER BY g.vade DESC LIMIT 400`,
    `SELECT kod, tip, konu, kaynak_kod, baslangic, sure_gun, dayanak
       FROM sureli_kayitlar WHERE durum = 'ACIK' ORDER BY baslangic`,
    `SELECT durum, COUNT(*) AS a FROM gorev_kurallari GROUP BY durum`,
    `SELECT gorev_kod, seri_no, form_kod, yeniden_basim FROM form_baskilari`,
  ]);

  const baskiHaritasi = new Map<string, string[]>();
  for (const b of baskilar as any[]) {
    const l = baskiHaritasi.get(String(b.gorev_kod)) ?? [];
    l.push(String(b.seri_no));
    baskiHaritasi.set(String(b.gorev_kod), l);
  }

  const satirlar = (gorevler as any[]).map((g) => ({
    kod: String(g.kod),
    donem: String(g.donem),
    vade: String(g.vade),
    durum: String(g.durum) as GorevDurumu,
    arsivYeri: g.arsiv_yeri ? String(g.arsiv_yeri) : null,
    faaliyet: String(g.faaliyet),
    dayanak: `${g.dokuman_kod}${g.madde ? ` md. ${g.madde}` : ""}`,
    periyot: String(g.periyot) as Periyot,
    sorumluRol: String(g.sorumlu_rol),
    formKod: g.form_kod ? String(g.form_kod) : null,
    formHazir: sablonTanimliMi(g.form_kod),
    alanKod: g.alan_kod ? String(g.alan_kod) : null,
    vadeDurumu: vadeDurumu(String(g.vade), String(g.durum) as GorevDurumu, bugun),
    seriler: baskiHaritasi.get(String(g.kod)) ?? [],
  }));

  const sayimlar = Object.fromEntries(
    (kurallar as any[]).map((r) => [String(r.durum), Number(r.a)])
  ) as Record<string, number>;

  return (
    <GorevEkrani
      rol={k!.rol}
      islemYetkisi={eylemYetkili(k, "gorev_islem")}
      gorevler={satirlar}
      uyum={uyumOzeti(
        (gorevler as any[]).map((g) => ({
          kod: String(g.kod), vade: String(g.vade),
          durum: String(g.durum) as GorevDurumu,
          arsiv_tarih: g.arsiv_tarih ? String(g.arsiv_tarih) : null,
        })),
        bugun
      )}
      geriSayimlar={(sureliler as any[]).map((s) => {
        const gs = geriSayim(
          String(s.baslangic), Number(s.sure_gun), bugun,
          varsayilanUyariGun(Number(s.sure_gun))
        );
        return {
          kod: String(s.kod), tip: String(s.tip), konu: String(s.konu),
          kaynakKod: s.kaynak_kod ? String(s.kaynak_kod) : null,
          dayanak: s.dayanak ? String(s.dayanak) : null,
          sureGun: Number(s.sure_gun), ...gs,
        };
      })}
      kuralSayim={{
        onayli: sayimlar.ONAYLI ?? 0,
        taslak: sayimlar.TASLAK ?? 0,
        pasif: sayimlar.PASIF ?? 0,
      }}
    />
  );
}
