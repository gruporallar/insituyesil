import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { oturumKapat, OTURUM_COOKIE } from "@/lib/auth";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(OTURUM_COOKIE.ad)?.value;
  if (token) await oturumKapat(token);
  // Çerez her hâlükârda siliniyor: token veritabanında bulunamasa bile
  // tarayıcıda kalması kullanıcıyı "hâlâ girişte" sanmaya iter.
  jar.delete(OTURUM_COOKIE.ad);
  return NextResponse.json({ tamam: true });
}
