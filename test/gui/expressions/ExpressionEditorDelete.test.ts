// The port of TestExpressionEditorDelete (tests-gui-expression-editor-delete): an expression is typed
// into a new Calculate column's expression editor, then part of it is deleted (Backspace, Delete, or
// selecting and cutting), or deleted and typed or pasted again, or something pasted into it.
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { _test_editors, type TopLevelEditorApi } from "../../../src/gui/lexeditor/TopLevelEditorApi.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { checkProperty } from "../../support/quickcheck.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { DummyManager } from "../../engine/tests-functions/fixtures/DummyManager.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { triggerTableHeaderContextMenu } from "../base/clickOnTableHeader.js";
import { enterExpression, EntryBracketStatus } from "../base/enterExpression.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { sleep } from "../base/util.js";
import { closeApp, engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

const targetPos = new CellPosition(CellPosition.row(2), CellPosition.col(2));
const shortcut = (key: string): string => isMac() ? `{Meta>}${key}{/Meta}` : `{Control>}${key}{/Control}`;

// Java: setupWindow (before each trial), TAppUtil.openDataAsTable with an empty table
async function setupWindow(): Promise<RenderedApp>
{
    if (app !== null)
        await closeApp(app);
    const content = savedFile(manager =>
    {
        manager.record(new ImmediateDataSource(manager, new Table.InitialLoadDetails(new TableId("Table1"), null, CellPosition.ORIGIN.offsetByRowCols(1, 1), null), new EditableRecordSet([], () => 0)));
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 1);
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    return a;
}

const tableCount = (a: RenderedApp): number => engineHost(a).tableManager.getAllTables().length;

function parse(src: string): Expression
{
    const dummyManager = new DummyManager();
    return TFunctionUtil.parseExpression(src, dummyManager.getTypeManager(), FunctionList.getFunctionLookup(dummyManager.getUnitManager()));
}

function expectSame(after: Expression, expected: Expression): void
{
    expect(after.toString()).toBe(expected.toString());
    expect(after.equals(expected)).toBe(true);
}

async function cancel(): Promise<void>
{
    const button = document.querySelector(".cancel-button")!.getBoundingClientRect();
    await moveAndDismissPopupsAtPos({ x: button.left + button.width / 2, y: button.top + button.height / 2 });
    await userEvent.click(document.querySelector(".cancel-button")!);
    await vi.waitUntil(() => document.querySelector(".expression-editor") === null);
}

// Java: enter: New ▸ Transform ▸ Calculate of Table1, column DestCol, and the expression typed
async function enter(a: RenderedApp, expression: Expression, r: JavaRandom): Promise<TopLevelEditorApi<Expression>>
{
    const grid = a.mainWindow()!.grid()!.grid;
    await userEvent.keyboard(shortcut("{Home}"));
    for (let i = 0; i < 2; i++)
        await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(targetPos, targetPos));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-calculate")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("text-field") === true);
    await write("Table1");
    await push("Enter");
    await sleep(200);
    // (The dialog shows once the engine has made the Calculate)
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true, { timeout: 5000 });
    await write("DestCol");
    // Focus expression editor:
    await push("Tab");
    await enterExpression(engineHost(a).tableManager.getTypeManager(), expression, EntryBracketStatus.SURROUNDED_BY_KEYWORDS, r);
    return _test_editors.get(document.querySelector(".expression-editor")!) as unknown as TopLevelEditorApi<Expression>;
}

// Java: _test_positionCaret
async function positionCaret(editor: TopLevelEditorApi<Expression>, pos: number): Promise<void>
{
    editor._test_getContent().positionCaret(pos, true);
    await sleep(0);
}

async function testBackspace(a: RenderedApp, original: string, deleteBefore: number, deleteCount: number, expectedStr: string, r: JavaRandom): Promise<void>
{
    const expectedExp = parse(expectedStr);
    const originalExp = parse(original);
    const editor = await enter(a, originalExp, r);
    expectSame(editor.save(false), originalExp);
    await positionCaret(editor, deleteBefore);
    for (let i = 0; i < deleteCount; i++)
        await push("Backspace");
    await sleep(1000);
    expectSame(editor.save(false), expectedExp);
    await cancel();
}

async function testDelete(a: RenderedApp, original: string, deleteAfter: number, deleteCount: number, expectedStr: string, r: JavaRandom): Promise<void>
{
    const expectedExp = parse(expectedStr);
    const editor = await enter(a, parse(original), r);
    await positionCaret(editor, deleteAfter);
    for (let i = 0; i < deleteCount; i++)
        await push("Delete");
    expectSame(editor.save(false), expectedExp);
    await cancel();
}

async function testCut(a: RenderedApp, original: string, deleteAfter: number, deleteCount: number, expectedStr: string, r: JavaRandom): Promise<void>
{
    const expectedExp = parse(expectedStr);
    const editor = await enter(a, parse(original), r);
    await positionCaret(editor, deleteAfter);
    await userEvent.keyboard("{Shift>}" + "{ArrowRight}".repeat(deleteCount) + "{/Shift}");
    if (r.nextBoolean())
        await push("Delete");
    else
    {
        // Test copy does same as cut:
        await navigator.clipboard.writeText("EMPTY");
        await userEvent.keyboard(shortcut("c"));
        const copied = await navigator.clipboard.readText();
        await navigator.clipboard.writeText("EMPTY");
        await userEvent.keyboard(shortcut("x"));
        expect(await navigator.clipboard.readText()).toBe(copied);
    }
    expectSame(editor.save(false), expectedExp);
    await userEvent.click(document.querySelector(".cancel-button")!);
    await vi.waitUntil(() => document.querySelector(".expression-editor") === null);
}

