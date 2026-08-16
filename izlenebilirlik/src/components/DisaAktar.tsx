"use client";

/**
 * CSV dışa aktarma düğmesi.
 *
 * Sunucudan `Content-Disposition: attachment` ile geldiği için tarayıcı
 * indirmeyi kendisi başlatıyor; `fetch` + blob gerekmiyor. Basit bağlantı,
 * JavaScript kapalı olsa bile çalışır.
 */
export function DisaAktar({ tip, etiket = "Excel'e Aktar" }: { tip: string; etiket?: string }) {
  return (
    <a
      href={`/api/disa-aktar?tip=${encodeURIComponent(tip)}`}
      className="dokunma-hedefi yazdirma-gizle inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
      // İndirme dosya adını sunucu belirliyor; buradaki `download` yalnızca
      // tarayıcıya bunun bir indirme olduğunu söylüyor.
      download
    >
      {etiket}
    </a>
  );
}
