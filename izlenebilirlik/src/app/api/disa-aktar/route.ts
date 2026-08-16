import { getSession } from "@/lib/auth";
import { logla, getDb, ensureEkTablolar, trBugun } from "@/lib/db";
import { ekranGorunur, type Ekran } from "@/lib/yetki";
import { NextResponse } from "next/server";

/**
 * LİSTE DIŞA AKTARMA — Excel'de açılabilir CSV.
 *
 * NEDEN CSV, NEDEN .xlsx DEĞİL: gerçek bir xlsx yazmak için bir kütüphane
 * (SheetJS ~1 MB) gerekiyor. Noktalı virgülle ayrılmış ve BOM'lu bir CSV,
 * Türkçe Windows'ta Excel tarafından çift tıklamayla doğru açılıyor —
 * bağımlılık eklemeden aynı işi görüyor. Denetimde kayıt talebi geldiğinde
 * ekrandan okumak yerine dosya verilebiliyor (bulgu B-12).
 *
 * NOKTALI VİRGÜL: Türkçe yerelde Excel'in liste ayırıcısı `;`. Virgülle
 * ayrılmış dosya tek sütuna yapışık açılır ve kullanıcı "bozuk" sanır.
 */

type Tanim = { ekran: Ekran; baslik: string[]; sql: string };

const TANIMLAR: Record<string, Tanim> = {
  ciftci: {
    ekran: "ciftci",
    baslik: ["Kod", "Ad/Ünvan", "TC/Vergi No", "ÇKS No", "Ekim İzin No", "İl", "İlçe", "Parsel", "Alan (dekar)", "Telefon", "Kayıt"],
    sql: `SELECT kod, ad, tc_vkn, cks_no, izin_no, il, ilce, parsel, alan_dekar, tel, date(olusturma_tarihi)
            FROM ciftciler ORDER BY kod`,
  },
  hammadde: {
    ekran: "hammadde",
    baslik: ["Lot", "Çiftçi", "Teslim", "Miktar (kg)", "Kalan (kg)", "Nem (%)", "THC (%)", "CBD (%)", "Statü", "Analiz Rapor", "Lab", "Ret Nedeni"],
    sql: `SELECT h.lot, c.ad, h.teslim_tarihi, h.miktar_kg, h.kalan_kg, h.nem, h.thc, h.cbd,
                 h.statu, h.analiz_rapor_no, h.lab, h.ret_nedeni
            FROM hammadde h LEFT JOIN ciftciler c ON c.kod = h.ciftci_kod ORDER BY h.lot`,
  },
  seri: {
    ekran: "uretim",
    baslik: ["Seri", "Ürün", "Üretim", "Girdi (kg)", "Çıktı (kg)", "Fire (kg)", "Numune (kg)", "Kütle Denkliği (%)", "CBD (%)", "THC (%)", "Çözücü (ppm)", "Statü", "Serbest Bırakan", "Ret Nedeni"],
    sql: `SELECT seri, urun_tipi, uretim_tarihi, girdi_kg, cikti_kg, fire_kg, numune_kg,
                 mb, cbd, thc, cozucu, statu, serbest_kisi, ret_nedeni
            FROM seriler ORDER BY seri`,
  },
  paket: {
    ekran: "ambalaj",
    baslik: ["Tekil No", "Seri", "Dolum (g)", "SKT", "Statü", "Konum", "Karekod"],
    sql: `SELECT tekil, seri, miktar_g, skt, statu, konum, uid FROM paketler ORDER BY tekil`,
  },
  sevkiyat: {
    ekran: "sevkiyat",
    baslik: ["Sevk No", "Tarih", "Alıcı", "Tip", "İl", "Adet", "Taşıyıcı", "Mühür", "İrsaliye", "Teslim Alan", "BÜTS Ref"],
    sql: `SELECT s.kod, s.tarih, a.ad, a.tip, a.il,
                 (SELECT COUNT(*) FROM paketler p WHERE p.sevk_kod = s.kod),
                 s.tasiyici, s.muhur_no, s.irsaliye, s.teslim_alan, s.buts_ref
            FROM sevkiyatlar s LEFT JOIN aliciar a ON a.kod = s.alici_kod ORDER BY s.kod`,
  },
  satis: {
    ekran: "satis",
    // Hasta kimliği MASKELİ dışa aktarılıyor — veritabanında da maskeli.
    baslik: ["Satış No", "Tarih", "Eczane", "İl", "Seri", "Tekil No", "Hasta", "Hasta TC (maskeli)", "Reçete", "Hekim"],
    sql: `SELECT s.kod, s.tarih, a.ad, a.il, p.seri, p.tekil,
                 s.hasta_ad, s.hasta_tc_maskeli, s.recete_no, s.hekim
            FROM satislar s
            LEFT JOIN aliciar a ON a.kod = s.alici_kod
            LEFT JOIN paketler p ON p.uid = s.paket_uid ORDER BY s.kod`,
  },
  sapma: {
    ekran: "sapma",
    baslik: ["Kod", "Kaynak Tip", "Kaynak", "Konu", "Açıklama", "Kök Neden", "CAPA", "Sorumlu", "Termin", "Durum", "Açılış", "Kapanış", "Otomatik"],
    sql: `SELECT kod, kaynak_tip, kaynak_kod, konu, aciklama, kok_neden, capa, sorumlu,
                 termin, durum, date(acilis_tarihi), kapanis_tarihi,
                 CASE otomatik WHEN 1 THEN 'Evet' ELSE 'Hayır' END
            FROM sapmalar ORDER BY kod`,
  },
  imha: {
    ekran: "imha",
    baslik: ["Tutanak", "Tarih", "Tip", "Kaynak", "Miktar (kg)", "Gerekçe", "1. Tanık", "2. Tanık", "Bertaraf Firması", "Tutanak No"],
    sql: `SELECT kod, tarih, tip, kaynak_kod, miktar_kg, gerekce, tanik_1, tanik_2,
                 bertaraf_firma, tutanak_no
            FROM imha_kayitlari ORDER BY kod`,
  },
  buts: {
    ekran: "buts",
    baslik: ["Bildirim No", "Zaman", "Tip", "İlgili Kayıt", "Adet", "Durum"],
    sql: `SELECT kod, zaman, tip, ref, adet, durum FROM buts_kuyruk ORDER BY kod`,
  },
};

