// Port of test.gui.transformation.TestManualEdit (tests-gui-transformations): making a Manual Edit of a
// transformation (by editing one of its cells and saying Yes to making one, or from the new-table
// dialog), picking how it identifies rows, editing its cells, sorting it, and deleting entries in its
// entries dialog (or jumping to one), checking the values each time (docs/gui-spec/transformations.md).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { Column } from "../../../src/engine/data/data/Column.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { Transformation } from "../../../src/engine/data/data/Transformation.js";
import type { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { ClipboardUtils } from "../../../src/engine/importers/importers/ClipboardUtils.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { TreeMap } from "../../../src/engine/java/TreeMap.js";
import { ManualEdit } from "../../../src/engine/transformations/transformations/ManualEdit.js";
import { Sort } from "../../../src/engine/transformations/transformations/Sort.js";
import type { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { ComparableEither } from "../../../src/engine/utility-adt/utility/adt/ComparableEither.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InvalidImmediateValueException } from "../../../src/engine/utility-error/error/InvalidImmediateValueException.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { GridTableDisplay } from "../../../src/gui/grid/GridTableDisplay.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { textToType } from "../../gui-logic/stf/fixtures/textToType.js";
import { TBasicUtil } from "../../engine/tests-basic/fixtures/data/TBasicUtil.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { GenValueSpecifiedType } from "../../engine/tests-functions/fixtures/gen/GenValueSpecifiedType.js";
import { TTableUtil } from "../../engine/tests-tables/fixtures/TTableUtil.js";
import { checkProperty, GeometricDistribution, SimpleGenerationStatus, SourceOfRandomness } from "../../support/quickcheck.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { copyToClipboard, recordsOnClipboard } from "../base/clipboard.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { keyboardMoveTo, keyboardMoveToTableCell, scrollTo } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { closeApp, engineHost, renderApp, waitForLoaded, type RenderedApp } from "../fixtures/app.js";
import { GenDataAndTransforms } from "./GenDataAndTransforms.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

import ComparableValue = DataTypeUtility.ComparableValue;
type Replacements = Map<string, TreeMap<ComparableValue, ComparableEither<string, ComparableValue>>>;

// Java: ValueMaker, whose source of randomness is made (once) from the first Random given
let valueSource: { readonly r: SourceOfRandomness, readonly gs: SimpleGenerationStatus } | null = null;
class ValueMaker
{
    private static readonly genValue = new GenValueSpecifiedType();

    public constructor(private readonly dataType: DataType, random: JavaRandom)
    {
        if (valueSource === null)
        {
            const r = new SourceOfRandomness(random);
            valueSource = { r, gs: new SimpleGenerationStatus(new GeometricDistribution(), r, 10) };
        }
    }

    public getDataType(): DataType
    {
        return this.dataType;
    }

    public makeValue(): Value
    {
        return ValueMaker.genValue.generate(valueSource!.r, valueSource!.gs)(this.dataType);
    }
}

const centre = (selector: string): { x: number, y: number } =>
{
    const r = document.querySelector(selector)!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
const alertShowing = (): boolean => document.querySelector(".alert-header") !== null;

// Java: the values in a TreeMap equal (as Java's HashMap of TreeMaps' equals), shown as text
function replacementsText(replacements: ReadonlyMap<string, TreeMap<ComparableValue, ComparableEither<string, ComparableValue>>>): string[]
{
    const text = (e: ComparableEither<string, ComparableValue>): string => e.either(s => "error " + s, v => DataTypeUtility.valueToString(v.getValue()));
    return [...replacements.entries()].flatMap(([c, m]) => [...m.entries()].map(([k, v]) => c + ": " + DataTypeUtility.valueToString(k.getValue()) + " -> " + text(v))).sort();
}

function actualReplacements(manualEdit: ManualEdit): Replacements
{
    const r: Replacements = new Map();
    manualEdit._test_getReplacements().forEach((m, c) => r.set(c.getRaw(), m));
    return r;
}

// The table's title's menu's "Copy values", then the values from the clipboard
async function copyValues(a: RenderedApp, tableId: TableId): Promise<ClipboardUtils.LoadedColumnInfo[] | null>
{
    const grid = a.mainWindow()!.grid()!;
    const display = await vi.waitUntil(() => grid.displays().find(d => d.info.id === tableId.getRaw()), { timeout: 5000 });
    await keyboardMoveTo(grid.grid, display.getPosition());
    await copyToClipboard(async () =>
    {
        // (By an event: the table may be at the top, under its hat; Java found the title's node itself)
        const title = document.querySelector<HTMLElement>(`[data-table="${CSS.escape(tableId.getRaw())}"] .table-display-table-title`)!;
        const box = title.getBoundingClientRect();
        title.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: box.left + 2, clientY: box.top + 5 }));
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-copyValues")));
    });
    return ClipboardUtils.loadValuesFromClipboard(engineHost(a).tableManager.getTypeManager(), await recordsOnClipboard());
}

