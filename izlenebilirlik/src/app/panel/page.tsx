import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { getDb, trBugun } from "@/lib/db";
import { denetimTaramaVerisi } from "@/lib/veri";
import { onDenetim } from "@/lib/denetim";
import { ekranGorunur } from "@/lib/yetki";
import { sayiTr } from "@/lib/bicim";
import { PanoEkrani, type IsKuyrugu, type IsSatiri } from "@/components/PanoEkrani";

export const dynamic = "force-dynamic";

/** Kuyruk kartlarında açılacak örnek kayıt sayısı. */
const ORNEK = 6;

/** Gün farkı — "kaç gündür bekliyor" için. */
const gun = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** Kuyruk önceliği — küçük olan üstte. */
const ONCELIK: Record<string, number> = {
  uretim: 1, // Mesul Müdür kararı bekliyor, ürün piyasaya çıkamıyor
  hammadde: 2, // üretime girdi bekliyor
  sapma: 3,
  iade: 4,
  sikayet: 5,
  buts: 6, // rutin bildirim
};
const sira = (x: { anahtar: string; acil?: boolean }) =>
  (x.acil ? 0 : ONCELIK[x.anahtar] ?? 9);

/**
 * Panonun veri toplama katmanı.
 *
 * Kuyruk kartlarının açılacağı ÖRNEK KAYITLAR da burada hazırlanıp istemciye
 * gönderiliyor: tıklayınca istek atmak, "detayı gör" alışkanlığını ilk
 * denemede öldürür. Ölçek buna izin veriyor — kuyruk başına en fazla altı
 * satır.
 *
 * Veri kaynağı ön denetim taramasıyla AYNI: pano ile rapor farklı sayı
 * gösterirse ikisine de güven biter.
 */
