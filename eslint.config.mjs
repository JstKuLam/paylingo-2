import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import shadcn from "@shadcn/lint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      shadcn,
    },
    rules: {
      "shadcn/no-restyle": ["warn", { allow: ["layout"] }],
      "shadcn/no-arbitrary-values": "warn",
      "shadcn/no-raw-colors": "warn",
      "shadcn/no-unknown-classes": "warn",
    },
  },
  // Allow UI component implementations to style themselves
  {
    files: ["src/components/ui/**"],
    rules: {
      "shadcn/no-restyle": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "output/**",
    "paylingo-mobile/**/build/**",
    "scratch/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