test("propManualEdit", () => checkProperty([new GenDataAndTransforms(), new GenRandom()], async (original: TableManager, r: JavaRandom) =>
{
    valueSource = null;
    if (app !== null)
        await closeApp(app);
    const a = app = await renderApp([{ name: "P", content: TTableUtil.save(original) }], 0);
    await waitForLoaded();
    const mgr = engineHost(a).tableManager;
    await vi.waitUntil(() => document.querySelectorAll(".table").length === mgr.getAllTables().length, { timeout: 10_000 });
    await a.mainWindow()!.engine.client.request("idle");
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    const grid = a.mainWindow()!.grid()!;
    const display = (id: TableId): GridTableDisplay | undefined => grid.displays().find(d => d.info.id === id.getRaw());

    // Pick a src table for the manual edit:
    const allSrcs = mgr.getAllTables().filter(t => t instanceof Transformation);
    const srcTableId = allSrcs[r.nextInt(allSrcs.length)]!.getId();
    // The table may get re-run when things change, but its ID will not, so we fetch it each time by its ID:
    const findSrc = (): Transformation => mgr.getSingleTableOrThrow(srcTableId) as Transformation;
    // The source table's types will never get modified:
    const columnTypes = findSrc().getData().getColumns().map(column => new ValueMaker(column.getType().getType(), r));

    // -1 means use row number
    const srcColumnCount = findSrc().getData().getColumns().length;
    expect(srcColumnCount).toBeGreaterThanOrEqual(1);
    const replaceKeyColumnIndex = r.nextInt(5) === 1 ? -1 : r.nextInt(srcColumnCount);
    // Fetches the column that is being used for the manual edit primary key.  Null means using row number.
    const findReplaceKeyColumn = (): Column | null => replaceKeyColumnIndex === -1 ? null : findSrc().getData().getColumns()[replaceKeyColumnIndex]!;

    // Start by checking the original values are as expected if we copy them:
    let expected = makeExpected(findSrc().getData(), null, new Map(), null);
    checkEqual(expected, await copyValues(a, srcTableId));
    checkEqual(expected, getGraphicalContent(display(srcTableId)!, findSrc().getData()));

    // Each item is a row number of a row that does not share its key with any other row:
    const rowIndexesWithUniqueKey: number[] = [];
    {
        const replaceKeyColumn = findReplaceKeyColumn();
        if (replaceKeyColumn !== null)
        {
            // Each value is a list of row indexes
            const freqCount = new TreeMap<ComparableValue, number[]>();
            for (let i = 0; i < replaceKeyColumn.getLength(); i++)
            {
                try
                {
                    const key = new ComparableValue(replaceKeyColumn.getType().getCollapsed(i));
                    freqCount.set(key, [...freqCount.get(key) ?? [], i]);
                }
                catch (e)
                {
                    // Ignore this; not a key that can be matched anyway, so just don't add to map.
                    if (!(e instanceof InvalidImmediateValueException))
                        throw e;
                }
            }
            freqCount.forEach(rowIndexes =>
            {
                if (rowIndexes.length === 1)
                    rowIndexesWithUniqueKey.push(rowIndexes[0]!);
            });
        }
        // PORT-NOTE: bug fix: Java only filled the list for a key column, so a Manual Edit by row number
        // always gave up below; each row number is unique.
        else
            rowIndexesWithUniqueKey.push(...Array.from({ length: findSrc().getData().getLength() }, (_x, i) => i));
    }

    // Can happen e.g. with boolean keys, just going to have to give up:
    if (rowIndexesWithUniqueKey.length === 0)
        return;

    // Now time to make some replacements
    const length = findSrc().getData().getLength();
    // Pass true if you require a row with a unique replacement key, false if you just want a valid row number
    const makeRowIndex = (unique: boolean): number => unique ? rowIndexesWithUniqueKey[r.nextInt(rowIndexesWithUniqueKey.length)]! : r.nextInt(length);
    const numColumns = findSrc().getData().getColumns().length;
    const makeColIndex = (): number => r.nextInt(numColumns);

    const replacementsSoFar: Replacements = new Map();
    const record = (column: ColumnId, key: Value, value: ComparableEither<string, ComparableValue>): void =>
    {
        const m = replacementsSoFar.get(column.getRaw()) ?? new TreeMap<ComparableValue, ComparableEither<string, ComparableValue>>();
        m.set(new ComparableValue(key), value);
        replacementsSoFar.set(column.getRaw(), m);
    };
    const keyAt = (row: number): Value | null =>
    {
        const replaceKeyColumn = findReplaceKeyColumn();
        return replaceKeyColumn === null ? new Decimal(row) : TBasicUtil.getSingleCollapsedData(replaceKeyColumn.getType(), row).leftToNull();
    };
    const sameAsExisting = (row: number, col: number, v: Value): boolean => TBasicUtil.getSingleCollapsedData(findSrc().getData().getColumns()[col]!.getType(), row).either(_e => -1, x => Utility.compareValues(x, v)) === 0;

    // There's two ways to create a new manual edit transformation.  One is to just create it using the menu.
    // The other is to try to edit an existing transformation, and follow the popup which appears
    let madeManualEdit = false;
    if (r.nextBoolean())
    {
        // Let's pick a location and edit it
        const row = makeRowIndex(true);
        const col = makeColIndex();
        const replaceKey = keyAt(row);
        let value = columnTypes[col]!.makeValue();
        for (let i = 0; i < 5 && sameAsExisting(row, col, value); i++)
            value = columnTypes[col]!.makeValue();

        // Only works if value is different:
        if (!sameAsExisting(row, col, value))
        {
            // Trying to edit row with error key, so not clear what should happen.  Just leave it...
            if (replaceKey === null)
                return;
            record(findSrc().getData().getColumnIds()[col]!, replaceKey, ComparableEither.right(new ComparableValue(value)));

            const cellPos = await keyboardMoveToTableCell(grid.grid, display(srcTableId)!, row, col);
            const oldContent = display(srcTableId)!.getCell(row, col);
            await push("Enter");
            await userEvent.keyboard(isMac() ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}");
            await write(textToType(columnTypes[col]!.getDataType(), value, r, true));
            await push("Enter");

            // Alert should be showing asking whether to create manual edit
            await vi.waitUntil(alertShowing, { timeout: 5000 });
            expect(document.querySelector(".alert-header")!.textContent.trim()).toBe("Create edit transformation?");
            await userEvent.click(document.querySelector(".yes-button")!);
            await vi.waitUntil(() => !alertShowing());

            await a.mainWindow()!.engine.client.request("idle");
            expect(display(srcTableId)!.getCell(row, col)).toEqual(oldContent);
            expect(cellPos).not.toBeNull();
            // Now fall through to fill in same details as creating directly...
            madeManualEdit = true;
        }
    }

    if (!madeManualEdit)
    {
        // Let's create it directly.
        const targetPos = mgr.getNextInsertPosition(null);
        await keyboardMoveTo(grid.grid, targetPos);
        await clickOnItemInBounds("[data-testid=grid]", grid.grid, new RectangleBounds(targetPos, targetPos));
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
        await scrollTo(await vi.waitUntil(() => document.querySelector(".id-transform-edit")));
        await userEvent.click(document.querySelector(".id-transform-edit")!);
        await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true);
        await write(srcTableId.getRaw());
        await push("Enter");
    }

    await vi.waitUntil(() => document.querySelector(".id-manual-edit-bycolumn") !== null, { timeout: 5000 });
    {
        const replaceKeyColumn = findReplaceKeyColumn();
        if (replaceKeyColumn === null)
            await userEvent.click(document.querySelector(".id-manual-edit-byrownum")!);
        else
        {
            await userEvent.click(document.querySelector(".id-manual-edit-bycolumn")!);
            await push("Tab");
            await write(replaceKeyColumn.getName().getRaw());
        }
    }
    await moveAndDismissPopupsAtPos(centre(".ok-button"));
    await userEvent.click(document.querySelector(".ok-button")!);

    // Now we should have a transformation, time to do some edits
    const manualEditId = ManualEdit.suggestedName(findReplaceKeyColumn()?.getName() ?? null, replacementsSoFar);
    const findManualEdit = (): ManualEdit => mgr.getSingleTableOrThrow(manualEditId) as ManualEdit;
    await vi.waitUntil(() => mgr.getSingleTableOrNull(manualEditId) instanceof ManualEdit && display(manualEditId) !== undefined, { timeout: 5000 });
    await a.mainWindow()!.engine.client.request("idle");

    // Add a sort transformation, sorting the edit transformation by a random column:
    const targetSortPos = mgr.getNextInsertPosition(manualEditId).offsetByRowCols(2, 0);
    await keyboardMoveTo(grid.grid, targetSortPos);
    await clickOnItemInBounds("[data-testid=grid]", grid.grid, new RectangleBounds(targetSortPos, targetSortPos));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-sort")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true);
    await write(manualEditId.getRaw());
    await push("Enter");
    let sortEditByColumn = findSrc().getData().getColumnIds()[r.nextInt(numColumns)]!;
    await vi.waitUntil(() => document.activeElement?.classList.contains("sort-column-field") === true, { timeout: 5000 });
    await write(sortEditByColumn.getRaw());
    await moveAndDismissPopupsAtPos(centre(".ok-button"));
    await userEvent.click(document.querySelector(".ok-button")!);
    // Hack to get id of new sort:
    let sortId = Sort.suggestedName([new Pair(sortEditByColumn, "")]);
    await vi.waitUntil(() => display(sortId) !== undefined, { timeout: 5000 });

    // Now make the further manual edits:
    const numFurtherEdits = r.nextInt(10);
    for (let i = 0; i < numFurtherEdits; i++)
    {
        const row = makeRowIndex(true);
        const col = makeColIndex();
        const replaceKey = keyAt(row);
        const value = columnTypes[col]!.makeValue();
        let toEnter: ComparableEither<string, ComparableValue> = ComparableEither.right(new ComparableValue(value));
        // Make error instead:
        if (sameAsExisting(row, col, value))
            toEnter = ComparableEither.left("@" + r.nextInt());
        if (replaceKey !== null)
            record(findSrc().getData().getColumnIds()[col]!, replaceKey, toEnter);

        expect(alertShowing()).toBe(false);
        await keyboardMoveToTableCell(grid.grid, display(manualEditId)!, row, col);
        await sleep(200);
        expect(alertShowing()).toBe(false);
        await push("Enter");
        // If key has an error, we should get a dialog.
        if (replaceKey === null)
        {
            await vi.waitUntil(alertShowing, { timeout: 5000 });
            await userEvent.click(document.querySelector(".ok-button")!);
            await vi.waitUntil(() => !alertShowing());
        }
        else
        {
            expect(alertShowing()).toBe(false);
            await userEvent.keyboard(isMac() ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}");
            await write(toEnter.either(s => s, v => textToType(columnTypes[col]!.getDataType(), v.getValue(), r, true)));
            await push("Enter");
            await a.mainWindow()!.engine.client.request("idle");
        }
    }

    // On random chance, change sort order of the transformation that is sorting the manual edit:
    if (r.nextInt(3) === 1)
    {
        // (Java clicked the link programmatically, as hats may overlap)
        (await vi.waitUntil(() => document.querySelector<HTMLElement>(`.table-hat[data-table="${CSS.escape(sortId.getRaw())}"] .edit-sort-by`), { timeout: 5000 })).click();
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".sort-list-dialog .small-delete"), { timeout: 5000 }));
        await sleep(500);
        await userEvent.click(document.querySelector(".sort-list-dialog .id-fancylist-add")!);
        sortEditByColumn = findSrc().getData().getColumnIds()[r.nextInt(numColumns)]!;
        await vi.waitUntil(() => document.activeElement?.classList.contains("sort-column-field") === true);
        await write(sortEditByColumn.getRaw());
        sortId = Sort.suggestedName([new Pair(sortEditByColumn, "")]);
        await moveAndDismissPopupsAtPos(centre(".ok-button"));
        await userEvent.click(document.querySelector(".ok-button")!);
        const sortIdFinal = sortId;
        await vi.waitUntil(() => display(sortIdFinal) !== undefined, { timeout: 5000 });
    }

    // Now check output values by getting them from clipboard:
    await a.mainWindow()!.engine.client.request("idle");
    expected = makeExpected(findSrc().getData(), findReplaceKeyColumn()?.getName() ?? null, replacementsSoFar, null);
    expect(replacementsText(actualReplacements(findManualEdit()))).toEqual(replacementsText(replacementsSoFar));
    checkEqual(expected, await copyValues(a, manualEditId));
    checkEqual(expected, getGraphicalContent(display(manualEditId)!, findManualEdit().getData()));

    // Copy the values from the resulting sort:
    const secondSort = mgr.getSingleTableOrThrow(sortId) as Sort;
    const expectedSecondSort = makeExpected(findManualEdit().getData(), findReplaceKeyColumn()?.getName() ?? null, new Map(), sortEditByColumn);
    checkEqual(expectedSecondSort, await copyValues(a, sortId));
    checkEqual(expectedSecondSort, getGraphicalContent(display(sortId)!, secondSort.getData()));

    await keyboardMoveToTableCell(grid.grid, display(manualEditId)!, 0, findManualEdit().getData().getColumns().length - 1);
    (await vi.waitUntil(() => document.querySelector<HTMLElement>(`.table-hat[data-table="${CSS.escape(manualEditId.getRaw())}"] .manual-edit-entries`), { timeout: 5000 })).click();
    await vi.waitUntil(() => document.querySelector(".manual-edit-entries-dialog") !== null, { timeout: 5000 });

    const entryText = (column: string, key: ComparableValue, value: ComparableEither<string, ComparableValue>): string =>
        [DataTypeUtility.valueToString(key.getValue()), column, value.either(s => s, v => DataTypeUtility.valueToString(v.getValue()))].join("|");
    const getEntries = (): { column: string, key: ComparableValue, text: string }[] => [...replacementsSoFar.entries()].flatMap(([c, m]) => [...m.entries()].map(([k, v]) => ({ column: c, key: k, text: entryText(c, k, v) })));
    const entryCell = (text: string): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>(".manual-edit-entries-dialog .fancy-list-cell")]
        .find(cell => [...cell.querySelectorAll(".jump-to-link")].map(l => l.textContent.trim()).join("|") === text);

    // Pick a few to delete:
    for (let i = 0; i < 3 && replacementsSoFar.size > 0; i++)
    {
        const possibleItems = getEntries();
        const toDelete = possibleItems[r.nextInt(possibleItems.length)]!;
        const cell = await vi.waitUntil(() => entryCell(toDelete.text));
        await userEvent.click(cell.querySelector(".small-delete")!);
        // They animate out so we need to give it some time:
        await vi.waitUntil(() => entryCell(toDelete.text) === undefined, { timeout: 5000 });

        const map = replacementsSoFar.get(toDelete.column)!;
        map.delete(toDelete.key);
        if (map.size === 0)
            replacementsSoFar.delete(toDelete.column);
    }

    if (r.nextBoolean() && replacementsSoFar.size > 0)
    {
        // Try using the hyperlink functionality to close the dialog, on random chance:
        const entries = getEntries();
        const toClick = entries[r.nextInt(entries.length)]!;
        await userEvent.click(entryCell(toClick.text)!.querySelector(".jump-to-link")!);
        await vi.waitUntil(() => document.querySelector(".manual-edit-entries-dialog") === null);
        const col = findManualEdit().getData().getColumnIds().findIndex(c => c.getRaw() === toClick.column);
        expect(col).not.toBe(-1);
        let row = -1;
        const replaceKeyColumn = findReplaceKeyColumn();
        if (replaceKeyColumn === null)
            row = Number((toClick.key.getValue() as Decimal).toString());
        else
        {
            const keyColType = replaceKeyColumn.getType();
            const len = findManualEdit().getData().getLength();
            for (let i = 0; i < len; i++)
            {
                try
                {
                    if (Utility.compareValues(keyColType.getCollapsed(i), toClick.key.getValue()) === 0)
                    {
                        row = i;
                        break;
                    }
                }
                catch (e)
                {
                    // Can't be this one; keep going
                    if (!(e instanceof InvalidImmediateValueException))
                        throw e;
                }
            }
        }
        expect(row).not.toBe(-1);
        await vi.waitUntil(() =>
        {
            const d = display(manualEditId);
            const target = grid.grid._test_getSelection()?.getActivateTarget() ?? null;
            return d !== undefined && target !== null && target.equals(d.getPosition().offsetByRowCols(GridTableDisplay.HEADER_ROWS + row, col));
        }, { timeout: 5000 });
        expect(document.querySelector(".id-create-table")).toBeNull();
    }
    else
        await userEvent.click(document.querySelector(".close-button")!);
    await vi.waitUntil(() => document.querySelector(".manual-edit-entries-dialog") === null);

    // Check everything is up to date after deletions:
    await vi.waitUntil(() => replacementsText(actualReplacements(findManualEdit())).join() === replacementsText(replacementsSoFar).join(), { timeout: 5000 }).catch(() => {});
    expect(replacementsText(actualReplacements(findManualEdit()))).toEqual(replacementsText(replacementsSoFar));
    await a.mainWindow()!.engine.client.request("idle");
    expected = makeExpected(findSrc().getData(), findReplaceKeyColumn()?.getName() ?? null, replacementsSoFar, null);
    checkEqual(expected, await copyValues(a, manualEditId));
    checkEqual(expected, getGraphicalContent(display(manualEditId)!, findManualEdit().getData()));
}, { trials: 5 }), 900_000);

