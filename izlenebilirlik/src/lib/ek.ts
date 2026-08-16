/**
 * FOTOĞRAF EKİ — saf doğrulama ve çözümleme mantığı.
 *
 * Sahada en çok istenen şey "gördüğümü kaydedeyim": hasarlı çuval, kırık mühür,
 * imha edilen malzemenin hâli, iade gelen kutunun ambalajı. Metinle tarif
 * etmek hem yavaş hem tartışmaya açık; fotoğraf denetimde tek başına delil.
 *
 * Dosya saf: veritabanı ve HTTP bilmiyor. `test/birim/ek.mjs` özellikle
 * BOYUT ve TİP sınırlarını koruyor — istemciden gelen bir data URL'nin
 * doğrudan veritabanına yazılması, hem şişme hem de içerik tipi üzerinden
 * saldırı yüzeyi demek.
 */

/** Kabul edilen içerik tipleri. Yalnızca resim — belge/PDF yüklenmesi yok. */
export const EK_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type EkMime = (typeof EK_MIME)[number];

/** Bir ekin azami boyutu (bayt). İstemci zaten küçültüyor; bu son emniyet. */
export const EK_AZAMI_BAYT = 1_500_000;

/** Bir kayda iliştirilebilecek azami ek sayısı. */
export const EK_AZAMI_ADET = 8;

/** Ek iliştirilebilen kayıt tipleri. */
export const EK_KAYNAKLARI = [
  "HAMMADDE",
  "SERI",
  "SAPMA",
  "IMHA",
  "IADE",
  "SIKAYET",
] as const;
export type EkKaynak = (typeof EK_KAYNAKLARI)[number];

export interface CozulmusEk {
  mime: EkMime;
  bayt: Uint8Array;
  boyut: number;
}

export type EkSonuc = { tamam: true; ek: CozulmusEk } | { tamam: false; hata: string };

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/**
 * İstemciden gelen `data:` URL'sini çözer ve sınırları uygular.
 *
 * Hata mesajları operatöre yönelik: "geçersiz girdi" demek yerine ne
 * yapması gerektiğini söylüyor.
 */
export function ekCozumle(dataUrl: unknown): EkSonuc {
  if (typeof dataUrl !== "string" || !dataUrl) {
    return { tamam: false, hata: "Fotoğraf alınamadı. Tekrar çekmeyi deneyin." };
  }

  const m = DATA_URL.exec(dataUrl.trim());
  if (!m) {
    return { tamam: false, hata: "Dosya biçimi tanınmadı. Yalnızca fotoğraf yüklenebilir." };
  }

  const mime = m[1].toLowerCase();
  if (!(EK_MIME as readonly string[]).includes(mime)) {
    return {
      tamam: false,
      hata: `Bu dosya tipi (${mime}) kabul edilmiyor. JPEG, PNG veya WebP fotoğraf yükleyin.`,
    };
  }

  // Base64 metnindeki satır sonları boyutu şişiriyor; ayıklanıyor.
  const govde = m[2].replace(/\s+/g, "");

  // ÇÖZMEDEN ÖNCE boyut tahmini. 20 MB'lık bir base64 metnini önce belleğe
  // açıp sonra "çok büyük" demek, sunucuyu istemcinin insafına bırakmak olur.
  const tahmin = Math.floor((govde.length * 3) / 4);
  if (tahmin > EK_AZAMI_BAYT) {
    return {
      tamam: false,
      hata: `Fotoğraf çok büyük (${mb(tahmin)} MB). En fazla ${mb(EK_AZAMI_BAYT)} MB olabilir.`,
    };
  }

  let bayt: Uint8Array;
  try {
    bayt = Uint8Array.from(Buffer.from(govde, "base64"));
  } catch {
    return { tamam: false, hata: "Fotoğraf okunamadı. Tekrar çekmeyi deneyin." };
  }

  if (bayt.length === 0) {
    return { tamam: false, hata: "Fotoğraf boş görünüyor. Tekrar çekmeyi deneyin." };
  }
  if (bayt.length > EK_AZAMI_BAYT) {
    return {
      tamam: false,
      hata: `Fotoğraf çok büyük (${mb(bayt.length)} MB). En fazla ${mb(EK_AZAMI_BAYT)} MB olabilir.`,
    };
  }

  // UZANTIYA DEĞİL İÇERİĞE BAKILIYOR. `data:image/jpeg` yazıp içine başka bir
  // şey koymak serbest; sihirli baytlar bunu yakalıyor.
  const gercek = imzaTani(bayt);
  if (!gercek) {
    return { tamam: false, hata: "Dosya geçerli bir fotoğraf değil." };
  }
  if (gercek !== mime) {
    return {
      tamam: false,
      hata: `Dosyanın içeriği belirtilen tiple uyuşmuyor (${mime} denildi, ${gercek} bulundu).`,
    };
  }

  return { tamam: true, ek: { mime: gercek, bayt, boyut: bayt.length } };
}

/** Sihirli baytlardan gerçek içerik tipini bulur. Tanımazsa null. */
export function imzaTani(b: Uint8Array): EkMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  // WebP: "RIFF" …4 bayt boyut… "WEBP"
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Kaynak tipi geçerli mi? */
export function ekKaynagiGecerli(t: unknown): t is EkKaynak {
  return typeof t === "string" && (EK_KAYNAKLARI as readonly string[]).includes(t);
}

/** Bayt sayısını operatöre gösterilecek biçimde MB'a çevirir. */
export function mb(bayt: number): string {
  return (bayt / 1_000_000).toFixed(1).replace(".", ",");
}
