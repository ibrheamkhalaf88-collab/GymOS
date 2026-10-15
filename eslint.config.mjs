import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["www/**", "android/**", "_archive/**", "docs/**", "vendor/**", "node_modules/**", "dist/**", "dist-prod/**", ".backup/**", "js/app.js"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node, Chart: "readonly", tailwind: "writable", XLSX: "readonly" },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      eqeqeq: ["warn", "smart"],
      "no-eval": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-control-regex": "off",
      "no-useless-assignment": "off",
      "no-implied-eval": "error",
    },
  },
];