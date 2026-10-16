// Generates the function details that the Java build made from the funcdoc XML with
// funcdoc-types-and-mini.xsl (see scripts/funcdoc/funcdoc.mjs): six .properties files, written to
// src/engine/functions/generated (gitignored), which FunctionDefinition loads.
// Runs on postinstall and before builds, with the parser generation.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { typesAndMini } from "./funcdoc/funcdoc.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src", "engine", "functions", "generated");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const files = typesAndMini(join(root, "resources", "funcdoc", "_all.xml"));
for (const [name, content] of Object.entries(files))
    writeFileSync(join(outDir, name), content);
console.log(`Generated ${Object.keys(files).length} function detail files into ${outDir}`);
