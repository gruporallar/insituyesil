import { createClient, type Client, type InValue } from "@libsql/client";
import path from "path";
import { ROLLER } from "./types";
import { ozetHesapla, topluOzet } from "./logZinciri";

/**
 * VERİTABANI — Turso (libSQL) üretimde, yerel dosya geliştirmede.
 *
 * Şema, izlenebilirlik zincirinin halkalarını birebir karşılıyor:
 *
 *   ciftciler → hammadde → seri_girdileri → seriler → paketler
 *                                                   → sevkiyatlar → satislar
 *
 * Zincirin kırılmaması için yabancı anahtarlar tanımlı ve `PRAGMA foreign_keys`
 * açık. Bir çiftçiyi silmek, ona bağlı ham madde varken ENGELLENİR — GMP'de
 * kaydın kaynağı silinemez, kayıt beş yıl saklanır (SOP-KG-01).
 */

/**
 * Şifre asgari uzunluğu — TEK YER.
 *
 * NIST SP 800-63B karmaşıklık kuralı yerine uzunluk öneriyor: karmaşık kural
 * (büyük harf + rakam + sembol) kullanıcıyı `Sifre1!` yazmaya itiyor, uzunluk
 * gerçekten entropi ekliyor.
 */
export const MIN_SIFRE_UZUNLUK = 12;

// ── İstemci ──────────────────────────────────────────────────────────────────

let _client: Client | null = null;
let _initPromise: Promise<void> | null = null;

/** Sunucusuz üretim ortamında mıyız? */
function uretimOrtami(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL_ENV === "production";
}

