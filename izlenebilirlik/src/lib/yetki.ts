/**
 * YETKİ — ekran erişimi ve eylem yetkileri. TEK YER.
 *
 * İki katman var ve ikisi de gerekli:
 *
 *   EKRAN yetkisi  → kullanıcı o sayfayı görebilir mi?
 *   EYLEM yetkisi  → o sayfada kritik düğmeye basabilir mi?
 *
 * Ekran yetkisi tek başına yetmez. Depo sorumlusu Üretim ekranını görmese de
 * seri serbest bırakma UCUNA istek atabilir; eylem yetkisi orada devreye
 * giriyor. Tersi de doğru: KG-KK üretim ekranını görür ama serbest bırakma
 * kararını Mesul Müdür verir (Ek-13 "Durdurma Yetkisi" kolonu).
 *
 * MENÜYÜ GİZLEMEK KONTROL DEĞİLDİR. Her sayfa `ekranKoru`, her API ucu
 * `ekranYok` veya `eylemYok` çağırır.
 */

import type { Kullanici, Rol } from "./types.ts";

/**
 * Ekranlar — MENÜ SIRASI da budur.
 *
 * `sifre` en sonda: `ilkGorunurEkran` listenin ilkini döndürüyor ve hiç kimse
 * giriş yapınca şifre ekranına düşmemeli.
 */
export const EKRANLAR = [
  "panel",
  "hizli",
  "gorev",
  "ciftci",
  "hammadde",
  "uretim",
  "ambalaj",
  "sevkiyat",
  "satis",
  "izleme",
  "gericekme",
  "buts",
  "sapma",
  "imha",
  "iade",
  "denetim",
  "hareketler",
  "ozet",
  "roller",
  "kullanicilar",
  "sifre",
] as const;

export type Ekran = (typeof EKRANLAR)[number];

/**
 * Ekran → ikon adı (lucide-react).
 *
 * İkonlar etiketin YERİNE değil YANINA: yalnız ikon, 19 ekranlı bir sistemde
 * tahmin oyununa dönüşür. Yan yana durduklarında göz, metni okumadan doğru
 * satıra iniyor.
 */
export const EKRAN_IKONLARI: Record<Ekran, string> = {
  panel: "LayoutDashboard",
  hizli: "Zap",
  gorev: "CalendarCheck",
  ciftci: "Sprout",
  hammadde: "PackageOpen",
  uretim: "FlaskConical",
  ambalaj: "QrCode",
  sevkiyat: "Truck",
  satis: "Store",
  izleme: "Search",
  gericekme: "Undo2",
  buts: "Send",
  sapma: "TriangleAlert",
  imha: "Trash2",
  iade: "RotateCcw",
  denetim: "ClipboardCheck",
  hareketler: "History",
  ozet: "ChartNoAxesColumn",
  roller: "ShieldCheck",
  kullanicilar: "Users",
  sifre: "KeyRound",
};

export const EKRAN_ETIKETLERI: Record<Ekran, string> = {
  panel: "Panel",
  hizli: "Hızlı İşlem",
  gorev: "Görev Takvimi",
  ciftci: "Çiftçi",
  hammadde: "Ham Madde",
  uretim: "Üretim Serisi",
  ambalaj: "Ambalaj & Karekod",
  sevkiyat: "Sevkiyat",
  satis: "Eczane Satışı",
  izleme: "İzleme Sorgusu",
  gericekme: "Geri Çekme",
  buts: "BÜTS Bildirimleri",
  sapma: "Sapma / CAPA",
  imha: "Fire ve İmha",
  iade: "İade ve Şikayet",
  denetim: "Ön Denetim Raporu",
  hareketler: "Denetim İzi",
  ozet: "Yönetim Özeti",
  roller: "Roller ve Yetkiler",
  kullanicilar: "Kullanıcılar",
  sifre: "Şifremi Değiştir",
};


