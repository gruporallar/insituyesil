/**
 * ROL YETKİ TABLOSU — Roller ekranının gördüğü veri.
 *
 * Hem sayfa (sunucu bileşeni) hem API ucu aynı tabloyu üretiyor. Hesap iki
 * yerde kopyalanmıştı ve kaçınılmaz olarak ayrışacaktı: ekranda açık görünen
 * bir yetkinin kaydederken farklı yorumlanması, yetki sisteminde yapılabilecek
 * en sinsi hata. Tek yer.
 *
 * Dosya saf: veritabanı bilmiyor, kaydedilmiş sapmaları hazır alıyor.
 */

import { ROLLER, ROL_ETIKETLERI, type Rol } from "./types.ts";
import {
  EKRANLAR, EYLEMLER, ROL_EKRANLARI,
  eylemVarsayilani, eylemKilitliMi, type Eylem,
} from "./yetki.ts";

export interface YetkiSatiri {
  anahtar: string;
  /** Şu an geçerli değer. */
  deger: boolean;
  /** Koddaki GMP varsayılanı. */
  varsayilan: boolean;
  /** Düzenlenemez mi? (mevzuat kilidi ya da rolün tanımı gereği) */
  kilitli: boolean;
  /** Varsayılandan ayrılmış mı? Denetimde sorulan şey bu. */
  sapmaVar: boolean;
}

export interface RolSatiri {
  rol: Rol;
  etiket: string;
  duzenlenebilir: boolean;
  ekranlar: YetkiSatiri[];
  eylemler: YetkiSatiri[];
}

/** rol → tur → anahtar → izin. Yalnızca kaydedilmiş SAPMALAR. */
export type SapmaHaritasi = Record<string, Record<string, Record<string, boolean>>>;

/**
 * Rolün tanımı gereği ZORLANAN değer. Düzenlemeye kapalı ve varsayılanı da
 * bu — aksi halde admin'in tam yetkisi "23 sapma" gibi görünürdü, oysa
 * admin'in varsayılanı zaten her şey.
 */
function zorlananDeger(rol: Rol, tur: "EKRAN" | "EYLEM"): boolean | null {
  if (rol === "admin") return true;
  if (rol === "okuyucu" && tur === "EYLEM") return false;
  return null;
}

export function yetkiSatiri(
  rol: Rol,
  tur: "EKRAN" | "EYLEM",
  anahtar: string,
  kodVarsayilani: boolean,
  sapma: SapmaHaritasi,
  mevzuatKilidi = false
): YetkiSatiri {
  const zorlanan = zorlananDeger(rol, tur);
  if (zorlanan !== null) {
    // Zorlanan değer hem geçerli değer hem varsayılan: sapma yok.
    return { anahtar, deger: zorlanan, varsayilan: zorlanan, kilitli: true, sapmaVar: false };
  }

  const kayitli = sapma[rol]?.[tur]?.[anahtar];
  const deger = mevzuatKilidi ? kodVarsayilani : (kayitli ?? kodVarsayilani);
  return {
    anahtar,
    deger,
    varsayilan: kodVarsayilani,
    kilitli: mevzuatKilidi,
    sapmaVar: deger !== kodVarsayilani,
  };
}

/** Tüm roller için tam yetki tablosu. */
export function rolTablosu(sapma: SapmaHaritasi): RolSatiri[] {
  return ROLLER.map((rol) => ({
    rol,
    etiket: ROL_ETIKETLERI[rol],
    duzenlenebilir: rol !== "admin",
    ekranlar: EKRANLAR.map((e) =>
      yetkiSatiri(rol, "EKRAN", e, ROL_EKRANLARI[rol].includes(e), sapma)
    ),
    eylemler: EYLEMLER.map((e) =>
      yetkiSatiri(rol, "EYLEM", e, eylemVarsayilani(rol, e as Eylem), sapma, eylemKilitliMi(e as Eylem))
    ),
  }));
}

/** Veritabanı satırlarını sapma haritasına çevirir. */
export function sapmaHaritasi(
  satirlar: { rol: unknown; tur: unknown; anahtar: unknown; izin: unknown }[]
): SapmaHaritasi {
  const h: SapmaHaritasi = {};
  for (const r of satirlar) {
    const rol = String(r.rol);
    const tur = String(r.tur);
    (h[rol] ??= {})[tur] ??= {};
    h[rol][tur][String(r.anahtar)] = Number(r.izin) === 1;
  }
  return h;
}
