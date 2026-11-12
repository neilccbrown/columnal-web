// Sort, Join, Concatenate and Hide columns (docs/gui-spec/transformations.md), beyond the ports of the
// Java tests: their dialogs from the hats (and picking from the grid into them), Concatenate's toggle and
// its tables highlighted while hovered, a Join made from a table's menu, and the table menu's Custom
// columns.
import { afterEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryStringColumn } from "../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Concatenate } from "../../../src/engine/transformations/transformations/Concatenate.js";
import { HideColumns } from "../../../src/engine/transformations/transformations/HideColumns.js";
import { Join } from "../../../src/engine/transformations/transformations/Join.js";
import { Sort } from "../../../src/engine/transformations/transformations/Sort.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { selectGivenListViewItem } from "../base/listUtil.js";
import { sleep } from "../base/util.js";
import { engineHost } from "../fixtures/app.js";
import { at, centre, closeStarted, columnHeader, columnId, examples, hatPart, pickAt, settled, start, table, tableId } from "./fixtures.js";

afterEach(closeStarted);

describe("Sort", () =>
{
    test("clicking the hat's columns edits them: the direction button shows the column type's examples, and a column clicked in the grid is added", async () =>
    {
        const a = await start(mgr => mgr.record(new Sort(mgr, at("Sort by A", 1, 10), tableId("T"), [new Pair(columnId("A"), Sort.Direction.ASCENDING)])));
        await userEvent.click(await vi.waitUntil(() => document.querySelector('.table-hat[data-table="Sort by A"] .edit-sort-by')));
        const panes = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(".sort-pane")];
        await vi.waitUntil(() => panes().length === 1, { timeout: 5000 });
        // A number column: 1 above 99, ascending
        expect(examples(panes()[0]!)).toEqual(["1", "99"]);
        await userEvent.click(panes()[0]!.querySelector(".sort-direction-button")!);
        expect(examples(panes()[0]!)).toEqual(["99", "1"]);
        // B, clicked in T (no field edited lately), is added at the end, ascending, with text's examples:
        await sleep(300);
        await pickAt(columnHeader("T", "B"));
        await vi.waitUntil(() => panes().length === 2);
        expect(panes()[1]!.querySelector("input")?.value).toBe("B");
        expect(examples(panes()[1]!)).toEqual(["A", "Z"]);
        await userEvent.click(document.querySelector(".ok-button")!);
        // (Its name was the suggested one, so it is renamed)
        await vi.waitUntil(() => engineHost(a).tableManager.getAllTables().some(t => t instanceof Sort && t.getSortBy().length === 2), { timeout: 5000 });
        const sort = engineHost(a).tableManager.getAllTables().find((t): t is Sort => t instanceof Sort)!;
        expect(sort.getSortBy().map(p => p.getFirst().getRaw() + p.getSecond().toStyledString().toPlain())).toEqual(["A↓", "B↑"]);
        expect(sort.getId().getRaw()).toBe(Sort.suggestedName(sort.getSortBy()).getRaw());
    });

    test("a column name that isn't valid is an error, and OK does nothing", async () =>
    {
        const a = await start(mgr => mgr.record(new Sort(mgr, at("S", 1, 10), tableId("T"), [new Pair(columnId("A"), Sort.Direction.ASCENDING)])));
        await userEvent.click(await vi.waitUntil(() => document.querySelector('.table-hat[data-table="S"] .edit-sort-by')));
        const field = await vi.waitUntil(() => document.querySelector<HTMLInputElement>(".sort-pane input"), { timeout: 5000 });
        await userEvent.click(field);
        await userEvent.keyboard("{Control>}a{/Control}{Meta>}a{/Meta}");
        await write("1x");
        // (Not Escape, which a dialog sees too, and closes)
        await moveAndDismissPopupsAtPos(centre(".ok-button"));
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => document.querySelector(".error-label")?.textContent.includes("Error") === true);
        expect(document.querySelector(".sort-pane")).not.toBeNull();
        expect(table<Sort>(a, "S").getSortBy().map(p => p.getFirst().getRaw())).toEqual(["A"]);
    });
});

