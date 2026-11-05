// Port of test.expressions.PropLoadSaveExpression (tests-gui-central).  Its editing tests make an
// ExpressionEditor (not shown) and save it straight away; the editor is rebuilt in the GUI here, so they
// do what it does: load the expression's editor text into an EditorContent with an ExpressionLexer (as
// ExpressionEditor.vue does), and take the lexer's result.  So it is a Vitest test of the GUI logic.
import { describe, test } from "vitest";
import { BracketedStatus } from "../../../../src/engine/expressions/transformations/expression/BracketedStatus.js";
import { Expression } from "../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../../src/engine/functions/transformations/function/FunctionList.js";
import { TableAndColumnRenames } from "../../../../src/engine/identifiers/id/TableAndColumnRenames.js";
import { SimpleObjectProperty } from "../../../../src/engine/java/JavaFXBeans.js";
import { EditorContent } from "../../../../src/gui-logic/lex-editor/gui/lexeditor/EditorContent.js";
import { ExpressionLexer } from "../../../../src/gui-logic/lex-editor/gui/lexeditor/ExpressionLexer.js";
import { DummyManager } from "../../../engine/tests-functions/fixtures/DummyManager.js";
import { TFunctionUtil } from "../../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import type { ExpressionValue } from "../../../engine/tests-functions/fixtures/gen/ExpressionValue.js";
import { GenExpressionValueBackwards } from "../../../engine/tests-functions/fixtures/gen/GenExpressionValueBackwards.js";
import { GenExpressionValueForwards } from "../../../engine/tests-functions/fixtures/gen/GenExpressionValueForwards.js";
import { GenNonsenseExpression } from "../../../engine/tests-tables/fixtures/gen/nonsenseTrans/GenNonsenseExpression.js";
import { assertEquals } from "../../../support/junit.js";
import { CompositeGenerator, propertyTest } from "../../../support/quickcheck.js";

/**
 * Created by neil on 30/11/2016.
 */
describe("PropLoadSaveExpression", () =>
{
    propertyTest("testLoadSaveNonsense", [new GenNonsenseExpression()], (expression: Expression) =>
    {
        testLoadSave(expression);
    }, { trials: 200 });

    propertyTest("testEditNonsense", [new GenNonsenseExpression()], (expression: Expression) =>
    {
        testNoOpEdit(expression);
    }, { trials: 200, seed: -303310519735882501n });

    test("testUnit", () =>
    {
        testNoOpEditSrc("@define var\\\\N100m Time=@call tag\\\\Optional\\Is(0{s}),var\\\\N100yd time=@call tag\\\\Optional\\Is(0{s})@then@ifvar\\\\N100m Time=~@call tag\\\\Optional\\Is(var\\\\m)@then100{m}/var\\\\m@else@ifvar\\\\N100yd time=~@call tag\\\\Optional\\Is(var\\\\y)@then@call function\\\\core\\convert unit(unit{m/s},100{yard}/var\\\\y)@else0{m/s}@endif@endif@enddefine");
    });

    test("testInvalids", () =>
    {
        testNoOpEditSrc("@invalidops(2, @unfinished \"+\")");
        testNoOpEditSrc("@invalidops(2, @unfinished \"%\", 3)");
        testNoOpEditSrc("@invalidops(1, @unfinished \"+\", 2, @unfinished \"*\", 3)");
        testNoOpEditSrc("@invalidops(1, @unfinished \"+\", -2, @unfinished \"*\", 3)");
        testNoOpEditSrc("@invalidops(-1, @unfinished \"+\", -2, @unfinished \"*\", 3)");
        testNoOpEditSrc("-1");
    });

    propertyTest("testLoadSaveReal", [new CompositeGenerator<ExpressionValue>([new GenExpressionValueForwards(), new GenExpressionValueBackwards()])], (expressionValue: ExpressionValue) =>
    {
        // (Java also failed with the expression if it ran out of memory)
        testLoadSave(expressionValue.expression);
    }, { trials: 200 });
});

function testNoOpEditSrc(src: string): void
{
    const typeManager = DummyManager.make().getTypeManager();
    testNoOpEdit(TFunctionUtil.parseExpression(src, typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager())));
}

function testNoOpEdit(expression: Expression): void
{
    const typeManager = DummyManager.make().getTypeManager();
    // To preserve column references we have to have them in the lookup:
    // (Java: an anonymous ColumnLookup which, as this one, finds nothing, in a ReadOnlyObjectWrapper)
    const columnLookup = new SimpleObjectProperty<Expression.ColumnLookup>(TFunctionUtil.dummyColumnLookup());
    const functionLookup = FunctionList.getFunctionLookup(typeManager.getUnitManager());

    // Java: new ExpressionEditor(expression, ...).save(false)
    const text = expression.save(Expression.SaveDestination.toExpressionEditor(typeManager, columnLookup.get(), functionLookup), BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
    const edited = new EditorContent(text, new ExpressionLexer(columnLookup, typeManager, functionLookup, () => TFunctionUtil.createTypeState(typeManager), null)).getLexerResult().result;
    assertEquals(expression, edited);
    assertEquals(expression.save(Expression.SaveDestination.TO_FILE, BracketedStatus.NEED_BRACKETS, TableAndColumnRenames.EMPTY), edited.save(Expression.SaveDestination.TO_FILE, BracketedStatus.NEED_BRACKETS, TableAndColumnRenames.EMPTY));
    assertEquals(expression.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY), edited.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY));
}

function testLoadSave(expression: Expression): void
{
    const saved = expression.save(Expression.SaveDestination.TO_FILE, BracketedStatus.NEED_BRACKETS, TableAndColumnRenames.EMPTY);
    // Use same manager to load so that types are preserved:
    const typeManager = TFunctionUtil.managerWithTestTypes().getFirst().getTypeManager();
    const reloaded = TFunctionUtil.parseExpression(saved, typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager()));
    assertEquals("Saved version: " + saved, expression, reloaded);
    const resaved = reloaded.save(Expression.SaveDestination.TO_FILE, BracketedStatus.NEED_BRACKETS, TableAndColumnRenames.EMPTY);
    assertEquals(saved, resaved);
}
