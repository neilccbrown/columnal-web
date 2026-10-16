// Checks the expressions and functions modules against the ORIGINAL Java classes, run on the
// JVM by scripts/golden/functions.sh (scripts/golden/java/FunctionsHarness.java).  Each golden
// line is section|input|output, and the cases run in the harness's order (big-math's caches of
// log(2), log(3) and log(10) depend on it):
//  - log, log2, log10: big-math's logarithms (src/engine/java/BigDecimalMath.ts), which must give
//    exactly the same digits;
//  - expr: an expression parsed, saved, type checked and evaluated.
import { describe, expect, test } from "vitest";
import golden from "./golden/functions.txt?raw";
import { BracketedStatus } from "../../../src/engine/expressions/transformations/expression/BracketedStatus.js";
import { ErrorAndTypeRecorderStorer } from "../../../src/engine/expressions/transformations/expression/ErrorAndTypeRecorderStorer.js";
import { EvaluateState } from "../../../src/engine/expressions/transformations/expression/EvaluateState.js";
import { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ExpressionUtil } from "../../../src/engine/expressions/transformations/expression/ExpressionUtil.js";
import { TypeState } from "../../../src/engine/expressions/transformations/expression/TypeState.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { TableAndColumnRenames } from "../../../src/engine/identifiers/id/TableAndColumnRenames.js";
import * as BigDecimalMath from "../../../src/engine/java/BigDecimalMath.js";
import { parseBigDecimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { ExpressionVersion } from "../../../src/engine/parsers/grammar/Versions.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { TFunctionUtil } from "../tests-functions/fixtures/functions/TFunctionUtil.js";

interface Case
{
    section: string;
    input: string;
    output: string;
}

function unesc(s: string): string
{
    return s.replace(/\\(\\|n|p)/g, (_m, c: string) => c === "n" ? "\n" : c === "p" ? "|" : "\\");
}

const cases: Case[] = golden.split("\n").filter(l => l !== "").map(line =>
{
    // Escaped fields cannot contain an unescaped "|":
    const [section, input, output] = line.split("|") as [string, string, string];
    return { section, input: unesc(input), output: unesc(output) };
});

// The Java simple class name of an exception thrown by the port (js-joda's exceptions are all
// JsJodaExceptions, with the Java class name as their name)
function javaClassOf(e: unknown): string
{
    const name = (e as Error).constructor.name;
    return name === "JsJodaException" ? (e as Error).name : name;
}

function run(f: () => string): string
{
    try
    {
        return f();
    }
    catch (e)
    {
        return "!" + javaClassOf(e) + ": " + (e as Error).message;
    }
}

// Known, deliberate differences from the Java (see the PORT-NOTEs), giving the port's output:
const KNOWN_DIFFERENCES = new Map<string, string>([
    // RoundDP: Java rounded a whole number held as a BigDecimal (1.5 * 10 is 15.0) to tens, but
    // returned one held as a Long (such as 15) unchanged; with one kind of number, the port always
    // does the latter.
    ["@call function\\\\round decimal(1.5 * 10, -1)", "@call function\\\\round decimal(1.5 * 10, -1) :: Number = 15"],
    // AddSubtractExpression.constantFold: bug fix (Java threw IndexOutOfBoundsException).
    ["3{m} ^ (1 + 2)", "3{m} ^ (1 + 2) :: Number{m^3} = 27"],
]);

// Java shows a computed number with its scale (2.50); the port's numbers have no trailing zeros
// (docs/CONVENTIONS.md, "Numbers").  Type variables are numbered by how many were made before.
function normalise(s: string): string
{
    return s.replace(/(\d)\.(\d*?)0+(?!\d)/g, (_m, i: string, f: string) => f === "" ? i : i + "." + f)
        .replace(/_([ut])\d+/g, "_$1?");
}

describe("FunctionsGolden", () =>
{
    // In the harness's order, from fresh caches:
    BigDecimalMath._test_clearCaches();
    const unitManager = new UnitManager();
    const typeManager = new TypeManager(unitManager);
    const functionLookup = FunctionList.getFunctionLookup(unitManager);
    const columnLookup = TFunctionUtil.dummyColumnLookup();

    const actual = cases.map(c =>
    {
        switch (c.section)
        {
            case "log":
            case "log2":
            case "log10":
            {
                const f = c.section === "log" ? BigDecimalMath.log : c.section === "log2" ? BigDecimalMath.log2 : BigDecimalMath.log10;
                return run(() =>
                {
                    const r = f(parseBigDecimal(c.input, false), BigDecimalMath.MathContext.DECIMAL128);
                    // Compared by value (Java shows a scale):
                    return c.output.startsWith("!") || !parseBigDecimal(c.output, false).eq(r) ? r.toString() : c.output;
                });
            }
            case "expr":
                return run(() =>
                {
                    const expression = ExpressionUtil.parse(null, c.input, ExpressionVersion.latest(), typeManager, functionLookup);
                    const saved = expression.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
                    const errors = new ErrorAndTypeRecorderStorer();
                    const typeExp = expression.checkExpression(columnLookup, TypeState.withRowNumber(typeManager, functionLookup), errors);
                    const errorText = errors.getAllErrors().map(e => e.toPlain()).join(" / ");
                    if (typeExp === null)
                        return saved + " :: !" + errorText;
                    const type = typeExp.toConcreteType(typeManager).either(e => "!" + e.getErrorText().toPlain(), t => t.toString());
                    let value: string;
                    try
                    {
                        value = DataTypeUtility.valueToString(expression.calculateValue(new EvaluateState(typeManager, null)).value);
                    }
                    catch (e)
                    {
                        value = "!" + javaClassOf(e) + ": " + (e as Error).message;
                    }
                    return saved + " :: " + type + (errorText === "" ? "" : " (" + errorText + ")") + " = " + value;
                });
            default:
                throw new Error("Unknown section " + c.section);
        }
    });

    test.each(cases.map((c, i) => [c.section, c.input, i] as const))("%s %s", (_section, _input, i) =>
    {
        const c = cases[i]!;
        const known = KNOWN_DIFFERENCES.get(c.input);
        expect(normalise(actual[i]!)).toBe(normalise(known ?? c.output));
    });
});