describe("Join", () =>
{
    test("a table's menu's Transform makes a Join to its right, whose dialog takes tables and columns clicked in the grid", async () =>
    {
        const a = await start();
        await userEvent.click(document.querySelector('[data-table="U"] .table-title')!, { button: "right", position: { x: 2, y: 5 } });
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-transform")));
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-join")));
        // (No table is asked for)
        await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true, { timeout: 5000 });
        const join = engineHost(a).tableManager.getAllTables().find((t): t is Join => t instanceof Join)!;
        const display = a.mainWindow()!.grid()!.displays().find(d => d.info.id === join.getId().getRaw())!;
        expect(display.getPosition().columnIndex).toBe(5 + 2 + 1);
        // The primary table, clicked in the grid (the field was focused in the last 500 ms):
        await pickAt(document.querySelector('[data-table="T"] .table-title')!.getBoundingClientRect());
        const tableFields = (): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>(".edit-join-content .pick-table-field")];
        await vi.waitUntil(() => tableFields()[0]?.value === "T");
        // Which focuses the secondary; then U, typed:
        await vi.waitUntil(() => document.activeElement === tableFields()[1]);
        await write("U");
        await push("Enter");
        // Then a pair of columns: the primary's, clicked in T:
        await userEvent.click(document.querySelector(".id-fancylist-add")!);
        const primaryColumn = await vi.waitUntil(() => document.activeElement?.classList.contains("join-primary-column") === true ? document.activeElement as HTMLInputElement : null);
        await pickAt(columnHeader("T", "A"));
        await vi.waitUntil(() => primaryColumn.value === "A");
        // (A column of U isn't one of T's, for the primary column)
        await userEvent.click(document.querySelector(".join-secondary-column")!);
        await write("A");
        await userEvent.click(document.querySelector(".id-join-isLeftJoin")!);
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => engineHost(a).tableManager.getAllTables().some(t => t instanceof Join && t.getPrimarySource().getRaw() === "T"), { timeout: 5000 });
        const made = engineHost(a).tableManager.getAllTables().find((t): t is Join => t instanceof Join)!;
        expect([made.getPrimarySource().getRaw(), made.getSecondarySource().getRaw(), made.isKeepPrimaryWithNoMatch()]).toEqual(["T", "U", true]);
        expect(made.getColumnsToMatch().map(p => [p.getFirst().getRaw(), p.getSecond().getRaw()])).toEqual([["A", "A"]]);
        expect(made.getId().getRaw()).toBe(Join.suggestedName(made.getColumnsToMatch()).getRaw());
    });

    test("clicking the hat edits the Join, starting from its details; tables that aren't valid names are an error", async () =>
    {
        const a = await start(mgr => mgr.record(new Join(mgr, at("J", 1, 10), tableId("T"), tableId("U"), false, [new Pair(columnId("A"), columnId("A"))])));
        await userEvent.click(await vi.waitUntil(() => hatPart("J", "T")));
        const fields = await vi.waitUntil(() => { const f = [...document.querySelectorAll<HTMLInputElement>(".edit-join-content .pick-table-field")]; return f.length === 2 ? f : null; }, { timeout: 5000 });
        expect(fields.map(f => f.value)).toEqual(["T", "U"]);
        expect([...document.querySelectorAll<HTMLInputElement>(".dual-column-pane input")].map(f => f.value)).toEqual(["A", "A"]);
        expect(document.querySelector<HTMLInputElement>(".id-join-isLeftJoin")?.checked).toBe(false);
        // Escape doesn't close it:
        await push("Escape");
        await push("Escape");
        expect(document.querySelector(".edit-join-content")).not.toBeNull();
        await userEvent.clear(fields[1]!);
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => document.querySelector(".error-label")?.textContent.includes("Valid source table names required") === true);
        await userEvent.click(fields[1]!);
        await write("T");
        await push("Escape");
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => table<Join>(a, "J").getSecondarySource().getRaw() === "T", { timeout: 5000 });
    });
});

