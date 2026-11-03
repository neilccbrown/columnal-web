// Port of test.gui.table.TestTableUpdate (tests-gui-tables): a two-column data table and two chained
// identity transformations of it; editing the data table updates what the transformations show, and
// deleting a table (from its menu) removes its cells and its dependents', which come back when it is
// put back (docs/gui-spec/tables.md).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ColumnUtility } from "../../../src/engine/data/data/ColumnUtility.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { BooleanLiteral, type Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FromString } from "../../../src/engine/functions/transformations/function/FromString.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { Filter } from "../../../src/engine/transformations/transformations/Filter.js";
import { Sort } from "../../../src/engine/transformations/transformations/Sort.js";
import type { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { checkProperty } from "../../support/quickcheck.js";
import { TBasicUtil } from "../../engine/tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { GenTypeAndValueGen } from "../../engine/tests-functions/fixtures/gen/type/GenTypeAndValueGen.js";
import { textToType } from "../../gui-logic/stf/fixtures/textToType.js";
import { triggerTableHeaderContextMenu } from "../base/clickOnTableHeader.js";
import { withItemInBounds } from "../base/clickTableLocation.js";
import { push, write } from "../base/keyboard.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { closeApp, engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

const TABLE_NAMES = ["Src", "T1", "T2"];

/**
 * We make a two-column table, and two chained identity transformations of it, so that it all fits on screen
 * (if any update problems appear, it will be most noticeable if the relevant value is already shown).
 * Then we edit the original, press enter and check:
 *  - A: the original cell has altered graphical content
 *  - B: copying the original cell copies new value
 *  - C: the two transformations have altered graphical content
 *  - D: copying the two transformations gets the altered content.
 */
test("propUpdate", () => checkProperty([new GenTypeAndValueGen(), new GenTypeAndValueGen(), new GenRandom()], async (colA: GenTypeAndValueGen.TypeAndValueGen, colB: GenTypeAndValueGen.TypeAndValueGen, r: JavaRandom) =>
{
    const tableLength = 1 + r.nextInt(20);
    const a = await createTables(colA, colB, r, tableLength);

    const changes = 3;
    for (let i = 0; i < changes; i++)
        await changeValue(a, colA, colB, r, tableLength);
}, { trials: 10 }), 300_000);

test("propDelete", () => checkProperty([new GenTypeAndValueGen(), new GenTypeAndValueGen(), new GenRandom()], async (colA: GenTypeAndValueGen.TypeAndValueGen, colB: GenTypeAndValueGen.TypeAndValueGen, r: JavaRandom) =>
{
    const tableLength = 1 + r.nextInt(20);
    const a = await createTables(colA, colB, r, tableLength);
    const grid = a.mainWindow()!.grid()!;

    // We try deleting a random table in the chain, and check that its cells are gone
    // and any dependents also have their cells gone
    const tableToDelete = r.nextInt(3);
    const tableIds = TABLE_NAMES.map(n => new TableId(n));
    const position = grid.displays().find(d => d.info.id === tableIds[tableToDelete]!.getRaw())!.getPosition();
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    await triggerTableHeaderContextMenu(grid.grid, position);
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-delete")));
    await vi.waitUntil(() => engineHost(a).tableManager.getSingleTableOrNull(tableIds[tableToDelete]!) === null);
    await engineHost(a).idle();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Now check that the cells are gone for table and dependents:
    for (let i = tableToDelete; i < 3; i++)
    {
        const pos = CellPosition.ORIGIN.offsetByRowCols(1 + 3, 1 + 3 * i);
        expect(() => withItemInBounds(".table-data-cell", grid.grid, new RectangleBounds(pos, pos))).toThrow();
    }

    // Put table back and check everything updates:
    const manager = engineHost(a).tableManager;
    switch (tableToDelete)
    {
        case 0:
        {
            const origRecordSet = new EditableRecordSet([
                ColumnUtility.makeImmediateColumn(colA.getType(), new ColumnId("A" as ExpressionIdentifier), replicate(tableLength, () => Either.right(colA.makeValue())), colA.makeValue()),
                ColumnUtility.makeImmediateColumn(colB.getType(), new ColumnId("B" as ExpressionIdentifier), replicate(tableLength, () => Either.right(colB.makeValue())), colB.makeValue()),
            ], () => tableLength);
            manager.record(new ImmediateDataSource(manager, new Table.InitialLoadDetails(new TableId("Src"), null, CellPosition.ORIGIN.offsetByRowCols(1, 1), null), origRecordSet));
            break;
        }
        case 1:
            addTransformation(manager, "Src", "T1", CellPosition.ORIGIN.offsetByRowCols(1, 4), r);
            break;
        case 2:
            addTransformation(manager, "T1", "T2", CellPosition.ORIGIN.offsetByRowCols(1, 7), r);
            break;
    }
    await engineHost(a).idle();

    // Check all cells are found this time, will throw if not:
    for (let i = tableToDelete; i < 3; i++)
    {
        const pos = CellPosition.ORIGIN.offsetByRowCols(1 + 3, 1 + 3 * i);
        await vi.waitUntil(() => { try { withItemInBounds(".table-data-cell:not(.loading)", grid.grid, new RectangleBounds(pos, pos)); return true; } catch { return false; } }, { timeout: 3000 });
    }

    // Check data matches:
    await vi.waitUntil(() => allLoaded(a, tableLength));
    checkAllMatch(colA.getType(), getDataViaGraphics(a, 0));
    checkAllMatch(colB.getType(), getDataViaGraphics(a, 1));

    // Check changes are properly linked up:
    const changes = 3;
    for (let i = 0; i < changes; i++)
        await changeValue(a, colA, colB, r, tableLength);
}, { trials: 5 }), 300_000);

// Edits a random cell of the source table, and checks all three tables show the same
async function changeValue(a: RenderedApp, colA: GenTypeAndValueGen.TypeAndValueGen, colB: GenTypeAndValueGen.TypeAndValueGen, r: JavaRandom, tableLength: number): Promise<void>
{
    const grid = a.mainWindow()!.grid()!;
    const targetColumn = r.nextInt(2);
    const targetRow = r.nextInt(tableLength);
    const colType = targetColumn === 0 ? colA : colB;
    const newVal = colType.makeValue();

    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    await keyboardMoveTo(grid.grid, CellPosition.ORIGIN.offsetByRowCols(targetRow + 4, targetColumn + 1));
    await push("Enter");
    // Java: enterStructuredValue(type, value, r, deleteAll = true, allowFieldShortcut = false)
    await userEvent.keyboard(isMac() ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}");
    await write(textToType(colType.getType(), newVal, r, true));
    await push("Enter");
    await engineHost(a).idle();
    await vi.waitUntil(() => allLoaded(a, tableLength));
    // (Java slept for 2 s here)
    await new Promise(resolve => setTimeout(resolve, 300));

    checkAllMatch(colA.getType(), getDataViaGraphics(a, 0));
    checkAllMatch(colB.getType(), getDataViaGraphics(a, 1));
}

async function createTables(colA: GenTypeAndValueGen.TypeAndValueGen, colB: GenTypeAndValueGen.TypeAndValueGen, r: JavaRandom, tableLength: number): Promise<RenderedApp>
{
    const content = savedFile(dummy =>
    {
        dummy.getTypeManager()._test_copyTaggedTypesFrom(colA.getTypeManager());
        dummy.getTypeManager()._test_copyTaggedTypesFrom(colB.getTypeManager());

        const origRecordSet = new EditableRecordSet([
            ColumnUtility.makeImmediateColumn(colA.getType(), new ColumnId("A" as ExpressionIdentifier), replicate(tableLength, () => Either.right(colA.makeValue())), colA.makeValue()),
            ColumnUtility.makeImmediateColumn(colB.getType(), new ColumnId("B" as ExpressionIdentifier), replicate(tableLength, () => Either.right(colB.makeValue())), colB.makeValue()),
        ], () => tableLength);
        dummy.record(new ImmediateDataSource(dummy, new Table.InitialLoadDetails(new TableId("Src"), null, CellPosition.ORIGIN.offsetByRowCols(1, 1), null), origRecordSet));
        // Now add two transformations:
        addTransformation(dummy, "Src", "T1", CellPosition.ORIGIN.offsetByRowCols(1, 4), r);
        addTransformation(dummy, "T1", "T2", CellPosition.ORIGIN.offsetByRowCols(1, 7), r);
    });
    if (app !== null)
        await closeApp(app);
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => allLoaded(a, tableLength), { timeout: 5000 });
    // First check that the data is valid to begin with:
    checkAllMatch(colA.getType(), getDataViaGraphics(a, 0));
    checkAllMatch(colB.getType(), getDataViaGraphics(a, 1));
    return a;
}

