# Faz 0 — Kapsam ve Validasyon Hazırlığı (TASLAK)

**Sistem:** İzlenebilirlik Paneli — tarladan hastaya kapalı zincir ürün takip sistemi
**Firma:** İnsitu Yeşil Teknolojiler A.Ş., Gölhisar/Burdur
**Doküman durumu:** TASLAK — sistemin gerçek davranışından türetilmiştir; Kalite Güvence
tarafından gözden geçirilmeden, numaralandırılıp imzalanmadan geçerli değildir.
**Çerçeve:** GAMP 5 (2. baskı), EU GMP Ek 11, ALCOA+; uygulanabilir olduğu ölçüde
21 CFR Part 11. Bu doküman bir uygunluk beyanı DEĞİLDİR — uygunluk, bu dokümandaki
işlerin tamamlanması ve işletim kontrolleriyle birlikte kurulur.

> Kodun doğru çalışması tek başına sistem validasyonu değildir. Aşağıdaki URS
> maddelerinin her biri uygulanmış ve otomatik test altındadır; ancak IQ/OQ/PQ,
> eğitim ve işletim prosedürleri firma tarafından yürütülmelidir (Bölüm 8).

---

## 1. Amaçlanan Kullanım (Intended Use)

Sistem; endüstriyel kenevirden CBD distilat/izolat üreten tesiste, ham maddenin
tarladan kabulünden ürünün eczane yoluyla hastaya teslimine kadar olan zincirin
**kayıt altına alınması, kritik kabul kararlarının kurallara bağlanması ve tekil
ambalaj birimi düzeyinde ileri/geri izlenebilirlik** için kullanılır.