/**
 * MENÜ GRUPLARI — 19 maddelik düz liste taranamıyordu.
 *
 * Gruplama SOP yapısını izliyor: Operasyon (Ek-13 akışının halkaları),
 * Kalite (KG-KK'nın masası), Mevzuat & Denetim (Kurum ve müfettişle temas),
 * Yönetim (sistem idaresi). `panel` ve `hizli` grupsuz — her rolün günlük
 * giriş noktaları, başlık altına gömülmemeli.
 *
 * Her ekran TAM BİR grupta olmalı; test bunu koruyor. Buradan çıkarılan bir
 * ekran menüden sessizce kaybolur — derleme hatası vermez, kullanıcı görür.
 */
export const EKRAN_GRUPLARI: { baslik: string | null; ekranlar: readonly Ekran[] }[] = [
  // `gorev` grupsuz ve üstte: sahadaki personelin GÜNLÜK giriş noktası burası.
  // Bir başlık altına gömülseydi, günün işini görmek için önce menü açmak
  // gerekirdi — periyodik görevin unutulma sebebi tam olarak bu tür sürtünme.
  { baslik: null, ekranlar: ["panel", "hizli", "gorev"] },
  { baslik: "Operasyon", ekranlar: ["ciftci", "hammadde", "uretim", "ambalaj", "sevkiyat", "satis"] },
  { baslik: "Kalite", ekranlar: ["izleme", "gericekme", "sapma", "imha", "iade"] },
  { baslik: "Mevzuat & Denetim", ekranlar: ["buts", "denetim", "hareketler"] },
  { baslik: "Yönetim", ekranlar: ["ozet", "roller", "kullanicilar", "sifre"] },
];

/**
 * Rol → görebileceği ekranlar.
 *
 * Görev tanımlarından (GT-01 … GT-06) türetildi. `okuyucu` denetçi/danışman
 * için: her şeyi görür, hiçbir şeyi değiştiremez.
 */
export const ROL_EKRANLARI: Record<Rol, readonly Ekran[]> = {
  // Admin'in yetkisi burada değil, `ekranGorunur` içinde koşulsuz veriliyor.
  // Yine de tam liste yazılı ki Roller ekranı ne gördüğünü gösterebilsin.
  admin: EKRANLAR,
  yonetici: EKRANLAR,
  /**
   * YÖNETİM KURULU BAŞKANI — bilerek DAR.
   *
   * İstenen şey "ayda bir bakılacak beş kalemlik özet". Operasyon ekranlarını
   * açmak, hem gereksiz hem riskli: her ekran bir yetki yüzeyidir ve bu hesap
   * günlük kullanılmadığı için en geç fark edilecek olan da odur.
   */
  yk_baskani: ["ozet", "denetim", "sifre"],
  mesul_mudur: EKRANLAR.filter((e) => e !== "roller"),
  kg_kk: [
    "panel", "hizli", "gorev", "ciftci", "hammadde", "uretim", "ambalaj",
    "sevkiyat", "satis", "izleme", "gericekme", "buts", "sapma", "imha", "iade", "denetim", "hareketler", "sifre",
  ],
  uretim: ["panel", "hizli", "gorev", "hammadde", "uretim", "ambalaj", "izleme", "sapma", "imha", "sifre"],
  /**
   * TEKNİK VE BAKIM (GT-06) — SOP-TE'nin sahibi.
   *
   * Kalibrasyon, HVAC, zararlı kontrolü, yangın ekipmanı: periyodik görevlerin
   * büyük bölümü bu rolde. Rol yokken bu görevlerin sistemde sorumlusu
   * olmuyordu; sorumlusu olmayan periyodik görev, yapılmayan görevdir.
   */
  teknik: ["panel", "hizli", "gorev", "izleme", "sapma", "sifre"],
  depo: ["panel", "hizli", "gorev", "hammadde", "ambalaj", "sevkiyat", "satis", "izleme", "imha", "iade", "sifre"],
  // Okuyucu hiçbir kayıt değiştiremez ama KENDİ şifresini değiştirebilmeli:
  // hesabın sahibi odur ve şifresini yalnızca Mesul Müdür'ün bilmesi
  // atfedilebilirliği (ALCOA+) zayıflatır.
  okuyucu: ["panel", "hizli", "gorev", "izleme", "buts", "sapma", "imha", "iade", "denetim", "hareketler", "ozet", "sifre"],
};

