import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url))
});

export default [
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**"]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["apps/api/**/*.ts"],
    rules: {
      "@next/next/no-assign-module-variable": "off",
      "@next/next/no-html-link-for-pages": "off"
    }
  }
];
