// Filters and Checks (docs/gui-spec/transformations.md): making them (a Filter from the table menu's
// Transform, a Check from the new-table dialog), their expression dialogs, clicking their hats' parts
// (and a Calculate's), and a Check's display, the status bar's count of the Checks which pass, and
// the checks pane.
import { afterEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { TableManager } from "../../../src/engine/data/data/TableManager.js";
import { BracketedStatus } from "../../../src/engine/expressions/transformations/expression/BracketedStatus.js";
import { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../../src/engine/identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { Decimal, ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { Check } from "../../../src/engine/transformations/transformations/Check.js";
import { Filter } from "../../../src/engine/transformations/transformations/Filter.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { EntireTableSelection } from "../../../src/gui-logic/table-gui/gui/table/EntireTableSelection.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { clickOnItemInBounds } from "../base/clickTableLocation.js";
import { selectGivenComboBoxItem } from "../base/comboUtil.js";
import { push, write } from "../base/keyboard.js";
import { keyboardMoveTo } from "../base/scrollTo.js";
import { sleep } from "../base/util.js";
import { clickMenu, closeApp, engineHost, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

// Tables T and U (A and B, numbers: A is 1 and 2) at the top left, and any others asked for
async function start(more: (mgr: TableManager, parse: (src: string) => Expression) => void = () => {}): Promise<RenderedApp>
{
    let count = 2;
    const content = savedFile(mgr =>
    {
        const data = (id: string, column: number): void =>
        {
            const columns: ((rs: RecordSet) => EditableColumn)[] = [
                rs => new MemoryNumericColumn(rs, new ColumnId("A"), NumberInfo.DEFAULT, [Either.right(new Decimal(1)), Either.right(new Decimal(2))], ZERO),
                rs => new MemoryNumericColumn(rs, new ColumnId("B"), NumberInfo.DEFAULT, [Either.right(new Decimal(10)), Either.right(new Decimal(20))], ZERO),
            ];
            mgr.record(new ImmediateDataSource(mgr, new Table.InitialLoadDetails(new TableId(id), null, CellPosition.ORIGIN.offsetByRowCols(1, column), null), new EditableRecordSet(columns, () => 2)));
        };
        data("T", 1);
        data("U", 5);
        const functions = FunctionList.getFunctionLookup(mgr.getUnitManager());
        const before = mgr.getAllTables().length;
        more(mgr, src => TFunctionUtil.parseExpression(src, mgr.getTypeManager(), functions));
        count += mgr.getAllTables().length - before;
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    await vi.waitUntil(() => document.querySelectorAll(".table").length === count);
    // (Once the engine has done its work since loading, and the page has caught up: the tables' order on
    // the page can change meanwhile, which a click by element, made into a selector, wouldn't follow)
    await a.mainWindow()!.engine.client.request("idle");
    await sleep(200);
    document.querySelector<HTMLElement>("[data-testid=grid]")!.focus();
    return a;
}

const at = (row: number, column: number): Table.InitialLoadDetails => new Table.InitialLoadDetails(null, null, CellPosition.ORIGIN.offsetByRowCols(row, column), null);
const named = (id: string, row: number, column: number): Table.InitialLoadDetails => new Table.InitialLoadDetails(new TableId(id), null, CellPosition.ORIGIN.offsetByRowCols(row, column), null);

const tables = (a: RenderedApp): Table[] => engineHost(a).tableManager.getAllTables();
// An expression as in a file
const saved = (e: Expression): string => e.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
const filters = (a: RenderedApp): Filter[] => tables(a).filter(t => t instanceof Filter);
const checks = (a: RenderedApp): Check[] => tables(a).filter(t => t instanceof Check);

// The hat's segment with the text, of the table
const hatPart = (table: string, text: string): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>(`.table-hat[data-table="${table}"] span`)].find(e => e.textContent === text);
// The hat's expression (in segments, by their styles), of the table
const hatExpression = (table: string, text: string): HTMLElement | undefined =>
{
    const parts = [...document.querySelectorAll<HTMLElement>(`.table-hat[data-table="${table}"] .edit-expression-link`)];
    return parts.map(e => e.textContent).join("") === text ? parts[0] : undefined;
};

const editorText = (): string => document.querySelector(".expression-editor .cm-content")?.textContent.replaceAll(" ", "") ?? "";
const editorFocused = (): boolean => document.activeElement?.closest(".expression-editor") !== null && document.activeElement?.closest(".expression-editor") !== undefined;

async function selectAll(): Promise<void>
{
    await userEvent.keyboard(navigator.platform.startsWith("Mac") ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}");
}

describe("Filter", () =>
{
    test("the table menu's Transform makes a Filter of the table to its right, its expression selected under the message, and OK renames it to the suggested name", async () =>
    {
        const a = await start();
        await userEvent.click(document.querySelector('[data-table="U"] .table-title')!, { button: "right", position: { x: 2, y: 5 } });
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-transform")));
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-transform-filter")));
        // No table is asked for: the Filter is of U, to its right (TableManager.getNextInsertPosition)
        await vi.waitUntil(() => filters(a).length === 1);
        const made = filters(a)[0]!;
        expect(made.getSrcTableId().getRaw()).toBe("U");
        const display = await vi.waitUntil(() => a.mainWindow()!.grid()!.displays().find(d => d.info.id === made.getId().getRaw()));
        // (Next to U's columns and its add-column arrows)
        expect(display.getPosition().columnIndex).toBe(5 + 2 + 1);
        // The dialog, with the message, and the expression selected:
        await vi.waitUntil(() => editorFocused(), { timeout: 5000 });
        expect(document.querySelector(".edit-expression-top-message")?.textContent.trim()).toBe("Keep rows where:");
        expect(editorText()).toBe("true");
        await write("A>1");
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => (filters(a)[0] !== undefined && saved(filters(a)[0]!.getFilterExpression()) === "column\\\\A > 1"), { timeout: 5000 });
        expect(filters(a)[0]!.getId().getRaw()).toBe("Filt A");
        expect(document.querySelector(".expression-editor")).toBeNull();
    });

    test("clicking the hat's expression edits it, renaming the Filter if its name was automatic; a column clicked in the grid goes into it", async () =>
    {
        const a = await start((mgr, parse) =>
        {
            mgr.record(new Filter(mgr, named("Filt A", 1, 10), new TableId("T"), parse("A > 1")));
            mgr.record(new Filter(mgr, named("Mine", 6, 10), new TableId("T"), parse("A > 1")));
        });
        await userEvent.click(await vi.waitUntil(() => hatExpression("Filt A", "A > 1")));
        await vi.waitUntil(() => editorFocused(), { timeout: 5000 });
        expect(editorText()).toBe("A>1");
        await selectAll();
        await push("Delete");
        // B, clicked in T:
        const pane = document.querySelector<HTMLElement>("[data-testid=pick-pane]")!;
        const b = [...document.querySelectorAll<HTMLElement>('[data-table="T"] .column-name')].find(e => e.textContent.trim() === "B")!.getBoundingClientRect();
        pane.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: b.left + 5, clientY: b.top + 5 }));
        await vi.waitUntil(() => document.querySelector(".pick-table-overlay.pick-select") !== null);
        pane.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + 5, clientY: b.top + 5, button: 0 }));
        await vi.waitUntil(() => editorText() === "B");
        await write(">10");
        await userEvent.click(document.querySelector(".ok-button")!);
        // (Its name was the suggested one, so it is renamed to the new suggestion)
        await vi.waitUntil(() => filters(a).some(f => f.getId().getRaw() === "Filt B" && saved(f.getFilterExpression()) === "column\\\\B > 10"), { timeout: 5000 });

        // One with a name of its own keeps it (once the page has the renamed Filter):
        await a.mainWindow()!.engine.client.request("idle");
        await sleep(200);
        await userEvent.click(await vi.waitUntil(() => hatExpression("Mine", "A > 1")));
        await vi.waitUntil(() => editorFocused(), { timeout: 5000 });
        await selectAll();
        await write("B>10");
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => filters(a).some(f => f.getId().getRaw() === "Mine" && saved(f.getFilterExpression()) === "column\\\\B > 10"), { timeout: 5000 });
        expect(filters(a).map(f => f.getId().getRaw()).sort()).toEqual(["Filt B", "Mine"]);
    });

    test("clicking the hat's source picks a new source table, which can't be the Filter itself", async () =>
    {
        const a = await start((mgr, parse) => mgr.record(new Filter(mgr, named("F", 1, 10), new TableId("T"), parse("A > 1"))));
        await userEvent.click(await vi.waitUntil(() => hatPart("F", "T")));
        await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true);
        await write("F");
        await vi.waitUntil(() => document.querySelector(".autocomplete") === null || document.querySelectorAll(".autocomplete .completion-cell-text").length === 0);
        await push("Backspace");
        await write("U");
        await push("Enter");
        await vi.waitUntil(() => filters(a)[0]?.getSrcTableId().getRaw() === "U", { timeout: 5000 });
        await vi.waitUntil(() => hatPart("F", "U") !== undefined);
    });

    test("clicking a Calculate's column in its hat edits that column", async () =>
    {
        await start((mgr, parse) => mgr.record(new Calculate(mgr, named("C", 1, 10), new TableId("T"), new HashMap<ColumnId, Expression>([[new ColumnId("D"), parse("A * 2")]]))));
        await userEvent.click(await vi.waitUntil(() => hatPart("C", "D")));
        await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true, { timeout: 5000 });
        expect((document.activeElement as HTMLInputElement).value).toBe("D");
        expect(editorText()).toBe("A*2");
    });
});

