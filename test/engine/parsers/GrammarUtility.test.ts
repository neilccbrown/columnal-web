// Checks the GrammarUtility port against the original Java class's actual output.
// The golden file is produced by scripts/golden/grammar-utility.sh.
import { describe, expect, test } from "vitest";
import golden from "./golden/grammar-utility.txt?raw";
import { GrammarUtility } from "../../../src/engine/parsers/grammar/GrammarUtility.js";

function fromHex(hexList: string): string
{
    const inner = hexList.slice(1, -1).trim();
    return inner === "" ? "" : String.fromCharCode(...inner.split(" ").map(h => parseInt(h, 16)));
}

function toHex(s: string): string
{
    return "[" + Array.from({ length: s.length }, (_, i) => s.charCodeAt(i).toString(16)).join(" ") + "]";
}

const functions: Record<string, (input: string) => string | boolean> = {
    processEscapes: s => GrammarUtility.processEscapes(s),
    processEscapesUnquoted: s => GrammarUtility.processEscapes(s, false),
    validUnquoted: s => GrammarUtility.validUnquoted(s),
    validIdentifier: s => GrammarUtility.validIdentifier(s),
    escapeChars: s => GrammarUtility.escapeChars(s),
    collapseSpaces: s => GrammarUtility.collapseSpaces(s),
};

const cases = golden.trim().split("\n").map(line =>
{
    const m = /^(\w+) (\[[^\]]*\]) = (.*)$/.exec(line);
    if (!m)
        throw new Error("Bad golden line: " + line);
    return { fn: m[1]!, input: m[2]!, expected: m[3]! };
});

describe("GrammarUtility matches the Java original", () =>
{
    test.each(cases)("$fn $input", ({ fn, input, expected }) =>
    {
        const f = functions[fn];
        if (f === undefined)
            throw new Error("Unknown function in golden file: " + fn);
        if (expected.startsWith("EXCEPTION"))
        {
            // Java's IllegalArgumentException (invalid code point) is a RangeError in JavaScript
            expect(() => f(fromHex(input))).toThrow(RangeError);
            return;
        }
        const result = f(fromHex(input));
        expect(typeof result === "boolean" ? String(result) : toHex(result)).toBe(expected);
    });
});
