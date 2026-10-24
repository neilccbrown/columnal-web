// Checks the number utilities against the ORIGINAL Java Utility methods, run on the JVM by
// scripts/golden/numbers.sh (results shown with trailing zeros stripped, as numbers here are canonical).
import { describe, expect, test } from "vitest";
import golden from "./golden/numbers.txt?raw";
import { Decimal, toPlainString } from "../../../src/engine/java/JavaBigDecimal.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { EpsilonType, Utility } from "../../../src/engine/utility/utility/Utility.js";

// Cases where the port deliberately differs from Java, each explained by a PORT-NOTE in the code:
const KNOWN_DIFFERENCES = new Map<string, string>([
    // Java's Long negation overflows; canonical numbers don't (see Utility.negate):
    ["negate -9223372036854775808", "9223372036854775808"],
    // Bug fix: Java's relative epsilon computed |a-b|/a - 1, so every pair compared equal (see Utility.compareNumbers):
    ["compareEpsilon 1 2 RELATIVE 0.001", "-1"],
    ["compareEpsilon 1 2 RELATIVE 0.5", "-1"],
    ["compareEpsilon -5 5 RELATIVE 0.001", "-1"],
    ["compareEpsilon -5 5 RELATIVE 0.5", "-1"],
    ["compareEpsilon 0 0.0001 RELATIVE 0.001", "-1"],
    ["compareEpsilon 0 0.0001 RELATIVE 0.5", "-1"],
    ["compareEpsilon 5 -5 RELATIVE 0.001", "1"],
    ["compareEpsilon 5 -5 RELATIVE 0.5", "1"],
]);

/**
 * Java's Math.pow is only specified to within 1 ulp, and differs between platforms (and from
 * JavaScript's **).  So for raise's double-precision path (non-integer or large powers), the
 * last bit may differ.  This allows that, and nothing more.
 */
function withinOneUlp(op: string, expected: string, actual: string): boolean
{
    if (op !== "raise")
        return false;
    const a = Number(expected);
    const b = Number(actual);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0)
        return false;
    return Math.abs(a - b) <= Math.abs(a) * 2 ** -52;
}

function show(x: unknown): string
{
    if (Decimal.isDecimal(x))
        return toPlainString(x);
    return String(x);
}

function run(f: () => unknown): string
{
    try
    {
        return show(f());
    }
    catch (e)
    {
        if (e instanceof Error)
            return "ERR " + e.name + ": " + e.message;
        throw e;
    }
}

function unescape(s: string): string
{
    return JSON.parse(s.replace(/\\u([0-9a-f]{4})/g, (_, h: string) => "\\u" + h)) as string;
}

const n = (s: string): Decimal => Utility.parseNumber(s);

function evaluate(op: string, args: string[]): string
{
    switch (op)
    {
        case "parse":
            return run(() => Utility.parseNumberOpt(unescape(args.join(" "))) ?? "EMPTY");
        case "add":
            return run(() => Utility.addSubtractNumbers(n(args[0]!), n(args[1]!), true));
        case "subtract":
            return run(() => Utility.addSubtractNumbers(n(args[0]!), n(args[1]!), false));
        case "multiply":
            return run(() => Utility.multiplyNumbers(n(args[0]!), n(args[1]!)));
        case "divide":
            return run(() => Utility.divideNumbers(n(args[0]!), n(args[1]!)));
        case "compare":
            return run(() => Utility.compareNumbers(n(args[0]!), n(args[1]!)));
        case "raise":
            return run(() => Utility.raiseNumber(n(args[0]!), n(args[1]!)));
        case "negate":
            return run(() => Utility.negate(n(args[0]!)));
        case "integerPart":
            return run(() => Utility.getIntegerPart(n(args[0]!)));
        case "fracPart":
            return run(() => Utility.getFracPart(n(args[0]!), Number(args[1])));
        case "isIntegral":
            return run(() => Utility.isIntegral(n(args[0]!)));
        case "fracPartAsString":
            return run(() => Utility.getFracPartAsString(n(args[0]!), Number(args[1]), Number(args[2])));
        case "compareEpsilon":
            return run(() => Utility.compareNumbers(n(args[0]!), n(args[1]!), new Pair(EpsilonType[args[2] as keyof typeof EpsilonType], new Decimal(args[3]!))));
        default:
            throw new Error("Unknown operation in golden file: " + op);
    }
}

const cases = golden.trimEnd().split("\n").map(line =>
{
    const eq = line.indexOf(" = ");
    const [op, ...args] = line.substring(0, eq).split(" ");
    return { line: line.substring(0, eq), op: op!, args, expected: line.substring(eq + 3) };
});

describe("Utility number operations match the Java original", () =>
{
    const byOp = new Map<string, typeof cases>();
    for (const c of cases)
        byOp.set(c.op, [...(byOp.get(c.op) ?? []), c]);

    for (const [op, opCases] of byOp)
    {
        test(`${op} (${opCases.length} cases)`, () =>
        {
            const failures: string[] = [];
            for (const c of opCases)
            {
                const expected = KNOWN_DIFFERENCES.get(c.line) ?? c.expected;
                const actual = evaluate(c.op, c.args);
                if (actual !== expected && !withinOneUlp(c.op, expected, actual))
                    failures.push(`${c.line}\n    Java:       ${c.expected}\n    TypeScript: ${actual}`);
            }
            expect(failures.slice(0, 10).join("\n"), `${failures.length} mismatches`).toBe("");
        });
    }

    test("every known difference still occurs in the golden file", () =>
    {
        for (const line of KNOWN_DIFFERENCES.keys())
            expect(cases.some(c => c.line === line), line).toBe(true);
    });
});