/**
 * ADMİN HER ŞEYİ YAPAR — ve bu kısıtlanamaz.
 *
 * Kilitlenme emniyeti: admin yetkisi Roller ekranından düzenlenebilir olsaydı,
 * son admin kendi yetkisini kapatıp sistemi kimsenin açamayacağı hâle
 * getirebilirdi. Veritabanına elle müdahale dışında dönüşü olmazdı.
 */
export function adminMi(k: Kullanici | null): boolean {
  return k?.rol === "admin";
}

/**
 * Kullanıcı bu ekranı görebilir mi?
 *
 * ÜÇ KATMAN, en özelden en genele:
 *
 *   1. Kişisel izin (`ekran_izinleri`) — bir kişiye özel istisna
 *   2. Rolün düzenlenmiş izni (`rol_ekran_izinleri`) — Roller ekranından
 *   3. Koddaki GMP varsayılanı (`ROL_EKRANLARI`)
 *
 * Yalnızca SAPMA saklanıyor: bir katmanda kayıt yoksa bir alttakine düşülüyor.
 * Böylece denetimde "bu rol varsayılandan nerede ayrılmış" tek bakışta
 * görülüyor; tüm izinler kopyalansaydı varsayılanın ne olduğu kaybolurdu.
 */
export function ekranGorunur(k: Kullanici | null, ekran: Ekran): boolean {
  if (!k) return false;
  if (adminMi(k)) return true;

  const kisisel = k.ekran_izinleri?.[ekran];
  if (kisisel !== undefined) return kisisel;

  const rolAyari = k.rol_ekran_izinleri?.[ekran];
  if (rolAyari !== undefined) return rolAyari;

  return ROL_EKRANLARI[k.rol]?.includes(ekran) ?? false;
}

/** Kullanıcının görebildiği ekranlar, menü sırasıyla. */
export function gorunurEkranlar(k: Kullanici | null): Ekran[] {
  if (!k) return [];
  return EKRANLAR.filter((e) => ekranGorunur(k, e));
}

/**
 * Kapalı bir ekrana giden kullanıcıyı boş sayfaya değil, görebildiği ilk
 * ekrana bırak.
 */
export function ilkGorunurEkran(k: Kullanici | null): string {
  if (!k) return "/login";
  const ilk = gorunurEkranlar(k)[0];
  // Hiçbir ekranı olmayan kullanıcı = yetkisi alınmış hesap. Panele değil
  // girişe gönderiliyor; aksi halde sonsuz yönlendirme olur.
  if (!ilk) return "/login";
  return ilk === "panel" ? "/panel" : `/panel/${ilk}`;
}

// ── Eylem yetkileri ─────────────────────────────────────────────────────────

/**
 * Kritik eylemler ve onları yapabilecek roller.
 *
 * Kaynak: Ek-13 "Kritik Kontrol Noktaları Özeti" tablosunun "Durdurma Yetkisi"
 * kolonu. Uydurulmuş bir hiyerarşi değil — denetimde bu tabloyla karşılaştırılır.
 */
