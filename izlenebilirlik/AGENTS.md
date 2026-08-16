<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

## Proje

Tarladan hastaya kapalı zincir izlenebilirlik sistemi.
İnsitu Yeşil Teknolojiler A.Ş. — CBD distilat / izolat üretim tesisi.

Zincir: **çiftçi → ham madde lotu → üretim serisi → ambalaj birimi (karekod) →
sevkiyat → eczane → hasta**

Kaynak dokümanlar: `Ek-13 Üretim Akış Şeması`, `SOP-ÜR-12/13/14/15/16`,
`SOP-KK-02/05`, `SOP-KG-01/03/07`, `KEK Kalite El Kitabı`.

## Yığın

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 4 ·
Turso (libSQL) · Vercel. Mobil = PWA (`src/app/manifest.ts`), karekod okuma
telefon kamerasıyla (`src/components/KarekodOkuyucu.tsx`, jsQR).

## Değişmez kurallar

Bunlar sistemin var oluş sebebi; kırılırsa uygulama yanlış şey yapar:

1. **Kabul kriterleri TEK YERDE.** Δ9-THC sınırı, kütle denkliği aralığı, CBD
   asgarileri yalnızca `src/lib/kabul.ts` içinde. Hiçbir uçta yeniden yazılmaz.
   `test/birim/kabul.mjs` sınır değerleri dâhil bunları koruyor.
2. **Kararı sistem verir, kullanıcı değil.** Operatör ölçüm SONUCUNU girer;
   kabul/ret kararını `hamMaddeKarari` ve `seriKarari` hesaplar. "Yine de
   onayla" düğmesi YOKTUR.
3. **Menüyü gizlemek kontrol değildir.** Her sayfa `ekranKoru`, her API ucu
   `korumali({ ekran, eylem })`. Yetki tanımı `src/lib/yetki.ts`.
   Yetki ÜÇ KATMANDAN çözülür: kişisel izin → rolün düzenlenmiş ayarı
   (Roller ekranı) → koddaki GMP varsayılanı. Yalnızca SAPMA saklanır.
   `admin` koşulsuz her şeyi yapar (kilitlenme emniyeti); `okuyucu` hiçbir
   eylemi yapamaz; `seri_serbest` ve `gericekme_baslat` mevzuatla sabittir
   ve Roller ekranından değiştirilemez.
4. **İstemciden gelen değere güvenilmez.** Yazma yapan her uç gövdeyi
   `src/lib/dogrula.ts` üzerinden geçirir.
5. **Çok adımlı yazma işlemleri transaction içinde.** Ambalajlama N satır +
   seri güncellemesi; sevkiyat 1 sevkiyat + N paket. Yarım kalmış bir
   izlenebilirlik kaydı, hiç olmayandan daha yanıltıcıdır.
6. **Sayaçlar atomik.** Kod numaraları `sayacArtir`/`sayacArtirTx` ile üretilir.
   `MAX(id)+1` KULLANILMAZ — karekodun tekilliği tüm izlenebilirliğin dayanağı.
7. **Açık TC saklanmaz.** `tcGecerli` ile doğrulanır, `tcMaskele` ile
   maskelenir, yalnızca maskeli hali yazılır. Eşleştirme anahtarı reçete no.
8. **Denetim izi silinmez.** `loglar` tablosundan SİLME yapan kod yolu yoktur.
9. **Karar bir kez verilir.** SERBEST/RET olmuş bir lot veya seri yeniden
   değerlendirilemez; GMP'de kayıt geriye dönük düzeltilmez, sapma açılır.
10. **Biçimleme `src/lib/bicim.ts`'te.** Sunucu bileşenleri `"use client"`
    modülünden fonksiyon çağıramaz; `Arayuz.tsx` yalnızca yeniden dışa aktarır.
11. **Okutulan kod önce `karekodNormalize`'dan geçer.** Bazı USB okuyucular GS
    ayırıcısını kırpıyor; normalize etmeden `paketler.uid` ile karşılaştırmak
    GERÇEK bir kutuyu "sahte ürün şüphesi" ile reddettiriyordu.
12. **Statü adları `src/lib/types.ts`'teki `as const` dizilerden.** Elle yazılan
    bir statü adı derlemeden de testten de geçer, yalnızca sahada patlar.
13. **Geri alınamaz kararlar elektronik imza ister.** Seri serbest bırakma,
    geri çekme ve imha uçları `elektronikImza` (şifreyle yeniden doğrulama)
    olmadan çalışmaz; başarısız girişimler de `imzalar` tablosuna yazılır.
    Tablo append-only. Bu, tek başına "Part 11 uyumu" İDDİASI değildir —
    o iddia validasyon paketi + prosedür + eğitimle kurulur.
14. **Sevkiyat adedi sevk anında yazılır ve değişmez.** İade `sevk_kod` bağını
    SİLMEZ; fark oluşursa ön denetim D-18 kritik bulgu üretir.

## Kalite kapısı

```
npm run dogrula     # lint + typecheck + saf testler (338 test)
```

Saf mantık (`kabul`, `karekod`, `kod`, `zincir`, `proses`, `filtre`, `hizli`,
`ek`, `yetki`, `rolTablosu`, `denetim`, `logZinciri`, `analiz`, `gorev`) veritabanı bilmez ve doğrudan
`node --experimental-strip-types` ile test edilir. Yeni bir iş kuralı eklerken
önce oraya yazın.

## Deploy

```
npx vercel --prod
```

Yeni tablo/kolon ekleyen deploy'dan sonra bir kez `RUN_DB_INIT=1` ile çalıştırın.
