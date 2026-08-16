"use client";

import Link from "next/link";
import * as ikonlar from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import { cagir } from "./Arayuz";

type Ekran = { anahtar: string; etiket: string; yol: string; ikon?: string };
type Grup = { baslik: string | null; ekranlar: Ekran[] };

/**
 * TEMA DURUMU — React state'i değil, DOM'un kendisi kaynak.
 *
 * `.dark` sınıfını hidrasyondan ÖNCE layout.tsx'teki satır içi betik koyuyor
 * (FOUC önlemi). Bunu bir `useEffect` ile state'e kopyalamak iki sorun
 * doğuruyordu: bir ek render turu ve iki kaynağın ayrışma ihtimali.
 * `useSyncExternalStore` DOM'u doğrudan okuyor; sunucu anlık görüntüsü
 * `false` çünkü sunucuda `document` yok ve betik henüz çalışmamış.
 */
const temaDinleyiciler = new Set<() => void>();

function temaAbone(bildir: () => void) {
  temaDinleyiciler.add(bildir);
  return () => temaDinleyiciler.delete(bildir);
}

const temaOku = () => document.documentElement.classList.contains("dark");
const temaSunucu = () => false;

/**
 * MENÜ GRUP DURUMU — localStorage tabanlı harici depo.
 *
 * KAPALI gruplar saklanıyor, açıklar değil: varsayılan AÇIK olmalı. Kapalı
 * başlasaydı panodan bir operasyon ekranına gitmek her seferinde fazladan bir
 * tık ederdi — yani gruplama, çözdüğü sorundan daha büyük bir sorun yaratırdı.
 * Katlamak, kullanmadığı alanı gizlemek isteyen kullanıcının SEÇİMİ.
 *
 * `getSnapshot` her çağrıda YENİ dizi döndürürse React sonsuz döngüye girer;
 * bu yüzden ayrıştırılan değer önbellekte tutuluyor ve yalnızca yazıldığında
 * yenileniyor.
 */
const grupDinleyiciler = new Set<() => void>();
let grupOnbellek: string[] | null = null;
const BOS_GRUPLAR: string[] = [];

function gruplarAbone(bildir: () => void) {
  grupDinleyiciler.add(bildir);
  return () => grupDinleyiciler.delete(bildir);
}

function gruplarOku(): string[] {
  if (grupOnbellek) return grupOnbellek;
  try {
    const ham = localStorage.getItem("menuKapaliGruplar");
    grupOnbellek = ham ? (JSON.parse(ham) as string[]) : BOS_GRUPLAR;
  } catch {
    grupOnbellek = BOS_GRUPLAR;
  }
  return grupOnbellek;
}

function gruplarSunucu(): string[] {
  return BOS_GRUPLAR;
}

function gruplarYaz(yeni: string[]) {
  grupOnbellek = yeni;
  try {
    localStorage.setItem("menuKapaliGruplar", JSON.stringify(yeni));
  } catch {
    /* özel sekmede yazılamayabilir */
  }
  grupDinleyiciler.forEach((f) => f());
}

/**
 * UYGULAMA KABUĞU — üst bar, gezinme, tema.
 *
 * Gezinme MASAÜSTÜNDE yan sütun, MOBİLDE açılır menü. Tek bir yatay kaydırmalı
 * şerit denendi ve bırakıldı: on bir ekran telefonda kaydırma gerektiriyor ve
 * ekranların yarısı görünmüyordu.
 */
