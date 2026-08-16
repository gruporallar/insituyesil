/**
 * FORM ŞABLONLARI — ön dolu kâğıt form üretimi.
 *
 * SİSTEM KAYIT TUTMUYOR, FORM ÜRETİYOR. Sahada ölçülen değer bu sisteme
 * girilmiyor; asıl kayıt ıslak imzalı kâğıt. Yazılımın işi, o kâğıdı
 * DOLDURULMUŞ SABİTLERLE hazır vermek: form kodu, versiyonu, alan ve raf
 * kodları, sorumlu adları, hedef değerler ve sistemin zaten bildiği stok.
 * Böylece sahada kalemle yazılacak tek şey ÖLÇÜLEN DEĞER kalıyor —
 * kopyalama hatası ve eksik başlık bilgisi kalemle doldurulan formların
 * en sık bulgusudur.
 *
 * ŞABLONU OLMAYAN FORM İÇİN SAHTE TABLO BASILMAZ. Doküman setinde 116 form
 * var; sütun düzenini bilmediğimiz bir formu "tahmini" bir ızgarayla basmak,
 * resmî görünen ama gerçek FRM ile uyuşmayan bir kâğıt üretirdi — denetimde
 * bu, formun hiç basılmamasından kötüdür. Şablonu olmayan görevlerde
 * `GOREV_FISI` basılıyor: seri numarasını ve izlenebilirliği taşıyor, ama
 * formun yerine geçmediğini açıkça söylüyor.
 *
 * Dosya saf: veritabanı bilmiyor. Dinamik değerler (`anahtar`) çağıran
 * tarafta hazırlanıp `deger` sözlüğüyle geçiliyor.
 */

/** Alanı sistem mi dolduruyor, saha mı? Formun tamamı bu ayrım üzerine kurulu. */
export type AlanKaynagi = "SISTEM" | "SAHA";

export interface FormAlani {
  etiket: string;
  kaynak: AlanKaynagi;
  /** SISTEM ise değerin okunacağı anahtar. */
  anahtar?: string;
  /** SISTEM ise ve anahtar yoksa: sabit metin. */
  sabit?: string;
  /** Satırın tamamını kaplasın (uzun alanlar için). */
  genis?: boolean;
}

export interface FormSutun {
  baslik: string;
  kaynak: AlanKaynagi;
  /** SISTEM sütunuysa satır nesnesinden okunacak anahtar. */
  anahtar?: string;
  /** Yüzde genişlik; toplamı 100 olmalı. */
  genislik: number;
}

export interface FormSablonu {
  kod: string;
  ad: string;
  versiyon: string;
  ilgiliProsedur: string;
  saklama: string;
  /** Tablo öncesi başlık alanları. */
  ustAlanlar: FormAlani[];
  sutunlar: FormSutun[];
  /** Kaç satırlık boş ızgara basılacak (sistem satırı yoksa). */
  satirSayisi: number;
  /** Tablo sonrası değerlendirme/onay blokları. */
  altAlanlar?: FormAlani[];
  imzalar: { unvan: string; ad?: string }[];
  notlar?: string[];
}

/**
 * GÖREV FİŞİ — şablonu tanımlı olmayan her görev için.
 *
 * Formun kendisi değil; işin kimliğini ve baskı seri numarasını taşıyan
 * kapak sayfası. Personel bunu doküman setinden aldığı gerçek forma
 * iliştiriyor, böylece "hangi görev için, hangi nüsha" bağı kopmuyor.
 */
export const GOREV_FISI: FormSablonu = {
  kod: "GRV-FIS",
  ad: "Görev Fişi",
  versiyon: "01",
  ilgiliProsedur: "SOP-KG-01",
  saklama: "5 yıl",
  ustAlanlar: [
    { etiket: "Görev No", kaynak: "SISTEM", anahtar: "gorevKod" },
    { etiket: "Dönem", kaynak: "SISTEM", anahtar: "donem" },
    { etiket: "Faaliyet", kaynak: "SISTEM", anahtar: "faaliyet", genis: true },
    { etiket: "Dayanak", kaynak: "SISTEM", anahtar: "dayanak" },
    { etiket: "Periyot", kaynak: "SISTEM", anahtar: "periyot" },
    { etiket: "Son tarih", kaynak: "SISTEM", anahtar: "vade" },
    { etiket: "Sorumlu", kaynak: "SISTEM", anahtar: "sorumlu" },
    { etiket: "Kullanılacak form", kaynak: "SISTEM", anahtar: "formKod" },
    { etiket: "Kayıt saklama", kaynak: "SISTEM", anahtar: "saklama" },
  ],
  sutunlar: [],
  satirSayisi: 0,
  altAlanlar: [
    { etiket: "Yapıldığı tarih / saat", kaynak: "SAHA" },
    { etiket: "Yapan (ad-soyad)", kaynak: "SAHA" },
    { etiket: "Gözlem / not", kaynak: "SAHA", genis: true },
  ],
  imzalar: [{ unvan: "Yapan" }, { unvan: "Kontrol eden (KG-KK)" }],
  notlar: [
    "BU FİŞ FORMUN YERİNE GEÇMEZ. Yukarıda belirtilen FRM kodlu formu güncel doküman setinden alın, bu fişi doldurulmuş forma iliştirin.",
    "Fiş üzerindeki baskı seri numarası, bu görevin hangi nüshayla yapıldığının tek kanıtıdır.",
  ],
};

