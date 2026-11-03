// Port of test.gui.table.TestTableEdits (tests-gui-tables): renaming a table (its name field) and a
// column (its header's dialog), and deleting columns and tables (by key or menu), with chains of
// transformations of a data table (docs/gui-spec/tables.md).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryBooleanColumn } from "../../../src/engine/data/data/MemoryBooleanColumn.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { Expression, IdentExpression, NumericLiteral } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ExpressionVisitorFlat } from "../../../src/engine/expressions/transformations/expression/visitor/ExpressionVisitorFlat.js";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Aggregate } from "../../../src/engine/transformations/transformations/Aggregate.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { Filter } from "../../../src/engine/transformations/transformations/Filter.js";
import { ManualEdit } from "../../../src/engine/transformations/transformations/ManualEdit.js";
import { Sort } from "../../../src/engine/transformations/transformations/Sort.js";
import type { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import type { VirtualGrid } from "../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";
import type { GridTableDisplay } from "../../../src/gui/grid/GridTableDisplay.js";
import { checkProperty } from "../../support/quickcheck.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { GenColumnId } from "../../engine/tests-tables/fixtures/gen/GenColumnId.js";
import { GenTableId } from "../../engine/tests-tables/fixtures/gen/GenTableId.js";
import { clickOnItemInBounds, rectangleBoundsScreen, clickAt, withItemInBounds } from "../base/clickTableLocation.js";
import { triggerTableHeaderContextMenu } from "../base/clickOnTableHeader.js";
import { push, write } from "../base/keyboard.js";
import { keyboardMoveTo, keyboardMoveToTableCell, waitForScrollToStop } from "../base/scrollTo.js";
import { selectAllCurrentTextField } from "../base/textField.js";
import { closeApp, engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

/*
 * We glue together all combinations of two transforms, from:
 *  - Sort
 *  - Filter
 *  - Calculate
 *  - ManualEdit
 *
 * We also make some Concatenates and Aggregates
 */

const booleans = [true, false, false];
const numbers = [5, 4, 3];
const sortBy = [new Pair(new ColumnId("Boolean" as ExpressionIdentifier), Sort.Direction.ASCENDING), new Pair(new ColumnId("Number" as ExpressionIdentifier), Sort.Direction.DESCENDING)];
const originalTableTopLeft = new CellPosition(CellPosition.row(2), CellPosition.col(2));
const originalColumns = 2;

interface Setup
{
    readonly app: RenderedApp;
    readonly srcId: TableId;
    readonly tableCount: number;
    readonly transformPositions: Map<string, CellPosition>;
    readonly postRenameChecks: Map<string, (t: Table, newCol: ColumnId) => void>;
}

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

function makeFilterCalcExpression(typeManager: TypeManager): Expression
{
    // This is the original expression.  But to prevent type errors we adjust it to the below which
    // will only give runtime errors, not type-checker errors:
    //String src = "(column\\\\Number >= 4) & column\\\\Boolean";
    const src = "(column\\\\Number >= @call function\\\\from text(\"4\")) & (column\\\\Boolean = @call function\\\\from text(\"true\"))";
    return TFunctionUtil.parseExpression(src, typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager()));
}

// Java: start: the source table and its transformations, then the main window with thinner columns
async function start(): Promise<Setup>
{
    const transformPositions = new Map<string, CellPosition>();
    const postRenameChecks = new Map<string, (t: Table, newCol: ColumnId) => void>();
    let srcId: TableId | null = null;
    let tableCount = 0;
    const content = savedFile(manager =>
    {
        const src = new ImmediateDataSource(manager, new Table.InitialLoadDetails(null, null, originalTableTopLeft, null), new EditableRecordSet([
            rs => new MemoryBooleanColumn(rs, new ColumnId("Boolean" as ExpressionIdentifier), booleans.map(b => Either.right<string, boolean>(b)), false),
            rs => new MemoryNumericColumn(rs, new ColumnId("Number" as ExpressionIdentifier), NumberInfo.DEFAULT, numbers.map(n => Either.right<string, Decimal>(new Decimal(n))), new Decimal(6)),
        ], () => 3));
        srcId = src.getId();
        manager.record(src);
        addTransforms(manager, src.getId(), 0, nextPos(src), new Map(), new JavaRandom(10n), transformPositions, postRenameChecks);
        tableCount = manager.getAllTables().length;
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => engineHost(a).tableManager.getAllTables().length === tableCount, { timeout: 10000 });
    const grid = virtualGrid(a);
    // Make columns thinner so everything fits on screen easily:
    for (let c = 0; c < 12; c++)
        grid._test_setColumnWidth(c, 60.0);
    await vi.waitUntil(() => document.querySelectorAll(".table-display-table-title").length === tableCount);
    return { app: a, srcId: srcId!, tableCount, transformPositions, postRenameChecks };
}

function virtualGrid(a: RenderedApp): VirtualGrid
{
    return a.mainWindow()!.grid()!.grid;
}

function display(a: RenderedApp, id: string): GridTableDisplay
{
    return a.mainWindow()!.grid()!.displays().find(d => d.info.id === id)!;
}

function count(selector: string): number
{
    return document.querySelectorAll(selector).length;
}

function ch(r: JavaRandom): string
{
    return String.fromCharCode("A".charCodeAt(0) + r.nextInt(26));
}

// Returns next target position
// unavailableTables points from a table to all its directly derived tables that shouldn't be available to it
function addTransforms(manager: TableManager, srcId: TableId, depth: number, targetPos: CellPosition, unavailableTables: Map<string, string[]>, r: JavaRandom, transformPositions: Map<string, CellPosition>, postRenameChecks: Map<string, (t: Table, newCol: ColumnId) => void>): CellPosition
{
    const sortId = new TableId(ch(r) + srcId.getRaw() + " then Sort");
    const sort = new Sort(manager, new Table.InitialLoadDetails(sortId, null, targetPos, null), srcId, sortBy);
    manager.record(sort);
    transformPositions.set(sortId.getRaw(), targetPos);
    targetPos = nextPos(sort);
    postRenameChecks.set(sortId.getRaw(), (t, newCol) =>
    {
        expect((t as Sort).getSortBy()[0]!.getFirst().equals(newCol)).toBe(true);
    });

    const filterId = new TableId(ch(r) + srcId.getRaw() + " then Filter");
    const filter = new Filter(manager, new Table.InitialLoadDetails(filterId, null, targetPos, null), srcId, makeFilterCalcExpression(manager.getTypeManager()));
    manager.record(filter);
    transformPositions.set(filterId.getRaw(), targetPos);
    targetPos = nextPos(filter);

    const calculateId = new TableId(ch(r) + srcId.getRaw() + " then Calculate");
    const calc = new Calculate(manager, new Table.InitialLoadDetails(calculateId, null, targetPos, null), srcId, new HashMap<ColumnId, Expression>([[new ColumnId("Boolean" as ExpressionIdentifier), IdentExpression.column(new ColumnId("Boolean" as ExpressionIdentifier))]]));
    manager.record(calc);
    transformPositions.set(calculateId.getRaw(), targetPos);
    targetPos = nextPos(calc);
    postRenameChecks.set(calculateId.getRaw(), (t, c) =>
    {
        expect([...(t as Calculate).getCalculatedColumns().values()][0]!.equals(IdentExpression.column(c))).toBe(true);
    });

    const manualId = new TableId(ch(r) + srcId.getRaw() + " then Edit");
    const manualEdit = new ManualEdit(manager, new Table.InitialLoadDetails(manualId, null, targetPos, null), srcId, null, []);
    manager.record(manualEdit);
    transformPositions.set(manualId.getRaw(), targetPos);
    targetPos = nextPos(manualEdit);

    const agg1Id = new TableId(ch(r) + srcId.getRaw() + " then Aggregate1");
    // Must have two columns to make counts right
    const agg1 = new Aggregate(manager, new Table.InitialLoadDetails(agg1Id, null, targetPos, null), srcId, [new Pair<ColumnId, Expression>(new ColumnId("AggCol" as ExpressionIdentifier), new NumericLiteral(new Decimal(0), null))], [new ColumnId("Boolean" as ExpressionIdentifier)]);
    manager.record(agg1);
    transformPositions.set(agg1Id.getRaw(), targetPos);
    targetPos = nextPos(agg1);
    postRenameChecks.set(agg1Id.getRaw(), (t, newCol) =>
    {
        expect((t as Aggregate).getSplitBy()[0]!.equals(newCol)).toBe(true);
    });

    const agg2Id = new TableId(ch(r) + srcId.getRaw() + " then Aggregate2");
    // Must have two columns to make counts right
    const agg2 = new Aggregate(manager, new Table.InitialLoadDetails(agg2Id, null, targetPos, null), srcId, [new Pair<ColumnId, Expression>(new ColumnId("AggCol" as ExpressionIdentifier), IdentExpression.column(new ColumnId("Boolean" as ExpressionIdentifier)))], [new ColumnId("Number" as ExpressionIdentifier)]);
    manager.record(agg2);
    transformPositions.set(agg2Id.getRaw(), targetPos);
    targetPos = nextPos(agg2);
    postRenameChecks.set(agg2Id.getRaw(), (t, newCol) =>
    {
        assertSameLastIdent(newCol, (t as Aggregate).getColumnExpressions()[0]!.getSecond());
    });

    // TODO concatenate some of the others

    const derived = [sortId, filterId, calculateId, manualId, agg1Id, agg2Id];
    for (const tableId of derived)
    {
        const list = unavailableTables.get(srcId.getRaw()) ?? [];
        list.push(tableId.getRaw());
        unavailableTables.set(srcId.getRaw(), list);
    }
    checkAvailability(manager, unavailableTables);

    depth += 1;
    if (depth < 3)
    {
        for (const tableId of derived)
        {
            // Can't build on Aggregate as different columns:
            if (!tableId.equals(agg1Id) && !tableId.equals(agg2Id))
                targetPos = addTransforms(manager, tableId, depth, targetPos, unavailableTables, r, transformPositions, postRenameChecks);
        }
    }

    return targetPos;
}

function assertSameLastIdent(column: ColumnId, expression: Expression): void
{
    expect(expression.visit(new class extends ExpressionVisitorFlat<string | null>
    {
        protected makeDef(): string | null
        {
            return null;
        }

        public override ident(_self: IdentExpression, _namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[]): string | null
        {
            return idents[idents.length - 1]!;
        }
    }())).toBe(column.getRaw());
}

// unavailableTables points from a table to all its directly derived tables that shouldn't be available to it
function checkAvailability(manager: TableManager, unavailableTables: Map<string, string[]>): void
{
    const allTables = manager.getAllTables().map(t => t.getId().getRaw());
    // I think this is only O(N^2) but N is small anyway
    for (const tableId of allTables)
    {
        const available = new Set(allTables);
        removeAllMapped(unavailableTables, available, tableId);
        expect(new Set(manager.getAllTablesAvailableTo(new TableId(tableId), true).map(t => t.getId().getRaw()))).toEqual(available);
        available.delete(tableId);
        expect(new Set(manager.getAllTablesAvailableTo(new TableId(tableId), false).map(t => t.getId().getRaw()))).toEqual(available);
    }
}

function removeAllMapped(unavailableTables: Map<string, string[]>, available: Set<string>, tableId: string): void
{
    for (const id of unavailableTables.get(tableId) ?? [])
    {
        available.delete(id);
        removeAllMapped(unavailableTables, available, id);
    }
}

function nextPos(table: Table): CellPosition
{
    const right = table._test_getPrevPosition().offsetByRowCols(0, 5);
    // Wrap beyond certain point:
    if (right.columnIndex > 20)
        return new CellPosition(table._test_getPrevPosition().offsetByRowCols(8, 0).rowIndex, CellPosition.col(2));
    else
        return right;
}

test("testRenameTable", async () =>
{
    const s = await start();
    const grid = virtualGrid(s.app);
    await checkProperty([new GenTableId()], async (newTableId: TableId) =>
    {
        // N tables, 2 columns each:
        expect(count(".table-display-table-title")).toBe(s.tableCount);
        expect(count(".table-display-column-title")).toBe(s.tableCount * 2);
        const rectangleBounds = new RectangleBounds(originalTableTopLeft, originalTableTopLeft.offsetByRowCols(0, originalColumns));
        await clickOnItemInBounds(".table-display-table-title .table-name-text-field", grid, rectangleBounds);
        await selectAllCurrentTextField();
        await write(newTableId.getRaw());
        // Different ways of exiting:

        // Click on right-hand end of table header:
        const headerBox = rectangleBoundsScreen(grid, rectangleBounds);
        const point = { x: headerBox.right - 2, y: headerBox.top + 2 };
        await clickAt(document.elementFromPoint(point.x, point.y)!, point);

        // Renaming involves thread hopping, so wait for a bit:
        const expected = new Set([newTableId.getRaw(), ...s.transformPositions.keys()]);
        await vi.waitUntil(() => setEquals(new Set(engineHost(s.app).tableManager.getAllTables().map(t => t.getId().getRaw())), expected), { timeout: 5000 });
        // Check we haven't amassed multiple tables during the rename re-runs:
        await vi.waitUntil(() => count(".table-display-table-title") === s.tableCount);
        expect(count(".table-display-column-title")).toBe(s.tableCount * 2);
    }, { trials: 3 });
}, 120_000);

test("testRenameColumn", async () =>
{
    const s = await start();
    const grid = virtualGrid(s.app);
    await checkProperty([new GenColumnId()], async (newColumnId: ColumnId) =>
    {
        const manager = engineHost(s.app).tableManager;
        const src = manager.getAllTables().find(t => t instanceof ImmediateDataSource)!;
        if (src.getData().getColumnIds().some(c => c.equals(newColumnId)))
            return; // In the rare case we try to rename to an existing column name, skip

        // 3 tables, 2 columns each:
        expect(count(".table-display-table-title")).toBe(s.tableCount);
        expect(count(".table-display-column-title")).toBe(s.tableCount * 2);
        const rectangleBounds = new RectangleBounds(originalTableTopLeft, originalTableTopLeft.offsetByRowCols(1, 0));
        await clickOnItemInBounds(".table-display-column-title", grid, rectangleBounds);
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".column-name-text-field"), { timeout: 5000 }));
        await selectAllCurrentTextField();
        await write(newColumnId.getRaw());
        await userEvent.click(document.querySelector(".ok-button")!);

        // Renaming involves thread hopping, so wait for a bit:
        await vi.waitUntil(() => document.querySelector(".edit-column-content") === null);
        await engineHost(s.app).idle();
        // Fetch the sorted transformation and check the column names (checks rename, and propagation):
        await vi.waitUntil(() =>
        {
            for (const [id] of s.transformPositions)
            {
                const table = engineHost(s.app).tableManager.getSingleTableOrNull(new TableId(id));
                if (table === null)
                    return false;
                if (!(table instanceof Aggregate) && !setEquals(new Set(table.getData().getColumnIds().map(c => c.getRaw())), new Set(["Number", newColumnId.getRaw()])))
                    return false;
            }
            return true;
        }, { timeout: 5000 });

        for (const [id, check] of s.postRenameChecks)
            check(engineHost(s.app).tableManager.getSingleTableOrThrow(new TableId(id)), newColumnId);

        // Check we haven't amassed multiple tables during the rename re-runs:
        await vi.waitUntil(() => count(".table-display-table-title") === s.tableCount);
        await vi.waitUntil(() => count(".table-display-column-title") === s.tableCount * 2);
    }, { trials: 3 });
}, 120_000);

