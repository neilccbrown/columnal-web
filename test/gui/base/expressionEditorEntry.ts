// Port of test.gui.expressionEditor.BaseTestExpressionEditorEntry (tests-gui-base): makes a Calculate of
// the expression value's table, typing its expression into the new column DestCol (New ▸ Transform ▸
// Calculate, the table's name, the column's name, then the expression), checks the Calculate's
// expression is the one typed, edits it again without changes and checks again, then checks the
// calculated values (copied from the table's menu).
import { expect, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { ClipboardUtils } from "../../../src/engine/importers/importers/ClipboardUtils.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { GridTableDisplay } from "../../../src/gui/grid/GridTableDisplay.js";
import { TBasicUtil } from "../../engine/tests-basic/fixtures/data/TBasicUtil.js";
import type { ExpressionValue } from "../../engine/tests-functions/fixtures/gen/ExpressionValue.js";
import { engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";
import { clickOnItemInBounds } from "./clickTableLocation.js";
import { recordsOnClipboard } from "./clipboard.js";
import { doubleOk } from "./doubleOk.js";
import { enterExpression, EntryBracketStatus } from "./enterExpression.js";
import { push, write } from "./keyboard.js";
import { keyboardMoveTo } from "./scrollTo.js";
import { sleep } from "./util.js";

/** Java: testEntry_Impl.  The app is given to setApp as soon as it is made (for the test to close). */
export async function testEntryImpl(expressionValue: ExpressionValue, r: JavaRandom, setApp: (a: RenderedApp) => void, ...qualifiedIdentsToEnterInFull: string[]): Promise<void>
{
    // Java: TAppUtil.openDataAsTable
    const content = savedFile(manager =>
    {
        manager.getTypeManager()._test_copyTaggedTypesFrom(expressionValue.typeManager);
        manager.record(new ImmediateDataSource(manager, new Table.InitialLoadDetails(expressionValue.tableId, null, CellPosition.ORIGIN.offsetByRowCols(1, 1), null), new EditableRecordSet(expressionValue.recordSet)));
    });
    const a = await renderApp([{ name: "P", content }], 0);
    setApp(a);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 1);
    const grid = a.mainWindow()!.grid()!.grid;
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    const targetPos = new CellPosition(CellPosition.row(3), CellPosition.col(3 + expressionValue.recordSet.getColumns().length));
    await keyboardMoveTo(grid, targetPos);
    // Only need to click once as already selected by keyboard:
    await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(targetPos, targetPos));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-calculate")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("text-field") === true);
    await write(expressionValue.tableId.getRaw());
    await push("Enter");
    await sleep(200);
    // (The dialog shows once the engine has made the Calculate: Java's was there after the sleep)
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true, { timeout: 5000 });
    await write("DestCol");
    // Focus expression editor:
    await push("Tab");
    const typeManager = engineHost(a).tableManager.getTypeManager();
    await enterExpression(typeManager, expressionValue.expression, EntryBracketStatus.SURROUNDED_BY_KEYWORDS, r, ...qualifiedIdentsToEnterInFull);

    // We check this twice, once for original entry, once for no-op edit:
    for (let i = 0; i < 2; i++)
    {
        // Get rid of popups:
        await doubleOk();
        // Now close dialog, and check for equality;
        await sleep(500);
        expect(document.querySelector(".ok-button"), "No OK button").toBeNull();
        await engineHost(a).idle();
        const calculate = engineHost(a).tableManager.getAllTables().find(t => t instanceof Calculate);
        if (calculate === undefined)
            throw new Error("No transformation found");

        // Check expressions match:
        const expression = [...calculate.getCalculatedColumns().values()][0]!;
        expect(expression.equals(expressionValue.expression), "Loop " + i + ": " + expression.toString()).toBe(true);
        // Just in case equals is wrong, check String comparison:
        expect(expression.toString(), "Loop " + i).toBe(expressionValue.expression.toString());

        // Check that a no-op edit gives same expression:
        if (i === 0)
        {
            const display = await vi.waitUntil(() => a.mainWindow()!.grid()!.displays().find(d => d.info.id === calculate.getId().getRaw()));
            // Java: keyboardMoveTo(grid, manager, tableId, 0, column) (which needn't have a row 0)
            await keyboardMoveTo(grid, display.getPosition().offsetByRowCols(GridTableDisplay.HEADER_ROWS, expressionValue.recordSet.getColumns().length));
            const header = [...document.querySelectorAll<HTMLElement>(`[data-table="${calculate.getId().getRaw()}"] .column-name`)].find(e => e.textContent.trim() === "DestCol")!;
            await userEvent.click(header);
            await vi.waitUntil(() => document.querySelector(".expression-editor") !== null);
        }
    }

    // Now check values match:
    const calculate = engineHost(a).tableManager.getAllTables().find(t => t instanceof Calculate)!;
    await navigator.clipboard.writeText("");
    await userEvent.click(document.querySelector<HTMLElement>(`[data-table="${calculate.getId().getRaw()}"] .table-title`)!, { button: "right", position: { x: 2, y: 5 } });
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-copyValues")));
    await sleep(1000);
    const clip = ClipboardUtils.loadValuesFromClipboard(expressionValue.typeManager, await recordsOnClipboard());
    expect(clip).not.toBeNull();
    // Need to fish out first column from clip, then compare item:
    const actual = clip!.find(p => p.columnName !== null && p.columnName.equals(new ColumnId("DestCol")));
    if (actual === undefined)
        throw new Error("No DestCol column copied");
    TBasicUtil.assertValueListEitherEqual("Transformed", expressionValue.value.map(x => Either.right<string, Value>(x)), actual.dataValues);
}

