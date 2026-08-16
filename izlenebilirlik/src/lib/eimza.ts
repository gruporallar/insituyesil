import bcrypt from "bcryptjs";
import { getDb, ensureEkTablolar, logla } from "./db";
import { kullaniciHatasi } from "./api";
import type { Kullanici } from "./types";

/**
 * ELEKTRONİK İMZA — kritik karar anında şifreyle yeniden doğrulama.
 *
 * Açık oturum yetmez: oturum sekiz saat yaşıyor ve başında kim varsa onun
 * adına işlem yapar. Seri serbest bırakma, geri çekme ve imha gibi geri
 * alınamaz kararlarda kişi ŞİFRESİNİ O ANDA yeniden girerek "bu kararı ben,
 * bilerek veriyorum" beyanında bulunur.
 *
 * NE OLMADIĞI da net olsun: bu tek başına "21 CFR Part 11 uyumlu elektronik
 * imza" İDDİASI değildir — o iddia yazılım özelliğiyle değil, validasyon
 * paketi + prosedür + eğitimle birlikte kurulur. Buradaki iş, Part 11'in
 * 11.50/11.100/11.200'de saydığı unsurları KAYITTA bulundurmak: imzalayanın
 * benzersiz kimliği ve adı, zaman, imzanın anlamı, bağlandığı kayıt ve
 * başarısız girişimlerin izi.
 *
 * ÜÇ MEKANİZMA BİRBİRİNE KARIŞTIRILMASIN:
 *   işlem onayı        → "emin misiniz?" ekranı (arayüzde zaten var)
 *   yeniden doğrulama  → bu dosya (aynı kişinin kimliğini şifreyle teyidi)
 *   çift kişi onayı    → ayrı yetkilinin onayı (imha tutanağındaki iki tanık
 *                        gibi; her kritik işlem için zorunlu değil, SOP'ye bağlı)
 */
export async function elektronikImza(args: {
  k: Kullanici;
  sifre: unknown;
  eylem: string;
  kayit: string;
  anlam: string;
}): Promise<void> {
  const { k, eylem, kayit, anlam } = args;
  const sifre = typeof args.sifre === "string" ? args.sifre : "";

  await ensureEkTablolar();
  const db = await getDb();

  if (!sifre) {
    kullaniciHatasi(
      `Bu işlem (${anlam}) elektronik imza gerektirir — şifrenizi girerek onaylayın.`
    );
  }

  const satir = await db
    .prepare("SELECT sifre_hash, aktif FROM kullanicilar WHERE id = ?")
    .get(k.id);
  const dogru =
    !!satir && Number(satir.aktif) === 1 && (await bcrypt.compare(sifre, String(satir.sifre_hash)));

  // BAŞARISIZ GİRİŞİM DE YAZILIR — imza defterinin kendisine, ayrıca genel
  // denetim izine. Yalnız başarılıyı kaydetmek deneme-yanılmayı görünmez kılar.
  await db
    .prepare(
      `INSERT INTO imzalar (kullanici_id, ad_soyad, eylem, kayit, anlam, basarili)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(k.id, k.ad_soyad, eylem, kayit, anlam, dogru ? 1 : 0);

  if (!dogru) {
    await logla(k.id, "ELEKTRONİK İMZA REDDEDİLDİ", kayit, anlam);
    kullaniciHatasi("Şifre doğrulanamadı — elektronik imza reddedildi, işlem yapılmadı.");
  }
}
