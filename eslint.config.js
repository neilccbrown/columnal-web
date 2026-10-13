import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
    {
        ignores: [
            "dist/**",
            "node_modules/**",
            "reference/**",
            "src/engine/parsers/generated/**",
            "playwright-report/**",
            "test-results/**",
        ],
    },
    js.configs.recommended,
    tseslint.configs.recommended,
    pluginVue.configs["flat/recommended"],
    {
        files: ["**/*.vue"],
        languageOptions: { parserOptions: { parser: tseslint.parser } },
    },
    {
        languageOptions: { globals: globals.browser },
    },
    {
        files: ["scripts/**", "test/**", "*.config.*"],
        languageOptions: { globals: globals.node },
    },
    {
        files: ["**/*.cjs"],
        languageOptions: { sourceType: "commonjs", globals: globals.node },
    },
    {
        rules: {
            // Java enums with static methods are ported as an enum merged with a namespace (docs/CONVENTIONS.md).
            "@typescript-eslint/no-namespace": "off",
            // Ported overrides often keep Java's unused parameters; prefix them with _ to mark that.
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
        },
    },
);
