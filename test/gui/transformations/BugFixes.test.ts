// Tests of the Java bugs fixed in the transformations' dialogs (each fails without its fix; see the
// "bug fix" PORT-NOTEs).
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryStringColumn } from "../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { IdentExpression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { TypeState } from "../../../src/engine/expressions/transformations/expression/TypeState.js";
import { Aggregate } from "../../../src/engine/transformations/transformations/Aggregate.js";
import { Concatenate } from "../../../src/engine/transformations/transformations/Concatenate.js";
import { HideColumns } from "../../../src/engine/transformations/transformations/HideColumns.js";
import { Join } from "../../../src/engine/transformations/transformations/Join.js";
import { ManualEdit } from "../../../src/engine/transformations/transformations/ManualEdit.js";
import { Sort } from "../../../src/engine/transformations/transformations/Sort.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { GridTableDisplay } from "../../../src/gui/grid/GridTableDisplay.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { selectGivenListViewItem } from "../base/listUtil.js";
import { keyboardMoveToTableCell } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { engineHost, type RenderedApp } from "../fixtures/app.js";
import { at, centre, closeStarted, columnHeader, columnId, hatPart, pickAt, settled, start, table, tableId } from "./fixtures.js";

afterEach(closeStarted);

// HideColumnsPanel.addAllItemsToHidden
test("columns hidden are in the source's order, not those hidden before first", async () =>
{
    const a = await start(mgr =>
    {
        const columns: ((rs: RecordSet) => EditableColumn)[] = ["P", "Q", "R", "S"].map(c => (rs: RecordSet) => new MemoryStringColumn(rs, columnId(c), [], ""));
        mgr.record(new ImmediateDataSource(mgr, at("V", 6, 1), new EditableRecordSet(columns, () => 0)));
        mgr.record(new HideColumns(mgr, at("H", 6, 8), tableId("V"), [columnId("S")]));
    });
    await userEvent.click(await vi.waitUntil(() => document.querySelector('.table-hat[data-table="H"] .edit-hide-columns')));
    const items = (list: string): string[] => [...document.querySelectorAll(`.${list} [role=option]`)].map(e => e.textContent.trim());
    await vi.waitUntil(() => items("shown-columns-list-view").length === 3, { timeout: 5000 });
    for (const column of ["R", "P"])
    {
        await selectGivenListViewItem(page.elementLocator(document.querySelector(".shown-columns-list-view")!), o => o.textContent.trim() === column);
        await userEvent.click(document.querySelector(".add-button")!);
    }
    // (Java: S, R, P)
    expect(items("hidden-columns-list-view")).toEqual(["P", "R", "S"]);
    await userEvent.click(document.querySelector(".ok-button")!);
    await vi.waitUntil(() => table<HideColumns>(a, "H").getHiddenColumns().length === 3, { timeout: 5000 });
    expect(table<HideColumns>(a, "H").getHiddenColumns().map(c => c.getRaw())).toEqual(["P", "R", "S"]);
});

// EditJoinDialog.pick
test("a column clicked in the grid goes into the column field just focused, not the table field left just before", async () =>
{
    const a = await start(mgr => mgr.record(new Join(mgr, at("J", 1, 10), tableId("T"), tableId("U"), false, [new Pair(columnId("A"), columnId("A"))])));
    await userEvent.click(await vi.waitUntil(() => hatPart("J", "T")));
    const tableFields = await vi.waitUntil(() => { const f = [...document.querySelectorAll<HTMLInputElement>(".edit-join-content .pick-table-field")]; return f.length === 2 ? f : null; }, { timeout: 5000 });
    await userEvent.click(tableFields[0]!);
    const primaryColumn = document.querySelector<HTMLInputElement>(".join-primary-column")!;
    await userEvent.click(primaryColumn);
    await userEvent.clear(primaryColumn);
    // (Within 500 ms of leaving the table field; Java put the column into it)
    await pickAt(columnHeader("T", "B"));
    await vi.waitUntil(() => primaryColumn.value === "B");
    expect(tableFields[0]!.value).toBe("T");
    await userEvent.click(document.querySelector(".ok-button")!);
    await vi.waitUntil(() => table<Join>(a, "J").getColumnsToMatch()[0]?.getFirst().getRaw() === "B", { timeout: 5000 });
    expect(table<Join>(a, "J").getPrimarySource().getRaw()).toBe("T");
});

