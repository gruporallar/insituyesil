/**
 * LİSTE FİLTRESİ ve SAYFALAMA.
 *
 * Liste ekranları tüm kayıtları tek seferde yüklüyordu. Bir yıllık veride —
 * yaklaşık 1.000 seri ve 25.000 ambalaj birimi — ekran yavaşlıyor ve aranan
 * kayıt bulunamıyordu (bulgu B-11).
 *
 * Filtre SUNUCUDA uygulanıyor. İstemcide filtrelemek, önce tüm satırları
 * indirmeyi gerektirir; sorunun kendisi zaten o.
 */

export interface FiltreDurumu {
  /** Serbest metin araması. */
  q: string;
  /** Tarih aralığı (YYYY-AA-GG). */
  baslangic: string;
  bitis: string;
  /** Statü / durum filtresi. */
  statu: string;
  sayfa: number;
  boyut: number;
}

export const VARSAYILAN_BOYUT = 50;
const AZAMI_BOYUT = 500;

/**
 * `searchParams` → filtre durumu.
 *
 * Değerler TEMİZLENİYOR: sayfa numarası negatif ya da devasa gelebilir
 * (adres çubuğu elle düzenlenebilir) ve doğrudan `OFFSET`e verilmesi
 * anlamsız sorgular üretir.
 */
export function filtreOku(sp: Record<string, string | string[] | undefined>): FiltreDurumu {
  const tek = (a: string | string[] | undefined) => (Array.isArray(a) ? a[0] : a) ?? "";
  const tarihMi = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

  const sayfaHam = parseInt(tek(sp.sayfa), 10);
  const boyutHam = parseInt(tek(sp.boyut), 10);

  return {
    q: tek(sp.q).trim().slice(0, 120),
    baslangic: tarihMi(tek(sp.baslangic)) ? tek(sp.baslangic) : "",
    bitis: tarihMi(tek(sp.bitis)) ? tek(sp.bitis) : "",
    statu: tek(sp.statu).trim().slice(0, 30),
    sayfa: Number.isFinite(sayfaHam) && sayfaHam > 0 ? Math.min(sayfaHam, 100000) : 1,
    boyut:
      Number.isFinite(boyutHam) && boyutHam > 0
        ? Math.min(boyutHam, AZAMI_BOYUT)
        : VARSAYILAN_BOYUT,
  };
}

export interface KosulTanimi {
  /** Serbest metnin aranacağı kolonlar. */
  aramaKolonlari?: string[];
  /** Tarih aralığının uygulanacağı kolon. */
  tarihKolonu?: string;
  /** Statü filtresinin uygulanacağı kolon. */
  statuKolonu?: string;
}

export interface DerlenmisFiltre {
  /** `WHERE` sonrası gelecek koşul metni; koşul yoksa `1=1`. */
  kosul: string;
  /** Koşul parametreleri, sırasıyla. */
  parametreler: (string | number)[];
  limit: number;
  offset: number;
}

/**
 * Filtre durumunu SQL koşuluna çevirir.
 *
 * Kolon adları ÇAĞIRAN TARAFTAN geliyor ve doğrudan SQL'e giriyor — bunlar
 * kullanıcı girdisi değil, kodda sabit. Kullanıcıdan gelen her şey (arama
 * metni, tarihler, statü) parametre olarak bağlanıyor; hiçbiri SQL metnine
 * yazılmıyor.
 */
export function filtreDerle(f: FiltreDurumu, t: KosulTanimi): DerlenmisFiltre {
  const parcalar: string[] = [];
  const parametreler: (string | number)[] = [];

  if (f.q && t.aramaKolonlari?.length) {
    const like = `%${f.q}%`;
    parcalar.push(
      "(" + t.aramaKolonlari.map((k) => `${k} LIKE ?`).join(" OR ") + ")"
    );
    t.aramaKolonlari.forEach(() => parametreler.push(like));
  }

  if (t.tarihKolonu) {
    if (f.baslangic) {
      parcalar.push(`${t.tarihKolonu} >= ?`);
      parametreler.push(f.baslangic);
    }
    if (f.bitis) {
      parcalar.push(`${t.tarihKolonu} <= ?`);
      parametreler.push(f.bitis);
    }
  }

  if (f.statu && t.statuKolonu) {
    parcalar.push(`${t.statuKolonu} = ?`);
    parametreler.push(f.statu);
  }

  return {
    kosul: parcalar.length ? parcalar.join(" AND ") : "1=1",
    parametreler,
    limit: f.boyut,
    offset: (f.sayfa - 1) * f.boyut,
  };
}

/** Sayfalama özeti — "1.234 kayıttan 51–100 arası". */
export function sayfaOzeti(toplam: number, f: FiltreDurumu): {
  ilk: number;
  son: number;
  toplamSayfa: number;
} {
  const toplamSayfa = Math.max(1, Math.ceil(toplam / f.boyut));
  const ilk = toplam === 0 ? 0 : (f.sayfa - 1) * f.boyut + 1;
  const son = Math.min(toplam, f.sayfa * f.boyut);
  return { ilk, son, toplamSayfa };
}

/** Filtre uygulanmış mı? Boş sonuçta "filtreyi temizleyin" demek için. */
export function filtreVarMi(f: FiltreDurumu): boolean {
  return Boolean(f.q || f.baslangic || f.bitis || f.statu);
}
