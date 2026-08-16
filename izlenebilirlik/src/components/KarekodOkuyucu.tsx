"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Dugme, Uyari } from "./Arayuz";

/**
 * KAMERA İLE KAREKOD OKUMA.
 *
 * ── NEDEN jsQR, NEDEN `BarcodeDetector` DEĞİL ────────────────────────────────
 * Tarayıcının yerleşik `BarcodeDetector` API'si daha hızlı ama iOS Safari'de
 * YOK. Sahada kimin hangi telefonu kullanacağı belli değil ve "bazı
 * telefonlarda çalışmıyor" bir izlenebilirlik sisteminde kabul edilemez.
 * jsQR saf JavaScript; her yerde aynı davranıyor. Tek kod yolu = tek hata
 * yüzeyi.
 *
 * ── ARKA KAMERA ──────────────────────────────────────────────────────────────
 * `facingMode: "environment"` ile arka kamera isteniyor. `exact` KULLANILMIYOR:
 * arka kamerası olmayan bir cihazda `exact` isteği tamamen başarısız olur ve
 * kullanıcı hiç okuyamaz; `ideal` davranışı öndeki kameraya düşmesine izin
 * verir.
 */

type Durum = "kapali" | "aciliyor" | "okuyor" | "hata";

export function KarekodOkuyucu({
  onOkundu,
  etiket = "Kamerayla Okut",
}: {
  /** Her başarılı okumada çağrılır. Aynı kod arka arkaya bildirilmez. */
  onOkundu: (kod: string) => void;
  etiket?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const akisRef = useRef<MediaStream | null>(null);
  const kareRef = useRef<number | null>(null);
  const sonKodRef = useRef<string>("");
  const sonZamanRef = useRef<number>(0);

  const [durum, setDurum] = useState<Durum>("kapali");
  const [hata, setHata] = useState<string>("");
  const [sonOkunan, setSonOkunan] = useState<string>("");

  const kapat = useCallback(() => {
    if (kareRef.current !== null) {
      cancelAnimationFrame(kareRef.current);
      kareRef.current = null;
    }
    // KAMERA IŞIĞI SÖNMELİ. Track'ler durdurulmazsa sekme kapanana kadar
    // kamera açık kalır — kullanıcı gözetlendiğini düşünür, pil biter.
    akisRef.current?.getTracks().forEach((t) => t.stop());
    akisRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setDurum("kapali");
  }, []);

  // Bileşen kaldırıldığında kamera MUTLAKA kapanmalı.
  useEffect(() => kapat, [kapat]);

  // Sayfa arka plana alındığında da kapat — telefonda başka uygulamaya
  // geçildiğinde kameranın açık kalması hem pil hem güven sorunu.
  useEffect(() => {
    const gizlendi = () => {
      if (document.visibilityState === "hidden") kapat();
    };
    document.addEventListener("visibilitychange", gizlendi);
    return () => document.removeEventListener("visibilitychange", gizlendi);
  }, [kapat]);

  /**
   * `onOkundu` bir REF'te tutuluyor.
   *
   * Tarama döngüsü kamera açıldığında bir kez kuruluyor ve kendini
   * `requestAnimationFrame` ile yeniden çağırıyor. Callback doğrudan bağımlılık
   * olsaydı, üst bileşen her render'ında yeni bir fonksiyon ürettiğinde döngü
   * yeniden kurulur — ya kamera takılır ya da iki döngü paralel çalışırdı.
   */
  const onOkunduRef = useRef(onOkundu);
  // Güncelleme RENDER SIRASINDA değil, effect içinde: render sırasında ref
  // yazmak React'in eşzamanlı render'ında yarım kalmış bir render'ın değeri
  // sızdırmasına yol açabiliyor.
  useEffect(() => {
    onOkunduRef.current = onOkundu;
  }, [onOkundu]);

  const taramayiBaslat = useCallback(() => {
    // İç fonksiyon bildirimi: kendini güvenle çağırabiliyor ve hook
    // bağımlılık zincirine girmiyor.
    function adim() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        kareRef.current = requestAnimationFrame(adim);
        return;
      }

      const g = video.videoWidth;
      const y = video.videoHeight;
      if (!g || !y) {
        kareRef.current = requestAnimationFrame(adim);
        return;
      }

      // ÇÖZÜNÜRLÜK SINIRLANIYOR. 4K bir kareyi her animasyon karesinde jsQR'a
      // vermek orta seviye telefonu kilitliyor. 640 px uzun kenar, karekod
      // okumak için fazlasıyla yeterli.
      const olcek = Math.min(1, 640 / Math.max(g, y));
      canvas.width = Math.round(g * olcek);
      canvas.height = Math.round(y * olcek);

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const resim = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const bulunan = jsQR(resim.data, resim.width, resim.height, {
        inversionAttempts: "dontInvert",
      });

      if (bulunan?.data) {
        const kod = bulunan.data;
        const simdi = Date.now();
        // AYNI KODU TEKRAR TEKRAR BİLDİRME. Kamera saniyede ~30 kare okuyor;
        // önlem olmadan tek bir etiket 30 kez "okundu" sayılır ve sevkiyat
        // listesine 30 satır düşerdi. Aynı kod 2 saniye içinde yok sayılıyor.
        if (kod !== sonKodRef.current || simdi - sonZamanRef.current > 2000) {
          sonKodRef.current = kod;
          sonZamanRef.current = simdi;
          setSonOkunan(kod);
          onOkunduRef.current(kod);
          // Titreşim geri bildirimi — gürültülü üretim alanında ekrana
          // bakmadan okuma yapılıyor.
          try {
            navigator.vibrate?.(60);
          } catch {
            /* desteklenmiyor */
          }
        }
      }

      kareRef.current = requestAnimationFrame(adim);
    }

    kareRef.current = requestAnimationFrame(adim);
  }, []);

  const ac = useCallback(async () => {
    setHata("");
    setDurum("aciliyor");

    if (!navigator.mediaDevices?.getUserMedia) {
      setDurum("hata");
      setHata(
        "Bu tarayıcı kamera erişimini desteklemiyor. Kodu elle yazabilir veya USB barkod okuyucu kullanabilirsiniz."
      );
      return;
    }

    try {
      const akis = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      akisRef.current = akis;
      // AKIŞ BURADA BAĞLANMIYOR — `<video>` henüz DOM'da yok.
      //
      // Element yalnızca `durum === "okuyor"` iken render ediliyor; bu satırda
      // durum hâlâ "aciliyor" olduğu için `videoRef.current` null. Eskiden
      // burada `if (videoRef.current)` ile bağlanmaya çalışılıyordu, koşul
      // hep false kalıyor ve `srcObject` hiç kurulmuyordu: kamera açılıyor
      // (ışık yanıyor) ama görüntü siyah kalıyor, tarama da hiç başlamıyordu.
      // Bağlama, element mount olduktan SONRA aşağıdaki effect'te yapılıyor.
      setDurum("okuyor");
    } catch (e) {
      setDurum("hata");
      const ad = (e as Error)?.name;
      // Hata sebebini AYIRT ETMEK gerekiyor: "izin reddedildi" ile "kamera
      // yok" farklı çözümler gerektiriyor ve genel bir mesaj ikisinde de
      // kullanıcıyı çıkmaza sokar.
      if (ad === "NotAllowedError") {
        setHata(
          "Kamera izni verilmedi. Tarayıcı adres çubuğundaki kamera simgesinden izin verip tekrar deneyin."
        );
      } else if (ad === "NotFoundError") {
        setHata("Cihazda kamera bulunamadı. Kodu elle yazabilirsiniz.");
      } else if (ad === "NotReadableError") {
        setHata("Kamera başka bir uygulama tarafından kullanılıyor. O uygulamayı kapatıp tekrar deneyin.");
      } else {
        setHata(`Kamera açılamadı (${ad ?? "bilinmeyen hata"}). Kodu elle yazabilirsiniz.`);
      }
    }
  }, []);

  /**
   * Akışı `<video>`'ya bağla ve taramayı başlat — element MOUNT OLDUKTAN sonra.
   *
   * Bu bir "harici sistemle eşitleme" işi: React state'i ile tarayıcının medya
   * elementi arasında bağ kuruluyor, tam da effect'in var oluş sebebi.
   * `getUserMedia`'nın hemen ardında yapılamıyor çünkü element o an daha
   * render edilmemiş oluyor.
   */
  useEffect(() => {
    if (durum !== "okuyor") return;
    const video = videoRef.current;
    const akis = akisRef.current;
    if (!video || !akis) return;

    let iptal = false;
    video.srcObject = akis;
    // iOS'ta `playsInline` olmadan video tam ekrana geçiyor ve tarama durur.
    video
      .play()
      .then(() => {
        if (!iptal) taramayiBaslat();
      })
      .catch((e) => {
        if (iptal) return;
        setDurum("hata");
        setHata(
          `Kamera görüntüsü başlatılamadı (${(e as Error)?.name ?? "bilinmeyen"}). ` +
            "Kodu elle yazabilirsiniz."
        );
      });

    return () => {
      iptal = true;
      // Döngü de durduruluyor. `iptal` yalnızca HENÜZ BAŞLAMAMIŞ bir döngüyü
      // engelliyor; `play()` temizlikten önce çözülmüşse döngü çoktan
      // kurulmuş olur ve effect yeniden çalıştığında İKİNCİ bir döngü
      // eklenirdi (React geliştirme modunda effect'i bilerek iki kez
      // çalıştırıyor). İki paralel döngü hem boşuna CPU hem de aynı kodun
      // iki kez bildirilmesi demek.
      if (kareRef.current !== null) {
        cancelAnimationFrame(kareRef.current);
        kareRef.current = null;
      }
    };
  }, [durum, taramayiBaslat]);

  return (
    <div className="yazdirma-gizle">
      {durum === "kapali" && (
        <Dugme type="button" cesit="ikincil" onClick={ac}>
          {etiket}
        </Dugme>
      )}

      {durum === "aciliyor" && (
        <Dugme type="button" cesit="ikincil" bekliyor disabled>
          Kamera açılıyor…
        </Dugme>
      )}

      {durum === "hata" && (
        <div>
          <Uyari cesit="uyari" baslik="Kamera kullanılamıyor">
            {hata}
          </Uyari>
          <Dugme type="button" cesit="ikincil" onClick={ac}>
            Tekrar dene
          </Dugme>
        </div>
      )}

      {durum === "okuyor" && (
        <div className="rounded-xl border border-slate-300 bg-black p-2 dark:border-slate-600">
          <div className="relative overflow-hidden rounded-lg">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-auto w-full max-w-md"
              aria-label="Kamera görüntüsü"
            />
            {/* Nişangâh — kullanıcı kodu nereye tutacağını bilsin. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-40 w-40 rounded-lg border-4 border-green-400/80" />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-300">
              {sonOkunan ? `Son okunan: …${sonOkunan.slice(-16)}` : "Karekodu çerçeveye tutun"}
            </span>
            <Dugme type="button" cesit="ikincil" onClick={kapat}>
              Kamerayı kapat
            </Dugme>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
