import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The secret-key client bypasses RLS: only the bookings data-access module may use it.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/bookings.ts", "src/server/db/admin.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/server/db/admin", "**/db/admin"], message: "Use src/server/bookings.ts" }] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