const EYLEM_ROLLERI = {
  /** Çiftçi/tedarikçi kaydı açma — SOP-KG-08. */
  ciftci_yaz: ["yonetici", "mesul_mudur", "kg_kk", "depo"],
  /** Ham madde teslimatı kabul etme. */
  hammadde_kabul: ["yonetici", "mesul_mudur", "kg_kk", "depo"],
  /** Analiz sonucu girip kabul/ret kararı verme — Ek-13 adım 2, KG-KK. */
  analiz_karar: ["yonetici", "mesul_mudur", "kg_kk"],
  /** Üretim serisi açma — Üretim Sorumlusu. */
  seri_ac: ["yonetici", "mesul_mudur", "uretim"],
  /** Seri serbest bırakma — Ek-13 adım 15, MESUL MÜDÜR. */
  seri_serbest: ["yonetici", "mesul_mudur"],
  /** Ambalajlama ve karekod üretimi — Ek-13 adım 12. */
  ambalajla: ["yonetici", "mesul_mudur", "uretim", "depo"],
  /** Alıcı (ecza deposu / eczane) tanımlama. */
  alici_yaz: ["yonetici", "mesul_mudur", "kg_kk", "depo"],
  /** Sevkiyat kaydı — Ek-13 adım 16, Mesul Müdür onayı gerekir. */
  sevk_yaz: ["yonetici", "mesul_mudur", "depo"],
  /** Hastaya satış kaydı. */
  satis_yaz: ["yonetici", "mesul_mudur", "depo", "kg_kk"],
  /** Geri çekme başlatma — SOP-KG-07, Mesul Müdür. */
  gericekme_baslat: ["yonetici", "mesul_mudur"],
  /** BÜTS bildirimini gönderildi işaretleme — SOP-ÜR-16, KG-KK. */
  buts_isaretle: ["yonetici", "mesul_mudur", "kg_kk"],
  /** Etiket mutabakatı kaydı — FRM-ÜR-12, durdurma yetkisi KG-KK'da. */
  mutabakat_yaz: ["yonetici", "mesul_mudur", "kg_kk"],
  /** Sapma / CAPA kaydı açma. Sahada gören herkes açabilmeli. */
  sapma_ac: ["yonetici", "mesul_mudur", "kg_kk", "uretim", "teknik", "depo"],
  /** Sapma kapatma — kök neden ve CAPA değerlendirmesi KG-KK'nın işi. */
  sapma_kapat: ["yonetici", "mesul_mudur", "kg_kk"],
  /** İmha tutanağı — SOP-ÜR-15, Mesul Müdür ve KG-KK. */
  imha_yaz: ["yonetici", "mesul_mudur", "kg_kk"],
  /** Proses içi kontrol kaydı — sahada ölçümü alan kişi girer. */
  proses_yaz: ["yonetici", "mesul_mudur", "kg_kk", "uretim"],
  /** Şahit numune kaydı — SOP-KK-10, KG-KK sorumluluğu. */
  numune_yaz: ["yonetici", "mesul_mudur", "kg_kk"],
  /** İade kabulü — ürünü fiziksel teslim alan depo. */
  iade_yaz: ["yonetici", "mesul_mudur", "kg_kk", "depo"],
  /** İade kararı (stoğa / imha) — KG-KK değerlendirmesi. */
  iade_karar: ["yonetici", "mesul_mudur", "kg_kk"],
  /** Şikayet kaydı açma — şikayeti alan herkes. */
  sikayet_yaz: ["yonetici", "mesul_mudur", "kg_kk", "depo"],
  /** Şikayet değerlendirme ve kapatma — SOP-KG-07. */
  sikayet_kapat: ["yonetici", "mesul_mudur", "kg_kk"],
  /**
   * Görev kural tablosunu düzenleme ve ONAYLAMA — SOP-KG-01.
   *
   * Kural tablosu, SOP'lardaki periyodik hükümlerin makine okunur hâli; yani
   * fiilen yıllık faaliyet planıdır ve kontrollü bir dokümandır. Onaylanmamış
   * kural görev ÜRETMEZ: takvimi kimin, neye dayanarak kurduğu belli olmadan
   * "sistem söylemedi" savunması denetimde geçmez.
   */
  gorev_kural_yonet: ["yonetici", "mesul_mudur", "kg_kk"],
  /**
   * Görev işlemleri — form basma, sahaya teslim, imzalı kaydı arşivleme.
   *
   * Görevin sorumlusu kendi formunu basar; bu yüzden saha rolleri de dâhil.
   * `okuyucu` doğal olarak dışarıda (hiçbir eylemi yapamaz).
   */
  gorev_islem: ["yonetici", "mesul_mudur", "kg_kk", "uretim", "teknik", "depo"],
  /** Kullanıcı yönetimi. */
  kullanici_yonet: ["yonetici", "mesul_mudur"],
  /**
   * Rollerin yetkilerini düzenleme.
   *
   * Mesul Müdür'de YOK ve bu bilinçli: GMP'de Mesul Müdür ürün kararlarının
   * sorumlusu, sistemin yetkilendirme sorumlusu değil. Kendi yetkisini
   * genişletebilen bir rol, yetki ayrımını anlamsız kılar.
   */
  rol_yonet: ["yonetici"],
} as const satisfies Record<string, readonly Rol[]>;

