import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "İnsitu İzlenebilirlik",
  description: "Tarladan hastaya kapalı zincir ürün takip sistemi",
  applicationName: "İnsitu İzlenebilirlik",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "İzlenebilirlik" },
  // Sistem kurum içi; arama motorlarında görünmemeli.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // `maximumScale` KISITLANMADI: yakınlaştırmayı kapatmak erişilebilirlik
  // ihlali. Küçük yazıyı büyütemeyen kullanıcı sistemi kullanamaz.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#15803d" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

/**
 * Tema betiği — FOUC önleyici.
 *
 * `dangerouslySetInnerHTML` ile SATIR İÇİ ve <head> içinde: React hidrasyonu
 * beklenirse sayfa bir kare açık temada çizilip sonra koyuya atlıyor. Gece
 * vardiyasında bu göz alıyor.
 */
const TEMA_BETIGI = `
(function(){try{
  var t = localStorage.getItem('tema');
  var koyu = t === 'koyu' || (t !== 'acik' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (koyu) document.documentElement.classList.add('dark');
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_BETIGI }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
