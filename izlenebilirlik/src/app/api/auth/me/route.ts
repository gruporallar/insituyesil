import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { gorunurEkranlar } from "@/lib/yetki";

export async function GET() {
  const k = await getSession();
  if (!k) return NextResponse.json({ kullanici: null }, { status: 401 });
  return NextResponse.json({ kullanici: k, ekranlar: gorunurEkranlar(k) });
}
