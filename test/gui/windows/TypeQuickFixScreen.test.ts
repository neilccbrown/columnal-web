// The screen checks of TestTypeQuickFix (tests-gui-type-editor), whose fixes are checked against the
// type editor's content in test/gui-logic/tests-gui-type-editor/: each type is typed into the type
// editor of a new table's column, in the new-column dialog; OK shows the errors; with the caret on the
// error, the popup shows it with the fix (by its CSS class), which its key (Shift+F1…) applies; and
// then OK makes the table, whose column has the fixed type.
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { ExpressionUtil } from "../../../src/engine/expressions/transformations/expression/ExpressionUtil.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { TypeId } from "../../../src/engine/types/data/datatype/TypeId.js";
import type { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { _test_editors } from "../../../src/gui/lexeditor/TopLevelEditorApi.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { enterAndDeleteSmartBrackets } from "../base/enterType.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { closeApp, renderApp, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

function testSimpleFix(original: string, fixFieldContent: string, dataType: DataType): Promise<void>
{
    return testFix(original, fixFieldContent, cssClassFor(dataType.toDisplay(false)), dataType);
}

// Java: dotCssClassFor, without the dot
function cssClassFor(type: string): string
{
    return ExpressionUtil.makeCssClass(type);
}

async function clickOk(): Promise<void>
{
    const ok = document.querySelector(".ok-button")!.getBoundingClientRect();
    await moveAndDismissPopupsAtPos({ x: ok.left + ok.width / 2, y: ok.top + ok.height / 2 });
    await userEvent.click(document.querySelector(".ok-button")!);
}

async function testFix(original: string, fixFieldContent: string, fixCssClass: string, expected: DataType | ((unitManager: UnitManager) => DataType)): Promise<void>
{
    const a = app = await renderApp([{ name: "P", content: "" }], 0);
    await waitForLoaded();
    const tableManager = a.transports[0]!.host.tableManager;
    // Java: TAppUtil.openDataAsTable(..., managerWithTestTypes)
    tableManager.getTypeManager()._test_copyTaggedTypesFrom(TFunctionUtil.managerWithTestTypes().getFirst().getTypeManager());
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    await keyboardMoveTo(a.mainWindow()!.grid()!.grid, new CellPosition(CellPosition.row(1), CellPosition.col(1)));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".create-table-grid-button")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-data")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("table-name-text-field") === true);
    await write("Table1");
    await push("Tab");
    await write("Column1");
    // Focus type editor:
    await push("Tab");
    // Enter content:
    await enterAndDeleteSmartBrackets(original);
    // Click OK so that errors show up (cancel masking on new fields):
    await clickOk();

    const targetField = document.querySelector(".type-editor")!;
    const editor = _test_editors.get(targetField)!;
    if (!editor.isFocused())
        await userEvent.click(targetField.querySelector(".cm-content")!);
    // Now need to move to right position:
    let moveDist = editor._test_getContent()._test_getCaretMoveDistance(fixFieldContent);
    for (; moveDist > 0; moveDist--)
        await push("ArrowRight");
    for (; moveDist < 0; moveDist++)
        await push("ArrowLeft");
    // Check we're actually now in bounds:
    expect(editor._test_getContent()._test_getCaretMoveDistance(fixFieldContent)).toBe(0);

    const popup = await vi.waitUntil(() => document.querySelector(".expression-info-popup.error"));
    expect(popup.querySelectorAll(".expression-info-error").length, popup.textContent ?? "").toBe(1);
    const rows = popup.querySelectorAll(".quick-fix-row." + fixCssClass);
    expect(rows.length, "Looking for row that matches " + fixCssClass + ", among: " + [...popup.querySelectorAll(".quick-fix-row")].map(r => r.className).join(", ")).toBe(1);
    const key = [...rows[0]!.classList].find(c => c.startsWith("key-"))?.substring("key-".length) ?? "";
    expect(key).not.toBe("");
    await userEvent.keyboard(`{Shift>}{${key}}{/Shift}`);
    // Check that popup vanishes pretty much straight away:
    await vi.waitUntil(() => document.querySelector(".expression-info-popup.error") === null, { timeout: 200 });
    // Java: TFXUtil.doubleOk
    await clickOk();
    if (document.querySelector(".edit-column-content") !== null)
        await clickOk();
    await vi.waitUntil(() => tableManager.getAllTables().length === 1, { timeout: 2000 });
    const dataSource = tableManager.getAllTables().find(t => t instanceof ImmediateDataSource)!;
    expect(dataSource.getData().getColumns().length).toBe(1);
    const actual = dataSource.getData().getColumns()[0]!.getType().getType();
    const expectedResult = expected instanceof DataType ? expected : expected(tableManager.getUnitManager());
    expect(actual.equals(expectedResult), actual.toString() + " vs " + expectedResult.toString()).toBe(true);
}

describe("TestTypeQuickFix (screen)", () =>
{
    test("testTypo1", () => testSimpleFix("Numbre", "Numbre", DataType.NUMBER));
    test("testTypo2", () => testSimpleFix("DateYN", "DateYN", DataType.date(new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTH))));
    test("testTypo3", () => testSimpleFix("Booleen", "Booleen", DataType.BOOLEAN));
    test("testTypo4", () =>
    {
        const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
        return testSimpleFix("Optionl(Text)", "Optionl", dummyManager.getTypeManager().getMaybeType().instantiate([Either.right(DataType.TEXT)], dummyManager.getTypeManager()));
    });
    test("testTypeNameMixup", () => testSimpleFix("double", "double", DataType.NUMBER));
    test("testTypeNameMixup2", () => testSimpleFix("bool", "bool", DataType.BOOLEAN));
    test("testTypeNameMixup3", () => testSimpleFix("string", "string", DataType.TEXT));
    test("testTypeNameMixup4", () => testSimpleFix("int", "int", DataType.NUMBER));
    test("testUnitNameMixup", () =>
    {
        const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
        return testFix("Number{second}", "second", cssClassFor("s"), DataType.number(new NumberInfo(dummyManager.getUnitManager().loadUse("s"))));
    });
    test("testUnitNameMixup2", () =>
    {
        const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
        return testFix("EitherNumUnit({second})({m})", "second", cssClassFor("s"), dummyManager.getTypeManager().lookupType(new TypeId("EitherNumUnit"), [Either.left(dummyManager.getUnitManager().loadUse("s")), Either.left(dummyManager.getUnitManager().loadUse("m"))])!);
    });
    test("testUnitNameMixup3", () =>
    {
        const dummyManager = TFunctionUtil.managerWithTestTypes().getFirst();
        const um = dummyManager.getUnitManager();
        return testFix("Number{(s^6*meter)/kg}", "meter", cssClassFor("m"), DataType.number(new NumberInfo(um.loadUse("s").raisedTo(6).times(um.loadUse("m").divideBy(um.loadUse("kg"))))));
    });
    test("testMissingTupleBrackets", () => testSimpleFix("a:Number,b:Text", ",", DataType.record([["a", DataType.NUMBER], ["b", DataType.TEXT]])));
});

// Not in Java's test: a fix which is an action, declaring the unit (Java's declared it in the project's
// own UnitManager; the dialog's is a copy, so the window sends it to the engine)
test("the Create unit fix declares the unit in the project", () =>
    testFix("Number{zzz}", "zzz", "key-F1", um => DataType.number(new NumberInfo(um.loadUse("zzz")))));