/**
 * Yapısı BİREBİR doğrulanmış şablonlar.
 *
 * Sütunlar ve üst alanlar doküman setindeki formdan çıkarıldı; uydurulmuş
 * alan YOK. Yeni bir form eklerken kaynağı aynı biçimde teyit edilmeli —
 * yaklaşık bir kopya, denetimde uyuşmazlık demektir.
 */
export const FORM_SABLONLARI: Record<string, FormSablonu> = {
  "FRM-TE-20": {
    kod: "FRM-TE-20",
    ad: "Günlük Sıcaklık ve Nem İzleme Kaydı",
    versiyon: "01",
    ilgiliProsedur: "SOP-TE-09",
    saklama: "5 yıl",
    ustAlanlar: [
      { etiket: "Ay / Yıl", kaynak: "SISTEM", anahtar: "ayYil" },
      { etiket: "Alan", kaynak: "SISTEM", anahtar: "alan" },
      // Tanımlı aralık SOP-TE-09'dan geliyor; sahada hatırlanmaya
      // bırakılmıyor — limitin yanlış hatırlanması, sapmanın fark
      // edilmemesi demek.
      { etiket: "Tanımlı Aralık", kaynak: "SISTEM", anahtar: "aralik" },
      { etiket: "Cihaz Kimlik No / Kalibrasyon", kaynak: "SAHA" },
    ],
    sutunlar: [
      { baslik: "Tarih", kaynak: "SISTEM", anahtar: "tarih", genislik: 16 },
      { baslik: "Sabah °C", kaynak: "SAHA", genislik: 14 },
      { baslik: "Sabah %BN", kaynak: "SAHA", genislik: 14 },
      { baslik: "Akşam °C", kaynak: "SAHA", genislik: 14 },
      { baslik: "Akşam %BN", kaynak: "SAHA", genislik: 14 },
      { baslik: "Aralıkta", kaynak: "SAHA", genislik: 14 },
      { baslik: "Paraf", kaynak: "SAHA", genislik: 14 },
    ],
    satirSayisi: 31,
    imzalar: [
      { unvan: "Dolduran — Teknik Sorumlu" },
      { unvan: "Kontrol Eden — KG-KK Sorumlusu", ad: "İrem ERÇELİK" },
    ],
    notlar: [
      "Tanımlı aralık dışındaki her ölçüm için FRM-TE-21 Sıcaklık-Nem Sapma ve Eylem Kaydı açılır.",
    ],
  },

  "FRM-DE-05": {
    kod: "FRM-DE-05",
    ad: "Periyodik Stok Sayım ve Mutabakat Tutanağı",
    versiyon: "01",
    ilgiliProsedur: "SOP-DE-03",
    saklama: "5 yıl",
    ustAlanlar: [
      { etiket: "Sayım Tarihi", kaynak: "SAHA" },
      { etiket: "Sayım Türü", kaynak: "SISTEM", anahtar: "sayimTuru" },
      { etiket: "Sayıma Katılanlar", kaynak: "SAHA", genis: true },
      { etiket: "Mesul Müdür Gözetimi (yıllık)", kaynak: "SAHA" },
    ],
    // "Kayıtlı Stok" sütunu SİSTEMDEN geliyor — kullanıcının istediği asıl
    // kolaylık bu. Sahada yapılacak iş fiziki sayımı yazmak; kayıtlı stoğu
    // ekrandan bakıp kâğıda geçirmek hem zaman kaybı hem kopyalama hatası
    // kaynağıydı. FARK sütunu bilerek BOŞ: hesabı sayımı yapan yapmalı.
    sutunlar: [
      { baslik: "Materyal / Ürün", kaynak: "SISTEM", anahtar: "materyal", genislik: 24 },
      { baslik: "Lot No", kaynak: "SISTEM", anahtar: "lot", genislik: 16 },
      { baslik: "Kayıtlı Stok", kaynak: "SISTEM", anahtar: "kayitli", genislik: 13 },
      { baslik: "Fiziki Sayım", kaynak: "SAHA", genislik: 13 },
      { baslik: "Fark", kaynak: "SAHA", genislik: 10 },
      { baslik: "Fark %", kaynak: "SAHA", genislik: 9 },
      { baslik: "Açıklama", kaynak: "SAHA", genislik: 15 },
    ],
    satirSayisi: 20,
    altAlanlar: [
      { etiket: "Fark Tespit Edildi mi?", kaynak: "SAHA", genis: true },
      { etiket: "İnceleme Kapsamı (kamera / erişim / hareket kaydı)", kaynak: "SAHA", genis: true },
      { etiket: "Açıklanamayan Kayıp Var mı? / Kuruma bildirim tarihi", kaynak: "SAHA", genis: true },
      { etiket: "BÜTS Bildirim Ref. No", kaynak: "SAHA" },
    ],
    imzalar: [
      { unvan: "Dolduran — Depo Sorumlusu" },
      { unvan: "Kontrol Eden — KG-KK Sorumlusu", ad: "İrem ERÇELİK" },
      { unvan: "Onaylayan — Mesul Müdür", ad: "Salih ÖZKAN" },
    ],
    notlar: [
      "Açıklanamayan kayıpta SOP-DE-03 md. 5.2 uyarınca inceleme başlatılır ve Kuruma bildirilir.",
    ],
  },
};

export function sablonBul(formKod: string | null | undefined): FormSablonu {
  if (!formKod) return GOREV_FISI;
  return FORM_SABLONLARI[formKod] ?? GOREV_FISI;
}

/** Şablonu birebir doğrulanmış form kodları — ekranda ayırt etmek için. */
export function sablonTanimliMi(formKod: string | null | undefined): boolean {
  return !!formKod && formKod in FORM_SABLONLARI;
}