// Whether each table knows its rows, and has its cells on the page
function allLoaded(a: RenderedApp, tableLength: number): boolean
{
    const displays = a.mainWindow()?.grid()?.displays() ?? [];
    return TABLE_NAMES.every(n =>
    {
        const d = displays.find(x => x.info.id === n);
        return d !== undefined && d.currentKnownRows === tableLength && document.querySelectorAll(`[data-table="${n}"] .cell.loading`).length === 0;
    });
}

// Each row's value in the column, as each table shows it (null if not on the page)
function getDataViaGraphics(a: RenderedApp, columnIndex: number): (string | null)[][]
{
    const r: (string | null)[][] = [];
    for (const tableName of TABLE_NAMES)
    {
        const display = a.mainWindow()!.grid()!.displays().find(d => d.info.id === tableName)!;
        const rowCount = display.currentKnownRows;
        for (let i = 0; i < rowCount; i++)
        {
            if (r.length <= i)
                r.push([]);
            r[i]!.push(getGraphicalValue(tableName, columnIndex, i));
        }
    }
    return r;
}

function getGraphicalValue(tableName: string, columnIndex: number, row: number): string | null
{
    const cell = document.querySelector(`[data-table="${CSS.escape(tableName)}"] .row[data-row="${row}"] .cell[data-col="${columnIndex}"]:not(.loading)`);
    return cell === null ? null : (cell.textContent ?? "").replaceAll(", ", ",");
}

