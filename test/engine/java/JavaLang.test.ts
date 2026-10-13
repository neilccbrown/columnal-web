// Checks src/engine/java against the real JVM behaviour recorded by scripts/golden/java-lang.sh.
import { describe, expect, test } from "vitest";
import golden from "./golden/java-lang.txt?raw";
import tricky from "./golden/tricky.properties?raw";
import { charToLowerCase, charToUpperCase, isAlphabetic, isDefined, isDigit, isLetter, isOtherLetter, isWhitespace } from "../../../src/engine/java/JavaCharacter.js";
import { loadProperties } from "../../../src/engine/java/JavaProperties.js";
import { javaDoubleToString, javaParseDouble } from "../../../src/engine/java/JavaDouble.js";
import { javaParseInt, javaParseLong, javaRegionMatches, javaSplit, javaTrim } from "../../../src/engine/java/JavaString.js";

const resourceFiles = import.meta.glob("../../../resources/i18n/*.properties", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function unescape(s: string): string
{
    return JSON.parse(s) as string;
}

function esc(s: string): string
{
    let r = "\"";
    for (const c of s)
    {
        for (let i = 0; i < c.length; i++)
        {
            const code = c.charCodeAt(i);
            r += code >= 0x20 && code < 0x7f && c !== "\"" && c !== "\\" ? c[i] : "\\u" + code.toString(16).padStart(4, "0");
        }
    }
    return r + "\"";
}

function run(f: () => unknown): string
{
    try
    {
        const r = f();
        return typeof r === "string" ? esc(r) : String(r);
    }
    catch (e)
    {
        return "ERR " + (e as Error).name;
    }
}

// Lines are: <kind> <args...> = <result>, where string args are JSON-style literals.
const lines = golden.trimEnd().split("\n");

function parseRanges(name: string): Set<number>
{
    const line = lines.find(l => l.startsWith("ranges " + name + " ="))!;
    const set = new Set<number>();
    for (const range of line.substring(line.indexOf("=") + 1).trim().split(" "))
    {
        const [lo, hi] = range.split("-").map(h => parseInt(h, 16)) as [number, number];
        for (let cp = lo; cp <= hi; cp++)
            set.add(cp);
    }
    return set;
}

const javaDefined = parseRanges("isDefined");

// Properties of already-assigned characters that changed in Unicode 16 (the JS engine's data is
// newer than Java 21's Unicode 15): combining Latin letters became Alphabetic, and U+0295
// changed from Lo to Ll.
const UNICODE_16_CHANGES: Record<string, ReadonlySet<number>> = {
    isAlphabetic: new Set([...Array.from({ length: 0x36f - 0x363 + 1 }, (_, i) => 0x363 + i), ...Array.from({ length: 0x1de6 - 0x1dd3 + 1 }, (_, i) => 0x1dd3 + i)]),
    isOtherLetter: new Set([0x295]),
};
function linesOf(kind: string): { args: string[]; expected: string }[]
{
    return lines.filter(l => l.startsWith(kind + " ")).map(l =>
    {
        const eq = l.lastIndexOf(" = ");
        const argText = l.substring(kind.length + 1, eq);
        const args = argText.match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? [];
        return { args, expected: l.substring(eq + 3) };
    });
}

function checkAll(kind: string, evaluate: (args: string[]) => string): void
{
    const cases = linesOf(kind);
    expect(cases.length).toBeGreaterThan(0);
    const failures = cases.filter(c => evaluate(c.args) !== c.expected).map(c => `${kind} ${c.args.join(" ")}: Java ${c.expected}, TS ${evaluate(c.args)}`);
    expect(failures.join("\n")).toBe("");
}

describe("java.lang behaviour matches the JVM", () =>
{
    test("String.split", () => checkAll("split", ([s, re]) =>
        "[" + javaSplit(unescape(s!), new RegExp(unescape(re!), "u")).map(esc).join(",") + "]"));

    test("Double.toString", () => checkAll("doubleToString", ([bits]) =>
    {
        const view = new DataView(new ArrayBuffer(8));
        view.setBigUint64(0, BigInt("0x" + bits));
        return esc(javaDoubleToString(view.getFloat64(0)));
    }));

    test("Double.parseDouble", () => checkAll("parseDouble", ([s]) => run(() => javaDoubleToString(javaParseDouble(unescape(s!))))));

    test("Long.parseLong", () => checkAll("parseLong", ([s]) => run(() => javaParseLong(unescape(s!)))));

    test("Integer.parseInt (hex)", () => checkAll("parseIntHex", ([s]) => run(() => javaParseInt(unescape(s!), 16))));

    test("String.trim", () => checkAll("trim", ([s]) => esc(javaTrim(unescape(s!)))));

    test("String.regionMatches ignoring case", () => checkAll("regionMatchesIC", ([a, b]) =>
    {
        const x = unescape(a!);
        const y = unescape(b!);
        return String(javaRegionMatches(x, true, 0, y, 0, Math.min(x.length, y.length)));
    }));

    // Mappings involving a char that Java 21 (Unicode 15) doesn't define are Unicode-version
    // differences (the JS engine has a newer Unicode), so they are skipped.
    test("Character simple case mappings (whole BMP)", () =>
    {
        for (const [kind, f] of [["caseUpper", charToUpperCase], ["caseLower", charToLowerCase]] as const)
        {
            const line = lines.find(l => l.startsWith(kind + " ="))!;
            const expected = new Map(line.substring(kind.length + 3).trim().split(" ").map(p => p.split(":").map(h => parseInt(h, 16)) as [number, number]));
            const failures: string[] = [];
            for (let c = 0; c < 0xffff; c++)
            {
                const actual = f(String.fromCharCode(c)).charCodeAt(0);
                const exp = expected.get(c) ?? c;
                if (!javaDefined.has(c) || !javaDefined.has(actual))
                    continue;
                if (actual !== exp)
                    failures.push(`${c.toString(16)}: Java ${exp.toString(16)}, TS ${actual.toString(16)}`);
            }
            expect(failures.slice(0, 20).join("\n"), `${kind}: ${failures.length} differences`).toBe("");
        }
    });

    // The JVM and the JS engine may use different Unicode versions, so only compare code points
    // that both consider assigned (newly assigned ones may legitimately differ).
    test("Character classification", () =>
    {
        const predicates: [string, (cp: number) => boolean][] = [
            ["isWhitespace", isWhitespace], ["isLetter", isLetter], ["isDigit", isDigit],
            ["isAlphabetic", isAlphabetic], ["isOtherLetter", isOtherLetter],
        ];
        for (const [name, f] of predicates)
        {
            const java = parseRanges(name);
            const failures: string[] = [];
            for (let cp = 0; cp <= 0x10ffff; cp++)
            {
                if (!javaDefined.has(cp) || !isDefined(cp) || UNICODE_16_CHANGES[name]?.has(cp))
                    continue;
                if (java.has(cp) !== f(cp))
                    failures.push(`${cp.toString(16)}: Java ${java.has(cp)}`);
            }
            expect(failures.slice(0, 20).join(", "), `${name}: ${failures.length} differences`).toBe("");
        }
    });

    test("Properties files", () =>
    {
        const files = new Map<string, Map<string, string>>([["tricky.properties", loadProperties(tricky)]]);
        for (const [path, text] of Object.entries(resourceFiles))
            files.set(path.substring(path.lastIndexOf("/") + 1), loadProperties(text));
        const expected = new Map<string, Map<string, string>>();
        for (const c of linesOf("property"))
        {
            const [file, key] = c.args as [string, string];
            if (!expected.has(file))
                expected.set(file, new Map());
            expected.get(file)!.set(unescape(key), unescape(c.expected));
        }
        expect(expected.size).toBe(files.size);
        for (const [file, props] of expected)
            expect(Object.fromEntries(files.get(file)!), file).toEqual(Object.fromEntries(props));
    });
});
