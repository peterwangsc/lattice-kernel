import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/*.d.ts"],
  },
  {
    rules: {
      // Allow unused vars prefixed with _
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Allow explicit any in test files and loose-typed schemas
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow non-null assertions (used carefully)
      "@typescript-eslint/no-non-null-assertion": "off",
      // Allow empty functions in stubs/placeholders
      "@typescript-eslint/no-empty-function": "off",
    },
  },
);
