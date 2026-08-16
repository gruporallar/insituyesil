import { redirect, notFound } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { getDb, trBugun } from "@/lib/db";
import { sayiTr } from "@/lib/bicim";
import { PERIYOTLAR, type Periyot } from "@/lib/gorev";
import { sablonBul } from "@/lib/formSablon";
import { ROL_ETIKETLERI } from "@/lib/types";
import type { Rol } from "@/lib/types";
import { FormBaskisi } from "@/components/FormBaskisi";

export const dynamic = "force-dynamic";

/** Ay adları — dosya `bicim.ts`'e girmedi, yalnızca burada kullanılıyor. */
const AYLAR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/**
 * ÖN DOLU FORM BASKISI.
 *
 * Sistemin bildiği HER SABİT önceden yazılıyor: form kodu ve versiyonu, alan
 * kodu, hedef aralık, sorumlu unvanı, kayıt saklama süresi ve — asıl kolaylık —
 * mevcut stok. Sahada kalemle yazılacak tek şey ÖLÇÜLEN DEĞER kalıyor.
 *
 * BASKI SERİ NUMARASI SAYFADA GÖRÜNÜR. Kâğıdın üstünde numara yoksa kaç nüsha
 * dolaştığı bilinemez; bilinmiyorsa dolaşan nüshanın sahte olmadığı da bilinemez.
 */
export default async function YazdirSayfasi({
  params, searchParams,
}: {
  params: Promise<{ kod: string }>;
  searchParams: Promise<{ seri?: string }>;
}) {
  const k = await getSession();
  const hedef = ekranKoru(k, "gorev");
  if (hedef) redirect(hedef);

  const { kod } = await params;
  const { seri } = await searchParams;
  const db = await getDb();

  const g = (await db
    .prepare(
      `SELECT g.kod, g.donem, g.vade, g.durum,
              r.faaliyet, r.dokuman_kod, r.madde, r.periyot, r.sorumlu_rol,
              r.form_kod, r.saklama, r.alan_kod
         FROM gorevler g JOIN gorev_kurallari r ON r.kod = g.kural_kod
        WHERE g.kod = ?`
    )
    .get(kod)) as any;
  if (!g) notFound();

  const sablon = sablonBul(g.form_kod);
  const periyot = String(g.periyot) as Periyot;

  // ── Baskı kütüğü ──────────────────────────────────────────────────────────
  const baski = seri
    ? ((await db
        .prepare("SELECT seri_no, basan_ad, basim_tarihi, yeniden_basim FROM form_baskilari WHERE seri_no = ? AND gorev_kod = ?")
        .get(seri, kod)) as any)
    : ((await db
        .prepare("SELECT seri_no, basan_ad, basim_tarihi, yeniden_basim FROM form_baskilari WHERE gorev_kod = ? ORDER BY basim_tarihi DESC LIMIT 1")
        .get(kod)) as any);

  // ── Şablona göre dinamik değerler ────────────────────────────────────────
  const deger: Record<string, string> = {
    gorevKod: String(g.kod),
    donem: String(g.donem),
    faaliyet: String(g.faaliyet),
    dayanak: `${g.dokuman_kod}${g.madde ? ` md. ${g.madde}` : ""}`,
    periyot: PERIYOTLAR[periyot].ad,
    vade: String(g.vade),
    sorumlu: ROL_ETIKETLERI[String(g.sorumlu_rol) as Rol] ?? String(g.sorumlu_rol),
    formKod: g.form_kod ? String(g.form_kod) : "—",
    saklama: g.saklama ? String(g.saklama) : "5 yıl",
    alan: g.alan_kod ? String(g.alan_kod) : "",
  };
  let satirlar: Record<string, string>[] = [];

  if (sablon.kod === "FRM-TE-20") {
    // Ay/yıl dönemden; günler önceden yazılı geliyor ki sahada tarih
    // yazmakla vakit kaybedilmesin ve gün atlanmasın.
    const [y, a] = String(g.donem).split("-").map(Number);
    const ay = Number.isFinite(a) ? a : Number(String(g.vade).slice(5, 7));
    const yil = Number.isFinite(y) ? y : Number(String(g.vade).slice(0, 4));
    deger.ayYil = `${AYLAR[ay - 1]} ${yil}`;
    // SOP-TE-09 tanımlı aralığı — sahada hatırlanmaya bırakılmıyor.
    deger.aralik = "18 – 25 °C   /   ≤ %60 BN";
    const gunSayisi = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
    satirlar = Array.from({ length: gunSayisi }, (_, i) => ({
      tarih: `${String(i + 1).padStart(2, "0")}.${String(ay).padStart(2, "0")}.${yil}`,
    }));
  }

  if (sablon.kod === "FRM-DE-05") {
    deger.sayimTuru = PERIYOTLAR[periyot].ad;
    // KAYITLI STOK SİSTEMDEN. Kullanıcının istediği asıl kolaylık bu: sayımı
    // yapan kişi ekrana bakıp kâğıda kopyalamıyor, karşılaştırma yapıyor.
    const [lotlar, seriler] = await db.topluOku([
      `SELECT lot, kalan_kg FROM hammadde WHERE statu = 'SERBEST' AND kalan_kg > 0 ORDER BY lot`,
      `SELECT p.seri, COUNT(*) AS adet FROM paketler p
        WHERE p.statu = 'SERBEST' GROUP BY p.seri ORDER BY p.seri`,
    ]);
    satirlar = [
      ...(lotlar as any[]).map((l) => ({
        materyal: "Ham madde (kenevir)",
        lot: String(l.lot),
        kayitli: `${sayiTr(Number(l.kalan_kg), 1)} kg`,
      })),
      ...(seriler as any[]).map((s) => ({
        materyal: "Bitmiş ürün (ambalajlı)",
        lot: String(s.seri),
        kayitli: `${s.adet} birim`,
      })),
    ];
  }

  return (
    <FormBaskisi
      sablon={sablon}
      deger={deger}
      satirlar={satirlar}
      gorevKod={String(g.kod)}
      donem={String(g.donem)}
      vade={String(g.vade)}
      periyotAd={PERIYOTLAR[periyot].ad}
      dayanak={deger.dayanak}
      seriNo={baski?.seri_no ? String(baski.seri_no) : null}
      basanAd={baski?.basan_ad ? String(baski.basan_ad) : null}
      basimTarihi={baski?.basim_tarihi ? String(baski.basim_tarihi) : null}
      yenidenBasim={Number(baski?.yeniden_basim ?? 0) === 1}
      bugun={trBugun()}
    />
  );
}
