/**
 * PROSES İÇİ KONTROLLER — Ek-13 üretim akış şeması, FRM-ÜR-02 … FRM-ÜR-11.
 *
 * Adım tanımları ve kabul kriterleri BURADA, tek yerde. Bunlar kullanıcı verisi
 * değil, tesisin prosesinin tanımı — bir spesifikasyon. Veritabanına konsaydı
 * elle değiştirilebilir olurdu; kabul kriterinin çalışma anında
 * değiştirilebilmesi, kriterin kendisini anlamsız kılar.
 *
 * Ölçüm DEĞERLERİ veritabanında (`proses_kayitlari`), kriterler burada.
 *
 * BU DOSYA VERİTABANI BİLMEZ — `test/birim/proses.mjs` doğrudan çalıştırıyor.
 */

import type { UrunTipi } from "./types";
import { bicimSayi } from "./kabul.ts";

export type OlcumTipi = "sayi" | "metin" | "evet_hayir";

export interface OlcumTanimi {
  anahtar: string;
  etiket: string;
  tip: OlcumTipi;
  birim?: string;
  /** Kabul aralığı. Yalnızca `tip: "sayi"` için. */
  min?: number;
  max?: number;
  /** `evet_hayir` için beklenen cevap. Varsayılan: evet. */
  beklenen?: boolean;
  /** Zorunlu mu? Varsayılan: evet. */
  opsiyonel?: boolean;
  ipucu?: string;
}

export interface ProsesAdimi {
  kod: string;
  /** Ek-13 akış şemasındaki sıra numarası. */
  sira: number;
  ad: string;
  sop: string;
  form: string;
  /** Yalnızca belirli ürün tipinde uygulanır. Boşsa hepsinde. */
  urunTipi?: UrunTipi;
  olcumler: OlcumTanimi[];
}

/**
 * Adım tanımları — Ek-13'ten birebir.
 *
 * Sıra numaraları akış şemasıyla aynı tutuldu ki denetimde şemayla ekran
 * yan yana konabilsin. Ham madde kabulü (1), analiz (2), ambalajlama (12) ve
 * serbest bırakma (15) ayrı ekranlarda olduğu için burada yok.
 */
