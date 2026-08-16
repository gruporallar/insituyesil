import test from "node:test";
import assert from "node:assert/strict";
import {
  ekCozumle, imzaTani, ekKaynagiGecerli, mb,
  EK_AZAMI_BAYT, EK_KAYNAKLARI,
} from "../../src/lib/ek.ts";

const b64 = (bytes) => Buffer.from(Uint8Array.from(bytes)).toString("base64");
const url = (mime, bytes) => `data:${mime};base64,${b64(bytes)}`;

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

test("geçerli JPEG / PNG / WebP kabul edilir", () => {
  for (const [mime, bytes] of [["image/jpeg", JPEG], ["image/png", PNG], ["image/webp", WEBP]]) {
    const r = ekCozumle(url(mime, bytes));
    assert.ok(r.tamam, `${mime} reddedildi: ${r.hata}`);
    assert.equal(r.ek.mime, mime);
    assert.equal(r.ek.boyut, bytes.length);
  }
});

test("uzantı yalanı yakalanır — içerik JPEG değilken image/jpeg denemez", () => {
  const r = ekCozumle(url("image/jpeg", PNG));
  assert.equal(r.tamam, false);
  assert.match(r.hata, /uyuşmuyor/);
});

test("resim olmayan içerik reddedilir", () => {
  const r = ekCozumle(url("image/png", [0x25, 0x50, 0x44, 0x46, 0x2d])); // %PDF-
  assert.equal(r.tamam, false);
});

test("izin verilmeyen mime tipi reddedilir", () => {
  for (const m of ["application/pdf", "text/html", "image/svg+xml", "application/octet-stream"]) {
    const r = ekCozumle(url(m, JPEG));
    assert.equal(r.tamam, false, `${m} kabul edildi`);
  }
});

test("SVG kabul edilmez — içinde betik taşıyabilir", () => {
  const r = ekCozumle(url("image/svg+xml", [0x3c, 0x73, 0x76, 0x67]));
  assert.equal(r.tamam, false);
});

test("boyut sınırı uygulanır ve sınırın kendisi geçer", () => {
  const tam = ekCozumle(url("image/jpeg", [...JPEG, ...new Array(EK_AZAMI_BAYT - JPEG.length).fill(0)]));
  assert.ok(tam.tamam, "tam sınırdaki dosya reddedildi");

  const asan = ekCozumle(url("image/jpeg", [...JPEG, ...new Array(EK_AZAMI_BAYT).fill(0)]));
  assert.equal(asan.tamam, false);
  assert.match(asan.hata, /çok büyük/);
});

test("boş ve bozuk girdiler güvenle reddedilir", () => {
  for (const g of ["", "   ", null, undefined, 42, {}, [], "merhaba", "data:image/jpeg;base64,"]) {
    const r = ekCozumle(g);
    assert.equal(r.tamam, false, `${JSON.stringify(g)} kabul edildi`);
    assert.ok(r.hata.length > 0);
  }
});

test("base64 içindeki satır sonları sorun çıkarmaz", () => {
  const ham = b64(JPEG);
  const bolunmus = ham.slice(0, 4) + "\n" + ham.slice(4);
  const r = ekCozumle(`data:image/jpeg;base64,${bolunmus}`);
  assert.ok(r.tamam);
  assert.equal(r.ek.boyut, JPEG.length);
});

test("imzaTani kısa girdilerde patlamaz", () => {
  for (const n of [0, 1, 2, 3, 7, 11]) {
    assert.doesNotThrow(() => imzaTani(new Uint8Array(n)));
  }
});

test("kaynak tipi beyaz listeye bağlı", () => {
  for (const k of EK_KAYNAKLARI) assert.ok(ekKaynagiGecerli(k));
  for (const k of ["KULLANICI", "", null, "hammadde", "SATIS"]) {
    assert.equal(ekKaynagiGecerli(k), false, `${k} kabul edildi`);
  }
});

test("MB biçimi Türkçe ondalık ayırıcı kullanır", () => {
  assert.equal(mb(1_500_000), "1,5");
  assert.equal(mb(0), "0,0");
});
