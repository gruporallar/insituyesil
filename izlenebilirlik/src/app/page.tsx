import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ilkGorunurEkran } from "@/lib/yetki";

export default async function Anasayfa() {
  const k = await getSession();
  // Kullanıcıyı sabit `/panel`e değil, GÖREBİLDİĞİ ilk ekrana bırakıyoruz.
  // Depo sorumlusunun panel yetkisi kapatılmışsa boş sayfaya düşmesin.
  redirect(k ? ilkGorunurEkran(k) : "/login");
}
