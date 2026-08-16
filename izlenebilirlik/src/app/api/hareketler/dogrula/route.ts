import { NextResponse } from "next/server";
import { korumali } from "@/lib/api";
import { getDb, logla } from "@/lib/db";
import { zinciriDogrula, topluOzet, type LogSatiri } from "@/lib/logZinciri";

/**
 * Hash zincirini baştan sona yürütür.
 *
 * Doğrulama isteğinin KENDİSİ de denetim izine yazılır — ama zincir
 * yürütüldükten SONRA; kendi kaydını doğrulamaya çalışmak anlamsız olurdu.
 * Bu ölçekte (yılda birkaç bin satır) tam tarama saniyeler sürer; kayıt
 * yüz binlere ulaşırsa son doğrulanan noktadan devam eden artımlı kontrol
 * buraya eklenmeli.
 */
export const POST = korumali({ ekran: "hareketler" }, async (_req, k) => {
  const db = await getDb();
  const satirlar = (await db
    .prepare("SELECT id, tarih, kullanici_id, eylem, kayit, detay, ozet FROM loglar ORDER BY id ASC")
    .all()) as unknown as LogSatiri[];

  let sonuc = zinciriDogrula(satirlar);

  // BAŞLANGIÇ MÜHRÜ DE DOĞRULANIYOR. Mühür, zincir öncesi kayıtların toplu
  // özetini taşıyor; yeniden hesaplayıp karşılaştırmadan "zincir sağlam"
  // demek, en eski kayıtları kontrolsüz bırakmak olurdu.
  if (sonuc.tamam) {
    const muhur = satirlar.find((x) => x.eylem === "DENETİM İZİ HASH ZİNCİRİ BAŞLATILDI");
    if (muhur) {
      const eski = satirlar.filter((x) => x.ozet == null && x.id < muhur.id);
      const beklenen = topluOzet(eski);
      const kayitli = /toplu özet ([0-9a-f]{64})/.exec(muhur.detay ?? "")?.[1];
      if (kayitli && kayitli !== beklenen) {
        sonuc = {
          ...sonuc, tamam: false, kopanId: muhur.id,
          mesaj:
            `Başlangıç mührü tutmuyor: zincir öncesi ${eski.length} kaydın toplu özeti ` +
            `mühürdekiyle farklı — eski kayıtlarda değişiklik ya da silme var.`,
        };
      } else if (kayitli) {
        sonuc = { ...sonuc, mesaj: sonuc.mesaj + ` Başlangıç mührü doğrulandı (${eski.length} eski kayıt).` };
      }
    }
  }

  await logla(
    k.id,
    sonuc.tamam ? "Denetim izi zinciri doğrulandı" : "DENETİM İZİ ZİNCİRİ KOPUK",
    sonuc.kopanId ? `#${sonuc.kopanId}` : null,
    sonuc.mesaj.slice(0, 400)
  );

  return NextResponse.json(sonuc);
});
