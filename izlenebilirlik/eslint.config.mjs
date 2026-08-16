import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * ESLint yapılandırması — CI kalite kapısının bir parçası (`npm run dogrula`).
 *
 * Kapı ilk günden kırmızıysa kimse bakmaz ve bir süre sonra atlanır; o yüzden
 * yalnızca gerçekten hata olan şeyler hata.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // `araclar/` uygulamanın parçası değil: gerçek kullanıma geçmeden önce bir
  // kez çalıştırılan kurulum betikleri (örnek veri, sıfırlama, şifre
  // sıfırlama). Depoya da girmiyorlar (.gitignore), kapıya da girmiyorlar.
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "data/**",
    "test/**",
    "araclar/**",
    "public/sw.js",
  ]),

  {
    rules: {
      // Turso satırları `any` dönüyor. Okuma yollarında her sorgu için tip
      // yazmak yerine gevşetildi; YAZMA yolları `src/lib/dogrula.ts` ile
      // doğrulanıyor — istemciden gelen değere güvenilmez kuralı orada duruyor.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
