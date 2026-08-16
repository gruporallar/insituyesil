import { NextResponse } from "next/server";
import { okuma } from "@/lib/api";
import { zincirVerisi } from "@/lib/veri";
import { hizliTani } from "@/lib/hizli";
import { eylemYetkili, type Eylem } from "@/lib/yetki";

/**
 * Okutulan tek bir kodu tanır — "bu ne ve şimdi ne yapabilirim".
 *
 * GET, çünkü hiçbir şey yazmıyor ve operatör aynı kutuyu iki kez okutunca
 * yan etki oluşmamalı. Eylem listesi SUNUCUDA, kullanıcının kendi yetkisiyle
 * hesaplanıyor; istemciden gelen rol iddiasına bakılmıyor.
 *
 * Sevkiyat ekranındaki anlık doğrulama da bu ucu kullanıyor: her okutmada tek
 * istek, sonuç anında. Eski akışta 40 kod okutulup en sonda toplu doğrulama
 * yapılıyordu ve hatalı kutu ancak o zaman ortaya çıkıyordu.
 */
export const GET = okuma("hizli", async (req, kullanici) => {
  const kod = new URL(req.url).searchParams.get("kod") ?? "";

  const veri = await zincirVerisi();
  const sonuc = hizliTani(kod, veri, (e) => eylemYetkili(kullanici, e as Eylem));

  return NextResponse.json(sonuc);
});
