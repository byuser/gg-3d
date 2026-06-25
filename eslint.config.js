import js from "@eslint/js";
import globals from "globals";

// Flat ESLint config. The game runs in the browser against a CDN `BABYLON`
// global and is driven, in tests, by hand-built Babylon/DOM stubs. We keep the
// rules pragmatic (this is a large, additive game codebase) but enforce the one
// rule that makes the module split safe: `no-undef` — a missed import across a
// module boundary becomes a hard error.
export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js", "*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        BABYLON: "readonly",
        // Google Identity Services, loaded on demand for the opt-in Drive cloud
        // saves (Task 15). Always feature-detected before use; never required to
        // boot or run the game.
        google: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": [
        "warn",
        {
          args: "none",
          caughtErrors: "none",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-cond-assign": ["error", "except-parens"],
      "no-constant-condition": ["error", { checkLoops: false }],
    },
  },
  {
    files: ["test/**/*.js", "*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
        BABYLON: "writable",
      },
    },
    rules: {
      "no-unused-vars": "off",
      "no-empty": "off",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "js/**",
      "playwright-report/**",
      "test-results/**",
      // Agent tooling, not app code: `.claude/workflows/*.js` run inside the
      // Workflow runtime's async wrapper (top-level await/return + injected
      // globals like agent()/phase()), so they don't parse as standalone modules.
      ".claude/**",
    ],
  },
];
