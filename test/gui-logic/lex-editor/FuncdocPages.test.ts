// Checks that scripts/funcdoc/funcdocHtml.mjs (the port of funcdoc-indiv-html.xsl and
// funcdoc-joined-html.xsl) gives what the stylesheets give with Saxon, as recorded by
// scripts/golden/funcdoc.sh in golden/funcdoc-pages.json.  Saxon indents its HTML, so whitespace is
// compared as HTML shows it: any run is one space, and none matters next to a block tag.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { brokenLinks, funcdocPages, type FuncdocPage } from "../../../scripts/funcdoc/funcdocHtml.mjs";

const funcdoc = join(import.meta.dirname, "..", "..", "..", "resources", "funcdoc");
const golden = JSON.parse(readFileSync(join(import.meta.dirname, "golden", "funcdoc-pages.json"), "utf8")) as Record<string, FuncdocPage>;
const pages = funcdocPages(join(funcdoc, "_all.xml"), readdirSync(funcdoc).filter(f => f.endsWith(".xml") && f !== "_all.xml").map(f => join(funcdoc, f)));

function normalise(html: string): string
{
    return html
        // Namespace declarations copied from the source (see funcdocHtml.mjs):
        .replace(/ xmlns:\w+="[^"]*"/g, "")
        .replace(/\s+/g, " ")
        .replace(/ ?(<\/?(?:div|p|ul|li|h1|h2)\b[^>]*>) ?/g, "$1")
        .trim();
}

test("the same pages", () =>
{
    expect(Object.keys(pages).sort()).toEqual(Object.keys(golden).sort());
});

test.each(Object.keys(golden).sort())("funcdoc page %s", file =>
{
    const page = pages[file]!;
    const expected = golden[file]!;
    expect(page.title).toBe(expected.title.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"));
    expect(page.bodyClass).toBe(expected.bodyClass);
    expect(normalise(page.body)).toBe(normalise(expected.body));
});

// The links that go nowhere, errors in the Java original, kept in the snapshot so that a new one is
// noticed.  (FuncdocView logs "Missing file" when one is clicked.)
test("links that go nowhere", () =>
{
    expect(brokenLinks(pages).map(([page, href]) => `${page} -> ${href}`)).toMatchSnapshot();
});
