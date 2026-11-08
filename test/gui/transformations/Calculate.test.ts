// Port of test.gui.transformation.TestCalculate (tests-gui-transformations): making a Calculate from the
// new-table dialog, adding columns to it (from a column's menu, or by clicking a source column's name),
// with names and expressions entered by completion or by clicking a column in the grid; deleting
// columns; and renaming a calculated column (docs/gui-spec/transformations.md).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryBooleanColumn } from "../../../src/engine/data/data/MemoryBooleanColumn.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import { MemoryTemporalColumn } from "../../../src/engine/data/data/MemoryTemporalColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import { IdentExpression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { javaShuffle } from "../../../src/engine/java/JavaCollections.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { DateTimeInfo } from "../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import type { VirtualGrid } from "../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { checkProperty } from "../../support/quickcheck.js";
import { autoComplete, lexComplete } from "../base/autoComplete.js";
import { clickAt, clickOnItemInBounds, withItemInBounds } from "../base/clickTableLocation.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
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

enum Col { BOO, YM, BOOT_SIZE, YM_LOWER }

function getName(col: Col): ExpressionIdentifier
{
    switch (col)
    {
        case Col.BOO: return "Boo" as ExpressionIdentifier;
        case Col.YM: return "YM" as ExpressionIdentifier;
        case Col.YM_LOWER: return "ym" as ExpressionIdentifier;
        case Col.BOOT_SIZE: return "Boot Size" as ExpressionIdentifier;
    }
}

function makeColumn(column: Col, rs: RecordSet): EditableColumn
{
    const columnId = new ColumnId(getName(column));
    switch (column)
    {
        case Col.BOO:
            return new MemoryBooleanColumn(rs, columnId, [], false);
        case Col.YM:
        case Col.YM_LOWER:
        {
            const info = new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTH);
            return new MemoryTemporalColumn(rs, columnId, info, [], info.getDefaultValue());
        }
        case Col.BOOT_SIZE:
            return new MemoryNumericColumn(rs, columnId, NumberInfo.DEFAULT, [], ZERO);
    }
}

const centre = (selector: string): { x: number, y: number } =>
{
    const r = document.querySelector(selector)!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const shortcut = (key: string): string => isMac() ? `{Meta>}${key}{/Meta}` : `{Control>}${key}{/Control}`;

function getCalculate(a: RenderedApp): Calculate
{
    const calculate = engineHost(a).tableManager.getAllTables().find(t => t instanceof Calculate);
    expect(calculate).toBeDefined();
    return calculate!;
}

function findColumnTitle(columnNameToReplace: string): Element[]
{
    return [...document.querySelectorAll(".column-title")].filter(e => e.textContent.trim() === columnNameToReplace);
}

async function showContextMenuOn(grid: VirtualGrid, column: string, bounds: RectangleBounds): Promise<void>
{
    const { element, point } = withItemInBounds(findColumnTitle(column), grid, bounds);
    await clickAt(element, point, "right");
}

test("testCalculate", () => checkProperty([new GenRandom()], async (r: JavaRandom) =>
{
    if (app !== null)
        await closeApp(app);
    const content = savedFile(mgr =>
    {
        const columns = [Col.BOO, Col.YM, Col.BOOT_SIZE, Col.YM_LOWER].map(c => (rs: RecordSet) => makeColumn(c, rs));
        mgr.record(new ImmediateDataSource(mgr, new Table.InitialLoadDetails(new TableId("Table1"), null, CellPosition.ORIGIN.offsetByRowCols(1, 1), null), new EditableRecordSet(columns, () => 0)));
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === 1);
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();

    const calcPos = CellPosition.ORIGIN.offsetByRowCols(1, 6);
    const grid = a.mainWindow()!.grid()!.grid;
    await keyboardMoveTo(grid, calcPos);

    // We shuffle this list, then use item at indexes 0 and 1 as name of new calculated columns.
    // We delete columns at index 0 and 2
    const colList = [Col.BOO, Col.YM, Col.BOOT_SIZE, Col.YM_LOWER];
    javaShuffle(colList, r);

    await push("Enter");
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-calculate")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true);
    await write("Table1");
    await push("Enter");
    await enterInfo(a, r, getName(colList[0]!));

    if (r.nextBoolean())
    {
        // Add by adding new column with right name:
        await showContextMenuOn(grid, getName(colList[1]!), new RectangleBounds(calcPos, calcPos.offsetByRowCols(3, 3)));
        await userEvent.click(await vi.waitUntil(() => document.querySelector(r.nextBoolean() ? ".id-virtGrid-column-addBefore" : ".id-virtGrid-column-addAfter")));
    }
    else
    {
        // Add by clicking column name:
        await clickOnItemInBounds(findColumnTitle(getName(colList[1]!)), grid, new RectangleBounds(calcPos, calcPos.offsetByRowCols(3, 3)));
    }
    await enterInfo(a, r, getName(colList[1]!));

    // Now try deleting a column:
    await showContextMenuOn(grid, getName(colList[0]!), new RectangleBounds(calcPos, calcPos.offsetByRowCols(3, 3)));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-virtGrid-column-delete")));
    await sleep(300);
    expect(getCalculate(a).getCalculatedColumns().has(new ColumnId(getName(colList[0]!)))).toBe(false);

    // Delete on from original:
    await showContextMenuOn(grid, getName(colList[2]!), new RectangleBounds(CellPosition.ORIGIN, CellPosition.ORIGIN.offsetByRowCols(2, 4)));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-virtGrid-column-delete")));
    await sleep(300);
    await vi.waitUntil(() => !getCalculate(a).getData().getColumnIds().some(c => c.equals(new ColumnId(getName(colList[2]!)))));

    // Now we rename column to either overlap another column, or be totally new, then we swap it back:
    await clickOnItemInBounds(findColumnTitle(getName(colList[1]!)), grid, new RectangleBounds(calcPos, calcPos.offsetByRowCols(1, 4)));
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true);
    const newColName = r.nextBoolean() ? getName(colList[3]!) : "Arbitrary New Name";
    await write(newColName);
    await moveAndDismissPopupsAtPos(centre(".ok-button"));
    await userEvent.click(document.querySelector(".ok-button")!);
    // Now check columns are right:
    let expectedColumns = [...new Set([getName(colList[0]!), getName(colList[1]!), getName(colList[3]!), newColName])].sort();
    await vi.waitUntil(() => JSON.stringify(getCalculate(a).getData().getColumnIds().map(c => c.getRaw()).sort()) === JSON.stringify(expectedColumns), { timeout: 5000 }).catch(() => {});
    expect(getCalculate(a).getData().getColumnIds().map(c => c.getRaw()).sort()).toEqual(expectedColumns);
    // Change it back to colList.get(1) and check again (once the grid shows the renamed column):
    await vi.waitUntil(() => findColumnTitle(newColName).length > 0);
    await clickOnItemInBounds(findColumnTitle(newColName), grid, new RectangleBounds(calcPos, calcPos.offsetByRowCols(1, 4)));
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true);
    await write(getName(colList[1]!));
    await moveAndDismissPopupsAtPos(centre(".ok-button"));
    await userEvent.click(document.querySelector(".ok-button")!);
    // Now check columns are right:
    expectedColumns = [...new Set([getName(colList[0]!), getName(colList[1]!), getName(colList[3]!)])].sort();
    await vi.waitUntil(() => JSON.stringify(getCalculate(a).getData().getColumnIds().map(c => c.getRaw()).sort()) === JSON.stringify(expectedColumns), { timeout: 5000 }).catch(() => {});
    expect(getCalculate(a).getData().getColumnIds().map(c => c.getRaw()).sort()).toEqual(expectedColumns);
}, { trials: 3 }), 300_000);

