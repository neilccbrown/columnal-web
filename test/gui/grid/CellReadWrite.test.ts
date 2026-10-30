// Port of TestCellReadWrite (tests-gui-cell-rw): copying cells gives their values; deleting sets them
// to their columns' defaults; values typed into cells are stored (as invalid text when they can't be
// read), shown, and kept; and Escape or undo leaves the value as it was.
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import type { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import type { Table } from "../../../src/engine/data/data/Table.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import type { VirtualGrid } from "../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";
import type { GridTableDisplay } from "../../../src/gui/grid/GridTableDisplay.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { GenValueSpecifiedType } from "../../engine/tests-functions/fixtures/gen/GenValueSpecifiedType.js";
import { TTableUtil } from "../../engine/tests-tables/fixtures/TTableUtil.js";
import { GenImmediateData } from "../../engine/tests-tables/fixtures/gen/GenImmediateData.js";
import { textToType } from "../../gui-logic/stf/fixtures/textToType.js";
import { checkProperty } from "../../support/quickcheck.js";
import { copyToClipboard } from "../base/clipboard.js";
import { keyboardMoveToTableCell } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { renderEngineGrid } from "../fixtures/engineGrid.js";

const gen = (minTables: number, maxTables: number) => new GenImmediateData({ numTables: { minTables, maxTables } });

function pickRandomTable(r: JavaRandom, allTables: readonly Table[]): Table
{
    const sorted = [...allTables].sort((a, b) => a.getId().getRaw() < b.getId().getRaw() ? -1 : a.getId().getRaw() > b.getId().getRaw() ? 1 : 0);
    return sorted[r.nextInt(sorted.length)]!;
}

async function openTables(src: GenImmediateData.ImmediateData_Mgr)
{
    const rendered = await renderEngineGrid(TTableUtil.save(src.mgr));
    rendered.scroller.focus();
    const displayOf = (table: Table): GridTableDisplay => rendered.grid.displays().find(d => d.info.id === table.getId().getRaw())!;
    return { ...rendered, virtualGrid: rendered.grid.grid as VirtualGrid, displayOf };
}

// Types text into the focused field (userEvent's keyboard reads "{" and "[" as the start of a key name).
// Its keyboard turns characters outside the BMP into U+FFFD, so those are inserted as typing would
// (an input event) through execCommand:
async function write(text: string): Promise<void>
{
    for (const run of text.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\uD800-\uDFFF]+/g) ?? [])
    {
        if (run.length === 2 && /^[\uD800-\uDBFF]/.test(run))
            document.execCommand("insertText", false, run);
        else
            await userEvent.keyboard(run.replace(/[{[]/g, c => c + c));
    }
}
const shortcut = (key: string): Promise<void> => userEvent.keyboard(isMac() ? `{Meta>}${key}{/Meta}` : `{Control>}${key}{/Control}`);

// The data cell's element, once it has arrived:
const cellElement = (display: GridTableDisplay, row: number, column: number): Element | null =>
    document.querySelector(`[data-table="${CSS.escape(display.info.id)}"] .row[data-row="${row}"] .cell[data-col="${column}"]:not(.loading)`);

// Java: assertErrorShowing, the cell's has-error pseudo-class
async function assertErrorShowing(display: GridTableDisplay, row: number, column: number, expectError: boolean): Promise<void>
{
    await expect.poll(() => cellElement(display, row, column)?.classList.contains("has-error")).toBe(expectError);
}

test("propCheckDataRead", () => checkProperty([gen(2, 4), new GenRandom()], async (src: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
{
    const { host, virtualGrid, displayOf, unmount } = await openTables(src);
    try
    {
        const allTables = host.tableManager.getAllTables();
        // Pick some random locations in random tables, scroll there, copy data and check value:
        for (let i = 0; i < 5; i++)
        {
            const table = pickRandomTable(r, allTables);
            const column = r.nextInt(table.getData().getColumns().length);
            const tableLen = table.getData().getLength();
            if (tableLen === 0)
                continue;
            const row = r.nextInt(tableLen);
            const pos = await keyboardMoveToTableCell(virtualGrid, displayOf(table), row, column);
            const copiedFromTable = await copyToClipboard();
            const valueFromData = DataTypeUtility.valueToString(table.getData().getColumns()[column]!.getType().getCollapsed(row));
            expect(copiedFromTable, `Location ${pos.toString()} row : ${row} col: ${column}`).toEqual(valueFromData);
        }
    }
    finally
    {
        unmount();
    }
}, { trials: 3 }), 240_000);

test("propCheckDataDelete", () => checkProperty([gen(2, 4), new GenRandom()], async (src: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
{
    const { host, virtualGrid, displayOf, unmount } = await openTables(src);
    try
    {
        const allTables = host.tableManager.getAllTables();
        // Pick some random locations in random tables, scroll there, press delete and check value:
        for (let i = 0; i < 5; i++)
        {
            const table = pickRandomTable(r, allTables);
            const column = r.nextInt(table.getData().getColumns().length);
            const tableLen = table.getData().getLength();
            if (tableLen === 0)
                continue;
            const row = r.nextInt(tableLen);
            const pos = await keyboardMoveToTableCell(virtualGrid, displayOf(table), row, column);
            await userEvent.keyboard(r.nextBoolean() ? "{Backspace}" : "{Delete}");
            await sleep(200);
            const copiedFromTable = await copyToClipboard();
            const valueFromData = DataTypeUtility.valueToString(table.getData().getColumns()[column]!.getDefaultValue()!);
            expect(copiedFromTable, `Location ${pos.toString()} row : ${row} col: ${column}`).toEqual(valueFromData);
        }
    }
    finally
    {
        unmount();
    }
}, { trials: 3 }), 240_000);

test("propCheckDataWrite", () => checkProperty([gen(3, 5), new GenRandom(), new GenValueSpecifiedType()], async (src: GenImmediateData.ImmediateData_Mgr, r: JavaRandom, valueGenerator: GenValueSpecifiedType.ValueGenerator) =>
{
    const { host, virtualGrid, displayOf, unmount } = await openTables(src);
    try
    {
        const allTables = host.tableManager.getAllTables();
        interface Written { readonly table: Table, readonly row: number, readonly column: number, readonly text: string, readonly error: boolean }
        // By location, the content and whether it is an error:
        const writtenData = new Map<string, Written>();

        // Pick some random locations in random tables, scroll there, write new data:
        for (let i = 0; i < 8; i++)
        {
            const table = pickRandomTable(r, allTables);
            const column = r.nextInt(table.getData().getColumns().length);
            const tableLen = table.getData().getLength();
            if (tableLen === 0)
                continue;
            const row = r.nextInt(tableLen);
            // Move to the location and edit:
            const display = displayOf(table);
            const target: CellPosition = await keyboardMoveToTableCell(virtualGrid, display, row, column);
            await userEvent.keyboard("{Enter}");
            const type = table.getData().getColumns()[column]!.getType().getType();
            let value: Either<string, Value>;
            if (r.nextInt(5) === 1 && !type.equals(DataType.TEXT))
                value = Either.left("#" + r.nextInt());
            else
                value = Either.right(valueGenerator(type));
            await value.either(async str =>
            {
                await shortcut("a");
                await write(str);
            }, async val =>
            {
                await write(textToType(type, val, r, true));
            });
            await userEvent.keyboard("{Enter}");
            await userEvent.keyboard("{ArrowUp}");

            const copiedFromTable = await copyToClipboard();
            const valueEntered = value.either(s => "@INVALID\"" + s + "\"", v => DataTypeUtility.valueToString(v));
            expect(copiedFromTable, `${target.toString()} ${table.getId().getRaw()} row ${row} col ${column}`).toEqual(valueEntered);
            writtenData.set(`${table.getId().getRaw()} ${row} ${column}`, { table, row, column, text: valueEntered, error: value.isLeft() });
            await assertErrorShowing(display, row, column, value.isLeft());
        }

        // Go back to the data we wrote, and check the cells retained the value:
        for (const written of writtenData.values())
        {
            const display = displayOf(written.table);
            await keyboardMoveToTableCell(virtualGrid, display, written.row, written.column);
            await assertErrorShowing(display, written.row, written.column, written.error);
            const copiedFromTable = await copyToClipboard();
            expect(copiedFromTable, `Position ${written.table.getId().getRaw()} ${written.row} ${written.column}`).toEqual(written.text);
        }
    }
    finally
    {
        unmount();
    }
}, { trials: 3 }), 300_000);

test("propCheckDataUndo", () => checkProperty([gen(2, 4), new GenRandom()], async (src: GenImmediateData.ImmediateData_Mgr, r: JavaRandom) =>
{
    const { host, virtualGrid, displayOf, unmount } = await openTables(src);
    try
    {
        const allTables = host.tableManager.getAllTables();
        // Pick some random locations in random tables, scroll there, write text, then escape or undo:
        for (let i = 0; i < 5; i++)
        {
            const table = pickRandomTable(r, allTables);
            const column = r.nextInt(table.getData().getColumns().length);
            const tableLen = table.getData().getLength();
            if (tableLen === 0)
                continue;
            const col = table.getData().getColumns()[column]!;
            const row = r.nextInt(tableLen);
            const pos = await keyboardMoveToTableCell(virtualGrid, displayOf(table), row, column);
            let valueFromData = DataTypeUtility.valueToString(col.getType().getCollapsed(row));
            let copiedFromTable = await copyToClipboard();
            expect(copiedFromTable, `Location ${pos.toString()} row : ${row} col: ${column}`).toEqual(valueFromData);
            // Now start editing:
            await write(String(r.nextLong()));

            const escape = r.nextBoolean();
            if (escape)
            {
                // Press escape:
                await userEvent.keyboard("{Escape}");
            }
            else
            {
                await shortcut("z");
                await userEvent.keyboard("{Enter}");
                await userEvent.keyboard("{ArrowUp}");
            }
            await sleep(200);
            copiedFromTable = await copyToClipboard();
            valueFromData = DataTypeUtility.valueToString(col.getType().getCollapsed(row));
            expect(copiedFromTable, `Location ${pos.toString()} row : ${row} col: ${column} escape: ${escape}`).toEqual(valueFromData);
        }
    }
    finally
    {
        unmount();
    }
}, { trials: 3 }), 240_000);
