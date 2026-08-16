"use client";

import { 
 useState } from "react";
import { 
 useRouter } from "next/navigation";
import {
  AcilirKart, 
  Alan, Bos, Dugme, Girdi, Hucre, Kart, Satir, Secim, Tablo, Uyari,
  cagir, trTarih, useBildirim,
} from "./Arayuz";

const MIN_SIFRE = 12;

export function KullanicilarEkrani({
  kayitlar, benimId, atanabilirRoller, rolEtiketleri,
}: {
  kayitlar: any[];
  benimId: number;
  /**
   * Bu kullanıcının ATAYABİLECEĞİ roller. Sunucuda hesaplanıyor: kimin
   * hangi rolü verebileceği kişinin kendi rolüne ve sistemde admin olup
   * olmamasına bağlı.
   *
   * Listeyi burada üretmek yerine sunucudan almanın sebebi, bu dosyada
   * bir zamanlar `ROL_ETIKETLERI`'nin ELLE KOPYASI durmasıydı: yeni roller
   * eklendiğinde kopya güncellenmedi ve açılır listede hiç görünmediler.
   * Tek kaynak `src/lib/types.ts`.
   */
  atanabilirRoller: string[];
  rolEtiketleri: Record<string, string>;
}) {
  const router = useRouter();
  const bildirim = useBildirim();

  const [ad, setAd] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("");
  const [gorev, setGorev] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState("");
  const [bekliyor, setBekliyor] = useState(false);

  async function ekle(e: React.FormEvent) {
    e.preventDefault();
    setHata("");
    setBekliyor(true);
    try {
      await cagir("/api/kullanicilar", {
        govde: { ad_soyad: ad, email, rol, gorev_kodu: gorev, sifre },
      });
      setAd(""); setEmail(""); setRol(""); setGorev(""); setSifre("");
      bildirim.basari("Kullanıcı oluşturuldu.");
      router.refresh();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekliyor(false);
    }
  }

  async function guncelle(id: number, alan: Record<string, unknown>, onayMetni?: string) {
    if (onayMetni && !confirm(onayMetni)) return;
    try {
      await cagir("/api/kullanicilar", { yontem: "PATCH", govde: { id, ...alan } });
      bildirim.basari("Güncellendi.");
      router.refresh();
    } catch (e) {
      bildirim.hata((e as Error).message);
    }
  }

  async function sifreSifirla(id: number, eposta: string) {
    const yeni = prompt(
      `${eposta} için yeni şifre (en az ${MIN_SIFRE} karakter).\n\n` +
        "Kullanıcının tüm açık oturumları kapanacak."
    );
    if (!yeni) return;
    if (yeni.length < MIN_SIFRE) {
      bildirim.hata(`Şifre en az ${MIN_SIFRE} karakter olmalı.`);
      return;
    }
    await guncelle(id, { sifre: yeni });
  }

  return (
    <>
      <AcilirKart baslik="Yeni Kullanıcı"
        aciklama="Roller GMP görev tanımlarından (GT-01 … GT-06) türetilmiştir. Yetkiler role göre otomatik atanır.">
        <form onSubmit={ekle}>
          {hata && <Uyari cesit="hata">{hata}</Uyari>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Alan etiket="Ad Soyad *">
              <Girdi required value={ad} onChange={(e) => setAd(e.target.value)} />
            </Alan>
            <Alan etiket="E-posta *">
              <Girdi type="email" required autoComplete="off" value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </Alan>
            <Alan etiket="Rol *">
              <Secim required value={rol} onChange={(e) => setRol(e.target.value)}>
                <option value="">Seçiniz</option>
                {atanabilirRoller.map((k) => (
                  <option key={k} value={k}>{rolEtiketleri[k] ?? k}</option>
                ))}
              </Secim>
            </Alan>
            <Alan etiket="Görev Kodu" ipucu="Örn. GT-03">
              <Girdi value={gorev} onChange={(e) => setGorev(e.target.value)} />
            </Alan>
            <Alan etiket="Şifre *" ipucu={`En az ${MIN_SIFRE} karakter`}>
              <Girdi type="password" required minLength={MIN_SIFRE} autoComplete="new-password"
                value={sifre} onChange={(e) => setSifre(e.target.value)} />
            </Alan>
          </div>
          <div className="mt-3 flex justify-end">
            <Dugme type="submit" bekliyor={bekliyor}>Kullanıcı Oluştur</Dugme>
          </div>
        </form>
      </AcilirKart>

      <Kart baslik={`Kullanıcılar (${kayitlar.length})`}>
        <Tablo basliklar={["Ad Soyad", "E-posta", "Rol", "Görev", "Kayıt", "Durum", "İşlem"]}>
          {kayitlar.length === 0 ? (
            <Bos sutun={7}>Kullanıcı yok.</Bos>
          ) : (
            kayitlar.map((u) => {
              const benim = u.id === benimId;
              return (
                <Satir key={u.id}>
                  <Hucre className="font-semibold">
                    {u.ad_soyad}
                    {benim && <span className="ml-1 text-xs text-slate-500">(siz)</span>}
                  </Hucre>
                  <Hucre className="text-xs">{u.email}</Hucre>
                  <Hucre>
                    <Secim
                      value={u.rol}
                      disabled={benim || !atanabilirRoller.includes(u.rol)}
                      onChange={(e) =>
                        guncelle(u.id, { rol: e.target.value },
                          `${u.ad_soyad} kullanıcısının rolü değiştirilecek. Onaylıyor musunuz?`)
                      }
                      className="text-xs"
                    >
                      {/*
                        Kullanıcının MEVCUT rolü atanabilir listede olmayabilir
                        (Mesul Müdür bir admin satırına bakıyorsa). Listede
                        olmayan bir `value`, seçimi boş gösterir — kişinin rolü
                        yokmuş gibi görünürdü.
                      */}
                      {(atanabilirRoller.includes(u.rol) ? atanabilirRoller : [u.rol, ...atanabilirRoller]).map((k) => (
                        <option key={k} value={k}>{rolEtiketleri[k] ?? k}</option>
                      ))}
                    </Secim>
                  </Hucre>
                  <Hucre className="font-mono text-xs">{u.gorev_kodu ?? "—"}</Hucre>
                  <Hucre className="whitespace-nowrap text-xs">{trTarih(u.olusturma_tarihi)}</Hucre>
                  <Hucre>
                    <span className={`text-xs font-bold ${Number(u.aktif) ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                      {Number(u.aktif) ? "AKTİF" : "PASİF"}
                    </span>
                  </Hucre>
                  <Hucre>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => sifreSifirla(u.id, u.email)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
                      >
                        Şifre
                      </button>
                      {!benim && (
                        <button
                          type="button"
                          onClick={() =>
                            guncelle(u.id, { aktif: !Number(u.aktif) },
                              Number(u.aktif)
                                ? `${u.ad_soyad} pasifleştirilecek ve açık oturumları kapanacak. Onaylıyor musunuz?`
                                : `${u.ad_soyad} yeniden aktifleştirilecek. Onaylıyor musunuz?`)
                          }
                          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
                        >
                          {Number(u.aktif) ? "Pasifleştir" : "Aktifleştir"}
                        </button>
                      )}
                    </div>
                  </Hucre>
                </Satir>
              );
            })
          )}
        </Tablo>
      </Kart>

      {bildirim.kutu}
    </>
  );
}