async function enterInfo(a: RenderedApp, r: JavaRandom, columnNameToReplace: string): Promise<void>
{
    await sleep(300);
    // (Once the engine has given what the dialog needs)
    await vi.waitUntil(() => document.querySelector(".expression-editor") !== null, { timeout: 5000 });
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true);
    const grid = a.mainWindow()!.grid()!.grid;

    const clickedExistingForName = r.nextBoolean();
    if (clickedExistingForName)
    {
        expect(document.activeElement?.tagName).toBe("INPUT");
        // Click on existing column name to use it
        await clickOnItemInBounds(findColumnTitle(columnNameToReplace), grid, new RectangleBounds(CellPosition.ORIGIN.offsetByRowCols(1, 1), CellPosition.ORIGIN.offsetByRowCols(1 + 2, 1 + 3)));
        await moveAndDismissPopupsAtPos(centre(".expression-editor"));
        await userEvent.click(document.querySelector(".expression-editor .cm-content")!);
        expect(document.activeElement?.closest(".expression-editor"), "Focus owner: " + String(document.activeElement?.className)).not.toBeNull();
    }
    else
    {
        // Use autocomplete, but need to write one char for it to show up:
        await write(columnNameToReplace.substring(0, 1));
        await autoComplete(columnNameToReplace, true);
    }

    await userEvent.keyboard(shortcut("a"));
    await push("Delete");
    await sleep(200);

    // Copy existing column:
    const clickedExistingForExpression = r.nextBoolean();
    if (clickedExistingForExpression)
        await clickOnItemInBounds(findColumnTitle(columnNameToReplace), grid, new RectangleBounds(CellPosition.ORIGIN, CellPosition.ORIGIN.offsetByRowCols(2, 4)));
    else
        await lexComplete(columnNameToReplace);

    await moveAndDismissPopupsAtPos(centre(".ok-button"));
    await userEvent.click(document.querySelector(".ok-button")!);
    await vi.waitUntil(() => document.querySelector(".expression-editor") === null).catch(() => {});
    expect(document.querySelector(".expression-editor"), "Exp Editor should be hidden, after: " + clickedExistingForName + " and " + clickedExistingForExpression).toBeNull();
    await sleep(500);
    const expression = await vi.waitUntil(() => getCalculate(a).getCalculatedColumns().get(new ColumnId(columnNameToReplace))).catch(() => undefined);
    expect(expression).toBeDefined();
    const allowed = [IdentExpression.column(new TableId("Table1"), new ColumnId(columnNameToReplace)), IdentExpression.column(new ColumnId(columnNameToReplace))];
    expect(allowed.some(e => e.equals(expression!)), "Expression " + String(expression)).toBe(true);
}