export type Eylem = keyof typeof EYLEM_ROLLERI;

export const EYLEM_ETIKETLERI: Record<Eylem, string> = {
  ciftci_yaz: "çiftçi kaydı açma",
  hammadde_kabul: "ham madde kabulü",
  analiz_karar: "analiz kabul/ret kararı",
  seri_ac: "üretim serisi açma",
  seri_serbest: "seri serbest bırakma",
  ambalajla: "ambalajlama ve karekod üretimi",
  alici_yaz: "alıcı tanımlama",
  sevk_yaz: "sevkiyat kaydı",
  satis_yaz: "hastaya satış kaydı",
  gericekme_baslat: "geri çekme başlatma",
  buts_isaretle: "BÜTS bildirimi işaretleme",
  mutabakat_yaz: "etiket mutabakatı kaydı",
  sapma_ac: "sapma kaydı açma",
  sapma_kapat: "sapma kapatma",
  imha_yaz: "imha tutanağı",
  proses_yaz: "proses içi kontrol kaydı",
  numune_yaz: "şahit numune kaydı",
  iade_yaz: "iade kabulü",
  iade_karar: "iade kararı",
  sikayet_yaz: "şikayet kaydı",
  sikayet_kapat: "şikayet kapatma",
  gorev_kural_yonet: "görev kuralı düzenleme / onaylama",
  gorev_islem: "görev formu basma ve arşivleme",
  kullanici_yonet: "kullanıcı yönetimi",
  rol_yonet: "rol yetkilerini düzenleme",
};

export const EYLEMLER = Object.keys(EYLEM_ROLLERI) as Eylem[];

/** Eylemin koddaki GMP varsayılanında bu rol var mı? */
export function eylemVarsayilani(rol: Rol, eylem: Eylem): boolean {
  return (EYLEM_ROLLERI[eylem] as readonly Rol[]).includes(rol);
}

/**
 * Kaynağı mevzuat olan, Roller ekranından DEĞİŞTİRİLEMEYEN eylemler.
 *
 * Diğer her yetki serbestçe düzenlenebiliyor; bu ikisi düzenlenemiyor çünkü
 * sorumluyu işletme değil mevzuat belirliyor:
 *
 *   seri_serbest      → Ek-13 adım 15, seriyi piyasaya veren Mesul Müdür'dür
 *   gericekme_baslat  → SOP-KG-07, geri çekme kararı Mesul Müdür'ündür
 *
 * Bunları bir depo sorumlusuna açmak, sistemi denetimde savunulamaz hâle
 * getirirdi — ekranda düğme olması, kararın hukuken o kişiye geçtiği anlamına
 * gelmiyor. Admin bu kısıtın dışında: sistemin sahibi.
 */
export const KILITLI_EYLEMLER: readonly Eylem[] = ["seri_serbest", "gericekme_baslat"];

