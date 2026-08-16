/**
 * YETKİ — rol, ekran ve eylem çözümlemesi.
 *
 * Bu testlerin koruduğu şey tek cümleyle: KİMSE YAPAMAYACAĞI İŞİ YAPAMASIN.
 * Yetki artık üç katmandan çözülüyor (kişisel → rolün düzenlenmiş ayarı →
 * koddaki GMP varsayılanı) ve katman sırasının sessizce bozulması, ekranda
 * hiçbir belirti vermeden yetki genişlemesine yol açar.
 */
import assert from "node:assert/strict";
import {
  EKRANLAR, EYLEMLER, KILITLI_EYLEMLER,
  ekranGorunur, eylemYetkili, eylemVarsayilani, eylemKilitliMi,
  gorunurEkranlar, ilkGorunurEkran, adminMi, rolAtayabilir, EKRAN_GRUPLARI,
} from "../../src/lib/yetki.ts";
import { ROLLER, ROL_ETIKETLERI, rolGecerli } from "../../src/lib/types.ts";
import { rolTablosu, sapmaHaritasi } from "../../src/lib/rolTablosu.ts";

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

const kul = (rol, ek = {}) => ({
  id: 1, ad_soyad: "Test", email: "t@t.com", rol, gorev_kodu: null,
  ekran_izinleri: {}, rol_ekran_izinleri: {}, rol_eylem_izinleri: {}, ...ek,
});

// ── Roller ──────────────────────────────────────────────────────────────────

t("her rolün ekran etiketi var", () => {
  for (const r of ROLLER) assert.ok(ROL_ETIKETLERI[r], `${r} etiketsiz`);
});

t("rolGecerli yalnızca tanımlı rolleri kabul ediyor", () => {
  for (const r of ROLLER) assert.equal(rolGecerli(r), true);
  for (const y of ["", null, undefined, "sef", "ADMIN", 1, {}]) {
    assert.equal(rolGecerli(y), false, `${JSON.stringify(y)} kabul edildi`);
  }
});

// ── Admin ───────────────────────────────────────────────────────────────────

t("admin HER ekranı ve HER eylemi yapar", () => {
  const a = kul("admin");
  for (const e of EKRANLAR) assert.equal(ekranGorunur(a, e), true, `${e} kapalı`);
  for (const e of EYLEMLER) assert.equal(eylemYetkili(a, e), true, `${e} kapalı`);
  assert.equal(adminMi(a), true);
});

t("admin yetkisi rol ayarıyla KISITLANAMAZ — kilitlenme emniyeti", () => {
  const kapali = {};
  for (const e of EKRANLAR) kapali[e] = false;
  const eylemKapali = {};
  for (const e of EYLEMLER) eylemKapali[e] = false;

  const a = kul("admin", { rol_ekran_izinleri: kapali, rol_eylem_izinleri: eylemKapali });
  for (const e of EKRANLAR) assert.equal(ekranGorunur(a, e), true, `${e} kapatılabildi`);
  for (const e of EYLEMLER) assert.equal(eylemYetkili(a, e), true, `${e} kapatılabildi`);
});

t("admin kişisel izinle de kısıtlanamaz", () => {
  const a = kul("admin", { ekran_izinleri: { uretim: false, roller: false } });
  assert.equal(ekranGorunur(a, "uretim"), true);
  assert.equal(ekranGorunur(a, "roller"), true);
});

// ── Yönetici ────────────────────────────────────────────────────────────────

t("yönetici rol yetkilerini düzenleyebilir, Mesul Müdür EDEMEZ", () => {
  assert.equal(eylemYetkili(kul("yonetici"), "rol_yonet"), true);
  assert.equal(eylemYetkili(kul("mesul_mudur"), "rol_yonet"), false);
  assert.equal(eylemYetkili(kul("kg_kk"), "rol_yonet"), false);
  assert.equal(eylemYetkili(kul("depo"), "rol_yonet"), false);
});

t("Roller ekranını yalnızca admin ve yönetici görür", () => {
  assert.equal(ekranGorunur(kul("admin"), "roller"), true);
  assert.equal(ekranGorunur(kul("yonetici"), "roller"), true);
  for (const r of ["mesul_mudur", "kg_kk", "uretim", "depo", "okuyucu"]) {
    assert.equal(ekranGorunur(kul(r), "roller"), false, `${r} Roller ekranını görüyor`);
  }
});

