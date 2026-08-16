import type { MetadataRoute } from "next";

/**
 * PWA manifesti — "mobil uygulama" ayağı.
 *
 * Ayrı bir yerel uygulama yerine PWA: tek kod tabanı, mağaza onayı beklemeden
 * güncelleme ve kamera erişimi (karekod okutma) tarayıcıdan zaten mümkün.
 * Ana ekrana eklendiğinde adres çubuğu olmadan tam ekran açılıyor.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "İnsitu İzlenebilirlik",
    // Ana ekran kısayolunda uzun isim kırpılır — kısa tut.
    short_name: "İzlenebilirlik",
    description: "Tarladan hastaya kapalı zincir ürün takip sistemi",
    start_url: "/panel",
    scope: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#15803d",
    lang: "tr",
    dir: "ltr",
    categories: ["business", "productivity", "medical"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "İzleme Sorgusu", short_name: "İzle", url: "/panel/izleme" },
      { name: "Sevkiyat", short_name: "Sevk", url: "/panel/sevkiyat" },
    ],
  };
}
