import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

const appImportRestrictions = [
  {
    group: ["@sidewalk/api", "@sidewalk/api/**", "**/apps/api/**"],
    message: "Do not import from apps/api; use shared packages or HTTP/API contracts."
  },
  {
    group: ["@sidewalk/web", "@sidewalk/web/**", "**/apps/web/**"],
    message: "Do not import from apps/web; apps must not depend on other apps."
  },
  {
    group: ["@sidewalk/mobile", "@sidewalk/mobile/**", "**/apps/mobile/**"],
    message: "Do not import from apps/mobile; apps must not depend on other apps."
  }
];

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  },
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: appImportRestrictions.filter(
            (p) => !p.group.some((g) => g.includes("apps/web"))
          )
        }
      ]
    }
  },
  {
    files: ["apps/mobile/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: appImportRestrictions.filter(
            (p) => !p.group.some((g) => g.includes("apps/mobile"))
          )
        }
      ]
    }
  },
  {
    files: ["packages/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: appImportRestrictions
        }
      ]
    }
  },
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/.expo/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/generated/**"
    ]
  }
);