// TableListDialog's cells
test("a table's name typed in the table list, without choosing it from the completions, is taken", async () =>
{
    const a = await start(mgr => mgr.record(new Concatenate(mgr, at("C", 8, 1), [tableId("T")], Concatenate.IncompleteColumnHandling.DEFAULT, false)));
    await userEvent.click(await vi.waitUntil(() => hatPart("C", "T")));
    const fields = (): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>(".table-list-dialog .pick-table-field")];
    await vi.waitUntil(() => fields().length === 1, { timeout: 5000 });
    // (The first field is focused, its completions showing)
    await moveAndDismissPopupsAtPos(centre(".id-fancylist-add"));
    await userEvent.click(document.querySelector(".id-fancylist-add")!);
    await vi.waitUntil(() => fields().length === 2 && document.activeElement === fields()[1]);
    await write("U");
    // (Java: "Invalid table name")
    await moveAndDismissPopupsAtPos(centre(".ok-button"));
    await userEvent.click(document.querySelector(".ok-button")!);
    await vi.waitUntil(() => table<Concatenate>(a, "C").getPrimarySources().map(t => t.getRaw()).join() === "T,U", { timeout: 5000 });
});

// An Aggregate of T, with the group count as N, split by the columns (named as suggested unless given)
const withAggregate = (splitBy: readonly string[], name: string | null = null): ReturnType<typeof start> => start(mgr =>
{
    const columns = [new Pair(columnId("N"), IdentExpression.load(TypeState.GROUP_COUNT))];
    const split = splitBy.map(columnId);
    mgr.record(new Aggregate(mgr, at(name ?? Aggregate.suggestedName(split, columns).getRaw(), 1, 10), tableId("T"), columns, split));
});
const editorText = (): string => document.querySelector(".edit-column-expression-content .cm-content")?.textContent ?? "";
const header = (id: string, column: string): HTMLElement => [...document.querySelectorAll<HTMLElement>(`[data-table="${id}"] .column-name`)].find(e => e.textContent.trim() === column)!;

// AggregateSplitByPane.getItems
test("choosing Whole table makes an Aggregate split by columns use the whole table, even with a blank column", async () =>
{
    const a = await withAggregate(["B"], "G");
    await userEvent.click(await vi.waitUntil(() => hatPart("G", "B")));
    await vi.waitUntil(() => document.querySelector(".split-by-dialog") !== null, { timeout: 5000 });
    // (A blank column too)
    await userEvent.click(document.querySelector(".split-by-dialog .id-fancylist-add")!);
    await vi.waitUntil(() => document.querySelectorAll(".split-by-column-field").length === 2);
    await userEvent.click(document.querySelector(".split-by-whole-table")!);
    // (Java: still split by B, or "Invalid column name")
    await userEvent.click(document.querySelector(".ok-button")!);
    await vi.waitUntil(() => table<Aggregate>(a, "G").getSplitBy().length === 0, { timeout: 5000 });
});

// TableDisplay.addColumnBefore_Agg
test("a column added to an Aggregate with its suggested name renames it after the split chosen", async () =>
{
    const a = await withAggregate([]);
    await settled(a);
    await userEvent.click(header("Agg N", "N"), { button: "right" });
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-virtGrid-column-addBefore")));
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true, { timeout: 5000 });
    await write("M");
    await userEvent.click(document.querySelector(".recipe-button")!);
    await vi.waitUntil(() => editorText() === "group count");
    await userEvent.click(document.querySelector(".split-by-columns")!);
    await vi.waitUntil(() => document.activeElement?.classList.contains("split-by-column-field") === true);
    await write("B");
    await moveAndDismissPopupsAtPos(centre(".ok-button"));
    await userEvent.click(document.querySelector(".ok-button")!);
    // (Java: still "Agg N", after the old split)
    const agg = await vi.waitUntil(() => engineHost(a).tableManager.getAllTables().find((t): t is Aggregate => t instanceof Aggregate && t.getColumnExpressions().length === 2), { timeout: 5000 });
    expect(agg.getSplitBy().map(c => c.getRaw())).toEqual(["B"]);
    expect(agg.getId().getRaw()).toBe("Agg N by B");
});

