import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { gorunurEkranlar, EKRAN_ETIKETLERI, EKRAN_GRUPLARI, EKRAN_IKONLARI } from "@/lib/yetki";
import { ROL_ETIKETLERI } from "@/lib/types";
import { Kabuk } from "@/components/Kabuk";
import { getDb } from "@/lib/db";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const kullanici = await getSession();
  if (!kullanici) redirect("/login");

  // Menü SUNUCUDA üretiliyor. İstemcide üretilseydi yetkisiz bir ekranın
  // bağlantısı bir an için görünürdü; ayrıca menü yetki KAYNAĞI değil,
  // yansıması — her sayfa kendi `ekranKoru` çağrısını da yapıyor.
  // TEST VERİSİ bayrağı — örnek veri betiği açar, sıfırlama kapatır.
  // DEN-01 "henüz üretim yok" derken ekranda dolu kayıt görünüyorsa,
  // kayıtların test olduğu HER sayfada yazmalı (dış denetim bulgusu).
  let testVerisi = false;
  try {
    const db = await getDb();
    const r = await db.prepare("SELECT deger FROM ayarlar WHERE anahtar = 'ornek_veri'").get();
    testVerisi = String(r?.deger ?? "0") === "1";
  } catch {
    /* tablo henüz yoksa bayrak kapalı */
  }

  const gorunur = new Set(gorunurEkranlar(kullanici));
  // Gruplar SUNUCUDA daraltılıyor: kullanıcının hiç ekranı olmayan grup
  // (başlığıyla birlikte) menüde hiç var olmuyor.
  const gruplar = EKRAN_GRUPLARI.map((g) => ({
    baslik: g.baslik,
    ekranlar: g.ekranlar
      .filter((e) => gorunur.has(e))
      .map((e) => ({
        anahtar: e,
        etiket: EKRAN_ETIKETLERI[e],
        ikon: EKRAN_IKONLARI[e],
        yol: e === "panel" ? "/panel" : `/panel/${e}`,
      })),
  })).filter((g) => g.ekranlar.length > 0);

  return (
    <Kabuk
      gruplar={gruplar}
      testVerisi={testVerisi}
      kullanici={{
        ad: kullanici.ad_soyad,
        rol: ROL_ETIKETLERI[kullanici.rol],
        gorev: kullanici.gorev_kodu,
      }}
    >
      {children}
    </Kabuk>
  );
}
