# İnsitu İzlenebilirlik

Tarladan hastaya kapalı zincir ürün takip sistemi.
**İnsitu Yeşil Teknolojiler A.Ş.** — Gölhisar / Burdur · CBD distilat ve izolat üretim tesisi.

Zincirin her halkası bir öncekine bağlı; tek bir karekoddan hem geriye (bu ürün hangi
çiftçinin hangi parselinden geldi) hem ileriye (bu lot nereye gitti, geri çekmede kimi
aramalıyım) gidilebiliyor.

```
çiftçi → ham madde lotu → üretim serisi → ambalaj birimi (karekod)
                                        → sevkiyat → eczane → hasta
```

---

## Kurulum

```bash
npm install
cp .env.example .env.local     # doldurun
npm run dev
```

`.env.local` içinde en az şunlar olmalı:

```
RUN_DB_INIT=1
SEED_ADMIN_EMAIL=ad@ornek.com
SEED_ADMIN_PASSWORD=en-az-12-karakter
SEED_ADMIN_NAME=Ad Soyad
```

İlk çalıştırmada şema kurulur ve **Mesul Müdür** hesabı açılır. Hesap açıldıktan sonra
`SEED_ADMIN_*` değişkenlerini kaldırın ve ilk girişte şifreyi değiştirin.

Veritabanı adresi tanımlı değilse yerel `data/izlenebilirlik.db` dosyasına düşer —
geliştirme için yeterli, **üretim için değil**.

---

## Roller ve yetkiler

Roller GMP görev tanımlarından (GT-01 … GT-06), yetki dağılımı Ek-13 "Kritik Kontrol
Noktaları" tablosunun *Durdurma Yetkisi* kolonundan türetildi.

| Rol | Görebildiği | Yapabildiği kritik işlem |
|---|---|---|
| **Mesul Müdür** | tümü | seri serbest bırakma, geri çekme başlatma, kullanıcı yönetimi |
| **KG-KK** | kullanıcılar hariç tümü | analiz kabul/ret kararı, BÜTS işaretleme |
| **Üretim Sorumlusu** | panel, ham madde, üretim, ambalaj, izleme | seri açma, ambalajlama |
| **Depo Sorumlusu** | panel, ham madde, ambalaj, sevkiyat, satış, izleme | mal kabul, sevkiyat |
| **Okuyucu** | panel, izleme, BÜTS | — (salt görüntüleme) |

Menüyü gizlemek kontrol değildir: her sayfa `ekranKoru`, her API ucu
`korumali({ ekran, eylem })` çağırır.

---

## Sistemin otomatik engellediği durumlar

Bunlar SOP'lardaki kabul kriterlerinden gelir ve **elle geçilemez** — "yine de onayla"
düğmesi yoktur.

| Kural | Kaynak |
|---|---|
| Δ9-THC > %0,3 olan ham madde lotu → otomatik RET, üretime giremez | Ek-13 adım 2 |
| Kütle denkliği %98–102 dışında → seri serbest bırakılamaz | SOP-ÜR-16 md. 5.2 |
| CBD < %80 (distilat) / < %99 (izolat) → serbest bırakılamaz | Ek-13 adım 9–10 |
| Kalıntı çözücü > 5.000 ppm → serbest bırakılamaz | Ek-13 adım 7, 10 |
| Açık sapma / kapanmamış CAPA varsa → serbest bırakılamaz | SOP-KG-03 |
| SERBEST olmayan seri ambalajlanamaz | Ek-13 adım 12 |
| SERBEST olmayan veya SKT'si geçmiş birim sevk edilemez | SOP-ÜR-14 md. 5.1 |
| Aynı karekod iki kez sevk edilemez / iki kez satılamaz | — |
| Bir birim, sevk edildiği eczaneden başkasından satılamaz | kapalı zincir |
| Sistemde kayıtlı olmayan karekod → sahte ürün uyarısı | SOP-KG-07 |
| SERBEST/RET kararı verilmiş lot veya seri yeniden değerlendirilemez | SOP-KG-03 |

Ayrıca: seriden fazla ambalajlama, stokta olandan fazla ham madde çekme ve gelecek
tarihli teslimat/sevkiyat/satış kaydı engellenir.

---

## Karekod

GS1 uygulama tanımlayıcı (AI) yapısı — İTS/BÜTS ile aynı mantık:

```
01 {GTIN:14}  21 {tekil seri}  <GS>  17 {SKT:YYAAGG}  10 {parti/seri}
```

`<GS>` (ASCII 29) değişken uzunluklu alandan sonra zorunlu ayırıcıdır. Okuyucu bu
karakteri kırpsa bile çözümleyici ayırıcısız biçimi de tanır. GTIN kontrol hanesi
doğrulanır — elle girilen hatalı kodun neredeyse tamamı burada yakalanır.

**İki açık nokta:**

- **GTIN'ler yer tutucu.** `src/lib/karekod.ts` içindeki numaralar GS1 Türkiye'den
  tahsis edilmiş değil. Gerçek numaralar alındığında orada değişmeli.
- **Sembol tipi.** İTS fiziksel etikette **DataMatrix** ister; bu uygulama aynı veriyi
  **QR** olarak basıyor. Veri içeriği birebir aynı; resmî basıma geçerken sembol
  çevrilmeli.

---

## BÜTS