export function eylemKilitliMi(eylem: Eylem): boolean {
  return KILITLI_EYLEMLER.includes(eylem);
}

/**
 * Kullanıcı bu eylemi yapabilir mi?
 *
 * `ekranGorunur` ile aynı katman düzeni: admin koşulsuz, sonra rolün
 * düzenlenmiş ayarı, sonra koddaki GMP varsayılanı. Eylemde KİŞİSEL istisna
 * yok — bir kişiye "sen de seri serbest bırakabilirsin" demek, görev
 * tanımını (GT-01…GT-06) belgede değil sistemde delmek olurdu.
 */
export function eylemYetkili(k: Kullanici | null, eylem: Eylem): boolean {
  if (!k) return false;
  if (adminMi(k)) return true;

  // `okuyucu` HİÇBİR eylemi yapamaz. Rolün tanımı bu; Roller ekranından
  // yanlışlıkla açılmasın diye burada kesiliyor.
  if (k.rol === "okuyucu") return false;

  // Mevzuatla sabit eylemler düzenlemeye kapalı — rol ayarı okunmuyor.
  if (!eylemKilitliMi(eylem)) {
    const rolAyari = k.rol_eylem_izinleri?.[eylem];
    if (rolAyari !== undefined) return rolAyari;
  }

  return eylemVarsayilani(k.rol, eylem);
}

/** API koruması — `if (eylemYok(k, "seri_serbest")) return 403`. */
export function eylemYok(k: Kullanici | null, eylem: Eylem): boolean {
  return !eylemYetkili(k, eylem);
}

/**
 * `atayanRol` bir hesaba `hedefRol` verebilir mi?
 *
 * YETKİ YÜKSELTME KORUMASI: `kullanici_yonet` Mesul Müdür'de de var. Bu
 * kontrol olmasaydı bir Mesul Müdür kendine `admin` rolünde ikinci bir hesap
 * açıp, mevzuatla kilitlenmiş yetkiler dâhil her şeyi eline geçirebilirdi.
 *
 * İLK KURULUM İSTİSNASI: sistemde hiç aktif admin yokken kural bir yumurta-
 * tavuk sorununa dönüşüyor — ilk admin'i kimse açamaz. Bu durumda kullanıcı
 * yönetimi yetkisi olan kişi ilk admin'i atayabiliyor.
 *
 * Bu bir taviz DEĞİL: o anda sistemdeki en yetkili rol zaten odur ve tüm
 * kullanıcıları yönetebiliyordur. Sahip olmadığı bir yetkiyi kendine vermiş
 * olmuyor. Bir admin var olduğu andan itibaren kural tam olarak işliyor.
 */
export function rolAtayabilir(
  atayanRol: Rol,
  hedefRol: Rol,
  ilkKurulum: boolean
): boolean {
  if (hedefRol === "admin") return atayanRol === "admin" || ilkKurulum;
  if (hedefRol === "yonetici") {
    return atayanRol === "admin" || atayanRol === "yonetici" || ilkKurulum;
  }
  return true;
}

/** Yetki reddi için tek biçimli açıklama. Kullanıcı NEDEN olmadığını görsün. */
export function yetkiMesaji(eylem: Eylem): string {
  const roller = (EYLEM_ROLLERI[eylem] as readonly Rol[])
    .map((r) => ROL_KISA[r])
    .join(", ");
  return `Bu işlem (${EYLEM_ETIKETLERI[eylem]}) için yetkiniz yok. Yetkili roller: ${roller}.`;
}

const ROL_KISA: Record<Rol, string> = {
  admin: "Admin",
  yonetici: "Yönetici",
  yk_baskani: "YK Başkanı",
  mesul_mudur: "Mesul Müdür",
  kg_kk: "KG-KK",
  uretim: "Üretim Sorumlusu",
  teknik: "Teknik ve Bakım",
  depo: "Depo Sorumlusu",
  okuyucu: "Okuyucu",
};
