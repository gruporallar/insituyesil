import { NextResponse } from "next/server";
import { okuma } from "@/lib/api";
import { getDb, ensureEkTablolar } from "@/lib/db";
import { imzaTani } from "@/lib/ek";

/**
 * Ekin kendisini döndürür.
 *
 * Oturum zorunlu — fotoğraflar hasarlı ürün, imha ve şikayet kayıtlarına ait
 * ve kimliği belirsiz kişilere açık olmamalı.
 */
export const GET = okuma("izleme", async (_req, _k, ctx) => {
  await ensureEkTablolar();
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    return NextResponse.json({ hata: "Geçersiz ek numarası." }, { status: 400 });
  }

  const db = await getDb();
  const r = await db.prepare("SELECT mime, veri FROM ekler WHERE id = ?").get(n);
  if (!r) return NextResponse.json({ hata: "Ek bulunamadı." }, { status: 404 });

  // libSQL BLOB'ları `ArrayBuffer` olarak döndürüyor, `Uint8Array` olarak
  // değil. Doğrudan indekslemek (`b[0]`) sessizce `undefined` verir ve içerik
  // tipi tanınamaz — tarayıcı da fotoğrafı göstermek yerine indirmeye kalkar.
  const ham = r.veri as ArrayBuffer | Uint8Array;
  const bayt = ham instanceof Uint8Array ? ham : new Uint8Array(ham);

  // İÇERİK TİPİ KAYITTAN DEĞİL BAYTLARDAN. Kolonun içine bir şekilde yanlış
  // bir mime girmişse tarayıcıya onu söylemek, saklanan baytı olduğundan
  // farklı yorumlatmak demek.
  const mime = imzaTani(bayt) ?? "application/octet-stream";

  // `BodyInit` `Uint8Array<ArrayBufferLike>` kabul etmiyor; alttaki tamponu
  // kopyalayarak kesin bir `ArrayBuffer` veriliyor.
  return new NextResponse(bayt.slice().buffer as ArrayBuffer, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bayt.byteLength),
      // Ekler değişmiyor; tarayıcı aynı fotoğrafı tekrar indirmesin.
      "Cache-Control": "private, max-age=31536000, immutable",
      // Tarayıcı içerik tipini kendi tahmin etmeye kalkmasın.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
});