Sistem ŞUNLAR İÇİN KULLANILMAZ: laboratuvar cihazlarından otomatik veri toplama,
Kurum sistemlerine otomatik bildirim (Bölüm 6), elektronik parti kaydının ıslak
imzalı ana kopyasının yerine geçme (firma SOP'si aksini tanımlayana kadar).

**GAMP kategorisi:** Kategori 5 (ısmarlama yazılım) — tam yaşam döngüsü dokümantasyonu gerekir.

## 2. Sistem Sınırı ve Veri Akışı

```
[Çiftçi/Tarla]                                                  [TİTCK Kurum Sistemi]
     │ teslimat (fiziksel + irsaliye)                                   ▲
     ▼                                                                  │ ELLE bildirim
┌────────────────────────── SİSTEM SINIRI ──────────────────────────┐  │ (kurum_ref kaydı)
│  ciftciler → hammadde ─(analiz kararı)→ seriler ─(serbest)→       │  │
│  paketler(karekod) → sevkiyatlar → satislar(maskeli TC)           │──┘
│  yan kayıtlar: sapmalar · imha · mutabakat · numuneler ·          │
│  iadeler · sikayetler · ekler(foto) · imzalar(e-imza) ·           │
│  loglar(hash zincirli denetim izi)                                │
└──────────────┬─────────────────────────────────────┬─────────────┘
               │ HTTPS                                │ libsql (TLS)
        [Vercel — uygulama]                    [Turso — veritabanı]
               ▲
        [Kullanıcı tarayıcısı / telefon PWA — kamera ile karekod]
```

Sınır DIŞI (tedarikçi değerlendirmesi gerekir, Bölüm 7): Vercel (barındırma),
Turso (veri), GitHub (kaynak kod, özel depo).

## 3. GxP-Kritik Süreç ve Veri Envanteri

| # | Süreç / veri | GxP etkisi | Sistemdeki karşılık |
|---|---|---|---|
| 1 | Ham madde kabul/ret kararı (Δ9-THC ≤ %0,3) | Kritik | `hamMaddeKarari` — karar kodda, kullanıcı ezemez |
| 2 | Seri serbest bırakma (kütle denkliği %98–102, açık sapma engeli) | Kritik | `seriKarari` + `acikSapmaVarMi` + e-imza |
| 3 | Tekil karekod üretimi ve tekilliği | Kritik | GS1 AI'ları, atomik sayaç (`sayacArtirTx`) |
| 4 | İleri/geri izleme ve geri çekme etki analizi | Kritik | `zincir.ts` (saf, 34 test) |
| 5 | Etiket mutabakatı (fark = 0) | Kritik | `mutabakatFarki`, D-04/D-05 denetim kontrolleri |
| 6 | Sevkiyat hareket kaydı (değişmez adet) | Kritik | `sevkiyatlar.adet` sevk anında yazılır; D-18 |
| 7 | İmha (iki tanık) | Kritik | zorunlu alanlar + e-imza |
| 8 | Denetim izi | Kritik | `loglar` — silme yolu yok, SHA-256 hash zinciri |
| 9 | Hasta kimliği (özel nitelikli veri) | Kritik (KVKK) | açık TC saklanmaz; doğrula→maskele; anahtar reçete no |
| 10 | Yetkilendirme | Yüksek | 3 katmanlı çözüm, mevzuat kilitleri, testli |

## 4. Kullanıcı Gereksinimleri (URS) — İzlenebilirlik Matrisinin Çekirdeği

Her madde uygulanmış durumda; "Kanıt" kolonu OQ testlerinin başlangıç noktasıdır.

| URS | Gereksinim | Kanıt (kod / test) |
|---|---|---|
| URS-01 | Kabul kriterleri tek yerde tanımlı olmalı, uçlarda tekrarlanmamalı | `src/lib/kabul.ts` · `test/birim/kabul.mjs` (36) |
| URS-02 | Kabul/ret kararını sistem vermeli; "yine de onayla" bulunmamalı | `hamMaddeKarari`/`seriKarari` · kabul testleri |
| URS-03 | Her ambalaj birimi GS1 uyumlu tekil karekod taşımalı | `karekod.ts` · karekod (32) + etiket-tur (8) |
| URS-04 | Basılan etiket, okutulduğunda birebir aynı veriyi vermeli (GS dahil) | `test/birim/etiket-tur.mjs` |
| URS-05 | Tekil koddan tam soyağacı (çiftçiye kadar) sorgulanabilmeli; iade/imha edilmiş birimler dahil | `zincir.ts`/`izlemeSorgu.ts` · zincir (34) |
| URS-06 | Geri çekme, bir lotun karıştığı TÜM serilere ve hastalara yayılmalı | `geriCekmeEtkisi` · zincir testleri |
| URS-07 | Ekran görünürlüğü ile eylem yetkisi ayrı katmanlar olmalı | `yetki.ts` · yetki (34) |
| URS-08 | Seri serbest bırakma ve geri çekme yetkisi role bağlı DEĞİŞTİRİLEMEZ olmalı | `KILITLI_EYLEMLER` · yetki testleri |
| URS-09 | Geri alınamaz kararlar (serbest bırakma, geri çekme, imha) şifreyle yeniden doğrulama istemeli; başarısız girişim de kayda geçmeli | `eimza.ts` · `imzalar` tablosu |
| URS-10 | Denetim izi silinemez ve geriye dönük değiştirilemez olmalı | silme yolu yok + `logZinciri.ts` (9 test) |
| URS-11 | Sevkiyat hareket kaydı (adet, kodlar) sonradan değişmemeli; iade ayrı hareket olmalı | `sevkiyatlar.adet` · denetim D-18 testi |
| URS-12 | Açık TC kimlik no saklanmamalı; yalnız doğrulanıp maskelenmiş hali yazılmalı | `tcGecerli`/`tcMaskele` · kod (19) |
| URS-13 | Kritik kayıtlarda fotoğraf kanıtı eklenebilmeli; dosya tipi içerikten doğrulanmalı | `ek.ts` (sihirli bayt) · ek (11) |
| URS-14 | Sistem, denetim öncesi eksiklerini kendisi taramalı ve dayanaklarıyla raporlamalı | `denetim.ts` (18 kontrol) · denetim (40) |
| URS-15 | Kurum bildirimleri kuyruklanmalı; elle işaretleme satır seçimi + kurum referans no + kimlik kaydı istemeli | `api/buts` — açık liste + `kurum_ref` zorunlu |
| URS-16 | Başarısız girişler sınırlanmalı, oturumlar zaman aşımına uğramalı | `giris_denemeleri` (8/15 dk) · 8 saat oturum |
| URS-17 | Mobil sahada kamera ile karekod okunabilmeli | `KarekodOkuyucu.tsx` (jsQR) |
| URS-18 | Toplu veri dışa aktarımı yetkiye tabi olmalı ve loglanmalı | `disa-aktar` — ekran yetkisi + logla |

## 5. Risk Değerlendirmesi (özet)

| Risk | Olasılık×Etki | Azaltım | Kalan risk |
|---|---|---|---|
| Yanlış lotun serbest bırakılması | D×Kritik | Karar kodda (URS-02), e-imza, D-01/D-03 taraması | Düşük |
| Karekod çakışması | D×Kritik | Atomik sayaç; `MAX(id)+1` yasak (AGENTS md. 6) | Çok düşük |
| Denetim izinin kurcalanması | D×Kritik | Hash zinciri + doğrulama ucu; DB erişimi sınırlı | Düşük — DB yöneticisi zinciri yeniden yazamazsın diye periyodik dış kopya önerilir (Bölüm 8) |
| Sevkiyat-BÜTS adet uyuşmazlığı | O×Yüksek | Değişmez adet + D-18 kritik bulgu | Düşük |
| Yetki yükseltme | D×Yüksek | Rol atama kilitleri, ilk-kurulum istisnası testli | Düşük |
| Yanlış BÜTS "girildi" beyanı | O×Yüksek | Satır seçimi + kurum_ref zorunlu + kod listesi logda | Düşük |
| Tek Mesul Müdür kilitlenmesi | O×Orta | D-16 uyarısı; ikinci hesap prosedürü | Orta — SOP gerekli |
| Barındırma/DB hizmet kesintisi | O×Orta | Bölüm 7 tedarikçi değerlendirmesi + yedekleme testi | Orta |

D=Düşük, O=Orta. Tam FMEA, Kalite Güvence ile birlikte yapılmalıdır.

## 6. Ürün Sınıflandırması ve Kurum Bildirimi — AÇIK KONU

"BÜTS" bu sistemde **çalışma adıdır**. Hedef sistem ürün sınıfına göre İTS, ÜTS
veya Bitkisel Ürün Takip Sistemi olabilir. Geliştirme İLERLEMEDEN TİTCK'den
yazılı alınacaklar: (1) ürünün resmî sınıflandırması, (2) bildirim sisteminin
kesin adı, (3) web servis dokümanı + test ortamı + bildirim kodları.
Ayrıca GS1 Türkiye'den firma öneki alınmalı (mevcut GTIN'ler yer tutucudur) ve
etiket sembolü karekoddan DataMatrix'e geçirilmelidir.