// ── Katman sırası ───────────────────────────────────────────────────────────

t("kişisel izin rol ayarını EZER", () => {
  const k = kul("depo", {
    rol_ekran_izinleri: { uretim: false },
    ekran_izinleri: { uretim: true },
  });
  assert.equal(ekranGorunur(k, "uretim"), true);
});

t("rol ayarı koddaki varsayılanı EZER — hem açar hem kapatır", () => {
  // Varsayılanda depo "uretim" ekranını görmüyor; rol ayarıyla açılıyor.
  assert.equal(ekranGorunur(kul("depo"), "uretim"), false);
  assert.equal(ekranGorunur(kul("depo", { rol_ekran_izinleri: { uretim: true } }), "uretim"), true);

  // Varsayılanda depo "sevkiyat" görüyor; rol ayarıyla kapatılıyor.
  assert.equal(ekranGorunur(kul("depo"), "sevkiyat"), true);
  assert.equal(
    ekranGorunur(kul("depo", { rol_ekran_izinleri: { sevkiyat: false } }), "sevkiyat"),
    false
  );
});

t("kayıt olmayan ekranda GMP varsayılanına düşülüyor", () => {
  const k = kul("uretim", { rol_ekran_izinleri: { sapma: false } });
  assert.equal(ekranGorunur(k, "sapma"), false, "düzenlenen ayar uygulanmadı");
  assert.equal(ekranGorunur(k, "uretim"), true, "düzenlenmemiş ekran varsayılanı kaybetti");
});

t("eylem yetkisi rol ayarıyla açılıp kapanıyor", () => {
  assert.equal(eylemYetkili(kul("uretim"), "sevk_yaz"), false);
  assert.equal(
    eylemYetkili(kul("uretim", { rol_eylem_izinleri: { sevk_yaz: true } }), "sevk_yaz"),
    true
  );
  assert.equal(
    eylemYetkili(kul("depo", { rol_eylem_izinleri: { sevk_yaz: false } }), "sevk_yaz"),
    false
  );
});

// ── Mevzuatla kilitli eylemler ──────────────────────────────────────────────

t("seri serbest bırakma ve geri çekme rol ayarıyla AÇILAMAZ", () => {
  for (const eylem of KILITLI_EYLEMLER) {
    for (const rol of ["kg_kk", "uretim", "depo"]) {
      const k = kul(rol, { rol_eylem_izinleri: { [eylem]: true } });
      assert.equal(
        eylemYetkili(k, eylem),
        false,
        `${rol} rolüne ${eylem} açılabildi — mevzuat kilidi delindi`
      );
    }
  }
});

t("kilitli eylem Mesul Müdür'den de rol ayarıyla ALINAMAZ", () => {
  for (const eylem of KILITLI_EYLEMLER) {
    const k = kul("mesul_mudur", { rol_eylem_izinleri: { [eylem]: false } });
    assert.equal(eylemYetkili(k, eylem), true, `${eylem} Mesul Müdür'den alınabildi`);
  }
});

t("kilitli eylemler koddaki varsayılanda Mesul Müdür'de", () => {
  for (const eylem of KILITLI_EYLEMLER) {
    assert.equal(eylemKilitliMi(eylem), true);
    assert.equal(eylemVarsayilani("mesul_mudur", eylem), true, `${eylem} Mesul Müdür'de değil`);
    assert.equal(eylemVarsayilani("depo", eylem), false, `${eylem} depoda olmamalı`);
  }
});

// ── Okuyucu ─────────────────────────────────────────────────────────────────

t("okuyucu HİÇBİR eylemi yapamaz — rol ayarıyla bile", () => {
  const hepsiAcik = {};
  for (const e of EYLEMLER) hepsiAcik[e] = true;
  const o = kul("okuyucu", { rol_eylem_izinleri: hepsiAcik });
  for (const e of EYLEMLER) {
    assert.equal(eylemYetkili(o, e), false, `okuyucuya ${e} açılabildi`);
  }
});

t("okuyucu ekran görebilir — denetçi bakabilmeli", () => {
  assert.equal(ekranGorunur(kul("okuyucu"), "izleme"), true);
  assert.equal(ekranGorunur(kul("okuyucu"), "sifre"), true);
});

