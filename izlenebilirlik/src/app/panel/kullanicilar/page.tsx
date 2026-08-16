import { redirect } from "next/navigation";
import { getSession, ekranKoru } from "@/lib/auth";
import { eylemYetkili, rolAtayabilir } from "@/lib/yetki";
import { ROLLER, ROL_ETIKETLERI } from "@/lib/types";
import { getDb } from "@/lib/db";
import { KullanicilarEkrani } from "@/components/KullanicilarEkrani";

export const dynamic = "force-dynamic";

export default async function KullanicilarSayfasi() {
  const k = await getSession();
  const hedef = ekranKoru(k, "kullanicilar");
  if (hedef) redirect(hedef);
  // Ekran görünür ama eylem yetkisi yoksa da içeri girilmemeli.
  if (!eylemYetkili(k, "kullanici_yonet")) redirect("/panel");

  const db = await getDb();
  const [kayitlar, adminSayim] = await Promise.all([
    db
      .prepare(
        "SELECT id, ad_soyad, email, rol, gorev_kodu, aktif, olusturma_tarihi FROM kullanicilar ORDER BY id"
      )
      .all(),
    db
      .prepare("SELECT COUNT(*) AS a FROM kullanicilar WHERE rol = 'admin' AND aktif = 1")
      .get(),
  ]);

  // İLK KURULUM: sistemde hiç admin yokken, kullanıcı yönetimi yetkisi olan
  // kişi ilk admin'i atayabiliyor. Aynı kural API ucunda da uygulanıyor;
  // buradaki hesap yalnızca listeyi daraltmak için — menüyü gizlemek kontrol
  // değildir.
  const ilkKurulum = Number(adminSayim?.a ?? 0) === 0;
  const atanabilirRoller = ROLLER.filter((r) => rolAtayabilir(k!.rol, r, ilkKurulum));

  return (
    <KullanicilarEkrani
      kayitlar={kayitlar}
      benimId={k!.id}
      atanabilirRoller={atanabilirRoller}
      rolEtiketleri={ROL_ETIKETLERI}
    />
  );
}
