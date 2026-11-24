import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    // Generated CLI bundle (rebuild with npm run build:cli).
    "action/dist/**",
    // Staged npm package (npm run pack:cli); it holds a copy of the bundle.
    ".pack/**",
    // The demo film's local, gitignored source project and its vendored minified libraries.
    "video/**",
  ]),
]);

export default eslintConfig;
