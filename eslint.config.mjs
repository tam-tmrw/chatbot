import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "coverage/**",
      // Stray git worktree with its own node_modules. Never the source of truth;
      // linting it used to add ~232 errors nobody could act on.
      ".worktrees/**",
      // Agent tooling artifacts, not application code.
      "graphify-out/**",
      ".superpowers/**",
      ".cursor/**",
    ],
  },
];

export default eslintConfig;
