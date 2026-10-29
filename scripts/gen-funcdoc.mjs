// Generates the function details that the Java build made from the funcdoc XML with
// funcdoc-types-and-mini.xsl (see scripts/funcdoc/funcdoc.mjs): six .properties files, written to
// src/engine/functions/generated (gitignored), which FunctionDefinition loads.  And the dialog help
// that it made with make-help-indiv.xsl (scripts/funcdoc/help.mjs): a .properties file per help file,
// written to src/gui-logic/utility-gui/generated/help (gitignored), which Help loads.  And the
// documentation pages that it made with funcdoc-indiv-html.xsl and funcdoc-joined-html.xsl
// (scripts/funcdoc/funcdocHtml.mjs): one JSON file in src/gui/generated (gitignored), which
// FuncdocView loads when it is first shown.
// Runs on postinstall and before builds, with the parser generation.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { typesAndMini } from "./funcdoc/funcdoc.mjs";
import { brokenLinks, funcdocPages } from "./funcdoc/funcdocHtml.mjs";
import { helpProperties } from "./funcdoc/help.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src", "engine", "functions", "generated");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const files = typesAndMini(join(root, "resources", "funcdoc", "_all.xml"));
for (const [name, content] of Object.entries(files))
    writeFileSync(join(outDir, name), content);
console.log(`Generated ${Object.keys(files).length} function detail files into ${outDir}`);

const helpDir = join(root, "resources", "help");
const helpOutDir = join(root, "src", "gui-logic", "utility-gui", "generated", "help");
rmSync(helpOutDir, { recursive: true, force: true });
mkdirSync(helpOutDir, { recursive: true });
let helpFiles = 0;
for (const xml of readdirSync(helpDir).filter(f => f.endsWith(".xml")))
{
    for (const [name, content] of Object.entries(helpProperties(join(helpDir, xml))))
    {
        writeFileSync(join(helpOutDir, name), content);
        helpFiles++;
    }
}
console.log(`Generated ${helpFiles} help files into ${helpOutDir}`);

const funcdocDir = join(root, "resources", "funcdoc");
const pagesOutDir = join(root, "src", "gui", "generated");
rmSync(pagesOutDir, { recursive: true, force: true });
mkdirSync(pagesOutDir, { recursive: true });
const pages = funcdocPages(join(funcdocDir, "_all.xml"),
    readdirSync(funcdocDir).filter(f => f.endsWith(".xml") && f !== "_all.xml").sort().map(f => join(funcdocDir, f)));
writeFileSync(join(pagesOutDir, "funcdoc-pages.json"), JSON.stringify(pages));
console.log(`Generated ${Object.keys(pages).length} documentation pages into ${pagesOutDir}`);
// Errors in the Java original, which test/gui-logic/lex-editor/FuncdocPages.test.ts keeps a list of:
const broken = brokenLinks(pages);
if (broken.length > 0)
    console.warn(`Warning: ${broken.length} documentation links go nowhere (see FuncdocPages.test.ts)`);
