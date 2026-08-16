# İzlenebilirlik Sistemi — İnsitu Yeşil Teknolojiler A.Ş.

Tarladan hastaya kapalı zincir takip sistemi.
Çiftçi → Ham madde → Üretim serisi → Ambalaj/karekod → Sevkiyat → Eczane → Hasta

Kaynak: **Ek-13 Üretim Akış Şeması**, SOP-ÜR-12/13/14/15/16, SOP-KK-02/05, SOP-KG-07.

---

## Çalıştırma

Klasörde bir yerel sunucu başlatın (dosyayı doğrudan çift tıklayarak açmak **yetmez** —
tarayıcı güvenlik kısıtı nedeniyle scriptler çalışmaz):

```bash
python -m http.server 8777 --directory Izleme-Sistemi
```

Sonra tarayıcıdan `http://localhost:8777` adresine gidin.

İlk denemede **Kayıtlar → Örnek Veri Yükle** ile dolu bir zincir yükleyip
**İzleme Sorgusu** sekmesini deneyin. Gerçek kullanıma geçerken
**Kayıtlar → Tüm Veriyi Sil** ile temizleyin.

---

## Günlük iş akışı

| Sıra | Sekme | Yapılan iş | Ek-13 adımı |
|---|---|---|---|
| 1 | Çiftçi | Tedarikçi kaydı açılır (ekim izin no zorunlu) | — |
| 2 | Ham Madde | Teslimat kabul edilir → otomatik **KARANTİNA** | Adım 1 |
| 3 | Ham Madde | Akredite lab analizi girilir → **SERBEST** veya **RET** | Adım 2 |
| 4 | Üretim Serisi | Serbest lotlardan seri açılır, ham madde düşülür | Adım 3–10 |
| 5 | Üretim Serisi | Çıktı/fire/numune girilir → kütle denkliği + serbest bırakma | Adım 15 |
| 6 | Ambalaj | Tekil karekodlar üretilir ve yazdırılır | Adım 12 |
| 7 | Sevkiyat | Kodlar okutulur, mühür/taşıyıcı kaydedilir | Adım 16 |
| 8 | Eczane Satışı | Hastaya teslim, reçete no ile kaydedilir | — |

---

## Sistemin otomatik engellediği durumlar

Bunlar SOP'lardaki kabul kriterlerinden gelir; kullanıcı elle geçemez:

- **Δ9-THC > %0,3** olan ham madde lotu → otomatik RET, üretime giremez
- **Kütle denkliği %98–102 dışında** → seri serbest bırakılamaz (SOP-ÜR-16 md. 5.2)
- **CBD < %80** (distilat) / **< %99** (izolat) → serbest bırakılamaz
- **Kalıntı çözücü > 5.000 ppm** → serbest bırakılamaz
- **Açık sapma/CAPA varsa** → serbest bırakılamaz
- **SERBEST olmayan seri** ambalajlanamaz
- **SERBEST olmayan birim** sevk edilemez
- Aynı karekod **iki kez sevk edilemez / iki kez satılamaz**
- Bir birim, **sevk edildiği eczaneden başka** eczaneden satılamaz
- **SKT geçmiş** birim sevk/satış yapılamaz
- Sistemde **kayıtlı olmayan karekod** → sahte ürün uyarısı

---

## Karekod formatı

GS1 uygulama tanımlayıcı (AI) yapısı — İTS/BÜTS ile aynı mantık:

```
01 08680000000017  21 T00000001  17 280810  10 CBD-D-2026-0001
│  └ GTIN          │  └ tekil no  │  └ SKT   │  └ üretim serisi
└ AI               └ AI           └ AI       └ AI
```

**Önemli:** İTS'te fiziksel etikette **DataMatrix** sembolü kullanılır.
Bu uygulama aynı veriyi **QR** olarak basar — veri içeriği birebir aynıdır.
Resmî etiket basımına geçerken sembol tipi DataMatrix'e çevrilmelidir.

---

## Geri çekme (recall)

**Geri Çekme** sekmesinden bir ham madde lotu veya üretim serisi seçin.
Sistem üç şeyi birden çıkarır:

1. **Toplanacak noktalar** — hangi eczane/depoda kaç adet var
2. **Bilgilendirilecek hastalar** — reçete no ve hekim bilgisiyle
3. **Kaynağa kadar geri izleme** — hangi çiftçinin hangi parseli

"Geri Çekmeyi Başlat" satılmamış tüm birimleri bloke eder ve BÜTS kuyruğuna bildirim ekler.

---

## Bilinmesi gerekenler — sınırlar

Bu sürüm **tarayıcının yerel deposunda (localStorage)** çalışır. Bunun anlamı:

- **Tek makine, tek tarayıcı.** Veri o bilgisayarda durur; başka makineden görülmez.
- **Eczaneler kendi sistemlerinden giriş yapamaz.** Şu an eczane satışını
  tesiste siz kaydedersiniz. Eczanenin kendi ekranından girmesi için sunucu gerekir.
- **Tarayıcı verisi temizlenirse kayıt gider.** Bu yüzden
  **Kayıtlar → Tüm Veriyi Yedekle** ile her gün sonu yedek alın.
- **Denetim izi silinemez ama korumasızdır** — GMP'nin aradığı
  "değiştirilemez kayıt" (21 CFR Part 11 tarzı) için sunucu tarafı gerekir.
- **BÜTS bildirimleri kuyruklanır, otomatik gönderilmez.** Kuruma otomatik
  gönderim için resmî BÜTS web servis kimlik bilgileri gerekir; temin edildiğinde
  gönderim katmanı bu kuyruğa bağlanır.

Bu haliyle sistem **tesis içi üretim ve sevkiyat takibi** için gerçekten kullanılabilir.
Eczane ayağının canlıya alınması ve denetime dayanıklı kayıt için bir sonraki adım
sunucu tarafına (veritabanı + kullanıcı yetkilendirme + değiştirilemez log) geçmektir.

---

## Yedekleme

**Kayıtlar** sekmesi:
- **Tüm Veriyi Yedekle (JSON)** — her gün sonu alın, tarihli olarak saklayın
- **Yedekten Geri Yükle** — mevcut veriyi tamamen değiştirir
- **Örnek Veri Yükle** — eğitim/demo amaçlı
- **Tüm Veriyi Sil** — geri alınamaz

---

## Dosya yapısı

```
Izleme-Sistemi/
├── index.html          arayüz
├── OKUBENI.md          bu dosya
└── assets/
    ├── app.js          iş mantığı (izlenebilirlik, kontroller, BÜTS)
    ├── app.css         görünüm (açık/koyu tema)
    └── qrcode.js       QR üretici (MIT lisanslı, Kazuhiko Arase)
```