function makeExpected(original: RecordSet, replacementIdentifier: ColumnId | null, replacements: Replacements, sortBy: ColumnId | null): ClipboardUtils.LoadedColumnInfo[]
{
    const length = original.getLength();
    // Maps original indexes to sorted indexes
    const sortMap = Array.from({ length }, (_x, i) => i);

    // We effectively pair each integer with the value from that row, then sort by the values and discard them.
    // This leaves a sorted list of indexes into the original table.
    if (sortBy !== null)
    {
        const sortByColumn = original.getColumn(sortBy).getType();
        const sortByData = TBasicUtil.getAllCollapsedData(sortByColumn, original.getLength()).map(x => ComparableEither.fromEither(x.map(v => new ComparableValue(v))));
        // (Java's Collections.sort, stable)
        sortMap.sort((a, b) => sortByData[a]!.compareTo(sortByData[b]!));
    }

    return original.getColumns().map(column =>
    {
        const colReplacements = replacements.get(column.getName().getRaw()) ?? new TreeMap<ComparableValue, ComparableEither<string, ComparableValue>>();
        const columnValues: Either<string, Value>[] = [];
        for (let rowWithoutSort = 0; rowWithoutSort < original.getLength(); rowWithoutSort++)
        {
            // We must map backwards to original row:
            const row = sortMap[rowWithoutSort]!;
            const rowKey: Either<string, Value> = replacementIdentifier === null ? Either.right(new Decimal(row)) : TBasicUtil.getSingleCollapsedData(original.getColumn(replacementIdentifier).getType(), row);
            const replacement = rowKey.either<ComparableEither<string, ComparableValue> | null>(_err => null, k => colReplacements.get(new ComparableValue(k)) ?? null);
            if (replacement !== null)
                columnValues.push(replacement.map(v => v.getValue()));
            else
                columnValues.push(TBasicUtil.getSingleCollapsedData(column.getType(), row));
        }
        return new ClipboardUtils.LoadedColumnInfo(column.getName(), column.getType().getType(), columnValues);
    });
}

