import { NextResponse } from "next/server";
import { getDb, logla } from "@/lib/db";
import { korumali, okuma, kullaniciHatasi } from "@/lib/api";
import { govde, metin } from "@/lib/dogrula";
import { elektronikImza } from "@/lib/eimza";

export const GET = okuma("buts", async (req) => {
  const { searchParams } = new URL(req.url);
  const sadeceBekleyen = searchParams.get("bekleyen") === "1";
  const db = await getDb();

  const kayitlar = await db
    .prepare(
      `SELECT b.*, k.ad_soyad AS gonderen_ad
         FROM buts_kuyruk b
         LEFT JOIN kullanicilar k ON k.id = b.gonderen_id
        ${sadeceBekleyen ? "WHERE b.durum = 'BEKLIYOR'" : ""}
        ORDER BY b.zaman DESC, b.kod DESC
        LIMIT 500`
    )
    .all();

  const ozet = await db
    .prepare(
      `SELECT COUNT(CASE WHEN durum = 'BEKLIYOR' THEN 1 END) AS bekleyen,
              COUNT(CASE WHEN durum = 'GONDERILDI' THEN 1 END) AS gonderilen
         FROM buts_kuyruk`
    )
    .get();

  return NextResponse.json({ kayitlar, ozet });
});

/**
 * Bildirimleri "gönderildi" işaretler.
 *
 * BU UÇ KURUMA GÖNDERİM YAPMAZ — yalnızca kaydı günceller. Gerçek gönderim
 * için BÜTS web servis kimlik bilgileri gerekiyor; alındığında gönderim
 * katmanı buraya bağlanacak. İşaretlemenin gönderim OLMADIĞI kullanıcı
 * arayüzünde de açıkça yazılı; aksi halde bildirim yapılmış sanılır.
 */
export const POST = korumali({ ekran: "buts", eylem: "buts_isaretle" }, async (req, k) => {
  const b = await govde(req);

  // AÇIK LİSTE ZORUNLU. Eskiden boş gövde "bekleyenlerin TAMAMINI işaretle"
  // demekti — tek yanlış tıklama, Kuruma hiç girilmemiş bildirimleri girilmiş
  // gösterebilirdi ve bu denetimde doğrudan uygunsuzluktur. İstemci artık
  // hangi kayıtları işaretlediğini tek tek söylemek zorunda; "tümünü seç"
  // kolaylığı arayüzde var ama liste yine açık gidiyor.
  const kodlar = Array.isArray(b.kodlar)
    ? [...new Set(b.kodlar.map((x: unknown) => String(x).trim()).filter(Boolean))]
    : [];
  if (!kodlar.length) {
    kullaniciHatasi("İşaretlenecek bildirimleri seçin — toplu 'hepsi' işaretleme kaldırıldı.");
  }
  if (kodlar.length > 500) {
    kullaniciHatasi("Tek seferde en fazla 500 bildirim işaretlenebilir.");
  }

  // KURUM REFERANSI ZORUNLU. "Elle girdim" beyanının denetimde tek dayanağı,
  // Kurum arayüzünün verdiği takip numarasıdır; onsuz işaret, kanıtsız beyan.
  const kurum_ref = metin(b.kurum_ref, "Kurum referans / takip numarası", 80);

  // RESMÎ BEYAN — elektronik imza. "Kuruma girdim" demek yasal bir beyandır;
  // beyanın sahibi şifresiyle kimliğini teyit eder, girişim imza defterine
  // düşer (başarısızı dahil).
  await elektronikImza({
    k, sifre: b.sifre, eylem: "buts_isaretle", kayit: kurum_ref,
    anlam: "BÜTS bildirimlerini Kurum arayüzüne elle girdim beyanı",
  });

  const db = await getDb();
  const yer = kodlar.map(() => "?").join(",");
  const r = await db
    .prepare(
      `UPDATE buts_kuyruk SET durum = 'GONDERILDI', gonderim_zamani = datetime('now'),
              gonderen_id = ?, kurum_ref = ?
        WHERE durum = 'BEKLIYOR' AND kod IN (${yer})`
    )
    .run(k.id, kurum_ref, ...kodlar);
  const degisen = r.changes;

  // Denetim izine SAYI değil KODLAR yazılıyor — "kim, hangi kayıtları" sorusu
  // aylar sonra da cevaplanabilmeli.
  await logla(
    k.id,
    `${degisen} BÜTS bildirimi elle girildi işaretlendi`,
    kurum_ref,
    kodlar.slice(0, 40).join(", ") + (kodlar.length > 40 ? ` … (+${kodlar.length - 40})` : "")
  );
  return NextResponse.json({ tamam: true, degisen });
});
