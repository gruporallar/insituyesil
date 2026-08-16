/**
 * PWA ikonlarını üretir — bağımlılıksız PNG yazıcı.
 *
 * NEDEN ELDE YAZILDI: `sharp`/`canvas` gibi bir kütüphane eklemek, yalnızca üç
 * statik dosya üretmek için derleme gerektiren bir yerel bağımlılık demekti.
 * İkonlar bir kez üretilip depoya giriyor; betik yalnızca tasarım değişirse
 * tekrar çalıştırılıyor.
 *
 *   node scripts/ikon-uret.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEDEF = join(KOK, "public", "icons");

// Marka rengi — manifest.ts ve globals.css ile aynı yeşil.
const YESIL = [21, 128, 61];
const BEYAZ = [255, 255, 255];

function crc32(buf) {
  let c;
  const tablo = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tablo[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = tablo[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function parca(tip, veri) {
  const uzunluk = Buffer.alloc(4);
  uzunluk.writeUInt32BE(veri.length);
  const govde = Buffer.concat([Buffer.from(tip, "ascii"), veri]);
  const kontrol = Buffer.alloc(4);
  kontrol.writeUInt32BE(crc32(govde));
  return Buffer.concat([uzunluk, govde, kontrol]);
}

/** `boya(x, y, boyut)` → [r,g,b] döndüren fonksiyondan PNG üretir. */
function pngUret(boyut, boya) {
  // Her satır bir filtre baytıyla başlıyor (0 = filtresiz).
  const ham = Buffer.alloc(boyut * (boyut * 3 + 1));
  let i = 0;
  for (let y = 0; y < boyut; y++) {
    ham[i++] = 0;
    for (let x = 0; x < boyut; x++) {
      const [r, g, b] = boya(x, y, boyut);
      ham[i++] = r;
      ham[i++] = g;
      ham[i++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(boyut, 0);
  ihdr.writeUInt32BE(boyut, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 2; // renk tipi: truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca("IHDR", ihdr),
    parca("IDAT", deflateSync(ham, { level: 9 })),
    parca("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Simge: yeşil zemin üzerine beyaz, aşağı doğru akan üç halka —
 * zincirin (tarla → üretim → hasta) soyutlaması.
 */
function desen(guvenliAlan) {
  return (x, y, boyut) => {
    const m = boyut * guvenliAlan; // maskeleme payı
    const ic = boyut - 2 * m;
    const nx = (x - m) / ic;
    const ny = (y - m) / ic;

    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return YESIL;

    // Üç halka: merkezleri dikeyde eşit aralıklı, yarıçap aynı.
    const merkezler = [0.22, 0.5, 0.78];
    const disR = 0.15;
    const icR = 0.075;

    for (const cy of merkezler) {
      const d = Math.hypot(nx - 0.5, ny - cy);
      if (d <= disR && d >= icR) return BEYAZ;
    }

    // Halkaları birleştiren dikey bağ.
    if (Math.abs(nx - 0.5) <= 0.025) {
      for (let i = 0; i < merkezler.length - 1; i++) {
        if (ny > merkezler[i] + icR && ny < merkezler[i + 1] - icR) return BEYAZ;
      }
    }

    return YESIL;
  };
}

mkdirSync(HEDEF, { recursive: true });

const isler = [
  // Normal ikonlar — kenar payı küçük.
  { ad: "icon-192.png", boyut: 192, pay: 0.08 },
  { ad: "icon-512.png", boyut: 512, pay: 0.08 },
  // Maskelenebilir ikon: Android simgeyi daireye kırpabiliyor. İçerik "güvenli
  // alan"da (merkezin %80'i) kalmazsa kenarları kesiliyor.
  { ad: "icon-maskable-512.png", boyut: 512, pay: 0.2 },
];

for (const is of isler) {
  writeFileSync(join(HEDEF, is.ad), pngUret(is.boyut, desen(is.pay)));
  console.log(`✓ ${is.ad} (${is.boyut}×${is.boyut})`);
}
