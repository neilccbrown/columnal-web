// The port of TestExpressionEditorCompletion (tests-gui-expression-editor-further): the completions the
// expression editor shows, where its completion list shows, and choosing completions, editing the
// expression of a column "My Calc" of a Calculate "Calc" from a table "IDS" with a number column
// "My Number".  (Also ported headless, in test/gui-logic/tests-gui-expression-editor-further.)
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ColumnUtility } from "../../../src/engine/data/data/ColumnUtility.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import { BracketedStatus } from "../../../src/engine/expressions/transformations/expression/BracketedStatus.js";
import { AddSubtractExpression, CallExpression, ComparisonExpression, Expression, IdentExpression, IfThenElseExpression, InvalidIdentExpression, InvalidOperatorExpression, NumericLiteral } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../../src/engine/identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { scrollLexAutoCompleteToOption } from "../base/autoComplete.js";
import { doubleOk } from "../base/doubleOk.js";
import { c, checkCompletions, type CompletionCheck } from "../base/editorCompletion.js";
import { settle, waitForOneEditor } from "../base/editorDisplay.js";
import { push, write } from "../base/keyboard.js";
import { sleep } from "../base/util.js";
import { closeApp, engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

// Java's KeyCode names, as the headless port has them
const KEYS: Record<string, string> = { DOWN: "ArrowDown", LEFT: "ArrowLeft", ENTER: "Enter", END: "End", HOME: "Home", DELETE: "Delete" };

// The steps of the test (Java's TestFX calls, and the test's own methods), as the headless port has them
const ed = {
    write: async (text: string): Promise<void> => { await write(text); await settle(); },
    push: async (key: string): Promise<void> => { await push(KEYS[key]!); await settle(); },
    checkCompletions: (...checks: CompletionCheck[]): Promise<void> => checkCompletions(...checks),
    scrollLexAutoCompleteToOption,
    checkPosition,
};
type Editing = typeof ed;

// Opens the expression of the Calculate's column, with the expression given (in the format of a file)
async function loadExpression(expressionSrc: string): Promise<{ ed: Editing, mgr: TableManager }>
{
    let mgr: TableManager | null = null;
    const content = savedFile(toLoad =>
    {
        mgr = toLoad;
        toLoad.record(
            new ImmediateDataSource(toLoad,
                new Table.InitialLoadDetails(new TableId("IDS"), null, new CellPosition(CellPosition.row(1), CellPosition.col(1)), null),
                new EditableRecordSet(
                    [rs => ColumnUtility.makeImmediateColumn(DataType.NUMBER, new ColumnId("My Number"), new Decimal(0)).apply(rs)],
                    () => 0)));
        toLoad.record(new Calculate(toLoad, new Table.InitialLoadDetails(new TableId("Calc"), null, new CellPosition(CellPosition.row(1), CellPosition.col(6)), null), new TableId("IDS"), new HashMap([[new ColumnId("My Calc"), TFunctionUtil.parseExpression(expressionSrc, toLoad.getTypeManager(), FunctionList.getFunctionLookup(toLoad.getUnitManager()))]])));
    });
    app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 2);
    // Not much more to do -- just edit the expression
    await userEvent.click(await vi.waitUntil(() => [...document.querySelectorAll(".column-title")].find(l => l.textContent?.trim().startsWith("My C") === true)));
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true, { timeout: 5000 });
    // Close auto-complete:
    await push("Escape");
    await push("Tab");
    await settle();
    return { ed, mgr: mgr! };
}

async function finish(): Promise<Expression>
{
    await doubleOk();
    await sleep(500);
    await engineHost(app!).idle();
    const calc = engineHost(app!).tableManager.getSingleTableOrThrow(new TableId("Calc")) as Calculate;
    const expression = calc.getCalculatedColumns().get(new ColumnId("My Calc")) ?? null;
    expect(expression, "My Calc's expression").not.toBeNull();
    return expression!;
}

async function finishExternal(_ed: Editing): Promise<string>
{
    return (await finish()).save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
}

// Java's assertEquals(expected, finish()), which uses equals
async function expectFinished(_ed: Editing, expected: Expression): Promise<void>
{
    const actual = await finish();
    expect(actual.equals(expected), "Got " + actual.toStyledString().toPlain() + ", expected " + expected.toStyledString().toPlain()).toBe(true);
}