export function Kabuk({
  gruplar,
  kullanici,
  testVerisi,
  children,
}: {
  gruplar: Grup[];
  testVerisi?: boolean;
  kullanici: { ad: string; rol: string; gorev: string | null };
  children: React.ReactNode;
}) {
  const yol = usePathname();
  const router = useRouter();
  const [menuAcik, setMenuAcik] = useState(false);

  /**
   * Elle açılmış gruplar — kaynağı localStorage, tema ile AYNI desen.
   *
   * Effect içinde okuyup state'e kopyalamak iki sorun doğuruyordu: fazladan
   * bir render turu ve "effect içinde senkron setState" (kural gereği yasak).
   * `useSyncExternalStore` doğrudan depodan okuyor; sunucu anlık görüntüsü
   * boş liste, çünkü sunucuda `localStorage` yok.
   */
  const kapaliGruplar = useSyncExternalStore(gruplarAbone, gruplarOku, gruplarSunucu);

  const grupDegistir = useCallback((baslik: string) => {
    const mevcut = gruplarOku();
    const yeni = mevcut.includes(baslik)
      ? mevcut.filter((x) => x !== baslik) // kapalıydı → aç
      : [...mevcut, baslik]; // açıktı → kapat
    gruplarYaz(yeni);
  }, []);
  const koyu = useSyncExternalStore(temaAbone, temaOku, temaSunucu);

  const temaDegistir = useCallback(() => {
    const yeni = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", yeni);
    try {
      localStorage.setItem("tema", yeni ? "koyu" : "acik");
    } catch {
      /* özel sekmede yazılamayabilir */
    }
    temaDinleyiciler.forEach((f) => f());
  }, []);

  async function cikis() {
    try {
      await cagir("/api/auth/logout", { yontem: "POST" });
    } catch {
      /* çerez yine de silinmiş olabilir */
    }
    router.replace("/login");
    router.refresh();
  }

  const aktifMi = (e: Ekran) => (e.yol === "/panel" ? yol === "/panel" : yol.startsWith(e.yol));

  return (
    <div className="min-h-dvh">
      {testVerisi && (
        <div className="bg-amber-500 px-4 py-1 text-center text-xs font-bold uppercase tracking-wider text-white">
          Test verisi — bu ortamdaki kayıtlar örnektir, resmî kayıt değildir
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setMenuAcik((a) => !a)}
            className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-700 lg:hidden"
            aria-label="Menü"
            aria-expanded={menuAcik}
          >
            <span className="block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
          </button>

          <Link href="/panel" className="dokunma-hedefi flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-700 text-sm font-bold text-white">
              İY
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold leading-tight">İzlenebilirlik</span>
              <span className="block truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                İnsitu Yeşil Teknolojiler
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <div className="text-xs font-semibold leading-tight">{kullanici.ad}</div>
              <div className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                {kullanici.rol}
                {kullanici.gorev ? ` · ${kullanici.gorev}` : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={temaDegistir}
              className="rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-label={koyu ? "Açık temaya geç" : "Koyu temaya geç"}
              title={koyu ? "Açık tema" : "Koyu tema"}
            >
              {koyu ? "☀" : "☾"}
            </button>
            <button
              type="button"
              onClick={cikis}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Çıkış
            </button>
          </div>
        </div>
      </header>

      {/* Veri yoğun bir pano için 1280 px dar kalıyordu: 1700 px'lik bir ekranda
          420 px kullanılmadan duruyor ve içerik gereksiz yere sıkışıyordu. */}
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-4">
        <nav
          className={`${
            menuAcik ? "block" : "hidden"
          } fixed inset-x-0 top-[57px] z-30 border-b border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 lg:static lg:block lg:w-56 lg:shrink-0 lg:border-0 lg:bg-transparent lg:p-0 dark:lg:bg-transparent`}
        >
          {/*
            GRUPLU + KATLANABİLİR MENÜ.
            19 madde tek düz listede taranamıyordu, hepsi açık liste ise yan
            sütuna kaydırma çubuğu getiriyordu. Çözüm: gruplar katlanabilir ve
            İÇİNDE BULUNDUĞUNUZ GRUP kendiliğinden açık geliyor.

            Önceki yorumda "akordeon bilerek yok, her seferinde grup açtırmak
            yavaş olur" yazıyordu — o itiraz, aktif grubun otomatik açılmasıyla
            ortadan kalkıyor: günlük işinizde hiçbir şey açmıyorsunuz, yalnızca
            başka bir alana geçerken bir tık ödüyorsunuz. Kararı tarayıcı da
            hatırlıyor (localStorage), yani o tık da bir kez.

            İkonlar etiketin YANINDA: yalnız ikon 19 ekranda tahmin oyunu olur.
          */}
          {/* Gerekirse İNCE kaydırma çubuğu: varsayılan kalın çubuk yan sütunu
              amatör gösteriyordu, hiç kaydırmamak ise uzun menüde alt maddeleri
              erişilemez bırakıyordu. */}
          <ul className="space-y-0.5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:[scrollbar-width:thin] lg:[scrollbar-color:rgb(203_213_225)_transparent]">
            {gruplar.map((g) => {
              const aktifGrup = g.ekranlar.some(aktifMi);
              // Aktif grup ASLA kapanmaz: bulunduğunuz alanın kapalı görünmesi,
              // menüde kendinizi kaybetmenin en kolay yolu.
              const acikMi = g.baslik === null || aktifGrup || !kapaliGruplar.includes(g.baslik);
              return (
                <li key={g.baslik ?? "_ust"}>
                  {g.baslik && (
                    <button
                      type="button"
                      onClick={() => grupDegistir(g.baslik!)}
                      aria-expanded={acikMi}
                      className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-700/50"
                    >
                      <span>{g.baslik}</span>
                      <span className="flex items-center gap-1.5">
                        {/* Kapalı grupta aktif kayıt varsa nokta — hangi grupta
                            olduğunuzu katlıyken de gösteriyor. */}
                        {!acikMi && aktifGrup && (
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-green-600" />
                        )}
                        <svg
                          aria-hidden viewBox="0 0 16 16"
                          className={`h-3 w-3 transition-transform ${acikMi ? "" : "-rotate-90"}`}
                        >
                          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </span>
                    </button>
                  )}
                  {acikMi && (
                    <ul className="space-y-0.5">
                      {g.ekranlar.map((e) => (
                        <li key={e.anahtar}>
                          <Link
                            href={e.yol}
                            // Menü gezinme ANINDA kapanıyor; effect ile kapatmak
                            // hedef sayfa yüklenirken menüyü bir an açık bırakıyordu.
                            onClick={() => setMenuAcik(false)}
                            className={`dokunma-hedefi flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                              aktifMi(e)
                                ? "bg-green-700 text-white"
                                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                            }`}
                          >
                            <Ikon ad={e.ikon} />
                            <span className="min-w-0 truncate">{e.etiket}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/**
 * Menü ikonu — lucide'dan ada göre.
 *
 * Tüm kütüphaneyi tek tek içe aktarmak yerine adla çözülüyor; menü tanımı
 * `yetki.ts`'te ve orada bir React bileşeni tutulamaz (sunucu modülü).
 * Bilinmeyen ad sessizce boş kutu bırakıyor — menü satırı yine hizalı kalsın.
 */
function Ikon({ ad }: { ad?: string }) {
  const Bilesen = ad ? (ikonlar as unknown as Record<string, LucideIcon | undefined>)[ad] : undefined;
  if (!Bilesen) return <span aria-hidden className="h-4 w-4 shrink-0" />;
  return <Bilesen aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />;
}
