// New tests for AppUtility.valueToExpression (Java has none): a value turned into an expression
// type checks as the value's type and evaluates to the value.
import { describe, expect, test } from "vitest";
import { EvaluateState } from "../../../src/engine/expressions/transformations/expression/EvaluateState.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { TypeId } from "../../../src/engine/types/data/datatype/TypeId.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { TaggedValue } from "../../../src/engine/utility/utility/TaggedValue.js";
import { ListExList, RecordMap, Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { AppUtility } from "../../../src/gui-logic/app/apputility/AppUtility.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";

const mgr = TFunctionUtil.managerWithTestTypes().getFirst();
const typeManager = mgr.getTypeManager();
const functionLookup = FunctionList.getFunctionLookup(mgr.getUnitManager());

// Returns the expression's concrete type (null if it fails to type check) and its value
function roundTrip(dataType: DataType, value: Value): { type: DataType | null, value: Value | null }
{
    const expression = AppUtility.valueToExpression(typeManager, functionLookup, dataType, value);
    const typeExp = expression.checkExpression(TFunctionUtil.dummyColumnLookup(), TFunctionUtil.createTypeState(typeManager), TFunctionUtil.excOnError());
    if (typeExp === null)
        return { type: null, value: null };
    const type = typeExp.toConcreteType(typeManager).either<DataType | null>(_e => null, t => t);
    return { type, value: expression.calculateValue(new EvaluateState(typeManager, null)).value };
}

function check(dataType: DataType, value: Value): void
{
    const result = roundTrip(dataType, value);
    expect(result.type !== null && result.type.equals(dataType), "Type " + String(result.type)).toBe(true);
    expect(Utility.compareValues(result.value!, value)).toBe(0);
}

describe("AppUtility.valueToExpression", () =>
{
    test("number", () => check(DataType.NUMBER, new Decimal("1.5")));
    test("number with unit", () => check(DataType.number(new NumberInfo(mgr.getUnitManager().loadUse("m/s"))), new Decimal(-3)));
    test("text", () => check(DataType.TEXT, "hello \"you\""));
    test("boolean", () => check(DataType.BOOLEAN, true));
    test("record", () => check(DataType.record([["a", DataType.NUMBER], ["b", DataType.TEXT]]), new RecordMap(new Map<string, Value>([["a", new Decimal(2)], ["b", "x"]]))));
    test("list", () => check(DataType.array(DataType.TEXT), new ListExList(["p", "q"])));
    test("empty list", () => check(DataType.array(DataType.NUMBER), new ListExList([])));
    test("tagged without type variables", () =>
    {
        // The test type C, with tags Blank and Num(Number):
        const c = typeManager.lookupType(new TypeId("C"), [])!;
        const cDefinition = typeManager.getKnownTaggedTypes().get(new TypeId("C"))!;
        check(c, new TaggedValue(1, new Decimal(5), cDefinition));
        check(DataType.array(c), new ListExList([new TaggedValue(0, null, cDefinition), new TaggedValue(1, new Decimal(-2), cDefinition)]));
    });
    // (Java's failed to type check: see BugFixes.test.ts)
    test("tagged with type variables", () =>
    {
        const optionalNumber = typeManager.getMaybeType().instantiate([Either.right(DataType.NUMBER)], typeManager);
        check(optionalNumber, new TaggedValue(1, new Decimal(5), typeManager.getMaybeType()));
        check(optionalNumber, new TaggedValue(0, null, typeManager.getMaybeType()));
        check(DataType.array(optionalNumber), new ListExList([new TaggedValue(1, new Decimal(5), typeManager.getMaybeType())]));
    });
});
