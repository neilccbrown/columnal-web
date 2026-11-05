// Port of test.expressions.PropReplaceExpression (tests-gui-central), which doesn't use the GUI, so it
// is a Vitest engine test here.
import { describe } from "vitest";
import { Expression, MatchAnythingExpression, NumericLiteral } from "../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ZERO } from "../../../../src/engine/java/JavaBigDecimal.js";
import { assertEquals } from "../../../support/junit.js";
import { CompositeGenerator, propertyTest } from "../../../support/quickcheck.js";
import type { ExpressionValue } from "../../tests-functions/fixtures/gen/ExpressionValue.js";
import { GenExpressionValueBackwards } from "../../tests-functions/fixtures/gen/GenExpressionValueBackwards.js";
import { GenExpressionValueForwards } from "../../tests-functions/fixtures/gen/GenExpressionValueForwards.js";
import { GenNonsenseExpression } from "../../tests-tables/fixtures/gen/nonsenseTrans/GenNonsenseExpression.js";

function testReplaceNothing(expression: Expression): void
{
    // Test that replacing an expression not present does nothing.
    assertEquals(expression, expression.replaceSubExpression(new MatchAnythingExpression(), new NumericLiteral(ZERO, null)));
}

// We probably shouldn't have two methods doing similar things, but since we do, we can test them against each other:
function testReplaceRandom(expression: Expression): void
{
    const mutationPoints = expression._test_allMutationPoints();
    for (const mutationPoint of mutationPoints)
    {
        assertEquals("Replacing " + mutationPoint.getFirst().toString(), expression.replaceSubExpression(mutationPoint.getFirst(), new MatchAnythingExpression()), mutationPoint.getSecond()(new MatchAnythingExpression()));
    }
}

describe("PropReplaceExpression", () =>
{
    propertyTest("testReplaceNothing", [new GenNonsenseExpression()], testReplaceNothing);

    propertyTest("testReplaceNothingV", [new CompositeGenerator<ExpressionValue>([new GenExpressionValueBackwards(), new GenExpressionValueForwards()])], (expressionValue: ExpressionValue) =>
    {
        testReplaceNothing(expressionValue.expression);
    });

    propertyTest("testReplaceRandom", [new GenNonsenseExpression()], testReplaceRandom);

    propertyTest("testReplaceRandomV", [new CompositeGenerator<ExpressionValue>([new GenExpressionValueBackwards(), new GenExpressionValueForwards()])], (expressionValue: ExpressionValue) =>
    {
        testReplaceRandom(expressionValue.expression);
    });
});