export const PROSES_ADIMLARI: ProsesAdimi[] = [
  {
    kod: "P03",
    sira: 3,
    ad: "Öğütme",
    sop: "SOP-ÜR-18 md. 5.4",
    form: "FRM-ÜR-22",
    olcumler: [
      { anahtar: "partikul_min", etiket: "Partikül boyutu (alt)", tip: "sayi", birim: "mm", min: 0.5, max: 1 },
      { anahtar: "partikul_max", etiket: "Partikül boyutu (üst)", tip: "sayi", birim: "mm", min: 0.5, max: 1 },
      { anahtar: "nem", etiket: "Nem", tip: "sayi", birim: "%", min: 0, max: 10 },
      { anahtar: "ekipman_temiz", etiket: "Ekipman temizliği doğrulandı", tip: "evet_hayir" },
    ],
  },
  {
    kod: "P04",
    sira: 4,
    ad: "Tartım (çift kontrol)",
    sop: "SOP-ÜR-02",
    form: "FRM-ÜR-02",
    olcumler: [
      { anahtar: "terazi_kalibre", etiket: "Terazi kalibrasyonu geçerli", tip: "evet_hayir" },
      { anahtar: "tartilan_kg", etiket: "Tartılan miktar", tip: "sayi", birim: "kg", min: 0.001, max: 1000 },
      { anahtar: "kontrol_1", etiket: "1. kontrol (paraf)", tip: "metin" },
      { anahtar: "kontrol_2", etiket: "2. kontrol (paraf)", tip: "metin",
        ipucu: "Birinci kontrolden farklı kişi olmalı" },
      { anahtar: "kap_etiketlendi", etiket: "Kaplar etiketlendi", tip: "evet_hayir" },
    ],
  },
  {
    kod: "P05",
    sira: 5,
    ad: "Süperkritik CO₂ ekstraksiyon",
    sop: "SOP-ÜR-03",
    form: "FRM-ÜR-03",
    olcumler: [
      { anahtar: "basinc", etiket: "Basınç", tip: "sayi", birim: "bar", min: 300, max: 350,
        ipucu: "Hedef 325 bar" },
      { anahtar: "sicaklik", etiket: "Sıcaklık", tip: "sayi", birim: "°C", min: 45, max: 55,
        ipucu: "Hedef 50 °C" },
      { anahtar: "sure", etiket: "Süre", tip: "sayi", birim: "saat", min: 4.5, max: 6 },
      { anahtar: "verim", etiket: "Ekstraksiyon verimi", tip: "sayi", birim: "%", min: 12, max: 100,
        ipucu: "Ek-13 KKN: ≥ %12" },
      { anahtar: "kayit_araligi", etiket: "30 dakikada bir kayıt alındı", tip: "evet_hayir" },
    ],
  },
  {
    kod: "P06",
    sira: 6,
    ad: "Vinterizasyon",
    sop: "SOP-ÜR-04",
    form: "FRM-ÜR-04",
    olcumler: [
      { anahtar: "sicaklik", etiket: "Soğutma sıcaklığı", tip: "sayi", birim: "°C", min: -22, max: -18,
        ipucu: "−20 ± 2 °C" },
      { anahtar: "sure", etiket: "Bekleme süresi", tip: "sayi", birim: "saat", min: 12, max: 72 },
      { anahtar: "filtrasyon_sicaklik", etiket: "Filtrasyon sıcaklığı", tip: "sayi", birim: "°C", min: -40, max: -10 },
      { anahtar: "filtre_kademe", etiket: "Filtre kademeleri (10 → 1 → 0,45 µm)", tip: "evet_hayir" },
    ],
  },
  {
    kod: "P07",
    sira: 7,
    ad: "Etanol geri kazanımı",
    sop: "SOP-ÜR-05",
    form: "FRM-ÜR-05",
    olcumler: [
      { anahtar: "sicaklik", etiket: "Sıcaklık", tip: "sayi", birim: "°C", min: 55, max: 65 },
      { anahtar: "basinc", etiket: "Vakum", tip: "sayi", birim: "mbar", min: 60, max: 100 },
      { anahtar: "geri_kazanim", etiket: "Geri kazanım oranı", tip: "sayi", birim: "%", min: 90, max: 100 },
      { anahtar: "kalinti_etanol", etiket: "Kalıntı etanol", tip: "sayi", birim: "ppm", min: 0, max: 5000 },
    ],
  },
  {
    kod: "P08",
    sira: 8,
    ad: "Dekarboksilasyon",
    sop: "SOP-ÜR-06",
    form: "FRM-ÜR-06",
    olcumler: [
      { anahtar: "sicaklik", etiket: "Sıcaklık", tip: "sayi", birim: "°C", min: 110, max: 120 },
      { anahtar: "sure", etiket: "Süre", tip: "sayi", birim: "dakika", min: 45, max: 90 },
      { anahtar: "donusum", etiket: "CBDa → CBD dönüşümü", tip: "sayi", birim: "%", min: 95, max: 100 },
      { anahtar: "agirlik_kaybi", etiket: "Ağırlık kaybı", tip: "sayi", birim: "%", min: 8, max: 12,
        ipucu: "CO₂ çıkışı" },
    ],
  },
  {
    kod: "P09",
    sira: 9,
    ad: "Kısa yol distilasyon",
    sop: "SOP-ÜR-07",
    form: "FRM-ÜR-07",
    olcumler: [
      { anahtar: "vakum", etiket: "Vakum", tip: "sayi", birim: "mbar", min: 0.001, max: 0.01 },
      { anahtar: "sicaklik", etiket: "Sıcaklık", tip: "sayi", birim: "°C", min: 160, max: 180 },
      { anahtar: "cbd", etiket: "Ana fraksiyon CBD", tip: "sayi", birim: "%", min: 80, max: 100 },
      { anahtar: "thc", etiket: "Δ9-THC", tip: "sayi", birim: "%", min: 0, max: 0.3 },
    ],
  },
  {
    kod: "P10",
    sira: 10,
    ad: "CBD kristalizasyonu",
    sop: "SOP-ÜR-08",
    form: "FRM-ÜR-08",
    urunTipi: "IZOLAT",
    olcumler: [
      { anahtar: "safluk", etiket: "İzolat saflığı", tip: "sayi", birim: "%", min: 99, max: 100 },
      { anahtar: "heptan", etiket: "Kalıntı heptan", tip: "sayi", birim: "ppm", min: 0, max: 5000 },
    ],
  },
  {
    kod: "P11",
    sira: 11,
    ad: "Hat temizliği (line clearance)",
    sop: "SOP-ÜR-11",
    form: "FRM-ÜR-11",
    olcumler: [
      { anahtar: "hat_bos", etiket: "Hatta başka ürün/etiket kalmadı", tip: "evet_hayir" },
      { anahtar: "ekipman_etiket", etiket: "Ekipman durum etiketi TEMİZ", tip: "evet_hayir" },
      { anahtar: "imza_uretim", etiket: "Üretim sorumlusu imzası", tip: "metin" },
      { anahtar: "imza_kgkk", etiket: "KG-KK imzası", tip: "metin",
        ipucu: "Ek-13 KKN §12: çift imza zorunlu" },
    ],
  },
];

