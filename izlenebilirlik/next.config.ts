import type { NextConfig } from "next";

/**
 * Tüm yanıtlara uygulanan güvenlik başlıkları.
 *
 * Uygulama hasta kimlik bilgisi (maskeli), reçete numarası ve çiftçi kimlik
 * verisi tutuyor. `frame-ancestors 'none'` clickjacking'i kapatıyor: "Serbest
 * Bırak" veya "Geri Çekmeyi Başlat" düğmesine görünmez bir iframe üzerinden
 * tıklatmak GMP kaydını sahteler.
 *
 * `script-src 'unsafe-inline'` VAR ve bilinçli: tema seçici FOUC'u önlemek için
 * layout.tsx içinde engelleyici satır içi betik çalıştırıyor ve Next.js kendi
 * önyükleme betiklerini satır içi basıyor. CSP'nin diğer yönleri tam güçte.
 */
const GUVENLIK_BASLIKLARI = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    // Kamera AÇIK: karekod okutma telefonun arka kamerasını kullanıyor
    // (src/components/KarekodOkuyucu.tsx). `self` üçüncü taraf iframe'lere
    // kapatır. Mikrofon ve konum gerekmiyor — kapalı.
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // `blob:` kamera akışının video/canvas önizlemesi için.
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      // jsQR kod çözümlemeyi worker içinde yapabiliyor.
      "worker-src 'self' blob:",
      "media-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  // Çalışma alanı kökü AÇIKÇA belirtiliyor. Üst dizinlerde başka bir
  // package-lock.json bulunduğunda Next kökü yanlış çıkarıyor ve dosya izleme
  // ile bağımlılık çözümlemesi o dizine kayıyor.
  turbopack: { root: __dirname },
  async headers() {
    return [
      {
        // Her yola uygulanır — istisna tanımlamak yerine varsayılanı güvenli
        // yapmak, yeni bir sayfa eklendiğinde korumanın unutulmasını önler.
        source: "/:path*",
        headers: GUVENLIK_BASLIKLARI,
      },
      {
        // Service worker güncellemesi gecikmesin.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