async function deleteCalculate(a: RenderedApp): Promise<void>
{
    expect(tableCount(a)).toBe(2);
    await triggerTableHeaderContextMenu(a.mainWindow()!.grid()!.grid, targetPos);
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-delete")));
    await sleep(300);
    await vi.waitUntil(() => tableCount(a) === 1);
}

function testDeleteBackspace(original: string, deleteAfterPos: number, deleteCount: number, expectedStr: string, trials: number, cutCount?: number): Promise<void>
{
    return checkProperty([new GenRandom()], async (r: JavaRandom) =>
    {
        const a = await setupWindow();
        expect(tableCount(a)).toBe(1);
        await testBackspace(a, original, deleteAfterPos + deleteCount, deleteCount, expectedStr, r);
        await deleteCalculate(a);
        await testDelete(a, original, deleteAfterPos, deleteCount, expectedStr, r);
        await deleteCalculate(a);
        if (cutCount === undefined || cutCount > 0)
            await testCut(a, original, deleteAfterPos, cutCount ?? deleteCount, expectedStr, r);
    }, { trials });
}

function testBackspaceRetype(original: string, deleteBefore: number, deleteCount: number, retype: string, trials: number): Promise<void>
{
    return checkProperty([new GenRandom()], async (r: JavaRandom) =>
    {
        const a = await setupWindow();
        const originalExp = parse(original);
        const editor = await enter(a, originalExp, r);
        await positionCaret(editor, deleteBefore);
        await sleep(200);
        for (let i = 0; i < deleteCount; i++)
            await push("Backspace");
        if (r.nextBoolean())
            await write(retype);
        else
        {
            await navigator.clipboard.writeText(retype);
            await userEvent.keyboard(shortcut("v"));
        }
        expectSame(editor.save(false), originalExp);
        await cancel();
    }, { trials });
}

function testPaste(original: string, caretPos: number, paste: string, expected: string, trials: number): Promise<void>
{
    return checkProperty([new GenRandom()], async (r: JavaRandom) =>
    {
        const a = await setupWindow();
        const editor = await enter(a, parse(original), r);
        await positionCaret(editor, caretPos);
        await navigator.clipboard.writeText(paste);
        await userEvent.keyboard(shortcut("v"));
        expectSame(editor.save(false), parse(expected));
        await cancel();
    }, { trials });
}

describe("TestExpressionEditorDelete", () =>
{
    test("testDeleteAfterOperand", () => checkProperty([new GenRandom()], async (r: JavaRandom) =>
    {
        const a = await setupWindow();
        await testBackspace(a, "true&false", 10, 1, "true & fals", r);
    }, { trials: 3 }), 300_000);
    test("testDeleteAfterInvalidOperator", () => testDeleteBackspace("@invalidops(true, @unfinished \"&\")", 4, 1, "true", 3), 300_000);
    test("testDeleteAfterSpareKeyword", () => testDeleteBackspace("@invalidops(1, @unfinished \"+\", 2, @invalidops(@unfinished \"^aif\", @invalidops ()))", 3, 3, "1+2", 3), 300_000);
    test("testDeleteAfterInfixOperator", () => testDeleteBackspace("1+2", 1, 1, "12", 3), 300_000);
    test("testDeleteAfterInfixOperator2", () => testDeleteBackspace("a<b<=c", 1, 1, "ab <= c", 3), 300_000);
    test("testDeleteAfterInfixOperator2b", () => testDeleteBackspace("a<b<=c", 3, 2, "a < bc", 3, 1), 300_000);
    test("testDeleteAfterInfixOperator2c", () => testDeleteBackspace("a<b<=c", 3, 1, "@invalidops(a, @unfinished \"<\", b, @unfinished \"=\", c)", 3, -1), 300_000);
    test("testDeleteAfterInfixOperator3", () => testDeleteBackspace("\"a\";b", 3, 1, "@invalidops(\"a\", b)", 3), 300_000);
    test("testRetypeInfix", () => testBackspaceRetype("1+2", 2, 1, "+", 2), 300_000);
    test("testRetypeInfix2", () => testBackspaceRetype("1<=2", 3, 2, "<=", 2), 300_000);
    test("testRetypeLeadingOperand", () => testBackspaceRetype("1+2", 1, 1, "1", 2), 300_000);
    test("testRetypeLeadingOperand2", () => testBackspaceRetype("1234 + 5678", 4, 4, "1234", 2), 300_000);
    test("testRetypeTrailingOperand", () => testBackspaceRetype("1+2", 3, 1, "2", 2), 300_000);
    test("testRetypeTrailingOperand2", () => testBackspaceRetype("123+456", 7, 3, "456", 2), 300_000);
    test("testRetypeListTypeContent", () => testBackspaceRetype("type{[Text]}", 10, 4, "Text", 2), 300_000);
    test("testRetypeParameter", () => testBackspaceRetype("@call function\\\\number\\sum([2])", 7, 3, "[2]", 2), 300_000);
    test("testRetypeParameter2", () => testBackspaceRetype("@call function\\\\number\\sum([])", 6, 2, "[]", 2), 300_000);
    test("testRetypeParameter3", () => testBackspaceRetype("@call function\\\\core\\convert unit(foo*unit{m}, 1{cm})", 15, 2, "fo", 2), 300_000);
    test("testRetypeWordInIdent", () => testBackspaceRetype("the quick brown fox", 9, 5, "quick", 2), 300_000);
    test("testPasteSeveral", () => testPaste("12", 1, "+3+4-", "1+3+4-2", 2), 300_000);
});
