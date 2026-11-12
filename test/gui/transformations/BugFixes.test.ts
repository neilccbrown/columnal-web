// Tests of the Java bugs fixed in the transformations' dialogs (each fails without its fix; see the
// "bug fix" PORT-NOTEs).
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryStringColumn } from "../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Concatenate } from "../../../src/engine/transformations/transformations/Concatenate.js";
import { HideColumns } from "../../../src/engine/transformations/transformations/HideColumns.js";
import { Join } from "../../../src/engine/transformations/transformations/Join.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { selectGivenListViewItem } from "../base/listUtil.js";
import { at, centre, closeStarted, columnHeader, columnId, hatPart, pickAt, start, table, tableId } from "./fixtures.js";

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