describe("Concatenate", () =>
{
    test("a new Concatenate's table list starts with one to edit; tables typed or clicked in the grid are added, but not itself", async () =>
    {
        const a = await start();
        const pos = new CellPosition(CellPosition.row(8), CellPosition.col(1));
        a.mainWindow()!.grid()!.grid._test_keyboardMoveTo(pos);
        await sleep(300);
        await userEvent.keyboard("{Enter}");
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-transform")));
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-concatenate")));
        const fields = (): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>(".table-list-dialog .pick-table-field")];
        await vi.waitUntil(() => fields().length === 1 && document.activeElement === fields()[0], { timeout: 5000 });
        await write("T");
        await push("Enter");
        // Then U, clicked in the grid (no field edited lately), is added at the end:
        await sleep(300);
        await pickAt(document.querySelector('[data-table="U"] .table-title')!.getBoundingClientRect());
        await vi.waitUntil(() => fields().length === 2 && fields()[1]!.value === "U");
        // Not the Concatenate itself, typed:
        const id = engineHost(a).tableManager.getAllTables().find(t => t instanceof Concatenate)!.getId().getRaw();
        await userEvent.click(document.querySelector(".id-fancylist-add")!);
        await vi.waitUntil(() => fields().length === 3 && document.activeElement === fields()[2]);
        await write(id.substring(0, 3));
        await sleep(200);
        expect([...document.querySelectorAll(".autocomplete .completion-cell-text")].map(e => e.textContent)).not.toContain(id);
        await moveAndDismissPopupsAtPos(centre(".ok-button"));
        // (A blank table isn't a valid name: deleted, it's fine)
        await userEvent.clear(fields()[2]!);
        await moveAndDismissPopupsAtPos(centre(".ok-button"));
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => document.querySelector(".error-label")?.textContent.includes("Error") === true);
        await userEvent.click(document.querySelectorAll<HTMLElement>(".table-list-dialog .small-delete")[2]!);
        await vi.waitUntil(() => fields().length === 2);
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => engineHost(a).tableManager.getAllTables().some(t => t instanceof Concatenate && t.getPrimarySources().length === 2), { timeout: 5000 });
        const made = engineHost(a).tableManager.getAllTables().find((t): t is Concatenate => t instanceof Concatenate)!;
        expect(made.getPrimarySources().map(t => t.getRaw())).toEqual(["T", "U"]);
        // The dialog opened as the picker closed, so had nothing to return the focus to: the grid has it
        // (Java: the window's focus owner)
        await vi.waitUntil(() => document.activeElement?.getAttribute("data-testid") === "grid");
        expect(made.getId().getRaw()).toBe(Concatenate.suggestedName(made.getPrimarySources()).getRaw());
    });

    test("the hat's tables, hovered, are highlighted; clicked, they're edited; its source column is toggled with no dialog", async () =>
    {
        const a = await start(mgr => mgr.record(new Concatenate(mgr, at("C", 1, 10), [tableId("T"), tableId("U")], Concatenate.IncompleteColumnHandling.DEFAULT, true)));
        // (The tables' names, each its own part)
        const tables = await vi.waitUntil(() => hatPart("C", "T"));
        // (By events: Playwright's hover scrolls the part into view first, which this far right never
        // settles; Comments.test.ts hovers a source link for real)
        const box = tables.getBoundingClientRect();
        tables.dispatchEvent(new MouseEvent("mouseenter", { clientX: box.left + 2, clientY: box.top + 2 }));
        await vi.waitUntil(() => document.querySelectorAll(".pick-table-overlay.pick-source").length === 2, { timeout: 2000 });
        tables.dispatchEvent(new MouseEvent("mouseleave"));
        await vi.waitUntil(() => document.querySelector(".pick-table-overlay") === null);

        await userEvent.click(hatPart("C", "with source column")!);
        await vi.waitUntil(() => !table<Concatenate>(a, "C").isIncludeMarkerColumn(), { timeout: 5000 });
        // (Not renamed)
        expect(table<Concatenate>(a, "C").getId().getRaw()).toBe("C");
        await vi.waitUntil(() => hatPart("C", "without source column") !== undefined);
        await settled(a);

        await userEvent.click(hatPart("C", "T")!);
        const fields = await vi.waitUntil(() => { const f = [...document.querySelectorAll<HTMLInputElement>(".table-list-dialog .pick-table-field")]; return f.length === 2 ? f : null; }, { timeout: 5000 });
        expect(fields.map(f => f.value)).toEqual(["T", "U"]);
        await userEvent.click(document.querySelectorAll<HTMLElement>(".table-list-dialog .small-delete")[0]!);
        await vi.waitUntil(() => document.querySelectorAll(".table-list-dialog .pick-table-field").length === 1);
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => table<Concatenate>(a, "C").getPrimarySources().map(t => t.getRaw()).join() === "U", { timeout: 5000 });
    });
});

