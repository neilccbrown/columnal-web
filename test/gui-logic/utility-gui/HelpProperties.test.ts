// Checks that scripts/funcdoc/help.mjs (the port of make-help-indiv.xsl) gives exactly what the
// stylesheet gives with Saxon, as recorded by scripts/golden/funcdoc.sh in golden/help/.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { helpProperties } from "../../../scripts/funcdoc/help.mjs";

const golden = join(import.meta.dirname, "golden", "help");
const help = join(import.meta.dirname, "..", "..", "..", "resources", "help");

const xmlFiles = readdirSync(help).filter(f => f.endsWith(".xml")).sort();
test.each(xmlFiles)("help properties (make-help-indiv.xsl) for %s", xmlFile =>
{
    for (const [name, content] of Object.entries(helpProperties(join(help, xmlFile))))
        expect(content, name).toBe(readFileSync(join(golden, name), "utf8"));
});
