import { cookies } from "next/headers";
import { cache } from "react";
import crypto from "crypto";
import { getDb, ensureEkTablolar } from "./db";
import type { Kullanici, Rol } from "./types";
import { ekranGorunur, ilkGorunurEkran, type Ekran } from "./yetki";

export type { Kullanici };

/** Oturum ömrü. Üretim tesisinde vardiya süresi kadar. */
const OTURUM_MS = 8 * 60 * 60 * 1000;
/** Son bir saate girmediyse uzatma UPDATE'i atlanır — gereksiz roundtrip. */
const TAZELEME_PENCERESI_MS = 60 * 60 * 1000;

/**
 * Aktif oturumun kullanıcısı. Yoksa `null`.
 *
 * React `cache()` ile aynı istek içinde birden fazla çağrı tek Turso
 * roundtrip'e iniyor (panel layout + sayfa + API aynı isteği paylaşabiliyor).
 */
export const getSession = cache(async (): Promise<Kullanici | null> => {
  const token = (await cookies()).get("oturum")?.value;
  if (!token) return null;

  const db = await getDb();
  const satir = await db
    .prepare(
      `SELECT o.kullanici_id, o.son_kullanim, k.ad_soyad, k.email, k.rol, k.gorev_kodu, k.aktif
         FROM oturumlar o
         JOIN kullanicilar k ON k.id = o.kullanici_id
        WHERE o.token = ?`
    )
    .get(token);

  if (!satir) return null;

  // PASİFLEŞTİRİLMİŞ HESAP ANINDA DÜŞER. Yalnızca giriş anında kontrol etmek,
  // yetkisi alınmış bir kullanıcının 8 saat daha çalışmasına izin verirdi.
  if (Number(satir.aktif) !== 1) {
    await db.prepare("DELETE FROM oturumlar WHERE token = ?").run(token);
    return null;
  }

  const sonKullanim = new Date(satir.son_kullanim).getTime();
  if (!Number.isFinite(sonKullanim) || sonKullanim < Date.now()) {
    await db.prepare("DELETE FROM oturumlar WHERE token = ?").run(token);
    return null;
  }

  if (sonKullanim - Date.now() < TAZELEME_PENCERESI_MS) {
    try {
      await db
        .prepare("UPDATE oturumlar SET son_kullanim = ? WHERE token = ?")
        .run(new Date(Date.now() + OTURUM_MS).toISOString(), token);
    } catch {
      /* uzatma kritik değil */
    }
  }

  const kid = Number(satir.kullanici_id);

  // Kişisel ekran izinleri — rol varsayılanını ezen istisnalar.
  let ekran_izinleri: Record<string, boolean> = {};
  try {
    const izinler = await db
      .prepare("SELECT ekran, izin FROM ekran_erisim WHERE kullanici_id = ?")
      .all(kid);
    ekran_izinleri = Object.fromEntries(izinler.map((r: any) => [r.ekran, Number(r.izin) === 1]));
  } catch (e) {
    // SESSİZ DEĞİL: izin tablosu okunamadığında herkes rol varsayılanına düşer.
    // Bu davranış doğru (varsayılan güvenli) ama izsiz kalması tehlikeli.
    console.error("[auth] ekran_erisim okunamadı, rol varsayılanına düşülüyor:", (e as Error)?.message);
  }

  // Rolün DÜZENLENMİŞ yetkileri — Roller ekranından yapılan değişiklikler.
  // Kayıt yoksa koddaki GMP varsayılanı geçerli (bkz. `src/lib/yetki.ts`).
  const rol_ekran_izinleri: Record<string, boolean> = {};
  const rol_eylem_izinleri: Record<string, boolean> = {};
  try {
    await ensureEkTablolar();
    const satirlar = await db
      .prepare("SELECT tur, anahtar, izin FROM rol_yetkileri WHERE rol = ?")
      .all(String(satir.rol));
    for (const r of satirlar as any[]) {
      const hedef = r.tur === "EKRAN" ? rol_ekran_izinleri : rol_eylem_izinleri;
      hedef[String(r.anahtar)] = Number(r.izin) === 1;
    }
  } catch (e) {
    // Okunamazsa herkes GMP varsayılanına düşer — güvenli taraf. Ama sessiz
    // kalmamalı: yetkilerin beklenmedik şekilde davranmasının sebebi budur.
    console.error("[auth] rol_yetkileri okunamadı, varsayılana düşülüyor:", (e as Error)?.message);
  }

  return {
    id: kid,
    ad_soyad: String(satir.ad_soyad),
    email: String(satir.email),
    rol: satir.rol as Rol,
    gorev_kodu: satir.gorev_kodu ?? null,
    ekran_izinleri,
    rol_ekran_izinleri,
    rol_eylem_izinleri,
  };
});

export async function oturumAc(kullaniciId: number): Promise<string> {
  // 32 bayt kriptografik rastgele — tahmin edilemez.
  const token = crypto.randomBytes(32).toString("hex");
  const db = await getDb();
  await db
    .prepare("INSERT INTO oturumlar (token, kullanici_id, son_kullanim) VALUES (?, ?, ?)")
    .run(token, kullaniciId, new Date(Date.now() + OTURUM_MS).toISOString());
  return token;
}

export async function oturumKapat(token: string): Promise<void> {
  const db = await getDb();
  await db.prepare("DELETE FROM oturumlar WHERE token = ?").run(token);
}

/** Bir kullanıcının TÜM oturumlarını kapatır — şifre değişimi ve pasifleştirmede. */
export async function tumOturumlariKapat(kullaniciId: number): Promise<void> {
  const db = await getDb();
  await db.prepare("DELETE FROM oturumlar WHERE kullanici_id = ?").run(kullaniciId);
}

/** Çerez ayarları — TEK YER. Giriş ve çıkış aynı tanımı kullanmalı. */
export const OTURUM_COOKIE = {
  ad: "oturum",
  secenekler: {
    httpOnly: true,
    // Üretimde HTTPS zorunlu; geliştirmede localhost http olduğu için kapalı.
    secure: process.env.NODE_ENV === "production",
    // `lax`: CSRF'e karşı korur ama normal gezinmeyi bozmaz.
    sameSite: "lax" as const,
    path: "/",
    maxAge: OTURUM_MS / 1000,
  },
};

/**
 * Sayfa koruması. Erişim yoksa yönlendirilecek adresi döndürür, varsa `null`.
 *
 *   const hedef = ekranKoru(kullanici, "uretim");
 *   if (hedef) redirect(hedef);
 */
export function ekranKoru(k: Kullanici | null, ekran: Ekran): string | null {
  if (!k) return "/login";
  if (ekranGorunur(k, ekran)) return null;
  return ilkGorunurEkran(k);
}

/** API koruması. Sayfa kapalıysa uç nokta da kapalı olmalı. */
export function ekranYok(k: Kullanici | null, ekran: Ekran): boolean {
  return !k || !ekranGorunur(k, ekran);
}
