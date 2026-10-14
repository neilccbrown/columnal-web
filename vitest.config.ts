import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Engine (non-GUI) tests, run in Node.  GUI tests use Playwright (playwright.config.ts).
export default defineConfig({
    resolve: {
        alias: {
            "@resources": fileURLToPath(new URL("./resources", import.meta.url)),
        },
    },
    test: {
        include: ["test/engine/**/*.test.ts", "test/support/**/*.test.ts"],
        environment: "node",
        // JUnit has no per-test timeout, and property tests run many trials, which can take
        // several seconds on a slow CI machine (Vitest's default is 5 seconds):
        testTimeout: 60_000,
    },
});
