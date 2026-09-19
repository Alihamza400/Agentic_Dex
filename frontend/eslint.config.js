import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Ignore build output
  globalIgnores(["dist", "node_modules"]),

  {
    files: ["**/*.{js,jsx}"],

    // The plugins expose their flat configs under `configs.flat` /
    // `recommended-latest`; the legacy `.configs.recommended` entries are eslintrc
    // style and break flat config.
    extends: [
      js.configs.recommended,
      react.configs.flat.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",

      globals: {
        ...globals.browser,
        ...globals.node,
      },

      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },

    settings: {
      react: {
        version: "detect",
      },
    },

    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
      // Decoding third-party contract logs/events legitimately needs empty catches
      "no-empty": ["error", { allowEmptyCatch: true }],

      // Not needed with the automatic JSX runtime
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unescaped-entities": "off",
      "react/prop-types": "off",
    },
  },

  {
    // Context modules intentionally export both the context object and the provider
    files: ["src/context/**/*.jsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);