/** Ürün tipine uygulanan adımlar. */
export function adimlar(urunTipi: UrunTipi): ProsesAdimi[] {
  return PROSES_ADIMLARI.filter((a) => !a.urunTipi || a.urunTipi === urunTipi);
}

export function adimBul(kod: string): ProsesAdimi | undefined {
  return PROSES_ADIMLARI.find((a) => a.kod === kod);
}

// ── Değerlendirme ────────────────────────────────────────────────────────────

export interface ProsesKarari {
  /** Kabul kriterlerinin tamamı sağlandı mı? */
  uygun: boolean;
  /** Spesifikasyon dışı ölçümler, insan okunur biçimde. */
  engeller: string[];
}

/**
 * Bir proses adımının ölçümlerini kabul kriterlerine göre değerlendirir.
 *
 * SPESİFİKASYON DIŞI ÖLÇÜM KAYDI ENGELLEMEZ — kayıt yine tutulur, `uygun = 0`
 * olarak işaretlenir ve sapma açılır. Sebebi: proses gerçekten 290 bar
 * çalıştıysa kayıt 290 bar demeli. Girişi reddetmek operatörü gerçek değeri
 * gizlemeye ya da hiç kaydetmemeye iter — GMP'de en tehlikeli sonuç budur.
 * Engelleme serbest bırakma aşamasında, açık sapma üzerinden oluyor.
 */
export function prosesKarari(adim: ProsesAdimi, olcumler: Record<string, unknown>): ProsesKarari {
  const engeller: string[] = [];

  for (const o of adim.olcumler) {
    const ham = olcumler[o.anahtar];
    const bos = ham === undefined || ham === null || ham === "";

    if (bos) {
      if (!o.opsiyonel) engeller.push(`${o.etiket} girilmedi`);
      continue;
    }

    if (o.tip === "sayi") {
      const n = typeof ham === "number" ? ham : Number(String(ham).replace(",", "."));
      if (!Number.isFinite(n)) {
        engeller.push(`${o.etiket} sayı olmalı`);
        continue;
      }
      const birim = o.birim ? ` ${o.birim}` : "";
      if (o.min !== undefined && n < o.min) {
        engeller.push(
          `${o.etiket}: ${bicimSayi(n, ondalik(o))}${birim} — asgari ${bicimSayi(o.min, ondalik(o))}${birim} altında`
        );
      } else if (o.max !== undefined && n > o.max) {
        engeller.push(
          `${o.etiket}: ${bicimSayi(n, ondalik(o))}${birim} — azami ${bicimSayi(o.max, ondalik(o))}${birim} aşıldı`
        );
      }
    } else if (o.tip === "evet_hayir") {
      const beklenen = o.beklenen ?? true;
      const deger = ham === true || ham === "E" || ham === "true" || ham === 1 || ham === "1";
      if (deger !== beklenen) engeller.push(`${o.etiket}: ${beklenen ? "hayır" : "evet"} işaretlendi`);
    }
  }

  /**
   * ÇİFT KONTROL/İMZA AYNI KİŞİ OLAMAZ.
   *
   * Ek-13 tartımda "iki bağımsız paraf", hat temizliğinde "çift imza —
   * Üretim + KG-KK" diyor. Aynı ismin iki kez yazılması bu şartı karşılamaz
   * ve tam olarak kontrolün atlatılma biçimidir.
   */
  for (const [a, b, ad] of [
    ["kontrol_1", "kontrol_2", "Tartım çift kontrolü"],
    ["imza_uretim", "imza_kgkk", "Hat temizliği çift imzası"],
  ] as const) {
    const x = normalizeAd(olcumler[a]);
    const y = normalizeAd(olcumler[b]);
    if (x && y && x === y) engeller.push(`${ad}: iki farklı kişi tarafından yapılmalı`);
  }

  return { uygun: engeller.length === 0, engeller };
}

function ondalik(o: OlcumTanimi): number {
  // Çok küçük aralıklarda (vakum 0,001–0,01) daha fazla basamak gerekiyor.
  const kucuk = (o.max !== undefined && Math.abs(o.max) < 1) || (o.min !== undefined && Math.abs(o.min) < 1);
  return kucuk ? 3 : 1;
}

function normalizeAd(v: unknown): string {
  return String(v ?? "").trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
}