describe("Hide columns and Custom columns", () =>
{
    test("the hidden list keeps the source's order, the button says which way it moves, and a double click moves one back", async () =>
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
        expect(items("hidden-columns-list-view")).toEqual(["S"]);
        expect(document.querySelector(".add-button")?.textContent.trim()).toBe("Transfer");
        expect(document.querySelector<HTMLButtonElement>(".add-button")?.disabled).toBe(true);
        await selectGivenListViewItem(page.elementLocator(document.querySelector(".shown-columns-list-view")!), o => o.textContent.trim() === "P");
        expect(document.querySelector(".add-button")?.textContent.trim()).toBe("<< Hide");
        await userEvent.click(document.querySelector(".add-button")!);
        // (In the source's order)
        expect(items("hidden-columns-list-view")).toEqual(["P", "S"]);
        expect(items("shown-columns-list-view")).toEqual(["Q", "R"]);
        await selectGivenListViewItem(page.elementLocator(document.querySelector(".hidden-columns-list-view")!), o => o.textContent.trim() === "S");
        expect(document.querySelector(".add-button")?.textContent.trim()).toBe("Show >>");
        await userEvent.dblClick([...document.querySelectorAll<HTMLElement>(".hidden-columns-list-view [role=option]")].find(e => e.textContent.trim() === "S")!);
        expect(items("hidden-columns-list-view")).toEqual(["P"]);
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => table<HideColumns>(a, "H").getHiddenColumns().map(c => c.getRaw()).join() === "P", { timeout: 5000 });
    });

    test("the table menu's Custom hides the columns chosen; the other display items clear the list", async () =>
    {
        const a = await start();
        const menu = async (item: string): Promise<void> =>
        {
            await userEvent.click(document.querySelector('[data-table="T"] .table-title')!, { button: "right", position: { x: 2, y: 5 } });
            await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-showColumns")));
            await userEvent.click(await vi.waitUntil(() => document.querySelector(item)));
        };
        const columnNames = (): string[] => [...document.querySelectorAll('[data-table="T"] .column-name')].map(e => e.textContent.trim());
        await menu(".id-tableDisplay-menu-show-custom");
        await vi.waitUntil(() => document.querySelectorAll(".shown-columns-list-view [role=option]").length === 2, { timeout: 5000 });
        expect(document.querySelectorAll(".hidden-columns-list-view [role=option]").length).toBe(0);
        await userEvent.dblClick([...document.querySelectorAll<HTMLElement>(".shown-columns-list-view [role=option]")].find(e => e.textContent.trim() === "A")!);
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => columnNames().join() === "B");
        expect(a.mainWindow()!.grid()!.displays().find(d => d.info.id === "T")!.info.display).toBe("CUSTOM");
        // Custom again starts with A hidden; cancelled, it stays:
        await settled(a);
        await menu(".id-tableDisplay-menu-show-custom");
        await vi.waitUntil(() => document.querySelectorAll(".hidden-columns-list-view [role=option]").length === 1, { timeout: 5000 });
        await userEvent.click(document.querySelector(".cancel-button")!);
        await sleep(200);
        expect(columnNames()).toEqual(["B"]);
        // All columns clears the list:
        await settled(a);
        await menu(".id-tableDisplay-menu-show-all");
        await vi.waitUntil(() => columnNames().join() === "A,B");
        await settled(a);
        await menu(".id-tableDisplay-menu-show-custom");
        await vi.waitUntil(() => document.querySelectorAll(".shown-columns-list-view [role=option]").length === 2, { timeout: 5000 });
        expect(document.querySelectorAll(".hidden-columns-list-view [role=option]").length).toBe(0);
    });
});