t("toplu veri dışa aktarma salt ekran okumasından ayrı yetkidir", () => {
  assert.equal(ekranGorunur(kul("okuyucu"), "sapma"), true);
  assert.equal(eylemYetkili(kul("okuyucu"), "disa_aktar"), false);
  assert.equal(eylemYetkili(kul("depo"), "disa_aktar"), true);
  assert.equal(
    eylemYetkili(kul("depo", { rol_eylem_izinleri: { disa_aktar: false } }), "disa_aktar"),
    false
  );
});

// ── Oturum açılışı ──────────────────────────────────────────────────────────

t("hiç ekranı olmayan kullanıcı sonsuz yönlendirmeye girmiyor", () => {
  const kapali = {};
  for (const e of EKRANLAR) kapali[e] = false;
  const k = kul("depo", { ekran_izinleri: kapali });
  assert.deepEqual(gorunurEkranlar(k), []);
  assert.equal(ilkGorunurEkran(k), "/login");
});

t("her rol giriş yapınca bir ekrana düşüyor", () => {
  for (const r of ROLLER) {
    const hedef = ilkGorunurEkran(kul(r));
    assert.notEqual(hedef, "/login", `${r} hiçbir ekran göremiyor`);
    assert.ok(hedef.startsWith("/panel"), `${r} → ${hedef}`);
  }
});

t("oturum yoksa hiçbir şey görünmüyor", () => {
  for (const e of EKRANLAR) assert.equal(ekranGorunur(null, e), false);
  for (const e of EYLEMLER) assert.equal(eylemYetkili(null, e), false);
  assert.equal(adminMi(null), false);
});

// ── Rol tablosu (Roller ekranının gördüğü veri) ─────────────────────────────

t("admin tam yetkili görünüyor ve SAPMA sayılmıyor", () => {
  const a = rolTablosu({}).find((r) => r.rol === "admin");
  assert.equal(a.duzenlenebilir, false);
  for (const s of [...a.ekranlar, ...a.eylemler]) {
    assert.equal(s.deger, true, `${s.anahtar} kapalı görünüyor`);
    assert.equal(s.kilitli, true, `${s.anahtar} düzenlenebilir görünüyor`);
    // Admin'in varsayılanı ZATEN tam yetki; sapma rozeti çıkmamalı.
    assert.equal(s.sapmaVar, false, `${s.anahtar} sapma olarak işaretlendi`);
  }
});

t("okuyucunun hiçbir işlemi açık değil ve sapma göstermiyor", () => {
  const o = rolTablosu({}).find((r) => r.rol === "okuyucu");
  for (const s of o.eylemler) {
    assert.equal(s.deger, false, `${s.anahtar} açık`);
    assert.equal(s.kilitli, true);
    assert.equal(s.sapmaVar, false);
  }
});

t("hiç sapma kaydı yokken hiçbir rolde sapma rozeti çıkmıyor", () => {
  for (const r of rolTablosu({})) {
    const n = [...r.ekranlar, ...r.eylemler].filter((s) => s.sapmaVar).length;
    assert.equal(n, 0, `${r.rol} rolünde ${n} sapma göründü`);
  }
});

t("kaydedilmiş sapma tabloda işaretleniyor", () => {
  const tablo = rolTablosu({ depo: { EKRAN: { uretim: true } } });
  const depo = tablo.find((r) => r.rol === "depo");
  const satir = depo.ekranlar.find((s) => s.anahtar === "uretim");
  assert.equal(satir.deger, true);
  assert.equal(satir.varsayilan, false);
  assert.equal(satir.sapmaVar, true);
});

t("mevzuat kilitli eylem tabloda kilitli ve sapma kaydı YOK SAYILIYOR", () => {
  // Veritabanına elle bir sapma girilse bile tabloda varsayılan görünmeli.
  const tablo = rolTablosu({ depo: { EYLEM: { seri_serbest: true } } });
  const depo = tablo.find((r) => r.rol === "depo");
  const satir = depo.eylemler.find((s) => s.anahtar === "seri_serbest");
  assert.equal(satir.kilitli, true);
  assert.equal(satir.deger, false, "kilitli eylem elle açılabildi");
  assert.equal(satir.sapmaVar, false);
});