// SelectColumnDialog.nameSetForIndex
test("choosing the compare column copies it into the result column only if that is blank", async () =>
{
    await withAggregate([], "G");
    await userEvent.click(await vi.waitUntil(() => header("G", "N")));
    await vi.waitUntil(() => editorText() === "group count", { timeout: 5000 });
    await userEvent.click(document.querySelector(".edit-column-expression-content .cm-content")!);
    await userEvent.keyboard("{ControlOrMeta>}a{/ControlOrMeta}{Backspace}");
    await vi.waitUntil(() => getComputedStyle(document.querySelector(".recipe-bar")!).visibility === "visible");
    await userEvent.click([...document.querySelectorAll<HTMLElement>(".recipe-button")].find(b => b.textContent.trim() === "Lowest…")!);
    const fields = (): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>(".select-column-field")];
    await vi.waitUntil(() => fields().length === 2 && document.activeElement === fields()[0]);
    // The result first, then the compare column, chosen:
    await moveAndDismissPopupsAtPos(centre(".select-column-dialog"));
    await userEvent.click(fields()[1]!);
    await write("B");
    await moveAndDismissPopupsAtPos(centre(".select-column-dialog"));
    await userEvent.click(fields()[0]!);
    await userEvent.clear(fields()[0]!);
    await write("A");
    await vi.waitUntil(() => document.querySelector(".autocomplete .completion-cell-text") !== null);
    await push("ArrowDown");
    await push("Enter");
    await vi.waitUntil(() => document.activeElement === fields()[1]);
    // (Java: A)
    expect(fields()[1]!.value).toBe("B");
    await moveAndDismissPopupsAtPos(centre(".select-column-dialog"));
    await userEvent.click(document.querySelector(".select-column-dialog")!.closest(".light-dialog")!.querySelector(".ok-button")!);
    await vi.waitUntil(() => editorText() === "element(B, minimum index(A))");
});

// TimedFocusable.getRecentlyFocused, in EditColumnExpressionDialog
test("a column clicked just after moving from the name to the expression goes into the expression", async () =>
{
    await withAggregate([], "G");
    await userEvent.click(await vi.waitUntil(() => header("G", "N")));
    await vi.waitUntil(() => editorText() === "group count", { timeout: 5000 });
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true);
    await userEvent.click(document.querySelector(".edit-column-expression-content .cm-content")!);
    await userEvent.keyboard("{End} + ");
    // (Within 250 ms of leaving the name; Java put the column there)
    await pickAt(columnHeader("T", "A"));
    await vi.waitUntil(() => editorText() !== "group count + ");
    expect(editorText()).toMatch(/^group count \+ .*A/);
    expect(document.querySelector<HTMLInputElement>(".column-name-text-field")!.value).toBe("N");
});

// Manual Edit: S (a Sort of T by A), with its first cell edited to 5 and Yes said to a Manual Edit, whose
// identifier dialog is then showing
async function makingManualEdit(): Promise<RenderedApp>
{
    const a = await start(mgr => mgr.record(new Sort(mgr, at("S", 1, 10), tableId("T"), [new Pair(columnId("A"), Sort.Direction.ASCENDING)])));
    const display = a.mainWindow()!.grid()!.displays().find(d => d.info.id === "S")!;
    await keyboardMoveToTableCell(a.mainWindow()!.grid()!.grid, display, 0, 0);
    await push("Enter");
    await userEvent.keyboard("{ControlOrMeta>}a{/ControlOrMeta}");
    await write("5");
    await push("Enter");
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".yes-button"), { timeout: 5000 }));
    await vi.waitUntil(() => document.activeElement?.classList.contains("manual-edit-column-field") === true, { timeout: 5000 });
    return a;
}
const manualEdit = (a: RenderedApp): ManualEdit | undefined => engineHost(a).tableManager.getAllTables().find((t): t is ManualEdit => t instanceof ManualEdit);

