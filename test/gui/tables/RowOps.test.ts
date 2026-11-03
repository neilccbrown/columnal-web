// Port of test.gui.table.TestRowOps (tests-gui-tables): deleting and inserting rows of a data table from
// its row labels' menu (and the add-row arrow), checking what the table and a transformation of it then
// show and export (docs/gui-spec/tables.md).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import type { FieldAccessExpression } from "../../../src/engine/expressions/transformations/expression/FieldAccessExpression.js";
import { ExpressionVisitorStream } from "../../../src/engine/expressions/transformations/expression/visitor/ExpressionVisitorStream.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { Sort } from "../../../src/engine/transformations/transformations/Sort.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { CompositeGenerator, checkProperty } from "../../support/quickcheck.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import type { ExpressionValue } from "../../engine/tests-functions/fixtures/gen/ExpressionValue.js";
import { GenExpressionValueBackwards } from "../../engine/tests-functions/fixtures/gen/GenExpressionValueBackwards.js";
import { GenExpressionValueForwards } from "../../engine/tests-functions/fixtures/gen/GenExpressionValueForwards.js";
import { GenImmediateData } from "../../engine/tests-tables/fixtures/gen/GenImmediateData.js";
import { TTableUtil } from "../../engine/tests-tables/fixtures/TTableUtil.js";
import { collapse, exportToCSVAndCheck } from "../base/checkCSV.js";
import { clickAt } from "../base/clickTableLocation.js";
import { keyboardMoveTo, keyboardMoveToTableCell } from "../base/scrollTo.js";
import { closeApp, engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

async function open(content: string): Promise<RenderedApp>
{
    if (app !== null)
        await closeApp(app);
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === a.mainWindow()!.grid()!.displays().length && document.querySelectorAll(".table").length > 0);
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    return a;
}

function grid(a: RenderedApp)
{
    return a.mainWindow()!.grid()!;
}

function display(a: RenderedApp, id: string)
{
    return grid(a).displays().find(d => d.info.id === id)!;
}

/**
 * Generates a file with some raw data and a transform, then loads it and deletes a row in the source table.
 */
test("propTestDeleteRow", () => checkProperty([new CompositeGenerator<ExpressionValue>([new GenExpressionValueForwards(), new GenExpressionValueBackwards()]), new GenRandom()], async (expressionValue: ExpressionValue, r: JavaRandom) =>
{
    if (expressionValue.recordSet.getLength() === 0)
        return; // Can't delete if there's no rows!
    if (expressionValue.recordSet.getColumns().length === 0)
        return; // Likewise if there's no columns
    // Special case: if the expression has a reference to the whole source column that we're deleting a row
    // from, we're going to get a different result.  Simplest is just to skip that case:
    if (expressionValue.expression.visit(new class extends ExpressionVisitorStream<boolean>
    {
        public override field(_self: FieldAccessExpression, _lhsRecord: Expression, fieldName: string): boolean[]
        {
            return [fieldName === "GEV Col 0"];
        }
    }()).some(x => x))
        return;

    let srcId = "";
    let calculatedId = "";
    const content = savedFile(manager =>
    {
        manager.getTypeManager()._test_copyTaggedTypesFrom(expressionValue.typeManager);

        const srcData = new ImmediateDataSource(manager, new Table.InitialLoadDetails(expressionValue.tableId, null, CellPosition.ORIGIN.offsetByRowCols(1, 1), null), new EditableRecordSet(expressionValue.recordSet));
        manager.record(srcData);
        srcId = srcData.getId().getRaw();

        const ild = new Table.InitialLoadDetails(null, null, new CellPosition(CellPosition.row(1), CellPosition.col(2 + expressionValue.recordSet.getColumns().length)), null);
        const calculated = new Calculate(manager, ild, srcData.getId(), new HashMap<ColumnId, Expression>([[new ColumnId("Result" as ExpressionIdentifier), expressionValue.expression]]));
        manager.record(calculated);
        calculatedId = calculated.getId().getRaw();
    });
    const a = await open(content);

    const randomRow = r.nextInt(expressionValue.recordSet.getLength());

    await triggerRowLabelContextMenu(a, srcId, randomRow);
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-virtGrid-row-delete")));
    await vi.waitUntil(() => engineHost(a).tableManager.getAllTables().find(t => t.getId().getRaw() === srcId)!.getData().getLength() === expressionValue.recordSet.getLength() - 1);
    await engineHost(a).idle();
    await scrollToRow(a, calculatedId, randomRow === 0 ? randomRow : randomRow - 1);

    // There's now several aspects to check:
    // - The row is immediately no longer visible in srcData.
    //     (Well, a row of that number will be, but with diff data).
    // - Ditto for calculated
    // - Exporting srcData does not feature the data.
    // - Ditto for calculated
    if (randomRow === expressionValue.recordSet.getLength() - 1)
    {
        // Row should be gone:
        expect(await findRowLabel(a, srcId, randomRow)).toBeNull();
        expect(await findRowLabel(a, calculatedId, randomRow)).toBeNull();
    }
    else
    {
        // Row still there, but data from the row after it.  (Java's checkVisibleRowData looked for
        // the cells with a lookup that no longer found any, so it only checked the row label was
        // there; the exports below check the data.)
        expect(await findRowLabel(a, srcId, randomRow)).not.toBeNull();
        expect(await findRowLabel(a, calculatedId, randomRow)).not.toBeNull();
    }
    const expectedSrcContent: (readonly [string, readonly string[]])[] = [];
    const expectedCalcContent: (readonly [string, readonly string[]])[] = [];
    const srcTable = engineHost(a).tableManager.getAllTables().find(t => t.getId().getRaw() === srcId)!;
    for (const column of srcTable.getData().getColumns())
    {
        const original = expressionValue.recordSet.getColumn(column.getName());
        const colData = [column.getName().getRaw(), collapse(expressionValue.recordSet.getLength(), original.getType(), randomRow)] as const;
        expectedSrcContent.push(colData);
        expectedCalcContent.push(colData);
    }
    const calcValuesFiltered: string[] = [];
    for (let i = 0; i < expressionValue.value.length; i++)
    {
        if (i !== randomRow)
            calcValuesFiltered.push(DataTypeUtility.valueToString(expressionValue.value[i]!));
    }
    expectedCalcContent.push(["Result", calcValuesFiltered]);
    await exportToCSVAndCheck(grid(a).grid, display(a, srcId), "After deleting " + randomRow, expectedSrcContent);
    await exportToCSVAndCheck(grid(a).grid, display(a, calculatedId), "After deleting " + randomRow, expectedCalcContent);
}, { trials: 5 }), 300_000);