t("sapmaHaritasi veritabanı satırlarını doğru çeviriyor", () => {
  const h = sapmaHaritasi([
    { rol: "depo", tur: "EKRAN", anahtar: "uretim", izin: 1 },
    { rol: "depo", tur: "EYLEM", anahtar: "sevk_yaz", izin: 0 },
  ]);
  assert.equal(h.depo.EKRAN.uretim, true);
  assert.equal(h.depo.EYLEM.sevk_yaz, false);
});

// ── Rol atama ve ilk kurulum istisnası ──────────────────────────────────────

t("admin varken sadece admin, admin rolü atayabilir", () => {
  assert.equal(rolAtayabilir("admin", "admin", false), true);
  for (const r of ["yonetici", "mesul_mudur", "kg_kk", "uretim", "depo", "okuyucu"]) {
    assert.equal(rolAtayabilir(r, "admin", false), false, `${r} admin atayabildi`);
  }
});

t("admin varken yönetici rolünü admin veya yönetici atar", () => {
  assert.equal(rolAtayabilir("admin", "yonetici", false), true);
  assert.equal(rolAtayabilir("yonetici", "yonetici", false), true);
  for (const r of ["mesul_mudur", "kg_kk", "uretim", "depo"]) {
    assert.equal(rolAtayabilir(r, "yonetici", false), false, `${r} yönetici atayabildi`);
  }
});

t("sıradan roller herkese açık — kilit yalnızca admin ve yöneticide", () => {
  for (const r of ROLLER) {
    for (const hedef of ["mesul_mudur", "kg_kk", "uretim", "depo", "okuyucu"]) {
      assert.equal(rolAtayabilir(r, hedef, false), true, `${r} → ${hedef} engellendi`);
    }
  }
});

t("İLK KURULUM: hiç admin yokken ilk admin atanabiliyor", () => {
  // Yumurta-tavuk: admin yoksa admin'i kimse açamaz. O anda en yetkili rol
  // zaten Mesul Müdür ve tüm kullanıcıları yönetebiliyor — sahip olmadığı bir
  // yetkiyi kendine vermiş olmuyor.
  assert.equal(rolAtayabilir("mesul_mudur", "admin", true), true);
  assert.equal(rolAtayabilir("mesul_mudur", "yonetici", true), true);
});

t("İLK KURULUM istisnası admin var olduğu anda KAPANIYOR", () => {
  assert.equal(rolAtayabilir("mesul_mudur", "admin", false), false);
  assert.equal(rolAtayabilir("yonetici", "admin", false), false);
});

t("admin bütün rolleri atayabiliyor — açılır listede eksik rol kalmasın", () => {
  // Bu testin sebebi gerçek bir kusur: Kullanıcılar ekranı `ROL_ETIKETLERI`
  // yerine kendi ELLE KOPYA listesini tutuyordu ve yeni roller eklendiğinde
  // güncellenmedi. Açılır listede Admin ve Yönetici hiç görünmedi. Liste
  // artık sunucuda `rolAtayabilir` ile üretiliyor.
  const liste = ROLLER.filter((r) => rolAtayabilir("admin", r, false));
  assert.deepEqual(liste, [...ROLLER], "admin bir rolü atayamıyor");
});

t("Mesul Müdür admin varken o iki rolü listede görmüyor", () => {
  const liste = ROLLER.filter((r) => rolAtayabilir("mesul_mudur", r, false));
  assert.ok(!liste.includes("admin"));
  assert.ok(!liste.includes("yonetici"));
  assert.equal(liste.length, ROLLER.length - 2);
});

t("Mesul Müdür ilk kurulumda TÜM rolleri görüyor", () => {
  const liste = ROLLER.filter((r) => rolAtayabilir("mesul_mudur", r, true));
  assert.deepEqual(liste, [...ROLLER]);
});

t("her ekran TAM BİR menü grubunda — kaybolan/çiftlenen ekran yok", () => {
  const gruplarda = EKRAN_GRUPLARI.flatMap((g) => g.ekranlar);
  assert.deepEqual(
    [...gruplarda].sort(),
    [...EKRANLAR].sort(),
    "gruplar EKRANLAR ile birebir örtüşmüyor"
  );
  assert.equal(new Set(gruplarda).size, gruplarda.length, "bir ekran iki grupta");
});

console.log(`✓ yetki — ${gecen} test geçti`);
