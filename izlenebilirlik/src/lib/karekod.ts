/**
 * KAREKOD ÜRETİMİ VE ÇÖZÜMLEMESİ — GS1 uygulama tanımlayıcı (AI) yapısı.
 *
 * Biçim İTS/BÜTS ile aynı mantıkta:
 *
 *   01 {GTIN:14}  21 {tekil seri}  <GS>  17 {SKT:YYAAGG}  10 {parti/seri}
 *
 * ── GS AYIRICISI NEDEN VAR ───────────────────────────────────────────────────
 * AI 21 (tekil seri) ve AI 10 (parti) DEĞİŞKEN uzunlukta. GS1 standardı,
 * değişken uzunluklu bir alandan sonra başka alan geliyorsa aralarına FNC1
 * (ASCII 29 — "group separator") konmasını şart koşuyor. Konmazsa çözümleme
 * belirsiz hale gelir: `21ABC1710...` içindeki "17" seri numarasının parçası
 * mı, yoksa SKT tanımlayıcısı mı? Ayırıcıyı atlayıp "seri numaram sabit
 * uzunlukta, sorun olmaz" demek, biçimi ilk özel karakterli seride kıran bir
 * varsayım olurdu.
 *
 * AI 17 sabit 6 hane olduğu için ondan sonra ayırıcı GEREKMEZ. AI 10 en sonda
 * olduğu için ondan sonra da gerekmez.
 *
 * ── ÇÖZÜMLEMEDE İKİ YOL ──────────────────────────────────────────────────────
 * Bazı barkod okuyucular GS karakterini kırpıp gönderiyor. Bu yüzden
 * çözümleyici önce ayırıcılı biçimi dener, bulamazsa ayırıcısız biçimi
 * desendeki sabit uzunluklara dayanarak çözer. Okuyucu donanımı değiştiğinde
 * sistemin çalışmayı bırakmaması için.
 *
 * BU DOSYA HİÇBİR ŞEY `import` ETMEZ — `test/birim/karekod.mjs` tarafından
 * doğrudan çalıştırılıyor.
 */

/** GS1 FNC1 ayırıcısı — ASCII 29. */
export const GS = "\x1d";

/**
 * Ürün GTIN'leri. 14 haneli, son hane GS1 kontrol hanesi.
 *
 * Bunlar GS1 Türkiye'den TAHSİS EDİLMİŞ numaralar DEĞİL — yer tutucu. Gerçek
 * numaralar alındığında burada değişir ve `gtinGecerli` testi onları doğrular.
 * Yer tutucu olduğu README'de de yazılı; sessizce gerçek sanılmasın.
 */
export const GTIN: Record<"DISTILAT" | "IZOLAT", string> = {
  DISTILAT: "08680000000013",
  IZOLAT: "08680000000020",
};

// ── GTIN kontrol hanesi ──────────────────────────────────────────────────────

/**
 * GS1 mod-10 kontrol hanesi. Sağdan sola 3-1-3-1 ağırlık.
 *
 * NEDEN VAR: elle girilen veya kötü okunan bir kod, kontrol hanesi
 * doğrulanmadığında sisteme geçerli gibi girer. Tek hane hatası ve komşu hane
 * yer değiştirmelerinin neredeyse tamamı bu kontrolde yakalanır.
 */
export function gtinKontrolHanesi(ilk13: string): number {
  if (!/^\d{13}$/.test(ilk13)) throw new Error("GTIN gövdesi 13 hane olmalı");
  let toplam = 0;
  // Sağdan sola: son hane ×3, sonra ×1, dönüşümlü.
  for (let i = 0; i < 13; i++) {
    const hane = Number(ilk13[12 - i]);
    toplam += hane * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (toplam % 10)) % 10;
}

export function gtinGecerli(gtin: string): boolean {
  if (!/^\d{14}$/.test(gtin)) return false;
  return gtinKontrolHanesi(gtin.slice(0, 13)) === Number(gtin[13]);
}

// ── SKT biçimi ───────────────────────────────────────────────────────────────