test("propTestInsertRow", () => checkProperty([new GenImmediateData(), new GenRandom()], async (srcDataAndMgr: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
{
    if (srcDataAndMgr.data.length === 0 || srcDataAndMgr.data[0]!.getData().getColumns().length === 0)
        return; // Can't insert if there's no table or no columns

    const manager = srcDataAndMgr.mgr;
    const srcData = srcDataAndMgr.data[0]!;

    const sortBy = srcData.getData().getColumns()[r.nextInt(srcData.getData().getColumns().length)]!;
    const ild = new Table.InitialLoadDetails(null, null, new CellPosition(CellPosition.row(1), CellPosition.col(2 + srcData.getData().getColumns().length)), null);
    const calculated = new Sort(manager, ild, srcData.getId(), [new Pair(sortBy.getName(), Sort.Direction.ASCENDING)]);
    manager.record(calculated);
    const a = await open(TTableUtil.save(manager));
    const src = (): Table => engineHost(a).tableManager.getAllTables().find(t => t.getId().equals(srcData.getId()))!;

    const srcLength = srcData.getData().getLength();
    const targetNewRow = r.nextInt(srcLength + 1);

    // Can't do insert-after if target is first row. Can't do insert-before if it's last row
    if (targetNewRow < srcLength && (targetNewRow === 0 || r.nextBoolean()))
    {
        // Let's do insert-before to get the new row
        await triggerRowLabelContextMenu(a, srcData.getId().getRaw(), targetNewRow);
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-virtGrid-row-insertBefore")));
    }
    else if (targetNewRow > 0)
    {
        // Insert-after:
        const beforeTargetRow = targetNewRow - 1;
        await triggerRowLabelContextMenu(a, srcData.getId().getRaw(), beforeTargetRow);
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-virtGrid-row-insertAfter")));
    }
    else // targetNewRow == 0 && srcLength == 0
    {
        // No rows at all: need to click append button
        const pos = display(a, srcData.getId().getRaw()).getPosition().offsetByRowCols(3, 0);
        await keyboardMoveTo(grid(a).grid, pos);
        const arrow = await vi.waitUntil(() => [...document.querySelectorAll(".expand-arrow.expand-down")].find(e =>
        {
            const b = e.getBoundingClientRect();
            const canvas = document.querySelector("[data-testid=grid] .grid-canvas")!.getBoundingClientRect();
            return Math.abs(b.top - canvas.top - pos.rowIndex * 24) < 2 && Math.abs(b.left - canvas.left - grid(a).grid.sumColumnWidths(0, pos.columnIndex)) < 2;
        }) ?? null);
        await userEvent.click(arrow);
    }
    await vi.waitUntil(() => src().getData().getLength() === srcLength + 1);
    await engineHost(a).idle();

    // There's now several aspects to check:
    // - The row now has the default data in srcData.
    // - Ditto for calculated
    // - The row after in both cases has the old data
    // - Exporting srcData does features the new data and the other data moved.
    // - Ditto for calculated

    // Work out positions in sorted data.  (srcData is the table as it was: the app opened a copy)
    let beforeDefault = 0;
    let firstAfterDefault: readonly [number, Value] | null = null;
    const sortDefault = sortBy.getDefaultValue();
    expect(sortDefault, "Default value null for sortBy column: " + sortBy.getName().getRaw() + " " + sortBy.getType().toString()).not.toBeNull();

    const newSrcLength = srcData.getData().getLength();
    for (let i = 0; i < newSrcLength; i++)
    {
        const value = sortBy.getType().getCollapsed(i);
        const cmp = Utility.compareValues(value, sortDefault!);
        // It will be before us if either it is strictly lower, or it is equal
        // and it started before us.
        if (cmp < 0 || (i < targetNewRow && cmp === 0))
        {
            beforeDefault += 1;
        }
        else if (firstAfterDefault === null || Utility.compareValues(value, firstAfterDefault[1]) < 0)
        {
            firstAfterDefault = [i, value];
        }
    }
    // Position when sorted is simply the number before it in sort order:
    const positionPostSort = beforeDefault;

    // TODO check for default data in inserted spot

    await scrollToRow(a, srcData.getId().getRaw(), targetNewRow === 0 ? targetNewRow : targetNewRow - 1);
    // Row still there, but data from the row after it.  (Java's checkVisibleRowData looked for the
    // cells with a lookup that no longer found any, so it only checked the row label was there; the
    // export below checks the data.)
    if (targetNewRow < newSrcLength)
    {
        expect(await findRowLabel(a, srcData.getId().getRaw(), targetNewRow + 1)).not.toBeNull();
        if (firstAfterDefault !== null)
        {
            await scrollToRow(a, calculated.getId().getRaw(), beforeDefault + 1);
            expect(await findRowLabel(a, calculated.getId().getRaw(), positionPostSort + 1)).not.toBeNull();
        }
    }

    const expectedSrcContent: (readonly [string, readonly string[]])[] = [];
    for (const column of srcData.getData().getColumns())
    {
        const colData = collapse(srcData.getData().getLength(), column.getType());
        // Add new default data at right point:
        const defaultValue = column.getDefaultValue();
        expect(defaultValue, "Null default value for column " + column.getName().getRaw()).not.toBeNull();
        colData.splice(targetNewRow, 0, DataTypeUtility.valueToString(defaultValue!));
        expectedSrcContent.push([column.getName().getRaw(), colData]);
    }

    await exportToCSVAndCheck(grid(a).grid, display(a, srcData.getId().getRaw()), "After inserting " + targetNewRow, expectedSrcContent);
    // TODO sort expected output
    //exportToCSVAndCheck("After inserting " + targetNewRow, expectedCalcContent, calculated.getId());
}, { trials: 5 }), 300_000);

async function triggerRowLabelContextMenu(a: RenderedApp, id: string, targetRow: number): Promise<void>
{
    const rowLabel = await findRowLabel(a, id, targetRow);
    if (rowLabel === null)
        throw new Error("Row label for 0-based " + targetRow + " not found.  Labels: " + findVisRowLabels(id));
    const b = rowLabel.getBoundingClientRect();
    await clickAt(rowLabel, { x: b.left + b.width / 2, y: b.top + b.height / 2 }, "right");
}

function findVisRowLabels(id: string): string
{
    return [...document.querySelectorAll(`.row-labels-area[data-table="${CSS.escape(id)}"] .row-label`)].map(l => l.textContent?.trim() ?? "").sort().join(", ");
}

// Moves to the first cell in the row before (which makes the row labels visible, and ensures we are at
// the correct Y position), then finds the row's label
async function findRowLabel(a: RenderedApp, id: string, targetRow: number): Promise<HTMLElement | null>
{
    await scrollToRow(a, id, targetRow === 0 ? targetRow : targetRow - 1);
    const possibles = [...document.querySelectorAll<HTMLElement>(`.row-labels-area[data-table="${CSS.escape(id)}"] .row-label`)]
        .filter(l => l.checkVisibility() && l.textContent?.trim() === String(1 + targetRow));
    if (possibles.length === 0)
        return null;
    expect(possibles.length, "Possibles is not size 1").toBe(1);
    return possibles[0]!;
}

async function scrollToRow(a: RenderedApp, id: string, targetRow: number): Promise<CellPosition>
{
    const d = display(a, id);
    // (The table's length comes from the engine after it is shown, or changed; until then the grid
    // doesn't reach its rows)
    const length = engineHost(a).tableManager.getAllTables().find(t => t.getId().getRaw() === id)!.getData().getLength();
    await vi.waitUntil(() => display(a, id).currentKnownRows === length);
    // (A row past the end is the add-row arrow's, or nothing: Java moved there all the same)
    if (targetRow >= length)
    {
        const pos = d.getPosition().offsetByRowCols(3 + targetRow, 0);
        await keyboardMoveTo(grid(a).grid, pos);
        return pos;
    }
    return keyboardMoveToTableCell(grid(a).grid, display(a, id), targetRow, 0);
}
