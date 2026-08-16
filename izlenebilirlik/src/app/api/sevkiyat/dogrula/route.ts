import { NextResponse } from "next/server";
import { korumali } from "@/lib/api";
import { denetimVerisi } from "@/lib/veri";
import { sevkKodlariniDenetle } from "@/lib/zincir";
import { karekodNormalize } from "@/lib/karekod";
import { govde, kodListesi } from "@/lib/dogrula";
import { trBugun } from "@/lib/db";

/**
 * Okutulan karekodları sevkiyat ÖNCESİ denetler — SOP-ÜR-14 md. 5.1.
 *
 * Ayrı uç, çünkü operatör kaydetmeden önce sonucu görmeli: 40 kod okutup
 * kaydete basınca "3'ü hatalı" demek, hangi kutuyu kenara ayıracağını
 * söylemez. Bu uç hiçbir şey YAZMAZ.
 */
export const POST = korumali({ ekran: "sevkiyat" }, async (req) => {
  const b = await govde(req);
  const kodlar = kodListesi(b.kodlar).map(karekodNormalize);

  const veri = await denetimVerisi();
  const sonuc = sevkKodlariniDenetle(kodlar, veri, trBugun());

  return NextResponse.json({
    gecerli: sonuc.gecerli.map((p) => ({ uid: p.uid, tekil: p.tekil, seri: p.seri, skt: p.skt })),
    hatali: sonuc.hatali,
  });
});