/** ISO tarih (YYYY-AA-GG) → GS1 SKT (YYAAGG). */
export function sktKisalt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Geçersiz tarih: ${iso}`);
  return m[1].slice(2) + m[2] + m[3];
}

/**
 * GS1 SKT (YYAAGG) → ISO tarih.
 *
 * İKİ HANELİ YIL PENCERESİ: GS1, YY'yi içinde bulunulan yıla göre −49/+50 yıl
 * aralığında yorumlar. Sabit "20" öneki 2000–2099 dışına çıkıldığında kırılır;
 * bu ürünlerin raf ömrü 2 yıl olduğu için pratikte sorun çıkmaz ama biçim
 * doğru olsun diye pencere uygulanıyor.
 */
export function sktAc(yyaagg: string, referansYil = new Date().getUTCFullYear()): string {
  if (!/^\d{6}$/.test(yyaagg)) throw new Error(`Geçersiz SKT: ${yyaagg}`);
  const yy = Number(yyaagg.slice(0, 2));
  const yuzyil = Math.floor(referansYil / 100) * 100;
  let yil = yuzyil + yy;
  if (yil - referansYil > 50) yil -= 100;
  if (referansYil - yil > 49) yil += 100;
  return `${yil}-${yyaagg.slice(2, 4)}-${yyaagg.slice(4, 6)}`;
}

// ── Üretim ───────────────────────────────────────────────────────────────────

export interface KarekodAlanlari {
  gtin: string;
  /** Tekil seri numarası — her ambalaj biriminde farklı. */
  tekil: string;
  /** Son kullanma tarihi, ISO (YYYY-AA-GG). */
  skt: string;
  /** Üretim serisi / parti numarası — soyağacının anahtarı. */
  seri: string;
}

/**
 * Karekod içeriğini üretir.
 *
 * Tekil seri ve parti numarasında GS karakteri bulunamaz — bulunursa üretilen
 * kod kendi ayırıcısını taklit eder ve çözümleme yanlış yerden böler. Sessizce
 * kırpmak yerine hata atıyor: bozuk bir etiketin basılması, üretimin durmasından
 * daha pahalı.
 */
export function karekodUret(a: KarekodAlanlari): string {
  if (!gtinGecerli(a.gtin)) throw new Error(`GTIN kontrol hanesi geçersiz: ${a.gtin}`);
  if (!a.tekil || !a.seri) throw new Error("Tekil seri ve parti numarası zorunlu");
  if (a.tekil.includes(GS) || a.seri.includes(GS)) {
    throw new Error("Tekil seri veya parti numarası ayırıcı karakter içeremez");
  }
  return `01${a.gtin}21${a.tekil}${GS}17${sktKisalt(a.skt)}10${a.seri}`;
}

// ── Çözümleme ────────────────────────────────────────────────────────────────

/** Ayırıcılı biçim: 01…21…<GS>17……10… */
const AYIRICILI = new RegExp(`^01(\\d{14})21([^${GS}]+)${GS}17(\\d{6})10(.+)$`);

/**
 * Ayırıcısız biçim (okuyucu GS'i kırpmışsa).
 *
 * `([^\\x1d]+?)` TEMBEL (lazy): açgözlü olsaydı seri numarası, sonraki
 * `17\d{6}10` desenini kendi içine yutup geri izlemeyle en SOLDAKİ değil en
 * SAĞDAKİ eşleşmeyi bulurdu. Parti numarası "17" ile başlayan bir seri
 * (örn. `10CBD-17...`) böyle bir kodda yanlış bölünür.
 */
const AYIRICISIZ = /^01(\d{14})21(.+?)17(\d{6})10(.+)$/;

export interface CozumlemeSonucu extends KarekodAlanlari {
  /** GTIN kontrol hanesi doğrulandı mı? */
  gtinGecerli: boolean;
  /** Ayırıcı karakter kodda var mıydı? */
  ayiriciVardi: boolean;
}

/**
 * Karekod içeriğini alanlara ayırır. Biçim tanınmazsa `null`.
 *
 * `null` dönmesi "sahte ürün" DEMEK DEĞİL, "bu bizim biçimimiz değil" demek.
 * Ürünün bizim olup olmadığına veritabanı karar verir; bu fonksiyon yalnızca
 * biçim bilir.
 */
export function karekodCozumle(girdi: string): CozumlemeSonucu | null {
  const kod = String(girdi ?? "").trim();
  if (!kod) return null;

  let m = AYIRICILI.exec(kod);
  const ayiriciVardi = m !== null;
  if (!m) m = AYIRICISIZ.exec(kod);
  if (!m) return null;

  const [, gtin, tekil, yyaagg, seri] = m;
  let skt: string;
  try {
    skt = sktAc(yyaagg);
  } catch {
    return null;
  }

  return {
    gtin,
    tekil,
    skt,
    seri,
    gtinGecerli: gtinGecerli(gtin),
    ayiriciVardi,
  };
}

/**
 * Okuyucudan / kameradan gelen ham metni KANONİK biçime çevirir.
 *
 * İki iş yapıyor:
 *
 * 1. Bazı okuyucular GS yerine görünür bir vekil karakter (`␝`, `<GS>`,
 *    `{GS}`) gönderiyor. Bunlar gerçek GS'e çevriliyor.
 *
 * 2. Bazı USB okuyucular GS'i tamamen KIRPIYOR. Bu hâlde kod hâlâ okunabilir
 *    ama `paketler.uid` ile karakter karakter eşleşmiyor — ve sistemdeki her
 *    arama uid eşitliğine dayandığı için gerçek bir kutu "Sistemde kayıtlı
 *    değil — sahte ürün şüphesi" diye reddediliyordu. Ayırıcısız çözülebilen
 *    kod burada ayırıcılı biçime geri yazılıyor; böylece sevkiyat, satış,
 *    iade ve izleme yollarının hepsi tek noktadan düzeliyor.
 *
 * Çözülemeyen girdi olduğu gibi bırakılıyor: bu fonksiyonun işi biçim
 * düzeltmek, geçerlilik kararı vermek değil.
 */
export function karekodNormalize(ham: string): string {
  const s = String(ham ?? "")
    .replace(/␝/g, GS) // ␝ görünür GS simgesi
    .replace(/<GS>/gi, GS)
    .replace(/\{GS\}/gi, GS)
    .trim();

  if (!s || s.includes(GS)) return s;

  const c = karekodCozumle(s);
  if (!c) return s;
  try {
    return karekodUret({ gtin: c.gtin, tekil: c.tekil, skt: c.skt, seri: c.seri });
  } catch {
    // GTIN kontrol hanesi tutmuyorsa `karekodUret` hata atıyor. Böyle bir kod
    // zaten sistemde bulunamayacak; ham hâliyle geçiyor ki hata mesajı
    // operatöre okuttuğu şeyi göstersin.
    return s;
  }
}
