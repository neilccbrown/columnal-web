// The port of TestExpressionEditor (tests-gui-expression-editor): expressions typed into a new Calculate
// column's expression editor (BaseTestExpressionEditorEntry's testEntry_Impl), or typed plainly, give the
// expected expression.
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { KnownLengthRecordSet } from "../../../src/engine/data/data/KnownLengthRecordSet.js";
import { MemoryBooleanColumn } from "../../../src/engine/data/data/MemoryBooleanColumn.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import type { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { ExpressionValue } from "../../engine/tests-functions/fixtures/gen/ExpressionValue.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { doubleOk } from "../base/doubleOk.js";
import { enterAndDeleteSmartBrackets } from "../base/enterType.js";
import { testEntryImpl } from "../base/expressionEditorEntry.js";
import { push, write } from "../base/keyboard.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { closeApp, engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

// Java: plainEntry: the expression typed as text into a new Calculate of an empty table
async function plainEntry(expressionSrc: string, typeManager: TypeManager): Promise<Expression | null>
{
    // Java: TAppUtil.openDataAsTable, with its default table name
    const content = savedFile(manager =>
    {
        manager.getTypeManager()._test_copyTaggedTypesFrom(typeManager);
        manager.record(new ImmediateDataSource(manager, new Table.InitialLoadDetails(new TableId("Table1"), null, CellPosition.ORIGIN.offsetByRowCols(1, 1), null), new EditableRecordSet(new KnownLengthRecordSet([], 0))));
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 1);
    const grid = a.mainWindow()!.grid()!.grid;
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    const targetPos = new CellPosition(CellPosition.row(3), CellPosition.col(5));
    await keyboardMoveTo(grid, targetPos);
    // Only need to click once as already selected by keyboard:
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
    await enterAndDeleteSmartBrackets(expressionSrc);

    // Close dialog, ignoring errors:
    await doubleOk();
    // Now close dialog, and check for equality;
    expect(document.querySelector(".ok-button"), "OK button").toBeNull();
    await engineHost(a).idle();
    const calculate = engineHost(a).tableManager.getAllTables().find(t => t instanceof Calculate);
    if (calculate === undefined)
        throw new Error("No transformation found");
    // Check expressions match:
    return [...calculate.getCalculatedColumns().values()][0] ?? null;
}

async function testSimpleQ(expressionSrc: string, ...qualifiedIdentsToEnterInFull: string[]): Promise<void>
{
    const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
    const expression = TFunctionUtil.parseExpression(expressionSrc, dummyManager.getTypeManager(), FunctionList.getFunctionLookup(dummyManager.getUnitManager()));

    // Check once using structured entry:
    await testEntryImpl(new ExpressionValue(
        DataType.BOOLEAN, // Type is unused here
        [],
        dummyManager.getTypeManager(),
        new TableId("TEE"),
        new KnownLengthRecordSet([rs => new MemoryBooleanColumn(rs, new ColumnId("Col1"), [], true)], 0),
        expression,
        null,
    ), new JavaRandom(0), a => { app = a; }, ...qualifiedIdentsToEnterInFull);
}

function testSimple(expressionSrc: string, plain?: string): Promise<void>
{
    if (plain === undefined)
        return testSimpleQ(expressionSrc);
    return (async () =>
    {
        const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
        const expression = TFunctionUtil.parseExpression(expressionSrc, dummyManager.getTypeManager(), FunctionList.getFunctionLookup(dummyManager.getUnitManager()));
        const entered = await plainEntry(plain, dummyManager.getTypeManager());
        expect(entered?.toString()).toBe(expression.toString());
        expect(entered?.equals(expression)).toBe(true);
    })();
}

describe("TestExpressionEditor", () =>
{
    test("testGreaterMinus", () => testSimple("2>-1"));
    test("testTuple", () => testSimple("(k:1, v:2)"));
    test("testCall", () => testSimple("@call function\\\\list\\get single([1])"));
});
