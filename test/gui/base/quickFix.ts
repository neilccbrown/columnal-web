// Port of test.gui.expressionEditor.BaseTestQuickFix (tests-gui-base): an expression typed into a new
// column of a Calculate (from Table1: text columns S1-S3 and number columns ACC1-ACC3 in m/s^2, no
// rows) has an error with the given fix, which applied by its key gives the expected expression.
import { expect, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import { MemoryStringColumn } from "../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { cssClassFor } from "../../gui-logic/lex-editor/ExpressionEditorTestUtil.js";
import { closeApp, engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";
import { clickOnItemInBounds } from "./clickTableLocation.js";
import { doubleOk } from "./doubleOk.js";
import { settle, waitForOneEditor } from "./editorDisplay.js";
import { enterAndDeleteSmartBrackets } from "./enterType.js";
import { getFocusOwner } from "./focusOwner.js";
import { push, write } from "./keyboard.js";
import { moveAndDismissPopupsAtPos } from "./popup.js";
import { sleep } from "./util.js";

export { cssClassFor };

let app: RenderedApp | null = null;

/** For the test file's afterEach. */
export async function closeQuickFixTestApp(): Promise<void>
{
    if (app !== null)
        await closeApp(app);
    app = null;
}

const centre = (element: Element): { x: number, y: number } =>
{
    const r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

export async function testSimpleFix(original: string, fixFieldContent: string, fixed: string): Promise<void>
{
    await testFix(original, fixFieldContent, cssClassFor(fixed), fixed);
}

/**
 * @param original Original expression, as typed (NOT as parsed)
 * @param fixFieldContent Content of the field to focus on when looking for fix
 * @param fixClass The CSS class of the particular fix row (PORT-NOTE: Java took a selector; empty for any)
 * @param result The expected outcome expression after applying the fix
 */
export async function testFix(original: string, fixFieldContent: string, fixClass: string, result: string, afterClick: () => Promise<void> = async () => {}): Promise<void>
{
    const u = new UnitManager();
    const typeManager = new TypeManager(u);
    const content = savedFile(manager =>
    {
        const columns: ((rs: RecordSet) => EditableColumn)[] = [];
        for (let i = 1; i <= 3; i++)
        {
            columns.push(rs => new MemoryStringColumn(rs, new ColumnId("S" + i), [], ""));
            columns.push(rs => new MemoryNumericColumn(rs, new ColumnId("ACC" + i), new NumberInfo(manager.getUnitManager().loadUse("m/s^2")), [], ZERO));
        }
        const table1 = manager.record(new ImmediateDataSource(manager, new Table.InitialLoadDetails(new TableId("Table1"), null, CellPosition.ORIGIN.offsetByRowCols(1, 1), null), new EditableRecordSet(columns, () => 0)));
        const position = new CellPosition(CellPosition.row(7), CellPosition.col(1));
        manager.record(new Calculate(manager, new Table.InitialLoadDetails(null, null, position, null), table1.getId(), new HashMap()));
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 2);

    await clickOnItemInBounds(".expand-arrow.expand-right", a.mainWindow()!.grid()!.grid, new RectangleBounds(
        new CellPosition(CellPosition.row(8), CellPosition.col(1)),
        new CellPosition(CellPosition.row(8), CellPosition.col(20))
    ));
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true, { timeout: 5000 });
    await write("DestCol");
    // Focus expression editor:
    await push("Tab");
    // Enter content:
    await enterAndDeleteSmartBrackets(original);
    // Click OK so that errors show up (cancel masking on new fields):
    await moveAndDismissPopupsAtPos(centre(document.querySelector(".ok-button")!));
    await userEvent.click(document.querySelector(".ok-button")!);

    const targetField = await waitForOneEditor<Expression>();
    const targetElement = document.querySelector(".expression-editor")!;
    const isFocused = (): boolean => targetElement.contains(getFocusOwner());
    if (!isFocused())
    {
        // Get rid of any popups in the way:
        await moveAndDismissPopupsAtPos(centre(targetElement));
        await userEvent.click(targetElement.querySelector(".cm-content")!);
        expect(isFocused(), "Clicked the editor; focus is: " + String(getFocusOwner()?.className)).toBe(true);
    }
    // Now need to move to right position:
    let moveDist = targetField._test_getContent()._test_getCaretMoveDistance(fixFieldContent);
    while (moveDist > 0)
    {
        await push("ArrowRight");
        moveDist -= 1;
    }
    while (moveDist < 0)
    {
        await push("ArrowLeft");
        moveDist += 1;
    }
    // Check we're actually now in bounds:
    expect(isFocused()).toBe(true);
    expect(targetField._test_getContent()._test_getCaretMoveDistance(fixFieldContent)).toBe(0);

    await vi.waitUntil(() => document.querySelector(".expression-info-popup") !== null, { timeout: 2000 }).catch(() => {});
    expect(document.querySelector(".expression-info-popup"), "Error popup").not.toBeNull();
    const errorTexts = [...document.querySelectorAll(".expression-info-error")];
    expect(errorTexts.length, errorTexts.map(n => n.textContent).join(" /// ")).toBe(1);
    const rowSelector = ".quick-fix-row" + (fixClass === "" ? "" : "." + CSS.escape(fixClass));
    const rows = [...document.querySelectorAll(".quick-fix-row")];
    expect(document.querySelectorAll(rowSelector).length, "Looking for row that matches " + showId(fixClass) + ", among: " + rows.map(n => "{" + [...n.classList].map(showId).join(", ") + "}").join(" and ")).toBe(1);
    // (Java used the keyboard, as it couldn't find the rows' positions in the popup)
    const fixStyles = [...document.querySelector(rowSelector)!.classList];
    const key = fixStyles.find(c => c.startsWith("key-"))?.substring("key-".length) ?? "";
    expect(key, fixStyles.join(", ")).not.toBe("");
    await userEvent.keyboard(`{Shift>}{${key}}{/Shift}`);
    await settle();
    await afterClick();
    // Check that popup vanishes pretty much straight away:
    await sleep(200);
    expect(isShowingErrorPopup(), "Popup still showing").toBe(false);
    await doubleOk();
    const calculate = await vi.waitUntil(() =>
    {
        const c = engineHost(a).tableManager.getAllTables().find(t => t instanceof Calculate);
        return c !== undefined && c.getCalculatedColumns().size !== 0 ? c : undefined;
    }, { timeout: 5000 });
    expect(calculate.getCalculatedColumns().size).toBe(1);
    const actual = [...calculate.getCalculatedColumns().values()][0]!;
    const expected = TFunctionUtil.parseExpression(result, typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager()));
    expect(actual.equals(expected), "Got " + actual.toStyledString().toPlain() + ", expected " + expected.toStyledString().toPlain()).toBe(true);
}

function showId(fixId: string): string
{
    const munge = fixId.indexOf("munged-");
    if (munge !== -1)
        return fixId + "[" + fixId.substring(munge + "munged-".length).split("-").map(n => String.fromCharCode(Number.parseInt(n))).join("") + "]";
    return fixId;
}

function isShowingErrorPopup(): boolean
{
    // Important to check the .error part too, as it may be showing information or a prompt and that's fine:
    return document.querySelector(".expression-info-popup.error") !== null;
}
