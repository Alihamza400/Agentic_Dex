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

    // Extend recommended ESLint + React + Hooks rules
    extends: [
      js.configs.recommended,
      react.configs.recommended,             // ⬅ Added
      reactHooks.configs.flat.recommended,
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
        version: "detect", // ⬅ auto-detect React version
      },
    },

    rules: {
      // Your existing rule
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],

      // Recommended React upgrade rules
      "react/jsx-uses-react": "off", // Not needed for new JSX transform
      "react/react-in-jsx-scope": "off",

      // Improve import safety
      "no-undef": "error",
    },
  },
]);