export default async function Panel() {
  const k = await getSession();
  const hedef = ekranKoru(k, "panel");
  if (hedef) redirect(hedef);

  const bugun = trBugun();
  const db = await getDb();

  // Panonun kendi üç sorgusu da TEK turda; denetim taraması zaten tek batch.
  // İkisi paralel → toplam iki ağ turu (önce yirmiden fazlaydı).
  const [veri, [butsKuyruk, butsSayim, hareketler]] = await Promise.all([
    denetimTaramaVerisi(),
    db.topluOku([
      `SELECT kod, tip, ref FROM buts_kuyruk WHERE durum = 'BEKLIYOR' ORDER BY kod LIMIT ${ORNEK}`,
      "SELECT COUNT(*) AS a FROM buts_kuyruk WHERE durum = 'BEKLIYOR'",
      // Giriş kayıtları ELENIYOR: denetim izinde dururlar ama panoda
      // operasyon hareketlerini gömüyorlardı.
      `SELECT l.tarih, l.eylem, l.kayit, k.ad_soyad
         FROM loglar l LEFT JOIN kullanicilar k ON k.id = l.kullanici_id
        WHERE l.eylem != 'Giriş yapıldı'
        ORDER BY l.id DESC LIMIT 6`,
    ]),
  ]);

  const butsBekleyenSayi = Number(butsSayim[0]?.a ?? 0);

  const denetim = onDenetim(veri, bugun);

  // ── Zincir akışı ──────────────────────────────────────────────────────────
  const hmSerbest = veri.hammadde.filter((h: any) => h.statu === "SERBEST");
  const hmKarantina = veri.hammadde.filter((h: any) => h.statu === "KARANTINA");
  const seriSerbestListe = veri.seriler.filter((s: any) => s.statu === "SERBEST");
  const seriKarantina = veri.seriler.filter((s: any) => s.statu === "KARANTINA");

  const hamSerbestKg = hmSerbest.reduce((t: number, h: any) => t + Number(h.kalan_kg ?? 0), 0);
  const hamKarantinaKg = hmKarantina.reduce((t: number, h: any) => t + Number(h.miktar_kg ?? 0), 0);
  const hamToplamKg = hamSerbestKg + hamKarantinaKg;
  const seriToplam = seriSerbestListe.length + seriKarantina.length;

  const zincir = {
    ciftci: veri.ciftciler.length,
    hamKg: sayiTr(hamSerbestKg, 0),
    hamKarantina: hmKarantina.length,
    // Kompozisyon çubuğu KG bazında: "kg serbest stok" rakamıyla aynı birim.
    hamBar: hamToplamKg > 0
      ? [
          { renk: "bg-green-500", yuzde: (hamSerbestKg / hamToplamKg) * 100 },
          { renk: "bg-amber-400", yuzde: (hamKarantinaKg / hamToplamKg) * 100 },
        ]
      : [],
    seriSerbest: seriSerbestListe.length,
    seriKarantina: seriKarantina.length,
    seriBar: seriToplam > 0
      ? [
          { renk: "bg-green-500", yuzde: (seriSerbestListe.length / seriToplam) * 100 },
          { renk: "bg-amber-400", yuzde: (seriKarantina.length / seriToplam) * 100 },
        ]
      : [],
    // SIRALI aşamalar — çubuktaki renk rampası bu sırayı taşıyor.
    birimler: [
      { etiket: "Depoda, sevke hazır", kisa: "Depoda", adet: veri.paketler.filter((p: any) => p.statu === "SERBEST").length, yol: "/panel/ambalaj" },
      { etiket: "Sevkte / eczanede", kisa: "Sevkte", adet: veri.paketler.filter((p: any) => p.statu === "SEVK").length, yol: "/panel/sevkiyat" },
      { etiket: "Hastaya teslim", kisa: "Hastada", adet: veri.paketler.filter((p: any) => p.statu === "SATILDI").length, yol: "/panel/satis" },
    ],
  };

  // ── Son 7 gün ─────────────────────────────────────────────────────────────
  const haftaOnce = new Date(Date.parse(bugun) - 7 * 86_400_000).toISOString().slice(0, 10);
  const hafta = [
    { n: veri.hammadde.filter((h: any) => h.teslim_tarihi >= haftaOnce).length, ad: "lot kabulü" },
    { n: veri.seriler.filter((s: any) => s.uretim_tarihi >= haftaOnce).length, ad: "seri açıldı" },
    { n: veri.sevkiyatlar.filter((s: any) => s.tarih >= haftaOnce).length, ad: "sevkiyat" },
    { n: veri.satislar.filter((s: any) => s.tarih >= haftaOnce).length, ad: "hasta teslimi" },
  ];

  // ── Bekleyen iş kuyrukları + açılacak örnek kayıtlar ──────────────────────
  const acikSapma = veri.sapmalar.filter((s: any) => s.durum === "ACIK");
  const gecikmis = acikSapma.filter((s: any) => s.termin && s.termin < bugun);
  const bekleyenIade = veri.iadeler.filter((i: any) => i.karar === "BEKLIYOR");
  const acikSikayet = veri.sikayetler.filter((s: any) => s.sonuc === "ACIK");
  const ciftciAd = new Map(veri.ciftciler.map((c: any) => [c.kod, c.ad] as const));

  const kuyruklar: IsKuyrugu[] = [
    {
      anahtar: "hammadde", is: "Analiz bekleyen", kim: "KG-KK", yol: "/panel/hammadde",
      n: hmKarantina.length,
      ornekler: hmKarantina.slice(0, ORNEK).map((h: any): IsSatiri => ({
        kod: h.lot,
        baslik: ciftciAd.get(h.ciftci_kod) ?? h.ciftci_kod,
        alt: `${sayiTr(h.miktar_kg, 0)} kg`,
        uyari: gun(bugun, h.teslim_tarihi) > 30 ? `${gun(bugun, h.teslim_tarihi)} gündür` : null,
        yol: `/panel/hammadde?lot=${encodeURIComponent(h.lot)}`,
      })),
    },
    {
      anahtar: "uretim", is: "Serbest bırakma", kim: "Mesul Müdür", yol: "/panel/uretim",
      n: seriKarantina.length,
      ornekler: seriKarantina.slice(0, ORNEK).map((s: any): IsSatiri => ({
        kod: s.seri,
        baslik: s.urun_tipi === "IZOLAT" ? "CBD İzolat" : "CBD Distilat",
        alt: `${sayiTr(s.girdi_kg, 0)} kg girdi · ${s.uretim_tarihi}`,
        yol: `/panel/uretim/${encodeURIComponent(s.seri)}`,
      })),
    },
    {
      anahtar: "sapma", is: "Açık sapma", kim: "KG-KK", yol: "/panel/sapma",
      n: acikSapma.length, acil: gecikmis.length > 0,
      not: gecikmis.length ? `${gecikmis.length} gecikmiş` : null,
      // Gecikmişler ÖNCE: kutuyu açan kişinin ilk göreceği şey acil olanlar.
      ornekler: [...gecikmis, ...acikSapma.filter((s: any) => !gecikmis.includes(s))]
        .slice(0, ORNEK)
        .map((s: any): IsSatiri => ({
          kod: s.kod, baslik: s.konu, alt: s.kaynak_kod,
          uyari: s.termin && s.termin < bugun ? `${gun(bugun, s.termin)} gün geçti` : null,
          yol: "/panel/sapma",
        })),
    },
    {
      anahtar: "iade", is: "İade kararı", kim: "KG-KK", yol: "/panel/iade",
      n: bekleyenIade.length,
      ornekler: (bekleyenIade as any[]).slice(0, ORNEK).map((i: any): IsSatiri => ({
        kod: i.kod, baslik: i.gerekce ?? "—", alt: i.seri,
        uyari: gun(bugun, i.tarih) > 30 ? `${gun(bugun, i.tarih)} gündür` : null,
        yol: "/panel/iade",
      })),
    },
    {
      anahtar: "sikayet", is: "Açık şikayet", kim: "KG-KK", yol: "/panel/iade",
      n: acikSikayet.length,
      ornekler: (acikSikayet as any[]).slice(0, ORNEK).map((s: any): IsSatiri => ({
        kod: s.kod, baslik: s.konu ?? "—", alt: s.kaynak,
        uyari: gun(bugun, s.tarih) > 30 ? `${gun(bugun, s.tarih)} gündür` : null,
        yol: "/panel/iade",
      })),
    },
    {
      anahtar: "buts", is: "BÜTS kuyruğu", kim: "KG-KK", yol: "/panel/buts",
      n: butsBekleyenSayi,
      ornekler: (butsKuyruk as any[]).map((b: any): IsSatiri => ({
        kod: b.kod, baslik: b.tip, alt: b.ref, yol: "/panel/buts",
      })),
    },
  ]
    .filter((x) => x.n > 0)
    // ÖNCELİK SIRASI: gecikmiş olan en üstte, sonra ürünü piyasaya çıkaramayan
    // engeller (serbest bırakma, analiz), sonra kalite işleri, en altta rutin
    // bildirim kuyruğu. Liste yukarıdan aşağı okunuyor; sıra bilgi taşımalı.
    .sort((a, b) => sira(a) - sira(b));

  // ── Bulgu özeti — en ağırdan başlayarak ───────────────────────────────────
  //
  // `onDenetim` bulguları kod sırasıyla (D-01, D-02…) döndürüyor, önem
  // sırasıyla değil; pano her zaman en ağır üçünü göstermeli — kritik bir
  // bulgu listenin ortasına gömülüyse panonun asıl işi kaybolur.
  const ONEM: Record<string, number> = { KRITIK: 0, YUKSEK: 1, ORTA: 2, BILGI: 3 };
  const bulgular = [...denetim.bulgular]
    .sort((a, b) => ONEM[a.seviye] - ONEM[b.seviye])
    .slice(0, 6)
    .map((b) => ({ kod: b.kod, seviye: b.seviye, baslik: b.baslik, adet: b.kayitlar.length }));

  const seritDurum =
    denetim.sayim.KRITIK > 0 ? "kotu" : denetim.sayim.YUKSEK > 0 ? "orta" : "iyi";
  const seritMetin =
    seritDurum === "kotu"
      ? `Denetime hazır değil — ${denetim.sayim.KRITIK} kritik bulgu`
      : seritDurum === "orta"
        ? `${denetim.sayim.YUKSEK} yüksek öncelikli bulgu var`
        : "Kayıtlar denetime hazır";

  return (
    <PanoEkrani
      seritDurum={seritDurum}
      seritMetin={seritMetin}
      denetimGorunur={ekranGorunur(k, "denetim")}
      bulgular={bulgular}
      sayim={denetim.sayim}
      toplamBulgu={denetim.bulgular.length}
      isler={kuyruklar}
      zincir={zincir}
      hafta={hafta}
      hareketler={hareketler}
      hareketlerGorunur={ekranGorunur(k, "hareketler")}
    />
  );
}
