import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import {
  getDb, logla,
  girisKilitliMi, girisDenemesiKaydet, girisDenemeleriniTemizle, GIRIS_PENCERE_DK,
} from "@/lib/db";
import { oturumAc, OTURUM_COOKIE } from "@/lib/auth";
import { eposta, govde, metin } from "@/lib/dogrula";
import { hataYaniti } from "@/lib/api";

/**
 * Giriş.
 *
 * DENEME SINIRI KALICI. Eskiden sayaç sunucu belleğindeydi ve Vercel'de her
 * yeni örnek onu sıfırlıyordu; sınır pratikte kalkmış oluyordu (bulgu B-13).
 * Artık `giris_denemeleri` tablosunda — bkz. `src/lib/db.ts`.
 */
export async function POST(req: Request) {
  try {
    const b = await govde(req);
    const email = eposta(b.email);
    const sifre = metin(b.sifre, "Şifre", 200);

    // KİLİT ŞİFRE KONTROLÜNDEN ÖNCE. Sonra bakılsaydı her istek yine bir
    // bcrypt karşılaştırması harcardı — bu, kilidin kendisini bir CPU
    // tüketme aracına çevirirdi.
    if (await girisKilitliMi(email)) {
      return NextResponse.json(
        { hata: `Çok fazla başarısız deneme. ${GIRIS_PENCERE_DK} dakika sonra tekrar deneyin.` },
        { status: 429 }
      );
    }

    const db = await getDb();
    const k = await db
      .prepare("SELECT id, sifre_hash, aktif, ad_soyad FROM kullanicilar WHERE email = ?")
      .get(email);

    // KULLANICI YOK ile ŞİFRE YANLIŞ AYNI MESAJI VERİR. Farklı mesaj vermek,
    // hangi e-postaların sistemde kayıtlı olduğunu saldırgana söyler.
    // Kullanıcı yoksa da bcrypt karşılaştırması yapılıyor: yanıt süresi
    // farkından hesap varlığı çıkarılmasın (zamanlama yan kanalı).
    const hash = k?.sifre_hash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
    const dogru = await bcrypt.compare(sifre, String(hash));

    if (!k || !dogru) {
      const { kilitli, kalan } = await girisDenemesiKaydet(email);

      // Kilidi TETİKLEYEN denemede de 429 dönüyor. Sadece bir sonraki istekte
      // bildirseydi kullanıcı hâlâ "şifre hatalı" görüp denemeye devam eder,
      // hesabın kilitlendiğini fark etmezdi.
      if (kilitli) {
        return NextResponse.json(
          { hata: `Çok fazla başarısız deneme. ${GIRIS_PENCERE_DK} dakika sonra tekrar deneyin.` },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          hata:
            kalan > 0 && kalan <= 3
              ? `E-posta veya şifre hatalı. ${kalan} deneme hakkınız kaldı.`
              : "E-posta veya şifre hatalı.",
        },
        { status: 401 }
      );
    }
    if (Number(k.aktif) !== 1) {
      return NextResponse.json(
        { hata: "Hesabınız pasif durumda. Mesul Müdür ile görüşün." },
        { status: 403 }
      );
    }

    await girisDenemeleriniTemizle(email);
    const token = await oturumAc(Number(k.id));
    (await cookies()).set(OTURUM_COOKIE.ad, token, OTURUM_COOKIE.secenekler);
    await logla(Number(k.id), "Giriş yapıldı");

    return NextResponse.json({ tamam: true });
  } catch (e) {
    return hataYaniti(e);
  }
}
