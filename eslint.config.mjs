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
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/server/db/admin", "@/server/db/admin.ts", "**/db/admin", "**/db/admin.ts"], message: "Use src/server/bookings.ts" }] },
      ],
      // Dynamic import() is not covered by no-restricted-imports.
      "no-restricted-syntax": [
        "error",
        { selector: "ImportExpression[source.value=/db\\/admin/]", message: "Use src/server/bookings.ts" },
        { selector: "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='SUPABASE_SECRET_KEY']", message: "Only src/server/db/admin.ts may read the secret key" },
      ],
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
