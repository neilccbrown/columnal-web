import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// GUI tests (test/gui), in Vitest browser mode: they run in Chromium (through Playwright), with the
// app and the engine in the same page.  Engine and gui-logic tests run in Node (vitest.config.ts).
export default defineConfig({
    plugins: [vue()],
    // The version, for the About dialog:
    define: { __COLUMNAL_VERSION__: JSON.stringify((JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version) },
    resolve: {
        alias: {
            "@resources": fileURLToPath(new URL("./resources", import.meta.url)),
        },
    },
    // Pre-bundled up front: if Vite finds them during a run, it reloads, and can end up with two copies of Vue.
    optimizeDeps: {
        include: ["vue", "reka-ui", "fast-check", "@codemirror/state", "@codemirror/view"],
    },
    test: {
        include: ["test/gui/**/*.test.ts"],
        setupFiles: ["test/gui/setup.ts"],
        browser: {
            enabled: true,
            // (The clipboard permissions are for test/gui/base/clipboard.ts)
            provider: playwright({ contextOptions: { permissions: ["clipboard-read", "clipboard-write"] } }),
            headless: true,
            instances: [{ browser: "chromium" }],
            viewport: { width: 1280, height: 800 },
        },
        testTimeout: 60_000,
        // One file at a time: files run in parallel share the browser's keyboard focus, so one file's
        // typing can land in another's field.
        fileParallelism: false,
    },
});