function makeClient(): Client {
  // Boşluk kırpılıyor: panoya kopyalarken sona düşen bir boşluk ya da satır
  // sonu, `startsWith` kontrolünü sessizce geçersiz kılıyordu.
  const url = (process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  const token = (process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN || "").trim();

  if (url.startsWith("libsql://")) {
    if (!token) {
      throw new Error(
        "TURSO_DATABASE_URL tanımlı ama TURSO_AUTH_TOKEN boş. " +
          "Turso panelinden Read & Write yetkili bir token oluşturup ortam değişkenine ekleyin."
      );
    }
    return createClient({ url, authToken: token });
  }

  /**
   * ÜRETİMDE SESSİZCE DOSYAYA DÜŞÜLMEZ.
   *
   * Eski hâli bir hataydı: adres yoksa ya da biçimi bozuksa yerel bir SQLite
   * dosyası açılıyordu. Vercel'de dosya sistemi salt okunur olduğu için her
   * yazma işlemi anlamsız bir hatayla patlıyor ve kullanıcı "Beklenmeyen bir
   * hata oluştu" görüyordu — sorunun bir yapılandırma eksiği olduğu hiçbir
   * yerden anlaşılmıyordu. Yanlış yapılandırmayla ÇALIŞIR GÖRÜNMEK,
   * çalışmamaktan daha kötü.
   */
  if (uretimOrtami()) {
    throw new Error(
      url
        ? `TURSO_DATABASE_URL "libsql://" ile başlamıyor (alınan: "${url.slice(0, 12)}…"). ` +
          "Turso panelindeki Database URL değerini olduğu gibi kopyalayın."
        : "TURSO_DATABASE_URL tanımlı değil. Üretimde yerel dosya veritabanı kullanılamaz; " +
          "Vercel ortam değişkenlerine Turso adresini ve token'ını ekleyin."
    );
  }

  // Yalnızca YEREL GELİŞTİRMEDE dosyaya düşülür. `data/` .gitignore'da —
  // hasta ve çiftçi verisi içerdiği için asla depoya girmez.
  const dbPath = path.join(process.cwd(), "data", "izlenebilirlik.db");
  return createClient({ url: `file:${dbPath}` });
}

async function ensureClient(): Promise<Client> {
  if (!_client) {
    _client = makeClient();
    // Vercel serverless'ta her cold-start'ta 30+ DDL roundtrip ilk sayfadan
    // önce sıralı gider → 1,5–3 sn ek TTFB. Üretimde şema zaten kurulu olduğu
    // için Turso bağlantılarında ATLANIR; yeni tablo ekleyen bir deploy'dan
    // sonra bir kez `RUN_DB_INIT=1` ile çalıştırın.
    const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
    const turso = !!(url && url.startsWith("libsql://"));
    if (!turso || process.env.RUN_DB_INIT === "1") {
      _initPromise = initSchema(_client);
    }
  }
  if (_initPromise) {
    await _initPromise;
    _initPromise = null;
  }
  return _client;
}

// ── Şema ─────────────────────────────────────────────────────────────────────

async function initSchema(c: Client): Promise<void> {
  // Yabancı anahtar zorlaması SQLite'ta bağlantı başına AÇILMALI; varsayılan
  // KAPALI. Kapalıyken tanımlar dekoratif kalır ve sahipsiz kayıt oluşur.
  await c.execute("PRAGMA foreign_keys = ON");

  const tablolar = [
    `CREATE TABLE IF NOT EXISTS kullanicilar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ad_soyad TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      sifre_hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN ('admin','yonetici','mesul_mudur','kg_kk','uretim','depo','okuyucu')),
      gorev_kodu TEXT,
      aktif INTEGER NOT NULL DEFAULT 1,
      olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS oturumlar (
      token TEXT PRIMARY KEY,
      kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
      son_kullanim TEXT NOT NULL,
      olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    // Kişisel ekran izinleri — rol varsayılanını ezen istisnalar.
    `CREATE TABLE IF NOT EXISTS ekran_erisim (
      kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
      ekran TEXT NOT NULL,
      izin INTEGER NOT NULL,
      PRIMARY KEY (kullanici_id, ekran)
    )`,

    /**
     * SAYAÇLAR — kod numaralandırması.
     * Ayrı tablo, çünkü `MAX(id)+1` yarış koşuluna açık: iki eşzamanlı
     * ambalajlama isteği aynı tekil seri numarasını üretebilir ve karekodun
     * tekilliği izlenebilirliğin tek dayanağı.
     */
    `CREATE TABLE IF NOT EXISTS sayaclar (
      ad TEXT PRIMARY KEY,
      deger INTEGER NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS ciftciler (
      kod TEXT PRIMARY KEY,
      ad TEXT NOT NULL,
      tc_vkn TEXT NOT NULL,
      cks_no TEXT,
      izin_no TEXT NOT NULL,
      il TEXT NOT NULL,
      ilce TEXT,
      parsel TEXT,
      alan_dekar REAL,
      tel TEXT,
      olusturan_id INTEGER REFERENCES kullanicilar(id),
      olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS hammadde (
      lot TEXT PRIMARY KEY,
      ciftci_kod TEXT NOT NULL REFERENCES ciftciler(kod),
      teslim_tarihi TEXT NOT NULL,
      miktar_kg REAL NOT NULL,
      kalan_kg REAL NOT NULL,
      hasat_yili INTEGER,
      nem REAL,
      irsaliye TEXT,
      statu TEXT NOT NULL DEFAULT 'KARANTINA'
        CHECK(statu IN ('KARANTINA','SERBEST','RET')),
      thc REAL,
      cbd REAL,
      analiz_rapor_no TEXT,
      analiz_tarihi TEXT,
      lab TEXT,
      ret_nedeni TEXT,
      olusturan_id INTEGER REFERENCES kullanicilar(id),
      olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS seriler (
      seri TEXT PRIMARY KEY,
      urun_tipi TEXT NOT NULL CHECK(urun_tipi IN ('DISTILAT','IZOLAT')),
      uretim_tarihi TEXT NOT NULL,
      sorumlu TEXT NOT NULL,
      girdi_kg REAL NOT NULL,
      cikti_kg REAL,
      fire_kg REAL,
      numune_kg REAL,
      mb REAL,
      cbd REAL,
      thc REAL,
      cozucu REAL,
      statu TEXT NOT NULL DEFAULT 'KARANTINA'
        CHECK(statu IN ('KARANTINA','SERBEST','RET')),
      serbest_kisi TEXT,
      serbest_tarih TEXT,
      ret_nedeni TEXT,
      -- Ambalajlanan miktar gram cinsinden birikiyor; seriden fazla
      -- ambalajlamayı engelleyen kontrol buna bakıyor.
      ambalajlanan_g REAL NOT NULL DEFAULT 0,
      olusturan_id INTEGER REFERENCES kullanicilar(id),
      olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    /**
     * SERİ GİRDİLERİ — soyağacının kalbi.
     * Bir seri birden fazla lottan, bir lot birden fazla seriye beslenebilir
     * (çok-a-çok). Tek kolonluk `lot` alanı bu gerçeği taşıyamazdı ve geri
     * çekmede ikinci seriyi kaçırırdı.
     */
    `CREATE TABLE IF NOT EXISTS seri_girdileri (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seri TEXT NOT NULL REFERENCES seriler(seri) ON DELETE CASCADE,
      lot TEXT NOT NULL REFERENCES hammadde(lot),
      kg REAL NOT NULL,
      UNIQUE(seri, lot)
    )`,

    `CREATE TABLE IF NOT EXISTS aliciar (
      kod TEXT PRIMARY KEY,
      tip TEXT NOT NULL CHECK(tip IN ('DEPO','ECZANE')),
      ad TEXT NOT NULL,
      gln TEXT,
      il TEXT NOT NULL,
      adres TEXT,
      yetkili TEXT,
      olusturan_id INTEGER REFERENCES kullanicilar(id),
      olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS sevkiyatlar (
      kod TEXT PRIMARY KEY,
      tarih TEXT NOT NULL,
      alici_kod TEXT NOT NULL REFERENCES aliciar(kod),
      tasiyici TEXT NOT NULL,
      muhur_no TEXT NOT NULL,
      irsaliye TEXT,
      teslim_alan TEXT,
      buts_ref TEXT,
      olusturan_id INTEGER REFERENCES kullanicilar(id),
      olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    /**
     * PAKETLER — ambalaj birimleri. `satislar`DAN ÖNCE oluşturuluyor:
     * satislar.paket_uid buraya referans veriyor ve SQLite'ta olmayan tabloya
     * yapılan referans ancak INSERT anında patlar — yani şema kurulumu sessizce
     * geçer, ilk satış denemesinde hata alınırdı.
     *
     * `satis_kod` bilerek REFERENCES İÇERMİYOR: paketler ↔ satislar arasında
     * çift yönlü FK döngüsel bağımlılık yaratır ve hiçbir sıralama ikisini de
     * memnun etmez. Tekillik `satislar.paket_uid UNIQUE` ile zaten korunuyor.
     */
    `CREATE TABLE IF NOT EXISTS paketler (
      uid TEXT PRIMARY KEY,
      tekil TEXT NOT NULL UNIQUE,
      seri TEXT NOT NULL REFERENCES seriler(seri),
      urun_tipi TEXT NOT NULL,
      miktar_g REAL NOT NULL,
      skt TEXT NOT NULL,
      statu TEXT NOT NULL DEFAULT 'SERBEST'
        CHECK(statu IN ('SERBEST','SEVK','SATILDI','RET')),
      konum TEXT,
      sevk_kod TEXT REFERENCES sevkiyatlar(kod),
      satis_kod TEXT,
      olusturan_id INTEGER REFERENCES kullanicilar(id),
      olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    /**
     * SATIŞLAR — hastaya teslim.
     * `paket_uid` UNIQUE: bir ambalaj birimi yalnızca BİR kez satılabilir.
     * Uygulama katmanındaki mükerrer satış kontrolünün veritabanı tarafındaki
     * karşılığı — uygulama hatası olsa bile veri bozulmaz.
     *
     * AÇIK TC SAKLANMIYOR. Yalnızca maskelenmiş hali; eşleştirme anahtarı
     * reçete numarası (bkz. src/lib/kod.ts → tcMaskele).
     */
    `CREATE TABLE IF NOT EXISTS satislar (
      kod TEXT PRIMARY KEY,
      tarih TEXT NOT NULL,
      alici_kod TEXT NOT NULL REFERENCES aliciar(kod),
      paket_uid TEXT NOT NULL UNIQUE REFERENCES paketler(uid),
      hasta_ad TEXT NOT NULL,
      hasta_tc_maskeli TEXT NOT NULL,
      recete_no TEXT NOT NULL,
      hekim TEXT,
      olusturan_id INTEGER REFERENCES kullanicilar(id),
      olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS buts_kuyruk (
      kod TEXT PRIMARY KEY,
      zaman TEXT NOT NULL DEFAULT (datetime('now')),
      tip TEXT NOT NULL,
      ref TEXT NOT NULL,
      adet INTEGER NOT NULL DEFAULT 1,
      durum TEXT NOT NULL DEFAULT 'BEKLIYOR' CHECK(durum IN ('BEKLIYOR','GONDERILDI')),
      detay TEXT,
      gonderim_zamani TEXT,
      gonderen_id INTEGER REFERENCES kullanicilar(id)
    )`,

    /**
     * SAPMA ve CAPA — SOP-KG-03.
     *
     * `otomatik` bayrağı: ret kararları sapmayı SİSTEM açıyor. Elle açılan
     * kayıtlardan ayırt edilebilmesi, "her ret için sapma açıldı mı?"
     * sorusunun denetimde cevaplanabilmesi için gerekli.
     *
     * Serbest bırakmadaki "açık sapma var mı?" sorusu artık kullanıcının
     * beyanı değil, bu tabloya yapılan bir sorgu.
     */
    `CREATE TABLE IF NOT EXISTS sapmalar (
      kod TEXT PRIMARY KEY,
      kaynak_tip TEXT NOT NULL CHECK(kaynak_tip IN ('HAMMADDE','SERI','DIGER')),
      kaynak_kod TEXT,
      konu TEXT NOT NULL,
      aciklama TEXT,
      ilk_aksiyon TEXT,
      risk_degerlendirme TEXT,
      kok_neden TEXT,
      capa TEXT,
      capa_sorumlu TEXT,
      capa_termin TEXT,
      etkinlik_kriteri TEXT,
      etkinlik_tarihi TEXT,
      etkinlik_sonucu TEXT,
      etkinlik_dogrulayan_id INTEGER REFERENCES kullanicilar(id),
      sorumlu TEXT,
      termin TEXT,
      durum TEXT NOT NULL DEFAULT 'ACIK' CHECK(durum IN ('ACIK','KAPALI')),
      otomatik INTEGER NOT NULL DEFAULT 0,
      acan_id INTEGER REFERENCES kullanicilar(id),
      acilis_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
      kapatan_id INTEGER REFERENCES kullanicilar(id),
      kapanis_tarihi TEXT
    )`,

    /**
     * İMHA TUTANAKLARI — SOP-ÜR-15, FRM-ÜR-16.
     *
     * Reddedilen materyalin sistemden çıkış yolu. Ek-13 §4: kannabinoid içeren
     * atık kilitli alanda tutulur, tartılır, EN AZ İKİ TANIK huzurunda tutanağa
     * bağlanır ve lisanslı bertaraf firmasına teslim edilir. İki tanık alanı bu
     * yüzden NOT NULL.
     *
     * `UNIQUE(tip, kaynak_kod)`: aynı kaynak iki kez imha edilemez. İmha
     * bekleyenler kuyruğu bu tabloya LEFT JOIN ile hesaplanıyor; ayrı bir
     * "imha edildi" bayrağı tutmak iki gerçeğin ayrışma riskini doğururdu.
     */
    `CREATE TABLE IF NOT EXISTS imha_kayitlari (
      kod TEXT PRIMARY KEY,
      tip TEXT NOT NULL CHECK(tip IN ('HAMMADDE','URUN','FIRE')),
      kaynak_kod TEXT NOT NULL,
      miktar_kg REAL NOT NULL,
      gerekce TEXT NOT NULL,
      tanik_1 TEXT NOT NULL,
      tanik_2 TEXT NOT NULL,
      bertaraf_firma TEXT,
      tutanak_no TEXT NOT NULL,
      tarih TEXT NOT NULL,
      sapma_kod TEXT,
      olusturan_id INTEGER REFERENCES kullanicilar(id),
      olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tip, kaynak_kod)
    )`,

    /**
     * ETİKET MUTABAKATI — FRM-ÜR-12, Ek-13 kritik kontrol noktası §13.
     *
     * Seri başına TEK kayıt (PRIMARY KEY seri). FARK = 0 değilse o serinin
     * hiçbir birimi sevk edilemez; kontrol sevkiyat ucunda uygulanıyor.
     */
    `CREATE TABLE IF NOT EXISTS etiket_mutabakat (
      seri TEXT PRIMARY KEY REFERENCES seriler(seri) ON DELETE CASCADE,
      basilan INTEGER NOT NULL,
      kullanilan INTEGER NOT NULL,
      bozuk INTEGER NOT NULL DEFAULT 0,
      imha_edilen INTEGER NOT NULL DEFAULT 0,
      fark INTEGER NOT NULL,
      kontrol_eden TEXT NOT NULL,
      tarih TEXT NOT NULL,
      olusturan_id INTEGER REFERENCES kullanicilar(id),
      olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    PROSES_KAYITLARI_SQL,
    SAHIT_NUMUNELER_SQL,
    GIRIS_DENEMELERI_SQL,
    IADELER_SQL,
    SIKAYETLER_SQL,
    ANALIZ_SONUCLARI_SQL,
    GOREV_KURALLARI_SQL,
    GOREVLER_SQL,
    FORM_BASKILARI_SQL,
    SURELI_KAYITLAR_SQL,

    /**
     * DENETİM İZİ (ALCOA+ — atfedilebilirlik).
     * Hiçbir kod yolu bu tablodan SİLME yapmıyor. GMP'de kaydın kendisi kadar
     * kimin ne zaman yaptığı da kayıttır.
     */
    `CREATE TABLE IF NOT EXISTS loglar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kullanici_id INTEGER REFERENCES kullanicilar(id),
      eylem TEXT NOT NULL,
      kayit TEXT,
      detay TEXT,
      tarih TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ];

  for (const sql of tablolar) await c.execute(sql);

  const indeksler = [
    "CREATE INDEX IF NOT EXISTS idx_hammadde_ciftci ON hammadde(ciftci_kod)",
    "CREATE INDEX IF NOT EXISTS idx_hammadde_statu ON hammadde(statu)",
    "CREATE INDEX IF NOT EXISTS idx_sg_seri ON seri_girdileri(seri)",
    "CREATE INDEX IF NOT EXISTS idx_sg_lot ON seri_girdileri(lot)",
    "CREATE INDEX IF NOT EXISTS idx_seriler_statu ON seriler(statu)",
    "CREATE INDEX IF NOT EXISTS idx_paketler_seri ON paketler(seri)",
    "CREATE INDEX IF NOT EXISTS idx_paketler_statu ON paketler(statu)",
    "CREATE INDEX IF NOT EXISTS idx_paketler_sevk ON paketler(sevk_kod)",
    "CREATE INDEX IF NOT EXISTS idx_sevk_alici ON sevkiyatlar(alici_kod)",
    "CREATE INDEX IF NOT EXISTS idx_satis_alici ON satislar(alici_kod)",
    "CREATE INDEX IF NOT EXISTS idx_satis_paket ON satislar(paket_uid)",
    "CREATE INDEX IF NOT EXISTS idx_buts_durum ON buts_kuyruk(durum)",
    "CREATE INDEX IF NOT EXISTS idx_loglar_tarih ON loglar(tarih)",
    "CREATE INDEX IF NOT EXISTS idx_oturum_kullanici ON oturumlar(kullanici_id)",
    "CREATE INDEX IF NOT EXISTS idx_sapma_durum ON sapmalar(durum)",
    "CREATE INDEX IF NOT EXISTS idx_sapma_kaynak ON sapmalar(kaynak_tip, kaynak_kod)",
    "CREATE INDEX IF NOT EXISTS idx_imha_kaynak ON imha_kayitlari(tip, kaynak_kod)",
    "CREATE INDEX IF NOT EXISTS idx_analiz_lot ON analiz_sonuclari(lot)",
    "CREATE INDEX IF NOT EXISTS idx_gorev_vade ON gorevler(vade)",
    "CREATE INDEX IF NOT EXISTS idx_gorev_durum ON gorevler(durum)",
    "CREATE INDEX IF NOT EXISTS idx_gorev_kural ON gorevler(kural_kod)",
    "CREATE INDEX IF NOT EXISTS idx_baski_gorev ON form_baskilari(gorev_kod)",
    "CREATE INDEX IF NOT EXISTS idx_sureli_durum ON sureli_kayitlar(durum)",
  ];
  for (const sql of indeksler) {
    try {
      await c.execute(sql);
    } catch {
      /* idempotent */
    }
  }

  await ilkKullaniciyiOlustur(c);
}

/**
 * Boş veritabanında ilk Mesul Müdür hesabını açar.
 *
 * VARSAYILAN GÜVENLİ: `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` verilmemişse
 * HİÇBİR hesap açılmaz. Koda gömülü bir varsayılan şifre, depoyu görebilen
 * herkese üretim erişimi vermek demektir.
 */
async function ilkKullaniciyiOlustur(c: Client): Promise<void> {
  const say = await c.execute("SELECT COUNT(*) AS a FROM kullanicilar");
  if (Number((say.rows[0] as any).a) > 0) return;

  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim();
  const sifre = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !sifre) {
    console.warn(
      "[db] Kullanıcı tablosu boş ve SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD tanımlı değil — " +
        "hesap OLUŞTURULMADI. İlk hesabı açmak için bu ikisini tanımlayıp uygulamayı bir kez çalıştırın."
    );
    return;
  }
  if (sifre.length < MIN_SIFRE_UZUNLUK) {
    console.warn(`[db] SEED_ADMIN_PASSWORD en az ${MIN_SIFRE_UZUNLUK} karakter olmalı — hesap açılmadı.`);
    return;
  }

  const bcrypt = (await import("bcryptjs")).default;
  await c.execute({
    sql: `INSERT INTO kullanicilar (ad_soyad, email, sifre_hash, rol, gorev_kodu)
          VALUES (?, ?, ?, 'mesul_mudur', 'GT-01')`,
    args: [process.env.SEED_ADMIN_NAME || "Mesul Müdür", email, bcrypt.hashSync(sifre, 10)],
  });
  console.warn(`[db] İlk Mesul Müdür hesabı açıldı: ${email} — ilk girişte şifreyi değiştirin.`);
}

// ── Sarmalayıcı ──────────────────────────────────────────────────────────────

/** Transaction içinde çalıştırılan ifadenin dönüş tipi. */
export type TxSonuc = { changes: number; lastInsertRowid: number; rows: any[] };
export type TxCalistir = (sql: string, ...args: InValue[]) => Promise<TxSonuc>;

/**
 * libSQL satırını DÜZ nesneye çevirir.
 *
 * NEDEN GEREKLİ: `@libsql/client` satırları hem sütun adıyla hem sıra
 * numarasıyla erişilebilen özel nesneler olarak döndürüyor. React bunları
 * sunucu bileşeninden istemci bileşenine geçirmeye çalışınca
 * "Only plain objects can be passed to Client Components" uyarısı basıyor —
 * her sayfada, her satır için. İki zararı vardı: konsol dolduğu için gerçek
 * hatalar görünmez oluyordu, ve serileştirmenin gelecekte hata sınıfına
 * yükselmesi işlevi kırardı.
 *
 * Çeviri TEK YERDE, veri katmanında yapılıyor; her sayfada tek tek
 * hatırlanması gereken bir adım olmaktan çıkıyor.
 */
function duzSatir(satir: any, kolonlar: string[]): any {
  const o: Record<string, any> = {};
  for (const k of kolonlar) o[k] = satir[k];
  return o;
}

export class AsyncDatabase {
  constructor(private c: Client) {}

  prepare(sql: string) {
    const c = this.c;
    return {
      async get(...args: InValue[]): Promise<any | null> {
        const r = await c.execute({ sql, args });
        return r.rows[0] ? duzSatir(r.rows[0], r.columns) : null;
      },
      async all(...args: InValue[]): Promise<any[]> {
        const r = await c.execute({ sql, args });
        return r.rows.map((s) => duzSatir(s, r.columns));
      },
      async run(...args: InValue[]): Promise<{ lastInsertRowid: number; changes: number }> {
        const r = await c.execute({ sql, args });
        return { lastInsertRowid: Number(r.lastInsertRowid ?? 0), changes: r.rowsAffected };
      },
    };
  }

  /**
   * Hepsi ya da hiçbiri.
   *
   * Ambalajlama 40 satır ekliyor ve seriyi güncelliyor; sevkiyat bir sevkiyat
   * kaydı açıp N paketi işaretliyor. Yarım kalmış bir izlenebilirlik kaydı,
   * hiç olmayan kayıttan daha yanıltıcıdır: sistem "sevk edildi" der ama
   * paketlerin yarısı depoda görünür.
   */
  async transaction<T>(fn: (calistir: TxCalistir) => Promise<T>): Promise<T> {
    const tx = await this.c.transaction("write");
    try {
      const sonuc = await fn(async (sql, ...args) => {
        const r = await tx.execute({ sql, args });
        return {
          changes: r.rowsAffected,
          lastInsertRowid: Number(r.lastInsertRowid ?? 0),
          // SATIRLAR DA DÖNÜYOR. Yalnızca `changes` dönseydi transaction
          // içinde SELECT yapmak imkânsız olurdu — sayaç okuma ve
          // "yazmadan önce mevcut durumu kilitleyerek kontrol et" desenlerinin
          // ikisi de buna bağlı.
          rows: r.rows.map((s) => duzSatir(s, r.columns)),
        };
      });
      await tx.commit();
      return sonuc;
    } catch (e) {
      try {
        await tx.rollback();
      } catch {
        /* zaten kapanmış olabilir */
      }
      throw e;
    }
  }

  async batch(stmts: { sql: string; args: InValue[] }[]) {
    if (stmts.length === 0) return [];
    const r = await this.c.batch(stmts, "write");
    return r.map((x) => ({ lastInsertRowid: Number(x.lastInsertRowid ?? 0), changes: x.rowsAffected }));
  }

  /**
   * ÇOK SORGULU OKUMA — TEK GİDİŞ-DÖNÜŞ.
   *
   * Turso ağ üzerinden konuşuyor: her `execute` ayrı bir HTTP isteği ve her
   * istek gecikme ödüyor. Panel yirmiden fazla sorgu atıyordu; `Promise.all`
   * bunları paralelleştirse de bağlantı ve istek yükü sorgu başına kalıyordu
   * ve üretimde sayfa gözle görülür şekilde yavaştı. `batch` hepsini tek
   * istekte gönderiyor.
   *
   * Salt okunur mod: yanlışlıkla yazan bir ifade karışırsa Turso reddeder.
   */
  async topluOku(sqller: string[]): Promise<any[][]> {
    if (sqller.length === 0) return [];
    const r = await this.c.batch(sqller.map((sql) => ({ sql, args: [] })), "read");
    return r.map((x) => x.rows.map((satir) => duzSatir(satir, x.columns)));
  }
}

export async function getDb(): Promise<AsyncDatabase> {
  return new AsyncDatabase(await ensureClient());
}


/**
 * PROSES İÇİ KONTROLLER — Ek-13 kritik kontrol noktaları, FRM-ÜR-02 … FRM-ÜR-11.
 *
 * `olcumler` JSON: adım tanımı `src/lib/proses.ts` içinde, ölçüm DEĞERLERİ
 * burada. Sabit kolonlar yerine JSON, çünkü her adımın ölçüm kümesi farklı;
 * adım başına tablo açmak dokuz tablo demekti.
 *
 * `UNIQUE` YOK: bir adım birden fazla kez kaydedilebilir (Ek-13'te ekstraksiyon
 * 3 × 33,3 L kapta yapılıyor — her kap kendi kaydını hak ediyor). Kaydın
 * üzerine yazmak, ilk çalıştırmanın verisini yok etmek olurdu.
 */
const PROSES_KAYITLARI_SQL = `CREATE TABLE IF NOT EXISTS proses_kayitlari (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seri TEXT NOT NULL REFERENCES seriler(seri) ON DELETE CASCADE,
  adim_kod TEXT NOT NULL,
  olcumler TEXT NOT NULL,
  uygun INTEGER NOT NULL,
  engeller TEXT,
  operator TEXT NOT NULL,
  tarih TEXT NOT NULL,
  sapma_kod TEXT,
  olusturan_id INTEGER REFERENCES kullanicilar(id),
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
)`;

/**
 * ŞAHİT NUMUNELER — SOP-KK-10.
 *
 * Şikayet veya geri çekmede ilk başvurulan şey şahit numunedir; nerede olduğu
 * ve ne kadar süre saklanacağı bilinmiyorsa araştırma yapılamaz. Saklama süresi
 * dolanlar imha kuyruğuna düşüyor.
 */
const SAHIT_NUMUNELER_SQL = `CREATE TABLE IF NOT EXISTS sahit_numuneler (
  kod TEXT PRIMARY KEY,
  seri TEXT NOT NULL REFERENCES seriler(seri),
  miktar_g REAL NOT NULL,
  alma_tarihi TEXT NOT NULL,
  saklama_yeri TEXT NOT NULL,
  saklama_sonu TEXT NOT NULL,
  notlar TEXT,
  durum TEXT NOT NULL DEFAULT 'SAKLANIYOR' CHECK(durum IN ('SAKLANIYOR','IMHA')),
  imha_tarihi TEXT,
  imha_tutanak_no TEXT,
  olusturan_id INTEGER REFERENCES kullanicilar(id),
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
)`;


/**
 * GİRİŞ DENEMELERİ — kalıcı hız sınırı.
 *
 * Sayaç bellekte tutuluyordu; Vercel'de her yeni sunucu örneği onu sıfırlıyor
 * ve sınır pratikte kalkıyordu (bulgu B-13). Artık veritabanında.
 *
 * KAPSAM SINIRI, AÇIKÇA: sınır E-POSTA başına. Tek bir hesaba yapılan sözlük
 * saldırısını durdurur; binlerce farklı e-postayı deneyen dağıtık bir saldırıyı
 * durdurmaz. Onun için IP bazlı sınır ve/veya bir WAF gerekir — Vercel'in
 * kendi hız sınırı bu katmanda devrede. Buradaki koruma, gerçek hesaplara
 * yönelik denemeye karşı.
 */
const GIRIS_DENEMELERI_SQL = `CREATE TABLE IF NOT EXISTS giris_denemeleri (
  anahtar TEXT PRIMARY KEY,
  sayi INTEGER NOT NULL DEFAULT 0,
  ilk_deneme TEXT NOT NULL,
  son_deneme TEXT NOT NULL
)`;

/**
 * İADELER — SOP-ÜR-16 md. 2 (iade hareketleri), SOP-KG-07.
 *
 * Zincir tek yönlü kuruluydu: ürün ileri gidiyor, geri gelemiyordu (bulgu B-08).
 *
 * PAKET STATÜSÜNE YENİ DEĞER EKLENMEDİ. `paketler.statu` CHECK kısıtına 'IADE'
 * eklemek tabloyu yeniden kurmayı gerektiriyordu; `satislar` oradan yabancı
 * anahtarla besleniyor ve canlı veri üzerinde tablo yeniden kurmak bu sistemde
 * yapılabilecek en riskli iş. Bunun yerine iade edilen birim 'RET'e çekiliyor
 * (her türlü hareketi engeller) ve NE OLDUĞU bu tablodan okunuyor: karar
 * beklerken `BEKLIYOR`, stoğa dönerse paket yeniden 'SERBEST' oluyor.
 *
 * İmha tanıkları burada tutuluyor, `imha_kayitlari`nda değil: iade edilen tek
 * bir kutunun imhası, tonluk proses firesinin imhasından farklı bir olay ve
 * kendi bağlamıyla birlikte kaydedilmesi daha doğru.
 */
/**
 * ROL YETKİLERİ — yalnızca VARSAYILANDAN SAPMA saklanıyor.
 *
 * Tüm izinleri kopyalasaydık koddaki GMP varsayılanının ne olduğu kaybolur,
 * denetimde "bu rol varsayılandan nerede ayrılmış" sorusu cevapsız kalırdı.
 * Satır yoksa `src/lib/yetki.ts` içindeki varsayılan geçerli.
 */

/**
 * ROL KISITI GÖÇÜ — `kullanicilar.rol` CHECK'ine yeni roller eklendi.
 *
 * SQLite bir CHECK kısıtını ALTER ile değiştiremiyor; tabloyu yeniden kurmak
 * gerekiyor. Bu yüzden göç, kısıtın gerçekten eski olduğu durumda ÇALIŞIYOR
 * ve bir kez çalışıyor: tablo tanımında zaten 'admin' geçiyorsa hiçbir şey
 * yapılmıyor.
 *
 * TEK İŞLEMDE. Kopyalama ile yeniden adlandırma arasında bir hata olursa
 * kullanıcı tablosu yarım kalırdı — sisteme kimse giremezdi. Transaction
 * bunu ya tamamen yapıyor ya hiç yapmıyor.
 *
 * `id` değerleri KORUNUYOR: onlarca tablo `kullanicilar(id)` referansı
 * taşıyor (loglar, sapmalar, imha kayıtları…). Yeniden numaralandırmak
 * denetim izini kimin yaptığı bilinmez hâle getirirdi.
 */
async function ensureRolKisiti(c: Client): Promise<void> {
  const r = await c.execute(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'kullanicilar'"
  );
  const tanim = String(r.rows[0]?.sql ?? "");
  if (!tanim) return; // tablo henüz yok — initSchema kuracak

  // NÖBETÇİ, TEK BİR ROL ADINA BAKMAZ. İlk sürüm "'admin' geçiyorsa güncel"
  // diyordu; ikinci rol dalgası (yk_baskani, teknik) geldiğinde göç sessizce
  // atlandı ve yeni rol atanan hesap CHECK ihlaliyle reddedildi. Artık
  // ROLLER'in TAMAMI aranıyor: ileride eklenecek her rol göçü kendiliğinden
  // tetikliyor, kimsenin bu satırı hatırlaması gerekmiyor.
  const eksik = ROLLER.filter((x) => !tanim.includes(`'${x}'`));
  if (eksik.length === 0) return; // zaten güncel

  // YABANCI ANAHTARLAR KAPATILMADAN OLMAZ. `kullanicilar`'a onlarca tablo
  // referans veriyor (oturumlar, loglar, sapmalar…); `DROP TABLE` doğrudan
  // kısıt ihlaliyle patlıyor. SQLite'ın resmî tablo yeniden kurma yordamı da
  // bunu gerektiriyor ve `PRAGMA foreign_keys` bir TRANSACTION İÇİNDE
  // ETKİSİZ — o yüzden işlem öncesi, bağlantı düzeyinde kapatılıyor.
  await c.execute("PRAGMA foreign_keys = OFF");

  // GERÇEKTEN KAPANDI MI? Turso'nun HTTP kipinde ardışık istekler farklı
  // bağlantıya düşebiliyor ve PRAGMA yapışmayabiliyor. Kapanmadıysa göç
  // DENENMİYOR: yarıda kalmış bir kullanıcı tablosu, sisteme kimsenin
  // giremediği bir üretim ortamı demek.
  const durum = await c.execute("PRAGMA foreign_keys");
  const kapali = Number(Object.values(durum.rows[0] ?? {})[0] ?? 1) === 0;
  if (!kapali) {
    console.error(
      "[db] rol kısıtı göçü ATLANDI: yabancı anahtarlar kapatılamadı. " +
        `Yeni roller (${eksik.join(", ")}) kaydedilemez. Göç için \`araclar/rol-kisiti-goc.mjs\` çalıştırın.`
    );
    return;
  }

  const roller = ROLLER.map((x) => `'${x}'`).join(",");
  const tx = await c.transaction("write");
  try {
    await tx.execute(`CREATE TABLE kullanicilar_goc (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ad_soyad TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      sifre_hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN (${roller})),
      gorev_kodu TEXT,
      aktif INTEGER NOT NULL DEFAULT 1,
      olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await tx.execute(
      `INSERT INTO kullanicilar_goc (id, ad_soyad, email, sifre_hash, rol, gorev_kodu, aktif, olusturma_tarihi)
       SELECT id, ad_soyad, email, sifre_hash, rol, gorev_kodu, aktif, olusturma_tarihi FROM kullanicilar`
    );
    await tx.execute("DROP TABLE kullanicilar");
    await tx.execute("ALTER TABLE kullanicilar_goc RENAME TO kullanicilar");
    await tx.commit();

    // Referanslar sağlam mı? `id` korunduğu için beklenen sonuç boş liste;
    // değilse sessiz kalmak, kırık bir denetim iziyle çalışmak olurdu.
    const kontrol = await c.execute("PRAGMA foreign_key_check");
    if (kontrol.rows.length) {
      console.error(
        `[db] UYARI: göç sonrası ${kontrol.rows.length} kırık referans bulundu.`,
        kontrol.rows.slice(0, 5)
      );
    } else {
      console.log(`[db] kullanicilar.rol kısıtı güncellendi — eklenen: ${eksik.join(", ")}.`);
    }
  } catch (e) {
    try { await tx.rollback(); } catch { /* zaten kapanmış olabilir */ }
    // HATA YUKARI FIRLATILMIYOR. Bu göç bir ek özellik; başarısız olursa
    // sistem eski rollerle çalışmaya devam etmeli. Fırlatsaydı
    // `ensureEkTablolar` düşer ve GİRİŞ DÂHİL her şey kırılırdı — nitekim
    // ilk denemede tam olarak bu oldu.
    console.error("[db] rol kısıtı göçü başarısız:", (e as Error)?.message);
  } finally {
    await c.execute("PRAGMA foreign_keys = ON");
  }
}

/**
 * ELEKTRONİK İMZALAR — kritik kararların şifreyle yeniden doğrulanmış kaydı.
 *
 * 21 CFR Part 11'in aradığı unsurlar satırın kendisinde: imzalayanın benzersiz
 * kimliği VE o anki görünen adı (sonradan ad değişse bile imza anı korunur),
 * imzanın ANLAMI (onay/başlatma/tutanak), bağlandığı kayıt ve zaman.
 * BAŞARISIZ girişimler de yazılır — 11.300 bunu açıkça ister; yalnız
 * başarılıyı kaydetmek, deneme yanılmayı görünmez kılar.
 *
 * Tablo append-only: güncelleyen/silen kod yolu yoktur.
 */
const IMZALAR_SQL = `CREATE TABLE IF NOT EXISTS imzalar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id),
  ad_soyad TEXT NOT NULL,
  eylem TEXT NOT NULL,
  kayit TEXT NOT NULL,
  anlam TEXT NOT NULL,
  basarili INTEGER NOT NULL CHECK(basarili IN (0,1)),
  zaman TEXT NOT NULL DEFAULT (datetime('now'))
)`;

/**
 * ANALİZ SONUÇLARI — SOP-KK-04, FRM-KK-08/09.
 *
 * Ham madde kabul kararının PARAMETRE PARAMETRE dayanağı. Rapor başlığı
 * (rapor no, tarih, laboratuvar) `hammadde` üzerinde kalıyor — FRM-KK-09
 * başlığıyla birebir; satıra kopyalamak mükerrerlik olurdu.
 *
 * `hammadde.thc/cbd`, karar transaction'ında THC/CBD satırlarının
 * `sayisal_deger`'inden yazılan denormalize kopyadır: karar bir kez verildiği
 * ve satırlar eklendikten sonra değiştirilmediği için ayrışamazlar; mevcut
 * tüketiciler (zincir, izleme, denetim) hammadde kolonlarından okumaya
 * devam eder.
 *
 * `UNIQUE(lot, parametre)`: karar bir kez verilir (kural 9), rapor da bir kez
 * girilir. İkinci giriş denemesi API'de 409 ile döner.
 */
const ANALIZ_SONUCLARI_SQL = `CREATE TABLE IF NOT EXISTS analiz_sonuclari (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot TEXT NOT NULL REFERENCES hammadde(lot) ON DELETE CASCADE,
  parametre TEXT NOT NULL,
  spesifikasyon TEXT NOT NULL,
  sonuc TEXT NOT NULL,
  sayisal_deger REAL,
  birim TEXT,
  yontem TEXT,
  akredite INTEGER CHECK(akredite IN (0,1)),
  akredite_no TEXT,
  loq REAL,
  uygun INTEGER NOT NULL CHECK(uygun IN (0,1)),
  aciklama TEXT,
  olusturan_id INTEGER REFERENCES kullanicilar(id),
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(lot, parametre)
)`;

/**
 * GÖREV KURALLARI — SOP'lardaki periyodik hükümlerin makine okunur hâli.
 *
 * Bu tablo fiilen YILLIK FAALİYET PLANIDIR ve kontrollü bir dokümandır:
 * her satır kendi `dokuman_kod` + `madde` referansını taşıyor, böylece
 * denetçi "bu görev nereden çıktı" sorusunu tek satırda cevaplayabiliyor.
 * Referansı olmayan kural buraya girmemeli.
 *
 * `durum = 'TASLAK'` olan kural GÖREV ÜRETMEZ. Dokümanlardan otomatik
 * çıkarılan kurallar taslak olarak giriyor; KG-KK tek tek onaylıyor.
 * Otomatik çıkarımın sessizce yanlış periyot ataması, kaçırılmış ya da
 * gereksiz açılmış görev demek — onay adımı bunun tek gerçek savunması.
 */
const GOREV_KURALLARI_SQL = `CREATE TABLE IF NOT EXISTS gorev_kurallari (
  kod TEXT PRIMARY KEY,
  dokuman_kod TEXT NOT NULL,
  madde TEXT,
  faaliyet TEXT NOT NULL,
  periyot TEXT NOT NULL
    CHECK(periyot IN ('GUNLUK','HAFTALIK','AYLIK','UC_AYLIK','ALTI_AYLIK','YILLIK','IKI_YILLIK')),
  sorumlu_rol TEXT NOT NULL,
  sorumlu_ham TEXT,
  form_kod TEXT,
  saklama TEXT,
  alan_kod TEXT,
  baslangic TEXT NOT NULL,
  durum TEXT NOT NULL DEFAULT 'TASLAK' CHECK(durum IN ('TASLAK','ONAYLI','PASIF')),
  onaylayan_id INTEGER REFERENCES kullanicilar(id),
  onay_tarihi TEXT,
  notlar TEXT,
  olusturan_id INTEGER REFERENCES kullanicilar(id),
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
)`;

/**
 * GÖREVLER — kuralların takvime düşmüş örnekleri.
 *
 * `UNIQUE(kural_kod, donem)` bu tablonun belkemiği: görev üretimi her sayfa
 * açılışında yeniden çalışıyor (Vercel'de zamanlanmış iş yok) ve aynı dönem
 * için ikinci satır açılmamalı. Tekilliği uygulama katmanına bırakmak, iki
 * eşzamanlı isteğin mükerrer görev üretmesi demekti.
 *
 * SAHADA YAZILAN VERİ BURADA TUTULMUYOR — bilinçli. Kayıt kâğıt formdur;
 * bu tablo yalnızca işin hangi aşamada olduğunu izler. Ölçüm değerini de
 * saklasaydık sistem GxP kaydı tutan bir sisteme dönüşür, elektronik imza
 * ve tam validasyon yükü geri gelirdi.
 */
const GOREVLER_SQL = `CREATE TABLE IF NOT EXISTS gorevler (
  kod TEXT PRIMARY KEY,
  kural_kod TEXT NOT NULL REFERENCES gorev_kurallari(kod),
  donem TEXT NOT NULL,
  vade TEXT NOT NULL,
  durum TEXT NOT NULL DEFAULT 'ACIK'
    CHECK(durum IN ('ACIK','BASILDI','TESLIM','ARSIV','IPTAL')),
  basim_tarihi TEXT,
  teslim_tarihi TEXT,
  teslim_alan TEXT,
  arsiv_tarih TEXT,
  arsiv_yeri TEXT,
  iptal_gerekce TEXT,
  islem_yapan_id INTEGER REFERENCES kullanicilar(id),
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kural_kod, donem)
)`;

/**
 * FORM BASKI KÜTÜĞÜ — FRM-KG-02 "Doküman Dağıtım ve Geri Toplama"nın dijital eşi.
 *
 * Her baskı benzersiz seri numarası alıyor. Sebebi kâğıt israfını izlemek
 * değil: boş bir GMP formu, üzerine sonradan herhangi bir şey yazılabilecek
 * kontrolsüz bir belgedir. Kaç nüsha dolaştığı bilinmiyorsa, dolaşımdaki
 * nüshanın sahte olmadığı da bilinemez.
 *
 * `basan_ad` ayrıca saklanıyor: kullanıcının adı sonradan değişse bile
 * baskı anındaki kimlik korunur (imzalar tablosuyla aynı gerekçe).
 * Yeniden basımda gerekçe ZORUNLU — API'de kontrol ediliyor.
 */
const FORM_BASKILARI_SQL = `CREATE TABLE IF NOT EXISTS form_baskilari (
  seri_no TEXT PRIMARY KEY,
  gorev_kod TEXT NOT NULL REFERENCES gorevler(kod),
  form_kod TEXT NOT NULL,
  form_versiyon TEXT NOT NULL,
  yeniden_basim INTEGER NOT NULL DEFAULT 0 CHECK(yeniden_basim IN (0,1)),
  gerekce TEXT,
  basan_id INTEGER REFERENCES kullanicilar(id),
  basan_ad TEXT NOT NULL,
  basim_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
)`;

/**
 * SÜRELİ KAYITLAR — bir olaydan başlayan geri sayımlar.
 *
 * SOP-DE-06 md. 5.4 tipi azami bekleme süreleri (kannabinoid atık 15 gün,
 * ret malzeme 30 gün, posa 7 gün) ile sözleşme/lisans yenilemeleri.
 *
 * NEDEN ELLE GİRİLİYOR: bu sayaçların bir kısmının başlangıç olayı sistemde
 * YOK. Atık konteynerinin dolduğu an, sözleşmenin imzalandığı tarih, lisansın
 * verildiği gün — hiçbiri izlenebilirlik zincirinin parçası değil. Sistemde
 * KARŞILIĞI OLAN sayaçlar (ret lotu, karar bekleyen iade) ise bu tabloya
 * KOPYALANMIYOR, ilgili tablodan türetiliyor: iki yerde tutulan bir tarih,
 * er geç iki farklı tarihe dönüşür.
 */
const SURELI_KAYITLAR_SQL = `CREATE TABLE IF NOT EXISTS sureli_kayitlar (
  kod TEXT PRIMARY KEY,
  tip TEXT NOT NULL CHECK(tip IN ('ATIK','SOZLESME','LISANS','DIGER')),
  konu TEXT NOT NULL,
  kaynak_kod TEXT,
  baslangic TEXT NOT NULL,
  sure_gun INTEGER NOT NULL,
  dayanak TEXT,
  durum TEXT NOT NULL DEFAULT 'ACIK' CHECK(durum IN ('ACIK','KAPANDI')),
  kapanis_tarihi TEXT,
  kapanis_notu TEXT,
  olusturan_id INTEGER REFERENCES kullanicilar(id),
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
)`;

const ROL_YETKILERI_SQL = `CREATE TABLE IF NOT EXISTS rol_yetkileri (
  rol TEXT NOT NULL,
  tur TEXT NOT NULL CHECK(tur IN ('EKRAN','EYLEM')),
  anahtar TEXT NOT NULL,
  izin INTEGER NOT NULL CHECK(izin IN (0,1)),
  degistiren_id INTEGER REFERENCES kullanicilar(id),
  degistirme_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (rol, tur, anahtar)
)`;

const EKLER_SQL = `CREATE TABLE IF NOT EXISTS ekler (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kaynak_tip TEXT NOT NULL CHECK(kaynak_tip IN ('HAMMADDE','SERI','SAPMA','IMHA','IADE','SIKAYET')),
  kaynak_kod TEXT NOT NULL,
  aciklama TEXT,
  mime TEXT NOT NULL,
  boyut INTEGER NOT NULL,
  veri BLOB NOT NULL,
  olusturan_id INTEGER REFERENCES kullanicilar(id),
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
)`;

const IADELER_SQL = `CREATE TABLE IF NOT EXISTS iadeler (
  kod TEXT PRIMARY KEY,
  paket_uid TEXT NOT NULL REFERENCES paketler(uid),
  seri TEXT NOT NULL,
  alici_kod TEXT REFERENCES aliciar(kod),
  tarih TEXT NOT NULL,
  gerekce TEXT NOT NULL,
  karar TEXT NOT NULL DEFAULT 'BEKLIYOR' CHECK(karar IN ('BEKLIYOR','STOGA','IMHA')),
  karar_tarihi TEXT,
  karar_notu TEXT,
  imha_tanik_1 TEXT,
  imha_tanik_2 TEXT,
  imha_tutanak_no TEXT,
  sikayet_kod TEXT,
  karar_veren_id INTEGER REFERENCES kullanicilar(id),
  olusturan_id INTEGER REFERENCES kullanicilar(id),
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
)`;

/**
 * ŞİKAYETLER — SOP-KG-07.
 *
 * Geri çekme modülü vardı ama onu tetikleyen şikayet kaydı yoktu. Şikayet
 * ürüne (tekil karekod) ya da seriye bağlanabiliyor; ikisi de opsiyonel çünkü
 * bazı şikayetler ambalaj ya da teslimatla ilgili olup belirli bir birime
 * işaret etmiyor.
 */
const SIKAYETLER_SQL = `CREATE TABLE IF NOT EXISTS sikayetler (
  kod TEXT PRIMARY KEY,
  tarih TEXT NOT NULL,
  kaynak TEXT NOT NULL CHECK(kaynak IN ('HASTA','ECZANE','HEKIM','KURUM','DIGER')),
  ileten TEXT,
  iletisim TEXT,
  paket_uid TEXT,
  seri TEXT,
  konu TEXT NOT NULL,
  aciklama TEXT,
  degerlendirme TEXT,
  sonuc TEXT NOT NULL DEFAULT 'ACIK' CHECK(sonuc IN ('ACIK','HAKLI','HAKSIZ')),
  kapanis_tarihi TEXT,
  sapma_kod TEXT,
  kapatan_id INTEGER REFERENCES kullanicilar(id),
  olusturan_id INTEGER REFERENCES kullanicilar(id),
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
)`;

// ── Tembel migrasyon ─────────────────────────────────────────────────────────

/**
 * İlk şemadan SONRA eklenen tabloları hazırlar: sapma/CAPA, imha tutanakları,
 * etiket mutabakatı, proses içi kontroller ve şahit numuneler.
 *
 * NEDEN GEREKLİ: `initSchema` üretimde cold-start maliyeti yüzünden
 * `RUN_DB_INIT=1` olmadan çalışmıyor. Yeni tablo ekleyen bir deploy'dan sonra
 * o değişkeni açmayı unutmak, ilgili ekranların "no such table" ile çökmesi
 * demek. Bu fonksiyon sunucu örneği başına BİR KEZ, idempotent biçimde
 * çalışıyor ve unutmayı imkânsız kılıyor.
 *
 * Hata durumunda söz sıfırlanıyor: geçici bir bağlantı arızası tabloların
 * kalıcı olarak eksik sayılmasına yol açmasın, bir sonraki istekte tekrar
 * denensin.
 */
let _ekTablolar: Promise<void> | null = null;
export async function ensureEkTablolar(): Promise<void> {
  if (_ekTablolar) return _ekTablolar;
  _ekTablolar = (async () => {
    const c = await ensureClient();
    try {
      await c.execute(`CREATE TABLE IF NOT EXISTS sapmalar (
        kod TEXT PRIMARY KEY,
        kaynak_tip TEXT NOT NULL CHECK(kaynak_tip IN ('HAMMADDE','SERI','DIGER')),
        kaynak_kod TEXT,
        konu TEXT NOT NULL,
        aciklama TEXT,
        ilk_aksiyon TEXT,
        risk_degerlendirme TEXT,
        kok_neden TEXT,
        capa TEXT,
        capa_sorumlu TEXT,
        capa_termin TEXT,
        etkinlik_kriteri TEXT,
        etkinlik_tarihi TEXT,
        etkinlik_sonucu TEXT,
        etkinlik_dogrulayan_id INTEGER REFERENCES kullanicilar(id),
        sorumlu TEXT,
        termin TEXT,
        durum TEXT NOT NULL DEFAULT 'ACIK' CHECK(durum IN ('ACIK','KAPALI')),
        otomatik INTEGER NOT NULL DEFAULT 0,
        acan_id INTEGER REFERENCES kullanicilar(id),
        acilis_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
        kapatan_id INTEGER REFERENCES kullanicilar(id),
        kapanis_tarihi TEXT
      )`);
      await c.execute(`CREATE TABLE IF NOT EXISTS imha_kayitlari (
        kod TEXT PRIMARY KEY,
        tip TEXT NOT NULL CHECK(tip IN ('HAMMADDE','URUN','FIRE')),
        kaynak_kod TEXT NOT NULL,
        miktar_kg REAL NOT NULL,
        gerekce TEXT NOT NULL,
        tanik_1 TEXT NOT NULL,
        tanik_2 TEXT NOT NULL,
        bertaraf_firma TEXT,
        tutanak_no TEXT NOT NULL,
        tarih TEXT NOT NULL,
        sapma_kod TEXT,
        olusturan_id INTEGER REFERENCES kullanicilar(id),
        olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tip, kaynak_kod)
      )`);
      await c.execute(`CREATE TABLE IF NOT EXISTS etiket_mutabakat (
        seri TEXT PRIMARY KEY REFERENCES seriler(seri) ON DELETE CASCADE,
        basilan INTEGER NOT NULL,
        kullanilan INTEGER NOT NULL,
        bozuk INTEGER NOT NULL DEFAULT 0,
        imha_edilen INTEGER NOT NULL DEFAULT 0,
        fark INTEGER NOT NULL,
        kontrol_eden TEXT NOT NULL,
        tarih TEXT NOT NULL,
        olusturan_id INTEGER REFERENCES kullanicilar(id),
        olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      await c.execute(PROSES_KAYITLARI_SQL);
      await c.execute(SAHIT_NUMUNELER_SQL);
      await c.execute(GIRIS_DENEMELERI_SQL);
      await c.execute(IADELER_SQL);
      await c.execute(SIKAYETLER_SQL);
      await c.execute(EKLER_SQL);
      await c.execute(ROL_YETKILERI_SQL);
      await c.execute(IMZALAR_SQL);
      await c.execute(ANALIZ_SONUCLARI_SQL);
      await c.execute(GOREV_KURALLARI_SQL);
      await c.execute(GOREVLER_SQL);
      await c.execute(FORM_BASKILARI_SQL);
      await c.execute(SURELI_KAYITLAR_SQL);
      for (const ix of [
        "CREATE INDEX IF NOT EXISTS idx_analiz_lot ON analiz_sonuclari(lot)",
        "CREATE INDEX IF NOT EXISTS idx_gorev_vade ON gorevler(vade)",
        "CREATE INDEX IF NOT EXISTS idx_gorev_durum ON gorevler(durum)",
        "CREATE INDEX IF NOT EXISTS idx_gorev_kural ON gorevler(kural_kod)",
        "CREATE INDEX IF NOT EXISTS idx_baski_gorev ON form_baskilari(gorev_kod)",
        "CREATE INDEX IF NOT EXISTS idx_sureli_durum ON sureli_kayitlar(durum)",
      ]) {
        try { await c.execute(ix); } catch { /* indeks zaten var */ }
      }
      await ensureRolKisiti(c);

      // SEVK ANINDAKİ ADET — değişmez hareket kaydı.
      //
      // Adet, bağlı paketleri canlı SAYARAK gösteriliyordu; bir birim iade
      // edilip stoğa dönünce sayı düşüyor ve sevkiyat ekranı 14 derken BÜTS
      // bildirimi 15 diyordu. Tarihsel bir hareket kaydı sonradan değişemez:
      // adet artık sevk anında yazılıyor. Eski satırlar BÜTS kuyruğundaki
      // (o da sevk anında yazılmış) adetten, o yoksa canlı sayımdan
      // dolduruluyor.
      try {
        await c.execute("ALTER TABLE sevkiyatlar ADD COLUMN adet INTEGER");
      } catch { /* kolon zaten var */ }
      // Denetim izi hash zinciri — her satır bir öncekinin özetini taşır.
      try {
        await c.execute("ALTER TABLE loglar ADD COLUMN ozet TEXT");
      } catch { /* kolon zaten var */ }
      // Elle işaretlenen BÜTS bildirimlerinde Kurumun verdiği referans no.
      try {
        await c.execute("ALTER TABLE buts_kuyruk ADD COLUMN kurum_ref TEXT");
      } catch { /* kolon zaten var */ }
      // CAPA kapanışı yalnız iki serbest metinle yapılamaz. Aşağıdaki alanlar
      // ilk düzeltmeyi, risk değerlendirmesini, sorumluyu/termini ve etkinlik
      // doğrulamasını sapmanın ayrılmaz parçası hâline getirir. ALTER'lar
      // idempotent: mevcut üretim verisi korunur, eski satırlar NULL kalır ve
      // yeni kapanış akışı bu alanları zorunlu doldurur.
      for (const sql of [
        "ALTER TABLE sapmalar ADD COLUMN ilk_aksiyon TEXT",
        "ALTER TABLE sapmalar ADD COLUMN risk_degerlendirme TEXT",
        "ALTER TABLE sapmalar ADD COLUMN capa_sorumlu TEXT",
        "ALTER TABLE sapmalar ADD COLUMN capa_termin TEXT",
        "ALTER TABLE sapmalar ADD COLUMN etkinlik_kriteri TEXT",
        "ALTER TABLE sapmalar ADD COLUMN etkinlik_tarihi TEXT",
        "ALTER TABLE sapmalar ADD COLUMN etkinlik_sonucu TEXT",
        "ALTER TABLE sapmalar ADD COLUMN etkinlik_dogrulayan_id INTEGER REFERENCES kullanicilar(id)",
      ]) {
        try { await c.execute(sql); } catch { /* kolon zaten var */ }
      }

      // Uygulama ayarları — tek anahtar/değer. İlk kullanım: örnek veri bayrağı.
      try {
        await c.execute(`CREATE TABLE IF NOT EXISTS ayarlar (
          anahtar TEXT PRIMARY KEY,
          deger TEXT NOT NULL,
          guncelleme TEXT NOT NULL DEFAULT (datetime('now'))
        )`);
      } catch { /* zaten var */ }

      // İADE BAĞI ONARIMI. Eski iade→stoğa akışı `sevk_kod`'u NULL yapıyordu;
      // yeni kural bağı koruyor ama eski kayıtların bağı kopmuş durumda ve
      // D-18 mutabakatında "kayıt 15 / bağlı 14" olarak görünüyordu. İade
      // kaydı (paket + alıcı) hangi sevkiyattan döndüğünü söylüyor; aday
      // TEK sevkiyatsa bağ geri yazılıyor. Birden çok aday varsa DOKUNULMUYOR
      // — yanlış bağ kurmak, bağsız bırakmaktan kötü, D-18 zaten uyarır.
      try {
        await c.execute(`UPDATE paketler SET sevk_kod = (
            SELECT s.kod FROM sevkiyatlar s
             JOIN iadeler i ON i.paket_uid = paketler.uid AND i.karar = 'STOGA'
            WHERE i.alici_kod = s.alici_kod
              AND s.adet > (SELECT COUNT(*) FROM paketler p2 WHERE p2.sevk_kod = s.kod)
          )
          WHERE sevk_kod IS NULL
            AND uid IN (SELECT paket_uid FROM iadeler WHERE karar = 'STOGA')
            AND (SELECT COUNT(*) FROM sevkiyatlar s2
                   JOIN iadeler i2 ON i2.paket_uid = paketler.uid AND i2.karar = 'STOGA'
                  WHERE i2.alici_kod = s2.alici_kod
                    AND s2.adet > (SELECT COUNT(*) FROM paketler p3 WHERE p3.sevk_kod = s2.kod)) = 1`);
      } catch { /* onarım en iyi çabadır */ }

      // ZİNCİR BAŞLANGIÇ MÜHRÜ. Özet kolonu sonradan eklendi; öncesindeki
      // kayıtlar zincire dahil değil ve hash'siz oldukları için sessizce
      // değiştirilebilirlerdi. Mühür, o kayıtların TOPLU özetini zincirin
      // İLK halkasına gömüyor: artık eski bir kaydı değiştirmek de mührün
      // yeniden hesabında yakalanır. Bir kez atılır.
      try {
        const muhurVar = await c.execute(
          "SELECT 1 FROM loglar WHERE eylem = 'DENETİM İZİ HASH ZİNCİRİ BAŞLATILDI' LIMIT 1"
        );
        if (!muhurVar.rows.length) {
          const eski = await c.execute(
            "SELECT id, tarih, kullanici_id, eylem, kayit, detay FROM loglar WHERE ozet IS NULL ORDER BY id"
          );
          const toplu = topluOzet(
            eski.rows.map((r: any) => ({
              id: Number(r.id), tarih: String(r.tarih),
              kullanici_id: r.kullanici_id == null ? null : Number(r.kullanici_id),
              eylem: String(r.eylem), kayit: r.kayit == null ? null : String(r.kayit),
              detay: r.detay == null ? null : String(r.detay),
            }))
          );
          // Mühür zincirin İLK halkası değilse (özetli kayıtlar zaten varsa)
          // SON halkaya bağlanmalı. İlk sürüm her durumda "" ile bağladı ve
          // mevcut zinciri tam ortasından kırdı — doğrulama ucu yakaladı.
          const sonHalka = await c.execute(
            "SELECT ozet FROM loglar WHERE ozet IS NOT NULL ORDER BY id DESC LIMIT 1"
          );
          const onceki = String(sonHalka.rows[0]?.ozet ?? "");
          const ins = await c.execute({
            sql: "INSERT INTO loglar (kullanici_id, eylem, kayit, detay) VALUES (NULL, 'DENETİM İZİ HASH ZİNCİRİ BAŞLATILDI', ?, ?)",
            args: [String(eski.rows.length), `öncesinde ${eski.rows.length} kayıt · toplu özet ${toplu}`],
          });
          const id = Number(ins.lastInsertRowid);
          const satir = await c.execute({ sql: "SELECT tarih FROM loglar WHERE id = ?", args: [id] });
          const ozet = ozetHesapla(onceki, {
            id, tarih: String(satir.rows[0].tarih), kullanici_id: null,
            eylem: "DENETİM İZİ HASH ZİNCİRİ BAŞLATILDI",
            kayit: String(eski.rows.length),
            detay: `öncesinde ${eski.rows.length} kayıt · toplu özet ${toplu}`,
          });
          await c.execute({ sql: "UPDATE loglar SET ozet = ? WHERE id = ?", args: [ozet, id] });
        }
      } catch (e) {
        console.error("[db] zincir mührü atılamadı:", (e as Error)?.message);
      }
      try {
        await c.execute(`UPDATE sevkiyatlar SET adet = COALESCE(
          (SELECT b.adet FROM buts_kuyruk b WHERE b.ref = sevkiyatlar.kod ORDER BY b.zaman LIMIT 1),
          (SELECT COUNT(*) FROM paketler p WHERE p.sevk_kod = sevkiyatlar.kod)
        ) WHERE adet IS NULL`);
      } catch { /* geriye doldurma en iyi çabadır */ }
      // İNDEKSLER TEK BATCH'TE. Tek tek gönderildiğinde her biri ayrı bir
      // Turso gidiş-dönüşüydü ve bu maliyet HER SOĞUK BAŞLANGIÇTA ödeniyordu.
      for (const sql of [
        "CREATE INDEX IF NOT EXISTS idx_sapma_durum ON sapmalar(durum)",
        "CREATE INDEX IF NOT EXISTS idx_sapma_kaynak ON sapmalar(kaynak_tip, kaynak_kod)",
        "CREATE INDEX IF NOT EXISTS idx_imha_kaynak ON imha_kayitlari(tip, kaynak_kod)",
        "CREATE INDEX IF NOT EXISTS idx_proses_seri ON proses_kayitlari(seri)",
        "CREATE INDEX IF NOT EXISTS idx_numune_seri ON sahit_numuneler(seri)",
        "CREATE INDEX IF NOT EXISTS idx_numune_durum ON sahit_numuneler(durum, saklama_sonu)",
        "CREATE INDEX IF NOT EXISTS idx_iade_paket ON iadeler(paket_uid)",
        "CREATE INDEX IF NOT EXISTS idx_iade_karar ON iadeler(karar)",
        "CREATE INDEX IF NOT EXISTS idx_sikayet_sonuc ON sikayetler(sonuc)",
        "CREATE INDEX IF NOT EXISTS idx_ek_kaynak ON ekler(kaynak_tip, kaynak_kod)",
      ]) {
        try { await c.execute(sql); } catch { /* idempotent */ }
      }
    } catch (e) {
      console.error("[db] Ek tablolar hazırlanamadı:", (e as Error)?.message);
      _ekTablolar = null;
      throw e;
    }
  })();
  return _ekTablolar;
}

/**
 * Bir seride veya lotta AÇIK sapma var mı?
 *
 * Serbest bırakmadaki kontrolün kaynağı. Eskiden kullanıcıya soruluyordu ve
 * cevabın doğruluğu hiçbir yere bağlı değildi (bulgu B-03).
 */
export async function acikSapmaVarMi(kaynakTip: string, kaynakKod: string): Promise<boolean> {
  await ensureEkTablolar();
  const db = await getDb();
  const r = await db
    .prepare(
      "SELECT COUNT(*) AS a FROM sapmalar WHERE durum = 'ACIK' AND kaynak_tip = ? AND kaynak_kod = ?"
    )
    .get(kaynakTip, kaynakKod);
  return Number(r?.a ?? 0) > 0;
}

// ── Sayaç ────────────────────────────────────────────────────────────────────

/**
 * Sayacı ATOMİK olarak artırıp yeni değeri döndürür.
 *
 * `SELECT MAX(...)+1` KULLANILMIYOR: iki eşzamanlı istek aynı numarayı alır.
 * Karekodun tekilliği tüm izlenebilirliğin dayanağı olduğu için burada
 * yarış koşuluna yer yok. `ON CONFLICT ... RETURNING` tek ifadede, tek turda.
 *
 * Transaction İÇİNDE kullanmak için `calistir` geçilebilir — sayaç ile kaydın
 * aynı işlemde yazılması, işlem geri alındığında numaranın da geri alınmasını
 * sağlar (numara boşluğu oluşmaz).
 */
export async function sayacArtir(ad: string): Promise<number> {
  const c = await ensureClient();
  const r = await c.execute({
    sql: `INSERT INTO sayaclar (ad, deger) VALUES (?, 1)
          ON CONFLICT(ad) DO UPDATE SET deger = deger + 1
          RETURNING deger`,
    args: [ad],
  });
  return Number((r.rows[0] as any).deger);
}

/**
 * Transaction içinden sayaç artırma.
 *
 * İki adım (artır → oku) ama tek transaction: libSQL'in yazma transaction'ı
 * seri olduğu için araya başka bir yazar giremez. İşlem geri alınırsa sayaç da
 * geri alınır — numara boşluğu oluşmaz.
 */
export async function sayacArtirTx(calistir: TxCalistir, ad: string): Promise<number> {
  await calistir(
    `INSERT INTO sayaclar (ad, deger) VALUES (?, 1)
     ON CONFLICT(ad) DO UPDATE SET deger = deger + 1`,
    ad
  );
  const r = await calistir(`SELECT deger FROM sayaclar WHERE ad = ?`, ad);
  const deger = Number(r.rows?.[0]?.deger ?? 0);
  if (!deger) throw new Error(`Sayaç okunamadı: ${ad}`);
  return deger;
}

/**
 * BLOK REZERVASYONU — N numarayı tek turda ayırır, İLK numarayı döndürür.
 *
 * Toplu görev üretiminde tek tek `sayacArtirTx` çağırmak, kayıt başına bir
 * gidiş-dönüş demekti; yüzlerce görev üreten ilk çalıştırma Turso üzerinde
 * dakikalara çıkıyordu. Blok ayırma tek ifadeyle bitiyor.
 *
 * Ayrılan blok KULLANILMASA BİLE geri verilmiyor (numara boşluğu oluşabilir).
 * Bu bilinçli: boşluk zararsız, ÇAKIŞMA değil. Aynı seri numarasının iki
 * kayda düşmesi, tekilliğe dayanan her şeyi çürütür.
 */
export async function sayacBlokTx(
  calistir: TxCalistir,
  ad: string,
  adet: number
): Promise<number> {
  if (!Number.isInteger(adet) || adet < 1) throw new Error(`Geçersiz blok boyu: ${adet}`);
  await calistir(
    `INSERT INTO sayaclar (ad, deger) VALUES (?, ?)
     ON CONFLICT(ad) DO UPDATE SET deger = deger + ?`,
    ad, adet, adet
  );
  const r = await calistir(`SELECT deger FROM sayaclar WHERE ad = ?`, ad);
  const son = Number(r.rows?.[0]?.deger ?? 0);
  if (!son) throw new Error(`Sayaç okunamadı: ${ad}`);
  return son - adet + 1; // bloğun İLK numarası
}


// ── Giriş hız sınırı ─────────────────────────────────────────────────────────

/** Pencere ve azami deneme — TEK YER. */
export const GIRIS_PENCERE_DK = 15;
export const GIRIS_AZAMI_DENEME = 8;

/**
 * Başarısız denemeyi kaydeder ve hesabın kilitli olup olmadığını döndürür.
 *
 * Pencere `ilk_deneme` üzerinden hesaplanıyor: 15 dakika dolduğunda sayaç
 * sıfırlanıyor. `son_deneme` üzerinden hesaplansaydı saldırgan her 14 dakikada
 * bir deneyerek sayacı sonsuza kadar taze tutabilirdi.
 */
export async function girisDenemesiKaydet(anahtar: string): Promise<{ kilitli: boolean; kalan: number }> {
  await ensureEkTablolar();
  const db = await getDb();
  const simdi = new Date().toISOString();
  const pencereBasi = new Date(Date.now() - GIRIS_PENCERE_DK * 60_000).toISOString();

  await db
    .prepare(
      `INSERT INTO giris_denemeleri (anahtar, sayi, ilk_deneme, son_deneme)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(anahtar) DO UPDATE SET
         sayi = CASE WHEN giris_denemeleri.ilk_deneme < ? THEN 1 ELSE giris_denemeleri.sayi + 1 END,
         ilk_deneme = CASE WHEN giris_denemeleri.ilk_deneme < ? THEN ? ELSE giris_denemeleri.ilk_deneme END,
         son_deneme = ?`
    )
    .run(anahtar, simdi, simdi, pencereBasi, pencereBasi, simdi, simdi);

  const r = await db.prepare("SELECT sayi FROM giris_denemeleri WHERE anahtar = ?").get(anahtar);
  const sayi = Number(r?.sayi ?? 0);
  return { kilitli: sayi > GIRIS_AZAMI_DENEME, kalan: Math.max(0, GIRIS_AZAMI_DENEME - sayi) };
}

/** Hesap şu an kilitli mi? Şifre KONTROL EDİLMEDEN önce çağrılır. */
export async function girisKilitliMi(anahtar: string): Promise<boolean> {
  await ensureEkTablolar();
  const db = await getDb();
  const pencereBasi = new Date(Date.now() - GIRIS_PENCERE_DK * 60_000).toISOString();
  const r = await db
    .prepare("SELECT sayi FROM giris_denemeleri WHERE anahtar = ? AND ilk_deneme >= ?")
    .get(anahtar, pencereBasi);
  return Number(r?.sayi ?? 0) > GIRIS_AZAMI_DENEME;
}

/** Başarılı girişte sayaç temizlenir. */
export async function girisDenemeleriniTemizle(anahtar: string): Promise<void> {
  try {
    const db = await getDb();
    await db.prepare("DELETE FROM giris_denemeleri WHERE anahtar = ?").run(anahtar);
  } catch {
    /* temizlik kritik değil */
  }
}

// ── Denetim izi ──────────────────────────────────────────────────────────────

export async function logla(
  kullaniciId: number | null,
  eylem: string,
  kayit?: string | null,
  detay?: string | null
): Promise<void> {
  try {
    const db = await getDb();
    // ZİNCİRLİ YAZIM, tek transaction içinde: önce satır eklenir (id ve tarih
    // veritabanında oluşur), sonra ÖNCEKİ satırın özeti okunup bu satırın
    // özeti hesaplanır ve yazılır. İki eşzamanlı log, transaction sırasına
    // girer — ikisi aynı "önceki"yi okuyup zinciri çatallayamaz.
    await db.transaction(async (calistir) => {
      const r = await calistir(
        "INSERT INTO loglar (kullanici_id, eylem, kayit, detay) VALUES (?, ?, ?, ?)",
        kullaniciId, eylem, kayit ?? null, detay ?? null
      );
      const id = Number(r.lastInsertRowid);
      const yeni = await calistir(
        "SELECT id, tarih, kullanici_id, eylem, kayit, detay FROM loglar WHERE id = ?", id
      );
      const onceki = await calistir(
        "SELECT ozet FROM loglar WHERE id < ? AND ozet IS NOT NULL ORDER BY id DESC LIMIT 1", id
      );
      const satir = yeni.rows[0] as any;
      const ozet = ozetHesapla(String(onceki.rows[0]?.ozet ?? ""), {
        id, tarih: String(satir.tarih), kullanici_id: satir.kullanici_id,
        eylem: String(satir.eylem), kayit: satir.kayit ?? null, detay: satir.detay ?? null,
      });
      await calistir("UPDATE loglar SET ozet = ? WHERE id = ?", ozet, id);
    });
  } catch (e) {
    // Log yazılamaması asıl işlemi geri almamalı; ama SESSİZ de kalmamalı.
    console.error("[db] denetim izi yazılamadı:", (e as Error)?.message ?? e);
  }
}

// ── Tarih ────────────────────────────────────────────────────────────────────

/**
 * Türkiye yerel günü — SQL ifadesi.
 *
 * `date('now','localtime')` KULLANMAYIN: Vercel'de `TZ` tanımsız ve Turso
 * sunucusu UTC; orada `'localtime'` sessizce UTC gününü döndürür. Tarayıcı
 * yerel güne göre hesap yapınca gece 00:00–03:00 arası ikisi ayrışır.
 * Türkiye 2016'dan beri yaz saati uygulamıyor; ofset yıl boyu sabit +03:00.
 */
export const SQL_TR_BUGUN = "date('now','+3 hours')";

/** Sunucu tarafında Türkiye takvim günü (YYYY-AA-GG). */
export function trBugun(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