test("testDeleteColumn", async () =>
{
    const s = await start();
    const grid = virtualGrid(s.app);
    await checkProperty([new GenRandom()], async (r: JavaRandom) =>
    {
        const manager = engineHost(s.app).tableManager;
        // Pick a table and column:
        const columns = manager.getAllTables().flatMap(t => t.getData().getColumnIds().map(c => new Pair(t.getId(), c)));
        const picked = columns[r.nextInt(columns.length)]!;
        expect(manager.getSingleTableOrThrow(picked.getFirst()).getData().getColumnOrNull(picked.getSecond())).not.toBeNull();
        // Scroll to it
        const d = display(s.app, picked.getFirst().getRaw());
        document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
        await keyboardMoveToTableCell(grid, d, 0, d.info.columnNames.indexOf(picked.getSecond().getRaw()));
        await push("ArrowUp");
        await push("ArrowUp");
        // (Java's checks found the header where it would be once the smooth scrolling ends)
        await waitForScrollToStop();
        // Either keyboard or context menu:
        if (r.nextBoolean())
        {
            await push(r.nextBoolean() ? "Backspace" : "Delete");
        }
        else
        {
            const { element, point } = withItemInBounds(".column-title", grid, grid.getSelection()!.getSelectionDisplayRectangle());
            await clickAt(element, point, "right");
            await vi.waitUntil(() => document.querySelector(".context-menu") !== null);
            const deleteItem = document.querySelector(".id-virtGrid-column-delete");
            if (deleteItem !== null)
                await userEvent.click(deleteItem);
            else
                await push("Escape");
        }

        await engineHost(s.app).idle();
        await new Promise(resolve => setTimeout(resolve, 500));
        const table = engineHost(s.app).tableManager.getSingleTableOrThrow(picked.getFirst());
        const columnAfter = table.getData().getColumnOrNull(picked.getSecond());
        if (table instanceof ImmediateDataSource)
            expect(columnAfter).toBeNull();
        else
            expect(columnAfter).not.toBeNull(); // Can't delete from sort
    }, { trials: 2 });
}, 120_000);

