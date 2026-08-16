/**
 * Ortak tipler ve rol tanımları.
 *
 * Roller GMP görev tanımlarından (GT-01 … GT-06) geliyor; uydurma bir hiyerarşi
 * değil. Yetki dağılımı Ek-13 "Kritik Kontrol Noktaları" tablosundaki
 * "Durdurma Yetkisi" kolonuna göre:
 *   - Ham madde / bitmiş ürün kabul-ret  → KG-KK
 *   - Seri serbest bırakma, sevkiyat     → Mesul Müdür
 *   - Proses adımları                    → Üretim Sorumlusu
 */

/**
 * Roller. SIRA ÖNEMLİ: yetki genişliğine göre azalan — ekranlarda bu sırayla
 * listeleniyor.
 *
 * `admin` ile `yonetici` ayrımı bilinçli:
 *
 *   admin    → SİSTEMİN sahibi. Yetkilendirme dâhil her şeyi yapar, yetkileri
 *              kısıtlanamaz. Kilitlenmeye karşı emniyet: yetkileri
 *              düzenlenebilir olsaydı, son admin kendi yetkisini kapatıp
 *              sistemi kimsenin açamayacağı hâle getirebilirdi.
 *   yonetici  → İŞLETMENİN yöneticisi. Rollerin yetkilerini düzenler ve
 *              operasyonun tamamını görür, ama admin'in yetkisini değiştiremez.
 *
 * Diğer roller GMP görev tanımlarından (GT-01 … GT-06) geliyor:
 * mesul_mudur=GT-01, uretim=GT-02, kg_kk=GT-03, depo=GT-05, teknik=GT-06.
 * (GT-04 Üretim Operatörü henüz ayrı rol değil; günlük görev kuyruğunu
 * `uretim` rolü üzerinden görüyor.)
 *
 * `yk_baskani` bir GT karşılığı DEĞİL, bir ERİŞİM SINIRIDIR: yönetim kurulu
 * başkanı operasyona girmez, ayda bir özet panele bakar. Var olan bir rolü
 * kısıtlamak yerine ayrı rol açıldı — "yönetici ama şunları görmesin" biçimi
 * denetimde açıklanamaz, rol tanımı açıklanabilir.
 */
export const ROLLER = [
  "admin",
  "yonetici",
  "yk_baskani",
  "mesul_mudur",
  "kg_kk",
  "uretim",
  "teknik",
  "depo",
  "okuyucu",
] as const;

export type Rol = (typeof ROLLER)[number];

export const ROL_ETIKETLERI: Record<Rol, string> = {
  admin: "Admin (tam sistem yetkisi)",
  yonetici: "Yönetici",
  yk_baskani: "Yönetim Kurulu Başkanı (özet)",
  mesul_mudur: "Mesul Müdür",
  kg_kk: "Kalite Güvence / Kalite Kontrol",
  uretim: "Üretim Sorumlusu",
  teknik: "Teknik ve Bakım Sorumlusu",
  depo: "Depo Sorumlusu",
  okuyucu: "Okuyucu (salt görüntüleme)",
};

export function rolGecerli(v: unknown): v is Rol {
  return typeof v === "string" && (ROLLER as readonly string[]).includes(v);
}

export interface Kullanici {
  id: number;
  ad_soyad: string;
  email: string;
  rol: Rol;
  gorev_kodu: string | null;
  /** Kişiye özel ekran istisnaları — rol ayarını ezer. */
  ekran_izinleri: Record<string, boolean>;
  /**
   * ROLÜN düzenlenmiş yetkileri (Roller ekranından). Yalnızca varsayılandan
   * SAPMA kaydediliyor; burada karşılığı olmayan her ekran/eylem için kodda
   * yazan GMP varsayılanı geçerli. Denetimde "bu rol varsayılandan şu
   * noktada ayrılmış" sorusunun cevabı da bu.
   */
  rol_ekran_izinleri?: Record<string, boolean>;
  rol_eylem_izinleri?: Record<string, boolean>;
}

/** Ham madde ve seri statüleri — Ek-13 akış şemasındaki etiket renkleriyle aynı. */
export type Statu = "KARANTINA" | "SERBEST" | "RET";

/**
 * Ambalaj birimi statüsü. Zincirde ilerledikçe tek yönlü değişir.
 *
 * ÇALIŞMA ZAMANINDA DA VAR (`as const` dizi). Yalnızca tip olsaydı, statü
 * adlarını elle tekrar yazan bir yer sessizce ayrışabilirdi: hiçbir gerçek
 * paketle eşleşmeyen bir statü adı derlemeden geçer, testten de geçer (test
 * verisi de aynı yanlış adı kullanır) ve ancak sahada fark edilir.
 */
export const PAKET_STATULERI = ["SERBEST", "SEVK", "SATILDI", "RET"] as const;
export type PaketStatu = (typeof PAKET_STATULERI)[number];

export type UrunTipi = "DISTILAT" | "IZOLAT";

export const URUN_ADI: Record<UrunTipi, string> = {
  DISTILAT: "CBD Distilat",
  IZOLAT: "CBD İzolat",
};

export type AliciTip = "DEPO" | "ECZANE";

/** BÜTS bildirim tipleri — SOP-ÜR-16 md. 2 kapsamı. */
export type ButsTip =
  | "URETIM_GIRDI"
  | "URETIM"
  | "AMBALAJ"
  | "SEVKIYAT"
  | "SATIS"
  | "RET"
  | "FIRE"
  | "IMHA"
  | "GERI_CEKME";

export const BUTS_ETIKETLERI: Record<ButsTip, string> = {
  URETIM_GIRDI: "Ham madde girişi",
  URETIM: "Üretim bildirimi",
  AMBALAJ: "Ambalajlama",
  SEVKIYAT: "Sevkiyat",
  SATIS: "Satış / teslim",
  RET: "Ret kararı",
  FIRE: "Fire",
  IMHA: "İmha",
  GERI_CEKME: "Geri çekme",
};
