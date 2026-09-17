import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Parameters prefixed with _ are kept deliberately: the dummy-data
      // accessors mirror the real endpoint signatures so swapping in fetch
      // touches one file.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The auth layer is a leaf. The app depends on it; it depends on nothing in
    // the app, and nothing in the forecasting backend. That is what keeps it a
    // separate service that happens to be colocated, rather than a folder that
    // slowly grows back into the rest of the codebase.
    //
    // Allowed: node builtins, next, react, and its own siblings. Nothing else.
    files: ["auth/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/app/**",
                "@/components/**",
                "@/lib/**",
                "@/types/**",
                "@/hooks/**",
                "../**",
              ],
              message:
                "auth/ must not import from the app or the forecasting backend. " +
                "Move the shared thing into auth/, or pass it in as an argument.",
            },
          ],
        },
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
