/**
 * ÖN DENETİM — Bakanlık/GMP denetimi öncesi kendi kendini tarama.
 *
 * Denetime girmeden önce sorulması gereken soru şu: "bir müfettiş bugün gelse
 * neye takılır?" Bu dosya o soruyu kayıtlar üzerinden yanıtlıyor.
 *
 * ÜÇ TASARIM KARARI:
 *
 * 1. HER BULGU BİR DAYANAĞA BAĞLI. "Şuna dikkat edin" demek yetmez; müfettiş
 *    "hangi maddeye göre" diye sorar. Her bulgu Ek-13, SOP veya KEK'teki
 *    karşılığını taşıyor. Dayanağı olmayan bir kontrol buraya eklenmemeli.
 *
 * 2. PUAN YOK. "%87 hazırsınız" gibi bir sayı, tek bir kritik bulgunun
 *    denetimi durdurabileceği gerçeğini gizler. Bunun yerine seviye başına
 *    sayım ve net bir hüküm var: kritik bulgu varsa hazır değilsiniz.
 *
 * 3. KAPSAM DÜRÜST. Bu tarama SİSTEMDEKİ KAYITLARI denetliyor; SOP'ların,
 *    validasyon dosyalarının, kalibrasyon sertifikalarının kendisini değil.
 *    Onlar sistemin dışında duruyor ve ekranda ayrıca hatırlatılıyor.
 *
 * Dosya saf: veritabanı bilmiyor, `test/birim/denetim.mjs` ile sınanıyor.
 */

import type { ZincirVeri } from "./zincir.ts";
import { PROSES_ADIMLARI } from "./proses.ts";
import { mutabakatFarki } from "./kabul.ts";
import { ZORUNLU_PARAMETRELER } from "./analiz.ts";
import { geriSayim, vadeDurumu, type GorevDurumu } from "./gorev.ts";

export type Seviye = "KRITIK" | "YUKSEK" | "ORTA" | "BILGI";

export interface Bulgu {
  /** Kontrol kodu — aynı kontrol her çalıştırmada aynı kodu taşır. */
  kod: string;
  seviye: Seviye;
  baslik: string;
  /** Ne bulundu. */
  detay: string;
  /** Hangi kayıtlar. Uzunsa ekranda kısaltılıyor. */
  kayitlar: string[];
  /** Mevzuat/doküman dayanağı — müfettişin soracağı "hangi maddeye göre". */
  dayanak: string;
  /** Ne yapılmalı. */
  oneri: string;
  /** İlgili ekran. */
  yol?: string;
}

export interface DenetimVerisi extends ZincirVeri {
  sapmalar: {
    kod: string; kaynak_tip: string; kaynak_kod: string | null; konu: string;
    kok_neden: string | null; capa: string | null; sorumlu?: string | null;
    termin: string | null; durum: string;
    /** Sapmanın açıldığı tarih — serbest bırakmadan önce mi sonra mı? */
    acilis_tarihi?: string | null;
  }[];
  /** Serilerin serbest bırakılma tarihi. `seriler` tablosundan. */
  seriSerbestTarih?: Record<string, string | null>;
  imhalar: {
    kod: string; tip: string; kaynak_kod: string; tanik_1: string; tanik_2: string;
    tutanak_no: string; bertaraf_firma: string | null; tarih: string;
  }[];
  mutabakatlar: {
    seri: string; basilan: number; kullanilan: number; bozuk: number;
    imha_edilen: number; fark: number; tarih?: string | null;
  }[];
  prosesler: { seri: string; adim_kod: string; uygun: number }[];
  numuneler: { kod: string; seri: string; saklama_sonu: string; durum: string }[];
  iadeler: { kod: string; tarih: string; karar: string }[];
  sikayetler: { kod: string; tarih: string; sonuc: string }[];
  kullanicilar: {
    id: number; ad_soyad?: string; rol: string; gorev_kodu?: string | null; aktif: number;
  }[];
  /** Fotoğraf eki olan kayıtların anahtarları: "SAPMA:SAP-2026-0001" gibi. */
  ekliKayitlar: string[];
  /** Ham madde analiz satırları — D-19 parametre eksikliği kontrolü. */
  analizSatirlari?: { lot: string; parametre: string; uygun: number }[];
  /** Periyodik görevler — D-20 (yapılmadı) ve D-21 (kayıt dönmedi). */
  gorevler?: {
    kod: string; vade: string; durum: GorevDurumu; arsiv_tarih: string | null;
    faaliyet: string; dokuman_kod: string;
  }[];
  /** Geri sayımlı kayıtlar — D-22 azami bekleme süresi aşımı. */
  sureliKayitlar?: {
    kod: string; tip: string; konu: string; baslangic: string;
    sure_gun: number; durum: string; dayanak: string | null;
  }[];
}