describe("Check", () =>
{
    test("New ▸ Check picks the source table, then the Check's type and expression; it shows its result, and the status bar counts it", async () =>
    {
        const a = await start();
        const pos = new CellPosition(CellPosition.row(8), CellPosition.col(2));
        const grid = a.mainWindow()!.grid()!.grid;
        await keyboardMoveTo(grid, pos);
        await clickOnItemInBounds("[data-testid=grid]", grid, new RectangleBounds(pos, pos));
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-new-check")));
        await vi.waitUntil(() => document.activeElement?.classList.contains("pick-table-field") === true);
        // No status bar while there are no Checks:
        expect(document.querySelector(".status-bar")).toBeNull();
        await write("T");
        await push("Enter");
        await vi.waitUntil(() => editorFocused(), { timeout: 5000 });
        expect(document.querySelector(".check-type-combo")?.textContent.trim()).toBe("For all rows");
        expect(editorText()).toBe("true");
        // A, clicked in T (the expression is selected, so it replaces it):
        const pane = document.querySelector<HTMLElement>("[data-testid=pick-pane]")!;
        const column = [...document.querySelectorAll<HTMLElement>('[data-table="T"] .column-name')].find(e => e.textContent.trim() === "A")!.getBoundingClientRect();
        pane.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: column.left + 5, clientY: column.top + 5 }));
        await vi.waitUntil(() => document.querySelector(".pick-table-overlay.pick-select") !== null);
        pane.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: column.left + 5, clientY: column.top + 5, button: 0 }));
        await vi.waitUntil(() => editorText() === "A");
        await write(">0");
        // Escape doesn't close it (only any completions); then Tab goes to OK:
        await push("Escape");
        expect(document.querySelector(".expression-editor")).not.toBeNull();
        await push("Tab");
        expect(document.activeElement?.classList.contains("ok-button")).toBe(true);
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => checks(a).length === 1, { timeout: 5000 });
        const check = checks(a)[0]!;
        expect(check.getCheckType()).toBe(Check.CheckType.ALL_ROWS);
        // (By name alone: Java saved it with the source's name, a bug fixed)
        expect(saved(check.getCheckExpression())).toBe("column\\\\A > 0");
        // Its name above its result, at the position:
        const display = await vi.waitUntil(() => a.mainWindow()!.grid()!.displays().find(d => d.info.id === check.getId().getRaw()));
        expect(display.getPosition().equals(pos)).toBe(true);
        expect(display.getBottomRightIncl().equals(pos.offsetByRowCols(1, 0))).toBe(true);
        const element = document.querySelector(`[data-table="${check.getId().getRaw()}"]`)!;
        await vi.waitUntil(() => element.querySelector(".check-result")?.textContent.trim() === "OK");
        expect(element.querySelector(".table-title")?.classList.contains("check-table-title")).toBe(true);
        expect(element.querySelector(".table-title")?.classList.contains("check-failing")).toBe(false);
        expect(element.querySelector(".column-names")).toBeNull();
        // The status bar:
        await vi.waitUntil(() => document.querySelector(".check-summary-counts")?.textContent === "Checks: 1/1 OK");
        expect(document.querySelector(".check-summary-counts")?.classList.contains("failing")).toBe(false);
    });

    test("clicking a Check's hat expression edits its type and expression; a failing Check shows so, in the status bar and the checks pane", async () =>
    {
        const a = await start((mgr, parse) =>
        {
            mgr.record(new Check(mgr, named("K", 8, 2), new TableId("T"), Check.CheckType.ALL_ROWS, parse("A > 0")));
            mgr.record(new Check(mgr, named("J", 8, 4), new TableId("T"), Check.CheckType.STANDALONE, parse("true")));
        });
        await vi.waitUntil(() => document.querySelector(".check-summary-counts")?.textContent === "Checks: 2/2 OK");
        await userEvent.click(await vi.waitUntil(() => hatExpression("K", "A > 0")));
        await vi.waitUntil(() => editorFocused(), { timeout: 5000 });
        expect(editorText()).toBe("A>0");
        await selectGivenComboBoxItem(page.getByRole("combobox"), "No rows");
        await vi.waitUntil(() => document.querySelector(".check-type-combo")?.textContent.trim() === "No rows");
        await userEvent.click(document.querySelector(".ok-button")!);
        await vi.waitUntil(() => checks(a).find(c => c.getId().getRaw() === "K")?.getCheckType() === Check.CheckType.NO_ROWS, { timeout: 5000 });
        // (Its name was its own, so kept)
        const element = (): Element => document.querySelector('[data-table="K"]')!;
        await vi.waitUntil(() => element().querySelector(".check-result")?.textContent.trim() === "Fail");
        expect(element().querySelector(".table-title")?.classList.contains("check-failing")).toBe(true);
        await vi.waitUntil(() => document.querySelector(".check-summary-counts")?.textContent === "Checks: 1/2 OK");
        expect(document.querySelector(".check-summary-counts")?.classList.contains("failing")).toBe(true);

        // Clicking the count shows the checks pane: failing, then succeeding
        await userEvent.click(document.querySelector(".check-summary-counts")!);
        const pane = await vi.waitUntil(() => document.querySelector(".checks-list"));
        expect([...pane.children].map(e => e.textContent.trim())).toEqual(["Checks", "Failing", "K", "Succeeding", "J"]);
        // An entry selects its Check:
        await userEvent.click([...pane.querySelectorAll(".checks-list-entry")].find(e => e.textContent.trim() === "K")!);
        const selection = a.mainWindow()!.grid()!.grid.getSelection();
        expect(selection instanceof EntireTableSelection && selection.includes(a.mainWindow()!.grid()!.displays().find(d => d.info.id === "K")!)).toBe(true);
        // The close button, and the View menu, close and show it:
        await userEvent.click(document.querySelector(".checks-pane-close")!);
        await vi.waitUntil(() => document.querySelector(".checks-list") === null);
        await clickMenu("id-menu-view", "id-menu-view-checks");
        await vi.waitUntil(() => document.querySelector(".checks-list") !== null);
        await clickMenu("id-menu-view", "id-menu-view-nopane");
        await vi.waitUntil(() => document.querySelector(".checks-list") === null);
    });

    test("a Check's menu has only Delete", async () =>
    {
        const a = await start((mgr, parse) => mgr.record(new Check(mgr, at(8, 2), new TableId("T"), Check.CheckType.ALL_ROWS, parse("A > 0"))));
        const id = checks(a)[0]!.getId().getRaw();
        await userEvent.click(await vi.waitUntil(() => document.querySelector(`[data-table="${id}"] .table-title`)), { button: "right", position: { x: 2, y: 5 } });
        const menu = await vi.waitUntil(() => document.querySelector("[role=menu]"));
        expect([...menu.querySelectorAll("[role=menuitem]")].map(e => e.className)).toEqual([expect.stringContaining("id-tableDisplay-menu-delete")]);
        await userEvent.click(menu.querySelector(".id-tableDisplay-menu-delete")!);
        await vi.waitUntil(() => checks(a).length === 0);
        await vi.waitUntil(() => document.querySelector(".status-bar") === null);
    });
});
