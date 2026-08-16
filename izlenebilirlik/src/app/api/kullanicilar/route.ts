import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, logla, MIN_SIFRE_UZUNLUK } from "@/lib/db";
import { korumali } from "@/lib/api";
import { tumOturumlariKapat } from "@/lib/auth";
import { eposta, govde, metin, metinOpsiyonel, secim, tamsayi } from "@/lib/dogrula";
import { ROL_ETIKETLERI, type Rol } from "@/lib/types";
import { rolAtayabilir } from "@/lib/yetki";

const ROLLER = Object.keys(ROL_ETIKETLERI) as Rol[];

/**
 * Sistemde aktif admin var mı? İlk kurulum istisnasının koşulu.
 *
 * Her istekte sorgulanıyor: önbelleğe alınsaydı, ilk admin atandıktan sonra
 * istisna bir süre daha açık kalır ve o pencerede ikinci bir admin
 * açılabilirdi.
 */
async function adminVarMi(db: Awaited<ReturnType<typeof getDb>>): Promise<boolean> {
  const r = await db
    .prepare("SELECT COUNT(*) AS a FROM kullanicilar WHERE rol = 'admin' AND aktif = 1")
    .get();
  return Number(r?.a ?? 0) > 0;
}

function rolReddi(hedefRol: Rol) {
  return NextResponse.json(
    {
      hata:
        `"${ROL_ETIKETLERI[hedefRol]}" rolünü atama yetkiniz yok. ` +
        (hedefRol === "admin"
          ? "Admin rolünü yalnızca bir admin verebilir."
          : "Yönetici rolünü admin veya yönetici verebilir."),
      alan: "rol",
    },
    { status: 403 }
  );
}

export const GET = korumali({ ekran: "kullanicilar", eylem: "kullanici_yonet" }, async () => {
  const db = await getDb();
  // sifre_hash ASLA dönmüyor — sızdırılan bir hash çevrimdışı kırılabilir.
  const kayitlar = await db
    .prepare("SELECT id, ad_soyad, email, rol, gorev_kodu, aktif, olusturma_tarihi FROM kullanicilar ORDER BY id")
    .all();
  return NextResponse.json({ kayitlar, roller: ROL_ETIKETLERI });
});

