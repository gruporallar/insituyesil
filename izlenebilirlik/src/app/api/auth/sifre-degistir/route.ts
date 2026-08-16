import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getDb, logla, MIN_SIFRE_UZUNLUK } from "@/lib/db";
import { getSession, oturumAc, tumOturumlariKapat, OTURUM_COOKIE } from "@/lib/auth";
import { govde, metin } from "@/lib/dogrula";
import { hataYaniti } from "@/lib/api";

/**
 * Kullanıcının KENDİ şifresini değiştirmesi.
 *
 * NEDEN AYRI UÇ: şifre sıfırlama `/api/kullanicilar` PATCH içindeydi ve o uç
 * `kullanici_yonet` yetkisi istiyor — yani yalnızca Mesul Müdür. Sonuç olarak
 * KG-KK, üretim ve depo sorumlusu kendi şifresini HİÇ değiştiremiyordu ve her
 * hesabın şifresini en az iki kişi biliyordu. Denetim izi kimin ne yaptığını
 * kaydediyor ama paylaşılan şifre o izin değerini düşürür (ALCOA+
 * atfedilebilirlik).
 *
 * Bu uç yetki DEĞİL kimlik doğrular: oturum sahibi kendi şifresini değiştirir.
 * `ekranKoru`/`korumali` kullanılmıyor çünkü her rol erişebilmeli.
 */
export async function POST(req: Request) {
  try {
    const kullanici = await getSession();
    if (!kullanici) {
      return NextResponse.json({ hata: "Oturum bulunamadı. Lütfen tekrar giriş yapın." }, { status: 401 });
    }

    const b = await govde(req);
    const mevcut = metin(b.mevcut_sifre, "Mevcut şifre", 200);
    const yeni = metin(b.yeni_sifre, "Yeni şifre", 200);

    if (yeni.length < MIN_SIFRE_UZUNLUK) {
      return NextResponse.json(
        { hata: `Yeni şifre en az ${MIN_SIFRE_UZUNLUK} karakter olmalı.`, alan: "yeni_sifre" },
        { status: 400 }
      );
    }
    if (yeni === mevcut) {
      return NextResponse.json(
        { hata: "Yeni şifre mevcut şifreyle aynı olamaz.", alan: "yeni_sifre" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const satir = await db.prepare("SELECT sifre_hash FROM kullanicilar WHERE id = ?").get(kullanici.id);
    if (!satir) {
      return NextResponse.json({ hata: "Hesap bulunamadı." }, { status: 404 });
    }

    // MEVCUT ŞİFRE DOĞRULANIYOR. Yalnızca oturuma güvenmek, açık bırakılmış bir
    // ekranda başkasının şifreyi değiştirmesine izin verirdi.
    const dogru = await bcrypt.compare(mevcut, String(satir.sifre_hash));
    if (!dogru) {
      return NextResponse.json({ hata: "Mevcut şifre hatalı.", alan: "mevcut_sifre" }, { status: 401 });
    }

    await db
      .prepare("UPDATE kullanicilar SET sifre_hash = ? WHERE id = ?")
      .run(bcrypt.hashSync(yeni, 10), kullanici.id);

    /**
     * DİĞER OTURUMLAR DÜŞÜRÜLÜYOR, BU OTURUM AÇIK KALIYOR.
     *
     * Şifre değişikliğinin bir sebebi şifrenin başkasınca bilinmesidir; o
     * kişinin açık oturumu devam ederse değişiklik hiçbir işe yaramaz. Önce
     * tüm oturumlar siliniyor, sonra işlemi yapan kişiye yeni bir oturum
     * veriliyor — kullanıcı kendini dışarı atmış olmuyor.
     */
    await tumOturumlariKapat(kullanici.id);
    const yeniToken = await oturumAc(kullanici.id);
    (await cookies()).set(OTURUM_COOKIE.ad, yeniToken, OTURUM_COOKIE.secenekler);

    await logla(kullanici.id, "Kendi şifresini değiştirdi", kullanici.email, "Diğer oturumlar kapatıldı");

    return NextResponse.json({ tamam: true });
  } catch (e) {
    return hataYaniti(e);
  }
}
