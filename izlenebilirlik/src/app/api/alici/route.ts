import { NextResponse } from "next/server";
import { getDb, logla, sayacArtirTx } from "@/lib/db";
import { korumali, okuma } from "@/lib/api";
import { kodAlici } from "@/lib/kod";
import { govde, metin, metinOpsiyonel, secim } from "@/lib/dogrula";
import type { AliciTip } from "@/lib/types";

export const GET = okuma("sevkiyat", async () => {
  const db = await getDb();
  const kayitlar = await db.prepare("SELECT * FROM aliciar ORDER BY tip, ad").all();
  return NextResponse.json({ kayitlar });
});

export const POST = korumali({ ekran: "sevkiyat", eylem: "alici_yaz" }, async (req, k) => {
  const b = await govde(req);

  const tip = secim<AliciTip>(b.tip, "Alıcı tipi", ["DEPO", "ECZANE"]);
  const ad = metin(b.ad, "Ad / Ünvan", 160);
  const gln = metinOpsiyonel(b.gln, "GLN no", 20);
  const il = metin(b.il, "İl", 40);
  const adres = metinOpsiyonel(b.adres, "Adres", 300);
  const yetkili = metinOpsiyonel(b.yetkili, "Yetkili", 120);

  const db = await getDb();
  const kod = await db.transaction(async (calistir) => {
    const n = await sayacArtirTx(calistir, `alici-${tip}`);
    const kod = kodAlici(tip, n);
    await calistir(
      `INSERT INTO aliciar (kod, tip, ad, gln, il, adres, yetkili, olusturan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      kod, tip, ad, gln, il, adres, yetkili, k.id
    );
    return kod;
  });

  await logla(k.id, `${tip === "ECZANE" ? "Eczane" : "Ecza deposu"} tanımlandı`, kod, ad);
  return NextResponse.json({ tamam: true, kod }, { status: 201 });
});