export const POST = korumali({ ekran: "kullanicilar", eylem: "kullanici_yonet" }, async (req, k) => {
  const b = await govde(req);

  const ad_soyad = metin(b.ad_soyad, "Ad Soyad", 120);
  const email = eposta(b.email);
  const rol = secim<Rol>(b.rol, "Rol", ROLLER);
  const gorev_kodu = metinOpsiyonel(b.gorev_kodu, "Görev kodu", 20);
  const sifre = metin(b.sifre, "Şifre", 200);

  if (sifre.length < MIN_SIFRE_UZUNLUK) {
    return NextResponse.json(
      { hata: `Şifre en az ${MIN_SIFRE_UZUNLUK} karakter olmalı.`, alan: "sifre" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const ilkKurulum = !(await adminVarMi(db));
  if (!rolAtayabilir(k.rol, rol, ilkKurulum)) return rolReddi(rol);

  const r = await db
    .prepare(
      "INSERT INTO kullanicilar (ad_soyad, email, sifre_hash, rol, gorev_kodu) VALUES (?, ?, ?, ?, ?)"
    )
    .run(ad_soyad, email, bcrypt.hashSync(sifre, 10), rol, gorev_kodu);

  await logla(
    k.id,
    ilkKurulum && (rol === "admin" || rol === "yonetici")
      ? "İLK KURULUM — yetkili hesap oluşturuldu"
      : "Kullanıcı oluşturuldu",
    email,
    ROL_ETIKETLERI[rol]
  );
  return NextResponse.json({ tamam: true, id: r.lastInsertRowid }, { status: 201 });
});

/** Rol değiştirme, pasifleştirme ve şifre sıfırlama. */
export const PATCH = korumali({ ekran: "kullanicilar", eylem: "kullanici_yonet" }, async (req, k) => {
  const b = await govde(req);
  const id = tamsayi(b.id, "Kullanıcı", { min: 1, max: 10 ** 9 });

  const db = await getDb();
  const hedef = await db.prepare("SELECT id, email, rol, aktif FROM kullanicilar WHERE id = ?").get(id);
  if (!hedef) return NextResponse.json({ hata: "Kullanıcı bulunamadı." }, { status: 404 });

  // KENDİNİ KİLİTLEME KORUMASI. Tek Mesul Müdür kendi rolünü düşürür veya
  // hesabını pasife alırsa sisteme kullanıcı yönetimi yapabilecek kimse
  // kalmaz ve kurtarmak için veritabanına elle müdahale gerekir.
  if (hedef.id === k.id && (b.rol !== undefined || b.aktif !== undefined)) {
    return NextResponse.json(
      { hata: "Kendi rolünüzü veya hesap durumunuzu değiştiremezsiniz. Başka bir Mesul Müdür yapmalı." },
      { status: 400 }
    );
  }

  const degisiklikler: string[] = [];

  if (b.rol !== undefined) {
    const rol = secim<Rol>(b.rol, "Rol", ROLLER);
    const ilkKurulum = !(await adminVarMi(db));
    if (!rolAtayabilir(k.rol, rol, ilkKurulum)) return rolReddi(rol);
    // Mevcut rolü admin olan bir hesabı DÜŞÜRMEK de aynı yetkiyi istiyor;
    // aksi halde Mesul Müdür admin'i devre dışı bırakabilirdi. Burada
    // `ilkKurulum` false — düşürülecek bir admin varsa admin de vardır.
    if (!rolAtayabilir(k.rol, hedef.rol as Rol, false)) return rolReddi(hedef.rol as Rol);
    if (hedef.rol === "mesul_mudur" && rol !== "mesul_mudur") {
      const say = await db
        .prepare("SELECT COUNT(*) AS a FROM kullanicilar WHERE rol = 'mesul_mudur' AND aktif = 1")
        .get();
      if (Number(say.a) <= 1) {
        return NextResponse.json(
          { hata: "Sistemde en az bir aktif Mesul Müdür kalmalı." },
          { status: 400 }
        );
      }
    }
    await db.prepare("UPDATE kullanicilar SET rol = ? WHERE id = ?").run(rol, id);
    degisiklikler.push(`rol → ${ROL_ETIKETLERI[rol]}`);
  }

  if (b.aktif !== undefined) {
    const aktif = b.aktif ? 1 : 0;
    if (!aktif && hedef.rol === "mesul_mudur") {
      const say = await db
        .prepare("SELECT COUNT(*) AS a FROM kullanicilar WHERE rol = 'mesul_mudur' AND aktif = 1")
        .get();
      if (Number(say.a) <= 1) {
        return NextResponse.json(
          { hata: "Sistemde en az bir aktif Mesul Müdür kalmalı." },
          { status: 400 }
        );
      }
    }
    await db.prepare("UPDATE kullanicilar SET aktif = ? WHERE id = ?").run(aktif, id);
    // Pasifleştirilen kullanıcının açık oturumları ANINDA kapanır.
    if (!aktif) await tumOturumlariKapat(id);
    degisiklikler.push(aktif ? "aktifleştirildi" : "pasifleştirildi");
  }

  if (b.sifre !== undefined) {
    const sifre = metin(b.sifre, "Şifre", 200);
    if (sifre.length < MIN_SIFRE_UZUNLUK) {
      return NextResponse.json(
        { hata: `Şifre en az ${MIN_SIFRE_UZUNLUK} karakter olmalı.`, alan: "sifre" },
        { status: 400 }
      );
    }
    await db
      .prepare("UPDATE kullanicilar SET sifre_hash = ? WHERE id = ?")
      .run(bcrypt.hashSync(sifre, 10), id);
    // Şifre değişince tüm oturumlar düşer — çalınmış bir oturum çerezi
    // şifre değişikliğinden sonra da çalışmamalı.
    await tumOturumlariKapat(id);
    degisiklikler.push("şifre sıfırlandı");
  }

  if (!degisiklikler.length) {
    return NextResponse.json({ hata: "Değiştirilecek bir alan gönderilmedi." }, { status: 400 });
  }

  await logla(k.id, "Kullanıcı güncellendi", String(hedef.email), degisiklikler.join(", "));
  return NextResponse.json({ tamam: true, degisiklikler });
});