`SOP-ÜR-16` kapsamındaki hareketler (üretim, ambalaj, sevkiyat, satış, ret, geri çekme)
otomatik olarak bildirim kuyruğuna düşer.

**Bu sürüm Kuruma otomatik gönderim YAPMAZ.** Kuyruk hazırlanır ve JSON olarak dışa
aktarılabilir; gerçek gönderim için Kurumdan alınacak web servis kimlik bilgileri
(kullanıcı, şifre, uç nokta) gerekiyor. Bunlar temin edildiğinde gönderim katmanı
`src/app/api/buts/route.ts` üzerinden kuyruğa bağlanacak.

---

## KVKK

Hasta kimlik numarası **hiç saklanmıyor**. Girişte algoritma ile doğrulanıyor (yanlış
numara maskelendikten sonra düzeltilemez), sonra maskeleniyor ve yalnızca maskeli hali
(`123******01`) veritabanına yazılıyor. Eşleştirme anahtarı reçete numarasıdır.
Aydınlatma ve açık rıza yükümlülüğü eczanededir.

---

## Geliştirme

```bash
npm run dev        # geliştirme sunucusu
npm run dogrula    # lint + typecheck + saf testler — deploy öncesi kalite kapısı
npm run test:saf   # yalnızca birim testleri (153 test)
npm run build      # üretim derlemesi
```

### Mimari

```
src/lib/
  kabul.ts      kabul kriterleri ve karar mantığı   ← saf, birim testli
  karekod.ts    GS1 karekod üretimi/çözümlemesi     ← saf, birim testli
  kod.ts        kayıt kodları, TC doğrulama/maskeleme ← saf, birim testli
  zincir.ts     soyağacı, ileri/geri izleme, recall  ← saf, birim testli
  bicim.ts      biçimleme (sunucu + istemci ortak)
  yetki.ts      ekran ve eylem yetkileri — TEK YER
  dogrula.ts    girdi doğrulama — istemciye güvenilmez
  db.ts         şema, transaction, atomik sayaçlar
  auth.ts       oturum yönetimi
  api.ts        API ortak kapısı (oturum + yetki + hata)
  veri.ts       zincir verisini tek seferde okuma
```

İş kuralları veritabanından ve HTTP'den **bağımsız** tutuldu; `test/birim/*.mjs`
onları doğrudan çalıştırıyor. Yeni bir kural eklerken önce oraya yazın — geri çekmede
"kaç hasta etkilendi" sorusunun yanlış cevaplanması sistemin yapabileceği en pahalı
hatadır ve o hesap SQL içine gömülü olsaydı ancak canlı veriyle sınanabilirdi.

### Test kapsamı

| Dosya | Test | Neyi koruyor |
|---|---|---|
| `karekod.mjs` | 25 | GS1 biçimi, kontrol hanesi, ayırıcı kırpılması |
| `kabul.mjs` | 36 | THC/CBD/çözücü sınırları, kütle denkliği, etiket mutabakatı, **sınır değerler** |
| `kod.mjs` | 19 | kod biçimleri, TC doğrulama, maskeleme geri döndürülemezliği |
| `zincir.mjs` | 34 | soyağacı, **bir lotun iki seriye bölünmesi**, recall kapsamı |
| `proses.mjs` | 22 | Ek-13 kritik kontrol noktaları, çift paraf/imza kuralı |
| `filtre.mjs` | 17 | SQL koşulu ile parametre sayısının tutması, girdinin SQL'e sızmaması |

---

## Deploy

```bash
npx vercel --prod
```

Bölge `fra1`. Vercel ortam değişkenleri: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
Şema kurulumu cold-start maliyeti yüzünden Turso'da varsayılan olarak atlanır; yeni
tablo/kolon ekleyen deploy'dan sonra **bir kez** `RUN_DB_INIT=1` ile çalıştırın, sonra
kaldırın.

---

## Bilinen teknik borç

- **BÜTS gönderimi bağlı değil** — Kurumdan web servis kimlik bilgisi bekleniyor
  (yukarıya bakın).
- **GTIN'ler yer tutucu** — GS1 Türkiye tahsisi bekleniyor (yukarıya bakın).
- **Etiket sembolü QR, DataMatrix değil** (yukarıya bakın).
- **Zincir verisi tamamen belleğe okunuyor.** İzleme sorgusu ve geri çekme analizi
  `veri.ts` üzerinden tüm tabloları okuyor. Tesis kapasitesi (100 kg/gün, 4 batch)
  için doğru karar; kayıt sayısı yüz binlere çıkarsa oradan daraltma yapılmalı.
  Liste ekranları bundan etkilenmiyor — onlar sayfalı.
- **Giriş sınırı e-posta başına.** Tek bir hesaba yapılan sözlük saldırısını
  durdurur; binlerce farklı e-posta deneyen dağıtık bir saldırıyı durdurmaz.
  Onun için IP bazlı sınır veya WAF gerekir.
- **PDF üretimi tarayıcıdan.** Seri dosyası ve geri çekme raporu "Yazdır → PDF
  olarak kaydet" ile alınıyor; sunucu tarafında üretilen bir PDF değil.
- **Dışa aktarma CSV, xlsx değil.** Noktalı virgül + BOM ile Türkçe Excel'de doğru
  açılıyor ama Excel'e özgü biçimlendirme (sütun genişliği, donmuş başlık) yok.
