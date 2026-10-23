import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dist-e2e/**",
      "src/generated/**",
      "coverage/**",
      ".local-storage/**",
      "jest.config.js",
      "test/*.js"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "off",
      "no-console": "error"
    }
  },
  {
    files: ["prisma/seed.ts", "scripts/**", "src/main.ts", "test/**"],
    rules: { "no-console": "off" }
  }
);