// The completion list shows just below the caret, with the completions' text in line with where they
// would go in the editor
async function checkPosition(): Promise<void>
{
    const editorDisplay = await waitForOneEditor();
    await settle();
    const lists = document.querySelectorAll(".lex-completion-list");
    expect(lists.length).toBe(1);
    const view = editorDisplay._test_getView()!;
    const caretBottom = view.coordsAtPos(view.state.selection.main.head)!.bottom;
    expect(Math.abs(lists[0]!.getBoundingClientRect().top - caretBottom), "Top of list from caret bottom").toBeLessThanOrEqual(2);
    const content = editorDisplay._test_getContent();
    const targetStartPos = Math.min(...editorDisplay._test_getDisplay()._test_getAutoComplete()._test_getWindow()!._test_getShowing().map(s => s.startPos));
    const target = view.coordsAtPos(content.mapContentToDisplay(Number.isFinite(targetStartPos) ? targetStartPos : 0))!;
    const edX = (target.left + target.right) / 2;
    const compText = [...lists[0]!.querySelectorAll(".lex-completion:not(.lex-completion-header) .lex-completion-text-flow")].filter(t => t.textContent !== "");
    const compX = compText.reduce((sum, t) => sum + t.getBoundingClientRect().left, 0) / compText.length;
    expect(Math.abs(compX - edX), "Completions' text from the start of the completed text").toBeLessThanOrEqual(1);
}

