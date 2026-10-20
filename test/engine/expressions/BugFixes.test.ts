// Tests for Java bugs that the port fixes (each marked with a PORT-NOTE in the source).
import { describe, expect, test } from "vitest";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { ErrorAndTypeRecorderStorer } from "../../../src/engine/expressions/transformations/expression/ErrorAndTypeRecorderStorer.js";
import { AddSubtractExpression, CallExpression, IdentExpression, LambdaExpression, NumericLiteral, type Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { StringWithinIndex } from "../../../src/engine/functions/transformations/function/StringWithinIndex.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { Rational } from "../../../src/engine/java/Rational.js";
import { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { ListEx } from "../../../src/engine/utility/utility/Utility.js";
import { UserException } from "../../../src/engine/utility-error/error/UserException.js";
import { assertThrows } from "../../support/junit.js";
import { TFunctionUtil } from "../tests-functions/fixtures/functions/TFunctionUtil.js";

const ADD = AddSubtractExpression.AddSubtractOp.ADD;
const SUBTRACT = AddSubtractExpression.AddSubtractOp.SUBTRACT;
const num = (n: number): Expression => new NumericLiteral(new Decimal(n), null);

describe("Java bug fixes", () =>
{
    // Java's AddSubtractExpression.constantFold used the operator after each operand, so it
    // threw IndexOutOfBoundsException (for example, when type checking 3{m} ^ (1 + 2)).
    test("AddSubtractExpression.constantFold", () =>
    {
        expect(new AddSubtractExpression([num(1), num(2)], [ADD]).constantFold()).toEqual(Rational.of(3));
        expect(new AddSubtractExpression([num(5), num(2), num(1)], [SUBTRACT, ADD]).constantFold()).toEqual(Rational.of(4));
        expect(new AddSubtractExpression([num(5), num(2), num(1)], [ADD, SUBTRACT]).constantFold()).toEqual(Rational.of(6));
        expect(new AddSubtractExpression([num(5), IdentExpression.load("x" as ExpressionIdentifier)], [ADD]).constantFold()).toBeNull();
    });

    // Java's CallExpression.check cast the call target to IdentExpression for each argument,
    // throwing ClassCastException if it was something else that type checked as a function.
    test("CallExpression with a call target that isn't an identifier", () =>
    {
        const typeManager = new TypeManager(new UnitManager());
        const x = IdentExpression.load("x" as ExpressionIdentifier);
        const call = new CallExpression(new LambdaExpression([x], x), [num(3)]);
        const errors = new ErrorAndTypeRecorderStorer();
        call.checkExpression(TFunctionUtil.dummyColumnLookup(), TFunctionUtil.createTypeState(typeManager), errors);
        expect(errors.getAllErrors().map(e => e.toPlain())).toContain("Invalid call target: @function(x) @then x @endfunction");
    });

    // Java's StringWithinIndex (not in FunctionList) never calculated the item asked for.
    test("StringWithinIndex", () =>
    {
        const f = new StringWithinIndex().getInstance(() => { throw new Error("Unused"); });
        const result = f.call(["a", "banana"]) as ListEx;
        expect(result.get(1)).toEqual(new Decimal(3));
        expect(result.size()).toBe(3);
    });

    // Java let a DateTimeException through from these functions: a crash, rather than an error
    // for the user.
    test.each([
        "@call function\\\\years between(date{2020-02-29}, date{2023-05-01})",
        "@call function\\\\time from hms(25{hour}, 0{minute}, 0{s})",
        "@call function\\\\dateym from ym(2020{year}, 13{month})",
        "@call function\\\\datetimezoned from dtz(date{2020-01-01}, time{10:00}, \"Not/AZone\")",
    ])("user error from %s", src =>
    {
        assertThrows(UserException, () => TFunctionUtil.runExpression(src));
    });
});