// EngineHost.setManualEditEntries (Java: TableHat's editList)
test("clicking an entry's link goes to its cell even with no entry deleted", async () =>
{
    const a = await makingManualEdit();
    await userEvent.click(document.querySelector(".id-manual-edit-byrownum")!);
    await userEvent.click(document.querySelector(".ok-button")!);
    await vi.waitUntil(() => manualEdit(a)?.getId().getRaw() === "Edit by row", { timeout: 5000 });
    await settled(a);
    const grid = a.mainWindow()!.grid()!.grid;
    grid._test_keyboardMoveTo(new CellPosition(CellPosition.row(20), CellPosition.col(1)));
    (await vi.waitUntil(() => document.querySelector<HTMLElement>('.table-hat[data-table="Edit by row"] .manual-edit-entries'))).click();
    await userEvent.click(await vi.waitUntil(() => document.querySelector<HTMLElement>(".manual-edit-entries-dialog .jump-to-link"), { timeout: 5000 }));
    await vi.waitUntil(() => document.querySelector(".manual-edit-entries-dialog") === null);
    const d = a.mainWindow()!.grid()!.displays().find(x => x.info.id === "Edit by row")!;
    await vi.waitUntil(() => grid._test_getSelection()?.getActivateTarget().equals(d.getPosition().offsetByRowCols(GridTableDisplay.HEADER_ROWS, 0)) === true, { timeout: 5000 });
    expect(manualEdit(a)!.getReplacementCount()).toBe(1);
});

// PickManualEditIdentifierDialog's picking
test("a column clicked in another table with one of the names doesn't identify a Manual Edit's rows", async () =>
{
    await makingManualEdit();
    // (T's B isn't highlighted, and clicking it does nothing)
    const pane = document.querySelector<HTMLElement>("[data-testid=pick-pane]")!;
    const box = columnHeader("T", "B");
    const point = { clientX: box.left + 5, clientY: box.top + 5 };
    pane.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, ...point }));
    await sleep(300);
    expect(document.querySelector(".pick-table-overlay.pick-select")).toBeNull();
    pane.dispatchEvent(new MouseEvent("click", { bubbles: true, ...point, button: 0 }));
    await sleep(300);
    expect(document.querySelector<HTMLInputElement>(".manual-edit-column-field")!.value).toBe("");
    await pickAt(columnHeader("S", "B"));
    await vi.waitUntil(() => document.querySelector<HTMLInputElement>(".manual-edit-column-field")?.value === "B");
});

// formulaGuidance's emptyCellSelected (Java: EmptyCellSelectedCondition)
test("the guidance's step asking for an empty cell waits for an empty cell, not a data cell", async () =>
{
    const a = await start();
    const grid = a.mainWindow()!.grid()!.grid;
    const guidanceText = (): string | null => document.querySelector(".guidance-content")?.textContent.trim() ?? null;
    await keyboardMoveToTableCell(grid, a.mainWindow()!.grid()!.displays().find(d => d.info.id === "T")!, 0, 1);
    await write("=");
    await vi.waitUntil(() => guidanceText()?.startsWith("Data tables cannot contain formulas.") === true, { timeout: 5000 });
    await push("Escape");
    await userEvent.click(document.querySelector(".id-guidance-show-me")!);
    await vi.waitUntil(() => guidanceText() === "To create a transformation, click on an empty cell.");
    await keyboardMoveToTableCell(grid, a.mainWindow()!.grid()!.displays().find(d => d.info.id === "T")!, 1, 0);
    await sleep(300);
    expect(guidanceText()).toBe("To create a transformation, click on an empty cell.");
    grid._test_keyboardMoveTo(new CellPosition(CellPosition.row(8), CellPosition.col(1)));
    await vi.waitUntil(() => guidanceText() === "Click the New... button.", { timeout: 5000 });
});
