// The port of TestExpressionEditorResolution (tests-gui-expression-editor-further): a Calculate's
// expression, loaded from a file, shows in the column dialog's expression editor with its names
// resolved (namespaces only where they're needed).
import { afterEach, describe, expect, test, vi } from "vitest";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { _test_editors } from "../../../src/gui/lexeditor/TopLevelEditorApi.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { doubleOk } from "../base/doubleOk.js";
import { getFocusOwner } from "../base/focusOwner.js";
import { push } from "../base/keyboard.js";
import { sleep } from "../base/util.js";
import { closeApp, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

async function testLoadNameResolution(expressionSrc: string, expectedLoaded: string): Promise<void>
{
    const content = savedFile(orig =>
    {
        const data = new ImmediateDataSource(orig, TFunctionUtil.ILD, new EditableRecordSet([rs => new MemoryNumericColumn(rs, new ColumnId("round"), NumberInfo.DEFAULT, [], ZERO)], () => 0));
        orig.record(data);
        const calc = new Calculate(orig, new Table.InitialLoadDetails(null, null, new CellPosition(CellPosition.row(4), CellPosition.col(4)), null), data.getId(), new HashMap<ColumnId, Expression>([[new ColumnId("Calc Col"), TFunctionUtil.parseExpression(expressionSrc, orig.getTypeManager(), FunctionList.getFunctionLookup(orig.getUnitManager()))]]));
        orig.record(calc);
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 2);
    await sleep(1000);

    const targetPos = new CellPosition(CellPosition.row(5), CellPosition.col(5));
    await clickOnItemInBounds(".table-display-column-title", a.mainWindow()!.grid()!.grid, new RectangleBounds(targetPos, targetPos));
    await sleep(500);
    await vi.waitUntil(() => document.activeElement?.closest(".column-name-text-field, .errorable-text-field") !== null);
    await push("Tab");
    await sleep(100);
    const content2 = getEditorDisplay();
    expect(content2._test_getRawText()).toBe(expectedLoaded);

    // Close dialog, ignoring errors:
    await doubleOk();
    await vi.waitUntil(() => document.querySelector(".expression-editor") === null);
}

// Java: the focus owner, which must be an editor
function getEditorDisplay(): { _test_getRawText(): string }
{
    const focusOwner = getFocusOwner();
    const editor = focusOwner === null ? undefined : _test_editors.get(focusOwner.closest(".top-level-editor")!);
    if (editor === undefined)
        throw new Error("Focus owner is " + String(focusOwner?.className));
    return editor;
}

describe("TestExpressionEditorResolution", () =>
{
    test("checkLoad1", () => testLoadNameResolution("var\\\\x", "x"));
    test("checkLoad2", () => testLoadNameResolution("@call function\\\\number\\abs(3)", "abs(3)"));
    test("checkLoad3", () => testLoadNameResolution("@call function\\\\number\\round(3)", "function\\\\round(3)"));
    test("checkLoad3b", () => testLoadNameResolution("column\\\\round", "column\\\\round"));
    test("checkLoad4", () => testLoadNameResolution("@define var\\\\round = 3 @then var\\\\round + column\\\\round @enddefine", "@definevar\\\\round=3@thenvar\\\\round+column\\\\round@enddefine"));
    test("checkLoad4b", () => testLoadNameResolution("@define var\\\\round 2 = 3 @then var\\\\round 2 + column\\\\round @enddefine", "@defineround 2=3@thenround 2+column\\\\round@enddefine"));
    test("checkLoad5", () => testLoadNameResolution("@define var\\\\abs = 2 @then var\\\\abs + @call function\\\\number\\abs(-4) @enddefine + @call function\\\\number\\abs(3)", "@definevar\\\\abs=2@thenvar\\\\abs+function\\\\abs(-4)@enddefine+abs(3)"));
    test("checkLoad6", () => testLoadNameResolution("@if 2 =~ var\\\\abs @then var\\\\abs + @call function\\\\number\\abs(-4) @else @call function\\\\number\\abs(-5) @endif + @call function\\\\number\\abs(3)", "@if2=~var\\\\abs@thenvar\\\\abs+function\\\\abs(-4)@elseabs(-5)@endif+abs(3)"));
});