function checkEqual(expected: readonly ClipboardUtils.LoadedColumnInfo[], actual: readonly ClipboardUtils.LoadedColumnInfo[] | null): void
{
    // Missing data, so can't compare
    if (actual === null)
        return;
    expect(actual.length).toBe(expected.length);
    for (let colIndex = 0; colIndex < expected.length; colIndex++)
    {
        const expCol = expected[colIndex]!;
        const actCol = actual[colIndex]!;
        expect(actCol.columnName?.getRaw()).toBe(expCol.columnName?.getRaw());
        expect(actCol.dataType.equals(expCol.dataType)).toBe(true);
        TBasicUtil.assertValueListEitherEqual("Column " + expCol.columnName?.getRaw() + " (" + colIndex + ")", expCol.dataValues, actCol.dataValues);
    }
}

// Java: getGraphicalContent: the cells' text as shown (here, as the grid has it), loaded as values; null if
// any cell isn't there
function getGraphicalContent(display: GridTableDisplay, tableData: RecordSet): ClipboardUtils.LoadedColumnInfo[] | null
{
    const r: ClipboardUtils.LoadedColumnInfo[] = [];
    const columns = tableData.getColumns();
    for (let colIndex = 0; colIndex < columns.length; colIndex++)
    {
        const column = columns[colIndex]!;
        const values: Either<string, Value>[] = [];
        for (let row = 0; row < tableData.getLength(); row++)
        {
            const cell = display.getCell(row, colIndex);
            if (cell === null)
                return null;
            const content = cell.text;
            // Bit of a hack, but need to deal with truncated numbers, so we get direct content if truncated:
            if (DataTypeUtility.isNumber(column.getType().getType()) && content.includes("…"))
                values.push(TBasicUtil.getSingleCollapsedData(column.getType(), row));
            else
                values.push(column.getType().getType().loadSingleItem(content.trim()));
        }
        r.push(new ClipboardUtils.LoadedColumnInfo(column.getName(), column.getType().getType(), values));
    }
    return r;
}