/**
 * CSV alanı kaçışlama.
 *
 * Ayırıcı, tırnak veya satır sonu içeren değer tırnaklanır; içerideki tırnak
 * ikilenir (RFC 4180). Kaçışlanmazsa bir çiftçi adındaki noktalı virgül
 * sütunları kaydırır ve tüm dosya bozulur.
 */
function alan(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const k = await getSession();
  if (!k) return NextResponse.json({ hata: "Oturum bulunamadı." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tip = searchParams.get("tip") ?? "";
  const tanim = TANIMLAR[tip];
  if (!tanim) {
    return NextResponse.json(
      { hata: `Bilinmeyen liste: ${tip}. Geçerli değerler: ${Object.keys(TANIMLAR).join(", ")}` },
      { status: 400 }
    );
  }

  // DIŞA AKTARMA DA EKRAN YETKİSİNE TABİ. Aksi halde ekranı göremeyen bir
  // kullanıcı aynı veriyi dosya olarak indirebilirdi.
  if (!ekranGorunur(k, tanim.ekran)) {
    return NextResponse.json({ hata: "Bu listeye erişim yetkiniz yok." }, { status: 403 });
  }

  await ensureEkTablolar();
  const db = await getDb();
  const satirlar = await db.prepare(tanim.sql).all();

  const govde = [
    tanim.baslik.join(";"),
    ...satirlar.map((s: any) => Object.values(s).map(alan).join(";")),
  ].join("\r\n");

  // BOM olmadan Excel dosyayı Windows-1254 sanıp Türkçe karakterleri bozuyor.
  const icerik = "﻿" + govde;
  const dosya = `insitu-${tip}-${trBugun()}.csv`;

    // TOPLU VERİ ÇIKIŞI İZLENİR: kim, hangi tabloyu, ne zaman indirdi.
  // Hasta ve çiftçi verisi içeren dosyalar sistemden çıkınca kontrol de
  // çıkar; geride en azından kaydı kalmalı (KVKK md. 12 erişim kaydı).
  await logla(k.id, "Dışa aktarım", tip, null);

return new NextResponse(icerik, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dosya}"`,
      "Cache-Control": "no-store",
    },
  });
}
