// Builds the Reka UI and Ark UI versions of the Phase 7 component prototypes separately, and prints
// how much each library adds to the bundle (minified, and gzipped), with Vue in its own chunk.
//   node scripts/prototype/component-sizes.mjs <out-dir>
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";
import vue from "@vitejs/plugin-vue";

const out = process.argv[2];
const dir = "src/gui/prototype/components";
for (const side of ["reka", "ark"])
{
    const entry = join(out, `entry-${side}.ts`);
    mkdirSync(out, { recursive: true });
    writeFileSync(entry, ["AbbrevTooltip", "ColumnContextMenu", "LightDialog", "PickTableCombobox"]
        .map(c => `export { default as ${c} } from "${process.cwd()}/${dir}/${side}/${c}.vue";`).join("\n"));
    await build({
        configFile: false,
        logLevel: "silent",
        plugins: [vue()],
        build: {
            outDir: join(out, side),
            minify: true,
            emptyOutDir: true,
            lib: { entry, formats: ["es"], fileName: side },
            rollupOptions: { external: ["vue"] },
        },
    });
    const files = readdirSync(join(out, side)).filter(f => f.endsWith(".js"));
    const bytes = files.map(f => readFileSync(join(out, side, f)));
    const total = bytes.reduce((a, b) => a + b.length, 0);
    const gz = bytes.reduce((a, b) => a + gzipSync(b).length, 0);
    console.log(`${side}: ${(total / 1024).toFixed(0)} KB minified, ${(gz / 1024).toFixed(0)} KB gzipped (4 components, excluding Vue)`);
}
