import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// GUI tests (test/gui), in Vitest browser mode: they run in Chromium (through Playwright), with the
// app and the engine in the same page.  Engine and gui-logic tests run in Node (vitest.config.ts).
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            "@resources": fileURLToPath(new URL("./resources", import.meta.url)),
        },
    },
    test: {
        include: ["test/gui/**/*.test.ts"],
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
            viewport: { width: 1280, height: 800 },
        },
        testTimeout: 60_000,
    },
});