function checkAllMatch(dataType: DataType, data: readonly (readonly (string | null)[])[]): void
{
    for (let row = 0; row < data.length; row++)
    {
        const first = data[row]![0] ?? null;
        const valsForRow = data[row]!;
        for (let column = 0; column < valsForRow.length; column++)
        {
            const value = valsForRow[column] ?? null;
            if (first !== null && value !== null && first !== value)
            {
                // Try flexibly parsing then compare:
                TBasicUtil.assertValueEqual("Flexible", FromString.convertEntireString(DataTypeUtility.value(first), dataType), FromString.convertEntireString(DataTypeUtility.value(value), dataType));
                return;
            }
            expect(value, "Row " + row + " table " + column).toBe(first);
        }
    }
}

function addTransformation(mgr: TableManager, srcTable: string, destTable: string, position: CellPosition, r: JavaRandom): void
{
    // We choose between Sort (original order), Calculate(empty list) and Filter (true)
    switch (r.nextInt(3))
    {
        case 0:
            mgr.record(new Sort(mgr, new Table.InitialLoadDetails(new TableId(destTable), null, position, null), new TableId(srcTable), []));
            break;
        case 1:
            mgr.record(new Calculate(mgr, new Table.InitialLoadDetails(new TableId(destTable), null, position, null), new TableId(srcTable), new HashMap<ColumnId, Expression>()));
            break;
        case 2:
            mgr.record(new Filter(mgr, new Table.InitialLoadDetails(new TableId(destTable), null, position, null), new TableId(srcTable), new BooleanLiteral(true)));
            break;
    }
}

function replicate<T>(n: number, make: () => T): T[]
{
    const r: T[] = [];
    for (let i = 0; i < n; i++)
        r.push(make());
    return r;
}
