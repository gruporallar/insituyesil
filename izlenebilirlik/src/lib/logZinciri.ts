import { createHash } from "node:crypto";

/**
 * DENETİM İZİ HASH ZİNCİRİ — blokzincirsiz değişmezlik kanıtı.
 *
 * Her log satırı, bir önceki satırın özetini de içeren bir SHA-256 özeti
 * taşır. Tek bir satır sonradan değiştirilir ya da silinirse, ondan sonraki
 * TÜM özetler tutmaz — kurcalama yalnızca tespit edilmez, yeri de görünür.
 *
 * Blokzincir bilinçli olarak KULLANILMADI: dağıtık mutabakat, ayrı altyapı
 * ve denetçiye anlatılması zor bir teknoloji getirirdi. Aynı garanti
 * (geriye dönük değiştirilemezlik) tek tablolu hash zinciriyle sağlanıyor;
 * Ek 11'in istediği de teknoloji değil, bu garantinin kendisi.
 *
 * Dosya saf: veritabanı bilmiyor, `test/birim/logzinciri.mjs` ile sınanıyor.
 */

export interface LogSatiri {
  id: number;
  tarih: string;
  kullanici_id: number | null;
  eylem: string;
  kayit: string | null;
  detay: string | null;
  ozet: string | null;
}

/**
 * Bir satırın özetini hesaplar.
 *
 * Alanlar uzunluk önekiyle birleştiriliyor ("3:abc" gibi) — düz birleştirme,
 * ("ab","c") ile ("a","bc") çiftlerine aynı özeti verir ve sahtecilik için
 * oynama alanı bırakırdı. `id` de özete dahil: satır silinip aynı içerikle
 * farklı sırada yeniden eklenirse zincir yine kopar.
 */
export function ozetHesapla(
  onceki: string,
  s: Pick<LogSatiri, "id" | "tarih" | "kullanici_id" | "eylem" | "kayit" | "detay">
): string {
  const parca = (v: unknown) => {
    const m = v == null ? "" : String(v);
    return `${m.length}:${m}`;
  };
  return createHash("sha256")
    .update(
      [parca(onceki), parca(s.id), parca(s.tarih), parca(s.kullanici_id), parca(s.eylem), parca(s.kayit), parca(s.detay)].join("|")
    )
    .digest("hex");
}

/**
 * Zincir ÖNCESİ kayıtların toplu özeti — başlangıç mührü için.
 *
 * Tek tek hash'lemek yerine hepsinin tek özeti: eski kayıtlar değişmeyecek
 * (silme/yazma yolu yok), yalnızca "değişmediler" kanıtı gerekiyor.
 */
export function topluOzet(satirlar: Pick<LogSatiri, "id" | "tarih" | "kullanici_id" | "eylem" | "kayit" | "detay">[]): string {
  const h = createHash("sha256");
  for (const s of satirlar) {
    h.update(ozetHesapla("", s));
  }
  return h.digest("hex");
}

export interface ZincirSonucu {
  tamam: boolean;
  toplam: number;
  /** Özet taşıyan (zincire dahil) satır sayısı. */
  zincirli: number;
  /** Kopma varsa hangi satırda. */
  kopanId?: number;
  mesaj: string;
}

/**
 * Zinciri baştan sona yürütür. Satırlar id'ye göre ARTAN sıralı gelmeli.
 *
 * Özet kolonu sonradan eklendiği için eski satırlarda özet yok; onlar
 * zincirin ÖNCESİ sayılır ve ilk özetli satırdan itibaren kural kesin işler:
 * o noktadan sonra özetsiz satır da, tutmayan özet de kopmadır.
 */
export function zinciriDogrula(satirlar: LogSatiri[]): ZincirSonucu {
  const toplam = satirlar.length;
  let onceki = "";
  let zincirli = 0;
  let basladi = false;

  for (const s of satirlar) {
    if (!basladi) {
      if (s.ozet == null) continue; // göç öncesi eski satır
      basladi = true;
    }
    if (s.ozet == null) {
      return {
        tamam: false, toplam, zincirli, kopanId: s.id,
        mesaj: `#${s.id} numaralı satırın özeti yok — zincir başladıktan sonra özetsiz kayıt eklenemez.`,
      };
    }
    const beklenen = ozetHesapla(onceki, s);
    if (s.ozet !== beklenen) {
      return {
        tamam: false, toplam, zincirli, kopanId: s.id,
        mesaj:
          `Zincir #${s.id} numaralı satırda koptu: bu satır ya da öncesindeki bir kayıt ` +
          `sonradan değiştirilmiş veya silinmiş.`,
      };
    }
    onceki = s.ozet;
    zincirli++;
  }

  return {
    tamam: true, toplam, zincirli,
    mesaj:
      zincirli === 0
        ? `${toplam} kayıt var; hiçbiri henüz özetli değil (zincir ilk yeni kayıtla başlar).`
        : `${zincirli} özetli kayıt doğrulandı${toplam > zincirli ? ` (${toplam - zincirli} kayıt zincir öncesinden)` : ""}. Kurcalama izi yok.`,
  };
}
