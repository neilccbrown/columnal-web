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
    },
});