## 7. Tedarikçi Değerlendirmesi (yapılacak)

Vercel ve Turso için: hizmet seviyesi, veri yerleşimi, yedekleme/geri yükleme
taahhütleri, sertifikasyonlar (SOC 2 vb.) toplanıp değerlendirme dosyasına
konmalı. GitHub deposu özel; erişim listesi çeyreklik gözden geçirilmeli.

## 8. Veri Saklama ve İşletim

- İzlenebilirlik kayıtları: **asgari 5 yıl** (SOP-KG-01; seri SKT +1 yılı kısa değilse).
- Hasta verisi: maskeli TC + reçete no — saklama süresi ve imha yöntemi KVKK
  envanterine işlenmeli; sistemde silme yolu bilinçli olarak yoktur, süre sonu
  imhası kontrollü dışa aktarma + veritabanı yöneticisi prosedürüyle yapılmalıdır.
- Yedekleme: Turso yedeklerinin **geri yükleme testi** yapılmalı (yalnız alınması yetmez).
- Denetim izi dış kopyası: hash zincirinin son özeti periyodik olarak sistem
  dışına (ör. imzalı e-posta/kasa) kaydedilirse, DB yöneticisinin zinciri
  baştan yazması da tespit edilebilir hâle gelir.

## 9. Faz 4 — Doğrulama ve İşletim (yol haritası)

1. Bu dokümanın URS tablosunu gereksinim–test izlenebilirlik matrisine genişlet
   (her URS → OQ senaryosu; 284 otomatik test başlangıç kanıtıdır).
2. IQ: ortam değişkenleri, HTTPS/CSP başlıkları, DB göçleri kurulum kontrol listesi.
3. OQ: yetki matrisi testleri (rol × ekran × eylem), e-imza, hash zinciri
   doğrulaması, negatif senaryolar (bu oturumda elle koşulan HTTP senaryoları
   yazılı protokole dönüştürülmeli).
4. PQ/UAT: gerçek kullanıcılarla, örnek veri ÜRETİMDEN TEMİZLENDİKTEN sonra.
5. Eğitim kayıtları, erişim listesi ilk yayını, değişiklik kontrolü SOP'si
   (her deploy = kayıtlı değişiklik; git geçmişi + kalite kapısı kanıttır).
6. Periyodik gözden geçirme: erişimler (çeyreklik), denetim izi zinciri (aylık),
   ön denetim raporu (aylık ve denetim öncesi).
