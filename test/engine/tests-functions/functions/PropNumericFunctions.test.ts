// Port of test.functions.PropNumericFunctions (tests-functions).
import { beforeEach, describe } from "vitest";
import { Absolute } from "../../../../src/engine/functions/transformations/function/Absolute.js";
import type { FunctionDefinition } from "../../../../src/engine/functions/transformations/function/FunctionDefinition.js";
import { Mean } from "../../../../src/engine/functions/transformations/function/Mean.js";
import { Round } from "../../../../src/engine/functions/transformations/function/number/Round.js";
import { Sum } from "../../../../src/engine/functions/transformations/function/Sum.js";
import { Decimal, parseBigDecimal, toPlainString, ZERO } from "../../../../src/engine/java/JavaBigDecimal.js";
import { DataType } from "../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { NumberInfo } from "../../../../src/engine/types/data/datatype/NumberInfo.js";
import type { Unit } from "../../../../src/engine/types/data/unit/Unit.js";
import { UnitManager } from "../../../../src/engine/types/data/unit/UnitManager.js";
import { UserException } from "../../../../src/engine/utility-error/error/UserException.js";
import { Utility } from "../../../../src/engine/utility/utility/Utility.js";
import { assertThat, Matchers } from "../../../support/hamcrest.js";
import { assertEquals, assertNotNull, assertTrue, fail } from "../../../support/junit.js";
import { propertyTest } from "../../../support/quickcheck.js";
import { GenNumber } from "../../tests-basic/fixtures/gen/GenNumber.js";
import { GenNumbers } from "../../tests-basic/fixtures/gen/GenNumbers.js";
import { GenUnit } from "../../tests-basic/fixtures/gen/GenUnit.js";
import { TFunctionUtil } from "../fixtures/functions/TFunctionUtil.js";

/**
 * Created by neil on 13/12/2016.
 */
describe("PropNumericFunctions", () =>
{
    let mgr: UnitManager;
    beforeEach(() =>
    {
        mgr = new UnitManager();
    });


    propertyTest("propAbs", [new GenNumber(), new GenUnit()], (src: Decimal, u: Unit) =>
    {
        const absed = Utility.toBigDecimal(runNumericFunction(u.toString(), src, u.toString(), new Absolute()));
        // Change *after* call; important so that we test diff classes above, but need BigDecimal for comparisons:
        src = Utility.toBigDecimal(src);
        assertThat(absed, Matchers.greaterThanOrEqualTo(ZERO));
        assertThat(absed, Matchers.anyOf(Matchers.equalTo(src), Matchers.equalTo(Utility.addSubtractNumbers(DataTypeUtility.value(ZERO), src, false))));
    });

    propertyTest("propRound", [new GenNumber(), new GenUnit()], (src: Decimal, u: Unit) =>
    {
        const rounded = Utility.toBigDecimal(runNumericFunction(u.toString(), src, u.toString(), new Round()));
        const orig = Utility.toBigDecimal(src);
        // Check that it is round by doing this; will throw if not:
        // Java: rounded.toBigIntegerExact(), which throws ArithmeticException if not an integer
        if (!rounded.isInteger())
            fail("Expected integer but was " + toPlainString(rounded) + " : Rounding necessary");
        const gap = orig.minus(rounded).abs();
        assertThat(gap, Matchers.lessThanOrEqualTo(new Decimal("0.5")));
    });

    propertyTest("propSum", [new GenNumbers(), new GenUnit()], (src: Decimal[], u: Unit) =>
    {
        const total = src.length === 0 ? null : src.reduce((a, b) => Utility.addSubtractNumbers(a, b, true));
        assertEquals(total === null ? ZERO : Utility.toBigDecimal(total), Utility.toBigDecimal(runNumericSummaryFunction(u.toString(), src, u.toString(), new Sum())));
    });

    propertyTest("propAverage", [new GenNumbers(), new GenUnit()], (src: Decimal[], u: Unit) =>
    {
        const total = src.length === 0 ? null : src.reduce((a, b) => Utility.addSubtractNumbers(a, b, true));
        if (total === null)
        {
            // List must be empty:
            try
            {
                runNumericSummaryFunction(u.toString(), src, u.toString(), new Mean());
                fail("Should have thrown exception on empty list");
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                // Expected
            }
        }
        else
        {
            const expected = Utility.toBigDecimal(Utility.divideNumbers(total, DataTypeUtility.value(new Decimal(src.length))));
            const actual = Utility.toBigDecimal(runNumericSummaryFunction(u.toString(), src, u.toString(), new Mean()));
            assertThat("Expected " + toPlainString(expected) + " actual" + toPlainString(actual), Utility.toBigDecimal(Utility.addSubtractNumbers(actual, expected, false)).abs(), Matchers.lessThanOrEqualTo(parseBigDecimal("0.000001", false)));
        }
    });

    // Tests single numeric input, numeric output function
    // (Java unwraps the cause of a RuntimeException; the ported code throws the cause directly.)
    function runNumericFunction(expectedUnit: string, src: Decimal, srcUnit: string, func: FunctionDefinition): Decimal
    {
        const instance = TFunctionUtil.typeCheckFunction(func, [DataType.number(new NumberInfo(mgr.loadUse(srcUnit)))]);
        assertNotNull(instance);
        assertTrue(DataTypeUtility.isNumber(instance!.getSecond()));
        assertEquals(mgr.loadUse(expectedUnit), TFunctionUtil.getUnit(instance!.getSecond()));
        const num = instance!.getFirst().call([src]);
        return Utility.cast(num, Decimal);
    }

    // Tests single numeric input, numeric output function
    function runNumericSummaryFunction(expectedUnit: string, src: readonly Decimal[], srcUnit: string, func: FunctionDefinition): Decimal
    {
        const instance = TFunctionUtil.typeCheckFunction(func, [DataType.array(DataType.number(new NumberInfo(mgr.loadUse(srcUnit))))]);
        assertNotNull(instance);
        assertTrue(DataTypeUtility.isNumber(instance!.getSecond()));
        assertEquals(mgr.loadUse(expectedUnit), TFunctionUtil.getUnit(instance!.getSecond()));
        const num = instance!.getFirst().call([DataTypeUtility.value([...src])]);
        return Utility.cast(num, Decimal);
    }
});
