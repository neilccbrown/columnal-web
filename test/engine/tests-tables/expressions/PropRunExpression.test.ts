// Port of test.expressions.PropRunExpression (tests-tables).
import { describe } from "vitest";
import { ErrorAndTypeRecorderStorer } from "../../../../src/engine/expressions/transformations/expression/ErrorAndTypeRecorderStorer.js";
import { EvaluateState } from "../../../../src/engine/expressions/transformations/expression/EvaluateState.js";
import { ArithmeticException, parseBigDecimal } from "../../../../src/engine/java/JavaBigDecimal.js";
import { Pair } from "../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../src/engine/utility-error/error/InternalException.js";
import { UserException } from "../../../../src/engine/utility-error/error/UserException.js";
import { EpsilonType, Utility } from "../../../../src/engine/utility/utility/Utility.js";
import { assertEquals, assertTrue, fail } from "../../../support/junit.js";
import { CompositeGenerator, propertyTest } from "../../../support/quickcheck.js";
import { TFunctionUtil } from "../../tests-functions/fixtures/functions/TFunctionUtil.js";
import type { ExpressionValue } from "../../tests-functions/fixtures/gen/ExpressionValue.js";
import { GenExpressionValueBackwards } from "../../tests-functions/fixtures/gen/GenExpressionValueBackwards.js";
import { GenExpressionValueForwards } from "../../tests-functions/fixtures/gen/GenExpressionValueForwards.js";
import { TTableUtil } from "../fixtures/TTableUtil.js";

/**
 * Created by neil on 10/12/2016.
 */
describe("PropRunExpression", () =>
{
    propertyTest("propRunExpression", [new CompositeGenerator<ExpressionValue>([new GenExpressionValueBackwards(), new GenExpressionValueForwards()])], (src: ExpressionValue) =>
    {
        try
        {
            const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
            const errors = new ErrorAndTypeRecorderStorer();
            const checked = src.expression.checkExpression(src, TFunctionUtil.createTypeState(dummyManager.getTypeManager()), errors);
            assertEquals("Checked iff error", checked === null, errors.getAllErrors().length !== 0);
            errors.withFirst(s => { throw new InternalException(s.toPlain()); });
            for (let row = 0; row < src.value.length; row++)
            {
                const actualValue = src.expression.calculateValue(new EvaluateState(dummyManager.getTypeManager(), row)).value;
                assertTrue("{{{" + src.expression.toString() + "}}} should have been " + TTableUtil.toString(src.value[row]!) + " but was " + TTableUtil.toString(actualValue) + " columns: " + src.recordSet.getColumnIds().map(c => c.toString()).join(", ") + " " + src.recordSet.debugGetVals(row),
                    Utility.compareValues(src.value[row]!, actualValue, new Pair(EpsilonType.RELATIVE, parseBigDecimal("0.000000001", true))) === 0);
            }
        }
        catch (e)
        {
            // Java catches ArithmeticException, InternalException, UserException and ClassCastException (a TypeError here)
            if (!(e instanceof ArithmeticException || e instanceof InternalException || e instanceof UserException || e instanceof TypeError))
                throw e;
            console.error("Expression: {{{" + src.expression.toString() + "}}} " + src.recordSet.debugGetVals());
            //throw e;
            console.error(e);
            // Must fail, not throw, if we want to shrink:
            fail(e.message);
        }
    }, { trials: 2000, timeout: 600_000 });
});
