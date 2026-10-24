// TestExpressionEditorCompletion (tests-gui-expression-editor-further), checked against the
// expression editor's content, display and completions (see makeEditor).  The GUI test edits the
// expression of a column "My Calc" of a Calculate "Calc" from a table "IDS" with a number column
// "My Number".  It also checks where the completion window shows (checkPosition), which is left to
// the GUI tests (Phase 7); here checkPosition checks the completions show.
import { describe, expect, test } from "vitest";
import { ColumnUtility } from "../../../../../src/engine/data/data/ColumnUtility.js";
import { ImmediateDataSource } from "../../../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../../../src/engine/data/data/EditableRecordSet.js";
import { Table } from "../../../../../src/engine/data/data/Table.js";
import { BracketedStatus } from "../../../../../src/engine/expressions/transformations/expression/BracketedStatus.js";
import { AddSubtractExpression, CallExpression, ComparisonExpression, Expression, IdentExpression, IfThenElseExpression, InvalidIdentExpression, InvalidOperatorExpression, NumericLiteral } from "../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../../../src/engine/identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../../../../src/engine/identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../../../src/engine/java/HashMap.js";
import { Decimal } from "../../../../../src/engine/java/JavaBigDecimal.js";
import { SimpleObjectProperty } from "../../../../../src/engine/java/JavaFXBeans.js";
import { Calculate } from "../../../../../src/engine/transformations/transformations/Calculate.js";
import { MultipleTableLookup } from "../../../../../src/engine/transformations/transformations/MultipleTableLookup.js";
import { DataType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { Pair } from "../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import type { ExpressionCompletionContext } from "../../../../../src/gui-logic/lex-editor/gui/lexeditor/ExpressionCompletionContext.js";
import { ExpressionLexer } from "../../../../../src/gui-logic/lex-editor/gui/lexeditor/ExpressionLexer.js";
import { DummyManager } from "../../../../engine/tests-functions/fixtures/DummyManager.js";
import { TFunctionUtil } from "../../../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { c, makeEditor, type Editing } from "../../../lex-editor/EditorHarness.js";

type ExpressionEditing = Editing<Expression, ExpressionCompletionContext>;

// Java's assertEquals(expected, finish()), which uses equals
function expectFinished(ed: ExpressionEditing, expected: Expression): void
{
    const actual = ed.finish();
    expect(actual.equals(expected), "Got " + actual.toStyledString().toPlain() + ", expected " + expected.toStyledString().toPlain()).toBe(true);
}

function finishExternal(ed: ExpressionEditing): string
{
    return ed.finish().save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
}

function loadExpression(expressionSrc: string): { ed: ExpressionEditing, mgr: DummyManager }
{
    const toLoad = new DummyManager();
    toLoad.record(
        new ImmediateDataSource(toLoad,
            new Table.InitialLoadDetails(new TableId("IDS"), null, null, null),
            new EditableRecordSet(
                [rs => ColumnUtility.makeImmediateColumn(DataType.NUMBER, new ColumnId("My Number"), new Decimal(0)).apply(rs)],
                () => 0)));
    const functionLookup = FunctionList.getFunctionLookup(toLoad.getUnitManager());
    const expression = TFunctionUtil.parseExpression(expressionSrc, toLoad.getTypeManager(), functionLookup);
    const calc = toLoad.record(new Calculate(toLoad, new Table.InitialLoadDetails(new TableId("Calc"), null, null, null), new TableId("IDS"), new HashMap([[new ColumnId("My Calc"), expression]])));

    // As TableDisplay/TransformationEdits make the editor for a column of a Calculate:
    const columnLookup = new MultipleTableLookup(calc.getId(), toLoad, calc.getSrcTableId(), calc.makeEditor(new ColumnId("My Calc")));
    const typeManager = toLoad.getTypeManager();
    // As ExpressionEditor gives its starting value to TopLevelEditor:
    const startingContent = expression.save(Expression.SaveDestination.toExpressionEditor(typeManager, columnLookup, functionLookup), BracketedStatus.DONT_NEED_BRACKETS, new TableAndColumnRenames([]));
    // Focusing the editor shows the completions (TopLevelEditor's focus listener):
    const ed = makeEditor(startingContent, new ExpressionLexer(new SimpleObjectProperty<Expression.ColumnLookup>(columnLookup), typeManager, functionLookup, () => Calculate.makeTypeState(toLoad), null), true);
    return { ed, mgr: toLoad };
}

describe("TestExpressionEditorCompletion", () =>
{
    test("testCompColumn", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.checkCompletions(
            c("My Number", 0, 0),
            c("table\\\\IDS", 0, 0),
            c("My Calc"), // Shouldn't see our own column
            c("table\\\\Calc") // Shouldn't see our own table
        );
        ed.write("My Nu");
        ed.checkCompletions(
            c("My Number", 0, 5),
            c("table\\\\IDS", 0, 0),
            c("My Calc"), // Shouldn't see our own column
            c("table\\\\Calc") // Shouldn't see our own table
        );
        ed.push("END");
        ed.write("Q");
        ed.checkCompletions(
            c("My Number", 0, 5),
            c("My Calc") // Shouldn't see our own column
        );
        ed.push("END");
        ed.write("+t");
        // Content is now:
        // My NuQ+t

        // Completions which don't match should still show at start of token:
        ed.checkCompletions(c("My Number", 0, 5, 7, 7),
            c("true", 0, 0, 7, 8),
            c("false", 0, 0, 7, 7),
            c("@then", 0, 0, 7, 8),
            c("@if", 0, 0, 7, 7));
    });

    test("testRelatedColumn", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("Nu");
        ed.checkCompletions(
            c("My Number", 0, 2)
        );
    });

    test("testRelatedFunction", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("text");
        ed.checkCompletions(
            c("from text to()", 0, 4)
        );
    });

    test("testCompIf", () =>
    {
        const { ed } = loadExpression("@if true | false @then 12{m} @else @callfunction\\\\from text to(type{Number{m}}, \"34\")@endif");
        // Will turn into:
        // @iftrue|false@then12{m}@elsefrom text to(type{Number{m}},"34")@endif
        ed.checkCompletions(
            // match at the start of every token:
            c("@match", 0, 0, 3, 3, 8, 8, 18, 18, 23, 23, 28, 28, 41, 41, 56, 56, 57, 57, 61, 61, 62, 62, 68, 68),
            c("@then", 0, 0, 3, 4, 8, 8, 18, 18, 23, 23, 28, 28, 41, 41, 56, 56, 57, 57, 61, 61, 62, 62, 68, 68),
            c("false", 0, 0, 3, 3, 8, 13, 18, 18, 23, 23, 28, 29, 41, 41, 56, 56, 57, 57, 61, 61, 62, 62, 68, 68),
            c("type{}", 0, 0, 3, 4, 8, 8, 18, 18, 23, 23, 28, 28, 41, 41, 56, 56, 57, 57, 61, 61, 62, 62, 68, 68),
            c("Boolean", 46, 46, 55, 55),
            c("minute", 21, 22, 53, 54),
            c("hour", 21, 21, 53, 53)
        );
    });

    test("testColumn1", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("My Nu");
        ed.checkPosition();
        ed.push("DOWN");
        ed.push("ENTER");
        expectFinished(ed, IdentExpression.column(new ColumnId("My Number")));
    });

    test("testColumn1b", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("My Nu");
        ed.checkPosition();
        // Click first cell:
        // Doesn't matter if registered as double click or two single:
        const listView = ed.display._test_getAutoComplete()._test_getWindow()!.listView;
        listView.clickOnItem(1, new Pair(0, 0));
        listView.clickOnItem(1, new Pair(0, 0));
        expectFinished(ed, IdentExpression.column(new ColumnId("My Number")));
    });

    test("testColumn2", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("table\\\\ID");
        ed.checkPosition();
        ed.push("DOWN");
        ed.push("ENTER");
        expectFinished(ed, IdentExpression.table("IDS"));
    });

    test("testColumn2a", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("table\\\\id");
        ed.checkPosition();
        ed.push("DOWN");
        ed.push("ENTER");
        expectFinished(ed, IdentExpression.table("IDS"));
    });

    test("testColumn2b", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("tab");
        ed.checkPosition();
        ed.push("DOWN");
        ed.push("ENTER");
        expectFinished(ed, IdentExpression.table("IDS"));
    });

    test("testIsolatedKeyword", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("@el");
        ed.checkPosition();
        // Should be single completion that is auto-selected:
        ed.push("ENTER");
        // Don't care exactly how it's saved, as long as keyword is in there:
        expect(finishExternal(ed)).toContain("^aelse");
    });

    test("testInsertIfBefore1", () =>
    {
        const { ed } = loadExpression("column\\\\My Number");
        ed.push("HOME");
        ed.write("@if ");
        const finished = finishExternal(ed);
        // Don't care exactly how it's saved:
        expect(finished).toContain("^aif");
        expect(finished).toContain("My Number");
    });

    test("testInsertIfBefore1b", () =>
    {
        const { ed } = loadExpression("column\\\\My Number");
        ed.push("HOME");
        ed.write("if");
        ed.checkPosition();
        ed.push("DOWN");
        ed.push("ENTER");
        const finished = finishExternal(ed);
        // Don't care exactly how it's saved:
        expect(finished).toContain("^aif");
        expect(finished).toContain("My Number");
    });

    test("testInsertIfBefore2", () =>
    {
        const { ed } = loadExpression("column\\\\My Number");
        ed.push("HOME");
        ed.write("@iftrue@then");
        ed.checkPosition();
        ed.push("END");
        ed.write("@else0@endif");
        const finished = finishExternal(ed);
        expect(finished).toBe("@if true @then column\\\\My Number @else 0 @endif");
    });

    test("testWholeIfByCompletion", () =>
    {
        // Top completion in blank expression should be to insert a complete if statement.
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("@i");
        ed.checkPosition();
        ed.push("ENTER");
        // It's going to be invalid due to the empty bits:
        expectFinished(ed, IfThenElseExpression.unrecorded(new InvalidOperatorExpression([]), new InvalidOperatorExpression([]), new InvalidOperatorExpression([])));
    });

    test("testWholeIfByCompletion2", () =>
    {
        // Top completion in blank expression should be to insert a complete if statement.
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("if");
        ed.checkPosition();
        ed.push("ENTER");
        // It's going to be invalid due to the empty bits:
        expectFinished(ed, IfThenElseExpression.unrecorded(new InvalidOperatorExpression([]), new InvalidOperatorExpression([]), new InvalidOperatorExpression([])));
    });

    test("testJustIfByTyping", () =>
    {
        // Top completion in blank expression should be to insert a complete if statement.
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("@i");
        ed.checkPosition();
        ed.write("f");
        // It's going to be invalid due to the empty bits:
        expectFinished(ed, new InvalidOperatorExpression([new InvalidIdentExpression("@if"), new InvalidOperatorExpression([])]));
    });

    test("testJustIfByCompletion", () =>
    {
        // Top completion in blank expression should be to insert a complete if statement.
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("@i");
        ed.checkPosition();
        ed.push("DOWN");
        ed.push("ENTER");
        // It's going to be invalid due to the empty bits:
        expectFinished(ed, new InvalidOperatorExpression([new InvalidIdentExpression("@if"), new InvalidOperatorExpression([])]));
    });

    test("testJustIfByTypingWithoutAt", () =>
    {
        // Top completion in blank expression should be to insert a complete if statement.
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("if");
        ed.checkPosition();
        ed.push("DOWN");
        ed.push("ENTER");
        // It's going to be invalid due to the empty bits:
        expectFinished(ed, new InvalidOperatorExpression([new InvalidIdentExpression("@if"), new InvalidOperatorExpression([])]));
    });

    test("testLong", () =>
    {
        // Check a long multi-line expression still shows completion in right place:
        const { ed } = loadExpression("@if true @then 0 @else 1 @endif + @if true @then 0 @else 1 @endif + @if true @then 0 @else 1 @endif + @if true @then 0 @else 1 @endif");
        ed.push("END");
        ed.write("+My Number");
        ed.checkPosition();
        ed.push("DOWN");
        ed.push("ENTER");
        expect(finishExternal(ed)).toBe("@if true @then 0 @else 1 @endif + @if true @then 0 @else 1 @endif + @if true @then 0 @else 1 @endif + @if true @then 0 @else 1 @endif + column\\\\My Number");
    });

    test("testCompPartial", () =>
    {
        // From a failing test:
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("as type(type{Number{1}},from ");
        // Get rid of auto-inserted bracket:
        ed.push("DELETE");
        ed.checkCompletions(
            c("type{}", 0, 0, 8, 8, 23, 23, 24, 24),
            c("from text()", 0, 0, 8, 8, 23, 23, 24, 29)
        );
    });

    test("testNumMinus1", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("12");
        ed.checkPosition();
        ed.scrollLexAutoCompleteToOption("-");
        ed.push("ENTER");
        ed.write("3");
        expectFinished(ed, new AddSubtractExpression([new NumericLiteral(new Decimal(12), null), new NumericLiteral(new Decimal(3), null)], [AddSubtractExpression.AddSubtractOp.SUBTRACT]));
    });

    test("testNumMinus1b", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("123");
        ed.checkPosition();
        ed.push("LEFT");
        ed.scrollLexAutoCompleteToOption("-");
        ed.push("ENTER");
        expectFinished(ed, new AddSubtractExpression([new NumericLiteral(new Decimal(12), null), new NumericLiteral(new Decimal(3), null)], [AddSubtractExpression.AddSubtractOp.SUBTRACT]));
    });

    test("testLongOp", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("1<2");
        ed.checkPosition();
        ed.push("LEFT");
        ed.scrollLexAutoCompleteToOption("<=");
        ed.push("ENTER");
        expectFinished(ed, new ComparisonExpression([new NumericLiteral(new Decimal(1), null), new NumericLiteral(new Decimal(2), null)], [ComparisonExpression.ComparisonOperator.LESS_THAN_OR_EQUAL_TO]));
    });

    test("testTrailingOperator1", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("1+");
        ed.checkCompletions(
            c("My Number", 0, 0, 2, 2),
            c("+", 1, 2),
            c("*", 1, 1),
            // Plus-minus shows as multi-char completion of plus:
            c("±", 1, 2)
        );
    });

    test("testTrailingOperator1b", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("(12/34)+");
        ed.checkCompletions(
            c("My Number", 0, 1, 4, 4, 7, 8),
            c("+", 2, 3, 5, 8),
            c("*", 2, 3, 5, 7),
            // Plus-minus shows as multi-char completion of plus:
            c("±", 2, 3, 5, 8)
        );
    });

    test("testTrailingOperator2", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("12<");
        ed.checkCompletions(
            c("My Number", 0, 0, 3, 3),
            c("+", 1, 2),
            c("<", 1, 3),
            c("<=", 1, 3),
            c("<>", 1, 3)
        );
    });

    test("testTrailingOperator2b", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("(12/34)<");
        ed.checkCompletions(
            c("My Number", 0, 1, 4, 4, 7, 8),
            c("+", 2, 3, 5, 7),
            c("<", 2, 3, 5, 8),
            c("<=", 2, 3, 5, 8),
            c("<>", 2, 3, 5, 8)
        );
    });

    test("testEndOperator", () =>
    {
        const { ed } = loadExpression("@unfinished \"\"");
        ed.write("1+2");
        ed.checkCompletions(
            c("My Number", 0, 0, 2, 2),
            c("+", 1, 3),
            c("*", 1, 1, 3, 3)
        );
    });

    test("testRelatedFunction2", () =>
    {
        const { ed, mgr } = loadExpression("@unfinished \"\"");
        ed.write("tex");
        ed.checkPosition();
        ed.scrollLexAutoCompleteToOption("from text to()");
        ed.push("ENTER");
        ed.write("1");
        const fromTextTo = IdentExpression.function(FunctionList.getFunctionLookup(mgr.getUnitManager()).lookup("from text to")!.getFullName());
        expectFinished(ed, new CallExpression(fromTextTo, [new NumericLiteral(new Decimal(1), null)]));
    });

    test("testRelatedFunction2b", () =>
    {
        const { ed, mgr } = loadExpression("@unfinished \"\"");
        ed.write("tex");
        ed.checkPosition();
        ed.push("LEFT");
        ed.scrollLexAutoCompleteToOption("from text to()");
        ed.push("ENTER");
        ed.write("1");
        const functionLookup = FunctionList.getFunctionLookup(mgr.getUnitManager());
        // Should still have trailing x:
        expectFinished(ed, TFunctionUtil.parseExpression("@invalidops(@call function\\\\conversion\\from text to(1), x)", mgr.getTypeManager(), functionLookup));
    });
});
