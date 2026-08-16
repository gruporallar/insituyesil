import { getDb, ensureEkTablolar, sayacBlokTx, trBugun } from "./db";
import { kodGorev } from "./kod";
import { donemAnahtari, donemVadesi, donemler, type Periyot } from "./gorev";

/**
 * GÖREV ÜRETİMİ — onaylı kuralları takvime düşürür.
 *
 * ZAMANLANMIŞ İŞ YOK, TALEP ANINDA ÜRETİLİYOR. Vercel'de kalıcı bir zamanlayıcı
 * tutmak ayrı altyapı demek; bu ölçekte gereksiz. Görev ekranı her açıldığında
 * eksik dönemler tamamlanıyor. Kimse günlerce girmezse görevler geçmişe dönük
 * açılıp GECİKMİŞ görünüyor — ki doğrusu bu: iş, kimse bakmadı diye ortadan
 * kalkmıyor.
 *
 * TEKRARLANABİLİR OLMAK ZORUNDA. Aynı istek iki kez çalışsa da ikinci görev
 * açılmamalı; garanti veritabanında: UNIQUE(kural_kod, donem) + INSERT OR IGNORE.
 * Uygulama katmanında "önce var mı diye bak" yaklaşımı, iki eşzamanlı istekte
 * mükerrer kayıt üretirdi.
 *
 * GELECEK DÖNEM ÜRETİLMİYOR. Yalnızca dönemi BAŞLAMIŞ görevler yazılıyor;
 * ileriye dönük satır açmak, kural sonradan pasife alındığında ortada sahipsiz
 * görevler bırakırdı. "Yaklaşan" listesi ekranda hesaplanıyor, saklanmıyor.
 */

/** Tek çalıştırmada açılacak azami görev — istek süresini sınırlar. */
const TUR_BASINA_AZAMI = 400;

/**
 * Geriye dönük üretim tavanı (gün).
 *
 * Kuralın `baslangic` tarihi çok eskiyse bile takvim bu kadar geriden başlar.
 * Sebebi teknik değil anlamsal: üç yıl önce yapılmamış günlük kontrol için
 * bugün görev açmak, kapatılamayacak bin satırlık bir gecikme yığını üretir
 * ve gerçek gecikmeleri görünmez kılar.
 */
const GERIYE_TAVAN_GUN = 120;

export interface UretimSonucu {
  acilan: number;
  /** Tavana dayanıldı — bir sonraki çağrıda kalanlar açılacak. */
  devamVar: boolean;
}

interface KuralSatiri {
  kod: string;
  periyot: Periyot;
  baslangic: string;
  sorumlu_rol: string;
}

export async function gorevleriUret(bugun = trBugun()): Promise<UretimSonucu> {
  await ensureEkTablolar();
  const db = await getDb();

  const kurallar = (await db
    .prepare("SELECT kod, periyot, baslangic, sorumlu_rol FROM gorev_kurallari WHERE durum = 'ONAYLI'")
    .all()) as unknown as KuralSatiri[];

  if (!kurallar.length) return { acilan: 0, devamVar: false };

  // Zaten açılmış (kural, dönem) çiftleri — tek sorguda, satır satır sormak
  // yerine. INSERT OR IGNORE tekrarı zaten engelliyor; bu okuma yalnızca kaç
  // yeni satır AÇILACAĞINI önceden bilmek için: sayaç bloğu o kadar ayrılıyor.
  const mevcut = new Set(
    ((await db.prepare("SELECT kural_kod, donem FROM gorevler").all()) as any[]).map(
      (r) => `${r.kural_kod}|${r.donem}`
    )
  );

  const tavan = new Date(Date.parse(bugun) - GERIYE_TAVAN_GUN * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const acilacak: { kural: string; donem: string; vade: string }[] = [];
  let devamVar = false;

  for (const k of kurallar) {
    const bas = k.baslangic > tavan ? k.baslangic : tavan;
    // Bugünün dönemi DÂHİL: içinde bulunduğumuz ay/hafta işi bugün yapılabilir.
    const { donemler: liste, kirpildi } = donemler(k.periyot, bas, bugun, TUR_BASINA_AZAMI);
    if (kirpildi) devamVar = true;

    for (const d of liste) {
      if (mevcut.has(`${k.kod}|${d}`)) continue;
      acilacak.push({ kural: k.kod, donem: d, vade: donemVadesi(k.periyot, d) });
      if (acilacak.length >= TUR_BASINA_AZAMI) {
        devamVar = true;
        break;
      }
    }
    if (acilacak.length >= TUR_BASINA_AZAMI) break;
  }

  if (!acilacak.length) return { acilan: 0, devamVar: false };

  const yil = Number(bugun.slice(0, 4));
  await db.transaction(async (calistir) => {
    const ilk = await sayacBlokTx(calistir, `gorev-${yil}`, acilacak.length);
    for (let i = 0; i < acilacak.length; i++) {
      const g = acilacak[i];
      await calistir(
        `INSERT OR IGNORE INTO gorevler (kod, kural_kod, donem, vade, durum)
         VALUES (?, ?, ?, ?, 'ACIK')`,
        kodGorev(yil, ilk + i), g.kural, g.donem, g.vade
      );
    }
  });

  return { acilan: acilacak.length, devamVar };
}

/**
 * Bir kuralın BİR SONRAKİ vadesi — ekranda "yaklaşan" göstermek için.
 *
 * Saklanmıyor, hesaplanıyor: gelecek görev satırı açmamanın bedeli bu küçük
 * hesap, karşılığı ise kural değiştiğinde temizlenecek sahipsiz satır olmaması.
 */
export function sonrakiVade(periyot: Periyot, bugun: string): { donem: string; vade: string } {
  const buDonem = donemAnahtari(periyot, bugun);
  let imlec = new Date(Date.parse(bugun));
  // Dönem değişene kadar ilerle — en uzun periyot iki yıl, bu döngü kısa.
  for (let i = 0; i < 800; i++) {
    imlec = new Date(imlec.getTime() + 86_400_000);
    const iso = imlec.toISOString().slice(0, 10);
    const d = donemAnahtari(periyot, iso);
    if (d !== buDonem) return { donem: d, vade: donemVadesi(periyot, d) };
  }
  return { donem: buDonem, vade: donemVadesi(periyot, buDonem) };
}
