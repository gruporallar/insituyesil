import { NextResponse } from "next/server";
import { getSession } from "./auth";
import { DogrulamaHatasi } from "./dogrula";
import { ekranGorunur, eylemYetkili, yetkiMesaji, type Ekran, type Eylem } from "./yetki";
import type { Kullanici } from "./types";

/**
 * API UÇLARI İÇİN ORTAK KAPI.
 *
 * Her uçta aynı üç adım tekrarlanıyordu: oturum al, ekran yetkisi bak, eylem
 * yetkisi bak. Tekrar eden kod kopyalanırken bir adım unutulur — ve unutulan
 * adım genellikle yetki kontrolü olur. Tek yerde toplandı.
 *
 * Kullanım:
 *
 *   export const POST = korumali(
 *     { ekran: "uretim", eylem: "seri_serbest" },
 *     async (req, k) => { ... }
 *   );
 */

/**
 * Transaction içinden fırlatılan, kullanıcıya GÖSTERİLEBİLİR hata öneki.
 *
 *   throw new Error(`${KULLANICI_HATASI}HM-2026-0001 lotu karantinada.`)
 *
 * Öneksiz hatalar 500'e düşer ve mesajları gizlenir — veritabanı metinleri
 * şema yapısı sızdırır.
 */
export const KULLANICI_HATASI = "__KULLANICI__";

/** Kullanıcıya gösterilecek iş kuralı hatası fırlatır. */
export function kullaniciHatasi(mesaj: string): never {
  throw new Error(KULLANICI_HATASI + mesaj);
}

export type Handler = (
  req: Request,
  kullanici: Kullanici,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> | NextResponse;

export function korumali(
  kural: { ekran: Ekran; eylem?: Eylem },
  handler: Handler
) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const kullanici = await getSession();
    if (!kullanici) {
      return NextResponse.json({ hata: "Oturum bulunamadı. Lütfen tekrar giriş yapın." }, { status: 401 });
    }

    // MENÜYÜ GİZLEMEK KONTROL DEĞİLDİR — sayfa kapalıysa uç da kapalı.
    if (!ekranGorunur(kullanici, kural.ekran)) {
      return NextResponse.json({ hata: "Bu bölüme erişim yetkiniz yok." }, { status: 403 });
    }

    if (kural.eylem && !eylemYetkili(kullanici, kural.eylem)) {
      return NextResponse.json({ hata: yetkiMesaji(kural.eylem) }, { status: 403 });
    }

    try {
      return await handler(req, kullanici, ctx);
    } catch (e) {
      return hataYaniti(e);
    }
  };
}

/**
 * Hatanın TÜM zincirini metne çevirir.
 *
 * Node'un `fetch` uygulaması ağ hatalarını `TypeError: fetch failed` içine
 * sarıyor ve gerçek sebebi (`ENOTFOUND`, `ECONNREFUSED`, sertifika hatası)
 * `cause` içinde saklıyor. Yalnızca `.message` okumak, teşhis için gereken tek
 * bilgiyi kaybettiriyordu: "fetch failed" her ağ arızasında aynı görünüyor.
 *
 * Zincir sınırlı derinlikte geziliyor — döngüsel `cause` referansı sonsuz
 * döngü yapmasın.
 */
function hataMetni(e: unknown, derinlik = 4): string {
  const parcalar: string[] = [];
  let mevcut: any = e;
  for (let i = 0; i < derinlik && mevcut; i++) {
    const m = mevcut?.message ?? String(mevcut);
    const kod = mevcut?.code ? ` (${mevcut.code})` : "";
    if (m && !parcalar.includes(m + kod)) parcalar.push(m + kod);
    mevcut = mevcut?.cause;
  }
  return parcalar.join(" ← ") || String(e);
}

/**
 * Hata → HTTP yanıtı.
 *
 * Doğrulama hatası 400 ve mesajı KULLANICIYA gösterilir; beklenmedik hata 500
 * ve mesajı GÖSTERİLMEZ. Veritabanı hata metinleri tablo/kolon adı sızdırır.
 */
