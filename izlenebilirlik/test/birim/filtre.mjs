/**
 * LİSTE FİLTRESİ — birim testleri.
 *
 * Bu kod SQL koşulu üretiyor; parametrelerin sırası ve sayısı koşuldaki `?`
 * sayısıyla birebir tutmalı. Tutmazsa sorgu ya patlar ya da YANLIŞ SATIRLARI
 * döndürür — ikincisi bir izlenebilirlik sisteminde çok daha tehlikeli.
 */
import assert from "node:assert/strict";
import {
  filtreOku,
  filtreDerle,
  sayfaOzeti,
  filtreVarMi,
  VARSAYILAN_BOYUT,
} from "../../src/lib/filtre.ts";

let gecen = 0;
function t(ad, fn) {
  try {
    fn();
    gecen++;
  } catch (e) {
    console.error(`✗ ${ad}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

/** Koşuldaki `?` sayısı ile parametre sayısı eşit mi? */
function parametreSayisiTutuyor(d) {
  return (d.kosul.match(/\?/g) || []).length === d.parametreler.length;
}

// ── Okuma ve temizleme ───────────────────────────────────────────────────────

t("boş searchParams varsayılanları verir", () => {
  const f = filtreOku({});
  assert.equal(f.q, "");
  assert.equal(f.sayfa, 1);
  assert.equal(f.boyut, VARSAYILAN_BOYUT);
  assert.equal(filtreVarMi(f), false);
});

t("geçersiz sayfa numarası 1'e düşer", () => {
  // Adres çubuğu elle düzenlenebilir; negatif OFFSET anlamsız sorgu üretir.
  assert.equal(filtreOku({ sayfa: "-5" }).sayfa, 1);
  assert.equal(filtreOku({ sayfa: "abc" }).sayfa, 1);
  assert.equal(filtreOku({ sayfa: "0" }).sayfa, 1);
});

t("sayfa boyutu üst sınırla kısıtlanır", () => {
  // Sınırsız boyut, sayfalamanın kendisini anlamsız kılardı.
  assert.equal(filtreOku({ boyut: "999999" }).boyut, 500);
  assert.equal(filtreOku({ boyut: "25" }).boyut, 25);
});

t("geçersiz tarih yok sayılır", () => {
  assert.equal(filtreOku({ baslangic: "14.08.2026" }).baslangic, "");
  assert.equal(filtreOku({ baslangic: "2026-08-14" }).baslangic, "2026-08-14");
});

t("dizi olarak gelen parametrenin ilki alınır", () => {
  // Aynı anahtar iki kez verilirse Next dizi döndürür.
  assert.equal(filtreOku({ q: ["ilk", "ikinci"] }).q, "ilk");
});

t("arama metni kırpılır ve sınırlanır", () => {
  assert.equal(filtreOku({ q: "  ara  " }).q, "ara");
  assert.equal(filtreOku({ q: "x".repeat(500) }).q.length, 120);
});

// ── Derleme ──────────────────────────────────────────────────────────────────

t("filtresiz koşul her satırı seçer", () => {
  const d = filtreDerle(filtreOku({}), { aramaKolonlari: ["a"], tarihKolonu: "t" });
  assert.equal(d.kosul, "1=1");
  assert.deepEqual(d.parametreler, []);
  assert.equal(d.offset, 0);
});

t("arama tüm kolonlara OR ile uygulanır", () => {
  const d = filtreDerle(filtreOku({ q: "abc" }), { aramaKolonlari: ["a", "b", "c"] });
  assert.equal(d.kosul, "(a LIKE ? OR b LIKE ? OR c LIKE ?)");
  assert.deepEqual(d.parametreler, ["%abc%", "%abc%", "%abc%"]);
  assert.ok(parametreSayisiTutuyor(d));
});

t("tarih aralığı ve statü birlikte uygulanır", () => {
  const d = filtreDerle(
    filtreOku({ q: "x", baslangic: "2026-01-01", bitis: "2026-12-31", statu: "SERBEST" }),
    { aramaKolonlari: ["kod"], tarihKolonu: "tarih", statuKolonu: "statu" }
  );
  assert.equal(d.kosul, "(kod LIKE ?) AND tarih >= ? AND tarih <= ? AND statu = ?");
  assert.deepEqual(d.parametreler, ["%x%", "2026-01-01", "2026-12-31", "SERBEST"]);
  assert.ok(parametreSayisiTutuyor(d));
});

t("yalnızca başlangıç verilince tek koşul üretilir", () => {
  const d = filtreDerle(filtreOku({ baslangic: "2026-05-01" }), { tarihKolonu: "t" });
  assert.equal(d.kosul, "t >= ?");
  assert.ok(parametreSayisiTutuyor(d));
});

t("tanımlanmamış kolon için filtre üretilmez", () => {
  // Statü kolonu tanımlı değilse statü parametresi sessizce yok sayılmalı;
  // aksi halde geçersiz SQL üretilirdi.
  const d = filtreDerle(filtreOku({ statu: "SERBEST" }), { aramaKolonlari: ["a"] });
  assert.equal(d.kosul, "1=1");
  assert.deepEqual(d.parametreler, []);
});

t("kullanıcı girdisi SQL metnine YAZILMAZ", () => {
  const kotu = "'; DROP TABLE paketler; --";
  const d = filtreDerle(filtreOku({ q: kotu }), { aramaKolonlari: ["kod"] });
  assert.ok(!d.kosul.includes("DROP"), "girdi SQL metnine sızmış");
  assert.ok(!d.kosul.includes("'"), "girdi SQL metnine sızmış");
  assert.equal(d.parametreler[0], `%${kotu}%`);
});

t("offset sayfaya göre hesaplanır", () => {
  assert.equal(filtreDerle(filtreOku({ sayfa: "1", boyut: "50" }), {}).offset, 0);
  assert.equal(filtreDerle(filtreOku({ sayfa: "3", boyut: "50" }), {}).offset, 100);
  assert.equal(filtreDerle(filtreOku({ sayfa: "2", boyut: "25" }), {}).limit, 25);
});

// ── Sayfa özeti ──────────────────────────────────────────────────────────────

t("sayfa özeti doğru aralık verir", () => {
  const f = filtreOku({ sayfa: "3", boyut: "50" });
  const o = sayfaOzeti(1234, f);
  assert.equal(o.ilk, 101);
  assert.equal(o.son, 150);
  assert.equal(o.toplamSayfa, 25);
});

t("son sayfada aralık toplamı aşmaz", () => {
  const o = sayfaOzeti(120, filtreOku({ sayfa: "3", boyut: "50" }));
  assert.equal(o.ilk, 101);
  assert.equal(o.son, 120);
});

t("boş sonuçta aralık sıfır", () => {
  const o = sayfaOzeti(0, filtreOku({}));
  assert.equal(o.ilk, 0);
  assert.equal(o.son, 0);
  assert.equal(o.toplamSayfa, 1, "toplam sayfa en az 1 olmalı — 0/0 gösterilmemeli");
});

t("filtre varlığı doğru tespit edilir", () => {
  assert.equal(filtreVarMi(filtreOku({ sayfa: "2" })), false, "sayfa değişimi filtre değildir");
  assert.equal(filtreVarMi(filtreOku({ q: "x" })), true);
  assert.equal(filtreVarMi(filtreOku({ statu: "RET" })), true);
  assert.equal(filtreVarMi(filtreOku({ bitis: "2026-01-01" })), true);
});

console.log(`✓ filtre — ${gecen} test geçti`);