describe("TestExpressionEditorCompletion", () =>
{
    test("testCompColumn", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.checkCompletions(
            c("My Number", 0, 0),
            c("table\\\\IDS", 0, 0),
            c("My Calc"), // Shouldn't see our own column
            c("table\\\\Calc") // Shouldn't see our own table
        );
        await ed.write("My Nu");
        await ed.checkCompletions(
            c("My Number", 0, 5),
            c("table\\\\IDS", 0, 0),
            c("My Calc"), // Shouldn't see our own column
            c("table\\\\Calc") // Shouldn't see our own table
        );
        await ed.push("END");
        await ed.write("Q");
        await ed.checkCompletions(
            c("My Number", 0, 5),
            c("My Calc") // Shouldn't see our own column
        );
        await ed.push("END");
        await ed.write("+t");
        // Content is now:
        // My NuQ+t

        // Completions which don't match should still show at start of token:
        await ed.checkCompletions(c("My Number", 0, 5, 7, 7),
            c("true", 0, 0, 7, 8),
            c("false", 0, 0, 7, 7),
            c("@then", 0, 0, 7, 8),
            c("@if", 0, 0, 7, 7));
    });

    test("testRelatedColumn", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("Nu");
        await ed.checkCompletions(
            c("My Number", 0, 2)
        );
    });

    test("testRelatedFunction", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("text");
        await ed.checkCompletions(
            c("from text to()", 0, 4)
        );
    });

    test("testCompIf", async () =>
    {
        const { ed } = await loadExpression("@if true | false @then 12{m} @else @callfunction\\\\from text to(type{Number{m}}, \"34\")@endif");
        // Will turn into:
        // @iftrue|false@then12{m}@elsefrom text to(type{Number{m}},"34")@endif
        await ed.checkCompletions(
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

    test("testColumn1", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("My Nu");
        await ed.checkPosition();
        await ed.push("DOWN");
        await ed.push("ENTER");
        await expectFinished(ed, IdentExpression.column(new ColumnId("My Number")));
    });

    test("testColumn1b", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("My Nu");
        await ed.checkPosition();
        // Click first cell:
        // Doesn't matter if registered as double click or two single:
        const cell = [...document.querySelectorAll(".lex-completion")].sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)[0]!;
        await userEvent.click(cell, { position: { x: cell.getBoundingClientRect().width / 2 + 5, y: cell.getBoundingClientRect().height / 2 } });
        await userEvent.click(cell, { position: { x: cell.getBoundingClientRect().width / 2 + 5, y: cell.getBoundingClientRect().height / 2 } });
        await expectFinished(ed, IdentExpression.column(new ColumnId("My Number")));
    });

    test("testColumn2", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("table\\\\ID");
        await ed.checkPosition();
        await ed.push("DOWN");
        await ed.push("ENTER");
        await expectFinished(ed, IdentExpression.table("IDS"));
    });

    test("testColumn2a", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("table\\\\id");
        await ed.checkPosition();
        await ed.push("DOWN");
        await ed.push("ENTER");
        await expectFinished(ed, IdentExpression.table("IDS"));
    });

    test("testColumn2b", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("tab");
        await ed.checkPosition();
        await ed.push("DOWN");
        await ed.push("ENTER");
        await expectFinished(ed, IdentExpression.table("IDS"));
    });

    test("testIsolatedKeyword", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("@el");
        await ed.checkPosition();
        // Should be single completion that is auto-selected:
        await ed.push("ENTER");
        // Don't care exactly how it's saved, as long as keyword is in there:
        expect((await finishExternal(ed))).toContain("^aelse");
    });

    test("testInsertIfBefore1", async () =>
    {
        const { ed } = await loadExpression("column\\\\My Number");
        await ed.push("HOME");
        await ed.write("@if ");
        const finished = (await finishExternal(ed));
        // Don't care exactly how it's saved:
        expect(finished).toContain("^aif");
        expect(finished).toContain("My Number");
    });

    test("testInsertIfBefore1b", async () =>
    {
        const { ed } = await loadExpression("column\\\\My Number");
        await ed.push("HOME");
        await ed.write("if");
        await ed.checkPosition();
        await ed.push("DOWN");
        await ed.push("ENTER");
        const finished = (await finishExternal(ed));
        // Don't care exactly how it's saved:
        expect(finished).toContain("^aif");
        expect(finished).toContain("My Number");
    });

    test("testInsertIfBefore2", async () =>
    {
        const { ed } = await loadExpression("column\\\\My Number");
        await ed.push("HOME");
        await ed.write("@iftrue@then");
        await ed.checkPosition();
        await ed.push("END");
        await ed.write("@else0@endif");
        const finished = (await finishExternal(ed));
        expect(finished).toBe("@if true @then column\\\\My Number @else 0 @endif");
    });

    test("testWholeIfByCompletion", async () =>
    {
        // Top completion in blank expression should be to insert a complete if statement.
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("@i");
        await ed.checkPosition();
        await ed.push("ENTER");
        // It's going to be invalid due to the empty bits:
        await expectFinished(ed, IfThenElseExpression.unrecorded(new InvalidOperatorExpression([]), new InvalidOperatorExpression([]), new InvalidOperatorExpression([])));
    });

    test("testWholeIfByCompletion2", async () =>
    {
        // Top completion in blank expression should be to insert a complete if statement.
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("if");
        await ed.checkPosition();
        await ed.push("ENTER");
        // It's going to be invalid due to the empty bits:
        await expectFinished(ed, IfThenElseExpression.unrecorded(new InvalidOperatorExpression([]), new InvalidOperatorExpression([]), new InvalidOperatorExpression([])));
    });

    test("testJustIfByTyping", async () =>
    {
        // Top completion in blank expression should be to insert a complete if statement.
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("@i");
        await ed.checkPosition();
        await ed.write("f");
        // It's going to be invalid due to the empty bits:
        await expectFinished(ed, new InvalidOperatorExpression([new InvalidIdentExpression("@if"), new InvalidOperatorExpression([])]));
    });

    test("testJustIfByCompletion", async () =>
    {
        // Top completion in blank expression should be to insert a complete if statement.
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("@i");
        await ed.checkPosition();
        await ed.push("DOWN");
        await ed.push("ENTER");
        // It's going to be invalid due to the empty bits:
        await expectFinished(ed, new InvalidOperatorExpression([new InvalidIdentExpression("@if"), new InvalidOperatorExpression([])]));
    });

    test("testJustIfByTypingWithoutAt", async () =>
    {
        // Top completion in blank expression should be to insert a complete if statement.
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("if");
        await ed.checkPosition();
        await ed.push("DOWN");
        await ed.push("ENTER");
        // It's going to be invalid due to the empty bits:
        await expectFinished(ed, new InvalidOperatorExpression([new InvalidIdentExpression("@if"), new InvalidOperatorExpression([])]));
    });

    test("testLong", async () =>
    {
        // Check a long multi-line expression still shows completion in right place:
        const { ed } = await loadExpression("@if true @then 0 @else 1 @endif + @if true @then 0 @else 1 @endif + @if true @then 0 @else 1 @endif + @if true @then 0 @else 1 @endif");
        await ed.push("END");
        await ed.write("+My Number");
        await ed.checkPosition();
        await ed.push("DOWN");
        await ed.push("ENTER");
        expect((await finishExternal(ed))).toBe("@if true @then 0 @else 1 @endif + @if true @then 0 @else 1 @endif + @if true @then 0 @else 1 @endif + @if true @then 0 @else 1 @endif + column\\\\My Number");
    });

    test("testCompPartial", async () =>
    {
        // From a failing test:
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("as type(type{Number{1}},from ");
        // Get rid of auto-inserted bracket:
        await ed.push("DELETE");
        await ed.checkCompletions(
            c("type{}", 0, 0, 8, 8, 23, 23, 24, 24),
            c("from text()", 0, 0, 8, 8, 23, 23, 24, 29)
        );
    });

    test("testNumMinus1", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("12");
        await ed.checkPosition();
        await ed.scrollLexAutoCompleteToOption("-");
        await ed.push("ENTER");
        await ed.write("3");
        await expectFinished(ed, new AddSubtractExpression([new NumericLiteral(new Decimal(12), null), new NumericLiteral(new Decimal(3), null)], [AddSubtractExpression.AddSubtractOp.SUBTRACT]));
    });

    test("testNumMinus1b", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("123");
        await ed.checkPosition();
        await ed.push("LEFT");
        await ed.scrollLexAutoCompleteToOption("-");
        await ed.push("ENTER");
        await expectFinished(ed, new AddSubtractExpression([new NumericLiteral(new Decimal(12), null), new NumericLiteral(new Decimal(3), null)], [AddSubtractExpression.AddSubtractOp.SUBTRACT]));
    });

    test("testLongOp", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("1<2");
        await ed.checkPosition();
        await ed.push("LEFT");
        await ed.scrollLexAutoCompleteToOption("<=");
        await ed.push("ENTER");
        await expectFinished(ed, new ComparisonExpression([new NumericLiteral(new Decimal(1), null), new NumericLiteral(new Decimal(2), null)], [ComparisonExpression.ComparisonOperator.LESS_THAN_OR_EQUAL_TO]));
    });

    test("testTrailingOperator1", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("1+");
        await ed.checkCompletions(
            c("My Number", 0, 0, 2, 2),
            c("+", 1, 2),
            c("*", 1, 1),
            // Plus-minus shows as multi-char completion of plus:
            c("±", 1, 2)
        );
    });

    test("testTrailingOperator1b", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("(12/34)+");
        await ed.checkCompletions(
            c("My Number", 0, 1, 4, 4, 7, 8),
            c("+", 2, 3, 5, 8),
            c("*", 2, 3, 5, 7),
            // Plus-minus shows as multi-char completion of plus:
            c("±", 2, 3, 5, 8)
        );
    });

    test("testTrailingOperator2", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("12<");
        await ed.checkCompletions(
            c("My Number", 0, 0, 3, 3),
            c("+", 1, 2),
            c("<", 1, 3),
            c("<=", 1, 3),
            c("<>", 1, 3)
        );
    });

    test("testTrailingOperator2b", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("(12/34)<");
        await ed.checkCompletions(
            c("My Number", 0, 1, 4, 4, 7, 8),
            c("+", 2, 3, 5, 7),
            c("<", 2, 3, 5, 8),
            c("<=", 2, 3, 5, 8),
            c("<>", 2, 3, 5, 8)
        );
    });

    test("testEndOperator", async () =>
    {
        const { ed } = await loadExpression("@unfinished \"\"");
        await ed.write("1+2");
        await ed.checkCompletions(
            c("My Number", 0, 0, 2, 2),
            c("+", 1, 3),
            c("*", 1, 1, 3, 3)
        );
    });

    test("testRelatedFunction2", async () =>
    {
        const { ed, mgr } = await loadExpression("@unfinished \"\"");
        await ed.write("tex");
        await ed.checkPosition();
        await ed.scrollLexAutoCompleteToOption("from text to()");
        await ed.push("ENTER");
        await ed.write("1");
        const fromTextTo = IdentExpression.function(FunctionList.getFunctionLookup(mgr.getUnitManager()).lookup("from text to")!.getFullName());
        await expectFinished(ed, new CallExpression(fromTextTo, [new NumericLiteral(new Decimal(1), null)]));
    });

    test("testRelatedFunction2b", async () =>
    {
        const { ed, mgr } = await loadExpression("@unfinished \"\"");
        await ed.write("tex");
        await ed.checkPosition();
        await ed.push("LEFT");
        await ed.scrollLexAutoCompleteToOption("from text to()");
        await ed.push("ENTER");
        await ed.write("1");
        const functionLookup = FunctionList.getFunctionLookup(mgr.getUnitManager());
        // Should still have trailing x:
        await expectFinished(ed, TFunctionUtil.parseExpression("@invalidops(@call function\\\\conversion\\from text to(1), x)", mgr.getTypeManager(), functionLookup));
    });
});
