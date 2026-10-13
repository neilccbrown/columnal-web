import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            "@resources": fileURLToPath(new URL("./resources", import.meta.url)),
        },
    },
    build: {
        target: "es2022",
    },
});
