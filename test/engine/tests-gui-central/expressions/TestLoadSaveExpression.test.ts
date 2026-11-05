// Port of test.expressions.TestLoadSaveExpression (tests-gui-central), which doesn't use the GUI, so it
// is a Vitest engine test here.
import { describe, test } from "vitest";
import type { ExpressionIdentifier } from "../../../../src/engine/anns/Annotations.js";
import { BracketedStatus } from "../../../../src/engine/expressions/transformations/expression/BracketedStatus.js";
import { AddSubtractExpression, BooleanLiteral, CallExpression, Expression, IdentExpression, NotEqualExpression, NumericLiteral, StringLiteral } from "../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../../src/engine/identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../../../src/engine/identifiers/id/TableAndColumnRenames.js";
import { Decimal } from "../../../../src/engine/java/JavaBigDecimal.js";
import { UnitManager } from "../../../../src/engine/types/data/unit/UnitManager.js";
import { assertEquals } from "../../../support/junit.js";
import { DummyManager } from "../../tests-functions/fixtures/DummyManager.js";
import { TFunctionUtil } from "../../tests-functions/fixtures/functions/TFunctionUtil.js";

const AddSubtractOp = AddSubtractExpression.AddSubtractOp;
const col = (name: string): ColumnId => new ColumnId(name as ExpressionIdentifier);
const num = (n: number | string): NumericLiteral => new NumericLiteral(new Decimal(n), null);

/**
 * Created by neil on 30/11/2016.
 */
describe("TestLoadSaveExpression", () =>
{
    test("testParseSimple", () =>
    {
        //TODO add tests with units
        assertBothWays(
            IdentExpression.column(col("Card")),
            "column\\\\Card",
        );
        assertBothWays(
            new BooleanLiteral(true),
            "true",
        );
        assertBothWays(
            num(0),
            "0",
        );
        const typeManager = DummyManager.make().getTypeManager();
        assertEquals(
            IdentExpression.column(col("Card")),
            TFunctionUtil.parseExpression("column\\\\Card", typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager())),
        );
    });

    test("testParseCompound", () =>
    {
        assertBothWays(
            new NotEqualExpression(new StringLiteral("Card"), new StringLiteral("xxx")),
            "\"Card\" <> \"xxx\"",
        );
        const typeManager = DummyManager.make().getTypeManager();
        assertEquals(
            new NotEqualExpression(IdentExpression.column(col("Card")), new StringLiteral("xxx")),
            TFunctionUtil.parseExpression("column\\\\Card <> \"xxx\"", typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager())),
        );
        assertBothWays(
            new NotEqualExpression(IdentExpression.column(col("Card")), new StringLiteral("xxx")),
            "column\\\\Card <> \"xxx\"",
        );
        assertBothWays(
            new NotEqualExpression(new BooleanLiteral(false), new BooleanLiteral(true)),
            "false <> true",
        );
        assertBothWays(
            new NotEqualExpression(num(23), new BooleanLiteral(true)),
            "23 <> true",
        );
        assertBothWays(
            new NotEqualExpression(num(0), new BooleanLiteral(true)),
            "0 <> true",
        );
        assertBothWays(
            new NotEqualExpression(new BooleanLiteral(false),
                new NotEqualExpression(num(0), new BooleanLiteral(true))),
            "false <> (0 <> true)",
        );
        assertBothWays(
            new NotEqualExpression(num("140342692767213651142747826757169"),
                new NotEqualExpression(
                    new NotEqualExpression(new BooleanLiteral(false), num("8070270985797032549311752415269")),
                    new BooleanLiteral(false),
                ),
            ),
            "140342692767213651142747826757169 <> ((false <> 8070270985797032549311752415269) <> false)",
        );
        assertBothWays(
            new AddSubtractExpression([
                new CallExpression(FunctionList.getFunctionLookup(new UnitManager()), "abs",
                    new AddSubtractExpression([
                        new BooleanLiteral(true),
                        new BooleanLiteral(false),
                        num(632),
                        IdentExpression.column(col("Date"))],
                    [AddSubtractOp.ADD, AddSubtractOp.SUBTRACT, AddSubtractOp.ADD])),
                num(62),
                new StringLiteral("hi"),
            ], [AddSubtractOp.SUBTRACT, AddSubtractOp.ADD]),
            "@call function\\\\number\\abs(true + false - 632 + column\\\\Date) - 62 + \"hi\"",
        );
    });

    test("testCalls", () =>
    {
        assertBothWays(new CallExpression(IdentExpression.tag("Optional" as ExpressionIdentifier, "Is" as ExpressionIdentifier), [num(3)]), "@call tag\\\\Optional\\Is(3)");
    });
});

function assertBothWays(expression: Expression, src: string): void
{
    const typeManager = DummyManager.make().getTypeManager();
    assertEquals(expression, TFunctionUtil.parseExpression(src, typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager())));
    assertEquals(src, expression.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY));
}