test("testDeleteTable", async () =>
{
    const s = await start();
    const grid = virtualGrid(s.app);
    await checkProperty([new GenRandom()], async (r: JavaRandom) =>
    {
        const manager = engineHost(s.app).tableManager;
        // Pick a table and column:
        const picked = manager.getAllTables()[r.nextInt(manager.getAllTables().length)]!;
        expect(manager.getSingleTableOrNull(picked.getId())).not.toBeNull();
        // Scroll to it
        const position = display(s.app, picked.getId().getRaw()).getPosition();
        document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
        // Either keyboard or context menu:
        if (r.nextBoolean())
        {
            await keyboardMoveTo(grid, position);
            await push(r.nextBoolean() ? "Backspace" : "Delete");
        }
        else
        {
            await triggerTableHeaderContextMenu(grid, position);
            await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-delete")));
        }

        await vi.waitUntil(() => engineHost(s.app).tableManager.getSingleTableOrNull(picked.getId()) === null);
        const button = await vi.waitUntil(() => document.querySelector<HTMLElement>(".create-table-grid-button"), { timeout: 2000 });
        expect(button.checkVisibility(), "New button showing").toBe(true);
    }, { trials: 2 });
}, 120_000);

// Java: @Ignore // TODO restore
test.skip("testAddColumnAtRight", () => {});
// Java: @Ignore // TODO restore
test.skip("testAddColumnBeforeAfter", () => {});
// Java: @Ignore // TODO restore
test.skip("testTableDrag", () => {});
// Java: @Ignore // TODO restore
test.skip("testChangeColumnType", () => {});

function setEquals(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean
{
    return a.size === b.size && [...a].every(x => b.has(x));
}
