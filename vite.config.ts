import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";

const fontsDir = fileURLToPath(new URL("./resources/gui/fonts/", import.meta.url));

// The built app ships the fonts' licences (the OFL requires them to go with the fonts), and its own,
// in licences/:
function licences(): Plugin
{
    return {
        name: "columnal-licences",
        apply: "build",
        generateBundle()
        {
            for (const name of readdirSync(fontsDir).filter(n => n.startsWith("OFL-")))
                this.emitFile({ type: "asset", fileName: "licences/" + name, source: readFileSync(fontsDir + name) });
            this.emitFile({ type: "asset", fileName: "licences/LICENSE.txt", source: readFileSync(new URL("./LICENSE.txt", import.meta.url)) });
        },
    };
}

export default defineConfig({
    plugins: [vue(), licences()],
    resolve: {
        alias: {
            "@resources": fileURLToPath(new URL("./resources", import.meta.url)),
        },
    },
    build: {
        target: "es2022",
    },
    worker: {
        format: "es",
    },
});
