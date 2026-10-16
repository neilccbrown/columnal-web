// Checks that scripts/funcdoc/funcdoc.mjs (the port of the original's XSLT stylesheets for the
// function documentation) gives exactly what the stylesheets give with Saxon, as recorded by
// scripts/golden/funcdoc.sh in golden/funcdoc/.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { extractTests, typesAndMini } from "../../../scripts/funcdoc/funcdoc.mjs";

const golden = join(import.meta.dirname, "golden", "funcdoc");
const funcdoc = join(import.meta.dirname, "..", "..", "..", "resources", "funcdoc");

describe("Funcdoc", () =>
{
    test("function details (funcdoc-types-and-mini.xsl)", () =>
    {
        const files = typesAndMini(join(funcdoc, "_all.xml"));
        expect(Object.keys(files).sort()).toEqual(readdirSync(golden).filter(f => f.endsWith(".properties")).sort());
        for (const [name, content] of Object.entries(files))
            expect(content, name).toBe(readFileSync(join(golden, name), "utf8"));
    });

    const xmlFiles = readdirSync(funcdoc).filter(f => f.endsWith(".xml") && f !== "_all.xml").sort();
    test.each(xmlFiles)("example tests (extract-tests.xsl) for %s", xmlFile =>
    {
        expect(extractTests(join(funcdoc, xmlFile))).toBe(readFileSync(join(golden, xmlFile.replace(/\.xml$/, ".test")), "utf8"));
    });
});