export function hataYaniti(e: unknown): NextResponse {
  if (e instanceof DogrulamaHatasi) {
    return NextResponse.json({ hata: e.message, alan: e.alan }, { status: 400 });
  }

  const mesaj = hataMetni(e);

  /**
   * TRANSACTION İÇİNDEN GELEN KULLANICI HATASI.
   *
   * Transaction içinde `DogrulamaHatasi` atmak da mümkündü ama iş kuralı
   * ihlalleri (lot karantinada, stok yetmiyor) bir "doğrulama" değil: girdi
   * biçimsel olarak doğru, kayıt durumu uygun değil. Ayrı işaretlenmesi,
   * geri alma davranışını bozmadan mesajın kullanıcıya ulaşmasını sağlıyor.
   */
  if (mesaj.startsWith(KULLANICI_HATASI)) {
    return NextResponse.json({ hata: mesaj.slice(KULLANICI_HATASI.length) }, { status: 409 });
  }

  // Kısıt ihlalleri kullanıcıya anlamlı çevriliyor. Ham SQLite metni
  // ("UNIQUE constraint failed: satislar.paket_uid") kullanıcıya bir şey
  // anlatmaz ama şema yapısını anlatır.
  if (/UNIQUE constraint failed: satislar\.paket_uid/i.test(mesaj)) {
    return NextResponse.json(
      { hata: "Bu ambalaj birimi zaten satılmış. Mükerrer satış engellendi." },
      { status: 409 }
    );
  }
  if (/UNIQUE constraint failed: paketler\.(uid|tekil)/i.test(mesaj)) {
    return NextResponse.json(
      { hata: "Bu karekod zaten üretilmiş. İşlem tekrarlanmış olabilir." },
      { status: 409 }
    );
  }
  if (/UNIQUE constraint failed: kullanicilar\.email/i.test(mesaj)) {
    return NextResponse.json({ hata: "Bu e-posta ile kayıtlı bir kullanıcı zaten var." }, { status: 409 });
  }
  if (/UNIQUE constraint failed/i.test(mesaj)) {
    return NextResponse.json({ hata: "Bu kayıt zaten mevcut." }, { status: 409 });
  }
  if (/FOREIGN KEY constraint failed/i.test(mesaj)) {
    return NextResponse.json(
      { hata: "İlişkili kayıt bulunamadı veya bağlı kayıtlar olduğu için işlem yapılamadı." },
      { status: 409 }
    );
  }

  /**
   * VERİTABANI YAPILANDIRMA HATASI KULLANICIYA GÖSTERİLİR.
   *
   * Bu bir sır değil, bir kurulum eksiği — ve tam olarak sistemi kuran kişinin
   * görmesi gereken şey. Genel "beklenmeyen hata" mesajının arkasına saklamak,
   * sorunu bulmak için sunucu günlüklerine erişim gerektiriyordu; oysa mesaj
   * hangi ortam değişkeninin eksik olduğunu söylüyor. Hiçbir kayıt, token ya
   * da tablo içeriği sızmıyor.
   */
  if (/TURSO_DATABASE_URL|TURSO_AUTH_TOKEN/.test(mesaj)) {
    console.error("[api] veritabanı yapılandırması eksik:", mesaj);
    return NextResponse.json({ hata: `Veritabanı yapılandırması eksik — ${mesaj}` }, { status: 503 });
  }

  // libSQL bağlantı/yetki hataları. HANGİSİ olduğu ayırt ediliyor: "bağlanamadı"
  // demek yetmiyor, çünkü yanlış token ile yanlış adres tamamen farklı iki
  // düzeltme gerektiriyor ve ikisi de kurulum sırasında sık yapılan hata.
  if (/SERVER_ERROR|UNAUTHORIZED|Unauthorized|401|403|ENOTFOUND|ECONNREFUSED|fetch failed|URL_INVALID|NOT_FOUND|404/i.test(mesaj)) {
    console.error("[api] veritabanına bağlanılamadı:", mesaj);

    let aciklama: string;
    if (/401|UNAUTHORIZED|Unauthorized/i.test(mesaj)) {
      aciklama =
        "Token reddedildi. Turso panelinden Read & Write yetkili YENİ bir token oluşturup " +
        "TURSO_AUTH_TOKEN değerini güncelleyin — token eksik kopyalanmış olabilir.";
    } else if (/ENOTFOUND|getaddrinfo|ECONNREFUSED/i.test(mesaj)) {
      aciklama =
        "Adres bulunamadı. TURSO_DATABASE_URL değerini Turso panelindeki Database URL ile " +
        "karşılaştırın; sunucu adı hatalı görünüyor.";
    } else if (/404|NOT_FOUND/i.test(mesaj)) {
      aciklama =
        "Bu adreste veritabanı yok. Token başka bir veritabanı için oluşturulmuş olabilir; " +
        "token'ı insitu-izlenebilirlik veritabanının sayfasından üretin.";
    } else {
      aciklama = "Turso adresi ve token'ının doğruluğunu kontrol edin.";
    }

    // Teknik ayrıntı KURULUM İÇİN gerekli. Token benzeri uzun diziler
    // maskeleniyor — hata metni bazı sürümlerde isteğin başlıklarını içeriyor.
    const teknik = mesaj.replace(/[A-Za-z0-9_-]{25,}/g, "…").slice(0, 160);

    return NextResponse.json(
      { hata: `Veritabanına bağlanılamadı. ${aciklama}`, teknik },
      { status: 503 }
    );
  }

  console.error("[api] beklenmeyen hata:", mesaj);
  return NextResponse.json({ hata: "Beklenmeyen bir hata oluştu. Kayıt yapılmadı." }, { status: 500 });
}

/** Salt okuma uçları için — eylem yetkisi aranmaz. */
export function okuma(ekran: Ekran, handler: Handler) {
  return korumali({ ekran }, handler);
}