export interface DenetimSonucu {
  bulgular: Bulgu[];
  sayim: Record<Seviye, number>;
  /** Kritik bulgu yoksa denetime girilebilir. */
  hazir: boolean;
  hukum: string;
  /** Sistemin denetleyemediği, elle kontrol edilecek başlıklar. */
  kapsamDisi: string[];
}

const GUN = 86_400_000;

/** İki ISO tarih arasındaki gün farkı. */
function gunFarki(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / GUN);
}

/**
 * Tüm kontrolleri çalıştırır.
 *
 * `bugun` PARAMETRE — `new Date()` çağrılmıyor. Zaman bağımlı kontroller
 * (termin geçti mi, SKT doldu mu) ancak sabit bir "bugün" ile test edilebilir.
 */
export function onDenetim(v: DenetimVerisi, bugun: string): DenetimSonucu {
  const b: Bulgu[] = [];
  const ekli = new Set(v.ekliKayitlar);

  // ── Seri serbest bırakma bütünlüğü ────────────────────────────────────────

  const serbestSeriler = v.seriler.filter((s) => s.statu === "SERBEST");

  // 1 ve 1b. Piyasadaki seride AÇIK SAPMA — iki ayrı durum.
  //
  // AYRIM ÖNEMLİ: sapma serbest bırakmadan ÖNCE açıldıysa serbest bırakma
  // kararı hatalı verilmiş demektir (Ek-13 adım 15 ihlali). SONRA açıldıysa
  // (tipik olarak bir şikayetten) karar doğruydu, ama piyasadaki üründe
  // kapatılmamış bir sapma duruyor. İkisini aynı başlık altında toplamak,
  // ilkini hafifletir ya da ikincisini haksız yere suçlar.
  const oncedenAcik: string[] = [];
  const sonradanAcik: string[] = [];
  for (const s of serbestSeriler) {
    const acik = v.sapmalar.filter(
      (x) => x.durum === "ACIK" && x.kaynak_tip === "SERI" && x.kaynak_kod === s.seri
    );
    if (!acik.length) continue;
    const serbestTarih = v.seriSerbestTarih?.[s.seri] ?? null;
    // Tarih bilinmiyorsa AĞIR tarafa yazılıyor: bilinmeyen bir durumu
    // "muhtemelen sorun yok" saymak, denetimde savunulamaz.
    const once = acik.some((x) => !serbestTarih || !x.acilis_tarihi || x.acilis_tarihi <= serbestTarih);
    (once ? oncedenAcik : sonradanAcik).push(
      `${s.seri} (${acik.map((x) => x.kod).join(", ")})`
    );
  }

  if (oncedenAcik.length) {
    b.push({
      kod: "D-01",
      seviye: "KRITIK",
      baslik: "Sapma açıkken serbest bırakılmış seri",
      detay: `${oncedenAcik.length} seri, serbest bırakıldığı tarihte zaten açık olan bir sapmaya rağmen piyasaya verilmiş. Serbest bırakma kararı sorgulanır.`,
      kayitlar: oncedenAcik,
      dayanak: "Ek-13 adım 15 — serbest bırakma öncesi tüm sapmalar kapatılmış olmalı",
      oneri: "Sapmayı kök neden ve CAPA ile kapatın; ürün güvenliği etkilenmişse geri çekme başlatın.",
      yol: "/panel/sapma",
    });
  }

  if (sonradanAcik.length) {
    b.push({
      kod: "D-01B",
      seviye: "KRITIK",
      baslik: "Piyasadaki seride kapatılmamış sapma",
      detay: `${sonradanAcik.length} seri için serbest bırakmadan SONRA sapma açılmış (tipik olarak bir şikayet üzerine) ve hâlâ kapatılmamış. Serbest bırakma kararı doğruydu; sorun sapmanın açık kalması.`,
      kayitlar: sonradanAcik,
      dayanak: "SOP-KG-03 / SOP-KG-07 — piyasadaki ürüne ilişkin sapmalar öncelikli kapatılır",
      oneri: "Değerlendirmeyi tamamlayıp sapmayı kapatın; risk varsa geri çekme değerlendirin.",
      yol: "/panel/sapma",
    });
  }

  // 2. Şahit numunesi olmayan serbest seri
  const numunesiz = serbestSeriler.filter((s) => !v.numuneler.some((n) => n.seri === s.seri));
  if (numunesiz.length) {
    b.push({
      kod: "D-02",
      seviye: "KRITIK",
      baslik: "Şahit numunesi alınmamış seri serbest bırakılmış",
      detay: `${numunesiz.length} serinin şahit numunesi yok. Şikayet veya geri çekmede karşılaştırma yapılamaz.`,
      kayitlar: numunesiz.map((s) => s.seri),
      dayanak: "SOP-KK-10 — her serbest bırakılan seriden şahit numune saklanır",
      oneri: "Seri hâlâ stoktaysa numune alıp kaydedin; alınamıyorsa sapma açın.",
      yol: "/panel/uretim",
    });
  }

  // 3. Eksik proses kaydı
  const eksikProses: string[] = [];
  for (const s of serbestSeriler) {
    const gerekli = PROSES_ADIMLARI.filter((a) => !a.urunTipi || a.urunTipi === s.urun_tipi);
    const girilen = new Set(v.prosesler.filter((p) => p.seri === s.seri).map((p) => p.adim_kod));
    const eksik = gerekli.filter((a) => !girilen.has(a.kod));
    if (eksik.length) eksikProses.push(`${s.seri} (${eksik.map((a) => a.kod).join(", ")})`);
  }
  if (eksikProses.length) {
    b.push({
      kod: "D-03",
      seviye: "KRITIK",
      baslik: "Proses içi kontrol kaydı eksik seri serbest bırakılmış",
      detay: `${eksikProses.length} seride Ek-13'te zorunlu olan adımların kaydı yok.`,
      kayitlar: eksikProses,
      dayanak: "Ek-13 Üretim Akış Şeması — P03…P11 kritik kontrol noktaları",
      oneri: "Eksik adımların ham kayıtlarını bulup sisteme girin; bulunamıyorsa sapma açın.",
      yol: "/panel/uretim",
    });
  }

  // 4. Etiket mutabakatı — FARK ≠ 0
  const farkli = v.mutabakatlar.filter(
    (m) => mutabakatFarki({ basilan: m.basilan, kullanilan: m.kullanilan, bozuk: m.bozuk, imhaEdilen: m.imha_edilen }) !== 0
  );
  if (farkli.length) {
    b.push({
      kod: "D-04",
      seviye: "KRITIK",
      baslik: "Etiket mutabakatı tutmuyor",
      detay: `${farkli.length} seride basılan etiket sayısı, kullanılan + imha edilen toplamına eşit değil. Hesabı verilemeyen etiket, sahte ürün riskidir.`,
      kayitlar: farkli.map((m) => `${m.seri} (fark ${m.fark})`),
      dayanak: "FRM-ÜR-12 — etiket mutabakatı, fark sıfır olmalı",
      oneri: "Kayıp etiketleri arayın; bulunamıyorsa sapma açıp imha tutanağı düzenleyin.",
      yol: "/panel/ambalaj",
    });
  }

  // 4b. Gelecek tarihli mutabakat, kaydın olay anında tutulduğu iddiasını
  // bozar. API yeni girişleri reddeder; bu kontrol eski/aktarılmış veriyi de
  // görünür kılar. Tarih sessizce düzeltilmez, hatalı kayıt sapmayla ele alınır.
  const gelecekMutabakat = v.mutabakatlar.filter((m) => m.tarih && m.tarih > bugun);
  if (gelecekMutabakat.length) {
    b.push({
      kod: "D-04B",
      seviye: "KRITIK",
      baslik: "Gelecek tarihli etiket mutabakatı",
      detay: `${gelecekMutabakat.length} etiket mutabakatı bugünden sonraki bir tarihle kaydedilmiş. Kayıt kronolojisi ve eşzamanlılık ilkesi doğrulanamıyor.`,
      kayitlar: gelecekMutabakat.map((m) => `${m.seri} (${m.tarih})`),
      dayanak: "ALCOA+ — kayıtlar eşzamanlı, doğru ve kronolojik olmalıdır / FRM-ÜR-12",
      oneri: "Ham formu doğrulayın; hatalı sistem kaydını silmeden sapma açın ve doğrulanmış tarihi izlenebilir bir düzeltmeyle kaydedin.",
      yol: "/panel/ambalaj",
    });
  }

  // 5. Ambalajlanmış ama mutabakatı hiç yapılmamış seri
  const ambalajli = [...new Set(v.paketler.map((p) => p.seri))];
  const mutabakatsiz = ambalajli.filter((s) => !v.mutabakatlar.some((m) => m.seri === s));
  if (mutabakatsiz.length) {
    b.push({
      kod: "D-05",
      seviye: "KRITIK",
      baslik: "Ambalajlanmış seride etiket mutabakatı yapılmamış",
      detay: `${mutabakatsiz.length} seri ambalajlanmış ama etiket sayımı hiç kaydedilmemiş.`,
      kayitlar: mutabakatsiz,
      dayanak: "FRM-ÜR-12 / SOP-ÜR-13 — ambalajlama sonrası etiket mutabakatı zorunlu",
      oneri: "Basılan ve kullanılan etiket sayısını sayıp mutabakatı kaydedin.",
      yol: "/panel/ambalaj",
    });
  }

  // 6. Analiz rapor numarası olmayan serbest lot
  const raporsuz = v.hammadde.filter((h) => h.statu === "SERBEST" && !h.analiz_rapor_no);
  if (raporsuz.length) {
    b.push({
      kod: "D-06",
      seviye: "KRITIK",
      baslik: "Analiz raporu numarası olmadan serbest bırakılmış ham madde",
      detay: `${raporsuz.length} lot, analiz rapor numarası kaydedilmeden üretime açılmış.`,
      kayitlar: raporsuz.map((h) => h.lot),
      dayanak: "Ek-13 adım 2 / SOP-KK-02 — kabul kararı analiz raporuna dayanır",
      oneri: "Rapor numarasını kayda işleyin; rapor yoksa lotu karantinaya alın.",
      yol: "/panel/hammadde",
    });
  }

  // 7. İmha tutanağında iki tanık yok
  const taniksiz = v.imhalar.filter(
    (i) => !i.tanik_1?.trim() || !i.tanik_2?.trim() || i.tanik_1.trim() === i.tanik_2.trim()
  );
  if (taniksiz.length) {
    b.push({
      kod: "D-07",
      seviye: "KRITIK",
      baslik: "İmha tutanağında iki ayrı tanık yok",
      detay: `${taniksiz.length} tutanakta tanık eksik ya da aynı kişi iki kez yazılmış.`,
      kayitlar: taniksiz.map((i) => i.kod),
      dayanak: "SOP-ÜR-15 — imha iki tanık huzurunda yapılır",
      oneri: "Tutanağı iki ayrı tanıkla yeniden düzenleyin.",
      yol: "/panel/imha",
    });
  }

  // ── Zamanında kapanmayan işler ────────────────────────────────────────────

  // 8. Termini geçmiş açık sapma
  const gecikmis = v.sapmalar.filter((s) => s.durum === "ACIK" && s.termin && s.termin < bugun);
  if (gecikmis.length) {
    b.push({
      kod: "D-08",
      seviye: "YUKSEK",
      baslik: "Termini geçmiş açık sapma",
      detay: `${gecikmis.length} sapmanın kapatma tarihi geçmiş. Müfettişin ilk baktığı yerlerden biri.`,
      kayitlar: gecikmis.map((s) => `${s.kod} (termin ${s.termin}, ${gunFarki(bugun, s.termin!)} gün gecikme)`),
      dayanak: "SOP-KG-03 — sapmalar termininde kapatılır",
      oneri: "Kapatın ya da terminini gerekçeli olarak revize edin.",
      yol: "/panel/sapma",
    });
  }

  const plansizSapmalar = v.sapmalar.filter(
    (s) => s.durum === "ACIK" && (!s.sorumlu?.trim() || !s.termin)
  );
  if (plansizSapmalar.length) {
    b.push({
      kod: "D-08B",
      seviye: "YUKSEK",
      baslik: "Sorumlusu veya termini olmayan açık sapma",
      detay: `${plansizSapmalar.length} açık sapmanın kapatma sorumlusu ya da hedef tarihi tanımlı değil.`,
      kayitlar: plansizSapmalar.map((s) => s.kod),
      dayanak: "SOP-KG-03 — sapma araştırması sorumlu ve hedef tarih ile yönetilir",
      oneri: "Her açık sapmaya ad-soyad/işlev bazında sorumlu ve gerçekçi termin atayın.",
      yol: "/panel/sapma",
    });
  }

  // 9. BÜTS bildirimi yapılmamış sevkiyat
  const butssuz = v.sevkiyatlar.filter((s) => !s.buts_ref);
  if (butssuz.length) {
    b.push({
      kod: "D-09",
      seviye: "YUKSEK",
      baslik: "BÜTS bildirimi yapılmamış sevkiyat",
      detay: `${butssuz.length} sevkiyat Kuruma bildirilmemiş görünüyor.`,
      kayitlar: butssuz.map((s) => `${s.kod} (${s.tarih})`),
      dayanak: "SOP-ÜR-16 — sevkiyatlar BÜTS'e bildirilir",
      oneri: "Bildirimleri yapıp referans numaralarını sisteme işleyin.",
      yol: "/panel/buts",
    });
  }

  // 10. SKT'si geçmiş ama hâlâ dolaşımdaki ambalaj birimi
  const sktGecmis = v.paketler.filter(
    (p) => (p.statu === "SERBEST" || p.statu === "SEVK") && p.skt < bugun
  );
  if (sktGecmis.length) {
    b.push({
      kod: "D-10",
      seviye: "YUKSEK",
      baslik: "Son kullanma tarihi geçmiş birim hâlâ dolaşımda",
      detay: `${sktGecmis.length} birimin SKT'si geçmiş ama depoda veya eczanede görünüyor.`,
      kayitlar: sktGecmis.slice(0, 50).map((p) => `${p.tekil} (SKT ${p.skt})`),
      dayanak: "KEK — miadı geçmiş ürün piyasada bulunamaz",
      oneri: "Birimleri toplayıp imha tutanağıyla düşün.",
      yol: "/panel/imha",
    });
  }

  // 11. Uzun süredir karar bekleyen iade
  const bekleyenIade = v.iadeler.filter((i) => i.karar === "BEKLIYOR" && gunFarki(bugun, i.tarih) > 30);
  if (bekleyenIade.length) {
    b.push({
      kod: "D-11",
      seviye: "YUKSEK",
      baslik: "30 günden uzun süredir karar bekleyen iade",
      detay: `${bekleyenIade.length} iade hakkında hâlâ stoğa/imha kararı verilmemiş.`,
      kayitlar: bekleyenIade.map((i) => `${i.kod} (${gunFarki(bugun, i.tarih)} gün)`),
      dayanak: "SOP-KG-07 — iadeler değerlendirilip karara bağlanır",
      oneri: "KG-KK değerlendirmesini tamamlayıp kararı kaydedin.",
      yol: "/panel/iade",
    });
  }

  // 12. Uzun süredir açık şikayet
  const acikSikayet = v.sikayetler.filter((s) => s.sonuc === "ACIK" && gunFarki(bugun, s.tarih) > 30);
  if (acikSikayet.length) {
    b.push({
      kod: "D-12",
      seviye: "YUKSEK",
      baslik: "30 günden uzun süredir açık şikayet",
      detay: `${acikSikayet.length} şikayet değerlendirilmemiş.`,
      kayitlar: acikSikayet.map((s) => `${s.kod} (${gunFarki(bugun, s.tarih)} gün)`),
      dayanak: "SOP-KG-07 — şikayetler değerlendirilip sonuçlandırılır",
      oneri: "Değerlendirmeyi yazıp şikayeti kapatın.",
      yol: "/panel/iade",
    });
  }

  // ── Bakım gerektirenler ───────────────────────────────────────────────────

  // 13. Uzun süredir karantinada bekleyen lot
  const karantinada = v.hammadde.filter(
    (h) => h.statu === "KARANTINA" && gunFarki(bugun, h.teslim_tarihi) > 30
  );
  if (karantinada.length) {
    b.push({
      kod: "D-13",
      seviye: "ORTA",
      baslik: "30 günden uzun süredir karantinada bekleyen ham madde",
      detay: `${karantinada.length} lot hakkında hâlâ kabul/ret kararı verilmemiş.`,
      kayitlar: karantinada.map((h) => `${h.lot} (${gunFarki(bugun, h.teslim_tarihi)} gün)`),
      dayanak: "Ek-13 adım 2 — karantina süresi analiz sonucuna kadardır",
      oneri: "Analiz sonucunu girip kararı verin.",
      yol: "/panel/hammadde",
    });
  }

  // 14. Saklama süresi dolmuş şahit numune
  const suresiDolmus = v.numuneler.filter((n) => n.durum === "SAKLANIYOR" && n.saklama_sonu < bugun);
  if (suresiDolmus.length) {
    b.push({
      kod: "D-14",
      seviye: "ORTA",
      baslik: "Saklama süresi dolmuş şahit numune",
      detay: `${suresiDolmus.length} numunenin saklama süresi bitmiş, hâlâ saklanıyor görünüyor.`,
      kayitlar: suresiDolmus.map((n) => `${n.kod} (${n.seri}, süre sonu ${n.saklama_sonu})`),
      dayanak: "SOP-KK-10 — süre sonunda numune imha edilir ve kayda geçilir",
      oneri: "Numuneleri imha edip tutanağını kaydedin.",
      yol: "/panel/imha",
    });
  }

  // 15. İzin numarası eksik çiftçi
  const izinsiz = v.ciftciler.filter((c) => !c.izin_no?.trim());
  if (izinsiz.length) {
    b.push({
      kod: "D-15",
      seviye: "ORTA",
      baslik: "Kenevir ekim izin numarası eksik çiftçi",
      detay: `${izinsiz.length} tedarikçinin izin numarası kayıtlı değil.`,
      kayitlar: izinsiz.map((c) => `${c.kod} ${c.ad}`),
      dayanak: "SOP-KG-08 — tedarikçi değerlendirmesi, yasal izin şartı",
      oneri: "İl Tarım Müdürlüğü izin numarasını kayda işleyin.",
      yol: "/panel/ciftci",
    });
  }

  // 16. Tek aktif Mesul Müdür
  const mesulSayisi = v.kullanicilar.filter((k) => k.rol === "mesul_mudur" && k.aktif === 1).length;
  if (mesulSayisi <= 1) {
    b.push({
      kod: "D-16",
      seviye: "ORTA",
      baslik: "Tek aktif Mesul Müdür hesabı",
      detay:
        mesulSayisi === 0
          ? "Sistemde aktif Mesul Müdür yok."
          : "Tek Mesul Müdür var. Hesabına erişilemezse seri serbest bırakma ve geri çekme durur.",
      kayitlar: [],
      dayanak: "KEK — Mesul Müdür ve vekilinin tanımlı olması",
      oneri: "Vekil Mesul Müdür için ikinci bir hesap tanımlayın.",
      yol: "/panel/kullanicilar",
    });
  }

  const gorevKoduGerekli = new Set(["mesul_mudur", "kg_kk", "uretim", "teknik", "depo"]);
  const gorevKodsuz = v.kullanicilar.filter(
    (k) => k.aktif === 1 && gorevKoduGerekli.has(k.rol) && !k.gorev_kodu?.trim()
  );
  if (gorevKodsuz.length) {
    b.push({
      kod: "D-16B",
      seviye: "ORTA",
      baslik: "Görev tanımı kodu olmayan aktif kullanıcı",
      detay: `${gorevKodsuz.length} aktif operasyon/kalite hesabı onaylı görev tanımına bağlanmamış. Yetki ile yazılı sorumluluk eşleştirilemiyor.`,
      kayitlar: gorevKodsuz.map((k) => k.ad_soyad || `Kullanıcı #${k.id}`),
      dayanak: "KEK / GT-01…GT-06 — görev, yetki ve sorumlulukların tanımlı olması",
      oneri: "Kullanıcıyı yürürlükteki görev tanımı koduyla eşleştirin; kod yoksa önce kontrollü görev tanımını yayımlayın.",
      yol: "/panel/kullanicilar",
    });
  }

  // 17. Kritik kayıtlarda fotoğraf/kanıt eki yok
  const eksizImha = v.imhalar.filter((i) => !ekli.has(`IMHA:${i.kod}`));
  if (eksizImha.length) {
    b.push({
      kod: "D-17",
      seviye: "BILGI",
      baslik: "İmha tutanaklarında görsel kanıt yok",
      detay: `${eksizImha.length} tutanakta fotoğraf eki bulunmuyor. Zorunlu değil ama denetimde tutanağı güçlendirir.`,
      kayitlar: eksizImha.map((i) => i.kod),
      dayanak: "Zorunlu değil — iyi uygulama",
      oneri: "İmha edilen malzemenin fotoğrafını tutanağa iliştirin.",
      yol: "/panel/imha",
    });
  }

  // 18. Sevkiyat kaydı ile bağlı birim sayısı uyuşmuyor
  //
  // `adet` sevk anında yazılır ve değişmez; her birim iade edilse bile
  // `sevk_kod` bağı korunur. Dolayısıyla fark, ancak kayıtlara veritabanı
  // seviyesinde dokunulduysa ya da (bu kontrolün eklenmesinden önceki gibi)
  // iade işlemi bağı sildiyse oluşur. İki durumda da hesabı verilemeyen
  // birim demektir — sahte ürün riskiyle aynı sınıf.
  const adetUyusmayan = v.sevkiyatlar
    .filter((s) => s.adet != null)
    .map((s) => ({ s, bagli: v.paketler.filter((p) => p.sevk_kod === s.kod).length }))
    .filter((x) => x.bagli !== Number(x.s.adet));
  if (adetUyusmayan.length) {
    b.push({
      kod: "D-18",
      seviye: "KRITIK",
      baslik: "Sevkiyat kaydı ile bağlı birim sayısı uyuşmuyor",
      detay:
        `${adetUyusmayan.length} sevkiyatta, sevk anında yazılan adet ile o sevkiyata bağlı ` +
        `birim sayısı farklı. Aradaki birimlerin hesabı verilemiyor.`,
      kayitlar: adetUyusmayan.map(
        (x) => `${x.s.kod} (kayıt ${x.s.adet}, bağlı ${x.bagli})`
      ),
      dayanak: "SOP-ÜR-14 / SOP-ÜR-16 — sevkiyat kaydı BÜTS bildirimiyle birebir olmalı",
      oneri:
        "Eksik birimleri bulun: iade alındıysa iade kaydıyla, imha edildiyse tutanakla " +
        "eşleştirin; eşleşmeyen birim için sapma açın.",
      yol: "/panel/sevkiyat",
    });
  }

  // 19. Serbest lotta zorunlu analiz parametresi eksik
  //
  // D-06'nın konusu rapor NUMARASI; buradaki soru raporun İÇERİĞİ: kabul
  // kararı SOP-KK-04'ün 11 parametrelik analizine dayanmak zorunda ve
  // zorunlu 9 parametreden birinin sonucu sistemde yoksa kararın dayanağı
  // eksik demektir. Opsiyoneller (terpen, çözücü — "uygulanması hâlinde")
  // bulgu üretmez. Parametrik modelden ÖNCE serbest bırakılmış lotlar da
  // bilinçli olarak yakalanır: kâğıt rapor vardır ama sistemde satırı yoktur;
  // öneri metni o durumu da tarif ediyor.
  const analizli = new Map<string, Set<string>>();
  for (const s of v.analizSatirlari ?? []) {
    if (!analizli.has(s.lot)) analizli.set(s.lot, new Set());
    analizli.get(s.lot)!.add(s.parametre);
  }
  const parametresizLotlar = v.hammadde
    .filter((h) => h.statu === "SERBEST")
    .map((h) => {
      const var_ = analizli.get(h.lot) ?? new Set<string>();
      const eksik = ZORUNLU_PARAMETRELER.filter((p) => !var_.has(p));
      return { lot: h.lot, eksik };
    })
    .filter((x) => x.eksik.length > 0);
  if (parametresizLotlar.length) {
    b.push({
      kod: "D-19",
      seviye: "KRITIK",
      baslik: "Serbest lotta zorunlu analiz parametresi eksik",
      detay:
        `${parametresizLotlar.length} serbest ham madde lotunda, kabul kararının dayanması gereken ` +
        `zorunlu analiz parametrelerinden en az birinin sonucu sistemde kayıtlı değil.`,
      kayitlar: parametresizLotlar.map((x) =>
        x.eksik.length === ZORUNLU_PARAMETRELER.length
          ? `${x.lot} (hiç parametre satırı yok)`
          : `${x.lot} (${x.eksik.length} parametre eksik)`
      ),
      dayanak: "SOP-KK-04/05, FRM-KK-09 — kabul kararı 11 parametrelik analiz sonucuna dayanır",
      oneri:
        "Laboratuvar sertifikasındaki sonuçları parametre parametre sisteme girin. Parametrik " +
        "modelden önce serbest bırakılan lotlar için sertifikayı fotoğraf eki olarak yükleyin ve " +
        "eksikliği sapma kaydıyla belgeleyin — serbest kararı geriye dönük değiştirilmez.",
      yol: "/panel/hammadde",
    });
  }

  // 20. Periyodik görev vadesinde YAPILMAMIŞ
  //
  // Sistem sahada yazılan değeri tutmuyor; ama işin AÇILDIĞINI ve kâğıdın
  // arşive dönmediğini biliyor. Denetimde en sık bulgu tam olarak budur:
  // "kayıt var ama tarihinde değil" ya da hiç yok.
  //
  // SEVİYE GECİKME SÜRESİNE BAĞLI: bir günlük kontrolde bir gün gecikme
  // düzeltilebilir bir aksaklık; bir ayı aşan gecikme, o dönemin kaydının
  // hiç oluşmadığı anlamına gelir ve geriye dönük doldurulamaz (GMP'de kayıt
  // sonradan üretilmez, sapma açılır).
  const yapilmayan = (v.gorevler ?? []).filter(
    (g) => vadeDurumu(g.vade, g.durum, bugun) === "GECIKMIS" && g.durum === "ACIK"
  );
  if (yapilmayan.length) {
    const enEski = Math.max(...yapilmayan.map((g) => gunFarki(bugun, g.vade)));
    b.push({
      kod: "D-20",
      seviye: enEski > 30 ? "KRITIK" : "YUKSEK",
      baslik: "Periyodik görev vadesinde yapılmamış",
      detay:
        `${yapilmayan.length} periyodik görevin vadesi geçmiş ve formu hiç basılmamış. ` +
        `En eskisi ${enEski} gün gecikmiş.` +
        (enEski > 30
          ? " Bir ayı aşan gecikmede o dönemin kaydı artık geriye dönük oluşturulamaz."
          : ""),
      kayitlar: yapilmayan
        .slice()
        .sort((a, c) => a.vade.localeCompare(c.vade))
        .map((g) => `${g.kod} · ${g.faaliyet} (${gunFarki(bugun, g.vade)} gün)`),
      dayanak: "İlgili SOP'un periyodik kontrol maddesi — görev kural tablosunda dokümana bağlı",
      oneri:
        "Vadesi geçmemiş görevleri hemen tamamlayın. Geçmiş dönemin kaydı üretilemiyorsa " +
        "sapma açıp (SOP-KG-04) gerekçesini ve etkisini değerlendirin.",
      yol: "/panel/gorev",
    });
  }

  // 21. Form basıldı ama imzalı kayıt arşive dönmedi
  //
  // D-20'den FARKLI BİR OLAY: orada iş yapılmamış, burada yapılmış olabilir
  // ama kaydı ortada yok. Seri numarası verilmiş boş bir GMP formu dolaşımda
  // demektir — üzerine sonradan herhangi bir şey yazılabilecek kontrolsüz bir
  // belge. Denetimde "bu form nerede" sorusunun cevabı olmalı.
  const donmeyen = (v.gorevler ?? []).filter(
    (g) => (g.durum === "BASILDI" || g.durum === "TESLIM") && gunFarki(bugun, g.vade) > 0
  );
  if (donmeyen.length) {
    b.push({
      kod: "D-21",
      seviye: "YUKSEK",
      baslik: "Basılmış form imzalı olarak arşive dönmemiş",
      detay:
        `${donmeyen.length} görevde form basılmış (seri numarası verilmiş) ama imzalı kâğıt ` +
        `arşive girmemiş. Vadesi geçen bu formların akıbeti belirsiz.`,
      kayitlar: donmeyen.map((g) => `${g.kod} · ${g.faaliyet} (${gunFarki(bugun, g.vade)} gün)`),
      dayanak: "SOP-KG-01 — doküman/form dağıtım ve geri toplama kontrolü (FRM-KG-02)",
      oneri:
        "İmzalı nüshaları toplayıp arşivleyin. Kaybolan nüsha için baskı kütüğündeki seri " +
        "numarasını iptal edin ve gerekçesini kaydedin.",
      yol: "/panel/gorev",
    });
  }

  // 22. Azami bekleme süresi DOLMUŞ
  //
  // SOP-DE-06 md. 5.4: kannabinoid içeren imha bekleyen atık 15 gün, ret
  // malzeme 30 gün, posa 7 gün. Bu süreler işletme tercihi değil prosedür
  // hükmü ve aşımı doğrudan kontrollü madde riski: kayıt altına alınmadan
  // bekleyen kannabinoid, TİTCK ve İl Tarım açısından KAYIP sayılır.
  const dolan = (v.sureliKayitlar ?? [])
    .filter((s) => s.durum === "ACIK")
    .map((s) => ({ s, gs: geriSayim(s.baslangic, s.sure_gun, bugun) }))
    .filter((x) => x.gs.durum === "DOLDU");
  if (dolan.length) {
    const atikVar = dolan.some((x) => x.s.tip === "ATIK");
    b.push({
      kod: "D-22",
      // Atık/kontrollü madde süresi aşımı kritik; sözleşme-lisans gecikmesi
      // ciddi ama ürün güvenliğini doğrudan etkilemiyor.
      seviye: atikVar ? "KRITIK" : "YUKSEK",
      baslik: "Azami bekleme süresi dolmuş kayıt var",
      detay:
        `${dolan.length} kaydın prosedürle belirlenmiş süresi dolmuş. ` +
        (atikVar
          ? "Aralarında kannabinoid içeren atık var — kayıt dışı bekleyen kontrollü madde kaçak şüphesi doğurur."
          : ""),
      kayitlar: dolan.map(
        (x) => `${x.s.kod} · ${x.s.konu} (${Math.abs(x.gs.kalanGun)} gün aşım)`
      ),
      dayanak: "SOP-DE-06 md. 5.4 — azami bekleme süreleri",
      oneri:
        "Süresi dolan malzemenin bertarafını/işlemini tamamlayıp kaydı kapatın; " +
        "aşımın sebebi için sapma açın.",
      yol: "/panel/gorev",
    });
  }

  // ── Özet ──────────────────────────────────────────────────────────────────

  const sayim: Record<Seviye, number> = { KRITIK: 0, YUKSEK: 0, ORTA: 0, BILGI: 0 };
  for (const x of b) sayim[x.seviye]++;

  const hazir = sayim.KRITIK === 0;
  const hukum = hazir
    ? sayim.YUKSEK > 0
      ? `Kritik bulgu yok. ${sayim.YUKSEK} yüksek öncelikli konu denetimden önce kapatılmalı.`
      : "Kritik ve yüksek öncelikli bulgu yok. Kayıtlar denetime hazır görünüyor."
    : `${sayim.KRITIK} KRİTİK bulgu var. Bunlar kapatılmadan denetime girilmemeli.`;

  return {
    bulgular: b,
    sayim,
    hazir,
    hukum,
    // SİSTEMİN GÖREMEDİKLERİ. Bunları listelememek, taramanın kapsamını
    // olduğundan geniş göstermek olurdu — denetimde en pahalı yanılgı.
    kapsamDisi: [
      "SOP'ların güncelliği ve dağıtım kayıtları (KEK md. 4)",
      "Ekipman kalibrasyon ve validasyon dosyaları",
      "Personel eğitim kayıtları ve görev tanımı imzaları (GT-01…GT-06)",
      "Temizlik validasyonu ve çapraz bulaşma çalışmaları",
      "Stabilite çalışması sonuçları",
      "Tedarikçi denetim raporları (SOP-KG-08)",
      "Ortam izleme (sıcaklık/nem) kayıtları",
      "Ürün sınıflandırması ve bildirim sisteminin (İTS/ÜTS/Bitkisel ÜTS) TİTCK'den yazılı teyidi",
      "Bilgisayarlı sistem validasyonu — URS, risk değerlendirmesi, IQ/OQ/PQ, eğitim kayıtları (GAMP 5 / EU GMP Ek 11). Kodun doğru çalışması tek başına validasyon değildir",
    ],
  };
}
