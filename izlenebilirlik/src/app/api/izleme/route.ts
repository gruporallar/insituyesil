import { NextResponse } from "next/server";
import { okuma } from "@/lib/api";
import { izlemeSorgula } from "@/lib/izlemeSorgu";

export const GET = okuma("izleme", async (req) => {
  const { searchParams } = new URL(req.url);
  const sonuc = await izlemeSorgula(searchParams.get("q") ?? "");
  return NextResponse.json({ sonuc });
});
